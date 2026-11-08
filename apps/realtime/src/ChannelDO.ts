import { DurableObject } from "cloudflare:workers";
import { CLOSE, LOBBY_DEBOUNCE_MS, PING, PONG, TICK_MS, verifyGrant } from "@tomb/protocol";
import { TICKET_HEADER, decodeTicket, rejectSocket } from "./auth";
import { ChannelCore, type PeerRecord, type Reservation } from "./channel";
import { type Env, lobbyStub, readConfig } from "./config";

// Channel DO (채널마다 하나, idFromName("ch-N")).
// 판정은 ChannelCore(channel.ts)가 하고, 여기서는 Hibernation WebSocket·storage·타이머만 이어 준다.
//
// 저장 위치
// - 접속자 위치·상태·좌석: 메모리. hibernate 뒤 깨어나면 소켓 attachment로 복원한다.
//   attachment는 입장 때와 틱 루프가 멈출 때(= hibernate 가능해지기 직전)만 갱신한다. MOVE마다 쓰지 않는다.
// - 재연결 유예 예약: storage("r:<sid>") + 알람. 소켓이 없으니 attachment에 둘 수 없고, hibernate 중에도 만료돼야 한다.
// - 채널 번호: storage("channel"). 소켓이 하나도 없을 때 깨어난 알람도 로비에 보고할 수 있게.
// - 쓴 폭죽 nonce: storage("n:<nonce>") → 증서 만료 시각. hibernate 뒤에도 같은 증서를 다시 쏘지 못하게.
//
// 알람 하나로 두 가지를 한다: 재연결 유예 만료, 그리고 연결이 있는 동안 5분마다 유령 연결 정리(reap).

const RES_PREFIX = "r:";
const CHANNEL_KEY = "channel";
const NONCE_PREFIX = "n:";
/** 새 방문자 입장 때 로비에 묻는 시간 상한. 넘기면(로비 장애) 받아 준다 — 순서보다 입장 가능성이 우선 */
const ADMIT_TIMEOUT_MS = 3_000;
/** 연결이 있는 동안 유령 연결을 확인하는 알람 주기. DO가 이미 깨어 있을 때(틱 루프가 멈출 때)도 확인한다 */
const REAP_INTERVAL_MS = 5 * 60_000;

export class ChannelDO extends DurableObject<Env> {
  private readonly core: ChannelCore<WebSocket>;
  private channel: number;
  private ticking = false;
  private nextTickAt = 0;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private alarmAt: number | null = null;
  private reapDueAt: number | null = null;
  /** 로비 보고에 붙이는 단조 증가 번호. 시각 기반이라 hibernate 뒤 새 인스턴스에서도 앞선 번호보다 크다 */
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // heartbeat("ping"→"pong")는 런타임이 직접 답한다. DO를 깨우지 않고 요금도 들지 않는다.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));

    const { capacity, graceMs } = readConfig(env);
    this.core = new ChannelCore<WebSocket>(
      { capacity, graceMs },
      {
        send: (ws, data) => {
          try {
            ws.send(data);
          } catch {
            // 닫히는 중인 소켓. 곧 webSocketClose가 온다.
          }
        },
        close: (ws, code, reason) => {
          try {
            ws.close(code, reason);
          } catch {
            // 이미 닫힘
          }
        },
        persist: (ws, rec) => {
          try {
            ws.serializeAttachment(rec);
          } catch {
            // 이미 닫힘
          }
        },
        saveReservation: (r) => {
          ctx.storage.kv.put(RES_PREFIX + r.sid, r);
          this.scheduleAlarm();
        },
        dropReservation: (sid) => {
          ctx.storage.kv.delete(RES_PREFIX + sid);
        },
        requestTick: () => this.startTicking(),
        countChanged: () => this.scheduleReport(),
        lastPing: (ws) => ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0,
        visitorJoined: (visitorId, at) => {
          lobbyStub(env)
            .claimVisitor(visitorId, this.channel, at)
            .catch((e) => console.error("claimVisitor failed", e));
        },
        visitorLeft: (visitorId) => {
          lobbyStub(env)
            .releaseVisitor(visitorId, this.channel)
            .catch((e) => console.error("releaseVisitor failed", e));
        },
        verifyGrant: (token) => (env.JOIN_SECRET ? verifyGrant(env.JOIN_SECRET, token).catch(() => null) : Promise.resolve(null)),
        claimNonce: (nonce, until) => {
          const kv = ctx.storage.kv;
          if (kv.get(NONCE_PREFIX + nonce) !== undefined) return false;
          kv.put(NONCE_PREFIX + nonce, until);
          // 만료된 nonce 정리 (폭죽은 드물어 목록이 짧다)
          const now = Date.now();
          for (const [key, exp] of kv.list<number>({ prefix: NONCE_PREFIX })) if (exp <= now) kv.delete(key);
          return true;
        },
      },
    );

    // 생성자는 처음 만들 때와 hibernate에서 깨어날 때마다 돈다. 메모리가 비어 있으므로
    // 소켓 attachment + 저장된 유예 예약으로 다시 세운다. SQLite 백엔드의 동기 KV라 여기서 바로 읽힌다.
    this.channel = ctx.storage.kv.get<number>(CHANNEL_KEY) ?? 0;
    const active: [WebSocket, PeerRecord][] = [];
    for (const ws of ctx.getWebSockets()) {
      // 닫히는 중인 소켓은 TCP 정리 전까지 목록에 남는다 → 열린 것만. attachment가 null이면 교체·추방·퇴장한 소켓
      const rec = ws.readyState === WebSocket.READY_STATE_OPEN ? (ws.deserializeAttachment() as PeerRecord | null) : null;
      if (rec) active.push([ws, rec]);
    }
    const reserved = Array.from(ctx.storage.kv.list<Reservation>({ prefix: RES_PREFIX }), ([, r]) => r);
    this.core.restore(active, reserved, Date.now());
  }

  /** Worker가 Origin·토큰을 검증한 뒤 넘긴 업그레이드 요청 */
  async fetch(req: Request): Promise<Response> {
    const ticket = decodeTicket(req.headers.get(TICKET_HEADER));
    if (!ticket || req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("bad request", { status: 400 });
    }
    if (ticket.channel !== this.channel) {
      this.channel = ticket.channel;
      this.ctx.storage.kv.put(CHANNEL_KEY, ticket.channel);
    }
    // 만석이면 hibernation 소켓으로 받지 않고 바로 닫는다. hibernation 소켓으로 받은 직후 닫으면
    // 클로징 핸드셰이크가 DO가 다음에 깨어날 때까지(로컬에서 약 10초) 끝나지 않아 클라이언트의 재시도가 늦어진다.
    if (!this.core.admits(ticket.visitorId)) return rejectSocket(CLOSE.CHANNEL_FULL, "channel full");
    // 새 방문자는 로비의 대기열 순서를 따른다(줄이 있으면 새치기 불가, 잡아 둔 자리는 그 사람만). 기다리는 사이
    // 다른 요청이 끼어들 수 있으므로 돌아와서 상한을 다시 본다.
    if (!this.core.has(ticket.visitorId)) {
      if (!(await this.lobbyAdmits(ticket.visitorId)) || !this.core.admits(ticket.visitorId)) {
        return rejectSocket(CLOSE.CHANNEL_FULL, "channel full");
      }
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.core.join(server, ticket, Date.now());
    this.scheduleAlarm(); // 연결이 생겼다 → 유령 연결 정리 알람
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Lobby DO가 상태를 다시 맞출 때 부른다 (RPC) */
  getCount(): { count: number; seq: number } {
    return { count: this.core.count, seq: this.nextSeq() };
  }

  /** Lobby DO → 같은 방문자가 claimedAt에 다른 채널에 들어갔다. 여기 자리(접속·유예 예약)를 4002로 정리한다 (RPC) */
  kick(visitorId: string, claimedAt: number): void {
    this.core.evict(visitorId, claimedAt);
  }

  private async lobbyAdmits(visitorId: string): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(true), ADMIT_TIMEOUT_MS)));
    try {
      const ask = lobbyStub(this.env).admit(visitorId, this.channel, this.core.count, this.nextSeq());
      return await Promise.race([ask, timeout]);
    } catch (e) {
      console.error("lobby admit failed — admitting", e);
      return true;
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    this.core.message(ws, message, Date.now());
  }

  // compatibility_date ≥ 2026-04-07이라 상대의 close 프레임에는 런타임이 자동으로 답한다(web_socket_auto_reply_to_close).
  webSocketClose(ws: WebSocket, code: number): void {
    this.core.disconnect(ws, code, Date.now());
  }

  webSocketError(ws: WebSocket): void {
    this.core.disconnect(ws, 1006, Date.now());
  }

  /** 재연결 유예 만료 + 유령 연결 정리 */
  alarm(): void {
    const now = Date.now();
    this.alarmAt = null;
    this.core.expire(now);
    if (this.reapDueAt !== null && now >= this.reapDueAt) {
      this.reapDueAt = null;
      this.core.reap(now);
      // 어차피 깨어난 김에 인원을 push한다 → 로비의 5분 재확인이 이 채널을 건너뛴다(유휴 채널을 두 번 깨우지 않게)
      this.reportNow();
    }
    this.scheduleAlarm();
  }

  /** 다음 알람 = min(가장 이른 유예 만료, 연결이 있으면 다음 유령 연결 확인) */
  private scheduleAlarm(): void {
    if (this.core.online === 0) this.reapDueAt = null;
    else this.reapDueAt ??= Date.now() + REAP_INTERVAL_MS;
    const expiry = this.core.nextExpiry();
    const at = expiry === null ? this.reapDueAt : this.reapDueAt === null ? expiry : Math.min(expiry, this.reapDueAt);
    if (at === this.alarmAt) return;
    this.alarmAt = at;
    const op = at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at);
    op.catch((e) => console.error("channel alarm failed", e));
  }

  // ── 틱 루프 ──
  // 100ms 틱은 storage 알람이 아니라 setTimeout으로 돌린다.
  // - 알람은 호출마다 과금되는 storage 쓰기이고 정밀도도 거칠어 10Hz 루프에 맞지 않는다.
  // - 대기 중인 타이머는 DO를 깨어 있게 하지만, 루프는 "바뀐 사람"이 있을 때만 돌고 없으면 바로 멈춘다.
  //   즉 누군가 움직이는 동안에만 깨어 있고, 모두 멈추면 타이머가 사라져 hibernate된다(명세의 "alarm 해제"와 같은 효과).
  // - 다음 틱 시각을 누적해서 잡아 타이머 지연이 쌓이지 않게 한다(평균 10Hz 유지).

  private startTicking(): void {
    if (this.ticking) return;
    this.ticking = true;
    this.nextTickAt = Date.now() + TICK_MS;
    setTimeout(this.onTick, TICK_MS);
  }

  private readonly onTick = (): void => {
    const now = Date.now();
    if (!this.core.tick(now)) {
      this.ticking = false;
      this.core.reap(now); // 어차피 깨어 있는 김에 유령 연결을 정리한다(정리되면 유예 처리로 틱이 다시 돈다)
      return;
    }
    this.nextTickAt += TICK_MS;
    if (this.nextTickAt <= now) this.nextTickAt = now + TICK_MS; // 크게 밀렸으면 따라잡지 말고 다시 맞춘다
    setTimeout(this.onTick, this.nextTickAt - now);
  };

  // ── 로비 보고 ──
  // 인원이 바뀌면 1초 뒤 한 번 보고한다(그 사이 변화는 합친다). 보고가 유실돼도 로비가 5분마다 다시 물어 본다.

  private scheduleReport(): void {
    if (this.reportTimer !== null) return;
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null;
      this.reportNow();
    }, LOBBY_DEBOUNCE_MS);
  }

  private reportNow(): void {
    lobbyStub(this.env)
      .report(this.channel, this.core.count, this.nextSeq())
      .catch((e) => console.error("lobby report failed", e));
  }

  private nextSeq(): number {
    this.seq = Math.max(Date.now(), this.seq + 1);
    return this.seq;
  }
}

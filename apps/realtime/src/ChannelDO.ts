import { DurableObject } from "cloudflare:workers";
import { CLOSE, LOBBY_DEBOUNCE_MS, PING, PONG, ROOM_CAPACITY, TICK_MS, isHuntRoom, signGrant, verifyGrant } from "@tomb/protocol";
import { TICKET_HEADER, decodeTicket, rejectSocket } from "./auth";
import { ChannelCore, type PeerRecord, type Reservation } from "./channel";
import { type Env, channelStub, lobbyStub, readConfig } from "./config";

// Channel DO (채널마다 하나, idFromName("ch-N")). 방(마을·집·사냥터)도 같은 클래스를 방 모드로 쓴다(idFromName("room:{id}")).
// 판정은 ChannelCore(channel.ts)가 하고, 여기서는 Hibernation WebSocket·storage·타이머만 이어 준다.
//
// 저장 위치
// - 접속자 위치·상태·좌석: 메모리. hibernate 뒤 깨어나면 소켓 attachment로 복원한다.
//   attachment는 입장 때와 틱 루프가 멈출 때(= hibernate 가능해지기 직전)만 갱신한다. MOVE마다 쓰지 않는다.
// - 재연결 유예 예약: storage("r:<sid>") + 알람. 소켓이 없으니 attachment에 둘 수 없고, hibernate 중에도 만료돼야 한다.
// - 채널 번호: storage("channel"). 소켓이 하나도 없을 때 깨어난 알람도 로비에 보고할 수 있게.
// - 쓴 폭죽 nonce: storage("n:<nonce>") → 증서 만료 시각. hibernate 뒤에도 같은 증서를 다시 쏘지 못하게.
//   23번 확성기도 같은 곳("n:m:<nonce>")에 둔다. 모든 채널 확성기는 로비가 아는 열린 채널에 RPC(megaphoneRelay)로 전한다.
// - 접속자 스냅샷: storage("live") = 접속 중인 사람 전체(PeerRecord[])를 키 하나에 묶어 쓴다(쓰기 1건 = 행 1개).
//   실시간 서버를 재배포하면 DO가 재시작되며 소켓이 모두 끊기고 attachment도 사라진다. 그때 이 스냅샷으로
//   모두를 유예 예약(RESTART_GRACE_MS)으로 되살려, 다시 붙는 클라이언트가 같은 sid·좌석을 이어받게 한다(takeOver).
//   쓰기 비용을 아끼려고 입장·퇴장·좌석·꾸미기 변화는 LIVE_DEBOUNCE_MS로 묶어 쓰고, 위치만 바뀐 것은
//   LIVE_POS_MIN_MS에 한 번 정도만 쓴다(복귀하는 클라이언트가 어차피 자기 좌표를 다시 알려 준다). 방(room)은 쓰지 않는다.
//
// 알람 하나로 두 가지를 한다: 재연결 유예 만료, 그리고 연결이 있는 동안 5분마다 유령 연결 정리(reap).

const RES_PREFIX = "r:";
const CHANNEL_KEY = "channel";
/** 방 모드면 방 id ("room:{id}" 이름의 DO). 채널 DO에는 없다 */
const ROOM_KEY = "room";
const NONCE_PREFIX = "n:";
const LIVE_KEY = "live";
/** 22번 황금 고블린: 다음 등장 시각 + 지금 나와 있는 고블린(잡혔는지까지). 등장·잡힘·사라짐 때만 쓴다 */
const GOBLIN_KEY = "goblin";
/** 좌석·입퇴장 변화를 저장하기까지 모으는 시간 */
const LIVE_DEBOUNCE_MS = 500;
/** 위치만 바뀐 경우 저장 최소 간격 (틱 루프가 멈출 때 이만큼 지났으면 쓴다) */
const LIVE_POS_MIN_MS = 30_000;
/** 계속 움직이는 사람이 있어 틱 루프가 멈추지 않을 때의 위치 저장 간격 */
const LIVE_POS_MAX_MS = 60_000;
/**
 * 재시작(재배포) 뒤 스냅샷으로 되살린 사람을 기다리는 시간. 평소 유예(20초)보다 길게 둔다 —
 * 숨겨 둔 탭은 브라우저가 타이머를 1분 단위로 묶어 재접속이 그만큼 늦을 수 있다.
 */
const RESTART_GRACE_MIN_MS = 60_000;
/** 새 방문자 입장 때 로비에 묻는 시간 상한. 넘기면(로비 장애) 받아 준다 — 순서보다 입장 가능성이 우선 */
const ADMIT_TIMEOUT_MS = 3_000;
/** 연결이 있는 동안 유령 연결을 확인하는 알람 주기. DO가 이미 깨어 있을 때(틱 루프가 멈출 때)도 확인한다 */
const REAP_INTERVAL_MS = 5 * 60_000;

export class ChannelDO extends DurableObject<Env> {
  private core: ChannelCore<WebSocket>;
  private channel: number;
  /** 방 모드(마을·집·사냥터)면 방 id. 월드 채널이면 null */
  private room: string | null;
  private ticking = false;
  private nextTickAt = 0;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private alarmAt: number | null = null;
  private reapDueAt: number | null = null;
  /** 로비 보고에 붙이는 단조 증가 번호. 시각 기반이라 hibernate 뒤 새 인스턴스에서도 앞선 번호보다 크다 */
  private seq = 0;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  /** 위치만 바뀌어 아직 저장하지 않은 변화가 있다 */
  private livePosDirty = false;
  private liveSavedAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // heartbeat("ping"→"pong")는 런타임이 직접 답한다. DO를 깨우지 않고 요금도 들지 않는다.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));

    // 생성자는 처음 만들 때와 hibernate에서 깨어날 때마다 돈다. 메모리가 비어 있으므로
    // 소켓 attachment + 저장된 유예 예약으로 다시 세운다. SQLite 백엔드의 동기 KV라 여기서 바로 읽힌다.
    this.channel = ctx.storage.kv.get<number>(CHANNEL_KEY) ?? 0;
    this.room = ctx.storage.kv.get<string>(ROOM_KEY) ?? null;
    this.core = this.makeCore();
    const active: [WebSocket, PeerRecord][] = [];
    for (const ws of ctx.getWebSockets()) {
      // 닫히는 중인 소켓은 TCP 정리 전까지 목록에 남는다 → 열린 것만. attachment가 null이면 교체·추방·퇴장한 소켓
      const rec = ws.readyState === WebSocket.READY_STATE_OPEN ? (ws.deserializeAttachment() as PeerRecord | null) : null;
      if (rec) active.push([ws, rec]);
    }
    const reserved = Array.from(ctx.storage.kv.list<Reservation>({ prefix: RES_PREFIX }), ([, r]) => r);
    const live = this.room === null ? (ctx.storage.kv.get<PeerRecord[]>(LIVE_KEY) ?? []) : [];
    const { graceMs } = readConfig(env);
    const revived = this.core.restore(active, reserved, Date.now(), Array.isArray(live) ? live : [], Math.max(graceMs, RESTART_GRACE_MIN_MS));
    this.liveSavedAt = Date.now();
    if (this.room === null) this.core.restoreGoblin(ctx.storage.kv.get(GOBLIN_KEY));
    if (revived > 0) {
      console.log(`channel ${this.channel}: restored ${revived} peer(s) from live snapshot`);
      this.scheduleReport();
    }
  }

  /**
   * 판정 로직(ChannelCore)과 이 DO를 잇는다. 방 모드(this.room)면 정원은 ROOM_CAPACITY이고,
   * 로비 보고·채널 간 중복 정리(레지스트리)를 하지 않는다.
   */
  private makeCore(): ChannelCore<WebSocket> {
    const { ctx, env } = this;
    const { capacity, graceMs } = readConfig(env);
    const room = this.room !== null;
    return new ChannelCore<WebSocket>(
      { capacity: room ? ROOM_CAPACITY : capacity, graceMs, room },
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
        liveChanged: (urgent) => {
          if (room) return;
          if (urgent) this.scheduleLiveSave();
          else this.livePosDirty = true;
        },
        countChanged: () => {
          // 11/12: 사냥터 방도 인원을 로비에 알린다 (사냥터 고르는 화면의 "n명 사냥 중")
          if (!room || isHuntRoom(this.room)) this.scheduleReport();
        },
        lastPing: (ws) => ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0,
        visitorJoined: (visitorId, at) => {
          if (room) return; // 방은 월드 채널과 동시에 붙어 있을 수 있다 → 레지스트리에 올리지 않는다
          lobbyStub(env)
            .claimVisitor(visitorId, this.channel, at)
            .catch((e) => console.error("claimVisitor failed", e));
        },
        visitorLeft: (visitorId) => {
          if (room) return;
          lobbyStub(env)
            .releaseVisitor(visitorId, this.channel)
            .catch((e) => console.error("releaseVisitor failed", e));
        },
        visitorDropped: (visitorId) => {
          if (room) return; // 친구 들고 남은 월드 채널 연결로만 본다 (집·사냥터 방은 월드 연결과 함께 붙어 있다)
          lobbyStub(env)
            .visitorDropped(visitorId, this.channel)
            .catch((e) => console.error("visitorDropped failed", e));
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
        // 22번 황금 고블린 (월드 채널만 — 방은 ChannelCore가 끈다)
        signGrant: (g) => (env.JOIN_SECRET ? signGrant(env.JOIN_SECRET, g).catch(() => null) : Promise.resolve(null)),
        // 23번 확성기
        channelNo: () => this.channel,
        relayMegaphone: (nonce, until, data) => {
          if (room) return;
          const self = this.channel;
          const work = lobbyStub(env)
            .info()
            .then((info) =>
              Promise.all(
                info.channels
                  .filter((c) => c.id !== self && c.count > 0)
                  .map((c) => channelStub(env, c.id).megaphoneRelay(nonce, until, data)),
              ),
            )
            .catch((e) => console.error("megaphone relay failed", e));
          ctx.waitUntil(work);
        },
        goblinChanged: (s) => {
          if (room) return;
          try {
            ctx.storage.kv.put(GOBLIN_KEY, s);
          } catch (e) {
            console.error("goblin save failed", e);
          }
          this.scheduleAlarm();
        },
      },
    );
  }

  /** Worker가 Origin·토큰을 검증한 뒤 넘긴 업그레이드 요청 */
  async fetch(req: Request): Promise<Response> {
    const ticket = decodeTicket(req.headers.get(TICKET_HEADER));
    if (!ticket || req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("bad request", { status: 400 });
    }
    if (ticket.room !== undefined && ticket.room !== this.room) {
      // 처음 들어온 방 입장: 이 DO("room:{id}")를 방 모드로 굳힌다. 이름이 채널과 겹치지 않으므로 처음 한 번뿐이고, 아직 아무도 없다
      if (this.core.count > 0) return new Response("bad request", { status: 400 });
      this.room = ticket.room;
      this.ctx.storage.kv.put(ROOM_KEY, ticket.room);
      this.core = this.makeCore();
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
    if (this.room === null && !this.core.has(ticket.visitorId)) {
      if (!(await this.lobbyAdmits(ticket.visitorId)) || !this.core.admits(ticket.visitorId)) {
        return rejectSocket(CLOSE.CHANNEL_FULL, "channel full");
      }
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.core.join(server, ticket, Date.now());
    this.core.goblinCheck(Date.now()); // 22번: 사람이 생겼다 → 고블린 일정 확인
    this.scheduleAlarm(); // 연결이 생겼다 → 유령 연결 정리 알람
    return new Response(null, { status: 101, webSocket: client });
  }

  /** 개발용 훅(/dev/goblin, DEV_HOOKS=1일 때만): 황금 고블린을 지금 나오게 한다 (RPC) */
  devGoblin(): { id: string; seed: number; at: number; until: number; points: number } | null {
    const c = this.core.forceGoblin(Date.now());
    this.scheduleAlarm();
    return c ? { id: c.id, seed: c.seed, at: c.at, until: c.until, points: c.points } : null;
  }

  /** 23번: 다른 채널의 모든 채널 확성기 (RPC). 같은 nonce는 이 채널에 한 번만 */
  megaphoneRelay(nonce: string, until: number, data: string): boolean {
    return this.core.relayedMegaphone(nonce, until, data);
  }

  /** Lobby DO가 상태를 다시 맞출 때 부른다 (RPC) */
  getCount(): { count: number; seq: number } {
    return { count: this.core.count, seq: this.nextSeq() };
  }

  /** 47번: Worker의 /internal/kick → 이 채널·방에 있는 그 방문자들을 code로 내보낸다. 내보낸 수 (RPC) */
  expel(visitorIds: string[], code: number): number {
    const reason = code === CLOSE.BANNED ? "banned" : "kicked";
    let n = 0;
    for (const v of visitorIds) if (this.core.expel(v, code, reason)) n++;
    return n;
  }

  /** Worker의 /internal/me → 이 채널에 접속 중인 그 방문자들에게 "내 정보 새로 받기". 보낸 수 (RPC) */
  nudgeMe(visitorIds: string[]): number {
    let n = 0;
    for (const v of visitorIds) if (this.core.nudgeMe(v)) n++;
    return n;
  }

  /** 47번: Worker의 /internal/peer → sid의 방문자 (유저 신고 대상 확인, RPC) */
  peerAt(sid: number): { visitorId: string; name: string } | null {
    return this.core.peerAt(sid);
  }

  /** 친구 들고 남 (Lobby DO가 사람이 있는 채널마다 부른다): 접속 중인 그 친구들에게만 알린다 (RPC) */
  friendNotice(to: string[], key: string, name: string, on: boolean): number {
    return this.core.friendNotice(to, key, name, on);
  }

  /** 친구 위치 (Worker의 /internal/where가 채널마다 묻는다). 이 채널 접속자 전부 — 웹 서버가 친구만 골라 낸다 */
  roster(): ReturnType<ChannelCore<WebSocket>["roster"]> {
    return this.core.roster();
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
    this.core.goblinCheck(now); // 22번: 고블린 등장·사라짐
    if (this.reapDueAt !== null && now >= this.reapDueAt) {
      this.reapDueAt = null;
      this.core.reap(now);
      // 어차피 깨어난 김에 인원을 push한다 → 로비의 5분 재확인이 이 채널을 건너뛴다(유휴 채널을 두 번 깨우지 않게)
      if (this.room === null || isHuntRoom(this.room)) this.reportNow();
    }
    this.scheduleAlarm();
  }

  /** 다음 알람 = min(가장 이른 유예 만료, 연결이 있으면 다음 유령 연결 확인) */
  private scheduleAlarm(): void {
    if (this.core.online === 0) this.reapDueAt = null;
    else this.reapDueAt ??= Date.now() + REAP_INTERVAL_MS;
    const expiry = this.core.nextExpiry();
    let at = expiry === null ? this.reapDueAt : this.reapDueAt === null ? expiry : Math.min(expiry, this.reapDueAt);
    // 22번 황금 고블린: 사람이 있으면 다음 등장 시각, 나와 있으면 사라질 시각에 깨운다
    const goblin = this.core.goblinDue();
    if (goblin !== null) at = at === null ? goblin : Math.min(at, goblin);
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
      // 곧 hibernate될 수 있다 → 위치 변화가 쌓였고 마지막 저장에서 충분히 지났으면 한 번 쓴다
      if (this.livePosDirty && now - this.liveSavedAt >= LIVE_POS_MIN_MS) this.saveLive();
      return;
    }
    if (this.livePosDirty && now - this.liveSavedAt >= LIVE_POS_MAX_MS) this.saveLive();
    this.nextTickAt += TICK_MS;
    if (this.nextTickAt <= now) this.nextTickAt = now + TICK_MS; // 크게 밀렸으면 따라잡지 말고 다시 맞춘다
    setTimeout(this.onTick, this.nextTickAt - now);
  };

  // ── 접속자 스냅샷 (재배포 대비) ──

  private scheduleLiveSave(): void {
    if (this.liveTimer !== null) return;
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null;
      this.saveLive();
    }, LIVE_DEBOUNCE_MS);
  }

  /** 접속 중인 사람 전체를 키 하나에 쓴다. 아무도 없으면 지운다 */
  private saveLive(): void {
    if (this.liveTimer !== null) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
    this.livePosDirty = false;
    this.liveSavedAt = Date.now();
    const recs = this.core.liveRecords();
    try {
      if (recs.length > 0) this.ctx.storage.kv.put(LIVE_KEY, recs);
      else this.ctx.storage.kv.delete(LIVE_KEY);
    } catch (e) {
      console.error("live snapshot save failed", e);
    }
  }

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
    if (this.room !== null) {
      if (!isHuntRoom(this.room)) return;
      lobbyStub(this.env)
        .reportRoom(this.room, this.core.count, this.nextSeq())
        .catch((e) => console.error("lobby room report failed", e));
      return;
    }
    lobbyStub(this.env)
      .report(this.channel, this.core.count, this.nextSeq())
      .catch((e) => console.error("lobby report failed", e));
  }

  private nextSeq(): number {
    this.seq = Math.max(Date.now(), this.seq + 1);
    return this.seq;
  }
}

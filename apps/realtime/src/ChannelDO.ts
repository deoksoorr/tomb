import { DurableObject } from "cloudflare:workers";
import { CLOSE, LOBBY_DEBOUNCE_MS, PING, PONG, TICK_MS } from "@tomb/protocol";
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

const RES_PREFIX = "r:";
const CHANNEL_KEY = "channel";

export class ChannelDO extends DurableObject<Env> {
  private readonly core: ChannelCore<WebSocket>;
  private channel: number;
  private ticking = false;
  private nextTickAt = 0;
  private reportTimer: ReturnType<typeof setTimeout> | null = null;
  private alarmAt: number | null = null;

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
      },
    );

    // 생성자는 처음 만들 때와 hibernate에서 깨어날 때마다 돈다. 메모리가 비어 있으므로
    // 소켓 attachment + 저장된 유예 예약으로 다시 세운다. SQLite 백엔드의 동기 KV라 여기서 바로 읽힌다.
    this.channel = ctx.storage.kv.get<number>(CHANNEL_KEY) ?? 0;
    const active: [WebSocket, PeerRecord][] = [];
    for (const ws of ctx.getWebSockets()) {
      const rec = ws.deserializeAttachment() as PeerRecord | null;
      if (rec) active.push([ws, rec]); // null = 교체·추방된 소켓
    }
    const reserved = Array.from(ctx.storage.kv.list<Reservation>({ prefix: RES_PREFIX }), ([, r]) => r);
    this.core.restore(active, reserved, Date.now());
  }

  /** Worker가 Origin·토큰을 검증한 뒤 넘긴 업그레이드 요청 */
  fetch(req: Request): Response {
    const ticket = decodeTicket(req.headers.get(TICKET_HEADER));
    if (!ticket || req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("bad request", { status: 400 });
    }
    // 만석이면 hibernation 소켓으로 받지 않고 바로 닫는다. hibernation 소켓으로 받은 직후 닫으면
    // 클로징 핸드셰이크가 DO가 다음에 깨어날 때까지(로컬에서 약 10초) 끝나지 않아 클라이언트의 재시도가 늦어진다.
    if (!this.core.admits(ticket.visitorId)) return rejectSocket(CLOSE.CHANNEL_FULL, "channel full");
    if (ticket.channel !== this.channel) {
      this.channel = ticket.channel;
      this.ctx.storage.kv.put(CHANNEL_KEY, ticket.channel);
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    this.core.join(server, ticket, Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Lobby DO가 상태를 다시 맞출 때 부른다 (RPC) */
  getCount(): number {
    return this.core.count;
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

  /** 재연결 유예 만료 */
  alarm(): void {
    this.alarmAt = null;
    this.core.expire(Date.now());
    this.scheduleAlarm();
  }

  private scheduleAlarm(): void {
    const at = this.core.nextExpiry();
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
      return;
    }
    this.nextTickAt += TICK_MS;
    if (this.nextTickAt <= now) this.nextTickAt = now + TICK_MS; // 크게 밀렸으면 따라잡지 말고 다시 맞춘다
    setTimeout(this.onTick, this.nextTickAt - now);
  };

  // ── 로비 보고 ──
  // 인원이 바뀌면 1초 뒤 한 번 보고한다(그 사이 변화는 합친다). 보고가 유실돼도 로비가 30초마다 다시 물어 본다.

  private scheduleReport(): void {
    if (this.reportTimer !== null) return;
    this.reportTimer = setTimeout(() => {
      this.reportTimer = null;
      lobbyStub(this.env)
        .report(this.channel, this.core.count)
        .catch((e) => console.error("lobby report failed", e));
    }, LOBBY_DEBOUNCE_MS);
  }
}

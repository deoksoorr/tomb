import { decodeSnapshot, DIR, encodeEvent, encodeMove, isEmoId, isPhraseId, PING, PONG, STATE, type ActKind, type C2S, type PeerInfo, type PeerState, type Sid } from "@tomb/protocol";
import type { AppearanceChange } from "../sprites/avatar";
import type { RoomJoinRequest, RoomJoinResponse } from "@/lib/types";
import type { IncomingChatLine } from "../logic/chatLog";
import { bridge } from "../bridge";
import { backoffDelay } from "./backoff";
import { JoinLimiter, TOKEN_REUSE_MS } from "./joinPolicy";
import { LookPacer } from "./lookPacer";
import { isRoomId, parseRoomMessage, roomCloseAction, roomSocketUrl, type RoomWelcome } from "./roomPolicy";
import { MoveThrottle, type NetPose } from "./sendThrottle";
import { SYNC_EVERY_MS, SyncPolicy } from "./syncPolicy";

// 방(room) 실시간 클라이언트: 분양 마을·개인 집·사냥터처럼 채널 묘지 밖에서 모이는 공간.
// 채널(RealtimeClient)과 같은 선(바이너리 MOVE / 델타 SNAPSHOT, JSON welcome·join·leave·look·act·say·sync)을 쓰지만
// 좌석·묘비·폭죽·대기열이 없어 훨씬 단순하다. Phaser에 의존하지 않는다 (RoomPresence가 화면을 맡는다).
//  - joinRoom(room): POST /api/join/room → wsUrl(+x,y) 접속. 401이면 세션을 받고 한 번 더
//  - 끊기면 같은 방으로 백오프 재접속 (토큰은 45초까지 재사용, 만료·잘못된 요청이면 새로)
//  - leave(): close 1000 (서버가 바로 자리를 비운다)
//  - MOVE는 MoveThrottle 규칙 그대로 (≤10Hz, 바뀔 때만, 숨은 탭은 멈춤 1회 후 쉼)
//  - sync는 SyncPolicy 그대로 (보이는 탭에서 3분마다, 탭 복귀·모르는 sid 스냅샷일 때만 바로). 숨은 탭은 핑만

export type RoomMode = "idle" | "connecting" | "online" | "reconnecting" | "offline";
export type RoomStatus = { mode: RoomMode; room: string | null; count: number; cap: number; reason?: "full" | "replaced" | "denied" };

export type RoomCallbacks = {
  /** 지금 내 상태 (out을 채워서 돌려준다) */
  getPose(out: NetPose): NetPose;
  onWelcome?(m: RoomWelcome): void;
  onJoin?(p: PeerInfo): void;
  onLeave?(sid: Sid): void;
  onSnapshot?(entries: readonly PeerState[], t: number): void;
  onLook?(sid: Sid, look: string[], extra?: AppearanceChange): void;
  onAct?(sid: Sid, kind: ActKind, x: number, y: number): void;
  onSay?(sid: Sid, id: string): void;
  /** 5번 이모티콘 (방 안에서도 서버가 중계한다) */
  onEmo?(sid: Sid, id: string): void;
  /** 말풍선 자유 채팅 (서버가 가린 글). id = 서버 줄 id (옛 서버는 없음) */
  onChat?(sid: Sid, text: string, id?: string): void;
  /** 입장·재접속 때 이 방의 최근 1분 채팅 (이 기기 시계로 옮긴 줄, 내 줄은 mine) */
  onChatLog?(lines: IncomingChatLine[]): void;
  /** sync 응답: 서버가 아는 방 인원 전체 (나 제외)와 좌석 점유표 */
  onPeers?(peers: PeerInfo[], seats: Record<string, Sid>): void;
  /** 3번 집 안 1인 자리: 점유 변경 (sid null = 비었다) / 내 요청 거절 */
  onSeat?(seatId: string, sid: Sid | null): void;
  onSeatDenied?(seatId: string): void;
  /** 3번 같은 방 사람이 가구를 썼다 */
  onUse?(sid: Sid, u: string, a: number): void;
  /** 끊김·방 이동: 원격 아바타를 비운다 */
  onReset?(): void;
  onStatus?(s: RoomStatus): void;
};

type WsLike = {
  readyState: number;
  binaryType: string;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onopen: ((ev: unknown) => void) | null;
  send(data: string | ArrayBuffer | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
};
export type WsCtor = new (url: string) => WsLike;

export type RoomClientOptions = {
  /** 테스트용 주입 */
  fetch?: typeof fetch;
  WebSocket?: WsCtor;
  /** ?debug=1: 핑을 자주 (RTT 표시용) */
  debug?: boolean;
};

const OPEN = 1;
const CONNECTING = 0;
const PING_MS = 15_000;
const DEBUG_PING_MS = 2_000;
const PONG_GRACE_MS = 10_000;
const CONNECT_TIMEOUT_MS = 8_000;
/** 클라이언트가 연결을 버릴 때 (서버는 재연결 유예를 둔다) */
const CLOSE_CLIENT_DROP = 4000;
/** 이만큼 재시도해도 안 되면 offline으로 표시 (그래도 천천히 계속 시도) */
const OFFLINE_AFTER = 5;
const FULL_RETRY_MS = 15_000;
/** "refetch"(토큰 문제)가 이만큼 연달아면 백오프로 바꾼다 */
const MAX_QUICK_REFETCH = 2;

class JoinError extends Error {
  constructor(readonly status: number) {
    super(`room join failed (${status})`);
  }
}

export class RoomClient {
  private ws: WsLike | null = null;
  private target: string | null = null;
  private gen = 0;
  private attempt = 0;
  private quickRefetch = 0;
  private everOnline = false;
  private mode: RoomMode = "idle";
  private reason: RoomStatus["reason"];
  private sid: Sid | null = null;
  private cap = 0;
  private readonly peers = new Set<Sid>();
  private token: { room: string; at: number; res: RoomJoinResponse } | null = null;
  private readonly limiter = new JoinLimiter();
  private readonly throttle = new MoveThrottle();
  private readonly syncPolicy = new SyncPolicy();
  private readonly pose: NetPose = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  private hidden = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  private pingSentAt = 0;
  private lastPongAt = 0;
  private readonly fetchFn: typeof fetch;
  private readonly Ws: WsCtor;
  /** 왕복 시간 (ms, 핑 기준) */
  rtt: number | null = null;
  /** 받은 스냅샷 수 (통계용, 호출하는 쪽이 비워도 된다) */
  snapshots = 0;

  constructor(
    private readonly cb: RoomCallbacks,
    private readonly opts: RoomClientOptions = {},
  ) {
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.Ws = opts.WebSocket ?? (globalThis.WebSocket as unknown as WsCtor);
  }

  get online(): boolean {
    return this.mode === "online" && !!this.ws && this.ws.readyState === OPEN;
  }
  get mySid(): Sid | null {
    return this.sid;
  }
  get room(): string | null {
    return this.target;
  }
  /** 나를 뺀 방 인원 */
  get peerCount(): number {
    return this.peers.size;
  }
  get status(): RoomStatus {
    return { mode: this.mode, room: this.target, count: this.online ? this.peers.size + 1 : 1, cap: this.cap, reason: this.reason };
  }

  /** 방에 들어간다. 이미 그 방이면 그대로, 다른 방이면 나가고 들어간다 */
  joinRoom(room: string): void {
    if (!isRoomId(room)) throw new Error(`bad room id: ${room}`);
    if (this.target === room && this.mode !== "idle" && this.mode !== "offline") return;
    if (this.target !== null) this.reset(1000, "switch");
    this.listen(true);
    this.target = room;
    this.attempt = 0;
    this.quickRefetch = 0;
    this.everOnline = false;
    this.reason = undefined;
    this.setMode("connecting");
    void this.connect();
  }

  /** 방에서 나간다 (close 1000 → 서버가 유예 없이 자리를 비운다) */
  leave(): void {
    this.lookPacer.destroy();
    this.lookGrant = null;
    if (this.target === null) return;
    this.reset(1000, "bye");
    this.target = null;
    this.token = null;
    this.listen(false);
    this.setMode("idle");
  }

  /** 매 프레임. 보낼 때가 아니면 아무것도 하지 않는다 */
  tick(now: number): void {
    if (!this.online) return;
    const pose = this.cb.getPose(this.pose);
    if (!this.throttle.shouldSend(now, pose, this.hidden)) return;
    const seq = this.throttle.markSent(now, pose);
    this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
  }

  act(kind: ActKind): void {
    this.send({ t: "act", kind });
  }

  /** 3번 집 안 1인 자리 점유 요청 / 일어나기 / 가구 쓰기 */
  sit(seatId: string): void {
    this.send({ t: "sit", seatId });
  }
  stand(): void {
    this.send({ t: "stand" });
  }
  use(u: string, a: number): void {
    this.send({ t: "use", u, a });
  }

  /** 정해진 문장 말풍선 (PHRASES id). 모르는 id는 보내지 않는다 */
  say(id: string): void {
    if (isPhraseId(id)) this.send({ t: "say", id });
  }

  /** 5번 이모티콘 (EMOS id). 모르는 id는 보내지 않는다. 도배 제한은 서버(EMO_INTERVAL_MS) */
  emo(id: string): void {
    if (isEmoId(id)) this.send({ t: "emo", id });
  }

  /** 말풍선 자유 채팅 (정리된 글. 도배 제한·가리기는 서버가 한 번 더 한다) */
  chat(text: string): void {
    this.send({ t: "chat", text });
  }

  /** 꾸미기 변경 증서 (Vercel 서명). 서버 간격(10초) 안이면 버리지 않고 간격이 지나자마자 최신 것을 보낸다 */
  look(grant: string): void {
    this.lookGrant = grant;
    this.lookPacer.push(grant);
  }

  private lookGrant: string | null = null;
  private readonly lookPacer = new LookPacer((grant) => {
    if (!this.online) return false;
    this.ws!.send(encodeEvent({ t: "look", grant }));
    return true;
  });

  /** 방 인원 다시 받기 (이상 징후 때만 — 최소 간격을 지킨다) */
  requestSync(): void {
    if (this.online && this.syncPolicy.urgent(performance.now(), this.hidden)) this.sync();
  }

  private sync(): void {
    this.syncPolicy.mark(performance.now());
    this.send({ t: "sync" });
  }

  private send(msg: C2S): void {
    if (this.online) this.ws!.send(encodeEvent(msg));
  }

  // ── 연결 ──

  private async connect(): Promise<void> {
    const gen = ++this.gen;
    const room = this.target;
    if (!room) return;
    let res: RoomJoinResponse | null;
    try {
      res = await this.join(room, gen);
    } catch (e) {
      if (gen !== this.gen) return;
      this.onJoinFailed(e);
      return;
    }
    if (!res || gen !== this.gen) return;
    this.open(res, gen);
  }

  private async join(room: string, gen: number): Promise<RoomJoinResponse | null> {
    const now = Date.now();
    if (this.token && this.token.room === room && now - this.token.at < TOKEN_REUSE_MS) return this.token.res;
    const wait = this.limiter.delay(now);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
      if (gen !== this.gen) return null;
    }
    this.limiter.record(Date.now());
    const body: RoomJoinRequest = { room };
    const post = () =>
      this.fetchFn("/api/join/room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
      });
    let r = await post();
    if (r.status === 401) {
      // 방문자 쿠키가 없거나 만료 → 세션을 받고 한 번 더
      await this.fetchFn("/api/session", { method: "POST", credentials: "same-origin" }).catch(() => null);
      if (gen !== this.gen) return null;
      this.limiter.record(Date.now());
      r = await post();
    }
    if (!r.ok) throw new JoinError(r.status);
    const res = (await r.json()) as RoomJoinResponse;
    if (!res || typeof res.wsUrl !== "string") throw new JoinError(502);
    this.token = { room, at: Date.now(), res };
    return res;
  }

  private onJoinFailed(e: unknown): void {
    const status = e instanceof JoinError ? e.status : 0;
    if (status === 400 || status === 403 || status === 404 || status === 422) {
      // 들어갈 수 없는 방 (권한 없음·없는 집 등): 다시 해도 같다
      this.reason = "denied";
      this.setMode("offline");
      return;
    }
    this.scheduleReconnect(status === 429 ? 15_000 : undefined);
  }

  private open(res: RoomJoinResponse, gen: number): void {
    if (this.ws) this.closeSocket(CLOSE_CLIENT_DROP, "superseded");
    const p = this.cb.getPose(this.pose);
    let ws: WsLike;
    try {
      ws = new this.Ws(roomSocketUrl(res.wsUrl, p.x, p.y));
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.welcomeTimer = setTimeout(() => this.drop(ws, CLOSE_CLIENT_DROP), CONNECT_TIMEOUT_MS);
    ws.onmessage = (ev) => {
      if (this.ws === ws && gen === this.gen) this.onMessage(ev.data);
    };
    ws.onclose = (ev) => this.drop(ws, ev.code);
    ws.onerror = () => {
      // close가 뒤따라 온다
    };
  }

  private onMessage(data: unknown): void {
    if (typeof data === "string") {
      if (data === PONG) {
        const now = performance.now();
        this.lastPongAt = now;
        const sample = now - this.pingSentAt;
        this.rtt = this.rtt === null ? sample : this.rtt * 0.7 + sample * 0.3;
        return;
      }
      const ev = parseRoomMessage(data, this.sid);
      if (!ev) return;
      switch (ev.t) {
        case "welcome":
          this.onWelcome(ev.m);
          break;
        case "join":
          this.peers.add(ev.p.sid);
          this.cb.onJoin?.(ev.p);
          this.emitStatus();
          break;
        case "leave":
          if (ev.sid === this.sid) break;
          this.peers.delete(ev.sid);
          this.cb.onLeave?.(ev.sid);
          this.emitStatus();
          break;
        case "look":
          this.cb.onLook?.(ev.sid, ev.look, { dye: ev.dye, body: ev.body });
          break;
        case "act":
          this.cb.onAct?.(ev.sid, ev.kind, ev.x, ev.y);
          break;
        case "say":
          this.cb.onSay?.(ev.sid, ev.id);
          break;
        case "emo":
          this.cb.onEmo?.(ev.sid, ev.id);
          break;
        case "chat":
          this.cb.onChat?.(ev.sid, ev.text, ev.id);
          break;
        case "chatLog":
          this.cb.onChatLog?.(ev.lines);
          break;
        case "seat":
          this.cb.onSeat?.(ev.seatId, ev.sid);
          break;
        case "seatDenied":
          this.cb.onSeatDenied?.(ev.seatId);
          break;
        case "use":
          this.cb.onUse?.(ev.sid, ev.u, ev.a);
          break;
        case "peers":
          this.syncPolicy.mark(performance.now());
          this.peers.clear();
          for (const p of ev.peers) this.peers.add(p.sid);
          this.cb.onPeers?.(ev.peers, ev.seats);
          this.emitStatus();
          break;
      }
      return;
    }
    if (data instanceof ArrayBuffer) {
      const snap = decodeSnapshot(data);
      if (!snap || this.sid === null) return;
      this.snapshots++;
      // 모르는 사람의 스냅샷 = 입장 소식을 놓쳤다 → 목록을 다시 받는다 (최소 간격 유지)
      for (let i = 0; i < snap.entries.length; i++) {
        const sid = snap.entries[i].sid;
        if (sid !== this.sid && !this.peers.has(sid)) {
          this.requestSync();
          break;
        }
      }
      this.cb.onSnapshot?.(snap.entries, performance.now());
    }
  }

  private onWelcome(m: RoomWelcome): void {
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.sid = m.sid;
    this.cap = m.cap;
    this.peers.clear();
    for (const p of m.peers) this.peers.add(p.sid);
    this.attempt = 0;
    this.quickRefetch = 0;
    this.everOnline = true;
    this.reason = undefined;
    this.throttle.reset();
    this.lastPongAt = performance.now();
    this.startPing();
    this.syncPolicy.mark(performance.now());
    this.startSync();
    this.mode = "online";
    this.cb.onWelcome?.(m);
    this.emitStatus();
    // 방 안에서 꾸미기를 바꿨으면 새 연결에도 알린다 (입장 토큰은 잠깐 재사용돼 옛 착용일 수 있다)
    if (this.lookGrant) this.lookPacer.push(this.lookGrant);
    this.lookPacer.reset();
  }

  /** 소켓이 닫혔거나 죽은 것으로 판단됨 */
  private drop(ws: WsLike, code: number): void {
    if (this.ws !== ws) return;
    this.ws = null;
    try {
      ws.onclose = null;
      ws.onmessage = null;
      if (ws.readyState === OPEN || ws.readyState === CONNECTING) ws.close(CLOSE_CLIENT_DROP);
    } catch {
      // 무시
    }
    this.clearSocketTimers();
    this.peers.clear();
    this.sid = null;
    this.cb.onReset?.();
    if (this.target === null) return;
    switch (roomCloseAction(code, false)) {
      case "replaced":
        this.reason = "replaced";
        this.setMode("offline");
        return;
      case "outdated":
        this.setMode("offline");
        bridge.emit("app:outdated", { source: "room" });
        return;
      case "refetch":
        this.token = null;
        if (++this.quickRefetch <= MAX_QUICK_REFETCH) {
          this.setMode(this.everOnline ? "reconnecting" : "connecting");
          void this.connect();
          return;
        }
        this.scheduleReconnect();
        return;
      case "full":
        this.token = null;
        this.reason = "full";
        this.scheduleReconnect(FULL_RETRY_MS);
        return;
      case "rate":
        this.scheduleReconnect(Math.max(2000, backoffDelay(this.attempt++)));
        return;
      default:
        this.scheduleReconnect();
    }
  }

  private scheduleReconnect(delay?: number): void {
    if (this.target === null) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const d = delay ?? backoffDelay(this.attempt++);
    this.setMode(this.attempt > OFFLINE_AFTER ? "offline" : this.everOnline ? "reconnecting" : "connecting");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, d);
  }

  /** 지금 연결·타이머를 모두 정리한다 (방 이동·나가기) */
  private reset(code: number, reason: string): void {
    this.gen++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.closeSocket(code, reason);
    this.peers.clear();
    this.sid = null;
    this.cb.onReset?.();
  }

  private closeSocket(code: number, reason: string): void {
    const ws = this.ws;
    this.ws = null;
    this.clearSocketTimers();
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = null;
    try {
      ws.close(code, reason);
    } catch {
      // 무시
    }
  }

  private clearSocketTimers(): void {
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
    this.hiddenIdleTimer = null;
  }

  private startPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const every = this.opts.debug ? DEBUG_PING_MS : PING_MS;
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== OPEN) return;
      const now = performance.now();
      if (now - this.lastPongAt > every + PONG_GRACE_MS && !this.hidden) {
        this.drop(ws, 1006);
        return;
      }
      this.pingSentAt = now;
      ws.send(PING);
    }, every);
  }

  private startSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    // 타이머는 클라이언트 안에서만 돈다. 보내는 건 보이는 탭에서 3분이 지났을 때뿐
    this.syncTimer = setInterval(() => {
      if (this.online && this.syncPolicy.periodic(performance.now(), this.hidden)) this.sync();
    }, Math.min(SYNC_EVERY_MS, 30_000));
  }

  private setMode(mode: RoomMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.cb.onStatus?.(this.status);
  }

  private listen(on: boolean): void {
    if (typeof document === "undefined" || on === this.listening) return;
    this.listening = on;
    if (on) {
      this.hidden = document.hidden;
      document.addEventListener("visibilitychange", this.onVisibility);
    } else document.removeEventListener("visibilitychange", this.onVisibility);
  }

  private readonly onVisibility = (): void => {
    const hidden = document.hidden;
    if (this.hidden && !hidden) this.throttle.reset(); // 돌아오면 현재 상태 1회
    this.hidden = hidden;
    if (!hidden) {
      this.lastPongAt = performance.now();
      if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
      this.hiddenIdleTimer = null;
      this.requestSync();
      return;
    }
    // 걷던 중에 탭이 숨으면 게임 루프가 멈춘다 → 멈춤(idle)을 1회 알리고 쉰다
    if (this.online && this.throttle.lastWasMoving) {
      this.hiddenIdleTimer = setTimeout(() => {
        this.hiddenIdleTimer = null;
        if (!this.hidden || !this.online) return;
        const pose = this.cb.getPose(this.pose);
        pose.state = STATE.idle;
        const now = performance.now();
        if (this.throttle.waitMs(now) > 0) return;
        const seq = this.throttle.markSent(now, pose);
        this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
      }, this.throttle.waitMs(performance.now()));
    }
  };
}

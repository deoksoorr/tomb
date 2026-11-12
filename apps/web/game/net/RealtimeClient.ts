import {
  ACT_KINDS,
  CLIENT_VERSION,
  isPhraseId,
  CLOSE,
  MAX_JOIN_RETRIES,
  QUEUE_POLL_MS,
  STATE,
  PING,
  PONG,
  SPECTATOR_POLL_MS,
  WARP_COOLDOWN_MS,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  parseS2C,
  pickChannel,
  type ActKind,
  type C2S,
  type PhraseId,
  type EmoteKind,
  type GraveEventKind,
  type GoblinInfo,
  type PeerInfo,
  type PeerState,
  type QueueStatus,
  type Sid,
  type WelcomeMsg,
} from "@tomb/protocol";
import type { AppearanceChange } from "../sprites/avatar";
import { fetchLobby } from "@/lib/realtime";
import type { ApiError, JoinRequest, JoinResponse } from "@/lib/types";
import { bridge, type NetMode } from "../bridge";
import { backoffDelay } from "./backoff";
import { LookPacer } from "./lookPacer";
import { isPermanentJoinError, JoinLimiter, reusableToken, utf8Bytes, type CachedToken } from "./joinPolicy";
import { MoveThrottle, type NetPose } from "./sendThrottle";
import { bodyFromWsUrl, SYNC_EVERY_MS, SyncPolicy } from "./syncPolicy";

// 실시간 연결 (명세 3-2, 4-1).
//  - (재)연결마다 POST /api/join 으로 새 토큰을 받는다 (토큰 60초 유효). 같은 채널로 돌아가면 서버 유예(20초) 안에서 sid·좌석 유지
//  - wsUrl + &x=..&y=..(현재 위치)&v=CLIENT_VERSION 으로 접속 → welcome → join/leave/seat/emote/graveEvent JSON + 100ms 델타 SNAPSHOT
//  - MOVE: 움직이는 동안 ≤10Hz, 상태가 바뀌면 즉시 1회, 정지·앉기 중엔 0회, 탭이 숨으면 멈추고 돌아오면 1회
//  - 끊기면 0.5→1→2→4→8s(지터) 백오프. 실시간 서버가 없어도 게임은 혼자 그대로 돌아간다 (mode "offline")
//  - 4001 만석: 로비를 보고 다른 채널로 최대 3회 → 그래도 안 되면 관람 모드(30초마다 로비 확인 후 합류)
//  - 4002 다른 탭에서 접속: "replaced", 재접속하지 않음 / 4003 토큰 만료: 새 토큰으로 바로 재접속 / 4008 과다 전송
//  - 4004 잘못된 요청: 자동 배정으로 다시 / /api/join 400: 재시도해도 소용없으니 offline + 안내 1회
//  - 4010 옛 버전(큰 패치): 재접속하지 않고 app:outdated → UI가 업데이트 창을 띄워 새로고침한다
//  - 클라이언트가 끊는 경우: 의도적 퇴장(stop·채널 이동)만 1000, 타임아웃 등은 4000
//    (서버는 1000을 "떠남"으로 보고 재연결 유예 없이 자리를 비운다)
//  - 대기열(/api/join → queue): 혼자 걸으며 queueUrl을 QUEUE_POLL_MS마다 확인, admitted면 그 채널로 입장
//  - 자가 복구: 탭이 보이는 동안 3분마다(PEER_SYNC_MS×3), 탭이 다시 보일 때, 이상 징후(모르는 sid의 스냅샷·인원 불일치)일 때만
//    sync → peers로 원격 아바타 목록을 서버 기준으로 맞춘다 (가만히 있으면 서버를 깨우지 않는다. 숨은 탭은 핑만)

export type NetCallbacks = {
  getPose(out: NetPose): NetPose;
  getFps(): number;
  onWelcome(msg: WelcomeMsg): void;
  onJoin(p: PeerInfo): void;
  onLeave(sid: Sid): void;
  onSnapshot(entries: readonly PeerState[], t: number): void;
  onSeat(seatId: string, sid: Sid | null): void;
  onSeatDenied(seatId: string): void;
  onEmote(sid: Sid, kind: EmoteKind, graveId: string): void;
  onGraveEvent(sid: Sid, kind: GraveEventKind, graveId: string): void;
  /** 연결이 끊김/채널 이동/관람 모드: 원격 아바타와 좌석 점유표를 비운다 */
  onReset(): void;
  /** sync 응답: 서버가 아는 접속자 전체 (나 제외) */
  onPeers(peers: PeerInfo[], seats: Record<string, Sid>): void;
  /** extra = 46·25번 염색·몸 모양 변경 (새 서버만 보낸다) */
  onLook(sid: Sid, look: string[], extra?: AppearanceChange): void;
  onFirework(sid: Sid, item: string, x: number, y: number): void;
  /** 한 번 하는 동작 (종 치기·물 튀기기·손 흔들기·환호). 내 것은 오지 않는다 */
  onAct(sid: Sid, kind: ActKind, x: number, y: number): void;
  /** 정해진 문장 말풍선 (PHRASES id). 내 것은 오지 않는다 */
  onSay(sid: Sid, id: PhraseId): void;
  /** 입장 토큰에 든 내 아바타 몸 모양 (계정에 저장된 값) */
  onSelfBody?(body: string): void;
  // ── 22번 황금 고블린 ──
  /** 나타났다 (welcome에 실려 온 것도 이걸로) */
  onGoblin?(g: GoblinInfo): void;
  /** 아무도 못 잡고 사라졌다 */
  onGoblinGone?(id: string): void;
  /** 누가 잡았다 (나 포함) */
  onGoblinCaught?(id: string, sid: Sid, name: string, points: number): void;
  /** 내가 잡았다: 보상 증서 */
  onGoblinGrant?(id: string, grant: string, points: number): void;
  /** 23번 확성기 한마디 (내 것 포함, 서버가 서명된 문장만 보낸다) */
  onMegaphone?(m: { id: string; name: string; text: string; scope: "channel" | "all"; ch: number; at: number }): void;
};

export type NetOptions = { name: string; color: string; channel: number | "auto"; debug?: boolean; body?: string };

class JoinError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// 핑 주기. 수신 메시지 수가 곧 DO 요청 수(20건=1요청)라서, 평소엔 생존 확인용으로 드물게 보내고
// ?debug=1 HUD에서 RTT를 볼 때만 자주 보낸다. 서버는 60초 넘게 조용한 소켓을 유령으로 보고 닫는다.
const PING_MS = 15_000;
const DEBUG_PING_MS = 2_000;
/** 핑 주기 + 이만큼 퐁이 없으면 죽은 연결로 본다 */
const PONG_GRACE_MS = 10_000;
/** 소켓을 만든 순간부터 welcome까지 */
const CONNECT_TIMEOUT_MS = 8_000;
/** 클라이언트가 연결을 버릴 때 (타임아웃·교체). 서버가 재연결 유예를 적용한다 */
const CLOSE_CLIENT_DROP = 4000;
const STATS_MS = 1000;
/** 이만큼 재시도해도 안 되면 "reconnecting" 대신 "offline"으로 표시 (유예 20초를 넘김) */
const RECONNECTING_ATTEMPTS = 5;

export class RealtimeClient {
  mode: NetMode = "connecting";
  channel: number | null = null;
  cap = 0;
  mySid: Sid | null = null;
  private readonly peers = new Set<Sid>();
  private ws: WebSocket | null = null;
  /** 비동기 흐름(join fetch 등)이 낡았는지 판단하는 세대 번호 */
  private gen = 0;
  private attempt = 0;
  private everOnline = false;
  private stopped = true;
  private target: number | "auto";
  private connectingTo: number | null = null;
  private readonly triedFull = new Set<number>();
  private fullRetries = 0;
  private redirected = false;
  private consecutiveInvalid = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private spectatorTimer: ReturnType<typeof setInterval> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private readonly throttle = new MoveThrottle();
  private hidden = false;
  private pendingWarp: { x: number; y: number } | null = null;
  private readonly joinLimiter = new JoinLimiter();
  private token: CachedToken<Extract<JoinResponse, { mode: "channel" }>> | null = null;
  private hiddenIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private queueUrl: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private readonly syncPolicy = new SyncPolicy();
  /** 대기열에서 들어온 채널 (welcome 때 안내) */
  private admittedTo: number | null = null;
  /** 마지막 꾸미기 증서. 다시 접속하면 한 번 더 보낸다 (만료됐으면 서버가 무시) */
  private lookGrant: string | null = null;
  /** 서버가 10초 안에 다시 온 look을 버리므로 마지막 착용이 꼭 가도록 간격을 맞춰 보낸다 */
  private readonly lookPacer = new LookPacer((grant) => {
    if (!this.online) return false;
    this.ws!.send(encodeEvent({ t: "look", grant }));
    return true;
  });
  private lastWarpAt = -Infinity;
  private lastToast = "";
  // 통계
  private pingSentAt = 0;
  private lastPongAt = 0;
  private rtt: number | null = null;
  private bytesIn = 0;
  private snapshots = 0;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };

  constructor(
    private readonly opts: NetOptions,
    private readonly cb: NetCallbacks,
  ) {
    this.target = opts.channel;
  }

  get online(): boolean {
    return this.mode === "online" && !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  get peerCount(): number {
    return this.peers.size;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.hidden = typeof document !== "undefined" && document.hidden;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.statsTimer = setInterval(() => this.emitStats(), STATS_MS);
    this.setMode("connecting");
    void this.connect(this.target);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.gen++;
    this.lookPacer.destroy();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.clearTimers();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.closeSocket(1000, "bye");
  }

  /** 게임 안 채널 이동: 연결을 닫고 새 채널에 입장. 위치는 지금 캐릭터 위치(씬이 먼저 처음 자리 SPAWN으로 옮겨 둔다) */
  switchChannel(channel: number): void {
    if (this.stopped) return;
    if (channel === this.channel && this.online) return;
    this.pendingWarp = null; // 옛 채널에 보내려던 순간이동은 새 채널에 의미가 없다 (접속 좌표가 곧 위치)
    this.closeSocket(1000, "switch");
    this.cb.onReset();
    this.peers.clear();
    this.clearTimers();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.redirected = false;
    this.attempt = 0;
    this.target = channel;
    this.channel = channel;
    this.setMode("connecting");
    void this.connect(channel);
  }

  /** "여기서 다시 접속": replaced/offline/대기 상태에서 처음부터 다시 */
  reconnect(): void {
    if (this.stopped) return;
    this.closeSocket(4000, "reconnect");
    this.cb.onReset();
    this.peers.clear();
    this.clearTimers();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.redirected = false;
    this.attempt = 0;
    this.token = null;
    this.setMode("connecting");
    void this.connect(this.channel ?? this.target);
  }

  // ── 송신 ──

  /** 매 프레임 호출. 보낼 때가 아니면 아무것도 하지 않는다 */
  tick(now: number): void {
    if (!this.online) return;
    if (this.pendingWarp) {
      // 서버 warp 쿨다운(1초) 안이면 기다린다. 그동안 MOVE도 보내지 않아야 속도 검증에 걸리지 않는다
      if (now - this.lastWarpAt < WARP_COOLDOWN_MS || this.hidden) return;
      this.send({ t: "warp", x: Math.round(this.pendingWarp.x), y: Math.round(this.pendingWarp.y) });
      this.lastWarpAt = now;
      this.pendingWarp = null;
      this.throttle.reset();
    }
    const pose = this.cb.getPose(this.pose);
    if (!this.throttle.shouldSend(now, pose, this.hidden)) return;
    const seq = this.throttle.markSent(now, pose);
    this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
  }

  warp(x: number, y: number): void {
    this.pendingWarp = { x, y };
  }

  sit(seatId: string): void {
    this.send({ t: "sit", seatId });
  }

  stand(): void {
    this.send({ t: "stand" });
  }

  emote(kind: EmoteKind, graveId: string): void {
    this.send({ t: "emote", kind, graveId });
  }

  graveEvent(kind: GraveEventKind, graveId: string): void {
    this.send({ t: "graveEvent", kind, graveId });
  }

  /** 꾸미기 변경 증서 (Vercel 서명). 접속 중이 아니면 다음 welcome 때 보낸다 */
  look(grant: string): void {
    this.lookGrant = grant;
    this.lookPacer.push(grant);
  }

  firework(grant: string): void {
    this.send({ t: "firework", grant });
  }

  /** 23번 확성기 증서 (Vercel 서명). 접속 중이 아니면 버려진다 (증서는 60초짜리라 다시 보내지 않는다) */
  megaphone(grant: string): void {
    this.send({ t: "megaphone", grant });
  }

  /** 한 번 하는 동작 (종 치기 등). 서버가 같은 채널에 중계한다 */
  act(kind: ActKind): void {
    this.send({ t: "act", kind });
  }

  /** 22번: 황금 고블린에 닿았다 (판정은 서버) */
  claimGoblin(id: string): void {
    this.send({ t: "goblin", id });
  }

  /**
   * 22번: 서버 시계 (ms). welcome.now로 맞춘 차이를 더한다 — 고양이·유령·고블린을 같은 채널 모두가 같은 시각으로 계산한다.
   * 이전 서버(welcome.now 없음)나 접속 전에는 내 시계
   */
  serverNow(): number {
    return Date.now() + this.clockOffset;
  }
  private clockOffset = 0;

  /** 정해진 문장 말풍선 */
  say(id: PhraseId): void {
    this.send({ t: "say", id });
  }

  /** 접속자 목록 다시 받기 (자가 복구) */
  sync(): void {
    this.syncPolicy.mark(performance.now());
    this.send({ t: "sync" });
  }

  /** 이상 징후(인원 불일치 등): 최소 간격을 지켜 바로 sync */
  requestSync(): void {
    if (this.online && this.syncPolicy.urgent(performance.now(), this.hidden)) this.sync();
  }

  private send(msg: C2S): void {
    if (this.online) this.ws!.send(encodeEvent(msg));
  }

  // ── 연결 ──

  private async connect(channel: number | "auto"): Promise<void> {
    const gen = ++this.gen;
    this.clearRetry();
    let res: JoinResponse | null;
    try {
      res = await this.join(channel, gen);
    } catch (e) {
      if (gen !== this.gen || this.stopped) return;
      this.onJoinFailed(e);
      return;
    }
    if (!res || gen !== this.gen || this.stopped) return;
    if (res.mode === "spectator") {
      this.enterSpectator();
      return;
    }
    if (res.mode === "queue") {
      this.enterQueue(res.queueUrl);
      return;
    }
    this.openSocket(res, gen);
  }

  /** 토큰을 얻는다. 기다리는 사이 흐름이 낡으면 null */
  private async join(channel: number | "auto", gen: number): Promise<JoinResponse | null> {
    const reuse = reusableToken(this.token, channel, Date.now());
    if (reuse) return reuse;
    const wait = this.joinLimiter.delay(Date.now());
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
      if (gen !== this.gen || this.stopped) return null;
    }
    this.joinLimiter.record(Date.now());
    const body: JoinRequest = { channel, name: this.opts.name, color: this.opts.color };
    if (this.opts.body) body.body = this.opts.body;
    const post = () =>
      fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
      });
    let r = await post();
    if (r.status === 401) {
      // 방문자 쿠키가 없거나 만료 → 세션을 받고 한 번 더
      await fetch("/api/session", { method: "POST", credentials: "same-origin" }).catch(() => null);
      this.joinLimiter.record(Date.now());
      r = await post();
    }
    if (!r.ok) {
      const err = (await r.json().catch(() => null)) as ApiError | null;
      throw new JoinError(r.status, err?.error?.message ?? `join failed (${r.status})`);
    }
    const res = (await r.json()) as JoinResponse;
    if (res.mode === "channel") this.token = { channel: res.channel, at: Date.now(), res };
    return res;
  }

  private onJoinFailed(e: unknown): void {
    if (e instanceof JoinError && isPermanentJoinError(e.status)) {
      // 이름·색 검증 실패 등: 몇 번을 다시 해도 같다 → 혼자 걷기(offline)로 두고 한 번만 알린다
      this.toast(e.message || "실시간 접속 정보를 확인할 수 없어 혼자 걷는 중이에요.");
      this.clearRetry();
      this.setMode("offline");
      return;
    }
    if (e instanceof JoinError && e.status >= 400 && e.status < 500 && e.status !== 408) {
      // 이름 검증 실패·레이트리밋 등: 사용자에게 알리고 천천히 다시 시도
      this.toast(e.message);
      this.scheduleReconnect(e.status === 429 ? 15_000 : undefined);
      return;
    }
    this.scheduleReconnect();
  }

  private openSocket(res: Extract<JoinResponse, { mode: "channel" }>, gen: number): void {
    // 남아 있는 소켓(관람 모드 폴링·재시도가 겹친 경우)을 먼저 정리한다
    if (this.ws) this.closeSocket(CLOSE_CLIENT_DROP, "superseded");
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    const mine = bodyFromWsUrl(res.wsUrl);
    if (mine) this.cb.onSelfBody?.(mine);
    const p = this.cb.getPose(this.pose);
    const sep = res.wsUrl.includes("?") ? "&" : "?";
    const url = `${res.wsUrl}${sep}x=${Math.round(p.x)}&y=${Math.round(p.y)}&v=${CLIENT_VERSION}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.connectingTo = res.channel;
    // 소켓을 만든 순간부터: 열리지도, welcome이 오지도 않으면 버린다
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
      this.bytesIn += utf8Bytes(data);
      if (data === PONG) {
        const now = performance.now();
        this.lastPongAt = now;
        const sample = now - this.pingSentAt;
        this.rtt = this.rtt === null ? sample : this.rtt * 0.7 + sample * 0.3;
        return;
      }
      const m = parseS2C(data);
      if (!m) return;
      switch (m.t) {
        case "welcome":
          this.onWelcome(m);
          break;
        case "join":
          if (m.sid === this.mySid) break;
          this.peers.add(m.sid);
          this.cb.onJoin(m);
          this.emitStatus();
          break;
        case "leave":
          this.peers.delete(m.sid);
          this.cb.onLeave(m.sid);
          this.emitStatus();
          break;
        case "seat":
          this.cb.onSeat(m.seatId, m.sid);
          break;
        case "seatDenied":
          this.cb.onSeatDenied(m.seatId);
          break;
        case "emote":
          if (m.sid !== this.mySid) this.cb.onEmote(m.sid, m.kind, m.graveId);
          break;
        case "graveEvent":
          if (m.sid !== this.mySid) this.cb.onGraveEvent(m.sid, m.kind, m.graveId);
          break;
        case "look":
          if (m.sid !== this.mySid) this.cb.onLook(m.sid, m.look, { dye: m.dye, body: m.body });
          break;
        case "act":
          if (m.sid !== this.mySid && (ACT_KINDS as readonly string[]).includes(m.kind) && Number.isFinite(m.x) && Number.isFinite(m.y))
            this.cb.onAct(m.sid, m.kind, m.x, m.y);
          break;
        case "say":
          if (m.sid !== this.mySid && isPhraseId(m.id)) this.cb.onSay(m.sid, m.id);
          break;
        case "firework":
          // 내 폭죽은 누른 순간 이미 터뜨렸다 → 중복 재생하지 않는다
          if (m.sid !== this.mySid) this.cb.onFirework(m.sid, m.item, m.x, m.y);
          break;
        // ── 22번 황금 고블린 (판정은 서버, 여기서는 전달만) ──
        case "goblin":
          if (m.g && typeof m.g.id === "string") this.cb.onGoblin?.(m.g);
          break;
        case "goblinGone":
          this.cb.onGoblinGone?.(m.id);
          break;
        case "goblinCaught":
          this.cb.onGoblinCaught?.(m.id, m.sid, String(m.name ?? ""), Number(m.points) || 0);
          break;
        case "goblinGrant":
          if (typeof m.grant === "string") this.cb.onGoblinGrant?.(m.id, m.grant, Number(m.points) || 0);
          break;
        // ── 23번 확성기 ──
        case "megaphone":
          if (typeof m.id === "string" && typeof m.text === "string" && typeof m.name === "string")
            this.cb.onMegaphone?.({ id: m.id, name: m.name, text: m.text, scope: m.scope === "all" ? "all" : "channel", ch: Number(m.ch) || 0, at: Number(m.at) || Date.now() });
          break;
        case "peers": {
          this.peers.clear();
          this.syncPolicy.mark(performance.now());
          for (const p of m.peers) if (p.sid !== this.mySid) this.peers.add(p.sid);
          this.cb.onPeers(
            m.peers.filter((p) => p.sid !== this.mySid),
            m.seats,
          );
          this.emitStatus();
          break;
        }
      }
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.bytesIn += data.byteLength;
      const snap = decodeSnapshot(data);
      if (!snap) return;
      this.snapshots++;
      // 모르는 사람의 스냅샷 = 입장 소식을 놓쳤다 → 목록을 다시 받는다 (최소 간격 유지)
      for (let i = 0; i < snap.entries.length; i++) {
        const sid = snap.entries[i].sid;
        if (sid !== this.mySid && !this.peers.has(sid)) {
          this.requestSync();
          break;
        }
      }
      this.cb.onSnapshot(snap.entries, performance.now());
    }
  }

  private onWelcome(m: WelcomeMsg): void {
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.mySid = m.sid;
    this.channel = m.channel;
    // 22번: 서버 시계 맞추기 (왕복 절반만큼 늦게 도착했다고 본다)
    if (typeof m.now === "number" && Number.isFinite(m.now)) this.clockOffset = m.now + (this.rtt ?? 60) / 2 - Date.now();
    this.target = m.channel;
    this.cap = m.cap;
    this.peers.clear();
    for (const p of m.peers) if (p.sid !== m.sid) this.peers.add(p.sid);
    if (this.admittedTo !== null) this.toast(`자리가 나서 ${m.channel}채널로 들어왔어요`);
    else if (this.redirected) this.toast(`채널이 가득 차 ${m.channel}채널로 안내했어요`);
    this.redirected = false;
    this.admittedTo = null;
    this.stopQueue();
    this.triedFull.clear();
    this.fullRetries = 0;
    this.attempt = 0;
    this.consecutiveInvalid = 0;
    this.everOnline = true;
    this.stopSpectatorPoll();
    this.throttle.reset();
    this.lastPongAt = performance.now();
    this.startPing();
    this.syncPolicy.mark(performance.now());
    this.startSync();
    this.setMode("online");
    this.cb.onWelcome({ ...m, peers: m.peers.filter((p) => p.sid !== m.sid) });
    // 새 연결: 서버 간격이 처음부터라 지금 착용 증서를 바로 보낸다 (기다리던 것도 함께 정리)
    if (this.lookGrant) this.lookPacer.push(this.lookGrant);
    this.lookPacer.reset();
  }

  // ── 대기열 ──

  private enterQueue(queueUrl: string): void {
    this.channel = null;
    this.cb.onReset();
    this.peers.clear();
    this.queueUrl = queueUrl;
    this.setMode("queue");
    this.stopQueue();
    this.queueTimer = setTimeout(() => void this.pollQueue(), 0);
  }

  private stopQueue(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = null;
  }

  private async pollQueue(): Promise<void> {
    this.queueTimer = null;
    const url = this.queueUrl;
    if (this.stopped || this.mode !== "queue" || !url) return;
    const gen = this.gen;
    let status: QueueStatus | null = null;
    let expired = false;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 410) expired = true;
      else if (r.ok) status = (await r.json()) as QueueStatus;
    } catch {
      // 네트워크 오류: 다음 주기에 다시
    }
    if (gen !== this.gen || this.stopped || this.mode !== "queue") return;
    if (status) bridge.emit("queue:status", status);
    if (expired || status?.state === "none") {
      // 대기 증서가 만료됐거나 줄에서 빠졌다 → /api/join부터 다시 (또 대기열일 수 있다)
      void this.connect("auto");
      return;
    }
    if (status?.state === "admitted") {
      this.admittedTo = status.channel;
      this.target = status.channel;
      void this.connect(status.channel);
      return;
    }
    this.queueTimer = setTimeout(() => void this.pollQueue(), QUEUE_POLL_MS);
  }

  // ── 자가 복구 ──

  private startSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    // 타이머는 클라이언트 안에서만 돈다. 보내는 건 보이는 탭에서 3분이 지났을 때뿐
    this.syncTimer = setInterval(() => {
      if (this.online && this.syncPolicy.periodic(performance.now(), this.hidden)) this.sync();
    }, Math.min(SYNC_EVERY_MS, 30_000));
  }

  private stopSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  /** 소켓이 닫혔거나 죽은 것으로 판단됨 */
  private drop(ws: WebSocket, code: number): void {
    if (this.ws !== ws) return;
    this.ws = null;
    try {
      ws.onclose = null;
      ws.onmessage = null;
      // 1000으로 닫으면 서버가 의도적 퇴장으로 보고 유예 없이 자리를 비운다 → 4000
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(CLOSE_CLIENT_DROP);
    } catch {
      // 무시
    }
    this.stopPing();
    this.stopSync();
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.peers.clear();
    this.cb.onReset();
    if (this.stopped) return;

    switch (code) {
      case CLOSE.CHANNEL_FULL:
        void this.handleFull();
        return;
      case CLOSE.REPLACED:
        this.channel = null;
        this.setMode("replaced");
        return;
      case CLOSE.OUTDATED:
        // 새로고침해야만 풀린다. 다시 붙어 봐야 또 거절이라 재시도하지 않는다 (혼자 걷기 + 업데이트 창)
        this.clearRetry();
        this.setMode("offline");
        bridge.emit("app:outdated", { source: "channel" });
        return;
      case CLOSE.BAD_REQUEST:
        this.token = null;
        this.setMode(this.everOnline ? "reconnecting" : "connecting");
        void this.connect("auto");
        return;
      case CLOSE.INVALID_TOKEN:
        // 토큰 만료: 새 토큰으로 곧바로 (반복되면 백오프)
        this.token = null;
        this.consecutiveInvalid++;
        if (this.consecutiveInvalid <= 2) {
          this.setMode(this.everOnline ? "reconnecting" : "connecting");
          void this.connect(this.channel ?? this.target);
          return;
        }
        this.scheduleReconnect();
        return;
      case CLOSE.RATE_LIMITED:
        this.toast("움직임 신호가 너무 많아 잠시 연결이 끊겼어요. 곧 다시 이어집니다.");
        this.scheduleReconnect(Math.max(2000, backoffDelay(this.attempt++)));
        return;
      default:
        this.scheduleReconnect();
    }
  }

  private async handleFull(): Promise<void> {
    const gen = this.gen;
    if (this.connectingTo !== null) this.triedFull.add(this.connectingTo);
    this.fullRetries++;
    if (this.fullRetries > MAX_JOIN_RETRIES) {
      this.enterSpectator();
      return;
    }
    const lobby = await fetchLobby();
    if (gen !== this.gen || this.stopped) return;
    if (!lobby) {
      this.scheduleReconnect();
      return;
    }
    if (lobby.total >= lobby.totalCap) {
      this.enterSpectator();
      return;
    }
    const next = pickChannel(lobby, this.triedFull);
    if (next === null) {
      this.enterSpectator();
      return;
    }
    this.redirected = true;
    this.target = next;
    void this.connect(next);
  }

  private enterSpectator(): void {
    this.channel = null;
    this.cb.onReset();
    this.peers.clear();
    this.setMode("spectator");
    if (this.spectatorTimer) return;
    this.spectatorTimer = setInterval(() => void this.pollLobby(), SPECTATOR_POLL_MS);
  }

  private async pollLobby(): Promise<void> {
    if (this.stopped || this.mode !== "spectator") return;
    const gen = this.gen;
    const lobby = await fetchLobby();
    if (gen !== this.gen || this.stopped || this.mode !== "spectator") return;
    if (lobby && lobby.total < lobby.totalCap) {
      this.triedFull.clear();
      this.fullRetries = 0;
      this.redirected = false;
      void this.connect("auto");
    }
  }

  private stopSpectatorPoll(): void {
    if (this.spectatorTimer) clearInterval(this.spectatorTimer);
    this.spectatorTimer = null;
  }

  private scheduleReconnect(delay?: number): void {
    if (this.stopped || this.mode === "replaced") return;
    this.clearRetry();
    const d = delay ?? backoffDelay(this.attempt);
    this.attempt++;
    // 한 번도 붙지 못했으면 서버가 없는 것 → offline (혼자 계속 플레이), 붙어 있다 끊긴 거면 잠시 reconnecting
    const mode: NetMode = this.everOnline && this.attempt <= RECONNECTING_ATTEMPTS ? "reconnecting" : "offline";
    if (this.mode !== "spectator") this.setMode(mode);
    const channel = this.channel ?? this.target;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.mode === "spectator") return;
      void this.connect(channel);
    }, d);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearTimers(): void {
    this.clearRetry();
    this.stopQueue();
    this.stopSync();
    if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
    this.hiddenIdleTimer = null;
    this.stopSpectatorPoll();
    this.stopPing();
    if (this.welcomeTimer) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
  }

  private closeSocket(code: number, reason: string): void {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    this.stopSync();
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

  // ── 핑 / 통계 / 상태 ──

  private startPing(): void {
    this.stopPing();
    const every = this.opts.debug ? DEBUG_PING_MS : PING_MS;
    this.pingTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = performance.now();
      if (now - this.lastPongAt > every + PONG_GRACE_MS && !this.hidden) {
        // 응답이 없다 → 죽은 연결로 보고 재접속
        this.drop(ws, 1006);
        return;
      }
      this.pingSentAt = now;
      ws.send(PING);
    }, every);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private emitStats(): void {
    bridge.emit("net:stats", {
      rttMs: this.online && this.rtt !== null ? Math.round(this.rtt) : null,
      snapshotHz: this.snapshots,
      peers: this.peers.size,
      fps: Math.round(this.cb.getFps()),
      inKBps: Math.round((this.bytesIn / 1024) * 100) / 100,
    });
    this.snapshots = 0;
    this.bytesIn = 0;
  }

  private setMode(mode: NetMode): void {
    this.mode = mode;
    if (mode !== "online") this.mySid = mode === "reconnecting" ? this.mySid : null;
    this.emitStatus();
  }

  private emitStatus(): void {
    const online = this.mode === "online";
    const pending = this.mode === "reconnecting" || this.mode === "connecting";
    const channel = online || pending ? (this.channel ?? (typeof this.target === "number" ? this.target : null)) : null;
    // 나를 포함한 인원. 혼자 걷는 동안(관람·오프라인)은 나 하나
    const status = { mode: this.mode, channel, count: online ? this.peers.size + 1 : 1, cap: this.cap };
    const prev = bridge.last("net:status");
    // 재시도마다 같은 상태를 다시 보내지 않는다
    if (prev && prev.mode === status.mode && prev.channel === status.channel && prev.count === status.count && prev.cap === status.cap) return;
    bridge.emit("net:status", status);
  }

  private toast(message: string): void {
    // 같은 안내가 재시도마다 반복되지 않게
    if (message === this.lastToast) return;
    this.lastToast = message;
    setTimeout(() => {
      if (this.lastToast === message) this.lastToast = "";
    }, 30_000);
    bridge.emit("toast", { message });
  }

  private readonly onVisibility = (): void => {
    const hidden = document.hidden;
    if (this.hidden && !hidden) this.throttle.reset(); // 돌아오면 현재 상태 1회
    this.hidden = hidden;
    if (!hidden) {
      this.lastPongAt = performance.now();
      if (this.hiddenIdleTimer) clearTimeout(this.hiddenIdleTimer);
      this.hiddenIdleTimer = null;
      // 숨어 있는 동안 놓친 입장·퇴장을 서버 기준으로 다시 맞춘다 (1회, 최소 간격 유지)
      this.requestSync();
      return;
    }
    // 걷던 중에 탭이 숨으면 게임 루프가 멈춘다 → 다른 사람 화면에서 계속 걷지 않도록 멈춤(idle)을 1회 알리고 쉰다
    if (this.online && this.throttle.lastWasMoving) {
      const wait = this.throttle.waitMs(performance.now());
      this.hiddenIdleTimer = setTimeout(() => {
        this.hiddenIdleTimer = null;
        if (!this.hidden || !this.online) return;
        const pose = this.cb.getPose(this.pose);
        pose.state = STATE.idle;
        const now = performance.now();
        if (this.throttle.waitMs(now) > 0) return;
        const seq = this.throttle.markSent(now, pose);
        this.ws!.send(encodeMove({ x: pose.x, y: pose.y, state: pose.state, dir: pose.dir, seq }));
      }, wait);
    }
  };
}

/**
 * 부하 테스트 봇 (PROMPT §8). Node + ws로 봇 N개를 띄워 실제 Worker(wrangler dev 또는 운영)에 붙인다.
 * 봇은 실제 클라이언트처럼 움직이는 동안에만 최대 10Hz로 MOVE를 보내고, 멈추고, 바닥에 앉고, 의자를 요청한다.
 *
 *   npm run loadtest -w realtime                                   # 로컬 wrangler dev, 전체 시나리오
 *   npm run loadtest -w realtime -- --scenario 1,3 --duration 30
 *   JOIN_SECRET=<운영 값> npm run loadtest -w realtime -- \
 *     --url wss://rt.example.com --origin https://example.com --channel 10
 *
 * 시나리오
 *   smoke  프로토콜 동작 확인 (welcome/join/snapshot/seat/seatDenied/emote/ping, 403·4003·4004·4002·4008)
 *   1      한 채널에 상한(40)까지 → 41번째는 4001. 지연·수신 Hz·대역폭 측정
 *   2      전 채널 × 상한(400) → 401번째는 pickChannel()이 null(관람 모드), 직접 접속도 모두 4001. 같은 지표 측정
 *   3      봇 절반이 동시에 끊고 15초 안에 새 토큰으로 재접속 → 같은 sid, resumed. 유예 중 외부인은 4001.
 *          한 명은 돌아오지 않음 → 약 RECONNECT_GRACE_SEC 뒤 leave와 좌석 해제
 *   bench  ChannelCore 틱 처리 시간 (Workers 안에서는 동기 CPU 시간을 잴 수 없어 Node에서 같은 코드로 잰다)
 *   hold   (all에 포함 안 됨) 봇 --bots명(기본 상한-1)을 --channel에 --duration초 동안 돌린다. 브라우저로 같은 채널에 들어가 FPS를 잴 때
 */
import { randomBytes } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import {
  AVATAR_COLORS,
  CLOSE,
  DIR,
  PING,
  PONG,
  RUN_SPEED,
  SEATS,
  SEND_INTERVAL_MS,
  STATE,
  WALK_SPEED,
  decodeSnapshot,
  encodeEvent,
  encodeMove,
  parseS2C,
  pickChannel,
  seatById,
  signJoinToken,
  type C2S,
  type DirId,
  type LobbyInfo,
  type PeerState,
  type S2C,
  type StateId,
  type WelcomeMsg,
} from "@tomb/protocol";
import { ChannelCore } from "../src/channel";

// ── 설정 ──

const { values: opt } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:8787" },
    origin: { type: "string", default: "http://localhost:3000" },
    scenario: { type: "string", default: "all" },
    channel: { type: "string", default: "1" },
    duration: { type: "string", default: "20" },
    grace: { type: "string", default: "20" },
    bots: { type: "string" },
    help: { type: "boolean", default: false },
  },
});
if (opt.help) {
  console.log("usage: bots.ts [--url ws://localhost:8787] [--origin http://localhost:3000] [--scenario all|smoke,1,2,3,bench] [--channel 1] [--duration 20] [--grace 20] [--bots N (hold)]");
  process.exit(0);
}
const WS_URL = opt.url.replace(/\/$/, "");
const HTTP_URL = WS_URL.replace(/^ws/, "http");
const ORIGIN = opt.origin;
const SECRET = process.env.JOIN_SECRET ?? "dev-join-secret-change-me";
const CHANNEL = Number(opt.channel);
const DURATION_SEC = Number(opt.duration);
/** 서버의 RECONNECT_GRACE_SEC (시나리오 3의 만료 시각 확인용) */
const GRACE_SEC = Number(opt.grace);
const SCENARIOS = opt.scenario === "all" ? ["smoke", "1", "2", "3", "bench"] : opt.scenario.split(",");

// ── 공통 ──

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const newVisitorId = () => randomBytes(16).toString("base64url").slice(0, 21);

async function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(20);
  }
  return pred();
}

function pct(xs: number[], p: number): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : "-");

const checks: { scenario: string; name: string; ok: boolean; detail: string }[] = [];
let currentScenario = "";
function check(name: string, ok: boolean, detail = ""): void {
  checks.push({ scenario: currentScenario, name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function fetchLobby(): Promise<LobbyInfo> {
  const res = await fetch(`${HTTP_URL}/lobby`, { headers: { Origin: ORIGIN } });
  return (await res.json()) as LobbyInfo;
}

/** 로비가 조건을 만족할 때까지 폴링 (디바운스 1초 + 엣지 캐시 2초) */
async function lobbyUntil(pred: (l: LobbyInfo) => boolean, ms = 10_000): Promise<LobbyInfo> {
  const end = Date.now() + ms;
  let l = await fetchLobby();
  while (!pred(l) && Date.now() < end) {
    await sleep(500);
    l = await fetchLobby();
  }
  return l;
}

/** 동시 연결 수를 제한해서 순서대로 실행 */
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

type ConnectResult = { welcome: WelcomeMsg } | { code: number } | { status: number };
const isWelcome = (r: ConnectResult): r is { welcome: WelcomeMsg } => "welcome" in r;
const describeResult = (r: ConnectResult) => ("welcome" in r ? "welcome" : "code" in r ? `close ${r.code}` : `HTTP ${r.status}`);

// ── 측정 (모든 봇이 한 프로세스라 같은 시계를 쓴다) ──
// 지연: 봇이 MOVE를 보낼 때 (채널, sid, x, y) → 보낸 시각을 기록하고, 다른 봇이 같은 좌표의 SNAPSHOT 엔트리를 받은 시각과 뺀다.
// 즉 "MOVE 전송 → 다른 클라이언트 수신" (서버 틱 대기 0~100ms 포함).

const M = {
  measuring: false,
  sent: new Map<string, number>(),
  latencies: [] as number[],
  stale: 0,
};
const sentKey = (ch: number, sid: number, x: number, y: number) => `${ch}:${sid}:${x}:${y}`;

// ── 봇 ──

type Mode = "idle" | "ground" | "walk" | "seatWait" | "seated";
/** 클라이언트(RealtimeClient)와 같은 ping 주기 */
const PING_MS = 2000;
/** Chromium이 클로징 핸드셰이크 뒤 서버의 TCP 종료를 기다리는 시간 */
const BROWSER_CLOSE_TIMEOUT_MS = 2000;
type Goal = { x: number; y: number; seatId?: string };

/** 봇이 돌아다니는 범위: 의자·벤치가 있는 위쪽 구역 */
const AREA = { minX: 48, maxX: 592, minY: 48, maxY: 470 };
const randomPoint = () => ({ x: Math.round(rand(AREA.minX, AREA.maxX)), y: Math.round(rand(AREA.minY, AREA.maxY)) });

class Bot {
  readonly color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  ws: WebSocket | null = null;
  channel = 0;
  sid = 0;
  welcome: WelcomeMsg | null = null;
  closed: { code: number; at: number } | null = null;
  /** seatId → sid (서버가 알려 준 좌석 점유) */
  seats = new Map<string, number>();
  readonly peers = new Map<number, PeerState>();
  /** sid → leave를 받은 시각 */
  readonly leaves = new Map<number, number>();
  readonly events: S2C[] = [];
  pongs = 0;

  x: number;
  y: number;
  state: StateId = STATE.idle;
  dir: DirId = DIR.down;
  private seq = 0;
  private mode: Mode = "idle";
  private until = 0;
  private goal: Goal | null = null;
  private speed = WALK_SPEED;
  private timer: NodeJS.Timeout | null = null;

  // 측정창 안의 수신 통계
  bytes = 0;
  ticks = 0;
  intervals: number[] = [];
  private lastSnapAt = 0;

  constructor(
    readonly name: string,
    pos = randomPoint(),
    /** 같은 visitorId로 다시 만들면 "두 번째 탭" */
    readonly visitorId = newVisitorId(),
  ) {
    this.x = pos.x;
    this.y = pos.y;
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 새 토큰을 서명해 접속하고 welcome 또는 close/HTTP 오류를 기다린다 */
  async connect(channel: number): Promise<ConnectResult> {
    const token = await signJoinToken(SECRET, { visitorId: this.visitorId, name: this.name, color: this.color, channel });
    this.channel = channel;
    this.welcome = null;
    this.closed = null;
    this.peers.clear();
    const ws = new WebSocket(`${WS_URL}/ch/${channel}?t=${token}&x=${Math.round(this.x)}&y=${Math.round(this.y)}`, {
      headers: { Origin: ORIGIN },
    });
    this.ws = ws;
    // 실제 클라이언트처럼 2초마다 ping (런타임이 자동으로 pong. DO는 깨지 않고, 서버의 유령 연결 정리 기준이 된다)
    let ping: NodeJS.Timeout | undefined;
    ws.on("open", () => (ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(PING), PING_MS)));
    // 브라우저(Chrome)처럼: close 프레임을 주고받은 뒤 서버가 2초 안에 TCP를 닫지 않으면 직접 끊는다(close 이벤트는 서버의 코드로 온다).
    // 로컬 workerd는 서버가 먼저 닫은 hibernation 소켓의 TCP 정리를 DO의 다음 이벤트까지 미룬다. close 프레임 자체는 즉시 온다.
    const closing = setInterval(() => {
      if (ws.readyState !== WebSocket.CLOSING) return;
      clearInterval(closing);
      setTimeout(() => ws.terminate(), BROWSER_CLOSE_TIMEOUT_MS);
    }, 100);
    return new Promise((resolve) => {
      ws.on("message", (data, isBinary) => {
        this.onMessage(data as Buffer, isBinary);
        if (this.welcome) resolve({ welcome: this.welcome });
      });
      ws.on("close", (code) => {
        clearInterval(ping);
        clearInterval(closing);
        if (this.ws === ws) {
          this.closed = { code, at: performance.now() };
          this.stop();
        }
        resolve({ code });
      });
      ws.on("unexpected-response", (req, res) => {
        req.destroy();
        resolve({ status: res.statusCode ?? 0 });
      });
      ws.on("error", () => {});
    });
  }

  /**
   * 행동 시작: 100ms 간격(봇마다 무작위 위상)으로 걷기·멈춤·앉기를 돈다.
   * setInterval을 쓰지 않고 "이전 예정 시각 + 100ms"로 다음 실행을 잡는다. setInterval은 이벤트 루프가
   * 스냅샷 수신으로 바쁠 때마다 뒤로 밀려, 결국 모든 봇의 전송 위상이 서버 틱 직후에 몰린다(지연을 틱 하나만큼 과대 측정).
   */
  start(): void {
    this.stop();
    this.mode = "idle";
    this.until = performance.now() + rand(0, 1500);
    let nextAt = performance.now() + rand(0, SEND_INTERVAL_MS);
    const loop = () => {
      this.step();
      nextAt += SEND_INTERVAL_MS;
      this.timer = setTimeout(loop, Math.max(0, nextAt - performance.now()));
    };
    this.timer = setTimeout(loop, nextAt - performance.now());
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 의도적 퇴장 (유예 없음) */
  leave(): void {
    this.stop();
    this.ws?.close(1000, "bye");
  }

  /** 네트워크 끊김 흉내: close 프레임 없이 TCP를 끊는다 */
  drop(): void {
    this.stop();
    this.ws?.terminate();
  }

  sendMove(): void {
    if (!this.ws || !this.open) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    this.seq = (this.seq + 1) & 0xffff;
    this.ws.send(encodeMove({ x, y, state: this.state, dir: this.dir, seq: this.seq }));
    M.sent.set(sentKey(this.channel, this.sid, x, y), performance.now());
  }

  send(msg: C2S | string): void {
    if (this.ws && this.open) this.ws.send(typeof msg === "string" ? msg : encodeEvent(msg));
  }

  resetStats(): void {
    this.bytes = 0;
    this.ticks = 0;
    this.intervals = [];
  }

  private onMessage(data: Buffer, isBinary: boolean): void {
    const now = performance.now();
    if (M.measuring) this.bytes += data.length + (data.length < 126 ? 2 : 4); // + WS 프레임 헤더(서버→클라이언트는 마스크 없음)
    if (isBinary) {
      const snap = decodeSnapshot(data);
      if (!snap) return;
      if (M.measuring) {
        this.ticks++;
        if (this.lastSnapAt) this.intervals.push(now - this.lastSnapAt);
      }
      this.lastSnapAt = now;
      for (const e of snap.entries) {
        if (e.sid === this.sid) continue; // 내 엔트리는 무시 (클라이언트도 그렇게 해야 한다)
        this.peers.set(e.sid, e);
        if (!M.measuring) continue;
        const t0 = M.sent.get(sentKey(this.channel, e.sid, e.x, e.y));
        if (t0 === undefined) continue;
        if (now - t0 < 1000) M.latencies.push(now - t0);
        else M.stale++;
      }
      return;
    }
    const text = data.toString();
    if (text === PONG) {
      this.pongs++;
      return;
    }
    const msg = parseS2C(text);
    if (!msg) return;
    this.events.push(msg);
    switch (msg.t) {
      case "welcome":
        this.welcome = msg;
        this.sid = msg.sid;
        this.seats = new Map(Object.entries(msg.seats));
        for (const p of msg.peers) this.peers.set(p.sid, p);
        break;
      case "join":
        this.peers.set(msg.sid, msg);
        break;
      case "leave":
        this.leaves.set(msg.sid, now);
        this.peers.delete(msg.sid);
        break;
      case "seat":
        if (msg.sid === null) this.seats.delete(msg.seatId);
        else this.seats.set(msg.seatId, msg.sid);
        if (this.mode === "seatWait" && msg.sid === this.sid && msg.seatId === this.goal?.seatId) this.onSeatGranted();
        break;
      case "seatDenied":
        if (this.mode === "seatWait" && msg.seatId === this.goal?.seatId) this.sitOnGround();
        break;
    }
  }

  /** 내가 점유한 좌석 */
  heldSeat(): string | undefined {
    for (const [seatId, sid] of this.seats) if (sid === this.sid) return seatId;
    return undefined;
  }

  /** 좌석에 앉아 쉬는 중 (막 일어나 걷기 시작해 해제 알림이 오가는 중인 경우는 제외) */
  get seated(): string | undefined {
    return this.mode === "seated" ? this.heldSeat() : undefined;
  }

  // ── 행동 (실제 클라이언트 규칙: 움직이는 동안만 10Hz, 멈추거나 앉으면 상태가 바뀔 때 1회) ──

  private step(): void {
    const now = performance.now();
    if (this.mode === "walk") return this.walk();
    if (now < this.until) return;
    if (this.mode === "seatWait") return this.sitOnGround(); // 응답이 없으면 바닥에 앉는다
    this.pickGoal();
  }

  private pickGoal(): void {
    if (this.mode === "seated" && Math.random() < 0.5) this.send({ t: "stand" }); // 나머지는 걷기 MOVE로 자동 해제
    const seat = Math.random() < 0.3 ? SEATS[Math.floor(Math.random() * SEATS.length)] : undefined;
    this.goal = seat ? { x: seat.x, y: seat.y, seatId: seat.id } : randomPoint();
    this.speed = Math.random() < 0.3 ? RUN_SPEED : WALK_SPEED;
    this.mode = "walk";
    this.walk();
  }

  private walk(): void {
    const g = this.goal!;
    const dx = g.x - this.x;
    const dy = g.y - this.y;
    const d = Math.hypot(dx, dy);
    const stepLen = (this.speed * SEND_INTERVAL_MS) / 1000;
    if (d <= stepLen) {
      this.x = g.x;
      this.y = g.y;
      return this.arrive();
    }
    this.x += (dx / d) * stepLen;
    this.y += (dy / d) * stepLen;
    this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR.left : DIR.right) : dy < 0 ? DIR.up : DIR.down;
    this.state = this.speed === RUN_SPEED ? STATE.run : STATE.walk;
    this.sendMove();
  }

  private arrive(): void {
    const now = performance.now();
    if (this.goal?.seatId) {
      // 클라이언트처럼 요청과 동시에 스냅을 시작한다. 결과는 seat 또는 seatDenied
      this.mode = "seatWait";
      this.until = now + 2000;
      this.send({ t: "sit", seatId: this.goal.seatId });
      this.state = STATE.sitChair;
      this.sendMove();
    } else if (Math.random() < 0.25) {
      this.sitOnGround();
    } else {
      this.mode = "idle";
      this.state = STATE.idle;
      this.until = now + rand(1000, 3000);
      this.sendMove();
    }
  }

  private onSeatGranted(): void {
    const seat = seatById(this.goal!.seatId!)!;
    this.mode = "seated";
    this.x = seat.x;
    this.y = seat.y;
    this.dir = seat.facing;
    this.until = performance.now() + rand(2000, 5000);
  }

  private sitOnGround(): void {
    this.mode = "ground";
    this.state = STATE.sitGround;
    this.until = performance.now() + rand(1500, 3500);
    this.sendMove();
  }
}

async function spawnBots(n: number, channel: number, prefix: string): Promise<{ bots: Bot[]; results: ConnectResult[] }> {
  const bots = Array.from({ length: n }, (_, i) => new Bot(`${prefix}${i}`));
  const results = await pool(bots, 20, (b) => b.connect(channel));
  return { bots, results };
}

async function teardown(bots: Bot[]): Promise<void> {
  for (const b of bots) b.leave();
  await waitFor(() => bots.every((b) => !b.ws || b.ws.readyState === WebSocket.CLOSED), 5000);
}

/** 봇이 아닌 한 번짜리 접속 시도 (403/4003/4004 확인용) */
function attempt(path: string, origin = ORIGIN): Promise<ConnectResult> {
  const ws = new WebSocket(`${WS_URL}${path}`, { headers: { Origin: origin } });
  return new Promise((resolve) => {
    ws.on("message", (data) => {
      const m = parseS2C((data as Buffer).toString());
      if (m?.t === "welcome") {
        resolve({ welcome: m });
        ws.close(1000);
      }
    });
    ws.on("close", (code) => resolve({ code }));
    ws.on("unexpected-response", (req, res) => {
      req.destroy();
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.on("error", () => {});
  });
}

// ── 지표 ──

type Metrics = {
  label: string;
  clients: number;
  seconds: number;
  latency: { n: number; p50: number; p95: number; p99: number; max: number; stale: number };
  hz: { mean: number; min: number };
  kbps: { mean: number; max: number };
  intervalP95: number;
  loopP99: number;
};
const allMetrics: Metrics[] = [];

async function measure(label: string, bots: Bot[], seconds: number): Promise<Metrics> {
  for (const b of bots) b.resetStats();
  M.sent.clear();
  M.latencies = [];
  M.stale = 0;
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  M.measuring = true;
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    await sleep(1000);
    const cutoff = performance.now() - 5000;
    for (const [k, t] of M.sent) if (t < cutoff) M.sent.delete(k);
  }
  M.measuring = false;
  loop.disable();
  const elapsed = (performance.now() - t0) / 1000;
  const live = bots.filter((b) => b.open);
  const hz = live.map((b) => b.ticks / elapsed);
  const kbps = live.map((b) => b.bytes / elapsed / 1024);
  const m: Metrics = {
    label,
    clients: live.length,
    seconds: elapsed,
    latency: {
      n: M.latencies.length,
      p50: pct(M.latencies, 50),
      p95: pct(M.latencies, 95),
      p99: pct(M.latencies, 99),
      max: pct(M.latencies, 100),
      stale: M.stale,
    },
    hz: { mean: hz.reduce((a, b) => a + b, 0) / hz.length, min: Math.min(...hz) },
    kbps: { mean: kbps.reduce((a, b) => a + b, 0) / kbps.length, max: Math.max(...kbps) },
    intervalP95: pct(
      live.flatMap((b) => b.intervals),
      95,
    ),
    loopP99: loop.percentile(99) / 1e6,
  };
  allMetrics.push(m);
  console.log(
    `  [${label}] clients=${m.clients} latency p50=${fmt(m.latency.p50)} p95=${fmt(m.latency.p95)} p99=${fmt(m.latency.p99)} max=${fmt(m.latency.max)}ms (n=${m.latency.n}, >1s=${m.latency.stale})` +
      ` | Hz mean=${fmt(m.hz.mean, 2)} min=${fmt(m.hz.min, 2)} | KB/s mean=${fmt(m.kbps.mean, 2)} max=${fmt(m.kbps.max, 2)}` +
      ` | snapshot interval p95=${fmt(m.intervalP95)}ms | bot event-loop p99=${fmt(m.loopP99)}ms`,
  );
  check(`${label}: MOVE→peer latency p95 < 150ms`, m.latency.p95 < 150, `${fmt(m.latency.p95)}ms`);
  check(`${label}: snapshot rate ≥ 9Hz (min client)`, m.hz.min >= 9, `${fmt(m.hz.min, 2)}Hz`);
  check(`${label}: receive bandwidth < 8KB/s (max client)`, m.kbps.max < 8, `${fmt(m.kbps.max, 2)}KB/s`);
  return m;
}

// ── 시나리오 ──

async function smoke(): Promise<void> {
  const health = await fetch(`${HTTP_URL}/health`).then((r) => r.json());
  check("GET /health", (health as { ok?: boolean }).ok === true);
  const good = await fetch(`${HTTP_URL}/lobby`, { headers: { Origin: ORIGIN } });
  check("GET /lobby CORS for allowed origin", good.headers.get("access-control-allow-origin") === ORIGIN);
  const evil = await fetch(`${HTTP_URL}/lobby`, { headers: { Origin: "https://evil.example" } });
  check("GET /lobby no CORS for other origins", evil.headers.get("access-control-allow-origin") === null);

  const otherCh = CHANNEL === 1 ? 2 : 1;
  const probe = (channel: number) => ({ visitorId: newVisitorId(), name: "probe", color: AVATAR_COLORS[0], channel });
  const token = await signJoinToken(SECRET, probe(CHANNEL));
  const expired = await signJoinToken(SECRET, probe(CHANNEL), -10);
  const wrongCh = await signJoinToken(SECRET, probe(otherCh));
  const r403 = await attempt(`/ch/${CHANNEL}?t=${token}`, "https://evil.example");
  check("bad Origin → HTTP 403", "status" in r403 && r403.status === 403, describeResult(r403));
  const r4003 = await attempt(`/ch/${CHANNEL}?t=forged.token`);
  check("forged token → 4003", "code" in r4003 && r4003.code === CLOSE.INVALID_TOKEN, describeResult(r4003));
  const r4003b = await attempt(`/ch/${CHANNEL}?t=${expired}`);
  check("expired token → 4003", "code" in r4003b && r4003b.code === CLOSE.INVALID_TOKEN, describeResult(r4003b));
  const r4003c = await attempt(`/ch/${CHANNEL}?t=${wrongCh}`);
  check("token issued for another channel → 4003", "code" in r4003c && r4003c.code === CLOSE.INVALID_TOKEN, describeResult(r4003c));
  const r4004 = await attempt(`/ch/0?t=${token}`);
  const r4004b = await attempt(`/ch/999?t=${token}`);
  check(
    "channel out of range → 4004",
    "code" in r4004 && r4004.code === CLOSE.BAD_REQUEST && "code" in r4004b && r4004b.code === CLOSE.BAD_REQUEST,
    `${describeResult(r4004)}, ${describeResult(r4004b)}`,
  );

  const chairA = seatById("cA")!;
  const a = new Bot("smokeA", { x: chairA.x + 10, y: chairA.y + 6 });
  const b = new Bot("smokeB", { x: chairA.x - 12, y: chairA.y });
  const ra = await a.connect(CHANNEL);
  const rb = await b.connect(CHANNEL);
  check("A welcome (resumed=false)", isWelcome(ra) && ra.welcome.resumed === false);
  check("B welcome lists A with name and position", isWelcome(rb) && rb.welcome.peers.some((p) => p.sid === a.sid && p.name === "smokeA" && p.x === a.x));
  check("A receives join(B)", await waitFor(() => a.events.some((e) => e.t === "join" && e.sid === b.sid && e.name === "smokeB"), 1000));

  a.send(PING);
  check("ping → pong (auto response)", await waitFor(() => a.pongs > 0, 1000));

  a.x += 5;
  a.state = STATE.walk;
  a.sendMove();
  check("A's MOVE reaches B in a SNAPSHOT", await waitFor(() => b.peers.get(a.sid)?.x === a.x, 500));

  a.send({ t: "sit", seatId: "cA" });
  check("sit → seat broadcast to both", await waitFor(() => a.seats.get("cA") === a.sid && b.seats.get("cA") === a.sid, 1000));
  check(
    "seated avatar snaps to the anchor as sitChair",
    await waitFor(() => {
      const p = b.peers.get(a.sid);
      return p?.x === chairA.x && p.y === chairA.y && p.state === STATE.sitChair;
    }, 500),
  );
  b.send({ t: "sit", seatId: "cA" });
  check("occupied seat → seatDenied (requester only)", await waitFor(() => b.events.some((e) => e.t === "seatDenied" && e.seatId === "cA"), 1000) && !a.events.some((e) => e.t === "seatDenied"));
  b.send({ t: "sit", seatId: "cC" });
  check("far seat → seatDenied", await waitFor(() => b.events.some((e) => e.t === "seatDenied" && e.seatId === "cC"), 1000));
  a.state = STATE.walk;
  a.x += 3;
  a.sendMove();
  check("non-sitChair MOVE releases the seat", await waitFor(() => b.events.some((e) => e.t === "seat" && e.seatId === "cA" && e.sid === null), 1000));

  a.send({ t: "emote", kind: "flower", graveId: "g1" });
  check("emote relayed to others with sender sid", await waitFor(() => b.events.some((e) => e.t === "emote" && e.sid === a.sid), 1000));
  check("emote not echoed to sender", !a.events.some((e) => e.t === "emote"));
  a.send({ t: "graveEvent", kind: "updated", graveId: "g9" });
  b.send({ t: "graveEvent", kind: "updated", graveId: "g9" }); // 같은 묘비를 5초 안에 다시 → 채널에서 한 번만 중계
  await sleep(300);
  const g9 = (x: Bot) => x.events.filter((e) => e.t === "graveEvent" && e.graveId === "g9").length;
  check("graveEvent for the same grave relayed once per 5s per channel", g9(a) + g9(b) === 1, `${g9(a)}+${g9(b)}`);

  // 아무도 움직이지 않으면 틱이 멈추고 DO가 hibernate된다(로컬 workerd는 유휴 약 10초 뒤).
  // 깨어난 뒤 소켓 attachment로 좌석·위치가 복원되는지 본다.
  a.send({ t: "sit", seatId: "cA" });
  await waitFor(() => b.seats.get("cA") === a.sid, 1000);
  await sleep(12_000);
  const c = new Bot("smokeC");
  const rc = await c.connect(CHANNEL);
  check(
    "after 12s idle (hibernation), welcome restores A's seat and position",
    isWelcome(rc) &&
      rc.welcome.seats.cA === a.sid &&
      rc.welcome.peers.some((p) => p.sid === a.sid && p.x === chairA.x && p.y === chairA.y && p.state === STATE.sitChair),
  );
  b.x += 4;
  b.state = STATE.walk;
  b.sendMove();
  check("after wake, MOVE still relays", await waitFor(() => a.peers.get(b.sid)?.x === b.x, 500));

  // 같은 visitorId로 두 번째 탭
  const a2 = new Bot("smokeA", { x: a.x, y: a.y }, a.visitorId);
  const ra2 = await a2.connect(CHANNEL);
  check("duplicate visitor: old socket closed 4002", await waitFor(() => a.closed?.code === CLOSE.REPLACED, 3000), `${a.closed?.code}`);
  check("duplicate visitor: new socket keeps sid, resumed=true", isWelcome(ra2) && ra2.welcome.sid === a.sid && ra2.welcome.resumed);
  check("duplicate visitor: others see no leave", !b.leaves.has(a.sid));

  // 같은 visitorId가 다른 채널에 들어가면 로비가 이전 채널의 자리를 4002로 정리한다
  const a3 = new Bot("smokeA", { x: a.x, y: a.y }, a.visitorId);
  const ra3 = await a3.connect(otherCh);
  check(`same visitor joins channel ${otherCh} → welcome there`, isWelcome(ra3));
  check(`…and its channel-${CHANNEL} socket is closed 4002 via the lobby`, await waitFor(() => a2.closed?.code === CLOSE.REPLACED, 3000), `${a2.closed?.code}`);
  check(`…and channel-${CHANNEL} peers see it leave`, await waitFor(() => b.leaves.has(a.sid), 1000));

  // 초당 30메시지를 계속 보내면 10초 뒤 4008
  const f = new Bot("smokeFlood");
  await f.connect(CHANNEL);
  const flood = setInterval(() => f.sendMove(), 33);
  const t0 = performance.now();
  const kicked = await waitFor(() => f.closed !== null, 13_000);
  clearInterval(flood);
  check("flood > 20 msg/s for 10s → 4008", kicked && f.closed?.code === CLOSE.RATE_LIMITED, `${f.closed?.code} after ${fmt((performance.now() - t0) / 1000)}s`);
  check("flooder's leave broadcast", await waitFor(() => b.leaves.has(f.sid), 1000));

  await teardown([a3, b, c, f]);
}

async function scenario1(): Promise<void> {
  const lobby = await fetchLobby();
  const cap = lobby.channels[0].cap;
  const { bots, results } = await spawnBots(cap, CHANNEL, "s1-");
  const ok = results.filter(isWelcome).length;
  check(`${cap} bots join channel ${CHANNEL}`, ok === cap, `${ok}/${cap}`);
  check("sids are unique", new Set(bots.map((b) => b.sid)).size === cap);
  const extra = new Bot("s1-extra");
  const t0 = performance.now();
  const r = await extra.connect(CHANNEL);
  const ms = performance.now() - t0;
  check(`bot #${cap + 1} → 4001 CHANNEL_FULL, promptly`, "code" in r && r.code === CLOSE.CHANNEL_FULL && ms < 1000, `${describeResult(r)} in ${fmt(ms, 0)}ms`);

  for (const b of bots) b.start();
  await sleep(3000);
  await measure(`S1 ${cap} bots / 1 ch`, bots, DURATION_SEC);

  const l = await lobbyUntil((x) => x.channels[CHANNEL - 1]?.count === cap);
  check("lobby reports the full channel", l.channels[CHANNEL - 1]?.count === cap, `${l.channels[CHANNEL - 1]?.count}/${cap}`);
  if (CHANNEL === 1 && l.total === cap) check("lobby auto-opens channel 2 (ch1 ≥ threshold)", l.channels[1]?.open === true);
  await teardown(bots);
}

async function scenario2(): Promise<void> {
  const lobby = await fetchLobby();
  const { cap } = lobby.channels[0];
  const max = lobby.maxChannels;
  const all: Bot[] = [];
  let ok = 0;
  for (let ch = 1; ch <= max; ch++) {
    const { bots, results } = await spawnBots(cap, ch, `s2-${ch}-`);
    all.push(...bots);
    ok += results.filter(isWelcome).length;
  }
  check(`${max} ch × ${cap} = ${max * cap} bots joined`, ok === max * cap, `${ok}`);
  for (const b of all) b.start();
  await sleep(3000);
  await measure(`S2 ${max * cap} bots / ${max} ch`, all, Math.max(10, Math.round(DURATION_SEC * 0.75)));

  const l = await lobbyUntil((x) => x.total === max * cap);
  check("lobby total = global cap", l.total === l.totalCap, `${l.total}/${l.totalCap}`);
  const picked = pickChannel(l);
  check(`bot #${max * cap + 1}: pickChannel → null (spectator mode)`, picked === null, `${picked}`);
  const extra = new Bot("s2-extra");
  const codes: string[] = [];
  for (let ch = 1; ch <= max; ch++) codes.push(describeResult(await extra.connect(ch)));
  check(`bot #${max * cap + 1}: direct connect to every channel → 4001`, codes.every((c) => c === `close ${CLOSE.CHANNEL_FULL}`), codes.join(","));
  await teardown(all);
}

async function scenario3(): Promise<void> {
  const lobby = await fetchLobby();
  const cap = lobby.channels[0].cap;
  const { bots, results } = await spawnBots(cap, CHANNEL, "s3-");
  check(`${cap} bots join channel ${CHANNEL}`, results.every(isWelcome));
  for (const b of bots) b.start();
  await sleep(6000); // 몇 명은 앉게 둔다

  const dropped = bots.filter((_, i) => i % 2 === 0);
  const stayed = bots.filter((_, i) => i % 2 === 1);
  const before = new Map(dropped.map((b) => [b, { sid: b.sid, seat: b.seated }]));
  const seatedCount = [...before.values()].filter((v) => v.seat).length;
  for (const b of dropped) b.drop();
  const t0 = performance.now();
  console.log(`  dropped ${dropped.length} bots (${seatedCount} seated)`);

  await sleep(1000);
  const outsider = new Bot("s3-outsider");
  const ro = await outsider.connect(CHANNEL);
  check("outsider during grace → 4001 (reserved slots count)", "code" in ro && ro.code === CLOSE.CHANNEL_FULL, describeResult(ro));

  const resumed = await Promise.all(
    dropped.map(async (b) => {
      await sleep(rand(1000, 14_000) - (performance.now() - t0));
      const r = await b.connect(CHANNEL); // 새 토큰, 같은 visitorId, 마지막 위치
      if (isWelcome(r)) b.start();
      return { b, r, at: (performance.now() - t0) / 1000 };
    }),
  );
  const lastAt = Math.max(...resumed.map((x) => x.at));
  const sameSid = resumed.filter(({ b, r }) => isWelcome(r) && r.welcome.resumed && r.welcome.sid === before.get(b)!.sid).length;
  check(`all ${dropped.length} reconnect within 15s with same sid + resumed=true`, sameSid === dropped.length && lastAt < 15, `${sameSid}/${dropped.length}, last at ${fmt(lastAt)}s`);
  const seatKept = resumed.filter(({ b, r }) => {
    const seat = before.get(b)!.seat;
    return !seat || (isWelcome(r) && r.welcome.seats[seat] === r.welcome.sid);
  }).length;
  check("seats held before the drop are still held after resume", seatKept === dropped.length, `${seatKept}/${dropped.length}`);
  const droppedSids = new Set([...before.values()].map((v) => v.sid));
  check("others never saw a leave for the dropped bots", stayed.every((s) => ![...s.leaves.keys()].some((sid) => droppedSids.has(sid))));
  const ro2 = await outsider.connect(CHANNEL);
  check("channel still full after everyone resumed → 4001", "code" in ro2 && ro2.code === CLOSE.CHANNEL_FULL, describeResult(ro2));

  // 한 명은 돌아오지 않는다 → 유예 만료 후 leave + 좌석 해제
  const gone = bots.find((b) => b.open && b.seated) ?? bots.find((b) => b.open)!;
  const goneSeat = gone.seated;
  const observers = bots.filter((b) => b !== gone && b.open);
  gone.drop();
  const t1 = performance.now();
  const sawLeave = await waitFor(() => observers.every((o) => o.leaves.has(gone.sid)), 40_000);
  const after = (Math.max(...observers.map((o) => o.leaves.get(gone.sid) ?? Infinity)) - t1) / 1000;
  check(`unreturned bot: leave broadcast after the ${GRACE_SEC}s grace`, sawLeave && after >= GRACE_SEC - 1 && after < GRACE_SEC + 5, `${fmt(after)}s`);
  if (goneSeat) check(`unreturned bot's seat ${goneSeat} released`, observers.every((o) => !o.seats.has(goneSeat)));
  const ro3 = await outsider.connect(CHANNEL);
  check("freed slot accepts the outsider", isWelcome(ro3), describeResult(ro3));
  await teardown([...bots, outsider]);
}

/** 브라우저 FPS 측정용: 채널에 봇을 채워 두고(한 자리는 비워 둠) 움직이게 둔다 */
async function hold(): Promise<void> {
  const cap = (await fetchLobby()).channels[0].cap;
  const n = opt.bots ? Number(opt.bots) : cap - 1;
  const { bots, results } = await spawnBots(n, CHANNEL, "hold-");
  check(`${n} bots holding channel ${CHANNEL}`, results.every(isWelcome), `${results.filter(isWelcome).length}/${n}`);
  for (const b of bots) b.start();
  console.log(`  join channel ${CHANNEL} from a browser now; bots walk for ${DURATION_SEC}s`);
  await measure(`hold ${n} bots / ch${CHANNEL}`, bots, DURATION_SEC);
  await teardown(bots);
}

/** Workers 안에서는 동기 CPU 구간 동안 시계가 멈추므로(Spectre 대응) 틱 처리 시간을 DO 안에서 잴 수 없다. 같은 코드를 Node에서 잰다. */
function bench(): void {
  const cap = 40;
  let bytes = 0;
  const conns = Array.from({ length: cap }, (_, i) => ({ i }));
  const core = new ChannelCore<{ i: number }>(
    { capacity: cap, graceMs: 20_000 },
    {
      send: (_c, d) => void (bytes += typeof d === "string" ? d.length : d.byteLength),
      close: () => {},
      persist: () => {},
      saveReservation: () => {},
      dropReservation: () => {},
      requestTick: () => {},
      countChanged: () => {},
      lastPing: () => 0,
      visitorJoined: () => {},
      visitorLeft: () => {},
    },
  );
  const pos = conns.map((_, i) => ({ x: 60 + (i % 10) * 50, y: 60 + Math.floor(i / 10) * 80 }));
  conns.forEach((c, i) => core.join(c, { visitorId: `v${i}`, name: `b${i}`, color: AVATAR_COLORS[0], channel: 1, spawn: pos[i] }, 0));
  const tickMs: number[] = [];
  const moveUs: number[] = [];
  let now = 0;
  for (let t = 0; t < 5000; t++) {
    now += 100;
    // 최악의 경우: 40명 모두가 매 틱 움직인다
    const bufs = pos.map((p, i) => {
      p.x += t % 40 < 20 ? 5 : -5;
      return encodeMove({ x: p.x, y: p.y + (i % 2), state: STATE.walk, dir: DIR.right, seq: t });
    });
    const m0 = performance.now();
    conns.forEach((c, i) => core.message(c, bufs[i], now));
    const m1 = performance.now();
    core.tick(now);
    const m2 = performance.now();
    if (t >= 500) {
      moveUs.push(((m1 - m0) / cap) * 1000);
      tickMs.push(m2 - m1);
    }
  }
  console.log(
    `  ChannelCore.tick (40 peers all dirty, 40 recipients): p50=${fmt(pct(tickMs, 50) * 1000)}µs p95=${fmt(pct(tickMs, 95) * 1000)}µs max=${fmt(pct(tickMs, 100) * 1000)}µs | MOVE handling p95=${fmt(pct(moveUs, 95), 2)}µs/msg | ${fmt(bytes / 1024 / 1024)}MB encoded`,
  );
  check("tick processing p95 < 1ms (Node, same code as the DO)", pct(tickMs, 95) < 1, `${fmt(pct(tickMs, 95) * 1000)}µs`);
}

// ── 실행 ──

async function main(): Promise<void> {
  console.log(`target ${WS_URL} (origin ${ORIGIN}), scenarios: ${SCENARIOS.join(",")}`);
  const run: Record<string, () => unknown> = { smoke, "1": scenario1, "2": scenario2, "3": scenario3, bench, hold };
  for (const s of SCENARIOS) {
    const fn = run[s];
    if (!fn) throw new Error(`unknown scenario ${s}`);
    currentScenario = s;
    console.log(`\n▶ scenario ${s}`);
    await fn();
  }

  if (allMetrics.length) {
    console.log("\n| 측정 | 클라이언트 | 지연 p50 / p95 / max (ms) | 1초 초과로 버린 샘플 | 수신 Hz 평균 / 최소 | 수신 KB/s 평균 / 최대 | 스냅샷 간격 p95 (ms) | 봇 이벤트루프 p99 (ms) |");
    console.log("|---|---|---|---|---|---|---|---|");
    for (const m of allMetrics) {
      console.log(
        `| ${m.label} | ${m.clients} | ${fmt(m.latency.p50)} / ${fmt(m.latency.p95)} / ${fmt(m.latency.max)} (n=${m.latency.n}) | ${m.latency.stale} | ${fmt(m.hz.mean, 2)} / ${fmt(m.hz.min, 2)} | ${fmt(m.kbps.mean, 2)} / ${fmt(m.kbps.max, 2)} | ${fmt(m.intervalP95)} | ${fmt(m.loopP99)} |`,
      );
    }
  }
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  for (const c of failed) console.log(`  FAIL [${c.scenario}] ${c.name} ${c.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

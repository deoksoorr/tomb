import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE, decodeMove, encodeSnapshot, PING, PONG, STATE, DIR } from "@tomb/protocol";
import { RoomClient, type RoomStatus, type WsCtor } from "./RoomClient";
import { isRoomId, parseRoomMessage, roomCloseAction, roomSocketUrl } from "./roomPolicy";
import { BACKOFF_MAX_MS } from "./backoff";

// ── 순수 규칙 ──

describe("room policy", () => {
  it("room ids follow ROOM_ID_RE", () => {
    expect(isRoomId("village")).toBe(true);
    expect(isRoomId("house:abcd1234")).toBe(true);
    expect(isRoomId("hunt:bugs:easy")).toBe(true);
    expect(isRoomId("house:x")).toBe(false);
    expect(isRoomId("ch:1")).toBe(false);
    expect(isRoomId(3)).toBe(false);
  });

  it("appends the spawn position to the ws url", () => {
    expect(roomSocketUrl("wss://rt.test/room/village?t=abc", 10.4, 20.6)).toBe("wss://rt.test/room/village?t=abc&x=10&y=21");
    expect(roomSocketUrl("wss://rt.test/room/village", 1, 2)).toBe("wss://rt.test/room/village?x=1&y=2");
  });

  it("close code → next step", () => {
    expect(roomCloseAction(1000, true)).toBe("leave");
    expect(roomCloseAction(CLOSE.REPLACED, false)).toBe("replaced");
    expect(roomCloseAction(CLOSE.INVALID_TOKEN, false)).toBe("refetch");
    expect(roomCloseAction(CLOSE.BAD_REQUEST, false)).toBe("refetch");
    expect(roomCloseAction(CLOSE.CHANNEL_FULL, false)).toBe("full");
    expect(roomCloseAction(CLOSE.RATE_LIMITED, false)).toBe("rate");
    expect(roomCloseAction(1006, false)).toBe("retry");
  });

  it("validates act / say / peers and drops my own echoes", () => {
    expect(parseRoomMessage(JSON.stringify({ t: "say", sid: 2, id: "hi" }), 1)).toEqual({ t: "say", sid: 2, id: "hi" });
    expect(parseRoomMessage(JSON.stringify({ t: "say", sid: 2, id: "욕설" }), 1)).toBeNull();
    expect(parseRoomMessage(JSON.stringify({ t: "say", sid: 1, id: "hi" }), 1)).toBeNull();
    expect(parseRoomMessage(JSON.stringify({ t: "act", sid: 2, kind: "wave", x: 1, y: 2 }), 1)?.t).toBe("act");
    expect(parseRoomMessage(JSON.stringify({ t: "act", sid: 2, kind: "dance", x: 1, y: 2 }), 1)).toBeNull();
    expect(parseRoomMessage(JSON.stringify({ t: "act", sid: 2, kind: "wave", x: "1", y: 2 }), 1)).toBeNull();
    expect(parseRoomMessage(JSON.stringify({ t: "seat", seatId: "a", sid: 2 }), 1)).toBeNull();
    expect(parseRoomMessage("not json", 1)).toBeNull();
    const w = parseRoomMessage(
      JSON.stringify({ t: "welcome", sid: 5, cap: 30, resumed: false, peers: [{ sid: 5, x: 0, y: 0, name: "me", color: "#fff" }, { sid: 6, x: 1, y: 2, name: "a", color: "#fff", state: 0, dir: 0 }, { bad: 1 }] }),
      null,
    );
    expect(w?.t === "welcome" && w.m.peers.map((p) => [p.sid, p.body, p.look])).toEqual([[6, "hood", []]]);
  });
});

// ── 가짜 소켓으로 RoomClient ──

class FakeWs {
  static last: FakeWs | null = null;
  static all: FakeWs[] = [];
  readyState = 0;
  binaryType = "";
  sent: (string | ArrayBuffer)[] = [];
  closed: number | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onopen: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.last = this;
    FakeWs.all.push(this);
  }
  send(d: string | ArrayBuffer | ArrayBufferView): void {
    this.sent.push(d as string | ArrayBuffer);
  }
  close(code?: number): void {
    this.closed = code ?? 1005;
    this.readyState = 3;
  }
  // 테스트 도우미
  open(): void {
    this.readyState = 1;
  }
  recv(msg: unknown): void {
    this.onmessage?.({ data: typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg) });
  }
  serverClose(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  texts(): string[] {
    return this.sent.filter((s): s is string => typeof s === "string");
  }
}

function okJoin(room: string, n = 1) {
  return new Response(JSON.stringify({ room, token: `tok${n}`, wsUrl: `wss://rt.test/room/${encodeURIComponent(room)}?t=tok${n}` }), { status: 200 });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("RoomClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let statuses: RoomStatus[];
  const pose = { x: 100, y: 200, state: STATE.idle as number, dir: DIR.down as number };
  const events: string[] = [];

  function make(): RoomClient {
    statuses = [];
    events.length = 0;
    return new RoomClient(
      {
        getPose: (out) => {
          out.x = pose.x;
          out.y = pose.y;
          out.state = pose.state as typeof out.state;
          out.dir = pose.dir as typeof out.dir;
          return out;
        },
        onWelcome: (m) => events.push(`welcome:${m.sid}:${m.peers.length}`),
        onJoin: (p) => events.push(`join:${p.sid}`),
        onLeave: (sid) => events.push(`leave:${sid}`),
        onSay: (sid, id) => events.push(`say:${sid}:${id}`),
        onAct: (sid, k) => events.push(`act:${sid}:${k}`),
        onSnapshot: (e) => events.push(`snap:${e.length}`),
        onReset: () => events.push("reset"),
        onStatus: (s) => statuses.push(s),
      },
      { fetch: fetchMock as unknown as typeof fetch, WebSocket: FakeWs as unknown as WsCtor },
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWs.last = null;
    FakeWs.all = [];
    let n = 0;
    fetchMock = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url === "/api/join/room") return okJoin(JSON.parse(init!.body!).room, ++n);
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("joins: POST /api/join/room, connects with spawn position, welcome → online", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith("/api/join/room", expect.objectContaining({ method: "POST", body: JSON.stringify({ room: "village" }) }));
    const ws = FakeWs.last!;
    expect(ws.url).toBe("wss://rt.test/room/village?t=tok1&x=100&y=200");
    ws.open();
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [{ sid: 2, x: 0, y: 0, name: "b", color: "#fff", state: 0, dir: 0, body: "cat", look: [] }] });
    expect(c.online).toBe(true);
    expect(c.status).toMatchObject({ mode: "online", room: "village", count: 2, cap: 30 });
    expect(events).toContain("welcome:1:1");
  });

  it("401 → session then retry", async () => {
    let first = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/join/room") {
        if (first) {
          first = false;
          return new Response("{}", { status: 401 });
        }
        return okJoin("village");
      }
      return new Response("{}", { status: 200 });
    });
    const c = make();
    c.joinRoom("village");
    await flush();
    await flush();
    expect(fetchMock.mock.calls.map((a) => a[0])).toEqual(["/api/join/room", "/api/session", "/api/join/room"]);
    expect(FakeWs.last).not.toBeNull();
  });

  it("denied room (403) → offline, no retry", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 403 }));
    const c = make();
    c.joinRoom("house:abcd1234");
    await flush();
    expect(c.status).toMatchObject({ mode: "offline", reason: "denied" });
    vi.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("say/act: validated, sent only when online; my echoes ignored, others delivered", async () => {
    const c = make();
    c.say("hi"); // 아직 접속 전 → 안 보낸다
    c.joinRoom("village");
    await flush();
    const ws = FakeWs.last!;
    ws.open();
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [] });
    c.say("hi");
    c.say("nope");
    c.act("wave");
    expect(ws.texts().map((s) => JSON.parse(s))).toEqual([{ t: "say", id: "hi" }, { t: "act", kind: "wave" }]);
    ws.recv({ t: "say", sid: 1, id: "hi" });
    ws.recv({ t: "say", sid: 2, id: "thanks" });
    ws.recv({ t: "act", sid: 2, kind: "cheer", x: 1, y: 2 });
    expect(events.filter((e) => e.startsWith("say") || e.startsWith("act"))).toEqual(["say:2:thanks", "act:2:cheer"]);
  });

  it("MOVE follows the throttle (only on change, ≤10Hz)", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    const ws = FakeWs.last!;
    ws.open();
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [] });
    c.tick(1000);
    c.tick(1050);
    pose.x = 110;
    c.tick(1060); // 100ms 안 → 보류
    c.tick(1101);
    c.tick(1300); // 바뀐 게 없다
    const moves = ws.sent.filter((s): s is ArrayBuffer => s instanceof ArrayBuffer).map((b) => decodeMove(b)!);
    expect(moves.map((m) => m.x)).toEqual([100, 110]);
    pose.x = 100;
  });

  it("unknown sid in a snapshot → urgent sync (min gap), known → nothing", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    const ws = FakeWs.last!;
    ws.open();
    vi.setSystemTime(0);
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [{ sid: 2, x: 0, y: 0, name: "b", color: "#fff", state: 0, dir: 0 }] });
    const snap = (sids: number[]) => encodeSnapshot(1, sids.map((sid) => ({ sid, x: 1, y: 1, state: STATE.idle, dir: DIR.down })));
    ws.recv(snap([1, 2]));
    expect(ws.texts().filter((t) => t.includes("sync"))).toHaveLength(0);
    vi.advanceTimersByTime(11_000);
    ws.recv(snap([2, 3]));
    expect(ws.texts().filter((t) => t.includes("sync"))).toHaveLength(1);
    ws.recv(snap([4]));
    expect(ws.texts().filter((t) => t.includes("sync"))).toHaveLength(1);
    expect(c).toBeTruthy();
  });

  it("drop → backoff reconnect to the same room reusing the token; invalid token → refetch", async () => {
    const c = make();
    c.joinRoom("hunt:bugs:easy");
    await flush();
    let ws = FakeWs.last!;
    ws.open();
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [] });
    ws.serverClose(1006);
    expect(events).toContain("reset");
    expect(c.status.mode).toBe("reconnecting");
    vi.advanceTimersByTime(BACKOFF_MAX_MS);
    await flush();
    expect(FakeWs.all.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 토큰 재사용
    ws = FakeWs.last!;
    expect(ws.url).toContain("/room/hunt%3Abugs%3Aeasy");
    ws.serverClose(CLOSE.INVALID_TOKEN);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2); // 새 토큰
    expect(FakeWs.all.length).toBe(3);
  });

  it("replaced → offline without reconnect; welcome timeout drops the socket", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    FakeWs.last!.serverClose(CLOSE.REPLACED);
    expect(c.status).toMatchObject({ mode: "offline", reason: "replaced" });
    vi.advanceTimersByTime(30_000);
    expect(FakeWs.all.length).toBe(1);

    const d = make();
    d.joinRoom("village");
    await flush();
    const ws = FakeWs.last!;
    ws.open();
    vi.advanceTimersByTime(8_100);
    expect(ws.closed).toBe(4000);
    expect(d.status.mode).toBe("connecting");
  });

  it("leave() closes with 1000 and stops everything; switching rooms leaves the old one", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    const a = FakeWs.last!;
    a.open();
    a.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [] });
    c.joinRoom("house:abcd1234");
    expect(a.closed).toBe(1000);
    await flush();
    const b = FakeWs.last!;
    expect(b.url).toContain("/room/house%3Aabcd1234");
    b.open();
    b.recv({ t: "welcome", sid: 3, cap: 30, resumed: false, peers: [] });
    c.leave();
    expect(b.closed).toBe(1000);
    expect(c.status.mode).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.all.length).toBe(2);
  });

  it("ping every 15s while online, answers pong; sync not sent before 3 minutes", async () => {
    const c = make();
    c.joinRoom("village");
    await flush();
    const ws = FakeWs.last!;
    ws.open();
    ws.recv({ t: "welcome", sid: 1, cap: 30, resumed: false, peers: [] });
    vi.advanceTimersByTime(15_000);
    expect(ws.texts()).toContain(PING);
    ws.recv(PONG);
    vi.advanceTimersByTime(60_000);
    expect(ws.texts().some((t) => t.includes('"sync"'))).toBe(false);
    expect(c.rtt).not.toBeNull();
  });
});

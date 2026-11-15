import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEvent, type PeerInfo } from "@tomb/protocol";
import { RealtimeClient, type NetCallbacks } from "./RealtimeClient";

// 11/15 같은 채널 안에서 맵(마을 ↔ 캠핑장) 옮기기: 연결 그대로 map을 보내고, mapped 전 옛 맵 소식은 버리고,
// 캠핑장 장면이 소식을 받아 가도(divert) 계정·친구·확성기는 월드가 받는다. 다시 접속하면 지금 맵으로 (&m=camp).

class FakeWs {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static last: FakeWs | null = null;
  readyState = FakeWs.CONNECTING;
  binaryType = "blob";
  sent: string[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.last = this;
  }
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.readyState = FakeWs.CLOSED;
  }
  recv(msg: object): void {
    this.onmessage?.({ data: encodeEvent(msg as never) });
  }
}

const peer = (sid: number, name: string): PeerInfo => ({ sid, name, color: "#e8d9b0", body: "hood", look: [], x: 100, y: 100, state: 0, dir: 0 });

function callbacks(log: string[], tag: string): NetCallbacks {
  const rec = (name: string) => (...a: unknown[]) => log.push(`${tag}:${name}:${JSON.stringify(a[0] ?? null)}`);
  return {
    getPose: (out) => Object.assign(out, { x: 156, y: 758, state: 0, dir: 0 }),
    getFps: () => 60,
    onWelcome: rec("welcome"),
    onJoin: (p) => log.push(`${tag}:join:${p.sid}`),
    onLeave: rec("leave"),
    onSnapshot: rec("snapshot"),
    onSeat: rec("seat"),
    onSeatDenied: rec("seatDenied"),
    onEmote: rec("emote"),
    onGraveEvent: rec("graveEvent"),
    onReset: () => log.push(`${tag}:reset`),
    onPeers: rec("peers"),
    onLook: rec("look"),
    onFirework: rec("firework"),
    onAct: rec("act"),
    onSay: rec("say"),
    onChat: (sid, text) => log.push(`${tag}:chat:${sid}:${text}`),
    onMegaphone: (m) => log.push(`${tag}:megaphone:${m.text}${m.system ? `:system:${m.replaces ?? ""}` : ""}`),
    onMapped: (map, peers) => log.push(`${tag}:mapped:${map}:${peers.map((p) => p.sid).join(",")}`),
  };
}

const joinRes = { mode: "channel", channel: 3, token: "t", wsUrl: "ws://rt/ch/3?t=t", campOpen: true };

async function online(c: RealtimeClient, map: "village" | "camp" = "village"): Promise<FakeWs> {
  c.start();
  await vi.waitFor(() => expect(FakeWs.last).not.toBeNull());
  const ws = FakeWs.last!;
  ws.readyState = FakeWs.OPEN;
  ws.recv({ t: "welcome", sid: 1, channel: 3, cap: 40, peers: [], seats: {}, resumed: false, spots: true, ...(map === "camp" ? { m: "camp" } : {}) });
  return ws;
}

describe("RealtimeClient 맵 옮기기 (11/15 캠핑장)", () => {
  beforeEach(() => {
    FakeWs.last = null;
    vi.stubGlobal("WebSocket", FakeWs);
    vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => joinRes })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("입장 응답의 campOpen을 기억하고, 마을이면 접속 주소에 m이 없다", async () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks([], "w"));
    const ws = await online(c);
    expect(c.campOpen).toBe(true);
    expect(ws.url).not.toContain("m=camp");
    expect(c.map).toBe("village");
    c.stop();
  });

  it("캠핑장에서 다시 접속하면 처음부터 캠핑장으로 (&m=camp), welcome.m이 없으면 마을로 돌아온다", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    c.map = "camp";
    c.start();
    await vi.waitFor(() => expect(FakeWs.last).not.toBeNull());
    expect(FakeWs.last!.url).toContain("&m=camp");
    FakeWs.last!.readyState = FakeWs.OPEN;
    FakeWs.last!.recv({ t: "welcome", sid: 1, channel: 3, cap: 40, peers: [], seats: {}, resumed: false });
    expect(c.map).toBe("village");
    c.stop();
  });

  it("switchMap: map을 보내고, mapped 전 옛 맵 소식은 버리고, 그 뒤는 캠핑장 장면이 받는다 (확성기는 월드)", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    c.divert(callbacks(log, "c"));
    expect(c.switchMap("camp", 156, 758)).toBe(true);
    expect(JSON.parse(ws.sent.at(-1)!)).toEqual({ t: "map", m: "camp", x: 156, y: 758 });
    log.length = 0;
    ws.recv({ t: "join", ...peer(5, "옛 마을 사람") });
    ws.recv({ t: "chat", sid: 5, text: "마을 말" });
    expect(log).toEqual([]);
    ws.recv({ t: "mapped", m: "camp", peers: [peer(7, "캠퍼")], seats: {} });
    ws.recv({ t: "chat", sid: 7, text: "캠핑장 말" });
    ws.recv({ t: "megaphone", id: "m1", name: "누구", text: "전체 공지", scope: "all", ch: 2, at: 1 });
    // 11/15 마을 공지 줄 (실시간 서버 /internal/say): system·replaces를 그대로 넘긴다
    ws.recv({ t: "megaphone", id: "urg-t1-a1", name: "공지", text: "끝 공지", scope: "all", ch: 0, at: 2, staff: true, system: true, replaces: "urg-t1-a0" });
    expect(log).toEqual(["c:mapped:camp:7", "c:chat:7:캠핑장 말", "w:megaphone:전체 공지", "w:megaphone:끝 공지:system:urg-t1-a0"]);
    expect(c.map).toBe("camp");
    expect(c.peerCount).toBe(1);
    c.stop();
  });

  it("서버가 캠핑장을 거절하면 mapped의 맵(마을)을 따른다", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    c.divert(callbacks(log, "c"));
    c.switchMap("camp", 156, 758);
    ws.recv({ t: "mapped", m: "village", peers: [], seats: {} });
    expect(c.map).toBe("village");
    expect(log.at(-1)).toBe("c:mapped:village:");
    c.stop();
  });

  it("맵을 모르는 옛 서버: 4초마다 두 번 더 보내 보고, 그래도 답이 없으면 처음 맵으로 되돌린다", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    vi.useFakeTimers();
    c.switchMap("camp", 156, 758);
    const maps = () => ws.sent.filter((d) => typeof d === "string" && d.includes('"t":"map"')).length;
    expect(maps()).toBe(1);
    vi.advanceTimersByTime(4100);
    expect(c.map).toBe("camp");
    expect(maps()).toBe(2);
    vi.advanceTimersByTime(4000);
    expect(maps()).toBe(3);
    expect(c.map).toBe("camp");
    vi.advanceTimersByTime(4000);
    expect(c.map).toBe("village");
    expect(log.at(-1)).toBe("w:mapped:village:");
    vi.useRealTimers();
    c.stop();
  });

  it("11/16 첫 요청의 답이 없어도 다시 보낸 요청에 답이 오면 그 맵으로", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    c.divert(callbacks(log, "c"));
    vi.useFakeTimers();
    c.switchMap("camp", 156, 758);
    vi.advanceTimersByTime(4100);
    ws.recv({ t: "mapped", m: "camp", peers: [], seats: {} });
    vi.advanceTimersByTime(20_000);
    expect(c.map).toBe("camp");
    expect(log.filter((l) => l.includes("mapped"))).toEqual(["c:mapped:camp:"]);
    vi.useRealTimers();
    c.stop();
  });

  it("접속 전이면 보내지 않고 다음 접속을 그 맵으로", () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks([], "w"));
    expect(c.switchMap("camp", 1, 2)).toBe(false);
    expect(c.map).toBe("camp");
  });
});

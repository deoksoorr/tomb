import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE, encodeEvent, type LobbyInfo } from "@tomb/protocol";
import { bridge } from "../bridge";
import { RealtimeClient, type NetCallbacks } from "./RealtimeClient";
import { CHANNEL_FULL_MSG, friendChannelFullMsg, lobbyChannelFull } from "./switchPolicy";

// 꽉 찬 채널로는 일부러 옮기지 못한다 (채널 메뉴·친구한테 가기·내 집 가기·내 묘비 가기):
//  - 떠나기 전에 로비를 보고 만석이면 연결을 그대로 두고 안내만
//  - 들어가는 순간 만석(경합)이면 다른 채널·관람 모드가 아니라 온 채널로 돌아온다
//  - 처음 입장(돌아갈 채널이 없음)은 예전처럼 로비를 보고 다른 채널로

class FakeWs {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static all: FakeWs[] = [];
  readyState = FakeWs.CONNECTING;
  binaryType = "blob";
  closedWith: number | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.all.push(this);
  }
  static get last(): FakeWs | undefined {
    return FakeWs.all.at(-1);
  }
  send(): void {}
  close(code?: number): void {
    this.closedWith = code ?? 1005;
    this.readyState = FakeWs.CLOSED;
  }
  recv(msg: object): void {
    this.onmessage?.({ data: encodeEvent(msg as never) });
  }
  /** 서버가 닫았다 */
  serverClose(code: number): void {
    this.readyState = FakeWs.CLOSED;
    this.onclose?.({ code });
  }
  welcome(channel: number): void {
    this.readyState = FakeWs.OPEN;
    this.recv({ t: "welcome", sid: 1, channel, cap: 40, peers: [], seats: {}, resumed: false });
  }
}

const noop = () => undefined;
function callbacks(pose: { x: number; y: number }): NetCallbacks {
  return {
    getPose: (out) => Object.assign(out, { x: pose.x, y: pose.y, state: 0, dir: 0 }),
    getFps: () => 60,
    onWelcome: noop,
    onJoin: noop,
    onLeave: noop,
    onSnapshot: noop,
    onSeat: noop,
    onSeatDenied: noop,
    onEmote: noop,
    onGraveEvent: noop,
    onReset: noop,
    onPeers: noop,
    onLook: noop,
    onFirework: noop,
    onAct: noop,
    onSay: noop,
  };
}

const ch = (id: number, count: number, cap = 40) => ({ id, count, cap, open: true });
let lobby: LobbyInfo;
const joins: (number | "auto")[] = [];
let lobbyCalls = 0;

function fakeFetch(url: string, init?: { body?: string }) {
  if (url.endsWith("/lobby")) {
    lobbyCalls++;
    return Promise.resolve({ ok: true, status: 200, json: async () => lobby });
  }
  if (url === "/api/join") {
    const { channel } = JSON.parse(init?.body ?? "{}") as { channel: number | "auto" };
    joins.push(channel);
    const id = channel === "auto" ? 1 : channel;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ mode: "channel", channel: id, token: "t", wsUrl: `ws://rt/ch/${id}?t=t` }) });
  }
  return Promise.resolve({ ok: false, status: 404, json: async () => null });
}

const chOf = (ws: FakeWs | undefined) => Number(/\/ch\/(\d+)/.exec(ws?.url ?? "")?.[1]);

async function onlineAt(c: RealtimeClient, channel: number): Promise<FakeWs> {
  c.start();
  await vi.waitFor(() => expect(FakeWs.last).toBeDefined());
  const ws = FakeWs.last!;
  ws.welcome(channel);
  expect(c.mode).toBe("online");
  return ws;
}

describe("switchPolicy", () => {
  it("만석 = count >= cap (채널 메뉴의 만석과 같다), 로비가 없거나 목록에 없는 채널은 만석이 아니다", () => {
    const l: LobbyInfo = { channels: [ch(1, 40), ch(2, 39), ch(3, 41)], total: 120, totalCap: 400, maxChannels: 10, threshold: 0.8 };
    expect(lobbyChannelFull(l, 1)).toBe(true);
    expect(lobbyChannelFull(l, 2)).toBe(false);
    expect(lobbyChannelFull(l, 3)).toBe(true);
    expect(lobbyChannelFull(l, 7)).toBe(false);
    expect(lobbyChannelFull(null, 1)).toBe(false);
    // 11/20 운영자는 정원 밖: 만석이어도 막지 않는다
    expect(lobbyChannelFull(l, 1, true)).toBe(false);
    expect(friendChannelFullMsg("가람")).toBe("가람님이 있는 채널이 꽉 차서 갈 수 없어요.");
  });
});

describe("RealtimeClient 일부러 옮기는 채널 이동 — 꽉 찬 채널로는 가지 않는다", () => {
  let events: string[];
  let offs: (() => void)[];
  beforeEach(() => {
    FakeWs.all = [];
    joins.length = 0;
    lobbyCalls = 0;
    lobby = { channels: [ch(1, 10), ch(2, 12), ch(3, 20), ch(5, 40)], total: 82, totalCap: 400, maxChannels: 10, threshold: 0.8 };
    vi.stubGlobal("WebSocket", FakeWs);
    vi.stubGlobal("document", { hidden: false, addEventListener: noop, removeEventListener: noop });
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
    events = [];
    offs = [
      bridge.on("toast", ({ message }) => events.push(`toast:${message}`)),
      bridge.on("channel:leave", ({ channel }) => events.push(`leave:${channel}`)),
      bridge.on("channel:refused", ({ channel, back, message }) => events.push(`refused:${channel}:${back}:${message}`)),
    ];
  });
  afterEach(() => {
    offs.forEach((o) => o());
    vi.unstubAllGlobals();
  });

  it("로비에서 만석인 채널로 옮기기: 떠나지 않는다 (연결·채널·자리 그대로, 안내만)", async () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks({ x: 300, y: 400 }));
    const ws = await onlineAt(c, 3);
    await c.switchChannel(5);
    expect(ws.closedWith).toBeNull();
    expect(FakeWs.all).toHaveLength(1);
    expect(c.mode).toBe("online");
    expect(c.channel).toBe(3);
    expect(joins).toEqual([3]);
    expect(events).toEqual([`refused:5:false:${CHANNEL_FULL_MSG}`, `toast:${CHANNEL_FULL_MSG}`]);
    // 같은 안내도 누를 때마다 다시 띄운다
    await c.switchChannel(5, friendChannelFullMsg("나래"));
    expect(events.slice(2)).toEqual([`refused:5:false:${friendChannelFullMsg("나래")}`, `toast:${friendChannelFullMsg("나래")}`]);
    expect(ws.closedWith).toBeNull();
    c.stop();
  });

  it("여유 있는 채널: 옛 자리를 유예로 남기고(4000) 새 채널로", async () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks({ x: 300, y: 400 }));
    const ws = await onlineAt(c, 3);
    await c.switchChannel(2);
    expect(events).toEqual(["leave:2"]);
    expect(ws.closedWith).toBe(4000);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(2));
    expect(chOf(FakeWs.last)).toBe(2);
    FakeWs.last!.welcome(2);
    expect(c.channel).toBe(2);
    expect(c.mode).toBe("online");
    c.stop();
  });

  it("경합: 로비엔 자리가 있었는데 들어가는 순간 만석(4001) → 다른 채널·관람 모드가 아니라 온 채널·자리로 돌아온다", async () => {
    const pose = { x: 300, y: 400 };
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(pose));
    await onlineAt(c, 3);
    // 장면처럼: 떠날 때 처음 자리로, 돌아오면 떠나기 전 자리로
    const offScene = [
      bridge.on("channel:leave", () => Object.assign(pose, { x: 10, y: 20 })),
      bridge.on("channel:refused", ({ back }) => back && Object.assign(pose, { x: 300, y: 400 })),
    ];
    const msg = friendChannelFullMsg("나래");
    await c.switchChannel(4, msg);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(2));
    expect(chOf(FakeWs.all[1])).toBe(4);
    expect(FakeWs.all[1].url).toContain("x=10&y=20");
    lobbyCalls = 0;
    FakeWs.all[1].serverClose(CLOSE.CHANNEL_FULL);
    expect(events).toEqual(["leave:4", `refused:4:true:${msg}`, `toast:${msg}`]);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(3));
    const back = FakeWs.all[2];
    expect(chOf(back)).toBe(3);
    expect(back.url).toContain("x=300&y=400");
    expect(lobbyCalls).toBe(0); // 다른 채널을 찾지 않는다
    expect(c.mode).not.toBe("spectator");
    back.welcome(3);
    expect(c.channel).toBe(3);
    expect(c.mode).toBe("online");
    expect(joins).toEqual([3, 4, 3]);
    offScene.forEach((o) => o());
    c.stop();
  });

  it("처음 입장이 만석이면 예전처럼 로비를 보고 다른 채널로 (돌아갈 채널이 없다)", async () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 5 }, callbacks({ x: 300, y: 400 }));
    c.start();
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(1));
    expect(chOf(FakeWs.last)).toBe(5);
    FakeWs.last!.serverClose(CLOSE.CHANNEL_FULL);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(2));
    expect(lobbyCalls).toBe(1);
    expect(chOf(FakeWs.last)).toBe(3); // pickChannel: 여유 있는 열린 채널 중 사람이 가장 많은 곳
    FakeWs.last!.welcome(3);
    expect(events).toEqual(["toast:채널이 가득 차서 3채널로 들어왔어요"]);
    c.stop();
  });

  it("로비를 못 받으면 가 보고, 만석이면 온 채널로 돌아온다", async () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks({ x: 300, y: 400 }));
    await onlineAt(c, 3);
    vi.stubGlobal("fetch", vi.fn((url: string, init?: { body?: string }) => (url.endsWith("/lobby") ? Promise.reject(new Error("down")) : fakeFetch(url, init))));
    await c.switchChannel(5);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(2));
    FakeWs.all[1].serverClose(CLOSE.CHANNEL_FULL);
    await vi.waitFor(() => expect(FakeWs.all).toHaveLength(3));
    expect(chOf(FakeWs.all[2])).toBe(3);
    expect(events).toEqual(["leave:5", `refused:5:true:${CHANNEL_FULL_MSG}`, `toast:${CHANNEL_FULL_MSG}`]);
    c.stop();
  });
});

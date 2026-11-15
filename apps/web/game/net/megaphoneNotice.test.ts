import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEvent } from "@tomb/protocol";
import { RealtimeClient, type NetCallbacks } from "./RealtimeClient";

// 11/15 마을 공지 줄 (실시간 서버 /internal/say): 확성기 방송에 실린 system·replaces를 화면까지 그대로 넘긴다

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

function callbacks(heard: unknown[]): NetCallbacks {
  const nop = () => undefined;
  return {
    getPose: (out) => Object.assign(out, { x: 156, y: 758, state: 0, dir: 0 }),
    getFps: () => 60,
    onWelcome: nop,
    onJoin: nop,
    onLeave: nop,
    onSnapshot: nop,
    onSeat: nop,
    onSeatDenied: nop,
    onEmote: nop,
    onGraveEvent: nop,
    onReset: nop,
    onPeers: nop,
    onLook: nop,
    onFirework: nop,
    onAct: nop,
    onSay: nop,
    onMegaphone: (m) => heard.push(m),
  };
}

const joinRes = { mode: "channel", channel: 3, token: "t", wsUrl: "ws://rt/ch/3?t=t" };

describe("RealtimeClient 확성기 (11/15 마을 공지 줄)", () => {
  beforeEach(() => {
    FakeWs.last = null;
    vi.stubGlobal("WebSocket", FakeWs);
    vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => joinRes })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("사람 확성기는 그대로, 마을 공지는 system·replaces까지 넘긴다", async () => {
    const heard: unknown[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(heard));
    c.start();
    await vi.waitFor(() => expect(FakeWs.last).not.toBeNull());
    const ws = FakeWs.last!;
    ws.readyState = FakeWs.OPEN;
    ws.recv({ t: "welcome", sid: 1, channel: 3, cap: 40, peers: [], seats: {}, resumed: false, spots: true });
    ws.recv({ t: "megaphone", id: "m1", name: "누구", text: "전체 공지", scope: "all", ch: 2, at: 1 });
    ws.recv({ t: "megaphone", id: "urg-t1-a1", name: "공지", text: "끝 공지", scope: "all", ch: 0, at: 2, staff: true, system: true, replaces: "urg-t1-a0" });
    expect(heard).toEqual([
      { id: "m1", name: "누구", text: "전체 공지", scope: "all", ch: 2, at: 1 },
      { id: "urg-t1-a1", name: "공지", text: "끝 공지", scope: "all", ch: 0, at: 2, staff: true, system: true, replaces: "urg-t1-a0" },
    ]);
    c.stop();
  });
});

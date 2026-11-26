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
    onChat: (sid, text, _id, meta) => log.push(`${tag}:chat:${sid}:${text}${meta?.m ? `:${meta.m}:${meta.name}` : ""}`),
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

  it("11/16 다른 맵에서 온 채팅: 서버가 실은 이름·맵을 넘긴다 (화면에 없는 사람도 채팅창에)", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    ws.recv({ t: "chat", sid: 9, text: "모닥불 따뜻해요", id: "x.1", at: 1, name: "캠퍼", m: "camp" });
    ws.recv({ t: "chat", sid: 8, text: "마을 말", id: "x.2", at: 2, name: "주민" });
    expect(log.filter((l) => l.includes(":chat:"))).toEqual(["w:chat:9:모닥불 따뜻해요:camp:캠퍼", "w:chat:8:마을 말"]);
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

  it("11/26 곧바로 두 번 옮기면(캠핑장 → 마을 → 바닷가, 집에서 나와 그 집 맵으로) 두 번째는 서버 간격(1초)이 지난 뒤 보내고, 그동안 위치도 보내지 않는다", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c, "camp");
    vi.useFakeTimers();
    const maps = () => ws.sent.filter((d) => typeof d === "string" && d.includes('"t":"map"'));
    c.switchMap("village", 100, 200);
    expect(maps()).toHaveLength(1);
    ws.recv({ t: "mapped", m: "village", peers: [], seats: {} });
    c.switchMap("sea", 300, 400);
    expect(maps()).toHaveLength(1);
    expect(c.map).toBe("sea");
    const before = ws.sent.length;
    c.tick(performance.now() + 5_000);
    expect(ws.sent.length).toBe(before);
    vi.advanceTimersByTime(1_200);
    expect(maps()).toHaveLength(2);
    expect(maps()[1]).toContain('"m":"sea"');
    ws.recv({ t: "mapped", m: "sea", peers: [], seats: {} });
    expect(c.map).toBe("sea");
    // 1초가 지난 뒤의 요청은 바로 보낸다
    vi.advanceTimersByTime(1_200);
    c.switchMap("village", 100, 200);
    expect(maps()).toHaveLength(3);
    vi.useRealTimers();
    c.stop();
  });

  it("11/26 앞 요청(마을)의 답이 다음 요청(바닷가)을 들고 있는 동안 늦게 와도 되돌아가지 않는다", async () => {
    const log: string[] = [];
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c, "camp");
    vi.useFakeTimers();
    const maps = () => ws.sent.filter((d) => typeof d === "string" && d.includes('"t":"map"'));
    c.switchMap("village", 100, 200);
    c.switchMap("sea", 300, 400);
    expect(maps()).toHaveLength(1);
    ws.recv({ t: "mapped", m: "village", peers: [], seats: {} });
    expect(c.map).toBe("sea");
    expect(log.filter((l) => l.includes(":mapped:"))).toEqual([]);
    vi.advanceTimersByTime(1_200);
    expect(maps()).toHaveLength(2);
    ws.recv({ t: "mapped", m: "sea", peers: [], seats: {} });
    expect(c.map).toBe("sea");
    expect(log.filter((l) => l.includes(":mapped:"))).toEqual(["w:mapped:sea:"]);
    // 보낸 뒤의 거절(마을)은 그대로 따른다
    vi.advanceTimersByTime(1_200);
    c.switchMap("camp", 1, 2);
    ws.recv({ t: "mapped", m: "sea", peers: [], seats: {} });
    expect(c.map).toBe("sea");
    vi.useRealTimers();
    c.stop();
  });

  it("접속 전이면 보내지 않고 다음 접속을 그 맵으로", () => {
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks([], "w"));
    expect(c.switchMap("camp", 1, 2)).toBe(false);
    expect(c.map).toBe("camp");
  });
});

// 11/16 바닷가 버스도 캠핑장과 똑같은 길이에요: CampTrip(DEST 표)이 두 맵 모두 net.switchMap 하나로 옮겨요 (따로 만든 복사본 없음).
// 운영에서 사람이 많을 때만 보이던 "내리자마자 마을로 돌아옴"이 다시 나지 않게, 늦은 답·잃어버린 답·메인 스레드 멈춤을 두 맵 모두로 봐요.
describe("맵 옮기기 답이 늦어도 되돌아가지 않아요 (캠핑장·바닷가 같은 길)", () => {
  beforeEach(() => {
    FakeWs.last = null;
    vi.stubGlobal("WebSocket", FakeWs);
    vi.stubGlobal("document", { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...joinRes, seaOpen: true }) })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** away로 가는 길(village → away) 또는 돌아오는 길(away → village)을 시작해요. 돌아오는 길은 먼저 away에 가 있어요 */
  async function begin(away: "camp" | "sea", leg: "go" | "back") {
    const log: string[] = [];
    FakeWs.last = null;
    const c = new RealtimeClient({ name: "가람", color: "#e8d9b0", channel: 3 }, callbacks(log, "w"));
    const ws = await online(c);
    vi.useFakeTimers();
    if (leg === "back") {
      c.switchMap(away, 156, 758);
      ws.recv({ t: "mapped", m: away, peers: [], seats: {} });
      log.length = 0;
      // 버스 창밖 연출(8초) 뒤에 돌아와요 — 서버 맵 요청 간격(1초)은 이미 지났어요
      vi.advanceTimersByTime(8_000);
    }
    const from = leg === "go" ? "village" : away;
    const to = leg === "go" ? away : "village";
    c.switchMap(to, 156, 758);
    const reply = () => ws.recv({ t: "mapped", m: to, peers: [], seats: {} });
    const mapped = () => log.filter((l) => l.includes(":mapped:"));
    return { c, ws, from, to, reply, mapped };
  }

  for (const away of ["camp", "sea"] as const)
    for (const leg of ["go", "back"] as const) {
      const name = `${away} ${leg === "go" ? "마을 → " + away : away + " → 마을"}`;

      it(`${name}: 답이 5초·9초 늦게 와도 그 맵으로 (처음 맵으로 되돌리지 않아요)`, async () => {
        for (const late of [5000, 9000]) {
          const t = await begin(away, leg);
          vi.advanceTimersByTime(late);
          expect(t.c.map).toBe(t.to);
          t.reply();
          vi.advanceTimersByTime(20_000);
          expect(t.c.map).toBe(t.to);
          expect(t.mapped()).toEqual([`w:mapped:${t.to}:`]);
          t.c.stop();
          vi.useRealTimers();
        }
      });

      it(`${name}: 첫 답을 잃어버려도 다시 보낸 요청의 답으로 그 맵으로`, async () => {
        const t = await begin(away, leg);
        const maps = () => t.ws.sent.filter((d) => typeof d === "string" && d.includes('"t":"map"') && d.includes(`"m":"${t.to}"`)).length;
        vi.advanceTimersByTime(4100);
        expect(maps()).toBe(2);
        vi.advanceTimersByTime(3000);
        t.reply();
        vi.advanceTimersByTime(20_000);
        expect(maps()).toBe(2);
        expect(t.c.map).toBe(t.to);
        expect(t.mapped()).toEqual([`w:mapped:${t.to}:`]);
        t.c.stop();
      });

      it(`${name}: 떠나는 순간 메인 스레드가 10초 멈춰 타이머가 몰려 돌아도 되돌아가지 않아요`, async () => {
        const t = await begin(away, leg);
        // 멈춘 동안 답은 이미 도착해 큐에 있었지만 늦게 돈 타이머가 먼저 돌아요 → 다시 보낼 뿐 처음 맵으로 돌리지 않아요
        vi.advanceTimersByTime(10_000);
        expect(t.c.map).toBe(t.to);
        t.reply();
        vi.advanceTimersByTime(20_000);
        expect(t.c.map).toBe(t.to);
        expect(t.mapped()).toEqual([`w:mapped:${t.to}:`]);
        expect(t.mapped().some((l) => l.endsWith(`:${t.from}:`))).toBe(false);
        t.c.stop();
      });
    }
});

import {
  AVATAR_COLORS,
  CAMP_FISHING_SPOTS,
  CAMP_PIER,
  CAMP_RAFTS,
  DIR,
  RAFT_EJECT_GRACE_MS,
  STATE,
  campRaftExit,
  campRaftSpots,
  encodeEvent,
  encodeMove,
  type C2S,
  type Grant,
  type S2C,
  type StateId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket } from "./channel";
import { RaftBoard } from "./rafts";

// 11/27 좌대 입장권: 입장권 없이 좌대 마루에 못 올라간다 (실시간 서버가 판정), 끝나면 내려보낸다

type Conn = { id: string; out: (string | ArrayBuffer)[] };

function setup() {
  const saved: { rafts?: unknown } = {};
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: () => {},
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async (token) => JSON.parse(token) as Grant,
    claimNonce: () => true,
    channelNo: () => 1,
    raftsChanged: (snap) => void (saved.rafts = snap),
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
  const join = (id: string, o: { rf?: boolean; spawn?: { x: number; y: number }; raft?: { n: number; u: number }; now?: number } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: `${id}님`, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", camp: true, map: "camp", known: "camp", ...(o.rf !== false ? { rafts: true as const } : {}), ...(o.raft ? { raft: o.raft } : {}) };
    core.join(c, t, o.now ?? 1000);
    return c;
  };
  return { core, join, saved };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const outs = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "raftOut" }> => e.t === "raftOut");
const boards = (c: Conn) => events(c).filter((e): e is Extract<S2C, { t: "rafts" }> => e.t === "rafts");
const send = (m: C2S) => encodeEvent(m);
const move = (x: number, y: number, state: StateId = STATE.walk) => encodeMove({ x, y, state, dir: DIR.down, seq: 0 });
const grant = (v: string, n: number, until: number, ch = 1) => send({ t: "raft", grant: JSON.stringify({ kind: "raft", visitorId: v, ch, n, until, exp: 9e9 }) });
const R = (n: number) => CAMP_RAFTS.find((r) => r.n === n)!;
const deck = (n: number) => ({ x: R(n).x, y: R(n).y - 20 });

describe("11/27 좌대 입장권 (실시간 서버)", () => {
  it("입장권 없이 마루로 가면 내려보낸다 (1~3 판자 다리 가운데)", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: { x: R(2).x - 31 + 5, y: 284 } });
    core.message(a, move(deck(2).x, deck(2).y), 2000);
    const o = outs(a);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ t: "raftOut", n: 2, why: "ticket" });
    const p = core.peer(1)!;
    expect({ x: p.x, y: p.y }).toEqual({ x: o[0].x, y: o[0].y });
    expect(p.state).toBe(STATE.idle);
  });
  it("4~6은 사다리 밑 물속으로 (헤엄)", () => {
    const { core, join } = setup();
    const a = join("a", { spawn: { x: R(5).x, y: R(5).y + 9 } });
    core.message(a, move(R(5).x, R(5).y - 14), 2000);
    expect(outs(a)[0]).toMatchObject({ n: 5, x: R(5).x, y: R(5).y + 9, why: "ticket" });
    expect(core.peer(1)!.state).toBe(STATE.swim);
  });
  it("막기가 꺼진 토큰(옛 웹)은 막지 않는다 · 잔교·판자 다리는 늘 그대로", () => {
    const { core, join } = setup();
    const a = join("a", { rf: false, spawn: { x: 1100, y: CAMP_PIER.y } });
    core.message(a, move(deck(2).x, deck(2).y), 2000);
    expect(outs(a)).toHaveLength(0);
    const b = join("b", { spawn: { x: 1100, y: CAMP_PIER.y } });
    core.message(b, move(1110, CAMP_PIER.y), 2000);
    core.message(b, move(R(2).x - 26, 284), 2100);
    expect(outs(b)).toHaveLength(0);
  });
  it("증서를 받으면 그 좌대에 올라가 앉는다 · 남은 남의 좌대 자리에 못 앉는다", async () => {
    const { core, join, saved } = setup();
    const a = join("a", { spawn: { x: R(2).x - 26, y: 284 } });
    const b = join("b", { spawn: { x: R(2).x + 24, y: 284 } });
    // 증서 반영은 서버 시계(Date.now)로 끝났는지 본다
    const u = Date.now() + 7_200_000;
    core.message(a, grant("a", 2, u), 1500);
    await flush();
    expect(boards(b).at(-1)?.b).toEqual([{ n: 2, name: "a님", u }]);
    expect(saved.rafts).toEqual([[2, { v: "a", name: "a님", u }]]);
    core.message(a, move(deck(2).x, deck(2).y), 2000);
    expect(outs(a)).toHaveLength(0);
    const [s1] = campRaftSpots(2);
    const spot = CAMP_FISHING_SPOTS.find((f) => f.id === s1)!;
    core.message(a, move(spot.x, spot.y), 2100);
    core.message(a, send({ t: "sit", seatId: s1 }), 2200);
    expect(events(a).some((e) => e.t === "seat" && e.seatId === s1 && e.sid === 1)).toBe(true);
    // b는 다리에서 3번 좌대(아무도 안 산 좌대) 의자도 못 잡는다 (자리를 요청해도 seatDenied)
    const [s3] = campRaftSpots(3);
    b.out.length = 0;
    core.message(b, send({ t: "sit", seatId: s3 }), 2300);
    expect(events(b).some((e) => e.t === "seatDenied" && e.seatId === s3)).toBe(true);
    // 다른 채널 증서는 버린다
    core.message(b, grant("b", 3, Date.now() + 9_000_000, 2), 3500);
    await flush();
    expect(boards(b)).toHaveLength(0);
  });
  it("잔교 낚시 자리는 입장권 없이도 앉는다", () => {
    const { core, join } = setup();
    const pier = CAMP_FISHING_SPOTS.find((f) => Math.abs(f.y - CAMP_PIER.y) <= CAMP_PIER.w / 2)!;
    const a = join("a", { spawn: { x: pier.x, y: pier.y } });
    core.message(a, send({ t: "sit", seatId: pier.id }), 2000);
    expect(events(a).some((e) => e.t === "seat" && e.seatId === pier.id && e.sid === 1)).toBe(true);
  });
  it("팔리면 그 마루에 있던 다른 사람(막기 꺼진 옛 연결)은 내려간다", async () => {
    const { core, join } = setup();
    const old = join("old", { rf: false, spawn: deck(3) });
    const a = join("a", { spawn: { x: 1150, y: CAMP_PIER.y } });
    core.message(a, grant("a", 3, Date.now() + 9_000_000), 2000);
    await flush();
    expect(outs(old)[0]).toMatchObject({ n: 3, why: "sold" });
  });
  it("끝나면 주인을 자리에서 일으켜 내려보내고, 표에서 지운다", async () => {
    const { core, join } = setup();
    const until = 1000 + 60_000;
    const a = join("a", { spawn: { x: R(5).x, y: R(5).y + 9 }, raft: { n: 5, u: until } });
    const b = join("b", { spawn: { x: 1100, y: CAMP_PIER.y } });
    expect(boards(a)[0].b).toEqual([{ n: 5, name: "a님", u: until }]);
    const s = CAMP_FISHING_SPOTS.find((f) => f.id === campRaftSpots(5)[0])!;
    core.message(a, move(s.x, s.y), 2000);
    core.message(a, send({ t: "sit", seatId: s.id }), 2100);
    expect(core.peer(1)!.seatId).toBe(s.id);
    expect(core.raftDue()).toBe(until + RAFT_EJECT_GRACE_MS);
    core.raftCheck(until + 1000); // 여유 안: 아직
    expect(outs(a)).toHaveLength(0);
    core.raftCheck(until + RAFT_EJECT_GRACE_MS);
    expect(outs(a)[0]).toMatchObject({ n: 5, why: "end", ...campRaftExit(5) && { x: R(5).x, y: R(5).y + 9 } });
    expect(core.peer(1)!.seatId).toBeNull();
    expect(core.peer(1)!.state).toBe(STATE.swim);
    expect(boards(b).at(-1)?.b).toEqual([]);
    expect(core.raftDue()).toBeNull();
  });
  it("입장 자리가 남의 좌대 마루면 내려보낸다", () => {
    const { core, join } = setup();
    join("a", { spawn: { x: 1150, y: CAMP_PIER.y }, raft: { n: 1, u: 9_000_000 } });
    const b = join("b", { spawn: deck(1) });
    expect(outs(b)[0]).toMatchObject({ n: 1, why: "ticket" });
    // 주인은 그대로
    const c = join("a2", { spawn: deck(4), raft: { n: 4, u: 9_000_000 } });
    expect(outs(c)).toHaveLength(0);
    expect(core.peer(3)).toBeTruthy();
  });
});

describe("좌대 주인 표 (RaftBoard)", () => {
  it("한 사람 한 장 · 끝난 것 지움 · 저장·복원", () => {
    const b = new RaftBoard();
    expect(b.set("v", "달", 1, 100)).toBe(true);
    expect(b.set("v", "달", 1, 100)).toBe(false);
    expect(b.set("v", "달", 2, 200)).toBe(true);
    expect(b.list(0)).toEqual([{ n: 2, name: "달", u: 200 }]);
    expect(b.holds("v", 2, 200 + RAFT_EJECT_GRACE_MS - 1)).toBe(true);
    expect(b.holds("v", 2, 200 + RAFT_EJECT_GRACE_MS)).toBe(false);
    const c = new RaftBoard();
    c.restore(b.snapshot());
    expect(c.list(0)).toEqual(b.list(0));
    expect(c.expire(200 + RAFT_EJECT_GRACE_MS)).toEqual([{ n: 2, v: "v" }]);
    expect(c.size).toBe(0);
    c.restore([[9, { v: "x", name: "x", u: 1 }], "bad"]);
    expect(c.size).toBe(0);
  });
});

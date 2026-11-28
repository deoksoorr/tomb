import {
  AVATAR_COLORS,
  CAMP_RAFTS,
  CONN_LOG_BATCH,
  CONN_LOG_BODY_MAX,
  DIR,
  RIDE_TOGGLE_MS,
  SEA_KAYAKS,
  STATE,
  encodeEvent,
  encodeMove,
  parseConnWire,
  type C2S,
  type ConnActExtra,
  type ConnLogWire,
  type Grant,
  type StateId,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket } from "./channel";
import { ConnLogBuffer, foldRide, takeBatch } from "./connLog";
import { ACT_CAP, ActLog, RAFT_OUT_REPEAT_MS, rideChange, rideOf } from "./rideLog";

// 11/28 접속 기록 "r" 줄: 탈것 타고 내림 · 좌대에서 내려보냄 (실시간 서버 안에서만 일어나는 동작)

type Act = [string, "r", number, number, string, "", ConnActExtra];
const act = (v: string, at: number, x: ConnActExtra, ch = 1): Act => [v, "r", at, ch, "pc", "", x];

describe("탈것 알아보기", () => {
  it("좌석 id → 탈것·번호·2인승 자리 (탈것이 아니면 null)", () => {
    expect(rideOf("sea", "pU3")).toEqual({ g: "tube", n: 3 });
    expect(rideOf("sea", "pJ2")).toEqual({ g: "jetski", n: 2 });
    expect(rideOf("sea", "pK2-1")).toEqual({ g: "kayak", n: 2, k: 1 });
    expect(rideOf("camp", "qN1-0")).toEqual({ g: "rowboat", n: 1, k: 0 });
    expect(rideOf("camp", "qZ")).toBeNull(); // 미끄럼틀은 탈것이 아니다
    expect(rideOf("village", "b_1206_850")).toEqual({ g: "boat", n: 1 }); // 1인 조각배
    expect(rideOf("village", "b_1250_884")).toMatchObject({ g: "boat", n: 3, k: 0 });
    expect(rideOf("village", "b_418_826")).toMatchObject({ g: "duck", n: 1, k: 0 });
    expect(rideOf("sea", "pK1")).toBeNull();
    expect(rideOf("camp", "pK1-0")).toBeNull(); // 다른 맵 id
    expect(rideOf("sea", null)).toBeNull();
  });

  it("같은 탈것 안에서 자리만 옮기면 기록 없음, 다른 탈것으로 옮기면 내림 + 탐", () => {
    expect(rideChange("sea", "pK1-0", "pK1-1")).toEqual({ off: null, on: null });
    expect(rideChange("sea", "pK1-0", "pK2-0")).toEqual({ off: { g: "kayak", n: 1, k: 0 }, on: { g: "kayak", n: 2, k: 0 } });
    expect(rideChange("sea", null, "pU1")).toEqual({ off: null, on: { g: "tube", n: 1 } });
    expect(rideChange("sea", "pU1", "someBench")).toEqual({ off: { g: "tube", n: 1 }, on: null });
  });
});

describe("ActLog (채널 DO)", () => {
  it("탄 시간을 재고, 바로 다시 타면 처음 탄 때부터", () => {
    const l = new ActLog();
    const k = { g: "kayak" as const, n: 2, k: 1 as const };
    expect(l.board("a", "sea", k, 10_000)).toEqual({ g: "kayak", m: "sea", on: 1, n: 2, k: 1 });
    expect(l.leave("a", "sea", k, 70_000)).toEqual({ g: "kayak", m: "sea", n: 2, d: 60 });
    l.board("a", "sea", k, 70_000 + RIDE_TOGGLE_MS);
    expect(l.leave("a", "sea", k, 130_000, "quit")).toEqual({ g: "kayak", m: "sea", n: 2, d: 120, w: "quit" });
    // 늦게 다시 타면 새로 센다
    l.board("a", "sea", k, 200_000);
    expect(l.leave("a", "sea", k, 205_000)?.d).toBe(5);
    // 탄 줄을 모르면(DO가 잠들었다 깸) 탄 시간 없음
    expect(new ActLog().leave("a", "sea", k, 1)).toEqual({ g: "kayak", m: "sea", n: 2 });
  });

  it("한 사람 1분에 ACT_CAP.max줄, 넘은 수는 다음 줄의 s", () => {
    const l = new ActLog();
    const t = { g: "tube" as const, n: 1 };
    let ok = 0;
    for (let i = 0; i < ACT_CAP.max + 5; i++) if (l.board("a", "sea", t, 1_000 + i)) ok++;
    expect(ok).toBe(ACT_CAP.max);
    expect(l.board("b", "sea", t, 2_000)).not.toBeNull(); // 다른 사람은 따로
    expect(l.leave("a", "sea", t, 1_000 + ACT_CAP.windowMs)).toMatchObject({ s: 5 });
    expect(l.leave("a", "sea", t, 1_001 + ACT_CAP.windowMs)?.s).toBeUndefined();
  });

  it("좌대 같은 번호·까닭은 RAFT_OUT_REPEAT_MS에 한 번 (걸음마다 막혀도 한 줄)", () => {
    const l = new ActLog();
    expect(l.raftOut("a", 4, "ticket", 1_000)).toEqual({ g: "raft", n: 4, w: "ticket" });
    expect(l.raftOut("a", 4, "ticket", 1_500)).toBeNull();
    expect(l.raftOut("a", 4, "end", 1_600)).toEqual({ g: "raft", n: 4, w: "end" });
    expect(l.raftOut("a", 4, "ticket", 1_000 + RAFT_OUT_REPEAT_MS + 700)).not.toBeNull();
  });
});

describe("로비 버퍼: 바로 타고 내린 줄 접기", () => {
  const on = (at: number, n = 1): Act => act("a", at, { g: "kayak", m: "sea", on: 1, n, k: 0 });
  const off = (at: number, x: Partial<{ d: number; w: "quit" }> = {}, n = 1): Act => act("a", at, { g: "kayak", m: "sea", n, ...x });

  it(`탄 뒤 ${RIDE_TOGGLE_MS / 1000}초 안에 내리면 「탔다가 바로 내림」 한 줄 (시각 = 탄 때)`, () => {
    const b = new ConnLogBuffer();
    b.add(["a", "i", 900, 1, "pc", ""], 900);
    b.add(on(1_000), 1_000);
    b.add(["x", "i", 1_500, 1, "pc", ""], 1_500); // 다른 사람 줄이 끼어도
    b.add(off(3_000, { d: 2 }), 3_000);
    const rows = b.snapshot();
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(act("a", 1_000, { g: "kayak", m: "sea", n: 1, k: 0, b: 1, d: 2 }));
    expect(parseConnWire(rows[1])).toEqual(rows[1]);
  });

  it("오래 타고 내리면 두 줄, 다른 탈것·다른 채널이면 접지 않는다", () => {
    const rows: ConnLogWire[] = [on(1_000)];
    expect(foldRide(rows, off(1_000 + RIDE_TOGGLE_MS + 1, { d: 3 }))).toBe(false);
    expect(foldRide([on(1_000)], off(1_500, {}, 2))).toBe(false);
    expect(foldRide([act("a", 1_000, { g: "kayak", m: "sea", on: 1, n: 1 }, 2)], off(1_500))).toBe(false);
    expect(foldRide([act("a", 1_000, { g: "raft", n: 1, w: "end" })], off(1_500))).toBe(false);
  });

  it("내리고 바로 다시 타면 내림 줄을 지운다 (계속 탄 것), 접은 줄은 다시 탄 줄로", () => {
    const rows: ConnLogWire[] = [on(1_000), off(60_000, { d: 59 })];
    expect(foldRide(rows, on(61_000))).toBe(true);
    expect(rows).toEqual([on(1_000)]);
    const quick: ConnLogWire[] = [on(1_000)];
    expect(foldRide(quick, off(2_000, { d: 1 }))).toBe(true);
    expect(foldRide(quick, on(3_500))).toBe(true);
    expect(quick).toEqual([act("a", 1_000, { g: "kayak", m: "sea", on: 1, n: 1, k: 0 })]);
    // 늦게 다시 타면 새 줄
    expect(foldRide([on(1_000), off(60_000)], on(60_000 + RIDE_TOGGLE_MS + 1))).toBe(false);
  });

  it("「r」 줄은 다른 줄과 한 묶음에 섞지 않는다 (옛 웹이 모르는 줄이 섞인 묶음을 통째로 버려도 들어옴·나감은 남게)", () => {
    const b = new ConnLogBuffer();
    b.add(["a", "i", 1, 1, "pc", ""], 1);
    b.add(on(2), 2);
    b.add(["b", "o", 3, 1, "pc", "normal"], 3);
    b.add(act("c", 4, { g: "raft", n: 4, w: "end" }), 4);
    b.add(["c", "m", 5, 1, "pc", "", { f: "camp", t: "village", c: "mapReq" }], 5);
    const first = b.take(10);
    expect(first.map((r) => r[1])).toEqual(["i", "o", "m"]);
    const second = b.take(11);
    expect(second.map((r) => r[1])).toEqual(["r", "r"]);
    expect(b.size).toBe(0);
  });

  it("한 묶음은 CONN_LOG_BATCH줄·CONN_LOG_BODY_MAX자 안 (긴 줄이 많아도 서명 본문 8,000자를 넘지 않게)", () => {
    const long = (i: number): ConnLogWire => [`v${String(i).padStart(20, "0")}`, "t", 1_764_300_000_000 + i, 123, "phone·카카오톡", "", { m: "village", a: "village", tab: "abcdefghijkl", pt: "abcdefghijkl", pc: 123, live: 1 }];
    const rows = Array.from({ length: CONN_LOG_BATCH }, (_, i) => long(i));
    const { out, rest } = takeBatch(rows);
    expect(out.length).toBeLessThan(CONN_LOG_BATCH);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(CONN_LOG_BODY_MAX);
    expect([...out, ...rest]).toEqual(rows); // 순서 그대로, 남은 것은 다음 묶음
    expect(takeBatch([]).out).toEqual([]);
  });
});

// ── 채널에서 실제로 부르는지 ──

type Conn = { id: string; out: (string | ArrayBuffer)[] };
const send = (m: C2S) => encodeEvent(m);
const move = (x: number, y: number, state: StateId = STATE.walk) => encodeMove({ x, y, state, dir: DIR.down, seq: 0 });

function setup() {
  const acts: { v: string; x: ConnActExtra }[] = [];
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
    actLogged: (v, x) => void acts.push({ v, x }),
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
  const join = (id: string, t: Partial<JoinTicket>) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", ...t }, 1000);
    return c;
  };
  return { core, join, acts };
}

describe("채널: 탈것·좌대 기록 줄", () => {
  it("카약 타고(앞→뒤 자리 바꾸기는 없음) 일어나면 내림, 맵을 옮기면 까닭 map", () => {
    const { core, join, acts } = setup();
    const k = SEA_KAYAKS[0];
    const a = join("a", { sea: true, map: "sea", known: "sea", spawn: { x: k.x, y: k.y - 26 } });
    core.message(a, send({ t: "sit", seatId: "pK1-0" }), 2000);
    core.message(a, send({ t: "sit", seatId: "pK1-1" }), 2100);
    core.message(a, send({ t: "stand" }), 2200);
    expect(acts.map((r) => r.x)).toEqual([
      { g: "kayak", m: "sea", on: 1, n: 1, k: 0 },
      expect.objectContaining({ g: "kayak", m: "sea", n: 1 }),
    ]);
    expect(acts[1].x).not.toHaveProperty("on");
    core.message(a, send({ t: "sit", seatId: "pK1-0" }), 2300);
    core.message(a, send({ t: "map", m: "village", x: 1000, y: 700 }), 99_000);
    expect(acts.at(-1)).toMatchObject({ v: "a", x: { g: "kayak", w: "map" } });
  });

  it("좌대에서 내려보내면 한 줄 (걸음마다 막혀도 한 줄)", () => {
    const { core, join, acts } = setup();
    const R = CAMP_RAFTS.find((r) => r.n === 2)!;
    const a = join("a", { camp: true, map: "camp", known: "camp", rafts: true, spawn: { x: R.x - 26, y: 284 } });
    core.message(a, move(R.x, R.y - 20), 2000);
    core.message(a, move(R.x, R.y - 20), 2500);
    expect(acts).toEqual([{ v: "a", x: { g: "raft", n: 2, w: "ticket" } }]);
  });
});

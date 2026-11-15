import { AVATAR_COLORS, BUMPER_GATE, BUMPER_RIM, BUMPER_RINK, BUMPER_SEATS, DIR, STATE, decodeSnapshot, encodeEvent, encodeMove, type C2S, type DirId, type Grant, type S2C, type StateId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 11/16 범퍼카장: 차 자리는 정해진 1인 자리(SPOT_KINDS.bumper, 움직이는 자리 — 조각배처럼 서버가 보고 위치를 따라간다).
// 서버 물리는 없다 — 부딪힘은 저마다 클라이언트가 자기 차에만. 빵빵은 act "honk"로 같은 채널에 중계한다

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup(capacity = 12) {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void c.out.push(d),
    close: () => {},
    persist: (c, rec) => void (c.att = rec),
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async (token) => JSON.parse(token) as Grant,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity, graceMs: 20_000, room: false }, host);
  const join = (id: string, spawn: { x: number; y: number }, now = 0) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, spawn, look: [], body: "hood" }, now);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) =>
  c.out
    .filter((d): d is string => typeof d === "string")
    .map((d) => JSON.parse(d) as S2C)
    .filter((e) => e.t !== "count");
const snapshots = (c: Conn) => c.out.filter((d): d is ArrayBuffer => typeof d !== "string").map((d) => decodeSnapshot(d)!);
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (msg: C2S) => encodeEvent(msg);
const move = (x: number, y: number, state: StateId = STATE.walk, dir: DirId = DIR.down) => encodeMove({ x, y, state, dir, seq: 0 });
const DOOR = { x: BUMPER_GATE.x, y: BUMPER_GATE.y - 8 };

describe("범퍼카 자리 (11/16)", () => {
  it("입구에서 탄다: 차 한 대에 한 명, 먼저 온 사람만. 모두에게 알린다", () => {
    const { core, join } = setup();
    const a = join("a", DOOR);
    const b = join("b", { x: DOOR.x + 4, y: DOOR.y });
    const car = BUMPER_SEATS[0]; // 입구에서 가장 먼 왼쪽 끝 차
    core.message(a, send({ t: "sit", seatId: car.id }), 0);
    core.message(b, send({ t: "sit", seatId: car.id }), 0);
    expect(events(b)).toContainEqual({ t: "seatDenied", seatId: car.id });
    expect(events(b)).toContainEqual({ t: "seat", seatId: car.id, sid: 1 });
    expect(core.peer(1)).toMatchObject({ seatId: car.id, state: STATE.bumper, x: car.x, y: car.y });
    // b는 다른 차에
    core.message(b, send({ t: "sit", seatId: BUMPER_SEATS[7].id }), 0);
    expect(core.peer(2)).toMatchObject({ seatId: BUMPER_SEATS[7].id, state: STATE.bumper });
    // 한 사람이 두 대를 차지하지 않는다: a가 다른 차로 옮기면 처음 차가 풀린다
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[3].id }), 100);
    expect(core.peer(1)?.seatId).toBe(BUMPER_SEATS[3].id);
    expect(events(b)).toContainEqual({ t: "seat", seatId: car.id, sid: null });
  });

  it("8대가 다 차면 9번째 사람은 거절된다 (채널마다 8대)", () => {
    const { core, join } = setup();
    const cs = Array.from({ length: 9 }, (_, i) => join(`p${i}`, { x: DOOR.x - 8 + (i % 4) * 4, y: DOOR.y }));
    BUMPER_SEATS.forEach((s, i) => core.message(cs[i], send({ t: "sit", seatId: s.id }), 0));
    for (let i = 0; i < 8; i++) expect(core.peer(i + 1)?.seatId).toBe(BUMPER_SEATS[i].id);
    for (const s of BUMPER_SEATS) core.message(cs[8], send({ t: "sit", seatId: s.id }), 10);
    expect(events(cs[8]).filter((e) => e.t === "seatDenied")).toHaveLength(8);
    expect(core.peer(9)?.seatId).toBe(null);
  });

  it("움직이는 자리: 서버는 차를 앵커에 묶지 않고 보고 위치를 따라가며, 같은 맵 사람들에게 스냅샷으로 보낸다", () => {
    const { core, join } = setup();
    const a = join("a", DOOR);
    const b = join("b", { x: 720, y: 790 });
    const car = BUMPER_SEATS[4];
    core.message(a, send({ t: "sit", seatId: car.id }), 0);
    clear(a, b);
    core.message(a, move(car.x - 30, car.y + 40, STATE.bumper, DIR.left), 1_000);
    core.tick(1_050);
    expect(core.peer(1)).toMatchObject({ seatId: car.id, state: STATE.bumper, x: car.x - 30, y: car.y + 40, dir: DIR.left });
    expect(snapshots(b)[0].entries).toContainEqual({ sid: 1, x: car.x - 30, y: car.y + 40, state: STATE.bumper, dir: DIR.left });
    // 내리면(입구 앞으로 걷기) 자리가 풀린다
    core.message(a, send({ t: "stand" }), 1_500);
    expect(events(b)).toContainEqual({ t: "seat", seatId: car.id, sid: null });
    expect(core.peer(1)?.seatId).toBe(null);
  });

  it("정해진 차 자리만 (아무 좌표의 차는 없다), 입구에서 멀면 못 탄다, 차 없이 범퍼카 자세로 걸으면 서 있는 것으로 본다", () => {
    const { core, join } = setup();
    const far = join("far", { x: 300, y: 600 });
    core.message(far, send({ t: "sit", seatId: BUMPER_SEATS[0].id }), 0);
    core.message(far, send({ t: "sit", seatId: "v_720_900" }), 0);
    expect(events(far).filter((e) => e.t === "seatDenied")).toEqual([
      { t: "seatDenied", seatId: BUMPER_SEATS[0].id },
      { t: "seatDenied", seatId: "v_720_900" },
    ]);
    core.message(far, move(720, 900, STATE.bumper), 1_000);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle });
  });

  it("빵빵(act honk)은 같은 채널 모두에게 (2초에 한 번)", () => {
    const { core, join } = setup();
    const a = join("a", DOOR);
    const b = join("b", { x: 720, y: 790 });
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[2].id }), 0);
    clear(a, b);
    core.message(a, send({ t: "act", kind: "honk" }), 3_000);
    core.message(a, send({ t: "act", kind: "honk" }), 3_500);
    const acts = events(b).filter((e) => e.t === "act");
    expect(acts).toEqual([{ t: "act", sid: 1, kind: "honk", x: BUMPER_SEATS[2].x, y: BUMPER_SEATS[2].y }]);
  });

  it("새로 온 사람은 입장 때 차 점유표를 받는다 (차 색 = 자리)", () => {
    const { core, join } = setup();
    const a = join("a", DOOR);
    core.message(a, send({ t: "sit", seatId: BUMPER_SEATS[5].id }), 0);
    const c = join("c", { x: 720, y: 790 }, 100);
    expect(welcome(c).seats).toEqual({ [BUMPER_SEATS[5].id]: 1 });
  });

  it("벽 어디서든 내린다: 차를 아래·왼쪽 벽에 붙이고 stand → 벽 바로 바깥으로 걸으면 서버도 그 자리를 받는다 (입구 앞이 아니어도)", () => {
    const { core, join } = setup();
    const a = join("a", DOOR);
    const b = join("b", { x: 720, y: 790 });
    const R = BUMPER_RINK;
    const car = BUMPER_SEATS[1];
    core.message(a, send({ t: "sit", seatId: car.id }), 0);
    // 아래 벽에 닿은 차 (링크 안쪽 아래 끝)
    core.message(a, move(700, R.y + R.h - BUMPER_RIM - 8, STATE.bumper, DIR.down), 1_000);
    core.tick(1_050);
    clear(a, b);
    core.message(a, send({ t: "stand" }), 1_100);
    expect(events(b)).toContainEqual({ t: "seat", seatId: car.id, sid: null });
    core.message(a, move(700, R.y + R.h + 10, STATE.idle, DIR.down), 1_120);
    for (let t = 1_150; t < 2_000; t += 50) core.tick(t);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle, x: 700, y: R.y + R.h + 10 });
    // 다시 타고 왼쪽 벽에서 내려도 같다 (stand 없이 걷기 MOVE만 와도 자리가 풀린다)
    core.message(a, move(DOOR.x, DOOR.y, STATE.idle), 2_000);
    for (let t = 2_050; t < 4_000; t += 50) core.tick(t);
    core.message(a, send({ t: "sit", seatId: car.id }), 4_000);
    core.message(a, move(R.x + BUMPER_RIM + 8, 920, STATE.bumper, DIR.left), 5_000);
    for (let t = 5_050; t < 7_000; t += 50) core.tick(t);
    core.message(a, move(R.x - 10, 920, STATE.idle, DIR.left), 7_000);
    for (let t = 7_050; t < 8_000; t += 50) core.tick(t);
    expect(core.peer(1)).toMatchObject({ seatId: null, state: STATE.idle, x: R.x - 10, y: 920 });
  });
});

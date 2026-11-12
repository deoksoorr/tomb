import { AVATAR_COLORS, BOAT_SEATS, DIR, FERRY_DOCK, STATE, encodeEvent, encodeMove, seatById, type C2S, type Grant, type S2C, type StateId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 동물원 타는 펫 (ride): 착용 펫이 타는 펫일 때만 올라타고, 자리·물·펫 바꾸기에 내린다. 늦게 온 사람은 입장 정보로 본다

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup(room = false) {
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
  const core = new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room }, host);
  const join = (id: string, look: string[] = [], spawn?: { x: number; y: number }, now = 0) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: room ? 0 : 1, spawn, look, body: "hood" }, now);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const rides = (c: Conn) => events(c).filter((e) => e.t === "ride");
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (msg: C2S) => encodeEvent(msg);
const move = (x: number, y: number, state: StateId = STATE.walk) => encodeMove({ x, y, state, dir: DIR.down, seq: 0 });
const bA0 = seatById("bA-0")!;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("타는 펫 (ride)", () => {
  it("타는 펫을 데리고 있을 때만 올라타고, 모두(보낸 사람 포함)에게 알리고, 늦게 온 사람은 입장 정보로 본다", () => {
    const { core, join } = setup();
    const a = join("a", ["pet_deer", "hat_crown"]);
    const b = join("b", ["pet_cat"]);
    clear(a, b);
    core.message(a, send({ t: "ride", on: true }), 0);
    expect(rides(a)).toEqual([{ t: "ride", sid: 1, on: true }]);
    expect(rides(b)).toEqual([{ t: "ride", sid: 1, on: true }]);
    expect(core.peer(1)?.ride).toBe(true);
    // 타지 못하는 펫은 무시
    core.message(b, send({ t: "ride", on: true }), 0);
    expect(core.peer(2)?.ride).toBeUndefined();
    const c = join("c", [], undefined, 100);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.ride).toBe(true);
    expect(welcome(c).peers.find((p) => p.sid === 2)?.ride).toBeUndefined();
    // 이미 타고 있는데 다시 오면 (재접속·다시 보낸 요청) 보낸 사람에게만 확인을 다시 준다
    clear(a, b);
    core.message(a, send({ t: "ride", on: true }), 500);
    expect(rides(a)).toEqual([{ t: "ride", sid: 1, on: true }]);
    expect(rides(b)).toEqual([]);
    // 내리기 (간격 지나서)
    clear(a, b);
    core.message(a, send({ t: "ride", on: false }), 1_000);
    expect(rides(b)).toEqual([{ t: "ride", sid: 1, on: false }]);
    expect(core.peer(1)?.ride).toBeUndefined();
  });

  it("자리에 앉으면(의자·놀이기구·배·낚시 모두 같은 좌석 체계) 자동으로 내린다", () => {
    const { core, join } = setup();
    const a = join("a", ["pet_hound"], { x: bA0.x + 4, y: bA0.y + 4 });
    const b = join("b");
    core.message(a, send({ t: "ride", on: true }), 0);
    clear(a, b);
    core.message(a, send({ t: "sit", seatId: "bA-0" }), 500);
    expect(rides(b)).toEqual([{ t: "ride", sid: 1, on: false }]);
    expect(core.peer(1)?.ride).toBeUndefined();
    // 앉아 있는 동안은 올라탈 수 없다
    core.message(a, send({ t: "ride", on: true }), 1_000);
    expect(core.peer(1)?.ride).toBeUndefined();
  });

  it("물에 들어가면(수영·잠수 MOVE) 내리고, 물속에서는 올라탈 수 없다", () => {
    const { core, join } = setup();
    const a = join("a", ["pet_goose"], { x: 300, y: 600 });
    const b = join("b");
    core.message(a, send({ t: "ride", on: true }), 0);
    clear(b);
    core.message(a, move(302, 602, STATE.swim), 100);
    expect(rides(b)).toEqual([{ t: "ride", sid: 1, on: false }]);
    core.message(a, send({ t: "ride", on: true }), 1_000);
    expect(core.peer(1)?.ride).toBeUndefined();
  });

  it("타던 펫을 집에 두거나 바꾸면(look 증서) 내린다", async () => {
    const { core, join } = setup();
    const a = join("a", ["pet_deer"]);
    const b = join("b");
    core.message(a, send({ t: "ride", on: true }), 0);
    clear(b);
    core.message(a, send({ t: "look", grant: JSON.stringify({ kind: "look", visitorId: "a", look: ["pet_cat"], exp: 9e9 } satisfies Grant) }), 100);
    await flush();
    expect(rides(b)).toEqual([{ t: "ride", sid: 1, on: false }]);
    expect(core.peer(1)?.ride).toBeUndefined();
  });

  it("방(마을·집·사냥터)에서는 타지 않는다", () => {
    const { core, join } = setup(true);
    const a = join("a", ["pet_deer"], { x: 100, y: 100 });
    core.message(a, send({ t: "ride", on: true }), 0);
    expect(core.peer(1)?.ride).toBeUndefined();
  });

  it("재시작 복원 기록(attachment)에도 남고, 앉아 있는 기록이면 버린다", () => {
    const { core, join } = setup();
    const a = join("a", ["pet_deer"]);
    core.message(a, send({ t: "ride", on: true }), 0);
    expect(a.att?.ride).toBe(true);
    expect(core.liveRecords().find((r) => r.sid === 1)?.ride).toBe(true);
  });
});

describe("배 위 낚싯대 (rod)", () => {
  const A = BOAT_SEATS.find((b) => b.boatId === "boatA")!;
  const rods = (c: Conn) => events(c).filter((e) => e.t === "rod");

  it("조각배 자리에 앉아 있을 때만 켜고, 모두에게 알리고, 늦게 온 사람은 입장 정보로 본다. 배에서 내리면 꺼진다", () => {
    const { core, join } = setup();
    const a = join("a", [], { x: FERRY_DOCK.x, y: FERRY_DOCK.y });
    const b = join("b");
    // 배에 타지 않았으면 무시
    core.message(a, send({ t: "rod", on: true }), 0);
    expect(core.peer(1)?.rod).toBeUndefined();
    core.message(a, send({ t: "sit", seatId: A.id }), 0);
    clear(a, b);
    core.message(a, send({ t: "rod", on: true }), 1_000);
    expect(rods(a)).toEqual([{ t: "rod", sid: 1, on: true }]);
    expect(rods(b)).toEqual([{ t: "rod", sid: 1, on: true }]);
    const c = join("c", [], undefined, 1_100);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.rod).toBe(true);
    // 배에서 내리면 (자리를 놓는 MOVE) 낚싯대도 거둔다
    clear(a, b);
    core.message(a, move(FERRY_DOCK.x, FERRY_DOCK.y, STATE.idle), 2_000);
    expect(core.peer(1)?.seatId).toBeNull();
    expect(core.peer(1)?.rod).toBeUndefined();
    expect(rods(b)).toEqual([{ t: "rod", sid: 1, on: false }]);
  });

  it("거두기(off)는 언제나 받고, 방(집·사냥터)에서는 켜지 않는다", () => {
    const { core, join } = setup();
    const a = join("a", [], { x: FERRY_DOCK.x, y: FERRY_DOCK.y });
    core.message(a, send({ t: "sit", seatId: A.id }), 0);
    core.message(a, send({ t: "rod", on: true }), 1_000);
    core.message(a, send({ t: "rod", on: false }), 2_000);
    expect(core.peer(1)?.rod).toBeUndefined();
    const room = setup(true);
    const r = room.join("r");
    room.core.message(r, send({ t: "rod", on: true }), 0);
    expect(room.core.peer(1)?.rod).toBeUndefined();
  });
});

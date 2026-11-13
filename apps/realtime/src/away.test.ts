import { AVATAR_COLORS, encodeEvent, type C2S, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 실내(상점·집·사냥터 등 하위 장면) 표시 (away): 다른 사람 화면에서 문 앞에 서 있지 않게 숨긴다.
// 늦게 온 사람은 입장 정보로 받고, 재접속 유예 동안 이어 가며, 방(집 안 등)에서는 받지 않는다

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
    verifyGrant: async () => null,
    claimNonce: () => true,
  };
  const core = new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, room }, host);
  const join = (id: string, now = 0) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: room ? 0 : 1, look: [], body: "hood" }, now);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const aways = (c: Conn) => events(c).filter((e) => e.t === "away");
const welcome = (c: Conn) => events(c).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (msg: C2S) => encodeEvent(msg);

describe("실내 표시 (away)", () => {
  it("들어가면 다른 사람에게만 알리고, 늦게 온 사람은 입장 정보로 본다. 나오면 풀린다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "away", on: true }), 0);
    expect(aways(a)).toEqual([]);
    expect(aways(b)).toEqual([{ t: "away", sid: 1, on: true }]);
    expect(core.peer(1)?.away).toBe(true);
    expect(a.att?.away).toBe(true); // hibernation에서 깨어나도 이어 간다
    const c = join("c", 100);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.away).toBe(true);
    expect(welcome(c).peers.find((p) => p.sid === 2)?.away).toBeUndefined();
    // 같은 값을 다시 보내면 조용히 무시
    clear(a, b);
    core.message(a, send({ t: "away", on: true }), 1_000);
    expect(aways(b)).toEqual([]);
    core.message(a, send({ t: "away", on: false }), 2_000);
    expect(aways(b)).toEqual([{ t: "away", sid: 1, on: false }]);
    expect(core.peer(1)?.away).toBeUndefined();
  });

  it("짧은 간격으로 연달아 오면 뒤엣것은 버린다 (도배 제한)", () => {
    const { core, join } = setup();
    const a = join("a");
    core.message(a, send({ t: "away", on: true }), 0);
    core.message(a, send({ t: "away", on: false }), 10);
    expect(core.peer(1)?.away).toBe(true);
  });

  it("재접속 유예 동안 이어 가고, 다시 붙은 클라이언트가 나왔다고 알리면 풀린다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    core.message(a, send({ t: "away", on: true }), 0);
    core.disconnect(a, 1006, 1_000);
    expect(core.peer(1)?.away).toBe(true);
    const a2 = join("a", 2_000);
    expect(welcome(a2)).toMatchObject({ sid: 1, resumed: true });
    clear(b);
    core.message(a2, send({ t: "away", on: false }), 2_100);
    expect(aways(b)).toEqual([{ t: "away", sid: 1, on: false }]);
  });

  it("방(집 안 등)에서는 받지 않는다", () => {
    const { core, join } = setup(true);
    const a = join("a");
    core.message(a, send({ t: "away", on: true }), 0);
    expect(core.peer(1)?.away).toBeUndefined();
  });

  it("친구 위치: 어느 실내인지 기억하고(장소만 바뀌면 알리지 않는다) 접속자 목록(roster)에 싣는다", () => {
    const { core, join } = setup();
    const a = join("a");
    const b = join("b");
    expect(core.roster()).toEqual([
      expect.objectContaining({ visitorId: "a", sid: 1 }),
      expect.objectContaining({ visitorId: "b", sid: 2 }),
    ]);
    expect(core.roster()[0].away).toBeUndefined();
    clear(a, b);
    core.message(a, send({ t: "away", on: true, p: "village" }), 0);
    expect(core.roster()[0]).toMatchObject({ visitorId: "a", away: true, place: "village" });
    expect(a.att?.place).toBe("village");
    // 분양 마을 → 집: 다른 사람에게는 다시 알리지 않는다
    core.message(a, send({ t: "away", on: true, p: "house" }), 1_000);
    expect(aways(b)).toEqual([{ t: "away", sid: 1, on: true }]);
    expect(core.roster()[0].place).toBe("house");
    // 다른 사람 화면(입장 정보)에는 장소를 보내지 않는다
    const c = join("c", 1_100);
    expect(JSON.stringify(welcome(c))).not.toContain("house");
    // 나오면 장소도 지운다
    core.message(a, send({ t: "away", on: false }), 2_000);
    expect(core.roster()[0].place).toBeUndefined();
    expect(core.roster()[0].away).toBeUndefined();
  });
});

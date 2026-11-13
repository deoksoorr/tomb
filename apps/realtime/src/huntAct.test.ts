import { AVATAR_COLORS, HUNT_ACT_INTERVAL_MS, encodeEvent, type C2S, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type PeerRecord } from "./channel";

// 11/13 함께 사냥: 같은 사냥터 방 사람에게 공격·스킬 동작(hunt)과 자리 비움(away)을 중계한다.
// 판정·몬스터는 각자 → 서버는 그림용 신호만 넘기고 저장하지 않는다. 마을·집 방과 월드 채널은 받지 않는다

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup(cfg: { room?: boolean; hunt?: boolean }) {
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
  const core = new ChannelCore<Conn>({ capacity: 5, graceMs: 20_000, ...cfg }, host);
  const join = (id: string, now = 0) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: cfg.room ? 0 : 1, look: [], body: "hood" }, now);
    return c;
  };
  return { core, join };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const of = <T extends S2C["t"]>(c: Conn, t: T) => events(c).filter((e): e is Extract<S2C, { t: T }> => e.t === t);
const welcome = (c: Conn) => of(c, "welcome")[0];
const clear = (...cs: Conn[]) => cs.forEach((c) => (c.out.length = 0));
const send = (msg: C2S) => encodeEvent(msg);

describe("함께 사냥: 공격·스킬 동작 (hunt)", () => {
  it("사냥터 방에서 보낸 사람 빼고 같은 방에만 중계한다 (간격 안의 연타는 버린다)", () => {
    const { core, join } = setup({ room: true, hunt: true });
    const a = join("a");
    const b = join("b");
    const c = join("c");
    clear(a, b, c);
    core.message(a, send({ t: "hunt", k: "atk", a: 90, w: "swing" }), 1_000);
    expect(of(b, "hunt")).toEqual([{ t: "hunt", sid: 1, k: "atk", a: 90, w: "swing" }]);
    expect(of(c, "hunt")).toHaveLength(1);
    expect(of(a, "hunt")).toEqual([]);
    // 간격 안: 버린다 → 간격이 지나면 다시
    core.message(a, send({ t: "hunt", k: "skill", a: 0, s: "em_blast" }), 1_000 + HUNT_ACT_INTERVAL_MS - 1);
    expect(of(b, "hunt")).toHaveLength(1);
    core.message(a, send({ t: "hunt", k: "skill", a: 0, s: "em_blast", f: true }), 1_000 + HUNT_ACT_INTERVAL_MS);
    expect(of(b, "hunt")[1]).toEqual({ t: "hunt", sid: 1, k: "skill", a: 0, s: "em_blast", f: true });
  });

  it("혼자면 보내지 않고, 마을·집 방과 월드 채널은 받지 않는다", () => {
    const solo = setup({ room: true, hunt: true });
    const s = solo.join("s");
    clear(s);
    solo.core.message(s, send({ t: "hunt", k: "atk", a: 0 }), 0);
    expect(of(s, "hunt")).toEqual([]);

    for (const cfg of [{ room: true }, {}]) {
      const { core, join } = setup(cfg);
      const a = join("a");
      const b = join("b");
      clear(a, b);
      core.message(a, send({ t: "hunt", k: "atk", a: 0 }), 0);
      expect(of(b, "hunt")).toEqual([]);
    }
  });
});

describe("함께 사냥: 자리 비움 (away)", () => {
  it("사냥터 방: 다른 사람에게만 알리고, 늦게 온 사람은 입장 정보로 받으며, 저장(hibernation 복원)된다", () => {
    const { core, join } = setup({ room: true, hunt: true });
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "away", on: true }), 0);
    expect(of(b, "away")).toEqual([{ t: "away", sid: 1, on: true }]);
    expect(of(a, "away")).toEqual([]);
    expect(a.att?.away).toBe(true);
    // 같은 값은 다시 알리지 않는다
    core.message(a, send({ t: "away", on: true }), 1_000);
    expect(of(b, "away")).toHaveLength(1);
    const c = join("c", 1_100);
    expect(welcome(c).peers.find((p) => p.sid === 1)?.away).toBe(true);
    core.message(a, send({ t: "away", on: false }), 2_000);
    expect(of(c, "away")).toEqual([{ t: "away", sid: 1, on: false }]);
    expect(core.peer(1)?.away).toBeUndefined();
  });

  it("마을·집 방에서는 받지 않는다", () => {
    const { core, join } = setup({ room: true });
    const a = join("a");
    const b = join("b");
    clear(a, b);
    core.message(a, send({ t: "away", on: true }), 0);
    expect(core.peer(1)?.away).toBeUndefined();
    expect(of(b, "away")).toEqual([]);
  });
});

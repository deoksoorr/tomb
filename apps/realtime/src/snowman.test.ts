import { AVATAR_COLORS, CAMP_ARRIVE, DIR, SNOWMAN_BUILD_INTERVAL_MS, SNOWMAN_LIFE_MS, SNOWMAN_PER_CHANNEL, SNOWMAN_PER_PERSON, STATE, encodeEvent, encodeMove, type C2S, type Grant, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";
import { SnowmanYard } from "./snowmen";

// 11/17 캠핑장 눈사람: 채널 DO가 메모리에 목록을 들고, 세운 것만 같은 캠핑장에 알린다

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup(saved?: unknown) {
  const store: { snow?: unknown } = {};
  const host: ChannelHost<Conn> = {
    snowmenChanged: (list) => void (store.snow = JSON.parse(JSON.stringify(list))),
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
    random: () => 0.25,
  };
  const core = new ChannelCore<Conn>({ capacity: 40, graceMs: 20_000 }, host);
  if (saved !== undefined) core.restoreSnowmen(saved, 100);
  const join = (id: string, o: { camp?: boolean; perm?: boolean; spawn?: { x: number; y: number }; now?: number } = {}) => {
    const c: Conn = { id, out: [] };
    const t: JoinTicket = { visitorId: id, name: id, color: AVATAR_COLORS[0], channel: 1, look: [], body: "hood", spawn: o.spawn, ...(o.camp || o.perm ? { camp: true as const } : {}), ...(o.camp ? { map: "camp" as const } : {}) };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  return { core, join, store };
}

const events = (c: Conn) => c.out.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d) as S2C);
const of = <T extends S2C["t"]>(c: Conn, t: T) => events(c).filter((e): e is Extract<S2C, { t: T }> => e.t === t);
const send = (m: C2S) => encodeEvent(m);
const SPOT = { x: 330, y: 540 };

describe("snowman yard", () => {
  it("한 사람 2개·채널 15개, 넘치면 가장 오래된 것부터", () => {
    const y = new SnowmanYard();
    const ids: string[] = [];
    for (let i = 0; i < SNOWMAN_PER_PERSON + 1; i++) {
      const r = y.build("a", "a", 200 + i * 30, 520, i, 1);
      expect(r.ok).toBe(true);
      if (r.ok) ids.push(r.s.id);
      if (r.ok && i === SNOWMAN_PER_PERSON) expect(r.gone).toEqual([ids[0]]);
    }
    expect(y.size).toBe(SNOWMAN_PER_PERSON);
    for (let i = 0; i < SNOWMAN_PER_CHANNEL; i++) y.build(`p${i}`, "p", 200 + (i % 10) * 30, 760 - Math.floor(i / 10) * 30, 100 + i, 1);
    expect(y.size).toBe(SNOWMAN_PER_CHANNEL);
    expect(y.all(1000).some((s) => s.id === ids[1])).toBe(false);
  });
  it("가까이 붙여 세우거나 눈밭이 아니면 거절, 1시간 지나면 목록에서 빠진다", () => {
    const y = new SnowmanYard();
    expect(y.build("a", "a", SPOT.x, SPOT.y, 0, 1).ok).toBe(true);
    expect(y.build("b", "b", SPOT.x + 4, SPOT.y, 0, 1)).toEqual({ ok: false, why: "spot" });
    expect(y.build("b", "b", -10, SPOT.y, 0, 1)).toEqual({ ok: false, why: "spot" });
    expect(y.all(SNOWMAN_LIFE_MS - 1)).toHaveLength(1);
    expect(y.all(SNOWMAN_LIFE_MS)).toHaveLength(0);
  });
});

describe("snowman in channel", () => {
  it("캠핑장 사람 모두(세운 사람 포함)에게 snowman, 마을 사람은 받지 않는다. 새로 온 사람은 snowmen", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 40, y: SPOT.y } });
    const v = join("v");
    expect(of(a, "snowmen")).toEqual([{ t: "snowmen", list: [] }]);
    expect(of(v, "snowmen")).toEqual([]);
    core.message(a, send({ t: "snowman", x: SPOT.x, y: SPOT.y + 16 }), 10);
    const got = of(b, "snowman");
    expect(got).toHaveLength(1);
    expect(got[0].s).toMatchObject({ x: SPOT.x, y: SPOT.y + 16, by: "a", at: 10, seed: Math.floor(0.25 * 0x7fffffff) });
    expect(got[0].sid).toBe(of(a, "welcome")[0].sid);
    expect(of(a, "snowman")).toHaveLength(1);
    expect(of(v, "snowman")).toHaveLength(0);
    const c = join("c", { camp: true, now: 20 });
    expect(of(c, "snowmen")[0].list.map((s) => s.id)).toEqual([got[0].s.id]);
    // 마을에서 버스로 캠핑장에 오면 mapped 다음에 snowmen
    core.message(v, send({ t: "map", m: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y }), 30);
    expect(of(v, "snowmen")).toHaveLength(0); // 허락(camp)이 없는 토큰은 마을 그대로
    const w = join("w", { perm: true, now: 40 });
    expect(of(w, "snowmen")).toHaveLength(0);
    core.message(w, send({ t: "map", m: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y }), 50);
    const ts = events(w).map((e) => e.t);
    expect(ts.indexOf("snowmen")).toBeGreaterThan(ts.indexOf("mapped"));
    expect(of(w, "snowmen")[0].list).toHaveLength(1);
  });
  it("너무 잦으면 wait, 멀리 세우면 spot, 마을에서는 무시", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const v = join("v");
    core.message(a, send({ t: "snowman", x: SPOT.x, y: SPOT.y + 10 }), 10);
    core.message(a, send({ t: "snowman", x: SPOT.x + 30, y: SPOT.y }), 20);
    expect(of(a, "snowmanDenied")).toEqual([{ t: "snowmanDenied", why: "wait" }]);
    core.message(a, send({ t: "snowman", x: SPOT.x + 200, y: SPOT.y }), 10 + SNOWMAN_BUILD_INTERVAL_MS);
    expect(of(a, "snowmanDenied").at(-1)).toEqual({ t: "snowmanDenied", why: "spot" });
    core.message(v, send({ t: "snowman", x: 600, y: 700 }), 10);
    expect(of(v, "snowmanDenied")).toEqual([]);
    expect(of(v, "snowman")).toEqual([]);
  });
  it("세 번째를 세우면 첫 번째가 snowmanGone", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const at = [SPOT.x - 20, SPOT.x, SPOT.x + 20];
    at.forEach((x, i) => {
      core.message(a, encodeMove({ x, y: SPOT.y, state: STATE.idle, dir: DIR.down, seq: i }), i * SNOWMAN_BUILD_INTERVAL_MS);
      core.message(a, send({ t: "snowman", x, y: SPOT.y + 12 }), i * SNOWMAN_BUILD_INTERVAL_MS + 1);
    });
    const made = of(a, "snowman").map((e) => e.s.id);
    expect(made).toHaveLength(3);
    expect(of(a, "snowmanGone")).toEqual([{ t: "snowmanGone", id: made[0] }]);
  });
});

describe("snowman storage (DO가 잠들었다 깨어나도)", () => {
  it("세우면 저장하고, 새 코어가 되살려 캠핑장에 들어온 사람에게 보낸다. 한 사람 제한도 이어진다", () => {
    const first = setup();
    const a = first.join("a", { camp: true, spawn: SPOT });
    first.core.message(a, send({ t: "snowman", x: SPOT.x, y: SPOT.y + 12 }), 10);
    expect(Array.isArray(first.store.snow)).toBe(true);
    const id = of(a, "snowman")[0].s.id;
    const next = setup(first.store.snow);
    const c = next.join("c", { camp: true, now: 200 });
    expect(of(c, "snowmen")[0].list.map((s) => s.id)).toEqual([id]);
    expect(JSON.stringify(of(c, "snowmen"))).not.toContain("visitorId");
  });
  it("다 녹은 것·모양이 틀린 것은 되살리지 않는다", () => {
    const next = setup([{ id: "old", x: 300, y: 520, seed: 1, by: "a", at: 100 - SNOWMAN_LIFE_MS, visitorId: "a" }, { id: "bad" }, null]);
    const c = next.join("c", { camp: true, now: 200 });
    expect(of(c, "snowmen")[0].list).toEqual([]);
  });
});

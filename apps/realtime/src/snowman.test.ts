import { AVATAR_COLORS, CAMP_ARRIVE, SNOWMAN_BUILD_INTERVAL_MS, SNOWMAN_LIFE_MS, SNOWMAN_PER_CHANNEL, SNOWMAN_PER_PERSON, SNOW_ACT_INTERVAL_MS, SNOW_STACK_IDLE_MS, SNOW_STACKS_PER_PERSON, encodeEvent, type C2S, type Grant, type S2C } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost, type JoinTicket, type PeerRecord } from "./channel";
import { SnowmanYard } from "./snowmen";

// 11/17 캠핑장 눈사람: 채널 DO가 메모리에 목록을 들고 같은 캠핑장에 알린다. 11/18 쌓는 중인 덩이·들고 있는 눈덩이도

type Conn = { id: string; out: (string | ArrayBuffer)[]; att?: PeerRecord | null };

function setup(saved?: unknown, savedStacks?: unknown) {
  const store: { snow?: unknown; stacks?: unknown } = {};
  const host: ChannelHost<Conn> = {
    snowmenChanged: (list) => void (store.snow = JSON.parse(JSON.stringify(list))),
    snowStacksChanged: (list) => void (store.stacks = JSON.parse(JSON.stringify(list))),
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
  if (savedStacks !== undefined) core.restoreSnowStacks(savedStacks, 100);
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
const STEP = Math.max(SNOW_ACT_INTERVAL_MS, SNOWMAN_BUILD_INTERVAL_MS);

/** 몸통 내려놓기 → 배 → 머리 (t부터 SNOW_ACT_INTERVAL_MS 간격). 세운 눈사람 id (못 세웠으면 undefined) */
function buildAt(core: ChannelCore<Conn>, c: Conn, x: number, y: number, t: number): string | undefined {
  core.message(c, send({ t: "snowPut", x, y, s: 2 }), t);
  const st = of(c, "snowStack").filter((e) => e.st.x === x && e.st.y === y).pop()?.st;
  if (!st) return undefined;
  core.message(c, send({ t: "snowAdd", id: st.id, s: 1 }), t + SNOW_ACT_INTERVAL_MS);
  core.message(c, send({ t: "snowAdd", id: st.id, s: 0 }), t + SNOW_ACT_INTERVAL_MS * 2);
  return of(c, "snowman").find((e) => e.st === st.id)?.s.id;
}

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
  it("세 단째를 올리면 캠핑장 사람 모두(세운 사람 포함)에게 snowman, 마을 사람은 받지 않는다. 새로 온 사람은 snowmen", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 40, y: SPOT.y } });
    const v = join("v");
    expect(of(a, "snowmen")).toEqual([{ t: "snowmen", list: [], stacks: [] }]);
    expect(of(v, "snowmen")).toEqual([]);
    const id = buildAt(core, a, SPOT.x, SPOT.y + 16, 10);
    const got = of(b, "snowman");
    expect(got).toHaveLength(1);
    expect(got[0].s).toMatchObject({ id, x: SPOT.x, y: SPOT.y + 16, by: "a", at: 10 + SNOW_ACT_INTERVAL_MS * 2, seed: Math.floor(0.25 * 0x7fffffff) });
    expect(got[0].sid).toBe(of(a, "welcome")[0].sid);
    expect(got[0].st).toBe(of(b, "snowStack")[0].st.id);
    expect(of(a, "snowman")).toHaveLength(1);
    expect(of(v, "snowman")).toHaveLength(0);
    expect(of(v, "snowStack")).toHaveLength(0);
    const c = join("c", { camp: true, now: 2000 });
    expect(of(c, "snowmen")[0].list.map((s) => s.id)).toEqual([id]);
    expect(of(c, "snowmen")[0].stacks).toEqual([]);
    // 마을에서 버스로 캠핑장에 오면 mapped 다음에 snowmen
    core.message(v, send({ t: "map", m: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y }), 3000);
    expect(of(v, "snowmen")).toHaveLength(0); // 허락(camp)이 없는 토큰은 마을 그대로
    const w = join("w", { perm: true, now: 4000 });
    expect(of(w, "snowmen")).toHaveLength(0);
    core.message(w, send({ t: "map", m: "camp", x: CAMP_ARRIVE.x, y: CAMP_ARRIVE.y }), 5000);
    const ts = events(w).map((e) => e.t);
    expect(ts.indexOf("snowmen")).toBeGreaterThan(ts.indexOf("mapped"));
    expect(of(w, "snowmen")[0].list).toHaveLength(1);
  });
  it("세우기가 너무 잦으면 wait (두 단 그대로), 11/18 멀리 세워도 된다(내 위치와 거리 안 봄), 마을에서는 무시", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const v = join("v");
    expect(buildAt(core, a, SPOT.x, SPOT.y + 10, 10)).toBeDefined();
    expect(buildAt(core, a, SPOT.x + 40, SPOT.y, 10 + SNOW_ACT_INTERVAL_MS * 3)).toBeUndefined();
    const denied = of(a, "snowmanDenied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ why: "wait", a: "add" });
    // 거절 뒤에는 그 덩이의 지금 모양(두 단)을 다시 받는다
    expect(of(a, "snowStack").pop()!.st.sizes).toEqual([2, 1]);
    expect(buildAt(core, a, SPOT.x + 200, SPOT.y, 10 + SNOWMAN_BUILD_INTERVAL_MS * 2)).toBeDefined();
    expect(of(a, "snowman")).toHaveLength(2);
    core.message(v, send({ t: "snowPut", x: 600, y: 700, s: 2 }), 10);
    expect(of(v, "snowmanDenied")).toEqual([]);
    expect(of(v, "snowStack")).toEqual([]);
  });
  it("세 번째를 세우면 첫 번째가 snowmanGone", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const made = [SPOT.x - 30, SPOT.x, SPOT.x + 30].map((x, i) => buildAt(core, a, x, SPOT.y + 12, i * STEP * 2));
    expect(made.every(Boolean)).toBe(true);
    expect(of(a, "snowmanGone")).toEqual([{ t: "snowmanGone", id: made[0] }]);
  });
});

describe("snow stacks (11/18 만드는 과정)", () => {
  it("내려놓기·올리기·다시 들기는 같은 캠핑장 모두에게, 주인 손도 같이 (h·took)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 60, y: SPOT.y } });
    core.message(a, send({ t: "snowPut", x: SPOT.x, y: SPOT.y, s: 2 }), 10);
    const st = of(b, "snowStack")[0].st;
    expect(st).toMatchObject({ sid: of(a, "welcome")[0].sid, x: SPOT.x, y: SPOT.y, sizes: [2], at: 10 });
    expect(of(a, "snowStack")[0].st).toEqual(st);
    core.message(a, send({ t: "snowAdd", id: st.id, s: 1 }), 10 + SNOW_ACT_INTERVAL_MS);
    expect(of(b, "snowStack")[1]).toMatchObject({ st: { sizes: [2, 1] } });
    expect(of(b, "snowStack")[1].h).toBeUndefined();
    core.message(a, send({ t: "snowTake", id: st.id }), 10 + SNOW_ACT_INTERVAL_MS * 2);
    expect(of(b, "snowStack")[2]).toMatchObject({ st: { sizes: [2] }, h: 1 });
    core.message(a, send({ t: "snowTake", id: st.id }), 10 + SNOW_ACT_INTERVAL_MS * 3);
    expect(of(b, "snowStackGone")).toEqual([{ t: "snowStackGone", id: st.id, sid: st.sid, took: 2 }]);
  });
  it("다른 사람 덩이·눈사람과 겹치면 near, 남의 덩이에는 올리지도 들지도 못한다 (lost)", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 60, y: SPOT.y } });
    core.message(a, send({ t: "snowPut", x: SPOT.x, y: SPOT.y, s: 2 }), 10);
    const st = of(a, "snowStack")[0].st;
    core.message(b, send({ t: "snowPut", x: SPOT.x + 10, y: SPOT.y, s: 2 }), 10);
    expect(of(b, "snowmanDenied")).toEqual([{ t: "snowmanDenied", why: "near", a: "put" }]);
    core.message(b, send({ t: "snowAdd", id: st.id, s: 1 }), 10 + SNOW_ACT_INTERVAL_MS);
    core.message(b, send({ t: "snowTake", id: st.id }), 10 + SNOW_ACT_INTERVAL_MS * 2);
    expect(of(b, "snowmanDenied").slice(1)).toEqual([
      { t: "snowmanDenied", why: "lost", a: "add", id: st.id },
      { t: "snowmanDenied", why: "lost", a: "take", id: st.id },
    ]);
    expect(of(a, "snowStack")).toHaveLength(1);
    // 남의 덩이는 거절해도 지우라고 하지 않는다 (B 화면에 A 덩이가 그대로)
    expect(of(b, "snowStackGone")).toEqual([]);
    // 없는 덩이는 지우라고 한다
    core.message(b, send({ t: "snowTake", id: "knone" }), 10 + SNOW_ACT_INTERVAL_MS * 3);
    expect(of(b, "snowStackGone")).toEqual([{ t: "snowStackGone", id: "knone", sid: of(b, "welcome")[0].sid }]);
    // 서 있는 남의 눈사람 곁도 안 된다
    const id = buildAt(core, a, SPOT.x + 120, SPOT.y, 1000);
    expect(id).toBeDefined();
    core.message(b, send({ t: "snowPut", x: SPOT.x + 130, y: SPOT.y + 4, s: 1 }), 2000);
    expect(of(b, "snowmanDenied").pop()).toMatchObject({ why: "near", a: "put" });
    // 내 것끼리는 SNOWMAN_GAP까지 붙여도 된다
    core.message(a, send({ t: "snowPut", x: SPOT.x + 16, y: SPOT.y, s: 1 }), 3000);
    expect(of(a, "snowmanDenied")).toEqual([]);
  });
  it("한 사람 덩이가 넘치면 가장 오래된 것이 사라지고, 너무 잦으면 wait", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 60, y: SPOT.y } });
    for (let i = 0; i <= SNOW_STACKS_PER_PERSON; i++) core.message(a, send({ t: "snowPut", x: 200 + i * 30, y: 520, s: 1 }), 10 + i * SNOW_ACT_INTERVAL_MS);
    expect(of(a, "snowmanDenied")).toEqual([]);
    const ids = of(b, "snowStack").map((e) => e.st.id);
    expect(ids).toHaveLength(SNOW_STACKS_PER_PERSON + 1);
    expect(of(b, "snowStackGone").map((e) => e.id)).toEqual([ids[0]]);
    core.message(a, send({ t: "snowTake", id: ids[1] }), 10 + SNOW_STACKS_PER_PERSON * SNOW_ACT_INTERVAL_MS + 1);
    expect(of(a, "snowmanDenied").pop()).toMatchObject({ why: "wait", a: "take" });
  });
  it("들고 있는 눈덩이: 바뀔 때만 다른 사람에게, 늦게 온 사람은 PeerInfo.snow, 너무 잦으면 버린다", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 60, y: SPOT.y } });
    const v = join("v");
    core.message(a, send({ t: "snowHold", h: { s: 0 } }), 10);
    core.message(a, send({ t: "snowHold", h: { s: 1, r: true } }), 20); // 너무 잦다 → 버린다
    core.message(a, send({ t: "snowHold", h: { s: 1, r: true } }), 500);
    core.message(a, send({ t: "snowHold", h: { s: 1, r: true } }), 1000); // 같은 상태 → 알리지 않는다
    const sid = of(a, "welcome")[0].sid;
    expect(of(b, "snowHold")).toEqual([
      { t: "snowHold", sid, h: { s: 0 } },
      { t: "snowHold", sid, h: { s: 1, r: true } },
    ]);
    expect(of(a, "snowHold")).toEqual([]);
    expect(of(v, "snowHold")).toEqual([]);
    const c = join("c", { camp: true, now: 1100 });
    expect(of(c, "welcome")[0].peers.find((p) => p.sid === sid)?.snow).toEqual({ s: 1, r: true });
    // 내려놓으면 빈손 (snowStack에 h가 없다)
    core.message(a, send({ t: "snowPut", x: SPOT.x, y: SPOT.y + 20, s: 1 }), 1200);
    core.message(a, send({ t: "sync" }), 1300);
    expect(of(a, "peers")).toHaveLength(1);
    const d = join("d", { camp: true, now: 1400 });
    expect(of(d, "welcome")[0].peers.find((p) => p.sid === sid)?.snow).toBeUndefined();
    expect(of(d, "snowmen")[0].stacks).toHaveLength(1);
  });
  it("주인이 캠핑장을 떠나면 덩이가 사라지고, 10분 손대지 않은 덩이는 목록에서 빠진다", () => {
    const { core, join } = setup();
    const a = join("a", { camp: true, spawn: SPOT });
    const b = join("b", { camp: true, spawn: { x: SPOT.x + 60, y: SPOT.y } });
    core.message(a, send({ t: "snowPut", x: SPOT.x, y: SPOT.y, s: 2 }), 10);
    core.message(b, send({ t: "snowPut", x: SPOT.x + 100, y: SPOT.y, s: 2 }), 10);
    const mine = of(a, "snowStack")[0].st;
    core.message(a, send({ t: "map", m: "village", x: 400, y: 400 }), 2000);
    expect(of(b, "snowStackGone")).toEqual([{ t: "snowStackGone", id: mine.id, sid: mine.sid }]);
    const c = join("c", { camp: true, now: 3000 });
    expect(of(c, "snowmen")[0].stacks!.map((s) => s.sid)).toEqual([of(b, "welcome")[0].sid]);
    const e = join("e", { camp: true, now: 10 + SNOW_STACK_IDLE_MS });
    expect(of(e, "snowmen")[0].stacks).toEqual([]);
  });
});

describe("snowman storage (DO가 잠들었다 깨어나도)", () => {
  it("세우면 저장하고, 새 코어가 되살려 캠핑장에 들어온 사람에게 보낸다. 한 사람 제한도 이어진다", () => {
    const first = setup();
    const a = first.join("a", { camp: true, spawn: SPOT });
    const id = buildAt(first.core, a, SPOT.x, SPOT.y + 12, 10);
    expect(Array.isArray(first.store.snow)).toBe(true);
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
  it("11/18 쌓는 중인 덩이도 저장하고 되살린다 (주인이 캠핑장에 있을 때만 보낸다)", () => {
    const first = setup();
    const a = first.join("a", { camp: true, spawn: SPOT });
    first.core.message(a, send({ t: "snowPut", x: SPOT.x, y: SPOT.y, s: 2 }), 10);
    expect(Array.isArray(first.store.stacks)).toBe(true);
    const saved = first.store.stacks as Record<string, unknown>[];
    // 주인이 없는 덩이(zz)·모양이 틀린 것은 보내지 않는다
    const next = setup(undefined, [...saved, { ...saved[0], id: "k2", x: SPOT.x + 100, visitorId: "zz" }, { id: "bad", sizes: [0, 1] }]);
    next.join("a", { camp: true, now: 300 });
    const d = next.join("d", { camp: true, now: 400 });
    expect(of(d, "snowmen")[0].stacks!.map((s) => s.sizes)).toEqual([[2]]);
    expect(JSON.stringify(of(d, "snowmen"))).not.toContain("visitorId");
  });
});

import {
  AVATAR_COLORS,
  DIR,
  GOBLIN_CLAIM_RADIUS,
  GOBLIN_FIRST_MAX_MS,
  GOBLIN_GAP_MIN_MS,
  GOBLIN_JACKPOT_POINTS,
  GOBLIN_LIFE_MS,
  GOBLIN_POINTS_MAX,
  GOBLIN_POINTS_MIN,
  STATE,
  encodeEvent,
  encodeMove,
  goblinPos,
  inMapBounds,
  mulberry32,
  signGrant,
  verifyGrant,
  type Grant,
  type S2C,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, GOBLIN_AFTER_TELEPORT_MS, type ChannelHost, type JoinTicket } from "./channel";
import { GoblinCore, type GoblinState } from "./goblin";

// 22번 황금 고블린: 등장 일정 · 가장 먼저 닿은 한 명만 · 증서 · 저장/복원

type Conn = { id: string; out: string[] };

function seq(...xs: number[]): () => number {
  let i = 0;
  return () => xs[i++ % xs.length];
}

function setup(opts: { sign?: boolean } = {}) {
  const saved: GoblinState[] = [];
  const host: ChannelHost<Conn> = {
    send: (c, d) => void (typeof d === "string" && c.out.push(d)),
    close: () => {},
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async () => null,
    claimNonce: () => true,
    ...(opts.sign === false ? {} : { signGrant: (g: Grant) => signGrant("secret", g) }),
    goblinChanged: (s) => void saved.push(structuredClone(s)),
    random: seq(0.5, 0.25, 0.75, 0.1, 0.9),
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
  const join = (id: string, now = 0, spawn = { x: 1024, y: 120 }) => {
    const c: Conn = { id, out: [] };
    core.join(c, { visitorId: id, name: `${id}님`, color: AVATAR_COLORS[0], channel: 1, spawn, look: [], body: "hood" }, now);
    return c;
  };
  const events = (c: Conn) => c.out.map((d) => JSON.parse(d) as S2C);
  const moveTo = (c: Conn, x: number, y: number, now: number) => core.message(c, encodeMove({ x: Math.round(x), y: Math.round(y), state: STATE.walk, dir: DIR.down, seq: 0 }), now);
  return { core, join, events, saved, moveTo };
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("GoblinCore schedule", () => {
  it("schedules the first appearance, spawns at that time only when someone is online, then reschedules hours later", () => {
    const g = new GoblinCore(seq(0.5));
    expect(g.check(0, 1).changed).toBe(true);
    const first = g.state.next!;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(GOBLIN_FIRST_MAX_MS);
    expect(g.due(1)).toBe(first);
    expect(g.due(0)).toBeNull(); // 아무도 없으면 깨우지 않는다
    expect(g.check(first - 1, 1).spawned).toBeUndefined();
    const r = g.check(first, 1);
    expect(r.spawned).toBeDefined();
    // 11/19 보통 300~1,000P (10P 단위) 또는 대박 2,000P
    const pts = g.state.cur!.points;
    expect(pts === GOBLIN_JACKPOT_POINTS || (pts >= GOBLIN_POINTS_MIN && pts <= GOBLIN_POINTS_MAX && pts % 10 === 0)).toBe(true);
    expect(g.state.next! - first).toBeGreaterThanOrEqual(GOBLIN_GAP_MIN_MS);
    expect(g.due(1)).toBe(first + GOBLIN_LIFE_MS); // 사라질 때 깨운다
    const gone = g.check(first + GOBLIN_LIFE_MS, 1);
    expect(gone.gone).toBe(r.spawned!.id);
    expect(g.state.cur).toBeNull();
  });

  it("if nobody was there at the scheduled time, it comes a few minutes after someone returns (not instantly)", () => {
    const g = new GoblinCore(seq(0.5));
    g.state.next = 1000;
    expect(g.check(5000, 0).spawned).toBeUndefined(); // 아무도 없다
    const r = g.check(1000 + GOBLIN_LIFE_MS + 1, 1);
    expect(r.spawned).toBeUndefined();
    expect(g.state.next!).toBeGreaterThan(1000 + GOBLIN_LIFE_MS + 60_000);
  });

  it("claim: only inside the radius of the server-computed position, only once", () => {
    const g = new GoblinCore(seq(0.3));
    const info = g.spawn(0);
    const t = 5000;
    const at = goblinPos(info, t);
    expect(g.claim(info.id, "far", [{ x: at.x + GOBLIN_CLAIM_RADIUS + 5, y: at.y }], t)).toBeNull();
    expect(g.claim("wrong", "a", [at], t)).toBeNull();
    const pts = g.claim(info.id, "a", [{ x: at.x + 10, y: at.y - 10 }], t);
    expect(pts).toBe(g.state.cur!.points);
    expect(g.claim(info.id, "b", [at], t)).toBeNull(); // 두 번째는 늦었다
    expect(g.visible(t)).toBeUndefined();
    expect(g.claim(info.id, "a", [at], info.until + 1)).toBeNull();
  });

  it("restore: keeps the caught flag so a restarted DO never pays twice", () => {
    const g = new GoblinCore(seq(0.3));
    const info = g.spawn(0);
    g.claim(info.id, "a", [goblinPos(info, 100)], 100);
    const h = new GoblinCore(seq(0.3));
    h.restore(JSON.parse(JSON.stringify(g.state)));
    expect(h.claim(info.id, "b", [goblinPos(info, 200)], 200)).toBeNull();
    h.restore({ cur: { id: 1 } }); // 형식이 이상하면 버린다
    expect(h.state.cur).toBeNull();
  });
});

describe("ChannelCore goblin", () => {
  it("welcome carries the server clock and a visible goblin; spawn is broadcast", () => {
    const { core, join, events } = setup();
    const a = join("a", 1000);
    const w = events(a).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(w.now).toBe(1000);
    expect(w.goblin).toBeUndefined();
    const cur = core.forceGoblin(2000)!;
    expect(events(a)).toContainEqual({ t: "goblin", g: { id: cur.id, seed: cur.seed, at: 2000, until: 2000 + GOBLIN_LIFE_MS } });
    const b = join("b", 3000);
    const wb = events(b).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(wb.goblin?.id).toBe(cur.id);
  });

  it("race: two players touch at the same time → exactly one winner, one signed grant for that winner only", async () => {
    const { core, join, events, moveTo, saved } = setup();
    const a = join("a", 0);
    const b = join("b", 0);
    const cur = core.forceGoblin(10_000)!;
    const t = 12_000;
    const at = goblinPos(cur, t);
    // 걸어서 다가온 것처럼: 미리 근처로 옮겨 두고(순간이동 직후 잡기 금지 2초가 지난 뒤) 마지막 몇 픽셀만 움직인다
    core.message(a, encodeEvent({ t: "warp", x: Math.round(at.x), y: Math.round(at.y) }), t - 3000);
    core.message(b, encodeEvent({ t: "warp", x: Math.round(at.x), y: Math.round(at.y) }), t - 3000);
    moveTo(a, at.x + 3, at.y, t);
    moveTo(b, at.x - 3, at.y, t);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), t);
    core.message(b, encodeEvent({ t: "goblin", id: cur.id }), t);
    await flush();
    const caughtA = events(a).filter((e) => e.t === "goblinCaught");
    const caughtB = events(b).filter((e) => e.t === "goblinCaught");
    expect(caughtA).toHaveLength(1);
    expect(caughtB).toEqual(caughtA);
    expect(caughtA[0]).toMatchObject({ id: cur.id, name: "a님", points: cur.points });
    const grantsA = events(a).filter((e) => e.t === "goblinGrant") as Extract<S2C, { t: "goblinGrant" }>[];
    expect(grantsA).toHaveLength(1);
    expect(events(b).filter((e) => e.t === "goblinGrant")).toHaveLength(0);
    const g = await verifyGrant("secret", grantsA[0].grant, Math.floor(t / 1000));
    expect(g).toEqual({ kind: "goblin", visitorId: "a", points: cur.points, nonce: cur.id, exp: Math.floor(t / 1000) + 600 });
    expect(saved.at(-1)?.cur?.caughtBy).toBe("a");
  });

  it("too far (server-known position) → no winner", async () => {
    const { core, join, events, moveTo } = setup();
    const a = join("a", 0);
    const cur = core.forceGoblin(10_000)!;
    const at = goblinPos(cur, 10_500);
    moveTo(a, at.x + 120, at.y, 10_500);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), 10_500);
    await flush();
    expect(events(a).filter((e) => e.t === "goblinCaught")).toHaveLength(0);
  });

  it("re-sends the grant to the winner on reconnect (web pays it once by nonce)", async () => {
    const { core, join, events, moveTo } = setup();
    const a = join("a", 0);
    const cur = core.forceGoblin(1000)!;
    const at = goblinPos(cur, 4000);
    core.message(a, encodeEvent({ t: "warp", x: Math.round(at.x), y: Math.round(at.y) }), 1000);
    moveTo(a, at.x, at.y, 4000);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), 4000);
    await flush();
    const a2 = join("a", 4500);
    expect(events(a2).filter((e) => e.t === "goblinGrant")).toHaveLength(1);
  });

  it("a reported target far from the server position does not count (target-only teleport)", async () => {
    const { core, join, events, moveTo } = setup();
    const a = join("a", 0);
    const cur = core.forceGoblin(10_000)!;
    const t = 10_100;
    const at = goblinPos(cur, t);
    // 고블린에서 멀리 떨어진 곳에 서 있다가 목표만 고블린 위로 찍는다 → 서버 위치는 예산만큼만 움직인다
    core.message(a, encodeEvent({ t: "warp", x: Math.round(at.x + 400), y: Math.round(at.y) }), 5000);
    moveTo(a, at.x, at.y, t);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), t);
    await flush();
    expect(events(a).filter((e) => e.t === "goblinCaught")).toHaveLength(0);
  });

  it("cannot claim right after a warp onto the goblin; can once the 2s guard passes", async () => {
    const { core, join, events } = setup();
    const a = join("a", 0);
    const cur = core.forceGoblin(10_000)!;
    const t = 10_500;
    const at = goblinPos(cur, t);
    core.message(a, encodeEvent({ t: "warp", x: Math.round(at.x), y: Math.round(at.y) }), t);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), t + 100);
    await flush();
    expect(events(a).filter((e) => e.t === "goblinCaught")).toHaveLength(0);
    const later = t + GOBLIN_AFTER_TELEPORT_MS;
    const at2 = goblinPos(cur, later);
    core.message(a, encodeEvent({ t: "warp", x: Math.round(at2.x), y: Math.round(at2.y) }), later - GOBLIN_AFTER_TELEPORT_MS + 900);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), later + 900);
    await flush();
    expect(events(a).filter((e) => e.t === "goblinCaught")).toHaveLength(Math.hypot(goblinPos(cur, later + 900).x - Math.round(at2.x), goblinPos(cur, later + 900).y - Math.round(at2.y)) <= 40 ? 1 : 0);
  });

  it("is off without a signer (rooms/tests)", () => {
    const { core, join } = setup({ sign: false });
    join("a", 0);
    expect(core.forceGoblin(10)).toBeNull();
    expect(core.goblinDue()).toBeNull();
  });
});

// ── 11/26 맵 무작위 (마을 50 · 바닷가 25 · 캠핑장 25), 수명 3분, 채널 전체 알림, 다른 맵 잡기 거절 ──

function setupMaps(random: () => number) {
  const host: ChannelHost<Conn> = {
    send: (c, d) => void (typeof d === "string" && c.out.push(d)),
    close: () => {},
    persist: () => {},
    saveReservation: () => {},
    dropReservation: () => {},
    requestTick: () => {},
    countChanged: () => {},
    lastPing: () => 0,
    visitorJoined: () => {},
    visitorLeft: () => {},
    verifyGrant: async () => null,
    claimNonce: () => true,
    signGrant: (g: Grant) => signGrant("secret", g),
    random,
  };
  const core = new ChannelCore<Conn>({ capacity: 10, graceMs: 20_000 }, host);
  const join = (id: string, o: { map?: "camp" | "sea"; spawn?: { x: number; y: number }; now?: number; perm?: boolean } = {}) => {
    const c: Conn = { id, out: [] };
    const perm = o.perm ?? true;
    const t: JoinTicket = { visitorId: id, name: `${id}님`, color: AVATAR_COLORS[0], channel: 1, spawn: o.spawn, look: [], body: "hood", ...(perm ? { camp: true as const, sea: true as const } : {}), ...(o.map ? { map: o.map } : {}) };
    core.join(c, t, o.now ?? 0);
    return c;
  };
  const events = (c: Conn) => c.out.map((d) => JSON.parse(d) as S2C);
  return { core, join, events };
}

describe("11/26 goblin maps", () => {
  it("lives 3 minutes", () => {
    expect(GOBLIN_LIFE_MS).toBe(180_000);
    const g = new GoblinCore(seq(0.3));
    const info = g.spawn(1000);
    expect(info.until - info.at).toBe(180_000);
  });

  it("map odds: village 34% · sea 33% · camp 33% when everyone can travel; village only when nobody can", () => {
    const r = mulberry32(2026);
    const n = { village: 0, sea: 0, camp: 0 };
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const g = new GoblinCore(r);
      const info = g.spawn(0, () => true);
      n[info.m ?? "village"]++;
    }
    expect(n.village / N).toBeCloseTo(0.34, 1);
    expect(n.sea / N).toBeCloseTo(0.33, 1);
    expect(n.camp / N).toBeCloseTo(0.33, 1);
    // 바닷가·캠핑장이 닫힌 서버(허락 가진 사람 없음) → 늘 마을, 마을 고블린은 옛 모양(m 없음)
    for (let i = 0; i < 200; i++) expect(new GoblinCore(r).spawn(0).m).toBeUndefined();
    // 한 맵만 닫혔으면 그 몫은 마을로
    const seaOnly = { village: 0, sea: 0, camp: 0 };
    for (let i = 0; i < N; i++) seaOnly[new GoblinCore(r).spawn(0, (m) => m !== "camp").m ?? "village"]++;
    expect(seaOnly.camp).toBe(0);
    expect(seaOnly.village / N).toBeCloseTo(0.67, 1);
  });

  it("the scheduled spawn asks the channel which maps are open (token permission)", () => {
    // 맵 뽑기 난수 0.6 → 바닷가. 바닷가 허락이 있는 사람이 없으면 마을
    const closed = setupMaps(() => 0.6);
    closed.join("a", { perm: false });
    expect(closed.core.forceGoblin(1000)!.m).toBeUndefined();
    const open = setupMaps(() => 0.6);
    open.join("a");
    expect(open.core.forceGoblin(1000)!.m).toBe("sea");
  });

  it("a sea goblin is announced to the whole channel as goblinMap (never as the old goblin event), gone too", () => {
    const { core, join, events } = setupMaps(() => 0.6);
    const v = join("v");
    const c = join("c", { map: "camp", spawn: { x: 300, y: 700 } });
    const s = join("s", { map: "sea" });
    const cur = core.forceGoblin(1000)!;
    expect(cur.m).toBe("sea");
    const g = { id: cur.id, seed: cur.seed, at: 1000, until: 1000 + GOBLIN_LIFE_MS, m: "sea" };
    for (const who of [v, c, s]) {
      expect(events(who)).toContainEqual({ t: "goblinMap", g });
      expect(events(who).some((e) => e.t === "goblin")).toBe(false); // 옛 클라이언트(맵 모름)는 바닷가 고블린을 그리지 않는다
    }
    // 아무도 못 잡고 사라짐 → 모두에게
    core.goblinCheck(1000 + GOBLIN_LIFE_MS);
    for (const who of [v, c, s]) expect(events(who)).toContainEqual({ t: "goblinGone", id: cur.id });
  });

  it("a village goblin goes to everyone in the old shape (no m)", () => {
    const { core, join, events } = setupMaps(() => 0.2);
    const v = join("v");
    const s = join("s", { map: "sea" });
    const cur = core.forceGoblin(1000)!;
    expect(cur.m).toBeUndefined();
    const g = { id: cur.id, seed: cur.seed, at: 1000, until: 1000 + GOBLIN_LIFE_MS };
    expect(events(v)).toContainEqual({ t: "goblin", g });
    expect(events(s)).toContainEqual({ t: "goblin", g });
  });

  it("welcome: old field only for a village goblin to a village joiner; gob (with map) for everyone", () => {
    const sea = setupMaps(() => 0.6);
    sea.join("first");
    const cur = sea.core.forceGoblin(1000)!;
    const wv = sea.events(sea.join("v", { now: 2000 })).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(wv.goblin).toBeUndefined();
    expect(wv.gob).toEqual({ id: cur.id, seed: cur.seed, at: 1000, until: 1000 + GOBLIN_LIFE_MS, m: "sea" });
    const ws = sea.events(sea.join("s", { map: "sea", now: 2000 })).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(ws.gob?.m).toBe("sea");
    expect(ws.goblin).toBeUndefined();

    const vil = setupMaps(() => 0.2);
    vil.join("first");
    const vc = vil.core.forceGoblin(1000)!;
    const w1 = vil.events(vil.join("v", { now: 2000 })).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(w1.goblin?.id).toBe(vc.id);
    expect(w1.gob?.id).toBe(vc.id);
    const w2 = vil.events(vil.join("c", { map: "camp", now: 2000 })).find((e) => e.t === "welcome") as Extract<S2C, { t: "welcome" }>;
    expect(w2.goblin).toBeUndefined(); // 옛 캠핑장 화면은 원래 고블린을 몰랐다
    expect(w2.gob?.id).toBe(vc.id);
  });

  it("claim: only from the goblin's map — the same coordinates on another map are refused", async () => {
    const g = new GoblinCore(seq(0.3));
    const info = g.spawn(0, () => true, "sea");
    const at = goblinPos(info, 5000);
    expect(g.claim(info.id, "v", [at], 5000, "village")).toBeNull();
    expect(g.claim(info.id, "c", [at], 5000, "camp")).toBeNull();
    expect(g.claim(info.id, "s", [at], 5000, "sea")).toBe(g.state.cur!.points);

    // 채널: 바닷가 고블린 → 마을 사람이 같은 좌표에 서 있어도 못 잡고, 바닷가 사람은 잡는다
    const { core, join, events } = setupMaps(() => 0.6);
    const watcher = join("w");
    const cur = core.forceGoblin(10_000)!;
    expect(cur.m).toBe("sea");
    let T = 10_000 + GOBLIN_AFTER_TELEPORT_MS + 500;
    let p = goblinPos(cur, T);
    for (let k = 0; k < 400 && !inMapBounds("village", p.x, p.y); k++) p = goblinPos(cur, (T += 250));
    const spot = { x: Math.round(p.x), y: Math.round(p.y) };
    const v = join("v", { spawn: spot, now: T - GOBLIN_AFTER_TELEPORT_MS });
    if (inMapBounds("village", spot.x, spot.y)) {
      expect(core.peer(2)).toMatchObject({ x: spot.x, y: spot.y });
      expect(core.peer(2)?.map).toBeUndefined();
    }
    core.message(v, encodeEvent({ t: "goblin", id: cur.id }), T);
    await flush();
    expect(events(watcher).some((e) => e.t === "goblinCaught")).toBe(false);
    const s = join("s", { map: "sea", spawn: spot, now: T - GOBLIN_AFTER_TELEPORT_MS });
    expect(core.peer(3)).toMatchObject({ map: "sea", x: spot.x, y: spot.y });
    core.message(s, encodeEvent({ t: "goblin", id: cur.id }), T);
    await flush();
    const caught = events(watcher).filter((e) => e.t === "goblinCaught");
    expect(caught).toEqual([expect.objectContaining({ id: cur.id, name: "s님", points: cur.points })]);
    expect(events(s).filter((e) => e.t === "goblinGrant")).toHaveLength(1);
    expect(events(v).filter((e) => e.t === "goblinGrant")).toHaveLength(0);
  });

  it("restore: an old save (no map) is a village goblin; a map save keeps its map; junk map → village", () => {
    const g = new GoblinCore(seq(0.3));
    g.restore({ next: 5, cur: { id: "gAbc", seed: 1, at: 0, until: 100, points: 300 } });
    expect(g.visible(50)).toEqual({ id: "gAbc", seed: 1, at: 0, until: 100 });
    g.restore({ next: 5, cur: { id: "gAbc", seed: 1, at: 0, until: 100, points: 300, m: "camp" } });
    expect(g.visible(50)?.m).toBe("camp");
    expect(g.claim("gAbc", "x", [goblinPos({ seed: 1, at: 0, m: "camp" }, 50)], 50, "village")).toBeNull();
    g.restore({ next: 5, cur: { id: "gAbc", seed: 1, at: 0, until: 100, points: 300, m: "moon" } });
    expect(g.visible(50)).toEqual({ id: "gAbc", seed: 1, at: 0, until: 100 });
  });
});

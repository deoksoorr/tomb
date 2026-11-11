import {
  AVATAR_COLORS,
  DIR,
  GOBLIN_CLAIM_RADIUS,
  GOBLIN_FIRST_MAX_MS,
  GOBLIN_GAP_MIN_MS,
  GOBLIN_LIFE_MS,
  GOBLIN_POINTS_MAX,
  GOBLIN_POINTS_MIN,
  STATE,
  encodeEvent,
  encodeMove,
  goblinPos,
  signGrant,
  verifyGrant,
  type Grant,
  type S2C,
} from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { ChannelCore, type ChannelHost } from "./channel";
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
    expect(g.state.cur!.points).toBeGreaterThanOrEqual(GOBLIN_POINTS_MIN);
    expect(g.state.cur!.points).toBeLessThanOrEqual(GOBLIN_POINTS_MAX);
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
    const at = goblinPos(cur, 1200);
    moveTo(a, at.x, at.y, 1200);
    core.message(a, encodeEvent({ t: "goblin", id: cur.id }), 1200);
    await flush();
    const a2 = join("a", 1500);
    expect(events(a2).filter((e) => e.t === "goblinGrant")).toHaveLength(1);
  });

  it("is off without a signer (rooms/tests)", () => {
    const { core, join } = setup({ sign: false });
    join("a", 0);
    expect(core.forceGoblin(10)).toBeNull();
    expect(core.goblinDue()).toBeNull();
  });
});

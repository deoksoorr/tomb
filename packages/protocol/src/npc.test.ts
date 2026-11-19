import { describe, expect, it } from "vitest";
import { parseC2S } from "./events";
import { signGrant, verifyGrant } from "./grants";
import {
  GOBLIN_JACKPOT_CHANCE,
  GOBLIN_JACKPOT_POINTS,
  GOBLIN_LIFE_MS,
  GOBLIN_POINTS_AVG,
  GOBLIN_POINTS_CAP,
  GOBLIN_POINTS_MAX,
  GOBLIN_POINTS_MIN,
  GOBLIN_ROUTES,
  GOBLIN_SPEED,
  goblinPoints,
  goblinPos,
  goblinRoute,
  hashUnit,
  mulberry32,
} from "./npc";
import { STATE } from "./types";
import { seatSlot, spotKindOfState, spotSeatId, TELESCOPE_SPOT } from "./world";

// 22번: 황금 고블린 공용 계산·이벤트·증서, 망원경·돗자리 자리

describe("goblin", () => {
  it("moves deterministically along its route, never faster than a dash", () => {
    const g = { seed: 987654321, at: 50_000 };
    const pts = goblinRoute(g.seed).pts;
    let prev = goblinPos(g, g.at);
    expect(pts.some(([x, y]) => Math.hypot(x - prev.x, y - prev.y) < 4)).toBe(true);
    for (let t = g.at + 50; t <= g.at + GOBLIN_LIFE_MS; t += 50) {
      const p = goblinPos(g, t);
      expect(goblinPos({ ...g }, t)).toEqual(p);
      // 50ms 사이 이동은 달리기 속도의 2배(가속 곡선 최고점)를 넘지 않는다
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThanOrEqual(GOBLIN_SPEED * 0.05 * 1.6 + 1);
      prev = { ...p };
    }
  });

  it("routes cover several zones", () => {
    expect(GOBLIN_ROUTES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(GOBLIN_ROUTES.map((r) => r.zone)).size).toBe(GOBLIN_ROUTES.length);
  });

  it("hash helpers are stable", () => {
    expect(hashUnit(1, 2, 3)).toBe(hashUnit(1, 2, 3));
    expect(hashUnit(1, 2, 3)).not.toBe(hashUnit(1, 2, 4));
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("parses the claim event and rejects junk ids", () => {
    expect(parseC2S(JSON.stringify({ t: "goblin", id: "gAbc123" }))).toEqual({ t: "goblin", id: "gAbc123" });
    expect(parseC2S(JSON.stringify({ t: "goblin", id: "../x" }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "goblin" }))).toBeNull();
  });

  it("goblin grant round-trips and rejects tampering", async () => {
    const tok = await signGrant("s", { kind: "goblin", visitorId: "v1", points: 57, nonce: "gAbc123", exp: 2000 });
    expect(await verifyGrant("s", tok, 1000)).toEqual({ kind: "goblin", visitorId: "v1", points: 57, nonce: "gAbc123", exp: 2000 });
    expect(await verifyGrant("other", tok, 1000)).toBeNull();
    expect(await verifyGrant("s", tok, 3000)).toBeNull(); // 만료
    const bad = await signGrant("s", { kind: "goblin", visitorId: "v1", points: -5, nonce: "x", exp: 2000 });
    expect(await verifyGrant("s", bad, 1000)).toBeNull();
  });

  it("11/19 reward: 300~1,000P in 10P steps, rarely a 2,000P jackpot (the grant accepts up to the jackpot)", async () => {
    expect(goblinPoints(() => 0)).toBe(GOBLIN_JACKPOT_POINTS);
    expect(goblinPoints(() => GOBLIN_JACKPOT_CHANCE)).toBe(GOBLIN_POINTS_MIN + Math.floor(GOBLIN_JACKPOT_CHANCE * 71) * 10);
    expect(goblinPoints(() => 0.9999999)).toBe(GOBLIN_POINTS_MAX);
    const r = mulberry32(42);
    let jackpots = 0;
    let sum = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const p = goblinPoints(r);
      sum += p;
      if (p === GOBLIN_JACKPOT_POINTS) jackpots++;
      else {
        expect(p).toBeGreaterThanOrEqual(GOBLIN_POINTS_MIN);
        expect(p).toBeLessThanOrEqual(GOBLIN_POINTS_MAX);
        expect(p % 10).toBe(0);
      }
    }
    expect(jackpots / N).toBeGreaterThan(GOBLIN_JACKPOT_CHANCE * 0.8);
    expect(jackpots / N).toBeLessThan(GOBLIN_JACKPOT_CHANCE * 1.2);
    expect(Math.abs(sum / N - GOBLIN_POINTS_AVG)).toBeLessThan(25);
    expect(GOBLIN_POINTS_AVG).toBeGreaterThan(700); // 사냥 20분쯤 — 보이면 달려갈 만한 값
    // 증서: 대박까지는 받고, 그보다 크면 버린다
    const jackpot = await signGrant("s", { kind: "goblin", visitorId: "v1", points: GOBLIN_POINTS_CAP, nonce: "gBig1", exp: 2000 });
    expect(await verifyGrant("s", jackpot, 1000)).toMatchObject({ points: GOBLIN_JACKPOT_POINTS });
    const over = await signGrant("s", { kind: "goblin", visitorId: "v1", points: GOBLIN_POINTS_CAP + 1, nonce: "gBig2", exp: 2000 });
    expect(await verifyGrant("s", over, 1000)).toBeNull();
  });
});

describe("stargazing spots", () => {
  it("telescope/mat ids resolve to 1-person slots; idle/sitGround MOVEs never auto-claim them", () => {
    expect(seatSlot(spotSeatId("telescope", TELESCOPE_SPOT.x, TELESCOPE_SPOT.y))).toMatchObject({ kind: "telescope", state: STATE.idle });
    expect(seatSlot("n_352_227")).toMatchObject({ kind: "mat", state: STATE.sitGround });
    expect(spotKindOfState(STATE.idle)).toBeNull();
    expect(spotKindOfState(STATE.sitGround)).toBeNull();
  });
});

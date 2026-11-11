import { describe, expect, it } from "vitest";
import { parseC2S } from "./events";
import { signGrant, verifyGrant } from "./grants";
import { GOBLIN_LIFE_MS, GOBLIN_ROUTES, GOBLIN_SPEED, goblinPos, goblinRoute, hashUnit, mulberry32 } from "./npc";
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
});

describe("stargazing spots", () => {
  it("telescope/mat ids resolve to 1-person slots; idle/sitGround MOVEs never auto-claim them", () => {
    expect(seatSlot(spotSeatId("telescope", TELESCOPE_SPOT.x, TELESCOPE_SPOT.y))).toMatchObject({ kind: "telescope", state: STATE.idle });
    expect(seatSlot("n_352_227")).toMatchObject({ kind: "mat", state: STATE.sitGround });
    expect(spotKindOfState(STATE.idle)).toBeNull();
    expect(spotKindOfState(STATE.sitGround)).toBeNull();
  });
});

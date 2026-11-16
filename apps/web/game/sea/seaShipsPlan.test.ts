import { describe, expect, it } from "vitest";
import { SEA_HEIGHT, SEA_JET_MIN_Y, SEA_TUBES, SEA_WIDTH, TIDE_LOW_Y } from "@tomb/protocol";
import { SHIP_LANE_Y0, SHIP_SLOT_MS, shipPassOf, shipsAt, squidBoatsAt, squidCount } from "./seaShipsPlan";

// 11/16 r15 먼바다 풍경 계획 (그림·소리만)
describe("seaShipsPlan", () => {
  it("같은 시각이면 누구나 같은 배 (칸마다 정해져요), 몇 분마다 한 척쯤", () => {
    const t = Date.UTC(2026, 10, 16, 3, 0, 0);
    expect(shipsAt(t)).toEqual(shipsAt(t));
    let passes = 0;
    for (let s = 0; s < 200; s++) if (shipPassOf(Math.floor(t / SHIP_SLOT_MS) + s)) passes++;
    expect(passes).toBeGreaterThan(110);
    expect(passes).toBeLessThan(170);
  });
  it("배는 먼바다 띠로만 지나가요 (놀거리·튜브·헤엄 자리보다 바깥)", () => {
    const t0 = Date.UTC(2026, 10, 16, 0, 0, 0);
    const tubeMax = Math.max(...SEA_TUBES.map((p) => p.y)) + 20;
    for (let t = t0; t < t0 + 6 * 3600_000; t += 17_000)
      for (const s of shipsAt(t)) {
        expect(s.pass.y).toBeGreaterThan(tubeMax);
        expect(s.pass.y).toBeLessThan(SEA_HEIGHT);
        expect(s.pass.y).toBeGreaterThan(SEA_JET_MIN_Y);
        expect(s.pass.y).toBeGreaterThan(TIDE_LOW_Y);
      }
  });
  it("가로지르는 데 3~4분 남짓, 한 번에 두 척 넘게 겹치지 않아요", () => {
    const t0 = Date.UTC(2026, 10, 16, 0, 0, 0);
    for (let t = t0; t < t0 + 6 * 3600_000; t += 13_000) expect(shipsAt(t).length).toBeLessThanOrEqual(2);
    const p = [...Array(50)].map((_, i) => shipPassOf(i)).find((q) => q && q.kind !== "fishing")!;
    const span = (SEA_WIDTH + 160) / p.speed;
    expect(span).toBeGreaterThan(150);
    expect(span).toBeLessThan(260);
  });
  it("오징어잡이배 3~4척, 먼바다 띠 안에서 서로 떨어져요", () => {
    const t0 = Date.UTC(2026, 10, 16, 12, 0, 0);
    for (let t = t0; t < t0 + 8 * 3600_000; t += 60_000) {
      const b = squidBoatsAt(t);
      expect(b.length).toBe(squidCount(t));
      expect(b.length).toBeGreaterThanOrEqual(3);
      for (const q of b) {
        expect(q.y).toBeGreaterThan(SHIP_LANE_Y0 - 30);
        expect(q.y).toBeLessThan(SEA_HEIGHT);
        expect(q.x).toBeGreaterThan(0);
        expect(q.x).toBeLessThan(SEA_WIDTH);
      }
      for (let a = 0; a < b.length; a++) for (let c = a + 1; c < b.length; c++) expect(Math.abs(b[a].x - b[c].x)).toBeGreaterThan(40);
    }
  });
});

// ── 11/16 r19 배 몸통: 헤엄·놀거리가 뚫고 지나가지 않아요 (밀려나기·세기·데크로 안 밀기) ──
import { DIR as DIR_R19, SEA_JETSKIS as JETS_R19, SEA_PONTOON as PONTOON_R19, onSeaDeck as onDeckR19, seaJetWater as jetWaterR19 } from "@tomb/protocol";
import { Bounce as BounceR19, BOUNCE_GAIN as GAIN_R19, resolveHulls as resolveR19, SHIP_GAIN as SHIP_GAIN_R19, type Box as BoxR19 } from "../logic/bounce";
import { rideBox as rideBoxR19 } from "./seaRideLogic";
import { SHIP_HULL_W, shipHulls, shipsAt as shipsAtR19, shipWakeAt } from "./seaShipsPlan";

const overlapR19 = (a: BoxR19, b: BoxR19) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("shipHulls (r19 단단한 배)", () => {
  it("지나가는 배마다 물높이 얇은 몸통 (큰 배 = big, 고깃배 = medium), 오징어잡이배는 밤에만", () => {
    // 배가 지나가는 때를 찾아요
    let t = Date.UTC(2026, 10, 16, 3);
    while (!shipsAtR19(t).length) t += 30_000;
    const day = shipHulls(t, false);
    expect(day.length).toBe(shipsAtR19(t).length);
    for (const h of day) {
      expect(h.box.h).toBeLessThanOrEqual(12);
      expect(h.box.w).toBeLessThanOrEqual(SHIP_HULL_W.tanker);
      expect(Math.abs(h.vx)).toBeGreaterThan(5);
    }
    const night = shipHulls(t, true);
    expect(night.length).toBeGreaterThan(day.length);
    expect(night.filter((h) => h.id.startsWith("squid:")).every((h) => h.heavy === "medium")).toBe(true);
  });

  it("헤엄치는 사람(또는 튜브)이 배 몸통 가운데에 겹치면 옆(위·아래)으로 밀려나 겹치지 않아요", () => {
    const ship: BoxR19 = { x: 400, y: 880, w: 116, h: 12 };
    const box = (x: number, y: number): BoxR19 => ({ x: x - 5, y: y - 4, w: 10, h: 6 });
    const m = { x: 458, y: 884, vx: 0, vy: 0 };
    const hit = resolveR19(m, box, [ship], () => true);
    expect(hit).not.toBeNull();
    expect(hit!.contact.nx).toBe(0);
    expect(overlapR19(box(m.x, m.y), ship)).toBe(false);
  });

  it("배가 다가와 밀면 (가만히 있어도) 배가 오는 쪽 반대로 세게 — 큰 배가 오징어잡이배보다 세요", () => {
    const c = { nx: 1, ny: 0 };
    // 배(서쪽)가 동쪽으로 10px/s로 다가와요 → 내 상대 속도 = 0 − 10
    const big = new BounceR19().hit(0, c, "tube", 0 - 10, 0, { gain: SHIP_GAIN_R19.big, minInto: 0 });
    const mid = new BounceR19().hit(0, c, "tube", 0 - 10, 0, { gain: SHIP_GAIN_R19.medium, minInto: 0 });
    expect(big).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(GAIN_R19.tube.max);
    const b = new BounceR19();
    b.hit(0, c, "jetski", 0, 0, { gain: SHIP_GAIN_R19.big, minInto: 0 });
    expect(b.vx).toBeGreaterThan(0);
  });

  it("밀어낼 쪽이 데크면 물 쪽(옆)으로 — 부잔교 안으로는 안 밀어요", () => {
    // 부잔교 동쪽 물의 제트스키, 동쪽에서 배 몸통이 겹쳐 옴 (서쪽 = 데크라 막혀요)
    const m = { x: PONTOON_R19.x + PONTOON_R19.w + 16, y: PONTOON_R19.y + 100, vx: 0, vy: 0 };
    expect(jetWaterR19(m.x, m.y)).toBe(true);
    const box = (x: number, y: number) => rideBoxR19("jetski", DIR_R19.right, x, y);
    const me = box(m.x, m.y);
    const ship: BoxR19 = { x: me.x + 6, y: me.y - 2, w: 60, h: 12 };
    resolveR19(m, box, [ship], jetWaterR19);
    expect(onDeckR19(m.x, m.y)).toBe(false);
    expect(jetWaterR19(m.x, m.y)).toBe(true);
    expect(overlapR19(box(m.x, m.y), ship)).toBe(false);
    void JETS_R19;
  });

  it("배 물결은 몸통 가까이에서 세고 멀면 0 (큰 배가 더 세요)", () => {
    const hs = [{ id: "a", box: { x: 400, y: 880, w: 116, h: 12 }, vx: 10, vy: 0, heavy: "big" as const }];
    expect(shipWakeAt(458, 870, hs)).toBeGreaterThan(0.7);
    expect(shipWakeAt(458, 700, hs)).toBe(0);
    expect(shipWakeAt(458, 870, [{ ...hs[0], heavy: "medium" }])).toBeLessThan(shipWakeAt(458, 870, hs));
  });
});

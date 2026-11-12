import { isFireworkId, itemById, ITEMS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { fireworkPlan } from "./fxMath";
import {
  burstSparks,
  fireworkShots,
  fireworkSpecial,
  FW_COLORS,
  smilePoints,
  sparkOffset,
  starPoint,
  stepSpark,
  type FwPattern,
  type SparkState,
} from "./fwShapes";

const FIREWORKS = ITEMS.filter((i) => isFireworkId(i.id));
const fixed = () => 0.5;
const all = (n: number) => n;

describe("폭죽 종류", () => {
  it("14종 이상, 값은 경제 표(60~740P) 안, 종류마다 터지는 모양이 다르다", () => {
    expect(FIREWORKS.length).toBeGreaterThanOrEqual(14);
    const looks = new Set<string>();
    for (const it of FIREWORKS) {
      expect(it.price).toBeGreaterThanOrEqual(60);
      expect(it.price).toBeLessThanOrEqual(740);
      const plan = fireworkPlan(it.power);
      const special = fireworkSpecial(it.id, plan);
      const shots = special ? [] : fireworkShots(it.id, plan);
      if (!special) expect(shots.length).toBeGreaterThan(0);
      looks.add(special ?? shots.map((s) => `${s.pattern}:${s.colors[0]}`).join(","));
    }
    expect(looks.size).toBe(FIREWORKS.length);
  });

  it("새 폭죽은 실시간 서버·증서 검증이 받아 준다", () => {
    for (const id of ["fw_fountain", "fw_ring", "fw_star", "fw_spiral", "fw_willow", "fw_crossette", "fw_smile", "fw_waterfall"]) {
      expect(isFireworkId(id)).toBe(true);
    }
  });

  it("모르는 폭죽(옛 클라이언트)은 power 1 기본 금빛 폭죽으로 터진다", () => {
    const plan = fireworkPlan(itemById("fw_future")?.power);
    expect(fireworkSpecial("fw_future", plan)).toBeNull();
    expect(fireworkShots("fw_future", plan)).toEqual([expect.objectContaining({ pattern: "peony", colors: FW_COLORS.gold })]);
  });

  it("분수는 땅에서 뿜고, 삼연발은 세 발", () => {
    expect(fireworkShots("fw_fountain", fireworkPlan(1))[0].ground).toBe(true);
    expect(fireworkShots("fw_triple", fireworkPlan(itemById("fw_triple")?.power))).toHaveLength(3);
  });
});

describe("폭죽 무늬", () => {
  const patterns: FwPattern[] = ["peony", "ring", "heart", "willow", "double", "brocade", "star", "spiral", "crossette", "fountain", "waterfall", "smile"];

  it("모든 무늬가 불티를 만들고, 입자 한도(budget)를 지킨다", () => {
    for (const p of patterns) {
      const sparks = burstSparks(p, 40, FW_COLORS.gold, { life: 1, size: 1, budget: all, rand: fixed });
      expect(sparks.length, p).toBeGreaterThan(10);
      for (const s of sparks) {
        expect(Number.isFinite(s.vx) && Number.isFinite(s.vy) && s.life > 0, p).toBe(true);
      }
      const few = burstSparks(p, 40, FW_COLORS.gold, { life: 1, size: 1, budget: (n) => Math.round(n * 0.3), rand: fixed });
      expect(few.length, p).toBeLessThan(sparks.length);
    }
  });

  it("오각별 꼭짓점과 웃는 얼굴 점", () => {
    expect(starPoint(0).y).toBeCloseTo(-1);
    expect(Math.hypot(starPoint(Math.PI / 5).x, starPoint(Math.PI / 5).y)).toBeCloseTo(0.45);
    const face = smilePoints(20, 4, 9);
    expect(face).toHaveLength(20 + 8 + 9);
    // 입은 눈보다 아래
    const mouth = face.filter((p) => p.part === "mouth");
    const eye = face.filter((p) => p.part === "eye");
    expect(Math.min(...mouth.map((p) => p.y))).toBeGreaterThan(Math.max(...eye.map((p) => p.y)));
  });

  it("이중 폭발: 두 번째 불꽃은 첫 불티가 그때 닿은 자리에서 터진다", () => {
    const sparks = burstSparks("crossette", 40, FW_COLORS.red, { life: 1, size: 1, budget: all, rand: fixed });
    const first = sparks.find((s) => !s.at)!;
    const second = sparks.find((s) => s.at && s.ox !== undefined)!;
    const st: SparkState = { x: 0, y: 0, vx: first.vx, vy: first.vy, age: 0, life: 9e9, drag: first.drag, grav: first.grav, size: 1, swapAt: Infinity, fadeFrom: 0 };
    for (let t = 0; t < second.at!; t += 2) stepSpark(st, 2);
    expect(st.x).toBeCloseTo(second.ox!, 0);
    expect(st.y).toBeCloseTo(second.oy!, 0);
  });

  it("sparkOffset은 한 걸음씩 움직인 거리와 같다", () => {
    const st: SparkState = { x: 0, y: 0, vx: 30, vy: -40, age: 0, life: 9e9, drag: 1.2, grav: 26, size: 1, swapAt: Infinity, fadeFrom: 0 };
    for (let t = 0; t < 1000; t += 1) stepSpark(st, 1);
    const o = sparkOffset(30, -40, 1.2, 26, 1);
    expect(st.x).toBeCloseTo(o.x, 0);
    expect(st.y).toBeCloseTo(o.y, 0);
  });
});

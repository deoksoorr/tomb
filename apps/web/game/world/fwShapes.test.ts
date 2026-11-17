import { isFireworkId, itemById, ITEMS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { fireworkPlan } from "./fxMath";
import {
  burstSparks,
  butterflyPoint,
  fireworkShots,
  fireworkSpecial,
  FW_COLORS,
  rocketTrail,
  smilePoints,
  snowPoints,
  sparkLook,
  sparkOffset,
  sparkState,
  sparkTrail,
  starPoint,
  stepSpark,
  type FwPattern,
  type SparkState,
} from "./fwShapes";

const FIREWORKS = ITEMS.filter((i) => isFireworkId(i.id));
const NEW_IDS = ["fw_twinring", "fw_butterfly", "fw_snow", "fw_strobe", "fw_chameleon", "fw_glitter", "fw_palm", "fw_tower"];
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
    for (const id of ["fw_fountain", "fw_ring", "fw_star", "fw_spiral", "fw_willow", "fw_crossette", "fw_smile", "fw_waterfall", ...NEW_IDS]) {
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
  const patterns: FwPattern[] = [
    "peony",
    "ring",
    "heart",
    "willow",
    "double",
    "brocade",
    "star",
    "spiral",
    "crossette",
    "fountain",
    "waterfall",
    "smile",
    "twinring",
    "butterfly",
    "snow",
    "strobe",
    "chameleon",
    "glitter",
    "palm",
  ];

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

describe("새 폭죽 8종", () => {
  const opts = { life: 1, size: 1, budget: all, rand: fixed };
  /** 불티 하나를 끝까지 걸려 꼬리 불티 수를 센다 (게임·미리보기와 같은 순서: 걸음 → 꼬리) */
  const tails = (spec: Parameters<typeof sparkState>[2], reduced = false) => {
    const p = sparkState(0, 0, spec);
    let n = 0;
    for (let t = 0; t < spec.life; t += 16) {
      p.age += 16;
      stepSpark(p, 16, fixed);
      if (sparkTrail(p, reduced)) n++;
    }
    return n;
  };

  it("카탈로그: 값은 기존 폭죽 값대(130~290P), 세기는 값에 맞게(2~3), 이름이 겹치지 않는다", () => {
    const names = new Set(FIREWORKS.map((f) => f.name));
    expect(names.size).toBe(FIREWORKS.length);
    for (const id of NEW_IDS) {
      const it = itemById(id)!;
      expect(it.kind, id).toBe("firework");
      expect(it.price).toBeGreaterThanOrEqual(130);
      expect(it.price).toBeLessThanOrEqual(290);
      expect(it.power).toBe(it.price < 200 ? 2 : 3);
    }
  });

  it("버드나무·금가루·야자수·색바꿈 국화는 지나간 자리에 꼬리를 남긴다 (reduced면 절반쯤)", () => {
    for (const p of ["willow", "glitter", "palm", "chameleon"] as const) {
      const sp = burstSparks(p, 40, FW_COLORS.gold, opts).find((s) => s.trail)!;
      expect(sp, p).toBeDefined();
      const full = tails(sp);
      expect(full, p).toBeGreaterThan(3);
      expect(tails(sp, true), p).toBeLessThan(full * 0.7);
    }
    // 그냥 고리는 꼬리가 없다
    expect(burstSparks("ring", 40, FW_COLORS.cyan, opts).some((s) => s.trail)).toBe(false);
  });

  it("버드나무 가지는 바깥으로 뻗다가 아래로 늘어진다", () => {
    const sp = burstSparks("willow", 40, FW_COLORS.gold, opts).find((s) => Math.abs(s.vx) > Math.abs(s.vy) * 3)!;
    const p = sparkState(0, 0, sp);
    const ys: number[] = [];
    for (let t = 0; t < 2600; t += 16) {
      stepSpark(p, 16);
      if (t % 400 < 16) ys.push(p.y);
    }
    // 처음엔 거의 옆으로, 갈수록 더 빨리 아래로 (휘어 내린다)
    expect(Math.abs(p.x)).toBeGreaterThan(25);
    expect(ys[ys.length - 1]).toBeGreaterThan(20);
    expect(ys[ys.length - 1] - ys[ys.length - 2]).toBeGreaterThan(ys[1] - ys[0]);
  });

  it("색바꿈 국화는 가는 길 중간에 색이 바뀐다 (바뀐 순간 stepSpark가 알려 준다)", () => {
    const sp = burstSparks("chameleon", 40, FW_COLORS.red, opts)[0];
    expect(FW_COLORS.red as readonly number[]).toContain(sp.color);
    const p = sparkState(0, 0, sp);
    let changedAt = -1;
    for (let t = 16; t < 1500; t += 16) {
      p.age = t;
      if (stepSpark(p, 16)) changedAt = t;
    }
    expect(changedAt).toBeGreaterThan(400);
    expect(changedAt).toBeLessThan(800);
    expect(FW_COLORS.green as readonly number[]).toContain(p.color);
  });

  it("별빛 점멸은 처음부터 깜빡이고, reduced면 깜빡이지 않는다", () => {
    const sp = burstSparks("strobe", 40, FW_COLORS.silver, opts)[0];
    const p = sparkState(0, 0, sp);
    const seen = new Set<number>();
    for (let t = 0; t < 400; t += 10) {
      p.age = t;
      seen.add(Math.round(sparkLook(p, false).alpha * 10));
    }
    expect(seen.size).toBeGreaterThan(1);
    const calm = burstSparks("strobe", 40, FW_COLORS.silver, { ...opts, reduced: true })[0];
    expect(calm.strobe).toBeUndefined();
  });

  it("나비·눈꽃 모양: 위 날개가 아래 날개보다 크고, 눈꽃은 여섯 갈래 끝이 반지름 1", () => {
    const up = Math.hypot(butterflyPoint(-Math.PI / 4).x, butterflyPoint(-Math.PI / 4).y);
    const down = Math.hypot(butterflyPoint(Math.PI / 4).x, butterflyPoint(Math.PI / 4).y);
    expect(up).toBeGreaterThan(down);
    const tips = snowPoints(1).filter((p) => Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-6);
    expect(tips).toHaveLength(6);
  });

  it("3단 불꽃탑은 한 자리에서 세 발이 점점 높이·크게, 야자수 로켓은 굵은 줄기를 남긴다", () => {
    const shots = fireworkShots("fw_tower", fireworkPlan(itemById("fw_tower")?.power));
    expect(shots).toHaveLength(3);
    expect(new Set(shots.map((s) => s.dx)).size).toBe(1);
    for (let i = 1; i < 3; i++) {
      expect(shots[i].h).toBeGreaterThan(shots[i - 1].h);
      expect(shots[i].scale!).toBeGreaterThan(shots[i - 1].scale!);
      expect(shots[i].delay).toBeGreaterThan(shots[i - 1].delay);
    }
    expect(rocketTrail("palm", 3, fixed).length).toBeGreaterThan(rocketTrail("peony", 3, fixed).length);
    expect(rocketTrail("brocade", 4, fixed)).toHaveLength(2);
  });
});

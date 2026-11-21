import { fireworkShowMs, isFireworkId, itemById, ITEMS } from "@tomb/protocol";
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
  emojiMask,
  FW_EMOJI,
  type FwPattern,
  type SparkState,
} from "./fwShapes";
import { showProgram } from "./fwShow";

const FIREWORKS = ITEMS.filter((i) => isFireworkId(i.id));
const NEW_IDS = ["fw_twinring", "fw_butterfly", "fw_snow", "fw_strobe", "fw_chameleon", "fw_glitter", "fw_palm", "fw_tower"];
const fixed = () => 0.5;
const all = (n: number) => n;

describe("폭죽 종류", () => {
  it("14종 이상, 값은 경제 표(60~740P, 광역 불꽃쇼만 2000P까지) 안, 종류마다 터지는 모양이 다르다", () => {
    expect(FIREWORKS.length).toBeGreaterThanOrEqual(14);
    const looks = new Set<string>();
    for (const it of FIREWORKS) {
      expect(it.price).toBeGreaterThanOrEqual(60);
      expect(it.price).toBeLessThanOrEqual(fireworkShowMs(it.id) > 0 ? 2000 : 740);
      const plan = fireworkPlan(it.power);
      const special = fireworkSpecial(it.id, plan);
      const shots = special ? [] : fireworkShots(it.id, plan);
      if (!special) expect(shots.length).toBeGreaterThan(0);
      looks.add(special === "show" ? `show:${it.id}` : (special ?? shots.map((s) => `${s.pattern}:${s.colors[0]}`).join(",")));
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
    "kiku",
    "niagara",
    "kamuro",
    "rainbow",
    "crackle",
    "whistle",
    "fish",
    "parachute",
    "cascade",
    "pinwheel",
    "emoji",
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

describe("11/20 새 폭죽 13종 + 광역 불꽃쇼", () => {
  const NEW = ["fw_crackle", "fw_emoji", "fw_parachute", "fw_whistle", "fw_fish", "fw_pinwheel", "fw_rainbow", "fw_kiku", "fw_cascade", "fw_fountainrow", "fw_aurora", "fw_kamuro", "fw_niagara"];
  const opts = { life: 1, size: 1, budget: all, rand: fixed };

  it("카탈로그: 세기는 값에 맞게 (2 < 200P ≤ 3 < 380P ≤ 4), 쇼는 세기 5 · 900P/2000P", () => {
    for (const id of NEW) {
      const it = itemById(id)!;
      expect(it.kind, id).toBe("firework");
      expect(it.power, id).toBe(it.price < 200 ? 2 : it.price < 380 ? 3 : 4);
      expect(fireworkShowMs(id), id).toBe(0);
    }
    expect(itemById("fw_town")).toMatchObject({ price: 900, power: 5 });
    expect(itemById("fw_hangang")).toMatchObject({ price: 2000, power: 5 });
    expect(fireworkSpecial("fw_hangang", fireworkPlan(5))).toBe("show");
    expect(fireworkSpecial("fw_aurora", fireworkPlan(3))).toBe("aurora");
    expect(fireworkShots("fw_fountainrow", fireworkPlan(3)).filter((s) => s.ground)).toHaveLength(5);
  });

  it("물고기 떼는 옆으로 꿈틀대고, 낙하산 별은 거의 멈춘 채 좌우로 흔들리며 오래 떠 있다", () => {
    const fish = burstSparks("fish", 40, FW_COLORS.cyan, opts)[0];
    const a = sparkState(0, 0, fish);
    const b = sparkState(0, 0, { ...fish, wig: 0 });
    for (let t = 0; t < 400; t += 16) {
      a.age += 16;
      b.age += 16;
      stepSpark(a, 16, fixed);
      stepSpark(b, 16, fixed);
    }
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    const stars = burstSparks("parachute", 40, FW_COLORS.silver, opts).filter((s) => s.life > 4000);
    expect(stars.length).toBeGreaterThan(3);
    expect(stars.every((s) => (s.wig ?? 0) > 0)).toBe(true);
  });

  it("팝콘·연쇄 국화는 뒤늦게 다시 터지고, 바람개비는 시간을 두고 돌며 뿌린다, 나이아가라는 왼쪽부터 붙는다", () => {
    expect(burstSparks("crackle", 40, FW_COLORS.gold, opts).some((s) => (s.at ?? 0) > 400 && s.pop)).toBe(true);
    expect(burstSparks("cascade", 40, FW_COLORS.gold, opts).filter((s) => (s.at ?? 0) > 600).length).toBeGreaterThan(20);
    const pin = burstSparks("pinwheel", 40, FW_COLORS.gold, opts);
    expect(Math.max(...pin.map((s) => s.at ?? 0))).toBeGreaterThan(1500);
    const line = burstSparks("niagara", 40, FW_COLORS.gold, opts).filter((s) => s.drag === 3);
    expect(line[0].ox!).toBeLessThan(0);
    expect(line[line.length - 1].at!).toBeGreaterThan(line[0].at ?? 0);
  });

  it("하늘 이모티콘은 기호 모양 점으로 서고, 무지개는 일곱 색 띠", () => {
    expect(emojiMask(FW_EMOJI[1].rows).pts.length).toBeGreaterThan(40);
    expect(burstSparks("emoji", 40, FW_COLORS.pink, opts).length).toBeGreaterThan(30);
    expect(new Set(burstSparks("rainbow", 40, FW_COLORS.red, opts).map((s) => s.color)).size).toBeGreaterThanOrEqual(7);
  });

  it("한강 불꽃쇼: 35초 남짓, 일제 발사·나이아가라(화면 너비)·오로라·30발 몰아치기·금빛 왕관, 화면 안 자리", () => {
    const p = showProgram("fw_hangang", false, fixed);
    const last = Math.max(...p.shots.map((s) => s.delay));
    expect(last).toBeGreaterThan(33_000);
    expect(p.ms).toBeLessThanOrEqual(fireworkShowMs("fw_hangang"));
    expect(p.shots.length).toBeGreaterThan(110);
    expect(p.shots.some((s) => s.pattern === "niagara" && (s.rw ?? 0) > 0.25)).toBe(true);
    expect(p.auroras.length).toBeGreaterThan(0);
    expect(p.shots.filter((s) => s.delay > 30_000 + 600 && s.delay < 34_500).length).toBeGreaterThanOrEqual(30);
    expect(p.shots.filter((s) => s.pattern === "kamuro").length).toBeGreaterThanOrEqual(5);
    for (const s of p.shots) {
      expect(s.fx).toBeGreaterThan(0);
      expect(s.fx).toBeLessThan(1);
      expect(s.fy).toBeLessThan(0.5);
    }
    // 첫 일제 발사는 왼쪽 → 오른쪽
    const first = p.shots.slice(0, 9).map((s) => s.fx);
    expect(first).toEqual([...first].sort((a, b) => a - b));
  });

  it("동네 불꽃 한마당은 짧고, reduced면 발 수가 줄고 타닥·휘슬·꿈틀이 빠진다", () => {
    const town = showProgram("fw_town", false, fixed);
    expect(Math.max(...town.shots.map((s) => s.delay))).toBeLessThan(15_000);
    expect(town.ms).toBeLessThanOrEqual(fireworkShowMs("fw_town"));
    const calm = showProgram("fw_hangang", true, fixed);
    expect(calm.shots.length).toBeLessThan(showProgram("fw_hangang", false, fixed).shots.length * 0.7);
    expect(calm.shots.some((s) => s.pattern === "crackle" || s.pattern === "whistle" || s.pattern === "fish")).toBe(false);
  });
});

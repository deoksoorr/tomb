import { describe, expect, it } from "vitest";
import { BUG_SLOTS, comboMult } from "@/lib/rpg/plan";
import {
  comboShout,
  comboTier,
  DECOR_PAD,
  flyFrom,
  flyInMs,
  HIT_MAX,
  HIT_MIN,
  insectArt,
  landEase,
  meadowDecor,
  meadowLayout,
  meadowTone,
  perchOf,
  pickBush,
} from "./meadowLayout";

// 32번 곤충 채집 들판의 순수 계산 검사: 덤불 배치(3줄·엇갈림·안 겹침), 탭 판정(넉넉하고 가까운 쪽), 꾸미기 자리, 시간대·곤충·콤보.

describe("덤불 배치", () => {
  for (const portrait of [false, true]) {
    const l = meadowLayout(portrait);
    describe(portrait ? "세로 화면" : "가로 화면", () => {
      it("9개, 칸 번호가 키 순서(Q W E / A S D / Z X C)와 같다", () => {
        expect(l.bushes).toHaveLength(BUG_SLOTS);
        l.bushes.forEach((b, i) => expect(b.slot).toBe(i));
        // 줄마다 왼쪽 → 오른쪽, 위 줄이 위에
        for (let r = 0; r < 3; r++) {
          const row = l.bushes.slice(r * 3, r * 3 + 3);
          expect(row[0].x).toBeLessThan(row[1].x);
          expect(row[1].x).toBeLessThan(row[2].x);
          if (r > 0) expect(Math.min(...row.map((b) => b.y))).toBeGreaterThan(Math.max(...l.bushes.slice(r * 3 - 3, r * 3).map((b) => b.y)));
        }
      });

      it("덤불 구역 안에 다 들어오고 서로 겹치지 않는다", () => {
        for (const b of l.bushes) {
          expect(b.x - b.r).toBeGreaterThanOrEqual(0);
          expect(b.x + b.r).toBeLessThanOrEqual(l.w);
          expect(b.y - b.r).toBeGreaterThanOrEqual(0);
          expect(b.y + b.r).toBeLessThanOrEqual(l.h);
        }
        for (const a of l.bushes) for (const b of l.bushes) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r + 8);
      });

      it("바둑판이 아니다: 줄마다 엇갈리고 크기가 조금씩 다르다", () => {
        const firstX = [0, 3, 6].map((i) => l.bushes[i].x);
        expect(new Set(firstX).size).toBe(3);
        expect(new Set(l.bushes.map((b) => b.r)).size).toBeGreaterThan(3);
        // 같은 줄 안에서도 높이가 조금씩 다르다
        expect(new Set(l.bushes.slice(0, 3).map((b) => b.y)).size).toBeGreaterThan(1);
      });

      it("탭 판정: 덤불 가운데·곤충 자리·둘레는 그 덤불, 멀리 빈 들판은 -1", () => {
        expect(l.hit).toBeGreaterThanOrEqual(HIT_MIN);
        expect(l.hit).toBeLessThanOrEqual(HIT_MAX);
        for (const b of l.bushes) {
          expect(pickBush(l, b.x, b.y)).toBe(b.slot);
          const p = perchOf(b);
          expect(pickBush(l, p.x, p.y)).toBe(b.slot);
          // 덤불 그림 가장자리보다 바깥(손가락 크기)까지 눌린다
          for (const [dx, dy] of [[b.r + 6, 0], [-(b.r + 6), 0], [0, b.r * 0.8 + 6], [0, -(b.r + 6)]]) expect(pickBush(l, b.x + dx, b.y + dy)).toBe(b.slot);
        }
        expect(pickBush(l, -200, -200)).toBe(-1);
        expect(pickBush(l, l.w + 200, l.h / 2)).toBe(-1);
      });

      it("두 덤불 사이에서는 가까운 쪽이 이긴다", () => {
        const [a, b] = l.bushes;
        const ax = a.x + (b.x - a.x) * 0.4;
        const ay = a.y - a.r * 0.2 + (b.y - b.r * 0.2 - (a.y - a.r * 0.2)) * 0.4;
        expect(pickBush(l, ax, ay)).toBe(a.slot);
        const bx = a.x + (b.x - a.x) * 0.6;
        const by = a.y - a.r * 0.2 + (b.y - b.r * 0.2 - (a.y - a.r * 0.2)) * 0.6;
        expect(pickBush(l, bx, by)).toBe(b.slot);
      });
    });
  }

  it("세로 화면은 줄 사이가 더 넓다", () => {
    const land = meadowLayout(false);
    const port = meadowLayout(true);
    expect(port.bushes[6].y - port.bushes[0].y).toBeGreaterThan(land.bushes[6].y - land.bushes[0].y);
  });
});

describe("들판 꾸미기", () => {
  for (const portrait of [false, true]) {
    const l = meadowLayout(portrait);
    const d = meadowDecor(l);
    it(`${portrait ? "세로" : "가로"}: 웅덩이 하나, 덤불과 안 겹치고, 늘 같은 자리, y 순서`, () => {
      expect(d.filter((x) => x.kind === "pond")).toHaveLength(1);
      expect(d.filter((x) => x.kind === "tuft").length).toBeGreaterThan(10);
      for (const x of d) {
        for (const b of l.bushes) expect(Math.hypot(x.x - b.x, x.y - b.y)).toBeGreaterThanOrEqual(b.r + 6);
        expect(x.x).toBeGreaterThanOrEqual(-DECOR_PAD.x - 80);
        expect(x.x).toBeLessThanOrEqual(l.w + DECOR_PAD.x + 80);
      }
      for (let i = 1; i < d.length; i++) expect(d[i].y).toBeGreaterThanOrEqual(d[i - 1].y);
      expect(meadowDecor(l)).toEqual(d);
    });
  }
});

describe("시간대", () => {
  it("한국 시각 시간대 → 낮·노을·밤 (새벽은 낮)", () => {
    expect(meadowTone("day", false)).toBe("day");
    expect(meadowTone("dawn", false)).toBe("day");
    expect(meadowTone("dusk", true)).toBe("dusk");
    expect(meadowTone("night", true)).toBe("night");
  });

  it("시간대를 모르는 옛 서버 응답이면 밤 여부만으로", () => {
    expect(meadowTone(undefined, true)).toBe("night");
    expect(meadowTone(undefined, false)).toBe("day");
    expect(meadowTone(undefined, undefined)).toBe("day");
  });
});

describe("곤충·콤보", () => {
  it("보통 곤충은 시간대마다 다르고, 나머지는 늘 같다", () => {
    expect(insectArt("bug", "day")).toBe("butterfly");
    expect(insectArt("bug", "dusk")).toBe("dragonfly");
    expect(insectArt("bug", "night")).toBe("firefly");
    for (const t of ["day", "dusk", "night"] as const) {
      expect(insectArt("golden", t)).toBe("golden");
      expect(insectArt("feature", t)).toBe("bee");
      expect(insectArt("decoy", t)).toBe("leaf");
    }
  });

  it("콤보 단계는 점수 배수가 오를 때 함께 오른다 (0..4)", () => {
    expect(comboTier(0)).toBe(0);
    expect(comboTier(4)).toBe(0);
    expect(comboTier(5)).toBe(1);
    expect(comboTier(19)).toBe(3);
    expect(comboTier(20)).toBe(4);
    expect(comboTier(99)).toBe(4);
    for (let c = 1; c < 40; c++) if (comboMult(c) > comboMult(c - 1) && c <= 20) expect(comboTier(c)).toBeGreaterThan(comboTier(c - 1));
  });

  it("큰 콤보에만 짧은 외침", () => {
    expect(comboShout(3)).toBeNull();
    expect(comboShout(5)).toBe("좋아요!");
    expect(comboShout(7)).toBeNull();
    expect(comboShout(20)).toBe("채집 달인!");
    expect(comboShout(25)).toBeNull();
    expect(comboShout(30)).toBe("30콤보!");
    for (let c = 5; c <= 20; c += 5) expect(comboShout(c)!.length).toBeLessThanOrEqual(6);
  });
});

describe("날아 들어오기", () => {
  it("머무는 시간의 앞쪽 일부만 (판정 시간은 그대로)", () => {
    for (const life of [430, 700, 1000, 1300]) {
      const f = flyInMs(life);
      expect(f).toBeGreaterThanOrEqual(120);
      expect(f).toBeLessThanOrEqual(320);
      expect(f).toBeLessThan(life * 0.5);
    }
  });

  it("출발점은 앉을 자리에서 떨어진 위쪽, 낙엽은 바로 위", () => {
    const to = { x: 100, y: 100 };
    for (let n = 0; n < 6; n++) {
      const p = flyFrom("butterfly", to, 3, n);
      expect(Math.hypot(p.x - to.x, p.y - to.y)).toBeGreaterThan(100);
      expect(p.y).toBeLessThan(to.y + 40);
      const leaf = flyFrom("leaf", to, 3, n);
      expect(leaf.y).toBeLessThan(to.y - 50);
      expect(Math.abs(leaf.x - to.x)).toBeLessThanOrEqual(12);
    }
    expect(flyFrom("bee", to, 1, 0)).toEqual(flyFrom("bee", to, 1, 0));
  });

  it("내려앉기는 0에서 1로 늘기만 한다", () => {
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const v = landEase(k);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(landEase(0)).toBe(0);
    expect(landEase(1)).toBe(1);
    expect(landEase(2)).toBe(1);
  });
});

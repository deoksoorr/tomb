import { describe, expect, it } from "vitest";
import { isNameSlot, ITEMS, PERMANENT_MULTIPLIER, PERMANENT_UNTIL } from "@tomb/protocol";
import { hasItemIcon } from "@/game/sprites/itemIcons";
import { COSMETIC_DROPS } from "./rpg/catalog";
import { itemLookScore, itemLookValue, LOOK_SCORE_DIVISOR, lookScore, wornParts } from "./lookScore";
import {
  contrast,
  cssGradient,
  cyclicAt,
  fillEdgeColors,
  flameColor,
  gradientAt,
  hasNameStyle,
  mixColor,
  NAME_COLORS,
  NAME_OUTLINE,
  NAME_PLATES,
  nameColorSpec,
  nameColorSwatches,
  nameEdgeColors,
  namePlateSpec,
  nameStyleIds,
  nameStyleRef,
} from "./nameStyle";
import { boardWithNameStyles, withNameStyles } from "./nameStyleRank";
import { MemoryLookRank } from "./store/lookRank";

// 닉네임 꾸미기: 색 정의·그라데이션 계산(순수)·읽기 쉬움(대비)·꾸미기 점수·랭킹 줄 이름 색

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const nameItems = ITEMS.filter((i) => isNameSlot(i.slot));

describe("색 정의", () => {
  it("상점의 닉네임 꾸미기마다 색(또는 판)과 아이콘이 있고, 정의는 그 부위 아이템에만 있다", () => {
    for (const it of nameItems) {
      if (it.slot === "nameColor") expect(nameColorSpec(it.id), it.id).not.toBeNull();
      else expect(namePlateSpec(it.id), it.id).not.toBeNull();
      expect(hasItemIcon(it.id), it.id).toBe(true);
    }
    expect(Object.keys(NAME_COLORS).length + Object.keys(NAME_PLATES).length).toBe(nameItems.length);
    // 부위가 다른 id를 거꾸로 넣거나 모르는 id면 없음
    expect(nameColorSpec("np_wood")).toBeNull();
    expect(namePlateSpec("nc_sky")).toBeNull();
    expect(nameColorSpec("hat_cat")).toBeNull();
    expect(nameColorSpec("nc_future")).toBeNull();
    expect(nameColorSpec(null)).toBeNull();
  });

  it("종류: 단색 8 · 그라데이션 6 · 움직이는 4 (빛 테두리·무지개·별가루·불꽃)", () => {
    const kinds = Object.values(NAME_COLORS).map((s) => (s.kind === "fx" ? s.fx : s.kind));
    expect(kinds.filter((k) => k === "solid").length).toBe(8);
    expect(kinds.filter((k) => k === "gradient").length).toBe(6);
    expect(kinds.filter((k) => k !== "solid" && k !== "gradient").sort()).toEqual(["flame", "glow", "rainbow", "stars"]);
  });

  it("읽기 쉬움: 모든 글자 색이 이름표 외곽선(밤 어둠 위)과 7:1 이상 대비, 기본 이름표 색과는 다르다", () => {
    for (const id of Object.keys(NAME_COLORS))
      for (const c of nameColorSwatches(id)) {
        expect(contrast(c, NAME_OUTLINE), `${id} ${c.toString(16)}`).toBeGreaterThanOrEqual(7);
        expect(c).not.toBe(0xd9dccf); // LABEL_OTHER
      }
    // 움직이는 불꽃이 지나가는 색도 (시각 여러 개)
    for (let t = 0; t < 3000; t += 137)
      for (let i = 0; i < 12; i++) {
        expect(contrast(flameColor(i, t, true), NAME_OUTLINE)).toBeGreaterThanOrEqual(7);
        expect(contrast(flameColor(i, t, false), NAME_OUTLINE)).toBeGreaterThanOrEqual(7);
      }
  });
});

describe("그라데이션 계산 (순수)", () => {
  it("두 색 섞기·띠 위의 색", () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xff0080, 0.5)).toBe(0x800040);
    expect(mixColor(0x102030, 0x405060, 2)).toBe(0x405060); // 밖은 끝 색
    const stops = [0xff0000, 0x00ff00, 0x0000ff];
    expect(gradientAt(stops, 0)).toBe(0xff0000);
    expect(gradientAt(stops, 0.5)).toBe(0x00ff00);
    expect(gradientAt(stops, 1)).toBe(0x0000ff);
    expect(gradientAt(stops, 0.25)).toBe(0x808000);
    expect(gradientAt(stops, -1)).toBe(0xff0000);
    expect(gradientAt([0x123456], 0.7)).toBe(0x123456);
  });

  it("고리 띠: 한 바퀴(1)마다 같은 색, 끝에서 첫 색으로 이어진다", () => {
    const stops = [0xff0000, 0x00ff00];
    expect(cyclicAt(stops, 0)).toBe(0xff0000);
    expect(cyclicAt(stops, 0.5)).toBe(0x00ff00);
    expect(cyclicAt(stops, 0.75)).toBe(0x808000);
    expect(cyclicAt(stops, 1.25)).toBe(cyclicAt(stops, 0.25));
    expect(cyclicAt(stops, -0.25)).toBe(cyclicAt(stops, 0.75));
  });

  it("글자 경계 색: 글자 n개면 n+1개, 첫·끝은 띠의 양 끝, 배열을 고쳐 쓴다", () => {
    const out: number[] = [];
    const e = fillEdgeColors(out, [0x000000, 0xffffff], 4);
    expect(e).toBe(out);
    expect(e).toEqual([0x000000, 0x404040, 0x808080, 0xbfbfbf, 0xffffff]);
    // 짧아진 이름 → 배열 길이도 줄어든다 (새 배열을 만들지 않는다)
    expect(fillEdgeColors(out, [0x000000, 0xffffff], 2)).toEqual([0x000000, 0x808080, 0xffffff]);
    expect(out.length).toBe(3);
    // 0글자도 깨지지 않는다
    expect(fillEdgeColors([], [0x112233], 0)).toEqual([0x112233, 0x112233]);
    // 흐르는 띠 (phase): 시각이 한 바퀴 지나면 같은 색
    expect(fillEdgeColors([], [0xff0000, 0x00ff00, 0x0000ff], 5, 0.3)).toEqual(fillEdgeColors([], [0xff0000, 0x00ff00, 0x0000ff], 5, 1.3));
  });

  it("아이템별 경계 색: 단색은 모두 같은 색, 그라데이션은 처음·끝이 정의된 양 끝 색, 긴 이름(12자)도", () => {
    expect(nameEdgeColors("nc_sky", 3)).toEqual([0x8fd3ff, 0x8fd3ff, 0x8fd3ff, 0x8fd3ff]);
    const sunset = nameEdgeColors("ng_sunset", 12)!;
    expect(sunset.length).toBe(13);
    expect(sunset[0]).toBe(0xffb35c);
    expect(sunset[12]).toBe(0xc79bff);
    expect(sunset[6]).toBe(0xff7fa6);
    expect(nameEdgeColors("np_wood", 3)).toBeNull();
    expect(nameEdgeColors("nope", 3)).toBeNull();
  });

  it("CSS 그라데이션", () => {
    expect(cssGradient([0xff0000, 0x00ff00])).toBe("linear-gradient(90deg, #ff0000, #00ff00)");
    expect(cssGradient([0x0000ff])).toBe("linear-gradient(90deg, #0000ff, #0000ff)");
    expect(cssGradient([0xff0000, 0x00ff00], true)).toBe("linear-gradient(90deg, #ff0000, #00ff00, #ff0000)");
  });
});

describe("착용 목록 → 닉네임 꾸미기", () => {
  it("이름 글자·이름표만 고르고, 모르는 id는 무시한다", () => {
    expect(nameStyleRef(["hat_cat", "ng_sea", "np_cloud"])).toEqual({ color: "ng_sea", plate: "np_cloud" });
    expect(nameStyleRef(["nc_future", "np_wood"])).toEqual({ color: null, plate: "np_wood" });
    expect(hasNameStyle(nameStyleRef(["hat_cat"]))).toBe(false);
    expect(nameStyleIds(["pet_cat", "np_star", "nf_flame"])).toEqual(["nf_flame", "np_star"]);
    expect(nameStyleIds(["pet_cat"])).toBeUndefined();
    expect(nameStyleIds(null)).toBeUndefined();
  });
});

describe("꾸미기 점수 (기존 공식: 영구 소장 기준 가치 ÷ 5)", () => {
  it("닉네임 꾸미기도 이용권 값 × 영구 배수 ÷ 5", () => {
    for (const it of nameItems) {
      expect(itemLookValue(it.id)).toBe(it.price * PERMANENT_MULTIPLIER);
      expect(itemLookScore(it.id)).toBe(Math.round((it.price * PERMANENT_MULTIPLIER) / LOOK_SCORE_DIVISOR));
    }
    expect(itemLookScore("nc_sky")).toBe(64); // 80P × 4 ÷ 5
    expect(itemLookScore("ng_aurora")).toBe(160); // 200P × 4 ÷ 5
    expect(itemLookScore("nf_rainbow")).toBe(336); // 420P × 4 ÷ 5
    expect(itemLookScore("np_star")).toBe(192); // 240P × 4 ÷ 5
  });

  it("이름 글자·이름표는 몸 꾸미기와 따로 더해지고, 만료되면 빠진다", () => {
    const equipped = [
      { itemId: "hat_cat", until: NOW + HOUR }, // 100P → 80점
      { itemId: "nf_flame", until: PERMANENT_UNTIL }, // 400P → 320점
      { itemId: "np_wood", until: NOW + HOUR }, // 100P → 80점
    ];
    expect(lookScore({ equipped }, NOW)).toBe(80 + 320 + 80);
    expect(lookScore({ equipped }, NOW + 2 * HOUR)).toBe(320);
    // 랭킹 줄 아이콘: 몸 → 펫 → 이름 글자 → 이름표 순
    expect(wornParts({ equipped: [{ itemId: "np_wood", until: NOW + HOUR }, { itemId: "nc_sky", until: NOW + HOUR }, { itemId: "pet_cat", until: NOW + HOUR }, { itemId: "hat_cat", until: NOW + HOUR }] }, NOW)).toEqual([
      "hat_cat",
      "pet_cat",
      "nc_sky",
      "np_wood",
    ]);
  });

  it("사냥 드롭에는 나오지 않는다 (상점에서만)", () => {
    for (const it of nameItems) expect(COSMETIC_DROPS).not.toContain(it.id);
  });
});

describe("랭킹 줄의 이름 색 (lib/nameStyleRank)", () => {
  const equipped: Record<string, { itemId: string; until: number }[]> = {
    a: [
      { itemId: "nc_sky", until: NOW + HOUR },
      { itemId: "hat_cat", until: NOW + HOUR },
      { itemId: "np_star", until: PERMANENT_UNTIL },
    ],
    b: [{ itemId: "ng_sea", until: NOW - 1 }], // 만료
    c: [{ itemId: "hat_cat", until: NOW + HOUR }],
  };
  const store = new MemoryLookRank(() => ({ get: async (id: string) => ({ equipped: equipped[id] ?? [] }) }) as never);

  it("지금 착용한 것만, 이름 글자 → 이름표 순으로 붙이고 없는 줄은 그대로", async () => {
    const rows = [{ accountId: "a", name: "가" }, { accountId: "b", name: "나" }, { accountId: "c", name: "다" }];
    expect(await withNameStyles(rows, NOW, store)).toEqual([{ accountId: "a", name: "가", ns: ["nc_sky", "np_star"] }, { accountId: "b", name: "나" }, { accountId: "c", name: "다" }]);
    const board = await boardWithNameStyles(rows.slice(1), rows[0], NOW, store);
    expect(board.rows.map((r) => r.ns)).toEqual([undefined, undefined]);
    expect(board.mine?.ns).toEqual(["nc_sky", "np_star"]);
    expect(await boardWithNameStyles([], null, NOW, store)).toEqual({ rows: [], mine: null });
  });

  it("읽기에 실패해도 랭킹은 그대로 (그냥 이름)", async () => {
    const broken = new MemoryLookRank(() => ({ get: async () => Promise.reject(new Error("down")) }) as never);
    const rows = [{ accountId: "a", name: "가" }];
    expect(await withNameStyles(rows, NOW, broken)).toEqual(rows);
  });
});

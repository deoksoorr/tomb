import { describe, expect, it } from "vitest";
import { GiftSendSchema } from "./gifts";

// 11번 선물 보내기 검증: 아이템별 기간(꾸미기만, 정해진 값만)

const base = { target: "all", note: "선물이에요" };
const parse = (items: unknown[]) =>
  GiftSendSchema.safeParse({ ...base, items });

describe("GiftSendSchema 기간", () => {
  it("꾸미기는 3일·7일·30일·영구를 고를 수 있고, 기간 선물은 개수가 1로 맞춰진다", () => {
    const r = parse([
      { itemId: "hat_straw", count: 5, term: "7d" },
      { itemId: "pet_ghost", count: 1, term: "perm" },
      { itemId: "hand_lantern", count: 1, term: "30d" },
      { itemId: "neck_scarf", count: 1, term: "3d" },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.items[0]).toEqual({
      itemId: "hat_straw",
      count: 1,
      term: "7d",
    });
    expect(r.data?.items.map((i) => i.term)).toEqual([
      "7d",
      "perm",
      "30d",
      "3d",
    ]);
  });

  it("기간이 없거나 null이면 옛 선물과 같은 모양 (term 없음), 같은 아이템은 개수를 합친다", () => {
    const r = parse([
      { itemId: "fw_small", count: 2 },
      { itemId: "fw_small", count: 3, term: null },
      { itemId: "hat_straw", count: 2 },
      { itemId: "hat_straw", count: 1, term: "3d" },
    ]);
    expect(r.success).toBe(true);
    expect(r.data?.items).toEqual([
      { itemId: "fw_small", count: 5 },
      { itemId: "hat_straw", count: 2 },
      { itemId: "hat_straw", count: 1, term: "3d" },
    ]);
  });

  it("허용되지 않은 기간·꾸미기가 아닌 아이템의 기간은 거절한다", () => {
    for (const term of ["1d", "24h", "forever", 7, ""])
      expect(parse([{ itemId: "hat_straw", count: 1, term }]).success).toBe(
        false,
      );
    expect(parse([{ itemId: "fw_small", count: 1, term: "7d" }]).success).toBe(
      false,
    );
    expect(
      parse([{ itemId: "decor_candles", count: 1, term: "perm" }]).success,
    ).toBe(false);
  });
});

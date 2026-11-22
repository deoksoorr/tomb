import { describe, expect, it } from "vitest";
import type { GiftEntry } from "@/lib/types";
import { splitGifts } from "./GiftsDialog";

const g = (id: string, claimedAt: number | null) => ({ id, claimedAt }) as GiftEntry;

describe("11/22 선물함 모두 받기 · 받은 선물 지우기", () => {
  it("받은 선물만 지우기 대상, 안 받은 선물은 모두 받기 대상", () => {
    const { unclaimed, claimed } = splitGifts([g("a", null), g("b", 1), g("c", null), g("d", 2)]);
    expect(unclaimed.map((x) => x.id)).toEqual(["a", "c"]);
    expect(claimed.map((x) => x.id)).toEqual(["b", "d"]);
  });

  it("하나도 안 받았으면 지울 것이 없고, 다 받았으면 받을 것이 없다", () => {
    expect(splitGifts([g("a", null), g("b", null)]).claimed).toEqual([]);
    expect(splitGifts([g("a", 1), g("b", 2)]).unclaimed).toEqual([]);
  });

  it("목록이 아직 없으면 둘 다 비어 있다", () => {
    expect(splitGifts(null)).toEqual({ unclaimed: [], claimed: [] });
  });
});

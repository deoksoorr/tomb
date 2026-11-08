import { describe, expect, it } from "vitest";
import { COSMETIC_DURATION_MS, DECOR_DURATION_MS, itemById, plotLabel } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { bagEntries, currentLook, durationLabel, effectLabel, myGraveEntries, pointsText, remainingLabel } from "./items";

const HOUR = 3_600_000;

describe("bagEntries", () => {
  it("카탈로그에 있고 1개 이상인 것만, 종류로 거를 수 있다", () => {
    const inv = { fw_small: 2, hat_cat: 1, decor_candles: 0, unknown: 3 };
    expect(bagEntries(inv).map((e) => [e.item.id, e.count])).toEqual([
      ["fw_small", 2],
      ["hat_cat", 1],
    ]);
    expect(bagEntries(inv, "firework").map((e) => e.item.id)).toEqual(["fw_small"]);
  });
});

describe("currentLook", () => {
  it("만료된 것은 빼고 부위마다 하나만", () => {
    const now = 1_000;
    expect(
      currentLook(
        [
          { itemId: "hat_cat", until: now + 1 },
          { itemId: "hat_straw", until: now + 1 },
          { itemId: "neck_scarf", until: now - 1 },
          { itemId: "aura_firefly", until: now + 1 },
        ],
        now,
      ),
    ).toEqual(["hat_cat", "aura_firefly"]);
  });
});

describe("지속·남은 시간", () => {
  it("카탈로그 지속 시간을 사람이 읽는 말로", () => {
    expect(durationLabel(COSMETIC_DURATION_MS)).toBe("24시간");
    expect(durationLabel(DECOR_DURATION_MS)).toBe("7일");
    expect(effectLabel(itemById("fw_small")!)).toBe("한 번 쏘면 사라져요");
    expect(effectLabel(itemById("hat_cat")!)).toBe("24시간 유지");
    expect(effectLabel(itemById("gs_duck")!)).toMatch("1개 써요");
  });

  it("남은 시간", () => {
    expect(remainingLabel(3 * 24 * HOUR + 5, 0)).toBe("3일 남음");
    expect(remainingLabel(13 * HOUR + 59 * 60_000, 0)).toBe("13시간 남음");
    expect(remainingLabel(90_000, 0)).toBe("2분 남음");
    expect(remainingLabel(0, 1)).toBe("끝났어요");
  });
});

describe("pointsText", () => {
  it("한도에 걸려 0이면 조용히", () => {
    expect(pointsText(2)).toBe("+2 포인트");
    expect(pointsText(0)).toBeNull();
    expect(pointsText(undefined)).toBeNull();
  });
});

describe("myGraveEntries", () => {
  const g = (id: string, createdAt: number) => ({ id, createdAt }) as PublicGrave;
  it("내 묘비만 최근 순으로, 자리는 전체 목록 위치로", () => {
    const all = [g("a", 1), g("b", 2), g("c", 3), g("d", 4)];
    expect(myGraveEntries(["b", "d", "x"], all).map((e) => [e.grave.id, e.plot])).toEqual([
      ["d", plotLabel(3)],
      ["b", plotLabel(1)],
    ]);
    expect(myGraveEntries([], all)).toEqual([]);
  });
});

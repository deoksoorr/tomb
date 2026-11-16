import { describe, expect, it } from "vitest";
import { hasNewItems } from "./useBagNew";

describe("가방 새 물건 점", () => {
  it("적어 둔 개수보다 늘어난 물건이 있을 때만", () => {
    expect(hasNewItems({ potion: 3 }, { potion: 3 })).toBe(false);
    expect(hasNewItems({ potion: 2 }, { potion: 3 })).toBe(false);
    expect(hasNewItems({ potion: 4 }, { potion: 3 })).toBe(true);
    expect(hasNewItems({ potion: 3, firework: 1 }, { potion: 3 })).toBe(true);
    expect(hasNewItems({ firework: 0 }, {})).toBe(false);
  });
});

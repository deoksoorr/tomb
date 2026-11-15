import { describe, expect, it } from "vitest";
import { isHuntGearId, sanitizeLook } from "./items";

// 11/15 사냥 장비 표시 id: 착용 목록에 실려 사냥터 방 사람들에게 간다 (꾸미기 칸 수와 따로, 최대 4개)
describe("사냥 장비 표시", () => {
  it("형식이 맞는 것만 남기고 꾸미기 칸 수에 세지 않는다, 칭호는 맨 뒤", () => {
    expect(isHuntGearId("sgw.a.33")).toBe(true);
    expect(isHuntGearId("sgw.h.h_cap+")).toBe(true);
    expect(isHuntGearId("sgw.x.33")).toBe(false);
    expect(isHuntGearId("sgw.a.<script>")).toBe(false);
    expect(sanitizeLook(["hat_cat", "sgw.a.33", "t_lv10", "sgw.h.h_cap", "sgw.a.33", "sgw.c.13", "sgw.c.c_bonus", "sgw.c.c_sticker"])).toEqual([
      "hat_cat",
      "sgw.a.33",
      "sgw.h.h_cap",
      "sgw.c.13",
      "sgw.c.c_bonus",
      "t_lv10",
    ]);
  });
});

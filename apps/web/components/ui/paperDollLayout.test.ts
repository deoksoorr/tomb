import { describe, expect, it } from "vitest";
import { tipAlignOf, tipPlaceOf } from "./paperDollLayout";

describe("tipAlignOf", () => {
  const areas = `"back head neck" "aura fig hand" "pet feet info"`;
  it("왼쪽 열은 start, 오른쪽 열은 end, 가운데는 center", () => {
    expect(tipAlignOf(areas, "back")).toBe("start");
    expect(tipAlignOf(areas, "pet")).toBe("start");
    expect(tipAlignOf(areas, "hand")).toBe("end");
    expect(tipAlignOf(areas, "head")).toBe("center");
    expect(tipAlignOf(areas, "feet")).toBe("center");
    expect(tipAlignOf(areas, "nope")).toBe("center");
  });

  it("빈 칸(.)이 있는 배치", () => {
    const gear = `". head ." "weapon fig armor" "acc1 fig acc2"`;
    expect(tipAlignOf(gear, "head")).toBe("center");
    expect(tipAlignOf(gear, "acc2")).toBe("end");
    expect(tipAlignOf(gear, "weapon")).toBe("start");
  });
});

describe("11/19 말풍선 위·아래", () => {
  it("맨 윗줄 칸은 아래로, 나머지는 위로 (한 줄짜리 배치는 위로)", () => {
    const areas = `"head neck face" "hand body back" "feet aura pet"`;
    expect(tipPlaceOf(areas, "head")).toBe("below");
    expect(tipPlaceOf(areas, "neck")).toBe("below");
    expect(tipPlaceOf(areas, "body")).toBe("above");
    expect(tipPlaceOf(`"a b c"`, "a")).toBe("above");
  });
});

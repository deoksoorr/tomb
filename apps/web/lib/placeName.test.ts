import { describe, expect, it } from "vitest";
import { hudPlace } from "./placeName";

describe("화면 위 채널 표시의 장소 이름", () => {
  it("넓은 화면은 정식 이름, 마을도 이름이 붙는다", () => {
    expect(hudPlace(undefined, false)).toBe("기억숲 마을");
    expect(hudPlace("village", false)).toBe("기억숲 마을");
    expect(hudPlace("camp", false)).toBe("언젠가 캠핑장");
    expect(hudPlace("sea", false)).toBe("달물결 포구");
  });

  it("좁은 화면은 채널만 (장소 이름 없음)", () => {
    expect(hudPlace(undefined, true)).toBeNull();
    expect(hudPlace("sea", true)).toBeNull();
  });
});

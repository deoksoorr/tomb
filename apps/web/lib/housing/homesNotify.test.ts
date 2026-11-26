import { describe, expect, it } from "vitest";
import { homesTarget } from "./homesNotify";

describe("homesTarget (11/26 집 바뀜 알림 대상)", () => {
  it("집 채널·구역 (마을 집은 zone이 없다), 집이 없으면 null", () => {
    expect(homesTarget({ house: { ch: 3, zone: "camp" } as never })).toEqual({ ch: 3, zone: "camp" });
    expect(homesTarget({ house: { ch: 2, zone: "sea" } as never })).toEqual({ ch: 2, zone: "sea" });
    expect(homesTarget({ house: { ch: 1 } as never })).toEqual({ ch: 1, zone: "village" });
    expect(homesTarget({ house: null })).toBeNull();
  });
});

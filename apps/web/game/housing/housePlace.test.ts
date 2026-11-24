import { describe, expect, it } from "vitest";
import { doorOnEnter, houseExitTo } from "./housePlace";

describe("housePlace", () => {
  it("문으로 들어가면 들어갈 때·나올 때 모두 문 앞", () => {
    expect(doorOnEnter("world", false)).toBe(true);
    expect(houseExitTo("world", false, false)).toBe("door");
  });
  it("[내 집 가기]로 바로 들어가면 원래 자리 그대로", () => {
    expect(doorOnEnter("world", true)).toBe(false);
    expect(houseExitTo("world", false, true)).toBe("stay");
    expect(houseExitTo("world", true, true)).toBe("stay");
  });
  it("분양 마을에서 들어간 집은 마을로 돌아간다", () => {
    expect(doorOnEnter("village", false)).toBe(false);
    expect(houseExitTo("village", true, false)).toBe("village");
    expect(houseExitTo("village", false, false)).toBe("door");
  });
});

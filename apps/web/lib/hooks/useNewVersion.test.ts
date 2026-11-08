import { describe, expect, it } from "vitest";
import { versionTracker } from "./useNewVersion";

describe("versionTracker", () => {
  it("빌드 기준 버전이 있으면 그것과 비교한다", () => {
    const isNew = versionTracker("abc");
    expect(isNew("abc")).toBe(false);
    expect(isNew("def")).toBe(true);
  });

  it("기준이 없으면 처음 받은 버전이 기준", () => {
    const isNew = versionTracker(null);
    expect(isNew("v1")).toBe(false);
    expect(isNew("v1")).toBe(false);
    expect(isNew("v2")).toBe(true);
  });
});

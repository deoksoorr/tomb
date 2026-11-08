import { describe, expect, it } from "vitest";
import { plotLabel } from "@tomb/protocol";
import { graveLocation } from "./location";

const graves = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("graveLocation", () => {
  it("목록 순서가 곧 자리 번호", () => {
    expect(graveLocation(graves, [], "a")).toBe(plotLabel(0));
    expect(graveLocation(graves, [], "d")).toBe(plotLabel(3));
  });

  it("부활 대기석에 있으면 순위를 덧붙인다", () => {
    expect(graveLocation(graves, ["c", "a"], "a")).toBe(`${plotLabel(0)} · 부활 대기석 2위`);
  });

  it("목록에 없으면 null", () => {
    expect(graveLocation(graves, ["x"], "x")).toBeNull();
  });
});

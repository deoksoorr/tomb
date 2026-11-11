import { describe, expect, it } from "vitest";
import type { PublicGrave } from "@/lib/types";
import { mergeGraves, OVERRIDE_SKEW_MS, OVERRIDE_TTL_MS, pruneOverrides } from "./graveMerge";

const g = (id: string, createdAt: number, revives = 0, flowers = 0): PublicGrave => ({
  id,
  name: id,
  epitaph: "",
  bornAt: "2026-01-01",
  diedAt: "2026-01-02",
  ageDays: 2,
  causes: ["time"],
  mourner: "유령",
  channel: 1,
  createdAt,
  revives,
  flowers,
});

describe("mergeGraves", () => {
  const list = [g("a", 1), g("b", 2), g("c", 3)];

  it("덮어쓰기·삭제·새 묘비를 반영하고 등록 순을 지킨다", () => {
    const merged = mergeGraves(list, {
      b: { grave: { ...g("b", 2), flowers: 9 }, at: 0 },
      c: { grave: null, at: 0 },
      d: { grave: g("d", 4), at: 0 },
    });
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(merged[1].flowers).toBe(9);
  });

  it("목록보다 먼저 만든 덮어쓰기도 createdAt 순서에 끼운다", () => {
    expect(mergeGraves([g("a", 1), g("c", 3)], { b: { grave: g("b", 2), at: 0 } }).map((x) => x.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("pruneOverrides", () => {
  const at = 1_000_000;
  const o = { x: { grave: null, at } };

  it("목록이 내 변경 이후(시계 여유 포함)에 만들어졌으면 버린다", () => {
    expect(pruneOverrides(o, at + OVERRIDE_SKEW_MS + 1, at + 1)).toEqual({});
  });

  it("CDN이 준 오래된 목록이면 유지한다", () => {
    expect(pruneOverrides(o, at - 5_000, at + 1)).toEqual(o);
    expect(pruneOverrides(o, at + 1_000, at + 1)).toEqual(o);
  });

  it("너무 오래되면 목록과 관계없이 버린다", () => {
    expect(pruneOverrides(o, 0, at + OVERRIDE_TTL_MS)).toEqual({});
  });
});

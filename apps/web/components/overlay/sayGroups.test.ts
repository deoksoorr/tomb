import { describe, expect, it } from "vitest";
import { EMOS, PHRASES } from "@tomb/protocol";
import { SAY_GROUPS } from "./sayGroups";

describe("말풍선 상황별 묶음", () => {
  it("모든 문장이 정확히 한 묶음에 들어간다", () => {
    const listed = SAY_GROUPS.flatMap((g) => g.phrases);
    expect([...listed].sort()).toEqual(PHRASES.map((p) => p.id).sort());
  });

  it("곁들인 이모티콘은 모두 이모티콘판에 있는 것이다 (몸짓 wave·cheer 포함)", () => {
    const known = new Set<string>(["wave", "cheer", ...EMOS.map((e) => e.id)]);
    for (const g of SAY_GROUPS) for (const id of g.emos) expect(known.has(id), `${g.title}: ${id}`).toBe(true);
  });
});

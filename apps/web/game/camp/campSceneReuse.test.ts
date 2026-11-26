import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 11/26 운영 오류 "Cannot read properties of null (reading 'fill')" (CampScene.onAction → Effects.splash → 지운 입자 explode):
// 캠핑장·바닷가 장면은 게임에 한 번만 등록돼 여행마다 같은 객체를 다시 쓴다(init·create만 다시 돈다).
// 처음 필요할 때 만드는 그림 묶음(this.x ??= new …)을 장면 정리(cleanup)에서 버리지 않으면, 다음 여행에서 지난 장면의 지운 그림을 다시 쓴다.

function lazyFieldsNotReset(file: string): string[] {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const lazy = new Set([...src.matchAll(/this\.(\w+) \?\?= new /g)].map((m) => m[1]));
  const at = src.indexOf("  private cleanup(): void {");
  expect(at, `${file} cleanup`).toBeGreaterThan(0);
  const cleanup = src.slice(at);
  return [...lazy].filter((f) => !cleanup.includes(`this.${f} = null`));
}

describe("다시 쓰는 장면은 여행이 끝날 때 늦게 만든 그림 묶음을 버린다", () => {
  it("캠핑장 (물보라 Effects·폭죽·눈 격자)", () => {
    expect(lazyFieldsNotReset("./CampScene.ts")).toEqual([]);
  });
  it("바닷가", () => {
    expect(lazyFieldsNotReset("../sea/SeaScene.ts")).toEqual([]);
  });
});

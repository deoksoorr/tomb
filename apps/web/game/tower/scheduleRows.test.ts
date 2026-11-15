import { describe, expect, it } from "vitest";
import { hasSchedule } from "@/lib/rpg/towerSchedule";
import { scheduleRows } from "./scheduleRows";

// 11/15 층 순서 (판마다 테마 순서가 다르다): 처음 들른 테마는 첫 층 두 종 → 층마다 새 몬스터 두 종까지, 정예 4번째 층, 우두머리 5번째 층
describe("층 순서", () => {
  it("처음 들른 테마 블록: 첫 층 두 종, 층마다 새 몬스터 두 종까지, 4번째 층 정예, 5번째 층 우두머리", () => {
    for (const seed of [1, 42, 977, 31337]) {
      const rows = scheduleRows(seed, 1, 30);
      expect(rows).toHaveLength(30);
      for (let b = 0; b < 6; b++) {
        const blk = rows.slice(b * 5, b * 5 + 5);
        expect(new Set(blk.map((r) => r.zone)).size, `${seed} ${b}`).toBe(1);
        if (!hasSchedule(blk[0].zone as never) || blk[0].visit !== 0) continue;
        expect(blk[0].mons.length, `${blk[0].theme} 첫 층`).toBe(2);
        for (const r of blk) expect(r.mons.filter((m) => m.fresh).length, `${r.floor}층`).toBeLessThanOrEqual(2);
        expect(blk[3].special.map((x) => x.kind)).toContain("elite");
        expect(blk[4].special.at(-1)?.kind).toBe("boss");
        for (const r of blk.slice(0, 3)) expect(r.special.filter((x) => x.kind === "elite")).toEqual([]);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { scheduleRows } from "./scheduleRows";

// 11/15 층 순서표 (안내서 표): 1층은 두 종, 첫 바퀴 층마다 새 몬스터는 두 종까지, 정예 4·9층, 우두머리 5·10층
describe("층 순서표", () => {
  it("1~30층 한 줄씩, 처음 나오는 몬스터 표시", () => {
    const rows = scheduleRows(30);
    expect(rows).toHaveLength(30);
    expect(rows[0].mons.map((m) => m.fresh)).toEqual([true, true]);
    for (const r of rows.slice(0, 10)) expect(r.mons.filter((m) => m.fresh).length, `${r.floor}층`).toBeLessThanOrEqual(2);
    expect(rows[3].special.map((x) => x.kind)).toEqual(["elite"]);
    expect(rows[8].special.map((x) => x.kind)).toEqual(["elite"]);
    expect(rows[4].special.at(-1)?.kind).toBe("boss");
    expect(rows[9].special.at(-1)?.kind).toBe("boss");
    for (const r of rows) expect(r.room.length, `${r.floor}층 방`).toBeGreaterThan(1);
    // 첫 두 바퀴(1~20층) 안에 모든 몬스터가 한 번씩 나온다
    const fresh = rows.slice(0, 20).flatMap((r) => [...r.mons, ...r.special].filter((m) => m.fresh).map((m) => m.name));
    expect(new Set(fresh).size).toBe(fresh.length);
    expect(fresh.length).toBeGreaterThanOrEqual(12 + 13);
  });
});

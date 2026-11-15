import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { isBossFloor, towerBlock, towerPlan, towerVisitName, towerZone } from "@/lib/rpg/tower";

// 11/15 야근 빌딩 층 순서 한 줄씩 (검수·테스트용): 한 판(시드·시작 층)의 층 · 테마 · 몇 번째로 왔나 · 몬스터(처음 나오는 것 표시) · 정예/우두머리.
// 테마 순서는 판마다 다르다 (lib/rpg/tower towerBlock) — 같은 판이면 서버 검증과 같은 계획을 읽는다.

export type ScheduleRow = {
  floor: number;
  zone: string;
  theme: string;
  /** 그 판에서 이 테마에 몇 번째로 왔나 (0부터)와 그때 판 이름 */
  visit: number;
  loop: string;
  /** 일반 몬스터 이름과 그 판에서 처음 나오는지 */
  mons: { id: MonsterId; name: string; fresh: boolean }[];
  /** 정예·중간 우두머리·우두머리 (처음 나오는지) */
  special: { id: MonsterId; name: string; kind: "elite" | "mid" | "boss"; fresh: boolean }[];
};

export function scheduleRows(seed: number, start: number, floors: number): ScheduleRow[] {
  const seen = new Set<MonsterId>();
  const rows: ScheduleRow[] = [];
  for (let f = start; f < start + floors; f++) {
    const zone = towerZone(seed, start, f);
    const at = towerBlock(seed, start, f);
    const plan = towerPlan(seed, f, start);
    const ids = new Set<MonsterId>();
    const special: ScheduleRow["special"] = [];
    const mark = (id: MonsterId) => {
      const fresh = !seen.has(id);
      seen.add(id);
      return fresh;
    };
    for (const w of plan)
      w.monsters.forEach((id, k) => {
        if (MONSTERS[id].minion) return;
        if (w.boss && k === 0) return;
        if (w.elite === k) return;
        ids.add(id);
      });
    const mons = [...ids].map((id) => ({ id, name: MONSTERS[id].name, fresh: mark(id) }));
    for (const w of plan)
      if (w.elite !== undefined) {
        const id = w.monsters[w.elite];
        special.push({ id, name: MONSTERS[id].name, kind: id === zone.mid ? "mid" : "elite", fresh: mark(id) });
      }
    if (isBossFloor(f)) special.push({ id: zone.boss, name: MONSTERS[zone.boss].name, kind: "boss", fresh: mark(zone.boss) });
    rows.push({ floor: f, zone: zone.id, theme: zone.name, visit: at.visit, loop: towerVisitName(zone, at.visit), mons, special });
  }
  return rows;
}

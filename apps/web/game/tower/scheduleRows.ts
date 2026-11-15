import { HUNT_ZONES, MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { svLoop, svRoom } from "@/lib/rpg/serverRoom";
import { isBossFloor, towerLoop, towerPlan, towerZone } from "@/lib/rpg/tower";
import { MT_MID, mtLoopInfo } from "@/lib/rpg/towerThemes/meetingRoom";
import { MT_ROOM_NAMES, mtRoomType } from "./themes/meetingRoomMap";
import { SV_ROOM_NAMES } from "./themes/serverRoomMap";

// 11/15 야근 빌딩 층 순서표 한 줄씩 (안내서 표·검수용): 층 · 테마 · 방 · 몬스터(처음 나오는 것 표시) · 정예/우두머리 · 판.
// 몬스터 종류는 판 시드와 상관없이 같다 (lib/rpg/towerSchedule) — 아무 시드로 계획을 만들어 읽는다.

export type ScheduleRow = {
  floor: number;
  theme: string;
  room: string;
  /** 일반 몬스터 이름과 그 층에서 처음 나오는지 */
  mons: { name: string; fresh: boolean }[];
  /** 정예·중간 우두머리·우두머리 (처음 나오는지) */
  special: { name: string; kind: "elite" | "mid" | "boss"; fresh: boolean }[];
  /** 바퀴마다 바뀌는 판 이름 */
  loop: string;
};

export function scheduleRows(upTo: number): ScheduleRow[] {
  const seen = new Set<MonsterId>();
  const rows: ScheduleRow[] = [];
  for (let f = 1; f <= upTo; f++) {
    const zone = towerZone(f);
    const plan = towerPlan(1, f);
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
    const mons = [...ids].map((id) => ({ name: MONSTERS[id].name, fresh: mark(id) }));
    for (const w of plan) if (w.elite !== undefined) {
      const id = w.monsters[w.elite];
      special.push({ name: MONSTERS[id].name, kind: id === MT_MID ? "mid" : "elite", fresh: mark(id) });
    }
    if (isBossFloor(f)) special.push({ name: MONSTERS[zone.boss].name, kind: "boss", fresh: mark(zone.boss) });
    const sv = zone.id === "server-room";
    rows.push({
      floor: f,
      theme: HUNT_ZONES[zone.id].name,
      room: sv ? SV_ROOM_NAMES[svRoom(f)] : zone.id === "mt_meeting" ? MT_ROOM_NAMES[mtRoomType(0, f)] : "",
      mons,
      special,
      loop: sv ? svLoop(towerLoop(f)).name : zone.id === "mt_meeting" ? mtLoopInfo(towerLoop(f)).name : "",
    });
  }
  return rows;
}

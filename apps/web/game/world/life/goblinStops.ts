import { MAP_NAME, type MapId } from "@tomb/protocol";
import { CAMP_BUS_BAY, SEA_BUS_BAY, VILLAGE_CAMP_BAY, VILLAGE_SEA_BAY, bayMid } from "../../bus/busBays";

// 11/26 황금 고블린이 다른 맵에 나타났을 때 화살표가 가리킬 정류장 (순수 — goblinStops.test.ts).
// 마을에선 그 맵으로 가는 정류장(캠핑장행·바닷가행), 캠핑장·바닷가에선 마을행 정류장 (바닷가 ↔ 캠핑장은 마을에서 갈아타요).

export type GoblinStop = { x: number; y: number; /** 이 정류장 버스가 가는 맵 */ to: MapId; /** 정류장 위 글자 「캠핑장행 버스」 */ label: string };

export function goblinStopFor(here: MapId, goblinMap: MapId): GoblinStop | null {
  if (here === goblinMap) return null;
  const bay = here === "village" ? (goblinMap === "sea" ? VILLAGE_SEA_BAY : VILLAGE_CAMP_BAY) : here === "camp" ? CAMP_BUS_BAY : SEA_BUS_BAY;
  const to: MapId = here === "village" ? goblinMap : "village";
  const p = bayMid(bay);
  return { x: p.x, y: p.y, to, label: `${MAP_NAME[to]}행 버스` };
}

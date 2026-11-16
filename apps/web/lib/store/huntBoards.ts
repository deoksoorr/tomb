import { DIFFICULTIES, HUNT_ZONES, isZoneId, ZONES, type Difficulty } from "../rpg/catalog";

// 11/16 사냥 최단 클리어 랭킹을 난이도별(4판) → 사냥터별(12판)로 나눴다.
//  - 새 기록: rank:hunt:best:{사냥터 id} (+ 주간 :w:{주}). 처치 수 판은 그대로
//  - 옛 기록: rank:hunt:best:{난이도} 판은 더 쓰지 않고 그대로 둔다 (얼린 판). 그때는 난이도마다 첫 사냥터뿐이었으므로
//    그 난이도 첫 사냥터(ZONES[d]) 판을 읽을 때 옛 판을 합친다 (계정마다 더 짧은 기록 — 몇 번 합쳐도 같다)
//  - 칭호(어려움·지옥 완주)용: rank:hunt:clear:{난이도} = 그 난이도 어느 사냥터든 깬 가장 짧은 기록 (+ 옛 난이도 판)

/** 사냥터 id 또는 (옛) 난이도 id → 난이도. 모르는 값이면 null */
export function huntDiffOf(zone: string): Difficulty | null {
  if (isZoneId(zone)) return HUNT_ZONES[zone].difficulty;
  return (DIFFICULTIES as readonly string[]).includes(zone) ? (zone as Difficulty) : null;
}

/** 그 난이도의 첫 사냥터면 합칠 옛 난이도 판 이름, 아니면 null */
export function legacyHuntBoard(zone: string): Difficulty | null {
  return DIFFICULTIES.find((d) => ZONES[d].id === zone) ?? null;
}

/** 최단 클리어 판을 읽을 사냥터 (없으면 쉬움 첫 사냥터) */
export const DEFAULT_HUNT_ZONE = ZONES.easy.id;

import { CAMP_BUS_STOP, CAMP_ROAD, SEA_BUS_STOP, SEA_ROAD } from "@tomb/protocol";
import type { ReachZone } from "../logic/reach";
import { BUS_BAY } from "../world/fishZone";
import { SEA_STOP_BAY } from "../world/seaStop";

// 11/18 정류장 바닥 정차 칸 (노란 칠·「BUS」) — 순수 데이터. 그림(바닥 굽기)과 「버스 타기」 E 범위가 같은 상자를 써요
// (사용자 「BUS라고 바닥에 적힌 영역 어디서든 타게」 — 예전엔 정류장마다 반지름이 달라 칸 일부에서만 됐어요)
// 상자는 테두리 포함 x ~ x + w, y ~ y + h. 닿는 판정은 game/logic/reach (가장자리 ZONE_PAD 여유)

/** 마을 버스 정류장 마당 (캠핑장행) */
export const VILLAGE_CAMP_BAY: ReachZone = BUS_BAY;
/** 마을 옛 묘역 아래 정류장 (바닷가행) */
export const VILLAGE_SEA_BAY: ReachZone = SEA_STOP_BAY;
/** 캠핑장 정류장 앞 길 (버스는 왼쪽에서 들어와 문이 정류장 앞에 와요 → 칸은 정류장 왼쪽으로 치우쳐요) */
export const CAMP_BUS_BAY: ReachZone = { x: CAMP_BUS_STOP.x - 98, y: CAMP_ROAD.y + 9, w: 128, h: 29 };
/** 바닷가 정류장 앞 길 */
export const SEA_BUS_BAY: ReachZone = { x: SEA_BUS_STOP.x - 30, y: SEA_ROAD.y + 6, w: 128, h: SEA_ROAD.h - 11 };

/** 상자 가운데 (안내·바라보는 쪽) */
export function bayMid(b: ReachZone): { x: number; y: number } {
  return { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) };
}

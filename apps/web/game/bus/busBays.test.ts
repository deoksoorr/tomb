import { describe, expect, it } from "vitest";
import { CAMP_INTERACTABLES, campStandable } from "../camp/campLayout";
import { nearestObject } from "../logic/interact";
import { inReach, reachDist, ZONE_PAD, type Reachable, type ReachZone } from "../logic/reach";
import { SEA_INTERACTABLES, seaStandable } from "../sea/seaLayout";
import { interactables, standable } from "../world/layout";
import { CAMP_BUS_BAY, SEA_BUS_BAY, VILLAGE_CAMP_BAY, VILLAGE_SEA_BAY } from "./busBays";

// 11/18 사용자 「BUS라고 바닥에 적힌 영역 어디서든 버스를 타게」: 네 정류장 모두 정차 칸 상자 안 어디서나 「버스 타기」, 밖은 아니다

/** 캠핑장·바닷가 장면의 nearestObject와 같은 고르기 */
function pick<T extends Reachable & { id: string }>(list: readonly T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const o of list) {
    if (!inReach(o, x, y)) continue;
    const d = reachDist(o, x, y);
    if (d < bd) {
      best = o;
      bd = d;
    }
  }
  return best;
}

/** 상자 안 점들: 네 귀퉁이(2px 안)·변 가운데·가운데 */
function inside(b: ReachZone): [number, number][] {
  const x0 = b.x + 2;
  const x1 = b.x + b.w - 2;
  const y0 = b.y + 2;
  const y1 = b.y + b.h - 2;
  const mx = b.x + b.w / 2;
  const my = b.y + b.h / 2;
  return [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [mx, y0], [mx, y1], [x0, my], [x1, my], [mx, my]];
}

/** 상자 밖 점들: 네 변에서 ZONE_PAD + 6px 바깥 */
function outside(b: ReachZone): [number, number][] {
  const o = ZONE_PAD + 6;
  const mx = b.x + b.w / 2;
  const my = b.y + b.h / 2;
  return [[b.x - o, my], [b.x + b.w + o, my], [mx, b.y - o], [mx, b.y + b.h + o]];
}

const VILLAGE = interactables();
const STOPS = [
  { name: "마을 캠핑장행", bay: VILLAGE_CAMP_BAY, id: "bus:camp", at: (x: number, y: number) => nearestObject(VILLAGE, x, y)?.obj.id ?? null, walk: standable, list: VILLAGE },
  { name: "마을 바닷가행", bay: VILLAGE_SEA_BAY, id: "bus:sea", at: (x: number, y: number) => nearestObject(VILLAGE, x, y)?.obj.id ?? null, walk: standable, list: VILLAGE },
  { name: "캠핑장", bay: CAMP_BUS_BAY, id: "bus:village", at: (x: number, y: number) => pick(CAMP_INTERACTABLES, x, y)?.id ?? null, walk: campStandable, list: CAMP_INTERACTABLES },
  { name: "바닷가", bay: SEA_BUS_BAY, id: "bus:village", at: (x: number, y: number) => pick(SEA_INTERACTABLES, x, y)?.id ?? null, walk: seaStandable, list: SEA_INTERACTABLES },
] as const;

describe("버스 정차 칸 = 타는 곳", () => {
  for (const s of STOPS) {
    it(`${s.name}: 버스 타기 대상의 바닥 영역이 그 정차 칸이다`, () => {
      const bus = s.list.find((o) => o.id === s.id);
      expect(bus?.zone).toEqual(s.bay);
    });
    it(`${s.name}: 칸 안 어디서나 버스 타기`, () => {
      for (const [x, y] of inside(s.bay)) expect(s.at(x, y), `${x},${y}`).toBe(s.id);
    });
    it(`${s.name}: 칸 밖에서는 버스 타기가 아니다`, () => {
      for (const [x, y] of outside(s.bay)) expect(s.at(x, y), `${x},${y}`).not.toBe(s.id);
    });
    it(`${s.name}: 칸은 걸어 들어갈 수 있는 바닥이다`, () => {
      for (const [x, y] of inside(s.bay)) expect(s.walk(x, y), `${x},${y}`).toBe(true);
    });
  }
});

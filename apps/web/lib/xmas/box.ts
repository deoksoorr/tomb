import { itemById, XMAS_BOX_ID, type CosmeticSlot } from "@tomb/protocol";
import type { Me } from "../types";

// 12월 크리스마스 선물상자 규칙 (순수 — 서버 lib/xmas/service와 화면이 함께 쓴다).
// 관리자가 선물함으로 xm_box를 뿌리고, 받은 사람이 가방에서 [열기]를 누르면 서버가 여기 표로 하나를 뽑는다.
//  - 이미 영구로 가진 크리스마스 꾸미기는 후보에서 빠지고, 남은 것끼리 무게 비율로 뽑는다
//  - 다 가지고 있으면 대신 작은 보상 (XMAS_BOX_FALLBACK)
// 확률을 바꾸려면 XMAS_BOX_TABLE의 무게만 고치면 된다 (합이 100이라 무게 = 처음 열 때의 %)

/** 세트별 무게 (합 100 = 아무것도 없을 때 나올 확률 %). 흔한 것 → 귀한 것 순 */
export const XMAS_BOX_TABLE: readonly { id: string; weight: number }[] = [
  { id: "xm_bells", weight: 19 }, // 루돌프 썰매(1)가 들어오며 20 → 19
  { id: "xm_name", weight: 18 },
  { id: "xm_scarf", weight: 16 },
  { id: "xm_cane", weight: 14 },
  { id: "xm_plate", weight: 12 },
  { id: "xm_crown", weight: 8 },
  { id: "xm_snow", weight: 6 },
  { id: "xm_cape", weight: 4 },
  { id: "xm_deer", weight: 2 },
  { id: "xm_sleigh", weight: 1 }, // 가장 귀한 칸: 타는 펫 루돌프 썰매
];

/** 다 가지고 있을 때 대신 주는 것: 별 폭죽 3개 (가방 소모품) */
export const XMAS_BOX_FALLBACK = { itemId: "fw_star", count: 3 } as const;

export { XMAS_BOX_ID };

/** 상자에서 나온 것: 꾸미기 하나(영구) 또는 대신 받은 폭죽 */
export type XmasPrize = { kind: "cosmetic"; id: string } | { kind: "fallback"; itemId: string; count: number };

/** 표에 있는 꾸미기 중 아직 영구로 갖지 않은 것 (무게 0은 뺀다) */
export function xmasCandidates(owned: ReadonlySet<string>): { id: string; weight: number }[] {
  return XMAS_BOX_TABLE.filter((r) => r.weight > 0 && !owned.has(r.id));
}

/**
 * 하나 뽑기. owned = 이미 영구로 가진 꾸미기 id, roll = [0, 1) 난수 (서버가 Math.random으로 준다).
 * 남은 후보의 무게 비율로 고르고, 후보가 없으면 대체 보상
 */
export function rollXmasBox(owned: ReadonlySet<string>, roll: number): XmasPrize {
  const list = xmasCandidates(owned);
  const total = list.reduce((n, r) => n + r.weight, 0);
  if (total <= 0) return { kind: "fallback", ...XMAS_BOX_FALLBACK };
  let at = Math.min(Math.max(roll, 0), 1 - Number.EPSILON) * total;
  for (const r of list) {
    if (at < r.weight) return { kind: "cosmetic", id: r.id };
    at -= r.weight;
  }
  return { kind: "cosmetic", id: list[list.length - 1].id };
}

/** 지금 가진 것 기준 각 꾸미기가 나올 확률 (0~1, 다 가졌으면 빈 목록) — 상자 창 안내·테스트용 */
export function xmasOdds(owned: ReadonlySet<string>): { id: string; p: number }[] {
  const list = xmasCandidates(owned);
  const total = list.reduce((n, r) => n + r.weight, 0);
  return total > 0 ? list.map((r) => ({ id: r.id, p: r.weight / total })) : [];
}

/** 뽑힌 꾸미기의 부위 (지급할 때 쓴다). 카탈로그에 없으면 null */
export function xmasSlot(id: string): CosmeticSlot | null {
  const it = itemById(id);
  return it?.event && it.kind === "cosmetic" && it.slot ? it.slot : null;
}

/** 열기 응답 (서버 → 화면) */
export type XmasOpenResponse = {
  prize: XmasPrize;
  /** 남은 선물상자 수 */
  left: number;
  me: Me;
};

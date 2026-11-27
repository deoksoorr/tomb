import type { CampHomeKind } from "@tomb/protocol";
import { CARAVAN_CX } from "./caravan";
import { PENSION_CX } from "./pension";
import { RURAL_CX } from "./rural";
import { cxDefs, type CxAct, type CxRow } from "./types";

// 11/27 캠핑장 집 종류별 전용 가구·바닥·벽지 모음 (catalog FURNITURE에 합쳐진다 — 순수, 서버·클라이언트 공용).
// 한 종류의 목록·문구·상호작용은 그 종류 파일(caravan·pension·rural.ts)에서만 고친다.

export type { CxAct, CxDir, CxFx, CxRow, CxSeat, CxToggle } from "./types";

/** 종류별 줄 (판매 창 순서 = 이 순서: 가구 8 → 바닥 3 → 벽지 3) */
export const CX_ROWS: Record<CampHomeKind, readonly CxRow[]> = {
  caravan: CARAVAN_CX,
  pension: PENSION_CX,
  rural: RURAL_CX,
};

/** 카탈로그 줄 42개 (FurnitureDef.campOnly = 종류) */
export const CAMP_EXCLUSIVE_DEFS = [...cxDefs("caravan", CARAVAN_CX), ...cxDefs("pension", PENSION_CX), ...cxDefs("rural", RURAL_CX)];

/** 상호작용 선언 (id → act — game/housing/interact.ts·HouseScene이 읽는다) */
export const CX_ACT: Readonly<Record<string, CxAct>> = Object.fromEntries(
  Object.values(CX_ROWS)
    .flat()
    .filter((r) => r.act)
    .map((r) => [r.id, r.act!]),
);

/** 발밑 그늘을 깔지 않는 가구 (종류 파일 noShadow) */
export const CX_NO_SHADOW: ReadonlySet<string> = new Set(
  Object.values(CX_ROWS)
    .flat()
    .filter((r) => r.noShadow)
    .map((r) => r.id),
);

/** 켜기·끄기 가구의 상태 최댓값 (lib/housing/states STATE_MAX — 값 0..steps−1) */
export const CX_STATE_MAX: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(CX_ACT)
    .filter(([, a]) => a.toggle)
    .map(([id, a]) => [id, (a.toggle!.steps ?? 2) - 1]),
);

/** 켜기·끄기 가구가 지금 켜져 있는지 (값 a — 0이 처음 모습) */
export function cxLit(id: string, a: number): boolean {
  const t = CX_ACT[id]?.toggle;
  if (!t) return false;
  return t.startOn ? a === 0 : a > 0;
}

/** 켜기·끄기 가구의 그림 변형 조각 (켜짐 "on", 값 "s{a}") */
export function cxToggleVariant(id: string, a: number): string {
  return [a > 0 ? `s${a}` : "", cxLit(id, a) ? "on" : ""].filter(Boolean).join("-");
}

/** 종류마다 파는 NPC (판매 창·안내 문구) */
export const CX_SELLER: Record<CampHomeKind, { name: string; where: string; subj: string }> = {
  caravan: { name: "언젠가 씨", where: "캠핑장 관리소", subj: "언젠가 씨가" },
  pension: { name: "소슬댁", where: "소슬 펜션", subj: "소슬댁이" },
  rural: { name: "순이 할머니", where: "촌캉스", subj: "순이 할머니가" },
};

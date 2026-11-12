import { itemById, type DyePart, type DyeTicketSpec, type ItemDef } from "@tomb/protocol";
import type { DyeTier } from "./palette";

// 46·25번 꾸미기 서비스 값 (포인트). 염색권 가격은 카탈로그(packages/protocol items.ts)에 있다.
//  - I0d 재조정: 보통 유저 하루 약 200P, 닉네임 변경 300P, 캐릭터 꾸미기 하루권 60~480P에 맞춰 잡았다.

/** 원래 색 되돌리기 (부위 하나) */
export const DYE_RESET_PRICE = 150;
/** 외형 바꾸기 (몸 모양 6종 중 다른 것으로, 부위 색은 그대로 따라간다) */
export const RESHAPE_PRICE = 600;

/** 카탈로그의 무작위 염색권이면 등급, 아니면 null */
export function randomTier(itemId: string): DyeTier | null {
  const d = itemById(itemId)?.dye;
  return d?.mode === "random" ? d.tier : null;
}

/** 카탈로그 염색권 정의 (고정 색 관리자 발급분은 저장소의 정의를 쓴다) */
export function catalogDye(itemId: string): (ItemDef & { dye: DyeTicketSpec }) | null {
  const it = itemById(itemId);
  return it?.kind === "dye" && it.dye ? (it as ItemDef & { dye: DyeTicketSpec }) : null;
}

/** 고정 색 염색권이 그 부위에 쓸 수 있는지 (parts가 없으면 모든 부위) */
export function fixedAllows(parts: readonly DyePart[] | undefined, part: DyePart): boolean {
  return !parts || parts.length === 0 || parts.includes(part);
}

/** 시간이 끝난 뒤 "지금 색 vs 새 색"을 고를 수 있는 시간. 안 고르면 지금 색 그대로 (후보는 버린다) */
export const DYE_DECIDE_MS = 30_000;

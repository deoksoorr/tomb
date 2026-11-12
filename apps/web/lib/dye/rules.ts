import { isFixedDyeId, itemById, type DyePart, type DyeTicketSpec, type ItemDef } from "@tomb/protocol";
import type { DyeTier } from "./palette";

// 46·25번 꾸미기 서비스 값 (포인트). 염색권 가격은 카탈로그(packages/protocol items.ts)에 있다.
//  - I0d 재조정: 보통 유저 하루 약 200P, 닉네임 변경 300P, 캐릭터 꾸미기 하루권 60~480P에 맞춰 잡았다.

/** 원래 색 되돌리기 (부위 하나) */
export const DYE_RESET_PRICE = 150;
// 25번 외형 바꾸기: 소장한 외형(처음 6종 · 선택권으로 해금한 프리미엄)끼리는 무료 (예전 600P 요금은 없앴다).
// 해금 전 프리미엄 외형만 선택권 값(packages/protocol BODY_TIER_INFO)을 낸다.

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
/** 기본 외형(처음 고르는 6종)으로 바꾸는 값 — 싸게 (프리미엄 소장 외형은 무료) */
export const BASE_RESHAPE_PRICE = 150;
export const DYE_DECIDE_MS = 30_000;

/** 염색권인지 (카탈로그 염색권 · 관리자 발급 고정 색 dyefix_*) */
export function isDyeTicketId(id: string): boolean {
  return !!catalogDye(id) || isFixedDyeId(id);
}

/** 가방에서 염색권만 (개수 1 이상) */
export function dyeTicketCounts(inventory: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(inventory)) if (n > 0 && isDyeTicketId(id)) out[id] = n;
  return out;
}

/** 내 정보의 염색권 개수가 서버 개수와 다른지 (다르면 내 정보를 다시 받아 가방 표시를 맞춘다) */
export function dyeCountsDiffer(inventory: Record<string, number>, server: Record<string, number>): boolean {
  const mine = dyeTicketCounts(inventory);
  const ids = new Set([...Object.keys(mine), ...Object.keys(server)]);
  for (const id of ids) if ((mine[id] ?? 0) !== (server[id] ?? 0)) return true;
  return false;
}

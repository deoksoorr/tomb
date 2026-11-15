import { dyeHex, isDyeColor, isFixedDyeId, itemById, withDyeSpecial, type DyePart, type DyeSpecial, type DyeTicketSpec, type ItemDef } from "@tomb/protocol";
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

// ── 11/15 수집 의뢰 염색권 (판·조준 없음): 색 확정(pick) = 보통 색 아무거나, 특수색 확정(special) = 특수 색 4종 중 하나 ──

/** 카탈로그 염색권의 쓰는 방식 (pick·special이면 그 값, 아니면 null) */
export function directDyeMode(itemId: string): "pick" | "special" | null {
  const m = itemById(itemId)?.dye?.mode;
  return m === "pick" || m === "special" ? m : null;
}

/** 색 확정 염색권 창의 견본 색 (밝은 색 · 짙은 색 · 흑백이 고루) */
export const DYE_PICK_SWATCHES: readonly string[] = [
  "#ff5a5a", "#ff9a3a", "#ffd23a", "#9adf4a", "#3ec46a", "#3ac8c0", "#4aa8f0", "#4a6ae8", "#8a5ae8", "#d05ae0", "#ff6aa8", "#b8865a",
  "#ffb8b8", "#ffd8a8", "#fff2a8", "#d8f4b0", "#b8ecd0", "#b8e8f4", "#c8d8ff", "#dcc8ff", "#f8c8ec", "#f0e4d0", "#ffffff", "#c8c8cc",
  "#a8282e", "#a8541c", "#a8861a", "#4a7a24", "#1e6a40", "#1a6a6a", "#1e5a9a", "#26307a", "#4a2a8a", "#7a2a7a", "#8a2a5a", "#5a3a22",
  "#8a8a90", "#5a5a62", "#34343c", "#1a1a20",
];

/**
 * 특수색 확정 염색권의 바탕 색 (서버가 정하고, 화면 미리보기도 같은 함수): 금빛 광택은 늘 금빛,
 * 나머지는 그 부위에 이미 염색한 색이 있으면 그 바탕 색 그대로(특수 색이었으면 바탕 hex만), 없으면 종류마다 정한 대표 색
 */
export const SPECIAL_DYE_BASE: Readonly<Record<DyeSpecial, string>> = { g: "#e2b24a", s: "#bcd4ff", r: "#ff7a9c", n: "#8dffb8" };
export function specialDyeColor(kind: DyeSpecial, current: string | null | undefined): string {
  const keep = kind !== "g" && isDyeColor(current) ? dyeHex(current) : null;
  return withDyeSpecial(keep ?? SPECIAL_DYE_BASE[kind], kind);
}

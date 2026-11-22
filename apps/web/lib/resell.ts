import { isShopListed, isPermanentUntil, itemById, permanentPrice } from "@tomb/protocol";

// 11/22 꾸미기 되팔기 규칙 (서버 lib/resellService와 상점 화면이 같이 쓴다).
// 상점(잡화점)에서 파는 꾸미기를 영구로 가졌으면 (팔기는 상점 자세히 보기에서만 — components/shop/SellConfirm) 정가(지금 상점 영구 값)의 30%(내림)로 판다. 산 값·할인·염색 칸 값은 따지지 않는다.
// 기간 상점(계절 보따리상·유령선 장터·붕어빵 수레)·보상·선물·이벤트·상자·기간제는 팔 수 없다. 입고 있으면 먼저 벗어야 한다.
// 11/22 상점 꾸미기라도 포인트를 내고 영구로 산 것(산 기록 bought — 영구 구매 Lua만 남긴다)만 판다. 선물·보상으로 받은 건 못 판다.

export const RESELL_RATE = 0.3;

/** 되팔 때 받는 값 (그 꾸미기의 지금 영구 정가 × 30%, 내림). 영구 값이 없으면 0 */
export function resellPrice(itemId: string): number {
  const p = permanentPrice(itemId);
  return p ? Math.floor(p * RESELL_RATE) : 0;
}

/** 이 꾸미기 종류가 되팔 수 있는 것인지 (가진 상태와 상관없이). 아니면 짧은 까닭 */
export function resellKindBlock(itemId: string): string | null {
  const it = itemById(itemId);
  if (!it || it.kind !== "cosmetic") return "팔 수 없는 물건이에요.";
  if (it.seasonSet || it.alley || it.ghost) return "기간 한정이라 팔 수 없어요.";
  if (it.event || it.quest || it.urgent || it.champ || it.chair || it.invite || it.stargaze || it.staff) return "보상으로 받은 거라 팔 수 없어요.";
  if (it.slot === "pet") return "펫은 팔 수 없어요.";
  if (!isShopListed(it) || !permanentPrice(itemId)) return "상점에서 파는 꾸미기가 아니라 팔 수 없어요.";
  return null;
}

/** 11/22 산 기록이 없는(선물·보상으로 받은) 상점 꾸미기 */
export const RESELL_GIFT_BLOCK = "선물로 받은 거라 팔 수 없어요.";

/**
 * 지금 이 꾸미기를 팔 수 있는지: state = 입음·벗어 둠·가방 새것, until = 만료 시각 (영구면 PERMANENT_UNTIL),
 * bought = 내가 포인트로 영구로 산 꾸미기 id (Me.bought). 되면 null, 아니면 까닭
 */
export function resellBlock(itemId: string, state: "worn" | "stash" | "new", until: number | null, bought: readonly string[] | undefined): string | null {
  const kind = resellKindBlock(itemId);
  if (kind) return kind;
  if (state === "new" || until === null || !isPermanentUntil(until)) return "기간제라 팔 수 없어요.";
  if (!bought?.includes(itemId)) return RESELL_GIFT_BLOCK;
  if (state === "worn") return "입고 있어서 팔 수 없어요. 먼저 벗어 주세요.";
  return null;
}

/** 살 때 보여 줄 한 줄: 일반 상점 = 나중에 정가의 30%로 팔 수 있다, 한정 판매 = 팔 수 없다 */
export function resellBuyNote(itemId: string): string {
  return resellKindBlock(itemId) ? "한정 판매라 나중에 팔 수 없어요." : "영구로 사면 나중에 정가의 30%로 팔 수 있어요.";
}

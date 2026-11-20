import { batchim, daysUntil } from "@/lib/seasonShop/rules";
import type { SeasonKind } from "@/lib/seasonShop/schedule";
export { SEASON_SHOP_SUB, SEASON_SHOP_TITLE } from "@/lib/seasonShop/schedule";

// 11/19 기간 한정 노점 창 문구 (짧은 해요체 — 순수 함수라 테스트한다)

export const SEASON_TABS = [
  { id: "on", label: "판매 중" },
  { id: "soon", label: "판매 예정" },
] as const;
export type SeasonTab = (typeof SEASON_TABS)[number]["id"];

export function seasonHint(kind: SeasonKind): string {
  return kind === "cos" ? "산 코디는 판매가 끝나도 그대로예요" : "산 가구는 판매가 끝나도 그대로예요";
}

/** 빈 칸 안내 */
export function emptyText(tab: SeasonTab, next: number | null, now: number): string {
  if (tab === "soon") return "다음 주 물건은 아직 준비 중이에요.";
  return next === null ? "지금은 파는 물건이 없어요." : `다음 묶음은 ${daysUntil(next, now)}일 뒤에 풀려요.`;
}

/** 판매 예정 물건 자세히 보기 안내 */
export function soonNote(kind: SeasonKind, start: number, now: number): string {
  const n = daysUntil(start, now);
  return kind === "cos" ? `지금은 입어 보기만 돼요. 값은 ${n}일 뒤 판매를 시작할 때 공개해요.` : `지금은 둘러보기만 돼요. 값은 ${n}일 뒤 판매를 시작할 때 공개해요.`;
}

/** 산 뒤 알림 */
export function boughtText(name: string, mode: "day" | "perm" | "furn"): string {
  const it = `${name}${batchim(name) ? "을" : "를"}`;
  if (mode === "day") return `${it} 가방에 넣었어요.`;
  if (mode === "perm") return `${it} 영구로 가졌어요. 가방에서 언제든 입을 수 있어요.`;
  return `${it} 가구 가방에 넣었어요.`;
}

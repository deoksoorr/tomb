import type { ItemKind } from "@tomb/protocol";

// 다른 창에서 상점을 특정 탭으로 열 때 (가방 "염색권" 칸 → 상점 "염색·외형"). 한 번 읽으면 지운다.
let next: ItemKind | null = null;

export function openShopTab(kind: ItemKind): void {
  next = kind;
}

export function takeShopTab(): ItemKind | null {
  const k = next;
  next = null;
  return k;
}

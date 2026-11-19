import type { ItemKind } from "@tomb/protocol";

// 다른 창에서 상점을 특정 탭으로 열 때 (가방 "염색권" 칸 → 상점 "염색·외형"). 한 번 읽으면 지운다.
// 11/19 item = 그 탭에서 먼저 골라 둘 물건 (외치기 창 [상점에서 사기] → 확성기 탭의 그 확성기)
let next: { kind: ItemKind; item?: string } | null = null;

export function openShopTab(kind: ItemKind, item?: string): void {
  next = item ? { kind, item } : { kind };
}

export function takeShopTab(): { kind: ItemKind; item?: string } | null {
  const k = next;
  next = null;
  return k;
}

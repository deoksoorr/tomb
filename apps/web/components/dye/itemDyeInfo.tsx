"use client";

import { isDyeableCosmetic, isDyeSlotCosmetic } from "@tomb/protocol";
import type { Me } from "@/lib/types";
import { cx } from "../ui/cx";
import { DyeValue } from "./dyeValue";
import styles from "./itemDyeInfo.module.css";

export { DyeValue };

// 11/22 아이템 정보의 염색 한 줄 (가방 [꾸미기] · 상점 내 소유 표시가 같이 쓴다).
//  - 「염색: ■ #3a7bd5」 (특수 색이면 이름도), 안 칠했으면 「원래 색」, 연·noDye·보상은 「염색 불가」 (11/22 날개는 염색된다)
// 색 보관함(칸 고르기·칠하기·칸 열기·팔기)은 가방 아이템 페이지 (ItemWardrobe)

type ItemDyes = NonNullable<Me["itemDyes"]>;

/** 지금 입는 색 (원래 색이면 null) */
export function itemColorOf(itemDyes: ItemDyes | undefined, itemId: string): string | null {
  const st = itemDyes?.[itemId];
  return st && st.sel >= 0 ? (st.colors[st.sel] ?? null) : null;
}

/** 「염색: …」 한 줄 (머리·목·옷·등 꾸미기만 — 그 밖은 아무것도 안 그린다) */
export function ItemDyeLine({ itemId, itemDyes, className }: { itemId: string; itemDyes?: ItemDyes; className?: string }) {
  if (!isDyeSlotCosmetic(itemId)) return null;
  return (
    <span className={cx(styles.line, className)}>
      염색: {isDyeableCosmetic(itemId) ? <DyeValue color={itemColorOf(itemDyes, itemId)} /> : <span className={styles.value}>염색 불가</span>}
    </span>
  );
}

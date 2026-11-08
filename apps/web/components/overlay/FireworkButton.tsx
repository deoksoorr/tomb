"use client";

import { useMe } from "@/lib/hooks/useMe";
import { bagEntries } from "../account/items";
import ItemIcon from "../ui/ItemIcon";
import styles from "./FireworkButton.module.css";

/** 데스크톱: 가방에 폭죽이 있을 때만 보이는 버튼 (누르면 고르는 창) */
export default function FireworkButton({ onOpen }: { onOpen: () => void }) {
  const { me } = useMe();
  const stock = me ? bagEntries(me.inventory, "firework") : [];
  const total = stock.reduce((n, e) => n + e.count, 0);
  if (total === 0) return null;
  return (
    <button type="button" className={styles.button} onClick={onOpen} aria-label={`폭죽 쏘기 (${total}개)`}>
      <ItemIcon itemId={stock[0].item.id} size={32} />
      <span className={styles.badge} aria-hidden="true">
        {total}
      </span>
    </button>
  );
}

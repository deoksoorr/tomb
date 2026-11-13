"use client";

import { useMe } from "@/lib/hooks/useMe";
import { bagEntries } from "../account/items";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./FireworkButton.module.css";

/**
 * 가방에 폭죽이 있을 때만 보이는 버튼 (누르면 고르는 창).
 * - dock: 데스크톱 아래 바로 가기 줄 맨 끝 동그라미
 * - top: 위쪽 줄 칸 (불멍·놀이기구 중 바로 가기 줄이 숨을 때, 데스크톱·터치 모두)
 */
export default function FireworkButton({ onOpen, variant = "dock" }: { onOpen: () => void; variant?: "dock" | "top" }) {
  const { me } = useMe();
  const stock = me ? bagEntries(me.inventory, "firework") : [];
  const total = stock.reduce((n, e) => n + e.count, 0);
  if (total === 0) return null;
  const top = variant === "top";
  return (
    <button
      type="button"
      className={top ? cx(ui.button, ui.icon, ui.top, styles.top) : styles.button}
      onClick={onOpen}
      aria-label={`폭죽 쏘기 (${total}개)`}
      title={top ? "폭죽 쏘기" : undefined}
    >
      <ItemIcon itemId={stock[0].item.id} size={top ? 24 : 32} />
      <span className={cx(styles.badge, top && styles.topBadge)} aria-hidden="true">
        {total}
      </span>
    </button>
  );
}

"use client";

import { useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { fireFirework } from "../account/actions";
import { bagEntries } from "../account/items";
import ItemIcon from "../ui/ItemIcon";
import styles from "./FireworkButton.module.css";

/** 가방에 폭죽이 있을 때만 보인다. 한 종류면 바로 쏘고, 여러 종류면 고르게 한다 */
export default function FireworkButton() {
  const { me } = useMe();
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stock = me ? bagEntries(me.inventory, "firework") : [];
  const total = stock.reduce((n, e) => n + e.count, 0);
  if (total === 0) return null;

  async function fire(itemId: string) {
    setChoosing(false);
    setPending(true);
    try {
      await fireFirework(itemId);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={styles.wrap}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !choosing) return;
        setChoosing(false);
        buttonRef.current?.focus();
      }}
    >
      {choosing && (
        <div className={styles.menu} role="group" aria-label="쏠 폭죽">
          {stock.map(({ item, count }) => (
            <button key={item.id} type="button" className={styles.choice} onClick={() => fire(item.id)}>
              <ItemIcon itemId={item.id} scale={3} />
              {item.name} <span className={styles.count}>×{count}</span>
            </button>
          ))}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        onClick={() => (stock.length === 1 ? fire(stock[0].item.id) : setChoosing((v) => !v))}
        disabled={pending}
        aria-expanded={stock.length > 1 ? choosing : undefined}
        aria-label={`폭죽 쏘기 (${total}개)`}
      >
        <ItemIcon itemId={stock[0].item.id} scale={4} />
        <span className={styles.badge} aria-hidden="true">
          {total}
        </span>
      </button>
    </div>
  );
}

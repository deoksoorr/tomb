"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks/useMe";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { fireFirework } from "./actions";
import { bagEntries } from "./items";
import styles from "./BagDialog.module.css";

/** 쏠 폭죽 고르기. 하나만 남아도 이름을 보고 고르게 한다 (바로 쏘지 않는다) */
export default function FireworkDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stock = me ? bagEntries(me.inventory, "firework") : [];

  async function fire(itemId: string) {
    setPending(true);
    setError(null);
    try {
      await fireFirework(itemId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog title="폭죽 쏘기" onClose={onClose} size="sm">
      <div className={styles.bag}>
        {stock.length === 0 ? (
          <p className={styles.empty}>가방에 폭죽이 없어요. 상점에서 살 수 있어요.</p>
        ) : (
          <ul className={styles.list}>
            {stock.map(({ item, count }) => (
              <li key={item.id} className={styles.row}>
                <ItemIcon itemId={item.id} size={32} />
                <span className={styles.main}>
                  <span className={styles.name}>
                    {item.name} <span className={styles.count}>×{count}</span>
                  </span>
                  <span className={styles.meta}>{item.desc}</span>
                </span>
                <button type="button" className={ui.button} onClick={() => fire(item.id)} disabled={pending}>
                  쏘기
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

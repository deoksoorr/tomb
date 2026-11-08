"use client";

import { useEffect, useId, useState } from "react";
import { ITEMS, type ItemDef, type ItemKind } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cosmeticBlock, effectLabel, KIND_LABELS } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./ShopDialog.module.css";

const TABS: ItemKind[] = ["firework", "cosmetic", "decor", "graveStyle"];

/** 상점 주인장 창. 산 물건은 가방으로 간다 (쓰는 곳: 폭죽 버튼·내 정보·내 묘비 상세) */
export default function ShopDialog({ onClose }: { onClose: () => void }) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<ItemKind>("firework");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const baseId = useId();
  // 착용 남은 시간 판단 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function buy(item: ItemDef) {
    setPending(item.id);
    setNotice(null);
    try {
      const res = await api.buy(item.id);
      meStore.set(res.me);
      setNotice(`${item.name}을(를) 가방에 넣었어요.`);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog title="상점" onClose={onClose} size="lg">
      <div className={styles.shop}>
        <div className={styles.top}>
          <p className={styles.balance}>
            내 포인트 <strong>{me ? me.points.toLocaleString("ko-KR") : "–"}</strong>
          </p>
          <p className={ui.hint}>모든 물건은 한 번 쓰면 사라져요. 산 물건은 내 정보의 가방에 들어가요.</p>
        </div>
        {!me && error && <p className={ui.error}>{error}</p>}

        <div className={styles.tabs} role="tablist" aria-label="물건 종류">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${baseId}-${k}`}
              aria-selected={tab === k}
              aria-controls={`${baseId}-panel`}
              className={styles.tab}
              onClick={() => setTab(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <ul id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.grid}>
          {ITEMS.filter((item) => item.kind === tab).map((item) => {
            const owned = me?.inventory[item.id] ?? 0;
            const short = me !== null && me.points < item.price;
            const blocked = me ? cosmeticBlock(item, me.inventory, me.equipped, openedAt) : null;
            return (
              <li key={item.id} className={styles.card}>
                <div className={styles.preview}>
                  <ItemIcon itemId={item.id} size={64} />
                </div>
                <p className={styles.name}>{item.name}</p>
                <p className={styles.desc}>{item.desc}</p>
                <p className={styles.meta}>
                  {effectLabel(item)}
                  {owned > 0 && ` · 가방에 ${owned}개`}
                </p>
                <button
                  type="button"
                  className={cx(ui.button, styles.buy)}
                  onClick={() => buy(item)}
                  disabled={!me || short || blocked !== null || pending !== null}
                  aria-label={`${item.name}, ${item.price}포인트에 사기`}
                >
                  {pending === item.id
                    ? "사는 중…"
                    : blocked
                      ? blocked
                      : `${item.price}P${short ? " · 모자라요" : " · 사기"}`}
                </button>
              </li>
            );
          })}
        </ul>

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}

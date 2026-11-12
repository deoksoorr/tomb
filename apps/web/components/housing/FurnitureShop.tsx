"use client";

import { useId, useState } from "react";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { CATEGORY_LABELS, FURNITURE, MAX_OWN_PER_ITEM, sellPrice, type FurnitureCategory, type FurnitureDef } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { MyHouseResponse } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";
import { fmt, FurnitureThumb } from "./parts";

const CATS: FurnitureCategory[] = ["furniture", "living", "dev", "nature", "mood", "skin", "exterior"];

type Props = {
  my: MyHouseResponse;
  /** 지금 놓여 있는 개수 (편집 중이면 저장 전 배치 기준) */
  placed: Record<string, number>;
  onMy: (r: MyHouseResponse) => void;
  onClose: () => void;
};

/** 가구 상점: 산 물건은 하우징 가방에 들어가고, 놓지 않은 것은 절반 값에 되팔 수 있다 */
export default function FurnitureShop({ my, placed, onMy, onClose }: Props) {
  const [cat, setCat] = useState<FurnitureCategory>("furniture");
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const id = useId();

  async function act(def: FurnitureDef, sell: boolean) {
    setPending(def.id);
    setMsg(null);
    try {
      if (sell) {
        const r = await housingApi.sellItem(def.id);
        onMy(r);
        setMsg(`${def.name}을(를) ${r.refunded}P에 팔았어요.`);
      } else {
        onMy(await housingApi.buyItem(def.id));
        setMsg(`${def.name}을(를) 가방에 넣었어요.`);
      }
      void meStore.refresh();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog title="가구 상점" onClose={onClose}>
      <div className={cx(styles.stack, styles.fsShop)}>
        <div className={styles.spread}>
          <p className={styles.points}>
            내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          <p className={styles.small}>되팔면 절반을 돌려받아요. 놓여 있는 물건은 먼저 치운 뒤 저장해야 팔 수 있어요.</p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="물건 갈래">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              id={`${id}-${c}`}
              aria-selected={cat === c}
              aria-controls={`${id}-panel`}
              className={styles.tab}
              onClick={() => setCat(c)}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <ul id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${cat}`} className={cx(styles.shopGrid, styles.fsGrid)}>
          {FURNITURE.filter((f) => f.category === cat).map((f) => {
            const owned = my.inventory[f.id] ?? 0;
            const free = owned - (placed[f.id] ?? 0);
            const short = my.points < f.price;
            const full = owned >= MAX_OWN_PER_ITEM;
            return (
              <li key={f.id} className={styles.item} title={`${f.name} — ${f.desc}`}>
                <div className={styles.itemArt}>
                  <FurnitureThumb itemId={f.id} ext={!!f.ext} />
                </div>
                <p className={styles.itemName}>{f.name}</p>
                <p className={cx(styles.small, styles.fsDesc)}>{f.desc}</p>
                <p className={styles.itemMeta}>
                  꾸밈 +{f.score} · {f.ext ? "외관 (외관 꾸미기에서 입힘)" : f.skin ? (f.skin === "floor" ? "바닥 전체" : "벽 전체") : `${f.w}×${f.h}칸`}
                  {f.use ? ` · E: ${f.use}` : ""}
                  {f.floor ? " · 밟고 지나감" : ""}
                  {f.light ? " · 밤에 빛남" : ""}
                  {owned > 0 ? ` · 가진 것 ${owned}` : ""}
                </p>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={cx(ui.button, ui.primary)}
                    disabled={pending !== null || short || full || ((!!f.skin || !!f.ext) && owned > 0)}
                    onClick={() => act(f, false)}
                    aria-label={`${f.name}, ${f.price}포인트에 사기`}
                  >
                    {pending === f.id ? "…" : (f.skin || f.ext) && owned > 0 ? "가짐" : `${fmt(f.price)}P`}
                  </button>
                  {owned > 0 && (
                    <button
                      type="button"
                      className={ui.button}
                      disabled={pending !== null || free < 1}
                      onClick={() => act(f, true)}
                      aria-label={`${f.name} 하나를 ${sellPrice(f)}포인트에 되팔기`}
                    >
                      팔기 {sellPrice(f)}P
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}

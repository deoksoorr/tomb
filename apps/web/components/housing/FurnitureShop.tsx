"use client";

import { useId, useRef, useState } from "react";
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

/** 갈래 탭 순서: 가구·사무실·자연·분위기·생활·바닥·벽지·외관(담장 등) */
const CATS: FurnitureCategory[] = ["furniture", "dev", "nature", "mood", "living", "skin", "exterior"];
const COUNTS = Object.fromEntries(CATS.map((c) => [c, FURNITURE.filter((f) => f.category === c).length])) as Record<FurnitureCategory, number>;

type Props = {
  my: MyHouseResponse;
  /** 지금 놓여 있는 개수 (편집 중이면 저장 전 배치 기준) */
  placed: Record<string, number>;
  onMy: (r: MyHouseResponse) => void;
  onClose: () => void;
};

/** 물건이 하는 일 (자세히 보기의 "할 수 있는 일" 줄) */
function abilities(f: FurnitureDef): string[] {
  const out: string[] = [];
  if (f.ext) out.push("집 외관에 입혀요 (외관 꾸미기)");
  else if (f.skin) out.push(f.skin === "floor" ? "방 바닥 전체를 바꿔요" : "방 벽 전체를 바꿔요");
  else out.push(`${f.w}×${f.h}칸을 차지해요`);
  if (f.use) out.push(`E 키: ${f.use}`);
  if (f.floor) out.push("밟고 지나갈 수 있고 위에 물건을 올려요");
  if (f.light) out.push("밤에 빛나요");
  return out;
}

/**
 * 가구 상점: 갈래 탭 → 썸네일 격자 → 누르면 자세히 보기(설명·꾸밈 점수·할 수 있는 일·사기/되팔기).
 * 상점과 같은 규칙: 마우스를 올려도 선택은 바뀌지 않고, 눌러야 바뀐다. 창은 표준 크기, 목록만 스크롤한다.
 * 산 물건은 하우징 가방에 들어가고, 놓지 않은 것은 절반 값에 되팔 수 있다.
 */
export default function FurnitureShop({ my, placed, onMy, onClose }: Props) {
  const [cat, setCat] = useState<FurnitureCategory>("furniture");
  const [picked, setPicked] = useState<Partial<Record<FurnitureCategory, string>>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const items = FURNITURE.filter((f) => f.category === cat);
  const shown = items.find((f) => f.id === picked[cat]) ?? items[0];

  function switchTab(c: FurnitureCategory) {
    setCat(c);
    listRef.current?.scrollTo({ top: 0 });
  }

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

  function detail(f: FurnitureDef) {
    const owned = my.inventory[f.id] ?? 0;
    const free = owned - (placed[f.id] ?? 0);
    const short = my.points < f.price;
    const full = owned >= MAX_OWN_PER_ITEM;
    const once = (!!f.skin || !!f.ext) && owned > 0;
    return (
      <section className={styles.fsDetail} aria-label="자세히 보기" aria-live="polite">
        <div className={styles.fsDetailArt}>
          <FurnitureThumb itemId={f.id} ext={!!f.ext} />
        </div>
        <div className={styles.fsInfo}>
          <p className={styles.fsName}>{f.name}</p>
          <p className={styles.fsText}>{f.desc}</p>
          <p className={styles.fsScore}>
            꾸밈 점수 <strong>+{f.score}</strong>
            {owned > 0 && <span className={styles.small}> · 가진 것 {owned}{placed[f.id] ? ` (놓은 것 ${placed[f.id]})` : ""}</span>}
          </p>
          <ul className={styles.fsAbilities} aria-label="할 수 있는 일">
            {abilities(f).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <div className={styles.fsActions}>
            <button
              type="button"
              className={cx(ui.button, ui.primary)}
              disabled={pending !== null || short || full || once}
              onClick={() => act(f, false)}
              aria-label={`${f.name}, ${f.price}포인트에 사기`}
            >
              {pending === f.id ? "…" : once ? "가짐" : full ? "더 못 가져요" : `${fmt(f.price)}P${short ? " · 모자라요" : " · 사기"}`}
            </button>
            {owned > 0 && (
              <button
                type="button"
                className={ui.button}
                disabled={pending !== null || free < 1}
                onClick={() => act(f, true)}
                aria-label={`${f.name} 하나를 ${sellPrice(f)}포인트에 되팔기`}
                title={free < 1 ? "놓여 있는 물건은 먼저 치운 뒤 저장해야 팔 수 있어요" : undefined}
              >
                되팔기 {sellPrice(f)}P
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <Dialog title="가구 상점" onClose={onClose}>
      <div className={styles.fsShop}>
        <div className={styles.fsTop}>
          <p className={styles.points}>
            내 포인트 <strong>{fmt(my.points)}P</strong>
          </p>
          <p className={cx(styles.small, styles.fsHint)}>되팔면 절반 · 놓인 물건은 치우고 저장한 뒤 팔 수 있어요</p>
        </div>
        <div className={styles.fsTabs} role="tablist" aria-label="물건 갈래">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              id={`${id}-${c}`}
              aria-selected={cat === c}
              aria-controls={`${id}-panel`}
              className={styles.tab}
              onClick={() => switchTab(c)}
            >
              {CATEGORY_LABELS[c]}
              <span className={styles.fsTabCount}>{COUNTS[c]}</span>
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${cat}`} className={styles.fsPanel}>
          {shown && detail(shown)}
          <ul ref={listRef} className={styles.fsGrid} aria-label={`${CATEGORY_LABELS[cat]} 목록`}>
            {items.map((f) => {
              const owned = my.inventory[f.id] ?? 0;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={styles.fsTile}
                    aria-pressed={shown?.id === f.id}
                    title={`${f.name} — ${f.desc}`}
                    aria-label={`${f.name}, ${f.price}포인트, 꾸밈 +${f.score}${owned > 0 ? `, ${owned}개 가짐` : ""}`}
                    onClick={() => setPicked((p) => ({ ...p, [cat]: f.id }))}
                  >
                    <FurnitureThumb itemId={f.id} ext={!!f.ext} />
                    <span className={styles.fsTileName}>{f.name}</span>
                    <span className={styles.fsTilePrice}>
                      {fmt(f.price)}P
                      {owned > 0 && <span className={styles.fsBadge}>{(f.skin || f.ext) ? "가짐" : `×${owned}`}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}

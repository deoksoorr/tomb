"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { ITEMS, SHOP_KINDS, type ItemDef, type ItemKind } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { cosmeticBlock, currentLook, effectLabel, KIND_LABELS } from "../account/items";
import { matchesSlot, resolveAvatar, SHOP_COSMETICS, SLOT_NAMES, SLOT_ORDER, slotCounts, type SlotFilter } from "../account/wardrobe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { fittingLook } from "./fitting";
import OutfitPreview from "./OutfitPreview";
import styles from "./ShopDialog.module.css";

// F8: 묘비 꾸미기(decor)는 당분간 상점에서 숨긴다 (SHOP_KINDS). 데이터·API·가방의 "묘비에 놓기"는 그대로.
// F12: 탭을 바꿔도 창 크기가 그대로 (Dialog fixed). 왼쪽(폰은 위) 자세히 보기 + 오른쪽 작은 썸네일 격자(스크롤).
//      썸네일에 마우스를 올리거나 초점을 주면 자세히 보기에 설명이 뜨고, 폰에서는 눌러서 고른다.

const TABS: readonly ItemKind[] = SHOP_KINDS;
const COSMETICS = SHOP_COSMETICS;
const SLOT_COUNTS = slotCounts(COSMETICS);
/** 착용 부위 필터 (물건이 없는 부위는 숨긴다) */
const SLOT_FILTERS = (["all", ...SLOT_ORDER] as SlotFilter[]).filter((f) => SLOT_COUNTS[f] > 0);
const byKind = (k: ItemKind) => ITEMS.filter((i) => i.kind === k);
const FIRST: Partial<Record<ItemKind, string>> = Object.fromEntries(TABS.map((k) => [k, byKind(k)[0]?.id ?? ""]));

type Props = {
  onClose: () => void;
  /** 게임 속 내 아바타 (입장할 때 정한 색·몸). 없으면 계정 → 이 기기에 남은 색 → 기본값 */
  avatar?: { color: string; body?: string };
};

/** 상점 주인장 창. 산 물건은 가방으로 간다 (쓰는 곳: 폭죽 버튼·내 정보·내 묘비 상세) */
export default function ShopDialog({ onClose, avatar }: Props) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<ItemKind>("firework");
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const baseId = useId();
  // 착용 남은 시간 판단 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());
  // 탭마다 고른 것 + 마우스를 올린 것 (올린 것이 잠깐 먼저 보인다)
  const [picked, setPicked] = useState(FIRST);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [savedColor] = useState(() => readItem(LS.color));

  useEffect(() => {
    void meStore.refresh();
  }, []);

  const { color, body } = resolveAvatar(avatar, me, savedColor);
  const items = byKind(tab).filter((item) => tab !== "cosmetic" || matchesSlot(item.slot, slotFilter));
  const all = byKind(tab);
  const shown = all.find((i) => i.id === (hoverId ?? picked[tab])) ?? all[0];
  const fitting = fittingLook(me ? currentLook(me.equipped, openedAt) : [], shown?.kind === "cosmetic" ? shown.id : null);
  const fitNote = fitting.wearing ? "지금 착용 중이에요." : fitting.replaced ? `입으면 지금 입은 ${fitting.replaced.name}은(는) 벗어 둬요.` : null;

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

  function pick(id: string) {
    setPicked((p) => ({ ...p, [tab]: id }));
    setHoverId(null);
  }

  function switchTab(k: ItemKind) {
    setTab(k);
    setHoverId(null);
    listRef.current?.scrollTo({ top: 0 });
  }

  const hover = (id: string | null) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setHoverId(id);
  };

  function buyButton(item: ItemDef) {
    const short = me !== null && me.points < item.price;
    const blocked = me ? cosmeticBlock(item, me.inventory, me.equipped, openedAt, me.stash) : null;
    return (
      <button
        type="button"
        className={cx(ui.button, ui.primary, styles.buy)}
        onClick={() => buy(item)}
        disabled={!me || short || blocked !== null || pending !== null}
        aria-label={`${item.name}, ${item.price}포인트에 사기`}
      >
        {pending === item.id ? "사는 중…" : blocked ? blocked : `${item.price}P${short ? " · 모자라요" : " · 사기"}`}
      </button>
    );
  }

  const owned = (item: ItemDef) => me?.inventory[item.id] ?? 0;
  const stashed = (item: ItemDef) => item.kind === "cosmetic" && !!me?.stash?.some((e) => e.itemId === item.id && e.until > openedAt);
  const worn = (item: ItemDef) => item.kind === "cosmetic" && !!me?.equipped.some((e) => e.itemId === item.id && e.until > openedAt);

  return (
    <Dialog title="상점" onClose={onClose} size="lg" fixed>
      <div className={styles.shop}>
        <div className={styles.top}>
          <p className={styles.balance}>
            내 포인트 <strong>{me ? me.points.toLocaleString("ko-KR") : "–"}</strong>
          </p>
          <p className={styles.topHint}>한 번 쓰면 사라져요 · 산 물건은 가방으로</p>
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
              onClick={() => switchTab(k)}
            >
              {KIND_LABELS[k]}
              <span className={styles.tabCount}>{byKind(k).length}</span>
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.panel} data-kind={tab}>
          {shown && (
            <section className={styles.detail} aria-label="자세히 보기" aria-live="polite">
              {shown.kind === "cosmetic" ? (
                <OutfitPreview
                  className={styles.fitPreview}
                  color={color}
                  body={body}
                  look={fitting.look}
                  label={`내 아바타가 ${shown.name}을(를) 입어 본 모습`}
                />
              ) : (
                <div className={styles.bigIcon}>
                  <ItemIcon itemId={shown.id} size={shown.id.startsWith("gs_") ? 96 : 64} />
                </div>
              )}
              <div className={styles.info}>
                <p className={styles.name}>
                  {shown.slot && <span className={styles.slotTag}>{SLOT_NAMES[shown.slot]}</span>}
                  {shown.name}
                </p>
                <p className={styles.desc}>{shown.desc}</p>
                <p className={styles.meta}>
                  {effectLabel(shown)}
                  {owned(shown) > 0 && ` · 가방에 ${owned(shown)}개`}
                  {stashed(shown) && " · 벗어 둠"}
                </p>
                {fitNote && shown.kind === "cosmetic" && <p className={styles.fitNote}>{fitNote}</p>}
                {buyButton(shown)}
              </div>
            </section>
          )}

          <div className={styles.listCol}>
            {tab === "cosmetic" && (
              <div className={styles.slotFilter} role="group" aria-label="착용 부위">
                {SLOT_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={styles.slotChip}
                    aria-pressed={slotFilter === f}
                    aria-label={`${f === "all" ? "전체" : SLOT_NAMES[f]} ${SLOT_COUNTS[f]}개`}
                    onClick={() => {
                      setSlotFilter(f);
                      listRef.current?.scrollTo({ top: 0 });
                    }}
                  >
                    {f === "all" ? "전체" : SLOT_NAMES[f]}
                    <span className={styles.slotCount}>{SLOT_COUNTS[f]}</span>
                  </button>
                ))}
              </div>
            )}
            <ul ref={listRef} className={styles.grid} aria-label={`${KIND_LABELS[tab]} 목록`}>
              {items.map((item) => {
                const isPicked = picked[tab] === item.id;
                const n = owned(item);
                return (
                  <li key={item.id} onPointerEnter={hover(item.id)} onPointerLeave={hover(null)}>
                    <button
                      type="button"
                      className={styles.tile}
                      aria-pressed={isPicked}
                      title={`${item.name} — ${item.desc}`}
                      aria-label={`${item.name}, ${item.price}포인트${item.kind === "cosmetic" ? ", 눌러서 입어 보기" : ""}`}
                      onClick={() => pick(item.id)}
                      onFocus={() => setHoverId(item.id)}
                      onBlur={() => setHoverId(null)}
                    >
                      <span className={styles.thumb}>
                        <ItemIcon itemId={item.id} size={item.id.startsWith("gs_") ? 32 : 48} />
                      </span>
                      <span className={styles.tileName}>{item.name}</span>
                      <span className={styles.tilePrice}>
                        {item.price}P
                        {worn(item) ? <span className={styles.badge}>착용</span> : n > 0 || stashed(item) ? <span className={styles.badge}>보유</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}

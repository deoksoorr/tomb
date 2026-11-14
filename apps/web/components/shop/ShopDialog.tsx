"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isNameSlot, isPermanentUntil, isShopListed, ITEMS, permanentPrice, SHOP_KINDS, titleOfLook, type ItemDef, type ItemKind } from "@tomb/protocol";
import { discountedPrice, titlePerk } from "@/lib/titles";
import { api, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { applyStyle } from "../account/actions";
import { cosmeticBlock, currentLook, effectLabel, KIND_LABELS } from "../account/items";
import StylePanel from "../dye/StylePanel";
import { matchesSlot, resolveAvatar, SHOP_COSMETICS, SLOT_NAMES, SLOT_ORDER, slotCounts, type SlotFilter } from "../account/wardrobe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import ui from "../ui/ui.module.css";
import { fittingLook } from "./fitting";
import FireworkPreview from "./FireworkPreview";
import NameStylePreview from "./NameStylePreview";
import OutfitPreview from "./OutfitPreview";
import { takeShopTab } from "./shopTab";
import styles from "./ShopDialog.module.css";

// F8: 묘비 꾸미기(decor)는 당분간 상점에서 숨긴다 (SHOP_KINDS). 데이터·API·가방의 "묘비에 놓기"는 그대로.
// F12: 탭을 바꿔도 창 크기가 그대로 (Dialog fixed). 왼쪽(폰은 위) 자세히 보기 + 오른쪽 작은 썸네일 격자(스크롤).
//      썸네일에 마우스를 올리거나 초점을 주면 자세히 보기에 설명이 뜨고, 폰에서는 눌러서 고른다.

const TABS: readonly ItemKind[] = SHOP_KINDS;
const COSMETICS = SHOP_COSMETICS;
const SLOT_COUNTS = slotCounts(COSMETICS);
/** 착용 부위 필터 (물건이 없는 부위는 숨긴다) */
const SLOT_FILTERS = (["all", ...SLOT_ORDER] as SlotFilter[]).filter((f) => SLOT_COUNTS[f] > 0);
// 펫은 상점에서 팔지 않는다 (동물원 사육사에게서 영구로만 — isShopListed). 이미 가진 펫은 가방에서 그대로 쓴다
// 31번 운영자에게는 운영자 전용 꾸미기도 보인다 (값 0, 영구로만 받는다 — 서버가 운영자인지 확인)
// 운영자 전용 아이템은 상점에 내놓지 않는다 (운영자 계정 가방에 자동으로 들어온다)
const listed = (k: ItemKind, _staff: boolean) => ITEMS.filter((i) => i.kind === k && isShopListed(i));
const byKind = (k: ItemKind) => listed(k, false);
const FIRST: Partial<Record<ItemKind, string>> = Object.fromEntries(TABS.map((k) => [k, byKind(k)[0]?.id ?? ""]));

type Props = {
  onClose: () => void;
  /** 게임 속 내 아바타 (입장할 때 정한 색·몸). 없으면 계정 → 이 기기에 남은 색 → 기본값 */
  avatar?: { color: string; body?: string };
};

/** 상점 주인장 창. 산 물건은 가방으로 간다 (쓰는 곳: 폭죽 버튼·내 정보·내 묘비 상세) */
export default function ShopDialog({ onClose, avatar }: Props) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<ItemKind>(() => takeShopTab() ?? "firework");
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
  const staffView = me?.staff === true;
  /** 단 칭호의 상점 할인 (lib/titles TITLE_PERKS — 서버가 같은 규칙으로 깎는다) */
  const discount = me ? titlePerk(titleOfLook(me.equipped.map((e) => e.itemId))).discount : 0;
  const all = listed(tab, staffView);
  const items = all.filter((item) => tab !== "cosmetic" || matchesSlot(item.slot, slotFilter));
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


  function buyButton(item: ItemDef) {
    const cost = discountedPrice(item.price, discount);
    const short = me !== null && me.points < cost;
    const blocked = me ? cosmeticBlock(item, me.inventory, me.equipped, openedAt, me.stash) : null;
    return (
      <button
        type="button"
        className={cx(ui.button, ui.primary, styles.buy)}
        onClick={() => buy(item)}
        disabled={!me || short || blocked !== null || pending !== null}
        aria-label={`${item.name}, ${cost}포인트에 사기${cost < item.price ? ` (칭호 할인, 원래 ${item.price}포인트)` : ""}`}
      >
        {pending === item.id ? (
          "사는 중…"
        ) : blocked ? (
          blocked
        ) : (
          // 단추가 flex라 조각마다 따로 줄바꿈되지 않게 한 덩어리로
          <span>
            {/* 칭호 할인가가 붙으면 줄이 넘치지 않게 "이용권"을 뺀다 */}
            {item.kind === "cosmetic" ? (cost < item.price ? "⏱ 24시간 · " : "⏱ 24시간 이용권 · ") : ""}
            <Price price={item.price} cost={cost} />
            {short ? " · 모자라요" : " · 사기"}
          </span>
        )}
      </button>
    );
  }

  /** 30번 영구로 사기 (24시간 이용권의 4배 — protocol PERMANENT_MULTIPLIER). 입고 있던 기간제는 그대로 영구가 된다 */
  async function buyForever(item: ItemDef) {
    setPending(`${item.id}:perm`);
    setNotice(null);
    try {
      applyStyle(await dyeApi.buyPermanent(item.id));
      setNotice(`${item.name}을(를) 영구로 가졌어요. 가방의 캐릭터 꾸미기에서 언제든 입을 수 있어요.`);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const forever = (item: ItemDef) =>
    item.kind === "cosmetic" && !!me && [...me.equipped, ...(me.stash ?? [])].some((e) => e.itemId === item.id && isPermanentUntil(e.until));

  function foreverButton(item: ItemDef) {
    const base = permanentPrice(item.id);
    if (base === null) return null;
    const price = discountedPrice(base, discount);
    const short = me !== null && me.points < price;
    const has = forever(item);
    return (
      <button
        type="button"
        className={cx(ui.button, styles.buy, styles.buyForever)}
        onClick={() => buyForever(item)}
        disabled={!me || short || has || pending !== null}
        aria-label={`${item.name}, ${price}포인트에 영구로 사기`}
      >
        {pending === `${item.id}:perm` ? (
          "사는 중…"
        ) : has ? (
          "영구 소유 중"
        ) : item.staff ? (
          "운영자 전용 · 받기"
        ) : (
          <span>
            ♾ 영구 소장 · <Price price={base} cost={price} />
            {short ? " · 모자라요" : " · 사기"}
          </span>
        )}
      </button>
    );
  }

  const owned = (item: ItemDef) => me?.inventory[item.id] ?? 0;
  const stashed = (item: ItemDef) => item.kind === "cosmetic" && !!me?.stash?.some((e) => e.itemId === item.id && e.until > openedAt);
  const worn = (item: ItemDef) => item.kind === "cosmetic" && !!me?.equipped.some((e) => e.itemId === item.id && e.until > openedAt);

  return (
    <Dialog title="상점" onClose={onClose}>
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
              <span className={styles.tabCount}>{listed(k, staffView).length}</span>
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.panel} data-kind={tab}>
          {tab === "dye" ? (
            // 46·25번 염색·외형 (자세히 보기 + 목록을 따로 그린다)
            <StylePanel me={me} avatar={{ color, body }} look={me ? currentLook(me.equipped, openedAt) : []} onNotice={setNotice} />
          ) : (
          <>
          {shown && (
            <section className={cx(styles.detail, shown.kind === "cosmetic" && isNameSlot(shown.slot) && styles.detailName)} aria-label="자세히 보기" aria-live="polite">
              {shown.kind === "cosmetic" && isNameSlot(shown.slot) ? (
                // 닉네임 꾸미기: 낮·밤 머리 위 이름표 미리보기 (지금 입은 이름 글자·이름표에 고른 것을 바꿔 끼운 모습)
                <NameStylePreview
                  className={styles.namePreview}
                  color={color}
                  body={body}
                  look={fitting.look}
                  name={me?.name ?? "내 이름"}
                  label={`내 이름표에 ${shown.name}을(를) 달아 본 모습 (낮·밤)`}
                />
              ) : shown.kind === "cosmetic" ? (
                <OutfitPreview
                  className={styles.fitPreview}
                  color={color}
                  body={body}
                  look={fitting.look}
                  label={`내 아바타가 ${shown.name}을(를) 입어 본 모습`}
                />
              ) : shown.kind === "firework" ? (
                <FireworkPreview className={styles.fwPreview} itemId={shown.id} label={me?.name ?? ""} />
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
                {shown.kind === "cosmetic" && <LookScoreBadge itemId={shown.id} className={styles.lookScore} />}
                <p className={styles.meta}>
                  {effectLabel(shown)}
                  {owned(shown) > 0 && ` · 가방에 ${owned(shown)}개`}
                  {stashed(shown) && " · 벗어 둠"}
                </p>
                {fitNote && shown.kind === "cosmetic" && <p className={styles.fitNote}>{fitNote}</p>}
                {forever(shown) || shown.staff ? null : buyButton(shown)}
                {foreverButton(shown)}
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
                  <li key={item.id}>
                    <button
                      type="button"
                      className={styles.tile}
                      aria-pressed={isPicked}
                      title={`${item.name} — ${item.desc}`}
                      aria-label={`${item.name}, ${item.price}포인트${item.kind === "cosmetic" ? ", 눌러서 입어 보기" : ""}`}
                      onClick={() => pick(item.id)}
                    >
                      <span className={styles.thumb}>
                        <ItemIcon itemId={item.id} size={item.id.startsWith("gs_") ? 32 : 48} />
                      </span>
                      <span className={styles.tileName}>{item.name}</span>
                      {item.kind === "cosmetic" && <LookScoreBadge itemId={item.id} />}
                      <span className={styles.tilePrice}>
                        {item.staff ? "운영자" : <Price price={item.price} cost={discountedPrice(item.price, discount)} />}
                        {forever(item) ? <span className={styles.badge}>영구</span> : worn(item) ? <span className={styles.badge}>착용</span> : n > 0 || stashed(item) ? <span className={styles.badge}>보유</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          </>
          )}
        </div>

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}

/** 값 표시: 칭호 할인이 있으면 원가에 줄을 긋고 할인가 */
function Price({ price, cost }: { price: number; cost: number }) {
  if (cost >= price) return <>{price}P</>;
  return (
    <>
      <s className={styles.oldPrice}>{price}P</s> {cost}P
    </>
  );
}

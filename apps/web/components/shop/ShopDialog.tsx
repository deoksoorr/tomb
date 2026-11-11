"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { AVATAR_COLORS, isAvatarBody, isAvatarColor, ITEMS, type ItemDef, type ItemKind } from "@tomb/protocol";
import { api, errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { cosmeticBlock, currentLook, effectLabel, KIND_LABELS } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { fittingLook } from "./fitting";
import OutfitPreview from "./OutfitPreview";
import styles from "./ShopDialog.module.css";

const TABS: ItemKind[] = ["firework", "cosmetic", "decor", "graveStyle"];
const COSMETICS = ITEMS.filter((i) => i.kind === "cosmetic");

type Props = {
  onClose: () => void;
  /** 게임 속 내 아바타 (입장할 때 정한 색·몸). 없으면 계정 → 이 기기에 남은 색 → 기본값 */
  avatar?: { color: string; body?: string };
};

/** 상점 주인장 창. 산 물건은 가방으로 간다 (쓰는 곳: 폭죽 버튼·내 정보·내 묘비 상세) */
export default function ShopDialog({ onClose, avatar }: Props) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<ItemKind>("firework");
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const baseId = useId();
  // 착용 남은 시간 판단 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());
  // 입어 보기: 누른 꾸미기 + 마우스를 올린 꾸미기 (올린 것이 잠깐 먼저 보인다)
  const [fitId, setFitId] = useState<string>(COSMETICS[0]?.id ?? "");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const fitRef = useRef<HTMLElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [savedColor] = useState(() => readItem(LS.color));

  useEffect(() => {
    void meStore.refresh();
  }, []);

  const color = isAvatarColor(avatar?.color)
    ? avatar.color
    : isAvatarColor(me?.color)
      ? me.color
      : isAvatarColor(savedColor)
        ? savedColor
        : AVATAR_COLORS[0];
  const body = isAvatarBody(avatar?.body) ? avatar.body : isAvatarBody(me?.body) ? me.body : "hood";
  const shown = COSMETICS.find((i) => i.id === (hoverId ?? fitId)) ?? COSMETICS[0];
  const fitting = fittingLook(me ? currentLook(me.equipped, openedAt) : [], shown?.id ?? null);
  const fitNote = fitting.wearing
    ? "지금 착용 중이에요."
    : fitting.replaced
      ? `지금 ${fitting.replaced.name} 대신 착용돼요.`
      : null;

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

  /** 카드를 눌러 입어 보기. 좁은 화면(무대가 목록 위)이면 무대가 보이게 올린다 */
  function pickFit(id: string) {
    setFitId(id);
    setHoverId(null);
    fitRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  const hover = (id: string | null) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setHoverId(id);
  };

  function buyButton(item: ItemDef, className?: string) {
    const short = me !== null && me.points < item.price;
    const blocked = me ? cosmeticBlock(item, me.inventory, me.equipped, openedAt) : null;
    return (
      <button
        type="button"
        className={cx(ui.button, styles.buy, className)}
        onClick={() => buy(item)}
        disabled={!me || short || blocked !== null || pending !== null}
        aria-label={`${item.name}, ${item.price}포인트에 사기`}
      >
        {pending === item.id ? "사는 중…" : blocked ? blocked : `${item.price}P${short ? " · 모자라요" : " · 사기"}`}
      </button>
    );
  }

  const grid = (
    <ul className={cx(styles.grid, tab === "cosmetic" && styles.fitGrid)}>
      {ITEMS.filter((item) => item.kind === tab).map((item) => {
        const owned = me?.inventory[item.id] ?? 0;
        const cosmetic = item.kind === "cosmetic";
        const picked = cosmetic && fitId === item.id;
        return (
          <li
            key={item.id}
            className={styles.card}
            data-picked={picked || undefined}
            onPointerEnter={cosmetic ? hover(item.id) : undefined}
            onPointerLeave={cosmetic ? hover(null) : undefined}
          >
            {cosmetic ? (
              <button
                type="button"
                className={cx(styles.preview, styles.tryOn)}
                aria-pressed={picked}
                aria-label={`${item.name} 입어 보기`}
                onClick={() => pickFit(item.id)}
              >
                <ItemIcon itemId={item.id} size={64} />
                <span className={styles.tryLabel}>{picked ? "입어 보는 중" : "입어 보기"}</span>
              </button>
            ) : (
              <div className={styles.preview}>
                <ItemIcon itemId={item.id} size={64} />
              </div>
            )}
            <p className={styles.name}>{item.name}</p>
            <p className={styles.desc}>{item.desc}</p>
            <p className={styles.meta}>
              {effectLabel(item)}
              {owned > 0 && ` · 가방에 ${owned}개`}
            </p>
            {buyButton(item)}
          </li>
        );
      })}
    </ul>
  );

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

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`}>
          {tab === "cosmetic" && shown ? (
            <div className={styles.fitting}>
              <section ref={fitRef} className={styles.fitPanel} aria-label="입어 보기">
                <p className={styles.fitTitle}>
                  <span className={styles.fitKicker}>입어 보기</span> {shown.name}
                </p>
                <OutfitPreview color={color} body={body} look={fitting.look} label={`내 아바타가 ${shown.name}을(를) 입어 본 모습`} />
                <p className={styles.fitNote} aria-live="polite">
                  {fitNote}
                </p>
                {buyButton(shown, styles.fitBuy)}
              </section>
              {grid}
            </div>
          ) : (
            grid
          )}
        </div>

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}

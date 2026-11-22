"use client";

import { useState } from "react";
import { CHAR_DYE_PARTS, DYE_PART_NAMES, dyeHex, dyeSpecialOf, DYE_SPECIAL_NAMES, itemById, wornDyeItems, type DyeTarget } from "@tomb/protocol";
import { specDye } from "@/game/sprites/avatar";
import { errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { swatchStyle } from "@/lib/dye/look";
import { useMe } from "@/lib/hooks/useMe";
import { applyStyle } from "../account/actions";
import { SLOT_NAMES } from "../account/wardrobe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import { colorSlots, type ItemDyes } from "./colorSlots";
import styles from "./DyeTargetPicker.module.css";

// 11/22 염색 창의 ① 칠할 곳 · ② 칸 고르기 (무작위·고정 색·색 확정·특수색 확정 모두 같은 창 DyeDialog).
// ① 위 줄 = 캐릭터 3부위(머리·몸·포인트), 아래 줄 = 지금 입은 머리·목·옷·등 꾸미기. 연·noDye·보상은 「염색 불가」로 눌리지 않는다 (11/22 날개는 된다)
//    (서버도 같은 규칙으로 거절 — 염색권을 쓰지 않는다)
// ② 아이템이면 커스텀 칸 3개: 칠한 칸(덮어쓰기는 칠할 때 묻는다) · 빈 칸 · 잠긴 칸(다음 칸이면 눌러 포인트로 연다)
// 칸 열기 확인 창(SlotOpenDialog)은 가방 아이템 페이지도 같이 쓴다.

export type { ItemDyes };

const DEFAULT_SWATCH = "repeating-linear-gradient(45deg,#d9ceb2 0 4px,#e6a3b0 4px 8px)";
/** 칸 이름이 길면 줄여 보인다 (무릎까지 롱패딩 → 롱패딩) */
const shortName = (id: string) => (itemById(id)?.name ?? id).split(" ").slice(-1)[0];

/** 색 한 줄 글자: 특수 색이면 이름, 아니면 #hex */
export const colorText = (c: string) => {
  const k = dyeSpecialOf(c);
  return k ? DYE_SPECIAL_NAMES[k] : dyeHex(c);
};

type TargetProps = {
  /** 지금 색 표기 (염색이 들어 있다) */
  spec: string;
  look: readonly string[];
  target: DyeTarget;
  onPick: (t: DyeTarget) => void;
  /** 이 염색권으로 쓸 수 있는 대상 (고정 색 염색권의 parts) — 아니면 흐리게 */
  allowed?: (t: DyeTarget) => boolean;
  disabled?: boolean;
  /** 염색 안 한 캐릭터 부위의 지금 색 (머리·몸은 기본색, 포인트는 몸마다 달라 null) */
  baseColor?: (t: DyeTarget) => string | null;
  /** 이번에 칠할 아이템이 입지 않은 것이면 (가방 아이템 페이지에서 연 경우) 그 아이템도 줄에 둔다 */
  extraItem?: string | null;
};

/** ① 어디에 칠할까요: 캐릭터 줄 · 입은 꾸미기 줄 */
export function TargetPicker({ spec, look, target, onPick, allowed = () => true, disabled = false, baseColor, extraItem }: TargetProps) {
  const dye = specDye(spec);
  const worn = wornDyeItems(look);
  const items = extraItem && !worn.some((w) => w.id === extraItem) ? [...worn, { slot: itemById(extraItem)?.slot ?? "head", id: extraItem, dyeable: true }] : worn;
  return (
    <div className={styles.groups} role="group" aria-label="칠할 곳">
      <div className={styles.group}>
        <span className={styles.groupLabel}>캐릭터</span>
        <div className={styles.tiles}>
          {CHAR_DYE_PARTS.map((p) => {
            const c = dye[p] ?? baseColor?.(p) ?? null;
            return (
              <button key={p} type="button" className={styles.tile} aria-pressed={target === p} disabled={!allowed(p) || disabled} onClick={() => onPick(p)}>
                <span className={styles.sw} style={c ? swatchStyle(c) : { background: DEFAULT_SWATCH }} aria-hidden="true" />
                {DYE_PART_NAMES[p]}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.group}>
        <span className={styles.groupLabel}>입은 꾸미기</span>
        {items.length === 0 ? (
          <p className={styles.none}>머리·목·옷·등에 입은 꾸미기가 없어요.</p>
        ) : (
          <div className={styles.tiles}>
            {items.map((w) => (
              <button
                key={w.id}
                type="button"
                className={styles.tile}
                aria-pressed={target === w.id}
                aria-label={`${SLOT_NAMES[w.slot]} · ${itemById(w.id)?.name ?? w.id}${w.dyeable ? "" : " · 염색 불가"}`}
                disabled={!w.dyeable || !allowed(w.id) || disabled}
                onClick={() => onPick(w.id)}
                title={itemById(w.id)?.name}
              >
                <ItemIcon itemId={w.id} size={32} dye={dye.items?.[w.id]} />
                <span className={styles.tileName}>{shortName(w.id)}</span>
                {!w.dyeable && <span className={styles.tileNote}>염색 불가</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ② 어느 칸에 칠할까요: 커스텀 칸 3개. 칠한 칸도 고를 수 있다 (덮어쓰기 — 칠할 때 한 번 묻는다).
 * 잠긴 칸은 다음 칸만 눌러서 연다 (확인 창 → 열면 그 칸이 골라진다)
 */
export function SlotPicker({ itemDyes, item, slot, onPick, disabled }: { itemDyes: ItemDyes | undefined; item: string; slot: number; onPick: (k: number) => void; disabled?: boolean }) {
  const [buying, setBuying] = useState(false);
  return (
    <div className={styles.slots} role="group" aria-label="칠할 색 칸">
      {colorSlots(itemDyes, item).map((s) => {
        if (s.state === "locked")
          return (
            <button key={s.k} type="button" className={styles.slot} data-state="locked" disabled={disabled || !s.next} onClick={() => setBuying(true)}>
              <span className={styles.slotIcon} aria-hidden="true">
                <PixelIcon name="lock" size={12} />
              </span>
              <span className={styles.slotText}>
                <span>커스텀 {s.k + 1}</span>
                <span className={styles.gold}>{s.next ? `${s.price.toLocaleString("ko-KR")}P로 열기` : `${s.price.toLocaleString("ko-KR")}P`}</span>
              </span>
            </button>
          );
        return (
          <button key={s.k} type="button" className={styles.slot} data-state={s.state} aria-pressed={slot === s.k} disabled={disabled} onClick={() => onPick(s.k)}>
            {s.state === "painted" && s.worn && <span className={styles.ribbon}>입는 중</span>}
            {s.state === "painted" ? (
              <span className={styles.slotSw} style={swatchStyle(s.color)} aria-hidden="true" />
            ) : (
              <span className={styles.slotIcon} aria-hidden="true">
                <PixelIcon name="plus" size={12} />
              </span>
            )}
            <span className={styles.slotText}>
              <span>커스텀 {s.k + 1}</span>
              <span className={styles.muted}>{s.state === "painted" ? colorText(s.color) : "빈 칸"}</span>
            </span>
          </button>
        );
      })}
      {buying && (
        <SlotOpenDialog
          item={item}
          onClose={() => setBuying(false)}
          onOpened={(k) => {
            setBuying(false);
            onPick(k);
          }}
        />
      )}
    </div>
  );
}

/** 색 칸 하나 더 열기 확인: 값 · 내 포인트 → 연 뒤 포인트. 열면 onOpened(새 칸 번호) */
export function SlotOpenDialog({ item, onClose, onOpened }: { item: string; onClose: () => void; onOpened: (k: number) => void }) {
  const { me } = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = me ? colorSlots(me.itemDyes, item).find((s) => s.state === "locked" && s.next) : undefined;
  const price = next?.state === "locked" ? next.price : 0;
  const points = me?.points ?? 0;
  const short = !me?.staff && points < price;
  const name = itemById(item)?.name ?? item;

  async function open() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      applyStyle(await dyeApi.buySlot(item));
      onOpened(next.k);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={next ? `커스텀 ${next.k + 1} 칸을 열까요?` : "색 칸"} onClose={onClose} kind="confirm">
      <div className={styles.confirm}>
        {next ? (
          <>
            <div className={styles.price}>
              <span className={styles.priceIcon} aria-hidden="true">
                <PixelIcon name="lock" size={20} />
              </span>
              <span>
                <b>{price.toLocaleString("ko-KR")}P</b>
                <span className={styles.muted}>
                  내 포인트 {points.toLocaleString("ko-KR")}P{short ? "" : ` → ${(me?.staff ? points : points - price).toLocaleString("ko-KR")}P`}
                </span>
              </span>
            </div>
            <p className={styles.muted}>한 번 열면 {name}에 계속 남아요. 새 칸은 비어 있고 염색권으로 칠해요.</p>
          </>
        ) : (
          <p className={styles.muted}>색 칸을 다 열었어요.</p>
        )}
        {error && <p className={ui.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" className={ui.button} disabled={busy} onClick={onClose}>
            그만두기
          </button>
          {next && (
            <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || short} onClick={() => void open()}>
              {short ? "포인트가 모자라요" : busy ? "잠깐만요…" : "열기"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

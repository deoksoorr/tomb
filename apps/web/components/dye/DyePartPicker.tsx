"use client";

import { CHAR_DYE_PARTS, DYE_COLOR_SLOTS_MAX, DYE_PART_NAMES, itemById, wornDyeItems, type DyeTarget } from "@tomb/protocol";
import { specDye } from "@/game/sprites/avatar";
import { swatchStyle } from "@/lib/dye/look";
import { SLOT_NAMES } from "../account/wardrobe";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { DyeValue } from "./dyeValue";
import styles from "./DyeDialog.module.css";

// 11/22 염색할 대상 고르기 (무작위·고정 색 창 DyeDialog · 색 확정·특수색 확정 창 DirectDyeDialog 공용).
// 위 줄 = 캐릭터 3부위(머리·몸·포인트), 아래 줄 = 지금 입은 머리·목·옷·등 꾸미기 (아이템마다 색 — 그 아이템 그림과 지금 색).
// 날개·연·noDye 꾸미기도 보이지만 「못 바꿔요」로 눌리지 않는다 (서버도 같은 규칙으로 거절 — 염색권을 쓰지 않는다)

export type ItemDyes = Record<string, { colors: (string | null)[]; sel: number }>;

type Props = {
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
  /** 이번에 칠할 아이템이 입지 않은 것이면 (가방 [염색]에서 연 경우) 그 아이템도 줄에 둔다 */
  extraItem?: string | null;
};

const DEFAULT_SWATCH = "#c9c2b0";

export default function DyePartPicker({ spec, look, target, onPick, allowed = () => true, disabled = false, baseColor, extraItem }: Props) {
  const dye = specDye(spec);
  const worn = wornDyeItems(look);
  const items = extraItem && !worn.some((w) => w.id === extraItem) ? [...worn, { slot: itemById(extraItem)?.slot ?? "head", id: extraItem, dyeable: true }] : worn;
  return (
    <div className={styles.partGroups} role="group" aria-label="염색할 부위">
      <p className={styles.partHead}>캐릭터</p>
      <div className={styles.parts}>
        {CHAR_DYE_PARTS.map((p) => {
          const c = dye[p] ?? baseColor?.(p) ?? null;
          return (
            <button key={p} type="button" className={cx(ui.button, styles.part)} aria-pressed={target === p} disabled={!allowed(p) || disabled} onClick={() => onPick(p)}>
              <span className={styles.partLabel}>
                <span className={styles.swatch} style={c ? swatchStyle(c) : { background: DEFAULT_SWATCH }} aria-hidden="true" />
                {DYE_PART_NAMES[p]}
              </span>
              {!c && <span className={styles.note}>기본</span>}
            </button>
          );
        })}
      </div>
      <p className={styles.partHead}>입은 꾸미기 · 아이템마다 색이 따로 남아요</p>
      {items.length === 0 ? (
        <p className={styles.note}>머리·목·옷·등에 입은 꾸미기가 없어요.</p>
      ) : (
        <div className={styles.parts}>
          {items.map((w) => {
            const c = dye.items?.[w.id];
            return (
              <button
                key={w.id}
                type="button"
                className={cx(ui.button, styles.part, styles.gearPart)}
                aria-pressed={target === w.id}
                aria-label={`${SLOT_NAMES[w.slot]} · ${itemById(w.id)?.name ?? w.id}${w.dyeable ? "" : " · 색을 바꿀 수 없어요"}`}
                disabled={!w.dyeable || !allowed(w.id) || disabled}
                onClick={() => onPick(w.id)}
                title={itemById(w.id)?.name}
              >
                <span className={styles.partItem}>
                  <ItemIcon itemId={w.id} size={32} dye={c} />
                </span>
                <span className={styles.note}>{itemById(w.id)?.name ?? w.id}</span>
                <span className={styles.partLabel}>{w.dyeable ? <DyeValue color={c ?? null} short /> : "못 바꿔요"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 11/22 아이템 색 보관함에서 칠할 칸 고르기 (칸 1~3). 이미 칠한 칸이면 덮어쓴다 — 부모가 확인을 받는다.
 * cap = 연 칸 수 (처음 염색 전엔 1)
 */
export function DyeSlotPicker({ colors, slot, onPick, disabled }: { colors: readonly (string | null)[]; slot: number; onPick: (k: number) => void; disabled?: boolean }) {
  const cap = Math.max(1, Math.min(DYE_COLOR_SLOTS_MAX, colors.length));
  return (
    <div className={styles.slotRow} role="group" aria-label="칠할 색 칸">
      <span className={styles.partHead}>칠할 칸</span>
      {Array.from({ length: cap }, (_, k) => {
        const c = colors[k] ?? null;
        return (
          <button key={k} type="button" className={cx(ui.button, styles.slotBtn)} aria-pressed={slot === k} disabled={disabled} onClick={() => onPick(k)}>
            <span className={styles.swatch} style={c ? swatchStyle(c) : { background: "transparent" }} data-empty={!c || undefined} aria-hidden="true" />
            커스텀 {k + 1}
            <span className={styles.note}>{c ? "덮어써요" : "비었어요"}</span>
          </button>
        );
      })}
    </div>
  );
}

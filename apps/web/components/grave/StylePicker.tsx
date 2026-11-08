"use client";

import { useId } from "react";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { spendsTicket, styleChoices } from "./graveStyles";
import StyleArt from "./StyleArt";
import styles from "./StylePicker.module.css";

type Props = {
  value: string;
  onChange: (style: string) => void;
  /** 가방 (디자인권 개수) */
  inventory: Readonly<Record<string, number>>;
  /** 고치는 묘비의 지금 디자인 */
  current?: string;
  /** "자동" 미리보기 모양 */
  ageDays: number;
  /** 디자인권 안내 문구: 세우면 / 바꾸면 */
  verb: "세우면" | "바꾸면";
};

/** 무료 디자인 + 가진 디자인권 + 잠긴 디자인(가격) 그리드 */
export default function StylePicker({ value, onChange, inventory, current, ageDays, verb }: Props) {
  const name = useId();
  const choices = styleChoices(inventory, current);
  return (
    <fieldset className={styles.picker}>
      <legend className={cx(ui.label, styles.legend)}>
        <span>묘비 디자인</span>
        <span className={ui.counter}>잠긴 디자인은 상점에서 만들 수 있어요</span>
      </legend>
      <div className={styles.grid}>
        {choices.map((c) => (
          <label key={c.id} className={styles.tile} data-locked={c.locked}>
            <input
              type="radio"
              name={name}
              className="visually-hidden"
              checked={value === c.id}
              disabled={c.locked}
              onChange={() => onChange(c.id)}
            />
            <StyleArt style={c.id} ageDays={ageDays} scale={2} />
            <span className={styles.text}>
              <span className={styles.name}>{c.name}</span>
              <span className={styles.meta}>
                {c.free
                  ? "무료"
                  : c.locked
                    ? `잠김 · ${c.price}P`
                    : c.owned > 0
                      ? `디자인권 ×${c.owned}`
                      : "지금 디자인"}
              </span>
            </span>
          </label>
        ))}
      </div>
      {spendsTicket(value, current) && (
        <p className={styles.spend} role="status">
          {verb} 디자인권 1개가 사라져요.
        </p>
      )}
    </fieldset>
  );
}

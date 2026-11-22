"use client";

import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DYE_SPECIAL_DESC, DYE_SPECIAL_NAMES, DYE_SPECIALS, type DyeSpecial } from "@tomb/protocol";
import { swatchStyle } from "@/lib/dye/look";
import { DYE_PICK_SWATCHES, specialDyeColor } from "@/lib/dye/rules";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./colorPick.module.css";

// 11/22 색 고르기 칸 (색 확정 염색권 · 특수색 확정 염색권). 11/15 DirectDyeDialog에서 옮겨 DyeDialog 한 창이 쓴다.
//  - 색 확정: 채도·밝기 판 + 색상 막대 + 「내 다른 색」(이 아이템에 칠해 둔 색) + 견본 색 + 색 코드
//  - 특수색 확정: 금빛 광택·반짝이·무지개·야광 중 하나

export type Hsv = { h: number; s: number; v: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const hex2 = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");

export function hsvHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${hex2(f(5))}${hex2(f(3))}${hex2(f(1))}`;
}

export function hexHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// ── 색 확정: 색상 막대 · 채도/밝기 판 · 견본 · 색 코드 ──

/** mine = 「내 다른 색」 (이 아이템에 칠해 둔 다른 색 — 없으면 줄을 그리지 않는다) */
export function ColorPicker({ hsv, onChange, disabled, mine = [] }: { hsv: Hsv; onChange: (v: Hsv) => void; disabled: boolean; mine?: readonly string[] }) {
  const [text, setText] = useState(() => hsvHex(hsv));
  const hex = hsvHex(hsv);
  // 끌기·견본으로 바뀐 색을 입력칸에도 (입력 중인 글자가 이미 그 색이면 그대로)
  const [prevHex, setPrevHex] = useState(hex);
  if (prevHex !== hex) {
    setPrevHex(hex);
    if (text.toLowerCase() !== hex) setText(hex);
  }

  /** 끌기: 요소 안 비율(0..1) → 값 */
  const drag = (set: (fx: number, fy: number) => void) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      set(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height));
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const keys = (dx: (d: number) => void, dy?: (d: number) => void) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") dx(-step);
    else if (e.key === "ArrowRight") dx(step);
    else if (e.key === "ArrowUp" && dy) dy(step);
    else if (e.key === "ArrowDown" && dy) dy(-step);
    else return;
    e.preventDefault();
  };

  return (
    <div className={styles.picker}>
      <div
        className={styles.sv}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="채도·밝기 (왼쪽·오른쪽 채도, 위·아래 밝기)"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={`채도 ${Math.round(hsv.s * 100)}%, 밝기 ${Math.round(hsv.v * 100)}%`}
        onPointerDown={drag((fx, fy) => onChange({ ...hsv, s: fx, v: 1 - fy }))}
        onKeyDown={keys(
          (d) => onChange({ ...hsv, s: clamp01(hsv.s + d / 100) }),
          (d) => onChange({ ...hsv, v: clamp01(hsv.v + d / 100) }),
        )}
      >
        <span className={styles.knob} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} aria-hidden="true" />
      </div>
      <div
        className={styles.hue}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="색상"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={drag((fx) => onChange({ ...hsv, h: Math.min(359.9, fx * 360) }))}
        onKeyDown={keys((d) => onChange({ ...hsv, h: (hsv.h + d * 2 + 360) % 360 }))}
      >
        <span className={styles.hueKnob} style={{ left: `${(hsv.h / 360) * 100}%` }} aria-hidden="true" />
      </div>
      {/* 11/22 색 코드 · 내 다른 색을 한 줄에 (창 높이를 아낀다) */}
      <div className={styles.codeRow}>
        <span className={styles.picked} style={swatchStyle(hex)} aria-hidden="true" />
        <label className={styles.code}>
          색 코드
          <input
            className={ui.input}
            value={text}
            maxLength={7}
            spellCheck={false}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value.trim();
              setText(v);
              const h = (v.startsWith("#") ? v : `#${v}`).toLowerCase();
              if (/^#[0-9a-f]{6}$/.test(h)) onChange(hexHsv(h));
            }}
          />
        </label>
        {mine.length > 0 && (
          <div className={styles.mine} role="group" aria-label="내 다른 색 (누르면 그 색을 가져와요)">
            <span className={styles.mineHead}>내 다른 색</span>
            {mine.map((c) => (
              <button key={c} type="button" className={styles.mineChip} style={{ background: c }} title="누르면 이 색을 가져와요" aria-label={`내 색 ${c}`} aria-pressed={c === hex} disabled={disabled} onClick={() => onChange(hexHsv(c))} />
            ))}
          </div>
        )}
      </div>
      <div className={styles.swatches} role="group" aria-label="견본 색">
        {DYE_PICK_SWATCHES.map((c) => (
          <button key={c} type="button" className={styles.chip} style={{ background: c }} aria-label={c} aria-pressed={c === hex} disabled={disabled} onClick={() => onChange(hexHsv(c))} />
        ))}
      </div>
    </div>
  );
}

// ── 특수색 확정: 특수 색 4종 ──

export function SpecialPicker({ kind, onChange, disabled }: { kind: DyeSpecial; onChange: (k: DyeSpecial) => void; disabled: boolean }) {
  return (
    <div className={styles.specials} role="radiogroup" aria-label="특수 색">
      {DYE_SPECIALS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={kind === k} className={cx(ui.button, styles.special)} disabled={disabled} onClick={() => onChange(k)}>
          <span className={styles.specialChip} style={swatchStyle(specialDyeColor(k, null))} aria-hidden="true" />
          <span className={styles.specialText}>
            <b>{DYE_SPECIAL_NAMES[k]}</b>
            <span className={styles.note}>{DYE_SPECIAL_DESC[k]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { DIR, DYE_PART_NAMES, DYE_PARTS, DYE_SPECIAL_DESC, DYE_SPECIAL_NAMES, DYE_SPECIALS, type DirId, type DyePart, type DyeSpecial } from "@tomb/protocol";
import { specDye, withDyePart } from "@/game/sprites/avatar";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { colorLabel, swatchStyle } from "@/lib/dye/look";
import { DYE_PICK_SWATCHES, specialDyeColor } from "@/lib/dye/rules";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { meStore } from "@/lib/hooks/useMe";
import { applyStyle } from "../account/actions";
import { OutfitCanvas } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import base from "./DyeDialog.module.css";
import styles from "./DirectDyeDialog.module.css";

// 11/15 수집 의뢰 염색권 창 (판·조준 없음).
//  - 색 확정(pick): 부위 고르기 → 색상 막대 + 채도·밝기 판 + 견본 색 + 색 코드 입력으로 보통 색 하나를 고른다 (특수 색 제외)
//  - 특수색 확정(special): 부위 고르기 → 금빛 광택·반짝이·무지개·야광 중 하나. 바탕 색은 서버와 같은 규칙(lib/dye/rules specialDyeColor)
// 왼쪽 미리보기에 바로 입혀 보이고, [염색하기]를 누를 때만 염색권 1장을 쓴다 (창을 닫으면 아무것도 쓰지 않는다).

export type DirectDyeTicket = { itemId: string; name: string; mode: "pick" | "special" };

type Props = {
  ticket: DirectDyeTicket;
  /** 내 아바타 (색 표기에 지금 염색이 들어 있다) */
  avatar: { color: string; body: string };
  look: readonly string[];
  onClose: () => void;
  onDone?: (message: string) => void;
};

type Hsv = { h: number; s: number; v: number };

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

/** 미리보기 캐릭터를 다시 그리는 최소 간격 (끌면서 색이 매 프레임 바뀌므로) */
const PREVIEW_MS = 120;
/** 돌려 보기 순서 (앞 → 오른쪽 → 뒤 → 왼쪽) */
const TURN: readonly DirId[] = [DIR.down, DIR.right, DIR.up, DIR.left];

export default function DirectDyeDialog({ ticket, avatar, look, onClose, onDone }: Props) {
  const [part, setPart] = useState<DyePart>("body");
  const cur = specDye(avatar.color);
  const [hsv, setHsv] = useState<Hsv>(() => hexHsv(cur.body ? cur.body.slice(0, 7) : "#4aa8f0"));
  const [kind, setKind] = useState<DyeSpecial>("s");
  const [dirIdx, setDirIdx] = useState(0);
  const [phase, setPhase] = useState<"pick" | "sending" | "done">("pick");
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState(avatar.color);
  const [body, setBody] = useState(avatar.body);

  const pick = ticket.mode === "pick";
  const color = pick ? hsvHex(hsv) : specialDyeColor(kind, specDye(spec)[part]);
  const [preview, setPreview] = useState(color);
  // 끄는 동안은 PREVIEW_MS마다 한 번만 미리보기에 입힌다
  useEffect(() => {
    const t = setTimeout(() => setPreview(color), PREVIEW_MS);
    return () => clearTimeout(t);
  }, [color]);

  const previewSpec = phase === "done" ? spec : withDyePart(spec, part, preview);

  async function confirm() {
    setError(null);
    setPhase("sending");
    try {
      const res: StyleChangeResponse = pick ? await dyeApi.pick(ticket.itemId, part, color) : await dyeApi.special(ticket.itemId, part, kind);
      applyStyle(res);
      const done = res.color ?? color;
      setSpec(withDyePart(spec, res.part ?? part, done));
      if (res.me.body) setBody(res.me.body);
      setPhase("done");
      onDone?.(`${DYE_PART_NAMES[res.part ?? part]}을(를) ${colorLabel(done)}(으)로 염색했어요.`);
    } catch (e) {
      setError(errorMessage(e));
      setPhase("pick");
      if (e instanceof ApiRequestError && e.code === "NO_ITEM") void meStore.refresh();
    }
  }

  return (
    <Dialog title={ticket.name} onClose={onClose} kind="confirm">
      <div className={base.wrap}>
        <div className={cx(base.row, base.start)}>
          <div className={cx(base.figure, styles.figure)}>
            <OutfitCanvas color={previewSpec} body={body} look={look} label={phase === "done" ? "염색한 내 모습" : "염색해 본 내 모습"} dir={TURN[dirIdx]} walking={false} />
            <button type="button" className={cx(ui.button, styles.turn)} onClick={() => setDirIdx((i) => (i + 1) % TURN.length)}>
              돌려 보기
            </button>
          </div>
          {phase === "done" ? (
            <div className={base.side}>
              <p className={base.note} role="status">
                {DYE_PART_NAMES[part]} 염색 완료! 다른 사람 화면에도 바로 이 색으로 보여요.
              </p>
              <div className={base.actions}>
                <button type="button" className={cx(ui.button, ui.primary)} onClick={onClose}>
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <div className={base.side}>
              <p className={base.note}>
                {pick
                  ? "흔들림도 운도 없어요. 원하는 색을 골라 그대로 칠해요. (금빛 광택 같은 특수 색은 특수색 확정 염색권으로)"
                  : "특수 색 하나를 골라 확실하게 입혀요. 금빛 광택은 금빛으로, 나머지는 이미 염색한 부위면 그 색 그대로 효과만 더해요."}
              </p>
              <div className={base.parts} role="group" aria-label="염색할 부위">
                {DYE_PARTS.map((p) => {
                  const c = specDye(spec)[p];
                  return (
                    <button key={p} type="button" className={cx(ui.button, base.part)} aria-pressed={part === p} disabled={phase === "sending"} onClick={() => setPart(p)}>
                      <span className={base.swatch} style={c ? swatchStyle(c) : { background: "#c9c2b0" }} aria-hidden="true" />
                      {DYE_PART_NAMES[p]}
                      {!c && <span className={base.note}>기본</span>}
                    </button>
                  );
                })}
              </div>
              {pick ? <ColorPicker hsv={hsv} onChange={setHsv} disabled={phase === "sending"} /> : <SpecialPicker kind={kind} onChange={setKind} disabled={phase === "sending"} />}
              <p className={base.pick}>
                <span className={base.swatchBig} style={swatchStyle(color)} aria-hidden="true" />
                <span className={base.hex}>{colorLabel(color)}</span>
              </p>
              <p className={base.note}>[염색하기]를 누르면 염색권 1장을 써요. 창을 그냥 닫으면 쓰지 않아요.</p>
              {error && <p className={ui.error}>{error}</p>}
              <div className={base.actions}>
                <button type="button" className={ui.button} onClick={onClose}>
                  닫기
                </button>
                <button type="button" className={cx(ui.button, ui.primary)} disabled={phase === "sending"} onClick={confirm}>
                  {phase === "sending" ? "잠깐만요…" : `${DYE_PART_NAMES[part]} 염색하기`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ── 색 확정: 색상 막대 · 채도/밝기 판 · 견본 · 색 코드 ──

function ColorPicker({ hsv, onChange, disabled }: { hsv: Hsv; onChange: (v: Hsv) => void; disabled: boolean }) {
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
      <div className={styles.swatches} role="group" aria-label="견본 색">
        {DYE_PICK_SWATCHES.map((c) => (
          <button key={c} type="button" className={styles.chip} style={{ background: c }} aria-label={c} aria-pressed={c === hex} disabled={disabled} onClick={() => onChange(hexHsv(c))} />
        ))}
      </div>
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
    </div>
  );
}

// ── 특수색 확정: 특수 색 4종 ──

function SpecialPicker({ kind, onChange, disabled }: { kind: DyeSpecial; onChange: (k: DyeSpecial) => void; disabled: boolean }) {
  return (
    <div className={styles.specials} role="radiogroup" aria-label="특수 색">
      {DYE_SPECIALS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={kind === k} className={cx(ui.button, styles.special)} disabled={disabled} onClick={() => onChange(k)}>
          <span className={styles.specialChip} style={swatchStyle(specialDyeColor(k, null))} aria-hidden="true" />
          <span className={styles.specialText}>
            <b>{DYE_SPECIAL_NAMES[k]}</b>
            <span className={base.note}>{DYE_SPECIAL_DESC[k]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

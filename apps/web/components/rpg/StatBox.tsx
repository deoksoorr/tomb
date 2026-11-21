"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { StatPanel } from "@/lib/rpg/cards";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { readItem, writeItem } from "@/lib/storage";
import { cx } from "../ui/cx";
import c from "./cards.module.css";

// 11/15 판 안 능력치 판: 지금 전투가 쓰는 숫자와 카드가 더한 만큼(초록). PC는 HP 상자 아래에 펴 두고 C로 접기, 폰은 [능력] 버튼으로 연다.
// 숫자는 게임(HuntScene.hud → lib/rpg/cards statPanel)이 전투 계산과 같은 값으로 보낸다.

const LS_OPEN = "tomb.rpg.statsOpen";

/** chair: 11/21 회장님 독대 — 기본 접힘 (펼치면 그 판 동안 유지, 다른 사냥 저장값은 안 건드림) · boxRef: 반투명 판정용 */
export default function StatBox({ stats, chair = false, boxRef }: { stats: StatPanel | undefined; chair?: boolean; boxRef?: React.Ref<HTMLElement> }) {
  const coarse = useMediaQuery("(pointer: coarse)");
  // null = 아직 안 건드림: PC는 저장된 값(없으면 펼침), 폰은 접힘
  const [pick, setPick] = useState<boolean | null>(null);
  const open = pick ?? (coarse || chair ? false : readItem(LS_OPEN) !== "0");
  const toggle = (v = !open) => {
    setPick(v);
    if (!coarse && !chair) writeItem(LS_OPEN, v ? "1" : "0");
  };
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.code !== "KeyC" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector("dialog[open]")) return;
    toggle();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!stats) return null;
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  if (!open)
    return (
      <button ref={boxRef as React.Ref<HTMLButtonElement>} type="button" className={c.statOpen} onPointerDown={stop} onClick={() => toggle(true)} aria-expanded={false} title="능력치 펴기 (C)">
        능력 {!coarse && <kbd>C</kbd>}
      </button>
    );
  return (
    <section ref={boxRef} className={c.statBox} aria-label="지금 능력치" onPointerDown={stop}>
      <button type="button" className={c.statHead} onClick={() => toggle(false)} aria-expanded={true} title="능력치 접기 (C)">
        능력치 <span aria-hidden="true">▾</span>
        {!coarse && <kbd>C</kbd>}
      </button>
      <dl className={c.statRows}>
        {stats.rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>
              {r.v}
              {r.plus && <b className={cx(r.plus.startsWith("−") && c.statMinus)}>({r.plus})</b>}
            </dd>
          </div>
        ))}
      </dl>
      {stats.chips.length > 0 && (
        <div className={c.statChips}>
          {stats.chips.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
    </section>
  );
}

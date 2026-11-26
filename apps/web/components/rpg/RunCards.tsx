"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cardIconUrl } from "@/game/rpg/cards/cardArt";
import { CARD_TYPE_NAME, CARDS, cardPromoLine, cardText, RARITIES, RARITY_NAME, type CardId } from "@/lib/rpg/cards";
import type { RpgHud } from "@/lib/rpg/types";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import c from "./cards.module.css";

// 11/15 야근 빌딩 HUD: 판 레벨 막대 · 멈추면 집중 · 가진 카드 아이콘(겹친 수). 마우스를 올리거나 누르면 설명이 뜬다.
// 11/26 PC(compact): 운영자 「왼쪽 위 HP·SP·카드가 너무 커서 몬스터가 가려진대」 → 16px 아이콘 두 줄까지(등급 높은 것부터, 넘치면 +N),
//   전체 목록(이름·등급·효과·카드 효과 요약)은 [카드 ▾]나 Tab으로 여는 창. 폰(HuntPhoneTop 자세히 칸)은 예전 그대로

/** compact 아이콘 줄에 보이는 칸 수 (한 줄 11칸 × 두 줄) — 넘치면 마지막 칸이 +N */
const STRIP_MAX = 22;

type Run = NonNullable<RpgHud["run"]>;

/** 등급 높은 것부터 (같은 등급은 받은 순서) */
const byRarity = (cards: Run["cards"]) => [...cards].sort((a, b) => RARITIES.indexOf(CARDS[b.id].rarity) - RARITIES.indexOf(CARDS[a.id].rarity));

function Tip({ id, run }: { id: CardId; run: Run }) {
  const n = run.cards.find((x) => x.id === id)?.n ?? 1;
  const line = cardPromoLine(id, n, { promote: run.cards.some((x) => x.id === "promote") ? 1 : 0 }, run.kind);
  return (
    <>
      <strong>
        {CARDS[id].name}
        {n > 1 ? ` ×${n}` : ""}
      </strong>
      <em className={c.tipTier} data-tier={CARDS[id].rarity}>
        {RARITY_NAME[CARDS[id].rarity]}
        <span className={c.dmgType} data-type={CARDS[id].type}>
          {CARD_TYPE_NAME[CARDS[id].type]}
        </span>
      </em>
      <span>{cardText(id, run.kind)}</span>
      {/* 11/17 팀장 승진이 있으면 실제로 받는 숫자 */}
      {line && <span className={c.tipPromo}>{line}</span>}
    </>
  );
}

/** compact: PC 사냥 HUD (작은 아이콘 줄 + 목록 창) · chips: 카드 효과 요약 (compact면 능력치 판 대신 목록 창 위에) */
export default function RunCards({ run, compact = false, chips }: { run: Run; compact?: boolean; chips?: readonly string[] }) {
  const [tip, setTip] = useState<CardId | null>(null);
  // 손가락으로 연 설명은 잠깐 뒤 저절로 닫힌다. 카드를 고르는 동안은 숨긴다
  const picking = !!useBridgeValue("rpg:cards");
  const byTouch = useRef(false);
  useEffect(() => {
    if (!tip || !byTouch.current) return;
    const t = setTimeout(() => setTip(null), 2600);
    return () => clearTimeout(t);
  }, [tip]);
  // compact 목록 창 (기본 접힘, Tab으로 열고 닫기)
  const [open, setOpen] = useState(false);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Tab" || e.repeat || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector("dialog[open]") || picking) return;
    e.preventDefault();
    setOpen((o) => !o);
  });
  useEffect(() => {
    if (!compact) return;
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [compact]);
  const pct = run.need > 0 ? Math.max(0, Math.min(100, (run.xp / run.need) * 100)) : 0;
  const shown = tip && !picking && run.cards.some((x) => x.id === tip) ? tip : null;
  const list = compact ? byRarity(run.cards) : run.cards;
  const cut = compact && list.length > STRIP_MAX ? STRIP_MAX - 1 : list.length;
  const total = run.cards.reduce((a, x) => a + x.n, 0);
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div className={cx(c.runBox, compact && c.runBoxCompact)}>
      <div className={c.lvLine}>
        <span>판 Lv.{run.lv}</span>
        <div className={c.lvBar} role="meter" aria-label="판 레벨 EXP" aria-valuenow={run.xp} aria-valuemin={0} aria-valuemax={run.need}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className={cx(c.focus, run.focus && c.focusOn)} title="서 있으면 공격 속도가 40% 빨라져요">
          집중
        </span>
        {compact && run.cards.length > 0 && (
          <button type="button" className={c.listBtn} aria-expanded={open} onPointerDown={stop} onClick={() => setOpen((o) => !o)} title="가진 카드 목록 (Tab)">
            카드 {open ? "▴" : "▾"} <kbd>Tab</kbd>
          </button>
        )}
      </div>
      {run.cards.length > 0 && (
        <div className={c.icons}>
          {list.slice(0, cut).map(({ id, n }) => {
            const def = CARDS[id];
            return (
              <button
                key={id}
                type="button"
                className={c.icon}
                data-tier={def.rarity}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  byTouch.current = false;
                  setTip(id);
                }}
                onPointerLeave={(e) => e.pointerType === "mouse" && setTip((t) => (t === id ? null : t))}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (e.pointerType === "mouse") return;
                  byTouch.current = true;
                  setTip((t) => (t === id ? null : id));
                }}
                aria-label={`${def.name}${n > 1 ? ` ${n}장` : ""}, ${CARD_TYPE_NAME[def.type]}. ${cardText(id, run.kind)}`}
              >
                <img src={cardIconUrl(id, compact ? 1 : 2)} alt="" />
                {/* 11/19 물공·마공 카드는 아이콘 왼쪽 위에 한 글자 (공통은 표시 없음) */}
                {def.type !== "all" && (
                  <span className={c.iconType} data-type={def.type} aria-hidden="true">
                    {def.type === "phys" ? "물" : "마"}
                  </span>
                )}
                {n > 1 && <span className={c.count}>{n}</span>}
              </button>
            );
          })}
          {cut < list.length && (
            <button type="button" className={c.more} onPointerDown={stop} onClick={() => setOpen(true)} aria-label={`카드 ${list.length - cut}종 더 보기`} title="가진 카드 목록 (Tab)">
              +{list.length - cut}
            </button>
          )}
        </div>
      )}
      {shown && (
        <div className={c.tip} role="status">
          <Tip id={shown} run={run} />
        </div>
      )}
      {compact && open && !picking && run.cards.length > 0 && (
        <section className={c.cardPanel} aria-label="가진 카드" onPointerDown={stop}>
          <header className={c.cardPanelHead}>
            <strong>
              가진 카드 {run.cards.length}종 · {total}장
            </strong>
            <button type="button" className={c.listBtn} onClick={() => setOpen(false)} title="닫기 (Tab)">
              닫기 <kbd>Tab</kbd>
            </button>
          </header>
          {chips && chips.length > 0 && (
            <div className={c.statChips} aria-label="카드 효과 요약">
              {chips.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          )}
          <ul className={c.cardRows}>
            {list.map(({ id }) => (
              <li key={id} className={c.tip} data-tier={CARDS[id].rarity}>
                <img src={cardIconUrl(id, 1)} alt="" className={c.rowIcon} />
                <div>
                  <Tip id={id} run={run} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

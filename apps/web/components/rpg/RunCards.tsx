"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useRef, useState } from "react";
import { cardIconUrl } from "@/game/rpg/cards/cardArt";
import { CARD_TYPE_NAME, CARDS, cardPromoLine, cardText, RARITY_NAME, type CardId } from "@/lib/rpg/cards";
import type { RpgHud } from "@/lib/rpg/types";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import c from "./cards.module.css";

// 11/15 야근 빌딩 HUD: 판 레벨 막대 · 멈추면 집중 · 가진 카드 아이콘(겹친 수). 마우스를 올리거나 누르면 설명이 뜬다.

export default function RunCards({ run }: { run: NonNullable<RpgHud["run"]> }) {
  const [tip, setTip] = useState<CardId | null>(null);
  // 손가락으로 연 설명은 잠깐 뒤 저절로 닫힌다. 카드를 고르는 동안은 숨긴다
  const picking = !!useBridgeValue("rpg:cards");
  const byTouch = useRef(false);
  useEffect(() => {
    if (!tip || !byTouch.current) return;
    const t = setTimeout(() => setTip(null), 2600);
    return () => clearTimeout(t);
  }, [tip]);
  const pct = run.need > 0 ? Math.max(0, Math.min(100, (run.xp / run.need) * 100)) : 0;
  const shown = tip && !picking && run.cards.some((x) => x.id === tip) ? tip : null;
  return (
    <div className={c.runBox}>
      <div className={c.lvLine}>
        <span>판 Lv.{run.lv}</span>
        <div className={c.lvBar} role="meter" aria-label="판 레벨 EXP" aria-valuenow={run.xp} aria-valuemin={0} aria-valuemax={run.need}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className={cx(c.focus, run.focus && c.focusOn)} title="서 있으면 공격 속도가 40% 빨라져요">
          집중
        </span>
      </div>
      {run.cards.length > 0 && (
        <div className={c.icons}>
          {run.cards.map(({ id, n }) => {
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
                <img src={cardIconUrl(id, 2)} alt="" />
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
        </div>
      )}
      {shown && (
        <div className={c.tip} role="status">
          <strong>
            {CARDS[shown].name}
            {(run.cards.find((x) => x.id === shown)?.n ?? 1) > 1 ? ` ×${run.cards.find((x) => x.id === shown)!.n}` : ""}
          </strong>
          <em className={c.tipTier} data-tier={CARDS[shown].rarity}>
            {RARITY_NAME[CARDS[shown].rarity]}
            <span className={c.dmgType} data-type={CARDS[shown].type}>
              {CARD_TYPE_NAME[CARDS[shown].type]}
            </span>
          </em>
          <span>{cardText(shown, run.kind)}</span>
          {/* 11/17 팀장 승진이 있으면 실제로 받는 숫자 */}
          {(() => {
            const line = cardPromoLine(shown, run.cards.find((x) => x.id === shown)?.n ?? 1, { promote: run.cards.some((x) => x.id === "promote") ? 1 : 0 }, run.kind);
            return line ? <span className={c.tipPromo}>{line}</span> : null;
          })()}
        </div>
      )}
    </div>
  );
}

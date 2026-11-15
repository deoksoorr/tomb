"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useEffectEvent, useState } from "react";
import { bridge } from "@/game/bridge";
import { cardWindowUrl } from "@/game/rpg/cards/cardArt";
import { BOSS_DEAL_HP_COST, CARDS, cardText, RARITY_NAME, type CardChoice, type CardOfferView } from "@/lib/rpg/cards";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import c from "./cards.module.css";

// 11/15 야근 빌딩 능력 카드 고르기 (게임이 멈춘 채 기다린다). 세 장이 뒤집혀 들어오고, 누르거나 1·2·3으로 고른다. R = 다시 뽑기.
// 상사의 제안은 한 장: 받으면 최대 체력이 줄고, 거절하면 체력이 가득 찬다.

/** 막 뜬 카드를 연타로 실수로 고르지 않게 (짧게) */
const ARM_MS = 250;
/** 고른 카드가 빛나는 시간 (그 뒤에 게임으로 보낸다) */
const PICK_MS = 300;

export default function CardPick() {
  const view = useBridgeValue("rpg:cards");
  if (!view) return null;
  return <PickView key={view.seq} view={view} />;
}

function PickView({ view }: { view: CardOfferView }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(t);
  }, []);
  const deal = view.kind === "b";

  const send = (ch: CardChoice, slot: number | null) => {
    if (chosen !== null || !armed) return;
    if (slot === null) {
      bridge.emit("rpg:cardPick", ch);
      return;
    }
    setChosen(slot);
    setTimeout(() => bridge.emit("rpg:cardPick", ch), PICK_MS);
  };
  const pick = (i: number) => send({ slot: i }, i);
  const reroll = () => view.rerolls > 0 && send({ reroll: true }, null);
  const answer = (accept: boolean) => send({ accept }, accept ? 0 : -1);

  // 키: 1·2·3 고르기, R 다시 뽑기 / 상사의 제안은 1 받기·2 거절
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    const n = /^Digit([1-3])$/.exec(e.code)?.[1];
    if (deal) {
      if (n === "1") answer(true);
      else if (n === "2") answer(false);
      else return;
    } else if (n && Number(n) <= view.cards.length) pick(Number(n) - 1);
    else if (e.code === "KeyR") reroll();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  const title = deal ? "상사의 제안" : view.kind === "s" ? "출근 준비" : `판 레벨 ${view.lv ?? ""}`;
  const sub = deal
    ? `${view.floor}층 우두머리를 잡았더니 상사가 슬쩍 다가와요`
    : view.kind === "s"
      ? `건너뛴 층만큼 카드를 먼저 챙겨요 (${view.step?.[0]}/${view.step?.[1]})`
      : view.more
        ? `카드 한 장을 골라요. 뒤에 ${view.more}장 더 기다려요`
        : "카드 한 장을 골라요";

  return (
    <div className={c.pickWrap} role="dialog" aria-modal="true" aria-label={title} onPointerDown={(e) => e.stopPropagation()}>
      <div className={cx(c.pick, deal && c.deal)}>
        <div className={c.head}>
          <h2 className={c.title}>{title}</h2>
          <p className={c.sub}>{sub}</p>
          {deal && <p className={c.quote}>“최대 체력 {Math.round(BOSS_DEAL_HP_COST * 100)}%만 내놓으면 이거 줄게. 싫으면 푹 쉬고.”</p>}
        </div>
        <div className={c.row}>
          {view.cards.map((id, i) => {
            const def = CARDS[id];
            const have = view.owned[id] ?? 0;
            return (
              <button
                key={`${id}-${i}`}
                type="button"
                className={cx(
                  c.card,
                  def.rarity === "rare" && c.rare,
                  def.rarity === "legend" && c.legend,
                  chosen === i && c.chosen,
                  chosen !== null && chosen !== i && c.dropped,
                )}
                style={{ "--i": i } as React.CSSProperties}
                disabled={deal || chosen !== null}
                onClick={() => !deal && pick(i)}
                aria-label={`${def.name}, ${RARITY_NAME[def.rarity]}${have > 0 && Number.isFinite(def.max) ? `, 지금 ${have}단계에서 ${have + 1}단계로` : ""}. ${cardText(id, view.style)}`}
              >
                <span className={c.back} aria-hidden="true" />
                <span className={c.face}>
                  {!deal && <span className={c.key}>{i + 1}</span>}
                  <img className={c.art} src={cardWindowUrl(id, 3)} alt="" />
                  <span className={c.tag}>{RARITY_NAME[def.rarity]}</span>
                  <span className={c.name}>{def.name}</span>
                  {/* 11/15 이미 가진 카드면 지금 몇 단계인지 크게 (겹칠 수 있는 카드만) */}
                  {have > 0 && Number.isFinite(def.max) && (
                    <span className={c.level}>
                      지금 {have}단계 → <b>{have + 1}단계</b>
                      {have + 1 >= def.max && <em> 마지막</em>}
                    </span>
                  )}
                  <span className={c.desc}>{cardText(id, view.style)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {deal ? (
          <div className={c.actions}>
            <button type="button" className={cx(ui.button, ui.primary, c.dealBtn)} onClick={() => answer(true)} disabled={chosen !== null}>
              <span>
                받을게요 <kbd>1</kbd>
              </span>
              <small>최대 체력 −{Math.round(BOSS_DEAL_HP_COST * 100)}%</small>
            </button>
            <button type="button" className={cx(ui.button, c.dealBtn)} onClick={() => answer(false)} disabled={chosen !== null}>
              <span>
                됐어요, 쉴래요 <kbd>2</kbd>
              </span>
              <small>체력이 가득 차요</small>
            </button>
          </div>
        ) : (
          <div className={c.actions}>
            <button type="button" className={cx(ui.button, c.reroll)} onClick={reroll} disabled={view.rerolls <= 0 || chosen !== null}>
              {view.rerolls > 0 ? `다시 뽑기 ${view.rerolls}번 남음` : "다시 뽑기를 다 썼어요"} <kbd>R</kbd>
            </button>
          </div>
        )}
        {!deal && <p className={c.hint}>누르거나 1·2·3으로 골라요. 다시 뽑으면 가끔 전설이 섞여요.</p>}
      </div>
    </div>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { cardIconUrl, cardWindowUrl } from "@/game/rpg/cards/cardArt";
import { autoPickIndex, pickOrder, pickSummary } from "@/lib/rpg/cardAuto";
import {
  BOSS_DEAL_HP_COST,
  CARD_TYPE_NAME,
  CARDS,
  cardPromoLine,
  cardStackLine,
  cardText,
  RARITY_COLOR,
  RARITY_NAME,
  type CardChoice,
  type CardId,
  type CardKindStyle,
  type CardOfferView,
} from "@/lib/rpg/cards";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import { useMoreBelowRef, watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import c from "./cards.module.css";

// 11/15 야근 빌딩 능력 카드 고르기 (게임이 멈춘 채 기다린다). 세 장이 뒤집혀 들어오고, 누르거나 1·2·3으로 고른다. R = 다시 뽑기.
// 상사의 제안은 한 장: 받으면 최대 체력이 줄고, 거절하면 체력이 가득 찬다.

/** 막 뜬 카드를 연타로 실수로 고르지 않게 (짧게) */
const ARM_MS = 250;
/** 고른 카드가 빛나는 시간 (그 뒤에 게임으로 보낸다) */
const PICK_MS = 300;

/** 11/26 자동 고르기: 남은 장이 몇 장이든 3.5초 남짓에 끝낸다 (한 장에 25~110ms — 72장이 8~19초 걸리던 것) */
const AUTO_TOTAL_MS = 3500;
const autoStepMs = (n: number) => Math.min(110, Math.max(25, AUTO_TOTAL_MS / Math.max(1, n)));

type Picked = { id: CardId; auto: boolean };
type StartMode = "ask" | "manual" | "auto";

/**
 * 11/26 위층 시작 카드 (건너뛴 10층마다 3장): 첫 장 전에 [직접 고르기]/[자동으로 고르기], 직접 고르는 중에도 [남은 카드 자동으로].
 * 자동은 매번 나온 세 장 안에서 추천 순(lib/rpg/cardAuto)으로 {slot}을 보낸다 — 손으로 고를 때와 같은 기록이라 서버 검사는 그대로.
 * 마지막 한 장은 요약 화면에서 [출근하기]를 누를 때 보낸다 (그때까지 게임은 멈춘 채)
 */
export default function CardPick() {
  const view = useBridgeValue("rpg:cards");
  const [mode, setMode] = useState<StartMode>("ask");
  const [log, setLog] = useState<Picked[]>([]);
  const [summary, setSummary] = useState<{ slot: number; style: CardKindStyle } | null>(null);
  // 제안이 바뀔 때 시작 카드 기록 정리 (렌더 중에 맞추기 — 새 판 첫 장·시작 카드가 끝난 뒤)
  const [seen, setSeen] = useState(view);
  if (view !== seen) {
    setSeen(view);
    const newRun = !!view && view.kind === "s" && view.step?.[0] === 1 && log.length > 0;
    const done = view ? view.kind !== "s" : !summary && (log.length === 0 || log.length >= (seen?.step?.[1] ?? 0));
    if (newRun || done) {
      setMode("ask");
      setLog([]);
    }
  }
  const record = (id: CardId, auto: boolean) => setLog((l) => [...l, { id, auto }]);

  if (summary)
    return (
      <SummaryView
        log={log}
        style={summary.style}
        onGo={() => {
          bridge.emit("rpg:cardPick", { slot: summary.slot });
          setSummary(null);
        }}
      />
    );
  if (!view) return null;
  if (view.kind === "s" && view.step) {
    if (mode === "ask" && log.length === 0) return <AskView total={view.step[1]} onPick={(auto) => setMode(auto ? "auto" : "manual")} />;
    // 11/26 운영자 「자동 고르기가 너무 반짝인다」: 장마다 새로 띄우지 않고 한 화면을 그대로 둔 채 목록만 늘린다 (key 없음)
    if (mode === "auto")
      return <AutoView view={view} log={log} onPick={(id) => record(id, true)} onLast={(slot) => setSummary({ slot, style: view.style })} />;
  }
  return (
    <PickView
      key={view.seq}
      view={view}
      onPicked={(id) => view.kind === "s" && record(id, false)}
      onAutoRest={view.kind === "s" && view.step && view.step[0] < view.step[1] ? () => setMode("auto") : undefined}
    />
  );
}

/** 입력칸에 치는 중이거나 다른 창이 열렸으면 키를 넘긴다 */
const keyBlocked = (e: KeyboardEvent) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return true;
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
function useKeys(handle: (e: KeyboardEvent) => boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (keyBlocked(e) || !handle(e)) return;
    e.preventDefault();
    e.stopPropagation();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);
}

/** 첫 장 전에: 직접 고를지, 자동으로 고를지 */
function AskView({ total, onPick }: { total: number; onPick: (auto: boolean) => void }) {
  useKeys((e) => {
    if (e.code === "Digit1") onPick(false);
    else if (e.code === "Digit2") onPick(true);
    else return false;
    return true;
  });
  return (
    <div className={c.pickWrap} role="dialog" aria-modal="true" aria-label="출근 준비" onPointerDown={(e) => e.stopPropagation()}>
      <div className={c.pick}>
        <div className={c.head}>
          <h2 className={c.title}>출근 준비</h2>
          <p className={c.sub}>건너뛴 층만큼 카드 {total}장을 먼저 골라요</p>
        </div>
        <div className={c.askRow}>
          <button type="button" className={cx(ui.button, c.askBtn)} onClick={() => onPick(false)}>
            <b>
              직접 고르기 <kbd>1</kbd>
            </b>
            <small>세 장 중 한 장씩 {total}번 골라요</small>
          </button>
          <button type="button" className={cx(ui.button, ui.primary, c.askBtn)} onClick={() => onPick(true)}>
            <b>
              자동으로 고르기 <kbd>2</kbd>
            </b>
            <small>등급 높은 카드부터 알아서 골라요</small>
          </button>
        </div>
        <p className={c.hint}>직접 고르다가도 남은 카드를 자동으로 고를 수 있어요.</p>
      </div>
    </div>
  );
}

/** 자동으로 고르는 중: 한 장씩 추천 순으로 보내고, 마지막 장은 요약에서 */
function AutoView({ view, log, onPick, onLast }: { view: CardOfferView; log: Picked[]; onPick: (id: CardId) => void; onLast: (slot: number) => void }) {
  const [step, total] = view.step ?? [1, 1];
  // 시작 시각 기준 일정 (렌더가 느린 폰에서도 늦어진 만큼 쌓이지 않게) · 마지막 장을 넘겼나
  const plan = useRef<{ t0: number; from: number; per: number } | null>(null);
  const done = useRef(false);
  /** 지금 떠 있는 제안에서 추천 한 장 — 제안마다 {slot} 하나 (손으로 고를 때와 같은 기록). 더 고를 게 있으면 true */
  const pickOne = (): boolean => {
    const v = bridge.last("rpg:cards");
    if (done.current || !v || v.kind !== "s" || !v.step) return false;
    const slot = autoPickIndex(v.cards, v.owned);
    onPick(v.cards[slot]);
    if (v.step[0] >= v.step[1]) {
      done.current = true;
      onLast(slot);
      return false;
    }
    bridge.emit("rpg:cardPick", { slot, quiet: true });
    return true;
  };
  const due = (s: number) => {
    const p = (plan.current ??= { t0: performance.now(), from: s, per: autoStepMs(total - s + 1) });
    return p.t0 + (s - p.from + 1) * p.per;
  };
  const go = useEffectEvent(() => {
    // 뒤처졌으면 한 번에 몇 장씩 따라잡는다
    for (let n = 0; n < 8 && pickOne(); n++) {
      const s = bridge.last("rpg:cards")?.step?.[0];
      if (!s || due(s) > performance.now()) return;
    }
  });
  const wait = useEffectEvent(() => Math.max(0, due(step) - performance.now()));
  // 새 제안(seq)이 올 때마다 다음 장 (같은 화면이 계속 떠 있다)
  useEffect(() => {
    const t = setTimeout(go, wait());
    return () => clearTimeout(t);
  }, [view.seq]);
  const finishNow = () => {
    for (let n = 0; n < 2000 && pickOne(); n++);
  };
  return (
    <div className={cx(c.pickWrap, c.calm)} role="dialog" aria-modal="true" aria-label="출근 준비" onPointerDown={(e) => e.stopPropagation()}>
      <div className={c.pick}>
        <div className={c.head}>
          <h2 className={c.title}>출근 준비</h2>
          <p className={c.sub} role="status">
            자동으로 고르는 중 ({Math.min(step, total)}/{total})
          </p>
        </div>
        <span className={c.autoBar} aria-hidden="true">
          <i style={{ width: `${Math.round(((step - 1) / Math.max(1, total)) * 100)}%` }} />
        </span>
        <PickedChips log={log} />
        <div className={c.actions}>
          <button type="button" className={ui.button} onClick={finishNow}>
            바로 끝내기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 자동으로 고르는 중에 보이는 칩 (처음 고른 순서 그대로, 같은 카드는 ×n — 칸이 옮겨 다니지 않는다) */
function PickedChips({ log }: { log: Picked[] }) {
  const rows = pickOrder(log.map((x) => x.id));
  const listRef = useRef<HTMLUListElement>(null);
  const moreRef = useMoreBelowRef(listRef);
  // 11/26 칸이 넘치면 새로 붙은 칩이 보이게 맨 아래로 (자동 고르기 중 목록이 길어질 때)
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }, [rows.length]);
  return (
    <ul ref={moreRef} className={cx(c.sumGrid, c.scroll, "more-fade")} aria-label="고른 카드">
      {rows.map(({ id, n }) => {
        const def = CARDS[id];
        return (
          <li
            key={id}
            className={c.sumChip}
            data-rarity={def.rarity}
            style={{ "--r": rarityHex(def.rarity) } as React.CSSProperties}
          >
            <img src={cardIconUrl(id, 2)} alt="" width={24} height={24} />
            <span className={c.sumName}>
              {def.name}
              <small>{RARITY_NAME[def.rarity]}</small>
            </span>
            {n > 1 && <b className={c.sumN}>×{n}</b>}
          </li>
        );
      })}
    </ul>
  );
}

const rarityHex = (r: keyof typeof RARITY_COLOR) => `#${RARITY_COLOR[r].toString(16).padStart(6, "0")}`;

/** 11/26 요약 목록: 이름·등급과 함께 카드에 적힌 효과도 (등급 높은 순, 같은 카드는 ×n). 길면 목록만 스크롤 */
function SummaryList({ log, style }: { log: Picked[]; style: CardKindStyle }) {
  const rows = pickSummary(log.map((x) => x.id));
  return (
    <ul ref={watchMoreBelow} className={cx(c.sumList, c.scroll, "more-fade")} aria-label="고른 카드">
      {rows.map(({ id, n }) => {
        const def = CARDS[id];
        return (
          <li key={id} className={c.sumRow} data-rarity={def.rarity} style={{ "--r": rarityHex(def.rarity) } as React.CSSProperties}>
            <img src={cardIconUrl(id, 2)} alt="" width={24} height={24} />
            <span className={c.sumRowHead}>
              <b>{def.name}</b>
              <small>{RARITY_NAME[def.rarity]}</small>
              {n > 1 && <em>×{n}</em>}
            </span>
            <span className={c.sumDesc}>{cardText(id, style)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** 한 화면 요약: [출근하기]를 누르면 마지막 장을 보내고 첫 층이 시작된다 */
function SummaryView({ log, style, onGo }: { log: Picked[]; style: CardKindStyle; onGo: () => void }) {
  const auto = log.filter((x) => x.auto).length;
  const hand = log.length - auto;
  useKeys((e) => {
    if (e.code !== "Enter" && e.code !== "Space" && e.code !== "NumpadEnter") return false;
    onGo();
    return true;
  });
  return (
    <div className={cx(c.pickWrap, c.calm)} role="dialog" aria-modal="true" aria-label="출근 준비 끝" onPointerDown={(e) => e.stopPropagation()}>
      <div className={cx(c.pick, c.sumBox)}>
        <div className={c.head}>
          <h2 className={c.title}>출근 준비 끝</h2>
          <p className={c.sub}>
            카드 {log.length}장을 골랐어요{hand > 0 ? ` (직접 ${hand}장, 자동 ${auto}장)` : ""}
          </p>
        </div>
        <SummaryList log={log} style={style} />
        <div className={c.actions}>
          <button type="button" className={cx(ui.button, ui.primary, c.askGo)} onClick={onGo}>
            출근하기
          </button>
        </div>
      </div>
    </div>
  );
}

function PickView({ view, onPicked, onAutoRest }: { view: CardOfferView; onPicked: (id: CardId) => void; onAutoRest?: () => void }) {
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
  const pick = (i: number) => {
    if (chosen !== null || !armed || !view.cards[i]) return;
    onPicked(view.cards[i]);
    send({ slot: i }, i);
  };
  const reroll = () => view.rerolls > 0 && send({ reroll: true }, null);
  const answer = (accept: boolean) => send({ accept }, accept ? 0 : -1);

  // 키: 1·2·3 고르기, R 다시 뽑기 / 상사의 제안은 1 받기·2 거절
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
    // 11/17 사냥 중 채팅 입력칸에 숫자·R을 쳐도 카드를 고르지 않는다
    const t = e.target;
    if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
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
      ? `건너뛴 층만큼 카드를 먼저 골라요 (${view.step?.[0]}/${view.step?.[1]})`
      : view.more
        ? `카드 한 장을 골라요. 이어서 ${view.more}번 더 골라요`
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
                  // 11/15 다섯 등급 (일반은 기본 테두리)
                  def.rarity !== "common" && c[def.rarity],
                  chosen === i && c.chosen,
                  chosen !== null && chosen !== i && c.dropped,
                )}
                style={{ "--i": i } as React.CSSProperties}
                disabled={deal || chosen !== null}
                onClick={() => !deal && pick(i)}
                aria-label={`${def.name}, ${RARITY_NAME[def.rarity]}, ${CARD_TYPE_NAME[def.type]}${have > 0 && Number.isFinite(def.max) ? `, 지금 ${have}단계에서 ${have + 1}단계로` : ""}. ${cardText(id, view.style)}`}
              >
                {(def.rarity === "legend" || def.rarity === "unique") && <span className={c.burst} aria-hidden="true" />}
                <span className={c.back} aria-hidden="true" />
                <span className={c.face}>
                  {!deal && <span className={c.key}>{i + 1}</span>}
                  <img className={c.art} src={cardWindowUrl(id, 3)} alt="" />
                  <span className={c.tag}>{RARITY_NAME[def.rarity]}</span>
                  <span className={c.name}>
                    {def.name}
                    {/* 11/19 공통·물공·마공 (내 빌드에 맞는지) */}
                    <span className={c.dmgType} data-type={def.type}>
                      {CARD_TYPE_NAME[def.type]}
                    </span>
                  </span>
                  {/* 11/15 이미 가진 카드면 지금 몇 단계인지 크게 (겹칠 수 있는 카드만) */}
                  {have > 0 && Number.isFinite(def.max) && (
                    <span className={c.level}>
                      {have}단계에서 <b>{have + 1}단계</b>로
                      {have + 1 >= def.max && <em> 마지막</em>}
                    </span>
                  )}
                  {/* 11/15 가진 카드면 지금 수치 → 더해진 수치 (+늘어나는 만큼) */}
                  {have > 0 && cardStackLine(id, have, view.owned) && <span className={c.stackLine}>{cardStackLine(id, have, view.owned)}</span>}
                  {/* 11/17 처음 고르는 카드인데 팀장 승진이 있으면: 적힌 숫자 대신 실제로 받는 숫자 */}
                  {have === 0 && cardPromoLine(id, 1, view.owned, view.style) && <span className={c.stackLine}>{cardPromoLine(id, 1, view.owned, view.style)}</span>}
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
              <small>최대 HP −{Math.round(BOSS_DEAL_HP_COST * 100)}%</small>
            </button>
            <button type="button" className={cx(ui.button, c.dealBtn)} onClick={() => answer(false)} disabled={chosen !== null}>
              <span>
                됐어요, 쉴래요 <kbd>2</kbd>
              </span>
              <small>HP를 모두 회복해요</small>
            </button>
          </div>
        ) : (
          <div className={c.actions}>
            <button type="button" className={cx(ui.button, c.reroll)} onClick={reroll} disabled={view.rerolls <= 0 || chosen !== null}>
              {view.rerolls > 0 ? `다시 뽑기 ${view.rerolls}번 남음` : "다시 뽑기를 다 썼어요"} <kbd>R</kbd>
            </button>
            {/* 11/26 시작 카드를 직접 고르는 중에도 남은 장은 자동으로 */}
            {onAutoRest && view.step && (
              <button type="button" className={ui.button} onClick={onAutoRest} disabled={chosen !== null}>
                남은 {view.step[1] - view.step[0] + 1}장 자동으로
              </button>
            )}
          </div>
        )}
        {!deal && <p className={c.hint}>카드를 누르거나 1, 2, 3 키로 골라요. 높이 오르거나 다시 뽑을수록 좋은 카드가 잘 나와요.</p>}
      </div>
    </div>
  );
}

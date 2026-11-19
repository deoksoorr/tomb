"use client";

import { useEffect, useMemo, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { CAT_LABEL, RARITY_LABEL, speciesById, type LifeCat } from "@/lib/forage/catalog";
import { QUEST_DAILY } from "@/lib/forage/quests/catalog";
import { questApi } from "@/lib/forage/quests/client";
import { defaultPick, eligibleOf, pickError, questProgress } from "@/lib/forage/quests/gen";
import type { QuestCard } from "@/lib/forage/quests/types";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import { questStore, useQuests } from "./questStore";
import q from "./quest.module.css";

// 11/15: 수집 의뢰판 (수집가 유령 · 어부 영감 창의 [의뢰] 칸). 오늘의 의뢰 7개 + 이번 주 큰 의뢰.
// 진행은 가방 사본으로 바로 계산한다. [납품]을 누르면 낼 것을 고르는 칸이 열린다 (기본: 값이 가장 싼 것부터 — 바꿀 수 있다).
// only = 그 갈래 의뢰만 (어부 영감은 물고기 의뢰만 받는다)
// 11/19 viewOnly = 어디서든 보는 의뢰판 (바로 가기 [의뢰]): 진행·도장만 보이고 바꾸기·납품 단추는 없다 (납품은 마을 의뢰 게시판에서)

const left = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`;
};

export default function QuestBoard({ only, viewOnly = false }: { only?: LifeCat; viewOnly?: boolean }) {
  const { board, error } = useQuests();
  const { state } = useForage();
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [confirmRe, setConfirmRe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void questStore.refresh();
    if (!forageStore.getSnapshot().state) void forageStore.refresh();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // 날짜가 바뀌면 새 의뢰
  useEffect(() => {
    if (board && now >= Math.min(board.dayResetAt, board.weekResetAt)) void questStore.refresh(true);
  }, [board, now]);

  const bag = useMemo(() => state?.bag ?? {}, [state]);
  const daily = (board?.daily ?? []).filter((d) => !only || d.cat === only);
  const weekly = board && (!only || board.weekly.cat === only) ? board.weekly : null;

  function toggle(card: QuestCard) {
    setConfirmRe(null);
    if (open === card.key) return setOpen(null);
    setOpen(card.key);
    setPick(defaultPick(card, bag) ?? {});
  }

  async function deliver(card: QuestCard) {
    const items = Object.fromEntries(Object.entries(pick).filter(([, n]) => n > 0));
    setBusy(true);
    setNotice(null);
    try {
      const r = await questApi.deliver(card.key, items);
      questStore.set(r.board);
      forageStore.takeFromBag(r.used);
      bridge.emit("forage:coin");
      setOpen(null);
      setNotice(`「${card.text}」 납품 완료! 의뢰 도장 +${r.earned}${r.bonus ? " (칭호 덕분에 하나 더)" : ""}`);
    } catch (e) {
      setNotice(errorMessage(e));
      void forageStore.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reroll(card: QuestCard) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await questApi.reroll(card.key);
      questStore.set(r.board);
      const nu = r.board.daily.find((d) => d.key === card.key);
      setNotice(nu ? `새 의뢰: 「${nu.text}」` : "의뢰를 바꿨어요.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmRe(null);
      setOpen(null);
    }
  }

  if (!board) return <p className={error ? ui.error : ui.hint}>{error ?? "의뢰판을 펼치는 중…"}</p>;

  const doneCount = board.daily.filter((d) => d.done).length;

  const row = (card: QuestCard) => {
    const have = questProgress(card, bag);
    const ready = have >= card.count;
    const isOpen = open === card.key;
    const canReroll = !viewOnly && board.rerollLeft > 0 && !card.done && card.key !== "w";
    return (
      <li key={card.key} className={q.item} data-done={card.done || undefined} data-weekly={card.key === "w" || undefined}>
        <div className={q.row}>
          <span className={q.stamp} data-hard={card.hard || undefined} aria-label={`의뢰 도장 ${card.stamps}개`}>
            ×{card.stamps}
          </span>
          <span className={q.text}>
            {card.title && <em className={q.weekTitle}>{card.title}</em>}
            <b>{card.text}</b>
            <small>{card.hint}</small>
          </span>
          {card.done ? (
            <span className={q.doneTag}>완료</span>
          ) : (
            <span className={q.actions}>
              <span className={q.prog} data-ready={ready || undefined} aria-label={`가방에 ${have} / ${card.count}`}>
                {have}/{card.count}
              </span>
              {canReroll && (
                <button
                  type="button"
                  className={cx(ui.button, ui.quiet, q.reBtn)}
                  disabled={busy}
                  onClick={() => {
                    setOpen(null);
                    setConfirmRe(confirmRe === card.key ? null : card.key);
                  }}
                  aria-label={`「${card.text}」 다른 의뢰로 바꾸기`}
                  title="다른 의뢰로 바꾸기 (하루 1번)"
                >
                  ↻
                </button>
              )}
              {!viewOnly && (
                <button type="button" className={cx(ui.button, ready && ui.primary, q.goBtn)} disabled={busy || !ready} onClick={() => toggle(card)} aria-expanded={isOpen}>
                  {isOpen ? "닫기" : "납품"}
                </button>
              )}
            </span>
          )}
        </div>
        {confirmRe === card.key && (
          <div className={q.confirm}>
            <span>이 의뢰를 다른 것으로 바꿀까요? (오늘 1번, 무료)</span>
            <span className={q.confirmBtns}>
              <button type="button" className={ui.button} disabled={busy} onClick={() => setConfirmRe(null)}>
                그대로
              </button>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={busy} onClick={() => void reroll(card)}>
                바꾸기
              </button>
            </span>
          </div>
        )}
        {isOpen && <PickPanel card={card} bag={bag} pick={pick} setPick={setPick} busy={busy} onDeliver={() => void deliver(card)} />}
      </li>
    );
  };

  return (
    <div className={q.board}>
      <div className={q.head}>
        {/* 도장 수는 게시판 창 맨 위에 크게 (WharfBoard) */}
        <span>
          오늘 {doneCount}/{QUEST_DAILY} 끝냄 · 지금까지 {board.total}개
        </span>
        <span>새 의뢰까지 {left(board.dayResetAt - now)}</span>
        {!viewOnly && <span>{board.rerollLeft > 0 ? "바꾸기 ↻ 1번 남음" : "오늘 바꾸기 끝"}</span>}
      </div>
      <ul className={q.list} aria-label="수집 의뢰">
        {weekly && row(weekly)}
        {only && !daily.length && !weekly && <li className={q.empty}>오늘은 {CAT_LABEL[only]} 의뢰가 없어요. 다른 의뢰는 버스 정류장 마당 의뢰 게시판에 있어요.</li>}
        {daily.map(row)}
      </ul>
      {!viewOnly && (
      <p className={ui.hint} role="status">
        {notice ??
          (only
            ? `${CAT_LABEL[only]} 의뢰만 보여요. 모든 의뢰는 버스 정류장 마당 의뢰 게시판에 있어요.`
            : "납품한 것은 가방에서 사라져요. 도장은 포인트로 바꿀 수 없고, 도장 교환소에서만 써요.")}
      </p>
      )}
    </div>
  );
}

/** 낼 것 고르기: 가방에서 이 의뢰에 맞는 것 (값이 싼 것부터). 서로 다른 종 의뢰는 종마다 하나씩 */
function PickPanel({
  card,
  bag,
  pick,
  setPick,
  busy,
  onDeliver,
}: {
  card: QuestCard;
  bag: Record<string, number>;
  pick: Record<string, number>;
  setPick: (p: Record<string, number>) => void;
  busy: boolean;
  onDeliver: () => void;
}) {
  const rows = eligibleOf(card, bag);
  const total = card.distinct ? Object.values(pick).filter((n) => n > 0).length : Object.values(pick).reduce((a, b) => a + b, 0);
  const err = pickError(card, pick);
  const set = (id: string, v: number, max: number) => setPick({ ...pick, [id]: Math.max(0, Math.min(max, v)) });
  return (
    <div className={q.pick}>
      <p className={q.pickHead}>
        낼 것 <strong>{total}</strong>/{card.count}
        {card.distinct ? "종" : ""} · 값이 싼 것부터 골라 뒀어요
      </p>
      <div className={q.pickList} role="list">
        {rows.map(({ id, n }) => {
          const sp = speciesById(id)!;
          const v = pick[id] ?? 0;
          const max = card.distinct ? 1 : n;
          return (
            <div key={id} className={q.pickRow} role="listitem" data-on={v > 0 || undefined}>
              <ItemIcon itemId={id} size={24} />
              <span className={q.pickName}>
                {sp.name}
                <small>
                  {RARITY_LABEL[sp.rarity]} · {sp.price}P · {n}개 있음
                </small>
              </span>
              <span className={q.pickQty}>
                <button type="button" className={ui.button} disabled={busy || v <= 0} onClick={() => set(id, v - 1, max)} aria-label={`${sp.name} 하나 덜`}>
                  −
                </button>
                <span aria-live="polite">{v}</span>
                <button type="button" className={ui.button} disabled={busy || v >= max} onClick={() => set(id, v + 1, max)} aria-label={`${sp.name} 하나 더`}>
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className={q.pickFoot}>
        <span className={q.pickErr}>{err ?? `도장 ×${card.stamps}`}</span>
        <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || !!err} onClick={onDeliver}>
          {busy ? "납품 중…" : "이것으로 납품"}
        </button>
      </div>
    </div>
  );
}

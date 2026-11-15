"use client";

import { useEffect, useState } from "react";
import { itemById } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { isOneTime, QUEST_REWARDS, type QuestReward } from "@/lib/forage/quests/catalog";
import { questApi } from "@/lib/forage/quests/client";
import { meStore } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { questStore, useQuests } from "./questStore";
import q from "./quest.module.css";

// 11/15: 도장 교환소 (수집가 유령 창의 [교환소] 칸). 상점에 없는 의뢰 전용 물건을 의뢰 도장으로만 받는다.
// 꾸미기·이모티콘·외형은 한 번만(영구), 염색권은 몇 장이든. 받은 꾸미기는 가방의 꾸미기에서 입는다.

const TIER_LABEL = { rare: "희귀", legend: "전설" } as const;

export default function StampExchange() {
  const { board, error } = useQuests();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void questStore.refresh();
  }, []);

  async function take(r: QuestReward) {
    setBusy(r.id);
    setNotice(null);
    try {
      const res = await questApi.exchange(r.id);
      questStore.set(res.board);
      meStore.set(res.me);
      setNotice(
        r.kind === "cosmetic"
          ? `${res.name}을(를) 받았어요! 가방 → 꾸미기에서 입을 수 있어요. (영구)`
          : r.kind === "body"
            ? `${res.name}을(를) 받았어요! 잡화점 염색·외형에서 바꿀 수 있어요. 칭호 「수집왕」도 생겼어요.`
            : `${res.name}을(를) 받았어요! 가방에 넣어 뒀어요.`,
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  if (!board) return <p className={error ? ui.error : ui.hint}>{error ?? "교환소를 여는 중…"}</p>;

  return (
    <div className={q.board}>
      <div className={q.head}>
        <span className={q.balance}>
          의뢰 도장 <strong>{board.stamps}</strong>개
        </span>
        <span>상점에 없는 의뢰 전용 물건 · 남에게 줄 수 없어요</span>
      </div>
      <ul className={q.shop} aria-label="도장 교환소">
        {QUEST_REWARDS.map((r) => {
          const owned = isOneTime(r) && board.owned.includes(r.id);
          const got = board.bought[r.id] ?? 0;
          const short = board.stamps < r.price;
          const desc = itemById(r.id)?.desc ?? r.desc;
          return (
            <li key={r.id} className={q.card} data-owned={owned || undefined} data-tier={r.tier}>
              <ItemIcon itemId={r.id} size={32} />
              <span className={q.cardText}>
                <b>
                  {r.name}
                  {r.tier && <em className={q.tier}>{TIER_LABEL[r.tier]}</em>}
                </b>
                <small>{desc}</small>
                {!isOneTime(r) && got > 0 && <small className={q.got}>지금까지 {got}장 받음</small>}
              </span>
              {owned ? (
                <span className={q.doneTag}>받음</span>
              ) : confirm === r.id ? (
                <span className={q.cardBtns}>
                  <button type="button" className={ui.button} disabled={!!busy} onClick={() => setConfirm(null)}>
                    취소
                  </button>
                  <button type="button" className={cx(ui.button, ui.primary)} disabled={!!busy} onClick={() => void take(r)}>
                    {busy === r.id ? "…" : "받기"}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={cx(ui.button, !short && ui.primary, q.priceBtn)}
                  disabled={!!busy || short}
                  onClick={() => setConfirm(r.id)}
                  aria-label={`${r.name} 도장 ${r.price}개로 받기`}
                >
                  도장 {r.price}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={ui.hint} role="status">
        {notice ?? "도장은 오늘의 의뢰(하루 7개)와 이번 주 큰 의뢰로 모아요. 포인트로는 바꿀 수 없어요."}
      </p>
    </div>
  );
}

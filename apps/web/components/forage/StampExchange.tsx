"use client";

import { useEffect, useState } from "react";
import { isPermanentUntil, itemById } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { isOneTime, questRewardById, type QuestReward } from "@/lib/forage/quests/catalog";
import { questApi } from "@/lib/forage/quests/client";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { questStore, useQuests } from "./questStore";
import q from "./quest.module.css";

// 11/15: 도장 교환소 (납품 부두 의뢰 게시판의 [도장 교환소] 칸). 상점에 없는 의뢰 전용 물건을 의뢰 도장으로만 받는다.
// 이달의 교환소: 이달의 칸은 1일 새벽 5시에 바뀌고(서버가 정한 목록 board.shop), 염색권 2종은 늘. 다음 달 것 하나를 미리 보여 준다.
// 꾸미기·이모티콘·외형은 한 번만(영구, 가지면 "가짐"), 염색권은 몇 장이든.

const TIER_LABEL = { rare: "희귀", legend: "전설" } as const;
const DAY_MS = 86_400_000;
const monthLabel = (m: string) => `${Number(m.slice(4, 6))}월`;
/** "12일" · 하루 안 남았으면 "5시간" */
const leftText = (ms: number) => (ms >= DAY_MS ? `${Math.ceil(ms / DAY_MS)}일` : `${Math.max(1, Math.ceil(ms / 3_600_000))}시간`);

export default function StampExchange() {
  const { board, error } = useQuests();
  const { me } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void questStore.refresh();
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // 달이 바뀌면 새 목록
  useEffect(() => {
    if (board?.shop && now >= board.shop.endsAt) void questStore.refresh(true);
  }, [board, now]);

  async function take(r: QuestReward) {
    setBusy(r.id);
    setNotice(null);
    try {
      const res = await questApi.exchange(r.id);
      questStore.set(res.board);
      meStore.set(res.me);
      setNotice(
        r.kind === "cosmetic"
          ? `${res.name}을(를) 받았어요. 가방 → 꾸미기에서 입어요.`
          : r.kind === "body"
            ? `${res.name}을(를) 받았어요. 칭호 「수집왕」도 생겼어요.`
            : `${res.name}을(를) 가방에 넣었어요.`,
      );
    } catch (e) {
      setNotice(errorMessage(e));
      void questStore.refresh(true);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  if (!board?.shop) return <p className={error ? ui.error : ui.hint}>{error ?? "교환소를 여는 중…"}</p>;
  const { shop } = board;
  const list = (ids: readonly string[]) => ids.map((id) => questRewardById(id)).filter((r): r is QuestReward => !!r);
  const preview = shop.preview ? list(shop.preview.ids) : [];
  // 교환소 밖에서 받은 영구 꾸미기(운영 지급 등)·이모티콘 묶음도 가진 것으로 본다
  const permOwned = new Set([...(me?.equipped ?? []), ...(me?.stash ?? [])].filter((e) => isPermanentUntil(e.until)).map((e) => e.itemId));
  const has = (r: QuestReward) => isOneTime(r) && (board.owned.includes(r.id) || permOwned.has(r.id) || (r.kind === "flag" && (me?.inventory[r.id] ?? 0) > 0));

  const card = (r: QuestReward, mode: "buy" | "preview" = "buy") => {
    const owned = has(r);
    const got = board.bought[r.id] ?? 0;
    const short = board.stamps < r.price;
    const it = itemById(r.id);
    return (
      <li key={r.id} className={q.card} data-owned={owned || undefined} data-tier={r.tier} data-preview={mode === "preview" || undefined}>
        <ItemIcon itemId={r.id} size={32} />
        <span className={q.cardText}>
          <b>
            {it?.name ?? r.name}
            {r.tier && <em className={q.tier}>{TIER_LABEL[r.tier]}</em>}
            {/* 11/15 기간이 있는지 한눈에: 꾸미기·외형·이모티콘은 영구, 염색권은 한 번 쓰면 없어진다 */}
            <em className={q.span}>{isOneTime(r) ? "영구" : "1회용"}</em>
          </b>
          <small>{it?.desc ?? r.desc}</small>
          {!isOneTime(r) && got > 0 && <small className={q.got}>{got}장 받음</small>}
        </span>
        {mode === "preview" ? (
          <span className={q.previewPrice}>{owned ? "가짐" : `도장 ${r.price}`}</span>
        ) : owned ? (
          <span className={q.doneTag}>가짐</span>
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
            aria-label={`${it?.name ?? r.name} 도장 ${r.price}개로 받기`}
          >
            도장 {r.price}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className={q.board}>
      <div className={q.shopScroll}>
        <h4 className={q.secHead}>
          <span>이달의 교환소 · {monthLabel(shop.month)}</span>
          <small>남은 기간 {leftText(shop.endsAt - now)}</small>
        </h4>
        <ul className={q.shopList} aria-label="이달의 교환소">
          {list(shop.items).map((r) => card(r))}
        </ul>
        <h4 className={q.secHead}>
          <span>언제나</span>
        </h4>
        <ul className={q.shopList} aria-label="언제나 있는 것">
          {list(shop.always).map((r) => card(r))}
        </ul>
        {preview.length > 0 && shop.preview && (
          <>
            <h4 className={q.secHead}>
              <span>다음 달 미리 보기 · {monthLabel(shop.preview.month)}</span>
            </h4>
            <ul className={q.shopList} aria-label="다음 달 미리 보기">
              {preview.map((r) => card(r, "preview"))}
            </ul>
          </>
        )}
      </div>
      <p className={ui.hint} role="status">
        {notice ?? "도장은 사라지지 않아요. 남에게 줄 수 없어요."}
      </p>
    </div>
  );
}

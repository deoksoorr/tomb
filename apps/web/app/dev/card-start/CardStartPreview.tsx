"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import CardPick from "@/components/rpg/CardPick";
import { CARD_POOL_VER, cardOffer, replayPicks, startPicks, type CardCounts, type CardPick as Pick, type CardId } from "@/lib/rpg/cards";

// 게임(CardRun)이 하는 일만 흉내: 시작 카드 제안을 차례로 보내고, 고른 기록을 서버 검사(replayPicks)로 다시 굴려 본다

export default function CardStartPreview() {
  const [verdict, setVerdict] = useState<string>("고르는 중");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const start = Number(q.get("start") ?? 101);
    const seed = Number(q.get("seed") ?? 777);
    const total = startPicks(start);
    const owned: CardCounts = {};
    const log: Pick[] = [];
    let i = 0;
    let r = 0;
    let rerolls = 1;
    let seq = 0;
    let cards: CardId[] = [];
    const emit = () => {
      cards = cardOffer(seed, "s", i, r, owned, start, CARD_POOL_VER, null);
      bridge.emit("rpg:cards", { kind: "s", seq: ++seq, cards, owned: { ...owned }, style: "melee", rerolls, step: [i + 1, total] });
    };
    const off = bridge.on("rpg:cardPick", (ch) => {
      if ("reroll" in ch) {
        if (rerolls <= 0) return;
        rerolls--;
        r++;
        return emit();
      }
      if (!("slot" in ch)) return;
      const c = cards[ch.slot];
      log.push({ k: "s", i, r, c });
      owned[c] = (owned[c] ?? 0) + 1;
      i++;
      r = 0;
      if (i < total) return emit();
      bridge.emit("rpg:cards", null);
      const v = replayPicks(seed, log, { levels: 0, starts: total, bossFloors: [], rerolls: 1, start, main: null });
      setVerdict(v.ok ? `서버 검사 통과 (${log.length}장)` : `서버 검사 실패: ${v.why}`);
      (window as unknown as { __cardLog: unknown }).__cardLog = { log, ok: v.ok };
    });
    emit();
    return () => {
      off();
      bridge.emit("rpg:cards", null);
    };
  }, []);
  return (
    <main style={{ minHeight: "100dvh", background: "radial-gradient(circle at 50% 30%, #2a2533, #0c0b10)", color: "var(--bone)" }}>
      <p data-verdict style={{ position: "fixed", left: 12, bottom: 8, fontSize: 12, opacity: 0.8 }}>
        {verdict}
      </p>
      <CardPick />
    </main>
  );
}

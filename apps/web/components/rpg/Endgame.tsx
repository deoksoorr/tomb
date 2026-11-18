"use client";

import { useState } from "react";
import { PIONEER_DAYS, PIONEER_FLOOR, RUN_TIERS, starLabel, type RunTier } from "@/lib/rpg/endgame";
import { titleDef } from "@/lib/titles";
import type { EndgameView, RunReward } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import s from "./rpg.module.css";

// 11/15 사냥 끝판 화면 조각: 초월 레벨 막대 · 오늘 초월 판 · 판 결과 한 줄 (lib/rpg/endgame). 야근 빌딩 입구는 TowerEntrance

/** 구간 칩 (초록 100% · 노랑 30% · 주황 10% · 회색 연습) */
export function TierChip({ tier }: { tier: RunTier }) {
  return (
    <span className={s.tierChip} style={{ background: RUN_TIERS[tier].color }}>
      {RUN_TIERS[tier].label}
    </span>
  );
}

/** 초월 레벨·초월 EXP 막대 (레벨 50) */
export function TranscendBar({ tLevel, tExp, eg }: { tLevel: number; tExp: number; eg: EndgameView }) {
  const need = eg.tExpToNext;
  return (
    <>
      <div className={s.barLabel}>
        <span>{tLevel > 0 ? `${starLabel(tLevel)} 초월 경험치` : "초월 경험치 (★51까지)"}</span>
        <span>
          {tExp.toLocaleString("ko-KR")} / {need ? need.toLocaleString("ko-KR") : "MAX"}
        </span>
      </div>
      <div className={cx(s.expBar, s.tBar)} role="meter" aria-label="초월 경험치" aria-valuenow={tExp} aria-valuemin={0} aria-valuemax={need || 1}>
        <span style={{ width: `${need ? Math.min(100, (tExp / need) * 100) : 100}%` }} />
      </div>
    </>
  );
}

/** 개척자 모집 한 줄 (모집 중이거나 받은 번호가 있을 때만) */
export function PioneerLine({ eg }: { eg: EndgameView }) {
  const [now] = useState(() => Date.now());
  const p = eg.pioneer;
  if (p.n) return <p className={s.meta}>개척자 #{p.n}. 칭호 「개척자」를 받았어요.</p>;
  if (!p.until || now >= p.until) return null;
  const d = new Date(p.until + 9 * 3_600_000);
  return (
    <p className={s.meta}>
      개척자를 {PIONEER_DAYS}일 동안 모아요. {d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {d.getUTCHours()}시까지 ★51에 닿거나 야근 빌딩{" "}
      {PIONEER_FLOOR}층을 넘으면 「개척자」 칭호와 번호를 받아요. 먼저 닿을수록 번호가 앞이에요.
    </p>
  );
}

/** 판 결과: 초월 EXP·구간, 야근 빌딩(층·기록·상자·칭호), 개척자 */
export function EndgameResult({ reward }: { reward: RunReward }) {
  const t = reward.transcend;
  const w = reward.tower;
  return (
    <>
      {t && (
        <p className={s.tDay} role="status">
          초월 EXP <b>+{t.exp.toLocaleString("ko-KR")}</b>
        </p>
      )}
      {t && t.levelsGained > 0 && (
        <p className={s.levelUp} role="status">
          초월 레벨 업! {starLabel(t.tLevel)}
          {Math.floor(t.tLevel / 5) > Math.floor((t.tLevel - t.levelsGained) / 5) ? " 능력치 포인트를 받았어요." : ""}
        </p>
      )}
      {w?.suspect && (
        <p className={s.meta} role="status">
          기록 확인 중이에요. 포인트는 받았고, 확인되면 최고 층과 랭킹, 상자, 초월 EXP가 들어가요.
        </p>
      )}
      {w?.topPending && (
        <p className={cx(s.levelUp, s.mythicLine)} role="status">
          서버 최고 기록이에요! 운영자가 확인하면 꼭대기 층 주인으로 올라가요.
        </p>
      )}
      {reward.firstPending?.map((id) => (
        <p key={id} className={cx(s.levelUp, s.mythicLine)} role="status">
          서버 최초 기록이에요! 운영자가 확인하면 「{titleDef(id)?.name ?? id}」 칭호를 드려요.
        </p>
      ))}
      {w && (w.newBest || w.newWeek) && (
        <p className={s.levelUp} role="status">
          {w.newBest ? `최고 기록 ${w.best}층!` : `이번 주 기록 ${w.best}층!`}
          {w.newBest && w.newWeek ? " 이번 주 랭킹에도 올랐어요." : ""}
        </p>
      )}
      {w && (w.chests.length > 0 || w.emptyChests > 0) && (
        <p className={s.meta}>
          {w.chests.length > 0 && `우두머리 상자 ${w.chests.length}개 (${w.chests.map((f) => `${f}층`).join(" · ")})`}
          {w.emptyChests > 0 && `${w.chests.length > 0 ? ". " : ""}오늘 상자를 다 열어서 ${w.emptyChests}개는 비어 있었어요`}
        </p>
      )}
      {w &&
        w.titles.map((id) => (
          <p key={id} className={cx(s.levelUp, s.mythicLine)} role="status">
            신화 칭호 「{titleDef(id)?.name ?? id}」를 얻었어요!
          </p>
        ))}
      {reward.pioneer && (
        <p className={s.levelUp} role="status">
          개척자 #{reward.pioneer}! 칭호 「개척자」를 얻었어요.
        </p>
      )}
    </>
  );
}

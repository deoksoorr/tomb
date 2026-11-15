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

/** "오늘 초월 판 12/35 [100%] · 적립 15판" */
export function TranscendDay({ eg }: { eg: EndgameView }) {
  const d = eg.day;
  return (
    <p className={s.tDay}>
      {d.tier === "full" ? (
        <>
          오늘 초월 판 <b>{d.runs}</b>/{d.full}
        </>
      ) : (
        <>
          오늘 초월 판 <b>{d.runs}</b>판 (100% {d.full}판 다 씀)
        </>
      )}{" "}
      <TierChip tier={d.tier} /> · 적립 {d.bank}판{d.floors > 0 ? ` · 야근 빌딩 ${d.floors}/4층` : ""}
      <span className={s.meta}> · 레벨 50에선 지옥 사냥·야근 빌딩만 초월 EXP{d.tier === "practice" ? " · 지금은 연습 판 (초월 EXP·드롭 없음)" : ""}</span>
    </p>
  );
}

/** 개척자 모집 한 줄 (모집 중이거나 받은 번호가 있을 때만) */
export function PioneerLine({ eg }: { eg: EndgameView }) {
  const [now] = useState(() => Date.now());
  const p = eg.pioneer;
  if (p.n) return <p className={s.meta}>개척자 #{p.n} — 칭호 「개척자」를 받았어요.</p>;
  if (!p.until || now >= p.until) return null;
  const d = new Date(p.until + 9 * 3_600_000);
  return (
    <p className={s.meta}>
      개척자 모집 중 ({d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {d.getUTCHours()}시까지, 끝판이 열린 뒤 {PIONEER_DAYS}일): ★51에 닿거나 야근 빌딩{" "}
      {PIONEER_FLOOR}층을 처음 넘으면 닿은 차례대로 「개척자 #번호」.
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
          초월 EXP <b>+{t.exp.toLocaleString("ko-KR")}</b> <TierChip tier={t.tier} />
          {w && w.runs > 0 && <span className={s.meta}> 깬 층으로 초월 판 {w.runs}판을 셌어요 (4층 = 1판)</span>}
          {t.tier === "practice" && <span className={s.meta}> 오늘 초월 구간을 다 써서 연습 판이에요 (초월 EXP 없음)</span>}
          {t.tier !== "full" && t.tier !== "practice" && <span className={s.meta}> 오늘 100% 판을 다 써서 {RUN_TIERS[t.tier].label}만 받았어요</span>}
        </p>
      )}
      {t && t.levelsGained > 0 && (
        <p className={s.levelUp} role="status">
          초월 레벨 업! {starLabel(t.tLevel)}
          {Math.floor(t.tLevel / 5) > Math.floor((t.tLevel - t.levelsGained) / 5) ? " · 능력치 포인트를 받았어요" : ""}
        </p>
      )}
      {w && (w.newBest || w.newWeek) && (
        <p className={s.levelUp} role="status">
          {w.newBest ? `최고 기록 ${w.best}층!` : `이번 주 기록 ${w.best}층!`}
          {w.newBest && w.newWeek ? " 이번 주 랭킹에도 올랐어요." : ""}
        </p>
      )}
      {w && (w.chests.length > 0 || w.emptyChests > 0) && (
        <p className={s.meta}>
          {w.chests.length > 0 && `우두머리 상자 ${w.chests.length}개 (${w.chests.map((f) => `${f}층`).join(" · ")})`}
          {w.emptyChests > 0 && `${w.chests.length > 0 ? " · " : ""}오늘 상자를 다 열어서 ${w.emptyChests}개는 비어 있었어요`}
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

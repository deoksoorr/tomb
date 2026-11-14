"use client";

import { useState } from "react";
import {
  BURNOUT_DEF,
  BURNOUT_HP_ATK,
  burnoutExpMul,
  burnoutZone,
  CURSES,
  cursesAt,
  PIONEER_DAYS,
  RUN_TIERS,
  runTimeLimitSec,
  starLabel,
  type RunTier,
} from "@/lib/rpg/endgame";
import type { EndgameView, RpgView, RunReward } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import s from "./rpg.module.css";

// 11/15 사냥 끝판 1단계 화면 조각: 초월 레벨 막대 · 오늘 초월 판 · 번아웃 단계 고르기 · 판 결과 한 줄 (lib/rpg/endgame)

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
      <TierChip tier={d.tier} /> · 적립 {d.bank}판
      <span className={s.meta}> · 레벨 50에선 지옥 사냥·번아웃만 초월 EXP{d.tier === "practice" ? " · 지금은 연습 판 (초월 EXP·드롭 없음)" : ""}</span>
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
      개척자 모집 중 ({d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {d.getUTCHours()}시까지, 끝판이 열린 뒤 {PIONEER_DAYS}일): ★51에 닿거나 번아웃 1단계를 처음
      깨면 닿은 차례대로 「개척자 #번호」.
    </p>
  );
}

/** 번아웃 단계 고르기 + 도전 (지옥 사냥터 아래) */
export function BurnoutBox({ view, busy, onStart }: { view: RpgView; busy: boolean; onStart: (tier: number) => void }) {
  const b = view.endgame!.burnout;
  const [pick, setPick] = useState(() => Math.max(1, Math.min(b.open, b.best + 1)));
  const tier = Math.min(pick, b.open);
  const z = burnoutZone(tier);
  const on = new Set(cursesAt(tier));
  const curses = CURSES.filter((c) => on.has(c.id));
  const hp = BURNOUT_HP_ATK ** tier;
  const canStart = !busy && b.triesLeft > 0 && view.today.runsPerHour > 0;
  return (
    <section className={cx(s.section, s.burnBox)} aria-labelledby="rpg-burnout">
      <h3 id="rpg-burnout" className={s.sectionTitle}>
        번아웃 단계{" "}
        <span className={s.meta}>
          · 깬 최고 {b.best}단계 · 오늘 남은 도전 {b.triesLeft}/{b.tries}
          {view.superHunter ? " · 슈퍼 계정: 모든 단계 열림" : ""}
        </span>
      </h3>
      {/* 왜 하는지: 50 이후 성장은 여기가 가장 빠르고, 자랑거리는 여기서만 나온다 */}
      <ul className={s.burnWhy}>
        <li>
          <b>가장 빠른 초월:</b> 레벨 50부터 EXP는 ★51~★100 초월 EXP로만 쌓여요. 번아웃은 지옥 EXP에 단계마다 10%씩 더 얹어 줘요 (5단계 ×1.5, 10단계 ×2).
        </li>
        <li>
          <b>여기서만 받는 칭호:</b> 5단계 「번아웃 생존자」, 10단계 「야근이 일상」, 그리고 출시 2주 안에 1단계를 깨면 「개척자 #번호」.
        </li>
        <li>
          <b>실력 증명:</b> 단계마다 몬스터가 1.35배씩 세지고 저주가 붙어요. 내가 막히는 단계가 곧 내 실력이에요.
        </li>
      </ul>
      <div className={s.burnTiers} role="radiogroup" aria-label="번아웃 단계">
        {Array.from({ length: b.max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={tier === n}
            aria-disabled={n > b.open}
            aria-label={`${n}단계${n > b.open ? " (잠김)" : n <= b.best ? " (깸)" : ""}`}
            className={cx(s.burnTier, n <= b.best && s.burnDone)}
            onClick={() => n <= b.open && setPick(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className={s.meta}>
        <b className={s.zoneGimmick}>
          {tier}단계 · {z.name}
        </b>{" "}
        몬스터 체력·공격력 ×{hp.toFixed(2)} · 방어 ×{(BURNOUT_DEF ** tier).toFixed(2)} · EXP ×{burnoutExpMul(tier).toFixed(1)} · 제한 시간{" "}
        {runTimeLimitSec("hunt", "hell", z.id, tier)}초
      </p>
      <p className={s.meta}>저주: {curses.length ? curses.map((c) => `${c.name}(${c.desc})`).join(" · ") : "없음"}</p>
      <p className={s.meta}>
        한 번도 쓰러지지 않고(부활 쿠키도 없이) 우두머리까지 깨면 다음 단계가 열려요. 깬 단계는 다시 해도 돼요. 도전 1번도 초월 판 1판으로 세요.
      </p>
      <div className={s.zoneGo}>
        <span className={s.meta}>하루 {b.tries}번 · 새벽 5시에 다시 차요</span>
        <button type="button" className={cx(ui.button, ui.primary, s.start)} disabled={!canStart} onClick={() => onStart(tier)}>
          {busy ? "준비 중…" : b.triesLeft > 0 ? `번아웃 ${tier}단계 도전` : "오늘 도전 끝"}
        </button>
      </div>
    </section>
  );
}

/** 판 결과: 초월 EXP·구간, 번아웃 결과, 개척자 */
export function EndgameResult({ reward, max }: { reward: RunReward; max: number }) {
  const t = reward.transcend;
  const b = reward.burnout;
  return (
    <>
      {t && (
        <p className={s.tDay} role="status">
          초월 EXP <b>+{t.exp.toLocaleString("ko-KR")}</b> <TierChip tier={t.tier} />
          {t.tier === "practice" && <span className={s.meta}> 오늘 초월 구간을 다 써서 연습 판이에요 (초월 EXP·드롭 없음)</span>}
          {t.tier !== "full" && t.tier !== "practice" && <span className={s.meta}> 오늘 100% 판을 다 써서 {RUN_TIERS[t.tier].label}만 받았어요</span>}
        </p>
      )}
      {t && t.levelsGained > 0 && (
        <p className={s.levelUp} role="status">
          초월 레벨 업! {starLabel(t.tLevel)}
          {Math.floor(t.tLevel / 5) > Math.floor((t.tLevel - t.levelsGained) / 5) ? " · 능력치 포인트를 받았어요" : ""}
        </p>
      )}
      {b &&
        (b.clean ? (
          <p className={s.levelUp} role="status">
            번아웃 {b.tier}단계를 쓰러지지 않고 깼어요!
            {b.unlocked ? (b.unlocked < max ? ` ${b.unlocked + 1}단계가 열렸어요.` : " 지금 열린 마지막 단계예요.") : ""}
          </p>
        ) : (
          <p className={s.meta}>번아웃 {b.tier}단계 — 쓰러지거나 부활 쿠키를 먹었거나 다 못 깨서 다음 단계는 그대로예요.</p>
        ))}
      {reward.pioneer && (
        <p className={s.levelUp} role="status">
          개척자 #{reward.pioneer}! 칭호 「개척자」를 얻었어요.
        </p>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import {
  CURSES,
  cursesAt,
  floorTExp,
  TOWER_CHECKPOINT_EVERY,
  TOWER_FLOORS_PER_RUN,
  towerFloorSec,
  towerHpMul,
  towerZone,
} from "@/lib/rpg/tower";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import { PioneerLine, TranscendDay } from "./Endgame";
import s from "./rpg.module.css";

// 11/15 야근 빌딩 입구 (마을의 야근 빌딩 → portal:open {kind:"tower"} → HuntLobby mode="tower"의 첫 탭).
// 엘리베이터 버튼판: 체크포인트 층(1·11·21 …)에 불이 들어와 있고, 위 숫자판에 최고 층·이번 주 최고 층. 고른 층의 저주·몬스터 배율, 오늘 상자, 오르는 이유.

/** 버튼판에 보이는 층 버튼 수 (불 꺼진 다음 체크포인트 몇 개까지 보여 준다) */
const DARK_AHEAD = 3;

export default function TowerEntrance({
  view,
  busy,
  onStart,
}: {
  view: RpgView;
  busy: boolean;
  onStart: (start: number) => void;
}) {
  const eg = view.endgame!;
  const t = eg.tower;
  const lit = t.checkpoints;
  const top = lit[lit.length - 1];
  // 처음엔 내 기록으로 열린 가장 높은 층 (슈퍼 계정도 기록 기준 — 위층은 골라서)
  const [pick, setPick] = useState(
    () => lit.filter((f) => f <= Math.max(1, t.best)).at(-1) ?? 1,
  );
  const start = lit.includes(pick) ? pick : top;
  const buttons = [...lit];
  for (let i = 1; i <= DARK_AHEAD; i++)
    buttons.push(top + i * TOWER_CHECKPOINT_EVERY);
  const on = new Set(cursesAt(start));
  const curses = CURSES.filter((c) => on.has(c.id));
  const zone = towerZone(start);
  const canStart = !busy && view.today.runsPerHour > 0;
  return (
    <div className={s.lobby}>
      <section className={s.towerBox} aria-labelledby="tower-lift">
        <div className={s.liftTop}>
          <div
            className={s.liftDisplay}
            role="status"
            aria-label={`최고 ${t.best}층`}
          >
            <span>최고 층</span>
            <b>{t.best > 0 ? `${t.best}F` : "--"}</b>
          </div>
          <div className={s.liftDisplay} aria-label="이번 주 최고 층">
            <span>이번 주</span>
            <b>{t.week ? `${t.week.floor}F` : "--"}</b>
            {t.week && <span>{mmss(t.week.ms)}</span>}
          </div>
          <div className={s.liftDisplay} aria-label="오늘 우두머리 상자">
            <span>오늘 상자</span>
            <b>
              {t.chests}/{t.chestsMax}
            </b>
          </div>
        </div>
        <h3 id="tower-lift" className={s.sectionTitle}>
          몇 층부터 오를까요?{" "}
          <span className={s.meta}>
            · 최고 기록 아래 1·11·21 …층에 불이 들어와요
            {view.superHunter ? " · 슈퍼 계정: 101층까지 열림" : ""}
          </span>
        </h3>
        <div className={s.liftPanel} role="radiogroup" aria-label="시작 층">
          {buttons.map((f) => {
            const ok = lit.includes(f);
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={start === f}
                aria-label={`${f}층${ok ? "" : " (불 꺼짐)"}`}
                className={s.liftBtn}
                data-lit={ok ? "" : undefined}
                disabled={!ok}
                onClick={() => setPick(f)}
              >
                {f}
              </button>
            );
          })}
        </div>
        <p className={s.meta}>
          <b className={s.zoneGimmick}>
            {start}층 · {zone.name}
          </b>{" "}
          몬스터 체력·공격력 ×{towerHpMul(start).toFixed(2)} (층마다 ×1.06) ·
          층마다 {towerFloorSec(start)}초 · 5층마다 우두머리 (깨면 체력 30%
          회복·상자)
        </p>
        <p className={s.meta}>
          저주:{" "}
          {curses.length
            ? curses.map((c) => `${c.name}(${c.desc})`).join(" · ")
            : "아직 없음 (10층부터 붙어요)"}
        </p>
        <div className={s.zoneGo}>
          <span className={s.meta}>
            도전 무제한 · 상자는 하루 {t.chestsMax}개 (새벽 5시)
          </span>
          <button
            type="button"
            className={cx(ui.button, ui.primary, s.start)}
            disabled={!canStart}
            onClick={() => onStart(start)}
          >
            {busy ? "엘리베이터 부르는 중…" : `▲ ${start}층부터 오르기`}
          </button>
        </div>
        <ul className={s.towerWhy}>
          <li>
            <b>가장 빠른 초월:</b> 깬 층마다 초월 EXP (지금 층{" "}
            {floorTExp(start).toLocaleString("ko-KR")}, 높을수록 더). 쓰러져도
            깬 층만큼 받아요. {TOWER_FLOORS_PER_RUN}층 = 초월 판 1판.
          </li>
          <li>
            <b>칭호:</b> 10층 「야근 입문」 · 20층 「번아웃 생존자」 · 30층
            「야근이 일상」 · 50층 「퇴근을 잊은 자」 · 100층 「사무실이 집」,
            서버 최초·꼭대기 층 주인은 신화 칭호.
          </li>
          <li>
            <b>랭킹:</b> 이번 주 최고 층 1위는 다음 주 내내 「이번 주 최고층」.
            쓰러지면 끝(부활 쿠키 없음), Esc로 그만두면 그 층까지 기록돼요.
          </li>
        </ul>
      </section>
      <TranscendDay eg={eg} />
      <PioneerLine eg={eg} />
    </div>
  );
}

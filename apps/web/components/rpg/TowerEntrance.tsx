"use client";

import { useState } from "react";
import {
  CURSES,
  cursesAt,
  TOWER_CHECKPOINT_EVERY,
  towerFloorSec,
  towerHpMul,
  towerZone,
} from "@/lib/rpg/tower";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { mmss } from "./format";
import { PioneerLine } from "./Endgame";
import s from "./rpg.module.css";

// 11/15 야근 빌딩 입구 (마을의 야근 빌딩 → portal:open {kind:"tower"} → HuntLobby mode="tower"의 첫 탭).
// 엘리베이터 버튼판: 체크포인트 층(1·11·21 …)에 불이 들어와 있고, 위 숫자판에 최고 층·이번 주 최고 층. 고른 층의 저주·몬스터 배율, 오늘 상자, 오르는 이유.

/** 버튼판에 보이는 층 버튼 수 (불 꺼진 다음 체크포인트 몇 개까지 보여 준다) */
const DARK_AHEAD = 3;

/** 11/15 테스트용 강화를 켤 수 있는 빌드인가 (운영 배포는 늘 아니다 — 서버 superHunter도 운영에선 꺼져 있다) */
export const towerBoostAllowed = () => process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

export default function TowerEntrance({
  view,
  busy,
  onStart,
}: {
  view: RpgView;
  busy: boolean;
  onStart: (start: number, boost: boolean) => void;
}) {
  // 11/15 테스트 서버 슈퍼 계정: 무적·공격력 ×20 (기본 켬). 운영 서버(빌드)에서는 보이지도 않는다
  const canBoost = !!view.superHunter && towerBoostAllowed();
  const [boost, setBoost] = useState(true);
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
          몬스터는 한 층 오를 때마다 조금씩 세져요 (이 층은 처음보다 ×{towerHpMul(start).toFixed(2)}). 한 층에 {towerFloorSec(start)}초,
          5층마다 우두머리가 기다리고 잡으면 체력이 30% 차고 상자가 나와요.
        </p>
        <p className={s.meta}>
          저주:{" "}
          {curses.length
            ? curses.map((c) => `${c.name}(${c.desc})`).join(" · ")
            : "아직 없어요. 10층부터 하나씩 붙어요"}
        </p>
        <div className={s.zoneGo}>
          <span className={s.meta}>
            몇 번이든 다시 오를 수 있어요. 우두머리 상자는 하루 {t.chestsMax}개까지 (새벽 5시에 다시 차요)
          </span>
          <button
            type="button"
            className={cx(ui.button, ui.primary, s.start)}
            disabled={!canStart}
            onClick={() => onStart(start, canBoost && boost)}
          >
            {busy ? "엘리베이터 부르는 중…" : `▲ ${start}층부터 오르기`}
          </button>
        </div>
        {canBoost && (
          <label className={s.meta}>
            <input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} /> 테스트용 무적·공격력 ×20 (슈퍼 계정만 · 운영 서버엔 없음)
          </label>
        )}
        <ul className={s.towerWhy}>
          <li>
            올라간 층만큼 초월 경험치가 쌓여요. 높이 갈수록 한 층에 주는 양도 늘고, 쓰러져도 그때까지 오른 만큼은 챙겨 가요.
          </li>
          <li>
            10층, 20층, 30층, 50층, 100층마다 칭호가 기다려요. 서버에서 제일 먼저 오른 사람만 받는 칭호와, 지금 가장 높이 오른 사람이
            달고 있는 칭호도 있어요.
          </li>
          <li>이번 주에 가장 높이 오른 사람은 다음 한 주 동안 「이번 주 최고층」을 달아요.</li>
          {/* 11/15 능력 카드 */}
          <li>
            몬스터를 잡으면 판 레벨이 오르고, 오를 때마다 능력 카드를 한 장 골라요. 카드는 그 판에서만 쌓여요. 11층처럼 위에서 시작하면
            건너뛴 10층마다 카드 세 장을 먼저 챙겨 가요.
          </li>
          <li>쓰러지면 그 자리에서 끝이에요. 부활 쿠키는 안 통하고, 전설 카드 「무한 야근」만 한 번 일으켜 줘요. Esc로 나가면 그 층까지는 기록돼요.</li>
        </ul>
      </section>
      <PioneerLine eg={eg} />
    </div>
  );
}

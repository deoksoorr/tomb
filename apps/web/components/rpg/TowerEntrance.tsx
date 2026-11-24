"use client";

import { useState } from "react";
import {
  climbTime,
  CURSES,
  cursesAt,
  nextCheckpoint,
  TOWER_BOSS_EVERY,
  TOWER_CHEST_FROM,
  towerFloorSec,
  towerNoPointGain,
  towerPointFrom,
} from "@/lib/rpg/tower";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { useMe } from "@/lib/hooks/useMe";
import { equippedPerk } from "@/lib/titles";
import type { RpgView } from "@/lib/rpg/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { PioneerLine } from "./Endgame";
import { RunsHourLine } from "./Panels";
import ShakeToggle from "./ShakeToggle";
import { OddsLink } from "../odds/OddsLayer";
import s from "./rpg.module.css";

// 11/15 야근 빌딩 입구 (마을의 야근 빌딩 → portal:open {kind:"tower"} → HuntLobby mode="tower"의 첫 탭).
// 엘리베이터 버튼판: 체크포인트 층(1·51·101 …)에 불이 들어와 있고, 위 숫자판에 최고 층·이번 주 최고 층·오늘 연 상자.
// 11/24 운영자: 설명은 출발에 필요한 것만 (제한 시간·걸린 저주 이름·포인트 없는 층 경고·규칙 세 줄). 테마·배율·상자 내용물·칭호·카드는 사냥 안내서에서

/** 11/15 버튼판은 늘 100층대까지 전부 보여 준다 (1·11·…·101). 그 위로 오르면 지금 층에서 세 칸 더. 깬 곳까지 불이 들어온다(노란빛) */
const PANEL_TOP = 101;
const DARK_AHEAD = 3;

/** 11/15 테스트용 강화를 켤 수 있는 빌드인가 (운영 배포는 늘 아니다 — 서버 superHunter도 운영에선 꺼져 있다) */
export const towerBoostAllowed = () => process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";

export default function TowerEntrance({
  view,
  busy,
  onStart,
  onGuide,
}: {
  view: RpgView;
  busy: boolean;
  onStart: (start: number, boost: boolean) => void;
  /** 사냥 안내서 열기 */
  onGuide?: () => void;
}) {
  // 11/15 테스트 서버 슈퍼 계정: 무적·공격력 ×20 (기본 켬). 운영 서버(빌드)에서는 보이지도 않는다
  const canBoost = !!view.superHunter && towerBoostAllowed();
  const [boost, setBoost] = useState(true);
  // 터치 기기는 Esc 대신 [멈춤]에서 나간다
  const coarse = useMediaQuery("(pointer: coarse)");
  // 11/16 야근 빌딩 갈래 칭호: 층마다 제한 시간 + (판에서는 HuntScene이 같은 값을 더한다)
  const towerSec = equippedPerk(useMe().me?.equipped).towerSec;
  const eg = view.endgame!;
  const t = eg.tower;
  const lit = t.checkpoints;
  const top = lit[lit.length - 1];
  // 처음엔 내 기록으로 열린 가장 높은 층 (슈퍼 계정도 기록 기준 — 위층은 골라서)
  const [pick, setPick] = useState(
    () => lit.filter((f) => f <= t.best + 1).at(-1) ?? 1,
  );
  const start = lit.includes(pick) ? pick : top;
  // 11/19 엘리베이터 층이 고르지 않다 (1·51·101 뒤로 20층마다) — 켜진 층 다음으로 꺼진 층을 DARK_AHEAD개
  const buttons = [...lit];
  for (let f = nextCheckpoint(top), i = 0; i < DARK_AHEAD || f <= PANEL_TOP; f = nextCheckpoint(f), i++) buttons.push(f);
  const on = new Set(cursesAt(start));
  const curses = CURSES.filter((c) => on.has(c.id));
  const canStart = !busy && view.today.runsPerHour > 0;
  const tLv = view.character.tLevel;
  // 11/19 초월 레벨마다 적정 층: 그보다 낮은 층은 포인트 없음 (저층 쓸어 가기 막기 — 서버 정산 towerRunPoints와 같은 값)
  const pointFrom = towerPointFrom(tLv);
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
            {t.week && <span>{climbTime(t.week.ms)}</span>}
          </div>
          <div className={s.liftDisplay} aria-label="오늘 연 우두머리 상자">
            <span>오늘 연 상자</span>
            <b>{t.chestsMax > 0 ? `${t.chests}/${t.chestsMax}` : t.chests}</b>
          </div>
        </div>
        <h3 id="tower-lift" className={s.sectionTitle}>
          몇 층부터 오를까요?
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
          한 층 제한 시간은 {towerFloorSec(start) + towerSec}초예요{towerSec > 0 ? ` (칭호 덕분에 ${towerSec}초 더)` : ""}.
          {curses.length > 0 && ` ${curses.map((c) => `「${c.name}」`).join(", ")} 저주가 걸린 채 시작해요.`}
        </p>
        {start < pointFrom && (
          <p className={s.warn}>
            {start}층부터 {pointFrom - 1}층까지는 포인트 없이 {towerNoPointGain(start, pointFrom - 1)} 받아요. ★{50 + tLv}에서는 {pointFrom}층부터 포인트를 받아요.
          </p>
        )}
        <ul className={s.towerWhy}>
          <li>
            깬 층마다 초월 EXP와 포인트를 받고, 쓰러져도 깬 층만큼은 받아요.
          </li>
          <li>
            {TOWER_BOSS_EVERY}층마다 우두머리가 나오고, {TOWER_CHEST_FROM}층부터는 우두머리 층을 깨면 상자가 열려요. <OddsLink section="tower" label="확률 보기" />
          </li>
          <li>쓰러지면 바로 끝나고 부활 쿠키는 쓸 수 없어요. {coarse ? "멈춤 버튼으로" : "Esc로"} 나가도 그 층까지는 기록돼요.</li>
        </ul>
        <div className={s.zoneGo}>
          <RunsHourLine today={view.today} />
          {/* 11/17 사냥터 고르는 화면과 같은 설정 (이 기기에 기억 — 한쪽에서 끄면 둘 다 꺼져요) */}
          <ShakeToggle />
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
            <input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} /> 테스트용 무적, 공격력 ×20 (슈퍼 계정만, 운영 서버엔 없어요)
          </label>
        )}
        {onGuide && (
          <p className={s.meta}>
            자세한 규칙은{" "}
            <button type="button" className={s.linkBtn} onClick={onGuide}>
              사냥 안내서
            </button>
            에서 볼 수 있어요.
          </p>
        )}
      </section>
      <PioneerLine eg={eg} />
    </div>
  );
}

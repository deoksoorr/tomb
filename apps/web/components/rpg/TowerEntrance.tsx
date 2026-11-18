"use client";

import { useState } from "react";
import {
  climbTime,
  CURSES,
  cursesAt,
  TOWER_CHECKPOINT_EVERY,
  TOWER_CHEST_GEAR_CHANCE,
  towerFloorSec,
  towerHpMul,
  TOWER_THEMES,
} from "@/lib/rpg/tower";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { useMe } from "@/lib/hooks/useMe";
import { equippedPerk } from "@/lib/titles";
import type { RpgView } from "@/lib/rpg/types";
import { CHEST_COSMETIC_CHANCE, SG_PITY } from "@/lib/rpg/setGearRoll";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { PioneerLine } from "./Endgame";
import ShakeToggle from "./ShakeToggle";
import { OddsLink } from "../odds/OddsLayer";
import s from "./rpg.module.css";

// 11/15 야근 빌딩 입구 (마을의 야근 빌딩 → portal:open {kind:"tower"} → HuntLobby mode="tower"의 첫 탭).
// 엘리베이터 버튼판: 체크포인트 층(1·11·21 …)에 불이 들어와 있고, 위 숫자판에 최고 층·이번 주 최고 층. 고른 층의 저주·몬스터 배율, 오늘 상자, 오르는 이유.

/** 11/15 버튼판은 늘 100층대까지 전부 보여 준다 (1·11·…·101). 그 위로 오르면 지금 층에서 세 칸 더. 깬 곳까지 불이 들어온다(노란빛) */
const PANEL_TOP = 101;
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
  const last = Math.max(PANEL_TOP, top + DARK_AHEAD * TOWER_CHECKPOINT_EVERY);
  const buttons = [...lit];
  for (let f = top + TOWER_CHECKPOINT_EVERY; f <= last; f += TOWER_CHECKPOINT_EVERY) buttons.push(f);
  const on = new Set(cursesAt(start));
  const curses = CURSES.filter((c) => on.has(c.id));
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
            {t.week && <span>{climbTime(t.week.ms)}</span>}
          </div>
          <div className={s.liftDisplay} aria-label="오늘 연 우두머리 상자">
            <span>오늘 연 상자</span>
            <b>{t.chestsMax > 0 ? `${t.chests}/${t.chestsMax}` : t.chests}</b>
          </div>
        </div>
        <h3 id="tower-lift" className={s.sectionTitle}>
          몇 층부터 오를까요?{" "}
          <span className={s.meta}>
            10층 우두머리를 잡을 때마다 그다음 층 버튼에 불이 들어와요.
            {view.superHunter ? " 슈퍼 계정은 101층까지 열려요." : ""}
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
            {start}층부터
          </b>{" "}
          테마는 다섯 층마다 바뀌어요. {TOWER_THEMES.length}곳 중 어디가 나올지는 타 봐야 알아요.
          몬스터는 층이 오를수록 조금씩 세져요. 이 층은 1층보다 ×{towerHpMul(start).toFixed(2)}예요. 한 층은 {towerFloorSec(start) + towerSec}초예요{towerSec > 0 ? ` (칭호 덕분에 ${towerSec}초 더)` : ""}.
          5층마다 우두머리가 나와요. 잡으면 체력이 30% 차고 상자가 열려요.
        </p>
        <p className={s.meta}>
          {curses.length
            ? `붙는 저주 ${curses.map((c) => `「${c.name}」 ${c.desc}.`).join(" ")}`
            : "저주는 아직 없어요. 10층부터 하나씩 붙어요."}
        </p>
        <div className={s.zoneGo}>
          <span className={s.meta}>
            몇 번이든 다시 오를 수 있어요.
          </span>
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
        {/* 11/15 오르기 전에 무엇이 떨어지는지 */}
        <section className={s.towerDrops} aria-labelledby="tower-drops">
          <h4 id="tower-drops">우두머리 상자에서 나오는 것</h4>
          <p>5층마다 우두머리가 있어요. 우두머리 층을 다 깨면 상자가 열려요. 상자는 하루에 몇 개든 열 수 있어요.</p>
          <ul>
            <li>
              <b>물약 1~2개</b> 커피, 에너지드링크, 야근 도시락 중에서 늘 들어 있어요.
            </li>
            <li>
              <b>세트 장비</b> {Math.round(TOWER_CHEST_GEAR_CHANCE * 100)}% 확률이에요. {SG_PITY}번 내리 못 받으면 다음 상자엔 꼭 들어 있어요.
              높이 오를수록 직급이 올라요. 15층부터 대리급, 30층부터 과장급, 50층부터 임원급이에요.
              {(view.character.sgPity ?? 0) > 0 && <span className={s.meta}> 지금 {view.character.sgPity}번째 못 받았어요.</span>}
            </li>
            <li>
              <b>강화 재료</b> 결재 서류가 2장 들어 있고, 10층 오를 때마다 1장씩 늘어요. 25층부터는 인감 도장도 나와요.
              이번 주 기록이 10층, 20층처럼 새 10층을 넘으면 보호 문서를 받아요. 한 주에 2장까지예요.
            </li>
            <li>
              <b>꾸미기 이용권</b> {Math.round(CHEST_COSMETIC_CHANCE * 100)}% 확률이에요. 기간은 1일, 3일, 7일, 30일 중 하나예요. 15층부터는 희귀,
              30층부터는 전설도 나와요.
            </li>
          </ul>
          <p className={s.meta}>
            떨어진 물건은 다음 층으로 가기 전에 저절로 주워져요. <OddsLink section="tower" label="자세한 확률 보기" />
          </p>
        </section>
        <ul className={s.towerWhy}>
          <li>
            오른 층만큼 초월 경험치가 쌓여요. 높은 층일수록 더 많이 줘요. 쓰러져도 오른 만큼은 받아요.
          </li>
          <li>
            10층, 20층, 30층, 50층, 100층에 오르면 칭호를 받아요. 서버에서 가장 먼저 오른 사람만 받는 칭호도 있어요.
            지금 가장 높이 오른 사람이 다는 칭호도 있어요.
          </li>
          <li>이번 주에 가장 높이 오른 사람은 다음 한 주 동안 신화 칭호 「지난주 최고층」을 달아요.</li>
          {/* 11/15 능력 카드 */}
          <li>
            몬스터를 잡으면 판 레벨이 올라요. 오를 때마다 능력 카드를 한 장 골라요. 카드는 그 판에서만 써요.
            11층처럼 위에서 시작하면 건너뛴 10층마다 카드를 세 장씩 먼저 골라요.
          </li>
          <li>쓰러지면 그 자리에서 끝나요. 부활 쿠키는 못 써요. 전설 카드 「무한 야근」이 있으면 한 번 다시 일어나요. {coarse ? "멈춤 버튼으로" : "Esc로"} 나가도 그 층까지는 기록돼요.</li>
        </ul>
      </section>
      <PioneerLine eg={eg} />
    </div>
  );
}

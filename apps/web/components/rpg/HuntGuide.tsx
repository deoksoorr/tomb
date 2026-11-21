"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DIFFICULTIES,
  DIFFS,
  GEAR,
  HUNT_ZONES,
  MONSTERS,
  POTION_COOLDOWN_MS,
  POTIONS,
  BRANCH_INFO,
  BRANCHES,
  SKILL_FX,
  SKILLS,
  skillById,
  TIER_GATES,
  type IconArt,
  type MonsterId,
  type SkillId,
} from "@/lib/rpg/catalog";
import { SKILL_SLOTS } from "@/lib/rpg/hotbar";
import { DEFAULT_BOSS_PHASES, MIN_WINDUP_MS, PATTERNS, type TelegraphShape } from "@/lib/rpg/patterns";
import { HUNT_DROP_ROLLS, HUNT_LEVEL_SHARE, KILLS_PER_DROP_ROLL, MIN_RUN_MS } from "@/lib/rpg/rewards";
import { PIONEER_DAYS, PIONEER_FLOOR, tExpToNext,
  TRANSCEND_MAX,
} from "@/lib/rpg/endgame";
import {
  CURSES,
  floorTExp,
  TOWER_BOSS_EVERY,
  TOWER_BOSS_FLOOR_SEC,
  TOWER_BOSS_HEAL,
  TOWER_CHECKPOINT_EVERY,
  TOWER_CHEST_FROM,
  TOWER_CHEST_GEAR_CHANCE,
  TOWER_FLOOR_SEC,
  TOWER_STEEP_FROM,
  TOWER_THEMES,
  TOWER_WAVE_GAP_SEC,
  FLOORS_PER_THEME,
  towerFitFloor,
  towerFloorPointsText,
} from "@/lib/rpg/tower";
import { HUNT_POINT_T_STOP } from "@/lib/rpg/formulas";
import { monsterIdleCanvas } from "@/game/rpg/monsterArt";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { BUILDS, buildSteps } from "@/lib/rpg/builds";
import { SYNERGY, SYNERGY_GUARD } from "@/lib/rpg/skillTree";
import { ampNeed, exchangeNeed } from "@/lib/rpg/enhance";
import { enhMul, SG_ENH_MAX, SG_GRADE_MULT, SG_GRADE_NAMES, SHOP_ENH_MAX } from "@/lib/rpg/setGear";
import { SG_GRADE_FLOORS } from "@/lib/rpg/setGearRoll";
import { MAX_SLOW, MONSTER_STATUS, POTION_CURES, STATUS_DIFF, STATUS_IDS, STATUSES, statusFor, type StatusId } from "@/lib/rpg/status";
import { CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf } from "@/lib/rpg/weapons";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { DEMO_H, DEMO_SCALE, DEMO_SCENES, DEMO_W, drawDemo } from "./huntDemo";
import RpgIcon from "./RpgIcon";
import { OddsLink } from "../odds/OddsLayer";
// 11/15 야근 빌딩 능력 카드
import { cardIconUrl } from "@/game/rpg/cards/cardArt";
import { BOSS_DEAL_EVERY, BOSS_DEAL_HP_COST, CARD_IDS, FOCUS_ASPD, RETIRED_CARDS, START_PICKS_PER_10 } from "@/lib/rpg/cards";
import s from "./rpg.module.css";

/** 11/15 끝없는 회의실 층 (테마 표 두 번째 칸 — 10층마다) */

// 사냥 안내서: 사냥 로비·멈춤 창에서 연다. 짧은 페이지를 넘겨 본다 (←/→ 키도 된다).
// 숫자·이름은 catalog·patterns·weapons·rewards에서 읽는다 → 스킬·무기·패턴이 늘어도 안내가 따라간다.
// 쪽마다 위에 게임 그림으로 움직이는 짧은 반복 시연이 돈다 (huntDemo). 지금 보는 쪽 것만 돌고, 움직임 줄이기면 정지 그림.


/** 이 쪽의 반복 시연 캔버스 */
function HuntDemo({ page, title }: { page: number; title: string }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    if (reduced) {
      const still = () => drawDemo(ctx, page, 0, true);
      still();
      // 픽셀 글꼴이 늦게 오면 한 번 더 그린다
      void document.fonts?.ready.then(still);
      return;
    }
    // 시작 시각은 첫 프레임의 시각으로 잡는다. rAF 시각은 그 프레임이 시작된 때라서
    // effect 안에서 잰 performance.now()보다 앞설 수 있다(파이어폭스·사파리) → 경과가 음수가 되면
    // 쪽 3·4·6 시연이 배열을 -1로 읽고 멈춰, 그림이 떴다 안 떴다 했다
    let t0 = -1;
    let raf = 0;
    const loop = (now: number) => {
      if (t0 < 0) t0 = now;
      raf = requestAnimationFrame(loop);
      drawDemo(ctx, page, Math.max(0, now - t0), false);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [page, reduced]);
  return (
    <canvas
      ref={ref}
      width={DEMO_W * DEMO_SCALE}
      height={DEMO_H * DEMO_SCALE}
      className={s.guideDemo}
      role="img"
      aria-label={`${title} 시연 그림${reduced ? "" : " (반복 재생)"}`}
    />
  );
}

/** 11/19 상자 층 구간마다 세트 장비 직급 (「51~100층은 사원급, …」 — lib/rpg/setGearRoll SG_GRADE_FLOORS) */
function gradeBandText(): string {
  const starts = [TOWER_CHEST_FROM, ...SG_GRADE_FLOORS];
  const bands = starts.map((f, i) => (i < starts.length - 1 ? `${f}~${starts[i + 1] - 1}층은 ${SG_GRADE_NAMES[i]}` : `${f}층부터는 ${SG_GRADE_NAMES[i]}`));
  return `세트 장비 직급은 ${bands.join(", ")}이에요.`;
}

/** 비율 → 퍼센트 (13.5%처럼 소수 한 자리까지) */
const pct = (n: number) => `${Number((n * 100).toFixed(1))}%`;
const sec = (ms: number) => `${Number((ms / 1000).toFixed(2))}초`;
const skillArt = (id: SkillId): IconArt | undefined => skillById(id)?.art;
/** 기본보다 단계가 많은 우두머리 (11/15 지옥 40~50대: 분기 실적 보고서·인사위원장) */
const deepBosses = Object.values(MONSTERS).filter((m) => (m.phases?.length ?? 0) > DEFAULT_BOSS_PHASES.length);
const skillName = (id: SkillId) => skillById(id)?.name ?? id;

/** 바닥 빨간 경고 모양 그림 (원·줄·부채꼴·고리). 64×44 상자 안 가운데 기준 */
function Telegraph({ shape }: { shape: TelegraphShape["kind"] }) {
  const red = "#e0503c";
  const fill = "rgba(224, 80, 60, 0.32)";
  return (
    <svg viewBox="0 0 64 44" width={64} height={44} aria-hidden="true" className={s.guideShape}>
      {shape === "circle" && <ellipse cx={32} cy={24} rx={18} ry={12} fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "line" && <rect x={6} y={18} width={52} height={10} fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "cone" && <path d="M10 34 L56 12 A 30 30 0 0 1 56 40 Z" fill={fill} stroke={red} strokeWidth={1.5} />}
      {shape === "ring" && (
        <>
          <ellipse cx={32} cy={24} rx={26} ry={16} fill={fill} stroke={red} strokeWidth={1.5} />
          <ellipse cx={32} cy={24} rx={10} ry={6} fill="var(--bg-deep)" stroke={red} strokeWidth={1.5} />
        </>
      )}
      {/* 차오르는 안쪽 (경고가 다 차면 맞는다) */}
      {shape !== "ring" && <ellipse cx={shape === "cone" ? 44 : 32} cy={24} rx={6} ry={4} fill={red} opacity={0.75} />}
    </svg>
  );
}

const SHAPES: [TelegraphShape["kind"], string, string][] = [
  ["circle", "원", "그 자리에 떨어져요. 원 밖으로 피해요."],
  ["line", "줄", "줄을 따라 돌진하거나 쏴요. 옆으로 비켜요."],
  ["cone", "부채꼴", "몬스터 앞쪽을 쳐요. 뒤나 옆으로 돌아가요."],
  ["ring", "고리", "몬스터 둘레를 도넛 모양으로 쳐요. 오히려 바짝 붙으면 안전해요."],
];

/** 모양별 패턴 이름 (PATTERNS에서 읽는다) */
const patternsOf = (k: TelegraphShape["kind"]) =>
  Object.values(PATTERNS)
    .filter((p) => p.shape.kind === k)
    .map((p) => p.name)
    .join("·");

const keyedPotions = POTIONS.filter((p) => p.key);

/** 이 상태를 거는 몬스터 이름 (MONSTER_STATUS에서 읽는다) */
const statusMonsters = (id: StatusId) =>
  [...new Set(Object.entries(MONSTER_STATUS).filter(([, rules]) => rules?.some((r) => r.status === id)).map(([m]) => m))]
    .map((m) => MONSTERS[m as MonsterId].name)
    .slice(0, 3)
    .join(", ");
/** 이 상태를 푸는 포션 이름 */
const curers = (id: StatusId) =>
  POTIONS.filter((p) => POTION_CURES[p.id]?.includes(id))
    .map((p) => (p.key ? `${p.name}(${p.key})` : p.name))
    .join(", ");
const autoPotions = POTIONS.filter((p) => !p.key);

function Keys({ k }: { k: string[] }) {
  return (
    <span className={s.guideKeys}>
      {k.map((x) => (
        <kbd key={x}>{x}</kbd>
      ))}
    </span>
  );
}

/** 그림 + 제목 + 설명 한 줄 */
/** 능력 카드 그림 (안내서 그림 칸) */
function CardPic({ id }: { id: (typeof CARD_IDS)[number] }) {
  // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트
  return <img src={cardIconUrl(id, 2)} width={32} height={32} alt="" aria-hidden="true" style={{ imageRendering: "pixelated" }} />;
}

/** 11/15 몬스터 가만히 그림 한 장 (캔버스 → dataURL, 처음 한 번만) */
const monUrls = new Map<MonsterId, string>();
function MonPic({ id }: { id: MonsterId }) {
  let url = monUrls.get(id) ?? "";
  if (!url && typeof document !== "undefined") {
    url = monsterIdleCanvas(id).toDataURL("image/png");
    monUrls.set(id, url);
  }
  // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트
  return url ? <img src={url} width={32} height={32} alt="" aria-hidden="true" style={{ imageRendering: "pixelated", objectFit: "contain" }} /> : null;
}

/** 11/15 야근 빌딩 테마 한 장: 이름·분위기·기믹·다시 올 때 바뀌는 판·몬스터·정예·우두머리 */
function ThemeCard({ id }: { id: (typeof TOWER_THEMES)[number] }) {
  const z = HUNT_ZONES[id];
  const names = (ids: readonly MonsterId[]) => ids.map((m) => MONSTERS[m].name).join(", ");
  const boss = MONSTERS[z.boss];
  return (
    <Item pic={<MonPic id={z.boss} />} title={z.name}>
      {z.desc} 「{z.gimmick.name}」 기믹이 있어요. {z.gimmick.desc}
      {z.visits && z.visits.length > 1 ? ` 같은 판에서 다시 오면 ${z.visits.slice(1).map((v) => v.name).join(", ")} 차례로 바뀌어요.` : ""} {names(z.pool)} 등이 나와요.
      {z.elite ? ` 정예 「${MONSTERS[z.elite].name}」` : ""}
      {z.mid ? `, 중간 우두머리 「${MONSTERS[z.mid].name}」` : ""}
      {z.elite ? "," : ""} 우두머리 「{boss.name}」도 나와요. {boss.desc.replace(/^"[^"]*"\s*/, "")}
    </Item>
  );
}

function Item({ art, pic, title, children }: { art?: IconArt; pic?: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <li className={s.guideItem}>
      <span className={s.guidePic}>{pic ?? (art ? <RpgIcon art={art} size={32} /> : null)}</span>
      <div>
        <p className={s.rowName}>{title}</p>
        <p className={s.meta}>{children}</p>
      </div>
    </li>
  );
}

type Page = { title: string; lead: string; body: ReactNode };

function pages(): Page[] {
  const veil = SKILL_FX.so_veil(1);
  const stoke = SKILL_FX.em_stoke(1);
  const chain = SKILL_FX.so_chain(1);
  const lamp = SKILL_FX.so_lamp(1);
  const tomb = SKILL_FX.fr_tomb(1);
  const stunStyles = Object.values(WEAPON_STYLES)
    .filter((w) => w.stunMs > 0)
    .map((w) => w.name);
  const pushStyles = Object.values(WEAPON_STYLES)
    .filter((w) => w.kb > 1)
    .map((w) => w.name);
  return [
    {
      title: "이동과 공격",
      lead: "공격은 바라보는 쪽으로 나가요. 꾹 누르고 있으면 알아서 계속 때려요.",
      body: (
        <ul className={s.guideList}>
          <Item pic={<Keys k={["W", "A", "S", "D"]} />} title="이동">
            WASD나 방향키로 걸어요. 폰과 태블릿은 화면 왼쪽을 누른 채 끌면 그 자리에 조이스틱이 생겨요.
          </Item>
          <Item pic={<Keys k={["Space", "J"]} />} title="공격">
            한 번 누르면 한 번 때려요. 다음 공격을 미리 눌러 두면 때가 되자마자 나가요. 이때 발밑 게이지가 초록색이 돼요.
          </Item>
          <Item pic={<Keys k={["꾹"]} />} title="꾹 누르면 연속 공격">
            Space나 J, 마우스, 손가락을 누르고 있으면 계속 때려요. 마우스나 손가락은 누른 쪽으로 때려요.
          </Item>
          <Item art={GEAR.find((g) => g.kind === "weapon")?.art} title={`${FINISHER_EVERY}번째 공격은 마무리 일격`}>
            쉬지 않고 이어 치면 연속 공격으로 세요. 공격 간격보다 {sec(CHAIN_GRACE_MS)} 넘게 쉬면 처음부터 다시 세요. {FINISHER_EVERY}번째 공격은 더 넓고 세게 나가요.
          </Item>
          <Item pic={<span className={s.guideGauge} />} title="발밑 게이지">
            다음 공격까지 남은 시간이에요. 게이지가 다 차서 반짝이면 다시 칠 수 있어요.
          </Item>
          <Item pic={<Keys k={["Esc"]} />} title="멈춤">
            게임 시간이 멈춰요. 멈춤 창에서도 이 안내서를 볼 수 있어요.
          </Item>
        </ul>
      ),
    },
    {
      title: "스킬과 포션",
      lead: `스킬은 스킬 탭에서 배워요. 쓰는 스킬은 1~${SKILL_SLOTS} 칸에, 궁극기는 F 칸에 놓아야 써요.`,
      body: (
        <>
          <div className={s.guideIcons} aria-hidden="true">
            {BRANCHES.flatMap((b) => SKILLS.filter((sk) => sk.branch === b && (sk.tier === 1 || sk.tier === 5) && sk.kind === "active")).map((sk, i, all) => (
              <span key={sk.id} className={s.guideHot}>
                <RpgIcon art={sk.art} size={32} />
                <span>{sk.tier === 5 ? "F" : all.slice(0, i + 1).filter((x) => x.tier !== 5).length}</span>
              </span>
            ))}
          </div>
          <ul className={s.guideList}>
            {BRANCHES.map((b) => (
              <Item key={b} art={SKILLS.find((sk) => sk.branch === b && sk.tier === 5 && sk.kind === "active")?.art} title={`${BRANCH_INFO[b].name} (${BRANCH_INFO[b].role})`}>
                {BRANCH_INFO[b].desc} 궁극기 「{SKILLS.filter((sk) => sk.branch === b && sk.tier === 5 && sk.kind === "active").map((sk) => sk.name).join(", ")}」도 있어요.
              </Item>
            ))}
            <Item pic={<Keys k={["1단", "…", "5단"]} />} title="단과 선행 스킬">
              갈래마다 1단부터 5단까지 있어요. 그 갈래에 포인트를 {TIER_GATES.slice(1).join(", ")}개 쓰면 2단부터 5단까지 차례로 열려요. 선으로 이어진 스킬은 앞 스킬을 정해진 랭크까지 찍어야 배울 수 있어요.
            </Item>
            <Item pic={<span className={s.guideSp}>+1</span>} title="스킬 포인트">
              레벨이 오를 때마다 1포인트를 받아요. 10, 20, 30처럼 10의 배수 레벨에선 2포인트예요. 초월 레벨이 오를 때마다 1포인트를 더 받아요. 랭크 하나에 1포인트예요. 공격·소환·제어 스킬은 12랭크(궁극기 5랭크)까지 올라가지만 예전 최대 랭크를 넘으면 랭크당 효과가 절반이라, 여러 스킬에 나눠 찍는 게 좋아요. 버프와 패시브는 최대 랭크가 그대로예요. 둥근 칸은 패시브예요. 찍어 두면 늘 켜져 있어요.
            </Item>
            <Item pic={<Keys k={["마공", "물공"]} />} title="마공과 물공">
              모닥불, 서리, 넋 스킬은 마공이에요. 지능을 받아 세지고, 모닥불의 공격력·치명타 패시브도 마공에만 붙어요. 삽자루 일꾼 스킬과 기본 공격은 물공이에요. 지능을 받지 않고, 기본 공격처럼 빗나갈 수 있어서 덱스가 중요해요. 삽자루는 INT 없이 STR로 키워요. STR 1당 일꾼 스킬이 0.5% 세지고, 등짐 단련을 배우면 STR만큼 일꾼 스킬 SP가 덜 들고(최대 50%) 쿨타임이 짧아져요(최대 15%). 삽날 회오리는 정해진 시간만큼 돌고 잠깐 쉬어요.
            </Item>
            <Item pic={<Keys k={["★"]} />} title="초월 수련">
              초월 레벨이 오를 때마다 수련 포인트를 1개 받아요. 스킬 탭의 [초월 수련]에서 물공 쪽 「손끝 단련」, 마공 쪽 「주문 다듬기」, 공통 칸에 나눠 찍어요. 줄은 ★55, ★60, ★70, ★80, ★90에 열리고, 되돌리기는 무료예요.
            </Item>
            <Item pic={<Keys k={["↺"]} />} title="초기화">
              스킬 탭에서 [초기화]를 누르면 찍은 포인트를 모두 돌려받아요. 비용은 레벨에 따라 {respecCost(1)}~{RESPEC_MAX_COST}P예요.
              <br />
              <small>스킬 트리가 바뀌는 업데이트 때는 모두의 스킬이 초기화돼요. 포인트는 전부 돌려받아요.</small>
            </Item>
            <Item pic={<Keys k={["↺"]} />} title="능력치 초기화">
              캐릭터 탭에서 [능력치 초기화]를 누르면 나눠 준 능력치 포인트를 모두 돌려받아요. 비용은 스킬 초기화와 같아요. 장비로 오른 능력치는 그대로예요.
            </Item>
            <Item art={skillById("em_meteor")?.art} title="광역기">
              바닥에 마법진이 먼저 깔린 다음 터져요. 마법진 색은 갈래마다 달라요. 화면 흔들림은 사냥터 고르는 화면의 &lsquo;화면 흔들림 효과&rsquo;에서 끌 수 있어요. 기기에서 &lsquo;동작 줄이기&rsquo;를 켜면 흔들림과 번쩍임이 모두 꺼져요.
            </Item>
            <Item pic={<Keys k={["1", "…", String(SKILL_SLOTS), "F"]} />} title="단축 칸에 놓기">
              스킬 탭 맨 아래 단축 줄에 배운 스킬을 끌어다 놓아요. 손가락으로도 돼요. 스킬을 고른 다음 칸이나 숫자 키 1~{SKILL_SLOTS}를 눌러도 돼요. 궁극기는 F 칸에만, 다른 스킬은 1~{SKILL_SLOTS} 칸에만 들어가요. 칸끼리 끌면 자리가 바뀌고, 줄 밖으로 끌어내면 빠져요. 처음 배운 스킬은 빈 칸에 저절로 들어가요.
            </Item>
            <Item pic={<Keys k={["1", "…", String(SKILL_SLOTS), "F"]} />} title="스킬 쓰기">
              숫자 키 1~{SKILL_SLOTS}를 누르거나 화면 아래 스킬 버튼을 눌러요. 궁극기는 F예요. 패시브는 칸에 놓지 않아도 늘 켜져 있어요. 걸으면서 써도 공격과 스킬은 겨냥한 적 쪽으로 나가요. 그래서 물러나면서 칠 수 있어요.
            </Item>
            <Item pic={<Keys k={["Shift", "1~" + SKILL_SLOTS]} />} title="스킬 자동">
              판을 시작하면 자동이 되는 스킬은 전부 자동으로 켜져요. 사냥 중에 스킬 칸을 오른쪽 클릭하거나 Shift+숫자를 누르면 그 칸만 끄고 켜요. 폰은 스킬 칸을 길게 누르면 돼요. 바꾼 것은 그 판 동안만 가요. 자동 칸은 PC는 테두리가 초록색으로 돌고, 폰은 칸 구석에 초록 점이 떠요. 자동 스킬은 쓰기 좋은 때를 기다렸다가 써요. 예를 들어 광역 스킬은 적이 3마리 넘게 모이면 써요. X를 누르면 자동을 전부 한 번에 끄고 켜요. 폰은 스킬 칸 옆 [자동 켜짐] 단추를 눌러요. 궁극기와 이동 스킬은 자동이 안 돼요. 스킬 탭의 &lsquo;궁극기 SP 남겨 두기&rsquo;가 켜져 있으면 자동 스킬이 궁극기 쓸 SP를 남겨 둬요.
            </Item>
            <Item pic={<Keys k={["H"]} />} title="키 안내">
              사냥 중 H를 누르면 사냥 키가 화면에 떠요. 한 번 더 누르면 숨어요.
            </Item>
            <Item pic={<span className={s.guideSp}>SP</span>} title="SP">
              스킬을 쓰면 SP가 들어요. SP가 모자란 칸은 어두워지고 필요한 SP가 떠요. INT를 올리면 최대 SP가 늘고 모닥불, 서리, 넋 스킬이 세져요. 삽자루 일꾼 스킬은 INT를 받지 않아요. 대신 등짐 단련을 배우면 STR만큼 SP가 덜 들어요. SP는 에너지드링크로 채워요.
            </Item>
            <Item pic={<span className={s.guideCool} />} title="쿨타임">
              스킬을 쓰면 아이콘을 덮은 그림자가 시계 방향으로 걷혀요. 다 걷히기 전엔 다시 못 써요. 쿨타임은 스킬마다 다르고, 스킬 탭에서 볼 수 있어요.
            </Item>
            <Item art={keyedPotions[0]?.art} title={`포션 ${keyedPotions.map((p) => p.key).join("/")}`}>
              {keyedPotions.map((p) => `${p.key} ${p.name}. ${p.desc}.`).join(" ")} 한 번 먹으면 {sec(POTION_COOLDOWN_MS)} 뒤에 또 먹을 수 있어요.
            </Item>
            {autoPotions.map((p) => (
              <Item key={p.id} art={p.art} title={`${p.name} (자동)`}>
                {p.desc}
              </Item>
            ))}
          </ul>
        </>
      ),
    },
    {
      title: "무기별 공격 방식",
      lead: "어떤 무기를 끼느냐에 따라 공격 모양이 달라요. 무기마다 공격 방식은 장비 탭과 상점에서 볼 수 있어요.",
      body: (
        <ul className={cx(s.guideList, s.guideGrid)}>
          {Object.values(WEAPON_STYLES).map((w) => (
            <Item key={w.id} art={GEAR.find((g) => g.kind === "weapon" && weaponStyleOf(g).id === w.id)?.art} title={w.name}>
              {w.desc}
            </Item>
          ))}
        </ul>
      ),
    },
    {
      title: "몬스터 패턴",
      lead: "몬스터는 치기 전에 바닥에 빨간 경고를 깔아요. 안쪽이 다 차면 맞으니까 그 전에 빠져나와요.",
      body: (
        <>
          <ul className={cx(s.guideList, s.guideGrid)}>
            {SHAPES.map(([k, name, how]) => (
              <Item key={k} pic={<Telegraph shape={k} />} title={name}>
                {how}
                {patternsOf(k) && ` (${patternsOf(k)})`}
              </Item>
            ))}
          </ul>
          <p className={s.meta}>
            어려운 사냥터일수록 경고가 짧아지고 많아져요. 그래도 경고는 적어도 {sec(MIN_WINDUP_MS)}는 보여요. 맞은 직후에는 아주 잠깐 무적이에요.
          </p>
        </>
      ),
    },
    {
      title: "우두머리",
      lead: "마지막 웨이브에 우두머리가 나와요. HP가 줄수록 단계가 올라가며 패턴이 늘어요.",
      body: (
        <>
          <ol className={s.guidePhases}>
            <li>
              <b>처음</b>
              <span className={s.meta}>물기, 부채 사격, 내려찍기 같은 기본 패턴</span>
            </li>
            {DEFAULT_BOSS_PHASES.map((ph) => (
              <li key={ph.below}>
                <b>
                  HP {pct(ph.below)} 아래 · {ph.label}
                </b>
                <span className={s.meta}>
                  {ph.add.map((id) => PATTERNS[id].name).join(", ")} 패턴이 더해져요. 패턴 간격이 {pct(1 - ph.haste)} 짧아져요.
                </span>
              </li>
            ))}
          </ol>
          <ul className={s.guideList}>
            <Item art={skillArt("so_friend")} title="졸개 부르기">
              단계가 오를 때마다 졸개 무리를 불러요. 지형 기믹도 더 거세져요. 우두머리 둘레에는 붉은 기운이 돌아요.
            </Item>
            <Item art={skillArt("fr_tomb")} title="잘 안 밀려요">
              우두머리는 거의 밀리지도 멈추지도 않아요. 지형 때문에 느려지지도 않아요. 묶기와 끌어당기기는 1/3만 통해요. 경고를 보고 피하는 게 가장 중요해요.
            </Item>
            {deepBosses.length > 0 && (
              <Item art={skillArt("em_spark")} title="한 번 더 폭주하는 우두머리">
                {deepBosses.map((b) => {
                  const ph = b.phases!.at(-1)!;
                  return `${b.name}(HP ${pct(ph.below)} 아래, ${ph.add.map((id) => PATTERNS[id].name).join(", ")})`;
                }).join(", ")}
                는 마지막에 단계가 한 번 더 올라요. 그러면 패턴이 더 자주 와요. 졸개는 두 번까지만 불러요.
              </Item>
            )}
          </ul>
        </>
      ),
    },
    {
      title: "상태 이상",
      lead: "화면 위에 지금 걸린 효과와 남은 시간이 떠요. 몬스터가 거는 나쁜 상태는 HP 막대 아래와 머리 옆에 아이콘으로 보여요.",
      body: (
        <>
          <ul className={cx(s.guideList, s.guideGrid)}>
            <Item art={skillArt("so_veil")} title="무적">
              몸이 깜빡이는 동안은 어떤 피해도 안 받아요. {skillName("so_veil")}({sec(veil.safeMs)}~), {skillName("fr_mist")}, 부활 쿠키(2초)로 무적이 돼요.
            </Item>
            <Item art={skillArt("so_swift")} title="빨라짐과 공격력 업">
              {skillName("so_swift")} 스킬은 이동 속도와 공격 속도를 잠깐 올려요. {skillName("em_stoke")} 스킬은 마공 피해를 잠깐 올려요(기본 공격과 일꾼 스킬은 안 올라요). 1랭크에 +{pct(stoke.atk)}예요.
            </Item>
            <Item art={skillArt("so_friend")} title="도우미">
              {skillName("so_friend")} 스킬을 쓰면 넋이 곁에서 같이 때려요. {skillName("so_lantern")} 스킬은 놓은 자리에서 넋불을 쏴요.
            </Item>
            <Item art={skillArt("fr_ward")} title="보호막">
              {skillName("fr_ward")} 스킬을 쓰면 얼음 방패가 피해를 먼저 막아 줘요.
            </Item>
            <Item art={skillArt("so_lamp")} title="멈춰 섬">
              {skillName("so_lamp")} 스킬을 쓰면 {sec(lamp.rootMs)} 동안 움직이지도 공격하지도 못해요.
            </Item>
            <Item art={skillArt("so_chain")} title="몬스터 약화와 묶기">
              {skillName("so_chain")}, {skillName("fr_tomb")} 스킬에 걸린 적은 {sec(chain.stunMs)}~{sec(tomb.stunMs)} 동안 묶여요. 묶인 적은 피해를 더 받아요. 서리 스킬은 적을 느리게 해요.
            </Item>
            <Item art={skillArt("em_kindle")} title="몬스터 경직과 넉백">
              맞은 몬스터는 잠깐 밀려나고 멈춰요. 치명타를 맞으면 더 오래 멈춰요.
              {stunStyles.length > 0 && ` ${stunStyles.join(", ")} 무기는 더 오래 멈추게 해요.`}
              {pushStyles.length > 0 && ` ${pushStyles.join(", ")} 무기는 멀리 밀쳐요.`}
            </Item>
            <Item pic={<span className={s.guideMud} />} title="지형">
              늪과 덩굴에선 느려져요. 컨베이어와 바람은 몸을 밀어요. 웅덩이는 미끄러워요. 사냥터마다 기믹이 설명에 적혀 있어요.
            </Item>
          </ul>
          <h4 className={s.guideSub}>몬스터가 거는 상태 이상</h4>
          <ul className={cx(s.guideList, s.guideGrid)}>
            {STATUS_IDS.map((id) => {
              const st = STATUSES[id];
              const f = statusFor(id, "normal");
              const who = statusMonsters(id);
              return (
                <Item key={id} art={st.art} title={`${st.name} (${sec(f.durMs)})`}>
                  {st.desc}
                  {id === "slow" && ` 이동 속도가 ${pct(st.slow ?? 0)} 줄어요.`}
                  {st.dotPct && ` 1초마다 최대 HP의 ${pct(st.dotPct)}가 깎여요.`}
                  {who && ` ${who} 등이 걸어요.`}
                  <br />
                  <small>{curers(id) ? `${curers(id)}을 먹으면 풀려요.` : "시간이 지나면 풀려요."}</small>
                </Item>
              );
            })}
          </ul>
          <p className={s.meta}>
            몇몇 몬스터의 공격이나 우두머리의 큰 기술에 맞으면 가끔 걸려요. 같은 상태에 또 걸리면 남은 시간만 다시 채워져요. 풀린 직후엔 잠깐 같은 상태에 안 걸려요.
            지속 피해로는 쓰러지지 않고 HP 1에서 멈춰요. 어려운 사냥터일수록 더 자주, 더 오래, 더 세게 걸려요. 지옥에선 세기가 ×
            {STATUS_DIFF.hell.power}이고, 둔화는 최대 -{pct(MAX_SLOW)}까지예요. 무적일 땐 안 걸리고, 부활 쿠키로 일어나면 모두 풀려요.
          </p>
        </>
      ),
    },
    {
      title: "드롭과 보상",
      lead: `판이 끝나면 잡은 만큼 EXP를, 나아간 만큼 포인트를 받아요. 레벨에 맞는 사냥터를 다 깨면 다음 레벨까지 필요한 EXP의 ${Math.round(HUNT_LEVEL_SHARE * 100)}%를 받아요.`,
      body: (
        <>
          <ul className={s.guideList}>
            <Item art={GEAR.find((g) => g.kind === "acc")?.art} title="드롭">
              {KILLS_PER_DROP_ROLL}마리 잡을 때마다 장비나 물약이 나올 기회가 한 번 생겨요. 한 판에 {HUNT_DROP_ROLLS}번까지예요. 우두머리를 잡으면 장비가
              나올 기회가 한 번 더 있어요.
              <br />
              <small>쓰러지지 않고 다 깨면 아주 가끔 하루짜리 코디가 꾸미기 가방에 들어와요.</small>
            </Item>
            <Item art={POTIONS[0]?.art} title="잘 나오는 것">
              사냥터마다 잘 나오는 장비가 있어요. 사냥터 설명에서 볼 수 있어요. 싼 장비일수록 자주 나와요. 가방이 가득 차면 못 주워요.
            </Item>
            <Item art={skillArt("so_lamp")} title="쓰러지면">
              포인트는 절반만 받고 EXP도 조금 깎여요. 권장 레벨보다 낮으면 조심해요.
            </Item>
            <Item art={skillArt("em_spark")} title="포인트">
              사냥 포인트는 하루 한도 없이 받아요. 다만 내 레벨이 사냥터가 열리는 레벨보다 10 넘게 높으면 그 사냥터에서는 포인트를 받지 않아요. ★{50 + HUNT_POINT_T_STOP}부터는 어느 일반 사냥터에서도 포인트를 받지 않고, 랭킹과 레이스에도 들어가지 않아요. 포인트와 레이스는 야근 빌딩에서 이어 가요. 주운 장비와 물약을 판 값도 사냥 포인트예요. 주운 장비는 상점 값의 25%, 물약은 50%를 받아요. 상점에서 산 장비는 언제든 50%를 돌려받아요. {sec(MIN_RUN_MS)}도 안 된 판은 보상이 없어요.
            </Item>
          </ul>
          <table className={s.guideTable}>
            <thead>
              <tr>
                <th>난이도</th>
                {DIFFICULTIES.map((d) => (
                  <th key={d}>{DIFFS[d].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{KILLS_PER_DROP_ROLL}마리마다 장비나 물약</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{pct(DIFFS[d].dropChance)}</td>
                ))}
              </tr>
              <tr>
                <th>우두머리 장비</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{pct(DIFFS[d].bossDropChance)}</td>
                ))}
              </tr>
              <tr>
                <th>장비 레벨</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>~{DIFFS[d].dropMaxLevel}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className={s.meta}>
            꾸미기와 물약 종류까지 자세한 확률은 <OddsLink section="hunt" />에서 볼 수 있어요.
          </p>
        </>
      ),
    },
    {
      // 11/15 사냥 끝판 (lib/rpg/endgame · 야근 빌딩 lib/rpg/tower)
      title: "레벨 50 이후",
      lead: "레벨 50이 되면 초월 레벨 ★51~★100을 올리고 마을의 야근 빌딩에 도전해요. 여기선 포인트보다 기록과 칭호가 보상이에요.",
      body: (
        <>
          <ul className={s.guideList}>
            <Item art={skillArt("em_spark")} title="초월 레벨 ★51~★100">
              레벨 50부터는 지옥 사냥터와 야근 빌딩에서 얻은 EXP가 초월 EXP로 쌓여요. 다른 난이도와 미니게임 EXP는 쌓이지 않아요. 필요한 초월 EXP는 ★51까지 {tExpToNext(0).toLocaleString("ko-KR")}, ★100 바로 앞은 약{" "}
              {Math.round(tExpToNext(TRANSCEND_MAX - 1) / 10_000)}만이에요. 초월 레벨이 오를 때마다 능력치 포인트, 스킬 포인트, 초월 수련 포인트를 1개씩 받아요. 회식 3차와 축제장은 레벨 50부터 EXP가 10%만 나와요.
              분기 마감이나 구조조정에서 사냥하는 게 좋아요. 레벨 랭킹은 레벨 순서예요. 레벨이 같으면 초월 레벨, 그다음엔 초월 EXP로 정해요.
            </Item>
            <Item art={skillArt("so_lamp")} title="야근 빌딩">
              마을 북쪽 판교의 등대 왼쪽에 있는 높은 건물이에요. 사냥 레벨 50부터 들어가요. 1층부터 쓰러질 때까지 쭉쭉 올라가는 레이스예요. 한 층은 방 하나이고{" "}
              {TOWER_FLOOR_SEC}초 안에 깨야 해요. 첫 무리를 다 잡으면 {TOWER_WAVE_GAP_SEC}초 뒤 다음 무리가 와요. {TOWER_BOSS_EVERY}층마다 우두머리 층이 있어요. 우두머리 층은{" "}
              {TOWER_BOSS_FLOOR_SEC}초이고, 깨면 체력이 {Math.round(TOWER_BOSS_HEAL * 100)}% 차요. 체력, SP, 버프는 다음 층까지 이어져요. {TOWER_STEEP_FROM}층까지는 몬스터가 약한 편이라 금방 올라가고, {TOWER_STEEP_FROM}층부터는
              빠르게 세져요. 높은 층은 장비와 카드를 연구해야 해요. 층을 깨면 엘리베이터를 타고 다음 층으로 가요. 층 표시가 붉게 깜빡이면 우두머리 층이에요. 쓰러지면 끝이고 부활
              쿠키는 못 써요. Esc로 그만두면 그 층까지 기록돼요. 몇 번이든 다시 도전할 수 있어요.
            </Item>
            {/* 11/15 테마는 판마다 무작위 (lib/rpg/tower towerBlock) */}
            <Item art={skillArt("em_spark")} title="층마다 바뀌는 테마">
              테마는 {FLOORS_PER_THEME}층마다 바뀌고, 순서는 판마다 달라요. 한 판에서는 아직 안 나온 테마가 먼저 나와요. 그래서 {TOWER_THEMES.length * FLOORS_PER_THEME}층까지 오르면{" "}
              {TOWER_THEMES.length}곳을 모두 만나요. 그다음부터는 방금 나온 곳만 빼고 아무 데나 나와요. 처음 간 테마에서는 층마다 새 몬스터가 한두 종씩 늘어요. 같은
              판에서 다시 가면 분위기와 몬스터가 바뀌어요. 테마의 마지막 층에는 그 테마의 우두머리가 기다려요.
            </Item>
            {/* 11/15 능력 카드 · 상사의 제안 · 멈추면 집중 (lib/rpg/cards) */}
            <Item pic={<CardPic id="boards" />} title="능력 카드">
              몬스터를 잡으면 판 레벨 막대가 차요. 판 레벨이 오를 때마다 게임이 잠깐 멈추고, 카드 세 장 중 하나를 골라요. 카드는 모두 {CARD_IDS.length - RETIRED_CARDS.size}장이에요. 카드 이름 옆 꼬리표가 공통, 물공(기본 공격·일꾼 스킬), 마공(모닥불·서리·넋 스킬)이에요. 불·얼음·독·번개처럼 때린 적에게 붙는 카드는 기본 공격에도 스킬에도 붙고, 광역 스킬은 맞은 적마다 3번에 1번꼴로 붙어요. 고른 카드는
              그 판에서만 쓰고, 판이 끝나면 사라져요. 같은 카드를 또 고르면 더 세져요. 쏘는 무기는 한 발 더 날아가고, 휘두르는 무기는 다른 방향으로도 같이 휘둘러요.
              마음에 드는 카드가 없으면 다시 뽑아요. 다시 뽑기는 판마다 한 번 있고, 10층을 깰 때마다 한 번씩 늘어요. 카드 등급은 일반, 매직, 레어, 유니크, 전설 다섯 가지예요.
              1층에선 전설이 백 장에 한 장꼴이에요. 높이 오르거나 다시 뽑을수록 좋은 등급이 잘 나와요. 지금 능력치는 왼쪽 위 능력치 판에서 봐요. C를 누르면 열고 닫혀요.{" "}
              51층이나 101층처럼 위에서 시작하면 건너뛴 10층마다 카드를 {START_PICKS_PER_10}장씩 먼저 골라요.
            </Item>
            <Item pic={<CardPic id="oneshot" />} title="상사의 제안과 멈추면 집중">
              {BOSS_DEAL_EVERY}층마다 우두머리를 잡으면 상사가 제안을 해요. 최대 체력을 {Math.round(BOSS_DEAL_HP_COST * 100)}% 내주면 레어 이상 카드를 한 장 받아요. 거절하면 체력을 가득
              채워 줘요. 가만히 서서 때리면 공격 속도가 {Math.round(FOCUS_ASPD * 100)}% 빨라져요. 피할 땐 움직이고, 때릴 땐 멈춰 서요.
            </Item>
            {/* 11/15 세트 장비·강화 */}
            <Item art={{ shape: "sg:003", main: 0, accent: 0 }} title="세트 장비와 강화">
              세트 장비는 야근 빌딩 상자에서만 나와요. 세트는 야근, 결재, 회의, 출장 네 가지이고, 세트마다 부위가 다섯 개예요. 높은 층일수록 사원급에서 임원급까지 좋은 직급이 나와요. 기본 능력치는 {SG_GRADE_NAMES[0]}을 1로 치면 {SG_GRADE_NAMES.slice(1).map((n, i) => `${n} ${SG_GRADE_MULT[i + 1]}배`).join(", ")}예요.
              같은 세트를 두 개나 네 개 끼면 세트 효과가 붙어요. 장비 탭에서 강화하면 기본 능력치가 올라요. +5면 {enhMul(5)}배, +10이면 {enhMul(10)}배, +{SG_ENH_MAX}면 {enhMul(SG_ENH_MAX)}배예요. 세트 장비는 +{SG_ENH_MAX}, 상점 장비는 +{SHOP_ENH_MAX}까지 올릴 수 있어요.
              실패해도 단계는 그대로이고, 같은 단계에서 여러 번 실패하면 다음 강화는 반드시 성공해요. 강화 증폭권을 쓰면 성공 확률이 두 배가 돼요. +4부터 쓸 수 있고 +{SG_ENH_MAX}에는 {ampNeed(SG_ENH_MAX)}장이 들어요. 안 쓰는 세트 장비는 분해해서 재료로 바꿔요. 같은 직급 {exchangeNeed(1)}개(무기는 {exchangeNeed(0)}개)를 원하는 부위 하나로
              바꿀 수도 있어요. 강화한 장비는 같은 부위의 더 높은 직급 세트 장비에 강화를 물려줄 수 있어요(승계). 직급 차이가 클수록 받는 단계는 줄고, 물려준 장비는 사라져요.
            </Item>
            <Item art={POTIONS[0]?.art} title="야근 빌딩 보상">
              깬 층마다 초월 경험치를 받아요. 1층은 {floorTExp(1)}, 30층은 {floorTExp(30)}, 100층은 {floorTExp(100)}만큼 받아요. {TOWER_STEEP_FROM + 1}층부터는 확 늘어서 {TOWER_STEEP_FROM + 1}층은{" "}
              {floorTExp(TOWER_STEEP_FROM + 1)}이에요. 쓰러져도 깬 층만큼은 받아요.
              {TOWER_CHEST_FROM}층부터는 우두머리 층을 깨면 우두머리 상자가 열려요. 물약과 강화 재료는 늘 들어 있어요. 세트 장비는 {Math.round(TOWER_CHEST_GEAR_CHANCE * 100)}% 확률로 나와요.
              {gradeBandText()} 꾸미기 이용권도 가끔 나와요.
              깬 층마다 포인트도 조금 받아요({towerFloorPointsText()}). 초월 레벨마다 적정 층이 있어서(★{50 + 30}이면 {towerFitFloor(30)}층) 그보다 10층 넘게 낮은 층은 포인트 없이 초월 경험치와 상자만 받아요. 잡은 몬스터 수는 주간 사냥 레이스에 들어가요. 50층 우두머리를 잡으면 다음부터 51층에서, 100층을 깨면 101층에서 바로 시작할 수 있어요. 그 위로는{" "}
              {TOWER_CHECKPOINT_EVERY}층마다(121층, 141층 …) 엘리베이터가 켜져요.
            </Item>
            <Item art={GEAR.find((g) => g.kind === "acc")?.art} title="칭호와 랭킹">
              층 칭호는 10층 「야근 입문」, 20층 「번아웃 생존자」, 30층 「야근이 일상」, 50층 「퇴근을 잊은 자」, 100층 「사무실이 집」이에요. 서버에서 한 사람만 받는 신화 칭호도 있어요.
              30층에 처음 오르면 「최초 결재자」, 50층은 「최초 임원」, 100층은 「빌딩의 전설」, ★100에 처음 닿으면 「첫 번째 상무」예요. 이런 서버 최초 칭호는 운영자가 확인한 뒤에 드려요. 지금 가장 높은 층 기록을 가진 사람은 「최고층 기록 보유자」를 달아요.
              기록을 뺏기면 칭호도 넘어가요. 지난주 가장 높이 오른 사람은 한 주 동안 신화 칭호 「지난주 최고층」을 달아요. 랭킹 창 [야근 빌딩]은 높은 층 순서예요. 층이 같으면 먼저 오른 사람이 앞이에요.
              끝판이 열리고 {PIONEER_DAYS}일 안에 ★51에 닿거나 {PIONEER_FLOOR}층을 넘으면 「개척자 #번호」를 받아요. 운영자는 랭킹, 최초 칭호, 개척자 번호에서 빠져요.
            </Item>
          </ul>
          {/* 11/15 테마 카드 (테마 모음 TOWER_THEMES를 그대로 — 새 테마가 생기면 저절로 한 장 더) */}
          <ul className={s.guideList}>
            {TOWER_THEMES.map((id) => (
              <ThemeCard key={id} id={id} />
            ))}
          </ul>
          <table className={s.guideTable}>
            <thead>
              <tr>
                <th>층</th>
                <th>저주 (계속 쌓여요)</th>
              </tr>
            </thead>
            <tbody>
              {CURSES.map((c) => (
                <tr key={c.id}>
                  <th>{c.from}~</th>
                  <td>
                    {c.name} — {c.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    },
    {
      // 11/19 대표 빌드 8종 (lib/rpg/builds): 핵심 1 + 받침 2 — 받침 랭크마다 핵심 피해가 오른다 (연계 보너스, skillTree SYNERGY)
      title: "대표 빌드",
      lead: "갈래마다 대표 빌드가 둘씩 있어요. 핵심 스킬은 받쳐 주는 스킬 랭크마다 피해가 올라요(연계). 핵심 하나와 받침 둘에 몰아 찍을수록 핵심 스킬이 크게 세지고 야근 빌딩에서 받는 피해도 줄어요. 흩어 찍으면 연계가 조금밖에 안 붙어요. 야근 빌딩에서는 카드도 빌드에 맞는 것(마공·물공 꼬리표)을 먼저 고르면 더 높이 올라가요.",
      body: (
        <ul className={s.guideList}>
          {BUILDS.map((b) => {
            const core = b.core.map((id) => skillById(id)!.name).join("·");
            const links = SYNERGY[b.core[0]] ?? [];
            const full = Math.round(links.reduce((a, l) => a + l.pct * (skillById(l.id)?.maxLevel ?? 0), 0) * 100);
            const guard = Math.round((SYNERGY_GUARD[b.core[0]] ?? 0) * 100);
            return (
              <li key={b.id} className={s.guideItem}>
                <span className={s.guidePic}>
                  <RpgIcon art={skillById(b.core[0])!.art} size={32} />
                </span>
                <div>
                  <p className={s.rowName}>
                    {b.name} <small>· {BRANCH_INFO[b.branch].name} · 강점 {b.strong} · 약점 {b.weak}</small>
                  </p>
                  <p className={s.meta}>{b.role}</p>
                  <p className={s.meta}>
                    핵심 <b>{core}</b> ← 받침 {links.map((l) => `${skillById(l.id)!.name}(랭크마다 +${Math.round(l.pct * 100)}%)`).join(", ")}. 받침을 다 찍으면 핵심 피해 +{full}%.
                    {guard > 0 && ` 핵심까지 다 찍으면 야근 빌딩에서 받는 피해가 ${guard}% 줄어요.`}
                  </p>
                  <table className={s.guideTable}>
                    <tbody>
                      {buildSteps(b).map((st) => (
                        <tr key={st.level}>
                          <th scope="row">
                            Lv.{st.level} ({st.points}P)
                          </th>
                          <td>{st.adds.map((x) => `${skillById(x.id)!.name} ${x.from ? `${x.from}→` : ""}${x.to}`).join(", ")}</td>
                        </tr>
                      ))}
                      <tr>
                        <th scope="row">능력치</th>
                        <td>{b.statNote}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </li>
            );
          })}
        </ul>
      ),
    },
  ];
}

export default function HuntGuide({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const list = pages();
  const n = list.length;
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const p = list[i];
  return (
    <Dialog title="사냥 안내서" onClose={onClose}>
      <div className={s.guide}>
        <div className={s.guideToc} role="tablist" aria-label="안내서 차례">
          {list.map((x, k) => (
            <button key={x.title} type="button" role="tab" aria-selected={k === i} className={s.guideTocBtn} onClick={() => setI(k)}>
              <span>{k + 1}</span>
              {x.title}
            </button>
          ))}
        </div>
        <section className={s.guidePage} role="tabpanel" aria-label={p.title} key={i}>
          <h3 className={s.sectionTitle}>
            {i + 1}. {p.title}
          </h3>
          {i < DEMO_SCENES.length && <HuntDemo page={i} title={p.title} />}
          <p className={s.guideLead}>{p.lead}</p>
          {p.body}
        </section>
        <div className={s.guideNav}>
          <button type="button" className={ui.button} onClick={() => go(-1)} disabled={i === 0}>
            ← 이전
          </button>
          <span className={s.meta}>
            {i + 1} / {n}
          </span>
          {i < n - 1 ? (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => go(1)}>
              다음 →
            </button>
          ) : (
            <button type="button" className={cx(ui.button, ui.primary)} onClick={onClose}>
              다 읽었어요
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

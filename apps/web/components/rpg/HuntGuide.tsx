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
import { HUNT_DROP_ROLLS, KILLS_PER_DROP_ROLL, MIN_RUN_MS } from "@/lib/rpg/rewards";
import { PIONEER_DAYS, PIONEER_FLOOR, tExpToNext,
  TRANSCEND_MAX,
} from "@/lib/rpg/endgame";
import {
  CURSES,
  floorTExp,
  TOWER_BOSS_EVERY,
  TOWER_BOSS_FLOOR_SEC,
  TOWER_CHECKPOINT_EVERY,
  TOWER_DEF,
  TOWER_FLOOR_SEC,
  TOWER_HP_ATK,
  TOWER_THEMES,
  FLOORS_PER_THEME,
} from "@/lib/rpg/tower";
import { monsterIdleCanvas } from "@/game/rpg/monsterArt";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { MAX_SLOW, MONSTER_STATUS, POTION_CURES, STATUS_DIFF, STATUS_IDS, STATUSES, statusFor, type StatusId } from "@/lib/rpg/status";
import { CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf } from "@/lib/rpg/weapons";
import { earnRule } from "@/lib/economy";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { DEMO_H, DEMO_SCALE, DEMO_SCENES, DEMO_W, drawDemo } from "./huntDemo";
import RpgIcon from "./RpgIcon";
import { OddsLink } from "../odds/OddsLayer";
// 11/15 야근 빌딩 능력 카드
import { cardIconUrl } from "@/game/rpg/cards/cardArt";
import { BOSS_DEAL_HP_COST, CARD_IDS, FOCUS_ASPD, START_PICKS_PER_10 } from "@/lib/rpg/cards";
import s from "./rpg.module.css";

/** 11/15 끝없는 회의실 층 (테마 표 두 번째 칸 — 10층마다) */

// 사냥 안내서: 사냥 로비·멈춤 창에서 연다. 짧은 페이지를 넘겨 본다 (←/→ 키도 된다).
// 숫자·이름은 catalog·patterns·weapons·rewards에서 읽는다 → 스킬·무기·패턴이 늘어도 안내가 따라간다.
// 쪽마다 위에 게임 그림으로 움직이는 짧은 반복 시연이 돈다 (huntDemo). 지금 보는 쪽 것만 돌고, 움직임 줄이기면 정지 그림.

/** 하루 사냥 포인트 한도 (economy.ts) */
const HUNT_DAILY_MAX = earnRule("hunt").dailyMax;

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
              레벨이 오를 때마다 1포인트를 받아요. 10, 20, 30처럼 10의 배수 레벨에선 2포인트예요. 랭크 하나를 올리는 데 1포인트가 들어요. 둥근 칸은 패시브예요. 찍어 두면 늘 켜져 있어요.
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
              자동으로 쓸 스킬은 사냥 중에 정해요. 스킬 칸을 오른쪽 클릭하거나 Shift+숫자를 누르면 그 칸이 자동이 돼요. 폰은 [자동]을 누른 다음 칸을 눌러요. 자동 칸은 테두리가 초록색으로 돌아요. 자동 스킬은 쓰기 좋은 때를 기다렸다가 써요. 예를 들어 광역 스킬은 적이 3마리 넘게 모이면 써요. X를 누르면 자동을 전부 한 번에 켜고 꺼요. 폰은 왼쪽 위 &lsquo;스킬 자동&rsquo;을 눌러요. 궁극기와 이동 스킬은 자동이 안 돼요. 스킬 탭의 &lsquo;궁극기 SP 남겨 두기&rsquo;가 켜져 있으면 자동 스킬이 궁극기 쓸 SP를 남겨 둬요.
            </Item>
            <Item pic={<Keys k={["H"]} />} title="키 안내">
              사냥 중 H를 누르면 사냥 키가 화면에 떠요. 한 번 더 누르면 숨어요.
            </Item>
            <Item pic={<span className={s.guideSp}>SP</span>} title="SP">
              스킬을 쓰면 SP가 들어요. SP가 모자란 칸은 어두워지고 필요한 SP가 떠요. INT를 올리면 최대 SP와 스킬 위력이 같이 올라요. SP는 에너지드링크로 채워요.
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
              {skillName("so_swift")} 스킬은 이동 속도와 공격 속도를 잠깐 올려요. {skillName("em_stoke")} 스킬은 공격력을 잠깐 올려요. 1랭크에 +{pct(stoke.atk)}예요.
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
      lead: "판이 끝나면 잡은 만큼 EXP를, 나아간 만큼 포인트를 받아요. 모든 웨이브를 깨면 포인트를 가장 많이 받아요.",
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
            <Item art={skillArt("em_spark")} title="하루 한도">
              사냥 포인트는 하루 {HUNT_DAILY_MAX}P까지 받아요. 오늘 받은 양은 출발 창, 가방, 결과 화면 막대에 나와요. 다 채우면 EXP와 드롭만 받아요. 주운 장비와 물약을 파는 것도
              이 한도에 들어가요. 다 채웠으면 내일 팔아요. 상점에서 산 장비는 언제든 50%를 돌려받아요. {sec(MIN_RUN_MS)}도 안 된 판은 보상이 없어요.
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
              {Math.round(tExpToNext(TRANSCEND_MAX - 1) / 10_000)}만이에요. 초월 레벨이 5 오를 때마다 능력치 포인트를 1개 받아요. 회식 3차와 축제장은 레벨 50부터 EXP가 10%만 나와요.
              분기 마감이나 구조조정에서 사냥하는 게 좋아요. 레벨 랭킹은 레벨 순서예요. 레벨이 같으면 초월 레벨, 그다음엔 초월 EXP로 정해요.
            </Item>
            <Item art={skillArt("so_lamp")} title="야근 빌딩">
              마을 북쪽 분양 사무소 옆에 있는 높은 건물이에요. 사냥 레벨 50부터 들어가요. 1층부터 쓰러질 때까지 계속 올라가요. 한 층은 방 하나이고 {TOWER_FLOOR_SEC}초 안에 깨야 해요.{" "}
              {TOWER_BOSS_EVERY}층마다 우두머리 층이 있어요. 우두머리 층은 {TOWER_BOSS_FLOOR_SEC}초이고, 깨면 체력이 30% 차요. 체력, SP, 버프는 다음 층까지 이어져요. 한 층 오를 때마다 몬스터 체력과 공격력은
              ×{TOWER_HP_ATK}, 방어는 ×{TOWER_DEF}씩 세져요. 층을 깨면 엘리베이터를 타고 다음 층으로 가요. 층 표시가 붉게 깜빡이면 우두머리 층이에요. 쓰러지면 끝이고 부활 쿠키는 못 써요.
              Esc로 그만두면 그 층까지 기록돼요. 몇 번이든 다시 도전할 수 있어요.
            </Item>
            {/* 11/15 테마는 판마다 무작위 (lib/rpg/tower towerBlock) */}
            <Item art={skillArt("em_spark")} title="층마다 바뀌는 테마">
              테마는 {FLOORS_PER_THEME}층마다 바뀌고, 순서는 판마다 달라요. 한 판에서는 아직 안 나온 테마가 먼저 나와요. 그래서 {TOWER_THEMES.length * FLOORS_PER_THEME}층까지 오르면{" "}
              {TOWER_THEMES.length}곳을 모두 만나요. 그다음부터는 방금 나온 곳만 빼고 아무 데나 나와요. 처음 간 테마에서는 층마다 새 몬스터가 한두 종씩 늘어요. 같은
              판에서 다시 가면 분위기와 몬스터가 바뀌어요. 테마의 마지막 층에는 그 테마의 우두머리가 기다려요.
            </Item>
            {/* 11/15 능력 카드 · 상사의 제안 · 멈추면 집중 (lib/rpg/cards) */}
            <Item pic={<CardPic id="boards" />} title="능력 카드">
              몬스터를 잡으면 판 레벨 막대가 차요. 판 레벨이 오를 때마다 게임이 잠깐 멈추고, 카드 세 장 중 하나를 골라요. 카드는 모두 {CARD_IDS.length}장이에요. 고른 카드는
              그 판에서만 쓰고, 판이 끝나면 사라져요. 같은 카드를 또 고르면 더 세져요. 쏘는 무기는 한 발 더 날아가고, 휘두르는 무기는 다른 방향으로도 같이 휘둘러요.
              마음에 드는 카드가 없으면 다시 뽑아요. 다시 뽑기는 판마다 한 번 있고, 10층을 깰 때마다 한 번씩 늘어요. 카드 등급은 일반, 매직, 레어, 유니크, 전설 다섯 가지예요.
              1층에선 전설이 백 장에 한 장꼴이에요. 높이 오르거나 다시 뽑을수록 좋은 등급이 잘 나와요. 지금 능력치는 왼쪽 위 능력치 판에서 봐요. C를 누르면 열고 닫혀요.{" "}
              {1 + TOWER_CHECKPOINT_EVERY}층처럼 위에서 시작하면 건너뛴 10층마다 카드를 {START_PICKS_PER_10}장씩 먼저 골라요.
            </Item>
            <Item pic={<CardPic id="oneshot" />} title="상사의 제안과 멈추면 집중">
              10층마다 우두머리를 잡으면 상사가 제안을 해요. 최대 체력을 {Math.round(BOSS_DEAL_HP_COST * 100)}% 내주면 레어 이상 카드를 한 장 받아요. 거절하면 체력을 가득
              채워 줘요. 가만히 서서 때리면 공격 속도가 {Math.round(FOCUS_ASPD * 100)}% 빨라져요. 피할 땐 움직이고, 때릴 땐 멈춰 서요.
            </Item>
            {/* 11/15 세트 장비·강화 */}
            <Item art={{ shape: "sg:003", main: 0, accent: 0 }} title="세트 장비와 강화">
              세트 장비는 야근 빌딩 상자에서만 나와요. 세트는 야근, 결재, 회의, 출장 네 가지이고, 세트마다 부위가 다섯 개예요. 높은 층일수록 사원급에서 임원급까지 좋은 직급이 나와요.
              같은 세트를 두 개나 네 개 끼면 세트 효과가 붙어요. 장비 탭에서 강화하면 기본 능력치가 올라요. +5면 1.4배, +10이면 2배, +15면 3배예요. 세트 장비는 +15, 상점 장비는 +5까지 올릴 수 있어요.
              +11부터는 실패하면 한 단계 내려가요. 보호 문서가 있으면 막을 수 있어요. 안 쓰는 세트 장비는 분해해서 재료로 바꿔요. 같은 직급 세 개를 원하는 부위 하나로
              바꿀 수도 있어요.
            </Item>
            <Item art={POTIONS[0]?.art} title="야근 빌딩 보상">
              깬 층마다 초월 경험치를 받아요. 1층은 {floorTExp(1)}, 30층은 {floorTExp(30)}, 100층은 {floorTExp(100)}만큼 받아요. 쓰러져도 깬 층만큼은 받아요.
              우두머리 층을 깨면 우두머리 상자가 열려요. 물약과 강화 재료는 늘 들어 있어요. 세트 장비는 15% 확률로 나와요. 7번 내리 못 받으면 다음엔 꼭 나와요.
              꾸미기 이용권도 가끔 나와요.
              깬 층마다 포인트도 조금 받아요. 이 포인트도 사냥 하루 한도에 들어가요. 잡은 몬스터 수는 주간 사냥 레이스에 들어가요. {TOWER_CHECKPOINT_EVERY}층 우두머리를 잡으면 다음부터 {1 + TOWER_CHECKPOINT_EVERY}층에서 바로 시작할 수 있어요. {TOWER_CHECKPOINT_EVERY * 2}층을 깨면{" "}
              {1 + TOWER_CHECKPOINT_EVERY * 2}층에서 시작할 수 있어요.
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

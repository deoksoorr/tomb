"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DIFFICULTIES,
  DIFFS,
  GEAR,
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
  TOWER_CHESTS_PER_DAY,
  TOWER_DEF,
  TOWER_FLOOR_SEC,
  TOWER_FLOORS_PER_RUN,
  TOWER_HP_ATK,
  TOWER_THEMES,
  FLOORS_PER_THEME,
} from "@/lib/rpg/tower";
import { RESPEC_MAX_COST, respecCost } from "@/lib/rpg/skillRules";
import { MT_BOSS, MT_ELITE, MT_LOOPS, MT_MID, MT_POOL, MT_ZONE_DEF } from "@/lib/rpg/towerThemes/meetingRoom";
import { SV_LOOPS, SV_POOL, SV_ROOMS, SV_ZONE } from "@/lib/rpg/serverRoom";
import { SV_ROOM_NAMES } from "@/game/tower/themes/serverRoomMap";
import { scheduleRows } from "@/game/tower/scheduleRows";
import { MAX_SLOW, MONSTER_STATUS, POTION_CURES, STATUS_DIFF, STATUS_IDS, STATUSES, statusFor, type StatusId } from "@/lib/rpg/status";
import { CHAIN_GRACE_MS, FINISHER_EVERY, WEAPON_STYLES, weaponStyleOf } from "@/lib/rpg/weapons";
import { earnRule } from "@/lib/economy";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { DEMO_H, DEMO_SCALE, DEMO_SCENES, DEMO_W, drawDemo } from "./huntDemo";
import RpgIcon from "./RpgIcon";
// 11/15 야근 빌딩 능력 카드
import { cardIconUrl } from "@/game/rpg/cards/cardArt";
import { BOSS_DEAL_HP_COST, CARD_IDS, FOCUS_ASPD, START_PICKS_PER_10 } from "@/lib/rpg/cards";
import s from "./rpg.module.css";

/** 11/15 끝없는 회의실 층 (테마 표 두 번째 칸 — 10층마다) */
const MT_FLOORS = "6~10·16~20·26~30 …층";

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
/** 난이도끼리 견준 드롭 빈도 → 말 (확률 숫자는 안내에 안 보인다). 가장 낮은 쪽 "드물게", 가장 높은 쪽 "자주", 사이는 "가끔" */
function oftenWord(v: number, all: readonly number[]): string {
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  if (hi === lo) return "가끔";
  return v === lo ? "드물게" : v === hi ? "자주" : "가끔";
}
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
  ["circle", "원", "그 자리에 떨어진다 — 원 밖으로"],
  ["line", "줄", "그 줄을 따라 돌진·사격 — 옆으로 비켜서기"],
  ["cone", "부채꼴", "몬스터 앞쪽 — 뒤나 옆으로 돌아가기"],
  ["ring", "고리", "몬스터 둘레 도넛 — 오히려 바짝 붙으면 안전"],
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
    .join("·");
/** 이 상태를 푸는 포션 이름 */
const curers = (id: StatusId) =>
  POTIONS.filter((p) => POTION_CURES[p.id]?.includes(id))
    .map((p) => (p.key ? `${p.name}(${p.key})` : p.name))
    .join("·");
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
      title: "움직이기·공격",
      lead: "공격은 바라보는 쪽으로 나가요. 꾹 누르고 있으면 알아서 계속 때려요.",
      body: (
        <ul className={s.guideList}>
          <Item pic={<Keys k={["W", "A", "S", "D"]} />} title="이동">
            WASD 또는 방향키. 폰·태블릿은 화면 왼쪽 아무 데나 누르고 끌면 그 자리에 조이스틱이 생겨요.
          </Item>
          <Item pic={<Keys k={["Space", "J"]} />} title="공격">
            한 번 누르면 한 번. 공격 간격 전에 누르면 다음 공격으로 예약돼요 (발밑 게이지가 초록).
          </Item>
          <Item pic={<Keys k={["꾹"]} />} title="꾹 누르기 = 연속 공격">
            Space·J, 마우스, 손가락을 누르고 있으면 계속 공격해요. 마우스·손가락은 누른 쪽을 향해 쳐요.
          </Item>
          <Item art={GEAR.find((g) => g.kind === "weapon")?.art} title={`${FINISHER_EVERY}번째 연속 공격 = 마무리`}>
            공격 간격 + {sec(CHAIN_GRACE_MS)} 안에 이어 치면 연속으로 세요. {FINISHER_EVERY}번째는 더 넓고 세게 나가요.
          </Item>
          <Item pic={<span className={s.guideGauge} />} title="발밑 게이지">
            공격 대기 시간. 차오르다 다 차면 반짝 — 그때 다시 칠 수 있어요.
          </Item>
          <Item pic={<Keys k={["Esc"]} />} title="멈춤">
            게임 시간이 멈춰요. 멈춤 창에서도 이 안내서를 볼 수 있어요.
          </Item>
        </ul>
      ),
    },
    {
      title: "스킬·포션",
      lead: `스킬은 스킬 탭의 트리에서 찍고, 액티브 스킬은 단축키 1~${SKILL_SLOTS}(궁극기는 F 칸)에 놓아야 써요.`,
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
                {BRANCH_INFO[b].desc} 궁극기: {SKILLS.filter((sk) => sk.branch === b && sk.tier === 5 && sk.kind === "active").map((sk) => sk.name).join("·")}.
              </Item>
            ))}
            <Item pic={<Keys k={["1단", "…", "5단"]} />} title="단·선행 스킬">
              갈래마다 5단. 위 단은 그 갈래의 아래 단에 포인트를 {TIER_GATES.slice(1).join("·")}만큼 쓰면 열려요. 선 이어진 스킬은 앞 스킬을 정해진 랭크까지 찍어야 배워요.
            </Item>
            <Item pic={<span className={s.guideSp}>+1</span>} title="스킬 포인트">
              레벨이 오를 때마다 1포인트(10의 배수 레벨엔 2). 랭크 하나에 1포인트. 패시브(둥근 칸)는 찍으면 늘 켜져 있어요.
            </Item>
            <Item pic={<Keys k={["↺"]} />} title="초기화">
              스킬 탭의 [초기화]로 찍은 포인트를 모두 돌려받아요. 레벨에 따라 {respecCost(1)}~{RESPEC_MAX_COST}P.
              <br />
              <small>스킬 트리가 바뀌는 업데이트가 있으면 모두의 스킬이 초기화되고 포인트를 전부 돌려받아요.</small>
            </Item>
            <Item pic={<Keys k={["↺"]} />} title="능력치 초기화">
              캐릭터 탭의 [능력치 초기화]로 배분한 능력치 포인트를 모두 돌려받아요. 스킬 초기화와 같은 비용으로, 레벨에 따라 {respecCost(1)}~{RESPEC_MAX_COST}P. 장비로 붙은 능력치는 그대로예요.
            </Item>
            <Item art={skillById("em_meteor")?.art} title="광역기">
              바닥에 마법진이 먼저 깔리고 터져요. 갈래마다 색이 달라요 (모닥불 주황·서리 하늘빛·넋 보라). 화면 흔들림은 사냥터 고르는 화면의 &lsquo;화면 흔들림 효과&rsquo;로 끌 수 있고, 흔들림·번쩍임 모두 기기의 &lsquo;동작 줄이기&rsquo;를 켜면 꺼져요.
            </Item>
            <Item pic={<Keys k={["1", "…", String(SKILL_SLOTS), "F"]} />} title="단축 칸에 놓기">
              스킬 탭 맨 아래 단축 줄로 배운 액티브 스킬을 끌어다 놓아요(손가락으로도). 또는 스킬을 고르고 칸이나 숫자 키 1~{SKILL_SLOTS}를 눌러요. 칸은 스킬 {SKILL_SLOTS}칸 + 궁극기 칸(F) — 5단 궁극기는 F 칸에만, 다른 스킬은 1~{SKILL_SLOTS}에만 들어가요. 칸끼리 끌면 자리를 바꾸고, 줄 밖으로 끌어내면 빠져요. 처음 배운 액티브는 빈 칸에 저절로 들어가요.
            </Item>
            <Item pic={<Keys k={["1", "…", String(SKILL_SLOTS), "F"]} />} title="스킬 쓰기">
              숫자 키 1~{SKILL_SLOTS}, 궁극기는 F, 또는 화면 아래 스킬 버튼을 눌러요. 패시브(둥근 칸)는 칸이 필요 없이 늘 켜져 있어요. 걸으면서 쳐도 공격·스킬은 겨냥한 적 쪽으로 나가요 (물러나며 치기).
            </Item>
            <Item pic={<Keys k={["Shift", "1~" + SKILL_SLOTS]} />} title="스킬 자동">
              Shift+숫자, 칸 우클릭으로 그 칸을 자동으로 정해요. 손가락은 스킬 줄의 [자동]을 누른 뒤 칸을 누르면 (쓰지 않고) 자동만 켜고 꺼져요 — 다시 [자동]을 누르거나 6초 가만있으면 끝. 자동 칸은 테두리가 초록으로 돌고, 쿨이 끝나도 &lsquo;쓸 만한 때&rsquo;(사거리 안 적, 광역은 3마리 이상, 방패는 체력이 줄었을 때 …)를 기다렸다 써요. X(또는 왼쪽 위 &lsquo;스킬 자동&rsquo;)로 자동 칸을 한꺼번에 켜고 꺼요. 궁극기·몸 옮기기 스킬(안개 걸음·저승 너울)은 자동이 안 돼요. 스킬 탭에서 &lsquo;궁극기 SP 남겨 두기&rsquo;를 켜 두면(기본) 자동 스킬이 궁극기 쓸 SP는 남겨요.
            </Item>
            <Item pic={<Keys k={["H"]} />} title="키 안내">
              사냥 중 H를 누르면 사냥 키가 화면에 떠요. 한 번 더 누르면 숨어요.
            </Item>
            <Item pic={<span className={s.guideSp}>SP</span>} title="SP">
              스킬마다 SP를 써요. 모자란 칸은 어둡게, 필요한 SP 숫자가 떠요. 최대 SP는 INT로 늘고(스킬 위력도), 에너지드링크로 채워요.
            </Item>
            <Item pic={<span className={s.guideCool} />} title="쿨타임">
              한 번 쓰면 아이콘 위 그림자가 시계 방향으로 걷힐 때까지 다시 못 써요. 스킬마다 다르고 스킬 탭에서 확인해요.
            </Item>
            <Item art={keyedPotions[0]?.art} title={`포션 ${keyedPotions.map((p) => p.key).join("/")}`}>
              {keyedPotions.map((p) => `${p.key} ${p.name}(${p.desc})`).join(" · ")}. 한 번 먹으면 {sec(POTION_COOLDOWN_MS)} 뒤에 또 먹을 수 있어요.
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
      lead: "낀 무기에 따라 공격 모양이 달라요. 장비 탭·상점에서 무기마다 방식이 적혀 있어요.",
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
      lead: "몬스터는 치기 전에 바닥에 빨간 경고를 깔아요. 안쪽이 다 차오르면 맞으니 그 전에 밖으로!",
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
            어려운 사냥터일수록 경고가 짧고 개수가 많아져요. 그래도 경고는 적어도 {sec(MIN_WINDUP_MS)}는 보여요. 맞은 직후에는 아주 잠깐 무적이에요.
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
              <span className={s.meta}>물기·부채 사격·내려찍기 같은 기본 패턴</span>
            </li>
            {DEFAULT_BOSS_PHASES.map((ph) => (
              <li key={ph.below}>
                <b>
                  HP {pct(ph.below)} 아래 · {ph.label}
                </b>
                <span className={s.meta}>
                  {ph.add.map((id) => PATTERNS[id].name).join("·")} 추가 · 패턴 간격 {pct(1 - ph.haste)} 빨라짐
                </span>
              </li>
            ))}
          </ol>
          <ul className={s.guideList}>
            <Item art={skillArt("so_friend")} title="졸개 부르기">
              단계가 오를 때마다 사냥터마다 정해진 졸개 무리를 부르고, 지형 기믹도 더 거칠어져요. 우두머리 둘레엔 붉은 기운이 돌아요.
            </Item>
            <Item art={skillArt("fr_tomb")} title="잘 안 밀려요">
              우두머리는 넉백·경직이 거의 없고 지형에 느려지지도 않아요. 묶기·끌어당기기도 1/3만 먹혀요. 경고를 보고 빠지는 게 핵심.
            </Item>
            {deepBosses.length > 0 && (
              <Item art={skillArt("em_spark")} title="한 번 더 폭주하는 우두머리">
                {deepBosses.map((b) => {
                  const ph = b.phases!.at(-1)!;
                  return `${b.name}(HP ${pct(ph.below)} 아래 · ${ph.add.map((id) => PATTERNS[id].name).join("·")})`;
                }).join(", ")}
                는 마지막에 한 번 더 단계가 올라 패턴 간격이 더 짧아져요. 졸개는 두 번까지만 불러요.
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
              {skillName("so_veil")}({sec(veil.safeMs)}~), {skillName("fr_mist")}, 부활 쿠키(2초): 몸이 깜빡이며 어떤 피해도 안 받아요.
            </Item>
            <Item art={skillArt("so_swift")} title="빨라짐·공격↑">
              {skillName("so_swift")}는 이동·공격 속도, {skillName("em_stoke")}는 공격력(+{pct(stoke.atk)}~)을 잠깐 올려요.
            </Item>
            <Item art={skillArt("so_friend")} title="도우미">
              {skillName("so_friend")}: 길동무 넋이 곁에서 같이 때려요. {skillName("so_lantern")}은 그 자리에서 넋불을 쏴요.
            </Item>
            <Item art={skillArt("fr_ward")} title="보호막">
              {skillName("fr_ward")}: 얼음 방패가 피해를 먼저 받아 줘요.
            </Item>
            <Item art={skillArt("so_lamp")} title="멈춰 섬">
              {skillName("so_lamp")}을 쓰면 {sec(lamp.rootMs)} 동안 움직이지도 공격하지도 못해요.
            </Item>
            <Item art={skillArt("so_chain")} title="약화·묶기 (몬스터)">
              {skillName("so_chain")}·{skillName("fr_tomb")}에 걸린 적은 잠깐({sec(chain.stunMs)}~{sec(tomb.stunMs)}) 묶이고 받는 피해가 늘어요. 서리 스킬은 적을 느리게 해요.
            </Item>
            <Item art={skillArt("em_kindle")} title="경직·넉백 (몬스터)">
              맞은 몬스터는 잠깐 밀려나고 멈춰요. 치명타는 더 오래.
              {stunStyles.length > 0 && ` ${stunStyles.join("·")}는 경직이 더 길고,`}
              {pushStyles.length > 0 && ` ${pushStyles.join("·")}는 멀리 밀쳐요.`}
            </Item>
            <Item pic={<span className={s.guideMud} />} title="지형">
              늪·덩굴은 느려지고, 컨베이어·바람은 밀고, 웅덩이는 미끄러워요. 사냥터 설명의 기믹을 확인해요.
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
                  {id === "slow" && ` 이동속도 -${pct(st.slow ?? 0)}.`}
                  {st.dotPct && ` 초당 최대 HP의 ${pct(st.dotPct)}.`}
                  {who && ` ${who} 등이 걸어요.`}
                  <br />
                  <small>풀기: {curers(id) || "시간이 지나면"}</small>
                </Item>
              );
            })}
          </ul>
          <p className={s.meta}>
            몇몇 몬스터의 공격과 우두머리의 큰 기술에 맞으면 가끔 걸려요. 같은 상태는 겹치지 않고 남은 시간만 새로 채워지고, 풀린 직후엔 잠깐 같은 상태에 안 걸려요. 지속
            피해로는 쓰러지지 않아요(HP 1에서 멈춤). 어려운 사냥터일수록 더 자주·오래·세게 걸려요 (지옥: 가장 자주 걸리고 세기 ×
            {STATUS_DIFF.hell.power}, 둔화는 최대 -{pct(MAX_SLOW)}). 무적 중에는 안 걸리고, 부활 쿠키로 일어나면 모두 풀려요.
          </p>
        </>
      ),
    },
    {
      title: "드롭·보상",
      lead: "끝나면 처치한 만큼 EXP, 진행한 만큼 포인트를 받아요. 모든 웨이브를 깨면 포인트 최대.",
      body: (
        <>
          <ul className={s.guideList}>
            <Item art={GEAR.find((g) => g.kind === "acc")?.art} title="드롭">
              {KILLS_PER_DROP_ROLL}마리 잡을 때마다 한 번(한 판 최대 {HUNT_DROP_ROLLS}번) 장비·물약이 나올 기회. 우두머리를 잡으면 그 자리에서 장비가
              나올 기회가 한 번 더 있어요.
              <br />
              <small>쓰러지지 않고 다 깨면 아주 가끔 기간제 코디(꾸미기 하루권)가 꾸미기 가방에 들어와요.</small>
            </Item>
            <Item art={POTIONS[0]?.art} title="잘 나오는 것">
              사냥터마다 잘 나오는 장비가 있어요(사냥터 설명). 싼 장비일수록 자주 나와요. 가방이 가득 차면 못 챙겨요.
            </Item>
            <Item art={skillArt("so_lamp")} title="쓰러지면">
              포인트는 절반, EXP는 조금 깎여요. 권장 레벨보다 낮으면 조심!
            </Item>
            <Item art={skillArt("em_spark")} title="하루 한도">
              사냥 포인트는 하루 {HUNT_DAILY_MAX}P까지예요(출발 창·가방·결과 화면 막대에 오늘 받은 양이 나와요). 넘으면 EXP와 드롭만 받아요. 주운 장비·물약 되팔기도 이 한도
              안이라 다 차면 내일 팔아요 — 상점에서 산 장비는 언제든 50% 환불. {sec(MIN_RUN_MS)}도 안 된 판은 보상이 없어요.
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
                <th>장비·물약 드롭</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{oftenWord(DIFFS[d].dropChance, DIFFICULTIES.map((x) => DIFFS[x].dropChance))}</td>
                ))}
              </tr>
              <tr>
                <th>우두머리 장비</th>
                {DIFFICULTIES.map((d) => (
                  <td key={d}>{oftenWord(DIFFS[d].bossDropChance, DIFFICULTIES.map((x) => DIFFS[x].bossDropChance))}</td>
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
        </>
      ),
    },
    {
      // 11/15 사냥 끝판 (lib/rpg/endgame · 야근 빌딩 lib/rpg/tower)
      title: "레벨 50 이후",
      lead: "레벨 50부터는 초월 레벨(★51~★100)과 마을의 야근 빌딩으로 더 올라가요. 보상은 포인트가 아니라 자랑거리예요.",
      body: (
        <>
          <ul className={s.guideList}>
            <Item art={skillArt("em_spark")} title="초월 레벨 ★51~★100">
              레벨 50에서 지옥 사냥터 판의 EXP와 야근 빌딩 층 EXP는 초월 EXP로 쌓여요 (다른 난이도·미니게임 EXP는 버려져요). ★51까지 {tExpToNext(0).toLocaleString("ko-KR")}, ★100 직전은 약{" "}
              {Math.round(tExpToNext(TRANSCEND_MAX - 1) / 10_000)}만. 초월 5레벨마다 능력치 포인트 1개. 회식 3차·축제장은 레벨 50에선 EXP가 10%라 분기 마감·구조조정이
              제값이에요. 레벨 랭킹은 레벨 → 초월 레벨 → 초월 EXP 순.
            </Item>
            <Item art={skillArt("so_lamp")} title="야근 빌딩">
              마을 북쪽 분양 사무소 옆 높은 건물 (사냥 레벨 50부터). 1층부터 쓰러질 때까지 이어서 올라가요 — 한 층은 방 하나({TOWER_FLOOR_SEC}초 안), {TOWER_BOSS_EVERY}층마다 우두머리
              층({TOWER_BOSS_FLOOR_SEC}초, 깨면 체력 30% 회복). 체력·SP·버프는 다음 층으로 이어져요. 층마다 몬스터 체력·공격력 ×{TOWER_HP_ATK}, 방어 ×{TOWER_DEF}. 테마{" "}
              {TOWER_THEMES.length}곳이 {FLOORS_PER_THEME}층씩 번갈아 나오고, 층을 깨면 엘리베이터를 타고 다음 층으로 (층 표시가 붉게 깜빡이면 우두머리 층). 쓰러지면 끝 (부활 쿠키 없음), Esc →
              그만두기는 그 층까지 기록. 도전 횟수 제한은 없어요.
            </Item>
            {/* 11/15 지하 서버실 테마 (lib/rpg/serverRoom) */}
            <Item art={skillArt("em_spark")} title="지하 서버실 (1~5·11~15·21~25 …층)">
              파란 네온과 끝없는 랙. 층마다 방이 달라요 ({SV_ROOM_NAMES.slice(0, SV_ROOMS).join("·")}, 우두머리 층은 {SV_ROOM_NAMES[SV_ROOMS]}). 기믹 「{SV_ZONE.gimmick.name}」: 한 칸에 가만히
              서 있으면 바닥이 주황으로 달아오르다 불길이 솟아요 — 「냉각 실패」 경보(붉은 화면 테두리)면 두 배로 빨리. 10층마다 돌아올 때 판이 바뀌어요 ({SV_LOOPS.slice(1)
                .map((l) => l.name)
                .join(" → ")}). 몬스터: {SV_POOL.map((id) => MONSTERS[id].name).join("·")} · 정예 「{MONSTERS.sv_backup_tape.name}」(쓰러지면 최근에 쓰러진 셋을 복원) · 우두머리 「
              {MONSTERS.sv_legacy_system.name}」 (코드 조각 탄막 → 바닥 회로 전류 → 전체 재부팅, 초록 안전 구역으로). 랜선은 감아 끌어당기고, 블루스크린에 맞으면 1초 방향이 뒤집히고, 무한
              재부팅은 재부팅 중에 밟거나 쳐야 꺼지고, 자물쇠 사슬에 묶인 몬스터는 자물쇠부터 깨야 해요.
            </Item>
            {/* 11/15 끝없는 회의실 테마 (lib/rpg/towerThemes/meetingRoom) */}
            <Item art={skillArt("so_lamp")} title={`끝없는 회의실 (${MT_FLOORS})`}>
              유리벽 너머로 회의실이 끝없이 비치는 층. 층마다 방이 달라요 (작은 회의실·대회의실·오픈 오피스·교육장·임원 회의실·카페테리아·폰부스 복도) — 벽시계는 층마다 25분씩
              흘러 노을 → 야근 → 새벽 → 아침으로, 10층마다 돌아올 때 몬스터 특성이 붙어요 ({MT_LOOPS.slice(1, 4)
                .map((l) => l.trait)
                .join("·")}). 기믹 「{MT_ZONE_DEF.gimmick.name}」: 바닥에 노란 줄이 그어지면 그 자리로 테이블이 밀려와 방이 좁아져요 (우두머리가 오래 버틸수록 더 좁게).
              몬스터: {MT_POOL.map((id) => MONSTERS[id].name).join("·")} · 정예 「{MONSTERS[MT_ELITE].name}」(살아 있으면 계속 들어온다) · 중간 우두머리 「{MONSTERS[MT_MID].name}」
              (내 지난 길을 되밟는 그림자) · 우두머리 「{MONSTERS[MT_BOSS].name}」 (「한 가지만 더」 → 방이 좁아지고, 끝에 의자를 돌리며 사방 사격).
            </Item>
            {/* 11/15 능력 카드 · 상사의 제안 · 멈추면 집중 (lib/rpg/cards) */}
            <Item pic={<CardPic id="boards" />} title="능력 카드">
              몬스터를 잡으면 판 레벨 막대가 차요. 오를 때마다 게임이 잠깐 멈추고 카드 세 장 중 하나를 골라요. 카드는 {CARD_IDS.length}장이고, 그 판에서만 쌓였다가 판이
              끝나면 사라져요. 같은 카드를 여러 번 고르면 더 세져요. 무기에 따라 붙는 모양이 달라서, 쏘는 무기는 한 발 더 날아가고 휘두르는 무기는 다른 방향으로도 같이
              휘둘러요. 마음에 드는 게 없으면 다시 뽑기를 써요. 판마다 한 번, 10층을 깰 때마다 한 번씩 더 생겨요. 전설 카드 「원샷 결재」와 「무한 야근」은 다시 뽑을 때나
              상사의 제안에서만 가끔 나와요. {1 + TOWER_CHECKPOINT_EVERY}층처럼 위에서 시작하면 건너뛴 10층마다 카드 {START_PICKS_PER_10}장을 먼저 고르고 올라가요.
            </Item>
            <Item pic={<CardPic id="oneshot" />} title="상사의 제안과 멈추면 집중">
              10층마다 우두머리를 잡으면 상사가 슬쩍 제안을 해요. 최대 체력 {Math.round(BOSS_DEAL_HP_COST * 100)}%를 내주면 희귀 이상 카드 한 장을 주고, 거절하면 체력을 가득
              채워 줘요. 기본 공격은 직접 해요 (Space·J, 누르고 있으면 계속). 가만히 서서 치면 공격 속도가 {Math.round(FOCUS_ASPD * 100)}% 빨라져요 — 피할 땐 움직이고 칠 땐 멈추는 게 요령이에요.
            </Item>
            <Item art={POTIONS[0]?.art} title="야근 빌딩 보상">
              깬 층마다 초월 EXP 약 320 × (1 + 0.02 × 층) (1층 {floorTExp(1)} · 30층 {floorTExp(30)} · 100층 {floorTExp(100)}) — 쓰러져도 깬 층만큼. {TOWER_FLOORS_PER_RUN}층 = 초월 판
              1판이라 하루 구간(100%·30%·10%)을 같이 써요. 우두머리 층을 깨면 우두머리 상자 (지옥 사냥터를 다 깬 판의 드롭 굴림, 하루 {TOWER_CHESTS_PER_DAY}개 — 그 뒤 상자는 비어 있어요).
              깬 층마다 포인트 조금 (사냥 하루 한도 안). 처치 수는 주간 사냥 레이스에 들어가요. 최고 층이 오르면 시작 층이 열려요 (1·{1 + TOWER_CHECKPOINT_EVERY}·
              {1 + TOWER_CHECKPOINT_EVERY * 2} …층).
            </Item>
            <Item art={GEAR.find((g) => g.kind === "acc")?.art} title="칭호·랭킹">
              층 칭호 10 「야근 입문」·20 「번아웃 생존자」·30 「야근이 일상」·50 「퇴근을 잊은 자」·100 「사무실이 집」. 신화(서버에 한 사람): 처음 30층 「최초 결재자」·50층 「최초
              임원」·100층 「빌딩의 전설」·처음 ★100 「첫 번째 상무」, 지금 최고 층 기록 「꼭대기 층 주인」(뺏기면 넘어감), 지난주 최고 층 1위 「이번 주 최고층」. 랭킹 창 [야근 빌딩]은
              층 높은 순, 같으면 빨리 오른 순. 끝판이 열린 뒤 {PIONEER_DAYS}일 안에 ★51에 닿거나 {PIONEER_FLOOR}층을 넘으면 「개척자 #번호」. 운영자는 랭킹·최초·번호에서 빠져요.
            </Item>
          </ul>
          {/* 11/15 층 순서표: 같은 층은 늘 같은 방·같은 몬스터 (★ = 그 층에서 처음 나오는 몬스터) */}
          <table className={s.guideTable}>
            <caption>층 순서 (1~30층 — 같은 층은 늘 같은 방·몬스터, ★ 처음 나오는 몬스터)</caption>
            <thead>
              <tr>
                <th>층</th>
                <th>방</th>
                <th>몬스터</th>
                <th>정예·우두머리</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows(30).map((r) => (
                <tr key={r.floor}>
                  <th>{r.floor}</th>
                  <td>
                    {r.theme} · {r.room}
                    {r.loop && r.floor % 10 !== 1 && r.floor % 10 !== 6 ? "" : r.loop ? ` (${r.loop})` : ""}
                  </td>
                  <td>{r.mons.map((m) => `${m.fresh ? "★" : ""}${m.name}`).join(", ")}</td>
                  <td>
                    {r.special.length
                      ? r.special.map((x) => `${x.kind === "boss" ? "우두머리" : x.kind === "mid" ? "중간 우두머리" : "정예"} ${x.fresh ? "★" : ""}${x.name}`).join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={s.guideTable}>
            <thead>
              <tr>
                <th>층</th>
                <th>저주 (누적)</th>
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

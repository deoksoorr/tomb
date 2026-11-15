import {
  HUNT_ZONES,
  MONSTER_IDS,
  MONSTERS,
  type MonsterId,
  type ZoneDef,
  type ZoneId,
} from "./catalog";
import { MAX_LEVEL, monsterStats, seeded, type MonsterScale } from "./formulas";
import {
  pioneerUntil,
  RUN_TIERS,
  rollDay,
  runTier,
  TDAY_FULL,
  tExpToNext,
  type RunTier,
  type TDayState,
} from "./endgame";
import {
  huntSpawnable,
  WAVE_MIN_GAP_SEC,
  type HuntWave,
  type WaveFormation,
} from "./plan";
import {
  CLOCK_SLACK_MS,
  killRateCeiling,
  MIN_RUN_MS,
  pickDropPotion,
} from "./rewards";
import type { Drop, EndgameView, HuntResult } from "./types";
// 11/15 우두머리 상자: 세트 장비·재료·꾸미기 굴림
import { chestCosmetic, chestMats, chestSetGear, SG_CHEST_CHANCE, SG_PITY } from "./setGearRoll";
// 11/15 능력 카드: 고른 카드 검사·처치 속도 상한 배율
import { cardPower, cardXpMul, isBossDealFloor, replayPicks, rerollsAllowed, runLevel, runXp, runXpNeed, runXpOf, startPicks } from "./cards";
// 11/15 층 순서표 (테마마다 층별 몬스터 구성·정예 자리)
import { floorElite, floorRoster } from "./towerSchedule";
// 11/15 끝없는 회의실 층 계획 손질 (참조 메일 상한·무리·중간 우두머리·안건 추가가 불러들이는 몫)
import { meetingPlan } from "./towerThemes/meetingRoomPlan";
// 11/15 옥상 정원 폭풍·임원층 층 계획 손질
import { rooftopPlan } from "./towerThemes/rooftopPlan";
import { execPlan } from "./towerThemes/execPlan";
// 11/15 지하 주차장·구내식당 층 계획 손질 (견인차가 깨우는 경보 차·밥솥 주먹밥·특식 배식 도우미 몫, 젤리·차단기 상한)
import { parkingPlan } from "./towerThemes/parkingPlan";
import { cafeteriaPlan } from "./towerThemes/cafeteriaPlan";

// 11/15 야근 빌딩 (레벨 50 끝판): 1층부터 쓰러질 때까지 이어서 오른다. 한 층 = 방 하나(약 40~60초).
// 순수 함수만 — 서버(판 시작 검사·결과 검증·보상·기록)와 게임(층 계획·배율·저주)·화면(엘리베이터·안내서)이 같은 표를 쓴다.
// 설계: docs/superpowers/specs/2026-11-15-endgame-design.md (야근 빌딩). 숫자는 테스트 서버에서 올라가 보고 다시 맞춘다.

/** 들어갈 수 있는 사냥 레벨 (테스트 서버 슈퍼 계정은 최대 레벨 취급) */
export const TOWER_MIN_LEVEL = MAX_LEVEL;
/** 한 판에 오를 수 있는 층 수 상한 (결과 형식 검사용 — 두 시간에 이만큼은 못 오른다) */
export const TOWER_MAX_CLIMB = 400;
/** 한 판 최대 길이 (티켓 수명 — 긴 등반도 받는다) */
export const TOWER_MAX_RUN_SEC = 2 * 3600;

// ── 층 테마 (맵·몬스터) ──

/**
 * 11/15 테마 모음: 다섯 층(한 블록)마다 이 중 하나를 판 시드로 고른다 (towerBlock — 바로 앞 블록과 같은 테마는 안 나오고,
 * 그 판에서 아직 안 나온 테마부터 → 다 나오면 앞 블록만 빼고 아무거나). 같은 판이면 서버 검증도 같은 순서.
 * 새 테마는 여기 한 줄 + catalog(TOWER_ZONE_IDS·HUNT_ZONES·MonsterId) + towerSchedule TABLES + (있으면) PLAN_HOOKS + game/tower/themes 실행부 표
 */
export const TOWER_THEMES: readonly ZoneId[] = [
  "server-room",
  "mt_meeting",
  "rf_rooftop",
  "ex_exec",
  // 11/15 지하 주차장·구내식당
  "pk_parking",
  "cf_cafeteria",
];
export const FLOORS_PER_THEME = 5;
const fl = (f: number) => Math.max(1, Math.floor(f));
const blockOf = (f: number) => Math.floor((fl(f) - 1) / FLOORS_PER_THEME);

/** f층 블록: 테마 · 그 판에서 이 테마에 몇 번째로 왔나(visit, 0부터) · 블록 안 자리(pos 0~3 보통 층, 4 우두머리 층) */
export type TowerBlock = { zone: ZoneId; visit: number; pos: number };

/** 판마다 블록 순서 (시작 블록부터 차례로 늘려 가며 기억 — 서버가 층마다 다시 부르므로) */
const ORDERS = new Map<string, { zone: ZoneId; visit: number }[]>();
function orderUpTo(seed: number, b0: number, n: number): { zone: ZoneId; visit: number }[] {
  const key = `${seed}:${b0}`;
  let o = ORDERS.get(key);
  if (!o) {
    if (ORDERS.size > 64) ORDERS.clear();
    o = [];
    ORDERS.set(key, o);
  }
  if (o.length >= n) return o;
  // 판 시드로 처음부터 다시 굴린다 (몇 블록까지 물었는지와 상관없이 같은 순서)
  const r = seeded((seed ^ 0x54484d45 ^ Math.imul(b0 + 1, 0x2c1b3c6d)) >>> 0);
  const seen = new Map<ZoneId, number>();
  const out: { zone: ZoneId; visit: number }[] = [];
  let prev: ZoneId | null = null;
  while (out.length < Math.max(n, o.length)) {
    const others = TOWER_THEMES.filter((z) => z !== prev);
    const cand = others.length ? others : TOWER_THEMES;
    const fresh = cand.filter((z) => !seen.has(z));
    const from = fresh.length ? fresh : cand;
    const zone = from[Math.min(from.length - 1, Math.floor(r() * from.length))];
    const visit = seen.get(zone) ?? 0;
    seen.set(zone, visit + 1);
    out.push({ zone, visit });
    prev = zone;
  }
  ORDERS.set(key, out);
  return out;
}

/** 판(seed, 시작 층 start)의 f층 블록. start 아래층은 시작 블록 취급 */
export function towerBlock(seed: number, start: number, f: number): TowerBlock {
  const b0 = blockOf(start);
  const i = Math.max(0, blockOf(f) - b0);
  const o = orderUpTo(seed, b0, i + 1)[i];
  return { zone: o.zone, visit: o.visit, pos: (fl(f) - 1) % FLOORS_PER_THEME };
}

/** 판의 f층 사냥터(지도·몬스터·기믹·우두머리) */
export const towerZone = (seed: number, start: number, f: number): ZoneDef =>
  HUNT_ZONES[towerBlock(seed, start, f).zone];

/** 판의 f층 테마에 몇 번째로 왔나 (0부터). 같은 테마도 다시 올 때마다 조명·몬스터 성질이 달라진다 */
export const towerLoop = (seed: number, start: number, f: number) =>
  towerBlock(seed, start, f).visit;

/** 다시 올 때마다 바뀌는 판 이름 (없으면 빈 말) */
export const towerVisitName = (zone: ZoneDef, visit: number) =>
  zone.visits?.length ? zone.visits[Math.min(zone.visits.length - 1, Math.max(0, visit))].name : "";

// ── 층 배율·저주 ──

/** 몬스터 기본 세기: 테마마다 다른 사냥터 power 대신 하나로 (층이 오를 때 테마가 바뀌어도 약해지지 않게) */
export const TOWER_POWER = 1.2;
/** 층마다 체력·공격력 ×1.06 (5층마다 약 ×1.34), 방어 ×1.023 */
export const TOWER_HP_ATK = 1.06;
export const TOWER_DEF = 1.023;
export const towerHpMul = (f: number) => TOWER_HP_ATK ** fl(f);

/** 5층마다 우두머리 층 */
export const TOWER_BOSS_EVERY = 5;
export const isBossFloor = (f: number) => fl(f) % TOWER_BOSS_EVERY === 0;
/** 우두머리 층을 깨면 최대 체력의 이만큼 회복 (받는 회복 저주는 그대로 걸린다) */
export const TOWER_BOSS_HEAL = 0.3;

export type CurseId =
  | "potion_half"
  | "no_potion"
  | "heal_half"
  | "mon_move"
  | "mon_atk"
  | "time_20"
  | "elite_mix";
/** 층 저주 (누적 — 그 층부터 위로 계속). 엔진에 있는 값만 바꾼다 */
export const CURSES: readonly {
  id: CurseId;
  from: number;
  name: string;
  desc: string;
}[] = [
  {
    id: "potion_half",
    from: 10,
    name: "탕비실 절약",
    desc: "물약 회복량이 절반이 돼요",
  },
  {
    id: "no_potion",
    from: 20,
    name: "탕비실 폐쇄",
    desc: "물약을 마실 수 없어요",
  },
  {
    id: "heal_half",
    from: 30,
    name: "연차 반려",
    desc: "스킬, 재생, 지형, 우두머리 층 회복까지 모두 절반이 돼요",
  },
  {
    id: "mon_move",
    from: 40,
    name: "독촉 메일",
    desc: "몬스터 이동 속도가 20% 빨라져요",
  },
  {
    id: "mon_atk",
    from: 50,
    name: "연달아 회의",
    desc: "몬스터 공격 속도가 20% 빨라져요",
  },
  { id: "time_20", from: 70, name: "마감 당김", desc: "층마다 제한 시간이 20% 줄어요" },
  {
    id: "elite_mix",
    from: 100,
    name: "임원 순시",
    desc: "정예가 일반 몬스터 사이에 섞여 나와요",
  },
];

/** f층에 걸린 저주 */
export const cursesAt = (f: number): CurseId[] =>
  CURSES.filter((c) => f >= c.from).map((c) => c.id);

/** 저주가 바꾸는 값 (게임 HuntScene). revive: 부활 쿠키 — 야근 빌딩은 늘 안 된다 */
export type CurseFx = {
  potionMul: number;
  potions: boolean;
  healMul: number;
  timeMul: number;
  revive: boolean;
  monMove: number;
  monAtk: number;
  eliteMix: boolean;
};
/** 보통 사냥 (저주 없음) */
export const NO_CURSE: CurseFx = {
  potionMul: 1,
  potions: true,
  healMul: 1,
  timeMul: 1,
  revive: true,
  monMove: 1,
  monAtk: 1,
  eliteMix: false,
};
export function towerCurseFx(f: number): CurseFx {
  const on = new Set(cursesAt(f));
  return {
    potionMul: on.has("potion_half") ? 0.5 : 1,
    potions: !on.has("no_potion"),
    healMul: on.has("heal_half") ? 0.5 : 1,
    timeMul: on.has("time_20") ? 0.8 : 1,
    revive: false,
    monMove: on.has("mon_move") ? 1.2 : 1,
    monAtk: on.has("mon_atk") ? 1.2 : 1,
    eliteMix: on.has("elite_mix"),
  };
}

/** monsterStats에 넘기는 f층 몬스터 배율 (기본 세기 TOWER_POWER와 같이 쓴다) */
export function towerScale(f: number): MonsterScale {
  const k = towerHpMul(f);
  return {
    hp: k,
    atk: k,
    def: TOWER_DEF ** fl(f),
    speed: towerCurseFx(f).monMove,
  };
}
/** f층 몬스터 능력치 (지옥 기준) */
export const towerMonsterStats = (id: MonsterId, f: number) =>
  monsterStats(id, "hell", TOWER_POWER, towerScale(f));

/** 층 제한 시간 (초): 보통 층 90초, 우두머리 층 120초. 70층부터 −20% */
export const TOWER_FLOOR_SEC = 90;
export const TOWER_BOSS_FLOOR_SEC = 120;
export const towerFloorSec = (f: number) =>
  Math.round(
    (isBossFloor(f) ? TOWER_BOSS_FLOOR_SEC : TOWER_FLOOR_SEC) *
      towerCurseFx(f).timeMul,
  );
/** 층을 깬 뒤 엘리베이터(문 닫힘 → 층 표시 → 문 열림)에 쓰는 최소 시간 (서버 상한 계산용, 게임은 이보다 조금 길다) */
export const TOWER_GAP_SEC = 2;

// ── 층 계획 (시드로 정해진다 — 서버가 같은 계획으로 결과를 검사한다) ──

/** f층의 시드 (판 시드에서 층마다 다르게) */
export const floorSeed = (seed: number, f: number) =>
  ((seed ^ Math.imul(fl(f), 0x9e3779b1)) >>> 0) & 0x7fffffff;

/** 보통 층 = 웨이브 2개(9·12마리), 우두머리 층 = 웨이브 2개(10마리, 우두머리 + 5마리) */
const FLOOR_WAVES = [9, 12] as const;
const BOSS_WAVES = [10, 7] as const;
const PACK: [number, number] = [5, 7];
const FORMATIONS: readonly WaveFormation[] = [
  "swarm",
  "pincer",
  "surround",
  "stream",
];
const ELITE_CHANCE = 0.35;


/** 판(seed, 시작 층 start)의 f층 계획 */
export function towerPlan(seed: number, f: number, start: number): HuntWave[] {
  const at = towerBlock(seed, start, f);
  const zone0 = HUNT_ZONES[at.zone];
  const r = seeded(floorSeed(seed, f) ^ 0x544f5752);
  const boss = isBossFloor(f);
  const mix = towerCurseFx(f).eliteMix;
  // 11/15 전용 테마: 순서표의 구성 (그 판에서 이 테마에 몇 번째로 왔는지·블록 안 몇 번째 층인지로 — lib/rpg/towerSchedule). 정예도 순서표대로 (둘째 웨이브)
  const roster = floorRoster(zone0.id, at.pos, at.visit);
  const zone = roster ? { ...zone0, pool: roster } : zone0;
  const eliteHere = roster ? floorElite(at.pos, at.visit) : false;
  const sizes = boss ? BOSS_WAVES : FLOOR_WAVES;
  const waves = sizes.map((n, i): HuntWave => {
    const last = boss && i === sizes.length - 1;
    const monsters: MonsterId[] = [];
    if (last) monsters.push(zone.boss);
    const room = n - (last ? 2 : 0);
    const pack =
      i === 0
        ? 0
        : Math.min(room, PACK[0] + Math.floor(r() * (PACK[1] - PACK[0] + 1)));
    // 11/15 순서표 층: 웨이브마다 그 층 몬스터가 한 마리씩은 꼭 나온다 (나머지는 섞어서)
    for (let k = 0; k < room - pack; k++)
      monsters.push(
        roster && k < roster.length
          ? roster[(k + i) % roster.length]
          : zone.pool[Math.floor(r() * zone.pool.length)],
      );
    const packId = zone.pool[Math.floor(r() * zone.pool.length)];
    for (let k = 0; k < pack; k++) monsters.push(packId);
    const formation: WaveFormation =
      i === 0 ? "scatter" : FORMATIONS[Math.floor(r() * FORMATIONS.length)];
    // 정예: 둘째 웨이브부터 가끔, 100층부터(임원 순시)는 우두머리 웨이브 빼고 늘
    let elite: number | undefined;
    const solo = monsters.length - pack;
    const roll = r();
    const want = roster ? mix || (eliteHere && i === 1) : mix || (i > 0 && roll < ELITE_CHANCE);
    if (!last && solo > 0 && want) {
      const k = Math.floor(r() * solo);
      if (!MONSTERS[monsters[k]].minion) elite = k;
      // 11/15 테마 정예(백업 테이프 …)가 있으면 그 자리가 정예로 바뀐다
      if (elite !== undefined && zone.elite) monsters[elite] = zone.elite;
    }
    return {
      index: i,
      monsters,
      earliestSec: i * WAVE_MIN_GAP_SEC,
      boss: last,
      pack,
      formation,
      ...(elite !== undefined ? { elite } : {}),
      ...(last ? { summon: { ...zone.summon } } : {}),
    };
  });
  // 11/15 테마가 층 계획을 손본다 (없으면 그대로)
  const hook = PLAN_HOOKS[zone0.id];
  return hook ? hook(waves, { seed: floorSeed(seed, f), f, loop: at.visit, pos: at.pos }) : waves;
}

export type PlanHook = (plan: HuntWave[], o: { seed: number; f: number; loop: number; pos: number }) => HuntWave[];
/** 11/15 테마별 층 계획 손질 (loop = 그 판에서 이 테마에 몇 번째로 왔나, pos = 블록 안 자리 0~4) */
const PLAN_HOOKS: Partial<Record<ZoneId, PlanHook>> = {
  mt_meeting: meetingPlan,
  rf_rooftop: rooftopPlan,
  ex_exec: execPlan,
  pk_parking: parkingPlan,
  cf_cafeteria: cafeteriaPlan,
};

/** 층을 깨는 데 걸리는 가장 짧은 시간 (마지막 웨이브가 나오는 시각 + 엘리베이터) */
export const floorMinSec = (plan: HuntWave[]) =>
  (plan.length ? plan[plan.length - 1].earliestSec : 0) + TOWER_GAP_SEC;

// ── 체크포인트 ──

/** 10층마다 체크포인트 (1·11·21 …층에서 시작할 수 있다) */
export const TOWER_CHECKPOINT_EVERY = 10;
/** 슈퍼 계정(테스트 서버 운영자)이 고를 수 있는 가장 높은 시작 층 (저주를 미리 보려고) */
export const TOWER_SUPER_START = 101;
export const isCheckpoint = (f: number) =>
  Number.isInteger(f) && f >= 1 && (f - 1) % TOWER_CHECKPOINT_EVERY === 0;
/**
 * 고를 수 있는 시작 층: 1층 + 그 바로 아래층까지 깬 체크포인트 (11/15: 10층을 깨면 11층이 열린다 — 최고 20층 → 1·11·21, 최고 19층 → 1·11)
 */
export function towerCheckpoints(best: number, sup = false): number[] {
  const top = sup ? Math.max(best + 1, TOWER_SUPER_START) : best + 1;
  const out = [1];
  for (
    let f = 1 + TOWER_CHECKPOINT_EVERY;
    f <= top;
    f += TOWER_CHECKPOINT_EVERY
  )
    out.push(f);
  return out;
}

/** 판 시작 검사 (서버). 문제가 없으면 null */
export function checkTowerStart(a: {
  level: number;
  start: number;
  best: number;
  sup: boolean;
}): { code: string; message: string } | null {
  if (a.level < TOWER_MIN_LEVEL)
    return {
      code: "LEVEL_LOW",
      message: `야근 빌딩은 사냥 Lv.${TOWER_MIN_LEVEL}부터 들어갈 수 있어요.`,
    };
  if (!isCheckpoint(a.start))
    return {
      code: "INVALID_INPUT",
      message: "시작 층은 1층, 11층, 21층처럼 10층 간격으로 골라요.",
    };
  if (!towerCheckpoints(a.best, a.sup).includes(a.start))
    return {
      code: "TOWER_LOCKED",
      message: `${a.start}층 버튼은 아직 불이 꺼져 있어요. ${a.start - 1}층 우두머리를 잡으면 켜져요.`,
    };
  return null;
}

// ── 보상 ──

/**
 * 깬 층마다 초월 EXP ≈ 320 × (1 + 0.02 × 층). 4층 = 초월 판 1판이라 낮은 층 4층 ≈ 1,300 — 지옥 사냥 한 판(100% 구간 약 1,270, endgame TRANSCEND_EXP_MUL)과 맞춘다.
 * 30층 ≈ 512 · 50층 640 · 100층 960 (높이 오를수록 같은 판 수에 더 빨리 큰다)
 */
export const TOWER_T_BASE = 320;
export const TOWER_T_GROWTH = 0.02;
export const floorTExp = (f: number) =>
  Math.round(TOWER_T_BASE * (1 + TOWER_T_GROWTH * fl(f)));
/** 깬 4층 = 초월 판 1판 (하루 초월 판 구간 100%·30%·10%·연습에 들어간다) */
export const TOWER_FLOORS_PER_RUN = 4;
/** 하루 우두머리 상자 한도. 11/15: 없앴다 (사냥터에도 판 수 제한이 없으니) — 화면에는 한도 0 = 무제한으로 보낸다 */
export const TOWER_CHESTS_PER_DAY = Infinity;
/** 깬 층마다 포인트 (지옥 한 판 ≈ 80~98P를 4층에 나눈 만큼, 사냥 하루 한도 안) */
export const TOWER_FLOOR_POINTS = 23;

/**
 * 11/15 상자를 여는 우두머리 층 (게임이 판 안에서 여는 순서 = 서버 towerSettle이 주는 순서): start층부터 깬 floors층 중 우두머리 층을,
 * 오늘 이미 연 상자(used) 다음부터 하루 한도까지
 */
export function towerChestFloors(start: number, floors: number, used: number): number[] {
  const out: number[] = [];
  let n = used;
  for (let i = 0; i < floors; i++) {
    const f = start + i;
    if (!isBossFloor(f)) continue;
    if (n >= TOWER_CHESTS_PER_DAY) break;
    n++;
    out.push(f);
  }
  return out;
}

/** f층 우두머리 상자: 지옥 사냥터를 다 깬 판의 드롭 굴림 그대로 (우두머리 몫 + 처치 굴림 + 기간제 코디) — 층 시드로 정해진다 */
export function towerChestDrops(seed: number, f: number, _start: number, pity = 0, sup = false): Drop[] {
  void _start;
  // 11/15: 지옥 드롭표를 그대로 굴리면 상자 넷 중 셋이 비어 있었다 → 상자 전용 굴림.
  // 물약 1~2개는 늘 · 강화 재료 · 세트 장비 15% (7번 연속 못 받으면 다음엔 반드시 — pity = 판 시작 때 못 받은 상자 수, 상자마다 nextPity) ·
  // 꾸미기 10% (층별 등급·랜덤 일수, 깔끔한 클리어와 상관없이) — lib/rpg/setGearRoll.
  // sup = 테스트 서버 슈퍼 계정 시험 드롭 (서버가 계정으로 정한다): 세트 장비·꾸미기가 늘 하나씩
  const fs = floorSeed(seed, f);
  const r = seeded(fs ^ 0x43485354);
  const drops: Drop[] = [];
  const potions = r() < 0.5 ? 1 : 2;
  for (let i = 0; i < potions; i++) drops.push(pickDropPotion(r));
  drops.push(...chestMats(f));
  const sg = chestSetGear(r, f, sup ? SG_PITY : pity);
  if (sg) drops.push(sg);
  const cos = chestCosmetic(fs, f, sup);
  if (cos) drops.push(cos);
  return drops;
}

/** 우두머리 상자에서 세트 장비가 나올 확률 (11/15 일반 장비 자리를 세트 장비가 대신한다) */
export const TOWER_CHEST_GEAR_CHANCE = SG_CHEST_CHANCE;

// ── 기록·랭킹 ──

/** 랭킹 점수: 층 높은 순, 같으면 빨리 오른 순 (ms가 작을수록 크다). 2시간 = 720만 ms < 1e9 */
const MS_SCALE = 1e9;
export const towerScore = (floor: number, ms: number) =>
  Math.max(0, Math.floor(floor)) * MS_SCALE +
  (MS_SCALE - 1 - Math.min(MS_SCALE - 1, Math.max(0, Math.round(ms))));
export const towerOfScore = (score: number) => ({
  floor: Math.floor(score / MS_SCALE),
  ms: MS_SCALE - 1 - (score % MS_SCALE),
});
/** (f1, ms1)이 (f0, ms0)보다 나은 기록인가 */
export const betterRecord = (
  f1: number,
  ms1: number,
  f0: number,
  ms0: number,
) => f1 > f0 || (f1 > 0 && f1 === f0 && ms1 < ms0);

/** 층 칭호 (동·은·금·금·전설) — lib/titles가 같은 값을 쓴다 */
export const FLOOR_TITLE_FLOORS = [10, 20, 30, 50, 100] as const;
/** 서버 최초 (신화, 한 사람만 영원히): 칭호 id → 층. ★100은 t_firstStar100 (초월 레벨) */
export const TOWER_FIRSTS: readonly {
  id: "t_first30" | "t_first50" | "t_first100";
  floor: number;
}[] = [
  { id: "t_first30", floor: 30 },
  { id: "t_first50", floor: 50 },
  { id: "t_first100", floor: 100 },
];
export const FIRST_STAR_ID = "t_firstStar100";

// ── 결과 검증 (서버) ──

/** gp = 11/15 장비 힘 배율 (세트 장비·강화 — 서버가 판 시작 때 쟀다). 처치 속도 상한에 곱한다 */
export type TowerTicket = { seed: number; level: number; start: number; gp?: number };
export type TowerVerdict =
  | {
      ok: true;
      floors: number;
      best: number;
      floorMs: number;
      kills: number;
      points: number;
    }
  /** why = 운영 로그용 자세한 사유 (화면에는 안 보인다) */
  | { ok: false; code: string; message: string; why?: string };

const tReject = (code: string, message: string, why?: string): TowerVerdict => ({
  ok: false,
  code,
  message,
  ...(why ? { why } : {}),
});
const tooHigh = (what: string) =>
  tReject(
    "RESULT_REJECTED",
    `${what} 기록이 이 시간 안에 낼 수 있는 값을 넘었어요. 이번 판은 보상 없이 끝나요.`,
  );

/**
 * 결과 상한 (evaluate의 사냥 검사를 층마다로 늘린 것): 깬 층의 계획 몬스터를 다 잡았고, 깬 층마다 최소 시간이 지났고,
 * 처치 수가 (깬 층 + 지금 층)에서 나올 수 있는 수와 레벨 처치 속도 상한 안. serverElapsedMs = 서버가 잰 시작~지금
 */
export function evalTower(
  t: TowerTicket,
  r: HuntResult,
  serverElapsedMs: number,
  /** 11/15 테스트 서버 슈퍼 계정 (서버가 판정 — 화면 말은 안 믿는다): 처치 속도 상한만 빼고 본다 (테스트용 강화로 빨리 잡는다) */
  o: { lax?: boolean } = {},
): TowerVerdict {
  if (r.game !== "hunt")
    return tReject("INVALID_RESULT", "결과가 시작한 게임과 달라요.");
  if (r.durationMs > serverElapsedMs + CLOCK_SLACK_MS)
    return tReject("TOO_FAST", "기록된 시간이 실제로 흐른 시간보다 길어요.");
  const k = r.floors ?? 0;
  if (!Number.isInteger(k) || k < 0 || k > TOWER_MAX_CLIMB)
    return tReject("INVALID_RESULT", "층 기록 형식이 맞지 않아요.");
  const eff = Math.min(
    r.durationMs,
    serverElapsedMs,
    TOWER_MAX_RUN_SEC * 1000 + CLOCK_SLACK_MS,
  );
  if (eff < MIN_RUN_MS)
    return k > 0
      ? tooHigh("층")
      : { ok: true, floors: 0, best: 0, floorMs: 0, kills: 0, points: 0 };
  const effSec = eff / 1000;
  const can: Partial<Record<MonsterId, number>> = {};
  const need: Partial<Record<MonsterId, number>> = {};
  let minSec = 0;
  for (let i = 0; i <= k; i++) {
    const plan = towerPlan(t.seed, t.start + i, t.start);
    for (const [id, n] of Object.entries(huntSpawnable(plan, Infinity)) as [
      MonsterId,
      number,
    ][])
      can[id] = (can[id] ?? 0) + n;
    if (i === k) break;
    minSec += floorMinSec(plan);
    for (const w of plan)
      for (const m of w.monsters) need[m] = (need[m] ?? 0) + 1;
  }
  let total = 0;
  for (const [id, n] of Object.entries(r.kills) as [MonsterId, number][]) {
    if (!MONSTER_IDS.includes(id) || !Number.isInteger(n) || n < 0)
      return tReject("INVALID_RESULT", "처치 기록 형식이 맞지 않아요.");
    if (n > (can[id] ?? 0)) return tooHigh(MONSTERS[id].name);
    total += n;
  }
  // 11/15 능력 카드: 고른 카드가 그때 제안된 카드인지 시드로 다시 굴려 보고, 처치 속도 상한에 카드 배율(멈추면 집중 포함)을 곱한다
  const bossFloors: number[] = [];
  for (let i = 0; i < k; i++) if (isBossDealFloor(t.start + i)) bossFloors.push(t.start + i);
  // 11/15 카드 등급 개편: 레벨 업 층(높을수록 좋은 등급)은 시작~지금 층, 줄지 않고, 깬 층 몬스터 경험치만으로도 넘는 층보다 늦을 수 없다
  const floorXp: number[] = [];
  let xpAcc = 0;
  for (let i = 0; i < k; i++) {
    for (const w of towerPlan(t.seed, t.start + i, t.start)) for (const m of w.monsters) xpAcc += runXpOf(m);
    floorXp.push(xpAcc);
  }
  const cv = replayPicks(t.seed, r.cards ?? [], {
    // 게임은 처치마다 경험치 × 배율을 소수로 더해 간다 → 문턱에 딱 닿는 판에서 곱셈 한 번과 끝자리가 갈릴 수 있어 아주 조금 여유
    levels: (owned) => runLevel(runXp(r.kills) * cardXpMul(owned) + 1e-6).level,
    starts: startPicks(t.start),
    bossFloors,
    rerolls: rerollsAllowed(k),
    start: t.start,
    top: t.start + k,
    levelFloorMax: (i) => {
      let need = 0;
      for (let L = 0; L <= i; L++) need += runXpNeed(L);
      const j = floorXp.findIndex((x) => x >= need);
      return t.start + (j < 0 ? k : j);
    },
  });
  if (!cv.ok)
    return tReject(
      "RESULT_REJECTED",
      "능력 카드 기록이 맞지 않아요. 이번 판은 보상 없이 끝나요.",
      `cards:${cv.why}`,
    );
  if (!o.lax && total > 3 + effSec * killRateCeiling("hell", t.level) * cardPower(cv.owned) * (t.gp ?? 1))
    return tooHigh("처치 수");
  if (k > 0 && minSec > effSec + 1) return tooHigh("층");
  for (const [id, n] of Object.entries(need) as [MonsterId, number][])
    if ((r.kills[id] ?? 0) < n) return tooHigh("층");
  // 마지막으로 층을 깬 시각 (같은 층이면 빨리 오른 순 랭킹): 판 시간 안, 깬 층의 최소 시간 뒤
  const floorMs =
    k > 0
      ? Math.round(Math.min(eff, Math.max(minSec * 1000, r.floorMs ?? eff)))
      : 0;
  return {
    ok: true,
    floors: k,
    best: k > 0 ? t.start + k - 1 : 0,
    floorMs,
    kills: total,
    points: k * TOWER_FLOOR_POINTS,
  };
}

// ── 판 끝 정산 (캐릭터 저장 한 번 안에서) ──

/** 정산에 쓰는 캐릭터 칸 */
export type TowerState = TDayState & {
  fBest: number;
  fBestMs: number;
  fWk?: string;
  fWkBest: number;
  fWkMs: number;
};

export type TowerSettle = {
  /** 바뀐 칸 (캐릭터에 덮어쓴다) */
  patch: Required<TDayState> & {
    fBest: number;
    fBestMs: number;
    fWk: string;
    fWkBest: number;
    fWkMs: number;
  };
  /** 받은 초월 EXP (구간 비율 적용) */
  tExp: number;
  /** 깬 층마다 구간 (연습 판 층은 EXP 0) */
  tiers: RunTier[];
  /** 이번에 초월 판으로 센 판 수 (4층 = 1판) */
  runs: number;
  /** 상자를 연 우두머리 층 (오늘 상자 한도 안) */
  chests: number[];
  /** 한도 때문에 비어 있던 우두머리 층 수 */
  emptyChests: number;
  /** 이번 판 최고 층 (깬 층이 없으면 0) */
  best: number;
  newBest: boolean;
  newWeek: boolean;
};

/**
 * 깬 층 (start..start+floors−1)을 정산한다: 층마다 초월 EXP(그 층이 들어간 판의 구간 비율), 4층마다 초월 판 1판, 우두머리 층 상자(하루 15개),
 * 최고 기록·이번 주 기록. day = 판을 끝낸 게임 날짜, week = 그 주
 */
export function towerSettle(
  s: TowerState,
  a: {
    day: string;
    week: string;
    start: number;
    floors: number;
    floorMs: number;
  },
): TowerSettle {
  const d = rollDay(s, a.day);
  let { tRuns, tFl, tChest } = d;
  let tExp = 0;
  let runs = 0;
  const tiers: RunTier[] = [];
  const chests: number[] = [];
  let emptyChests = 0;
  for (let i = 0; i < a.floors; i++) {
    const f = a.start + i;
    const tier = runTier(tRuns, d.tBank);
    tiers.push(tier);
    tExp += Math.round(floorTExp(f) * RUN_TIERS[tier].rate);
    if (++tFl >= TOWER_FLOORS_PER_RUN) {
      tFl = 0;
      tRuns++;
      runs++;
    }
    if (isBossFloor(f)) {
      if (tChest < TOWER_CHESTS_PER_DAY) {
        tChest++;
        chests.push(f);
      } else emptyChests++;
    }
  }
  const best = a.floors > 0 ? a.start + a.floors - 1 : 0;
  const ms = a.floorMs;
  const wkBest = s.fWk === a.week ? s.fWkBest : 0;
  const wkMs = s.fWk === a.week ? s.fWkMs : 0;
  const newBest = betterRecord(best, ms, s.fBest, s.fBestMs);
  const newWeek = betterRecord(best, ms, wkBest, wkMs);
  return {
    patch: {
      tDay: d.tDay,
      tRuns,
      tBank: d.tBank,
      tFl,
      tChest,
      fBest: newBest ? best : s.fBest,
      fBestMs: newBest ? ms : s.fBestMs,
      fWk: a.week,
      fWkBest: newWeek ? best : wkBest,
      fWkMs: newWeek ? ms : wkMs,
    },
    tExp,
    tiers,
    runs,
    chests,
    emptyChests,
    best,
    newBest,
    newWeek,
  };
}

// ── 화면 정보 ──

/** 로비·결과·야근 빌딩 화면의 끝판 정보 (레벨 50일 때). day = 오늘 게임 날짜, week = 이번 주, launch = 끝판이 열린 시각(없으면 null) */
export function endgameView(
  c: TowerState & { tLevel: number; pioneer?: { n: number; at: number } },
  day: string,
  week: string,
  launch: number | null,
  sup = false,
): EndgameView {
  const d = rollDay(c, day);
  return {
    tExpToNext: Number.isFinite(tExpToNext(c.tLevel))
      ? tExpToNext(c.tLevel)
      : 0,
    day: {
      runs: d.tRuns,
      full: TDAY_FULL + d.tBank,
      bank: d.tBank,
      tier: runTier(d.tRuns, d.tBank),
      floors: d.tFl,
    },
    tower: {
      best: c.fBest,
      week:
        c.fWk === week && c.fWkBest > 0
          ? { floor: c.fWkBest, ms: c.fWkMs }
          : null,
      checkpoints: towerCheckpoints(c.fBest, sup),
      chests: d.tChest,
      chestsMax: Number.isFinite(TOWER_CHESTS_PER_DAY) ? TOWER_CHESTS_PER_DAY : 0,
    },
    pioneer: {
      until: launch === null ? null : pioneerUntil(launch),
      ...(c.pioneer ? { n: c.pioneer.n, at: c.pioneer.at } : {}),
    },
  };
}

// ── 입구 경비원 (사냥 레벨 50 전) ──

/** 레벨이 모자랄 때 문 앞에서 듣는 한마디 (아무거나 하나) */
export const TOWER_TAUNTS: readonly string[] = [
  `경비원: 사원증 없으시죠? 레벨 ${TOWER_MIN_LEVEL}부터 출입이에요.`,
  `엘리베이터가 당신을 못 본 척합니다. (Lv.${TOWER_MIN_LEVEL}부터)`,
  `너는 아직 너무 나약하다… 레벨 ${TOWER_MIN_LEVEL}에 다시 와.`,
  `야근도 자격이 필요해요. 아직은 칼퇴하세요. (Lv.${TOWER_MIN_LEVEL})`,
  `출입증 인식 실패: 야근 경력 부족 (Lv.${TOWER_MIN_LEVEL}부터)`,
  `경비원: 인턴은 1층 로비까지만이에요. 레벨 ${TOWER_MIN_LEVEL} 되면 올려 보내 드릴게요.`,
  `회전문이 한 바퀴 돌아 당신을 밖에 내려놓았습니다. (Lv.${TOWER_MIN_LEVEL}부터)`,
  `경비원: 여기 야근은 수습 기간 끝나야 시켜 줘요. 레벨 ${TOWER_MIN_LEVEL}에 봬요.`,
  `보안 게이트가 삑— 하고 웁니다. "결재 권한 없음 (Lv.${TOWER_MIN_LEVEL} 필요)"`,
  `경비원: 위층 분들 눈빛이 장난 아니에요. 레벨 ${TOWER_MIN_LEVEL}까지 키우고 오세요.`,
];
export const towerTaunt = (r = Math.random()) =>
  TOWER_TAUNTS[
    Math.min(TOWER_TAUNTS.length - 1, Math.floor(r * TOWER_TAUNTS.length))
  ];

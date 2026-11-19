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
import { chestCosmetic, chestMats, chestSetGear, SG_CHEST_CHANCE } from "./setGearRoll";
// 11/15 능력 카드: 고른 카드 검사·처치 속도 상한 배율
import { CARDS, cardPower, cardXpMul, isBossDealFloor, isCardId, replayPicks, type PickLimits, rerollsAllowed, runLevel, runXp, runXpNeed, runXpOf, startPicks, type CardCounts, type CardId } from "./cards";
// 11/15 층 순서표 (테마마다 층별 몬스터 구성·정예 자리)
import { floorElite, floorRoster } from "./towerSchedule";
import { minDealSec, planHp } from "./dealCap";
// 11/15 끝없는 회의실 층 계획 손질 (참조 메일 상한·무리·중간 우두머리·안건 추가가 불러들이는 몫)
import { meetingPlan } from "./towerThemes/meetingRoomPlan";
// 11/15 옥상 정원 폭풍·임원층 층 계획 손질
import { rooftopPlan } from "./towerThemes/rooftopPlan";
import { execPlan } from "./towerThemes/execPlan";
// 11/15 지하 주차장·구내식당 층 계획 손질 (견인차가 깨우는 경보 차·밥솥 주먹밥·특식 배식 도우미 몫, 젤리·차단기 상한)
import { parkingPlan } from "./towerThemes/parkingPlan";
import { cafeteriaPlan } from "./towerThemes/cafeteriaPlan";

// 11/15 야근 빌딩 (레벨 50 끝판): 1층부터 쓰러질 때까지 이어서 오른다. 한 층 = 방 하나 (11/19 레이스형: 낮은 층은 10초 안팎).
// 순수 함수만 — 서버(판 시작 검사·결과 검증·보상·기록)와 게임(층 계획·배율·저주)·화면(엘리베이터·안내서)이 같은 표를 쓴다.
// 설계: docs/superpowers/specs/2026-11-15-endgame-design.md (야근 빌딩). 숫자는 테스트 서버에서 올라가 보고 다시 맞춘다.

/** 들어갈 수 있는 사냥 레벨 (테스트 서버 슈퍼 계정은 최대 레벨 취급) */
export const TOWER_MIN_LEVEL = MAX_LEVEL;
/** 한 판에 오를 수 있는 층 수 상한 (결과 형식 검사용 — 두 시간에 이만큼은 못 오른다) */
export const TOWER_MAX_CLIMB = 400;
/** 한 판 최대 길이 (화면에 알려 주는 판 시간) */
export const TOWER_MAX_RUN_SEC = 2 * 3600;
/**
 * 11/15 야근 빌딩 티켓 수명 (서버가 결과를 받는 벽시계 시간). 판 화면은 멈춤·카드 고르기·탭 숨김 동안 시간이 안 가서
 * 두 시간 넘게 걸린 정직한 판이 「너무 오래된 판」으로 통째로 날아갈 수 있었다 → 넉넉히. 보상 검사는 게임 시간(durationMs)으로 한다
 */
export const TOWER_TICKET_SEC = 12 * 3600;

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
/*
 * 11/19 레이스형 개편 (사용자 「편하게 노는 게임으로, 100층 단위로 쭉쭉」): 예전엔 1층부터 층마다 ×1.06(체력·공격)·×1.023(방어)라
 * 갓 50은 30층대, 상위권도 110~130층에서 막혔다. 이제 100층까지는 완만하게 오르고, 100층부터 가팔라진다 (높은 층은 장비·카드 연구).
 *  - 1층: 체력·공격 ×TOWER_BASE (예전 1층 ×1.06보다 약하게 — 갓 50도 층당 10초 안팎)
 *  - 2~100층: 층마다 체력 ×TOWER_HP, 공격 ×TOWER_ATK, 방어 ×TOWER_DEF (공격은 더 천천히 — 체력이 낮은 갓 50도 쓰러지지 않고 오르게)
 *  - 101층부터: 층마다 체력 ×TOWER_HP_HIGH, 공격 ×TOWER_ATK_HIGH, 방어 ×TOWER_DEF_HIGH (공격이 더 가파르다 — 버티는 힘·장비 연구)
 */
export const TOWER_BASE = 0.7;
/** 가팔라지기 시작하는 층 */
export const TOWER_STEEP_FROM = 100;
export const TOWER_HP = 1.018;
export const TOWER_ATK = 1.008;
export const TOWER_DEF = 1.01;
export const TOWER_HP_HIGH = 1.075;
export const TOWER_ATK_HIGH = 1.12;
export const TOWER_DEF_HIGH = 1.023;
/** 1층부터 f층까지 층마다 lo배(TOWER_STEEP_FROM층까지)·hi배(그 위) 곱한 값 (1층 = 1) */
const climbMul = (f: number, lo: number, hi: number) =>
  lo ** (Math.min(fl(f), TOWER_STEEP_FROM) - 1) * hi ** Math.max(0, fl(f) - TOWER_STEEP_FROM);
/** f층 몬스터 체력 배율 (안내 화면의 「1층보다 ×…」도 이 값) */
/**
 * 11/19 1~100층 체력을 더 낮춘다 (실제 게임 재현: 갓 Lv50이 3~4층에서 쓰러졌다 — 시뮬은 플레이어 피해를 3배로 잡아 1~100층을 너무 쉽게 봤다).
 * 100층까지 TOWER_EASY_HP배, 100→130층에서 1배로 차츰 돌아간다 (101층 위 막힘 층 설계는 그대로)
 */
export const TOWER_EASY_HP = 0.4;
export const towerEasyHp = (f: number) => (fl(f) <= 100 ? TOWER_EASY_HP : fl(f) >= 130 ? 1 : TOWER_EASY_HP + ((1 - TOWER_EASY_HP) * (fl(f) - 100)) / 30);
export const towerHpMul = (f: number) => TOWER_BASE * climbMul(f, TOWER_HP, TOWER_HP_HIGH) * towerEasyHp(f);
/** f층 몬스터 공격력 배율 */
/** 11/19 1~100층 공격력도 낮춘다 (실제 게임 재현: 피하지 않는 조작으로 모닥불·일꾼 모두 4~5층에서 쓰러졌다). 100→130층에서 1배로 */
export const TOWER_EASY_ATK = 0.6;
export const towerEasyAtk = (f: number) => (fl(f) <= 100 ? TOWER_EASY_ATK : fl(f) >= 130 ? 1 : TOWER_EASY_ATK + ((1 - TOWER_EASY_ATK) * (fl(f) - 100)) / 30);
export const towerAtkMul = (f: number) => TOWER_BASE * climbMul(f, TOWER_ATK, TOWER_ATK_HIGH) * towerEasyAtk(f);
/** f층 몬스터 방어 배율 */
export const towerDefMul = (f: number) => climbMul(f, TOWER_DEF, TOWER_DEF_HIGH);

/** 5층마다 우두머리 층 */
export const TOWER_BOSS_EVERY = 5;
export const isBossFloor = (f: number) => fl(f) % TOWER_BOSS_EVERY === 0;
/**
 * 11/19 야근 빌딩 개편: 우두머리 상자는 이 층부터. 사용자 「아이템 후딱후딱 끼는 게 나을 것 같아서」 — 50층 단위로 두고 상황을 지켜본다
 * (1~50층 상자 없음 · 51~100 사원 · 101~150 대리 · 151~200 과장 · 201~ 임원 — 직급 경계는 setGearRoll SG_GRADE_FLOORS)
 */
export const TOWER_CHEST_FROM = 51;
/** 우두머리 상자가 열리는 층 */
export const isChestFloor = (f: number) => isBossFloor(f) && fl(f) >= TOWER_CHEST_FROM;
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
/**
 * 층 저주 (누적 — 그 층부터 위로 계속). 엔진에 있는 값만 바꾼다.
 * 11/19 레이스형 개편: 예전 10·20·30·40·50·70·100층 → 30·60·100·80·120·140·160층 (회복 절반은 30층 → 100층, 100층 아래는 가볍게)
 */
export const CURSES: readonly {
  id: CurseId;
  from: number;
  name: string;
  desc: string;
}[] = [
  {
    id: "potion_half",
    from: 30,
    name: "탕비실 절약",
    desc: "물약 회복량이 절반이 돼요",
  },
  {
    id: "no_potion",
    from: 60,
    name: "탕비실 폐쇄",
    desc: "물약을 마실 수 없어요",
  },
  {
    id: "heal_half",
    from: 100,
    name: "연차 반려",
    desc: "스킬, 재생, 지형, 우두머리 층 회복까지 모두 절반이 돼요",
  },
  {
    id: "mon_move",
    from: 80,
    name: "독촉 메일",
    desc: "몬스터 이동 속도가 20% 빨라져요",
  },
  {
    id: "mon_atk",
    from: 120,
    name: "연달아 회의",
    desc: "몬스터 공격 속도가 20% 빨라져요",
  },
  { id: "time_20", from: 140, name: "마감 당김", desc: "층마다 제한 시간이 20% 줄어요" },
  {
    id: "elite_mix",
    from: 160,
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

/**
 * 11/19 높은 층 몬스터 회피: TOWER_FLEE_FROM층 위로 층마다 TOWER_FLEE_PER (150층 +40 · 190층 +72).
 * 힘만 찍은 물공은 빗나가기 시작해서 덱스를 나눠 찍어야 한다 (시뮬: 힘 몰빵 139층 → 힘+덱 149층, 마공은 거의 그대로 — 스킬은 늘 맞는다)
 */
export const TOWER_FLEE_FROM = 100;
export const TOWER_FLEE_PER = 0.8;
export const towerFleeAdd = (f: number) => Math.max(0, fl(f) - TOWER_FLEE_FROM) * TOWER_FLEE_PER;

/** monsterStats에 넘기는 f층 몬스터 배율 (기본 세기 TOWER_POWER와 같이 쓴다) */
export function towerScale(f: number): MonsterScale {
  return {
    hp: towerHpMul(f),
    atk: towerAtkMul(f),
    def: towerDefMul(f),
    speed: towerCurseFx(f).monMove,
    flee: towerFleeAdd(f),
  };
}
/** f층 몬스터 능력치 (지옥 기준) */
export const towerMonsterStats = (id: MonsterId, f: number) =>
  monsterStats(id, "hell", TOWER_POWER, towerScale(f));

/** 층 제한 시간 (초): 보통 층 60초, 우두머리 층 90초 (11/19 레이스형: 예전 90·120초). 「마감 당김」 저주부터 −20% */
export const TOWER_FLOOR_SEC = 60;
export const TOWER_BOSS_FLOOR_SEC = 90;
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

/**
 * 11/19 레이스형: 층 안 둘째 웨이브는 첫 웨이브를 다 잡으면 층이 열리고 이만큼 뒤부터 나온다 (보통 사냥터 WAVE_MIN_GAP_SEC 8초 → 3초).
 * 서버의 층 최소 시간(floorMinSec)도 이 값으로 정해진다
 */
export const TOWER_WAVE_GAP_SEC = 3;

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
    // 정예: 둘째 웨이브부터 가끔, 「임원 순시」 저주 층부터는 우두머리 웨이브 빼고 늘
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
      earliestSec: i * TOWER_WAVE_GAP_SEC,
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

/**
 * 11/19 야근 빌딩 처치 속도 상한 (초당): 지옥 사냥 상한 × TOWER_KILL_RATE_MUL.
 * 둘째 웨이브 간격을 8초 → 3초로 줄여 층 최소 시간이 10초 → 5초가 됐다 → 같은 층에서 잡을 수 있는 수의 여유(예전 3 + 10초 × 상한)를 지키려고 ×2
 */
export const TOWER_KILL_RATE_MUL = 2;
export const towerKillRate = (level: number) => killRateCeiling("hell", level) * TOWER_KILL_RATE_MUL;

/** 층을 깨는 데 걸리는 가장 짧은 시간 (마지막 웨이브가 나오는 시각 + 엘리베이터) */
export const floorMinSec = (plan: HuntWave[]) =>
  (plan.length ? plan[plan.length - 1].earliestSec : 0) + TOWER_GAP_SEC;

// ── 체크포인트 ──

/**
 * 엘리베이터(체크포인트) 층. 11/19 개편: 1~100층은 누구나 금방 오르는 레이스 구간이라 10층마다 서지 않는다 →
 * 1층 · 51층(50층 우두머리를 잡았으면) · 101층 · 그 위로 20층마다(121·141·161 …). 예전에 50층 넘게 오른 사람도 같은 규칙이라 51층이 바로 켜진다
 */
export const TOWER_CHECKPOINT_EVERY = 20;
/** 레이스 구간 엘리베이터 (1층 다음은 51·101, 그 뒤로 TOWER_CHECKPOINT_EVERY층마다) */
export const TOWER_LOW_CHECKPOINTS = [1, 51, 101] as const;
const HIGH_FROM = 101;
/** 슈퍼 계정(테스트 서버 운영자)이 고를 수 있는 가장 높은 시작 층 (저주를 미리 보려고) */
export const TOWER_SUPER_START = 101;
export const isCheckpoint = (f: number) =>
  Number.isInteger(f) && ((TOWER_LOW_CHECKPOINTS as readonly number[]).includes(f) || (f > HIGH_FROM && (f - HIGH_FROM) % TOWER_CHECKPOINT_EVERY === 0));
/** top층까지의 엘리베이터 층 (오름차순) */
export function checkpointsUpTo(top: number): number[] {
  const out = TOWER_LOW_CHECKPOINTS.filter((f) => f <= top) as number[];
  for (let f = HIGH_FROM + TOWER_CHECKPOINT_EVERY; f <= top; f += TOWER_CHECKPOINT_EVERY) out.push(f);
  return out;
}
/** f층 다음 엘리베이터 층 */
export const nextCheckpoint = (f: number): number => (f < 51 ? 51 : f < HIGH_FROM ? HIGH_FROM : HIGH_FROM + (Math.floor((f - HIGH_FROM) / TOWER_CHECKPOINT_EVERY) + 1) * TOWER_CHECKPOINT_EVERY);
/**
 * 고를 수 있는 시작 층: 1층 + 그 바로 아래층까지 깬 엘리베이터 층 (50층을 깨면 51층, 100층을 깨면 101층, 120층을 깨면 121층이 열린다)
 */
export function towerCheckpoints(best: number, sup = false): number[] {
  const top = sup ? Math.max(best + 1, TOWER_SUPER_START) : best + 1;
  return checkpointsUpTo(top);
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
      message: "시작 층은 1층, 51층, 101층, 그 위로 20층마다 골라요.",
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
/**
 * 11/19 초월이 너무 빨라 크게 줄였다 (하루 4~5시간 하는 사람 기준): 누구나 금방 오르는 1~100층은 1/4, 101층부터는 1/2.
 * 1층 ≈ 81 · 100층 240 · 101층 482 · 150층 640
 */
export const TOWER_T_LOW_MUL = 0.25;
export const TOWER_T_HIGH_MUL = 0.5;
export const TOWER_T_HIGH_FROM = 101;
export const floorTExp = (f: number) =>
  Math.round(TOWER_T_BASE * (1 + TOWER_T_GROWTH * fl(f)) * (fl(f) >= TOWER_T_HIGH_FROM ? TOWER_T_HIGH_MUL : TOWER_T_LOW_MUL));
/** 깬 4층 = 초월 판 1판 (하루 초월 판 구간 100%·30%·10%·연습에 들어간다) */
export const TOWER_FLOORS_PER_RUN = 4;
/** 하루 우두머리 상자 한도. 11/15: 없앴다 (사냥터에도 판 수 제한이 없으니) — 화면에는 한도 0 = 무제한으로 보낸다 */
export const TOWER_CHESTS_PER_DAY = Infinity;
/** 깬 층마다 포인트 (지옥 한 판 ≈ 80~98P를 4층에 나눈 만큼, 사냥 하루 한도 안) */
export const TOWER_FLOOR_POINTS = 23;
/**
 * 11/19 초월 레벨마다 적정 층 (저층에서 포인트 쓸어 가기 막기 — 사용자): ★(50+t)의 적정 층은 t × TOWER_FIT_PER_T층.
 * 사냥터와 같이 적정보다 TOWER_POINT_GRACE층 넘게 낮은 층은 포인트를 주지 않는다 (초월 EXP·상자·기록은 그대로).
 * ★60 → 20층(10층부터 포인트) · ★80 → 60층(50층부터) · ★100 → 100층(90층부터)
 */
export const TOWER_FIT_PER_T = 2;
export const TOWER_POINT_GRACE = 10;
export const towerFitFloor = (tLevel: number) => Math.max(1, Math.floor(Math.max(0, tLevel)) * TOWER_FIT_PER_T);
/** 이 층부터 포인트를 준다 */
export const towerPointFrom = (tLevel: number) => Math.max(1, towerFitFloor(tLevel) - TOWER_POINT_GRACE);
/** start층부터 깬 floors층의 포인트 (적정보다 낮은 층은 0). 초월 레벨은 판을 시작할 때 값 */
export function towerRunPoints(start: number, floors: number, tLevel: number): { points: number; free: number } {
  const from = towerPointFrom(tLevel);
  const n = Math.max(0, Math.floor(floors));
  const free = Math.max(0, Math.min(n, from - start));
  return { points: (n - free) * TOWER_FLOOR_POINTS, free };
}

/**
 * 11/15 상자를 여는 우두머리 층 (게임이 판 안에서 여는 순서 = 서버 towerSettle이 주는 순서): start층부터 깬 floors층 중 우두머리 층을,
 * 오늘 이미 연 상자(used) 다음부터 하루 한도까지
 */
export function towerChestFloors(start: number, floors: number, used: number): number[] {
  const out: number[] = [];
  let n = used;
  for (let i = 0; i < floors; i++) {
    const f = start + i;
    if (!isChestFloor(f)) continue;
    if (n >= TOWER_CHESTS_PER_DAY) break;
    n++;
    out.push(f);
  }
  return out;
}

/** f층 우두머리 상자: 지옥 사냥터를 다 깬 판의 드롭 굴림 그대로 (우두머리 몫 + 처치 굴림 + 기간제 코디) — 층 시드로 정해진다 */
export function towerChestDrops(seed: number, f: number, _start: number, _pity = 0, sup = false): Drop[] {
  // 11/19 천장을 없앴다 (_pity는 부르는 쪽 모양을 그대로 두려고 받기만 한다)
  void _start;
  void _pity;
  // 11/15: 지옥 드롭표를 그대로 굴리면 상자 넷 중 셋이 비어 있었다 → 상자 전용 굴림.
  // 물약 1~2개는 늘 · 강화 재료 · 세트 장비 2% (11/19 천장 없음) · 꾸미기 3% (층별 등급·랜덤 일수, 깔끔한 클리어와 상관없이) — lib/rpg/setGearRoll.
  // sup = 테스트 서버 슈퍼 계정 시험 드롭 (서버가 계정으로 정한다): 세트 장비·꾸미기가 늘 하나씩
  const fs = floorSeed(seed, f);
  const r = seeded(fs ^ 0x43485354);
  const drops: Drop[] = [];
  const potions = r() < 0.5 ? 1 : 2;
  for (let i = 0; i < potions; i++) drops.push(pickDropPotion(r));
  drops.push(...chestMats(f));
  const sg = chestSetGear(r, f, sup);
  if (sg) drops.push(sg);
  const cos = chestCosmetic(fs, f, sup);
  if (cos) drops.push(cos);
  return drops;
}

/** 우두머리 상자에서 세트 장비가 나올 확률 (11/15 일반 장비 자리를 세트 장비가 대신한다) */
export const TOWER_CHEST_GEAR_CHANCE = SG_CHEST_CHANCE;

// ── 기록·랭킹 ──

/**
 * 11/16 랭킹 점수: 층 높은 순, 같은 층이면 그 층에 먼저 도달한 사람이 위 (예전엔 「그 판 시작부터 빨리 깬 순」 —
 * 체크포인트(10층마다)에서 시작한 판이 1층부터 오른 판보다 늘 빨라서 불공평했다).
 * 점수 = 층 × 1e9 + (5e8 − 1 − TOWER_EPOCH부터 지난 초). 일찍 도달할수록 크다. 5억 초 ≈ 15년 넘게 쓴다.
 * 이 바꿈 전에 쓴 점수(옛 점수)는 층 × 1e9 + (1e9 − 1 − 판 시간 ms)라서 나머지가 5e8 이상 (판 시간은 12시간 = 4,320만 ms 안).
 * → 같은 층이면 옛 점수가 새 점수보다 위 (다 더 먼저 도달한 기록이니 「먼저 도달」 순서와 맞다), 옛 점수끼리는 예전 순서 그대로
 */
const MS_SCALE = 1e9;
/** 도달 시각 칸 크기 (초). 나머지가 이 이상이면 옛 점수 */
const AT_SCALE = 5e8;
/** 11/16 도달 시각을 세는 기준 (2026-11-01 0시 KST) */
export const TOWER_EPOCH = Date.UTC(2026, 9, 31, 15);
export const towerScore = (floor: number, at: number) =>
  Math.max(0, Math.floor(floor)) * MS_SCALE +
  (AT_SCALE - 1 - Math.min(AT_SCALE - 1, Math.max(0, Math.floor((at - TOWER_EPOCH) / 1000))));
/** 점수 → 층 · 도달 시각(ms, 옛 점수면 null — 그때는 legacyMs에 그 판 시간) */
export type TowerScoreInfo = { floor: number; at: number | null; legacyMs?: number };
export function towerOfScore(score: number): TowerScoreInfo {
  const floor = Math.floor(score / MS_SCALE);
  const frac = score - floor * MS_SCALE;
  if (frac >= AT_SCALE) return { floor, at: null, legacyMs: MS_SCALE - 1 - frac };
  return { floor, at: TOWER_EPOCH + (AT_SCALE - 1 - frac) * 1000 };
}
/** 11/16 옛 점수(도달 시각 없음)를 쓴 마지막 날 — 「11월 16일 이전에 도달」 (이전은 그날 포함) */
export const TOWER_LEGACY_DAY = "11월 16일";
/** 11/16 랭킹 줄 아래 말: 「11월 16일 오후 2:32에 도달」 (한국 시간). 옛 점수는 지어낸 시각 대신 「11월 16일 이전에 도달」 */
export function towerReachedLabel(at: number | null): string {
  if (at === null) return `${TOWER_LEGACY_DAY} 이전에 도달`;
  const d = new Date(at + 9 * 3_600_000);
  const h = d.getUTCHours();
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${mm}에 도달`;
}
/** 11/16 그 판에서 꼭대기 층을 깬 시각: 판 시작(서버 티켓 시각) + 그 층을 깬 게임 시간(서버가 판 시간 안으로 자른 값). 판 시작~지금 안으로 */
export const towerArrival = (runStart: number, floorMs: number, now: number) =>
  Math.min(now, Math.max(runStart, runStart + Math.max(0, floorMs)));
/** 11/16 오른 시간 「20분 14초」 (한 시간 넘으면 「1시간 3분 5초」, 1분 안이면 「42초」). 시계 모양 20:14는 시각으로 읽혀서 바꿨다 */
export function climbTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h ? `${h}시간` : "", h || m ? `${m}분` : "", `${sec}초`].filter(Boolean).join(" ");
}

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
export type TowerTicket = {
  seed: number;
  level: number;
  start: number;
  gp?: number;
  /** 11/18 한 마리에게 넣을 수 있는 초당 최대 피해 (판 시작 때 서버가 잰 값 — lib/rpg/dealCap). 없으면(옛 티켓) 이 검사는 건너뛴다 */
  dm?: number;
};
export type TowerVerdict =
  | {
      ok: true;
      floors: number;
      best: number;
      floorMs: number;
      kills: number;
      points: number;
      /**
       * 11/15 「부드러운 거절」: 계산 오차일 수 있는 검사(카드 기록·몬스터별 출현 상한·처치 속도·층 시간·깬 층 처치)에 조금 걸린 판.
       * 층·초월 EXP·상자·포인트는 그대로 주고 랭킹·주간 기록·서버 최초·최고층 기록 보유자에서만 뺀다 (사유 목록 — 운영 로그용)
       */
      suspect?: string[];
      /** 11/16 몬스터 도감에 더할 처치 수 (의심 판이 아닐 때만 — 몬스터마다 출현 상한 안) */
      mobs?: Partial<Record<MonsterId, number>>;
    }
  /** why = 운영 로그용 자세한 사유 (화면에는 안 보인다) */
  | { ok: false; code: string; message: string; why?: string };

const tReject = (code: string, message: string, why?: string): TowerVerdict => ({
  ok: false,
  code,
  message,
  ...(why ? { why } : {}),
});
/**
 * 11/15 층마다 테마 졸개(catalog minion)를 계획 밖으로 더 셀 수 있는 수 — 안전 여유.
 * 판 화면이 더 불러내는 몬스터는 이제 모두 층 계획(summon·adds·분열·복사·되살리기)에 같은 상수로 들어간다
 * (옥상 피뢰침 불꽃 RF_SPARK_CAP도 우두머리 웨이브 adds). 그래도 놓친 변수가 있으면 판을 버리지 않게 졸개만 조금 더 센다
 */
export const MINION_FLOOR_ALLOW = 2;

/*
 * 11/15 부드러운 거절 (한도 없음): 계산·게임 쪽 변수로 넘을 수 있는 검사는 얼마나 넘든 판을 버리지 않고 의심 판(suspect)으로 받는다
 * (보상은 그대로, 랭킹·주간 기록·서버 최초·최고층 기록 보유자에서만 빠지고 체크포인트는 fSus로 열린다):
 *  - 몬스터별 출현 상한 (그 판에 오지 않은 테마의 몬스터도 — 테마끼리 몬스터를 빌려 쓰는 변경이 생겨도 판을 버리지 않게)
 *  - 처치 속도 상한 · 층 최소 시간 · 깬 층 계획 몬스터 부족 · 카드 기록
 * 거절(보상 없음)은 위조가 확실한 형식·시간만: 시간 형식(zod) · 서버가 잰 시간보다 긴 기록(+CLOCK_SLACK_MS) · 층 수 0~TOWER_MAX_CLIMB 밖 ·
 * 처치 기록 형식(음수·정수 아님·모르는 몬스터 id) · 깬 층 최소 시간의 절반도 안 걸린 판
 */

/** 테마 몬스터 id 앞자리 (sv_·mt_·rf_ …) — 그 판에 온 테마의 몬스터인지 (우두머리 id로 정한다) */
const themePrefix = (zone: ZoneDef) => `${zone.boss.split("_")[0]}_`;

/** 카드 기록이 맞지 않을 때 처치 속도 상한에 쓰는 가진 카드 (실린 기록 그대로, 장마다 최대 겹침까지) */
function claimedCards(picks: readonly { c: string }[]): CardCounts {
  const o: CardCounts = {};
  for (const p of picks) {
    const id = p?.c as CardId;
    if (!isCardId(id)) continue;
    o[id] = Math.min(CARDS[id].max, (o[id] ?? 0) + 1);
  }
  return o;
}

/**
 * 결과 상한 (evaluate의 사냥 검사를 층마다로 늘린 것): 깬 층의 계획 몬스터를 다 잡았고, 깬 층마다 최소 시간이 지났고,
 * 처치 수가 (깬 층 + 지금 층)에서 나올 수 있는 수와 레벨 처치 속도 상한 안. serverElapsedMs = 서버가 잰 시작~지금.
 * 이 검사들은 넘어도 거절하지 않고 의심 판(suspect)으로 통과시킨다 (위 「부드러운 거절」)
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
    return tReject("TOO_FAST", "기록된 시간이 실제로 흐른 시간보다 길어요.", `duration:${r.durationMs}>${serverElapsedMs}`);
  const k = r.floors ?? 0;
  if (!Number.isInteger(k) || k < 0 || k > TOWER_MAX_CLIMB)
    return tReject("INVALID_RESULT", "층 기록 형식이 맞지 않아요.", `floors:${k}`);
  const eff = Math.min(r.durationMs, serverElapsedMs, TOWER_TICKET_SEC * 1000 + CLOCK_SLACK_MS);
  // 8초 미만 판: 깬 층이 없으면 보상 없이 끝. 층이 있으면 아래 층 최소 시간 검사가 의심 판으로 잡는다
  if (eff < MIN_RUN_MS && k === 0) return { ok: true, floors: 0, best: 0, floorMs: 0, kills: 0, points: 0 };
  const effSec = eff / 1000;
  const suspect: string[] = [];
  const can: Partial<Record<MonsterId, number>> = {};
  const need: Partial<Record<MonsterId, number>> = {};
  const prefixes = new Set<string>();
  let minSec = 0;
  for (let i = 0; i <= k; i++) {
    const plan = towerPlan(t.seed, t.start + i, t.start);
    prefixes.add(themePrefix(towerZone(t.seed, t.start, t.start + i)));
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
  // 테마 졸개 안전 여유 (위 MINION_FLOOR_ALLOW). 전체 처치 수는 아래 처치 속도 상한이 막는다
  for (const id of MONSTER_IDS) if (MONSTERS[id].minion && (can[id] !== undefined || [...prefixes].some((p) => id.startsWith(p)))) can[id] = (can[id] ?? 0) + (k + 1) * MINION_FLOOR_ALLOW;
  let total = 0;
  for (const [id, n] of Object.entries(r.kills) as [MonsterId, number][])
    if (!MONSTER_IDS.includes(id) || !Number.isInteger(n) || n < 0)
      return tReject("INVALID_RESULT", "처치 기록 형식이 맞지 않아요.", `kill:${id}`);
  for (const [id, n] of Object.entries(r.kills) as [MonsterId, number][]) {
    total += n;
    const c = can[id] ?? 0;
    if (n <= c) continue;
    // 그 판에 온 테마의 몬스터가 아니어도 의심 판으로만 (표시를 붙여 운영 로그에서 바로 보이게)
    suspect.push(`kill:${id}:${n}/${c}${!c && ![...prefixes].some((p) => id.startsWith(p)) ? " (theme)" : ""}`);
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
  const lim: PickLimits = {
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
  };
  // 11/19 제안 묶음: 3(넋 카드 + 주력 갈래 가중치 — 갈래는 화면이 스킬 배분으로 정한다, 갈래마다 다시 굴려 본다) → 2(마공 카드) → 1(그 전).
  //  옛 화면·배포 전에 시작한 판은 옛 묶음으로 맞는다. 제안이 안 맞을 때만 다음 후보로
  const tries: PickLimits[] = [
    ...([null, "ember", "frost", "soul", "worker"] as const).map((main) => ({ ...lim, ver: 3 as const, main })),
    { ...lim, ver: 2 },
    { ...lim, ver: 1 },
  ];
  let cv = replayPicks(t.seed, r.cards ?? [], tries[0]);
  for (let j = 1; j < tries.length && !cv.ok && cv.why === "offer"; j++) cv = replayPicks(t.seed, r.cards ?? [], tries[j]);
  // 11/15 카드 기록이 맞지 않아도 판은 버리지 않는다 (예전 판 끝 형식이 레벨 업 층 f를 지워 정직한 판이 통째로 날아갔다)
  if (!cv.ok) suspect.push(`cards:${cv.why}`);
  const owned = cv.ok ? cv.owned : claimedCards(r.cards ?? []);
  const rate = 3 + effSec * towerKillRate(t.level) * cardPower(owned) * Math.max(1, t.gp ?? 1);
  if (!o.lax && total > rate) suspect.push(`rate:${total}/${Math.floor(rate)}`);
  // 11/15 깬 층 최소 시간의 절반도 안 걸린 판은 사람이 할 수 없는 속도라 거절 (절반~최소 사이는 의심 판)
  if (k > 0 && effSec + 1 < minSec / 2)
    return tReject("RESULT_REJECTED", "층을 깬 속도가 너무 빨라요. 이번 판은 보상 없이 끝나요.", `floorTime:${minSec}s/${Math.round(effSec)}s`);
  if (k > 0 && minSec > effSec + 1) suspect.push(`floorTime:${minSec}s/${Math.round(effSec)}s`);
  // 11/18 「그 속도로 때릴 수 있나」: 깬 층 몬스터 체력 합을 넣을 수 있는 최대 피해로 나눈 시간보다 빨랐으면 의심 판 (피하기·버티기는 보지 않는다)
  if (t.dm && k > 0) {
    let hp = 0;
    for (let i = 0; i < k; i++) hp += planHp(towerPlan(t.seed, t.start + i, t.start), (id) => towerMonsterStats(id, t.start + i).maxHp);
    const need = minDealSec(hp, t.dm, cardPower(owned));
    if (effSec + 1 < need) suspect.push(`deal:${Math.round(need)}s/${Math.round(effSec)}s`);
  }
  let short = 0;
  const shortIds: string[] = [];
  for (const [id, n] of Object.entries(need) as [MonsterId, number][]) {
    const got = r.kills[id] ?? 0;
    if (got >= n) continue;
    short += n - got;
    shortIds.push(`${id}:${got}/${n}`);
  }
  // 깬 층 계획 몬스터를 절반도 못 잡았다고 적힌 판은 계산 차이로 생길 수 없다 (처치 없이 층 수만 적은 위조) → 거절
  const needTotal = Object.values(need).reduce((a, n) => a + (n ?? 0), 0);
  if (needTotal > 0 && short * 2 > needTotal)
    return tReject("RESULT_REJECTED", "깬 층의 몬스터 기록이 너무 모자라요. 이번 판은 보상 없이 끝나요.", `need:${short}/${needTotal}`);
  if (short > 0) suspect.push(`need:${short} ${shortIds.slice(0, 6).join(",")}`);
  // 마지막으로 층을 깬 시각 (판 시작부터 — 11/16 판 시작 시각에 더해 랭킹 도달 시각이 된다): 판 시간 안, 깬 층의 최소 시간 뒤
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
    // 11/16 몬스터 도감: 의심 판이 아닐 때만 (몬스터마다 출현 상한 안이라는 게 확인된 처치 수)
    ...(suspect.length ? { suspect } : total > 0 ? { mobs: { ...r.kills } } : {}),
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
  /** 11/15 의심 판(부드러운 거절)으로 오른 가장 높은 층 — 체크포인트만 연다 (최고 기록·랭킹·칭호는 확인된 판 fBest로) */
  fSus?: number;
};

/** 체크포인트를 여는 층 (확인된 최고 기록과 의심 판 층 중 높은 쪽) */
export const towerReach = (s: { fBest: number; fSus?: number }) => Math.max(s.fBest, s.fSus ?? 0);

export type TowerSettle = {
  /** 바뀐 칸 (캐릭터에 덮어쓴다) */
  patch: Required<TDayState> & {
    fBest: number;
    fBestMs: number;
    fWk: string;
    fWkBest: number;
    fWkMs: number;
    fSus?: number;
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
    /** 11/15 의심 판: 층·EXP·상자는 그대로, 최고 기록·이번 주 기록은 그대로 두고 fSus(체크포인트용)만 올린다 */
    suspect?: boolean;
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
    if (isChestFloor(f)) {
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
  // 11/16 기록은 층이 오를 때만 (같은 층을 더 빨리 다시 올라도 그대로 — 랭킹은 그 층에 먼저 도달한 순이라 첫 도달을 지킨다).
  // 이번 주 첫 판은 wkBest 0이라 전체 최고보다 낮아도 주간 기록이 생긴다
  const newBest = !a.suspect && best > s.fBest;
  const newWeek = !a.suspect && best > wkBest;
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
      ...(a.suspect && best > (s.fSus ?? 0) ? { fSus: best } : {}),
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
      checkpoints: towerCheckpoints(towerReach(c), sup),
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

/** 11/15 깨끗하게 통과한 판인가 (거절도 의심 판도 아님) — 테스트·운영 도구용 */
export const towerClean = (v: TowerVerdict): boolean => v.ok && !v.suspect;

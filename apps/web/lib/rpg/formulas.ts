import { DIFFS, gearById, GEAR_SLOTS, MONSTERS, STAT_KEYS, type Bonus, type Difficulty, type GearSlot, type MonsterId, type Stats } from "./catalog";
import { weaponArea } from "./weapons";

// 성장·전투 공식 (서버 검증과 게임이 같은 함수를 쓴다). 숫자는 라그나로크 느낌을 살리되 단순하게.

export const MAX_LEVEL = 50;
export const STAT_MAX = 99;
export const START_STAT_POINTS = 5;
export const START_SKILL_POINTS = 1;

/** 다음 레벨까지 필요한 EXP. 1→2: 50, 10→11: 816, 30→31: 4,133, 49→50: 8,600 (최대 레벨이면 Infinity) */
export function expToNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  return Math.round(25 * level ** 1.5 + 25);
}

/** 그 레벨에 오를 때 받는 능력치 포인트: 3, 5의 배수 레벨엔 5 */
export const statPointsAt = (newLevel: number) => (newLevel % 5 === 0 ? 5 : 3);
/** 그 레벨에 오를 때 받는 스킬 포인트: 1, 10의 배수 레벨엔 2 */
export const skillPointsAt = (newLevel: number) => (newLevel % 10 === 0 ? 2 : 1);

/** EXP를 더하고 레벨업을 처리한다 (최대 레벨이면 EXP는 0으로 둔다) */
export function applyExp(
  level: number,
  exp: number,
  gained: number,
): { level: number; exp: number; levelsGained: number; statPoints: number; skillPoints: number } {
  let lv = level;
  let e = exp + Math.max(0, Math.floor(gained));
  let statPoints = 0;
  let skillPoints = 0;
  while (lv < MAX_LEVEL && e >= expToNext(lv)) {
    e -= expToNext(lv);
    lv++;
    statPoints += statPointsAt(lv);
    skillPoints += skillPointsAt(lv);
  }
  if (lv >= MAX_LEVEL) e = 0;
  return { level: lv, exp: e, levelsGained: lv - level, statPoints, skillPoints };
}

export const baseStats = (): Stats => ({ str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 });

/** 장착 장비 보너스 합계 */
export function gearBonus(equip: Partial<Record<GearSlot, string | null>>): Required<Bonus> {
  const out: Required<Bonus> = { ...baseStatsZero(), atk: 0, def: 0, hp: 0, sp: 0, aspd: 0, crit: 0, hit: 0, flee: 0, move: 0 };
  for (const slot of GEAR_SLOTS) {
    const id = equip[slot];
    const g = id ? gearById(id) : undefined;
    if (!g) continue;
    for (const [k, v] of Object.entries(g.bonus) as [keyof Bonus, number][]) out[k] += v;
  }
  return out;
}

function baseStatsZero(): Stats {
  return { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
}

export type Derived = {
  /** 장비까지 더한 최종 능력치 */
  stats: Stats;
  maxHp: number;
  maxSp: number;
  atk: number;
  def: number;
  /** 초당 공격 횟수 */
  aspd: number;
  /** % */
  crit: number;
  hit: number;
  flee: number;
  /** px/s */
  move: number;
  /** 스킬 위력 배율 */
  skillPower: number;
};

/** STR 1당 ATK (7번: 예전 2는 피해 흔들림 ±10%에 묻혀 STR을 올려도 티가 안 났다) */
export const ATK_PER_STR = 3;

export function derive(level: number, stats: Stats, equip: Partial<Record<GearSlot, string | null>>): Derived {
  const b = gearBonus(equip);
  const s = Object.fromEntries(STAT_KEYS.map((k) => [k, stats[k] + b[k]])) as Stats;
  return {
    stats: s,
    maxHp: Math.round((90 + level * 14 + b.hp) * (1 + s.vit * 0.02)),
    maxSp: Math.round((24 + level * 3 + b.sp) * (1 + s.int * 0.02)),
    atk: s.str * ATK_PER_STR + Math.floor(s.dex / 4) + Math.floor(s.luk / 5) + level + b.atk,
    def: b.def + Math.floor(s.vit / 2),
    // 재미 위주: 기본 공격을 초당 3회로(후딜레이 약 0.33초). 어려움은 몬스터 패턴으로 준다
    aspd: round2(clamp(3 + s.agi * 0.03 + s.dex * 0.01 + b.aspd, 1, 6)),
    crit: round2(clamp(1 + s.luk * 0.3 + b.crit, 0, 60)),
    hit: level + s.dex + b.hit,
    flee: level + s.agi + Math.floor(s.luk / 5) + b.flee,
    move: Math.round(80 + s.agi * 0.5 + b.move),
    skillPower: round2(1 + s.int * 0.015),
  };
}

// ── 전투 ──

/** 명중률 (라그나로크: 80 + HIT - FLEE %) */
export const hitChance = (hit: number, flee: number) => clamp((80 + hit - flee) / 100, 0.05, 0.98);

/** 방어에 따른 피해 배율 */
export const defFactor = (def: number) => 100 / (100 + Math.max(0, def) * 2);

/**
 * 물리 피해. roll ∈ [0,1) 로 ±10% 흔들림, 치명타는 1.5배에 방어 무시.
 * vuln: 코드 리뷰로 약해진 정도 (0.3 = 30% 더 받음)
 */
export function damage(atk: number, mult: number, def: number, roll: number, crit: boolean, vuln = 0): number {
  const base = atk * mult * (0.9 + 0.2 * roll) * (1 + vuln);
  return Math.max(1, Math.round(crit ? base * 1.5 : base * defFactor(def)));
}

/**
 * 기본 공격 범위: 바라보는 쪽 부채꼴 (반지름 px, 펼친 각도 °). 안에 든 몬스터를 모두 때린다 (42번).
 * 무기마다 다르다 (GearDef.area, 없으면 공격 방식 style의 기본 — 40번 무기 특색). 몸이 겹칠 만큼 가까우면 방향과 상관없이 맞는다.
 */
export type AttackArea = { range: number; arcDeg: number };
export const DEFAULT_ATTACK_AREA: AttackArea = { range: 26, arcDeg: 120 };

export function attackArea(equip: Partial<Record<GearSlot, string | null>>): AttackArea {
  const w = equip.weapon ? gearById(equip.weapon) : undefined;
  return w ? weaponArea(w) : DEFAULT_ATTACK_AREA;
}

/** 부채꼴 판정: (dx,dy)는 나→몬스터, face는 단위 벡터, r은 몬스터 몸 반지름 */
export function inAttackArea(area: AttackArea, face: { x: number; y: number }, dx: number, dy: number, r: number): boolean {
  const d = Math.hypot(dx, dy);
  if (d - r > area.range) return false;
  if (d <= r + 6) return true;
  const cos = (dx * face.x + dy * face.y) / d;
  // 몸 반지름만큼 각도를 넓혀 준다 (가장자리에 걸친 몬스터도 맞게)
  const half = (area.arcDeg / 2) * (Math.PI / 180) + Math.atan2(r, d);
  return cos >= Math.cos(Math.min(Math.PI, half));
}

/**
 * 45번(출몰량 약 1.75배) 때 한 단계 올린 몬스터: 체력 ×1.2, 공격력 ×1.15.
 * 마리당 EXP는 ×0.6 (마리 수가 늘어도 한 판 총 EXP가 크게 늘지 않게).
 */
export const MONSTER_TIER = { hp: 1.2, atk: 1.15, exp: 0.6 } as const;

export type MonsterStats = { maxHp: number; atk: number; def: number; hit: number; flee: number; speed: number; exp: number };

/** 난이도를 반영한 몬스터 능력치. power: 사냥터 배율 (40번, 같은 난이도에서 뒤에 열리는 곳일수록 조금 세다 — ZoneDef.power) */
export function monsterStats(id: MonsterId, d: Difficulty, power = 1): MonsterStats {
  const m = MONSTERS[id];
  const D = DIFFS[d];
  const lv = D.monsterLevel;
  return {
    maxHp: Math.round(m.hp * D.hpMul * MONSTER_TIER.hp * power),
    atk: Math.round(m.atk * D.atkMul * MONSTER_TIER.atk * power),
    def: Math.round(m.def * D.defMul),
    hit: 10 + lv * 2,
    flee: 6 + lv * 2,
    speed: m.speed * (d === "hell" ? 1.2 : d === "hard" ? 1.1 : 1),
    exp: Math.max(1, Math.round(m.exp * D.expMul * MONSTER_TIER.exp * power)),
  };
}

/**
 * EXP·주간 레이스 기준 레벨: 사냥터면 그 사냥터가 열리는 레벨(ZoneDef.unlockLevel), 미니게임(사냥터 없음)이면 난이도 권장 레벨.
 * 11/15: 지옥에도 40~50대 사냥터가 생겨서 난이도가 아니라 사냥터를 기준으로 본다
 */
export function refLevel(d: Difficulty, zone?: { unlockLevel: number } | null): number {
  return zone ? zone.unlockLevel : DIFFS[d].recLevel;
}

/**
 * 기준 레벨(refLevel)보다 너무 높은 레벨로 쉬운 곳을 돌면 EXP가 준다: +10 넘으면 10%, +20 넘으면 2%.
 * 11/15: 지옥 예외(+10 넘어도 절반)는 없앴다 — 41~50은 새 지옥 사냥터(Lv.42·48)로 간다
 */
export function levelPenalty(level: number, d: Difficulty, zone?: { unlockLevel: number } | null): number {
  const over = level - refLevel(d, zone);
  return over > 20 ? 0.02 : over > 10 ? 0.1 : 1;
}

/** 이 판이 주간 레이스(그 주 처치·최단)에 들어가는지: 기준 레벨(사냥터가 열리는 레벨) +10 이하 */
export function countsForRace(level: number, d: Difficulty, zone?: { unlockLevel: number } | null): boolean {
  return level - refLevel(d, zone) <= 10;
}

// ── 공용 ──

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 시드 고정 난수 (mulberry32). 서버 검증과 게임이 같은 순서로 뽑는다 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

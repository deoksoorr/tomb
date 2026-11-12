import type { Difficulty, MonsterBehavior, MonsterDef } from "./catalog";

// 2번 몬스터 공격 패턴 + 범위 미리 표시 (텔레그래프).
// 몬스터는 공격 전에 바닥에 빨간 경고 모양(원·줄·부채꼴·고리)을 깔고, 안이 차오른 뒤에 친다 → 보고 피할 수 있다.
// 패턴은 이름(PatternId)으로 고른다: 몬스터 정의(MonsterDef.patterns·phases)가 이름만 적으면 되고,
// 없으면 행동(behavior)마다 기본 패턴을 쓴다. 실제 움직임·그리기는 game/rpg/patterns.ts가 이 표대로 한다.
// 서버 검증과는 상관없다 (처치 수·시간만 본다).

/** 경고 모양. 기준점(ox,oy)과 방향(angle, 라디안)은 패턴을 시작할 때 정한다 */
export type TelegraphShape =
  | { kind: "circle"; r: number }
  /** 기준점에서 angle 방향으로 len, 폭 width */
  | { kind: "line"; len: number; width: number }
  /** 기준점에서 angle 방향 부채꼴 */
  | { kind: "cone"; r: number; arcDeg: number }
  /** 도넛: r0 ~ r1 사이 (보스 가까이 붙으면 안전) */
  | { kind: "ring"; r0: number; r1: number };

export type PatternId =
  | "bite" // 붙어서 물기: 짧은 부채꼴 (기존 몸통 박치기를 피할 수 있게)
  | "slam" // 내 발밑에 원 → 내려찍기
  | "charge" // 줄 → 그 줄을 따라 돌진
  | "aimed_shot" // 가는 줄 → 그쪽으로 한 발
  | "fan_volley" // 부채꼴로 여러 발
  | "self_destruct" // 멈춰서 부풀다 원으로 터진다
  | "ambush" // 사라졌다가 내 둘레 원 자리에 나타나며 찍는다
  | "nova" // 보스 둘레 도넛
  | "rain" // 내 둘레 여러 곳에 원
  | "cross" // 내 자리를 지나는 십자 두 줄
  | "breath"; // 넓은 부채꼴 (보스)

/** 경고가 어디에 깔리나: self = 몬스터 자리, target = 내 자리(그 순간), around = 내 둘레 여러 곳 */
export type PatternAnchor = "self" | "target" | "around";

export type PatternSpec = {
  id: PatternId;
  name: string;
  anchor: PatternAnchor;
  shape: TelegraphShape;
  /** 경고가 다 차오를 때까지 ms (보통 기준, 난이도로 바뀐다) */
  windupMs: number;
  /** 같은 몬스터가 다시 쓸 때까지 ms */
  cooldownMs: number;
  /** 나와의 거리가 이 안이면 쓴다 */
  trigger: number;
  /** 공격력 배율 */
  dmgMult: number;
  /** 여러 개 (rain: 원 개수, fan_volley: 발 수) */
  count?: number;
};

export const PATTERNS: Record<PatternId, PatternSpec> = {
  bite: { id: "bite", name: "물기", anchor: "self", shape: { kind: "cone", r: 20, arcDeg: 90 }, windupMs: 280, cooldownMs: 900, trigger: 16, dmgMult: 1 },
  slam: { id: "slam", name: "내려찍기", anchor: "target", shape: { kind: "circle", r: 22 }, windupMs: 750, cooldownMs: 3400, trigger: 70, dmgMult: 1.4 },
  charge: { id: "charge", name: "돌진", anchor: "self", shape: { kind: "line", len: 96, width: 18 }, windupMs: 620, cooldownMs: 2600, trigger: 92, dmgMult: 1.3 },
  aimed_shot: { id: "aimed_shot", name: "조준 사격", anchor: "self", shape: { kind: "line", len: 150, width: 6 }, windupMs: 420, cooldownMs: 1900, trigger: 150, dmgMult: 1 },
  fan_volley: { id: "fan_volley", name: "부채 사격", anchor: "self", shape: { kind: "cone", r: 120, arcDeg: 50 }, windupMs: 650, cooldownMs: 2700, trigger: 160, dmgMult: 0.9, count: 5 },
  self_destruct: { id: "self_destruct", name: "자폭", anchor: "self", shape: { kind: "circle", r: 30 }, windupMs: 700, cooldownMs: 99_999, trigger: 22, dmgMult: 1 },
  ambush: { id: "ambush", name: "기습", anchor: "target", shape: { kind: "circle", r: 18 }, windupMs: 650, cooldownMs: 2600, trigger: 140, dmgMult: 1.2 },
  nova: { id: "nova", name: "충격파", anchor: "self", shape: { kind: "ring", r0: 22, r1: 70 }, windupMs: 900, cooldownMs: 6000, trigger: 80, dmgMult: 1.3 },
  rain: { id: "rain", name: "낙하", anchor: "around", shape: { kind: "circle", r: 18 }, windupMs: 950, cooldownMs: 5200, trigger: 200, dmgMult: 1.2, count: 3 },
  cross: { id: "cross", name: "십자 베기", anchor: "target", shape: { kind: "line", len: 180, width: 14 }, windupMs: 850, cooldownMs: 5600, trigger: 200, dmgMult: 1.3 },
  breath: { id: "breath", name: "불길", anchor: "self", shape: { kind: "cone", r: 90, arcDeg: 70 }, windupMs: 850, cooldownMs: 4800, trigger: 100, dmgMult: 1.5 },
};

export const PATTERN_IDS = Object.keys(PATTERNS) as PatternId[];

/** 행동마다 기본 패턴 (몬스터 정의에 patterns가 없을 때) */
export const BEHAVIOR_PATTERNS: Record<MonsterBehavior, PatternId[]> = {
  chase: ["bite"],
  wander: ["bite"],
  split: ["bite"],
  dash: ["bite", "charge"],
  ranged: ["aimed_shot"],
  explode: ["self_destruct"],
  blink: ["bite", "ambush"],
  boss: ["bite", "fan_volley", "slam"],
};

/** 우두머리 단계: HP 비율이 below 아래로 내려가면 add 패턴이 붙고, 쿨타임이 haste배로 줄어든다 */
export type BossPhase = { below: number; add: PatternId[]; haste: number; label: string };

export const DEFAULT_BOSS_PHASES: readonly BossPhase[] = [
  { below: 0.7, add: ["charge", "nova"], haste: 0.9, label: "화가 났다!" },
  { below: 0.35, add: ["rain", "cross"], haste: 0.75, label: "폭주한다!" },
];

/** 난이도별: 경고 시간 배율(짧을수록 어렵다), 개수 더하기, 쿨타임 배율 */
export const PATTERN_DIFF: Record<Difficulty, { windup: number; extra: number; cooldown: number }> = {
  easy: { windup: 1.2, extra: 0, cooldown: 1.15 },
  normal: { windup: 1, extra: 0, cooldown: 1 },
  hard: { windup: 0.9, extra: 1, cooldown: 0.92 },
  hell: { windup: 0.8, extra: 2, cooldown: 0.85 },
};

/** 아무리 어려워도 경고는 이만큼은 보인다 (공정성) */
export const MIN_WINDUP_MS = 240;

export type PatternTiming = { windupMs: number; cooldownMs: number; count: number };

export function patternTiming(id: PatternId, d: Difficulty, haste = 1): PatternTiming {
  const p = PATTERNS[id];
  const D = PATTERN_DIFF[d];
  return {
    windupMs: Math.max(MIN_WINDUP_MS, Math.round(p.windupMs * D.windup)),
    cooldownMs: Math.round(p.cooldownMs * D.cooldown * haste),
    count: (p.count ?? 1) + (p.count ? D.extra : 0),
  };
}

type PatternOwner = Pick<MonsterDef, "behavior"> & { patterns?: readonly PatternId[]; phases?: readonly BossPhase[] };

/** 이 몬스터가 지금 쓸 수 있는 패턴 (우두머리면 HP 비율에 따라 단계 패턴이 붙는다) */
export function monsterPatterns(def: PatternOwner, opts: { boss?: boolean; hpRatio?: number; difficulty?: Difficulty } = {}): PatternId[] {
  const base = [...(def.patterns ?? BEHAVIOR_PATTERNS[def.behavior] ?? ["bite"])];
  // 어려움·지옥: 원거리는 한 발 대신 부채 사격도 섞는다
  if (def.behavior === "ranged" && !def.patterns && (opts.difficulty === "hard" || opts.difficulty === "hell")) base.push("fan_volley");
  if (!opts.boss) return base;
  // 우두머리가 아닌 몬스터(예: 쉬움의 잔소리 부장님)가 마지막 웨이브 우두머리로 나오면 내려찍기를 기본으로 더한다
  if (!base.includes("slam")) base.push("slam");
  const out = new Set(base);
  for (const ph of bossPhaseList(def)) if ((opts.hpRatio ?? 1) <= ph.below) ph.add.forEach((a) => out.add(a));
  return [...out];
}

export function bossPhaseList(def: PatternOwner): readonly BossPhase[] {
  return def.phases ?? DEFAULT_BOSS_PHASES;
}

/** 지금 HP 비율의 우두머리 단계 (0 = 처음, 1 = 첫 번째 문턱 넘김 …) */
export function bossPhaseIndex(def: PatternOwner, hpRatio: number): number {
  return bossPhaseList(def).filter((p) => hpRatio <= p.below).length;
}

// ── 판정 (게임·테스트 공용) ──

/**
 * (px,py)에 반지름 pr인 몸이 경고 모양 안에 걸치는지.
 * (ox,oy) 기준점, angle 방향(라디안). 테두리에 살짝 걸친 것도 맞는다 (보이는 대로 맞게).
 */
export function inTelegraph(shape: TelegraphShape, ox: number, oy: number, angle: number, px: number, py: number, pr = 0): boolean {
  const dx = px - ox;
  const dy = py - oy;
  const d = Math.hypot(dx, dy);
  switch (shape.kind) {
    case "circle":
      return d <= shape.r + pr;
    case "ring":
      return d <= shape.r1 + pr && d >= shape.r0 - pr;
    case "cone": {
      if (d > shape.r + pr) return false;
      if (d <= pr + 2) return true;
      const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - angle));
      return diff <= (shape.arcDeg / 2) * (Math.PI / 180) + Math.atan2(pr, d);
    }
    case "line": {
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const along = dx * ux + dy * uy;
      const across = Math.abs(-dx * uy + dy * ux);
      return along >= -pr && along <= shape.len + pr && across <= shape.width / 2 + pr;
    }
  }
}

export function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

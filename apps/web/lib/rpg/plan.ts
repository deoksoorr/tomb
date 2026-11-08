import { DIFFS, MONSTERS, ZONES, type Difficulty, type MonsterId } from "./catalog";
import { clamp, seeded } from "./formulas";

// 한 판의 출현 계획. 시드(서버가 런 티켓에 넣어 준다)로 정해져서, 게임은 이대로 내보내고
// 서버는 같은 계획으로 "그 시간 안에 나올 수 있었던 것보다 많이 잡았는지"를 검사한다.

// ── 사냥터 ──

/** 웨이브 i는 아무리 빨리 깨도 i × 이 시간 전에는 나오지 않는다 */
export const WAVE_MIN_GAP_SEC = 8;
/** 다 못 잡아도 이 시간이 지나면 다음 웨이브가 나온다 */
export const WAVE_MAX_GAP_SEC = 35;

export type HuntWave = { index: number; monsters: MonsterId[]; earliestSec: number; boss: boolean };

const WAVE_BASE: Record<Difficulty, number> = { easy: 3, normal: 4, hard: 5, hell: 6 };

export function huntPlan(seed: number, d: Difficulty): HuntWave[] {
  const zone = ZONES[d];
  const r = seeded(seed ^ 0x48554e54);
  const waves: HuntWave[] = [];
  for (let i = 0; i < zone.waves; i++) {
    const last = i === zone.waves - 1;
    const n = Math.min(12, WAVE_BASE[d] + i);
    const monsters: MonsterId[] = [];
    if (last) monsters.push(zone.boss);
    for (let k = last ? 2 : 0; k < n; k++) monsters.push(zone.pool[Math.floor(r() * zone.pool.length)]);
    waves.push({ index: i, monsters, earliestSec: i * WAVE_MIN_GAP_SEC, boss: last });
  }
  return waves;
}

/** effSec초 안에 나올 수 있었던 몬스터 수 (머지 컨플릭트가 갈라진 조각 포함) */
export function huntSpawnable(plan: HuntWave[], effSec: number): Partial<Record<MonsterId, number>> {
  const out: Partial<Record<MonsterId, number>> = {};
  for (const w of plan) {
    if (w.earliestSec > effSec) continue;
    for (const m of w.monsters) out[m] = (out[m] ?? 0) + 1;
  }
  if (out.merge_conflict) out.conflict_shard = (out.conflict_shard ?? 0) + out.merge_conflict * 2;
  return out;
}

export const huntTotal = (plan: HuntWave[]) => plan.reduce((n, w) => n + w.monsters.length, 0);

// ── 버그 잡기 ──

export const BUG_SLOTS = 9;
export type BugKind = "bug" | "golden" | "feature";
export type BugSpawn = { t: number; slot: number; kind: BugKind; lifeMs: number };
export const BUG_SCORE = { bug: 10, golden: 30, feature: -15 } as const;

const BUG_INTERVAL: Record<Difficulty, number> = { easy: 900, normal: 700, hard: 540, hell: 420 };
const BUG_LIFE: Record<Difficulty, number> = { easy: 1500, normal: 1150, hard: 900, hell: 720 };
const FEATURE_P: Record<Difficulty, number> = { easy: 0.12, normal: 0.18, hard: 0.22, hell: 0.26 };

export function bugLifeBonus(dex: number): number {
  return 1 + clamp(dex * 0.003, 0, 0.3);
}
export function goldenChance(luk: number): number {
  return clamp(0.04 + luk * 0.002, 0.04, 0.15);
}

export function bugsPlan(seed: number, d: Difficulty, durationSec: number, st: { dex: number; luk: number }): BugSpawn[] {
  const r = seeded(seed ^ 0x42554753);
  const busy = new Array<number>(BUG_SLOTS).fill(0);
  const out: BugSpawn[] = [];
  const end = durationSec * 1000;
  let t = 800;
  while (t < end) {
    // 뒤로 갈수록 조금씩 빨라진다
    const speedUp = 1 - 0.3 * (t / end);
    const life = Math.round(BUG_LIFE[d] * speedUp * bugLifeBonus(st.dex));
    let slot = Math.floor(r() * BUG_SLOTS);
    for (let k = 0; k < BUG_SLOTS && busy[slot] > t; k++) slot = (slot + 1) % BUG_SLOTS;
    const roll = r();
    if (busy[slot] <= t) {
      const kind: BugKind = roll < FEATURE_P[d] ? "feature" : roll < FEATURE_P[d] + goldenChance(st.luk) ? "golden" : "bug";
      out.push({ t, slot, kind, lifeMs: kind === "golden" ? Math.round(life * 0.75) : life });
      busy[slot] = t + life + 150;
    }
    t += Math.round(BUG_INTERVAL[d] * speedUp * (0.7 + r() * 0.6));
  }
  return out;
}

export function bugsCount(plan: BugSpawn[], effMs: number): Record<BugKind, number> {
  const c: Record<BugKind, number> = { bug: 0, golden: 0, feature: 0 };
  for (const s of plan) if (s.t <= effMs) c[s.kind]++;
  return c;
}

// ── 데드라인 피하기 ──

export const DEADLINE_BLOCKS = ["요구사항 변경", "긴급 회의", "QA 반려", "스펙 추가", "일정 당김", "보고서 요청"] as const;
export type FallKind = "block" | "coffee";
/** x: 0..1 (화면 폭 비율), speed: 바닥까지 필요한 시간이 아니라 px/s(논리 높이 240 기준), w: 블록 폭(논리 px) */
export type FallSpawn = { t: number; x: number; kind: FallKind; label: number; speed: number; w: number };

const FALL_INTERVAL: Record<Difficulty, [number, number]> = { easy: [950, 520], normal: [800, 400], hard: [650, 300], hell: [520, 220] };
const FALL_SPEED: Record<Difficulty, [number, number]> = { easy: [70, 130], normal: [85, 160], hard: [100, 200], hell: [120, 250] };
export const DEADLINE_HP = 3;
export const DEADLINE_SCORE = { perSec: 10, coffee: 25 } as const;

export function deadlinePlan(seed: number, d: Difficulty, durationSec: number): FallSpawn[] {
  const r = seeded(seed ^ 0x44454144);
  const out: FallSpawn[] = [];
  const end = durationSec * 1000;
  let t = 1200;
  let nextCoffee = 5000 + r() * 3000;
  while (t < end) {
    const p = t / end;
    const [i0, i1] = FALL_INTERVAL[d];
    const [s0, s1] = FALL_SPEED[d];
    const speed = s0 + (s1 - s0) * p;
    if (t >= nextCoffee) {
      out.push({ t, x: 0.08 + r() * 0.84, kind: "coffee", label: 0, speed: speed * 0.8, w: 10 });
      nextCoffee = t + 6000 + r() * 4000;
    } else {
      out.push({ t, x: 0.06 + r() * 0.88, kind: "block", label: Math.floor(r() * DEADLINE_BLOCKS.length), speed, w: 40 + Math.floor(r() * 22) });
    }
    t += Math.round((i0 + (i1 - i0) * p) * (0.75 + r() * 0.5));
  }
  return out;
}

export function deadlineCoffees(plan: FallSpawn[], effMs: number): number {
  return plan.filter((s) => s.kind === "coffee" && s.t <= effMs).length;
}

/** 난이도 이름 (로그·메시지용) */
export const diffName = (d: Difficulty) => DIFFS[d].name;
export const monsterName = (id: MonsterId) => MONSTERS[id].name;

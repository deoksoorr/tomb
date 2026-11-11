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

// ── 공용: 콤보 배수 ──

/** 콤보가 5개 쌓일 때마다 ×0.5 (최대 ×3). 버그 잡기·별자리 잇기 공용 */
export function comboMult(combo: number): number {
  return 1 + Math.min(2, Math.floor(Math.max(0, combo) / 5) * 0.5);
}

// ── 버그 잡기 ──

export const BUG_SLOTS = 9;
/** decoy: 주석 처리된 가짜 버그 (회색, 줄이 그어져 있다) — 누르면 감점 */
export type BugKind = "bug" | "golden" | "feature" | "decoy";
export type BugSpawn = { t: number; slot: number; kind: BugKind; lifeMs: number };
export const BUG_SCORE = { bug: 10, golden: 30, feature: -15, decoy: -20 } as const;

const BUG_INTERVAL: Record<Difficulty, number> = { easy: 800, normal: 600, hard: 460, hell: 360 };
const BUG_LIFE: Record<Difficulty, number> = { easy: 1300, normal: 1000, hard: 780, hell: 620 };
const FEATURE_P: Record<Difficulty, number> = { easy: 0.1, normal: 0.12, hard: 0.14, hell: 0.16 };
const DECOY_P: Record<Difficulty, number> = { easy: 0.05, normal: 0.1, hard: 0.14, hell: 0.18 };
/** 같은 순간 두 칸에 나올 확률 */
const DOUBLE_P: Record<Difficulty, number> = { easy: 0, normal: 0.12, hard: 0.25, hell: 0.4 };

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
    // 뒤로 갈수록 빨라진다
    const speedUp = 1 - 0.35 * (t / end);
    const life = Math.round(BUG_LIFE[d] * speedUp * bugLifeBonus(st.dex));
    const n = r() < DOUBLE_P[d] ? 2 : 1;
    for (let i = 0; i < n; i++) {
      let slot = Math.floor(r() * BUG_SLOTS);
      for (let k = 0; k < BUG_SLOTS && busy[slot] > t; k++) slot = (slot + 1) % BUG_SLOTS;
      const roll = r();
      if (busy[slot] > t) continue;
      const f = FEATURE_P[d];
      const dc = f + DECOY_P[d];
      const kind: BugKind = roll < f ? "feature" : roll < dc ? "decoy" : roll < dc + goldenChance(st.luk) ? "golden" : "bug";
      out.push({ t, slot, kind, lifeMs: kind === "golden" ? Math.round(life * 0.7) : life });
      busy[slot] = t + life + 150;
    }
    t += Math.round(BUG_INTERVAL[d] * speedUp * (0.7 + r() * 0.6));
  }
  return out;
}

export function bugsCount(plan: BugSpawn[], effMs: number): Record<BugKind, number> {
  const c: Record<BugKind, number> = { bug: 0, golden: 0, feature: 0, decoy: 0 };
  for (const s of plan) if (s.t <= effMs) c[s.kind]++;
  return c;
}

// ── 별자리 잇기 ──

/** 빛의 고리가 별에 닿는 시각(t)에 누른다. x·y는 0..1 (화면 비율에 맞춰 씬이 펼친다) */
export type StarNote = { t: number; x: number; y: number; group: number; idx: number };
export const STAR_SCORE = { perfect: 300, good: 100 } as const;

/** 고리가 줄어드는 시간 (ms) */
export const STAR_APPROACH: Record<Difficulty, number> = { easy: 1500, normal: 1200, hard: 950, hell: 780 };
const STAR_BEAT: Record<Difficulty, number> = { easy: 820, normal: 640, hard: 500, hell: 400 };
const STAR_HALF_P: Record<Difficulty, number> = { easy: 0, normal: 0.12, hard: 0.25, hell: 0.35 };
const STAR_WIN: Record<Difficulty, [number, number]> = { easy: [75, 160], normal: [65, 140], hard: [55, 120], hell: [45, 100] };

/** 판정 범위 [완벽, 좋아] ms. DEX가 높으면 조금 너그럽다 */
export function starWindows(d: Difficulty, dex: number): [number, number] {
  const k = 1 + clamp(dex * 0.004, 0, 0.25);
  return [Math.round(STAR_WIN[d][0] * k), Math.round(STAR_WIN[d][1] * k)];
}

export function starsPlan(seed: number, d: Difficulty, durationSec: number): StarNote[] {
  const r = seeded(seed ^ 0x53544152);
  const out: StarNote[] = [];
  const end = durationSec * 1000 - 400;
  let t = STAR_APPROACH[d] + 600;
  let group = 0;
  while (t < end) {
    const len = 5 + Math.floor(r() * 3);
    let x = 0.2 + r() * 0.6;
    let y = 0.25 + r() * 0.5;
    for (let i = 0; i < len && t < end; i++) {
      out.push({ t: Math.round(t), x, y, group, idx: i });
      // 다음 별은 가까이 (별자리처럼 이어지게), 화면 안쪽으로
      const a = r() * Math.PI * 2;
      const step = 0.14 + r() * 0.12;
      x = clamp(x + Math.cos(a) * step, 0.08, 0.92);
      y = clamp(y + Math.sin(a) * step * 0.9, 0.12, 0.88);
      t += STAR_BEAT[d] * (r() < STAR_HALF_P[d] ? 0.5 : 1);
    }
    group++;
    t += STAR_BEAT[d] * 1.8;
  }
  return out;
}

export function starsCount(plan: StarNote[], effMs: number): number {
  return plan.filter((n) => n.t <= effMs).length;
}

export const CONSTELLATIONS = [
  "새해 다짐자리",
  "헬스장 회원권자리",
  "영어 단어장자리",
  "다이어리자리",
  "가계부자리",
  "홈트자리",
  "자격증 문제집자리",
  "독서 기록자리",
  "다이어트자리",
  "기타 독학자리",
  "아침형 인간자리",
  "퇴사 다짐자리",
] as const;

/** 난이도 이름 (로그·메시지용) */
export const diffName = (d: Difficulty) => DIFFS[d].name;
export const monsterName = (id: MonsterId) => MONSTERS[id].name;

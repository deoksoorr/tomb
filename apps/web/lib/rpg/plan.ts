import { DIFFS, MONSTERS, zoneFor, type Difficulty, type MonsterId } from "./catalog";
import { clamp, monsterStats, seeded } from "./formulas";
import { constellationById, CONSTELLATIONS, type Constellation, type ConstellationRarity } from "./constellations";

// 한 판의 출현 계획. 시드(서버가 런 티켓에 넣어 준다)로 정해져서, 게임은 이대로 내보내고
// 서버는 같은 계획으로 "그 시간 안에 나올 수 있었던 것보다 많이 잡았는지"를 검사한다.

// ── 사냥터 ──

/** 웨이브 i는 아무리 빨리 깨도 i × 이 시간 전에는 나오지 않는다 */
export const WAVE_MIN_GAP_SEC = 8;
/** 다 못 잡아도 이 시간이 지나면 다음 웨이브가 나온다 */
export const WAVE_MAX_GAP_SEC = 35;

/**
 * pack: monsters 중 끝의 pack마리는 한 자리에서 무리로 몰려 나온다 (같은 종류).
 * summon: 우두머리 웨이브에서 우두머리가 화날 때(2번) 불러낼 수 있는 졸개 — 웨이브 마릿수에는 들지 않는다 (40번)
 */
export type HuntWave = {
  index: number;
  monsters: MonsterId[];
  earliestSec: number;
  boss: boolean;
  pack: number;
  summon?: { id: MonsterId; n: number };
  /** 11/12 웨이브 모양 (어디서·어떻게 나오나). 마릿수·종류는 같고 나오는 자리·시간만 다르다 → 서버 상한은 그대로 */
  formation: WaveFormation;
  /** 정예: monsters[elite]가 더 크고 질기다 (ELITE). 그 웨이브를 깨면 서버가 EXP 보너스를 더한다 */
  elite?: number;
};

/**
 * scatter: 입구 여기저기서 하나씩 · swarm: 끝의 pack마리가 한 점에서 무리로 · pincer: 무리가 둘로 나뉘어 양쪽에서 ·
 * surround: 모두가 나를 빙 둘러싸고 · stream: 한 입구에서 한 마리씩 줄지어 돌격 (STREAM_GAP_MS 간격, 무리는 맨 끝에 한꺼번에)
 */
export type WaveFormation = "scatter" | "swarm" | "pincer" | "surround" | "stream";
export const WAVE_FORMATION_LABEL: Record<WaveFormation, string> = {
  scatter: "",
  swarm: "무리!",
  pincer: "양쪽에서 협공!",
  surround: "포위당했다!",
  stream: "줄지어 돌격!",
};
/** stream: 한 마리씩 나오는 간격 */
export const STREAM_GAP_MS = 420;

/** 정예 몬스터 배율 — 게임(HuntScene)과 서버(EXP 보너스)가 같이 쓴다 */
export const ELITE = { hp: 3, atk: 1.3, def: 1.2, exp: 3, scale: 1.3 } as const;
/** 셋째 웨이브부터(우두머리 웨이브 제외) 정예가 섞일 확률 */
const ELITE_CHANCE: Record<Difficulty, number> = { easy: 0.25, normal: 0.35, hard: 0.45, hell: 0.55 };
/** 가운데 웨이브 모양 가중치 (합 1) */
const FORMATION_W: [WaveFormation, number][] = [
  ["swarm", 0.3],
  ["pincer", 0.25],
  ["surround", 0.2],
  ["stream", 0.25],
];

/** 우두머리가 화나는 횟수 (체력 60%·30%) — 게임(HuntScene)과 서버 상한이 같이 쓴다 */
export const BOSS_RAGES = 2;

// 45번: 여러 마리 동시 타격(42번)에 맞춰 약 1.75배. 예전은 3/4/5/6마리 + 웨이브마다 1, 최대 12
const WAVE_BASE: Record<Difficulty, number> = { easy: 5, normal: 6, hard: 8, hell: 9 };
const WAVE_GROWTH = 2;
const WAVE_CAP = 20;
/** 무리 크기 (최소, 최대) — 둘째 웨이브부터 */
const PACK: Record<Difficulty, [number, number]> = { easy: [3, 4], normal: [3, 5], hard: [4, 6], hell: [5, 7] };

/** zone: 사냥터 id (없거나 난이도가 다르면 그 난이도의 기본 사냥터) */
export function huntPlan(seed: number, d: Difficulty, zoneId?: string | null): HuntWave[] {
  const zone = zoneFor(d, zoneId);
  const r = seeded(seed ^ 0x48554e54);
  // 모양·정예는 따로 굴린다 (몬스터 구성 시퀀스는 예전 그대로)
  const rf = seeded(seed ^ 0x464f524d);
  const waves: HuntWave[] = [];
  for (let i = 0; i < zone.waves; i++) {
    const last = i === zone.waves - 1;
    const n = Math.min(WAVE_CAP, WAVE_BASE[d] + i * WAVE_GROWTH);
    const monsters: MonsterId[] = [];
    if (last) monsters.push(zone.boss);
    // 우두머리는 두 마리 몫
    const room = n - (last ? 2 : 0);
    const [lo, hi] = PACK[d];
    const pack = i === 0 ? 0 : Math.min(room, lo + Math.floor(r() * (hi - lo + 1)));
    for (let k = 0; k < room - pack; k++) monsters.push(zone.pool[Math.floor(r() * zone.pool.length)]);
    const packId = zone.pool[Math.floor(r() * zone.pool.length)];
    for (let k = 0; k < pack; k++) monsters.push(packId);
    let formation: WaveFormation = i === 0 ? "scatter" : "swarm";
    let elite: number | undefined;
    if (i > 0 && !last) {
      let x = rf();
      formation = FORMATION_W.find(([, w]) => (x -= w) < 0)?.[0] ?? "swarm";
      const solo = monsters.length - pack;
      if (i >= 2 && solo > 0 && rf() < ELITE_CHANCE[d]) {
        const k = Math.floor(rf() * solo);
        if (!MONSTERS[monsters[k]].minion) elite = k;
      }
    }
    waves.push({
      index: i,
      monsters,
      earliestSec: i * WAVE_MIN_GAP_SEC,
      boss: last,
      pack,
      formation,
      ...(elite !== undefined ? { elite } : {}),
      ...(last ? { summon: { ...zone.summon } } : {}),
    });
  }
  return waves;
}

/** effSec초 안에 나올 수 있었던 몬스터 수 (갈라진 조각·우두머리가 불러낸 졸개 포함) */
export function huntSpawnable(plan: HuntWave[], effSec: number): Partial<Record<MonsterId, number>> {
  const out: Partial<Record<MonsterId, number>> = {};
  const add = (id: MonsterId, n: number, depth = 0) => {
    out[id] = (out[id] ?? 0) + n;
    const sp = MONSTERS[id].split;
    if (sp && depth < 3) add(sp.id, n * sp.n, depth + 1);
  };
  for (const w of plan) {
    if (w.earliestSec > effSec) continue;
    for (const m of w.monsters) add(m, 1);
    if (w.summon) add(w.summon.id, w.summon.n * BOSS_RAGES);
  }
  return out;
}

export const huntTotal = (plan: HuntWave[]) => plan.reduce((n, w) => n + w.monsters.length, 0);

/** 앞에서부터 k개 웨이브를 깼을 때 정예 EXP 보너스 (정예 한 마리 = 보통의 ELITE.exp배 → 더해지는 몫은 ELITE.exp − 1배) */
export function eliteBonusExp(plan: HuntWave[], k: number, d: Difficulty, power: number): number {
  let exp = 0;
  for (const w of plan.slice(0, k)) if (w.elite !== undefined) exp += (ELITE.exp - 1) * monsterStats(w.monsters[w.elite], d, power).exp;
  return exp;
}

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

/**
 * 빛의 고리가 별에 닿는 시각(t)에 누른다. con = 이 별 무리(group)가 그리는 별자리 (lib/rpg/constellations),
 * x·y는 그 별자리 모양 안의 자리 0..1 (화면 어디에 얼마나 크게 펼칠지는 씬이 화면 비율에 맞춰 정한다)
 */
export type StarNote = { t: number; x: number; y: number; group: number; idx: number; con: string };
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

/** 별자리 고르는 무게: 흔함 > 보통 > 희귀(어려움 이상) > 전설(맑은 밤) */
const CON_WEIGHT: Record<ConstellationRarity, number> = { 1: 10, 2: 6, 3: 3.5, 5: 2.5 };

/** 이 판에 나올 수 있는 별자리인지: 희귀는 어려움·지옥, 전설은 맑은 밤 보너스 판에서만 */
export function constellationAllowed(c: Constellation, d: Difficulty, starry: boolean): boolean {
  if (c.rarity === 5) return starry;
  if (c.rarity === 3) return d === "hard" || d === "hell";
  return true;
}

/**
 * 박자(t)·무리 크기·무리 번호는 예전 계획과 한 치도 다르지 않다 (같은 난수 r을 같은 순서로 쓴다 → 판 진행 중 배포가 겹쳐도
 * 옛 화면과 새 서버의 별 수 상한이 같다). 별자리 고르기는 따로 굴리는 난수(rc)로만 — 무리 크기와 같은 별 수의 별자리 중에서,
 * 이 판에서 아직 안 나온 것을 먼저. starry = 판 시작 시각이 맑은 밤인지 (서버는 티켓 시각으로 다시 계산한다)
 */
export function starsPlan(seed: number, d: Difficulty, durationSec: number, starry = false): StarNote[] {
  const r = seeded(seed ^ 0x53544152);
  const rc = seeded(seed ^ 0x434f4e53);
  const used = new Set<string>();
  const pickCon = (len: number): Constellation => {
    const fits = CONSTELLATIONS.filter((c) => c.stars.length === len && constellationAllowed(c, d, starry));
    const fresh = fits.filter((c) => !used.has(c.id));
    const pool = fresh.length ? fresh : fits;
    let x = rc() * pool.reduce((a, c) => a + CON_WEIGHT[c.rarity], 0);
    const c = pool.find((c) => (x -= CON_WEIGHT[c.rarity]) < 0) ?? pool[pool.length - 1];
    used.add(c.id);
    return c;
  };
  const out: StarNote[] = [];
  const end = durationSec * 1000 - 400;
  let t = STAR_APPROACH[d] + 600;
  let group = 0;
  while (t < end) {
    const len = 5 + Math.floor(r() * 3);
    const con = pickCon(len);
    // 예전 계획의 시작 자리·걸음 난수 — 자리는 이제 별자리 모양이 정하지만, 박자 난수 순서를 지키려고 그대로 뽑는다
    r();
    r();
    for (let i = 0; i < len && t < end; i++) {
      const [x, y] = con.stars[i];
      out.push({ t: Math.round(t), x, y, group, idx: i, con: con.id });
      r();
      r();
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

/** 무리 하나의 정보: 별자리·별 수·마지막 별 시각. 판 끝에 잘려 별자리 별 수보다 적게 나온 무리는 full=false (완성할 수 없다) */
export type StarGroup = { group: number; con: string; size: number; lastT: number; full: boolean };
export function starGroups(plan: StarNote[]): StarGroup[] {
  const out: StarGroup[] = [];
  for (const n of plan) {
    const g = out[n.group] ?? (out[n.group] = { group: n.group, con: n.con, size: 0, lastT: n.t, full: false });
    g.size++;
    g.lastT = n.t;
  }
  for (const g of out) g.full = g.size === (constellationById(g.con)?.stars.length ?? -1);
  return out;
}

/** 난이도 이름 (로그·메시지용) */
export const diffName = (d: Difficulty) => DIFFS[d].name;
export const monsterName = (id: MonsterId) => MONSTERS[id].name;

import type { Season } from "../../ambience";
import { addDays, dayStartMs } from "../../gameDay";
import { CAT_LABEL, LIFE_CATS, PHASE_LABEL, SEASON_LABEL, SPECIES, WEATHER_LABEL, speciesById, type LifeCat, type Rarity, type Species } from "../catalog";
import { conditionsAt, hash01, type Cond } from "../rules";
import { QUEST_DAILY, QUEST_STAMPS, isHardSlot, slotStamps } from "./catalog";

// 11/15: 수집 의뢰 만들기 (순수 함수). 목록은 저장하지 않는다 — (계정, 날짜[, 바꾼 칸])로 정해지는 시드에서 늘 같은 의뢰가 나온다.
// 저장소에는 끝낸 표시·바꾼 칸만 (lib/forage/quests/store).
//  - 그날 하늘(lib/ambience: 시간대·30분 블록 날씨·계절)을 48칸 미리 훑어, 그날 어느 시간·날씨에든 잡을 수 있는 것만 낸다
//    (특정 종·희귀도 의뢰는 그날 2시간 이상 나오는 것만, 특정 종은 6시간 이상 나오는 쉬운 종만)
//  - 쉬운 칸(0~4)은 다섯 갈래(물고기·곤충·약초·광석·발굴)를 하나씩, 어려운 칸(5·6)은 서로 다른 두 갈래
//  - 바꾸기(하루 한 번): 그 칸만 다른 갈래·종류로 (다른 칸은 그대로)
//  - 잡동사니(구두·사원증 …)는 물고기로 치지 않는다

/** 의뢰 하나가 원하는 것: 그 갈래의 ★minRar 이상 count개 (distinct면 서로 다른 count종 1개씩, sp면 그 종만) */
export type QuestSpec = { cat: LifeCat; count: number; minRar: Rarity; distinct: boolean; sp?: string };

export type Quest = QuestSpec & {
  /** 화면·납품에서 가리키는 칸: 오늘의 의뢰는 "d0"~"d6", 이번 주는 "w" */
  key: string;
  stamps: number;
  hard: boolean;
  /** "★2 이상 물고기 3마리" */
  text: string;
  /** 어디서·언제 (특정 종이면 그 종이 나오는 곳·때) */
  hint: string;
  /** 이번 주 큰 의뢰 이름 ("겨울 강가 주간") */
  title?: string;
};

const BLOCK_MS = 30 * 60_000;
const DAY_BLOCKS = 48;
/** 특정 희귀도·종류 의뢰에 넣을 수 있는 종: 그날 이만큼(30분 칸) 이상 나온다 */
const MIN_BLOCKS = 4;
/** 특정 종 의뢰: 그날 이만큼 이상 나오는 쉬운 종 */
const SP_MIN_BLOCKS = 12;

const fitsCond = (s: Species, c: Cond) =>
  (!s.time || s.time.includes(c.phase)) && (!s.weather || s.weather.includes(c.weather)) && (!s.season || s.season.includes(c.season));

const POOL = SPECIES.filter((s) => !s.junk);

const availCache = new Map<string, Map<string, number>>();
/** 그 게임 날짜(새벽 5시 ~ 다음 날 새벽 5시)에 종마다 나오는 30분 칸 수 */
export function dayAvailability(day: string): Map<string, number> {
  const hit = availCache.get(day);
  if (hit) return hit;
  const t0 = dayStartMs(day);
  const conds = Array.from({ length: DAY_BLOCKS }, (_, i) => conditionsAt(t0 + i * BLOCK_MS + 60_000));
  const out = new Map<string, number>();
  for (const s of POOL) out.set(s.id, conds.filter((c) => fitsCond(s, c)).length);
  if (availCache.size > 30) availCache.delete(availCache.keys().next().value!);
  availCache.set(day, out);
  return out;
}

/** 그 주(월요일부터 7일) 종마다 나오는 칸 수 */
export function weekAvailability(week: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < 7; i++) for (const [id, n] of dayAvailability(addDays(week, i))) out.set(id, (out.get(id) ?? 0) + n);
  return out;
}

/** 시드 문자열 → 차례로 꺼내는 [0,1) */
function rng(seed: string): () => number {
  let i = 0;
  return () => hash01(`${seed}#${i++}`);
}
const between = (r: () => number, [lo, hi]: readonly [number, number]) => lo + Math.floor(r() * (hi - lo + 1));
function shuffle<T>(list: readonly T[], r: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function pickW<T>(rows: readonly (readonly [T, number])[], r: () => number): T {
  let x = r() * rows.reduce((n, [, w]) => n + w, 0);
  for (const [v, w] of rows) if ((x -= w) < 0) return v;
  return rows[rows.length - 1][0];
}

/** 의뢰에 맞는 종인지 */
export function matches(q: QuestSpec, id: string): boolean {
  const s = speciesById(id);
  return !!s && !s.junk && s.cat === q.cat && s.rarity >= q.minRar && (!q.sp || q.sp === id);
}

/** 그 칸 수 이상 나오는 맞는 종 */
const poolOf = (q: QuestSpec, avail: Map<string, number>, min: number) => POOL.filter((s) => matches(q, s.id) && (avail.get(s.id) ?? 0) >= min);

// ── 갈래별 개수 ──
type Range = readonly [number, number];
const R = (lo: number, hi = lo): Range => [lo, hi];
const EASY_ANY: Record<LifeCat, Range> = { fish: R(3, 5), bug: R(2, 3), herb: R(3, 5), ore: R(3, 4), dig: R(2, 3) };
const EASY_SP: Record<LifeCat, Range> = { fish: R(1, 2), bug: R(1), herb: R(1, 3), ore: R(1, 3), dig: R(1, 2) };
const EASY_RAR: Record<LifeCat, Range> = { fish: R(1, 2), bug: R(1), herb: R(1, 2), ore: R(1, 2), dig: R(1) };
const HARD_RAR2: Record<LifeCat, Range> = { fish: R(3, 4), bug: R(2), herb: R(3), ore: R(3), dig: R(2) };
const HARD_KINDS: Record<LifeCat, number> = { fish: 4, bug: 3, herb: 4, ore: 4, dig: 3 };
const HARD_BULK: Record<LifeCat, number> = { fish: 8, bug: 5, herb: 8, ore: 8, dig: 6 };
const WEEK_BULK: Record<LifeCat, number> = { fish: 15, bug: 10, herb: 15, ore: 15, dig: 10 };
const WEEK_NAME: Record<LifeCat, string> = { fish: "강가", bug: "풀숲", herb: "약초", ore: "광맥", dig: "발굴" };

type EasyFam = "any" | "sp" | "rar" | "kinds";
type HardFam = "rar" | "kinds" | "bulk";
const EASY_FAMS: readonly (readonly [EasyFam, number])[] = [
  ["any", 30],
  ["sp", 25],
  ["rar", 25],
  ["kinds", 20],
];
const HARD_FAMS: readonly (readonly [HardFam, number])[] = [
  ["rar", 40],
  ["kinds", 35],
  ["bulk", 25],
];

/** 하루 계획: 칸마다 (갈래, 종류). (계정, 날짜)로만 정해진다 → 한 칸을 바꿔도 다른 칸은 그대로 */
type Slot = { cat: LifeCat; fam: EasyFam | HardFam };
function dayPlan(acct: string, day: string): Slot[] {
  const r = rng(`quest|${acct}|${day}|plan`);
  const easyCats = shuffle(LIFE_CATS, r);
  const hardCats = shuffle(LIFE_CATS, r).slice(0, 2);
  const out: Slot[] = easyCats.map((cat) => ({ cat, fam: pickW(EASY_FAMS, r) }));
  const h0 = pickW(HARD_FAMS, r);
  // 어려운 두 칸은 종류도 되도록 다르게
  const h1 = pickW(
    HARD_FAMS.filter(([f]) => f !== h0),
    r,
  );
  out.push({ cat: hardCats[0], fam: h0 }, { cat: hardCats[1], fam: h1 });
  return out;
}

/** 바꾼 칸: 같은 난이도에서 하루 계획에 없는 (갈래, 종류) 중 하나 */
function rerolledSlot(plan: Slot[], slot: number, r: () => number): Slot {
  const hard = isHardSlot(slot);
  const fams = (hard ? HARD_FAMS : EASY_FAMS).map(([f]) => f);
  const used = new Set(plan.filter((_, i) => isHardSlot(i) === hard).map((p) => `${p.cat}:${p.fam}`));
  const free = LIFE_CATS.flatMap((cat) => fams.map((fam) => ({ cat, fam }))).filter((p) => !used.has(`${p.cat}:${p.fam}`) && p.cat !== plan[slot].cat);
  return free.length ? free[Math.floor(r() * free.length)] : plan[slot];
}

/** (갈래, 종류) → 그날 낼 수 있는 의뢰. 못 내면(그날 나오는 종이 모자람) 그 갈래 아무거나 */
function specOf(p: Slot, hard: boolean, avail: Map<string, number>, r: () => number): QuestSpec {
  const any = (count: number): QuestSpec => ({ cat: p.cat, count, minRar: 1, distinct: false });
  const fallback = any(between(r, hard ? R(HARD_BULK[p.cat]) : EASY_ANY[p.cat]));
  const ok = (q: QuestSpec) => {
    const pool = poolOf(q, avail, MIN_BLOCKS);
    return q.distinct ? pool.length >= q.count + 1 : pool.length > 0;
  };
  let q: QuestSpec;
  switch (p.fam) {
    case "any":
      return any(between(r, EASY_ANY[p.cat]));
    case "bulk":
      return any(HARD_BULK[p.cat]);
    case "sp": {
      // 쉬운 종(★1, 가끔 ★2) 중 그날 6시간 이상 나오는 것
      const pool = POOL.filter((s) => s.cat === p.cat && s.rarity <= 2 && (avail.get(s.id) ?? 0) >= SP_MIN_BLOCKS);
      if (!pool.length) return fallback;
      const s = pickW(
        pool.map((x) => [x, x.rarity === 1 ? 3 : 1] as const),
        r,
      );
      const n = between(r, EASY_SP[p.cat]);
      return { cat: p.cat, count: s.rarity === 1 ? n : 1, minRar: 1, distinct: false, sp: s.id };
    }
    case "rar":
      if (!hard) q = { cat: p.cat, count: between(r, EASY_RAR[p.cat]), minRar: 2, distinct: false };
      // 어려운 칸: ★2 이상 여러 개, 또는 (그날 나오면) ★3 이상 하나
      else if (r() < 0.4) q = { cat: p.cat, count: 1, minRar: 3, distinct: false };
      else q = { cat: p.cat, count: between(r, HARD_RAR2[p.cat]), minRar: 2, distinct: false };
      return ok(q) ? q : fallback;
    case "kinds":
      q = { cat: p.cat, count: hard ? HARD_KINDS[p.cat] : 2, minRar: 1, distinct: true };
      return ok(q) ? q : fallback;
  }
}

const unit = (cat: LifeCat) => (cat === "fish" || cat === "bug" ? "마리" : "개");

/** "★2 이상 물고기 3마리" · "물고기 아무거나 3마리" · "곤충 서로 다른 3종" · "월요병 붕어 2마리" */
export function questText(q: QuestSpec): string {
  if (q.sp) return `${speciesById(q.sp)?.name ?? q.sp} ${q.count}${unit(q.cat)}`;
  const star = q.minRar > 1 ? `★${q.minRar} 이상 ` : "";
  if (q.distinct) return `${star}${CAT_LABEL[q.cat]} 서로 다른 ${q.count}종`;
  return star ? `${star}${CAT_LABEL[q.cat]} ${q.count}${unit(q.cat)}` : `${CAT_LABEL[q.cat]} 아무거나 ${q.count}${unit(q.cat)}`;
}

const HOW: Record<LifeCat, string> = {
  fish: "호수 잔교·강둑·연못·배 위에서 낚시",
  bug: "수풀에서 곤충 잡기",
  herb: "숲·풀밭·언덕·호숫가의 약초",
  ore: "언덕·동굴 앞 광석",
  dig: "풀밭·숲·언덕의 땅 파기",
};

/** 어디서·언제 한 줄 (특정 종이면 그 종의 시간·날씨) */
export function questHint(q: QuestSpec): string {
  const s = q.sp ? speciesById(q.sp) : undefined;
  if (!s) return HOW[q.cat];
  const when = [s.time?.map((t) => PHASE_LABEL[t]).join("·"), s.weather?.map((w) => WEATHER_LABEL[w]).join("·")].filter(Boolean).join(" · ");
  return `${HOW[q.cat]}${when ? ` · ${when}` : ""}`;
}

/**
 * 오늘의 의뢰 7개 (결정적). rerolled = 오늘 바꾼 칸 (없으면 null)
 */
export function dailyQuests(acct: string, day: string, rerolled: number | null): Quest[] {
  const avail = dayAvailability(day);
  const plan = dayPlan(acct, day);
  return Array.from({ length: QUEST_DAILY }, (_, slot) => {
    const v = rerolled === slot ? 1 : 0;
    const r = rng(`quest|${acct}|${day}|${slot}|${v}`);
    const p = v ? rerolledSlot(plan, slot, r) : plan[slot];
    const hard = isHardSlot(slot);
    const spec = specOf(p, hard, avail, r);
    return { ...spec, key: `d${slot}`, stamps: slotStamps(slot), hard, text: questText(spec), hint: questHint(spec) };
  });
}

/** 이번 주 큰 의뢰 (결정적, 그 주에 나오는 것만) */
export function weeklyQuest(acct: string, week: string, season: Season): Quest {
  const avail = weekAvailability(week);
  const r = rng(`quest|${acct}|${week}|week`);
  const cat = shuffle(LIFE_CATS, r)[0];
  const fam = pickW(
    [
      ["rare3", 40],
      ["kinds5", 30],
      ["bulk", 30],
    ] as const,
    r,
  );
  const tries: QuestSpec[] = [];
  if (fam === "rare3") tries.push({ cat, count: 3, minRar: 3, distinct: true });
  if (fam !== "bulk") tries.push({ cat, count: 5, minRar: 2, distinct: true });
  const spec =
    tries.find((q) => poolOf(q, avail, MIN_BLOCKS).length >= q.count + 1) ?? ({ cat, count: WEEK_BULK[cat], minRar: 1, distinct: false } satisfies QuestSpec);
  return {
    ...spec,
    key: "w",
    stamps: QUEST_STAMPS.weekly,
    hard: true,
    text: questText(spec),
    hint: HOW[cat],
    title: `${SEASON_LABEL[season]} ${WEEK_NAME[cat]} 주간`,
  };
}

// ── 납품 ──

/** 가방에서 이 의뢰에 쓸 수 있는 것 (싼 것부터) */
export function eligibleOf(q: QuestSpec, bag: Readonly<Record<string, number>>): { id: string; n: number }[] {
  return Object.entries(bag)
    .filter(([id, n]) => n > 0 && matches(q, id))
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => (speciesById(a.id)!.price - speciesById(b.id)!.price) || (speciesById(a.id)!.rarity - speciesById(b.id)!.rarity) || a.id.localeCompare(b.id));
}

/** 지금 가방으로 채운 정도 (서로 다른 종 의뢰는 종 수) */
export function questProgress(q: QuestSpec, bag: Readonly<Record<string, number>>): number {
  const el = eligibleOf(q, bag);
  const have = q.distinct ? el.length : el.reduce((n, x) => n + x.n, 0);
  return Math.min(q.count, have);
}

/** 기본으로 낼 것: 값이 가장 싼 맞는 것부터 (모자라면 null) */
export function defaultPick(q: QuestSpec, bag: Readonly<Record<string, number>>): Record<string, number> | null {
  const el = eligibleOf(q, bag);
  const out: Record<string, number> = {};
  let left = q.count;
  for (const { id, n } of el) {
    if (left <= 0) break;
    const take = q.distinct ? 1 : Math.min(n, left);
    out[id] = take;
    left -= take;
  }
  return left > 0 ? null : out;
}

/** 고른 것이 의뢰에 맞는지 (가방에 있는지는 저장소가 본다). 맞으면 null, 아니면 까닭 */
export function pickError(q: QuestSpec, pick: Readonly<Record<string, number>>): string | null {
  const rows = Object.entries(pick).filter(([, n]) => n > 0);
  if (rows.some(([id]) => !matches(q, id))) return "의뢰에 맞지 않는 것이 섞여 있어요.";
  if (q.distinct) {
    if (rows.some(([, n]) => n !== 1)) return "서로 다른 종을 하나씩 골라 주세요.";
    if (rows.length !== q.count) return `서로 다른 ${q.count}종을 골라 주세요.`;
    return null;
  }
  const total = rows.reduce((n, [, k]) => n + k, 0);
  return total === q.count ? null : `${q.count}${unit(q.cat)}를 골라 주세요.`;
}

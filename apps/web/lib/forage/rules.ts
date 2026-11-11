import { ambienceAt, type Season, type TimePhase, type Weather } from "../ambience";
import { bugsCount, bugsPlan } from "../rpg/plan";
import type { BugsResult } from "../rpg/types";
import {
  GATHER_NODES,
  RARITY_WEIGHT,
  SPECIES,
  type GatherNode,
  type LifeCat,
  type NodeKind,
  type Species,
  type Where,
} from "./catalog";

// 낚시·채집 규칙 (순수 함수 — 서버가 쓰고 테스트한다). 시간·날씨·계절은 lib/ambience(KST 시계 + 2시간 블록 날씨)라
// 서버와 모든 방문자가 같은 하늘을 본다 → 서버가 지금 조건으로 무엇이 잡힐지 굴린다.

export type Cond = { phase: TimePhase; weather: Weather; season: Season };
export const conditionsAt = (now: number): Cond => {
  const a = ambienceAt(now);
  return { phase: a.phase, weather: a.weather, season: a.season };
};

export function fits(s: Species, where: Where, c: Cond): boolean {
  if (!s.where.includes(where)) return false;
  if (s.time && !s.time.includes(c.phase)) return false;
  if (s.weather && !s.weather.includes(c.weather)) return false;
  if (s.season && !s.season.includes(c.season)) return false;
  return true;
}

/** 지금 이곳에서 잡힐 수 있는 것 */
export function candidates(cat: LifeCat, where: Where, c: Cond, filter?: (s: Species) => boolean): Species[] {
  return SPECIES.filter((s) => s.cat === cat && fits(s, where, c) && (!filter || filter(s)));
}

export const weightOf = (s: Species) => s.weight ?? RARITY_WEIGHT[s.rarity];

/** 무게대로 하나 (rand: [0,1)) */
export function pickWeighted(list: readonly Species[], rand: number): Species | null {
  if (!list.length) return null;
  const total = list.reduce((n, s) => n + weightOf(s), 0);
  let x = rand * total;
  for (const s of list) if ((x -= weightOf(s)) < 0) return s;
  return list[list.length - 1];
}

/** 크기 (0.1cm 단위 정수 = cm×10). 큰 것일수록 드물다. 크기를 재지 않는 것은 0 */
export function rollSize10(s: Species, rand: number): number {
  if (!s.size) return 0;
  const [lo, hi] = s.size;
  return Math.round((lo + (hi - lo) * Math.pow(rand, 1.8)) * 10);
}

export const sizeText = (size10: number) => (size10 > 0 ? `${(size10 / 10).toFixed(1)}cm` : "");

// ── 낚시 ──

/** 찌를 던지고 입질까지 (ms). 비 오는 날·새벽·해질녘엔 조금 빨리 문다 */
export const BITE_MIN_MS = 4_000;
export const BITE_MAX_MS = 15_000;
export function biteDelayMs(rand: number, c: Cond): number {
  let ms = BITE_MIN_MS + (BITE_MAX_MS - BITE_MIN_MS) * rand;
  if (c.weather === "rain") ms *= 0.8;
  if (c.phase === "dawn" || c.phase === "dusk") ms *= 0.85;
  return Math.round(Math.max(BITE_MIN_MS * 0.7, ms));
}

/** 손맛(1~5): 희귀도 + 큰 놈일수록. 클라이언트 줄다리기의 세기, 서버의 최소 감기 시간 */
export function fishPower(s: Species, size10: number): number {
  if (s.junk) return 1;
  const ratio = s.size ? (size10 / 10 - s.size[0]) / Math.max(0.1, s.size[1] - s.size[0]) : 0;
  return Math.max(1, Math.min(5, Math.round(s.rarity * 0.8 + ratio * 1.4)));
}

/** 그림자 크기 (입질 전 찌 아래로 보이는 것) */
export const SHADOW_LABEL = ["", "작은 그림자", "작은 그림자", "보통 그림자", "큰 그림자", "아주 큰 그림자"] as const;

/** 입질 뒤 챔질을 받아 주는 시간 (클라이언트 창은 이보다 짧다) */
export const HOOK_WINDOW_MS = 1_300;
/**
 * 줄다리기를 가장 빨리 끝낼 수 있는 시간 (계속 감기만 해도 이보다 빠를 수 없다 — 클라이언트 감기 속도의 역수).
 * 서버는 입질 시각 + 이 시간 - REEL_SLACK_MS 전에 온 "잡았다"를 거절한다
 */
export const reelMinMs = (power: number) => 1_600 + 450 * power;
export const REEL_SLACK_MS = 400;
/** 입질 뒤 이 시간 안에 결과를 내야 한다 (줄다리기는 길어야 30초쯤) */
export const REEL_MAX_MS = 60_000;

// ── 채집 ──

/** 채집 지점이 다시 피는 단위. 같은 창(15분) 안에서는 한 번 캔 자리가 비어 있다 */
export const NODE_WINDOW_MS = 15 * 60_000;
/** 창마다 지점이 피어 있을 확률 (사람마다 따로 굴린다) */
export const NODE_DENSITY: Record<NodeKind, number> = { herb: 0.6, ore: 0.5, dig: 0.4, bug: 0.55 };
export const nodeWindow = (now: number) => Math.floor(now / NODE_WINDOW_MS);
export const windowEndsAt = (w: number) => (w + 1) * NODE_WINDOW_MS;

/** FNV-1a 32비트 → [0,1) */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 2 ** 32;
}

/**
 * 이 사람에게 이 창에 이 지점이 피어 있는지 — 사람마다·창마다 결정적.
 * 채널 공용(먼저 캔 사람이 가져감)이 아니라 사람마다 따로 피어서 새치기·자리 다툼이 없고, 서버는 지점 상태를 들고 있지 않아도 된다
 */
export function nodeActive(acct: string, n: GatherNode, w: number): boolean {
  return hash01(`${acct}|${n.id}|${w}`) < NODE_DENSITY[n.kind];
}

/** 지금 이 사람에게 피어 있는 지점 (이번 창에 이미 캔 것 제외) */
export function activeNodes(acct: string, now: number, taken: ReadonlySet<string>): GatherNode[] {
  const w = nodeWindow(now);
  return GATHER_NODES.filter((n) => !taken.has(n.id) && nodeActive(acct, n, w));
}

/** 게이지 시간 (ms) */
export const GATHER_MS: Record<Exclude<NodeKind, "bug">, number> = { herb: 2_600, ore: 3_800, dig: 4_800 };
export const GATHER_SLACK_MS = 400;
/** 게이지를 시작하고 이 시간 안에 끝내야 한다 */
export const GATHER_TTL_SEC = 90;

/** 게이지 채집 한 번에 나오는 것: 대부분 1개, 가끔 같은 것 2개 (광석·약초) */
export function gatherCount(kind: NodeKind, rand: number): number {
  return kind !== "dig" && rand < 0.18 ? 2 : 1;
}

// ── 곤충 (수풀 미니게임 = 옛 사냥터 "벌레 잡기"를 옮겼다) ──
export const BUG_ROUND_SEC = 30;
export const BUG_DIFFICULTY = "easy" as const;
/** 곤충 미니게임은 능력치 영향 없이 모두 같다 */
export const BUG_STATS = { dex: 0, luk: 0 } as const;
export const BUG_CLOCK_SLACK_MS = 3_000;
export const BUG_TTL_SEC = BUG_ROUND_SEC + 120;

/** 미니게임 결과 → 몇 마리를 가져가나: 흔한 곤충은 (맞힌 수 − 실수) 5마리마다 1(최대 3), 금빛 곤충은 하나마다 희귀 1(최대 2) */
export function insectRolls(caught: number, golden: number, mistakes: number): { common: number; rare: number } {
  return { common: Math.min(3, Math.floor(Math.max(0, caught - mistakes) / 5)), rare: Math.min(2, golden) };
}

export type BugVerdict = { ok: true; caught: number; golden: number; mistakes: number } | { ok: false; message: string };

/** 시드로 다시 만든 출현 계획과 서버가 잰 시간으로 결과의 상한을 검사 (사냥터 evalBugs와 같은 규칙) */
export function verifyBugs(seed: number, r: BugsResult, serverElapsedMs: number): BugVerdict {
  if (r.durationMs > serverElapsedMs + BUG_CLOCK_SLACK_MS) return { ok: false, message: "기록된 시간이 실제로 흐른 시간보다 길어요." };
  const eff = Math.min(r.durationMs, serverElapsedMs, BUG_ROUND_SEC * 1000 + BUG_CLOCK_SLACK_MS);
  const c = bugsCount(bugsPlan(seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), eff);
  if (r.caught > c.bug || r.golden > c.golden || r.wrong > c.feature || r.decoy > c.decoy) return { ok: false, message: "이 시간 안에 잡을 수 있는 수보다 많아요." };
  return { ok: true, caught: r.caught, golden: r.golden, mistakes: r.wrong + r.decoy };
}

import { ambienceAt, type Season, type TimePhase, type Weather } from "../ambience";
import { bugsCount, bugsPlan } from "../rpg/plan";
import type { BugsResult } from "../rpg/types";
import type { UrgentKind } from "./quests/urgent";
import {
  GATHER_NODES,
  gradable,
  GRADE_U,
  NODE_CAT,
  RARITY_WEIGHT,
  SPECIES,
  type FishGrade,
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

/** where = 한 곳 또는 여러 곳 (11/26 캠핑장 물·채집 지점은 전용 종 + 이어진 곳 — catalog WATER_WHERES·nodeWheres) */
export function fits(s: Species, where: Where | readonly Where[], c: Cond): boolean {
  if (typeof where === "string" ? !s.where.includes(where) : !where.some((w) => s.where.includes(w))) return false;
  if (s.time && !s.time.includes(c.phase)) return false;
  if (s.weather && !s.weather.includes(c.weather)) return false;
  if (s.season && !s.season.includes(c.season)) return false;
  return true;
}

/** 지금 이곳에서 잡힐 수 있는 것 */
export function candidates(cat: LifeCat, where: Where | readonly Where[], c: Cond, filter?: (s: Species) => boolean): Species[] {
  return SPECIES.filter((s) => s.cat === cat && fits(s, where, c) && (!filter || filter(s)));
}

export const weightOf = (s: Species) => s.weight ?? RARITY_WEIGHT[s.rarity];

/** 무게대로 하나 (rand: [0,1)). mult = 종마다 무게 배율 (11/15 긴급 의뢰 마을 축제: 희귀 이상 조금 더 — lib/forage/quests/urgent festWeight) */
export function pickWeighted(list: readonly Species[], rand: number, mult?: (s: Species) => number): Species | null {
  if (!list.length) return null;
  const w = (s: Species) => weightOf(s) * (mult ? mult(s) : 1);
  const total = list.reduce((n, s) => n + w(s), 0);
  let x = rand * total;
  for (const s of list) if ((x -= w(s)) < 0) return s;
  return list[list.length - 1];
}

/**
 * 11/16 바다 낚시 만조 덤: 물 높이가 이 위(만조 앞뒤 약 30분)면 큰 놈 확률(크기 한 번 더 굴리기)을 더 얹는다.
 * 낚시 갈래 칭호 확률과 겹치면 둘 중 하나라도 걸리면 (1 − (1−a)(1−b))
 */
export const SEA_HIGH_TIDE_LEVEL = 0.75;
export const SEA_HIGH_TIDE_BIG = 0.3;
export const withHighTide = (chance: number, level: number): number => (level >= SEA_HIGH_TIDE_LEVEL ? 1 - (1 - chance) * (1 - SEA_HIGH_TIDE_BIG) : chance);

/** 크기 분포의 굽기 (size = lo + (hi − lo)·u^SIZE_CURVE) — 큰 것일수록 드물다 */
const SIZE_CURVE = 1.8;

/** 크기 (0.1cm 단위 정수 = cm×10). 큰 것일수록 드물다. 크기를 재지 않는 것은 0 */
export function rollSize10(s: Species, rand: number): number {
  if (!s.size) return 0;
  const [lo, hi] = s.size;
  return Math.round((lo + (hi - lo) * Math.pow(rand, SIZE_CURVE)) * 10);
}

/** 11/22 그 등급이 되는 가장 작은 크기 (cm×10, 소수 그대로 — 크기를 재지 않는 종은 Infinity) */
export function gradeMin10(s: Species, grade: Exclude<FishGrade, 0>): number {
  if (!s.size) return Infinity;
  const [lo, hi] = s.size;
  return (lo + (hi - lo) * Math.pow(GRADE_U[grade], SIZE_CURVE)) * 10;
}

/**
 * 11/22 물고기 크기 등급: 대물(1) = 크기 분포 위 20%, 월척(2) = 위 5% (catalog GRADE_U). 직접 낚은 것에만 쓴다 (service reelIn).
 * 크기를 재지 않는 종·잡동사니·물고기가 아닌 것은 늘 보통(0). 칭호·만조의 「크기 한 번 더 굴리기」는 등급 확률도 그대로 올린다
 */
export function sizeGrade(s: Species, size10: number): FishGrade {
  if (!gradable(s) || size10 <= 0) return 0;
  if (size10 >= gradeMin10(s, 2)) return 2;
  return size10 >= gradeMin10(s, 1) ? 1 : 0;
}

/**
 * 11/16 낚시 갈래 칭호(큰 물고기 확률): chance 확률로 크기를 한 번 더 굴려 큰 쪽을 갖는다 (rand: [0,1) 난수 함수).
 * chance가 0이면 예전과 똑같이 한 번만 굴린다 (난수도 하나만 쓴다)
 */
export function rollFishSize10(s: Species, rand: () => number, chance = 0): number {
  const a = rollSize10(s, rand());
  return chance > 0 && rand() < chance ? Math.max(a, rollSize10(s, rand())) : a;
}

/** 희귀 이상 (RARITY_LABEL 3 = 희귀) */
export const RARE_MIN = 3;

/**
 * 11/16 채집 갈래 칭호(희귀 채집물 확률): chance 확률로 희귀 이상에서만 뽑는다 (그런 게 없으면 보통 뽑기).
 * chance가 0이면 예전과 똑같이 pickWeighted 한 번 (난수도 하나만 쓴다)
 */
export function pickGather(list: readonly Species[], rand: () => number, mult?: (s: Species) => number, chance = 0): Species | null {
  if (chance > 0 && rand() < chance) {
    const rare = list.filter((s) => s.rarity >= RARE_MIN);
    if (rare.length) return pickWeighted(rare, rand(), mult);
  }
  return pickWeighted(list, rand(), mult);
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

/**
 * 채집 지점이 다시 피는 단위. 같은 창 안에서는 한 번 캔 자리가 비어 있다.
 * 11/16 사용자 "채집 지점이 너무 적고 늦게 다시 펴요" → 15분 → 10분 (지점도 맵마다 반쯤 더 — lib/forage/catalog). 하루 한도·포인트 한도는 그대로
 */
export const NODE_WINDOW_MS = 10 * 60_000;
/** 창마다 지점이 피어 있을 확률 (사람마다 따로 굴린다) */
// 11/16 갯벌 구멍(clam)은 물이 빠진 동안만 캘 수 있어서 조금 더 자주 피어요
// 11/22 사용자 「광석 긴급 의뢰 때 광석이 너무 늦게 펴요」 → 광석 0.5 → 0.6 (약초와 같게). 긴급 의뢰 동안은 아래 nodeBloomRule
export const NODE_DENSITY: Record<NodeKind, number> = { herb: 0.6, ore: 0.6, dig: 0.4, bug: 0.55, clam: 0.6 };
export const nodeWindow = (now: number) => Math.floor(now / NODE_WINDOW_MS);

/**
 * 11/22 긴급 의뢰(약초·광석·발굴품)가 열려 있는 동안 그 종류 지점은 이 창마다 모두(100%) 다시 핀다 (발굴품 = 땅 파기 + 갯벌 구멍 — NODE_CAT).
 * 생선 의뢰·다른 종류 지점은 그대로 10분 창
 */
export const NODE_FAST_MS = 5 * 60_000;
/**
 * 11/22 창 id: 10분 창은 0 이상(nodeWindow), 5분 창은 음수 −(5분 창 번호 + 1) → 「캔 자리」 기록(`${창}:${지점}`)이 두 창끼리 겹치지 않는다.
 * 5분 창은 늘 10분 창 하나 안에 들어가 nodeBaseWindow로 그 10분 창의 묶음 키를 같이 쓴다 (lib/forage/store — 키·읽기가 늘지 않는다)
 */
const fastWindow = (now: number) => -(Math.floor(now / NODE_FAST_MS) + 1);
export const nodeBaseWindow = (w: number) => (w >= 0 ? w : Math.floor((-w - 1) / (NODE_WINDOW_MS / NODE_FAST_MS)));
export const windowEndsAt = (w: number) => (w >= 0 ? (w + 1) * NODE_WINDOW_MS : -w * NODE_FAST_MS);

/** 11/22 지점 규칙이 보는 긴급 의뢰 (종류·시작·끝 — 150%로 일찍 끝났으면 그 시각이 end. 서버는 일정에서, 화면은 /api/forage/urgent의 ev에서) */
export type NodeUrgent = { kind: UrgentKind; start: number; end: number };
/** density = 이 창에 필 확률 · window = 창 id (캔 자리 기록·피는 굴림에 쓴다) · endsAt = 이 규칙이 바뀌는 시각 (창 끝 또는 의뢰 시작·끝) */
export type NodeBloom = { density: number; window: number; endsAt: number };

/** 11/22 이 종류 지점에 지금 긴급 의뢰 빠른 창이 걸려 있나 */
export const nodeFast = (kind: NodeKind, now: number, ev: NodeUrgent | null | undefined): boolean =>
  !!ev && ev.kind !== "fish" && NODE_CAT[kind] === ev.kind && ev.start <= now && now < ev.end;

/**
 * 11/22 지점 종류·시각·진행 중인 긴급 의뢰 → 피는 규칙 (서버·화면 공통 — 둘이 어긋나지 않게 여기 하나만).
 * 의뢰 동안 맞는 종류는 5분 창·100%, 아니면 10분 창·NODE_DENSITY. 5분 창의 끝은 의뢰 끝을 넘지 않는다 (끝나면 바로 10분 창으로)
 */
export function nodeBloomRule(kind: NodeKind, now: number, ev: NodeUrgent | null | undefined): NodeBloom {
  if (nodeFast(kind, now, ev)) {
    const window = fastWindow(now);
    return { density: 1, window, endsAt: Math.min(windowEndsAt(window), ev!.end) };
  }
  const window = nodeWindow(now);
  const end = windowEndsAt(window);
  // 곧 시작할 의뢰를 이미 알면 (화면이 막 받은 경우) 시작 시각에 규칙이 바뀐다
  const soon = ev && ev.kind !== "fish" && NODE_CAT[kind] === ev.kind && now < ev.start && ev.start < end ? ev.start : end;
  return { density: NODE_DENSITY[kind], window, endsAt: soon };
}

/** 11/22 모든 지점 종류 중 가장 먼저 규칙이 바뀌는 시각 (상태 refreshAt — 화면이 그때 지점을 다시 굴린다) */
export function nodeRefreshAt(now: number, ev: NodeUrgent | null | undefined): number {
  return Math.min(...(Object.keys(NODE_DENSITY) as NodeKind[]).map((k) => nodeBloomRule(k, now, ev).endsAt));
}

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
 * 11/16 사람마다 채집 지점 씨앗 (계정 id를 화면에 보내지 않으려고 해시만). 서버가 상태(nodes.seed)에 실어 보내면
 * 화면이 다음 창에 피는 지점을 스스로 계산한다 (nodeIdsAt) → 창이 짧아져도 창마다 서버에 묻지 않는다
 */
export const nodeSeed = (acct: string): string => Math.floor(hash01(`node|${acct}`) * 2 ** 32).toString(36);

/** 씨앗으로 이 창에 이 지점이 피어 있는지 (서버·화면 공통). density = 11/22 그 창 규칙의 확률 (없으면 평소) */
export function nodeActiveSeed(seed: string, n: GatherNode, w: number, density = NODE_DENSITY[n.kind]): boolean {
  return hash01(`${seed}|${n.id}|${w}`) < density;
}

/**
 * 이 사람에게 이 창에 이 지점이 피어 있는지 — 사람마다·창마다 결정적.
 * 채널 공용(먼저 캔 사람이 가져감)이 아니라 사람마다 따로 피어서 새치기·자리 다툼이 없고, 서버는 지점 상태를 들고 있지 않아도 된다
 */
export function nodeActive(acct: string, n: GatherNode, w: number): boolean {
  return nodeActiveSeed(nodeSeed(acct), n, w);
}

/** 11/22 씨앗·시각·긴급 의뢰로 이 지점이 지금 피어 있는지 (창 안에서 캤는지는 따로) */
export function nodeBloomsAt(seed: string, n: GatherNode, now: number, ev: NodeUrgent | null | undefined): boolean {
  const r = nodeBloomRule(n.kind, now, ev);
  return nodeActiveSeed(seed, n, r.window, r.density);
}

/** 씨앗으로 창 w에 피는 지점 id 전부 (평소 10분 창 — 새 창이라 아직 캔 것이 없다) */
export function nodeIdsAt(seed: string, w: number): string[] {
  return GATHER_NODES.filter((n) => nodeActiveSeed(seed, n, w)).map((n) => n.id);
}

/** 11/22 캔 자리 기록 한 줄 (`${창}:${지점}` — 저장소 묶음 키의 멤버와 같다) */
export const tookMember = (w: number, node: string) => `${w}:${node}`;
/** 11/22 지금 각 지점의 규칙 창에 캔 지점 id (묶음 키 멤버 중 지금 창 것만 — 5분 창·10분 창이 섞여 있어도 지점마다 자기 창만 본다) */
export function takenNow(members: readonly string[], now: number, ev: NodeUrgent | null | undefined): Set<string> {
  const have = new Set(members);
  return new Set(GATHER_NODES.filter((n) => have.has(tookMember(nodeBloomRule(n.kind, now, ev).window, n.id))).map((n) => n.id));
}

/**
 * 11/16 화면은 창 NODE_SYNC_WINDOWS개마다 한 번만 서버에서 상태를 다시 받고(w % 3 === 0), 그 사이 창은 스스로 바꾼다.
 * 10분 창 × 3 = 30분마다 한 번 → 예전(15분 창마다 한 번)보다 상태 읽기가 절반 (components/forage/forageStore)
 */
export const NODE_SYNC_WINDOWS = 3;

/** 지금 이 사람에게 피어 있는 지점 (이번 창에 이미 캔 것 제외 — taken은 takenNow로 만든 지점 id). ev = 11/22 진행 중인 긴급 의뢰 */
export function activeNodes(acct: string, now: number, taken: ReadonlySet<string>, ev?: NodeUrgent | null): GatherNode[] {
  const seed = nodeSeed(acct);
  return GATHER_NODES.filter((n) => !taken.has(n.id) && nodeBloomsAt(seed, n, now, ev));
}

/**
 * 11/22 화면이 서버에 묻지 않고 지점 목록을 다른 시각·의뢰 상태로 바꾼다 (창이 바뀔 때·긴급 의뢰가 열리고 닫힐 때).
 * 규칙 창이 그대로인 지점은 지금 목록 그대로(캔 것이 빠진 채), 창이 바뀐 지점만 씨앗으로 새로 굴린다 (새 창엔 아직 캔 것이 없다 → 서버와 같다).
 * from = 지금 목록을 만든 시각·그때 본 의뢰, to = 바꿀 시각·지금 본 의뢰
 */
export function rollNodeIds(
  seed: string,
  ids: readonly string[],
  from: { at: number; ev: NodeUrgent | null | undefined },
  to: { at: number; ev: NodeUrgent | null | undefined },
): string[] {
  const had = new Set(ids);
  return GATHER_NODES.filter((n) => {
    const a = nodeBloomRule(n.kind, from.at, from.ev);
    const b = nodeBloomRule(n.kind, to.at, to.ev);
    return a.window === b.window ? had.has(n.id) : nodeActiveSeed(seed, n, b.window, b.density);
  }).map((n) => n.id);
}

/** 게이지 시간 (ms) */
export const GATHER_MS: Record<Exclude<NodeKind, "bug">, number> = { herb: 2_600, ore: 3_800, dig: 4_800, clam: 4_200 };
export const GATHER_SLACK_MS = 400;
/** 게이지를 시작하고 이 시간 안에 끝내야 한다 */
export const GATHER_TTL_SEC = 90;

/** 게이지 채집 한 번에 나오는 것: 대부분 1개, 가끔 같은 것 2개 (광석·약초·11/16 갯벌) */
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

/** 11/15 곤충 채집 한 판 포인트 최대 (곤충은 따로 가방에 — 포인트는 「곤충 채집」 항목. 한 판 결과 상한 검사) */
export const INSECT_POINTS_MAX = 15;
/** 곤충 채집 한 판 포인트: 그 판에 나온 곤충을 모두 잡으면 최대 (금빛은 셋 몫, 실수는 하나씩 뺀다) */
export function insectPoints(seed: number, caught: number, golden: number, mistakes: number): number {
  const all = bugsCount(bugsPlan(seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
  const target = Math.max(1, all.bug + 3 * all.golden);
  const perf = Math.max(0, Math.min(1, (caught + 3 * golden - mistakes) / target));
  return Math.round(INSECT_POINTS_MAX * perf);
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

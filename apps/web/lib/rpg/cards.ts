import { HUNT_ZONES, MONSTERS, type MonsterId } from "./catalog";
import { seeded } from "./formulas";

// 11/15 야근 빌딩 능력 카드 (판 안에서만 쌓이고 판이 끝나면 사라진다).
// 몬스터를 잡으면 판 레벨 막대가 차고, 오를 때마다 세 장 중 하나를 고른다. 10층 우두머리 뒤엔 상사의 제안, 체크포인트 시작이면 카드부터.
// 순수 함수만 — 게임(game/rpg/cards)·화면(CardPick·RunCards)·서버(tower evalTower)가 같은 표와 같은 시드 굴림을 쓴다.
// 제안은 판 시드 + 몇 번째 제안인지 + 다시 뽑기 횟수로 정해진다 → 서버가 똑같이 다시 굴려서 고른 카드가 제안된 것인지 본다.
//
// 무기마다 어떻게 붙나 (근접 = 휘두르기·내려찍기·찌르기·연타, 원거리 = 쏘기·던지기, 마법 = 범위 마법)
//  - 참조 추가: 공격 한 번이 한 번 더 (원거리 한 발 더, 근접 한 번 더 휘두름, 마법 한 번 더 터짐). 한 번 피해 −10%씩
//  - 방향 카드(회람·옆자리·뒷담화): 원거리는 그쪽으로 한 발, 근접은 그쪽으로도 같이 휘두름, 마법은 그쪽 적 발밑에 한 번 더
//  - 병렬 처리(앞): 원거리는 나란히 한 발 더, 근접은 앞으로 서류 바람(뚫고 가는 짧은 투사체), 마법은 앞쪽 다른 적에게 한 번 더
//  - 직보: 원거리는 관통(던지기는 원래 뚫으니 피해 +20%), 근접은 닿는 거리 +35%, 마법은 터지는 범위 +35%
//  - 업무 토스: 원거리는 맞힌 뒤 근처 적에게 튕겨 감, 근접·마법은 맞은 적에게서 서류가 근처 적으로 튕겨 나감 (공격마다 한 번)
//  - 반려 후 재상신: 원거리는 벽에 맞으면 튕김, 근접·마법은 밀려나 벽에 부딪힌 적이 한 번 더 아픔
//  - 나머지(속성·결재판·방패·인턴·회복·능력치·전설)는 무기와 상관없이 같다

export type CardRarity = "common" | "rare" | "legend";
export type CardKindStyle = "melee" | "ranged" | "magic";

export const CARD_IDS = [
  "cc",
  "parallel",
  "circular",
  "side",
  "backbite",
  "direct",
  "toss",
  "resubmit",
  "passion",
  "chill",
  "solo",
  "urgent",
  "boards",
  "papers",
  "intern",
  "offwork",
  "coffee",
  "raise",
  "quick",
  "sharp",
  "health",
  "commute",
  "oneshot",
  "overtime",
] as const;
export type CardId = (typeof CARD_IDS)[number];

export type CardDef = {
  id: CardId;
  name: string;
  rarity: CardRarity;
  /** 겹쳐 가질 수 있는 수 (Infinity = 제한 없음) */
  max: number;
  /** 카드에 적는 말 (무기와 상관없이 같을 때) */
  desc: string;
  /** 무기마다 다르게 붙는 카드: 근접·원거리·마법 각각 */
  by?: Record<CardKindStyle, string>;
  /** 그림 (game/rpg/cards/cardArt 그림 이름) · 바탕색 */
  art: { main: number; accent: number };
};

const c = (id: CardId, name: string, rarity: CardRarity, max: number, desc: string, main: number, accent: number, by?: CardDef["by"]): CardDef => ({
  id,
  name,
  rarity,
  max,
  desc,
  ...(by ? { by } : {}),
  art: { main, accent },
});

export const CARDS: Record<CardId, CardDef> = {
  cc: c("cc", "참조 추가", "rare", 3, "공격이 한 번 더 나가요. 대신 한 번 피해가 10% 줄어요.", 0x7ab8e8, 0xf2ead3, {
    melee: "한 번 더 휘둘러요. 대신 한 번 피해가 10% 줄어요.",
    ranged: "한 발 더 쏴요. 대신 한 발 피해가 10% 줄어요.",
    magic: "잉크가 한 번 더 터져요. 대신 한 번 피해가 10% 줄어요.",
  }),
  parallel: c("parallel", "병렬 처리", "rare", 2, "앞으로 한 갈래 더 나가요.", 0x5ad0a0, 0x1e3a4a, {
    melee: "휘두르면 앞으로 서류 바람이 날아가요. 적을 뚫고 가요.",
    ranged: "앞으로 나란히 한 발 더 쏴요.",
    magic: "앞쪽 다른 적 발밑에서도 잉크가 터져요.",
  }),
  circular: c("circular", "회람", "common", 2, "양쪽 대각선으로도 나가요.", 0xe8c86a, 0x5a4a2a, {
    melee: "양쪽 대각선으로도 같이 휘둘러요.",
    ranged: "양쪽 대각선으로도 한 발씩 쏴요.",
    magic: "양쪽 대각선 쪽 적에게도 잉크가 터져요.",
  }),
  side: c("side", "옆자리 협업", "common", 2, "양옆으로도 나가요.", 0xe89a6a, 0x4a2a1e, {
    melee: "양옆으로도 같이 휘둘러요.",
    ranged: "양옆으로도 한 발씩 쏴요.",
    magic: "양옆 적에게도 잉크가 터져요.",
  }),
  backbite: c("backbite", "뒷담화", "common", 2, "뒤로도 나가요.", 0xa88ad8, 0x2a1e4a, {
    melee: "뒤쪽으로도 같이 휘둘러요.",
    ranged: "뒤로도 한 발 쏴요.",
    magic: "뒤쪽 적에게도 잉크가 터져요.",
  }),
  direct: c("direct", "직보", "rare", 1, "중간을 건너뛰고 곧장 꽂혀요.", 0xe85a5a, 0xffe08a, {
    melee: "공격이 35% 더 멀리 닿아요.",
    ranged: "적을 뚫고 지나가요. 원래 뚫는 무기면 피해가 20% 올라요.",
    magic: "잉크가 35% 더 넓게 터져요.",
  }),
  toss: c("toss", "업무 토스", "rare", 2, "맞힌 적 근처의 다른 적에게 일이 넘어가요.", 0xf0a040, 0x3a2a1a, {
    melee: "때린 적에게서 서류가 근처 적에게 튕겨 가요.",
    ranged: "맞힌 뒤 근처 적에게 튕겨 가요.",
    magic: "터진 자리에서 서류가 근처 적에게 튕겨 가요.",
  }),
  resubmit: c("resubmit", "반려 후 재상신", "common", 1, "벽에 막혀도 다시 올라가요.", 0x8a9aa8, 0xe84a4a, {
    melee: "밀려나 벽에 부딪힌 적이 한 번 더 아파해요.",
    ranged: "벽에 맞으면 튕겨서 다시 날아가요.",
    magic: "밀려나 벽에 부딪힌 적이 한 번 더 아파해요.",
  }),
  passion: c("passion", "야근 열정", "rare", 1, "맞은 적이 한동안 불타요.", 0xff7a3a, 0xffe08a),
  chill: c("chill", "냉랭한 분위기", "rare", 1, "맞은 적이 느려지고, 가끔 꽁꽁 얼어요.", 0x8ad8f0, 0xe8f8ff),
  solo: c("solo", "독박 업무", "rare", 1, "맞을 때마다 독이 쌓여요. 쌓일수록 아파요.", 0x8ac83a, 0x2a3a1a),
  urgent: c("urgent", "급한 호출", "rare", 1, "공격할 때마다 번개가 근처 적 셋을 타고 넘어가요.", 0xf0e05a, 0x3a3aa8),
  boards: c("boards", "도는 결재판", "rare", 3, "결재판이 내 둘레를 돌며 닿는 적을 쳐요.", 0xc8884a, 0xf2ead3),
  papers: c("papers", "서류 방패", "rare", 2, "서류가 내 둘레를 돌며 날아오는 공격을 막아요.", 0xf2ead3, 0x7ab8e8),
  intern: c("intern", "인턴 소환", "rare", 2, "인턴이 따라다니며 서류를 던져요.", 0x6ab0e8, 0xf0c8a0),
  offwork: c("offwork", "칼퇴 의지", "common", 2, "적을 잡을 때마다 체력이 1% 차요.", 0x5ad08a, 0xf2ead3),
  coffee: c("coffee", "커피 수혈", "common", Infinity, "지금 바로 체력이 40% 차요.", 0x8a5a3a, 0xf2ead3),
  raise: c("raise", "연봉 협상", "common", 5, "공격력이 15% 올라요.", 0xffc84a, 0x5a3a1a),
  quick: c("quick", "손이 빨라짐", "common", 5, "공격 속도가 12% 빨라져요.", 0x6ae0d0, 0x1e3a3a),
  sharp: c("sharp", "예리한 지적", "common", 4, "치명타 확률 8%, 치명타 피해 20%가 올라요.", 0xe84a6a, 0xf2ead3),
  health: c("health", "체력 관리", "common", 5, "최대 체력이 15% 늘어요.", 0xe86a8a, 0xffe0e8),
  commute: c("commute", "빠른 퇴근길", "common", 3, "이동 속도가 10% 빨라져요.", 0x7ac8f0, 0x2a3a5a),
  oneshot: c("oneshot", "원샷 결재", "legend", 1, "일반 몬스터를 5% 확률로 한 번에 처리해요.", 0xffd84a, 0xa83c3c),
  overtime: c("overtime", "무한 야근", "legend", 1, "쓰러져도 한 번은 체력 30%로 다시 일어나요.", 0xe8dcff, 0xffd84a),
};

export const CARD_LIST: readonly CardDef[] = CARD_IDS.map((id) => CARDS[id]);
export const isCardId = (v: unknown): v is CardId => typeof v === "string" && Object.hasOwn(CARDS, v);

export const RARITY_NAME: Record<CardRarity, string> = { common: "일반", rare: "희귀", legend: "전설" };

/** 무기 방식 → 카드가 붙는 갈래 */
export function cardStyleKind(style: string): CardKindStyle {
  return style === "shot" || style === "card" ? "ranged" : style === "magic" ? "magic" : "melee";
}
/** 카드에 적는 말 (내 무기에 맞게) */
export const cardText = (id: CardId, kind: CardKindStyle) => CARDS[id].by?.[kind] ?? CARDS[id].desc;

/**
 * 11/15 겹치는 카드를 또 고를 때 보여 줄 숫자: "공격력 +15% → +30% (+15%)". 가진 장 수(have) 기준.
 * 카드 효과는 장마다 똑같이 쌓인다 (cardStats와 같은 숫자). 숫자로 말하기 어려운 카드는 null
 */
export function cardStackLine(id: CardId, have: number): string | null {
  const step = (label: string, per: number, unit = "%") => `${label} +${per * have}${unit} → +${per * (have + 1)}${unit} (+${per}${unit})`;
  const count = (label: string, from: number, to: number, unit: string) => `${label} ${from}${unit} → ${to}${unit} (+${to - from}${unit})`;
  switch (id) {
    case "raise":
      return step("공격력", 15);
    case "quick":
      return step("공격 속도", 12);
    case "sharp":
      return `치명타 +${8 * have}% → +${8 * (have + 1)}% (+8%), 치명타 피해 +${20 * have}% → +${20 * (have + 1)}% (+20%)`;
    case "health":
      return step("최대 체력", 15);
    case "commute":
      return step("이동 속도", 10);
    case "offwork":
      return step("처치할 때 체력", 1);
    case "cc":
      return `공격 횟수 +${have} → +${have + 1} (+1), 한 번 피해 −${10 * have}% → −${10 * (have + 1)}%`;
    case "parallel":
    case "circular":
    case "side":
    case "backbite":
      return count("갈래", have, have + 1, "개");
    case "toss":
      return count("튕기는 횟수", have, have + 1, "번");
    case "boards":
      return count("결재판", have + 1, have + 2, "장");
    case "papers":
      return count("서류", 2 * have, 2 * (have + 1), "장");
    case "intern":
      return count("인턴", have, have + 1, "명");
    default:
      return null;
  }
}

// ── 판 레벨 ──

/** 처치 하나의 판 경험치 (몬스터 id만으로 정한다 — 서버가 처치 기록으로 똑같이 센다) */
let eliteIds: Set<MonsterId> | null = null;
export function runXpOf(id: MonsterId): number {
  const def = MONSTERS[id];
  if (!def) return 0;
  if (def.behavior === "boss") return 20;
  if (!eliteIds) eliteIds = new Set(Object.values(HUNT_ZONES).flatMap((z) => (z.elite ? [z.elite] : [])));
  if (eliteIds.has(id)) return 6;
  return def.minion ? 1 : 2;
}
export function runXp(kills: Partial<Record<MonsterId, number>>): number {
  let xp = 0;
  for (const [id, n] of Object.entries(kills) as [MonsterId, number][]) xp += runXpOf(id) * Math.max(0, Math.floor(n));
  return xp;
}
/** 판 레벨 L → L+1에 필요한 경험치 (1층부터 15층쯤 오르면 열두어 번 오른다) */
export const RUN_XP_BASE = 20;
export const RUN_XP_STEP = 7;
export const runXpNeed = (lv: number) => RUN_XP_BASE + RUN_XP_STEP * Math.max(0, lv);
/** 경험치 → 판 레벨(오른 횟수)·이번 레벨에 쌓인 양·필요한 양 */
export function runLevel(xp: number): { level: number; into: number; need: number } {
  let level = 0;
  let left = Math.max(0, xp);
  while (left >= runXpNeed(level) && level < 10_000) {
    left -= runXpNeed(level);
    level++;
  }
  return { level, into: left, need: runXpNeed(level) };
}

// ── 다시 뽑기·상사의 제안·체크포인트 ──

/** 다시 뽑기: 판마다 1번 + 이번 판에 깬 10층마다 1번 */
export const rerollsAllowed = (floorsCleared: number) => 1 + Math.floor(Math.max(0, floorsCleared) / 10);
/** 상사의 제안: 10층마다 우두머리를 잡으면 */
export const BOSS_DEAL_EVERY = 10;
export const isBossDealFloor = (f: number) => Number.isInteger(f) && f > 0 && f % BOSS_DEAL_EVERY === 0;
/** 상사의 제안을 받으면 최대 체력이 이만큼 줄어든다 (판 안에서만) */
export const BOSS_DEAL_HP_COST = 0.15;
/** 체크포인트에서 시작하면 건너뛴 10층마다 카드 3장 */
export const START_PICKS_PER_10 = 3;
export const startPicks = (start: number) => START_PICKS_PER_10 * Math.max(0, Math.floor((start - 1) / 10));

// ── 제안 굴림 ──

/** 제안 종류: l = 판 레벨 업, s = 체크포인트 시작, b = 상사의 제안 (i = 층) */
export type OfferKind = "l" | "s" | "b";
/** 고른 기록 하나 (결과에 실어 보낸다). r = 이 제안에서 다시 뽑은 횟수 */
export type CardPick = { k: OfferKind; i: number; r: number; c: CardId };
export type CardCounts = Partial<Record<CardId, number>>;

const OFFER_SIZE = 3;
/** 일반:희귀 뽑힐 무게 */
const WEIGHT: Record<CardRarity, number> = { common: 1, rare: 0.6, legend: 0 };
/** 다시 뽑은 제안에서 전설이 한 장 끼어들 확률 */
export const LEGEND_REROLL = 0.08;
/** 상사의 제안이 전설일 확률 */
export const LEGEND_BOSS = 0.12;

const KIND_SALT: Record<OfferKind, number> = { l: 0x4c56, s: 0x5354, b: 0x4253 };
function offerSeed(seed: number, k: OfferKind, i: number, r: number): number {
  let h = (seed ^ 0x43415244) >>> 0;
  for (const x of [KIND_SALT[k], i, r]) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  }
  return h >>> 0;
}

const canTake = (owned: CardCounts, id: CardId) => (owned[id] ?? 0) < CARDS[id].max;

function weighted(r: () => number, pool: CardId[]): CardId {
  let sum = 0;
  for (const id of pool) sum += WEIGHT[CARDS[id].rarity] || 1;
  let x = r() * sum;
  for (const id of pool) {
    x -= WEIGHT[CARDS[id].rarity] || 1;
    if (x < 0) return id;
  }
  return pool[pool.length - 1];
}

/**
 * 제안 카드. 레벨 업·시작은 세 장 (처음 굴림엔 전설이 없다, 다시 뽑으면 낮은 확률로 한 장),
 * 상사의 제안은 희귀 이상 한 장 (낮은 확률로 전설). owned = 지금 가진 카드 (다 쌓인 카드는 안 나온다)
 */
export function cardOffer(seed: number, k: OfferKind, i: number, r: number, owned: CardCounts): CardId[] {
  const rnd = seeded(offerSeed(seed, k, i, r));
  const legends = CARD_IDS.filter((id) => CARDS[id].rarity === "legend" && canTake(owned, id));
  if (k === "b") {
    const roll = rnd();
    if (legends.length && roll < LEGEND_BOSS) return [legends[Math.floor(rnd() * legends.length)]];
    const rares = CARD_IDS.filter((id) => CARDS[id].rarity === "rare" && canTake(owned, id));
    if (rares.length) return [rares[Math.floor(rnd() * rares.length)]];
    return legends.length ? [legends[0]] : ["coffee"];
  }
  let pool = CARD_IDS.filter((id) => CARDS[id].rarity !== "legend" && canTake(owned, id));
  const out: CardId[] = [];
  while (out.length < OFFER_SIZE && pool.length) {
    const id = weighted(rnd, pool);
    out.push(id);
    pool = pool.filter((x) => x !== id);
  }
  const roll = rnd();
  const slot = Math.floor(rnd() * Math.max(1, out.length));
  if (r > 0 && legends.length && roll < LEGEND_REROLL) {
    const lg = legends[Math.floor(rnd() * legends.length)];
    if (out.length) out[slot] = lg;
    else out.push(lg);
  }
  return out;
}

/** 서버 검사에 쓰는 한도: 판 레벨 업 수, 시작 카드 수, 상사의 제안을 받을 수 있던 층, 다시 뽑기 수 */
export type PickLimits = { levels: number; starts: number; bossFloors: readonly number[]; rerolls: number };
export type PickVerdict = { ok: true; owned: CardCounts } | { ok: false; why: string };

/** 판 하나에 실을 수 있는 고른 기록 수 (형식 검사) */
export const MAX_PICKS = 600;

/**
 * 고른 기록을 처음부터 다시 굴려 본다 (서버·테스트·게임 모두): 순서대로, 레벨 업·시작 카드는 번호가 0부터 이어지고,
 * 상사의 제안은 받을 수 있던 층에서 한 번씩, 다시 뽑기는 한도 안, 고른 카드는 그때 제안된 카드여야 한다
 */
export function replayPicks(seed: number, picks: readonly CardPick[], lim: PickLimits): PickVerdict {
  if (picks.length > MAX_PICKS) return { ok: false, why: "too many" };
  const owned: CardCounts = {};
  let nl = 0;
  let ns = 0;
  let rr = 0;
  const boss = new Set<number>();
  const bossOk = new Set(lim.bossFloors);
  for (const p of picks) {
    if (!p || !isCardId(p.c) || !Number.isInteger(p.i) || p.i < 0 || !Number.isInteger(p.r) || p.r < 0) return { ok: false, why: "format" };
    if (p.k === "l") {
      if (p.i !== nl || nl >= lim.levels) return { ok: false, why: "level" };
      nl++;
    } else if (p.k === "s") {
      if (p.i !== ns || ns >= lim.starts || nl > 0) return { ok: false, why: "start" };
      ns++;
    } else if (p.k === "b") {
      if (!bossOk.has(p.i) || boss.has(p.i) || p.r !== 0) return { ok: false, why: "boss" };
      boss.add(p.i);
    } else return { ok: false, why: "format" };
    rr += p.r;
    if (rr > lim.rerolls) return { ok: false, why: "reroll" };
    if (!cardOffer(seed, p.k, p.i, p.r, owned).includes(p.c)) return { ok: false, why: "offer" };
    owned[p.c] = (owned[p.c] ?? 0) + 1;
  }
  return { ok: true, owned };
}

// ── 카드 수치 (게임이 쓴다) ──

export const FOCUS_ASPD = 0.4;

export type CardStats = {
  atkMul: number;
  aspdMul: number;
  crit: number;
  /** 치명타 피해 배율에 더하는 값 (기본 치명타 ×1.5) */
  critDmg: number;
  hpMul: number;
  moveMul: number;
  /** 참조 추가 수 · 그만큼 한 번 피해 배율 */
  extra: number;
  hitMul: number;
  front: number;
  /** 기본 방향 말고 더 나가는 방향 (라디안, 0 = 앞) */
  dirs: number[];
  pierce: boolean;
  toss: number;
  wall: boolean;
  burn: boolean;
  chill: boolean;
  poison: boolean;
  chain: boolean;
  boards: number;
  papers: number;
  interns: number;
  killHeal: number;
  oneshot: boolean;
  revive: boolean;
};

const D = Math.PI / 180;
/** 방향 카드가 겹칠 때마다 더해지는 각도 (도) */
const DIR_STEPS: Record<"circular" | "side" | "backbite", number[][]> = {
  circular: [
    [45, -45],
    [28, -28],
  ],
  side: [
    [90, -90],
    [72, -72],
  ],
  backbite: [[180], [162, 198]],
};

export function cardStats(o: CardCounts): CardStats {
  const n = (id: CardId) => Math.max(0, Math.min(o[id] ?? 0, CARDS[id].max));
  const dirs: number[] = [];
  for (const id of ["circular", "side", "backbite"] as const) for (let k = 0; k < n(id); k++) dirs.push(...DIR_STEPS[id][k].map((d) => d * D));
  return {
    atkMul: 1 + 0.15 * n("raise"),
    aspdMul: 1 + 0.12 * n("quick"),
    crit: 8 * n("sharp"),
    critDmg: 0.2 * n("sharp"),
    hpMul: 1 + 0.15 * n("health"),
    moveMul: 1 + 0.1 * n("commute"),
    extra: n("cc"),
    hitMul: 1 - 0.1 * n("cc"),
    front: n("parallel"),
    dirs,
    pierce: n("direct") > 0,
    toss: n("toss"),
    wall: n("resubmit") > 0,
    burn: n("passion") > 0,
    chill: n("chill") > 0,
    poison: n("solo") > 0,
    chain: n("urgent") > 0,
    boards: n("boards") ? n("boards") + 1 : 0,
    papers: 2 * n("papers"),
    interns: n("intern"),
    killHeal: 0.01 * n("offwork"),
    oneshot: n("oneshot") > 0,
    revive: n("overtime") > 0,
  };
}

/**
 * 서버 처치 속도 상한에 곱하는 배율 (넉넉하게): 멈추면 집중 + 카드가 늘리는 초당 피해·여러 마리 타격.
 * 판 끝의 카드로 판 전체를 본다 (일찍 고른 카드만큼 늘 여유가 있다)
 */
export const CARD_POWER_MAX = 40;
export function cardPower(o: CardCounts): number {
  const s = cardStats(o);
  let p = 1 + FOCUS_ASPD;
  p *= s.atkMul * s.aspdMul * (1 + 0.12 * (o.sharp ?? 0));
  p *= (1 + s.extra) * Math.max(0.5, s.hitMul);
  p *= 1 + 0.25 * (s.front + s.dirs.length);
  if (s.pierce) p *= 1.35;
  p *= 1 + 0.3 * s.toss;
  if (s.wall) p *= 1.15;
  if (s.burn) p *= 1.3;
  if (s.chill) p *= 1.15;
  if (s.poison) p *= 1.35;
  if (s.chain) p *= 1.6;
  p *= 1 + 0.25 * s.boards + 0.05 * s.papers + 0.35 * s.interns;
  if (s.oneshot) p *= 1.15;
  return Math.min(CARD_POWER_MAX, p);
}

// ── 화면에 보내는 제안 (game → CardPick) ──

/** 카드 고르기 창 하나. seq = 제안이 바뀔 때마다 (다시 뽑기도) 올라간다 → 카드가 다시 뒤집혀 들어온다 */
export type CardOfferView = {
  kind: OfferKind;
  seq: number;
  cards: CardId[];
  /** 지금 가진 카드 (카드에 "2/3" 같은 겹친 수) */
  owned: CardCounts;
  style: CardKindStyle;
  /** 남은 다시 뽑기 (상사의 제안은 다시 뽑기 없음) */
  rerolls: number;
  /** 판 레벨 (레벨 업) · 시작 카드 몇 번째/몇 장 · 상사의 제안 층 */
  lv?: number;
  step?: [number, number];
  floor?: number;
  /** 이 뒤에 줄 서 있는 레벨 업 카드 수 */
  more?: number;
};
/** 화면 → 게임: 몇 번째 카드를 골랐다 / 다시 뽑기 / 상사의 제안 받기·거절 */
export type CardChoice = { slot: number } | { reroll: true } | { accept: boolean };

import { isShopListed, ITEMS, itemById, permanentPrice, PERMANENT_MULTIPLIER, type ItemKind } from "@tomb/protocol";
import { pickDiscount } from "../champPerks";
import { gameWeek } from "../gameDay";
import { FURNITURE, furnitureById, isExclusiveFurniture } from "../housing/catalog";
import { discountedPrice } from "../titles";

// 11/17 「유령선 특가 장터」 순수 규칙 (서버·화면 공용 — 시험은 ghostShip.test).
//  - 언제: 매주 토요일 밤 9시~11시 (한국 시각). 8시 50분에 바다에 안개가 끼고(확성기 공지), 11시에 안개 속으로 떠나요 (11시 4분까지 떠나는 모습)
//  - 무엇: 한 번에 8개, 모두 영구 물건. 꾸미기 4 (영구 소장값 30% 할인, 1,000P 넘는 것 하나는 꼭) · 가구 2 (30%) ·
//    오늘의 파격가 1 (비싼 꾸미기나 가구 50%) · 유령선 한정 1 (할인 없음, 주마다 바뀌어요)
//  - 품목은 주(월요일 새벽 5시에 바뀌는 게임 주) 시드로 정해서 그 주에는 모든 채널·모든 사람에게 같아요
//  - 할인은 서버가 계산해요. 포인트왕·칭호 할인과 겹치면 가장 큰 할인 하나만 (lib/champPerks pickDiscount)
//  - 물건마다 한 사람 1개 (서버 저장소 lib/sea/ghostStore)

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;
const KST_OFFSET_MS = 9 * HOUR_MS;
const DAY_MS = 24 * HOUR_MS;

/** 정박하는 요일 (한국 시각, 0 = 일요일) · 안개가 끼는 분 · 문을 여는 분 · 닫고 떠나는 분 · 다 떠난 분 (자정부터) */
export const GHOST_DOW = 6;
export const GHOST_FOG_MIN = 20 * 60 + 50;
export const GHOST_OPEN_MIN = 21 * 60;
export const GHOST_CLOSE_MIN = 23 * 60;
export const GHOST_GONE_MIN = 23 * 60 + 4;

/** away = 없음 · fog = 안개 속에서 다가오는 중 (8시 50분 ~ 9시) · docked = 정박 (장터 열림) · leaving = 떠나는 중 */
export type GhostPhase = "away" | "fog" | "docked" | "leaving";

/** now(ms)가 속한 한국 날의 자정 (ms) · 그날 요일 · 자정부터 지난 분 */
function kstParts(now: number): { midnight: number; dow: number; min: number } {
  const k = now + KST_OFFSET_MS;
  const midnight = Math.floor(k / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return { midnight, dow: new Date(k).getUTCDay(), min: (now - midnight) / MIN_MS };
}

export type GhostClock = {
  phase: GhostPhase;
  /** 이번(또는 다음) 정박 시작 · 끝 (ms) */
  opensAt: number;
  closesAt: number;
  /** 0..1 안개 속에서 나타나는 정도 (fog: 0 → 1, docked: 1, leaving: 1 → 0) */
  presence: number;
};

/** 지금 유령선 시계 (시간표만 — 운영자 부르기는 ghostView) */
export function ghostClock(now: number): GhostClock {
  const { midnight, dow, min } = kstParts(now);
  const daysAhead = (GHOST_DOW - dow + 7) % 7;
  let sat = midnight + daysAhead * DAY_MS;
  // 토요일인데 다 떠난 뒤면 다음 주 토요일
  if (daysAhead === 0 && min >= GHOST_GONE_MIN) sat += 7 * DAY_MS;
  const opensAt = sat + GHOST_OPEN_MIN * MIN_MS;
  const closesAt = sat + GHOST_CLOSE_MIN * MIN_MS;
  const fogAt = sat + GHOST_FOG_MIN * MIN_MS;
  const goneAt = sat + GHOST_GONE_MIN * MIN_MS;
  if (now < fogAt) return { phase: "away", opensAt, closesAt, presence: 0 };
  if (now < opensAt) return { phase: "fog", opensAt, closesAt, presence: (now - fogAt) / (opensAt - fogAt) };
  if (now < closesAt) return { phase: "docked", opensAt, closesAt, presence: 1 };
  if (now < goneAt) return { phase: "leaving", opensAt, closesAt, presence: 1 - (now - closesAt) / (goneAt - closesAt) };
  return { phase: "away", opensAt, closesAt, presence: 0 };
}

/** 운영자 시험 부르기: on = 아무 때나 정박 · off = 시간표 중에도 보내 둠 · null = 시간표대로 (그 운영자 화면·구매에만) */
export type GhostCall = "on" | "off" | null;

/** 장터에서 살 수 있는지 (시간표의 정박 시간 또는 운영자가 부른 동안) */
export function ghostOpen(now: number, call: GhostCall = null): boolean {
  if (call === "on") return true;
  if (call === "off") return false;
  return ghostClock(now).phase === "docked";
}

/** 바다에 보이는 정도 0..1 (운영자 부르기 반영) */
export function ghostPresence(now: number, call: GhostCall = null): number {
  if (call === "on") return 1;
  if (call === "off") return 0;
  return ghostClock(now).presence;
}

/** 이번 장터의 주 (게임 주 — 월요일 새벽 5시에 바뀌어요) */
export const ghostWeek = (now: number) => gameWeek(now);

// ── 품목 ──

/** 할인율: 꾸미기·가구 30% · 오늘의 파격가 50% · 한정 0 */
export const GHOST_SALE_RATE = 0.3;
export const GHOST_DEAL_RATE = 0.5;
/** 「비싼 꾸미기」 하나는 꼭 (영구 소장값 이 값 이상) */
export const GHOST_PRICEY = 1000;
/** 파격가 후보: 꾸미기는 영구 소장값 1,000P 이상, 가구는 300P 이상 */
const DEAL_FURNITURE_MIN = 300;
/** 가구 장터에 나오는 갈래 (바닥·벽지·외관은 빼요 — 놓는 가구만) */
const FURNITURE_CATS = new Set(["furniture", "living", "dev", "nature", "mood", "sea"]);

export type GhostKind = "cosmetic" | "furniture";
export type GhostTag = "sale" | "deal" | "limited";
export type GhostLimited = { kind: GhostKind; id: string; price: number };
/**
 * 유령선 한정 (주마다 차례로 하나). 상점·가구점엔 없고 여기서만 팔아요 (protocol items ghost · housing catalog ghost).
 * 꾸미기 값 = 24시간 값(items price) × 영구 배율 — 꾸미기 점수도 같은 셈이에요
 */
export const GHOST_LIMITED: readonly GhostLimited[] = [
  { kind: "cosmetic", id: "gh_capt", price: (itemById("gh_capt")?.price ?? 0) * PERMANENT_MULTIPLIER },
  { kind: "furniture", id: "ghost_lamp", price: furnitureById("ghost_lamp")?.price ?? 0 },
  { kind: "cosmetic", id: "gh_mist", price: (itemById("gh_mist")?.price ?? 0) * PERMANENT_MULTIPLIER },
];

export type GhostStockItem = {
  /** 장터 안 물건 이름표 (kind:id) — 구매·1인 1개 기록에 써요 */
  key: string;
  kind: GhostKind;
  id: string;
  tag: GhostTag;
  /** 원래 값 (꾸미기 = 영구 소장값, 가구 = 가구점 값, 한정 = 정한 값) */
  base: number;
  /** 유령선 할인율 (칭호·포인트왕과 겹치면 큰 것 하나 — ghostCost) */
  rate: number;
};

/** 문자열 → 32비트 씨앗 (FNV-1a) */
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** 씨앗 고정 난수 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 섞어서 앞에서 n개 (원본은 그대로) */
function draw<T>(list: readonly T[], n: number, r: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * 영구로 살 수 있는 상점 꾸미기 (운영자 전용 0P는 빼요). protocol ITEMS 순서 그대로 — 순서가 같아야 같은 주에 같은 품목이에요.
 * 11/20 판매처가 따로 있는 전용·기간 한정(계절 코디 seasonSet·품종 펫 petShop·펫·유령선·이벤트·의뢰 보상 …)은 빼요 — isShopListed로 한 번 더 거른다
 */
function cosmeticPool(): { id: string; base: number }[] {
  const out: { id: string; base: number }[] = [];
  for (const it of ITEMS) {
    const p = it.kind === "cosmetic" && isShopListed(it) && !it.petShop ? permanentPrice(it.id) : null;
    if (p && p > 0) out.push({ id: it.id, base: p });
  }
  return out;
}

/** 가구점 일반 가구만 (11/20 시즌 가구·보리 품종 가구·보리 전용 강아지·고양이 가구·유령선 한정은 빼요 — catalog isExclusiveFurniture). 순서가 바뀌어 그 뒤 주 품목도 바뀌었다 */
function furniturePool(): { id: string; base: number }[] {
  return FURNITURE.filter((f) => FURNITURE_CATS.has(f.category) && !isExclusiveFurniture(f) && f.price > 0).map((f) => ({ id: f.id, base: f.price }));
}

/** 그 주 한정 물건 (주 번호 차례) */
export function ghostLimitedOf(week: string): GhostLimited {
  const n = Math.floor(Date.UTC(Number(week.slice(0, 4)), Number(week.slice(4, 6)) - 1, Number(week.slice(6, 8))) / (7 * DAY_MS));
  return GHOST_LIMITED[((n % GHOST_LIMITED.length) + GHOST_LIMITED.length) % GHOST_LIMITED.length];
}

/** 그 주 장터 8개 (같은 주면 늘 같아요): 꾸미기 4 · 가구 2 · 파격가 1 · 한정 1 */
export function ghostStock(week: string): GhostStockItem[] {
  const r = rng(seedOf(`ghost:${week}`));
  const cos = cosmeticPool();
  const fur = furniturePool();
  // 비싼 꾸미기 하나는 꼭 → 나머지 셋은 남은 것에서
  const pricey = draw(
    cos.filter((c) => c.base >= GHOST_PRICEY),
    1,
    r,
  );
  const rest = draw(
    cos.filter((c) => !pricey.some((p) => p.id === c.id)),
    3,
    r,
  );
  const cosPick = [...pricey, ...rest];
  const furPick = draw(fur, 2, r);
  const used = new Set([...cosPick, ...furPick].map((x) => x.id));
  // 오늘의 파격가: 비싼 꾸미기·가구 중 아직 안 나온 것 하나
  const dealPool = [
    ...cos.filter((c) => c.base >= GHOST_PRICEY && !used.has(c.id)).map((c) => ({ kind: "cosmetic" as const, ...c })),
    ...fur.filter((f) => f.base >= DEAL_FURNITURE_MIN && !used.has(f.id)).map((f) => ({ kind: "furniture" as const, ...f })),
  ];
  const deal = draw(dealPool, 1, r)[0];
  const lim = ghostLimitedOf(week);
  const item = (kind: GhostKind, id: string, tag: GhostTag, base: number, rate: number): GhostStockItem => ({ key: `${kind}:${id}`, kind, id, tag, base, rate });
  return [
    ...cosPick.map((c) => item("cosmetic", c.id, "sale", c.base, GHOST_SALE_RATE)),
    ...furPick.map((f) => item("furniture", f.id, "sale", f.base, GHOST_SALE_RATE)),
    ...(deal ? [item(deal.kind, deal.id, "deal", deal.base, GHOST_DEAL_RATE)] : []),
    item(lim.kind, lim.id, "limited", lim.price, 0),
  ];
}

/** 화면에 쓸 이름 */
export function ghostItemName(s: Pick<GhostStockItem, "kind" | "id">): string {
  return s.kind === "cosmetic" ? (itemById(s.id)?.name ?? s.id) : (furnitureById(s.id)?.name ?? s.id);
}

/**
 * 내가 낼 값: 유령선 할인 · 칭호 할인 · 포인트왕 할인 중 가장 큰 것 하나 (lib/champPerks pickDiscount → lib/titles discountedPrice).
 * title = 꾸미기면 칭호 꾸미기 할인, 가구면 칭호 가구 할인 · champ = 포인트왕 할인율 (꾸미기·가구 상점과 같은 값)
 */
export function ghostCost(s: Pick<GhostStockItem, "base" | "rate">, title = 0, champ = 0): { cost: number; rate: number } {
  const rate = pickDiscount(s.rate, title, champ);
  return { cost: discountedPrice(s.base, rate), rate };
}

/** 포인트왕 할인 자리: 꾸미기는 꾸미기 상점과 같은 종류로 셈해요 */
export const GHOST_COSMETIC_KIND: ItemKind = "cosmetic";

// ── 안내 문구 (짧은 해요체) ──
export const GHOST_NOTICE = "🌫️ 포구에 안개가 껴요. 곧 유령선이 들어와 밤 11시까지 특가 장터를 열어요.";
export const GHOST_CLOSED_MSG = "유령선이 떠나 있어요. 토요일 밤 9시에 다시 와요.";
export const GHOST_BOUGHT_MSG = "이번 장터에선 이미 샀어요. 물건마다 한 사람 1개예요.";

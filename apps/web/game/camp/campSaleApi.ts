import { CAMP_HOME_KIND_NAME, CAMP_LOTS, CAMP_NPCS, campLotByNo, caravanDesignOf, type CampHomeKind, type CampLot, type CampNpcId, type CampYard, type CaravanDesign } from "@tomb/protocol";
import { request } from "@/lib/api";
import type { MyHouseResponse, PublicHouse, VillageHouse, VillageResponse } from "@/lib/housing/types";
import { SALE_KINDS, type SaleKind } from "@/lib/housing/catalog";

// 11/26 캠핑장 집 (zone "camp") — 화면 쪽 공용: 서버 응답 모양·API 부르기·값 계산(서버가 prices를 안 줄 때만)·방 크기.
// 서버(lib/housing — 집 서버 담당)가 client.ts에 같은 부르기를 넣으면 그쪽으로 바꿔도 된다. 계약: night1125/CAMP_PLAN.md 「API 계약」.

/** design = 11/26 카라반 디자인 (카라반만 — campOf가 없으면 그 자리 기본 모습으로 채운다) */
export type CampHouseInfo = { kind: CampHomeKind; yard: CampYard; design?: CaravanDesign };
/** 캠핑장 마을 목록의 집 하나 (VillageHouse + camp·villa) */
export type CampVillageHouse = VillageHouse & { camp?: CampHouseInfo; villa?: boolean };
export type CampVillageResponse = Omit<VillageResponse, "houses" | "zone"> & { zone?: string; houses: CampVillageHouse[] };
export type CampPublicHouse = PublicHouse & { camp?: CampHouseInfo; villa?: boolean };
/** 이 사람 기준 값표 (정리한 모양) */
export type CampPrices = {
  /** 터 번호 → 분양가 */
  lots: Record<number, number>;
  /** 앞마당 다음 단계 값: 터 번호 → { 2: 1→2 값, 3: 2→3 값 } */
  yard: Record<number, { 2: number; 3: number }>;
  /** 지금 사면 별장 값(4/3)인지 (이미 다른 집이 있다) */
  villa: boolean;
};
export type CampMineResponse = Omit<MyHouseResponse, "house"> & { house: CampPublicHouse | null; prices?: unknown };

// ── 값 (서버 catalog campStagePrice와 같다 — 서버가 prices를 주면 그 값을 쓴다) ──
/** 11/26 운영자 「바닷가와 같게」: 단계 값 = 포구 오두막과 같은 9,000 · +13,500 · +22,500 */
export const CAMP_STAGE_PRICE: Record<CampYard, number> = { 1: 9_000, 2: 13_500, 3: 22_500 };
/** 카라반 자리 배수 (폭포 앞 ×1.5 · 강가 ×1.25 · 숲 쪽 ×1), 펜션·촌캉스 ×1 */
export const CARAVAN_GRADE_RATE = { falls: 1.5, river: 1.25, forest: 1 } as const;
const rateOf = (l: CampLot): number => (l.kind === "caravan" ? CARAVAN_GRADE_RATE[l.grade ?? "forest"] : 1);
/** 그 터 stage단계 무주택 값 (1 = 분양, 2·3 = 앞마당 올리기. 10P 올림) */
export const campStagePrice = (l: CampLot, stage: CampYard): number => Math.ceil((CAMP_STAGE_PRICE[stage] * rateOf(l)) / 10) * 10;
/** 별장 값: ×4/3, 10P 단위 올림 */
export const villaPrice = (p: number) => Math.ceil((p * 4) / 3 / 10) * 10;
export const campBasePrice = (l: CampLot): number => campStagePrice(l, 1);
/** 앞마당 to단계로 올리는 값 (11/26 별장이면 × 4/3 — 포구 넓히기처럼) */
export const campYardPrice = (l: CampLot, to: 2 | 3, villa = false) => {
  const p = campStagePrice(l, to);
  return villa ? villaPrice(p) : p;
};

// ── 방 크기 (CAMP_PLAN — 11/26 모든 종류가 앞마당 단계로 방이 커진다. 서버 catalog CARAVAN_ROOM·CAMP_HOME_ROOM과 같다) ──
export type CampRoom = { w: number; h: number; maxItems: number };
export const CARAVAN_ROOM: Record<CampYard, CampRoom> = {
  1: { w: 10, h: 6, maxItems: 22 },
  2: { w: 12, h: 7, maxItems: 30 },
  3: { w: 14, h: 8, maxItems: 40 },
};
/** 펜션·촌캉스 방 (앞마당 단계마다 — 포구 오두막 터와 같은 10×8 → 14×10 → 18×12) */
export const HOME_ROOM: Record<CampYard, CampRoom> = {
  1: { w: 10, h: 8, maxItems: 30 },
  2: { w: 14, h: 10, maxItems: 50 },
  3: { w: 18, h: 12, maxItems: 80 },
};
/** 그 종류·단계의 방 */
export const campRoom = (kind: CampHomeKind, yard: CampYard): CampRoom => (kind === "caravan" ? CARAVAN_ROOM : HOME_ROOM)[yard] ?? CARAVAN_ROOM[1];
/** 앞마당 단계마다 앉을 자리 수 */
export const YARD_SEATS: Record<CampYard, number> = { 1: 4, 2: 6, 3: 8 };

/** 집의 캠핑장 정보 (서버가 camp를 안 주면 터 번호로 종류, 앞마당 1단계) */
export function campOf(h: { lot: number; camp?: Partial<CampHouseInfo> | null }): CampHouseInfo {
  const kind = h.camp?.kind ?? campLotByNo(h.lot)?.kind ?? "caravan";
  const y = h.camp?.yard;
  return { kind, yard: y === 2 || y === 3 ? y : 1, ...(kind === "caravan" ? { design: caravanDesignOf(h.lot, h.camp?.design) } : {}) };
}
/**
 * 11/26 캠핑장 분양 NPC (종류마다 한 사람). 분양 창은 이 세 사람에게 말을 걸어서만 연다
 * (운영자 「헷갈려한다」 → 「카라반, 촌캉스도 NPC만으로 통일」 — 입간판·빈 터 팻말은 없고, 빈 터 E는 누구에게 가면 되는지 안내만)
 */
export const CAMP_SALE_NPC: Record<CampHomeKind, CampNpcId> = { caravan: "keeper", pension: "sosul", rural: "suni" };
/** 말을 건 NPC가 파는 종류 (분양 NPC가 아니면 null) */
export function campSaleKindOf(id: CampNpcId): CampHomeKind | null {
  return (Object.keys(CAMP_SALE_NPC) as CampHomeKind[]).find((k) => CAMP_SALE_NPC[k] === id) ?? null;
}
/** 「카라반 분양은 언젠가 씨에게 물어보세요.」 */
export function campSaleHint(kind: CampHomeKind): string {
  const name = CAMP_NPCS.find((n) => n.id === CAMP_SALE_NPC[kind])?.name ?? "";
  return `${CAMP_HOME_KIND_NAME[kind]} 분양은 ${name}에게 물어보세요.`;
}
/** 빈 터 문 앞(빈 카라반 자리는 가운데) E: 분양 창 대신 그 종류 NPC 안내 토스트만 */
export function emptyDoorAction(l: CampLot): { label: string; toast: string } {
  return { label: "분양 안내", toast: campSaleHint(l.kind) };
}

export const isCampHouse = (h: { zone?: string } | null | undefined): boolean => (h as { zone?: string } | null)?.zone === "camp";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * 서버 prices를 정리한다. 모양이 조금 달라도 읽는다: lots = {번호: 값} 또는 [{lot, price}],
 * yard = {번호: {2,3}} 또는 {2,3}(같은 값 아님 — 무시). 빈 곳은 규칙대로 센다 (villa = 서버 값 → 없으면 hasOther)
 */
export function campPrices(raw: unknown, hasOther: boolean): CampPrices {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // 11/26 서버 모양 (lib/housing/types HousePrices): villa = {village, sea, camp}, camp = [{lot, buy, yard2, yard3}]
  const rv = r.villa as Record<string, unknown> | boolean | undefined;
  const villa = typeof rv === "boolean" ? rv : typeof rv?.camp === "boolean" ? rv.camp : hasOther;
  const lots: Record<number, number> = {};
  const yard: Record<number, { 2: number; 3: number }> = {};
  const rawLots = r.lots ?? r.camp;
  if (Array.isArray(rawLots)) {
    for (const e of rawLots) {
      const o = e as Record<string, unknown>;
      const lot = num(o?.lot);
      const p = num(o?.price) ?? num(o?.buy);
      if (lot !== null && p !== null) lots[lot] = p;
      const y2 = num(o?.yard2);
      const y3 = num(o?.yard3);
      if (lot !== null && y2 !== null && y3 !== null) yard[lot] = { 2: y2, 3: y3 };
    }
  } else if (rawLots && typeof rawLots === "object") {
    for (const [k, v] of Object.entries(rawLots as Record<string, unknown>)) {
      const p = num(v) ?? num((v as Record<string, unknown>)?.price);
      if (p !== null) lots[Number(k)] = p;
    }
  }
  const rawYard = r.yard;
  // 서버의 yard = {to, price} (내 집 다음 단계 — serverYardPrice)는 터별 값이 아니다
  if (rawYard && typeof rawYard === "object" && !Array.isArray(rawYard) && !("price" in rawYard))
    for (const [k, v] of Object.entries(rawYard as Record<string, unknown>)) {
      const o = v as Record<string, unknown>;
      const y2 = num(o?.["2"]);
      const y3 = num(o?.["3"]);
      if (Number(k) > 0 && y2 !== null && y3 !== null) yard[Number(k)] = { 2: y2, 3: y3 };
    }
  for (const l of CAMP_LOTS) {
    if (lots[l.lot] === undefined) lots[l.lot] = villa ? villaPrice(campBasePrice(l)) : campBasePrice(l);
    if (!yard[l.lot]) yard[l.lot] = { 2: campYardPrice(l, 2, villa), 3: campYardPrice(l, 3, villa) };
  }
  return { lots, yard, villa };
}

/** 서버가 준 내 캠핑장 집 앞마당 다음 단계 값 (HousePrices.yard = {to, price}) */
export function serverYardPrice(raw: unknown): number | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return num((r.yard as Record<string, unknown> | null)?.price);
}

/**
 * 11/26 분양 종류(마을·포구·카라반·펜션·촌캉스)마다 터가 다 찬 채널 (GET /api/housing/channels의 full — 채널 목록 폴러와 같은 주소라 CDN 1분 캐시를 같이 쓴다).
 * 분양 창이 「남은 ○○이 없어요」일 때 한 번만 부른다. 실패하거나 옛 서버면 null
 */
export async function fullSaleChannels(signal?: AbortSignal): Promise<Record<SaleKind, number[]> | null> {
  try {
    const res = await fetch("/api/housing/channels", { signal });
    if (!res.ok) return null;
    const f = ((await res.json()) as { full?: Partial<Record<SaleKind, unknown>> }).full;
    if (!f) return null;
    const ints = (v: unknown) => (Array.isArray(v) ? v.filter((c): c is number => Number.isInteger(c)) : []);
    return Object.fromEntries(SALE_KINDS.map((k) => [k, ints(f[k])])) as Record<SaleKind, number[]>;
  } catch {
    return null;
  }
}

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});

export const campHousingApi = {
  /** ch 채널의 캠핑장 집터 16 (CDN 15초 — fresh면 건너뛴다, { v }면 집 바뀜 알림 뒤 같은 채널 화면들이 같은 주소로) */
  village: (ch: number, fresh: boolean | { v: number } = false) =>
    typeof fresh === "object"
      ? request<CampVillageResponse>(`/api/housing/village?ch=${ch}&zone=camp&v=${fresh.v}`)
      : request<CampVillageResponse>(fresh ? `/api/housing/village?ch=${ch}&zone=camp&t=${Date.now()}` : `/api/housing/village?ch=${ch}&zone=camp`, fresh ? { cache: "no-store" } : undefined),
  mine: () => request<CampMineResponse>("/api/housing/me?zone=camp", { cache: "no-store" }),
  /** 분양 (종류는 터 번호로 정해진다) */
  buy: (ch: number, lot: number) => request<CampMineResponse>("/api/housing/me/buy", send("POST", { ch, lot, zone: "camp" })),
  /** 앞마당 다음 단계 */
  yard: (ch: number) => request<CampMineResponse>("/api/housing/me/yard", send("POST", { ch, zone: "camp" })),
};

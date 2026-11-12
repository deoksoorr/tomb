import { isPermanentUntil, itemById, plotLabel, sanitizeLook, type ItemDef, type ItemKind } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";

// 가방·착용·지속시간 표시용 순수 함수

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const KIND_LABELS: Record<ItemKind, string> = {
  firework: "폭죽",
  cosmetic: "캐릭터 꾸미기",
  decor: "묘비 꾸미기",
  graveStyle: "묘비 디자인",
  megaphone: "확성기",
  dye: "염색·외형",
};

export type BagEntry = { item: ItemDef; count: number };

/** 가방 내용 (카탈로그에 없는 id·0개는 뺀다). kind를 주면 그 종류만 */
export function bagEntries(inventory: Record<string, number>, kind?: ItemKind): BagEntry[] {
  return Object.entries(inventory).flatMap(([id, count]): BagEntry[] => {
    const item = itemById(id);
    return item && count > 0 && (!kind || item.kind === kind) ? [{ item, count }] : [];
  });
}

/** 지금 착용 중인 꾸미기 (만료 제외, 부위별 1개) */
export function currentLook(equipped: readonly { itemId: string; until: number }[], now: number): string[] {
  return sanitizeLook(equipped.filter((e) => e.until > now).map((e) => e.itemId));
}

/** 아이템 효과 지속 시간: 24시간 · 7일 */
export function durationLabel(ms: number): string {
  if (ms >= 2 * DAY && ms % DAY === 0) return `${ms / DAY}일`;
  if (ms >= HOUR) return `${Math.round(ms / HOUR)}시간`;
  return `${Math.max(1, Math.round(ms / MINUTE))}분`;
}

/** 아이템 한 줄 설명: 꾸미기는 "24시간 유지", 폭죽은 "한 번 쏘면 사라져요", 디자인권은 "세울 때 1개 써요" */
export function effectLabel(item: ItemDef): string {
  if (item.durationMs) return `${durationLabel(item.durationMs)} 유지`;
  if (item.kind === "megaphone") return "한 번 외치면 사라져요";
  return item.kind === "graveStyle" ? "묘비를 세우거나 디자인을 바꿀 때 1개 써요" : "한 번 쏘면 사라져요";
}

/** 남은 시간: "6일 남음" · "13시간 남음" · "40분 남음" */
export function remainingLabel(until: number, now: number): string {
  // 30번 영구 소유 코디
  if (isPermanentUntil(until)) return "영구";
  const left = until - now;
  if (left <= 0) return "끝났어요";
  if (left >= DAY) return `${Math.floor(left / DAY)}일 남음`;
  if (left >= HOUR) return `${Math.floor(left / HOUR)}시간 남음`;
  return `${Math.max(1, Math.ceil(left / MINUTE))}분 남음`;
}

/**
 * 캐릭터 꾸미기는 하나만 있으면 된다: 착용 중이거나, 벗어 두었거나, 가방에 있으면 다시 사지 못한다 (서버도 409).
 * stash: 벗어 둔 꾸미기 (남은 시간이 흐르는 중)
 */
export function cosmeticBlock(
  item: ItemDef,
  inventory: Readonly<Record<string, number>>,
  equipped: readonly { itemId: string; until: number }[],
  now: number,
  stash: readonly { itemId: string; until: number }[] = [],
): "착용 중" | "가지고 있어요" | null {
  if (item.kind !== "cosmetic") return null;
  if (equipped.some((e) => e.itemId === item.id && e.until > now)) return "착용 중";
  if (stash.some((e) => e.itemId === item.id && e.until > now)) return "가지고 있어요";
  return (inventory[item.id] ?? 0) > 0 ? "가지고 있어요" : null;
}

/** 반응·세우기 응답의 earned. 한도에 걸려 0이면 null (조용히) */
export function pointsText(earned: number | undefined): string | null {
  return earned && earned > 0 ? `+${earned} 포인트` : null;
}

/** here: 지금 채널의 묘비 (자리 이름이 있다). 다른 채널 묘비는 plot 대신 채널만 안다 */
export type MyGraveEntry = { grave: PublicGrave; plot: string | null; here: boolean };

/**
 * 내 계정이 세운 묘비 (최근 순). 지금 채널 묘비는 그 채널 목록(등록 순 = 격자 순서) 안 위치로 자리 이름을 붙이고,
 * 다른 채널 묘비는 따로 받아 둔 상세(others)로 채운다.
 */
export function myGraveEntries(
  ids: readonly string[],
  current: readonly PublicGrave[],
  others: ReadonlyMap<string, PublicGrave> = new Map(),
): MyGraveEntry[] {
  const index = new Map(current.map((g, i) => [g.id, i]));
  return ids
    .flatMap((id): MyGraveEntry[] => {
      const i = index.get(id);
      if (i !== undefined) return [{ grave: current[i], plot: plotLabel(i), here: true }];
      const other = others.get(id);
      return other ? [{ grave: other, plot: null, here: false }] : [];
    })
    .sort((a, b) => b.grave.createdAt - a.grave.createdAt);
}

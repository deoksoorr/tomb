import { itemById, sanitizeLook, type ItemDef, type ItemKind } from "@tomb/protocol";

// 가방·착용·지속시간 표시용 순수 함수

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const KIND_LABELS: Record<ItemKind, string> = {
  firework: "폭죽",
  cosmetic: "캐릭터 꾸미기",
  decor: "묘비 꾸미기",
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

/** 아이템 한 줄 설명용: 폭죽은 "쏘면 사라져요", 꾸미기는 "24시간 유지" */
export function effectLabel(item: ItemDef): string {
  return item.durationMs ? `${durationLabel(item.durationMs)} 유지` : "한 번 쏘면 사라져요";
}

/** 남은 시간: "6일 남음" · "13시간 남음" · "40분 남음" */
export function remainingLabel(until: number, now: number): string {
  const left = until - now;
  if (left <= 0) return "끝났어요";
  if (left >= DAY) return `${Math.floor(left / DAY)}일 남음`;
  if (left >= HOUR) return `${Math.floor(left / HOUR)}시간 남음`;
  return `${Math.max(1, Math.ceil(left / MINUTE))}분 남음`;
}

/** 반응·세우기 응답의 earned. 한도에 걸려 0이면 null (조용히) */
export function pointsText(earned: number | undefined): string | null {
  return earned && earned > 0 ? `+${earned} 포인트` : null;
}

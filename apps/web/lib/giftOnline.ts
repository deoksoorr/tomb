import { itemName } from "@tomb/protocol";
import type { GiftItem } from "./types";

// 11/17 관리자 선물 「지금 접속 중인 사람 모두」의 순수 규칙 (서버 lib/giftOnlineServer · 테스트가 쓴다).
// 실시간 서버가 준 접속 중인 방문자 id → 계정 id 모양만, 한 번씩, 운영자·정지 계정·없는 계정은 빼고 → 크게 많으면 나눠 보낸다

/** 선물 하나(발송 기록 한 줄)에 넣는 최대 계정 수. 넘으면 같은 내용을 여러 선물로 나눠 보낸다 */
export const ONLINE_GIFT_BATCH = 1000;

const ACCOUNT_RE = /^[A-Za-z0-9_-]{21}$/;

/** 받을 계정 고르기: 모양이 계정 id인 것만, 처음 나온 순서대로 한 번씩, exclude(운영자·정지·없는 계정)는 뺀다 */
export function pickOnlineTargets(ids: readonly string[], exclude: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !ACCOUNT_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (!exclude.has(id)) out.push(id);
  }
  return out;
}

/** size개씩 나누기 (마지막 묶음은 더 작을 수 있다) */
export function chunk<T>(list: readonly T[], size = ONLINE_GIFT_BATCH): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** 감사 기록에 남길 보낸 것 요약 ("포인트 100, 크리스마스 선물상자 ×1") */
export function giftDetail(points: number, items: readonly GiftItem[]): string {
  const parts = [...(points > 0 ? [`포인트 ${points}`] : []), ...items.map((i) => `${itemName(i.itemId)} ${i.term ? `(${i.term})` : `×${i.count}`}`)];
  return parts.join(", ");
}

/** 미리 보기 응답: 지금 보낼 수 있는 사람 수와 뺀 사람 수 (reachable = 실시간 서버에 닿았는지) */
export type GiftOnlinePreview = { reachable: boolean; count: number; excluded: number; at: number };
/** 보내기 응답 */
export type GiftOnlineResult = { sent: number; gifts: number; expect: number | null };

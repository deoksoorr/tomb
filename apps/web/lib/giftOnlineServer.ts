import { findBan, notifyMe, onlineVisitorIds } from "./ban";
import { chunk, giftDetail, pickOnlineTargets, type GiftOnlinePreview, type GiftOnlineResult } from "./giftOnline";
import { sendGift } from "./gifts";
import { staffAccountId } from "./staff";
import { getAccounts } from "./store";
import { getAdminAudit } from "./store/adminAudit";
import type { GiftRecord } from "./store/gifts";
import type { GiftItem } from "./types";

// 11/17 관리자 선물 「지금 접속 중인 사람 모두」 (서버 전용). 받는 사람은 보낼 때 실시간 서버에 다시 묻는다 (서명된 /internal/online).
// 운영자 계정·정지 계정·저장소에 없는 계정은 빼고, ONLINE_GIFT_BATCH명씩 나눠 계정 선물(targets)로 보낸다. 감사 기록에 한 줄

type Targets = { ids: string[]; names: Map<string, string | null>; excluded: number };

/** 지금 보낼 계정 (실시간 서버에 닿지 못하면 null) */
export async function onlineTargets(now = Date.now()): Promise<Targets | null> {
  const raw = await onlineVisitorIds();
  if (!raw) return null;
  const staff = await staffAccountId(now).catch(() => null);
  const first = pickOnlineTargets(raw, new Set(staff ? [staff] : []));
  const exclude = new Set<string>(staff ? [staff] : []);
  const names = new Map<string, string | null>();
  // 저장소에 있는 계정만 (요약 HMGET 묶음), 정지 계정은 뺀다 (캐시한 정지 색인 — 걸렸을 때만 기록을 한 번 더 읽는다)
  for (const part of chunk(first, 200)) {
    const sums = await getAccounts().summaries(part);
    part.forEach((id, i) => {
      const s = sums[i];
      if (!s) exclude.add(id);
      else names.set(id, s.name);
    });
  }
  for (const id of first) if (!exclude.has(id) && (await findBan(id, null, { now }))) exclude.add(id);
  const ids = pickOnlineTargets(first, exclude);
  return { ids, names, excluded: new Set(raw).size - ids.length };
}

export async function previewOnline(now = Date.now()): Promise<GiftOnlinePreview> {
  const t = await onlineTargets(now);
  return { reachable: !!t, count: t?.ids.length ?? 0, excluded: t?.excluded ?? 0, at: now };
}

export type OnlineGiftInput = { from?: string | null; note: string; points: number; items: GiftItem[]; expect?: number | null };

/**
 * 보내기: 묶음마다 선물 하나 (발송 기록 한 줄씩). 받은 사람 수·선물 수를 돌려준다. targets = 미리 고른 계정 (없으면 지금 다시 묻는다)
 * 실시간 서버에 닿지 못하면 null
 */
export async function sendOnlineGift(input: OnlineGiftInput, by: string, now = Date.now(), targets?: Targets): Promise<(GiftOnlineResult & { records: GiftRecord[] }) | null> {
  const t = targets ?? (await onlineTargets(now));
  if (!t) return null;
  const records: GiftRecord[] = [];
  for (const part of chunk(t.ids)) {
    const list = part.map((id) => ({ id, name: t.names.get(id) ?? null }));
    // 한 명이면 계정 하나 선물, 여러 명이면 targets (lib/gifts sendGift가 계정마다 선물함에 넣고 기록은 한 줄)
    records.push(await sendGift({ target: list[0].id, targetName: list[0].name, ...(list.length > 1 ? { targets: list } : {}), from: input.from, note: input.note, points: input.points, items: input.items }, now));
  }
  if (records.length) {
    await getAdminAudit()
      .push({ at: now, by, action: "giftOnline", accountId: records[0].id, name: null, count: t.ids.length, detail: giftDetail(input.points, input.items) })
      .catch((e) => console.error("[gift] 감사 기록 실패", e));
  }
  return { sent: t.ids.length, gifts: records.length, expect: input.expect ?? null, records };
}

/** 받은 사람들 화면의 선물함 점을 바로 맞춘다 (50명씩) */
export async function notifyOnline(ids: readonly string[]): Promise<void> {
  for (const part of chunk(ids, 50)) await notifyMe([...part]);
}

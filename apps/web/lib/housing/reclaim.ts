import { createHash } from "node:crypto";
import { staffAccountId } from "../staff";
import { getAccounts, getGifts } from "../store";
import { GIFT_KEEP_MS, type GiftRecord } from "../store/gifts";
import { houseLabel, legacyPlotCost, RECLAIM_DAYS, RECLAIM_SINCE, reclaimLastSeen } from "./catalog";
import { houseIdFor } from "./service";
import type { HouseRecord, HouseStore } from "./store";

// 오래 비운 집 정리: 주인이 RECLAIM_DAYS일 넘게 들어오지 않은 집을 비워 그 번지를 다시 분양할 수 있게 한다.
//  - 마지막 접속 = 계정의 seenAt·presenceAt·createdAt 중 가장 늦은 것 (닉네임 휴면 판정과 같은 규칙. 기록이 없으면 비우지 않는다).
//    규칙을 켠 시각(RECLAIM_SINCE) 전 접속은 그 시각으로 센다 → 가장 이른 정리는 2026-11-23 05:00 KST
//  - 운영자 계정의 집은 비우지 않는다
//  - 비우기는 집 저장소의 reclaim 한 번 (Redis는 Lua 하나): 주인이 그 사이 돌아왔으면 남기고, 두 번 비우지 않는다
//  - 가구는 그 집 가방에 그대로 남는다 (집 id가 계정마다 정해져 있어 다시 분양받으면 그 가방을 그대로 쓴다)
//    11/16 가구는 두 집 공용 가방이라 그 집에 놓였던 것은 공용 가방으로 돌아가 다른 집에 바로 놓을 수 있다 (바닥·벽지·외관·오두막 시작 가구는 그 집 몫 가방에 남는다)
//  - 낸 포인트(분양가 + 넓히기)는 정리 기록에 남겨 두었다가, 주인이 돌아와 선물함을 열 때 선물로 보낸다 (deliverReclaim).
//    비울 때 바로 보내지 않는 까닭: 선물은 보낸 지 30일이 지나면 사라진다 → 몇 달 뒤에 돌아와도 받을 수 있게 돌아온 때부터 센다.
//    선물로 주는 까닭: 받을 때 지갑 상한에서 잘리므로, 지갑이 꽉 찼으면 써 둔 뒤에 받으면 된다 (바로 넣으면 넘친 만큼 사라진다)
//  - 정리는 분양 마을 요청에서 조금씩 (잠금으로 RECLAIM_SWEEP_MS에 한 번) + 관리자 화면 「지금 정리하기」

export { RECLAIM_DAYS, RECLAIM_SINCE, RECLAIM_WARN_DAYS } from "./catalog";
export const DAY_MS = 86_400_000;
export const RECLAIM_MS = RECLAIM_DAYS * DAY_MS;
/** 정리 잠금 (몇 시간 늦게 비워도 괜찮다. Redis 명령을 아끼려고 3시간에 한 번) */
export const RECLAIM_SWEEP_MS = 3 * 3_600_000;
/** 돌려주는 선물의 보내는 이 */
export const RECLAIM_FROM = "분양 사무소";

/** 돌려줄 포인트: 집에 남긴 낸 포인트. 기록이 없는 옛 집은 지금 가격표의 그 터 크기 값 (분양가 + 넓히기 누적) */
// 11/19 필지 값을 올렸다: 낸 값을 기록하지 않은 옛 집은 예전 값으로 돌려준다 (새 값만큼 더 돌려받지 않게)
export const refundOf = (h: Pick<HouseRecord, "paid" | "tier">): number => h.paid ?? legacyPlotCost(h.tier);

/** 정리 기준 마지막 접속(reclaimLastSeen)이 cutoff 이전인가 (0 = 기록 없음 → 비우지 않는다) */
export const awaySince = (lastSeenAt: number, cutoff: number, since: number = RECLAIM_SINCE): boolean => {
  const last = reclaimLastSeen(lastSeenAt, since);
  return last > 0 && last <= cutoff;
};

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 선물 쪽지 (선물함에 남는다) */
export const reclaimNote = (points: number, label: string): string =>
  `${RECLAIM_DAYS}일 동안 접속하지 않아서 ${label} 집을 철거했어요. 집 가격 ${fmt(points)}P를 100% 돌려드려요. 가구는 그대로 저장돼 있어서 새 집을 분양받으면 다시 놓을 수 있어요.`;

/** 돌아온 주인에게 한 번 띄우는 알림 */
export const reclaimToast = (points: number): string =>
  `${RECLAIM_DAYS}일 동안 접속하지 않아서 집을 철거했어요. 집 가격 ${fmt(points)}P는 100% 선물함에 넣어 뒀고, 가구는 그대로 저장돼 있어요.`;

/** 정리 기록 한 줄 → 선물 id (같은 기록은 늘 같은 id → 보내다 끊겨 다시 보내도 선물이 하나뿐이고, 이미 받았으면 다시 받지 못한다) */
export const reclaimGiftId = (houseId: string, at: number): string =>
  `rc${createHash("sha256").update(`reclaim:${houseId}:${at}`).digest("base64url").slice(0, 10)}`;

export type ReclaimDone = { id: string; name: string; ownerName: string; label: string; points: number };
export type ReclaimReport = { checked: number; reclaimed: ReclaimDone[]; kept: number };

// 11/22 순위 ZSET을 지금 점수 규칙(터 크기 점수)으로 한 번 맞춘다 — 그 전에 넓힌 집이 다시 저장하지 않아도 순위에 점수가 붙게.
// 배포 뒤 첫 분양 마을 요청(또는 관리자 「지금 정리하기」)에서 돈다. 인스턴스마다 한 번만 묻고(맞춘 뒤엔 GET 하나), 실패하면 정리는 그대로 하고 다음에 다시
const rankSynced = new WeakSet<HouseStore>();
/** 시험용: 순위 점수 맞추기를 다시 묻게 한다 */
export function resetRankSync(store: HouseStore) {
  rankSynced.delete(store);
}
async function syncRanksOnce(store: HouseStore): Promise<void> {
  if (rankSynced.has(store)) return;
  try {
    const n = await store.syncRankScores();
    rankSynced.add(store);
    if (n) console.info("[housing] 순위 점수 다시 맞춤 (터 크기 점수)", n);
  } catch (e) {
    console.error("[housing] 순위 점수 다시 맞추기 실패", e);
  }
}

/**
 * 오래 비운 집을 모두 정리한다. force가 아니면 잠금으로 RECLAIM_SWEEP_MS에 한 번만 돈다.
 * 몇 번을 다시 돌려도 결과가 같다 (집 저장소 reclaim이 "그대로일 때만" 비운다).
 * since = 규칙을 켠 시각 (시험에서만 바꾼다).
 * 집 목록은 listAll이 읽는 만큼 (Redis는 최근 분양 순 1000채까지). 집이 그보다 많아지면 오래된 집부터 정리에서 빠진다 → 그때 나눠 읽기로 바꾼다
 */
export async function sweepReclaim(
  store: HouseStore,
  now = Date.now(),
  opts: { force?: boolean; since?: number } = {},
): Promise<ReclaimReport> {
  const since = opts.since ?? RECLAIM_SINCE;
  const report: ReclaimReport = { checked: 0, reclaimed: [], kept: 0 };
  await syncRanksOnce(store);
  if (!opts.force && !(await store.lockReclaim(RECLAIM_SWEEP_MS))) return report;
  const accounts = getAccounts();
  const [all, staff] = await Promise.all([store.listAll(), staffAccountId(now)]);
  const seen = await accounts.summaries(all.map((h) => h.owner));
  const cutoff = now - RECLAIM_MS;
  report.checked = all.length;
  for (const [i, h] of all.entries()) {
    if (h.owner === staff || !awaySince(seen[i]?.lastSeenAt ?? 0, cutoff, since)) continue;
    // 바로 앞에서 한 번 더 읽는다 (그 사이 돌아온 주인. Redis는 Lua 안에서 계정 해시를 직접 다시 본다)
    const [s] = await accounts.summaries([h.owner]);
    const label = h.lot ? houseLabel(h) : `${h.ch}채널`;
    const points = refundOf(h);
    const r = await store.reclaim(h.id, { owner: h.owner, tier: h.tier, ch: h.ch, points, cutoff, since, lastSeenAt: s?.lastSeenAt ?? 0, label, now, ...(h.zone === "sea" ? { zone: "sea" as const } : {}) });
    if (typeof r === "object") report.reclaimed.push({ id: h.id, name: h.name, ownerName: h.ownerName, label, points: r.points });
    else report.kept++;
  }
  if (report.reclaimed.length) console.info("[housing] 오래 비운 집 정리", report.reclaimed.length, report.reclaimed.map((d) => d.label).join(", "));
  return report;
}

// 이 인스턴스가 다음에 정리(잠금 시도)를 해 볼 시각. 그 전에는 Redis에 묻지도 않는다
let nextSweepTry = 0;

/** 분양 마을 요청용: 이 인스턴스에서 RECLAIM_SWEEP_MS에 한 번만 잠금을 시도한다. 다른 인스턴스가 잠금을 쥐고 있으면 넘어간다 */
export async function sweepReclaimIfDue(store: HouseStore, now = Date.now()): Promise<ReclaimReport | null> {
  if (now < nextSweepTry) return null;
  nextSweepTry = now + RECLAIM_SWEEP_MS;
  return sweepReclaim(store, now);
}

/** 시험용: 인스턴스 메모리 간격 초기화 */
export function resetReclaimGate() {
  nextSweepTry = 0;
}

/**
 * 돌아온 주인에게 정리 기록을 선물로 보낸다 (선물함을 열 때). 보낸 게 있으면 한 번 띄울 알림 문구, 없으면 null.
 * 선물 id가 기록마다 정해져 있어, 보낸 뒤 기록을 지우기 전에 끊겨도 다음에 같은 선물을 다시 넣을 뿐이다
 */
export async function deliverReclaim(store: HouseStore, accountId: string, now = Date.now()): Promise<string | null> {
  // 11/16 마을 집과 포구 오두막은 집 id가 따로다 (둘 다 본다)
  const ids = [houseIdFor(accountId), houseIdFor(accountId, "sea")];
  const lists = await Promise.all(ids.map((id) => store.pendingReclaims(id)));
  const rows = ids.flatMap((id, i) => lists[i].map((p) => ({ id, p })));
  if (!rows.length) return null;
  const [s] = await getAccounts().summaries([accountId]);
  let total = 0;
  for (const { id, p } of rows) {
    const gift: GiftRecord = {
      id: reclaimGiftId(id, p.at),
      from: RECLAIM_FROM,
      note: reclaimNote(p.points, p.label),
      points: p.points,
      items: [],
      createdAt: now,
      expiresAt: now + GIFT_KEEP_MS,
      target: accountId,
      targetName: s?.name ?? null,
    };
    await getGifts().send(gift);
    await store.settleReclaim(id, p.at);
    total += p.points;
  }
  return reclaimToast(total);
}

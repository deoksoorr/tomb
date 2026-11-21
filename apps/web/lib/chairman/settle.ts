import { itemById } from "@tomb/protocol";
import { findBan, notifyMe } from "../ban";
import { prevWeek, weekEndMs } from "../gameDay";
import { chairReviewId, getReviewStore, type ChairReview } from "../rpg/reviewStore";
import { staffAccountId } from "../staff";
import { getAccounts, NO_NAME } from "../store";
import { champUntil } from "../store/champ";
import type { WalletRent } from "../store/types";
import { pushVillageNotice } from "../weeklyChamp";
import { CHAIR_RANK_POINTS, CHAIR_REWARD, chairPayouts } from "./rewards";
import { CHAIR_FIRST_WEEK, CHAIR_MODE_LABEL, CHAIR_MODES, chairWeek, type ChairMode } from "./rules";
import { getChairStore, type ChairSettle, type ChairStore, type ChairWinner } from "./store";

// 11/20 회장님 독대 주간 정리 (lib/weeklyChamp와 같은 게으른 방식 — 크론 없이 월요일 새벽 5시 뒤 처음 읽는 요청이 한다).
//  1) 그 주 모드마다 1·2·3위를 한 번 정해 저장한다 (운영자·정지 계정 제외, 처음 정한 것만 — 다시 계산해도 바뀌지 않는다)
//  2) 지급 (표시 chair:paid로 한 번만): 2·3위 포인트는 바로, 1위 칭호·모자·오라 대여는 바로, 1위 포인트는 관리자 「기록 확인」(lib/rpg/reviewStore kind "chair")에 넣어 인정 뒤에
//  3) 새 1위는 마을 확성기 줄에 한 번 알린다
// 주간 1위 다관왕(lib/weeklyChamp champHatOf·CHAMP_BOARDS)과는 따로다 — 그 기록·모자 규칙을 건드리지 않는다

/** 처음 정리하는 주 (11/22 rules로 옮김 — 그 앞 주는 건너뛴다) */
export { CHAIR_FIRST_WEEK };
/** 운영자·정지 계정을 빼고도 3명이 남게 조금 더 읽는다 */
const EXTRA = 10;
/** 연속 1위를 거슬러 보는 주 수 */
const STREAK_LOOKBACK = 8;
export const CHAIR_NOTICE_ICON = "👔";

const fmt = (n: number) => Math.floor(n).toLocaleString("ko-KR");

/** 지급 표시 */
export const chairMark = {
  now: (week: string, acct: string) => `${week}:${acct}:now`,
  queue: (week: string, acct: string) => `${week}:${acct}:queue`,
  first: (week: string, acct: string) => `${week}:${acct}:first`,
  rent: (week: string, mode: ChairMode) => `${week}:${mode}:rent`,
};

/** 그 주 모드별 상위 3명 (운영자·정지 제외, 피해 > 0) */
async function computeRanks(store: ChairStore, week: string): Promise<Record<ChairMode, ChairWinner[]>> {
  const staffId = await staffAccountId();
  const out = {} as Record<ChairMode, ChairWinner[]>;
  for (const mode of CHAIR_MODES) {
    const top = (await store.top(mode, week, CHAIR_RANK_POINTS.length + EXTRA)).filter((e) => e.damage > 0 && e.accountId !== staffId);
    const banned = await Promise.all(top.map(async (e) => !!(await findBan(e.accountId, null).catch(() => null))));
    const list = top.filter((_, i) => !banned[i]).slice(0, CHAIR_RANK_POINTS.length);
    const sums = list.length ? await getAccounts().summaries(list.map((e) => e.accountId)) : [];
    out[mode] = list.map((e, i) => ({ ...e, name: sums[i]?.name ?? NO_NAME, rank: i + 1 }));
  }
  return out;
}

/** 이번 주까지 그 모드 연속 1위 주 수 (이번 주 포함) */
async function streakOf(store: ChairStore, week: string, mode: ChairMode, acct: string): Promise<number> {
  let n = 1;
  let w = week;
  for (let i = 0; i < STREAK_LOOKBACK; i++) {
    w = prevWeek(w);
    const rec = await store.getSettle(w);
    if (rec?.ranks[mode][0]?.accountId !== acct) break;
    n++;
  }
  return n;
}

/** 그 기록의 지급 표시 전부 (다 찍혔으면 정리 끝) */
function marksOf(rec: ChairSettle): string[] {
  const m: string[] = [];
  for (const p of rec.pay) {
    if (p.now > 0) m.push(chairMark.now(rec.week, p.accountId));
    if (p.pending > 0) m.push(chairMark.queue(rec.week, p.accountId));
  }
  for (const mode of CHAIR_MODES) if (rec.ranks[mode][0]) m.push(chairMark.rent(rec.week, mode));
  return m;
}

export type ChairSettleResult = { rec: ChairSettle | null; done: boolean; busy?: true; fresh: ChairMode[] };

/**
 * 그 주 정리·지급 (여러 번 불러도 한 번만 준다). 마감 전·CHAIR_FIRST_WEEK 전이면 아무것도 안 한다.
 * fresh = 이번 호출에서 처음 1위 보상(대여·알림)을 준 모드
 */
export async function settleChair(week: string, now = Date.now(), opts: { minWeek?: string } = {}): Promise<ChairSettleResult> {
  if (week < (opts.minWeek ?? CHAIR_FIRST_WEEK) || now < weekEndMs(week)) return { rec: null, done: true, fresh: [] };
  const store = getChairStore();
  const existing = await store.getSettle(week);
  if (existing && (await store.paid(marksOf(existing))).every(Boolean)) return { rec: existing, done: true, fresh: [] };
  if (!(await store.lock(week))) return { rec: existing, done: false, busy: true, fresh: [] };
  try {
    let rec = existing;
    if (!rec) {
      const ranks = await computeRanks(store, week);
      const streaks = new Map<string, number>();
      for (const mode of CHAIR_MODES) {
        const w = ranks[mode][0];
        if (!w) continue;
        const n = await streakOf(store, week, mode, w.accountId);
        streaks.set(`${mode}:${w.accountId}`, n);
        if (n > 1) w.streak = n;
      }
      const pay = chairPayouts({ normal: ranks.normal.map((w) => w.accountId), hell: ranks.hell.map((w) => w.accountId) }, (mode, id) => streaks.get(`${mode}:${id}`) ?? 1);
      const fresh: ChairSettle = { week, settledAt: now, ranks, pay };
      rec = (await store.createSettle(fresh)) ? fresh : await store.getSettle(week);
    }
    if (!rec) return { rec: null, done: false, fresh: [] };
    primeChairHolders(rec, now);
    const fresh = await payout(store, rec, now);
    return { rec, done: true, fresh };
  } finally {
    await store.unlock(week);
  }
}

/** 지급 (표시마다 한 번). 처음 대여를 준 모드 */
async function payout(store: ChairStore, rec: ChairSettle, now: number): Promise<ChairMode[]> {
  const accounts = getAccounts();
  const week = rec.week;
  for (const p of rec.pay) {
    if (p.now > 0 && (await store.claim(chairMark.now(week, p.accountId), p.accountId))) await accounts.walletGrant(p.accountId, p.now, "earn:chair", now);
    if (p.pending > 0 && (await store.claim(chairMark.queue(week, p.accountId), p.accountId))) {
      const firsts = CHAIR_MODES.flatMap((mode) => {
        const w = rec.ranks[mode][0];
        return w?.accountId === p.accountId ? [{ mode, damage: w.damage, ...(w.ms ? { ms: w.ms } : {}), ...(w.dm ? { dm: w.dm } : {}) }] : [];
      });
      const item: ChairReview = {
        id: chairReviewId(week, p.accountId),
        kind: "chair",
        acct: p.accountId,
        at: now,
        week,
        points: p.pending,
        firsts,
        ...(p.streak ? { streak: p.streak } : {}),
      };
      if (!(await getReviewStore().add(item))) console.warn("[chairman] 기록 확인에 넣지 못함", item.id);
    }
  }
  const fresh: ChairMode[] = [];
  for (const mode of CHAIR_MODES) {
    const w = rec.ranks[mode][0];
    if (!w || !(await store.claim(chairMark.rent(week, mode), w.accountId))) continue;
    const ids = CHAIR_REWARD[mode];
    const until = champUntil(week);
    const rent: WalletRent[] = [
      { itemId: ids.hat, slot: itemById(ids.hat)?.slot ?? "head", until },
      { itemId: ids.aura, slot: itemById(ids.aura)?.slot ?? "aura", until },
    ];
    await accounts.walletGrant(w.accountId, 0, "earn:chair", now, rent);
    fresh.push(mode);
    await pushVillageNotice(
      `${CHAIR_NOTICE_ICON} 지난주 회장님 독대(${CHAIR_MODE_LABEL[mode]}) 1위는 ${w.name}님! 「${ids.titleName}」 (총 피해 ${fmt(w.damage)})${w.streak ? ` · ${w.streak}주 연속` : ""}`,
      now,
    ).catch((e) => console.warn("[chairman] 1위 알림 실패", e));
  }
  if (fresh.length) await notifyMe([...new Set(fresh.map((m) => rec.ranks[m][0]!.accountId))]).catch(() => null);
  return fresh;
}

/** 관리자 인정: 1위 포인트를 지갑에 (표시로 한 번만). 실제로 들어간 포인트 */
export async function approveChairReview(item: ChairReview, now = Date.now()): Promise<{ kind: "chair"; paid: number }> {
  if (!(await getChairStore().claim(chairMark.first(item.week, item.acct), item.acct))) return { kind: "chair", paid: 0 };
  return { kind: "chair", paid: await getAccounts().walletGrant(item.acct, item.points, "earn:chair", now) };
}

// ── 게으른 정리 · 지난주 1위 칭호 ──

const memo = globalThis as typeof globalThis & { __tombChairSettled?: string; __tombChairHolders?: { week: string; at: number; rec: ChairSettle | null } };

/** 지난주 정리가 아직이면 한다 (상태·랭킹 요청 앞에서). 끝난 주는 프로세스 안에서 기억한다. 오류는 삼킨다 */
export async function ensureChairSettled(now = Date.now()): Promise<void> {
  const week = prevWeek(chairWeek(now));
  if (memo.__tombChairSettled === week) return;
  try {
    const r = await settleChair(week, now);
    if (r.done && !r.busy) memo.__tombChairSettled = week;
  } catch (e) {
    console.warn("[chairman] 지난주 정리 실패", e);
  }
}

/** 시험용: 프로세스 기억을 지운다 */
export function resetChairMemo(): void {
  delete memo.__tombChairSettled;
  delete memo.__tombChairHolders;
}

const HOLDERS_MS = 2 * 60_000;
const HOLDERS_EMPTY_MS = 30_000;

function primeChairHolders(rec: ChairSettle, now: number): void {
  if (rec.week === prevWeek(chairWeek(now))) memo.__tombChairHolders = { week: rec.week, at: now, rec };
}

/** 지금 1위 칭호 주인 (칭호 id → 계정): 지난주 정리 기록의 모드별 1위. 이번 주가 끝나면 다음 1위로 넘어간다 (잠깐 캐시) */
export async function chairHolders(now = Date.now()): Promise<Map<string, string>> {
  const week = prevWeek(chairWeek(now));
  let c = memo.__tombChairHolders;
  if (!c || c.week !== week || now - c.at >= (c.rec ? HOLDERS_MS : HOLDERS_EMPTY_MS)) {
    c = memo.__tombChairHolders = { week, at: now, rec: await getChairStore().getSettle(week) };
  }
  const out = new Map<string, string>();
  for (const mode of CHAIR_MODES) {
    const w = c.rec?.ranks[mode][0];
    if (w) out.set(CHAIR_REWARD[mode].title, w.accountId);
  }
  return out;
}

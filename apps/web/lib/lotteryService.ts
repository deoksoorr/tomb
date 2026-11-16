import { randomInt } from "node:crypto";
import { runAfter } from "./analyticsService";
import { notifyMe } from "./ban";
import { HttpError } from "./http";
import {
  drawAtMs,
  LOTTERY_FIRST_ROUND,
  LOTTERY_GIFT_FROM,
  LOTTERY_PRICE,
  lotteryCarryOut,
  lotteryGiftNote,
  lotteryNoticeText,
  lotteryPool,
  lotteryPrizes,
  nextRound,
  prevRound,
  publicResult,
  roundOf,
  type LotteryPool,
  type LotteryResult,
  type LotteryStatus,
  type LotteryWinner,
} from "./lottery";
import { testServerEnv } from "./rpg/superHunter";
import { staffAccountId } from "./staff";
import { displayName, getAccounts, getGifts, getLottery } from "./store";
import { GIFT_KEEP_MS, type GiftRecord, type GiftStore } from "./store/gifts";
import type { LotteryStore } from "./store/lottery";
import type { AccountStore } from "./store/types";
import { pushVillageNotice } from "./weeklyChamp";

// 주간 행운권: 사기·상태·추첨 (서버). 규칙은 lib/lottery, 라우트는 app/api/lottery · app/api/admin/lottery.
// 추첨은 주간 1위 정리(lib/weeklyChamp settleChamps)와 같은 게으른 방식이다 — 크론 없이 토요일 저녁 8시가 지나 처음 들어온 요청
// (입장·머무르기·행운권 창·관리자 화면)이 잠금을 잡고 정리한다:
//  1) 판매 마감을 걸고 산 계정·지원금·이월을 한 명령으로 읽는다 → 2) 서버 난수로 1·2·3등을 뽑는다 (한 장씩이라 사람마다 한 번)
//  3) 결과를 처음 한 번만 저장한다 (이월도 같은 명령) → 4) 등수마다 선물함으로 보내고 표시, 마을 공지도 표시로 한 번만
// 3) 뒤에 멈춰도 다음 요청이 4)를 마저 한다. 선물 id가 결과마다 정해져 있어 다시 보내도 두 번 받지 않는다.

export type LotteryDeps = {
  store: LotteryStore;
  accounts: AccountStore;
  gifts: GiftStore;
  /** 0..n-1 서버 난수 */
  rand: (n: number) => number;
  staffId: () => Promise<string | null>;
  nameOf: (accountId: string, now: number) => Promise<string>;
  /** 마을 공지 (모든 채널) */
  announce: (text: string, now: number) => Promise<void>;
  /** 당첨자 화면의 내 정보·선물함 점을 바로 갱신 */
  notify?: (accountIds: string[]) => void;
};

export function lotteryDeps(): LotteryDeps {
  return {
    store: getLottery(),
    accounts: getAccounts(),
    gifts: getGifts(),
    rand: (n) => randomInt(0, n),
    staffId: () => staffAccountId(),
    nameOf: (id, now) => displayName(id, now),
    announce: (text, now) => pushVillageNotice(text, now),
    notify: (ids) => runAfter(() => notifyMe(ids)),
  };
}

export const LOTTERY_SPEND_REASON = (round: string) => `lottery:ticket ${round}`;
export const LOTTERY_REFUND_REASON = "lottery:refund";
export const LOTTERY_STAFF_MESSAGE = "운영자 계정은 행운권을 살 수 없어요.";
export const LOTTERY_DUP_MESSAGE = "이번 주 행운권은 이미 샀어요.";
export const LOTTERY_CLOSED_MESSAGE = "이번 회차 판매가 끝났어요. 추첨이 끝나면 다음 회차가 열려요.";

/** 결과마다 정해진 선물 id (다시 보내도 같은 선물 — 받은 표시가 그대로라 두 번 받지 못한다) */
export const lotteryGiftId = (resultId: string, rank: number) => `lot${resultId}r${rank}`;

/** 행운권 한 장 사기 (회차당 한 장, 200P). 차감 뒤 표를 넣고, 넣지 못하면(이미 샀음·마감) 돌려준다 */
export async function buyTicket(deps: LotteryDeps, accountId: string, now = Date.now()): Promise<{ round: string }> {
  const { store, accounts } = deps;
  const round = roundOf(now);
  if ((await deps.staffId()) === accountId) throw new HttpError(403, "STAFF", LOTTERY_STAFF_MESSAGE);
  if (await store.has(round, accountId)) throw new HttpError(409, "ALREADY", LOTTERY_DUP_MESSAGE);
  if ((await accounts.spend(accountId, LOTTERY_PRICE, LOTTERY_SPEND_REASON(round), now)) === null) throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  let r: Awaited<ReturnType<LotteryStore["buy"]>>;
  try {
    r = await store.buy(round, accountId, now);
  } catch (e) {
    await accounts.refund(accountId, LOTTERY_PRICE, LOTTERY_REFUND_REASON, now);
    throw e;
  }
  if (r === "ok") return { round };
  await accounts.refund(accountId, LOTTERY_PRICE, LOTTERY_REFUND_REASON, now);
  throw r === "dup" ? new HttpError(409, "ALREADY", LOTTERY_DUP_MESSAGE) : new HttpError(409, "CLOSED", LOTTERY_CLOSED_MESSAGE);
}

/** 지금 회차 상금 (이월 + 판매 몫 + 기본 상금 + 지원금) */
export async function currentPool(store: LotteryStore, round: string) {
  const [carry, tickets, subsidy] = await Promise.all([store.carry(), store.count(round), store.subsidy(round)]);
  return { tickets, pool: lotteryPool({ carry, tickets, subsidy }) };
}

/** 행운권 창 상태 */
export async function lotteryStatus(deps: LotteryDeps, accountId: string | null, now = Date.now()): Promise<LotteryStatus> {
  const round = roundOf(now);
  const [{ tickets, pool }, mine, staffId, [last]] = await Promise.all([
    currentPool(deps.store, round),
    accountId ? deps.store.has(round, accountId) : false,
    deps.staffId(),
    deps.store.recent(1),
  ]);
  return {
    round,
    drawAt: drawAtMs(round),
    price: LOTTERY_PRICE,
    tickets,
    mine,
    staff: !!accountId && staffId === accountId,
    pool,
    prizes: lotteryPrizes(pool.total),
    last: last ? publicResult(last) : null,
    lastRank: (last && accountId && last.winners.find((w) => w.accountId === accountId)?.rank) || null,
  };
}

/** 산 계정 중에서 사람마다 한 번씩 1·2·3등 (산 사람이 셋보다 적으면 그만큼만) */
export function drawWinners(buyers: readonly string[], rand: (n: number) => number): string[] {
  const pool = [...new Set(buyers)].sort();
  const out: string[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(rand(pool.length), 1)[0]);
  return out;
}

async function payAndAnnounce(deps: LotteryDeps, r: LotteryResult, now: number): Promise<void> {
  const paidNow: string[] = [];
  for (const w of r.winners) {
    const field = `r${w.rank}`;
    if (await deps.store.marked(r.id, field)) continue;
    const gift: GiftRecord = {
      id: lotteryGiftId(r.id, w.rank),
      from: LOTTERY_GIFT_FROM,
      note: lotteryGiftNote(w.rank),
      points: w.points,
      items: [],
      createdAt: r.drawnAt,
      expiresAt: r.drawnAt + GIFT_KEEP_MS,
      target: w.accountId,
      targetName: w.name,
    };
    if (w.points > 0) await deps.gifts.send(gift);
    await deps.store.mark(r.id, field);
    paidNow.push(w.accountId);
  }
  if (paidNow.length) deps.notify?.(paidNow);
  if (await deps.store.mark(r.id, "notice")) await deps.announce(lotteryNoticeText(r), now).catch((e) => console.warn("[lottery] 추첨 공지 실패", e));
}

async function allDone(store: LotteryStore, r: LotteryResult): Promise<boolean> {
  const marks = await Promise.all([...r.winners.map((w) => store.marked(r.id, `r${w.rank}`)), store.marked(r.id, "notice")]);
  return marks.every(Boolean);
}

export type LotterySettle = { result: LotteryResult | null; busy?: true };

/**
 * 그 회차 추첨 (여러 번·동시에 불러도 한 번만 뽑고 한 번만 준다). 추첨 시각 전이면 아무것도 안 한다.
 * test: 테스트 서버 "지금 추첨하기" — 시각과 상관없이 지금 회차를 뽑아 `{회차}t{시각}` 결과로 남기고, 그 회차를 비워 다시 팔게 한다
 */
export async function settleLottery(deps: LotteryDeps, round: string, now = Date.now(), opts: { test?: boolean } = {}): Promise<LotterySettle> {
  const { store } = deps;
  if (!opts.test) {
    if (now < drawAtMs(round)) return { result: null };
    const done = await store.result(round);
    if (done && (await allDone(store, done))) return { result: done };
  }
  if (!(await store.lock(round))) return { result: opts.test ? null : await store.result(round), busy: true };
  try {
    let r = opts.test ? null : await store.result(round);
    if (!r) {
      const snap = await store.close(round);
      const staffId = await deps.staffId();
      const buyers = snap.buyers.filter((id) => id !== staffId);
      const pool = lotteryPool({ carry: snap.carry, tickets: buyers.length, subsidy: snap.subsidy });
      const prizes = lotteryPrizes(pool.total);
      const picked = drawWinners(buyers, deps.rand);
      const winners: LotteryWinner[] = await Promise.all(
        picked.map(async (accountId, i) => ({ rank: (i + 1) as 1 | 2 | 3, accountId, name: await deps.nameOf(accountId, now), points: prizes[i] })),
      );
      const fresh: LotteryResult = {
        id: opts.test ? `${round}t${now}` : round,
        round,
        ...(opts.test ? { test: true as const } : {}),
        drawnAt: now,
        tickets: buyers.length,
        carryIn: pool.carry,
        salesShare: pool.salesShare,
        base: pool.base,
        subsidy: pool.subsidy,
        pool: pool.total,
        winners,
        carryOut: lotteryCarryOut(pool.total, winners.length),
      };
      r = (await store.commit(fresh, !opts.test)) ? fresh : await store.result(fresh.id);
      if (opts.test) await store.reopen(round);
    }
    if (r) await payAndAnnounce(deps, r, now);
    return { result: r };
  } finally {
    await store.unlock(round);
  }
}

/** 이 프로세스에서 추첨을 마쳤다고 아는 마지막 회차 (다음 토요일까지 저장소를 다시 읽지 않는다) */
let settledUpTo: string | null = null;

/**
 * 추첨 시각이 지난 회차를 차례로 정리한다 (입장·머무르기·행운권 창 앞에서 부른다). 마지막으로 마친 회차부터 다시 보고
 * (지급이 덜 끝났으면 마저) 지난 회차까지 순서대로 — 이월이 회차 순서대로 이어지게. 다른 요청이 정리 중이면 멈추고 다음에 이어 간다.
 * 입장을 막으면 안 되므로 오류는 삼킨다
 */
export async function ensureLotterySettled(now = Date.now(), deps?: LotteryDeps): Promise<void> {
  const due = prevRound(roundOf(now));
  if (due < LOTTERY_FIRST_ROUND || settledUpTo === due) return;
  try {
    const d = deps ?? lotteryDeps();
    let r = (await d.store.last()) ?? LOTTERY_FIRST_ROUND;
    for (let i = 0; i < 12 && r <= due; i++, r = nextRound(r)) if ((await settleLottery(d, r, now)).busy) return;
    if (r > due) settledUpTo = due;
  } catch (e) {
    console.warn("[lottery] 추첨 정리 실패", e);
  }
}

/** 시험용: 프로세스 기억을 지운다 */
export function resetLotteryMemo(): void {
  settledUpTo = null;
}

/** 관리자 행운권 화면 (app/api/admin/lottery): 지금 회차·상금 나눔·최근 추첨 결과(계정 id 포함) */
export type AdminLotteryResponse = {
  round: string;
  drawAt: number;
  tickets: number;
  pool: LotteryPool;
  prizes: number[];
  recent: LotteryResult[];
  /** 테스트 서버면 [지금 추첨하기]를 보여 준다 */
  testServer: boolean;
};

export async function adminLotteryStatus(now = Date.now(), store: LotteryStore = getLottery()): Promise<AdminLotteryResponse> {
  const round = roundOf(now);
  const [{ tickets, pool }, recent] = await Promise.all([currentPool(store, round), store.recent(8)]);
  return { round, drawAt: drawAtMs(round), tickets, pool, prizes: lotteryPrizes(pool.total), recent, testServer: testServerEnv() };
}

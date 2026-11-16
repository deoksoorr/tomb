import { isAvatarBody, itemById, PERMANENT_UNTIL } from "@tomb/protocol";
import { dayStartMs, nextWeekStartMs, weekStartMs } from "../../gameDay";
import { HttpError } from "../../http";
import { getAccounts } from "../../store";
import { kstDay, kstWeek, loadMe } from "../../store/accounts";
import type { MemoryAccounts } from "../../store/accounts-memory";
import { getStyleStore, type MemoryStyle } from "../../store/style";
import { getTitleStats, type MemoryTitleStats } from "../../store/titleStats";
import { forgetTitles, wornPerk } from "../../titlesServer";
import { conditionsAt } from "../rules";
import { getForageStore, type MemoryForageStore } from "../store";
import { inMonthShop, isOneTime, monthPreview, monthRewards, nextMonth, QUEST_ALWAYS, QUEST_DAILY, QUEST_REROLLS, QUEST_TITLE_STEPS, questRewardById, STAMP_CAP, type QuestReward } from "./catalog";
import { dailyQuests, pickError, weeklyQuest, type Quest } from "./gen";
import { getQuestStore, questView, type QuestMemDeps, type QuestRow, type QuestStore } from "./store";
import type { QuestBoard, QuestDeliverResponse, QuestExchangeResponse, QuestRerollResponse } from "./types";

// 11/15: 수집 의뢰 서버 로직 (라우트는 세션 확인·입력 검증만). 의뢰판 보기 = 저장소 읽기 1번, 납품·바꾸기·교환 = Lua 1번씩.
// 진행(가방으로 얼마나 채웠는지)은 화면이 가방 사본으로 계산한다. 위치는 보지 않는다 (판매처럼 어디서 불러도 이득이 없다).

const DAY_MS = 86_400_000;

/** 메모리 구현이 함께 바꾸는 저장소 (로컬·시험) */
function memDeps(): QuestMemDeps {
  const forage = () => getForageStore() as MemoryForageStore;
  const accts = () => getAccounts() as MemoryAccounts;
  const style = () => getStyleStore(getAccounts()) as MemoryStyle;
  const stats = () => getTitleStats() as MemoryTitleStats;
  return {
    takeBag: (a, items) => forage().removeNow(a, items),
    hasAccount: (a) => accts().questHas(a),
    giveInv: (a, id, flag) => accts().questGive(a, id, flag),
    ownsPermanent: (a, id, slot, perm) => accts().questOwnsPermanent(a, id, slot, perm),
    grantPermanent: (a, id, slot, perm) => void accts().staffGrant(a, [{ itemId: id, slot }], perm),
    giveBody: (a, body) => style().giveBody(a, body),
    bumpStat: (a, f, by) => stats().bump(a, f, by),
  };
}

export const questStore = (): QuestStore => getQuestStore(memDeps);

function boardOf(acct: string, row: QuestRow, now: number): QuestBoard {
  const day = kstDay(now);
  const week = kstWeek(now);
  const v = questView(row, day, week, QUEST_DAILY);
  const daily = dailyQuests(acct, day, v.reroll).map((q, i) => ({ ...q, done: v.done[i] }));
  const weekly = { ...weeklyQuest(acct, week, conditionsAt(weekStartMs(week)).season), done: v.weekDone };
  return {
    day,
    week,
    daily,
    weekly,
    rerollLeft: v.reroll === null ? QUEST_REROLLS : 0,
    stamps: row.stamps,
    total: row.total,
    owned: Object.keys(row.got).sort(),
    bought: row.bought,
    dayResetAt: dayStartMs(day) + DAY_MS,
    weekResetAt: nextWeekStartMs(now),
    shop: shopOf(day),
  };
}

/** 이달의 교환소 (게임 날짜의 달 — 1일 새벽 5시에 바뀐다) */
function shopOf(day: string): QuestBoard["shop"] {
  const month = day.slice(0, 6);
  const next = nextMonth(month);
  const p = monthPreview(month);
  return {
    month,
    items: monthRewards(month).map((r) => r.id),
    always: [...QUEST_ALWAYS],
    endsAt: dayStartMs(`${next}01`),
    preview: p.length ? { month: next, ids: p.map((r) => r.id) } : null,
  };
}

/** 의뢰판 (저장소 읽기 1번) */
export async function questBoard(acct: string, now = Date.now()): Promise<QuestBoard> {
  return boardOf(acct, await questStore().get(acct), now);
}

function questOf(board: QuestBoard, key: string): Quest & { done: boolean } {
  const q = key === "w" ? board.weekly : board.daily.find((d) => d.key === key);
  if (!q) throw new HttpError(400, "INVALID_INPUT", "그런 의뢰는 없어요.");
  return q;
}

function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/** 11/16 칭호로 더 받는 도장 수 (chance 확률로 1, r: [0,1) 난수) */
export const questBonus = (chance: number, r: number): number => (chance > 0 && r < chance ? 1 : 0);

/** 납품: 고른 것(pick)이 의뢰에 맞으면 가방에서 빼고 도장 (원자적) */
export async function deliverQuest(acct: string, key: string, pick: Record<string, number>, now = Date.now()): Promise<QuestDeliverResponse> {
  const store = questStore();
  const row = await store.get(acct);
  const board = boardOf(acct, row, now);
  const q = questOf(board, key);
  if (q.done) throw new HttpError(409, "QUEST_DONE", "이미 끝낸 의뢰예요.");
  const items = Object.fromEntries(Object.entries(pick).filter(([, n]) => n > 0));
  const bad = pickError(q, items);
  if (bad) throw new HttpError(400, "QUEST_PICK", bad);
  const target = key === "w" ? ({ kind: "week" } as const) : ({ kind: "day", slot: Number(key.slice(1)), reroll: questView(row, board.day, board.week, QUEST_DAILY).reroll } as const);
  // 11/16 수집 의뢰 갈래 칭호: 그 확률로 도장 하나 더 (도장 상한 STAMP_CAP은 그대로 — 저장소가 자른다)
  const bonus = questBonus((await wornPerk(acct, now)).questStamp, rand());
  const r = await store.deliver(acct, board.day, board.week, target, q.stamps + bonus, STAMP_CAP, items);
  if (r.status !== "ok") {
    if (r.status === "done") throw new HttpError(409, "QUEST_DONE", "이미 끝낸 의뢰예요.");
    if (r.status === "changed") throw new HttpError(409, "QUEST_CHANGED", "의뢰가 바뀌었어요. 의뢰판을 다시 열어 주세요.");
    throw new HttpError(409, "BAG_CHANGED", "가방에 그만큼 없어요. 다시 골라 주세요.");
  }
  // 칭호 구간에 닿으면 칭호 기억을 지워 바로 알린다
  if ((QUEST_TITLE_STEPS as readonly number[]).includes(r.total)) forgetTitles(acct);
  // 다시 읽지 않고 바뀐 것만 고친다
  const next: QuestBoard = {
    ...board,
    stamps: r.stamps,
    total: r.total,
    daily: board.daily.map((d) => (d.key === key ? { ...d, done: true } : d)),
    weekly: key === "w" ? { ...board.weekly, done: true } : board.weekly,
  };
  return { board: next, used: items, earned: q.stamps + bonus, ...(bonus ? { bonus } : {}) };
}

/** 오늘 의뢰 하나 바꾸기 (하루 한 번, 무료) */
export async function rerollQuest(acct: string, key: string, now = Date.now()): Promise<QuestRerollResponse> {
  const slot = /^d\d$/.test(key) ? Number(key.slice(1)) : -1;
  if (slot < 0 || slot >= QUEST_DAILY) throw new HttpError(400, "INVALID_INPUT", "오늘의 의뢰만 바꿀 수 있어요.");
  const store = questStore();
  const r = await store.reroll(acct, kstDay(now), slot);
  if (r === "used") throw new HttpError(409, "REROLL_USED", "오늘은 이미 의뢰를 바꿨어요. 내일 새벽 5시에 다시 바꿀 수 있어요.");
  if (r === "done") throw new HttpError(409, "QUEST_DONE", "이미 끝낸 의뢰는 바꿀 수 없어요.");
  return { board: await questBoard(acct, now) };
}

/** 교환소 물건이 지금 지급할 수 있게 등록됐는지 (그림·아이템 등록 전이면 도장을 받지 않고 거절) */
function exchangeItem(r: QuestReward) {
  const item = itemById(r.id);
  if (r.kind === "body") return item?.body && isAvatarBody(item.body) ? { id: r.id, price: r.price, kind: r.kind, body: item.body } : null;
  if (r.kind === "flag") return { id: r.id, price: r.price, kind: r.kind };
  if (r.kind === "ticket") return item ? { id: r.id, price: r.price, kind: r.kind } : null;
  return item?.kind === "cosmetic" && item.slot && (!r.slot || item.slot === r.slot) ? { id: r.id, price: r.price, kind: r.kind, slot: item.slot } : null;
}

/** 도장 교환 (원자적: 도장 빼기 + 지급) */
export async function exchangeQuest(acct: string, rewardId: string, now = Date.now()): Promise<QuestExchangeResponse> {
  const r = questRewardById(rewardId);
  if (!r) throw new HttpError(400, "INVALID_INPUT", "그런 물건은 없어요.");
  // 이달의 교환소에 있는 것만 (달은 서버 시각으로)
  if (!inMonthShop(kstDay(now).slice(0, 6), r.id)) throw new HttpError(409, "NOT_THIS_MONTH", "이번 달 교환소에는 없는 물건이에요.");
  const item = exchangeItem(r);
  if (!item) throw new HttpError(409, "NOT_READY", "아직 준비 중인 물건이에요. 조금만 기다려 주세요.");
  const res = await questStore().exchange(acct, kstDay(now), item, PERMANENT_UNTIL);
  if (res.status === "noacct") throw new HttpError(404, "NOT_FOUND", "계정을 찾지 못했어요. 새로고침해 주세요.");
  if (res.status === "owned") throw new HttpError(409, "OWNED", isOneTime(r) ? "이미 받은 물건이에요." : "이미 가지고 있어요.");
  if (res.status === "insufficient") throw new HttpError(409, "NOT_ENOUGH_STAMPS", `의뢰 도장이 모자라요. (${r.price}개 필요)`);
  if (r.kind === "body") forgetTitles(acct);
  const [board, me] = await Promise.all([questBoard(acct, now), loadMe(getAccounts(), acct, now)]);
  return { board, me, name: r.name };
}

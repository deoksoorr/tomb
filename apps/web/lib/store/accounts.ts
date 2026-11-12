import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { GRANT_TTL_SEC, isAvatarBody, signGrant, type AvatarDye, type Look } from "@tomb/protocol";
import { STAY_TICK_MINUTES } from "../calendar";
import { CODE_ALPHABET, type EarnSource } from "../economy";
import { parseYmd, todayKst } from "../epitaph";
import { NAME_CHANGE_COOLDOWN_DAYS, NAME_CHANGE_PRICE, type Me } from "../types";
import { getStyleStore } from "./style";
import type { AccountRecord, AccountStore } from "./types";

// 계정·포인트 공용 도우미 (라우트가 쓴다). 날짜 키는 KST 기준 YYYYMMDD.

export const kstDay = (now = Date.now()) => todayKst(now).replaceAll("-", "");
export const kstYesterday = (now = Date.now()) =>
  new Date(parseYmd(todayKst(now)) - 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");

/** KST 날짜(YYYYMMDD)가 속한 주의 월요일 (YYYYMMDD). 주간 랭킹 키 */
export function weekOfDay(day: string): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
  const dow = new Date(t).getUTCDay(); // 0 = 일요일
  return new Date(t - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
}
export const kstWeek = (now = Date.now()) => weekOfDay(kstDay(now));
/** 주간 랭킹 보관 (지난주까지 보고 나서 저절로 지워지게) */
export const WEEK_RANK_TTL_SEC = 21 * 86_400;

export const NAME_CHANGE_COOLDOWN_MS = NAME_CHANGE_COOLDOWN_DAYS * 86_400_000;

export function toMe(accountId: string, a: AccountRecord, day: string, now: number): Me {
  const nextAllowedAt = a.nameChangedAt ? a.nameChangedAt + NAME_CHANGE_COOLDOWN_MS : 0;
  return {
    accountId,
    name: a.name,
    color: a.color,
    body: a.body,
    points: a.points,
    lifetimePoints: a.lifetimePoints,
    todayEarned: a.todayEarned,
    attendance: { today: a.lastAttend === day, streak: a.streak, stayMinutes: a.stayTicks * STAY_TICK_MINUTES },
    hasCode: a.hasCode,
    inventory: a.inventory,
    equipped: a.equipped,
    stash: a.stash,
    graves: a.graves,
    activityUnread: a.activityUnread,
    // 첫 변경은 무료, 그다음부터 NAME_CHANGE_PRICE
    nameChange: { nextAllowedAt: nextAllowedAt > now ? nextAllowedAt : 0, cost: a.nameChanges ? NAME_CHANGE_PRICE : 0 },
    tutorialDone: a.tutorialDone,
  };
}

export async function loadMe(accounts: AccountStore, accountId: string, now = Date.now()): Promise<Me> {
  const day = kstDay(now);
  // 46번 염색은 따로 저장한다 (lib/store/style.ts)
  const [a, style] = await Promise.all([accounts.get(accountId, day, now), getStyleStore(accounts).get(accountId)]);
  return { ...toMe(accountId, a, day, now), dye: style.dye };
}

/**
 * 반응 적립: 반응한 사람에게 mine, 묘비 주인에게 got (자기 묘비에 자기가 한 반응은 주인 몫이 없다).
 * 반응한 사람이 이번에 받은 점수를 돌려준다.
 */
export async function rewardReaction(
  accounts: AccountStore,
  actorId: string,
  ownerId: string | undefined,
  mine: EarnSource,
  got: EarnSource,
  now = Date.now(),
): Promise<number> {
  const day = kstDay(now);
  const [earned] = await Promise.all([
    accounts.earn(actorId, mine, day),
    ownerId && ownerId !== actorId ? accounts.earn(ownerId, got, day) : 0,
  ]);
  return earned;
}

// ── 개인 코드: XXXX-XXXX-XXXX (헷갈리는 글자 뺀 31자, 12자리 ≈ 59비트). 원문은 저장하지 않는다 ──

const codeChars = customAlphabet(CODE_ALPHABET, 12);
export function newCode(): string {
  const s = codeChars();
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export const codeHash = (code: string) => createHash("sha256").update(`code:${code}`).digest("hex");

// ── 실시간 서버로 보내는 증서 (JOIN_SECRET으로 서명, 60초) ──

/** 착용 증서에는 지금 입은 것만 (벗어 둔 stash는 넣지 않는다) */
export const lookOf = (a: Pick<AccountRecord, "equipped">): Look => a.equipped.map((e) => e.itemId);

/**
 * 착용 증서. 46·25번: appearance(지금 염색·몸 모양)를 주면 같이 싣는다 → 실시간 서버가 다른 사람 화면에도 바꾼다
 * (빈 염색 = 기본색으로 되돌림). 주지 않으면 예전처럼 꾸미기만
 */
export function lookGrant(
  secret: string,
  visitorId: string,
  look: Look,
  now = Date.now(),
  appearance?: { dye?: AvatarDye; body?: string | null },
): Promise<string> {
  const extra = appearance
    ? { dye: appearance.dye ?? {}, ...(isAvatarBody(appearance.body) ? { body: appearance.body } : {}) }
    : {};
  return signGrant(secret, { kind: "look", visitorId, look, exp: Math.floor(now / 1000) + GRANT_TTL_SEC, ...extra });
}

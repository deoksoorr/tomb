import { createHash } from "node:crypto";
import { customAlphabet } from "nanoid";
import { GRANT_TTL_SEC, isAvatarBody, signGrant, type AvatarDye, type Look } from "@tomb/protocol";
import { STAY_TICK_MINUTES } from "../calendar";
import { CODE_ALPHABET, type EarnSource } from "../economy";
import { gameDay, gameWeek, gameYesterday, weekOfDay } from "../gameDay";
import { NAME_CHANGE_COOLDOWN_DAYS, NAME_CHANGE_PRICE, type Me } from "../types";
import { staffAccountId, topUpIfStaff } from "../staff";
import { champBitsFor } from "./champ";
import { K } from "./keys";
import { getStyleStore } from "./style";
import type { AccountRecord, AccountStore } from "./types";

// 계정·포인트 공용 도우미 (라우트가 쓴다). 날짜 키는 게임 날짜 YYYYMMDD — 한국 시간 새벽 5시에 바뀐다 (lib/gameDay).

/** 오늘 (게임 날짜 YYYYMMDD, 새벽 5시에 바뀐다). 이름은 예전 그대로 — 하루 경계는 lib/gameDay 한 곳 */
export const kstDay = gameDay;
/** 어제 (게임 날짜) */
export const kstYesterday = gameYesterday;
/** 게임 날짜(YYYYMMDD)가 속한 주의 월요일 (YYYYMMDD). 주간 랭킹 키 — 주는 월요일 새벽 5시에 바뀐다 */
export { weekOfDay };
export const kstWeek = gameWeek;

/**
 * 경제 통계 키 (Redis Lua에 KEYS로 넘긴다). 운영자 계정이면 관리자 경제 통계(econ:{날짜})가 아니라
 * 따로 모으는 키(econstaff:{날짜})에 더한다 — 같은 Lua 안에서 바뀌므로 원자성은 그대로, 운영자 지갑·기능도 그대로.
 * 받는 계정 기준이다 (선물 받기·관리자 지급도 받는 쪽이 운영자면 빠진다). 메모리 저장소는 accounts-memory.ts stat이 같은 규칙
 */
export async function econKeyFor(accountId: string, day: string): Promise<string> {
  return (await staffAccountId()) === accountId ? K.econStaff(day) : K.econ(day);
}
/** 주간 랭킹 보관 (지난주까지 보고 나서 저절로 지워지게) */
export const WEEK_RANK_TTL_SEC = 21 * 86_400;

/**
 * 주간 랭킹 동점 정리 (주간 1위 보상: "동점이면 먼저 달성한 사람"). Redis 정렬 집합 점수에 달성 시각을 소수부로 싣는다:
 * 점수 = 정수 값 + weekTieFrac(달성 시각). 이른 시각일수록 소수부가 커서 같은 값 안에서 위에 온다 (늘 0과 1 사이, 1ms 단위까지 구분).
 * 화면·지급에 쓰는 값은 rankValue로 소수부를 버린 정수
 */
export const WEEK_TIE_SCALE = 1e13;
export const weekTieFrac = (now: number) => (WEEK_TIE_SCALE - now) / WEEK_TIE_SCALE;
/** 저장된 랭킹 점수 → 화면 값 (동점 정리용 소수부를 버린다) */
export const rankValue = (score: unknown) => Math.floor(Number(score));

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
    attendance: { today: a.lastAttend === day, streak: a.streak, stayMinutes: a.stayTicks * STAY_TICK_MINUTES, bonusClaimed: a.bonusClaimed },
    hasCode: a.hasCode,
    inventory: a.inventory,
    equipped: a.equipped,
    stash: a.stash,
    graves: a.graves,
    activityUnread: a.activityUnread,
    // 첫 변경은 무료, 그다음부터 NAME_CHANGE_PRICE
    nameChange: { nextAllowedAt: nextAllowedAt > now ? nextAllowedAt : 0, cost: a.nameChanges ? NAME_CHANGE_PRICE : 0 },
    tutorialDone: a.tutorialDone,
    ...(a.renameRequired ? { renameRequired: true as const } : {}),
  };
}

export async function loadMe(accounts: AccountStore, accountId: string, now = Date.now()): Promise<Me> {
  const day = kstDay(now);
  // 31번 운영자 계정은 잔액을 지갑 상한까지 채운 뒤 읽는다 (포인트가 줄지 않는다)
  const staff = await topUpIfStaff(accounts, accountId);
  // 46번 염색은 따로 저장한다 (lib/store/style.ts)
  // 주간 1위 값 (지난주 1위면 비트, 오라를 껐으면 끔 표시까지) → 착용 증서에 실려 다른 사람 화면의 배지·오라도 맞춘다
  const [a, style, champ] = await Promise.all([accounts.get(accountId, day, now), getStyleStore(accounts).get(accountId), champBitsFor(accountId, now).catch(() => 0)]);
  return {
    ...toMe(accountId, a, day, now),
    dye: style.dye,
    ...(staff ? { staff: true } : {}),
    ...(style.bodies?.length ? { bodies: style.bodies } : {}),
    ...(champ ? { champ } : {}),
  };
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
 * (빈 염색 = 기본색으로 되돌림). 주지 않으면 예전처럼 꾸미기만.
 * 주간 1위: appearance가 있으면 1위 값(champ, 없으면 0 = 1위 아님)도 싣는다 → 1위가 끝났거나 오라를 끄고 켠 것이 바로 반영된다
 */
export function lookGrant(
  secret: string,
  visitorId: string,
  look: Look,
  now = Date.now(),
  appearance?: { dye?: AvatarDye; body?: string | null; champ?: number },
): Promise<string> {
  const extra = appearance
    ? { dye: appearance.dye ?? {}, ...(isAvatarBody(appearance.body) ? { body: appearance.body } : {}), champ: appearance.champ ?? 0 }
    : {};
  return signGrant(secret, { kind: "look", visitorId, look, exp: Math.floor(now / 1000) + GRANT_TTL_SEC, ...extra });
}

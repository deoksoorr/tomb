import type { NextRequest } from "next/server";
import { BALANCE_CAP } from "./economy";
import { env } from "./env";
import { clientIp, HttpError } from "./http";
import { isAdminIp } from "./ipAllow";
import { getVisitorId } from "./session";
import { MemoryStaff, RedisStaff, type StaffRecord, type StaffStore } from "./store/staff";
import type { AccountStore } from "./store/types";

// 31번 운영자(슈퍼) 계정. 판정은 언제나 서버가 한다:
//  - 입장 토큰의 staff 표시는 이 모듈이 확인한 뒤에만 넣는다 (실시간 서버가 다른 사람 화면에 저승사자 차림·"운영자" 배지로 그린다)
//  - 포인트: 내 정보를 불러올 때마다 잔액을 지갑 상한까지 채운다 (써도 줄지 않는 것처럼 보인다. 랭킹·경제 통계와 무관)
//  - 확성기: 가방에서 꺼내지 않는다
//  - 묘비 삭제: 운영자 계정 + 관리자 IP(ADMIN_ALLOWED_IPS) 둘 다 맞아야 한다

const g = globalThis as typeof globalThis & { __tombStaff?: StaffStore; __tombStaffCache?: { id: string | null; at: number } };

/** 같은 서버 인스턴스 안에서 운영자 id를 이만큼 기억한다 (요청마다 Redis를 한 번 더 읽지 않게) */
const CACHE_MS = 10_000;

export function getStaffStore(): StaffStore {
  const cur = g.__tombStaff;
  const conn = env.redis();
  if (conn) return cur instanceof RedisStaff ? cur : (g.__tombStaff = new RedisStaff(conn));
  if (cur instanceof MemoryStaff) return cur;
  return (g.__tombStaff = cur ? Object.assign(new MemoryStaff(), cur) : new MemoryStaff());
}

export async function staffAccountId(now = Date.now()): Promise<string | null> {
  const c = g.__tombStaffCache;
  if (c && now - c.at < CACHE_MS) return c.id;
  const id = (await getStaffStore().get())?.accountId ?? null;
  g.__tombStaffCache = { id, at: now };
  return id;
}

export async function isStaff(accountId: string): Promise<boolean> {
  return !!accountId && (await staffAccountId()) === accountId;
}

export async function getStaff(): Promise<StaffRecord | null> {
  return getStaffStore().get();
}

/** 관리자 화면에서 지정·해제 (null). 이 인스턴스의 기억도 바로 바꾼다 */
export async function setStaff(accountId: string | null, now = Date.now(), name: string | null = null): Promise<void> {
  await getStaffStore().set(accountId ? { accountId, setAt: now, name } : null);
  g.__tombStaffCache = { id: accountId, at: now };
}

/**
 * 운영자면 잔액을 지갑 상한까지 채운다. 운영자인지 돌려준다.
 * (계정 저장소는 인자로 받는다 — lib/store를 가져오면 store/accounts.ts와 순환 import가 생긴다)
 */
export async function topUpIfStaff(accounts: AccountStore, accountId: string): Promise<boolean> {
  if (!(await isStaff(accountId))) return false;
  await getStaffStore().fill(accounts, accountId, BALANCE_CAP);
  return true;
}

/**
 * 관리자 처리 기록의 처리자 이름에 쓸 운영자 닉네임: 관리자 화면을 연 브라우저의 계정 쿠키가 운영자 계정이면 그 이름, 아니면 null.
 * (lib/ban.ts adminActor가 부른다. 계정 저장소를 읽지 않고 지정할 때 남긴 이름을 쓴다 — 순환 import를 만들지 않게)
 */
export async function staffActorName(req: NextRequest): Promise<string | null> {
  const [vid, rec] = await Promise.all([getVisitorId(req), getStaffStore().get()]);
  return vid && rec && rec.accountId === vid ? (rec.name ?? "운영자") : null;
}

/** 운영자 전용 작업: 운영자 계정이고 관리자 IP에서 온 요청이어야 한다. 아니면 403 */
export async function requireStaffAtAdminIp(req: NextRequest, accountId: string): Promise<void> {
  if (!(await isStaff(accountId))) throw new HttpError(403, "FORBIDDEN", "운영자 계정만 할 수 있어요.");
  if (!isAdminIp(clientIp(req), env.adminAllowedIps(), env.isProd()))
    throw new HttpError(403, "FORBIDDEN", "운영자 작업은 관리자 IP에서만 할 수 있어요.");
}

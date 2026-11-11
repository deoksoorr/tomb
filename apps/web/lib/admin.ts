import { hmacSign, hmacVerify } from "@tomb/protocol";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import { HttpError } from "./http";
import { assertAdminNotLocked, recordAdminFailure } from "./ratelimit";
import type { ReportLogEntry } from "./reports";
import { safeEqual } from "./session";
import { byCreated, deleteGrave, getAccounts, getStore, releaseImage, sweepShrine, toPublicGrave, type GraveStore } from "./store";
import { pagePassed, sweepPassing, toPassedEntry } from "./store/passing";
import type { PassedEntry, PassReason, PublicGrave } from "./types";
import type { ErrorGroup } from "./store/errors";
import type { AdminAction } from "./validate";

// 관리자 인증 (IP 허용 목록은 proxy.ts가 먼저 거른다).
// 키는 `x-admin-key`/`Authorization: Bearer` 헤더로 매번 보내거나, /admin에서 한 번 입력해 12시간짜리 쿠키를 받는다.

/** 관리자 목록 항목: 공개 형태 + 숨김 여부 + 신고 수(지금 세는 IP 수) + 최근 신고 기록(최신 먼저) */
export type AdminGrave = PublicGrave & { hidden: boolean; reports: number; reportLog: ReportLogEntry[] };

/** 관리자 성불 목록 항목 (숨김 포함, 성불 이유·주인 계정) */
export type AdminPassed = PassedEntry & { hidden: boolean; reason: PassReason; ownerAccountId: string | null };
/** GET /api/admin/graves/passed?q=&offset= */
export type AdminPassedResponse = { entries: AdminPassed[]; next: number | null; total: number };
/** GET·PATCH /api/admin/graves/settings — 성불 기간(일)과 묘역 정원(채널마다, 코드 상수) */
export type AdminGraveSettings = { passDays: number; capacity: number };

/** GET /api/admin/errors 응답: 오류 묶음(날짜를 합친 횟수, 며칠에 걸쳐 났는지) */
export type AdminErrorsResponse = { errors: (ErrorGroup & { days: number })[] };

/** POST /api/admin/accounts/points 응답 */
export type AdminPointsResponse = { accountId: string; points: number };

/** POST /api/admin/graves/bulk 응답 */
export type AdminBulkResponse = { done: string[]; notFound: string[] };

export const ADMIN_COOKIE = "tomb_admin";
const ADMIN_SESSION_SEC = 12 * 60 * 60;

// 쿠키 값 = `${만료 unix초}.${HMAC(ADMIN_KEY, "admin:" + 만료)}` → ADMIN_KEY를 바꾸면 기존 쿠키가 모두 무효가 된다
async function verifyAdminCookie(value: string | undefined): Promise<boolean> {
  const [exp, sig] = value?.split(".") ?? [];
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  return hmacVerify(env.adminKey(), `admin:${exp}`, sig);
}

export async function setAdminCookie(res: NextResponse): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_SEC;
  res.cookies.set(ADMIN_COOKIE, `${exp}.${await hmacSign(env.adminKey(), `admin:${exp}`)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProd(),
    path: "/",
    maxAge: ADMIN_SESSION_SEC,
  });
}

export function clearAdminCookie(res: NextResponse): void {
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: env.isProd(), path: "/", maxAge: 0 });
}

const unauthorized = () => new HttpError(401, "UNAUTHORIZED", "관리자 키가 올바르지 않아요.");

/**
 * 키를 확인한다. 틀린 키는 IP당 분당 10회까지만 받고, 넘으면 맞는 키여도 잠시 429
 * (맞았는지 여부로 키를 알아내지 못하게).
 */
export async function assertAdminKey(req: NextRequest, key: string): Promise<void> {
  await assertAdminNotLocked(req);
  if (safeEqual(key.trim(), env.adminKey())) return;
  await recordAdminFailure(req);
  throw unauthorized();
}

/** 헤더 키 또는 관리자 쿠키. 아무것도 없으면 실패로 세지 않는다 (로그인 전 화면이 목록을 부르는 것은 정상) */
export async function requireAdmin(req: NextRequest): Promise<void> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const key = req.headers.get("x-admin-key") ?? bearer;
  if (key) return assertAdminKey(req, key);

  await assertAdminNotLocked(req);
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifyAdminCookie(cookie)) return;
  if (cookie) await recordAdminFailure(req);
  throw unauthorized();
}

/** 모든 채널, 숨김 포함 + 신고 요약. 등록 순 (각 항목에 channel) */
export async function listAdminGraves(store: GraveStore = getStore()): Promise<AdminGrave[]> {
  const now = Date.now();
  await sweepPassing(store, getAccounts(), now).catch((e: unknown) => console.error("[admin] 성불 정리 실패", e));
  const [records, reports, settings] = await Promise.all([
    store.listAll(),
    store.reportSummary(),
    store.settings(now),
    sweepShrine(store),
  ]);
  return records.sort(byCreated).map((r) => ({
    ...toPublicGrave(r, now, settings),
    hidden: !!r.hidden,
    reports: reports.get(r.id)?.count ?? 0,
    reportLog: reports.get(r.id)?.log ?? [],
  }));
}

/** 묘비 하나에 관리 작업. 묘비가 없으면 false */
export function applyAdminAction(store: GraveStore, id: string, action: AdminAction): Promise<boolean> {
  switch (action) {
    case "hide":
      return store.setHidden(id, true);
    case "unhide":
      return store.setHidden(id, false);
    case "resetReports":
      return store.resetReports(id);
    case "delete":
      return deleteGrave(store, id);
  }
}

/** 성불한 묘비 (숨김 포함) 한 쪽 */
export async function listAdminPassed(q: string, offset: number, store: GraveStore = getStore()): Promise<AdminPassedResponse> {
  const page = pagePassed(await store.passedAll(), { q, offset, includeHidden: true, limit: 100 });
  return {
    entries: page.items.map((p) => ({
      ...toPassedEntry(p),
      hidden: !!p.record.hidden,
      reason: p.reason,
      ownerAccountId: p.record.ownerAccountId ?? null,
    })),
    next: page.next,
    total: page.total,
  };
}

/** 성불한 묘비를 완전히 지운다 (사진 포함). 없으면 false */
export async function deletePassed(id: string, store: GraveStore = getStore()): Promise<boolean> {
  const removed = await store.removePassed(id);
  if (!removed) return false;
  await releaseImage(store, removed.imageUrl);
  return true;
}

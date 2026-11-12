import { createHash, timingSafeEqual } from "node:crypto";
import { hmacSign, hmacVerify } from "@tomb/protocol";
import { nanoid } from "nanoid";
import type { NextRequest, NextResponse } from "next/server";
import { assertNotBanned } from "./ban";
import { env } from "./env";
import { clientIp, HttpError } from "./http";

// ── 방문자 식별 쿠키 ──
// 값은 `${visitorId}.${HMAC(visitorId, SESSION_SECRET)}`. 로그인이 없으므로 1인 1회 판정은 이 쿠키 기준이다.

export const SESSION_COOKIE = "vid";
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{21}$/;

export const newVisitorId = () => nanoid();

export async function signSession(visitorId: string): Promise<string> {
  return `${visitorId}.${await hmacSign(env.sessionSecret(), visitorId)}`;
}

/** 서명이 맞으면 visitorId, 아니면 null */
export async function verifySession(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  if (!VISITOR_ID_RE.test(id)) return null;
  return (await hmacVerify(env.sessionSecret(), id, value.slice(dot + 1))) ? id : null;
}

export function getVisitorId(req: NextRequest): Promise<string | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** 방문자 쿠키 확인 + 47번 정지·IP 차단이면 403 BANNED (인스턴스에 캐시한 색인으로 판정, lib/ban.ts) */
export async function requireVisitor(req: NextRequest): Promise<string> {
  const id = await getVisitorId(req);
  if (!id) throw new HttpError(401, "NO_SESSION", "방문 기록이 없어요. 새로고침한 뒤 다시 시도해 주세요.");
  await assertNotBanned(req, id);
  return id;
}

export async function setSessionCookie(res: NextResponse, visitorId: string): Promise<void> {
  res.cookies.set(SESSION_COOKIE, await signSession(visitorId), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd(),
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
}

/** 로그아웃: 쿠키를 지운다 (개인 코드가 없으면 그 계정으로 다시 들어올 방법이 없다) */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: env.isProd(), path: "/", maxAge: 0 });
}

// ── 비밀값 비교 / 묘비 소유 토큰 ──

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * 요청 IP의 해시 (레이트리밋·신고 집계용). IP 원문은 저장하지 않는다.
 * IPv4는 경우의 수가 작아 그냥 해시하면 되돌릴 수 있으므로 서버 시크릿을 소금으로 섞는다.
 */
export function ipHash(req: NextRequest): string {
  return sha256Hex(`${clientIp(req)}|${env.sessionSecret()}`).slice(0, 16);
}

/** 길이가 달라도 시간이 새지 않도록 다이제스트끼리 상수 시간 비교 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/** 로그인 없는 소유권 증명. 원문은 응답으로 한 번만 주고 서버에는 sha256만 남긴다 */
export function newOwnerToken(): { token: string; hash: string } {
  const token = nanoid(32);
  return { token, hash: sha256Hex(token) };
}

export function isOwner(token: string | null, ownerTokenHash: string): boolean {
  return !!token && !!ownerTokenHash && safeEqual(sha256Hex(token), ownerTokenHash);
}

import { createHash, timingSafeEqual } from "node:crypto";
import { hmacSign, hmacVerify } from "@tomb/protocol";
import { nanoid } from "nanoid";
import type { NextRequest, NextResponse } from "next/server";
import { assertNotBanned } from "./ban";
import { env } from "./env";
import { clientIp, HttpError } from "./http";
import { getSessionGenStore, type SessionGenStore } from "./store/sessionGen";

// ── 방문자 식별 쿠키 ──
// 값은 `${visitorId}.${HMAC(visitorId, SESSION_SECRET)}`. 로그인이 없으므로 1인 1회 판정은 이 쿠키 기준이다.
// 11/18 세션 세대: 세대를 올린 계정(개인 코드 재발급·「다른 기기에서 모두 로그아웃」)은 `${visitorId}.g${세대}.${HMAC(visitorId.g세대)}`.
// 쿠키 세대가 계정의 지금 세대보다 낮으면 무효. 세대 0은 옛 모양 그대로라 지금까지 받은 쿠키는 계속 유효하다.
// 판정은 인스턴스마다 SESSION_GEN_CACHE_MS 동안 올린 계정 목록(HGETALL 한 번)을 기억해 두고 본다 → 요청마다 Redis를 더 읽지 않는다

export const SESSION_COOKIE = "vid";
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{21}$/;

export const newVisitorId = () => nanoid();

/** 세대 판정 캐시 유지 시간. 다른 인스턴스는 이만큼 늦게 옛 쿠키를 끊을 수 있다 (세대를 올린 인스턴스는 바로) */
export const SESSION_GEN_CACHE_MS = 60_000;
const GEN_RE = /^g([1-9]\d{0,8})$/;

export async function signSession(visitorId: string, gen = 0): Promise<string> {
  if (gen <= 0) return `${visitorId}.${await hmacSign(env.sessionSecret(), visitorId)}`;
  const body = `${visitorId}.g${gen}`;
  return `${body}.${await hmacSign(env.sessionSecret(), body)}`;
}

/** 서명만 확인한다 (세대가 지금 것인지는 보지 않는다). 맞으면 { id, gen } */
export async function parseSession(value: string | undefined): Promise<{ id: string; gen: number } | null> {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const id = value.slice(0, dot);
  if (!VISITOR_ID_RE.test(id)) return null;
  const rest = value.slice(dot + 1);
  const dot2 = rest.indexOf(".");
  if (dot2 < 0) return (await hmacVerify(env.sessionSecret(), id, rest)) ? { id, gen: 0 } : null;
  const m = GEN_RE.exec(rest.slice(0, dot2));
  if (!m) return null;
  return (await hmacVerify(env.sessionSecret(), `${id}.${m[0]}`, rest.slice(dot2 + 1))) ? { id, gen: Number(m[1]) } : null;
}

type GenCache = { at: number; gens: Map<string, number> };
const gc = globalThis as typeof globalThis & { __tombSessionGenCache?: GenCache | null };

/** 세대를 올린 뒤 부른다 (이 인스턴스는 바로 새 목록을 읽는다) */
export function invalidateSessionGenCache(): void {
  gc.__tombSessionGenCache = null;
}

async function cachedGen(accountId: string, now: number, store: SessionGenStore): Promise<number> {
  let c = gc.__tombSessionGenCache;
  if (!c || now - c.at >= SESSION_GEN_CACHE_MS) c = gc.__tombSessionGenCache = { at: now, gens: await store.all() };
  return c.gens.get(accountId) ?? 0;
}

/** 서명이 맞고 세대가 지금 것이면 visitorId, 아니면 null */
export async function verifySession(value: string | undefined, opts: { now?: number; store?: SessionGenStore } = {}): Promise<string | null> {
  const s = await parseSession(value);
  if (!s) return null;
  const cur = await cachedGen(s.id, opts.now ?? Date.now(), opts.store ?? getSessionGenStore());
  return s.gen >= cur ? s.id : null;
}

export function getVisitorId(req: NextRequest): Promise<string | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

/** 이 요청 쿠키의 세대 (서명이 틀리면 0) — 쿠키를 새로 굽기만 할 때 그대로 쓴다 */
export async function cookieGen(req: NextRequest): Promise<number> {
  return (await parseSession(req.cookies.get(SESSION_COOKIE)?.value))?.gen ?? 0;
}

/**
 * 11/18 세대를 올린다: 이 계정의 다른 기기 쿠키는 모두 무효 (다른 인스턴스는 SESSION_GEN_CACHE_MS 안에).
 * 돌려준 세대로 지금 기기 쿠키를 다시 구우면(setSessionCookie) 지금 기기는 그대로 남는다
 */
export async function bumpSessionGen(accountId: string, store: SessionGenStore = getSessionGenStore()): Promise<number> {
  const gen = await store.bump(accountId);
  invalidateSessionGenCache();
  return gen;
}

/** 방문자 쿠키 확인 + 47번 정지·IP 차단이면 403 BANNED (인스턴스에 캐시한 색인으로 판정, lib/ban.ts) */
export async function requireVisitor(req: NextRequest): Promise<string> {
  const id = await getVisitorId(req);
  if (!id) throw new HttpError(401, "NO_SESSION", "방문 기록이 없어요. 새로고침한 뒤 다시 시도해 주세요.");
  await assertNotBanned(req, id);
  return id;
}

/**
 * 계정 쿠키를 굽는다. gen을 모르면(코드·구글로 들어올 때) 그 계정의 지금 세대를 바로 읽는다 (HGET 한 번 — 로그인 때만).
 * 새 계정은 0을 넘긴다
 */
export async function setSessionCookie(res: NextResponse, visitorId: string, gen?: number): Promise<void> {
  const g = gen ?? (await getSessionGenStore().get(visitorId));
  res.cookies.set(SESSION_COOKIE, await signSession(visitorId, g), {
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
 * 요청 IP의 해시 (레이트리밋·신고 집계·IP별 하루 적립 합계용). IP 원문은 저장하지 않는다.
 * IPv4는 경우의 수가 작아 그냥 해시하면 되돌릴 수 있으므로 서버 시크릿을 소금으로 섞는다.
 * 11/18 IPv6는 앞 64비트(한 집·한 회사 회선이 보통 통째로 받는 대역)만 — 한 사람이 주소 뒷부분을 얼마든지 바꿀 수 있어
 * 주소 단위로 세면 하루 한도·신고 집계를 피할 수 있다. IPv4는 지금까지와 같은 값이다 (기록이 이어진다)
 */
export function ipHash(req: NextRequest): string {
  const ip = clientIp(req);
  const v6 = ip.includes(":") && !/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip) ? ipv6Prefix64(ip) : null;
  return v6 ? sha256Hex(`net6:${v6}|${env.sessionSecret()}`).slice(0, 16) : sha256Hex(`${ip}|${env.sessionSecret()}`).slice(0, 16);
}

/** 대입 방지 한도용 IP 해시 — 11/18부터 ipHash와 같다 (IPv6는 /64) */
export const ipNetHash = ipHash;

/** IPv6 주소의 앞 4묶음 (펼친 형태). 읽을 수 없으면 null */
export function ipv6Prefix64(raw: string): string | null {
  const s = raw.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":");
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

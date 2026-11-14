import { createHash, createHmac, createPublicKey, randomBytes, verify as verifySignature, type JsonWebKey } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import type { GoogleResult } from "./googleResult";
import { safeEqual } from "./session";

// 구글 계정 연결·로그인 (OAuth 2.0 인가 코드 + PKCE, OpenID Connect).
//  - 범위는 openid 하나: 구글에서 받는 건 고유 번호(sub)뿐이다. 이메일·이름·사진은 요청하지도 저장하지도 않는다
//  - sub 원문도 저장하지 않는다: 서버 비밀값(SESSION_SECRET)으로 HMAC한 값(subHash)만 계정과 잇는다 (lib/store/googleLinks.ts)
//  - state·PKCE 검증값·nonce는 서명한 짧은 쿠키(10분, SameSite=Lax, 이 경로에서만)에 담는다. 서버에는 아무것도 남기지 않는다
//  - id_token은 구글 공개키(JWKS)로 RS256 서명을 직접 검증하고 iss·aud·exp·nonce를 확인한다 (외부 패키지 없이 node:crypto)
//  - 돌아오는 주소는 요청 Host가 아니라 환경으로 고정한다 (운영 = https://myproject.rip, 그 밖 = 공개 주소 환경 변수, 로컬 = localhost)
//  - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 없으면 꺼진다 (단추 숨김, 경로 404). 로컬 개발은 GOOGLE_MOCK=1로 모의 구글(/api/dev/google/*)을 쓴다

export const PROD_ORIGIN = "https://myproject.rip";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;
export const MOCK_ISSUER = "https://mock-google.local";
export const MOCK_CLIENT_ID = "mock-client-id";
export const MOCK_CLIENT_SECRET = "mock-client-secret";

export const CALLBACK_PATH = "/api/auth/google/callback";
/** 상태·대기 쿠키는 이 경로 아래에서만 오간다 (다른 API 요청에 실리지 않는다) */
export const COOKIE_PATH = "/api/auth/google";
export const STATE_COOKIE = "g_oauth";
export const PENDING_COOKIE = "g_new";
export const STATE_TTL_SEC = 10 * 60;
/** 구글로 새로 만들기: 이름·모습을 정하는 동안 확인된 구글을 기억하는 시간 */
export const PENDING_TTL_SEC = 20 * 60;
/** id_token 시각 허용 오차 */
const CLOCK_SKEW_SEC = 60;

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuers: readonly string[];
  /** 모의 구글 (로컬 개발 전용). subHash를 진짜와 다른 이름표로 만든다 → 진짜 구글 연결과 절대 겹치지 않는다 */
  mock: boolean;
};

/** 이 배포의 고정 주소 (요청 Host를 믿지 않는다) */
export function appOrigin(e: NodeJS.ProcessEnv = process.env): string {
  if (e.VERCEL_ENV?.trim() === "production") return PROD_ORIGIN;
  const raw = e.NEXT_PUBLIC_SITE_URL?.trim() || (e.VERCEL_BRANCH_URL?.trim() ? `https://${e.VERCEL_BRANCH_URL.trim()}` : "");
  if (raw) return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).origin;
  if (e.NODE_ENV === "production" && e.VERCEL_ENV) throw new Error("[google] 돌아올 주소를 정할 수 없어요. NEXT_PUBLIC_SITE_URL을 넣어 주세요.");
  return `http://localhost:${e.WEB_PORT?.trim() || e.PORT?.trim() || "3000"}`;
}

export const redirectUri = () => `${appOrigin()}${CALLBACK_PATH}`;

/** 켜져 있으면 설정, 아니면 null (→ 단추 숨김·경로 404) */
export function googleConfig(): GoogleConfig | null {
  const real = env.google();
  if (real)
    return {
      ...real,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      issuers: GOOGLE_ISSUERS,
      mock: false,
    };
  if (env.googleMock()) {
    const o = appOrigin();
    return {
      clientId: MOCK_CLIENT_ID,
      clientSecret: MOCK_CLIENT_SECRET,
      authUrl: `${o}/api/dev/google/authorize`,
      tokenUrl: `${o}/api/dev/google/token`,
      jwksUrl: `${o}/api/dev/google/jwks`,
      issuers: [MOCK_ISSUER],
      mock: true,
    };
  }
  return null;
}

export const googleEnabled = () => googleConfig() !== null;

// ── 서명 쿠키 ──

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (purpose: string, body: string) => createHmac("sha256", env.sessionSecret()).update(`${purpose}:${body}`).digest("base64url");

function sealValue(purpose: string, data: object): string {
  const body = b64u(JSON.stringify(data));
  return `${body}.${mac(purpose, body)}`;
}

function openValue(purpose: string, value: string | undefined, nowSec: number): Record<string, unknown> | null {
  if (!value || value.length > 2048) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  if (!safeEqual(value.slice(dot + 1), mac(purpose, body))) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof o.e === "number" && o.e >= nowSec ? o : null;
  } catch {
    return null;
  }
}

const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: env.isProd(), path: COOKIE_PATH, maxAge });

// ── 상태 쿠키 (state + PKCE + nonce) ──

export type OAuthMode = "login" | "link";
export type OAuthState = { state: string; verifier: string; nonce: string; mode: OAuthMode; accountId?: string };

const rand = (n = 32) => randomBytes(n).toString("base64url");
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function newOAuthState(mode: OAuthMode, accountId?: string): OAuthState {
  return { state: rand(), verifier: rand(48), nonce: rand(), mode, ...(accountId ? { accountId } : {}) };
}

export function sealState(s: OAuthState, nowSec = Math.floor(Date.now() / 1000)): string {
  return sealValue("g-oauth", { s: s.state, v: s.verifier, n: s.nonce, m: s.mode, a: s.accountId, e: nowSec + STATE_TTL_SEC });
}

/** 쿠키의 서명·만료를 확인하고, 돌아온 state가 쿠키의 것과 같을 때만 상태를 돌려준다 */
export function openState(cookie: string | undefined, stateParam: string | null, nowSec = Math.floor(Date.now() / 1000)): OAuthState | null {
  const o = openValue("g-oauth", cookie, nowSec);
  if (!o || typeof o.s !== "string" || typeof o.v !== "string" || typeof o.n !== "string") return null;
  if (o.m !== "login" && o.m !== "link") return null;
  if (!stateParam || !safeEqual(stateParam, o.s)) return null;
  return { state: o.s, verifier: o.v, nonce: o.n, mode: o.m, ...(typeof o.a === "string" ? { accountId: o.a } : {}) };
}

export function setStateCookie(res: NextResponse, s: OAuthState): void {
  res.cookies.set(STATE_COOKIE, sealState(s), cookieOpts(STATE_TTL_SEC));
}
export function clearStateCookie(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", cookieOpts(0));
}

/** 구글 동의 화면 주소 */
export function authorizeUrl(cfg: GoogleConfig, s: OAuthState): string {
  const u = new URL(cfg.authUrl);
  u.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid",
    state: s.state,
    nonce: s.nonce,
    code_challenge: pkceChallenge(s.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return u.toString();
}

// ── 구글로 새로 만들기 대기 쿠키 (확인된 구글의 subHash만, 원문 sub 없음) ──

export function setPendingCookie(res: NextResponse, subHash: string, nowSec = Math.floor(Date.now() / 1000)): void {
  res.cookies.set(PENDING_COOKIE, sealValue("g-new", { h: subHash, e: nowSec + PENDING_TTL_SEC }), cookieOpts(PENDING_TTL_SEC));
}
export function readPending(req: NextRequest, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const o = openValue("g-new", req.cookies.get(PENDING_COOKIE)?.value, nowSec);
  return o && typeof o.h === "string" && /^[0-9a-f]{64}$/.test(o.h) ? o.h : null;
}
export function clearPendingCookie(res: NextResponse): void {
  res.cookies.set(PENDING_COOKIE, "", cookieOpts(0));
}

/** 저장용 구글 식별값: HMAC(SESSION_SECRET, sub). 원문 sub는 이 함수 밖으로 나가지 않는다 */
export function subHash(sub: string, mock = false): string {
  return createHmac("sha256", env.sessionSecret())
    .update(`google-sub:${mock ? "mock:" : ""}${sub}`)
    .digest("hex");
}

// ── 토큰 교환 · id_token 검증 ──

export class GoogleAuthError extends Error {}

type Fetch = typeof fetch;

/** 인가 코드 → id_token (access_token 등 나머지는 버린다) */
export async function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, fetchImpl: Fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new GoogleAuthError(`토큰 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
  if (!res.ok || typeof body?.id_token !== "string") throw new GoogleAuthError(`토큰 응답 ${res.status} ${String(body?.error ?? "")}`);
  return body.id_token;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type JwksCache = { url: string; at: number; ttlMs: number; keys: Jwk[] };
const jg = globalThis as typeof globalThis & { __tombGoogleJwks?: JwksCache | null };

/** 시험용: 공개키 캐시 비우기 */
export function resetJwksCache(): void {
  jg.__tombGoogleJwks = null;
}

async function loadJwks(url: string, fetchImpl: Fetch, force: boolean, now: number): Promise<Jwk[]> {
  const c = jg.__tombGoogleJwks;
  if (!force && c && c.url === url && now - c.at < c.ttlMs) return c.keys;
  let res: Response;
  try {
    res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch (e) {
    throw new GoogleAuthError(`공개키 요청 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = (await res.json().catch(() => null)) as { keys?: unknown } | null;
  if (!res.ok || !Array.isArray(body?.keys)) throw new GoogleAuthError(`공개키 응답 ${res.status}`);
  // 구글이 알려 주는 캐시 기간(max-age)만큼 기억한다 (없으면 1시간, 최대 하루)
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]);
  const ttlMs = Math.min(Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : 3_600_000, 86_400_000);
  const keys = (body.keys as Jwk[]).filter((k) => k && k.kty === "RSA" && typeof k.kid === "string");
  jg.__tombGoogleJwks = { url, at: now, ttlMs, keys };
  return keys;
}

const decodeJson = (part: string): Record<string, unknown> | null => {
  try {
    const o: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * id_token 검증 → sub. 서명(RS256, 구글 공개키) · iss · aud(=우리 클라이언트 id) · exp · iat · nonce를 모두 본다.
 * 하나라도 틀리면 GoogleAuthError
 */
export async function verifyIdToken(
  cfg: GoogleConfig,
  token: string,
  nonce: string,
  opts: { fetchImpl?: Fetch; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 8192) throw new GoogleAuthError("형식이 틀린 id_token");
  const [h, p, s] = parts;
  const header = decodeJson(h);
  const payload = decodeJson(p);
  if (!header || !payload) throw new GoogleAuthError("읽을 수 없는 id_token");
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new GoogleAuthError(`지원하지 않는 서명 ${String(header.alg)}`);

  // 키가 바뀐 직후일 수 있어 못 찾으면 한 번만 새로 받는다
  let keys = await loadJwks(cfg.jwksUrl, fetchImpl, false, now);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await loadJwks(cfg.jwksUrl, fetchImpl, true, now);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new GoogleAuthError("맞는 공개키가 없음");
  let ok = false;
  try {
    const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
    ok = verifySignature("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  } catch {
    ok = false;
  }
  if (!ok) throw new GoogleAuthError("서명이 맞지 않음");

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.iss !== "string" || !cfg.issuers.includes(payload.iss)) throw new GoogleAuthError("발급자가 다름");
  const aud = payload.aud;
  const audOk = aud === cfg.clientId || (Array.isArray(aud) && aud.includes(cfg.clientId) && payload.azp === cfg.clientId);
  if (!audOk) throw new GoogleAuthError("대상(aud)이 다름");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SEC < nowSec) throw new GoogleAuthError("만료된 id_token");
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SEC > nowSec) throw new GoogleAuthError("발급 시각이 미래");
  if (typeof payload.nonce !== "string" || !safeEqual(payload.nonce, nonce)) throw new GoogleAuthError("nonce가 다름");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255) throw new GoogleAuthError("고유 번호가 없음");
  return payload.sub;
}

// ── 결과 안내 (돌아온 첫 화면 /?google=…, 목록은 lib/googleResult.ts) ──

/** 첫 화면으로 (고정 주소 + 정해진 결과만 → 열린 리디렉트 없음) */
export const resultUrl = (r: GoogleResult) => `${appOrigin()}/?google=${r}`;

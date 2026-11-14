import { createHash, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appOrigin,
  authorizeUrl,
  exchangeCode,
  GoogleAuthError,
  googleConfig,
  newOAuthState,
  openState,
  pkceChallenge,
  PROD_ORIGIN,
  resetJwksCache,
  sealState,
  subHash,
  verifyIdToken,
  type GoogleConfig,
} from "./googleAuth";
import { signJwt } from "./googleMock";

// 구글 로그인 보안 검사: 상태 쿠키(state·만료·위조), PKCE, id_token(서명·aud·iss·exp·nonce), 고정 주소. 구글은 가짜 fetch로 흉내 낸다

const CLIENT = "test-client.apps.googleusercontent.com";
const cfg: GoogleConfig = {
  clientId: CLIENT,
  clientSecret: "secret",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
  mock: false,
};

const keyA = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyB = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (k: typeof keyA, kid: string) => ({ ...k.publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" });

const NOW = Date.UTC(2026, 10, 14, 3, 0);
const nowSec = Math.floor(NOW / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT,
  azp: CLIENT,
  sub: "110248495921238986420",
  nonce: "n-1",
  iat: nowSec - 10,
  exp: nowSec + 3600,
  ...over,
});

function fakeJwks(keys: Record<string, unknown>[]) {
  let calls = 0;
  const f = vi.fn(async (url: string | URL | Request) => {
    expect(String(url)).toBe(cfg.jwksUrl);
    calls++;
    return Response.json({ keys }, { headers: { "cache-control": "public, max-age=3600" } });
  });
  return { fetchImpl: f as unknown as typeof fetch, calls: () => calls };
}

beforeEach(() => {
  resetJwksCache();
  vi.stubEnv("SESSION_SECRET", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("상태 쿠키 · PKCE", () => {
  it("돌아온 state가 쿠키와 같고 서명·만료가 맞을 때만 연다", () => {
    const s = newOAuthState("link", "acct-1");
    const sealed = sealState(s, nowSec);
    expect(openState(sealed, s.state, nowSec)).toEqual(s);
    // state가 다르면 (다른 사람이 만든 콜백 주소)
    expect(openState(sealed, newOAuthState("link").state, nowSec)).toBeNull();
    expect(openState(sealed, null, nowSec)).toBeNull();
    // 쿠키가 없으면
    expect(openState(undefined, s.state, nowSec)).toBeNull();
    // 10분이 지나면
    expect(openState(sealed, s.state, nowSec + 601)).toBeNull();
    // 내용을 바꾸면 서명이 맞지 않는다 (계정 id 바꿔치기)
    const [body, sig] = sealed.split(".");
    const forged = JSON.parse(Buffer.from(body, "base64url").toString());
    forged.a = "acct-2";
    expect(openState(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, s.state, nowSec)).toBeNull();
    // 다른 비밀값으로 서명한 쿠키
    vi.stubEnv("SESSION_SECRET", "other-secret");
    expect(openState(sealed, s.state, nowSec)).toBeNull();
  });

  it("PKCE는 S256 (검증값의 SHA-256), 매번 다른 값", () => {
    const a = newOAuthState("login");
    const b = newOAuthState("login");
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pkceChallenge(a.verifier)).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
  });

  it("동의 화면 주소: openid만, PKCE·nonce·state, 고정된 돌아올 주소", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const s = newOAuthState("login");
    const u = new URL(authorizeUrl(cfg, s));
    expect(u.origin + u.pathname).toBe(cfg.authUrl);
    expect(u.searchParams.get("scope")).toBe("openid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://myproject.rip/api/auth/google/callback");
    expect(u.searchParams.get("code_challenge")).toBe(pkceChallenge(s.verifier));
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("state")).toBe(s.state);
    expect(u.searchParams.get("nonce")).toBe(s.nonce);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.toString()).not.toMatch(/email|profile/);
  });
});

describe("돌아올 주소 (요청 Host를 믿지 않는다)", () => {
  it("운영은 myproject.rip 고정, 테스트 서버는 공개 주소 → 브랜치 주소, 로컬은 localhost", () => {
    expect(appOrigin({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://evil.example", NODE_ENV: "production" })).toBe(PROD_ORIGIN);
    expect(appOrigin({ VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://staging.example.com/", NODE_ENV: "production" })).toBe(
      "https://staging.example.com",
    );
    expect(appOrigin({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "tomb-git-staging-x.vercel.app", NODE_ENV: "production" })).toBe(
      "https://tomb-git-staging-x.vercel.app",
    );
    expect(() => appOrigin({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(appOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(appOrigin({ NODE_ENV: "development", WEB_PORT: "3100" })).toBe("http://localhost:3100");
  });
});

describe("설정", () => {
  it("클라이언트 id·비밀값이 둘 다 있어야 켜진다. 모의 구글은 개발에서 GOOGLE_MOCK=1일 때만", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_MOCK", "");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT);
    expect(googleConfig()).toBeNull();
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "s");
    expect(googleConfig()?.mock).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_MOCK", "1");
    expect(googleConfig()?.mock).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "x");
    expect(googleConfig()).toBeNull();
  });

  it("저장용 해시: 원문 sub가 보이지 않고, 비밀값·모의 여부에 따라 다르다", () => {
    const h = subHash("110248495921238986420");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("110248495921238986420");
    expect(subHash("110248495921238986420")).toBe(h);
    expect(subHash("110248495921238986420", true)).not.toBe(h);
    vi.stubEnv("SESSION_SECRET", "other-secret");
    expect(subHash("110248495921238986420")).not.toBe(h);
  });
});

describe("id_token 검증", () => {
  const ok = () => signJwt(keyA.privateKey, "a", claims());

  it("맞는 토큰이면 sub", async () => {
    const { fetchImpl } = fakeJwks([jwk(keyA, "a")]);
    await expect(verifyIdToken(cfg, ok(), "n-1", { fetchImpl, now: NOW })).resolves.toBe("110248495921238986420");
    // iss는 구글이 쓰는 두 모양 모두
    await expect(verifyIdToken(cfg, signJwt(keyA.privateKey, "a", claims({ iss: "accounts.google.com" })), "n-1", { fetchImpl, now: NOW })).resolves.toBe(
      "110248495921238986420",
    );
  });

  it("가짜 서명(다른 키로 서명·내용 바꿔치기)은 거절", async () => {
    const { fetchImpl } = fakeJwks([jwk(keyA, "a")]);
    await expect(verifyIdToken(cfg, signJwt(keyB.privateKey, "a", claims()), "n-1", { fetchImpl, now: NOW })).rejects.toThrow(/서명/);
    const [h, , s] = ok().split(".");
    const p = Buffer.from(JSON.stringify(claims({ sub: "attacker" }))).toString("base64url");
    await expect(verifyIdToken(cfg, `${h}.${p}.${s}`, "n-1", { fetchImpl, now: NOW })).rejects.toThrow(/서명/);
    // 서명 없는 토큰(alg none)
    const none = `${Buffer.from(JSON.stringify({ alg: "none", kid: "a" })).toString("base64url")}.${p}.`;
    await expect(verifyIdToken(cfg, none, "n-1", { fetchImpl, now: NOW })).rejects.toThrow(GoogleAuthError);
    // HS256 (공개키를 비밀키로 쓰는 공격)
    const hs = `${Buffer.from(JSON.stringify({ alg: "HS256", kid: "a" })).toString("base64url")}.${p}.abc`;
    await expect(verifyIdToken(cfg, hs, "n-1", { fetchImpl, now: NOW })).rejects.toThrow(/지원하지 않는/);
  });

  it("다른 aud·다른 iss·만료·nonce 불일치는 거절", async () => {
    const { fetchImpl } = fakeJwks([jwk(keyA, "a")]);
    const v = (c: Record<string, unknown>, nonce = "n-1") => verifyIdToken(cfg, signJwt(keyA.privateKey, "a", claims(c)), nonce, { fetchImpl, now: NOW });
    await expect(v({ aud: "other-client.apps.googleusercontent.com" })).rejects.toThrow(/aud/);
    await expect(v({ aud: [CLIENT, "x"], azp: "x" })).rejects.toThrow(/aud/);
    await expect(v({ iss: "https://evil.example" })).rejects.toThrow(/발급자/);
    await expect(v({ exp: nowSec - 120 })).rejects.toThrow(/만료/);
    await expect(v({ iat: nowSec + 600 })).rejects.toThrow(/미래/);
    await expect(v({}, "n-2")).rejects.toThrow(/nonce/);
    await expect(v({ nonce: undefined })).rejects.toThrow(/nonce/);
    await expect(v({ sub: "" })).rejects.toThrow(/고유 번호/);
  });

  it("공개키는 캐시하고, 모르는 kid면 한 번만 새로 받는다 (키 교체)", async () => {
    let keys = [jwk(keyA, "a")];
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return Response.json({ keys }, { headers: { "cache-control": "max-age=3600" } });
    }) as unknown as typeof fetch;
    await verifyIdToken(cfg, ok(), "n-1", { fetchImpl, now: NOW });
    await verifyIdToken(cfg, ok(), "n-1", { fetchImpl, now: NOW });
    expect(calls).toBe(1);
    keys = [jwk(keyB, "b")];
    await expect(verifyIdToken(cfg, signJwt(keyB.privateKey, "b", claims()), "n-1", { fetchImpl, now: NOW })).resolves.toBeTruthy();
    expect(calls).toBe(2);
    // 끝까지 없는 kid
    await expect(verifyIdToken(cfg, signJwt(keyA.privateKey, "zzz", claims()), "n-1", { fetchImpl, now: NOW })).rejects.toThrow(/공개키/);
  });
});

describe("토큰 교환", () => {
  it("인가 코드·PKCE 검증값·돌아올 주소를 form으로 보내고 id_token만 꺼낸다", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    let sent: URLSearchParams | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe(cfg.tokenUrl);
      sent = new URLSearchParams(String(init.body));
      return Response.json({ id_token: "tok", access_token: "버린다" });
    }) as unknown as typeof fetch;
    await expect(exchangeCode(cfg, "code-1", "verifier-1", fetchImpl)).resolves.toBe("tok");
    expect(Object.fromEntries(sent!)).toEqual({
      code: "code-1",
      client_id: CLIENT,
      client_secret: "secret",
      redirect_uri: "https://myproject.rip/api/auth/google/callback",
      grant_type: "authorization_code",
      code_verifier: "verifier-1",
    });
    const bad = (async () => Response.json({ error: "invalid_grant" }, { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeCode(cfg, "code-1", "v", bad)).rejects.toThrow(GoogleAuthError);
  });
});

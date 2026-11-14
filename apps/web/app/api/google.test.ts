import { createHash, generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetJwksCache } from "@/lib/googleAuth";
import { signJwt } from "@/lib/googleMock";
import { verifySession } from "@/lib/session";
import { getGoogleAudit } from "@/lib/store/adminAudit";
import type { ApiError, GoogleClaimResponse, GoogleStatusResponse } from "@/lib/types";
import * as bans from "./admin/bans/route";
import * as callback from "./auth/google/callback/route";
import * as claim from "./auth/google/claim/route";
import * as start from "./auth/google/start/route";
import * as devAuthorize from "./dev/google/authorize/route";
import * as devJwks from "./dev/google/jwks/route";
import * as devToken from "./dev/google/token/route";
import * as meGoogle from "./me/google/route";
import * as session from "./session/route";

// 구글 연결·로그인 경로 전체. 로컬 구성(Memory*)으로 라우트를 직접 부르고, 구글(토큰·공개키)은 fetch를 가로채 흉내 낸다

const CLIENT = "test-client.apps.googleusercontent.com";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "GOOGLE_MOCK", "VERCEL_ENV"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "3");
});
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  // 시험 요청 주소(http://localhost)를 이 배포의 고정 주소로
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost");
  resetJwksCache();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ── 쿠키 단지 (브라우저 흉내) ──
type Jar = Map<string, string>;
const jar = (): Jar => new Map();
function absorb(j: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair, ...attrs] = c.split(";");
    const [name, ...v] = pair.split("=");
    const value = v.join("=");
    if (!value || attrs.some((a) => /max-age=0\b/i.test(a.trim()))) j.delete(name.trim());
    else j.set(name.trim(), value);
  }
}
const cookieHeader = (j: Jar) => [...j].map(([k, v]) => `${k}=${v}`).join("; ");

let ipSeq = 0;
function req(path: string, j: Jar, opts: { method?: string; ip?: string; body?: unknown; admin?: boolean; origin?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? "10.9.0.1" };
  if (j.size) headers.cookie = cookieHeader(j);
  if (opts.admin) Object.assign(headers, { "x-admin-key": "dev-admin", "x-forwarded-for": "127.0.0.1" });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${opts.origin ?? "http://localhost"}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const errOf = async (res: Response) => ((await res.json()) as ApiError).error;

/** 새 브라우저 + 새 계정 쿠키 */
async function browserWithAccount(): Promise<{ j: Jar; id: string; ip: string }> {
  const j = jar();
  const res = await session.POST(req("/api/session", j, { method: "POST" }));
  absorb(j, res);
  return { j, id: ((await res.json()) as { visitorId: string }).visitorId, ip: `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` };
}

// ── 가짜 구글: 동의 화면이 준 인가 코드 → (PKCE 확인) → id_token ──
type Pending = { sub: string; nonce: string; challenge: string };
const codes = new Map<string, Pending>();
let tokenKey = key.privateKey;
let tokenAud = CLIENT;
function fakeGoogle() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://www.googleapis.com/oauth2/v3/certs")
      return Response.json({ keys: [{ ...key.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" }] });
    if (url === "https://oauth2.googleapis.com/token") {
      const f = new URLSearchParams(String(init?.body));
      const c = codes.get(f.get("code") ?? "");
      codes.delete(f.get("code") ?? "");
      const pkceOk = c && createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url") === c.challenge;
      if (!c || !pkceOk || f.get("client_secret") !== "test-secret" || f.get("redirect_uri") !== "http://localhost/api/auth/google/callback")
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      const iat = Math.floor(Date.now() / 1000);
      return Response.json({
        id_token: signJwt(tokenKey, "k1", { iss: "https://accounts.google.com", aud: tokenAud, sub: c.sub, nonce: c.nonce, iat, exp: iat + 3600 }),
      });
    }
    // 실시간 서버 내부 요청(정지 시 내보내기)은 성공한 척
    if (url.includes("/internal/")) return Response.json({ expelled: 0, sent: 0 });
    throw new Error(`예상하지 못한 요청 ${url}`);
  });
}

/** 구글 한 바퀴: 시작 → (구글 동의: sub) → 콜백. 돌아온 결과(?google=)를 준다 */
async function googleRound(j: Jar, mode: "login" | "link", sub: string, ip = "10.9.0.1"): Promise<string> {
  fakeGoogle();
  const s = await start.GET(req(`/api/auth/google/start?mode=${mode}`, j, { ip }));
  expect(s.status).toBe(302);
  absorb(j, s);
  const loc = new URL(s.headers.get("location")!);
  if (loc.origin === "http://localhost") return loc.searchParams.get("google")!; // 시작부터 막힘 (nosession·banned)
  expect(loc.origin).toBe("https://accounts.google.com");
  const code = `code-${Math.random().toString(36).slice(2)}`;
  codes.set(code, { sub, nonce: loc.searchParams.get("nonce")!, challenge: loc.searchParams.get("code_challenge")! });
  const cb = await callback.GET(req(`/api/auth/google/callback?code=${code}&state=${loc.searchParams.get("state")}`, j, { ip }));
  expect(cb.status).toBe(302);
  absorb(j, cb);
  const back = new URL(cb.headers.get("location")!);
  expect(back.origin + back.pathname).toBe("http://localhost/");
  expect(j.has("g_oauth")).toBe(false); // 상태 쿠키는 한 번 쓰고 지운다
  return back.searchParams.get("google")!;
}

const status = async (j: Jar) => (await (await meGoogle.GET(req("/api/me/google", j))).json()) as GoogleStatusResponse;

describe("구글 설정이 없으면 모두 숨긴다", () => {
  it("시작·콜백·연결·상태·끊기 404, 모의 구글도 404", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const { j } = await browserWithAccount();
    for (const res of [
      await start.GET(req("/api/auth/google/start?mode=login", j)),
      await callback.GET(req("/api/auth/google/callback?code=x&state=y", j)),
      await claim.POST(req("/api/auth/google/claim", j, { method: "POST" })),
      await meGoogle.GET(req("/api/me/google", j)),
      await meGoogle.DELETE(req("/api/me/google", j, { method: "DELETE" })),
      await devAuthorize.GET(req("/api/dev/google/authorize", j)),
      await devJwks.GET(req("/api/dev/google/jwks", j)),
      await devToken.POST(req("/api/dev/google/token", j, { method: "POST" })),
    ])
      expect(res.status).toBe(404);
  });

  it("모의 구글은 운영 빌드에서 GOOGLE_MOCK=1이어도 404", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_MOCK", "1");
    expect((await devJwks.GET(req("/api/dev/google/jwks", jar()))).status).toBe(200);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "s");
    vi.stubEnv("JOIN_SECRET", "s");
    expect((await devJwks.GET(req("/api/dev/google/jwks", jar()))).status).toBe(404);
    expect((await devAuthorize.GET(req("/api/dev/google/authorize", jar()))).status).toBe(404);
    expect((await start.GET(req("/api/auth/google/start", jar()))).status).toBe(404);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GOOGLE_MOCK", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("JOIN_SECRET", "");
  });
});

describe("연결 · 로그인", () => {
  it("연결 → 상태 → 다른 계정은 거절(taken) → 새 기기에서 구글로 그 계정에 들어온다 → 끊으면 못 들어온다", async () => {
    const a = await browserWithAccount();
    expect(await status(a.j)).toEqual({ linked: false, linkedAt: null });
    expect(await googleRound(a.j, "link", "sub-alice", a.ip)).toBe("linked");
    expect((await status(a.j)).linked).toBe(true);
    expect(await googleRound(a.j, "link", "sub-alice", a.ip)).toBe("same");
    expect(await googleRound(a.j, "link", "sub-other", a.ip)).toBe("other");

    const b = await browserWithAccount();
    expect(await googleRound(b.j, "link", "sub-alice", b.ip)).toBe("taken");
    expect((await status(b.j)).linked).toBe(false);

    // 새 기기 (쿠키 없음): 구글로 들어오면 그 계정의 세션 쿠키를 받는다
    const phone = jar();
    expect(await googleRound(phone, "login", "sub-alice")).toBe("login");
    expect(await verifySession(phone.get("vid"))).toBe(a.id);
    // 다른 계정 쿠키가 있던 기기도 그 계정으로 바뀐다 (코드로 들어오기와 같다)
    expect(await googleRound(b.j, "login", "sub-alice", b.ip)).toBe("login");
    expect(await verifySession(b.j.get("vid"))).toBe(a.id);

    // 연결·끊기 기록 (고유 번호·해시는 적지 않는다)
    const del = await meGoogle.DELETE(req("/api/me/google", a.j, { method: "DELETE" }));
    expect(((await del.json()) as GoogleStatusResponse).linked).toBe(false);
    const log = await getGoogleAudit().recent(10);
    expect(log.filter((e) => e.accountId === a.id).map((e) => e.action)).toEqual(["googleUnlink", "googleLink"]);
    expect(JSON.stringify(log)).not.toContain("sub-alice");

    const later = jar();
    expect(await googleRound(later, "login", "sub-alice")).toBe("new");
    expect(later.has("vid")).toBe(false);
  });

  it("연결 안 된 구글: new + 대기 쿠키 → 새 계정에 연결하며 개인 코드를 한 번 준다 → 다음부터 구글로 들어온다", async () => {
    const j = jar();
    expect(await googleRound(j, "login", "sub-newbie")).toBe("new");
    expect(j.has("g_new")).toBe(true);
    expect(j.get("g_new")).not.toContain("sub-newbie");
    // 새로 시작 흐름: 세션 → (이름·모습) → 연결
    const s = await session.POST(req("/api/session", j, { method: "POST", body: { fresh: true } }));
    absorb(j, s);
    const newId = ((await s.json()) as { visitorId: string }).visitorId;
    const c = await claim.POST(req("/api/auth/google/claim", j, { method: "POST" }));
    expect(c.status).toBe(200);
    absorb(j, c);
    const body = (await c.json()) as GoogleClaimResponse;
    expect(body.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(body.me.hasCode).toBe(true);
    expect(j.has("g_new")).toBe(false);
    // 한 번 쓴 대기 쿠키는 다시 못 쓴다
    const again = await claim.POST(req("/api/auth/google/claim", j, { method: "POST" }));
    expect(again.status).toBe(410);

    const other = jar();
    expect(await googleRound(other, "login", "sub-newbie")).toBe("login");
    expect(await verifySession(other.get("vid"))).toBe(newId);
  });

  it("대기 쿠키의 구글이 그새 다른 계정에 연결됐으면 409, 대기 쿠키 없이는 410", async () => {
    const j = jar();
    expect(await googleRound(j, "login", "sub-race")).toBe("new");
    const owner = await browserWithAccount();
    expect(await googleRound(owner.j, "link", "sub-race", owner.ip)).toBe("linked");
    const s = await session.POST(req("/api/session", j, { method: "POST" }));
    absorb(j, s);
    const c = await claim.POST(req("/api/auth/google/claim", j, { method: "POST" }));
    expect(c.status).toBe(409);
    expect((await errOf(c)).message).toBe("이 구글 계정은 이미 다른 계정에 연결돼 있어요. 그 계정에서 먼저 연결을 끊어 주세요.");

    const plain = await browserWithAccount();
    expect((await claim.POST(req("/api/auth/google/claim", plain.j, { method: "POST" }))).status).toBe(410);
  });

  it("정지된 계정은 구글로도 못 들어오고(쿠키 없음), 연결도 못 한다", async () => {
    const d = await browserWithAccount();
    expect(await googleRound(d.j, "link", "sub-banned", d.ip)).toBe("linked");
    fakeGoogle();
    const ban = await bans.POST(req("/api/admin/bans", jar(), { method: "POST", admin: true, body: { kind: "account", accountId: d.id, days: 3, reason: "시험 정지", memo: "구글 시험" } }));
    expect(ban.status).toBe(200);
    const fresh = jar();
    expect(await googleRound(fresh, "login", "sub-banned")).toBe("banned");
    expect(fresh.has("vid")).toBe(false);
    expect(await googleRound(d.j, "link", "sub-banned-2", d.ip)).toBe("banned");
  });
});

describe("상태·서명 검사", () => {
  it("상태 쿠키 없음·state 불일치·취소·연결 중 계정이 바뀜", async () => {
    fakeGoogle();
    const a = await browserWithAccount();
    // 쿠키 없이 콜백 (다른 사람이 만든 주소를 눌림)
    const noCookie = await callback.GET(req("/api/auth/google/callback?code=x&state=y", jar()));
    expect(new URL(noCookie.headers.get("location")!).searchParams.get("google")).toBe("error");

    const s = await start.GET(req("/api/auth/google/start?mode=link", a.j, { ip: a.ip }));
    absorb(a.j, s);
    const cookie = s.headers.getSetCookie().find((c) => c.startsWith("g_oauth="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth\/google/);
    const state = new URL(s.headers.get("location")!).searchParams.get("state")!;
    const wrong = await callback.GET(req(`/api/auth/google/callback?code=x&state=${state}x`, a.j, { ip: a.ip }));
    expect(new URL(wrong.headers.get("location")!).searchParams.get("google")).toBe("error");
    const cancel = await callback.GET(req(`/api/auth/google/callback?error=access_denied&state=${state}`, a.j, { ip: a.ip }));
    expect(new URL(cancel.headers.get("location")!).searchParams.get("google")).toBe("cancel");

    // 동의 화면에 다녀오는 사이 이 기기가 다른 계정이 됐다 → 연결하지 않는다
    const s2 = await start.GET(req("/api/auth/google/start?mode=link", a.j, { ip: a.ip }));
    absorb(a.j, s2);
    const loc = new URL(s2.headers.get("location")!);
    const swapped = await session.POST(req("/api/session", a.j, { method: "POST", body: { fresh: true } }));
    absorb(a.j, swapped);
    codes.set("code-swap", { sub: "sub-swap", nonce: loc.searchParams.get("nonce")!, challenge: loc.searchParams.get("code_challenge")! });
    const cb = await callback.GET(req(`/api/auth/google/callback?code=code-swap&state=${loc.searchParams.get("state")}`, a.j, { ip: a.ip }));
    expect(new URL(cb.headers.get("location")!).searchParams.get("google")).toBe("nosession");
  });

  it("계정 없는 기기의 연결 시작은 nosession", async () => {
    expect(await googleRound(jar(), "link", "sub-x")).toBe("nosession");
  });

  it("가짜 서명·다른 aud 토큰이면 error, 아무것도 연결되지 않는다", async () => {
    const a = await browserWithAccount();
    tokenKey = wrongKey.privateKey;
    try {
      expect(await googleRound(a.j, "link", "sub-forged", a.ip)).toBe("error");
    } finally {
      tokenKey = key.privateKey;
    }
    tokenAud = "someone-else.apps.googleusercontent.com";
    try {
      expect(await googleRound(a.j, "link", "sub-forged", a.ip)).toBe("error");
    } finally {
      tokenAud = CLIENT;
    }
    expect((await status(a.j)).linked).toBe(false);
  });

  it("다른 주소로 열면 고정 주소로 한 번 옮긴다 (요청 Host로 돌아올 주소를 만들지 않는다)", async () => {
    const res = await start.GET(req("/api/auth/google/start?mode=login", jar(), { origin: "https://evil.example" }));
    expect(res.headers.get("location")).toBe("http://localhost/api/auth/google/start?mode=login&hop=1");
    const hop = await start.GET(req("/api/auth/google/start?mode=login&hop=1", jar(), { origin: "https://evil.example" }));
    expect(new URL(hop.headers.get("location")!).searchParams.get("redirect_uri")).toBe("http://localhost/api/auth/google/callback");
  });
});

describe("모의 구글 (로컬 개발 전용)", () => {
  it("동의 → 인가 코드 → 토큰(PKCE) → 공개키까지 진짜 경로 그대로 돈다. 등록되지 않은 돌아올 주소는 거절", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_MOCK", "1");
    try {
      // 서버가 자기 모의 구글에 거는 요청을 라우트로 바로 넘긴다
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "http://localhost/api/dev/google/token")
          return devToken.POST(new NextRequest(url, { method: "POST", body: String(init?.body), headers: { "content-type": "application/x-www-form-urlencoded" } }));
        if (url === "http://localhost/api/dev/google/jwks") return devJwks.GET(new NextRequest(url));
        throw new Error(`예상하지 못한 요청 ${url}`);
      });
      const a = await browserWithAccount();
      const s = await start.GET(req("/api/auth/google/start?mode=link", a.j, { ip: a.ip }));
      absorb(a.j, s);
      const auth = new URL(s.headers.get("location")!);
      expect(auth.origin + auth.pathname).toBe("http://localhost/api/dev/google/authorize");
      // 동의 화면 (HTML)
      const page = await devAuthorize.GET(new NextRequest(auth));
      expect(page.headers.get("content-type")).toContain("text/html");
      // 돌아올 주소를 바꾸면 거절 (열린 리디렉트 없음)
      const evil = new URL(auth);
      evil.searchParams.set("redirect_uri", "https://evil.example/cb");
      expect((await devAuthorize.GET(new NextRequest(evil))).status).toBe(400);
      // 계속
      const ok = new URL(auth);
      ok.searchParams.set("approve", "1");
      ok.searchParams.set("sub", "mock-user-7");
      const back = new URL((await devAuthorize.GET(new NextRequest(ok))).headers.get("location")!);
      expect(back.origin + back.pathname).toBe("http://localhost/api/auth/google/callback");
      const cb = await callback.GET(req(back.pathname + back.search, a.j, { ip: a.ip }));
      expect(new URL(cb.headers.get("location")!).searchParams.get("google")).toBe("linked");
      // 같은 인가 코드는 두 번 못 쓴다
      const replay = await devToken.POST(
        new NextRequest("http://localhost/api/dev/google/token", { method: "POST", body: `grant_type=authorization_code&code=${back.searchParams.get("code")}` }),
      );
      expect(replay.status).toBe(400);
    } finally {
      vi.stubEnv("GOOGLE_MOCK", "");
    }
  });
});

import { hmacSign, INTERNAL_SIG_HEADER, MAINT_OFF, MAINT_READ_HEADER, parseMaint, verifyInternal, verifyMaintRead, type MaintState } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config as proxyConfig, proxy } from "@/proxy";
import { env } from "./env";
import { maintBypass, maintOpenPath, maintPageHtml, readMaint, rememberMaint, retryAfterSec, sessionIdOf, setMaint, skipHash } from "./maintenance";

// 11/26 점검 모드 (웹): 실시간 서버 상태 15초 기억, 미들웨어 503·통과 경로·운영자/관리자 우회

const ON: MaintState = { on: true, msg: "캠핑장 공사 중이에요 <b>", until: null, at: 1 };
const VID = "abcdefghijklmnopqrstu"; // 21자

beforeEach(() => {
  for (const k of ["SESSION_SECRET", "JOIN_SECRET", "ADMIN_KEY", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  rememberMaint(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rememberMaint(null);
});

const fetchOf = (body: unknown, ok = true) => vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

describe("readMaint — 실시간 서버 상태를 15초 기억", () => {
  it("한 번 읽으면 15초 동안 다시 묻지 않는다", async () => {
    const f = fetchOf({ on: true, msg: "점검", until: null, at: 5 });
    expect((await readMaint(1_000, f)).on).toBe(true);
    expect((await readMaint(15_999, f)).on).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    await readMaint(16_001, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("11/26 실시간 서버에 서명한 머리글을 붙여 묻는다 (통과 목록 skip은 이 머리글이 맞을 때만 온다)", async () => {
    let got: string | null = null;
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      got = new Headers(init.headers).get(MAINT_READ_HEADER);
      return Response.json({ on: false, msg: "", until: null, at: 1 });
    }) as unknown as typeof fetch;
    const now = Date.now();
    await readMaint(now, f);
    const sec = Math.floor(now / 1000);
    expect(await verifyMaintRead(env.joinSecret(), got, sec)).toBe(true);
    expect(await verifyMaintRead("other-secret", got, sec)).toBe(false);
    expect(await verifyMaintRead(env.joinSecret(), got, sec + 120)).toBe(false); // 지난 서명
  });

  it("못 읽으면 마지막 값 (처음이면 꺼짐 — 사이트를 막지 않는다)", async () => {
    const down = vi.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    expect(await readMaint(0, down)).toEqual(MAINT_OFF);
    await readMaint(20_000, fetchOf({ on: true, msg: "", until: null, at: 1 }));
    expect((await readMaint(40_000, down)).on).toBe(true);
  });
});

describe("setMaint — 서명해서 실시간 서버에", () => {
  it("운영자 id는 해시로만, 쓴 인스턴스는 바로 새 상태", async () => {
    let sent: { url: string; body: string; sig: string | null } | null = null;
    const f = vi.fn(async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body), sig: new Headers(init.headers).get(INTERNAL_SIG_HEADER) };
      const r = (await verifyInternal(env.joinSecret(), String(init.body), sent.sig))!;
      return Response.json({ state: { ...(r as object), at: 9 }, kicked: 3 });
    }) as unknown as typeof fetch;
    const now = Date.now();
    const out = await setMaint({ on: true, msg: "점검", until: now + 5_000_000 }, ["staffAccountId123"], f, now);
    expect(sent!.url).toMatch(/\/internal\/maint$/);
    expect(sent!.body).not.toContain("staffAccountId123");
    expect(out.kicked).toBe(3);
    expect(out.state.skip).toEqual([await skipHash("staffAccountId123")]);
    expect((await readMaint(now + 2_000, fetchOf({ on: false }))).on).toBe(true); // 기억한 값
  });
});

describe("판정 도우미", () => {
  it("열어 두는 경로", () => {
    for (const p of ["/admin", "/admin/x", "/api/admin/graves", "/api/maintenance", "/api/internal/conn-log", "/_next/static/a.js", "/fonts/Galmuri11.woff2", "/robots.txt", "/og.png"])
      expect(maintOpenPath(p), p).toBe(true);
    for (const p of ["/", "/news", "/news/abc", "/guide", "/api/join", "/api/me", "/privacy", "/administrator"]) expect(maintOpenPath(p), p).toBe(false);
  });

  it("Retry-After: 예상 끝까지 (1분~6시간), 모르면 10분", () => {
    expect(retryAfterSec({ ...ON, until: null }, 0)).toBe(600);
    expect(retryAfterSec({ ...ON, until: 30_000 }, 0)).toBe(60);
    expect(retryAfterSec({ ...ON, until: 3_600_000 }, 0)).toBe(3600);
    expect(retryAfterSec({ ...ON, until: 99 * 3_600_000 }, 0)).toBe(6 * 3600);
  });

  it("점검 화면 HTML: 문구는 이스케이프, 30초마다 다시 불러온다", () => {
    const html = maintPageHtml({ ...ON, until: Date.UTC(2026, 10, 26, 6, 30) });
    expect(html).toContain("서버 점검 중이에요");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain('http-equiv="refresh" content="30"');
    expect(html).toContain("11월 26일 오후 3:30쯤 끝나요");
  });

  it("방문자 쿠키 서명 확인 (세대 있는 모양까지)", async () => {
    const plain = `${VID}.${await hmacSign(env.sessionSecret(), VID)}`;
    const gen = `${VID}.g3.${await hmacSign(env.sessionSecret(), `${VID}.g3`)}`;
    expect(await sessionIdOf(plain)).toBe(VID);
    expect(await sessionIdOf(gen)).toBe(VID);
    expect(await sessionIdOf(`${VID}.xx`)).toBeNull();
    expect(await sessionIdOf(undefined)).toBeNull();
  });

  it("우회: 관리자 쿠키 또는 통과 목록에 든 운영자 계정", async () => {
    const jar = (m: Record<string, string>) => ({ get: (n: string) => (m[n] ? { value: m[n] } : undefined) });
    const exp = Math.floor(Date.now() / 1000) + 600;
    const admin = `${exp}.${await hmacSign(env.adminKey(), `admin:${exp}`)}`;
    const staffCookie = `${VID}.${await hmacSign(env.sessionSecret(), VID)}`;
    const state = parseMaint({ ...ON, skip: [await skipHash(VID)] });
    expect(await maintBypass(jar({ tomb_admin: admin }), ON)).toBe(true);
    expect(await maintBypass(jar({ vid: staffCookie }), state)).toBe(true);
    expect(await maintBypass(jar({ vid: staffCookie }), ON)).toBe(false); // 통과 목록 없음
    expect(await maintBypass(jar({ tomb_admin: "1.bad" }), state)).toBe(false);
    expect(await maintBypass(jar({}), state)).toBe(false);
  });
});

describe("proxy — 점검 중 503", () => {
  const req = (path: string, cookie?: string) => new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });

  it("꺼져 있으면 그대로 통과", async () => {
    rememberMaint(MAINT_OFF);
    const res = await proxy(req("/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  // API(/api/admin 빼고)는 matcher에서 빠져 미들웨어가 돌지 않는다 (아래 「matcher」 시험) → 점검 중에도 게임 API는 열려 있다
  it("켜져 있으면 첫 화면·개발자 노트·안내는 503 HTML + Retry-After", async () => {
    rememberMaint({ ...ON, until: Date.now() + 20 * 60_000 });
    for (const p of ["/", "/news", "/guide/cowork"]) {
      const res = await proxy(req(p));
      expect(res.status, p).toBe(503);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(1100);
      expect(await res.text()).toContain("서버 점검 중이에요");
    }
  });

  it("켜져 있어도 관리자·점검 상태·서버끼리·정적 파일은 연다", async () => {
    rememberMaint(ON);
    for (const p of ["/admin", "/api/admin/maintenance", "/api/maintenance", "/api/internal/conn-log", "/_next/static/x.js", "/favicon.ico"]) {
      const res = await proxy(req(p));
      expect(res.status, p).not.toBe(503);
    }
  });

  it("켜져 있어도 관리자 쿠키·운영자 계정은 통과", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const admin = `tomb_admin=${exp}.${await hmacSign(env.adminKey(), `admin:${exp}`)}`;
    const staff = `vid=${VID}.${await hmacSign(env.sessionSecret(), VID)}`;
    rememberMaint(parseMaint({ ...ON, skip: [await skipHash(VID)] }));
    expect((await proxy(req("/", admin))).status).not.toBe(503);
    expect((await proxy(req("/news", staff))).status).not.toBe(503);
    const other = `vid=zyxwvutsrqponmlkjihgf.${await hmacSign(env.sessionSecret(), "zyxwvutsrqponmlkjihgf")}`;
    expect((await proxy(req("/", other))).status).toBe(503);
  });
});

describe("proxy matcher (11/26 — 미들웨어가 도는 경로)", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config: proxyConfig, url });

  it("페이지·관리자 화면·관리자 API에서만 돈다", () => {
    for (const p of ["/", "/news", "/news/abc", "/guide/cowork", "/privacy", "/admin", "/admin/x", "/api/admin", "/api/admin/maintenance"]) expect(matches(p), p).toBe(true);
  });

  it("게임 API·점검 상태 API·서버끼리 경로·정적 파일에서는 돌지 않는다 (점검 중에도 API는 열려 있다)", () => {
    for (const p of ["/api/join", "/api/me", "/api/session", "/api/maintenance", "/api/internal/conn-log", "/_next/static/a.js", "/_next/image", "/favicon.ico", "/og.png", "/fonts/Galmuri11.woff2", "/robots.txt", "/bgm/a.mp3"])
      expect(matches(p), p).toBe(false);
  });
});

describe("proxy — 관리자 IP 숨김 (허용하지 않은 IP는 일반 404로 rewrite)", () => {
  const req = (path: string, ip: string) => new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
  const rewritten = (res: Response) => res.headers.get("x-middleware-rewrite");

  it("허용 목록 밖 IP는 관리자 화면·관리자 API 모두 /404로, 허용 IP는 통과 + noindex", async () => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", "10.1.2.3");
    rememberMaint(MAINT_OFF);
    for (const p of ["/admin", "/admin/logs", "/api/admin/maintenance"]) {
      const out = await proxy(req(p, "10.9.9.9"));
      expect(rewritten(out), p).toMatch(/\/404$/);
      const ok = await proxy(req(p, "10.1.2.3"));
      expect(rewritten(ok), p).toBeNull();
      expect(ok.headers.get("x-middleware-next"), p).toBe("1");
      expect(ok.headers.get("x-robots-tag"), p).toBe("noindex, nofollow");
    }
    // 관리자처럼 생긴 다른 경로는 숨김 대상이 아니다
    expect(rewritten(await proxy(req("/administrator", "10.9.9.9")))).toBeNull();
  });

  it("점검 중에도 관리자 경로는 IP 확인이 먼저다 (허용 밖이면 503이 아니라 404 rewrite — 있는 줄도 모르게)", async () => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", "10.1.2.3");
    rememberMaint(ON);
    const out = await proxy(req("/admin", "10.9.9.9"));
    expect(out.status).not.toBe(503);
    expect(rewritten(out)).toMatch(/\/404$/);
    expect((await proxy(req("/admin", "10.1.2.3"))).status).not.toBe(503);
  });
});

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isCrossSiteWrite } from "@/lib/http";
import { securityHeaders } from "@/lib/securityHeaders";
import { ipNetHash, ipv6Prefix64 } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import * as session from "./session/route";

// 보안 점검 (메모리 구성): 관리자 경로 전부가 인증 없이는 401 · 다른 사이트에서 온 쓰기 요청 거절 · 보안 머리글 · 대입 한도 키 · 포인트 금액 방어

const API_DIR = fileURLToPath(new URL(".", import.meta.url));
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === "route.ts" ? [p] : [];
  });
}

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});

describe("관리자 경로", () => {
  const files = routeFiles(join(API_DIR, "admin"));
  // 로그인·로그아웃 경로만 키 없이 부를 수 있다 (로그인은 키를 본문으로 확인한다)
  const PUBLIC = new Set(["session/route.ts"]);

  it("app/api/admin 아래 경로를 빠짐없이 찾는다", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("모든 관리자 핸들러는 키·쿠키 없이 부르면 401 (본문을 읽거나 저장소를 건드리기 전에)", async () => {
    let checked = 0;
    let n = 0;
    for (const file of files) {
      const rel = relative(join(API_DIR, "admin"), file);
      if (PUBLIC.has(rel)) continue;
      const mod = (await import(file)) as Record<string, unknown>;
      for (const m of METHODS) {
        const fn = mod[m];
        if (typeof fn !== "function") continue;
        // 실패 한도(IP당 분당 10회)에 걸리지 않게 요청마다 다른 IP
        n++;
        const ip = `10.250.${Math.floor(n / 250)}.${n % 250}`;
        const req = new NextRequest(`http://localhost/api/admin/${rel.replace(/\/?route\.ts$/, "")}`, {
          method: m,
          headers: { "x-forwarded-for": ip, ...(m === "GET" ? {} : { "content-type": "application/json" }) },
          ...(m === "GET" ? {} : { body: "{}" }),
        });
        const res = await (fn as (r: NextRequest, c: unknown) => Promise<Response>)(req, { params: Promise.resolve({ id: "x", entryId: "y" }) });
        expect.soft(res.status, `${m} ${rel}`).toBe(401);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60);
  });

  it("틀린 키·위조한 쿠키도 401", async () => {
    const mod = await import("./admin/accounts/points/route");
    const bad: Record<string, string>[] = [{ "x-admin-key": "dev-admin-x" }, { authorization: "Bearer nope" }, { cookie: "tomb_admin=99999999999.forged" }];
    for (const [i, h] of bad.entries()) {
      const req = new NextRequest("http://localhost/api/admin/accounts/points", {
        method: "POST",
        headers: { "x-forwarded-for": `10.251.0.${i + 1}`, "content-type": "application/json", ...h },
        body: JSON.stringify({ accountId: "a".repeat(21), delta: 1_000_000 }),
      });
      expect((await mod.POST(req)).status).toBe(401);
    }
  });
});

describe("다른 사이트에서 온 쓰기 요청 (CSRF)", () => {
  const req = (method: string, headers: Record<string, string>) => ({ method, headers: new Headers({ host: "myproject.rip", ...headers }) });

  it("Sec-Fetch-Site: same-origin·none만 받는다", () => {
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "none" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("Sec-Fetch-Site가 없으면 Origin과 Host를 비교 (null·이상한 값은 거절), 둘 다 없으면 서버 간 호출로 본다", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://myproject.rip" }))).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "https://sub.myproject.rip" }))).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "null" }))).toBe(true);
    expect(isCrossSiteWrite(req("PATCH", {}))).toBe(false);
  });

  it("GET·HEAD·OPTIONS는 보지 않는다 (구글 로그인 콜백 등 최상위 이동)", () => {
    expect(isCrossSiteWrite(req("GET", { "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isCrossSiteWrite(req("OPTIONS", { origin: "https://evil.example" }))).toBe(false);
  });

  it("라우트에서: 다른 사이트 폼으로 「새로 시작」 POST를 보내면 쿠키를 덮어쓰지 않고 403", async () => {
    const res = await session.POST(
      new NextRequest("http://localhost/api/session", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example", "content-type": "text/plain", "x-forwarded-for": "10.252.0.1" },
        body: JSON.stringify({ fresh: true }),
      }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    const ok = await session.POST(
      new NextRequest("http://localhost/api/session", { method: "POST", headers: { "sec-fetch-site": "same-origin", "x-forwarded-for": "10.252.0.1" } }),
    );
    expect(ok.status).toBe(200);
  });
});

describe("보안 머리글", () => {
  const get = (e: Record<string, string>) => Object.fromEntries(securityHeaders(e as NodeJS.ProcessEnv).map((h) => [h.key, h.value]));

  it("운영: CSP(액자 금지·플러그인 금지·실시간 서버·배경음 허용) + HSTS + nosniff + 액자 금지", () => {
    const h = get({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_REALTIME_URL: "https://rt.example.dev/", NEXT_PUBLIC_BGM_BASE: "https://bgm.example.dev/x" });
    const csp = h["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toMatch(/connect-src [^;]*https:\/\/rt\.example\.dev [^;]*wss:\/\/rt\.example\.dev/);
    expect(csp).toMatch(/media-src [^;]*https:\/\/bgm\.example\.dev/);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("vercel.live");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("미리보기는 Vercel 도구 막대를, 로컬 개발은 eval(HMR)을 허용하고 HSTS를 붙이지 않는다", () => {
    expect(get({ NODE_ENV: "production", VERCEL_ENV: "preview" })["Content-Security-Policy"]).toContain("https://vercel.live");
    const dev = get({ NODE_ENV: "development" });
    expect(dev["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(dev["Content-Security-Policy"]).toContain("ws://localhost:8787");
    expect(dev["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("대입 한도 키 (IPv6는 /64 단위)", () => {
  const r = (ip: string) => new NextRequest("http://localhost/", { headers: { "x-forwarded-for": ip } });

  it("같은 /64의 다른 주소는 같은 키, 다른 /64·IPv4는 따로", () => {
    expect(ipv6Prefix64("2001:db8:1:2::1")).toBe("2001:db8:1:2");
    expect(ipv6Prefix64("2001:0db8:0001:0002:ffff:0:0:9")).toBe("2001:db8:1:2");
    expect(ipv6Prefix64("not-an-ip")).toBeNull();
    expect(ipNetHash(r("2001:db8:1:2::1"))).toBe(ipNetHash(r("2001:db8:1:2:aaaa:bbbb:cccc:dddd")));
    expect(ipNetHash(r("2001:db8:1:3::1"))).not.toBe(ipNetHash(r("2001:db8:1:2::1")));
    expect(ipNetHash(r("10.0.0.1"))).not.toBe(ipNetHash(r("10.0.0.2")));
  });
});

describe("포인트 금액 방어", () => {
  it("음수·소수 차감/환불은 저장소가 쓰기 전에 거절한다", async () => {
    const accounts = getAccounts();
    const id = "sec-amount-test-000001";
    await accounts.enter(id, { name: "금액검사", color: "#9fc5a8", body: "hood" }, Date.now());
    await expect(accounts.spend(id, -100, "test", Date.now())).rejects.toThrow();
    await expect(accounts.spend(id, 1.5, "test", Date.now())).rejects.toThrow();
    await expect(accounts.refund(id, Number.NaN, "test", Date.now())).rejects.toThrow();
    await expect(accounts.refund(id, -1, "test", Date.now())).rejects.toThrow();
  });
});

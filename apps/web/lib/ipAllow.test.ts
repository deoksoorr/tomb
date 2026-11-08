import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../proxy";
import { clientIp } from "./http";
import { ipMatches, isAdminIp, parseIp } from "./ipAllow";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseIp", () => {
  it("IPv4·IPv6·축약·IPv4-mapped·대괄호·존 id", () => {
    expect(parseIp("58.233.55.38")).toEqual({ v: 4, n: BigInt(0x3ae93726) });
    expect(parseIp("::1")).toEqual({ v: 6, n: BigInt(1) });
    expect(parseIp("2001:db8::1")?.v).toBe(6);
    expect(parseIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toEqual(parseIp("2001:db8::1"));
    expect(parseIp("::ffff:127.0.0.1")).toEqual(parseIp("127.0.0.1"));
    expect(parseIp("::ffff:7f00:1")).toEqual(parseIp("127.0.0.1"));
    expect(parseIp("[::1]")).toEqual(parseIp("::1"));
    expect(parseIp("fe80::1%en0")).toEqual(parseIp("fe80::1"));
  });

  it("잘못된 주소는 null", () => {
    for (const bad of ["", "unknown", "256.1.1.1", "1.2.3", "1.2.3.4.5", "1::2::3", "12345::", "1:2:3:4:5:6:7:8:9", "g::1"])
      expect(parseIp(bad), bad).toBeNull();
  });
});

describe("ipMatches", () => {
  it("정확한 주소와 CIDR (IPv4/IPv6)", () => {
    const rules = ["58.233.55.38", "10.0.0.0/8", "192.168.1.128/25", "2001:db8::/32"];
    expect(ipMatches("58.233.55.38", rules)).toBe(true);
    expect(ipMatches("58.233.55.39", rules)).toBe(false);
    expect(ipMatches("10.255.1.2", rules)).toBe(true);
    expect(ipMatches("11.0.0.1", rules)).toBe(false);
    expect(ipMatches("192.168.1.200", rules)).toBe(true);
    expect(ipMatches("192.168.1.100", rules)).toBe(false);
    expect(ipMatches("2001:db8:abcd::5", rules)).toBe(true);
    expect(ipMatches("2001:db9::5", rules)).toBe(false);
    expect(ipMatches("::ffff:10.1.2.3", rules)).toBe(true);
  });

  it("IPv4 규칙과 IPv6 주소는 섞이지 않고, 잘못된 규칙은 무시한다", () => {
    expect(ipMatches("::1", ["127.0.0.1"])).toBe(false);
    expect(ipMatches("1.2.3.4", ["0.0.0.0/0"])).toBe(true);
    for (const bad of ["1.2.3.4/", "1.2.3.4/33", "1.2.3.4/abc", "1.2.3.4/8/8", "nope"])
      expect(ipMatches("1.2.3.4", [bad]), bad).toBe(false);
  });
});

describe("isAdminIp (정책)", () => {
  it("목록이 있으면 그 목록만", () => {
    expect(isAdminIp("58.233.55.38", "58.233.55.38", true)).toBe(true);
    expect(isAdminIp("127.0.0.1", "58.233.55.38", false)).toBe(false);
    expect(isAdminIp("10.0.0.7", " 58.233.55.38 , 10.0.0.0/24 ", true)).toBe(true);
  });

  it("목록이 비면 운영은 전부 차단, 로컬은 루프백만", () => {
    expect(isAdminIp("58.233.55.38", undefined, true)).toBe(false);
    expect(isAdminIp("127.0.0.1", "", true)).toBe(false);
    expect(isAdminIp("127.0.0.1", undefined, false)).toBe(true);
    expect(isAdminIp("::1", undefined, false)).toBe(true);
    expect(isAdminIp("::ffff:127.0.0.1", undefined, false)).toBe(true);
    expect(isAdminIp("192.168.0.2", undefined, false)).toBe(false);
    expect(isAdminIp(null, "0.0.0.0/0", false)).toBe(false);
  });
});

describe("proxy (관리자 경로 IP 제한)", () => {
  const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers });
  const hidden = (res: Response) => res.headers.get("x-middleware-rewrite")?.endsWith("/404") ?? false;

  it("x-forwarded-for는 첫 값만 본다 (Vercel이 덮어쓰는 클라이언트 IP)", () => {
    expect(clientIp(req("/", { "x-forwarded-for": "58.233.55.38, 10.0.0.1, 1.1.1.1" }))).toBe("58.233.55.38");
    expect(clientIp(req("/", { "x-real-ip": "58.233.55.38" }))).toBe("58.233.55.38");
  });

  it("허용 IP는 통과(+noindex), 그 밖은 일반 404로 숨긴다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ALLOWED_IPS", "58.233.55.38");
    const ok = proxy(req("/admin", { "x-forwarded-for": "58.233.55.38, 10.0.0.1" }));
    expect(hidden(ok)).toBe(false);
    expect(ok.headers.get("x-middleware-next")).toBe("1");
    expect(ok.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    for (const [path, ip] of [
      ["/admin", "10.0.0.1, 58.233.55.38"],
      ["/api/admin/graves", "1.2.3.4"],
      ["/api/admin/session", ""],
    ])
      expect(hidden(proxy(req(path, ip ? { "x-forwarded-for": ip } : {}))), `${path} ${ip}`).toBe(true);
  });

  it("운영에서 목록이 비어 있으면 누구도 못 들어온다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_ALLOWED_IPS", "");
    expect(hidden(proxy(req("/admin", { "x-forwarded-for": "127.0.0.1" })))).toBe(true);
  });
});

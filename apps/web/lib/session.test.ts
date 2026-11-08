import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./env";
import {
  getVisitorId,
  isOwner,
  newOwnerToken,
  newVisitorId,
  safeEqual,
  sha256Hex,
  signSession,
  verifySession,
} from "./session";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("세션 쿠키", () => {
  it("서명한 값은 검증을 통과하고 visitorId를 돌려준다", async () => {
    const id = newVisitorId();
    const cookie = await signSession(id);
    expect(cookie.startsWith(`${id}.`)).toBe(true);
    expect(await verifySession(cookie)).toBe(id);
    const req = new NextRequest("http://localhost/", { headers: { cookie: `vid=${cookie}` } });
    expect(await getVisitorId(req)).toBe(id);
  });

  it("서명·id 위조, 다른 시크릿, 형식 오류는 거절한다", async () => {
    const id = newVisitorId();
    const cookie = await signSession(id);
    const sig = cookie.slice(id.length + 1);
    const other = newVisitorId();

    expect(await verifySession(`${other}.${sig}`)).toBeNull();
    expect(await verifySession(`${id}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(await verifySession(id)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("a.b.c")).toBeNull();

    vi.stubEnv("SESSION_SECRET", "another-secret");
    expect(await verifySession(cookie)).toBeNull();
  });

  it("쿠키가 없으면 null", async () => {
    expect(await getVisitorId(new NextRequest("http://localhost/"))).toBeNull();
  });
});

describe("묘비 소유 토큰", () => {
  it("원문 토큰만 sha256 해시와 맞는다", () => {
    const { token, hash } = newOwnerToken();
    expect(token).toHaveLength(32);
    expect(hash).toBe(sha256Hex(token));
    expect(isOwner(token, hash)).toBe(true);
    expect(isOwner(newOwnerToken().token, hash)).toBe(false);
    expect(isOwner(hash, hash)).toBe(false);
    expect(isOwner(null, hash)).toBe(false);
    // 목업 묘비(소유자 없음)는 누구도 소유자가 아니다
    expect(isOwner(token, "")).toBe(false);
    expect(isOwner("", "")).toBe(false);
  });

  it("safeEqual은 길이가 달라도 안전하게 비교한다", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("env", () => {
  it("개발에서는 기본 시크릿, 운영에서 빠지면 사용 시점에 명확히 실패한다", () => {
    vi.stubEnv("JOIN_SECRET", "");
    expect(env.joinSecret()).toBe("dev-join-secret-change-me");
    expect(env.adminKey()).toBe("dev-admin");

    vi.stubEnv("NODE_ENV", "production");
    expect(() => env.joinSecret()).toThrow(/JOIN_SECRET/);
    vi.stubEnv("JOIN_SECRET", "prod-secret");
    expect(env.joinSecret()).toBe("prod-secret");
  });

  it("실시간 서버 주소: 개발은 localhost, 운영에서 공개 주소가 빠지면 실패 (내부 주소만으로는 wsUrl을 만들 수 없다)", () => {
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "");
    vi.stubEnv("REALTIME_INTERNAL_URL", "");
    expect(env.realtimeWsUrl()).toBe("ws://localhost:8787");

    vi.stubEnv("NODE_ENV", "production");
    expect(() => env.realtimeWsUrl()).toThrow(/NEXT_PUBLIC_REALTIME_URL/);
    expect(() => env.realtimeHttpUrl()).toThrow(/NEXT_PUBLIC_REALTIME_URL/);
    vi.stubEnv("REALTIME_INTERNAL_URL", "http://rt.internal/");
    expect(env.realtimeHttpUrl()).toBe("http://rt.internal");
    expect(() => env.realtimeWsUrl()).toThrow(/NEXT_PUBLIC_REALTIME_URL/);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "https://rt.example.com/");
    expect(env.realtimeWsUrl()).toBe("wss://rt.example.com");
  });

  it("Redis는 KV_* 와 UPSTASH_* 이름을 모두 받는다", () => {
    for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])
      vi.stubEnv(k, "");
    expect(env.redis()).toBeNull();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://u.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t1");
    expect(env.redis()).toEqual({ url: "https://u.upstash.io", token: "t1" });
    vi.stubEnv("KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "t2");
    expect(env.redis()).toEqual({ url: "https://kv.upstash.io", token: "t2" });
  });
});

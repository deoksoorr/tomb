import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countRedisRequest, formatRedisUsage, redisClient, redisUsageSnapshot, resetRedisUsage, routeLabel, withRedisRoute } from "./redisUsage";

describe("redisUsage 계측", () => {
  beforeEach(() => resetRedisUsage(1_000));

  it("라우트 경로의 id 조각을 :id로 모은다", () => {
    expect(routeLabel("GET", "/api/me")).toBe("GET /api/me");
    expect(routeLabel("POST", "/api/graves/Ab3xYz9q/flower")).toBe("POST /api/graves/:id/flower");
    expect(routeLabel("GET", "/api/friends/%ED%95%9C")).toBe("GET /api/friends/:id");
    expect(routeLabel("POST", "/api/forage/urgent/deliver")).toBe("POST /api/forage/urgent/deliver");
  });

  it("단일 명령·파이프라인·multi-exec·EVAL을 과금 규칙대로 센다", () => {
    withRedisRoute("POST /api/me/presence", () => {
      countRedisRequest("accounts", undefined, ["get", "k"], 2_000);
      countRedisRequest("accounts", ["pipeline"], [["get", "a"], ["hget", "b", "f"]], 2_000);
      countRedisRequest("analytics", ["multi-exec"], [["hincrby", "k", "a", 1], ["expire", "k", 9]], 2_000);
      countRedisRequest("accounts", undefined, ["eval", "redis.call('GET', KEYS[1]) redis.call('SET', KEYS[1], 1)", 1, "k"], 2_000);
    });
    countRedisRequest("staff", undefined, ["get", "staff"], 2_000);
    const s = redisUsageSnapshot();
    // get 1 + 파이프라인 2 + multi 2(+2) + eval 1(+2)
    expect(s.sent).toBe(1 + 2 + 2 + 1 + 1);
    expect(s.billed).toBe(1 + 2 + 4 + 3 + 1);
    expect(s.routes[0]).toEqual({ route: "POST /api/me/presence", sent: 6, billed: 10 });
    expect(s.routes.find((r) => r.route === "-")?.billed).toBe(1);
    const evalRow = s.rows.find((r) => r.key.includes(":eval#"));
    expect(evalRow?.billed).toBe(3);
    // 같은 스크립트를 EVALSHA로 보내도 내부 호출 수를 기억한다
    const sha = evalRow!.key.split("eval#")[1];
    expect(sha).toHaveLength(7);
    expect(formatRedisUsage(s, 2_000)).toContain("[redis-usage]");
  });

  it("5분이 지나면 요약을 비운다", () => {
    countRedisRequest("x", undefined, ["get", "k"], 2_000);
    expect(redisUsageSnapshot().sent).toBe(1);
    countRedisRequest("x", undefined, ["get", "k"], 1_000 + 5 * 60_000);
    expect(redisUsageSnapshot().sent).toBe(0);
  });
});

describe("redisClient (실제 Upstash 클라이언트에 붙은 계측)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("자동 파이프라인으로 묶여도 명령 하나하나를 라우트 이름으로 센다 (네트워크 없이 fetch를 흉내)", async () => {
    resetRedisUsage(Date.now());
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as unknown;
        bodies.push(body);
        const n = Array.isArray(body) && Array.isArray(body[0]) ? body.length : 0;
        const payload = n ? Array.from({ length: n }, () => ({ result: null })) : { result: null };
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );
    const redis = redisClient({ url: "https://example.invalid", token: "t" }, "test");
    await withRedisRoute("GET /api/x", () => Promise.all([redis.get("a"), redis.hget("b", "f")]));
    await withRedisRoute("GET /api/x", () => redis.pipeline().get("c").expire("c", 1).exec());
    const s = redisUsageSnapshot();
    expect(s.sent).toBe(4);
    expect(s.routes).toEqual([{ route: "GET /api/x", sent: 4, billed: 4 }]);
    expect(bodies.length).toBeGreaterThan(0);
  });
});

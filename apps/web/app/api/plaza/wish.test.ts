import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { ApiError } from "@/lib/types";
import { isWishAmount, pickFortune, rollBonus, WISH_DAILY, type WishResponse } from "@/lib/wish";
import * as session from "../session/route";
import * as wish from "./wish/route";

// 50번 소원 분수 (메모리 구성): 동전 차감 → 운세 → 가끔 보너스(적립 한도), 하루 3번 (실패한 시도는 세지 않는다)

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"])
    vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => vi.restoreAllMocks());

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, visitor: Visitor | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (visitor) Object.assign(headers, { cookie: visitor.cookie, "x-forwarded-for": visitor.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", null));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.50.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: ((await res.json()) as { visitorId: string }).visitorId,
  };
}
const throwCoin = (v: Visitor, amount: unknown) => wish.POST(call("/api/plaza/wish", v, { amount }));

describe("소원 분수 규칙", () => {
  it("운세는 다섯 단계 중 하나, 문장이 비어 있지 않다", () => {
    for (const r of [0, 0.05, 0.2, 0.5, 0.8, 0.95, 0.999999]) {
      const f = pickFortune(r, r);
      expect(["대길", "길", "중길", "소길", "평"]).toContain(f.title);
      expect(f.text.length).toBeGreaterThan(5);
    }
  });

  it("보너스는 가끔·조금: 75%는 0, 기댓값은 던진 것의 절반 남짓 (+1P 이하)", () => {
    expect(rollBonus(3, 0.5, 0.5)).toBe(0);
    expect(rollBonus(3, 0.1, 0)).toBe(4);
    expect(rollBonus(3, 0.1, 0.99)).toBe(8);
    expect(rollBonus(5, 0.01, 0)).toBe(15);
    for (const a of [1, 3, 5]) {
      let sum = 0;
      const N = 1000;
      for (let i = 0; i < N; i++) sum += rollBonus(a, (i + 0.5) / N, ((i * 7) % N) / N);
      expect(sum / N).toBeLessThan(a * 0.3 + 1);
    }
    expect([0, 1, 5, 6, 2.5, "3"].map(isWishAmount)).toEqual([false, true, true, false, false, false]);
  });
});

describe("POST /api/plaza/wish", () => {
  it("동전만큼 차감하고 운세를 준다, 보너스는 적립(하루 한도 안), 하루 3번까지", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 100 });
    const before = (await accounts.get(v.visitorId, kstDay(), Date.now())).points;
    let points = before;
    for (let i = 0; i < WISH_DAILY; i++) {
      const res = await throwCoin(v, 3);
      expect(res.status).toBe(200);
      const body = (await res.json()) as WishResponse;
      expect(body.spent).toBe(3);
      expect(body.fortune.text.length).toBeGreaterThan(0);
      expect(body.bonus).toBeGreaterThanOrEqual(0);
      expect(body.me.points).toBe(points - 3 + body.bonus);
      points = body.me.points;
    }
    const over = await throwCoin(v, 1);
    expect(over.status).toBe(429);
    expect(((await over.json()) as ApiError).error.message).toContain("세 번");
    expect((await accounts.get(v.visitorId, kstDay(), Date.now())).points).toBe(points);
  });

  it("포인트가 모자라면 409이고 횟수를 쓰지 않는다, 1~5P 밖은 400", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    const now = Date.now();
    const p = (await accounts.get(v.visitorId, kstDay(), now)).points;
    if (p > 0) await accounts.spend(v.visitorId, p, "test", now);
    const poor = await throwCoin(v, 5);
    expect(poor.status).toBe(409);
    expect((await throwCoin(v, 0)).status).toBe(400);
    expect((await throwCoin(v, 6)).status).toBe(400);
    expect((await throwCoin(v, 2.5)).status).toBe(400);
    // 포인트를 채우면 여전히 3번 던질 수 있다
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 50 });
    for (let i = 0; i < WISH_DAILY; i++) expect((await throwCoin(v, 1)).status).toBe(200);
  });

  it("세션 없이는 401", async () => {
    const res = await wish.POST(call("/api/plaza/wish", null, { amount: 1 }));
    expect(res.status).toBe(401);
  });
});

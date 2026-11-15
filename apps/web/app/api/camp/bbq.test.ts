import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BBQ_DAILY, BBQ_MENU, verifyGrant } from "@tomb/protocol";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { env } from "@/lib/env";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import type { ApiError } from "@/lib/types";
import * as session from "../session/route";
import * as bbq from "./bbq/route";

// 11/15 캠핑장 야외 바베큐 (메모리 구성): 포인트 차감 → 한 접시 증서(실시간 서버가 검증), 하루 BBQ_DAILY접시, 캠핑장이 닫힌 운영 서버엔 없는 경로

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "CAMP_ENABLED"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CAMP_ENABLED", "");
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, visitor: Visitor | null, method = "POST", body?: unknown) {
  const headers: Record<string, string> = {};
  if (visitor) Object.assign(headers, { cookie: visitor.cookie, "x-forwarded-for": visitor.ip });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function newVisitor(): Promise<Visitor> {
  const res = await session.POST(call("/api/session", null));
  return {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.61.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: ((await res.json()) as { visitorId: string }).visitorId,
  };
}
const eat = (v: Visitor, item: unknown) => bbq.POST(call("/api/camp/bbq", v, "POST", { item }));

describe("POST /api/camp/bbq", () => {
  it("메뉴 값만큼 쓰고, 서명된 한 접시 증서(끝나는 시각 = 지금 + 메뉴 길이)를 준다. 하루 BBQ_DAILY접시까지", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 200 });
    let points = (await accounts.get(v.visitorId, kstDay(), Date.now())).points;
    for (let i = 0; i < BBQ_DAILY; i++) {
      const m = BBQ_MENU[i % BBQ_MENU.length];
      const t0 = Date.now();
      const res = await eat(v, m.id);
      expect(res.status).toBe(200);
      const body = (await res.json()) as BbqResponse;
      expect(body.me.points).toBe(points - m.price);
      points = body.me.points;
      expect(body.eaten).toBe(i + 1);
      expect(body.until - t0).toBeGreaterThanOrEqual(m.ms - 50);
      const g = await verifyGrant(env.joinSecret(), body.grant);
      expect(g).toMatchObject({ kind: "bbq", visitorId: v.visitorId, item: m.id, until: body.until });
    }
    const full = await eat(v, "marsh");
    expect(full.status).toBe(429);
    expect(((await full.json()) as ApiError).error.message).toContain("배불러요");
    expect((await accounts.get(v.visitorId, kstDay(), Date.now())).points).toBe(points);
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st).toEqual({ eaten: BBQ_DAILY, daily: BBQ_DAILY });
  });

  it("포인트가 모자라면 409이고 횟수를 쓰지 않는다, 모르는 메뉴는 400", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    const now = Date.now();
    const p = (await accounts.get(v.visitorId, kstDay(), now)).points;
    if (p > 0) await accounts.spend(v.visitorId, p, "test", now);
    expect((await eat(v, "pork")).status).toBe(409);
    expect((await eat(v, "steak")).status).toBe(400);
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st.eaten).toBe(0);
  });

  it("캠핑장이 닫힌 운영 서버에서는 없는 경로 (CAMP_ENABLED=1이면 열린다)", async () => {
    const v = await newVisitor();
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await eat(v, "pork")).status).toBe(404);
    vi.stubEnv("CAMP_ENABLED", "1");
    expect((await eat(v, "pork")).status).not.toBe(404);
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BBQ_MENU, DRUNK_MAX, DRUNK_STEP_MS, verifyGrant } from "@tomb/protocol";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { env } from "@/lib/env";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import * as session from "../session/route";
import * as bbq from "./bbq/route";

// 11/15 캠핑장 야외 바베큐 (메모리 구성): 포인트 차감 → 한 접시 증서(실시간 서버가 검증), 하루 한도 없음, 캠핑장이 닫힌 운영 서버엔 없는 경로

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
  it("메뉴 값만큼 쓰고, 서명된 한 접시 증서(끝나는 시각 = 지금 + 메뉴 길이)를 준다. 하루 한도 없이 계속 먹을 수 있다", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 400 });
    let points = (await accounts.get(v.visitorId, kstDay(), Date.now())).points;
    const foods = BBQ_MENU.filter((m) => m.cat === "food");
    // 예전 하루 한도(6접시)를 넘겨 메뉴를 두 바퀴 먹는다
    for (let i = 0; i < foods.length * 2; i++) {
      const m = foods[i % foods.length];
      const t0 = Date.now();
      const res = await eat(v, m.id);
      expect(res.status).toBe(200);
      const body = (await res.json()) as BbqResponse;
      expect(body.me.points).toBe(points - m.price);
      points = body.me.points;
      expect(body.until - t0).toBeGreaterThanOrEqual(m.ms - 50);
      const g = await verifyGrant(env.joinSecret(), body.grant);
      expect(g).toMatchObject({ kind: "bbq", visitorId: v.visitorId, item: m.id, until: body.until });
    }
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st).toEqual({ drunk: 0 });
  });

  it("포인트가 모자라면 409이고 취기도 오르지 않는다, 모르는 메뉴는 400", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    const now = Date.now();
    const p = (await accounts.get(v.visitorId, kstDay(), now)).points;
    if (p > 0) await accounts.spend(v.visitorId, p, "test", now);
    expect((await eat(v, "pork")).status).toBe(409);
    expect((await eat(v, "beer")).status).toBe(409);
    expect((await eat(v, "steak")).status).toBe(400);
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st.drunk).toBe(0);
  });

  it("마실 거리: 한도 없이 한 잔마다 취기 +1 (최대 단계에서 멈추고 깨는 시계만 다시), 증서에 단계·마신 시각, 커피는 걸음 효과", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 400 });
    const drink = async (item: string) => (await eat(v, item)).json() as Promise<BbqResponse>;
    const b1 = await drink("beer");
    expect(b1).toMatchObject({ item: "beer", lv: 1 });
    expect(b1.until).toBe(b1.at! + DRUNK_STEP_MS);
    expect(await verifyGrant(env.joinSecret(), b1.grant)).toMatchObject({ kind: "bbq", item: "beer", lv: 1, at: b1.at });
    const b2 = await drink("soju");
    expect(b2.lv).toBe(2);
    expect(b2.until).toBe(b2.at! + 2 * DRUNK_STEP_MS);
    const c = await drink("coffee");
    expect(c.lv).toBeUndefined();
    expect(c.until - Date.now()).toBeGreaterThan(9 * 60_000);
    // 예전 하루 한도(6잔)를 넘겨 계속 마신다: 최대 단계에서 멈춘다
    let last = b2;
    for (let i = 0; i < 8; i++) {
      const res = await eat(v, "makgeolli");
      expect(res.status).toBe(200);
      last = (await res.json()) as BbqResponse;
    }
    expect(last.lv).toBe(DRUNK_MAX);
    expect(last.until).toBe(last.at! + DRUNK_MAX * DRUNK_STEP_MS);
    expect((await eat(v, "marsh")).status).toBe(200);
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st).toEqual({ drunk: DRUNK_MAX });
  });

  it("컨디숑: 취기가 없으면 포인트를 안 쓰고 안내만, 있으면 한 단계 내린다 (깨는 시계는 지금부터)", async () => {
    const v = await newVisitor();
    const accounts = getAccounts();
    await accounts.earn(v.visitorId, "hunt", kstDay(), { amount: 200 });
    const p0 = (await accounts.get(v.visitorId, kstDay(), Date.now())).points;
    const none = await eat(v, "hangover");
    expect(none.status).toBe(409);
    expect((await accounts.get(v.visitorId, kstDay(), Date.now())).points).toBe(p0);
    await eat(v, "beer");
    await eat(v, "soju");
    const r = (await (await eat(v, "hangover")).json()) as BbqResponse;
    expect(r).toMatchObject({ item: "hangover", lv: 1 });
    expect(r.until).toBe(r.at! + DRUNK_STEP_MS);
    expect(await verifyGrant(env.joinSecret(), r.grant)).toMatchObject({ kind: "bbq", item: "hangover", lv: 1 });
    const r2 = (await (await eat(v, "hangover")).json()) as BbqResponse;
    expect(r2).toMatchObject({ lv: 0 });
    expect(r2.until).toBe(r2.at);
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st).toEqual({ drunk: 0 });
    expect((await eat(v, "hangover")).status).toBe(409);
  });

  it("파는 곳을 보내면 맞는 곳에서만 판다 (먹거리는 그릴, 마실 거리는 자판기)", async () => {
    const v = await newVisitor();
    await getAccounts().earn(v.visitorId, "hunt", kstDay(), { amount: 200 });
    const buy = (item: string, stand: string) => bbq.POST(call("/api/camp/bbq", v, "POST", { item, stand }));
    expect((await buy("beer", "grill")).status).toBe(400);
    expect((await buy("pork", "vending")).status).toBe(400);
    expect((await buy("beer", "vending")).status).toBe(200);
    expect((await buy("pork", "grill")).status).toBe(200);
  });

  it("11/16 바닷가 매점: 술·음료·오징어구이는 매점에서만, 맥주·소주·컨디숑은 자판기와 매점 둘 다", async () => {
    const v = await newVisitor();
    await getAccounts().earn(v.visitorId, "hunt", kstDay(), { amount: 300 });
    const buy = (item: string, stand: string) => bbq.POST(call("/api/camp/bbq", v, "POST", { item, stand }));
    expect((await buy("highball", "kiosk")).status).toBe(200);
    expect((await buy("sunset", "vending")).status).toBe(400);
    expect((await buy("squid", "grill")).status).toBe(400);
    expect((await buy("squid", "kiosk")).status).toBe(200);
    expect((await buy("beer", "kiosk")).status).toBe(200);
    expect((await buy("pork", "kiosk")).status).toBe(400);
    // 하이볼·맥주 두 잔 → 취기 2
    const st = (await (await bbq.GET(call("/api/camp/bbq", v, "GET"))).json()) as BbqStatusResponse;
    expect(st.drunk).toBe(2);
  });

  it("캠핑장이 닫힌 운영 서버에서는 없는 경로 (CAMP_ENABLED=1이면 열린다)", async () => {
    const v = await newVisitor();
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await eat(v, "pork")).status).toBe(404);
    vi.stubEnv("CAMP_ENABLED", "1");
    expect((await eat(v, "pork")).status).not.toBe(404);
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultCaravanDesign } from "@tomb/protocol";
import { getAccounts } from "@/lib/store";
import type { MyHouseResponse, VillageResponse } from "@/lib/housing/types";
import type { ApiError } from "@/lib/types";
import * as attend from "./me/attend/route";
import * as buy from "./housing/me/buy/route";
import * as mine from "./housing/me/route";
import * as style from "./housing/me/style/route";
import * as villageRoute from "./housing/village/route";
import * as session from "./session/route";

// 11/26 카라반 디자인 API (메모리 구성): 분양 때 고르기(/me/buy · /me zone camp) · 바꾸기(PUT /me/style zone camp) · 검증 · 오두막 겉모습은 그대로

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Visitor = { cookie: string; ip: string; visitorId: string };
let ipSeq = 0;
function call(path: string, opts: { method?: string; visitor?: Visitor; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.visitor) Object.assign(headers, { cookie: opts.visitor.cookie, "x-forwarded-for": opts.visitor.ip });
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new NextRequest(`http://localhost${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
}
const bodyOf = async <T,>(res: Response | Promise<Response>) => (await (await res).json()) as T;
const errorOf = async (res: Response | Promise<Response>) => ((await (await res).json()) as ApiError).error;
async function newVisitor(name: string, points: number): Promise<Visitor> {
  const res = await session.POST(call("/api/session", { method: "POST" }));
  const v = {
    cookie: res.headers.get("set-cookie")!.split(";")[0],
    ip: `10.27.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
  await attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
  (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = points;
  return v;
}
const pts = (v: Visitor) => (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points;

describe("카라반 디자인 API", () => {
  it("고른 디자인으로 분양 (값은 자리 등급) → 마을 목록 → 무료로 바꾸기", async () => {
    const v = await newVisitor("디자이너", 100_000);
    const ch = 8;
    const design = { model: "teardrop", color: 3, awning: 1 };
    // 폭포 앞(1번)에 티어드롭을 골라도 폭포 앞 값 13,500
    const res = await buy.POST(call("/api/housing/me/buy", { visitor: v, body: { ch, lot: 1, zone: "camp", kind: "caravan", design } }));
    expect(res.status).toBe(201);
    expect((await bodyOf<MyHouseResponse>(res)).house?.camp).toEqual({ kind: "caravan", yard: 1, design });
    expect(100_000 - pts(v)).toBe(13_500);

    const vil = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp&t=1`)));
    expect(vil.houses.find((h) => h.lot === 1)?.camp?.design).toEqual(design);

    const next = { model: "bus", color: 2, awning: 3 };
    const r = await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: v, body: { zone: "camp", design: next } }));
    expect(r.status).toBe(200);
    expect((await bodyOf<MyHouseResponse>(r)).house?.camp?.design).toEqual(next);
    expect(100_000 - pts(v)).toBe(13_500);
    const me = await bodyOf<MyHouseResponse>(mine.GET(call("/api/housing/me?zone=camp", { visitor: v })));
    expect(me.house?.camp?.design).toEqual(next);

    // 범위 밖 · 모르는 모델은 400, 디자인은 그대로
    for (const bad of [{ model: "bus", color: 4, awning: 0 }, { model: "van", color: 0, awning: 0 }, { model: "bus", color: 0 }]) {
      const e = await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: v, body: { zone: "camp", design: bad } }));
      expect(e.status).toBe(400);
      expect((await errorOf(e)).code).toBe("INVALID_INPUT");
    }
    expect((await bodyOf<MyHouseResponse>(mine.GET(call("/api/housing/me?zone=camp", { visitor: v })))).house?.camp?.design).toEqual(next);
  });

  it("POST /api/housing/me zone camp도 디자인을 받고, 안 주면 그 자리 기본 모습 · 잘못된 디자인은 돈을 쓰기 전에 400", async () => {
    const v = await newVisitor("기본", 100_000);
    const bad = await mine.POST(call("/api/housing/me", { visitor: v, body: { ch: 9, lot: 9, zone: "camp", name: "", intro: "", design: { model: "bus", color: 0, awning: 7 } } }));
    expect(bad.status).toBe(400);
    expect(pts(v)).toBe(100_000);
    const ok = await mine.POST(call("/api/housing/me", { visitor: v, body: { ch: 9, lot: 9, zone: "camp", name: "숲 카라반", intro: "" } }));
    expect(ok.status).toBe(201);
    expect((await bodyOf<MyHouseResponse>(ok)).house?.camp?.design).toEqual(defaultCaravanDesign(9));
  });

  it("캠핑장 집이 없으면 409 · 펜션은 409 NOT_CARAVAN · 오두막 겉모습 바꾸기는 그대로", async () => {
    const v = await newVisitor("집없음", 100_000);
    const none = await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: v, body: { zone: "camp", design: { model: "bus", color: 0, awning: 0 } } }));
    expect(none.status).toBe(409);
    expect((await errorOf(none)).code).toBe("NO_HOUSE");
    // 오두막이 없으면 예전처럼 409
    const sea = await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: v, body: { style: "blue" } }));
    expect(sea.status).toBe(409);

    const p = await newVisitor("펜션", 100_000);
    expect((await buy.POST(call("/api/housing/me/buy", { visitor: p, body: { ch: 10, lot: 13, zone: "camp" } }))).status).toBe(201);
    const e = await style.PUT(call("/api/housing/me/style", { method: "PUT", visitor: p, body: { zone: "camp", design: { model: "bus", color: 0, awning: 0 } } }));
    expect(e.status).toBe(409);
    expect((await errorOf(e)).code).toBe("NOT_CARAVAN");
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getAccounts } from "@/lib/store";
import type { MyHouseResponse, VillageResponse } from "@/lib/housing/types";
import type { ApiError } from "@/lib/types";
import * as attend from "./me/attend/route";
import * as buy from "./housing/me/buy/route";
import * as layout from "./housing/me/layout/route";
import * as mine from "./housing/me/route";
import * as upgrade from "./housing/me/upgrade/route";
import * as yard from "./housing/me/yard/route";
import * as villageRoute from "./housing/village/route";
import * as sell from "./housing/me/sell/route";
import * as session from "./session/route";

// 11/26 캠핑장 집 API (메모리 구성): 분양(/me/buy 화면 계약 · /me zone camp) · 값표 · 넓히기 거절 · 앞마당(/me/yard — 방도 커진다) · 배치 · 마을 목록

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
    ip: `10.26.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
    visitorId: (await bodyOf<{ visitorId: string }>(res)).visitorId,
  };
  await attend.POST(call("/api/me/attend", { visitor: v, body: { name } }));
  (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points = points;
  return v;
}
const pts = (v: Visitor) => (getAccounts() as unknown as { acct(id: string): { points: number } }).acct(v.visitorId).points;

describe("캠핑장 집 API", () => {
  it("분양 → 값표 → 넓히기 거절 → 앞마당 2·3단계(방 14×10 → 18×12) → 배치 저장 → 마을 목록 (펜션, 무주택)", async () => {
    const v = await newVisitor("캠핑러", 100_000);
    const ch = 6;
    // 화면 계약: POST /api/housing/me/buy { ch, lot, zone: "camp" } (종류는 터로)
    const res = await buy.POST(call("/api/housing/me/buy", { visitor: v, body: { ch, lot: 14, zone: "camp" } }));
    expect(res.status).toBe(201);
    const bought = await bodyOf<MyHouseResponse>(res);
    expect(bought.house).toMatchObject({ zone: "camp", lot: 14, ch, name: "달빛채", ownerName: "캠핑러", camp: { kind: "pension", yard: 1 }, tier: "small" });
    expect(100_000 - pts(v)).toBe(9_000);

    const me = await bodyOf<MyHouseResponse>(mine.GET(call("/api/housing/me?zone=camp", { visitor: v })));
    expect(me.house?.id).toBe(bought.house?.id);
    expect(me.prices).toMatchObject({ villa: { village: true, sea: true, camp: false }, upgrade: null, yard: { to: 2, price: 13_500 } });
    expect(me.prices?.camp).toHaveLength(16);
    // 마을 집 창(zone 없음)은 내 마을 집이 없고, 값표는 별장 값
    const village = await bodyOf<MyHouseResponse>(mine.GET(call("/api/housing/me", { visitor: v })));
    expect(village.house).toBeNull();
    expect(village.prices?.village).toEqual({ small: 8_000, wide: 20_000, manor: 40_000 });

    // 11/26 캠핑장 넓히기는 없다 — 409 BAD_TIER (돈은 안 나간다)
    expect(await errorOf(upgrade.POST(call("/api/housing/me/upgrade", { visitor: v, body: { ch, to: "wide", zone: "camp" } })))).toMatchObject({ code: "BAD_TIER" });
    expect(100_000 - pts(v)).toBe(9_000);
    await yard.POST(call("/api/housing/me/yard", { visitor: v, body: { ch, zone: "camp" } }));
    expect(100_000 - pts(v)).toBe(9_000 + 13_500);
    const y = await bodyOf<MyHouseResponse>(yard.POST(call("/api/housing/me/yard", { visitor: v, body: { ch, zone: "camp" } })));
    expect(y.house?.camp?.yard).toBe(3);
    expect(100_000 - pts(v)).toBe(45_000);
    expect(y.prices?.yard).toBeNull();

    // 기본 가구를 커진 방(18×12) 오른쪽 아래로 옮겨 저장 (tier = small 그대로)
    const items = y.house!.layout.items.map((it) => (it.i === "fx_pn_bed" ? { ...it, x: 16, y: 10 } : it));
    const saved = await bodyOf<MyHouseResponse>(layout.PUT(call("/api/housing/me/layout", { method: "PUT", visitor: v, body: { ch, zone: "camp", tier: "small", layout: { ...y.house!.layout, items } } })));
    expect(saved.house?.layout.items.find((i) => i.i === "fx_pn_bed")).toMatchObject({ x: 16, y: 10 });
    // 기본 가구를 빼면 400 FIXTURE
    const bad = layout.PUT(call("/api/housing/me/layout", { method: "PUT", visitor: v, body: { ch, zone: "camp", tier: "small", layout: { ...y.house!.layout, items: items.slice(1) } } }));
    expect(await errorOf(bad)).toMatchObject({ code: "FIXTURE" });
    // 기본 가구는 팔 수 없다
    expect(await errorOf(sell.POST(call("/api/housing/me/sell", { visitor: v, body: { itemId: "fx_pn_tv", zone: "camp" } })))).toMatchObject({ code: "FIXTURE" });

    const list = await bodyOf<VillageResponse>(villageRoute.GET(call(`/api/housing/village?ch=${ch}&zone=camp&t=1`, { visitor: v })));
    expect(list).toMatchObject({ ch, zone: "camp", lots: 16 });
    expect(list.houses.find((h) => h.lot === 14)).toMatchObject({ name: "달빛채", ownerName: "캠핑러", camp: { kind: "pension", yard: 3 }, tier: "small" });
    expect(list.houses.find((h) => h.lot === 14)?.villa).toBeUndefined();
  });

  it("POST /api/housing/me zone camp도 같은 분양 · 한 사람 한 채 · 터 번호·채널 검사 · 앞마당은 캠핑장 집만", async () => {
    const v = await newVisitor("두번째", 100_000);
    const w = await newVisitor("세번째", 100_000);
    const ch = 7;
    const r = await mine.POST(call("/api/housing/me", { visitor: v, body: { ch, lot: 4, zone: "camp", name: "폭포집", intro: "" } }));
    expect(r.status).toBe(201);
    expect((await bodyOf<MyHouseResponse>(r)).house).toMatchObject({ name: "폭포집", camp: { kind: "caravan", yard: 1 } });
    expect(100_000 - pts(v)).toBe(13_500);
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: v, body: { ch, lot: 5, zone: "camp" } })))).toMatchObject({ code: "ALREADY_OWNED" });
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: w, body: { ch, lot: 4, zone: "camp" } })))).toMatchObject({ code: "LOT_TAKEN" });
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: w, body: { ch, lot: 17, zone: "camp" } })))).toMatchObject({ code: "INVALID_INPUT" });
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: w, body: { ch: 99, lot: 3, zone: "camp" } })))).toMatchObject({ code: "INVALID_INPUT" });
    // 분양 창을 연 NPC의 종류(kind)가 터 종류와 다르면 두 길 모두 400 (소슬댁 창에서 카라반 터를 살 수 없다)
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: w, body: { ch, lot: 3, zone: "camp", kind: "pension" } })))).toMatchObject({ code: "WRONG_KIND" });
    expect(await errorOf(mine.POST(call("/api/housing/me", { visitor: w, body: { ch, lot: 13, zone: "camp", name: "x", intro: "", kind: "rural" } })))).toMatchObject({ code: "WRONG_KIND" });
    expect(await errorOf(buy.POST(call("/api/housing/me/buy", { visitor: w, body: { ch, lot: 3, zone: "camp", kind: "tent" } })))).toMatchObject({ code: "INVALID_INPUT" });
    expect(pts(w)).toBe(100_000);
    // 캠핑장 넓히기는 409, 앞마당은 된다
    expect(await errorOf(upgrade.POST(call("/api/housing/me/upgrade", { visitor: v, body: { ch, to: "wide", zone: "camp" } })))).toMatchObject({ code: "BAD_TIER" });
    expect((await yard.POST(call("/api/housing/me/yard", { visitor: v, body: { ch } }))).status).toBe(200);
    expect(100_000 - pts(v)).toBe(13_500 + 20_250);
    // 캠핑장 집이 없으면 앞마당 409 NO_HOUSE, zone이 camp가 아니면 400
    expect(await errorOf(yard.POST(call("/api/housing/me/yard", { visitor: w, body: { ch } })))).toMatchObject({ code: "NO_HOUSE" });
    expect(await errorOf(yard.POST(call("/api/housing/me/yard", { visitor: v, body: { ch, zone: "sea" } })))).toMatchObject({ code: "INVALID_INPUT" });
    // 가구 사기는 그대로 (itemId가 있으면 가구)
    const f = await bodyOf<MyHouseResponse>(buy.POST(call("/api/housing/me/buy", { visitor: v, body: { itemId: "pot", zone: "camp" } })));
    expect(f.inventory.pot).toBe(1);
  });
});

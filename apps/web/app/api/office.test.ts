import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prevWeek } from "@/lib/gameDay";
import { FURNITURE, furnitureById, isExclusiveFurniture } from "@/lib/housing/catalog";
import { buyPlot, getHouseStore } from "@/lib/housing/service";
import { OFFICE_FURN_IDS } from "@/lib/office/catalog";
import type { OfficeBuyResult, OfficeStatus } from "@/lib/office/service";
import { getAccounts } from "@/lib/store";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { primeChampCache } from "@/lib/store/champ";
import * as office from "./office/route";
import * as session from "./session/route";
import * as furnBuy from "./housing/me/buy/route";

// 11/20 총무팀 문대리 서버 흐름: 판매 목록 밖 거절 · 사무실 가구는 가구점 일반 구매가 거절하고 문대리만 판다 · 집이 있어야 · 할인은 가구점과 같게

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
});
afterEach(() => {
  vi.useRealTimers();
});

type Visitor = { cookie: string; ip: string; id: string };
let seq = 0;
const req = (path: string, v: Visitor, body?: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function newVisitor(points = 30_000): Promise<Visitor> {
  const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST" }));
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const v = { cookie, ip: `10.95.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const status = async (v: Visitor) => (await (await office.GET(req("/api/office", v))).json()) as OfficeStatus;
const buy = (v: Visitor, id: string) => office.POST(req("/api/office", v, { id }));

describe("11/20 총무팀 문대리 — 서버", () => {
  it("판매 목록: 사무실 가구 15종 (카탈로그 순서, 값은 원래 값 그대로), 집이 없으면 house = false", async () => {
    const v = await newVisitor();
    const st = await status(v);
    expect(st.furn.map((f) => f.id)).toEqual([...OFFICE_FURN_IDS]);
    expect(st.furn).toHaveLength(15);
    for (const f of st.furn) expect([f.base, f.cost, f.have]).toEqual([furnitureById(f.id)!.price, furnitureById(f.id)!.price, 0]);
    expect(st.house).toBe(false);
    expect(st.rate).toBe(0);
  });

  it("잘못된 id는 400, 판매 목록 밖은 400 NOT_SOLD (가구점·보따리상·보리 가구라도)", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "비품 집", "", "a");
    expect((await buy(v, "BAD ID")).status).toBe(400);
    for (const id of ["sofa", "monitor_desk", "winter_stove", "nap_corgi", "nothing"]) {
      const r = await buy(v, id);
      expect(r.status, id).toBe(400);
      expect(await code(r), id).toBe("NOT_SOLD");
    }
  });

  it("집이 없으면 409 NO_HOUSE (차감 없음), 집이 있으면 가방 +1", async () => {
    const v = await newVisitor();
    const b0 = await pts(v.id);
    const no = await buy(v, "partition");
    expect(no.status).toBe(409);
    expect(await code(no)).toBe("NO_HOUSE");
    expect(await pts(v.id)).toBe(b0);
    await buyPlot(getHouseStore(), v.id, "칸막이 집", "", "a");
    const before = await pts(v.id);
    const r = await buy(v, "partition");
    expect(r.status).toBe(200);
    const body = (await r.json()) as OfficeBuyResult;
    expect(before - (await pts(v.id))).toBe(520);
    expect(body.house).toBe(true);
    expect(body.got).toBe("파티션");
    expect(body.furn.find((f) => f.id === "partition")?.have).toBe(1);
    expect(body.me.points).toBe(await pts(v.id));
  });

  it("사무실 가구는 가구점 일반 구매가 거절하고(차감 없음) 문대리만 판다", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "가구점 집", "", "a");
    const before = await pts(v.id);
    for (const itemId of ["partition", "leaf_shade", "boss_desk", "banker_lamp"]) {
      const r = await furnBuy.POST(req("/api/housing/me/buy", v, { itemId }));
      expect(r.status, itemId).toBe(400);
    }
    expect(await pts(v.id)).toBe(before);
    expect((await buy(v, "leaf_shade")).status).toBe(200);
  });

  it("값: 포인트왕 20% 할인이 가구점과 같게 붙는다", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "1위 집", "", "a");
    const now = Date.now();
    primeChampCache({ week: prevWeek(kstWeek(now)), winners: [{ board: "points", accountId: v.id, name: "1위", value: 1 }], settledAt: now }, now);
    const st = await status(v);
    expect(st.rate).toBe(0.2);
    const row = st.furn.find((f) => f.id === "massage_chair")!;
    expect(row.cost).toBe(Math.floor(row.base * 0.8));
    const b = await pts(v.id);
    expect((await buy(v, "massage_chair")).status).toBe(200);
    expect(b - (await pts(v.id))).toBe(row.cost);
  });

  it("포인트가 모자라면 409 NOT_ENOUGH_POINTS (차감 없음)", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "빈털터리 집", "", "a");
    await getAccounts().adjustPoints(v.id, 100 - (await pts(v.id)));
    const r = await buy(v, "boss_desk");
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("NOT_ENOUGH_POINTS");
    expect(await pts(v.id)).toBe(100);
  });

  it("사무실 가구 15종은 전용 상품 (유령선 할인 후보 등 「아무 가구나」에서 빠진다)", () => {
    const office = FURNITURE.filter((f) => f.officeShop);
    expect(office.map((f) => f.id)).toEqual([...OFFICE_FURN_IDS]);
    for (const f of office) expect(isExclusiveFurniture(f), f.id).toBe(true);
  });
});

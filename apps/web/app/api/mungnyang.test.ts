import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isPermanentUntil, mungnyangPetPrice, petPrice } from "@tomb/protocol";
import { prevWeek } from "@/lib/gameDay";
import { furnitureById } from "@/lib/housing/catalog";
import { buyPlot, getHouseStore } from "@/lib/housing/service";
import { MUNGNYANG_FURN_IDS, MUNGNYANG_PET_IDS } from "@/lib/mungnyang/catalog";
import type { MungnyangBuyResult, MungnyangStatus } from "@/lib/mungnyang/service";
import { getAccounts } from "@/lib/store";
import { kstDay, kstWeek } from "@/lib/store/accounts";
import { primeChampCache } from "@/lib/store/champ";
import * as mungnyang from "./mungnyang/route";
import * as session from "./session/route";
import * as zooBuy from "./zoo/buy/route";
import * as furnBuy from "./housing/me/buy/route";

// 11/19 분양사 보리 서버 흐름: 판매 목록 밖 거절 · 펫 영구 분양(동물원과 같은 규칙, 바로 데리고 다님) · 가구는 집이 있어야 · 포인트왕 할인은 가구점과 같게

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
  const v = { cookie, ip: `10.94.${++seq}.1`, id: ((await res.json()) as { visitorId: string }).visitorId };
  await getAccounts().earn(v.id, "flower", kstDay());
  await getAccounts().adjustPoints(v.id, points);
  return v;
}
const pts = async (id: string) => (await getAccounts().get(id, kstDay(), Date.now())).points;
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;
const status = async (v: Visitor) => (await (await mungnyang.GET(req("/api/mungnyang", v))).json()) as MungnyangStatus;
const buy = (v: Visitor, kind: string, id: string) => mungnyang.POST(req("/api/mungnyang", v, { kind, id }));

describe("11/19 분양사 보리 — 서버", () => {
  it("판매 목록: 품종 펫 12 + 예전 사육사 펫 셋, 품종 집 가구 12 + 예전 가구점 가구 셋 (값은 원래 값 그대로)", async () => {
    const v = await newVisitor();
    const st = await status(v);
    expect(st.pets.map((p) => p.id)).toEqual([...MUNGNYANG_PET_IDS]);
    expect(st.pets).toHaveLength(15);
    for (const id of ["pet_dog", "pet_cat", "pet_hound"]) expect(st.pets.find((p) => p.id === id)?.price).toBe(petPrice(id));
    expect(st.pets.find((p) => p.id === "pet_cheese")?.price).toBe(mungnyangPetPrice("pet_cheese"));
    expect(st.pets.find((p) => p.id === "pet_hound")?.ride).toBe(true);
    expect(st.furn.map((f) => f.id)).toEqual([...MUNGNYANG_FURN_IDS]);
    expect(st.furn).toHaveLength(15);
    for (const f of st.furn) expect([f.base, f.cost, f.have]).toEqual([furnitureById(f.id)!.price, furnitureById(f.id)!.price, 0]);
    expect(st.house).toBe(false);
    expect(st.rate).toBe(0);
  });

  it("잘못된 칸·id는 400, 판매 목록 밖은 400 NOT_SOLD (사육사 펫·가구점 가구라도)", async () => {
    const v = await newVisitor();
    expect((await buy(v, "zz", "pet_cat")).status).toBe(400);
    expect((await buy(v, "pet", "PET!")).status).toBe(400);
    const before = await pts(v.id);
    for (const [kind, id] of [
      ["pet", "pet_deer"],
      ["pet", "hat_cat"],
      ["pet", "nap_cheese"],
      ["furn", "sofa"],
      ["furn", "pet_cheese"],
      ["furn", "winter_stove"],
    ]) {
      const r = await buy(v, kind, id);
      expect(r.status, id).toBe(400);
      expect(await code(r), id).toBe("NOT_SOLD");
    }
    expect(await pts(v.id)).toBe(before);
  });

  it("품종 펫: 영구로 사면 바로 데리고 다니고(착용 증서), 다시 사면 409 ALREADY_OWNED", async () => {
    const v = await newVisitor();
    const before = await pts(v.id);
    const r = await buy(v, "pet", "pet_shiba");
    expect(r.status).toBe(200);
    const body = (await r.json()) as MungnyangBuyResult;
    expect(before - (await pts(v.id))).toBe(mungnyangPetPrice("pet_shiba"));
    expect(body.me.equipped.find((e) => e.itemId === "pet_shiba" && isPermanentUntil(e.until))).toBeTruthy();
    expect(body.lookGrant).toBeTruthy();
    expect(body.got).toBe("월요병 시바");
    expect(body.kind).toBe("pet");
    const again = await buy(v, "pet", "pet_shiba");
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("ALREADY_OWNED");
    // 두 번째 펫을 사면 시바는 집으로, 새 펫을 데리고 다닌다 (한 번에 한 마리)
    const two = (await (await buy(v, "pet", "pet_pom")).json()) as MungnyangBuyResult;
    expect(two.me.equipped.some((e) => e.itemId === "pet_pom")).toBe(true);
    expect(two.me.equipped.some((e) => e.itemId === "pet_shiba")).toBe(false);
    expect(two.me.stash.some((e) => e.itemId === "pet_shiba")).toBe(true);
  });

  it("11/20 겹침 없음: 강아지·고양이 셋은 사육사가 거절하고(400) 보리만 예전 값에 판다", async () => {
    const v = await newVisitor();
    const before = await pts(v.id);
    for (const petId of ["pet_dog", "pet_cat", "pet_hound"]) expect((await zooBuy.POST(req("/api/zoo/buy", v, { petId }))).status, petId).toBe(400);
    expect(await pts(v.id)).toBe(before);
    expect((await buy(v, "pet", "pet_cat")).status).toBe(200);
    expect(before - (await pts(v.id))).toBe(petPrice("pet_cat"));
    // 사육사가 파는 다른 펫은 그대로 사육사에서
    expect((await zooBuy.POST(req("/api/zoo/buy", v, { petId: "pet_fox" }))).status).toBe(200);
  });

  it("예전에 산 기간제 강아지를 입고 있으면 보리에게 영구로 바꿔요 (하루권은 그대로 쓴다)", async () => {
    const v = await newVisitor();
    const now = Date.now();
    await getAccounts().buy(v.id, "pet_dog", 0);
    await getAccounts().equip(v.id, "pet_dog", "pet", now + 86_400_000, now);
    const r = (await (await buy(v, "pet", "pet_dog")).json()) as MungnyangBuyResult;
    expect(r.me.equipped.find((e) => e.itemId === "pet_dog")?.until).toSatisfy(isPermanentUntil);
  });

  it("11/20 겹침 없음: 강아지·고양이 가구 셋은 가구점 일반 구매가 거절하고 보리만 판다", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "가구점 집", "", "a");
    const before = await pts(v.id);
    for (const itemId of ["sleepy_dog", "cat_cushion", "ghost_cat", "nap_cheese"]) {
      const r = await furnBuy.POST(req("/api/housing/me/buy", v, { itemId }));
      expect(r.status, itemId).toBe(400);
    }
    expect(await pts(v.id)).toBe(before);
    expect((await furnBuy.POST(req("/api/housing/me/buy", v, { itemId: "sofa" }))).status).toBe(200);
    expect((await buy(v, "furn", "ghost_cat")).status).toBe(200);
  });

  it("포인트가 모자라면 409 NOT_ENOUGH_POINTS (차감 없음)", async () => {
    const v = await newVisitor(0);
    const before = await pts(v.id);
    const r = await buy(v, "pet", "pet_hound");
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("NOT_ENOUGH_POINTS");
    expect(await pts(v.id)).toBe(before);
  });

  it("집 가구: 집이 없으면 409 NO_HOUSE, 집이 있으면 가방 +1 (품종 가구·가구점 가구 둘 다)", async () => {
    const v = await newVisitor();
    const no = await buy(v, "furn", "nap_corgi");
    expect(no.status).toBe(409);
    expect(await code(no)).toBe("NO_HOUSE");
    await buyPlot(getHouseStore(), v.id, "멍냥 집", "", "a");
    const before = await pts(v.id);
    const r = await buy(v, "furn", "nap_corgi");
    expect(r.status).toBe(200);
    const body = (await r.json()) as MungnyangBuyResult;
    expect(before - (await pts(v.id))).toBe(furnitureById("nap_corgi")!.price);
    expect(body.house).toBe(true);
    expect(body.furn.find((f) => f.id === "nap_corgi")?.have).toBe(1);
    expect(body.got).toBe("퇴근 후 웰시코기");
    expect((await buy(v, "furn", "sleepy_dog")).status).toBe(200);
    expect((await status(v)).furn.find((f) => f.id === "sleepy_dog")?.have).toBe(1);
  });

  it("집 가구 값: 포인트왕 20% 할인이 가구점과 같게 붙고, 펫은 사육사처럼 정가", async () => {
    const v = await newVisitor();
    await buyPlot(getHouseStore(), v.id, "1위 집", "", "a");
    const now = Date.now();
    primeChampCache({ week: prevWeek(kstWeek(now)), winners: [{ board: "points", accountId: v.id, name: "1위", value: 1 }], settledAt: now }, now);
    const st = await status(v);
    expect(st.rate).toBe(0.2);
    const row = st.furn.find((f) => f.id === "nap_calico")!;
    expect(row.cost).toBe(Math.floor(row.base * 0.8));
    const b = await pts(v.id);
    expect((await buy(v, "furn", "nap_calico")).status).toBe(200);
    expect(b - (await pts(v.id))).toBe(row.cost);
    const b2 = await pts(v.id);
    expect((await buy(v, "pet", "pet_corgi")).status).toBe(200);
    expect(b2 - (await pts(v.id))).toBe(mungnyangPetPrice("pet_corgi"));
  });
});

import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import * as exteriorRoute from "@/app/api/housing/me/exterior/route";
import * as layoutRoute from "@/app/api/housing/me/layout/route";
import * as meRoute from "@/app/api/housing/me/route";
import * as upgradeRoute from "@/app/api/housing/me/upgrade/route";
import * as villageRoute from "@/app/api/housing/village/route";
import * as session from "@/app/api/session/route";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { DEFAULT_FLOOR, DEFAULT_WALL, housingChannelOf, HOUSING_CHANNELS, lotLabel, PLOT_TIERS } from "./catalog";
import { buyPlot, getHouseStore, houseIdFor, houseRank, saveExterior, saveLayout, upgradePlot, village } from "./service";
import { MemoryHouseStore } from "./store";
import { HK, RedisHouseStore } from "./store-redis";
import type { MyHouseResponse, VillageResponse } from "./types";

// 채널별 주거 구역: 채널마다 1..400번지가 따로 있다 (1..WORLD_LOTS = 메인 맵, 그 위 = 2단지).
// 한 계정은 전체에서 집 1채. 채널이 생기기 전의 집은 모두 1채널의 같은 번지로 옮긴다 (옛 색인 houses:lots → houses:lots:1).

const conn = env.redis();
const PLOT = PLOT_TIERS[0].price;
const WIDE = PLOT_TIERS[1].price;
const accounts = getAccounts();

async function account(points: number, id = nanoid()): Promise<string> {
  await accounts.earn(id, "flower", kstDay());
  const now = (await accounts.get(id, kstDay(), Date.now())).points;
  await accounts.adjustPoints(id, points - now);
  return id;
}
const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

describe("채널 값", () => {
  it("저장된 채널이 없거나 이상하면 1채널 (채널이 생기기 전 집)", () => {
    expect(housingChannelOf(undefined)).toBe(1);
    expect(housingChannelOf(null)).toBe(1);
    expect(housingChannelOf("")).toBe(1);
    expect(housingChannelOf("0")).toBe(1);
    expect(housingChannelOf(String(HOUSING_CHANNELS + 1))).toBe(1);
    expect(housingChannelOf("3")).toBe(3);
    expect(lotLabel(2, 7)).toBe("2채널 7번지");
  });
});

describe("HouseStore (memory): 채널마다 필지가 따로", () => {
  const mk = (s: MemoryHouseStore, id: string, ch: number | undefined, lot: number | null) =>
    s.create({ id, owner: `o_${id}`, name: `집${id}`, intro: "", ownerName: "주인", tier: "small", ch, lot, now: 1 });

  it("같은 번지라도 채널이 다르면 서로 다른 집, village(ch)는 그 채널 집만, ch 없이 만들면 1채널", async () => {
    const s = new MemoryHouseStore();
    expect(await mk(s, "a", 1, 3)).toEqual({ lot: 3 });
    expect(await mk(s, "b", 2, 3)).toEqual({ lot: 3 });
    expect(await mk(s, "c", 1, 3)).toBe("lot_taken");
    expect(await mk(s, "d", undefined, null)).toEqual({ lot: 1 });
    expect((await s.get("d"))!.ch).toBe(1);
    expect((await s.village(1)).map((h) => [h.id, h.lot])).toEqual([
      ["d", 1],
      ["a", 3],
    ]);
    expect((await s.village(2)).map((h) => [h.id, h.ch, h.lot])).toEqual([["b", 2, 3]]);
    expect(await s.village(5)).toEqual([]);
    // 자동 배정은 그 채널의 가장 앞 빈 번지
    expect(await mk(s, "e", 2, null)).toEqual({ lot: 1 });
    // 지우면 그 채널의 그 번지만 빈다
    await s.remove("a");
    expect(await mk(s, "f", 1, 3)).toEqual({ lot: 3 });
    expect((await s.village(2)).map((h) => h.id)).toEqual(["e", "b"]);
  });

  it("채널 필드가 없는 예전 기록(HMR로 옮겨 온 메모리 등)도 1채널로 읽는다", async () => {
    const s = new MemoryHouseStore();
    await mk(s, "old", 1, 4);
    const raw = (s as unknown as { houses: Map<string, { rec: { ch?: number } }> }).houses.get("old")!;
    delete raw.rec.ch;
    expect((await s.get("old"))!.ch).toBe(1);
    expect((await s.village(1)).map((h) => h.id)).toEqual(["old"]);
    expect(await mk(s, "new", 1, 4)).toBe("lot_taken");
  });
});

// ── 서비스·라우트 (로컬 메모리 구성) ──

describe.skipIf(!!conn)("채널별 분양 (서비스·라우트)", () => {
  const store = getHouseStore();

  it("1채널에서 분양 → 2채널의 같은 번지는 비어 있고, 다른 계정이 분양할 수 있다 → 1채널은 원래 집 그대로", async () => {
    const free = (await village(store, 1)).lots + 1; // 아직 아무도 쓰지 않은 번지
    const a = await account(PLOT);
    const b = await account(PLOT);
    const ra = await buyPlot(store, a, "1채널 집", "", "가", free, 1);
    expect(ra.house).toMatchObject({ ch: 1, lot: free });
    expect((await village(store, 2)).houses.some((h) => h.lot === free)).toBe(false);
    const rb = await buyPlot(store, b, "2채널 집", "", "나", free, 2);
    expect(rb.house).toMatchObject({ ch: 2, lot: free });
    const v1 = await village(store, 1);
    const v2 = await village(store, 2);
    expect(v1.ch).toBe(1);
    expect(v2.ch).toBe(2);
    expect(v1.houses.find((h) => h.lot === free)).toMatchObject({ id: ra.house!.id, name: "1채널 집", ch: 1 });
    expect(v2.houses.find((h) => h.lot === free)).toMatchObject({ id: rb.house!.id, name: "2채널 집", ch: 2 });
    // 같은 채널의 같은 번지는 여전히 한 집만
    const c = await account(PLOT);
    await expect(buyPlot(store, c, "또", "", "다", free, 2)).rejects.toMatchObject({ code: "LOT_TAKEN" });
    expect(await points(c)).toBe(PLOT);
  });

  it("한 계정은 전체에서 1채: 다른 채널에서도 다시 분양받을 수 없고, 안내에 내 집 채널·번지가 나온다", async () => {
    const a = await account(PLOT * 2);
    const r = await buyPlot(store, a, "하나뿐인 집", "", "가", null, 4);
    expect(r.house?.ch).toBe(4);
    const err = await buyPlot(store, a, "두 번째", "", "가", null, 5).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "ALREADY_OWNED" });
    expect((err as Error).message).toContain(lotLabel(4, r.house!.lot));
    expect(await points(a)).toBe(PLOT);
    await expect(buyPlot(store, a, "x", "", "가", null, 0)).rejects.toMatchObject({ status: 400 });
    await expect(village(store, HOUSING_CHANNELS + 1)).rejects.toMatchObject({ status: 400 });
  });

  it("외관·배치·넓히기는 내 집 채널에서만 (다른 채널이면 WRONG_CHANNEL, 포인트 그대로)", async () => {
    const a = await account(PLOT + WIDE);
    const h = (await buyPlot(store, a, "3채널 집", "", "가", null, 3)).house!;
    await expect(saveExterior(store, a, {}, 2)).rejects.toMatchObject({ status: 409, code: "WRONG_CHANNEL" });
    await expect(saveLayout(store, a, "small", { items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, 1)).rejects.toMatchObject({
      code: "WRONG_CHANNEL",
    });
    const before = await points(a);
    await expect(upgradePlot(store, a, "wide", 9)).rejects.toMatchObject({ code: "WRONG_CHANNEL" });
    expect(await points(a)).toBe(before);
    expect((await saveExterior(store, a, {}, 3)).house?.id).toBe(h.id);
    expect((await saveLayout(store, a, "small", { items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, 3)).house?.id).toBe(h.id);
    expect((await upgradePlot(store, a, "wide", 3)).house?.tier).toBe("wide");
  });

  it("꾸밈 랭킹은 'N채널 M번지 · 주인'으로 보여 준다", async () => {
    const s = new MemoryHouseStore();
    await s.create({ id: houseIdFor("r1"), owner: "r1", name: "랭킹집", intro: "", ownerName: "주인장", tier: "small", ch: 7, lot: 3, now: 1 });
    const r = await houseRank(s, "all", null, 10);
    expect(r.rows[0].sub).toBe("7채널 3번지 · 주인장");
  });

  // 라우트: 채널을 받아 그 채널만 다룬다
  let ipSeq = 0;
  async function visitor() {
    const ip = `10.66.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": ip } }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const { visitorId } = (await res.json()) as { visitorId: string };
    return { cookie, ip, visitorId };
  }
  const call = (path: string, v: { cookie: string; ip: string }, method: string, body?: unknown) =>
    new NextRequest(`http://localhost${path}`, {
      method,
      headers: { cookie: v.cookie, "x-forwarded-for": v.ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const noParams = { params: Promise.resolve({}) };
  const getVillage = async (q: string) => villageRoute.GET(new NextRequest(`http://localhost/api/housing/village${q}`), noParams);

  it("라우트: 분양은 ch가 꼭 있어야 하고, 마을은 ?ch=로 그 채널만, 외관·배치·넓히기는 다른 채널이면 409", async () => {
    const v = await visitor();
    await account(PLOT + WIDE, v.visitorId);
    expect((await meRoute.POST(call("/api/housing/me", v, "POST", { name: "라우트집", intro: "" }), noParams)).status).toBe(400);
    expect((await meRoute.POST(call("/api/housing/me", v, "POST", { name: "라우트집", intro: "", ch: 11 }), noParams)).status).toBe(400);
    const res = await meRoute.POST(call("/api/housing/me", v, "POST", { name: "라우트집", intro: "", ch: 6, lot: 2 }), noParams);
    expect(res.status).toBe(201);
    const h = ((await res.json()) as MyHouseResponse).house!;
    expect(h).toMatchObject({ ch: 6, lot: 2 });

    const v6 = (await (await getVillage("?ch=6")).json()) as VillageResponse;
    expect(v6.ch).toBe(6);
    expect(v6.houses.find((x) => x.id === h.id)).toMatchObject({ ch: 6, lot: 2 });
    const v7 = (await (await getVillage("?ch=7")).json()) as VillageResponse;
    expect(v7.houses.some((x) => x.id === h.id)).toBe(false);
    expect(((await (await getVillage("")).json()) as VillageResponse).ch).toBe(1); // 옛 화면(ch 없음)은 1채널
    for (const q of ["?ch=0", "?ch=11", "?ch=abc", "?ch=1.5"]) expect((await getVillage(q)).status, q).toBe(400);

    const ext = (ch: number | undefined) => exteriorRoute.PUT(call("/api/housing/me/exterior", v, "PUT", { ch, exterior: {} }), noParams);
    expect((await ext(undefined)).status).toBe(400);
    const wrong = await ext(5);
    expect(wrong.status).toBe(409);
    expect(((await wrong.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "WRONG_CHANNEL",
      message: expect.stringContaining("6채널 2번지"),
    });
    expect((await ext(6)).status).toBe(200);
    const layout = (ch: number) =>
      layoutRoute.PUT(call("/api/housing/me/layout", v, "PUT", { ch, tier: "small", layout: { items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL } }), noParams);
    expect((await layout(1)).status).toBe(409);
    expect((await layout(6)).status).toBe(200);
    expect((await upgradeRoute.POST(call("/api/housing/me/upgrade", v, "POST", { ch: 2, to: "wide" }), noParams)).status).toBe(409);
    expect((await upgradeRoute.POST(call("/api/housing/me/upgrade", v, "POST", { ch: 6, to: "wide" }), noParams)).status).toBe(200);
  });
});

// ── 옛 번지 색인 이전 계약 (실제 Redis에서만: 일회용 DB) ──

describe.skipIf(!conn)("옛 번지 색인 → 1채널 이전 (실제 Redis)", () => {
  const raw = conn ? new Redis({ ...conn, automaticDeserialization: false }) : null!;
  const store = conn ? new RedisHouseStore(conn) : null!;
  const hash = async (key: string) => {
    const flat = ((await raw.hgetall(key)) as unknown as string[] | null) ?? [];
    const m = new Map<string, string>();
    for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
    return m;
  };
  /** 채널이 생기기 전 형식: meta에 ch가 없고 번지는 옛 색인(houses:lots)에만 있다 */
  async function legacyHouse(lot: number): Promise<string> {
    const id = nanoid(12);
    await raw.hset(HK.meta(id), {
      owner: `o_${id}`,
      name: `옛집${lot}`,
      intro: "",
      ownerName: "옛주인",
      tier: "small",
      lot: String(lot),
      createdAt: "1",
      updatedAt: "1",
      likes: "0",
      placedScore: "0",
      items: "0",
    });
    await raw.zadd(HK.all, { score: 1, member: id });
    await raw.hset(HK.legacyLots, { [String(lot)]: id });
    return id;
  }

  it("옛 집은 1채널의 같은 번지로 옮겨지고, 여러 번·동시에 돌아도 결과가 같다 (집 기록은 지우지 않는다)", async () => {
    const base = 300 + Math.floor(Math.random() * 90); // 다른 테스트와 겹치지 않는 먼 번지
    const ids = [await legacyHouse(base), await legacyHouse(base + 1), await legacyHouse(base + 2)];
    expect((await store.get(ids[0]))!.ch).toBe(1); // ch가 없으면 1채널로 읽는다
    // 1채널 마을 읽기·분양·이전 호출이 동시에 돌아도 같은 결과
    const [v1, v2] = await Promise.all([village(store, 1), village(store, 1), store.migrateLegacyLots(), store.migrateLegacyLots()]);
    for (const v of [v1, v2] as VillageResponse[])
      for (const [i, id] of ids.entries()) expect(v.houses.find((h) => h.id === id)).toMatchObject({ ch: 1, lot: base + i });
    const lots1 = await hash(HK.lots(1));
    for (const [i, id] of ids.entries()) expect(lots1.get(String(base + i))).toBe(id);
    const legacy = await hash(HK.legacyLots);
    for (const id of ids) expect([...legacy.values()]).not.toContain(id);
    // 다시 돌려도 같다
    expect(await store.migrateLegacyLots()).toMatchObject({ moved: 0 });
    expect(await hash(HK.lots(1))).toEqual(lots1);
    // 다른 채널에는 나오지 않는다
    expect((await village(store, 2)).houses.some((h) => ids.includes(h.id))).toBe(false);
    // 그 번지는 1채널에서만 찬 것이다
    const id2 = nanoid(12);
    expect(await store.create({ id: id2, owner: "x", name: "1채널 충돌", intro: "", ownerName: "", tier: "small", ch: 1, lot: base, now: 1 })).toBe("lot_taken");
    expect(await store.create({ id: id2, owner: "x", name: "2채널", intro: "", ownerName: "", tier: "small", ch: 2, lot: base, now: 1 })).toEqual({ lot: base });
    await store.remove(id2);
    for (const id of ids) await store.remove(id);
  });

  it("분양 Lua도 1채널이면 옛 색인을 먼저 옮긴다 (옛 번지를 새 집이 가로채지 못한다)", async () => {
    const lot = 300 + Math.floor(Math.random() * 90);
    await raw.hdel(HK.lots(1), String(lot));
    const old = await legacyHouse(lot);
    const id = nanoid(12);
    expect(await store.create({ id, owner: "x", name: "새집", intro: "", ownerName: "", tier: "small", ch: 1, lot, now: 1 })).toBe("lot_taken");
    expect((await hash(HK.lots(1))).get(String(lot))).toBe(old);
    await store.remove(old);
    expect((await hash(HK.lots(1))).has(String(lot))).toBe(false);
  });

  it("충돌(1채널에 이미 다른 집)이면 옛 칸을 지우지 않고 남겨 둔다", async () => {
    const lot = 300 + Math.floor(Math.random() * 90);
    const a = nanoid(12);
    await raw.hset(HK.lots(1), { [String(lot)]: a });
    await raw.hset(HK.legacyLots, { [String(lot)]: "someoneElse" });
    const r = await store.migrateLegacyLots();
    expect(r.left).toBeGreaterThanOrEqual(1);
    expect((await hash(HK.legacyLots)).get(String(lot))).toBe("someoneElse");
    expect((await hash(HK.lots(1))).get(String(lot))).toBe(a);
    await raw.hdel(HK.legacyLots, String(lot));
    await raw.hdel(HK.lots(1), String(lot));
  });
});

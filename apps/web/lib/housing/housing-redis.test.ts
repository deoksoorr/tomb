import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as exteriorRoute from "@/app/api/housing/me/exterior/route";
import * as session from "@/app/api/session/route";
import * as villageRoute from "@/app/api/housing/village/route";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { defaultExterior, furnitureById, LIKE_WEIGHT, PLOT_TIERS, TIER_SCORE_BONUS } from "./catalog";
import { resetRankSync, sweepReclaim } from "./reclaim";
import { buyFurniture, buyPlot, getHouseStore, houseIdFor, housePair, houseStates, resetLegacyLotFill, saveExterior, sellFurniture, setHouseState, village } from "./service";
import { placedSig, WINDOW_SIG } from "./states";
import { SCORE_RULE_VER, type HousePair } from "./store";
import { HK, RedisHouseStore } from "./store-redis";

/** 오두막 없는 집 하나 (공용 가방 = 이 집 id) */
const solo = (id: string): HousePair => ({ village: id, sea: `${id}-sea` });
import type { MyHouseResponse, VillageResponse } from "./types";

// 하우징 v4 계약: 실제 Redis(일회용 DB)에서만. 분양 번지 Lua·외관·마을 목록·예전 집 번지 배정
const conn = env.redis();
const OPERATOR_IP = "10.77.0.1"; // 라우트 호출은 운영자 IP로 (Upstash Ratelimit 스크립트는 SRH에서 돌지 않는다)

describe.skipIf(!conn)("하우징 v4 (실제 Redis)", () => {
  const raw = conn ? new Redis({ ...conn, automaticDeserialization: false }) : null!;
  const accounts = getAccounts();
  const store = getHouseStore();
  const PLOT = PLOT_TIERS[0].price;

  beforeAll(() => {
    vi.stubEnv("ADMIN_ALLOWED_IPS", OPERATOR_IP);
    expect(store).toBeInstanceOf(RedisHouseStore);
  });
  // 시험마다 만든 집은 지운다 (번지 칸도 비운다) — 1채널 15번지를 다음 시험·다음 실행이 다시 쓴다
  const made: string[] = [];
  afterEach(async () => {
    for (const id of made.splice(0)) await store.remove(id);
  });

  async function account(points: number, id = nanoid()): Promise<string> {
    made.push(houseIdFor(id));
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;
  const lotsHash = async () => {
    const flat = ((await raw.hgetall(HK.lots(1))) as unknown as string[] | null) ?? [];
    const m = new Map<number, string>();
    for (let i = 0; i < flat.length; i += 2) m.set(Number(flat[i]), flat[i + 1]);
    return m;
  };

  it("동시 분양(자동 번지)은 번지가 겹치지 않고, houses:lots:1과 집의 lot이 서로 맞다", async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => account(PLOT)));
    const res = await Promise.all(ids.map((id, i) => buyPlot(store, id, `집${i}`, "", "주인")));
    const lots = res.map((r) => r.house!.lot);
    expect(new Set(lots).size).toBe(8);
    const hash = await lotsHash();
    for (const [i, id] of ids.entries()) {
      expect(hash.get(lots[i])).toBe(houseIdFor(id));
      expect(await points(id)).toBe(0);
    }
  });

  it("같은 번지를 동시에 고르면 한 명만 받고, 나머지는 LOT_TAKEN + 포인트 그대로", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => account(PLOT + 50)));
    const want = Math.max(0, ...(await lotsHash()).keys()) + 1;
    const res = await Promise.allSettled(ids.map((id) => buyPlot(store, id, "같은 번지", "", "주인", want)));
    const won = res.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of res) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "LOT_TAKEN" });
    const balances = await Promise.all(ids.map(points));
    expect(balances.filter((b) => b === 50)).toHaveLength(1);
    expect(balances.filter((b) => b === PLOT + 50)).toHaveLength(4);
    expect((await lotsHash()).get(want)).toBe((won[0] as PromiseFulfilledResult<MyHouseResponse>).value.house!.id);
  });

  it("외관 PUT: 안 산 것·자리가 다른 것은 거절, 산 것은 입히고, 입힌 것은 되팔 수 없다", async () => {
    const res = await session.POST(new NextRequest("http://localhost/api/session", { method: "POST", headers: { "x-forwarded-for": OPERATOR_IP } }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    const visitorId = ((await res.json()) as { visitorId: string }).visitorId;
    await account(PLOT + 2 * furnitureById("roof_red")!.price, visitorId);
    await buyPlot(store, visitorId, "외관집", "", "주인");
    const put = (exterior: object) =>
      exteriorRoute.PUT(
        new NextRequest("http://localhost/api/housing/me/exterior", {
          method: "PUT",
          headers: { cookie, "x-forwarded-for": OPERATOR_IP, "content-type": "application/json" },
          body: JSON.stringify({ ch: 1, exterior }),
        }),
        { params: Promise.resolve({}) },
      );
    expect((await put({ roof: "roof_red" })).status).toBe(400);
    expect(((await (await put({ roof: "door_red" })).json()) as { error: { code: string } }).error.code).toBe("BAD_EXTERIOR");
    await buyFurniture(store, visitorId, "roof_red");
    await buyFurniture(store, visitorId, "roof_red");
    const ok = await put({ roof: "roof_red" });
    expect(ok.status).toBe(200);
    const house = ((await ok.json()) as MyHouseResponse).house!;
    expect(house.exterior).toEqual({ ...defaultExterior(), roof: "roof_red" });
    // 2개 중 1개는 입혀 있어 1개만 되팔 수 있다
    await sellFurniture(store, visitorId, "roof_red");
    await expect(sellFurniture(store, visitorId, "roof_red")).rejects.toMatchObject({ code: "PLACED" });
    // 저장소에 그대로 남았는지 (다시 읽기)
    expect((await store.get(house.id))!.exterior.roof).toBe("roof_red");
    expect((await store.inventory(housePair(visitorId), "village")).have.roof_red).toBe(1);
    // 기본으로 돌리면 다시 팔 수 있다
    await saveExterior(store, visitorId, {});
    expect((await sellFurniture(store, visitorId, "roof_red")).refunded).toBeGreaterThan(0);
  });

  it("마을 GET: 번지 순·외관 포함, 숨긴 집은 자리(taken)만, lots는 4의 배수", async () => {
    const [a, b] = await Promise.all([account(PLOT), account(PLOT)]);
    const ha = (await buyPlot(store, a, "보이는 집", "", "a")).house!;
    const hb = (await buyPlot(store, b, "숨긴 집", "", "b")).house!;
    await store.setHidden(hb.id, true);
    const res = await villageRoute.GET(new NextRequest("http://localhost/api/housing/village"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const v = (await res.json()) as VillageResponse;
    const lotsSeen = v.houses.map((h) => h.lot);
    expect(lotsSeen).toEqual([...lotsSeen].sort((x, y) => x - y));
    expect(v.houses.find((h) => h.id === ha.id)).toMatchObject({ lot: ha.lot, name: "보이는 집", exterior: defaultExterior() });
    expect(v.houses.some((h) => h.id === hb.id)).toBe(false);
    expect(v.taken).toContain(hb.lot);
    expect(v.lots % 4).toBe(0);
    expect(v.lots).toBeGreaterThanOrEqual(Math.max(...lotsSeen, hb.lot));
    expect(JSON.stringify(v)).not.toContain(a); // 계정 id는 내보내지 않는다
  });

  it("예전 집(번지·외관 필드 없음)은 마을을 열 때 빈 번지를 하나씩 받고, 두 번 열어도 그대로", async () => {
    const olds = await Promise.all(Array.from({ length: 3 }, () => account(PLOT)));
    const ids = olds.map((a) => houseIdFor(a));
    for (const [i, owner] of olds.entries()) {
      // 마을 이전 형식: meta에 ch·lot·exterior가 없고 번지 색인에도 없다
      await raw.hset(HK.meta(ids[i]), { owner, name: `옛집${i}`, intro: "", ownerName: "옛주인", tier: "small", createdAt: "1", updatedAt: "1", likes: "0", placedScore: "0", items: "0" });
      await raw.zadd(HK.all, { score: 1, member: ids[i] });
    }
    expect((await store.get(ids[0]))!.lot).toBe(0);
    expect((await store.get(ids[0]))!.exterior).toEqual(defaultExterior());
    const taken = new Set((await lotsHash()).keys());

    resetLegacyLotFill(store); // 앞 시험이 이미 훑었다 (인스턴스마다 처음 한 번만 훑는다)
    const [v1, v2] = await Promise.all([village(store), village(store)]); // 동시에 열어도 한 번만 배정
    const lots = ids.map((id) => v1.houses.find((h) => h.id === id)?.lot);
    expect(lots.every((l) => typeof l === "number" && l > 0 && !taken.has(l))).toBe(true);
    expect(new Set(lots).size).toBe(3);
    expect(ids.map((id) => v2.houses.find((h) => h.id === id)?.lot)).toEqual(lots);
    const hash = await lotsHash();
    for (const [i, id] of ids.entries()) {
      expect(hash.get(lots[i]!)).toBe(id);
      expect([...hash.values()].filter((x) => x === id)).toHaveLength(1);
      expect((await store.get(id))!.lot).toBe(lots[i]);
    }
    resetLegacyLotFill(store);
    const again = await village(store);
    expect(ids.map((id) => again.houses.find((h) => h.id === id)?.lot)).toEqual(lots);
  });
  it("11/22 번지 빼기·옮기기·다시 받기·지우기는 그 집 채널 색인만 쓴다 (1채널 색인을 건드리지 않는다)", async () => {
    const id = nanoid(12);
    made.push(id);
    const lots = async (ch: number) => {
      const flat = ((await raw.hgetall(HK.lots(ch))) as unknown as string[] | null) ?? [];
      const m = new Map<string, string>();
      for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
      return m;
    };
    const has1 = async () => [...(await lots(1)).values()].includes(id);
    const got = await store.create({ id, owner: nanoid(), name: "3채널", intro: "", ownerName: "주인", tier: "small", ch: 3, lot: null, now: 1 });
    expect(got).toMatchObject({ lot: expect.any(Number) });
    const lot = (got as { lot: number }).lot;
    expect((await lots(3)).get(String(lot))).toBe(id);
    expect(await store.unlot(id)).toBe(true);
    expect([...(await lots(3)).values()]).not.toContain(id);
    expect(await store.assignLot(id)).toBeGreaterThan(0);
    expect([...(await lots(3)).values()]).toContain(id);
    expect(await store.moveLot(id, 300)).toBe("ok");
    expect((await lots(3)).get("300")).toBe(id);
    expect(await has1()).toBe(false);
    await store.remove(id);
    expect([...(await lots(3)).values()]).not.toContain(id);
  });

  it("3번 가구 상태: 저장·0이면 지움, 배치 저장 Lua가 치우거나 옮긴 가구 상태·없어진 화분 기록을 같이 지운다", async () => {
    const id = nanoid(12).toLowerCase().replace(/[^a-z0-9]/g, "a");
    made.push(id);
    await store.create({ id, owner: nanoid(), name: "상태", intro: "", ownerName: "주인", tier: "small", lot: null, now: 1 });
    const fire = { u: "f1", i: "fireplace", x: 1, y: 1, r: 0 };
    const lamp = { u: "l1", i: "floor_lamp", x: 5, y: 1, r: 0 };
    const radio = { u: "r1", i: "radio", x: 3, y: 4, r: 0 };
    const pot = { u: "p1", i: "pot", x: 6, y: 4, r: 0 };
    const lay = (items: (typeof fire)[]) => ({ items, floor: "floor_grass", wall: "wall_fence" });
    for (const p of [fire, lamp, radio, pot]) await store.addItem(solo(id), "village", p.i, 20);
    expect(await store.saveDesign(solo(id), "village", "small", lay([fire, lamp, radio, pot]), null, {}, 1, 2)).toBe("ok");
    await setHouseState(store, id, "f1", 1);
    await setHouseState(store, id, "l1", 1);
    await setHouseState(store, id, "r1", 3);
    await setHouseState(store, id, "w0", 1);
    await store.setPlant(id, "p1", { n: 1, at: 5 });
    expect((await houseStates(store, id)).states).toEqual({ f1: 1, l1: 1, r1: 3, w0: 1 });
    await setHouseState(store, id, "r1", 0);
    expect(await raw.hexists(HK.states(id), "r1")).toBe(0);
    await raw.hset(HK.states(id), { junk: "{깨짐" });
    // 벽난로는 그대로, 스탠드는 옮기고, 화분은 치운다
    expect(await store.saveDesign(solo(id), "village", "small", lay([fire, { ...lamp, x: 6 }]), null, {}, 1, 3)).toBe("ok");
    expect(await store.states(id)).toEqual({ f1: { a: 1, s: placedSig(fire) }, w0: { a: 1, s: WINDOW_SIG } });
    expect(await store.plants(id)).toEqual({});
    expect((await houseStates(store, id)).states).toEqual({ f1: 1, w0: 1 });
    await store.remove(id);
    expect(await raw.exists(HK.states(id))).toBe(0);
  });

  it("11/22 순위 ZSET에 터 크기 점수: 분양·넓히기·좋아요가 바로 쓰고, 그 전에 넓힌 집은 syncRankScores가 한 번 맞춘다(멱등)", async () => {
    const zs = async (id: string) => Number(await raw.zscore(HK.score, id));
    const id = nanoid(12);
    made.push(id);
    // 1채널은 다른 시험들이 쓴다 → 다른 채널
    expect(await store.create({ id, owner: nanoid(), name: "넓은", intro: "", ownerName: "주인", tier: "wide", ch: 8, lot: null, now: 1, placedScore: 7, placed: { pot: 1 }, layout: { items: [{ u: "a", i: "pot", x: 0, y: 0, r: 0 }], floor: "floor_grass", wall: "wall_fence" } })).toMatchObject({ lot: expect.any(Number) });
    expect(await zs(id)).toBe(7 + TIER_SCORE_BONUS.wide);
    expect(await store.upgrade(id, "wide", "manor", 2)).toBe(true);
    expect(await zs(id)).toBe(7 + TIER_SCORE_BONUS.manor);
    expect(await store.like(id, "v1", "20261122")).toEqual({ likes: 1, score: 7 + LIKE_WEIGHT + TIER_SCORE_BONUS.manor });
    expect(await zs(id)).toBe(7 + LIKE_WEIGHT + TIER_SCORE_BONUS.manor);
    // 숨긴 집은 넓혀도 순위에 다시 들어가지 않는다
    const hid = nanoid(12);
    made.push(hid);
    expect(await store.create({ id: hid, owner: nanoid(), name: "숨김", intro: "", ownerName: "주인", tier: "small", ch: 8, lot: null, now: 1 })).toMatchObject({ lot: expect.any(Number) });
    await store.setHidden(hid, true);
    expect(await store.upgrade(hid, "small", "wide", 2)).toBe(true);
    expect(await raw.zscore(HK.score, hid)).toBeNull();

    // 터 크기 점수가 생기기 전에 넓힌 집: 순위 ZSET에 물건 + 좋아요만 남아 있다
    await raw.zadd(HK.score, { score: 7 + LIKE_WEIGHT, member: id });
    await raw.del(HK.scoreVer);
    // 그래도 목록·읽기 점수는 이미 맞다 (읽을 때 센다)
    expect((await store.get(id))!.score).toBe(7 + LIKE_WEIGHT + TIER_SCORE_BONUS.manor);
    expect(await store.syncRankScores()).toBeGreaterThanOrEqual(1);
    expect(await zs(id)).toBe(7 + LIKE_WEIGHT + TIER_SCORE_BONUS.manor);
    expect(await raw.zscore(HK.score, hid)).toBeNull();
    expect(await raw.get(HK.scoreVer)).toBe(SCORE_RULE_VER);
    // 두 번째는 표시만 보고 끝
    await raw.zadd(HK.score, { score: 1, member: id });
    expect(await store.syncRankScores()).toBeNull();
    expect(await zs(id)).toBe(1);
    await store.remove(id);
    await store.remove(hid);
  });

  it("11/22 오래 비운 집 정리를 돌면 순위 점수 맞추기도 한 번 돈다 (배포 뒤 따로 할 일 없음)", async () => {
    const id = nanoid(12);
    made.push(id);
    expect(await store.create({ id, owner: nanoid(), name: "옛 넓은 집", intro: "", ownerName: "주인", tier: "wide", ch: 8, lot: null, now: 1 })).toMatchObject({ lot: expect.any(Number) });
    await raw.zadd(HK.score, { score: 0, member: id });
    await raw.del(HK.scoreVer);
    resetRankSync(store);
    await sweepReclaim(store, Date.now(), { force: true });
    expect(Number(await raw.zscore(HK.score, id))).toBe(TIER_SCORE_BONUS.wide);
    await store.remove(id);
  });
});

import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { K } from "../store/keys";
import { AWAY_MSG, DEFAULT_FLOOR, DEFAULT_WALL, furnitureById, SEA_STARTER, tierById } from "./catalog";
import { findFreeSpot } from "./layout";
import { RECLAIM_MS, sweepReclaim } from "./reclaim";
import { buyCottage, buyFurniture, buyPlot, houseIdFor, myHouse, saveLayout, sellFurniture } from "./service";
import { sharedBagContract } from "./sharedBag.contract";
import { MemoryHouseStore } from "./store";
import { HK, RedisHouseStore } from "./store-redis";
import type { HouseLayout } from "./types";

// 11/16 공용 가구 가방: 저장소 계약은 메모리에서 늘, 실제 Redis는 개발용 DB 환경변수가 있을 때만
const conn = env.redis();

describe("공용 가구 가방 (MemoryHouseStore)", () => sharedBagContract({ make: () => new MemoryHouseStore() }));

describe.skipIf(!conn)("공용 가구 가방 (RedisHouseStore, 실제 Redis)", () => {
  const raw = () => new Redis({ ...conn!, automaticDeserialization: false });
  let store: RedisHouseStore;
  sharedBagContract({
    make: () => (store = new RedisHouseStore(conn!)),
    raw,
    seen: async (owner, at) => void (await raw().hset(K.acct(owner), { seenAt: String(at) })),
    cleanup: async (pairs) => {
      for (const p of pairs) await Promise.all([store.remove(p.village), store.remove(p.sea), store.remove(p.camp)]);
      if (pairs.length) await raw().del(...pairs.flatMap((p) => [HK.pool(p.village), HK.inv(p.sea), HK.reclaimed(p.sea), HK.inv(p.camp), HK.reclaimed(p.camp)]));
    },
  });
});

describe.skipIf(!!conn)("공용 가구 가방 (서비스)", () => {
  const accounts = getAccounts();
  const T = Date.now();
  async function account(points: number, seenAt = T): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    await accounts.visit(id, seenAt, true);
    return id;
  }
  const lantern = (u: string, x: number): HouseLayout["items"][number] => ({ u, i: "stone_lantern", x, y: 3, r: 0 });
  /** 오두막 지금 배치 + 빈 자리에 석등 하나 */
  const plusLantern = (l: HouseLayout): HouseLayout => {
    const at = findFreeSpot(l.items, tierById("small")!, furnitureById("stone_lantern")!, 0)!;
    return { ...l, items: [...l.items, { u: "z", i: "stone_lantern", x: at.x, y: at.y, r: 0 }] };
  };
  const room = (items: HouseLayout["items"], floor = DEFAULT_FLOOR, wall = DEFAULT_WALL): HouseLayout => ({ items, floor, wall });

  it("가진 2개 중 1개를 다른 집에 놓으면 여기서는 1개, 다 놓이면 다른 집에 놓여 있다고 알려 준다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 2);
    await buyCottage(store, a, "오두막", "", "주인", null, 2);
    await buyFurniture(store, a, "stone_lantern");
    const sea = await buyFurniture(store, a, "stone_lantern", 0, "sea");
    expect(sea.inventory.stone_lantern).toBe(2);
    await saveLayout(store, a, "small", room([lantern("a", 1)]), 2);
    const s1 = await myHouse(store, a, undefined, "sea");
    expect(s1.inventory.stone_lantern).toBe(1);
    expect(s1.away).toEqual({ stone_lantern: 1 });
    await saveLayout(store, a, "small", room([lantern("a", 1), lantern("b", 3)]), 2);
    const s2 = await myHouse(store, a, undefined, "sea");
    expect(s2.inventory.stone_lantern ?? 0).toBe(0);
    expect(s2.away).toEqual({ stone_lantern: 2 });
    // 오두막에 놓으려 하면 그 안내, 되팔기도 막힌다 (두 번 팔거나 놓인 걸 팔지 못한다)
    const seaLayout = (await myHouse(store, a, undefined, "sea")).house!.layout;
    await expect(saveLayout(store, a, "small", plusLantern(seaLayout), 2, "sea")).rejects.toMatchObject({
      code: "NOT_OWNED",
      message: expect.stringContaining(AWAY_MSG),
    });
    await expect(sellFurniture(store, a, "stone_lantern", "sea")).rejects.toMatchObject({ code: "PLACED", message: AWAY_MSG });
    await expect(sellFurniture(store, a, "stone_lantern")).rejects.toMatchObject({ code: "PLACED" });
    // 마을 집에서 하나 치우면 오두막에서 팔 수 있다 (팔면 두 집 모두에서 하나 줄어든다)
    await saveLayout(store, a, "small", room([lantern("a", 1)]), 2);
    const sold = await sellFurniture(store, a, "stone_lantern", "sea");
    expect(sold.refunded).toBe(Math.floor(furnitureById("stone_lantern")!.price / 2));
    expect(sold.inventory.stone_lantern ?? 0).toBe(0);
    expect(sold.away).toEqual({ stone_lantern: 1 });
    expect((await myHouse(store, a)).inventory.stone_lantern).toBe(1);
  });

  it("상한은 두 집 합계 (오두막에서 사도 마을 집 몫까지 센다)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 3);
    await buyCottage(store, a, "오두막", "", "주인", null, 3);
    for (let i = 0; i < 20; i++) await store.addItem({ village: houseIdFor(a), sea: houseIdFor(a, "sea"), camp: houseIdFor(a, "camp") }, "village", "pot", 20);
    await saveLayout(store, a, "small", room([{ u: "p", i: "pot", x: 1, y: 3, r: 0 }]), 3);
    await expect(buyFurniture(store, a, "pot", 0, "sea")).rejects.toMatchObject({ code: "MAX_OWNED" });
  });

  it("바닥·벽지는 산 집 것: 오두막 시작 바닥은 마을 집에 깔 수 없다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 4);
    await buyCottage(store, a, "오두막", "", "주인", null, 4);
    expect((await myHouse(store, a)).inventory.floor_deck).toBeUndefined();
    await expect(saveLayout(store, a, "small", room([], "floor_deck"), 4)).rejects.toMatchObject({ code: "NOT_OWNED" });
    // 시작 가구도 오두막 몫 (마을 집 가방에 없다)
    for (const it of SEA_STARTER) expect((await myHouse(store, a)).inventory[it]).toBeUndefined();
  });

  it("오두막이 철거되면 거기 놓였던 공용 가구를 마을 집에 놓을 수 있다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000, T);
    await buyPlot(store, a, "마을 집", "", "주인", null, 5);
    await buyCottage(store, a, "떠날 오두막", "", "주인", null, 5);
    await buyFurniture(store, a, "stone_lantern", 0, "sea");
    const seaLayout = (await myHouse(store, a, undefined, "sea")).house!.layout;
    await saveLayout(store, a, "small", plusLantern(seaLayout), 5, "sea");
    await expect(saveLayout(store, a, "small", room([lantern("a", 1)]), 5)).rejects.toMatchObject({ code: "NOT_OWNED" });
    // 마을 집도 같이 오래 비웠으니 같이 철거된다 → 주인이 돌아와 마을 집을 다시 사서 놓는다
    const rep = await sweepReclaim(store, T + RECLAIM_MS + 1, { force: true, since: 0 });
    expect(rep.reclaimed.map((d) => d.id)).toContain(houseIdFor(a, "sea"));
    await accounts.visit(a, Date.now(), true);
    if (!(await store.get(houseIdFor(a)))) await buyPlot(store, a, "돌아온 집", "", "주인", null, 5);
    const back = await saveLayout(store, a, "small", room([lantern("a", 1)]), 5);
    expect(back.inventory.stone_lantern).toBe(1);
    expect(back.away ?? {}).toEqual({});
  });
});

import { CAMP_LOTS } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../env";
import { getAccounts } from "../../store";
import { kstDay } from "../../store/accounts";
import { CAMP_STARTER } from "../catalog";
import { buyCampHome, buyPlot, getHouseStore, houseIdsOf, myHouse, saveLayout, sellFurniture } from "../service";
import { RedisHouseStore } from "../store-redis";
import { buyCampShop, campShopStatus } from "./service";

// 11/27 캠핑장 전용 가구 (실제 Redis — 일회용 DB): 주인 확인 → 사기(공용 가방) → 카라반에 놓기·전용 바닥 깔기 → 마을 집 거절 → 치우고 되팔기
const conn = env.redis();

describe.skipIf(!conn)("캠핑장 전용 가구 (실제 Redis)", () => {
  const accounts = getAccounts();
  const store = getHouseStore();
  const made: string[] = [];

  beforeAll(() => {
    expect(store).toBeInstanceOf(RedisHouseStore);
  });
  afterEach(async () => {
    for (const id of made.splice(0)) await store.remove(id);
  });

  async function account(pts: number): Promise<string> {
    const id = nanoid();
    made.push(...houseIdsOf(id));
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, pts - now);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;
  const caravanLot = CAMP_LOTS.filter((l) => l.kind === "caravan").at(-1)!.lot;
  const pensionLot = CAMP_LOTS.find((l) => l.kind === "pension")!.lot;

  it("두 계정: 카라반 주인은 사서 카라반에 놓고 바닥도 깔고, 마을 집엔 거절, 치우면 되판다 · 펜션 주인은 카라반 물건을 못 산다", async () => {
    const a = await account(200_000);
    const b = await account(200_000);
    const ch = 7;
    const home = await buyCampHome(store, a, "", "", "가", caravanLot, ch);
    await buyPlot(store, a, "마을 집", "", "가", null, ch);
    await buyCampHome(store, b, "", "", "나", pensionLot, ch);

    await expect(buyCampShop(b, "caravan", "cx_cv_camp_chair")).rejects.toMatchObject({ code: "NOT_OWNER" });
    expect((await campShopStatus(b, "pension")).owner).toBe(true);

    let p = await points(a);
    const r1 = await buyCampShop(a, "caravan", "cx_cv_camp_chair");
    expect(p - (p = await points(a))).toBe(600);
    expect(r1.furn.find((f) => f.id === "cx_cv_camp_chair")?.have).toBe(1);
    await buyCampShop(a, "caravan", "cx_cv_floor_check");
    expect(p - (p = await points(a))).toBe(1_400);
    // 공용 가방: 마을 집에서 봐도 있다
    expect((await myHouse(store, a)).inventory.cx_cv_camp_chair).toBe(1);

    const starter = CAMP_STARTER.caravan.map((q) => ({ ...q }));
    const saved = await saveLayout(
      store,
      a,
      "small",
      { items: [...starter, { u: "cx1", i: "cx_cv_camp_chair", x: 1, y: 4, r: 4 }], floor: "cx_cv_floor_check", wall: home.house!.layout.wall },
      ch,
      "camp",
    );
    expect(saved.house?.layout.floor).toBe("cx_cv_floor_check");
    // 놓은 점수 = 의자 30 + 바닥 70
    expect(saved.house?.placedScore).toBe(100);

    // 카라반에 놓인 동안은 못 판다, 마을 집에는 전용이라 거절
    await expect(sellFurniture(store, a, "cx_cv_camp_chair")).rejects.toMatchObject({ code: "PLACED" });
    await saveLayout(store, a, "small", { items: starter, floor: home.house!.layout.floor, wall: home.house!.layout.wall }, ch, "camp");
    await expect(saveLayout(store, a, "small", { items: [{ u: "a", i: "cx_cv_camp_chair", x: 1, y: 1, r: 4 }], floor: "floor_grass", wall: "wall_fence" }, ch)).rejects.toMatchObject({
      code: "CAMP_ONLY",
    });
    const sold = await sellFurniture(store, a, "cx_cv_camp_chair");
    expect(sold.refunded).toBe(300);
    expect((await sellFurniture(store, a, "cx_cv_floor_check")).refunded).toBe(700);
  });
});

import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { DEFAULT_FLOOR, DEFAULT_WALL, furnitureById, houseUseNote, isHouseOwnDef, SKIN_AWAY_MSG } from "./catalog";
import { buyCottage, buyFurniture, buyPlot, myHouse, saveLayout, sellFurniture } from "./service";
import { MemoryHouseStore } from "./store";
import type { HouseLayout } from "./types";

// 11/24 바닥·벽지도 두 집 공용 가방 (하나로 집 한 채). 외관은 산 집 것 그대로

const FLOOR = "floor_wood";
const room = (floor = DEFAULT_FLOOR, wall = DEFAULT_WALL): HouseLayout => ({ items: [], floor, wall });

describe("바닥·벽지 공용 (카탈로그)", () => {
  it("바닥·벽지는 집에 딸리지 않고, 외관만 산 집 것", () => {
    expect(isHouseOwnDef(furnitureById(FLOOR))).toBe(false);
    expect(isHouseOwnDef(furnitureById("wall_paper"))).toBe(false);
    expect(isHouseOwnDef(furnitureById("roof_red"))).toBe(true);
    expect(houseUseNote(furnitureById(FLOOR))).toBe("마을 집과 포구 오두막 어디든 쓸 수 있어요. 하나로 집 한 채에 써요.");
    expect(houseUseNote(furnitureById("roof_red"))).toBe("산 집에서만 쓸 수 있어요.");
    expect(houseUseNote(furnitureById("sofa"))).toBe("마을 집과 포구 오두막 어디든 놓을 수 있어요.");
  });
});

describe.skipIf(!!env.redis())("바닥·벽지 공용 (서비스·메모리 저장소)", () => {
  const accounts = getAccounts();
  async function account(points: number): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    await accounts.visit(id, Date.now(), true);
    return id;
  }

  it("마을 집에서 산 바닥을 오두막에 쓴다: 한 집에 쓰는 동안 다른 집에선 「다른 집에」, 쓰는 동안 못 판다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(80_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 1);
    await buyCottage(store, a, "오두막", "", "주인", null, 1);
    await buyFurniture(store, a, FLOOR, 0, "village");
    const sea = await myHouse(store, a, undefined, "sea");
    expect(sea.inventory[FLOOR]).toBe(1);
    const seaLayout = { ...sea.house!.layout, floor: FLOOR };
    expect((await saveLayout(store, a, sea.house!.tier, seaLayout, 1, "sea")).house!.layout.floor).toBe(FLOOR);

    const village = await myHouse(store, a);
    expect(village.inventory[FLOOR] ?? 0).toBe(0);
    expect(village.away?.[FLOOR]).toBe(1);
    await expect(saveLayout(store, a, "small", room(FLOOR), 1)).rejects.toMatchObject({ code: "NOT_OWNED", message: `${furnitureById(FLOOR)!.name}, ${SKIN_AWAY_MSG}` });
    await expect(sellFurniture(store, a, FLOOR)).rejects.toMatchObject({ code: "PLACED", message: `${furnitureById(FLOOR)!.name}, ${SKIN_AWAY_MSG}` });
    await expect(sellFurniture(store, a, FLOOR, "sea")).rejects.toMatchObject({ code: "PLACED" });

    // 오두막에서 기본으로 돌리면 마을 집에 쓰거나 팔 수 있다
    await saveLayout(store, a, sea.house!.tier, { ...seaLayout, floor: DEFAULT_FLOOR }, 1, "sea");
    expect((await saveLayout(store, a, "small", room(FLOOR), 1)).house!.layout.floor).toBe(FLOOR);
    await saveLayout(store, a, "small", room(), 1);
    const sold = await sellFurniture(store, a, FLOOR);
    expect(sold.inventory[FLOOR] ?? 0).toBe(0);
  });
});

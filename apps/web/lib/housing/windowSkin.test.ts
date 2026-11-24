import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { DEFAULT_FLOOR, DEFAULT_WALL, DEFAULT_WINDOW, furnitureById, isHouseOwnDef, WINDOW_SKINS } from "./catalog";
import { layoutCounts, liftWindowSkins, placedScore, previewTurnLabel, validateLayout, WINDOW_LOCKED_MSG } from "./layout";
import { buyCottage, buyFurniture, buyPlot, housePair, myHouse, saveLayout, sellFurniture } from "./service";
import { isHouseOwnItem, MemoryHouseStore } from "./store";
import type { HouseLayout, Placed } from "./types";

// 11/24 눈꽃 창가: 바닥 가구 → 벽 창문 모양 (가지면 꾸미기 「창문」 칸에서 고른다)

const FROST = "frost_window";
const SCORE = furnitureById(FROST)!.score;
const room = (items: Placed[] = [], window?: string): HouseLayout => ({ items, floor: DEFAULT_FLOOR, wall: DEFAULT_WALL, ...(window ? { window } : {}) });
const placedFrost = (u: string, x: number): Placed => ({ u, i: FROST, x, y: 2, r: 4 });

describe("눈꽃 창가 창문 모양 (배치 규칙)", () => {
  it("카탈로그: 창문 모양이고 두 집 공용 가방 가구다 (바닥·벽지처럼 집에 딸리지 않는다)", () => {
    const def = furnitureById(FROST)!;
    expect(def.skin).toBe("window");
    expect(def.category).toBe("season");
    expect(def.seasonWeek).toBe("w1");
    expect(def.desc).toContain("집 꾸미기에서 벽 창문을 눈꽃 창가로 바꿀 수 있어요. 하나로 집 한 채에 쓸 수 있어요.");
    expect(isHouseOwnDef(def)).toBe(false);
    expect(isHouseOwnItem(FROST)).toBe(false);
    expect(WINDOW_SKINS).toEqual([DEFAULT_WINDOW, FROST]);
    // 방향이 없다: 상점 미리보기는 돌리기 대신 열고 닫기
    expect(def.spin).toBeUndefined();
    expect(def.turn).toBeUndefined();
    expect(previewTurnLabel(def, 0)).toBe("열어 보기");
    expect(previewTurnLabel(def, 1)).toBe("닫아 보기");
    expect(previewTurnLabel(furnitureById("winter_stove")!, 0)).toBe("돌려 보기");
  });

  it("가지고 있으면 고를 수 있고 점수가 한 번 들어간다", () => {
    const v = validateLayout(room([], FROST), "small", { [FROST]: 1 });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.counts).toEqual({ [FROST]: 1 });
      expect(v.placedScore).toBe(SCORE);
    }
  });

  it("없으면 못 고른다 (안내는 꾸미기 잠금 문구와 같다)", () => {
    const v = validateLayout(room([], FROST), "small", {});
    expect(v).toMatchObject({ ok: false, code: "NOT_OWNED", message: WINDOW_LOCKED_MSG });
  });

  it("기본 창문·창문 칸 없음은 무료 (개수·점수 없음), 모르는 창문은 막는다", () => {
    expect(layoutCounts(room([], DEFAULT_WINDOW))).toEqual({});
    expect(layoutCounts(room())).toEqual({});
    expect(validateLayout(room([], DEFAULT_WINDOW), "small", {}).ok).toBe(true);
    expect(validateLayout(room([], "sofa"), "small", null)).toMatchObject({ ok: false, code: "BAD_SKIN" });
    expect(validateLayout(room([], "wall_paper"), "small", null)).toMatchObject({ ok: false, code: "BAD_SKIN" });
  });

  it("바닥에는 더 놓을 수 없다", () => {
    const v = validateLayout(room([placedFrost("a", 1)]), "small", { [FROST]: 1 });
    expect(v).toMatchObject({ ok: false, code: "BAD_ITEM" });
    if (!v.ok) expect(v.message).toContain("「창문」 칸");
  });

  it("예전에 바닥에 놓은 배치: 읽을 때 빼고 창문 모양으로 (점수·쓰는 개수 그대로, 둘 놓았으면 하나는 가방으로)", () => {
    const old = room([placedFrost("a", 1), { u: "b", i: "sofa", x: 5, y: 3, r: 0 }]);
    const oldScore = placedScore(old);
    const l = liftWindowSkins(old);
    expect(l.items.map((p) => p.i)).toEqual(["sofa"]);
    expect(l.window).toBe(FROST);
    expect(placedScore(l)).toBe(oldScore);
    expect(layoutCounts(l)).toEqual({ sofa: 1, [FROST]: 1 });
    expect(validateLayout(l, "small", { sofa: 1, [FROST]: 1 }).ok).toBe(true);

    const two = liftWindowSkins(room([placedFrost("a", 1), placedFrost("c", 6)]));
    expect(two.items).toEqual([]);
    expect(layoutCounts(two)).toEqual({ [FROST]: 1 });
    // 바꿀 것이 없으면 그대로
    const plain = room([{ u: "b", i: "sofa", x: 5, y: 3, r: 0 }]);
    expect(liftWindowSkins(plain)).toBe(plain);
  });
});

describe.skipIf(!!env.redis())("눈꽃 창가 창문 모양 (서비스·메모리 저장소)", () => {
  const accounts = getAccounts();
  async function account(points: number): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    await accounts.visit(id, Date.now(), true);
    return id;
  }
  /** 가구 보따리상에서 산 것처럼 (보따리상 판매 = ghostSale) */
  const buyFrost = (store: MemoryHouseStore, a: string, zone: "village" | "sea" = "village") => buyFurniture(store, a, FROST, 0, zone, true);

  it("산 사람만 고른다: 저장되면 창문 모양·점수가 바뀌고, 쓰는 동안엔 못 팔고, 기본으로 돌리면 판다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 1);
    await expect(saveLayout(store, a, "small", room([], FROST), 1)).rejects.toMatchObject({ status: 400, code: "NOT_OWNED", message: WINDOW_LOCKED_MSG });

    await buyFrost(store, a);
    const before = (await myHouse(store, a)).house!.score;
    const r = await saveLayout(store, a, "small", room([], FROST), 1);
    expect(r.house!.layout.window).toBe(FROST);
    expect(r.house!.score).toBe(before + SCORE);

    // 예전 화면은 창문 칸 없이 저장한다 → 지금 창문 모양을 그대로 둔다
    const kept = await saveLayout(store, a, "small", room(), 1);
    expect(kept.house!.layout.window).toBe(FROST);
    expect(kept.house!.score).toBe(before + SCORE);

    await expect(sellFurniture(store, a, FROST)).rejects.toMatchObject({ status: 409, code: "PLACED" });
    const back = await saveLayout(store, a, "small", room([], DEFAULT_WINDOW), 1);
    expect(back.house!.score).toBe(before);
    const sold = await sellFurniture(store, a, FROST);
    expect(sold.inventory[FROST] ?? 0).toBe(0);
    await expect(saveLayout(store, a, "small", room([], FROST), 1)).rejects.toMatchObject({ code: "NOT_OWNED" });
  });

  it("예전에 바닥에 놓아 저장한 집: 읽으면 창문 모양으로, 점수 그대로, 다시 저장해도 그대로", async () => {
    const store = new MemoryHouseStore();
    const a = await account(50_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 1);
    await buyFrost(store, a);
    // 예전 규칙으로 바닥에 놓인 채 저장된 배치 (검증을 거치지 않고 저장소에 바로)
    const old = room([placedFrost("a", 1)]);
    await store.saveDesign(housePair(a), "village", "small", old, null, { [FROST]: 1 }, SCORE, Date.now());
    const my = await myHouse(store, a);
    expect(my.house!.layout.items).toEqual([]);
    expect(my.house!.layout.window).toBe(FROST);
    expect(my.house!.placedScore).toBe(SCORE);
    expect(my.inventory[FROST]).toBe(1);
    // 읽어 온 배치를 그대로 저장 (새 화면)
    const again = await saveLayout(store, a, "small", my.house!.layout, 1);
    expect(again.house!.layout.window).toBe(FROST);
    expect(again.house!.placedScore).toBe(SCORE);
    // 공개 집 보기(손님)도 같은 창문
    expect((await store.get(my.house!.id))!.layout.window).toBe(FROST);
  });

  it("두 집 공용: 마을 집 창문에 쓰면 오두막에선 못 고르고, 다른 집에 쓰고 있다고 알려 준다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(80_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 1);
    await buyCottage(store, a, "오두막", "", "주인", null, 1);
    await buyFrost(store, a);
    await saveLayout(store, a, "small", room([], FROST), 1);
    const sea = await myHouse(store, a, undefined, "sea");
    expect(sea.inventory[FROST] ?? 0).toBe(0);
    expect(sea.away?.[FROST]).toBe(1);
    const seaLayout = { ...sea.house!.layout, window: FROST };
    await expect(saveLayout(store, a, sea.house!.tier, seaLayout, 1, "sea")).rejects.toMatchObject({ code: "NOT_OWNED" });
    // 마을 집에서 기본으로 돌리면 오두막 창문에 쓸 수 있다
    await saveLayout(store, a, "small", room([], DEFAULT_WINDOW), 1);
    const ok = await saveLayout(store, a, sea.house!.tier, seaLayout, 1, "sea");
    expect(ok.house!.layout.window).toBe(FROST);
  });
});

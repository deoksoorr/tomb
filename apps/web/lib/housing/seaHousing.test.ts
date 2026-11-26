import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts, getGifts } from "../store";
import { kstDay } from "../store/accounts";
import { questStore } from "../forage/quests/service";
import { lampHour, lightLamp, lampState, resetLampMemo } from "../sea/lamp";
import { DEFAULT_FLOOR, DEFAULT_WALL, FURNITURE, PLOT_TIERS, plotCost, SEA_LOT_COUNT, SEA_STARTER, seaPlotCost, seaUpgradeCost } from "./catalog";
import { validateLayout } from "./layout";
import { deliverReclaim, RECLAIM_MS, sweepReclaim } from "./reclaim";
import { buyCottage, buyFurniture, buyPlot, houseIdFor, houseRank, myHouse, saveLayout, seaStarterLayout, sellFurniture, setCottageStyle, upgradePlot, village } from "./service";
import { MemoryHouseStore } from "./store";

// 11/16 포구 오두막 (Task A) · 등대 등불 (Task B): 메모리 저장소에서만 (실제 Redis를 건드리지 않는다)
const conn = env.redis();

describe.skipIf(!!conn)("포구 오두막", () => {
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
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;

  it("값: 같은 크기 마을 집의 1.5배, 마을 집이 있으면 별장이라 2배", () => {
    for (const t of PLOT_TIERS) {
      expect(seaPlotCost(t.id, false)).toBe(Math.ceil((plotCost(t.id) * 1.5) / 10) * 10);
      expect(seaPlotCost(t.id, true)).toBe(plotCost(t.id) * 2);
    }
  });

  it("처음 집이면 1.5배를 내고, 시작 가구·바닷가 바닥·벽이 깔린 채로 생긴다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const r = await buyCottage(store, a, "파도 오두막", "", "주인", 2, 3, "small", "blue");
    expect(await points(a)).toBe(100_000 - seaPlotCost("small", false));
    expect(r.house).toMatchObject({ ch: 3, lot: 2, zone: "sea", style: "blue", tier: "small" });
    expect(r.house!.id).toBe(houseIdFor(a, "sea"));
    expect(r.house!.id).not.toBe(houseIdFor(a));
    for (const it of SEA_STARTER) expect(r.inventory[it]).toBe(1);
    expect(r.house!.layout.floor).toBe("floor_deck");
    expect(r.house!.layout.wall).toBe("wall_sea");
    expect(r.house!.layout.items.length).toBe(5);
    // 시작 배치도 꾸밈 점수·놓은 개수에 들어간다 (놓인 시작 가구는 되팔 수 없다)
    expect(r.house!.placedScore).toBeGreaterThan(0);
    await expect(sellFurniture(store, a, "sea_hammock", "sea")).rejects.toMatchObject({ code: "PLACED" });
    // 마을 집은 그대로 없다
    expect((await myHouse(store, a)).house).toBeNull();
  });

  it("시작 배치는 모든 터 크기에서 규칙에 맞는다", () => {
    const owned = Object.fromEntries(SEA_STARTER.map((i) => [i, 1]));
    for (const t of PLOT_TIERS) expect(validateLayout(seaStarterLayout(), t.id, owned)).toMatchObject({ ok: true });
  });

  it("마을 집이 있으면 별장 값(2배). 마을 집 하나 + 오두막 하나까지만", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    await buyPlot(store, a, "마을 집", "", "주인", null, 4);
    const before = await points(a);
    await buyCottage(store, a, "별장", "", "주인", null, 4, "small", "wood");
    expect(before - (await points(a))).toBe(seaPlotCost("small", true));
    await expect(buyCottage(store, a, "둘째 별장", "", "주인", null, 4)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    await expect(buyPlot(store, a, "둘째 마을 집", "", "주인", null, 4)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    // 실패한 시도는 돈을 쓰지 않는다
    expect(before - (await points(a))).toBe(seaPlotCost("small", true));
  });

  it("11/26 별장 규칙: 오두막을 먼저 사면 오두막이 첫 집, 그 뒤 산 마을 집이 별장 (× 4/3). 차액(villaFee)은 없다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(30_000);
    await buyCottage(store, a, "먼저 오두막", "", "주인", null, 4, "small", "wood");
    expect(30_000 - (await points(a))).toBe(seaPlotCost("small", false));
    // 마을 집 창은 값표로 별장 값을 미리 보여 준다
    const mine = await myHouse(store, a);
    expect(mine.villaFee).toBeUndefined();
    expect(mine.prices?.villa.village).toBe(true);
    expect(mine.prices?.village.small).toBe(8_000);
    const before = await points(a);
    await buyPlot(store, a, "마을 집", "", "주인", null, 4);
    expect(before - (await points(a))).toBe(8_000);
    // 오두막은 첫 집 그대로, 마을 집이 별장
    expect((await myHouse(store, a, undefined, "sea")).house?.villa).toBeUndefined();
    expect((await myHouse(store, a)).house?.villa).toBe(true);
    // 집이 없으면 별장 아님
    const b = await account(30_000);
    expect((await myHouse(store, b)).prices?.villa).toEqual({ village: false, sea: false, camp: false });
  });

  it("터는 채널마다 11곳(11/19): 이미 있는 터는 막고, 다 차면 VILLAGE_FULL, 다른 채널은 따로", async () => {
    const store = new MemoryHouseStore();
    const owners = await Promise.all(Array.from({ length: SEA_LOT_COUNT + 1 }, () => account(100_000)));
    await buyCottage(store, owners[0], "1", "", "a", 1, 5);
    await expect(buyCottage(store, owners[1], "2", "", "b", 1, 5)).rejects.toMatchObject({ code: "LOT_TAKEN" });
    await expect(buyCottage(store, owners[1], "2", "", "b", SEA_LOT_COUNT + 1, 5)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    for (let i = 1; i < SEA_LOT_COUNT; i++) await buyCottage(store, owners[i], `${i}`, "", "b", null, 5);
    const before = await points(owners[SEA_LOT_COUNT]);
    await expect(buyCottage(store, owners[SEA_LOT_COUNT], "x", "", "c", null, 5)).rejects.toMatchObject({ code: "VILLAGE_FULL" });
    expect(await points(owners[SEA_LOT_COUNT])).toBe(before);
    await buyCottage(store, owners[SEA_LOT_COUNT], "x", "", "c", 1, 6);
    const v5 = await village(store, 5, T, "sea");
    expect(v5).toMatchObject({ zone: "sea", lots: SEA_LOT_COUNT });
    expect(v5.houses.map((h) => h.lot)).toEqual(Array.from({ length: SEA_LOT_COUNT }, (_, i) => i + 1));
    // 마을 주거 구역에는 오두막이 섞이지 않는다
    expect((await village(store, 5, T)).houses).toEqual([]);
  });

  it("넓히기·가구·겉모습은 오두막 쪽으로 (가방도 따로)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(200_000);
    await buyCottage(store, a, "오두막", "", "주인", null, 2);
    const p0 = await points(a);
    const r = await upgradePlot(store, a, "wide", 2, "sea");
    expect(r.house?.tier).toBe("wide");
    expect(p0 - (await points(a))).toBe(seaUpgradeCost(PLOT_TIERS[1].price, false));
    const f = await buyFurniture(store, a, "ship_wheel", 0, "sea");
    expect(f.inventory.ship_wheel).toBe(1);
    await expect(buyFurniture(store, a, "ship_wheel")).rejects.toMatchObject({ code: "NO_HOUSE" });
    expect((await setCottageStyle(store, a, "keeper")).house?.style).toBe("keeper");
  });

  it("7일 철거: 오두막 값 100%를 선물로 돌려주고 가구는 남는다. 다시 사도 시작 가구를 또 주지 않는다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000, T);
    await buyCottage(store, a, "떠난 오두막", "", "주인", 3, 2);
    const paid = seaPlotCost("small", false);
    const rep = await sweepReclaim(store, T + RECLAIM_MS + 1, { force: true, since: 0 });
    expect(rep.reclaimed.map((d) => d.id)).toContain(houseIdFor(a, "sea"));
    expect(rep.reclaimed.find((d) => d.id === houseIdFor(a, "sea"))?.label).toBe("2채널 포구 3번 오두막");
    expect(await store.get(houseIdFor(a, "sea"))).toBeNull();
    expect((await village(store, 2, T, "sea")).houses).toEqual([]);
    const note = await deliverReclaim(store, a, T + RECLAIM_MS + 2);
    expect(note).toContain(`${paid.toLocaleString("ko-KR")}P`);
    const inbox = await getGifts().inbox(a, 1, T + RECLAIM_MS + 3);
    expect(inbox.some((g) => g.points === paid)).toBe(true);
    // 가구는 남고, 다시 분양받아도 시작 가구를 두 번 주지 않는다
    await accounts.visit(a, Date.now(), true);
    const again = await buyCottage(store, a, "돌아온 오두막", "", "주인", 3, 2);
    for (const it of SEA_STARTER) expect(again.inventory[it]).toBe(1);
    expect(again.house!.layout.items.length).toBe(5);
  });

  it("시작 가구는 보통 가구: 옮기고 돌리고 가방에 넣고 되팔 수 있다. 바닥·벽은 바꾸면 그대로 남는다", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    const first = await buyCottage(store, a, "꾸밀 오두막", "", "주인", 2, 10);
    const lay = first.house!.layout;
    // 처음 들어가면 가진 가구로 놓여 있다 (가방 개수 = 놓인 개수)
    for (const p of lay.items) expect(first.inventory[p.i]).toBeGreaterThanOrEqual(1);
    // 옮기기·돌리기 (해먹을 옆으로 세워 왼쪽 벽으로, 의자는 뒤돌려) + 서핑보드는 가방으로 (배치에서 뺀다)
    const moved = lay.items
      .filter((p) => p.i !== "surfboard")
      .map((p) => (p.i === "sea_hammock" ? { ...p, x: 0, y: 2, r: 5 } : p.i === "rattan_chair" ? { ...p, x: 4, y: 4, r: 6 } : p));
    const saved = await saveLayout(store, a, "small", { items: moved, floor: "floor_deck", wall: "wall_sea" }, 10, "sea");
    expect(saved.house!.layout.items.find((p) => p.i === "sea_hammock")).toMatchObject({ x: 0, y: 2, r: 5 });
    expect(saved.house!.layout.items.find((p) => p.i === "rattan_chair")).toMatchObject({ x: 4, y: 4, r: 6 });
    expect(saved.house!.layout.items.some((p) => p.i === "surfboard")).toBe(false);
    expect(saved.inventory.surfboard).toBe(1);
    // 가방에 넣은 서핑보드는 되팔 수 있다
    const sold = await sellFurniture(store, a, "surfboard", "sea");
    expect(sold.refunded).toBeGreaterThan(0);
    expect(sold.inventory.surfboard ?? 0).toBe(0);
    // 바닥·벽 바꾸기: 산 바닷가 바닥·벽으로, 기본(낡은 장판·나무 판자 벽)으로도
    await buyFurniture(store, a, "floor_mosaic", 0, "sea");
    await buyFurniture(store, a, "wall_shell", 0, "sea");
    await saveLayout(store, a, "small", { items: moved, floor: "floor_mosaic", wall: "wall_shell" }, 10, "sea");
    expect((await myHouse(store, a, undefined, "sea")).house!.layout).toMatchObject({ floor: "floor_mosaic", wall: "wall_shell" });
    await saveLayout(store, a, "small", { items: moved, floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, 10, "sea");
    expect((await myHouse(store, a, undefined, "sea")).house!.layout).toMatchObject({ floor: DEFAULT_FLOOR, wall: DEFAULT_WALL });
    // 갖지 않은 바닥은 못 깐다
    await expect(saveLayout(store, a, "small", { items: moved, floor: "floor_sand", wall: DEFAULT_WALL }, 10, "sea")).rejects.toBeTruthy();
  });

  it("바닷가 바닥·벽지는 가구점에서 판다 (바닥 셋·벽 셋)", () => {
    const skins = FURNITURE.filter((f) => f.skin && ["floor_deck", "floor_sand", "floor_mosaic", "wall_sea", "wall_shell", "wall_driftwood"].includes(f.id));
    expect(skins.map((f) => f.skin).sort()).toEqual(["floor", "floor", "floor", "wall", "wall", "wall"]);
    for (const f of skins) expect(f.price).toBeGreaterThan(0);
  });

  it("시작 가구를 팔고 철거된 뒤 다시 사면, 가진 것만 놓인다 (시작 가구를 또 주지 않는다)", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000, T);
    await buyCottage(store, a, "판 오두막", "", "주인", 1, 8);
    // 배치를 비우고 해먹을 판다
    await saveLayout(store, a, "small", { items: [], floor: "floor_deck", wall: "wall_sea" }, 8, "sea");
    await sellFurniture(store, a, "sea_hammock", "sea");
    await sweepReclaim(store, T + RECLAIM_MS + 1, { force: true, since: 0 });
    await accounts.visit(a, Date.now(), true);
    const again = await buyCottage(store, a, "다시 산 오두막", "", "주인", 1, 8);
    expect(again.inventory.sea_hammock ?? 0).toBe(0);
    expect(again.house!.layout.items.map((p) => p.i)).not.toContain("sea_hammock");
    expect(again.house!.layout.items.length).toBe(4);
  });

  it("꾸밈 점수 순위에 오두막도 들어가고 번지 자리에 「포구 N번 오두막」", async () => {
    const store = new MemoryHouseStore();
    const a = await account(100_000);
    await buyCottage(store, a, "순위 오두막", "", "주인", 4, 9);
    const r = await houseRank(store, "all", a, 10);
    expect(r.rows.find((x) => x.name === "순위 오두막")).toMatchObject({ sub: "9채널 포구 4번 오두막 · 주인", me: true });
  });
});

describe.skipIf(!!conn)("등대 등불", () => {
  const night = Date.UTC(2026, 10, 16, 12, 0, 0); // 21:00 KST
  const day = Date.UTC(2026, 10, 16, 3, 0, 0); // 12:00 KST

  it("해가 진 뒤(17:30~새벽 5시)만", () => {
    expect(lampHour(night)).toBe(true);
    expect(lampHour(day)).toBe(false);
    expect(lampHour(Date.UTC(2026, 10, 16, 19, 30, 0))).toBe(true); // 04:30 KST
    expect(lampHour(Date.UTC(2026, 10, 16, 20, 30, 0))).toBe(false); // 05:30 KST
  });

  it("채널마다 그날 처음 켠 사람만 등대지기 + 도장 1개 (낮에는 못 켠다)", async () => {
    resetLampMemo();
    const a = nanoid();
    const b = nanoid();
    expect(await lightLamp(11, a, "가", day)).toBeNull();
    const before = (await questStore().get(a)).stamps;
    const r1 = await lightLamp(11, a, "가", night);
    expect(r1).toMatchObject({ lit: true, name: "가", stamps: before + 1 });
    const r2 = await lightLamp(11, b, "나", night + 60_000);
    expect(r2).toMatchObject({ lit: false, name: "가" });
    expect((await questStore().get(b)).stamps).toBe(0);
    expect(await lampState(11, night + 120_000)).toMatchObject({ ch: 11, name: "가" });
    // 다른 채널은 따로
    expect(await lightLamp(12, b, "나", night)).toMatchObject({ lit: true, name: "나" });
    // 11/18 보안: 한 사람은 하루에 한 채널만 (다른 채널을 돌며 도장을 모으지 못한다 — 그 채널은 켜지지 않은 채 남는다)
    const stampsB = (await questStore().get(b)).stamps;
    expect(await lightLamp(13, b, "나", night + 1000)).toMatchObject({ lit: false, done: true });
    expect((await questStore().get(b)).stamps).toBe(stampsB);
    expect(await lampState(13, night + 2000, true)).toMatchObject({ name: null });
    // 다른 사람은 그 채널을 켤 수 있다
    const c = nanoid();
    expect(await lightLamp(13, c, "다", night + 3000)).toMatchObject({ lit: true, name: "다" });
    // 개발 서버 시험: 낮에도 force로
    expect(await lightLamp(14, nanoid(), "라", day, true)).toMatchObject({ lit: true });
  });
});

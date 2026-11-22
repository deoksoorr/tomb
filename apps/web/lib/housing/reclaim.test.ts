import { nanoid } from "nanoid";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { getAccounts, getGifts } from "../store";
import { kstDay } from "../store/accounts";
import { DEFAULT_FLOOR, DEFAULT_WALL, furnitureById, PLOT_TIERS, plotCost, reclaimLastSeen, sellPrice, legacyPlotCost } from "./catalog";
import { DAY_MS, deliverReclaim, RECLAIM_FROM, RECLAIM_MS, RECLAIM_SINCE, refundOf, sweepReclaim } from "./reclaim";
import { buyFurniture, buyPlot, getHouseStore, houseIdFor, housePair, saveLayout, sellFurniture, upgradePlot, village } from "./service";
import { MemoryHouseStore } from "./store";

// 오래 비운 집 정리: 메모리 저장소에서만 (실제 Redis를 건드리지 않는다)
// 운영자 지정은 실제 저장소를 건드리지 않게 모듈을 바꿔 끼운다
const staff = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../staff", async (orig) => ({
  ...(await orig<typeof import("../staff")>()),
  staffAccountId: async () => staff.id,
  staffAccountIdNow: () => staff.id,
}));

const conn = env.redis();

describe.skipIf(!!conn)("오래 비운 집 정리", () => {
  const accounts = getAccounts();
  const store = getHouseStore();
  const PLOT = PLOT_TIERS[0].price;
  const WIDE = PLOT_TIERS[1].price;
  const T = Date.now();

  afterEach(() => {
    staff.id = null;
  });

  /** points만큼 가진 계정, 마지막 접속 = seenAt */
  async function account(points: number, seenAt = T): Promise<string> {
    const id = nanoid();
    await accounts.earn(id, "flower", kstDay());
    const now = (await accounts.get(id, kstDay(), Date.now())).points;
    await accounts.adjustPoints(id, points - now);
    await accounts.visit(id, seenAt, true);
    return id;
  }
  const points = async (id: string) => (await accounts.get(id, kstDay(), Date.now())).points;
  // 아래 시험은 규칙 시작 유예를 끈다 (since 0). 유예는 따로 본다
  const sweep = (at: number, since = 0) => sweepReclaim(store, at, { force: true, since });
  const reclaimedIds = async (at: number) => (await sweep(at)).reclaimed.map((d) => d.id);

  it("메모리 저장소에서 돈다", () => {
    expect(store).toBeInstanceOf(MemoryHouseStore);
  });

  it("7일이 지나기 전에는 남기고, 지나면 비운다. 번지가 비어 다른 사람이 그 번지를 살 수 있다", async () => {
    const owner = await account(PLOT + WIDE + 300);
    const { house } = await buyPlot(store, owner, "떠난 집", "", "주인");
    const id = houseIdFor(owner);
    const lot = house!.lot;
    await upgradePlot(store, owner, "wide");

    expect(await reclaimedIds(T + 6 * DAY_MS)).not.toContain(id);
    expect(await reclaimedIds(T + RECLAIM_MS - 1)).not.toContain(id);
    expect(await store.get(id)).not.toBeNull();

    const r = await sweep(T + RECLAIM_MS + 1);
    expect(r.reclaimed.find((d) => d.id === id)).toMatchObject({ points: PLOT + WIDE, label: `1채널 ${lot}번지` });
    expect(await store.get(id)).toBeNull();
    expect((await village(store, 1)).houses.some((h) => h.lot === lot)).toBe(false);

    const next = await account(PLOT);
    const bought = await buyPlot(store, next, "새 주인 집", "", "새 주인", lot, 1);
    expect(bought.house?.lot).toBe(lot);
  });

  it("환불: 낸 포인트(분양가 + 넓히기) 그대로 선물함으로, 한 번만. 받으면 지갑에 들어온다", async () => {
    const owner = await account(PLOT + WIDE);
    await buyPlot(store, owner, "환불 집", "", "주인");
    await upgradePlot(store, owner, "wide");
    expect(await points(owner)).toBe(0);
    const id = houseIdFor(owner);
    expect(await reclaimedIds(T + RECLAIM_MS + 1)).toContain(id);
    // 비우기만 하고 지갑에는 아직 넣지 않는다 (돌아와 선물함을 열 때 선물로)
    expect(await points(owner)).toBe(0);

    const now = T + RECLAIM_MS + 2;
    const notice = await deliverReclaim(store, owner, now);
    expect(notice).toContain(`${(PLOT + WIDE).toLocaleString("ko-KR")}P`);
    expect(await deliverReclaim(store, owner, now)).toBeNull();

    const inbox = await getGifts().inbox(owner, 1, now);
    const mine = inbox.filter((g) => g.from === RECLAIM_FROM);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ points: PLOT + WIDE, items: [] });
    expect(mine[0].note).toContain("집을 철거했어요");

    const got = await getGifts().claim(owner, mine[0].id, 1, now);
    expect(got).toMatchObject({ ok: true, points: PLOT + WIDE });
    expect(await getGifts().claim(owner, mine[0].id, 1, now)).toMatchObject({ ok: false });
    expect(await points(owner)).toBe(PLOT + WIDE);
  });

  it("두 번 정리해도(동시에 불러도) 한 번만 비우고 한 번만 돌려준다", async () => {
    const owner = await account(PLOT);
    await buyPlot(store, owner, "한 번만", "", "주인");
    const id = houseIdFor(owner);
    const at = T + RECLAIM_MS + 10;
    const [a, b] = await Promise.all([sweep(at), sweep(at)]);
    const hits = [...a.reclaimed, ...b.reclaimed].filter((d) => d.id === id);
    expect(hits).toHaveLength(1);
    expect(await reclaimedIds(at + 1)).not.toContain(id);
    expect(await store.pendingReclaims(id)).toEqual([expect.objectContaining({ points: PLOT })]);
    const r = await store.reclaim(id, { owner, tier: "small", ch: 1, points: PLOT, cutoff: at, lastSeenAt: T, label: "x", now: at, since: 0 });
    expect(r).toBe("gone");
    expect(await store.pendingReclaims(id)).toHaveLength(1);
  });

  it("놓았던 가구는 가방에 그대로 남고, 다시 분양받으면 놓지 않은 상태로 쓸 수 있다", async () => {
    const desk = furnitureById("desk")!;
    const owner = await account(PLOT * 2 + desk.price);
    await buyPlot(store, owner, "가구 집", "", "주인");
    await buyFurniture(store, owner, "desk");
    await saveLayout(store, owner, "small", { items: [{ u: "a", i: "desk", x: 0, y: 0, r: 0 }], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL });
    const id = houseIdFor(owner);
    expect(await reclaimedIds(T + RECLAIM_MS + 1)).toContain(id);
    expect((await store.inventory(housePair(owner), "village")).have).toEqual({ desk: 1 });

    // 돌아와 다시 분양: 가방은 그대로, 집 안은 비어 있다 → 되팔 수도 있다
    await accounts.visit(owner, T + RECLAIM_MS + 2, true);
    const again = await buyPlot(store, owner, "다시 지은 집", "", "주인");
    expect(again.inventory).toEqual({ desk: 1 });
    expect(again.house?.layout.items).toEqual([]);
    const before = await points(owner);
    const sold = await sellFurniture(store, owner, "desk");
    expect(sold.refunded).toBe(sellPrice(desk));
    expect(await points(owner)).toBe(before + sellPrice(desk));
  });

  it("11/22 정리를 돌 때 순위 점수 맞추기를 저장소마다 한 번만 묻는다 (실패해도 정리는 그대로)", async () => {
    const s = new MemoryHouseStore();
    const spy = vi.spyOn(s, "syncRankScores").mockRejectedValueOnce(new Error("끊김"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await sweepReclaim(s, T, { force: true })).checked).toBe(0);
    await sweepReclaim(s, T, { force: true });
    await sweepReclaim(s, T, { force: true });
    // 처음은 실패 → 다음 정리에서 다시, 성공한 뒤로는 묻지 않는다
    expect(spy).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("운영자 집은 비우지 않는다", async () => {
    const owner = await account(PLOT);
    await buyPlot(store, owner, "운영자 집", "", "운영자");
    staff.id = owner;
    expect(await reclaimedIds(T + 30 * DAY_MS)).not.toContain(houseIdFor(owner));
    expect(await store.get(houseIdFor(owner))).not.toBeNull();
  });

  it("7일 안에 다시 들어온 주인은 집을 지킨다 (정리하는 순간 돌아와도)", async () => {
    const owner = await account(PLOT);
    await buyPlot(store, owner, "돌아온 집", "", "주인");
    const id = houseIdFor(owner);
    await accounts.visit(owner, T + 5 * DAY_MS, true);
    expect(await reclaimedIds(T + RECLAIM_MS + 1)).not.toContain(id);
    expect(await store.get(id)).not.toBeNull();

    // 정리 대상으로 읽은 뒤 비우기 직전에 돌아왔다 → 저장소가 마지막 확인에서 거절한다
    const at = T + 5 * DAY_MS + RECLAIM_MS + 1;
    const r = await store.reclaim(id, { owner, tier: "small", ch: 1, points: PLOT, cutoff: at - RECLAIM_MS, lastSeenAt: at - 1, label: "x", now: at, since: 0 });
    expect(r).toBe("active");
    expect(await store.get(id)).not.toBeNull();
    expect(await store.pendingReclaims(id)).toEqual([]);
  });

  it("넓힌 사이에 비우지 않는다 (읽은 터 크기와 다르면 changed)", async () => {
    const owner = await account(PLOT + WIDE);
    await buyPlot(store, owner, "넓힌 집", "", "주인");
    await upgradePlot(store, owner, "wide");
    const at = T + RECLAIM_MS + 1;
    const r = await store.reclaim(houseIdFor(owner), { owner, tier: "small", ch: 1, points: PLOT, cutoff: at - RECLAIM_MS, lastSeenAt: T, label: "x", now: at, since: 0 });
    expect(r).toBe("changed");
  });

  it("낸 포인트 기록이 없는 옛 집은 값을 올리기 전 가격표로 센다 (11/19)", async () => {
    expect(refundOf({ tier: "wide" })).toBe(legacyPlotCost("wide"));
    expect(legacyPlotCost("wide")).toBe(5_000);
    expect(legacyPlotCost("wide")).toBeLessThan(plotCost("wide"));
    expect(refundOf({ tier: "manor", paid: 1234 })).toBe(1234);
    const owner = await account(0);
    const id = houseIdFor(owner);
    await store.create({ id, owner, name: "옛 집", intro: "", ownerName: "주인", tier: "wide", lot: null, now: T });
    expect((await store.get(id))?.paid).toBeUndefined();
    const r = await sweep(T + RECLAIM_MS + 1);
    expect(r.reclaimed.find((d) => d.id === id)?.points).toBe(legacyPlotCost("wide"));
  });

  it("접속 기록이 없는 계정의 집은 비우지 않는다", async () => {
    const id = nanoid(12);
    await store.create({ id, owner: `ghost_${id}`, name: "기록 없음", intro: "", ownerName: "", tier: "small", lot: null, now: T, paid: PLOT });
    expect(await reclaimedIds(T + 60 * DAY_MS)).not.toContain(id);
    await store.remove(id);
  });

  it("규칙을 켠 시각은 2026-11-16 05:00 KST이고, 그 전 접속은 그 시각으로 센다", () => {
    expect(new Date(RECLAIM_SINCE).toISOString()).toBe("2026-11-15T20:00:00.000Z");
    expect(new Date(RECLAIM_SINCE + RECLAIM_MS).toISOString()).toBe("2026-11-22T20:00:00.000Z");
    expect(reclaimLastSeen(RECLAIM_SINCE - 30 * DAY_MS)).toBe(RECLAIM_SINCE);
    expect(reclaimLastSeen(RECLAIM_SINCE + 1)).toBe(RECLAIM_SINCE + 1);
    expect(reclaimLastSeen(0)).toBe(0);
  });

  it("유예: 규칙을 켜기 전에 떠난 주인도 켠 뒤 7일이 지나야 비운다", async () => {
    // 견줄 집: 유예가 없으면(since 0) 30일 전에 떠난 주인의 집은 바로 비운다
    const control = await account(PLOT, T - 30 * DAY_MS);
    await buyPlot(store, control, "견줄 집", "", "주인");
    expect(await reclaimedIds(T)).toContain(houseIdFor(control));

    // 규칙을 T에 켰다: 30일 전에 떠난 주인도 T + 7일까지는 남긴다
    const since = T;
    const owner2 = await account(PLOT, T - 30 * DAY_MS);
    await buyPlot(store, owner2, "유예 집", "", "주인");
    const id2 = houseIdFor(owner2);
    expect((await sweep(T + 6 * DAY_MS, since)).reclaimed.map((d) => d.id)).not.toContain(id2);
    expect((await sweep(T + RECLAIM_MS - 1, since)).reclaimed.map((d) => d.id)).not.toContain(id2);
    expect(await store.get(id2)).not.toBeNull();
    // 저장소 마지막 확인(Lua와 같은 규칙)도 since를 본다
    const at = T + RECLAIM_MS - 1;
    const early = await store.reclaim(id2, { owner: owner2, tier: "small", ch: 1, points: PLOT, cutoff: at - RECLAIM_MS, since, lastSeenAt: T - 30 * DAY_MS, label: "x", now: at });
    expect(early).toBe("active");
    expect((await sweep(T + RECLAIM_MS + 1, since)).reclaimed.map((d) => d.id)).toContain(id2);
  });
});

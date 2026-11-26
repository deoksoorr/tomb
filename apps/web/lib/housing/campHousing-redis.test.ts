import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { CAMP_FIXTURES, CAMP_FLOOR, DEFAULT_FLOOR, DEFAULT_WALL, houseShape, seaUpgradeCost } from "./catalog";
import {
  buyCampHome,
  buyFurniture,
  buyPlot,
  getHouseStore,
  houseIdFor,
  houseIdsOf,
  myHouse,
  saveLayout,
  sellFurniture,
  upgradePlot,
  upgradeYard,
  village,
} from "./service";
import { HK, RedisHouseStore } from "./store-redis";
import type { Placed } from "./types";

// 11/26 캠핑장 집 (실제 Redis — 일회용 DB). 여러 계정으로 분양 → 넓히기 거절 → 앞마당 → 배치 저장 → 가방까지 끝까지 (메모리 시험으론 HMGET 배열 같은 건 안 잡힌다)
const conn = env.redis();

describe.skipIf(!conn)("캠핑장 집 (실제 Redis)", () => {
  const raw = conn ? new Redis({ ...conn, automaticDeserialization: false }) : null!;
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
  const hget = async (key: string, f: string) => {
    const v = await raw.hget(key, f);
    return v === null ? null : String(v);
  };

  it("무주택 카라반(폭포 앞): 분양 13,500 → 넓히기 거절 → 앞마당 20,250·33,750 (방 12×7 → 14×8) → 기본 가구 옮겨 저장 → 가방·순위 점수", async () => {
    const a = await account(100_000);
    const ch = 9;
    let p = await points(a);
    const r = await buyCampHome(store, a, "폭포 카라반", "", "가", 1, ch);
    expect(p - (p = await points(a))).toBe(13_500);
    const id = houseIdFor(a, "camp");
    expect(r.house).toMatchObject({ id, zone: "camp", lot: 1, ch, camp: { kind: "caravan", yard: 1 }, name: "폭포 카라반" });
    expect(r.house?.villa).toBeUndefined();
    expect(await hget(HK.meta(id), "zone")).toBe("camp");
    expect(await hget(HK.meta(id), "kind")).toBe("caravan");
    expect(await hget(HK.meta(id), "yard")).toBe("1");
    expect(await hget(HK.meta(id), "villa")).toBe("0");
    expect(await hget(HK.campLots(ch), "1")).toBe(id);
    expect(r.prices?.yard).toEqual({ to: 2, price: 20_250 });
    expect(r.inventory).toEqual({});

    await expect(upgradePlot(store, a, "wide", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER" });
    expect(await points(a)).toBe(p);
    const y2 = await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(20_250);
    expect(houseShape(y2.house!)).toMatchObject({ w: 12, h: 7, maxItems: 30 });
    // 순위 ZSET도 같은 Lua에서 (카라반 2단계 방 +15)
    expect(Number(await raw.zscore(HK.score, id))).toBe(15);
    const y3 = await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(33_750);
    expect(y3.house?.camp?.yard).toBe(3);
    expect(Number(await raw.zscore(HK.score, id))).toBe(30);
    expect(Number(await hget(HK.meta(id), "paid"))).toBe(67_500);
    await expect(upgradeYard(store, a, ch)).rejects.toMatchObject({ code: "MAX_YARD" });

    // 기본 가구 옮기고 돌리기 + 산 가구 (가방은 공용, 기본 가구는 가방에 없다)
    await buyFurniture(store, a, "stone_lantern", 0, "camp");
    await expect(sellFurniture(store, a, "fx_cv_toilet", "camp")).rejects.toMatchObject({ code: "FIXTURE" });
    const base = y3.house!.layout;
    const moved: Placed[] = base.items.map((it) => (it.i === "fx_cv_toilet" ? { ...it, x: 12, y: 5, r: 5 } : it));
    const saved = await saveLayout(store, a, "small", { ...base, items: [...moved, { u: "l1", i: "stone_lantern", x: 6, y: 6, r: 0 }] }, ch, "camp");
    expect(saved.house?.layout.items.find((i) => i.i === "fx_cv_toilet")).toMatchObject({ x: 12, y: 5, r: 5 });
    expect(saved.house?.layout.floor).toBe(CAMP_FLOOR.caravan);
    expect(saved.inventory).toEqual({ stone_lantern: 1 });
    expect(await hget(HK.meta(id), "items")).toBe("1");
    const placed = ((await raw.hgetall(HK.placed(id))) as unknown as string[] | null) ?? [];
    expect(placed).toEqual(["stone_lantern", "1"]);
    // 기본 가구를 빼고 저장은 못 한다
    await expect(saveLayout(store, a, "small", { ...base, items: moved.filter((i) => i.i !== "fx_cv_bed") }, ch, "camp")).rejects.toMatchObject({ code: "FIXTURE" });
    // 꾸밈 점수 = 석등 14 + 크기 30
    expect((await myHouse(store, a, undefined, "camp")).house?.score).toBe(14 + 30);
    expect(Number(await raw.zscore(HK.score, id))).toBe(14 + 30);
  });

  it("1주택(마을 집) 펜션: 별장 12,000 → 넓히기 거절 → 앞마당 별장 값 18,000(+30점, 방 14×10) · 세 집 공용 가방 · 다른 사람은 같은 터 거절 · 한 사람 한 채", async () => {
    const [a, b] = await Promise.all([account(200_000), account(100_000)]);
    const ch = 10;
    await buyPlot(store, a, "마을", "", "가", 14, ch);
    let p = await points(a);
    const r = await buyCampHome(store, a, "", "", "가", 13, ch);
    expect(p - (p = await points(a))).toBe(12_000);
    expect(r.house).toMatchObject({ villa: true, name: "솔바람채", camp: { kind: "pension", yard: 1 } });
    expect(await hget(HK.meta(houseIdFor(a, "camp")), "villa")).toBe("1");
    expect(r.prices?.upgrade).toBeNull();
    await expect(upgradePlot(store, a, "wide", ch, "camp")).rejects.toMatchObject({ code: "BAD_TIER" });
    expect(await points(a)).toBe(p);
    const w = await upgradeYard(store, a, ch);
    expect(p - (p = await points(a))).toBe(18_000);
    expect(houseShape(w.house!)).toMatchObject({ w: 14, h: 10, maxItems: 50 });
    expect(w.house?.score).toBe(30);
    expect(Number(await raw.zscore(HK.score, houseIdFor(a, "camp")))).toBe(30);
    expect(w.prices?.yard).toEqual({ to: 3, price: 30_000 });
    await expect(buyCampHome(store, a, "", "", "가", 2, ch)).rejects.toMatchObject({ code: "ALREADY_OWNED" });
    await expect(buyCampHome(store, b, "", "", "나", 13, ch)).rejects.toMatchObject({ code: "LOT_TAKEN" });
    expect(await points(a)).toBe(p);
    expect(await points(b)).toBe(100_000);
    // 세 집 공용 가방: 펜션에 놓은 석등은 마을 집에서 「다른 집에」
    await buyFurniture(store, a, "stone_lantern", 0, "village");
    const pen = w.house!.layout;
    await saveLayout(store, a, "small", { ...pen, items: [...pen.items, { u: "l1", i: "stone_lantern", x: 11, y: 2, r: 0 }] }, ch, "camp");
    const v = await myHouse(store, a);
    expect(v.inventory.stone_lantern ?? 0).toBe(0);
    expect(v.away?.stone_lantern).toBe(1);
    await expect(saveLayout(store, a, "small", { items: [{ u: "l1", i: "stone_lantern", x: 1, y: 1, r: 0 }], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL }, ch)).rejects.toMatchObject({
      code: "NOT_OWNED",
    });
    // 마을 목록: 캠핑장 집터 16, 종류·앞마당이 붙는다
    const vc = await village(store, ch, Date.now(), "camp");
    expect(vc).toMatchObject({ zone: "camp", lots: 16 });
    expect(vc.houses.find((h) => h.lot === 13)).toMatchObject({ zone: "camp", camp: { kind: "pension", yard: 2 }, villa: true, tier: "small" });
    expect((await village(store, ch, Date.now())).houses.map((h) => h.lot)).toEqual([14]);
  });

  it("옛 기록(villa 칸 없음): 마을+오두막이면 오두막만 별장으로 한 번 남긴다 (HSETNX), 오두막 넓히기 2배", async () => {
    const a = await account(200_000);
    const ch = 8;
    await store.create({ id: houseIdFor(a, "sea"), owner: a, name: "옛 오두막", intro: "", ownerName: "가", tier: "small", ch, lot: 3, now: 1, zone: "sea", paid: 9_000 });
    await store.create({ id: houseIdFor(a), owner: a, name: "옛 마을", intro: "", ownerName: "가", tier: "small", ch, lot: 7, now: 2, paid: 9_000 });
    expect(await hget(HK.meta(houseIdFor(a, "sea")), "villa")).toBeNull();
    const s = await myHouse(store, a, undefined, "sea");
    expect(s.house?.villa).toBe(true);
    expect(await hget(HK.meta(houseIdFor(a, "sea")), "villa")).toBe("1");
    expect(await hget(HK.meta(houseIdFor(a)), "villa")).toBe("0");
    expect(s.prices?.villa).toEqual({ village: false, sea: true, camp: true });
    const p = await points(a);
    await upgradePlot(store, a, "wide", ch, "sea");
    expect(p - (await points(a))).toBe(seaUpgradeCost(9_000, true));
    // 세 번째(캠핑장)는 별장
    await buyCampHome(store, a, "", "", "가", 15, ch);
    expect(p - (await points(a))).toBe(18_000 + 12_000);
  });

  it("동시에 두 구역을 사도 첫 집은 하나 (Lua 안에서 다른 집을 본다)", async () => {
    for (let i = 0; i < 3; i++) {
      const a = await account(100_000);
      const ch = 5 + i;
      const p = await points(a);
      const r = await Promise.allSettled([buyPlot(store, a, "마을", "", "가", null, ch), buyCampHome(store, a, "", "", "가", 5, ch)]);
      for (const x of r) if (x.status === "rejected") expect(x.reason).toMatchObject({ code: "VILLA_CHANGED" });
      const hs = await Promise.all([store.get(houseIdFor(a)), store.get(houseIdFor(a, "camp"))]);
      expect(hs.filter((h) => h && h.villa === false).length).toBe(1);
      expect(p - (await points(a))).toBe(hs.reduce((s, h) => s + (h?.paid ?? 0), 0));
    }
  });

  it("기본 가구 정의가 Lua 가방 표(OWN·SKIN)에 섞이지 않는다 — 분양 직후 가방·놓은 개수 비어 있음", async () => {
    const a = await account(100_000);
    const r = await buyCampHome(store, a, "", "", "가", 16, 4);
    expect(r.house?.layout.items.map((i) => i.i).sort()).toEqual([...CAMP_FIXTURES.rural].sort());
    expect(((await raw.hgetall(HK.placed(houseIdFor(a, "camp")))) as unknown as string[] | null) ?? []).toEqual([]);
    expect((await myHouse(store, a, undefined, "village")).inventory).toEqual({});
  });
});

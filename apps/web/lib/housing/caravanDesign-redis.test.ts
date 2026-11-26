import { Redis } from "@upstash/redis";
import { defaultCaravanDesign, type CaravanDesign } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { buyCampHome, getHouseStore, houseIdFor, houseIdsOf, myHouse, setCaravanDesign, upgradeYard, village } from "./service";
import { HK, RedisHouseStore } from "./store-redis";

// 11/26 카라반 디자인 (실제 Redis — 일회용 DB): 분양 Lua의 design 칸 · 디자인 바꾸기 Lua · 디자인 칸 없는 옛 기록 · 여러 계정 마을 목록 · brief(HMGET 배열)

const conn = env.redis();

describe.skipIf(!conn)("카라반 디자인 (실제 Redis)", () => {
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
  const hget = async (key: string, f: string) => {
    const v = await raw.hget(key, f);
    return v === null ? null : String(v);
  };

  it("여러 계정: 고른 디자인으로 분양 → 마을 목록 → 무료로 바꾸기 → 앞마당을 올려도 디자인 그대로", async () => {
    const ch = 7;
    const a = await account(100_000);
    const b = await account(100_000);
    const c = await account(100_000);
    const da: CaravanDesign = { model: "bus", color: 3, awning: 2 };
    const ra = await buyCampHome(store, a, "", "", "가", 1, ch, "caravan", da);
    expect(ra.house?.camp).toEqual({ kind: "caravan", yard: 1, design: da });
    expect(await hget(HK.meta(houseIdFor(a, "camp")), "design")).toBe("bus.3.2");
    // 디자인 없이 산 카라반은 그 자리 기본 모습을 적어 둔다 (2번 강가 = 티어드롭 2·차양 2), 펜션은 design 칸이 없다
    await buyCampHome(store, b, "", "", "나", 2, ch);
    expect(await hget(HK.meta(houseIdFor(b, "camp")), "design")).toBe("teardrop.2.2");
    await buyCampHome(store, c, "", "", "다", 13, ch, "pension", { model: "airstream", color: 0, awning: 0 });
    expect(await hget(HK.meta(houseIdFor(c, "camp")), "design")).toBeNull();

    const v = await village(store, ch, Date.now(), "camp");
    expect(v.houses.find((h) => h.lot === 1)?.camp?.design).toEqual(da);
    expect(v.houses.find((h) => h.lot === 2)?.camp?.design).toEqual(defaultCaravanDesign(2));
    expect(v.houses.find((h) => h.lot === 13)?.camp).toEqual({ kind: "pension", yard: 1 });

    const p = (await accounts.get(a, kstDay(), Date.now())).points;
    const d2: CaravanDesign = { model: "airstream", color: 2, awning: 1 };
    expect((await setCaravanDesign(store, a, d2)).house?.camp?.design).toEqual(d2);
    expect(await hget(HK.meta(houseIdFor(a, "camp")), "design")).toBe("airstream.2.1");
    expect((await accounts.get(a, kstDay(), Date.now())).points).toBe(p);
    // 펜션 주인은 못 바꾼다 (Lua도 0)
    await expect(setCaravanDesign(store, c, d2)).rejects.toMatchObject({ code: "NOT_CARAVAN" });
    expect(await store.setCampDesign(houseIdFor(c, "camp"), d2, Date.now())).toBe(false);
    expect(await store.setCampDesign(houseIdFor(a, "village"), d2, Date.now())).toBe(false);

    const y = await upgradeYard(store, a, ch);
    expect(y.house?.camp).toEqual({ kind: "caravan", yard: 2, design: d2 });
    // brief (HMGET 배열)에도 디자인
    const [brief] = await store.brief([houseIdFor(a, "camp")]);
    expect(brief?.camp).toEqual({ kind: "caravan", yard: 2, design: d2 });
  });

  it("디자인 칸이 없거나 이상한 옛 기록은 그 자리 기본 모습 (지금 그림 그대로)", async () => {
    const a = await account(100_000);
    await buyCampHome(store, a, "", "", "가", 7, 8, "caravan", { model: "teardrop", color: 0, awning: 0 });
    const id = houseIdFor(a, "camp");
    await raw.hdel(HK.meta(id), "design");
    expect((await myHouse(store, a, undefined, "camp")).house?.camp?.design).toEqual(defaultCaravanDesign(7));
    await raw.hset(HK.meta(id), { design: "van.9.9" });
    expect((await myHouse(store, a, undefined, "camp")).house?.camp?.design).toEqual(defaultCaravanDesign(7));
  });
});

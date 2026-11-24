import type { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterAll, expect, it } from "vitest";
import { HOUSING_CHANNELS, SEA_FLOOR, SEA_STARTER, SEA_WALL, type HouseZone } from "./catalog";
import { SEA_STARTER_KEEP, type HousePair, type HouseStore } from "./store";

// 11/16 공용 가구 가방 계약: MemoryHouseStore·RedisHouseStore가 똑같이 지켜야 하는 동작 (sharedBag.test.ts가 두 구현에 돌린다).
// raw가 있으면(Redis) 옛 집마다 가방 → 공용 가방 옮기기도 본다. seen = Redis 정리 Lua가 읽는 주인 접속 기록 심기

export type BagKit = {
  make: () => HouseStore;
  raw?: () => Redis;
  seen?: (owner: string, at: number) => Promise<void>;
  cleanup?: (pairs: HousePair[]) => Promise<void>;
};

export function sharedBagContract(kit: BagKit) {
  const store = kit.make();
  const used: HousePair[] = [];
  let n = 0;
  afterAll(async () => kit.cleanup?.(used));

  const pairOf = (): HousePair => {
    const p = { village: nanoid(12), sea: nanoid(12) };
    used.push(p);
    return p;
  };
  /** 두 집 (오두막은 시작 가구 없이 — starter=true면 시작 가구·시작 배치 개수와 함께) */
  async function both(starter = false) {
    const pair = pairOf();
    const owner = `o_${pair.village}`;
    const ch = (n++ % HOUSING_CHANNELS) + 1;
    expect(await store.create({ id: pair.village, owner, name: "마을", intro: "", ownerName: "주인", tier: "small", ch, lot: null, now: 1 })).toMatchObject({ lot: expect.any(Number) });
    const placed = starter ? Object.fromEntries(SEA_STARTER.map((i) => [i, 1])) : undefined;
    expect(
      await store.create({ id: pair.sea, owner, name: "오두막", intro: "", ownerName: "주인", tier: "small", ch, lot: null, now: 1, zone: "sea", ...(starter ? { starter: SEA_STARTER, placed } : {}) }),
    ).toMatchObject({ lot: expect.any(Number) });
    return { pair, owner, ch };
  }
  const save = (pair: HousePair, zone: HouseZone, counts: Record<string, number>) => store.saveDesign(pair, zone, "small", null, null, counts, 0, 2);
  const view = (pair: HousePair, zone: HouseZone) => store.inventory(pair, zone);

  it("가구는 두 집 공용: 한 집에서 사면 다른 집에서도 보이고, 한 집에 놓은 만큼 다른 집에서 빠진다", async () => {
    const { pair } = await both();
    expect(await store.addItem(pair, "village", "pot", 20)).toBe("ok");
    expect(await store.addItem(pair, "sea", "pot", 20)).toBe("ok");
    expect(await view(pair, "village")).toEqual({ have: { pot: 2 }, away: {} });
    expect(await view(pair, "sea")).toEqual({ have: { pot: 2 }, away: {} });
    expect(await save(pair, "village", { pot: 1 })).toBe("ok");
    expect(await view(pair, "sea")).toEqual({ have: { pot: 1 }, away: { pot: 1 } });
    expect(await view(pair, "village")).toEqual({ have: { pot: 2 }, away: {} });
    expect(await save(pair, "village", { pot: 2 })).toBe("ok");
    expect(await view(pair, "sea")).toEqual({ have: {}, away: { pot: 2 } });
    expect(await save(pair, "sea", { pot: 1 })).toBe("not_owned");
    // 상한은 공용 가방 기준 (어느 집에서 사든)
    expect(await store.addItem(pair, "sea", "pot", 2)).toBe("max");
  });

  it("두 집을 동시에 저장해도 합쳐서 가진 것보다 많이 놓이지 않는다", async () => {
    for (let round = 0; round < 3; round++) {
      const { pair } = await both();
      await store.addItem(pair, "village", "desk", 20);
      const r = await Promise.all([save(pair, "village", { desk: 1 }), save(pair, "sea", { desk: 1 })]);
      expect([...r].sort()).toEqual(["not_owned", "ok"]);
      // 놓은 집에서 치우면 다른 집에 놓을 수 있다
      const [won, lost] = r[0] === "ok" ? (["village", "sea"] as const) : (["sea", "village"] as const);
      expect(await save(pair, lost, { desk: 1 })).toBe("not_owned");
      expect(await save(pair, won, {})).toBe("ok");
      expect(await save(pair, lost, { desk: 1 })).toBe("ok");
    }
  });

  it("되팔기는 두 집 어디에도 놓이지 않은 것만 (다른 집에 놓였으면 away)", async () => {
    const { pair } = await both();
    await store.addItem(pair, "village", "pot", 20);
    expect(await save(pair, "village", { pot: 1 })).toBe("ok");
    expect(await store.takeItem(pair, "sea", "pot")).toBe("away");
    expect(await store.takeItem(pair, "village", "pot")).toBe("placed");
    expect(await save(pair, "village", {})).toBe("ok");
    expect(await store.takeItem(pair, "sea", "pot")).toBe("ok");
    expect(await store.takeItem(pair, "sea", "pot")).toBe("none");
    expect(await view(pair, "village")).toEqual({ have: {}, away: {} });
    // 동시에 두 집에서 팔아도 하나만
    await store.addItem(pair, "village", "pot", 20);
    const r = await Promise.all([store.takeItem(pair, "village", "pot"), store.takeItem(pair, "sea", "pot")]);
    expect([...r].sort()).toEqual(["none", "ok"]);
  });

  it("철거: 그 집에 놓였던 공용 가구는 가방으로 돌아가 다른 집에 놓을 수 있다 (오두막 몫 가방은 남는다)", async () => {
    const { pair, owner, ch } = await both(true);
    await store.addItem(pair, "village", "pot", 20);
    expect(await save(pair, "sea", { ...Object.fromEntries(SEA_STARTER.map((i) => [i, 1])), pot: 1 })).toBe("ok");
    // 11/24 시작 바닥·벽지도 공용 가방 → 오두막에 입힌 것은 마을 집에서 「다른 집에」
    expect(await view(pair, "village")).toEqual({ have: {}, away: { pot: 1, [SEA_FLOOR]: 1, [SEA_WALL]: 1 } });
    await kit.seen?.(owner, 5);
    const r = await store.reclaim(pair.sea, { owner, tier: "small", ch, points: 0, cutoff: 10, since: 0, lastSeenAt: 5, label: "x", now: 20, zone: "sea" });
    expect(r).toEqual({ points: 0 });
    expect(await view(pair, "village")).toEqual({ have: { pot: 1, [SEA_FLOOR]: 1, [SEA_WALL]: 1 }, away: {} });
    expect(await save(pair, "village", { pot: 1, [SEA_FLOOR]: 1 })).toBe("ok");
    const own = await store.ownItems(pair.sea);
    for (const it of SEA_STARTER_KEEP) expect(own[it]).toBe(1);
    expect(own[SEA_FLOOR]).toBeUndefined();
  });

  it("11/24 바닥·벽지는 두 집 공용 (하나로 집 한 채), 외관은 산 집 것", async () => {
    const { pair } = await both();
    expect(await store.addItem(pair, "sea", "floor_wood", 20)).toBe("ok");
    expect(await store.addItem(pair, "village", "roof_red", 20)).toBe("ok");
    expect(await view(pair, "sea")).toEqual({ have: { floor_wood: 1 }, away: {} });
    expect(await view(pair, "village")).toEqual({ have: { roof_red: 1, floor_wood: 1 }, away: {} });
    expect(await save(pair, "sea", { roof_red: 1 })).toBe("not_owned");
    // 마을 집에 입히면 오두막에선 다른 집에 쓰는 중
    expect(await save(pair, "village", { floor_wood: 1 })).toBe("ok");
    expect(await view(pair, "sea")).toEqual({ have: {}, away: { floor_wood: 1 } });
    expect(await save(pair, "sea", { floor_wood: 1 })).toBe("not_owned");
    expect(await store.takeItem(pair, "sea", "floor_wood")).toBe("away");
    expect(await store.takeItem(pair, "village", "floor_wood")).toBe("placed");
    // 상한은 공용 기준 (어느 집에서 사든)
    expect(await store.addItem(pair, "sea", "floor_wood", 1)).toBe("max");
    // 마을 집에서 벗기면 오두막에 쓸 수 있다
    expect(await save(pair, "village", {})).toBe("ok");
    expect(await save(pair, "sea", { floor_wood: 1 })).toBe("ok");
    expect(await store.takeItem(pair, "village", "floor_wood")).toBe("away");
  });

  it("11/24 예전 집 몫 바닥·벽지(오두막 시작 바닥·벽지)는 공용 가방으로 한 번만 옮기고, 입힌 것은 쓰는 중으로 센다", async () => {
    const { pair } = await both(true);
    const sea = await view(pair, "sea");
    expect(sea.have).toMatchObject({ [SEA_FLOOR]: 1, [SEA_WALL]: 1 });
    expect(await view(pair, "village")).toEqual({ have: {}, away: { [SEA_FLOOR]: 1, [SEA_WALL]: 1 } });
    // 다시 읽어도 같다 (두 번 더하지 않는다)
    expect(await view(pair, "sea")).toEqual(sea);
    expect((await store.ownItems(pair.sea))[SEA_FLOOR]).toBeUndefined();
    expect(await save(pair, "village", { [SEA_FLOOR]: 1 })).toBe("not_owned");
    expect(await save(pair, "sea", Object.fromEntries(SEA_STARTER.map((i) => [i, 1])))).toBe("ok");
    expect(await store.takeItem(pair, "sea", SEA_FLOOR)).toBe("placed");
    // 오두막에서 벗기면 마을 집에 쓸 수 있다
    expect(await save(pair, "sea", Object.fromEntries(SEA_STARTER_KEEP.map((i) => [i, 1])))).toBe("ok");
    expect(await save(pair, "village", { [SEA_FLOOR]: 1, [SEA_WALL]: 1 })).toBe("ok");
  });

  it("오두막 시작 가구는 오두막 몫: 마을 집에서 못 쓰고, 산 것은 공용으로 더해진다", async () => {
    const { pair } = await both(true);
    expect((await view(pair, "village")).have.sea_hammock).toBeUndefined();
    expect((await view(pair, "sea")).have.sea_hammock).toBe(1);
    expect(await save(pair, "village", { sea_hammock: 1 })).toBe("not_owned");
    expect(await store.addItem(pair, "village", "sea_hammock", 20)).toBe("ok");
    expect((await view(pair, "village")).have.sea_hammock).toBe(1);
    expect((await view(pair, "sea")).have.sea_hammock).toBe(2);
    // 오두막에 둘 다 놓으면 하나는 공용에서 꺼낸 것 → 마을 집에서는 다른 집에 놓인 것
    expect(await save(pair, "sea", { sea_hammock: 2 })).toBe("ok");
    expect(await view(pair, "village")).toMatchObject({ away: { sea_hammock: 1 } });
    expect(await save(pair, "village", { sea_hammock: 1 })).toBe("not_owned");
    expect(await store.takeItem(pair, "sea", "sea_hammock")).toBe("placed");
    // 오두막에 하나만 두면 (시작 몫으로) 공용 하나는 마을 집에 놓을 수 있다
    expect(await save(pair, "sea", { sea_hammock: 1 })).toBe("ok");
    expect(await save(pair, "village", { sea_hammock: 1 })).toBe("ok");
    // 되팔기는 놓이지 않은 것만 — 지금은 둘 다 놓였다
    expect(await store.takeItem(pair, "sea", "sea_hammock")).toBe("placed");
  });

  it("오두막만 있어도 공용 가방은 같은 자리 (마을 집 id)", async () => {
    const pair = pairOf();
    const ch = (n++ % HOUSING_CHANNELS) + 1;
    await store.create({ id: pair.sea, owner: "solo", name: "오두막", intro: "", ownerName: "주인", tier: "small", ch, lot: null, now: 1, zone: "sea" });
    expect(await store.addItem(pair, "village", "pot", 20)).toBe("no_house");
    expect(await store.addItem(pair, "sea", "pot", 20)).toBe("ok");
    expect(await save(pair, "sea", { pot: 1 })).toBe("ok");
    expect(await view(pair, "village")).toEqual({ have: {}, away: { pot: 1 } });
  });

  if (kit.raw)
    it("옛 집마다 가방 → 공용 가방: 한 번만 옮기고(동시에 읽어도), 놓인 가구는 그대로 유효하다", async () => {
      const raw = kit.raw!();
      const { pair } = await both();
      const inv = (id: string) => `house:${id}:inv`;
      const placed = (id: string) => `house:${id}:placed`;
      // 공용 가방 전 형식: 집마다 가방에 다 들어 있다 (오두막은 시작 가구를 받은 표시와 함께)
      await raw.hset(inv(pair.village), { desk: "2", floor_wood: "1", pot: "1" });
      await raw.hset(inv(pair.sea), { "~starter": "1", sea_hammock: "2", desk: "1", floor_deck: "1" });
      await raw.hset(placed(pair.village), { desk: "2", floor_wood: "1" });
      await raw.hset(placed(pair.sea), { sea_hammock: "1", desk: "1" });
      const views = await Promise.all(Array.from({ length: 6 }, (_, i) => view(pair, i % 2 ? "sea" : "village")));
      // 11/24 바닥·벽지도 공용 가방으로 (마을 집에 입힌 floor_wood는 오두막에서 「다른 집에」)
      const village = { have: { desk: 2, floor_wood: 1, pot: 1, sea_hammock: 1, floor_deck: 1 }, away: { desk: 1 } };
      const sea = { have: { desk: 1, sea_hammock: 2, floor_deck: 1, pot: 1 }, away: { desk: 2, floor_wood: 1 } };
      views.forEach((v, i) => expect(v).toEqual(i % 2 ? sea : village));
      const hash = async (k: string) => {
        const flat = ((await raw.hgetall(k)) as unknown as string[] | null) ?? [];
        const o: Record<string, string> = {};
        for (let i = 0; i < flat.length; i += 2) o[flat[i]] = String(flat[i + 1]);
        return o;
      };
      const pool = { desk: "3", pot: "1", sea_hammock: "1", floor_wood: "1", floor_deck: "1" };
      expect(await hash(`house:${pair.village}:pool`)).toEqual(pool);
      expect(await hash(inv(pair.village))).toEqual({ "~pooled": "1" });
      expect(await hash(inv(pair.sea))).toEqual({ "~pooled": "1", "~starter": "1", sea_hammock: "1" });
      // 다시 읽어도 같다 (두 번 더하지 않는다)
      expect(await view(pair, "village")).toEqual(village);
      expect(await hash(`house:${pair.village}:pool`)).toEqual(pool);
      // 놓인 그대로 저장할 수 있고, 하나 더는 안 된다
      expect(await save(pair, "village", { desk: 2, floor_wood: 1 })).toBe("ok");
      expect(await save(pair, "sea", { sea_hammock: 1, desk: 1 })).toBe("ok");
      expect(await save(pair, "sea", { sea_hammock: 1, desk: 2 })).toBe("not_owned");
      expect(await save(pair, "sea", { sea_hammock: 2, desk: 1 })).toBe("ok");
    });

  if (kit.raw)
    it("11/24 이미 공용으로 옮긴(~pooled) 집 몫 가방의 바닥·벽지: 동시에 읽어도 한 번만 공용으로, 입힌 것은 그대로", async () => {
      const raw = kit.raw!();
      const { pair } = await both();
      // 지금 실서버 모양: 두 집 몫에 같은 바닥이 하나씩, 각자 입혀 쓰는 중 + 벽지 하나는 안 씀
      await raw.hset(`house:${pair.village}:inv`, { "~pooled": "1", floor_wood: "1", wall_paper: "1", roof_red: "1" });
      await raw.hset(`house:${pair.sea}:inv`, { "~pooled": "1", floor_wood: "1" });
      await raw.hset(`house:${pair.village}:placed`, { floor_wood: "1", roof_red: "1" });
      await raw.hset(`house:${pair.sea}:placed`, { floor_wood: "1" });
      await Promise.all(Array.from({ length: 6 }, (_, i) => view(pair, i % 2 ? "sea" : "village")));
      expect(await view(pair, "village")).toEqual({ have: { floor_wood: 1, wall_paper: 1, roof_red: 1 }, away: { floor_wood: 1 } });
      expect(await view(pair, "sea")).toEqual({ have: { floor_wood: 1, wall_paper: 1 }, away: { floor_wood: 1 } });
      expect(await store.ownItems(pair.village)).toEqual({ roof_red: 1 });
      // 둘 다 쓰는 중이라 못 판다, 그대로 저장은 된다, 벽지는 오두막에 쓸 수 있다
      expect(await store.takeItem(pair, "village", "floor_wood")).toBe("placed");
      expect(await save(pair, "village", { floor_wood: 1, roof_red: 1 })).toBe("ok");
      expect(await save(pair, "sea", { floor_wood: 1, wall_paper: 1 })).toBe("ok");
      expect(await save(pair, "village", { floor_wood: 1, roof_red: 1, wall_paper: 1 })).toBe("not_owned");
    });

  if (kit.raw)
    it("오두막 없는 옛 집: 가방을 처음 쓰는 동작(사기·팔기·저장)에서도 먼저 옮긴다", async () => {
      const raw = kit.raw!();
      const { pair } = await both();
      await raw.hset(`house:${pair.village}:inv`, { pot: "3" });
      await raw.hset(`house:${pair.village}:placed`, { pot: "3" });
      expect(await store.takeItem(pair, "village", "pot")).toBe("placed");
      expect(await store.addItem(pair, "village", "pot", 4)).toBe("ok");
      expect(await store.addItem(pair, "village", "pot", 4)).toBe("max");
      expect(await view(pair, "village")).toEqual({ have: { pot: 4 }, away: {} });
      expect(await view(pair, "sea")).toEqual({ have: { pot: 1 }, away: { pot: 3 } });
    });
}

import type { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterAll, expect, it } from "vitest";
import { campSizeBonus, HOUSING_CHANNELS, SEA_FLOOR, SEA_STARTER, SEA_WALL, type CampHomeKind, type HouseZone } from "./catalog";
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
    const p = { village: nanoid(12), sea: nanoid(12), camp: nanoid(12) };
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
  /** 11/26 캠핑장 집 하나 (kind는 터로 정해진다 — 시험은 terms만 맞춘다) */
  let campLot = 0;
  async function camp(pair: HousePair, owner: string, ch: number, kind: CampHomeKind = "caravan", extra: { villa?: boolean; others?: string[] } = {}) {
    const lot = kind === "caravan" ? (campLot++ % 12) + 1 : kind === "pension" ? 13 : 15;
    return store.create({ id: pair.camp, owner, name: "캠핑장", intro: "", ownerName: "주인", tier: "small", ch, lot, now: 1, zone: "camp", camp: { kind, yard: 1 }, ...extra });
  }
  /** 세 집 (마을·오두막·캠핑장) */
  async function three() {
    const t = await both();
    expect(await camp(t.pair, t.owner, t.ch)).toMatchObject({ lot: expect.any(Number) });
    return t;
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

  it("11/26 세 집 공용: 캠핑장 집에 놓은 것은 마을·포구에서 다른 집에 있다고 나오고, 세 집 합쳐 가진 것까지", async () => {
    const { pair } = await three();
    await store.addItem(pair, "camp", "pot", 20);
    await store.addItem(pair, "sea", "pot", 20);
    expect(await view(pair, "camp")).toEqual({ have: { pot: 2 }, away: {} });
    expect(await save(pair, "camp", { pot: 1 })).toBe("ok");
    expect(await view(pair, "village")).toEqual({ have: { pot: 1 }, away: { pot: 1 } });
    expect(await save(pair, "sea", { pot: 1 })).toBe("ok");
    expect(await view(pair, "village")).toEqual({ have: {}, away: { pot: 2 } });
    expect(await save(pair, "village", { pot: 1 })).toBe("not_owned");
    expect(await store.takeItem(pair, "village", "pot")).toBe("away");
    expect(await store.takeItem(pair, "camp", "pot")).toBe("placed");
    expect(await save(pair, "camp", {})).toBe("ok");
    expect(await store.takeItem(pair, "village", "pot")).toBe("ok");
    expect(await view(pair, "camp")).toEqual({ have: {}, away: { pot: 1 } });
  });

  it("11/26 세 집을 동시에 저장해도 합쳐서 가진 것보다 많이 놓이지 않는다", async () => {
    for (let round = 0; round < 3; round++) {
      const { pair } = await three();
      await store.addItem(pair, "village", "desk", 20);
      await store.addItem(pair, "village", "desk", 20);
      const r = await Promise.all([save(pair, "village", { desk: 1 }), save(pair, "sea", { desk: 1 }), save(pair, "camp", { desk: 1 })]);
      expect([...r].sort()).toEqual(["not_owned", "ok", "ok"]);
    }
  });

  it("11/26 캠핑장 집 기록: zone·종류·앞마당·별장 표시, 터 색인은 마을·포구와 따로 (같은 번호 가능), 같은 터는 한 집", async () => {
    const { pair, owner, ch } = await both();
    const lot = (await camp(pair, owner, ch, "pension", { villa: true })) as { lot: number };
    expect(lot).toEqual({ lot: 13 });
    expect(await store.get(pair.camp)).toMatchObject({ zone: "camp", lot: 13, ch, camp: { kind: "pension", yard: 1 }, villa: true, tier: "small" });
    // 같은 채널 같은 터는 다른 집이 못 받는다
    const other = pairOf();
    expect(await store.create({ id: other.camp, owner: "x", name: "x", intro: "", ownerName: "x", tier: "small", ch, lot: 13, now: 1, zone: "camp", camp: { kind: "pension", yard: 1 } })).toBe("lot_taken");
    expect((await store.village(ch, "camp")).map((h) => h.id)).toContain(pair.camp);
    expect((await store.village(ch, "camp")).every((h) => h.zone === "camp")).toBe(true);
    expect((await store.village(ch)).some((h) => h.id === pair.camp)).toBe(false);
    expect((await store.village(ch, "sea")).some((h) => h.id === pair.camp)).toBe(false);
    // 요약 (HMGET — 배열로 와도)
    const [b, none] = await store.brief([pair.camp, other.camp]);
    expect(b).toMatchObject({ id: pair.camp, zone: "camp", ch, lot: 13, tier: "small", villa: true, camp: { kind: "pension", yard: 1 } });
    expect(none).toBeNull();
    const [v] = await store.brief([pair.village]);
    expect(v).toMatchObject({ id: pair.village, ch, tier: "small" });
    expect(v?.zone).toBeUndefined();
    expect(v?.villa).toBeUndefined();
  });

  it("11/26 별장 표시: 옛 기록엔 한 번만 남기고(HSETNX) 이후 안 바뀐다 · 첫 집으로 사는데 다른 집이 있으면 villa_changed", async () => {
    const { pair, owner, ch } = await both();
    expect(await store.settleVilla(pair.sea, true)).toBe(true);
    expect(await store.settleVilla(pair.sea, false)).toBe(true);
    expect((await store.get(pair.sea))?.villa).toBe(true);
    expect(await store.settleVilla(pair.village, false)).toBe(false);
    expect(await store.settleVilla(pairOf().village, true)).toBeNull();
    // 첫 집 값으로 사려는데 다른 집이 있다 → 만들지 않는다
    expect(await camp(pair, owner, ch, "caravan", { villa: false, others: [pair.village, pair.sea] })).toBe("villa_changed");
    expect(await store.get(pair.camp)).toBeNull();
    expect(await camp(pair, owner, ch, "caravan", { villa: true, others: [pair.village, pair.sea] })).toMatchObject({ lot: expect.any(Number) });
    // 다른 집이 없으면 첫 집으로
    const solo = pairOf();
    expect(await camp(solo, "solo", ch, "rural", { villa: false, others: [solo.village, solo.sea] })).toEqual({ lot: 15 });
    expect((await store.get(solo.camp))?.villa).toBe(false);
  });

  it("11/26 앞마당: 캠핑장 집이고 단계가 맞을 때만, 낸 값을 더하고 순위 점수(크기 점수)도 같이", async () => {
    const pair = pairOf();
    const ch = (n++ % HOUSING_CHANNELS) + 1;
    expect(await store.create({ id: pair.camp, owner: "y", name: "카라반", intro: "", ownerName: "주인", tier: "small", ch, lot: 1, now: 1, zone: "camp", camp: { kind: "caravan", yard: 1 }, paid: 13_500, villa: false })).toEqual({
      lot: 1,
    });
    expect(await store.setYard(pair.camp, 2, 3, 5, 33_750)).toBe(false);
    expect(await store.setYard(pair.camp, 1, 2, 5, 20_250)).toBe(true);
    expect(await store.setYard(pair.camp, 1, 2, 6, 20_250)).toBe(false);
    expect(await store.get(pair.camp)).toMatchObject({ camp: { kind: "caravan", yard: 2 }, paid: 33_750, score: campSizeBonus(1, "small", 2) });
    expect(await store.setYard(pair.camp, 2, 3, 7, 33_750)).toBe(true);
    const h = await store.get(pair.camp);
    // 11/26 크기 점수는 방 크기로 — 카라반 3단계 +30
    expect(h).toMatchObject({ camp: { yard: 3 }, paid: 67_500, score: 30 });
    const listed = (await store.list("score", 1000)).find((x) => x.id === pair.camp);
    expect(listed?.score).toBe(30);
    // 마을 집은 앞마당이 없다
    const { pair: p2 } = await both();
    expect(await store.setYard(p2.village, 1, 2, 5, 100)).toBe(false);
    // 11/26 펜션 넓히기는 앞마당에 합쳤다: 옛 넓힌 기록(tier wide)은 3단계 방(18×12)이라 크기 점수도 +80 (앞마당을 올려도 그대로)
    const pen = pairOf();
    await store.create({ id: pen.camp, owner: "z", name: "펜션", intro: "", ownerName: "주인", tier: "small", ch, lot: 14, now: 1, zone: "camp", camp: { kind: "pension", yard: 1 } });
    expect(await store.upgrade(pen.camp, "small", "wide", 5, 13_500)).toBe(true);
    expect((await store.get(pen.camp))?.score).toBe(80);
    expect(await store.setYard(pen.camp, 1, 2, 6, 13_500)).toBe(true);
    expect((await store.get(pen.camp))?.score).toBe(80);
    expect((await store.list("score", 1000)).find((x) => x.id === pen.camp)?.score).toBe(80);
  });

  it("11/26 캠핑장 집 철거: 터가 비고 같은 터를 다시 받을 수 있다", async () => {
    const pair = pairOf();
    const ch = (n++ % HOUSING_CHANNELS) + 1;
    const owner = `o_${pair.camp}`;
    expect(await store.create({ id: pair.camp, owner, name: "x", intro: "", ownerName: "x", tier: "small", ch, lot: 16, now: 1, zone: "camp", camp: { kind: "rural", yard: 1 } })).toEqual({ lot: 16 });
    await kit.seen?.(owner, 5);
    expect(await store.reclaim(pair.camp, { owner, tier: "small", ch, points: 6_600, cutoff: 10, since: 0, lastSeenAt: 5, label: "x", now: 20, zone: "camp" })).toEqual({ points: 6_600 });
    expect((await store.village(ch, "camp")).some((h) => h.lot === 16)).toBe(false);
    const again = pairOf();
    expect(await store.create({ id: again.camp, owner: "w", name: "x", intro: "", ownerName: "x", tier: "small", ch, lot: 16, now: 1, zone: "camp", camp: { kind: "rural", yard: 1 } })).toEqual({ lot: 16 });
  });
}

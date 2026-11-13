import { nanoid } from "nanoid";
import { isShopListed, itemById, PERMANENT_UNTIL } from "@tomb/protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getStaffStore } from "../staff";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { AUTO_FISH_EVERY_MS, parseAutoSession } from "./auto";
import { speciesById } from "./catalog";
import { castLine, reelIn, startAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";
import { pickSunkenCosmetic, rollAutoSunken, SUNKEN_CHANCE, SUNKEN_CHANCE_AUTO, SUNKEN_POOL, sunkenText } from "./sunken";
import { ownedPermanent } from "./sunkenGrant";

// 물에 빠진 꾸미기: 확률(직접 약 0.3%, 자동 절반), 대상(상점 꾸미기만), 영구 소장, 이미 가진 것 다시 고르기, 다 가졌으면 희귀 물고기

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932";
const T0 = Date.UTC(2026, 10, 12, 3, 0); // KST 12:00

/** 입장한 계정 (영구 소장은 있는 계정에만 넣는다) */
async function newAcct(): Promise<string> {
  const a = `t-sunken-${nanoid(8)}`;
  await getAccounts().enter(a, { name: "낚시꾼" }, T0);
  return a;
}

/** 서버 난수(crypto.getRandomValues)를 늘 0으로 → 던질 때 꾸미기가 걸린다 */
const forceSunken = () =>
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((a: ArrayBufferView | null) => {
    if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(0);
    return a;
  }) as typeof crypto.getRandomValues);

async function ownAll(a: string) {
  await getStaffStore().grant(getAccounts(), a, SUNKEN_POOL.map((i) => ({ itemId: i.id, slot: i.slot! })), PERMANENT_UNTIL);
}

/** 이 시드로 앞 n번 안에 꾸미기가 걸리는 번호 */
function seedWithSunken(n: number): { seed: number; k: number } {
  for (let seed = 1; ; seed++)
    for (let k = 1; k <= n; k++) if (rollAutoSunken(seed, k) !== null) return { seed, k };
}

describe("꾸미기 고르기", () => {
  it("상점에서 파는 부위 있는 꾸미기만 (펫·운영자 전용 제외)", () => {
    expect(SUNKEN_POOL.length).toBeGreaterThan(5);
    for (const i of SUNKEN_POOL) {
      expect(i.kind).toBe("cosmetic");
      expect(i.slot).toBeTruthy();
      expect(i.slot).not.toBe("pet");
      expect(i.staff).toBeUndefined();
      expect(isShopListed(i)).toBe(true);
    }
  });

  it("이미 가진 것이 뽑히면 아직 없는 것 중에서, 다 가졌으면 null", () => {
    const first = pickSunkenCosmetic(0.3)!;
    const again = pickSunkenCosmetic(0.3, new Set([first.id]))!;
    expect(again.id).not.toBe(first.id);
    expect(pickSunkenCosmetic(0.3, new Set(SUNKEN_POOL.filter((i) => i.id !== "hat_cat").map((i) => i.id)))?.id).toBe("hat_cat");
    expect(pickSunkenCosmetic(0.3, new Set(SUNKEN_POOL.map((i) => i.id)))).toBeNull();
  });

  it("자동 낚시 확률은 직접(약 0.3%)의 절반, 결정적", () => {
    expect(SUNKEN_CHANCE).toBeCloseTo(1 / 300, 3);
    expect(SUNKEN_CHANCE_AUTO).toBe(SUNKEN_CHANCE / 2);
    const N = 400_000;
    let hit = 0;
    for (let k = 1; k <= N; k++) if (rollAutoSunken(42, k) !== null) hit++;
    expect(hit / N).toBeGreaterThan(SUNKEN_CHANCE_AUTO * 0.8);
    expect(hit / N).toBeLessThan(SUNKEN_CHANCE_AUTO * 1.2);
    const { seed, k } = seedWithSunken(500);
    expect(rollAutoSunken(seed, k)).toBe(rollAutoSunken(seed, k));
  });

  it("알림 문구", () => {
    expect(sunkenText({ name: "물에 빠진 고양이 귀", kept: true })).toBe("물에 빠진 고양이 귀를 건졌어요! (영구 소장)");
    expect(sunkenText({ name: "물에 빠진 왕관", kept: true })).toBe("물에 빠진 왕관을 건졌어요! (영구 소장)");
  });
});

describe("직접 낚시 (서버 판정)", () => {
  async function castAndReel(a: string) {
    const c = await castLine(a, PIER, T0);
    return reelIn(a, c.ticket, true, T0 + c.biteInMs + c.reelMs + 100);
  }

  it("걸리면 영구 소장으로 지급, 낚시 1회로 세고 도감·최대어에는 넣지 않는다", async () => {
    const a = await newAcct();
    forceSunken();
    const r = await castAndReel(a);
    expect(r.result).toBeNull();
    expect(r.gear).toMatchObject({ kept: true });
    expect(r.gear!.name).toBe(`물에 빠진 ${itemById(r.gear!.id)!.name}`);
    expect(SUNKEN_POOL.map((i) => i.id)).toContain(r.gear!.id);
    expect((await ownedPermanent(a, T0)).has(r.gear!.id)).toBe(true);
    expect(r.state.today.fish).toBe(1);
    expect(r.state.dex).toEqual({});
    expect(r.state.bag).toEqual({});
  });

  it("같은 것이 또 걸리면 아직 없는 것으로, 다 가졌으면 희귀 물고기", async () => {
    const a = await newAcct();
    forceSunken();
    const r1 = await castAndReel(a);
    const r2 = await castAndReel(a);
    expect(r2.gear?.kept).toBe(true);
    expect(r2.gear!.id).not.toBe(r1.gear!.id);
    await ownAll(a);
    const r3 = await castAndReel(a);
    expect(r3.gear).toMatchObject({ kept: false });
    expect(r3.result?.id).toBe(r3.gear!.instead);
    expect(speciesById(r3.result!.id)!.cat).toBe("fish");
    expect(r3.state.bag[r3.result!.id]).toBe(1);
    expect(r3.state.today.fish).toBe(3);
  });
});

describe("자동 낚시 (시드 + 번호)", () => {
  /** 꾸미기가 걸리는 시드로 세션을 바꿔 끼운다 */
  async function startWithSunken(a: string) {
    const { seed } = seedWithSunken(20);
    await startAutoFish(a, PIER, 1, T0);
    const store = getForageStore();
    const raw = (await store.autoGet(a))!;
    await store.autoSwap(a, raw, JSON.stringify({ ...parseAutoSession(raw)!, seed }));
  }

  it("정산 때 꾸미기가 걸린 번호는 영구 소장으로, 한도는 같이 센다", async () => {
    const a = await newAcct();
    await startWithSunken(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN); // 20번까지
    const n = Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS);
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    expect(r.gear.every((g) => g.kept)).toBe(true);
    expect(new Set(r.gear.map((g) => g.id)).size).toBe(r.gear.length); // 한 정산 안에서 겹치지 않는다
    expect(r.items.length + r.gear.length).toBe(n);
    expect(r.state.today).toMatchObject({ fish: n, auto: n });
    const owned = await ownedPermanent(a, T0);
    for (const g of r.gear) expect(owned.has(g.id)).toBe(true);
    expect(Object.keys(r.state.dex).every((id) => speciesById(id))).toBe(true);
  });

  it("다 가졌으면 대신 희귀 물고기 (가방·도감에)", async () => {
    const a = await newAcct();
    await ownAll(a);
    await startWithSunken(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    for (const g of r.gear) {
      expect(g.kept).toBe(false);
      expect(r.state.bag[g.instead!]).toBeGreaterThanOrEqual(1);
      expect(r.state.dex[g.instead!]).toBeTruthy();
    }
    // 대신 받은 물고기는 items에도 들어 있다 (낚시 1회)
    expect(r.items.length).toBe(Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
  });

  it("오늘 한도가 다 찼으면 꾸미기도 나오지 않는다", async () => {
    const a = await newAcct();
    await getForageStore().grantAuto(a, kstDay(T0), Array.from({ length: 75 }, () => ({ id: "f_crucian", size: 0 })), 99, 75, 150);
    // 자동 한도가 찼으면 켤 수 없다 → 세션을 직접 넣는다
    const { seed } = seedWithSunken(20);
    const before = await ownedPermanent(a, T0);
    await getForageStore().autoSwap(a, null, JSON.stringify({ v: 1, seed, spot: PIER, water: "lake", ch: 1, start: T0, end: T0 + 6 * 3_600_000, beat: T0, segs: [], done: 0 }));
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(r.items).toEqual([]);
    expect(r.gear).toEqual([]);
    expect(r.dropped).toBe(Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
    expect(await ownedPermanent(a, T0)).toEqual(before);
  });
});

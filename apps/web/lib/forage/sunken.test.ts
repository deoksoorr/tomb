import { nanoid } from "nanoid";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GEAR_INV_MAX } from "../rpg/character";
import { gearById } from "../rpg/catalog";
import { getRpgStore } from "../rpg/store";
import { kstDay } from "../store/accounts";
import { AUTO_FISH_EVERY_MS, parseAutoSession } from "./auto";
import { speciesById } from "./catalog";
import { castLine, reelIn, startAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";
import {
  pickSunkenGear,
  rollAutoSunken,
  SUNKEN_GEAR_CHANCE,
  SUNKEN_GEAR_CHANCE_AUTO,
  SUNKEN_LOW,
  SUNKEN_LOW_MAX_LEVEL,
  SUNKEN_MID,
  SUNKEN_MID_CHANCE,
  SUNKEN_MID_MAX_LEVEL,
} from "./sunken";

// 물에 빠진 사냥 장비: 확률(직접 약 0.3%, 자동 절반), 낮은 레벨 위주, 서버 판정, 한도, 장비 칸이 가득일 때 대체

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932";
const T0 = Date.UTC(2026, 10, 12, 3, 0); // KST 12:00
const acct = () => `t-sunken-${nanoid(8)}`;

/** 서버 난수(crypto.getRandomValues)를 늘 0으로 → 던질 때 장비가 걸린다 */
const forceGear = () =>
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((a: ArrayBufferView | null) => {
    if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(0);
    return a;
  }) as typeof crypto.getRandomValues);

async function fillGear(a: string) {
  await getRpgStore().update(a, (s) => ({ state: { ...s, inv: { w_ruler: GEAR_INV_MAX } }, result: null }));
}

/** 이 시드로 앞 n번 안에 장비가 걸리는 번호 */
function seedWithGear(n: number): { seed: number; k: number } {
  for (let seed = 1; ; seed++)
    for (let k = 1; k <= n; k++) if (rollAutoSunken(seed, k)) return { seed, k };
}

describe("장비 고르기", () => {
  it("낮은 레벨 위주, 아주 드물게 중간 레벨, 높은 레벨은 없다", () => {
    expect(SUNKEN_LOW.every((g) => g.reqLevel <= SUNKEN_LOW_MAX_LEVEL)).toBe(true);
    expect(SUNKEN_MID.every((g) => g.reqLevel > SUNKEN_LOW_MAX_LEVEL && g.reqLevel <= SUNKEN_MID_MAX_LEVEL)).toBe(true);
    let mid = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      const g = pickSunkenGear(Math.random(), Math.random());
      expect(g.reqLevel).toBeLessThanOrEqual(SUNKEN_MID_MAX_LEVEL);
      if (g.reqLevel > SUNKEN_LOW_MAX_LEVEL) mid++;
    }
    expect(mid / N).toBeCloseTo(SUNKEN_MID_CHANCE, 1);
  });

  it("자동 낚시의 장비 확률은 직접(약 0.3%)의 절반, 결정적", () => {
    expect(SUNKEN_GEAR_CHANCE).toBeCloseTo(1 / 300, 3);
    expect(SUNKEN_GEAR_CHANCE_AUTO).toBe(SUNKEN_GEAR_CHANCE / 2);
    const N = 400_000;
    let hit = 0;
    for (let k = 1; k <= N; k++) if (rollAutoSunken(42, k)) hit++;
    expect(hit / N).toBeGreaterThan(SUNKEN_GEAR_CHANCE_AUTO * 0.8);
    expect(hit / N).toBeLessThan(SUNKEN_GEAR_CHANCE_AUTO * 1.2);
    const { seed, k } = seedWithGear(500);
    expect(rollAutoSunken(seed, k)).toEqual(rollAutoSunken(seed, k));
  });
});

describe("직접 낚시 (서버 판정)", () => {
  async function castAndReel(a: string) {
    const c = await castLine(a, PIER, T0);
    return reelIn(a, c.ticket, true, T0 + c.biteInMs + c.reelMs + 100);
  }

  it("걸리면 사냥 장비로 지급, 낚시 1회로 세고 도감·최대어에는 넣지 않는다", async () => {
    const a = acct();
    forceGear();
    const r = await castAndReel(a);
    expect(r.result).toBeNull();
    expect(r.gear).toMatchObject({ kept: true });
    expect(r.gear!.name).toBe(`물에 빠진 ${gearById(r.gear!.id)!.name}`);
    expect((await getRpgStore().get(a)).inv[r.gear!.id]).toBe(1);
    expect(r.state.today.fish).toBe(1);
    expect(r.state.dex).toEqual({});
    expect(r.state.bag).toEqual({});
  });

  it("장비 칸이 가득이면 대신 희귀 물고기", async () => {
    const a = acct();
    await fillGear(a);
    forceGear();
    const r = await castAndReel(a);
    expect(r.gear).toMatchObject({ kept: false });
    expect(r.result?.id).toBe(r.gear!.instead);
    expect(speciesById(r.result!.id)!.cat).toBe("fish");
    expect(r.state.bag[r.result!.id]).toBe(1);
    expect(r.state.today.fish).toBe(1);
    expect((await getRpgStore().get(a)).inv).toEqual({ w_ruler: GEAR_INV_MAX });
  });
});

describe("자동 낚시 (시드 + 번호)", () => {
  /** 장비가 걸리는 시드로 세션을 바꿔 끼운다 */
  async function startWithGear(a: string) {
    const { seed, k } = seedWithGear(20);
    await startAutoFish(a, PIER, 1, T0);
    const store = getForageStore();
    const raw = (await store.autoGet(a))!;
    await store.autoSwap(a, raw, JSON.stringify({ ...parseAutoSession(raw)!, seed }));
    return k;
  }

  it("정산 때 장비가 걸린 번호는 장비로, 한도는 같이 센다", async () => {
    const a = acct();
    await startWithGear(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN); // 20번까지
    const n = Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS);
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    expect(r.gear.every((g) => g.kept)).toBe(true);
    expect(r.items.length + r.gear.length).toBe(n);
    expect(r.state.today).toMatchObject({ fish: n, auto: n });
    const inv = (await getRpgStore().get(a)).inv;
    for (const g of r.gear) expect(inv[g.id]).toBeGreaterThanOrEqual(1);
    // 도감에는 장비가 없다
    expect(Object.keys(r.state.dex).every((id) => speciesById(id))).toBe(true);
  });

  it("장비 칸이 가득이면 대신 희귀 물고기 (도감·가방에)", async () => {
    const a = acct();
    await fillGear(a);
    await startWithGear(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    for (const g of r.gear) {
      expect(g.kept).toBe(false);
      expect(r.state.bag[g.instead!]).toBeGreaterThanOrEqual(1);
    }
    expect(r.state.today.auto).toBe(Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
    expect((await getRpgStore().get(a)).inv).toEqual({ w_ruler: GEAR_INV_MAX });
  });

  it("오늘 한도가 다 찼으면 장비도 나오지 않는다", async () => {
    const a = acct();
    await getForageStore().grantAuto(a, kstDay(T0), Array.from({ length: 75 }, () => ({ id: "f_crucian", size: 0 })), 99, 75, 150);
    await getForageStore().autoSwap(a, null, null);
    // 자동 한도가 찼으면 켤 수 없다 → 세션을 직접 넣는다
    const { seed } = seedWithGear(20);
    const before = (await getRpgStore().get(a)).inv;
    await getForageStore().autoSwap(a, null, JSON.stringify({ v: 1, seed, spot: PIER, water: "lake", ch: 1, start: T0, end: T0 + 6 * 3_600_000, beat: T0, segs: [], done: 0 }));
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(r.items).toEqual([]);
    expect(r.gear).toEqual([]);
    expect(r.dropped).toBe(Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
    expect((await getRpgStore().get(a)).inv).toEqual(before);
  });
});

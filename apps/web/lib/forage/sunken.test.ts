import { nanoid } from "nanoid";
import { isPermanentUntil, isShopListed, itemById, PERMANENT_UNTIL, RAFT_GEAR_ODDS } from "@tomb/protocol";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getStaffStore } from "../staff";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";
import { AUTO_FISH_EVERY_MS, autoHit, parseAutoSession } from "./auto";
import { speciesById } from "./catalog";
import { castLine, reelIn, startAutoFish, syncAutoFish } from "./service";
import { getForageStore } from "./store";
import { COS_DAYS, cosTierOf } from "../rpg/setGearRoll";
import { pickSunkenCosmetic, rollAutoSunken, rollAutoSunkenDays, SUNKEN_CHANCE, SUNKEN_CHANCE_AUTO, SUNKEN_POOL, sunkenText } from "./sunken";
import { ownedCosmetics, ownedPermanent, sunkenDays } from "./sunkenGrant";

// 물에 빠진 꾸미기: 확률(11/28 직접·자동 모두 1/40,000), 대상(상점 꾸미기만), 11/28 기간제(상자 꾸미기 기간표), 영구로 가진 것 다시 고르기·기간제는 더하기, 다 영구면 희귀 물고기

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS"]) vi.stubEnv(k, "");
});
afterEach(() => vi.restoreAllMocks());

const MIN = 60_000;
const PIER = "f_1172_932";
const T0 = Date.UTC(2026, 10, 12, 3, 0); // KST 12:00

/** 지금 가진 기간제 끝 (입은 것 + 벗어 둔 것, 없으면 0) */
async function untilOf(a: string, id: string): Promise<number> {
  const acc = await getAccounts().get(a, kstDay(T0), T0);
  return [...acc.equipped, ...acc.stash].find((e) => e.itemId === id)?.until ?? 0;
}

/** 입장한 계정 */
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
/** n번 시도 안에 꾸미기가 걸리는 시드 (11/19 꾸미기는 걸린 시도에서만 — autoHit) */
function seedWithSunken(n: number): { seed: number; k: number } {
  for (let seed = 1; ; seed++)
    for (let k = 1; k <= n; k++) if (autoHit(seed, k) && rollAutoSunken(seed, k) !== null) return { seed, k };
}
/** 1..n번 시도 중 걸린 수 */
const hitsIn = (seed: number, n: number) => Array.from({ length: n }, (_, i) => i + 1).filter((k) => autoHit(seed, k)).length;

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

  it("11/28 확률: 직접(찌 던지기마다)·자동(걸린 한 마리마다) 모두 1/40,000, 결정적", () => {
    expect(SUNKEN_CHANCE).toBe(1 / 40_000);
    expect(SUNKEN_CHANCE_AUTO).toBe(1 / 40_000);
    const N = 4_000_000;
    let hit = 0;
    for (let k = 1; k <= N; k++) if (rollAutoSunken(42, k) !== null) hit++;
    expect(hit / N).toBeGreaterThan(SUNKEN_CHANCE_AUTO * 0.8);
    expect(hit / N).toBeLessThan(SUNKEN_CHANCE_AUTO * 1.2);
    const { seed, k } = seedWithSunken(500);
    expect(rollAutoSunken(seed, k)).toBe(rollAutoSunken(seed, k));
    expect(rollAutoSunkenDays(seed, k)).toBe(rollAutoSunkenDays(seed, k));
  });

  it("좌대 코디 확률은 그대로 (7일 1/7,000 · 30일 1/35,000 · 영구 1/200,000)", () => {
    expect(RAFT_GEAR_ODDS).toEqual({ d7: 1 / 7_000, d30: 1 / 35_000, perm: 1 / 200_000 });
  });

  it("11/28 기간: 상자 꾸미기와 같은 표 (1일 45% · 3일 30% · 7일 20% · 30일 5%), 전설 등급은 30일 대신 7일 — 시드 여러 개로 ±3%", () => {
    expect(COS_DAYS).toEqual([[1, 45], [3, 30], [7, 20], [30, 5]]);
    const cheap = SUNKEN_POOL.find((i) => cosTierOf(i.price) < 3)!;
    const legend = SUNKEN_POOL.find((i) => cosTierOf(i.price) === 3);
    const N = 40_000;
    const count = new Map<number, number>();
    for (let seed = 1; seed <= N; seed++) {
      const d = sunkenDays(rollAutoSunkenDays(seed, 1), cheap);
      count.set(d, (count.get(d) ?? 0) + 1);
    }
    for (const [d, w] of COS_DAYS) expect(Math.abs((count.get(d) ?? 0) / N - w / 100)).toBeLessThan(0.03);
    expect([...count.keys()].sort((a, b) => a - b)).toEqual([1, 3, 7, 30]);
    if (legend) for (let i = 0; i < 2_000; i++) expect(sunkenDays(i / 2_000, legend)).not.toBe(30);
    // 같은 난수 → 같은 기간
    expect(sunkenDays(0.99, cheap)).toBe(30);
    expect(sunkenDays(0, cheap)).toBe(1);
  });

  it("알림 문구 (11/28 기간제 — 며칠인지, 가지고 있던 것이면 남은 기간에 더함)", () => {
    expect(sunkenText({ name: "물에 빠진 산타 모자", kept: true, days: 7 })).toBe("물에 빠진 산타 모자 7일 획득");
    expect(sunkenText({ name: "물에 빠진 왕관", kept: true, days: 3, ext: true })).toBe("물에 빠진 왕관 3일 획득 (남은 기간에 더함)");
    expect(sunkenText({ name: "", kept: false, instead: "f_x" }, () => "황금 잉어")).toBe("물에 빠진 꾸미기를 건졌지만 이미 모두 가지고 있어서 대신 황금 잉어를 챙겼어요");
  });
});

describe("직접 낚시 (서버 판정)", () => {
  async function castAndReel(a: string) {
    const c = await castLine(a, PIER, T0);
    return reelIn(a, c.ticket, true, T0 + c.biteInMs + c.reelMs + 100);
  }

  it("걸리면 기간제로 지급(던질 때 정한 기간), 낚시 1회로 세고 도감·최대어에는 넣지 않는다", async () => {
    const a = await newAcct();
    forceSunken();
    const r = await castAndReel(a);
    expect(r.result).toBeNull();
    expect(r.gear).toMatchObject({ kept: true, days: 1 }); // 난수 0 → 1일
    expect(r.gear!.ext).toBeUndefined();
    expect(r.gear!.name).toBe(`물에 빠진 ${itemById(r.gear!.id)!.name}`);
    expect(SUNKEN_POOL.map((i) => i.id)).toContain(r.gear!.id);
    expect((await ownedPermanent(a, T0)).has(r.gear!.id)).toBe(false);
    expect((await ownedCosmetics(a, T0)).timed.has(r.gear!.id)).toBe(true);
    const until = await untilOf(a, r.gear!.id);
    expect(isPermanentUntil(until)).toBe(false);
    expect(until).toBeGreaterThan(T0 + 86_400_000 - 60_000);
    expect(until).toBeLessThan(T0 + 86_400_000 + 60_000);
    expect(r.state.today.fish).toBe(1);
    expect(r.state.dex).toEqual({});
    expect(r.state.bag).toEqual({});
  });

  it("기간제로 가진 것이 또 걸리면 남은 기간에 더하고(줄지 않는다), 영구로 가진 것은 빼고 고르고, 다 영구면 희귀 물고기", async () => {
    const a = await newAcct();
    forceSunken();
    const r1 = await castAndReel(a);
    const u1 = await untilOf(a, r1.gear!.id);
    const r2 = await castAndReel(a);
    expect(r2.gear).toMatchObject({ kept: true, id: r1.gear!.id, days: 1, ext: true });
    expect(await untilOf(a, r2.gear!.id)).toBe(u1 + 86_400_000);
    // 그 꾸미기를 영구로 가지면 다른 것을 고른다
    await getStaffStore().grant(getAccounts(), a, [{ itemId: r1.gear!.id, slot: itemById(r1.gear!.id)!.slot! }], PERMANENT_UNTIL);
    const r2b = await castAndReel(a);
    expect(r2b.gear?.kept).toBe(true);
    expect(r2b.gear!.id).not.toBe(r1.gear!.id);
    expect(isPermanentUntil(await untilOf(a, r1.gear!.id))).toBe(true);
    await ownAll(a);
    const r3 = await castAndReel(a);
    expect(r3.gear).toMatchObject({ kept: false });
    expect(r3.result?.id).toBe(r3.gear!.instead);
    expect(speciesById(r3.result!.id)!.cat).toBe("fish");
    expect(r3.state.bag[r3.result!.id]).toBe(1);
    expect(r3.state.today.fish).toBe(4);
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

  it("정산 때 꾸미기가 걸린 번호는 기간제로(시드 + 번호 기간), 낚은 수에 같이 센다", async () => {
    const a = await newAcct();
    await startWithSunken(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN); // 20번까지
    const n = hitsIn(seedWithSunken(20).seed, Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS));
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    expect(r.gear.every((g) => g.kept)).toBe(true);
    expect(new Set(r.gear.map((g) => g.id)).size).toBe(r.gear.length); // 한 정산 안에서 겹치지 않는다
    expect(r.items.length + r.gear.length).toBe(n);
    expect(r.state.today).toMatchObject({ fish: n, auto: n });
    const owned = await ownedCosmetics(a, T0);
    for (const g of r.gear) {
      expect(owned.perm.has(g.id)).toBe(false);
      expect(owned.timed.has(g.id)).toBe(true);
      expect([1, 3, 7, 30]).toContain(g.days);
      expect(await untilOf(a, g.id)).toBe(T0 + 10 * MIN + g.days! * 86_400_000);
    }
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
    // 대신 받은 물고기는 items에도 들어 있다 (낚은 수 1)
    expect(r.items.length).toBe(hitsIn(seedWithSunken(20).seed, Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS)));
  });

  it("11/19 하루 한도 없음: 예전 자동 75마리를 채운 날에도 꾸미기가 걸린다", async () => {
    const a = await newAcct();
    await getForageStore().grantAuto(a, kstDay(T0), Array.from({ length: 75 }, () => ({ id: "f_crucian", size: 0 })), 99);
    await startWithSunken(a);
    const r = await syncAutoFish(a, T0 + 10 * MIN);
    expect(r.gear.length).toBeGreaterThanOrEqual(1);
    expect(r.gear.every((g) => g.kept)).toBe(true);
    expect(r.state.today.auto).toBe(75 + hitsIn(seedWithSunken(20).seed, Math.floor((10 * MIN) / AUTO_FISH_EVERY_MS)));
  });
});

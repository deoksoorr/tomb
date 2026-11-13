import { describe, expect, it } from "vitest";
import { activeResidentCount, normalizeResidentSettings, RESIDENTS_DEFAULT, RESIDENTS_MAX } from "../residents";
import { MemoryResidentSettings, RedisResidentSettings, RESIDENTS_KEY, type ResidentSettingsStore } from "./residents";

// 돌아다니는 마을 주민 관리자 설정: 저장/읽기 (메모리 · Redis 가짜 연결), 값 정리

/** Redis 클라이언트 대신 쓰는 가짜 (get/set만) — 실제 운영 키를 건드리지 않는다 */
function fakeRedis(): {
  map: Map<string, string>;
  client: {
    get: (k: string) => Promise<string | null>;
    set: (k: string, v: string) => Promise<"OK">;
  };
} {
  const map = new Map<string, string>();
  return {
    map,
    client: {
      get: async (k) => map.get(k) ?? null,
      set: async (k, v) => (map.set(k, v), "OK"),
    },
  };
}

function contract(make: () => ResidentSettingsStore) {
  it("starts with the default (on · 12)", async () => {
    expect(await make().get()).toEqual(RESIDENTS_DEFAULT);
  });
  it("saves and reads back, clamping the count", async () => {
    const s = make();
    expect(await s.set({ enabled: false, count: 5 })).toEqual({
      enabled: false,
      count: 5,
    });
    expect(await s.get()).toEqual({ enabled: false, count: 5 });
    await s.set({ enabled: true, count: 99 });
    expect(await s.get()).toEqual({ enabled: true, count: RESIDENTS_MAX });
    await s.set({ enabled: true, count: 0 });
    expect(await s.get()).toEqual({ enabled: true, count: 0 });
  });
}

describe("MemoryResidentSettings", () => contract(() => new MemoryResidentSettings()));

describe("RedisResidentSettings (가짜 연결)", () => {
  contract(() => {
    const st = new RedisResidentSettings({
      url: "https://example.invalid",
      token: "x",
    });
    Object.assign(st, { redis: fakeRedis().client });
    return st;
  });
  it("stores JSON under admin:residents and survives broken values", async () => {
    const f = fakeRedis();
    const st = new RedisResidentSettings({
      url: "https://example.invalid",
      token: "x",
    });
    Object.assign(st, { redis: f.client });
    await st.set({ enabled: true, count: 7 });
    expect(JSON.parse(f.map.get(RESIDENTS_KEY)!)).toEqual({
      enabled: true,
      count: 7,
    });
    f.map.set(RESIDENTS_KEY, "{not json");
    expect(await st.get()).toEqual(RESIDENTS_DEFAULT);
  });
});

describe("normalizeResidentSettings", () => {
  it("fills unknown values with defaults and clamps 0~15", () => {
    expect(normalizeResidentSettings(null)).toEqual(RESIDENTS_DEFAULT);
    expect(normalizeResidentSettings({ enabled: "yes", count: "3" })).toEqual(RESIDENTS_DEFAULT);
    expect(normalizeResidentSettings({ enabled: false, count: -4 })).toEqual({
      enabled: false,
      count: 0,
    });
    expect(normalizeResidentSettings({ enabled: true, count: 7.6 })).toEqual({
      enabled: true,
      count: 8,
    });
  });
  it("off means no residents on screen", () => {
    expect(activeResidentCount({ enabled: false, count: 12 })).toBe(0);
    expect(activeResidentCount({ enabled: true, count: 12 })).toBe(12);
  });
});

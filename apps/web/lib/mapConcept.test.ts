import { afterEach, describe, expect, it, vi } from "vitest";
import { isMapConcept, isSnowy, MAP_CONCEPTS, mapConceptNotice, normalizeConcept, parseConceptOverride } from "./mapConcept";
import { cachedMapConcept, getMapConceptStore, MemoryMapConcept, setMapConcept } from "./store/mapConcept";

describe("마을 맵 컨셉", () => {
  it("주소 시험 값 ?concept= 은 로컬·테스트서버에서만 먹는다", () => {
    expect(parseConceptOverride("?concept=winter")).toBe("winter");
    expect(parseConceptOverride("?time=night&concept=christmas")).toBe("christmas");
    expect(parseConceptOverride("?concept=summer")).toBeNull();
    expect(parseConceptOverride("")).toBeNull();
    // 실서버 빌드 (NEXT_PUBLIC_QA_URL="0")
    expect(parseConceptOverride("?concept=winter", "0")).toBeNull();
  });

  it("모르는 값은 기본으로, 겨울·크리스마스만 눈 덮인 판", () => {
    expect(normalizeConcept("christmas")).toBe("christmas");
    expect(normalizeConcept("spring")).toBe("default");
    expect(normalizeConcept(null)).toBe("default");
    expect(MAP_CONCEPTS.filter(isSnowy)).toEqual(["winter", "christmas"]);
    expect(isMapConcept("winter")).toBe(true);
    expect(isMapConcept(3)).toBe(false);
  });

  it("공지 문구는 판마다 다르고 짧다", () => {
    const lines = MAP_CONCEPTS.map(mapConceptNotice);
    expect(new Set(lines).size).toBe(3);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(60);
  });
});

describe("맵 컨셉 저장소 (메모리)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("저장하고 읽는다 (모르는 값은 기본)", async () => {
    const s = new MemoryMapConcept();
    expect(await s.get()).toBe("default");
    expect(await s.set("winter")).toBe("winter");
    expect(await s.get()).toBe("winter");
    expect(await s.set("autumn" as never)).toBe("default");
  });

  it("관리자가 바꾸면 이 인스턴스 캐시도 바로 바뀐다", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    expect(getMapConceptStore()).toBeInstanceOf(MemoryMapConcept);
    const now = 1_000_000;
    await setMapConcept("christmas", now);
    expect(await cachedMapConcept(now + 10)).toBe("christmas");
    await getMapConceptStore().set("default");
    // 캐시 시간 안에는 그대로, 지나면 저장소 값
    expect(await cachedMapConcept(now + 1_000)).toBe("christmas");
    expect(await cachedMapConcept(now + 60_000)).toBe("default");
  });
});

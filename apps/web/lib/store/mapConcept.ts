import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import { normalizeConcept, type MapConcept } from "../mapConcept";

// 11/17 마을 맵 컨셉 저장소 (관리자가 고른다, 규칙은 lib/mapConcept). 마을 주민 설정(lib/store/residents)처럼 값 하나.
// Redis 키: admin:mapConcept  STRING ("default" · "winter" · "christmas"). 없으면 기본.
// 게임 화면은 /api/map-concept(CDN 30초)을 1분마다 묻는다 — 인스턴스마다 MAP_CONCEPT_CACHE_MS 동안 다시 묻지 않는다.

export const MAP_CONCEPT_KEY = "admin:mapConcept";
export const MAP_CONCEPT_CACHE_MS = 30_000;
/** 바뀜 공지를 들은 화면(?fresh=)이 물을 때의 간격 */
export const MAP_CONCEPT_FRESH_MS = 5_000;

export interface MapConceptStore {
  get(): Promise<MapConcept>;
  set(c: MapConcept): Promise<MapConcept>;
}

export class MemoryMapConcept implements MapConceptStore {
  private cur: MapConcept = "default";
  async get(): Promise<MapConcept> {
    return this.cur;
  }
  async set(c: MapConcept): Promise<MapConcept> {
    this.cur = normalizeConcept(c);
    return this.cur;
  }
}

export class RedisMapConcept implements MapConceptStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "mapConcept");
  }
  async get(): Promise<MapConcept> {
    return normalizeConcept(await this.redis.get<string>(MAP_CONCEPT_KEY));
  }
  async set(c: MapConcept): Promise<MapConcept> {
    const v = normalizeConcept(c);
    if (v === "default") await this.redis.del(MAP_CONCEPT_KEY);
    else await this.redis.set(MAP_CONCEPT_KEY, v);
    return v;
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 값·캐시가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & {
  __tombMapConcept?: MapConceptStore;
  __tombMapConceptCache?: { at: number; value: MapConcept };
};

/** Redis 환경변수가 있으면 Redis, 없으면 (로컬·테스트) 메모리 */
export function getMapConceptStore(): MapConceptStore {
  const cur = g.__tombMapConcept;
  const conn = env.redis();
  if (conn) return cur instanceof RedisMapConcept ? cur : (g.__tombMapConcept = new RedisMapConcept(conn));
  if (cur instanceof MemoryMapConcept) return cur;
  return (g.__tombMapConcept = cur ? Object.assign(new MemoryMapConcept(), cur) : new MemoryMapConcept());
}

/** 관리자가 바꾼다. 이 인스턴스의 캐시도 바로 바꾼다 */
export async function setMapConcept(c: MapConcept, now = Date.now()): Promise<MapConcept> {
  const v = await getMapConceptStore().set(c);
  g.__tombMapConceptCache = { at: now, value: v };
  return v;
}

/** 읽기 (maxAgeMs 캐시). 저장소를 못 읽으면 직전 값(없으면 기본) */
export async function cachedMapConcept(now = Date.now(), maxAgeMs = MAP_CONCEPT_CACHE_MS): Promise<MapConcept> {
  const c = g.__tombMapConceptCache;
  if (c && now - c.at < maxAgeMs && now >= c.at) return c.value;
  try {
    const value = await getMapConceptStore().get();
    g.__tombMapConceptCache = { at: now, value };
    return value;
  } catch (e) {
    console.warn("[mapConcept] 읽기 실패", e);
    return c?.value ?? "default";
  }
}

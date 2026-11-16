import { Redis } from "@upstash/redis";
import { env } from "../env";
import { earnBoostAt, normalizePointEvent, type EarnBoost, type PointEvent } from "../pointEvent";

// 포인트 배수 이벤트 설정 저장소 (관리자가 켜고 끈다, 규칙은 lib/pointEvent.ts). 마을 주민 설정(lib/store/residents)처럼 값 하나.
// Redis 키: admin:pointEvent  STRING JSON {startAt, endAt, sources, mult}. 없으면 꺼짐 (sources·mult가 없는 예전 값은 전부·2배).
// 적립 경로(AccountStore.earn·머무르기·내 정보)는 cachedPointEvent로 읽는다 — 인스턴스마다 CACHE_MS 동안 다시 묻지 않는다.

export const POINT_EVENT_KEY = "admin:pointEvent";
/** 적립 경로가 저장소를 다시 묻는 간격. 관리자가 바꾸면 다른 서버 인스턴스는 이만큼 안에 따라온다 */
const CACHE_MS = 15_000;

export interface PointEventStore {
  get(): Promise<PointEvent | null>;
  /** null이면 지운다 (꺼짐) */
  set(ev: PointEvent | null): Promise<PointEvent | null>;
}

export class MemoryPointEvent implements PointEventStore {
  private cur: PointEvent | null = null;
  async get(): Promise<PointEvent | null> {
    return this.cur && { ...this.cur };
  }
  async set(ev: PointEvent | null): Promise<PointEvent | null> {
    this.cur = normalizePointEvent(ev);
    return this.cur && { ...this.cur };
  }
}

export class RedisPointEvent implements PointEventStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async get(): Promise<PointEvent | null> {
    const raw = await this.redis.get<string>(POINT_EVENT_KEY);
    if (!raw) return null;
    try {
      return normalizePointEvent(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  async set(ev: PointEvent | null): Promise<PointEvent | null> {
    const v = normalizePointEvent(ev);
    if (v) await this.redis.set(POINT_EVENT_KEY, JSON.stringify(v));
    else await this.redis.del(POINT_EVENT_KEY);
    return v;
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 값·캐시가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & {
  __tombPointEvent?: PointEventStore;
  __tombPointEventCache?: { at: number; value: PointEvent | null };
};

/** Redis 환경변수가 있으면 Redis, 없으면 (로컬·테스트) 메모리 */
export function getPointEventStore(): PointEventStore {
  const cur = g.__tombPointEvent;
  const conn = env.redis();
  if (conn) return cur instanceof RedisPointEvent ? cur : (g.__tombPointEvent = new RedisPointEvent(conn));
  if (cur instanceof MemoryPointEvent) return cur;
  return (g.__tombPointEvent = cur ? Object.assign(new MemoryPointEvent(), cur) : new MemoryPointEvent());
}

/** 관리자가 바꾼다. 이 인스턴스의 캐시도 바로 바꾼다 */
export async function setPointEvent(ev: PointEvent | null, now = Date.now()): Promise<PointEvent | null> {
  const v = await getPointEventStore().set(ev);
  g.__tombPointEventCache = { at: now, value: v };
  return v;
}

/** 적립 경로용 읽기 (CACHE_MS 캐시). 저장소를 못 읽으면 직전 값(없으면 꺼짐)으로 — 이벤트 때문에 적립이 실패하지 않게 */
export async function cachedPointEvent(now = Date.now()): Promise<PointEvent | null> {
  const c = g.__tombPointEventCache;
  if (c && now - c.at < CACHE_MS && now >= c.at) return c.value;
  try {
    const value = await getPointEventStore().get();
    g.__tombPointEventCache = { at: now, value };
    return value;
  } catch (e) {
    console.warn("[pointEvent] 설정 읽기 실패", e);
    return c?.value ?? null;
  }
}

/** 지금의 적립 배수 (lib/pointEvent earnBoostAt) */
export async function earnBoost(now = Date.now()): Promise<EarnBoost> {
  return earnBoostAt(await cachedPointEvent(now), now);
}

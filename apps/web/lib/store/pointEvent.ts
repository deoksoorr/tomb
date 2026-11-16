import { Redis } from "@upstash/redis";
import { env } from "../env";
import { earnBoostAt, normalizePointEvent, type EarnBoost, type PointEvent } from "../pointEvent";

// 포인트 배수 이벤트 설정 저장소 (관리자가 켜고 끈다, 규칙은 lib/pointEvent.ts). 마을 주민 설정(lib/store/residents)처럼 값 하나.
// Redis 키: admin:pointEvent  STRING JSON {startAt, endAt, sources, mult}. 없으면 꺼짐 (sources·mult가 없는 예전 값은 전부·2배).
// 적립 경로(AccountStore.earn·머무르기·내 정보)는 cachedPointEvent로 읽는다 — 인스턴스마다 CACHE_MS 동안 다시 묻지 않는다.
// 끝 공지: 정해 둔 시각에 끝난 이벤트는 그 뒤 처음 저장소를 읽는 요청이 한 번만 알린다 (claimEndNotice로 잡는다, lib/pointEventNotice).

export const POINT_EVENT_KEY = "admin:pointEvent";
/** 끝 공지를 보냈다는 표시 (이벤트마다 = 켠 시각마다 하나, SET NX) */
const endNoticeKey = (startAt: number) => `admin:pointEvent:ended:${startAt}`;
const END_NOTICE_TTL_SEC = 30 * 86_400;
/** 적립 경로가 저장소를 다시 묻는 간격. 관리자가 바꾸면 그 인스턴스는 바로, 다른 서버 인스턴스는 이만큼 안에 따라온다 */
const CACHE_MS = 5_000;
/** 정해 둔 시각에 끝난 뒤 이만큼 안에 첫 요청이 와야 끝 공지를 보낸다 (오래전에 끝난 이벤트를 배포 뒤 뒤늦게 알리지 않게) */
const END_NOTICE_WINDOW_MS = 6 * 3_600_000;

export interface PointEventStore {
  get(): Promise<PointEvent | null>;
  /** null이면 지운다 (꺼짐) */
  set(ev: PointEvent | null): Promise<PointEvent | null>;
  /** 그 이벤트(켠 시각)의 끝 공지를 보낼 차례를 잡는다. 처음 부른 쪽만 true (여러 서버가 동시에 불러도 한 번) */
  claimEndNotice(startAt: number): Promise<boolean>;
}

export class MemoryPointEvent implements PointEventStore {
  private cur: PointEvent | null = null;
  private ended = new Set<number>();
  async claimEndNotice(startAt: number): Promise<boolean> {
    if (this.ended.has(startAt)) return false;
    this.ended.add(startAt);
    return true;
  }
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
  async claimEndNotice(startAt: number): Promise<boolean> {
    return (await this.redis.set(endNoticeKey(startAt), "1", { nx: true, ex: END_NOTICE_TTL_SEC })) === "OK";
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 값·캐시가 날아가지 않게 globalThis에 둔다
const g = globalThis as typeof globalThis & {
  __tombPointEvent?: PointEventStore;
  __tombPointEventCache?: { at: number; value: PointEvent | null };
  /** 이 인스턴스가 끝 공지 차례를 이미 확인한 이벤트 (켠 시각) */
  __tombPointEventEndSeen?: Set<number>;
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
    if (value?.endAt != null && value.endAt <= now && now - value.endAt < END_NOTICE_WINDOW_MS) await endNoticeDue(value, now);
    return value;
  } catch (e) {
    console.warn("[pointEvent] 설정 읽기 실패", e);
    return c?.value ?? null;
  }
}

/**
 * 정해 둔 시각에 끝난 이벤트: 이 인스턴스에서 처음 보면 끝 공지를 한 번 (lib/pointEventNotice — 공지 모듈이 저장소를 다시 가져와
 * 순환을 피하려고 동적으로 불러온다). 실패해도 적립은 그대로
 */
async function endNoticeDue(ev: PointEvent, now: number): Promise<void> {
  const seen = (g.__tombPointEventEndSeen ??= new Set<number>());
  if (seen.has(ev.startAt)) return;
  seen.add(ev.startAt);
  try {
    await (await import("../pointEventNotice")).announceEndOnce(ev, now);
  } catch (e) {
    console.warn("[pointEvent] 끝 공지 실패", e);
  }
}

/** 지금의 적립 배수 (lib/pointEvent earnBoostAt) */
export async function earnBoost(now = Date.now()): Promise<EarnBoost> {
  return earnBoostAt(await cachedPointEvent(now), now);
}

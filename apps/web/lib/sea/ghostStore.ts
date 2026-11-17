import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import type { GhostCall } from "./ghostShip";

// 11/17 유령선 장터 저장소: 물건마다 한 사람 1개 (그 주 산 물건 표) · 운영자 시험 부르기.
// Redis: 사기 = SADD 1번 (처음이면 1 → 차감, 차감이 실패하면 SREM으로 풀어요), 보기 = SMEMBERS 1번 (장터 창을 열 때만).
//  ghost:buy:{week}:{accountId}  SET 산 물건 이름표 (EX 9일 — 주가 키에 들어 있어요)
//  ghost:call:{accountId}        STRING "on" | "off" (EX 3시간 — 운영자 시험이 저절로 끝나요)

export const ghostBuyKey = (week: string, accountId: string) => `ghost:buy:${week}:${accountId}`;
export const ghostCallKey = (accountId: string) => `ghost:call:${accountId}`;
const BUY_TTL_SEC = 9 * 24 * 3600;
export const GHOST_CALL_TTL_SEC = 3 * 3600;

export interface GhostStore {
  /** 그 주 그 물건을 처음 사면 잡고 true, 이미 샀으면 false */
  claim(week: string, accountId: string, key: string): Promise<boolean>;
  /** 잡아 둔 것을 풀어요 (차감 실패) */
  release(week: string, accountId: string, key: string): Promise<void>;
  /** 그 주 산 물건 이름표 */
  bought(week: string, accountId: string): Promise<string[]>;
  getCall(accountId: string): Promise<GhostCall>;
  setCall(accountId: string, call: GhostCall): Promise<void>;
}

export class MemoryGhostStore implements GhostStore {
  private buys = new Map<string, Set<string>>();
  private calls = new Map<string, { v: "on" | "off"; until: number }>();
  async claim(week: string, accountId: string, key: string) {
    const k = ghostBuyKey(week, accountId);
    const set = this.buys.get(k) ?? new Set<string>();
    if (set.has(key)) return false;
    set.add(key);
    this.buys.set(k, set);
    return true;
  }
  async release(week: string, accountId: string, key: string) {
    this.buys.get(ghostBuyKey(week, accountId))?.delete(key);
  }
  async bought(week: string, accountId: string) {
    return [...(this.buys.get(ghostBuyKey(week, accountId)) ?? [])];
  }
  async getCall(accountId: string): Promise<GhostCall> {
    const c = this.calls.get(accountId);
    return c && c.until > Date.now() ? c.v : null;
  }
  async setCall(accountId: string, call: GhostCall) {
    if (call) this.calls.set(accountId, { v: call, until: Date.now() + GHOST_CALL_TTL_SEC * 1000 });
    else this.calls.delete(accountId);
  }
}

export class RedisGhostStore implements GhostStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "sea/ghost");
  }
  async claim(week: string, accountId: string, key: string) {
    const k = ghostBuyKey(week, accountId);
    const n = await this.redis.sadd(k, key);
    if (n === 1) await this.redis.expire(k, BUY_TTL_SEC);
    return n === 1;
  }
  async release(week: string, accountId: string, key: string) {
    await this.redis.srem(ghostBuyKey(week, accountId), key);
  }
  async bought(week: string, accountId: string) {
    return ((await this.redis.smembers(ghostBuyKey(week, accountId))) ?? []).map(String);
  }
  async getCall(accountId: string): Promise<GhostCall> {
    const v = await this.redis.get<string>(ghostCallKey(accountId));
    return v === "on" || v === "off" ? v : null;
  }
  async setCall(accountId: string, call: GhostCall) {
    if (call) await this.redis.set(ghostCallKey(accountId), call, { ex: GHOST_CALL_TTL_SEC });
    else await this.redis.del(ghostCallKey(accountId));
  }
}

const g = globalThis as typeof globalThis & { __tombGhost?: GhostStore };

export function getGhostStore(): GhostStore {
  const conn = env.redis();
  const cur = g.__tombGhost;
  if (conn) return cur instanceof RedisGhostStore ? cur : (g.__tombGhost = new RedisGhostStore(conn));
  if (env.isProd()) throw new Error("[sea/ghost] Redis 환경변수가 없습니다.");
  return cur instanceof MemoryGhostStore ? cur : (g.__tombGhost = new MemoryGhostStore());
}

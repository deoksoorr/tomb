import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import { SNACK_DAY_LIMIT, SNACK_HOLD_MAX, type SnackKind } from "./gull";

// 11/17 갈매기 과자 저장소: 가진 과자 (가지마다) · 그날 산 개수 (둘 합쳐 하루 10개).
// Redis: 사기 = Lua 1번 (하루 개수 확인·더하기 + 과자 +1), 던지기 = Lua 1번 (있으면 −1), 보기 = Lua 1번 (HMGET + GET)
//  gull:snack:{accountId}        HASH plain · spicy (EX 30일 — 쓸 때마다 늘어나요)
//  gull:day:{accountId}:{day}    STRING 그날 산 개수 (EX 2일)

export const snackKey = (acct: string) => `gull:snack:${acct}`;
export const snackDayKey = (acct: string, day: string) => `gull:day:${acct}:${day}`;
const HOLD_TTL_SEC = 30 * 86_400;
const DAY_TTL_SEC = 2 * 86_400;

export type SnackState = { plain: number; spicy: number; bought: number };
export type BuyResult = SnackState & { status: "ok" | "limit" | "full" };

export interface GullStore {
  get(acct: string, day: string): Promise<SnackState>;
  /** 하루 한도·들고 있을 수 있는 수 안이면 +1 */
  buy(acct: string, day: string, kind: SnackKind): Promise<BuyResult>;
  /** 산 것을 물러요 (포인트 차감 실패) */
  unbuy(acct: string, day: string, kind: SnackKind): Promise<void>;
  /** 있으면 하나 쓰고 true */
  take(acct: string, kind: SnackKind): Promise<boolean>;
}

export class MemoryGullStore implements GullStore {
  private hold = new Map<string, { plain: number; spicy: number }>();
  private days = new Map<string, number>();
  private h(acct: string) {
    let v = this.hold.get(acct);
    if (!v) this.hold.set(acct, (v = { plain: 0, spicy: 0 }));
    return v;
  }
  async get(acct: string, day: string) {
    const v = this.h(acct);
    return { plain: v.plain, spicy: v.spicy, bought: this.days.get(snackDayKey(acct, day)) ?? 0 };
  }
  async buy(acct: string, day: string, kind: SnackKind): Promise<BuyResult> {
    const v = this.h(acct);
    const k = snackDayKey(acct, day);
    const bought = this.days.get(k) ?? 0;
    if (bought >= SNACK_DAY_LIMIT) return { ...v, bought, status: "limit" };
    if (v[kind] >= SNACK_HOLD_MAX) return { ...v, bought, status: "full" };
    v[kind] += 1;
    this.days.set(k, bought + 1);
    return { ...v, bought: bought + 1, status: "ok" };
  }
  async unbuy(acct: string, day: string, kind: SnackKind) {
    const v = this.h(acct);
    v[kind] = Math.max(0, v[kind] - 1);
    const k = snackDayKey(acct, day);
    this.days.set(k, Math.max(0, (this.days.get(k) ?? 0) - 1));
  }
  async take(acct: string, kind: SnackKind) {
    const v = this.h(acct);
    if (v[kind] <= 0) return false;
    v[kind] -= 1;
    return true;
  }
}

// KEYS: hold, day  ARGV: kind, dayLimit, holdMax, holdTtl, dayTtl → {status(0 ok·1 limit·2 full), plain, spicy, bought}
const BUY_LUA = `
local bought = tonumber(redis.call('GET', KEYS[2]) or '0') or 0
local have = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0') or 0
local st = 0
if bought >= tonumber(ARGV[2]) then st = 1 elseif have >= tonumber(ARGV[3]) then st = 2 else
  redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  bought = redis.call('INCR', KEYS[2])
  redis.call('EXPIRE', KEYS[2], ARGV[5])
end
return {st, tonumber(redis.call('HGET', KEYS[1], 'plain') or '0') or 0, tonumber(redis.call('HGET', KEYS[1], 'spicy') or '0') or 0, bought}
`;
// KEYS: hold  ARGV: kind → 1 쓰고 남음 / 0 없음
const TAKE_LUA = `
local n = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0') or 0
if n <= 0 then return 0 end
redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
return 1
`;

export class RedisGullStore implements GullStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "sea/gull");
  }
  async get(acct: string, day: string) {
    const [h, d] = await Promise.all([this.redis.hmget<Record<string, string | number | null>>(snackKey(acct), "plain", "spicy"), this.redis.get<number>(snackDayKey(acct, day))]);
    return { plain: Number(h?.plain ?? 0) || 0, spicy: Number(h?.spicy ?? 0) || 0, bought: Number(d ?? 0) || 0 };
  }
  async buy(acct: string, day: string, kind: SnackKind): Promise<BuyResult> {
    const r = await this.redis.eval<string[], number[]>(BUY_LUA, [snackKey(acct), snackDayKey(acct, day)], [kind, String(SNACK_DAY_LIMIT), String(SNACK_HOLD_MAX), String(HOLD_TTL_SEC), String(DAY_TTL_SEC)]);
    const st = Number(r[0]);
    return { status: st === 0 ? "ok" : st === 1 ? "limit" : "full", plain: Number(r[1]) || 0, spicy: Number(r[2]) || 0, bought: Number(r[3]) || 0 };
  }
  async unbuy(acct: string, day: string, kind: SnackKind) {
    await Promise.all([this.redis.hincrby(snackKey(acct), kind, -1), this.redis.decr(snackDayKey(acct, day))]);
  }
  async take(acct: string, kind: SnackKind) {
    return Number(await this.redis.eval<string[], number>(TAKE_LUA, [snackKey(acct)], [kind])) === 1;
  }
}

const g = globalThis as typeof globalThis & { __tombGull?: GullStore };

export function getGullStore(): GullStore {
  const conn = env.redis();
  const cur = g.__tombGull;
  if (conn) return cur instanceof RedisGullStore ? cur : (g.__tombGull = new RedisGullStore(conn));
  if (env.isProd()) throw new Error("[sea/gull] Redis 환경변수가 없습니다.");
  return cur instanceof MemoryGullStore ? cur : (g.__tombGull = new MemoryGullStore());
}

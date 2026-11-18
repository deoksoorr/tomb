import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";

// 11/18 세션 세대 번호: 계정마다 정수 하나. 쿠키 서명에 들어가고, 쿠키 세대가 지금 세대보다 낮으면 그 쿠키는 무효(lib/session.ts).
// 개인 코드 재발급·「다른 기기에서 모두 로그아웃」 때만 올린다. 한 번도 안 올린 계정은 0 (옛 쿠키가 그대로 유효).
//
// Redis 키 (이 파일에서만 쓴다)
//  - session:gen  HASH 계정 id → 세대 (올린 적 있는 계정만 — 판정 캐시는 HGETALL 한 번)

const KEY = "session:gen";

export interface SessionGenStore {
  /** 올린 적 있는 계정 전부 (판정 캐시용) */
  all(): Promise<Map<string, number>>;
  /** 한 계정의 지금 세대 (없으면 0) */
  get(accountId: string): Promise<number>;
  /** 세대를 하나 올리고 새 값을 돌려준다 */
  bump(accountId: string): Promise<number>;
}

export class MemorySessionGen implements SessionGenStore {
  readonly gens = new Map<string, number>();
  async all(): Promise<Map<string, number>> {
    return new Map(this.gens);
  }
  async get(accountId: string): Promise<number> {
    return this.gens.get(accountId) ?? 0;
  }
  async bump(accountId: string): Promise<number> {
    const n = (this.gens.get(accountId) ?? 0) + 1;
    this.gens.set(accountId, n);
    return n;
  }
}

class RedisSessionGen implements SessionGenStore {
  private readonly redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "sessionGen");
  }
  async all(): Promise<Map<string, number>> {
    const raw = (await this.redis.hgetall<Record<string, string>>(KEY)) ?? {};
    const out = new Map<string, number>();
    for (const [id, v] of Object.entries(raw)) {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0) out.set(id, n);
    }
    return out;
  }
  async get(accountId: string): Promise<number> {
    const n = Number(await this.redis.hget<string>(KEY, accountId));
    return Number.isInteger(n) && n > 0 ? n : 0;
  }
  async bump(accountId: string): Promise<number> {
    return Number(await this.redis.hincrby(KEY, accountId, 1));
  }
}

const g = globalThis as typeof globalThis & { __tombSessionGen?: SessionGenStore };

export function getSessionGenStore(): SessionGenStore {
  const cur = g.__tombSessionGen;
  const conn = env.redis();
  if (conn) return cur instanceof RedisSessionGen ? cur : (g.__tombSessionGen = new RedisSessionGen(conn));
  if (env.isProd()) throw new Error("[sessionGen] Redis 환경변수가 없습니다.");
  if (cur instanceof MemorySessionGen) return cur;
  return (g.__tombSessionGen = new MemorySessionGen());
}

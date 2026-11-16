import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import { K } from "./keys";

// 같은 사람 신호 색인 (lib/sameUser.ts가 쓴다). 원본 값은 없고 서버 비밀값 HMAC만 들어온다.
//  - sig:{kind}:{해시}      ZSET 계정 → 마지막으로 본 시각 (최근 SIG_ACCTS_KEEP개)
//  - sig:{kind}:a:{계정}    ZSET 해시 → 마지막으로 본 시각 (최근 SIG_HASHES_KEEP개)
// 둘 다 SIG_TTL_SEC 뒤 저절로 지워진다 (쓸 때마다 늘어난다)

export type SignalKind = "dev" | "fp" | "net";
export type SeenHash = { hash: string; lastAt: number };
export type SeenBy = { accountId: string; lastAt: number };

export const SIG_TTL_DAYS = 90;
export const SIG_TTL_SEC = SIG_TTL_DAYS * 86_400;
export const SIG_ACCTS_KEEP = 50;
export const SIG_HASHES_KEEP = 10;

export interface SignalStore {
  record(accountId: string, kind: SignalKind, hash: string, now: number): Promise<void>;
  /** 계정마다 그 종류의 해시 (최근 먼저, ids 순서) */
  hashesOf(kind: SignalKind, ids: readonly string[], now: number): Promise<SeenHash[][]>;
  /** 해시마다 그걸 쓴 계정 (최근 먼저, hashes 순서) */
  accountsOf(kind: SignalKind, hashes: readonly string[], now: number): Promise<SeenBy[][]>;
}

const live = (at: number, now: number) => at > now - SIG_TTL_SEC * 1000;

export class MemorySignals implements SignalStore {
  private byHash = new Map<string, Map<string, number>>();
  private byAcct = new Map<string, Map<string, number>>();

  private put(m: Map<string, Map<string, number>>, key: string, member: string, at: number, keep: number) {
    let z = m.get(key);
    if (!z) m.set(key, (z = new Map()));
    z.set(member, at);
    if (z.size > keep) for (const [k] of [...z].sort((a, b) => a[1] - b[1]).slice(0, z.size - keep)) z.delete(k);
  }
  private read(m: Map<string, Map<string, number>>, key: string, now: number): [string, number][] {
    return [...(m.get(key) ?? [])].filter(([, at]) => live(at, now)).sort((a, b) => b[1] - a[1]);
  }

  async record(accountId: string, kind: SignalKind, hash: string, now: number) {
    this.put(this.byHash, K.sig(kind, hash), accountId, now, SIG_ACCTS_KEEP);
    this.put(this.byAcct, K.sigOf(kind, accountId), hash, now, SIG_HASHES_KEEP);
  }
  async hashesOf(kind: SignalKind, ids: readonly string[], now: number) {
    return ids.map((id) => this.read(this.byAcct, K.sigOf(kind, id), now).map(([hash, lastAt]) => ({ hash, lastAt })));
  }
  async accountsOf(kind: SignalKind, hashes: readonly string[], now: number) {
    return hashes.map((h) => this.read(this.byHash, K.sig(kind, h), now).map(([accountId, lastAt]) => ({ accountId, lastAt })));
  }
}

/** ZRANGE … WITHSCORES 결과 → [멤버, 점수] */
function pairs(raw: unknown): [string, number][] {
  const a = Array.isArray(raw) ? raw : [];
  const out: [string, number][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([String(a[i]), Number(a[i + 1])]);
  return out;
}

export class RedisSignals implements SignalStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "signals");
  }

  async record(accountId: string, kind: SignalKind, hash: string, now: number) {
    const a = K.sig(kind, hash);
    const b = K.sigOf(kind, accountId);
    await this.redis
      .pipeline()
      .zadd(a, { score: now, member: accountId })
      .zremrangebyrank(a, 0, -(SIG_ACCTS_KEEP + 1))
      .expire(a, SIG_TTL_SEC)
      .zadd(b, { score: now, member: hash })
      .zremrangebyrank(b, 0, -(SIG_HASHES_KEEP + 1))
      .expire(b, SIG_TTL_SEC)
      .exec();
  }
  /** 키 여러 개를 파이프라인 한 번으로 (최근 먼저, 기간 안만) */
  private async many(keys: readonly string[], now: number): Promise<[string, number][][]> {
    if (!keys.length) return [];
    const p = this.redis.pipeline();
    for (const k of keys) p.zrange(k, "+inf", now - SIG_TTL_SEC * 1000, { byScore: true, rev: true, withScores: true });
    return (await p.exec<unknown[]>()).map(pairs);
  }
  async hashesOf(kind: SignalKind, ids: readonly string[], now: number) {
    return (await this.many(ids.map((id) => K.sigOf(kind, id)), now)).map((r) => r.map(([hash, lastAt]) => ({ hash, lastAt })));
  }
  async accountsOf(kind: SignalKind, hashes: readonly string[], now: number) {
    return (await this.many(hashes.map((h) => K.sig(kind, h)), now)).map((r) => r.map(([accountId, lastAt]) => ({ accountId, lastAt })));
  }
}

const g = globalThis as typeof globalThis & { __tombSignals?: SignalStore };

export function getSignals(): SignalStore {
  const cur = g.__tombSignals;
  const conn = env.redis();
  if (conn) return cur instanceof RedisSignals ? cur : (g.__tombSignals = new RedisSignals(conn));
  if (env.isProd()) throw new Error("[signals] Redis 환경변수가 없습니다.");
  if (cur instanceof MemorySignals) return cur;
  return (g.__tombSignals = cur ? Object.assign(new MemorySignals(), cur) : new MemorySignals());
}

import { Redis } from "@upstash/redis";
import { env } from "../env";
import { K } from "./keys";

// 구글 계정 연결: 게임 계정 하나 ↔ 구글 계정 하나.
// 구글 고유 번호(sub) 원문은 어디에도 저장하지 않고, 서버 비밀값 HMAC(subHash, lib/googleAuth.ts)만 둔다.
//  - google:sub:{subHash} → 계정 id (구글로 들어올 때 찾는 색인)
//  - acct:{id}:google     → { h: subHash, at: 연결 시각 } (계정 정보 표시·끊기)
// 두 키는 늘 같이 바뀐다 (Redis는 Lua 한 번, 메모리는 한 함수 안에서) → 한쪽만 남는 일이 없다.

/**
 * ok = 연결함, same = 이미 이 계정에 이 구글이 연결돼 있음,
 * taken = 이 구글이 다른 계정에 연결돼 있음, other = 이 계정에 다른 구글이 연결돼 있음 (먼저 끊어야 한다)
 */
export type GoogleLinkResult = "ok" | "same" | "taken" | "other";

export interface GoogleLinkStore {
  link(accountId: string, subHash: string, now: number): Promise<GoogleLinkResult>;
  /** 끊었으면 true, 연결이 없었으면 false */
  unlink(accountId: string): Promise<boolean>;
  /** 이 구글이 연결된 계정 id */
  accountOf(subHash: string): Promise<string | null>;
  /** 이 계정의 연결 (없으면 null) */
  linkOf(accountId: string): Promise<{ subHash: string; at: number } | null>;
}

export class MemoryGoogleLinks implements GoogleLinkStore {
  private bySub = new Map<string, string>();
  private byAcct = new Map<string, { subHash: string; at: number }>();

  async link(accountId: string, subHash: string, now: number): Promise<GoogleLinkResult> {
    const owner = this.bySub.get(subHash);
    if (owner && owner !== accountId) return "taken";
    const cur = this.byAcct.get(accountId);
    if (cur && cur.subHash !== subHash) return "other";
    if (owner && cur) return "same";
    this.bySub.set(subHash, accountId);
    this.byAcct.set(accountId, { subHash, at: now });
    return "ok";
  }
  async unlink(accountId: string): Promise<boolean> {
    const cur = this.byAcct.get(accountId);
    if (!cur) return false;
    if (this.bySub.get(cur.subHash) === accountId) this.bySub.delete(cur.subHash);
    this.byAcct.delete(accountId);
    return true;
  }
  async accountOf(subHash: string): Promise<string | null> {
    return this.bySub.get(subHash) ?? null;
  }
  async linkOf(accountId: string): Promise<{ subHash: string; at: number } | null> {
    return this.byAcct.get(accountId) ?? null;
  }
}

// 연결: 색인과 계정 쪽을 한 번에 확인하고 함께 쓴다 (동시에 두 계정이 같은 구글을 잡아도 하나만 통과)
// KEYS: googleSub(subHash), googleAcct(id)  ARGV: id, subHash, now
const LINK_LUA = `
local owner = redis.call('GET', KEYS[1])
if owner and owner ~= ARGV[1] then return 'taken' end
local cur = redis.call('HGET', KEYS[2], 'h')
if cur and cur ~= ARGV[2] then return 'other' end
if owner and cur then return 'same' end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[2], 'h', ARGV[2], 'at', ARGV[3])
return 'ok'
`;

// 끊기: 읽어 둔 subHash가 그대로일 때만 두 키를 함께 지운다 (그새 바뀌었으면 -1 → 다시 읽고 재시도)
// KEYS: googleAcct(id), googleSub(읽어 둔 subHash)  ARGV: 읽어 둔 subHash, id
const UNLINK_LUA = `
local cur = redis.call('HGET', KEYS[1], 'h')
if not cur then return 0 end
if cur ~= ARGV[1] then return -1 end
if redis.call('GET', KEYS[2]) == ARGV[2] then redis.call('DEL', KEYS[2]) end
redis.call('DEL', KEYS[1])
return 1
`;

export class RedisGoogleLinks implements GoogleLinkStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async link(accountId: string, subHash: string, now: number): Promise<GoogleLinkResult> {
    const r = await this.redis.eval<string[], string>(LINK_LUA, [K.googleSub(subHash), K.googleAcct(accountId)], [accountId, subHash, String(now)]);
    if (r === "ok" || r === "same" || r === "taken" || r === "other") return r;
    throw new Error(`[google] 연결 결과를 알 수 없어요: ${String(r)}`);
  }
  async unlink(accountId: string): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await this.redis.hget<string>(K.googleAcct(accountId), "h");
      if (!cur) return false;
      const r = Number(await this.redis.eval<string[], number>(UNLINK_LUA, [K.googleAcct(accountId), K.googleSub(cur)], [cur, accountId]));
      if (r !== -1) return r === 1;
    }
    throw new Error("[google] 연결 끊기가 계속 경합합니다");
  }
  async accountOf(subHash: string): Promise<string | null> {
    return (await this.redis.get<string>(K.googleSub(subHash))) ?? null;
  }
  async linkOf(accountId: string): Promise<{ subHash: string; at: number } | null> {
    const r = await this.redis.hmget<Record<string, string | null>>(K.googleAcct(accountId), "h", "at");
    const h = r?.h;
    return h ? { subHash: h, at: Number(r?.at) || 0 } : null;
  }
}

const g = globalThis as typeof globalThis & { __tombGoogleLinks?: GoogleLinkStore };

/** 계정 저장소와 같은 백엔드 (Redis가 있으면 Redis, 로컬은 메모리). 운영에서 Redis가 없으면 실패한다 */
export function getGoogleLinks(): GoogleLinkStore {
  const cur = g.__tombGoogleLinks;
  const conn = env.redis();
  if (conn) return cur instanceof RedisGoogleLinks ? cur : (g.__tombGoogleLinks = new RedisGoogleLinks(conn));
  if (env.isProd()) throw new Error("[google] Redis 환경변수가 없습니다");
  if (cur instanceof MemoryGoogleLinks) return cur;
  return (g.__tombGoogleLinks = cur ? Object.assign(new MemoryGoogleLinks(), cur) : new MemoryGoogleLinks());
}

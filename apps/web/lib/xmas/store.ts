import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import { getAccounts } from "../store";
import type { MemoryAccounts } from "../store/accounts-memory";
import { K } from "../store/keys";

// 12월 크리스마스 선물상자 열기 저장 (서버 전용). 무엇을 줄지는 lib/xmas/box(순수)가 정하고, 여기서는 한 번에 반영한다:
//  가방의 상자 1개 빼기 → 뽑힌 꾸미기를 영구로 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기에 — lib/store/staff.ts GRANT_LUA와 같은 규칙)
//  → 그 사이 같은 꾸미기를 이미 영구로 가졌으면(동시에 두 개를 연 경우) 대신 대체 보상(폭죽)을 가방에.
// 함께 바꾸는 키: 계정 가방 acct:{a}:inv · 착용 acct:{a}:look · 벗어 둔 꾸미기 acct:{a}:stash. 포인트·장부·경제 통계는 건드리지 않는다

/** 열기 계획: box = 뺄 상자 id, prize = 줄 꾸미기(없으면 처음부터 대체 보상), fallback = 대체 보상, perm = 영구 만료 시각 */
export type XmasOpenPlan = {
  box: string;
  prize: { itemId: string; slot: string } | null;
  fallback: { itemId: string; count: number };
  perm: number;
};
/** nobox = 가방에 상자가 없다, cosmetic = 꾸미기를 영구로 넣었다, fallback = 대체 보상을 가방에 넣었다 */
export type XmasOpenResult = "nobox" | "cosmetic" | "fallback";

export interface XmasStore {
  open(acct: string, plan: XmasOpenPlan): Promise<XmasOpenResult>;
}

/** 로컬: 메모리 계정 저장소의 동기 도우미로 (await 없이 한 번에 → 동시에 열어도 섞이지 않는다) */
export class MemoryXmas implements XmasStore {
  async open(acct: string, plan: XmasOpenPlan): Promise<XmasOpenResult> {
    const a = getAccounts() as unknown as MemoryAccounts;
    if (!a.questHas(acct) || !a.styleTake(acct, plan.box)) return "nobox";
    const p = plan.prize;
    if (p && !a.questOwnsPermanent(acct, p.itemId, p.slot, plan.perm) && a.staffGrant(acct, [p], plan.perm) > 0) return "cosmetic";
    for (let i = 0; i < plan.fallback.count; i++) a.questGive(acct, plan.fallback.itemId, false);
    return "fallback";
  }
}

// KEYS: inv, look, stash  ARGV: 상자 id, 꾸미기 id('' = 없음), 부위, 영구 만료 ms, 대체 아이템 id, 대체 개수
// 0 = 상자 없음, 1 = 꾸미기, 2 = 대체 보상
const OPEN_LUA = `
if tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0') < 1 then return 0 end
if redis.call('HINCRBY', KEYS[1], ARGV[1], -1) <= 0 then redis.call('HDEL', KEYS[1], ARGV[1]) end
local item, slot, perm = ARGV[2], ARGV[3], tonumber(ARGV[4])
if item ~= '' then
  local cur = redis.call('HGET', KEYS[2], slot)
  local curItem, curUntil = nil, 0
  if cur then
    local ci, cu = string.match(cur, '^([^|]+)|(.+)$')
    curItem, curUntil = ci, tonumber(cu) or 0
  end
  if curItem == item then
    if curUntil < perm then
      redis.call('HSET', KEYS[2], slot, item .. '|' .. ARGV[4])
      return 1
    end
  elseif tonumber(redis.call('HGET', KEYS[3], item) or '0') < perm then
    redis.call('HSET', KEYS[3], item, ARGV[4])
    return 1
  end
end
redis.call('HINCRBY', KEYS[1], ARGV[5], tonumber(ARGV[6]))
return 2
`;

export class RedisXmas implements XmasStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "xmas");
  }
  async open(acct: string, plan: XmasOpenPlan): Promise<XmasOpenResult> {
    const r = Number(
      await this.redis.eval<string[], number>(OPEN_LUA, [K.inv(acct), K.look(acct), K.stash(acct)], [
        plan.box,
        plan.prize?.itemId ?? "",
        plan.prize?.slot ?? "",
        String(plan.perm),
        plan.fallback.itemId,
        String(plan.fallback.count),
      ]),
    );
    return r === 1 ? "cosmetic" : r === 2 ? "fallback" : "nobox";
  }
}

const g = globalThis as typeof globalThis & { __tombXmas?: XmasStore };

export function getXmasStore(): XmasStore {
  const cur = g.__tombXmas;
  const conn = env.redis();
  if (conn) return cur instanceof RedisXmas ? cur : (g.__tombXmas = new RedisXmas(conn));
  if (env.isProd()) throw new Error("[xmas] Redis 환경변수가 없습니다.");
  return cur instanceof MemoryXmas ? cur : (g.__tombXmas = new MemoryXmas());
}

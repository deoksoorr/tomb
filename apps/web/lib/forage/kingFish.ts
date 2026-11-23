import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { weekEndMs } from "../gameDay";
import { redisClient } from "../redisUsage";
import { champBoardsSafe } from "../store/champ";
import { kstWeek } from "../store/accounts";

// 11/23 낚시왕 판매 보너스는 「낚시왕인 주에 잡아서 그 주에 판」 물고기에만 (운영자: 그 전에 낚은 것, 그 주에 낚아 다음 주에 판 것은 안 된다).
// 낚시왕이 물고기를 잡을 때 가방 칸 id별로 몇 마리인지 이번 주 표에 더하고, 팔 때 판 수만큼 표에서 빼며 그만큼만 보너스를 준다.
//  kingfish:{accountId}:{week}  HASH 가방 칸 id → 마리 수 (EXPIREAT 그 주 끝 — 주가 바뀌면 표가 사라져 다음 주에 팔면 보너스 없음)
// 낚시왕이 아닌 계정은 기록하지 않는다 (1위 기록은 프로세스 캐시라 잡을 때마다 Redis를 더 묻지 않는다)

const key = (acct: string, week: string) => `kingfish:${acct}:${week}`;

// 판 수만큼 빼고 실제로 뺀 수를 돌려준다 (동시에 팔아도 두 번 주지 않게 한 번에)
const TAKE_LUA = `
local out = {}
for i = 1, #ARGV, 2 do
  local have = tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0')
  local n = math.min(have, tonumber(ARGV[i + 1]))
  if n > 0 then redis.call('HINCRBY', KEYS[1], ARGV[i], -n) end
  out[#out + 1] = n
end
return out
`;

interface KingFishStore {
  add(acct: string, week: string, ids: readonly string[], expireAtMs: number): Promise<void>;
  take(acct: string, week: string, sold: Record<string, number>): Promise<Record<string, number>>;
}

class MemoryKingFish implements KingFishStore {
  private m = new Map<string, Map<string, number>>();
  async add(acct: string, week: string, ids: readonly string[]): Promise<void> {
    const h = this.m.get(key(acct, week)) ?? new Map<string, number>();
    for (const id of ids) h.set(id, (h.get(id) ?? 0) + 1);
    this.m.set(key(acct, week), h);
  }
  async take(acct: string, week: string, sold: Record<string, number>): Promise<Record<string, number>> {
    const h = this.m.get(key(acct, week));
    const out: Record<string, number> = {};
    for (const [id, k] of Object.entries(sold)) {
      const n = Math.min(h?.get(id) ?? 0, k);
      if (n > 0) {
        h!.set(id, h!.get(id)! - n);
        out[id] = n;
      }
    }
    return out;
  }
}

class RedisKingFish implements KingFishStore {
  constructor(private redis: Redis) {}
  async add(acct: string, week: string, ids: readonly string[], expireAtMs: number): Promise<void> {
    if (!ids.length) return;
    const k = key(acct, week);
    const p = this.redis.pipeline();
    const count = new Map<string, number>();
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
    for (const [id, n] of count) p.hincrby(k, id, n);
    p.expireat(k, Math.ceil(expireAtMs / 1000));
    await p.exec();
  }
  async take(acct: string, week: string, sold: Record<string, number>): Promise<Record<string, number>> {
    const entries = Object.entries(sold).filter(([, k]) => k > 0);
    if (!entries.length) return {};
    const got = await this.redis.eval<string[], number[]>(TAKE_LUA, [key(acct, week)], entries.flatMap(([id, k]) => [id, String(k)]));
    const out: Record<string, number> = {};
    entries.forEach(([id], i) => {
      if (Number(got[i]) > 0) out[id] = Number(got[i]);
    });
    return out;
  }
}

let store: KingFishStore | null = null;
function kingFishStore(): KingFishStore {
  if (store) return store;
  const conn = env.redis();
  store = conn ? new RedisKingFish(redisClient(conn, "forage/kingfish")) : new MemoryKingFish();
  return store;
}

/** 낚시왕이 잡은 물고기 (가방 칸 id — 대물·월척 칸 그대로) 를 이번 주 표에 더한다. 낚시왕이 아니면 아무것도 안 한다. 실패해도 낚시는 막지 않는다 */
export async function recordKingCatch(acct: string, bagIds: readonly string[], now = Date.now()): Promise<void> {
  if (!bagIds.length || !(await champBoardsSafe(acct, now)).includes("fish")) return;
  const week = kstWeek(now);
  await kingFishStore()
    .add(acct, week, bagIds, weekEndMs(week))
    .catch((e) => console.error("[kingfish] 기록 실패", e));
}

/** 판 물고기 중 낚시왕인 이번 주에 잡은 것만 골라 표에서 빼고 돌려준다 (낚시왕이 아니면 {}) */
export async function takeKingCatch(acct: string, sold: Record<string, number>, now = Date.now()): Promise<Record<string, number>> {
  if (!Object.keys(sold).length || !(await champBoardsSafe(acct, now)).includes("fish")) return {};
  return kingFishStore().take(acct, kstWeek(now), sold).catch(() => ({}));
}

/** 테스트용: 메모리 표를 비운다 */
export function resetKingFishForTest(): void {
  store = null;
}

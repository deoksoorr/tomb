import type { Redis } from "@upstash/redis";
import { SEA_KAYAK_SHOUT_COOLDOWN_MS } from "@tomb/protocol";
import { env } from "../env";
import { redisClient } from "../redisUsage";

// 11/16 r18 카약 「같이 타요」 계정마다 1분 간격 (확성기 간격과 같은 방식 — Redis SET NX PX, 없으면 메모리)

const mem = new Map<string, number>();
let client: Redis | null | undefined;
const redis = (): Redis | null => {
  if (client === undefined) {
    const conn = env.redis();
    client = conn ? redisClient(conn, "kayakShout") : null;
  }
  return client;
};
const keyOf = (accountId: string) => `kshout:${accountId}`;

/** 간격을 잡아요: 0이면 지금 외칠 수 있어요(잡았어요), 아니면 남은 ms */
export async function claimKayakShout(accountId: string, now = Date.now(), ms = SEA_KAYAK_SHOUT_COOLDOWN_MS): Promise<number> {
  const r = redis();
  if (r) {
    const ok = await r.set(keyOf(accountId), String(now), { nx: true, px: ms });
    if (ok) return 0;
    const left = await r.pttl(keyOf(accountId));
    return left > 0 ? left : ms;
  }
  const until = mem.get(accountId) ?? 0;
  if (until > now) return until - now;
  mem.set(accountId, now + ms);
  return 0;
}

/** 외치기가 실패하면 간격을 풀어요 (포인트가 모자람 등) */
export async function releaseKayakShout(accountId: string): Promise<void> {
  const r = redis();
  if (r) await r.del(keyOf(accountId));
  else mem.delete(accountId);
}

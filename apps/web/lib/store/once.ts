import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";

// 11/16 같은 요청 두 번 막기 (관리자 선물·포인트 지급을 두 번 눌러 두 번 나가던 것).
// 화면이 보낼 때마다 요청 번호를 붙이고, 서버는 처음 본 번호만 처리한다. 같은 번호가 다시 오면 처음 결과를 돌려준다.
// 하루가 지나면 번호 기록은 저절로 지워진다.

const TTL_SEC = 86_400;
/** 처리 중 표시 (결과가 아직 없을 때) */
export const ONCE_PENDING = "pending";

const mem = new Map<string, { v: string; until: number }>();
let client: Redis | null | undefined;
const redis = (): Redis | null => {
  if (client === undefined) {
    const conn = env.redis();
    client = conn ? redisClient(conn, "once") : null;
  }
  return client;
};
const keyOf = (key: string) => `once:${key}`;

/** key를 처음 쓰면 null (처리 중으로 적어 둔다), 이미 있으면 남아 있던 값 (ONCE_PENDING 또는 처음 결과) */
export async function onceClaim(key: string): Promise<string | null> {
  const r = redis();
  if (r) {
    const ok = await r.set(keyOf(key), ONCE_PENDING, { nx: true, ex: TTL_SEC });
    if (ok) return null;
    return (await r.get<string>(keyOf(key))) ?? ONCE_PENDING;
  }
  const now = Date.now();
  const cur = mem.get(key);
  if (cur && cur.until > now) return cur.v;
  mem.set(key, { v: ONCE_PENDING, until: now + TTL_SEC * 1000 });
  return null;
}

/** 처리가 끝나면 결과를 남긴다 (같은 번호가 다시 오면 이걸 돌려준다) */
export async function onceDone(key: string, result: string): Promise<void> {
  const r = redis();
  if (r) await r.set(keyOf(key), result, { ex: TTL_SEC });
  else mem.set(key, { v: result, until: Date.now() + TTL_SEC * 1000 });
}

/** 처리가 실패하면 번호를 풀어 다시 보낼 수 있게 한다 */
export async function onceRelease(key: string): Promise<void> {
  const r = redis();
  if (r) await r.del(keyOf(key));
  else mem.delete(key);
}

import { Redis } from "@upstash/redis";
import { verifyGrant } from "@tomb/protocol";
import { env } from "./env";
import { HttpError } from "./http";
import { earnPoints } from "./store";
import type { Me } from "./types";

// 22번 황금 고블린(보너스 요정) 보상 받기.
// 실시간 서버(Channel DO)가 "가장 먼저 잡은 한 명"을 정하고 그 사람 앞으로 goblin 증서(JOIN_SECRET 서명)를 준다.
// 여기서는 ① 서명·만료 ② 증서 주인 = 지금 세션 ③ nonce(= 고블린 id) 한 번만 — 을 확인하고 EARN_RULES "goblin" 한도 안에서 지급한다.

export type GoblinClaimResponse = { earned: number; points: number; capped: boolean; me: Me };

/** 받은 고블린 id를 기억하는 시간 (증서 유효 시간 10분보다 넉넉히) */
const ONCE_TTL_SEC = 2 * 86_400;

const g = globalThis as typeof globalThis & { __tombGoblinOnce?: Map<string, number>; __tombGoblinRedis?: Redis };

/** 이 nonce를 처음 쓰면 true (Redis SET NX EX, 로컬은 메모리) */
async function claimOnce(nonce: string, now: number): Promise<boolean> {
  const conn = env.redis();
  if (conn) {
    g.__tombGoblinRedis ??= new Redis({ ...conn, automaticDeserialization: false });
    return (await g.__tombGoblinRedis.set(`goblin:n:${nonce}`, "1", { nx: true, ex: ONCE_TTL_SEC })) !== null;
  }
  const m = (g.__tombGoblinOnce ??= new Map());
  for (const [k, until] of m) if (until <= now) m.delete(k);
  if (m.has(nonce)) return false;
  m.set(nonce, now + ONCE_TTL_SEC * 1000);
  return true;
}

export async function claimGoblin(visitorId: string, token: string, ip: string | undefined, now = Date.now()): Promise<GoblinClaimResponse> {
  const grant = await verifyGrant(env.joinSecret(), token, Math.floor(now / 1000));
  if (!grant || grant.kind !== "goblin") throw new HttpError(400, "BAD_GRANT", "보상 증서가 올바르지 않거나 시간이 지났어요.");
  if (grant.visitorId !== visitorId) throw new HttpError(403, "BAD_GRANT", "다른 사람이 잡은 고블린이에요.");
  if (!(await claimOnce(grant.nonce, now))) throw new HttpError(409, "ALREADY_CLAIMED", "이미 받은 보상이에요.");
  const { earned, me } = await earnPoints(visitorId, "goblin", grant.points, ip);
  return { earned, points: grant.points, capped: earned < grant.points, me };
}

import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { redisUsageSnapshot, type RedisUsageSnapshot } from "@/lib/redisUsage";

/**
 * Redis 명령 수 계측 (lib/redisUsage): 이 요청을 받은 서버 인스턴스가 마지막 요약(5분마다 비운다) 뒤로 센 값.
 * 인스턴스마다 따로라 전체 합계는 Vercel 로그의 "[redis-usage]" 줄이나 Upstash 콘솔로 본다. Redis에는 아무것도 쓰지 않는다
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<RedisUsageSnapshot & { now: number }>({ ...redisUsageSnapshot(40), now: Date.now() });
});

import { Redis } from "@upstash/redis";
import { env } from "../lib/env";

// vitest.redis.config.ts의 globalSetup: 실제 Redis 시험 전에 DB를 한 번 비운다.
// 안전장치: 주소가 이 컴퓨터(localhost·127.0.0.1·::1)일 때만 비운다. 그 밖(Upstash 등)이면 아예 시작하지 않는다.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export default async function setup() {
  const conn = env.redis();
  if (!conn) throw new Error("[redis 시험] KV_REST_API_URL/TOKEN이 없어요. `npm run test:redis -w web`로 일회용 Redis를 띄워 돌려 주세요.");
  const host = new URL(conn.url).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`[redis 시험] ${host}는 이 컴퓨터가 아니에요. 실제 저장소를 비우지 않도록 localhost 일회용 Redis에서만 돌립니다.`);
  await new Redis({ ...conn, automaticDeserialization: false }).flushdb();
}

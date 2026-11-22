import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// 실제 Redis 계약 시험 묶음. 실행: `npm run test:redis -w web` (scripts/test-redis.sh가 일회용 Redis + Upstash REST 프록시를 띄우고 이 설정으로 돌린다)
//  - 대상: env.redis()를 보는 시험 파일 전부 (새 *-redis 시험도 저절로 들어온다. 메모리 전용 부분은 각 파일의 skipIf가 건너뛴다)
//  - 파일은 하나씩 차례로: 하우징 1채널 15번지 같은 공용 자리를 여러 파일이 함께 쓰고,
//    로컬 프록시(serverless-redis-http)는 동시에 온 MULTI/EXEC를 한 연결에 섞어 「MULTI calls can not be nested」로 깨진다
//  - 시작 전 한 번 FLUSHDB (scripts/redis-test-setup.ts — localhost 주소일 때만)

const root = fileURLToPath(new URL("./", import.meta.url));
const redisTests = ["lib", "app", "game", "components"].flatMap((dir) =>
  (readdirSync(join(root, dir), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".test.ts") && readFileSync(join(root, dir, f), "utf8").includes("env.redis()"))
    .map((f) => join(dir, f)),
);

// mergeConfig는 include 배열을 합쳐 버려서(모든 시험이 돈다) 그대로 덮어쓴다
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: redisTests,
    fileParallelism: false,
    globalSetup: ["./scripts/redis-test-setup.ts"],
  },
});

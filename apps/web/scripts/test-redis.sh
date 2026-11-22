#!/usr/bin/env bash
# 실제 Redis 계약 시험 (로컬 전용, 운영 Redis는 건드리지 않는다).
#   npm run test:redis -w web                       (모든 Redis 시험)
#   npm run test:redis -w web -- lib/housing        (일부만: vitest 인자 그대로)
# 일회용 redis:7 + Upstash REST 프록시(hiett/serverless-redis-http)를 도커로 띄우고 vitest.redis.config.ts로 돌린 뒤 컨테이너를 지운다.
# 필요: Docker. 이미 띄운 프록시가 있으면 KV_REST_API_URL/KV_REST_API_TOKEN(localhost)을 주고 `npx vitest run -c vitest.redis.config.ts`.
set -euo pipefail
cd "$(dirname "$0")/.."

tag="tomb-redis-test-$$"
token="local-test-token"
cleanup() {
  docker rm -f "$tag-srh" "$tag-redis" >/dev/null 2>&1 || true
  docker network rm "$tag" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$tag" >/dev/null
docker run --rm -d --name "$tag-redis" --network "$tag" redis:7-alpine >/dev/null
docker run --rm -d --name "$tag-srh" --network "$tag" -p 127.0.0.1::80 \
  -e SRH_MODE=env -e SRH_TOKEN="$token" -e SRH_CONNECTION_STRING="redis://$tag-redis:6379" \
  hiett/serverless-redis-http:latest >/dev/null
port="$(docker port "$tag-srh" 80/tcp | head -1 | sed 's/.*://')"
url="http://localhost:$port"

for _ in $(seq 1 60); do
  if curl -sf -H "Authorization: Bearer $token" -H "content-type: application/json" -d '["PING"]' "$url" 2>/dev/null | grep -q PONG; then break; fi
  sleep 0.5
done

KV_REST_API_URL="$url" KV_REST_API_TOKEN="$token" npx vitest run -c vitest.redis.config.ts "$@"

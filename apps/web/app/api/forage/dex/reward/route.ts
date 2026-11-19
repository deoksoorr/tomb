import { handler, json } from "@/lib/http";
import { DexPaySchema } from "@/lib/forage/schemas";
import { claimDexPending } from "@/lib/forage/service";
import type { DexPayResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { readBody } from "@/lib/validate";

/** [도감 보상 받기] `{ cat }`: 예전 한도·꽉 찬 지갑으로 쌓인 그 칸의 처음 등록 보상을 받기 (동시에 눌러도 한 번만) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("forage", req, visitorId);
  const { cat } = await readBody(req, DexPaySchema);
  return json<DexPayResponse>(await claimDexPending(visitorId, cat, ipHash(req)));
});

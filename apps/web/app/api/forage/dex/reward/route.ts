import { handler, json } from "@/lib/http";
import { DexPaySchema } from "@/lib/forage/schemas";
import { claimDexPending } from "@/lib/forage/service";
import type { DexPayResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** [도감 보상 받기] `{ cat }`: 한도에 걸려 쌓인 그 칸의 처음 등록 보상을 오늘 한도 안에서 (동시에 눌러도 한 번만) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { cat } = await readBody(req, DexPaySchema);
  return json<DexPayResponse>(await claimDexPending(visitorId, cat, ipHash(req)));
});

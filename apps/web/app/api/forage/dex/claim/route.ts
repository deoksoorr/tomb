import { handler, json } from "@/lib/http";
import { DexClaimSchema } from "@/lib/forage/schemas";
import { claimDexReward } from "@/lib/forage/service";
import type { DexClaimResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 도감 달성 보상 `{ cat, tier }` (한 번만, 포인트 + 50·100%는 칭호) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { cat, tier } = await readBody(req, DexClaimSchema);
  return json<DexClaimResponse>(await claimDexReward(visitorId, cat, tier, ipHash(req)));
});

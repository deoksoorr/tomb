import { handler } from "@/lib/http";
import { legacyDexClaim } from "@/lib/forage/service";
import { requireVisitor } from "@/lib/session";

/**
 * 예전 도감 달성 보상 `{ cat, tier }` — 11/14 종마다 처음 등록 보상으로 바뀌어 늘 409 DEX_CHANGED로 거절한다
 * (배포 중 옛 화면이 불러도 포인트가 나가지 않게. 새 화면은 /api/forage/dex/reward)
 */
export const POST = handler(async (req) => {
  await requireVisitor(req);
  return legacyDexClaim();
});

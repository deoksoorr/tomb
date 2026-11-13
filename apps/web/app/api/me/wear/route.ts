import { isStaffItem, itemById } from "@tomb/protocol";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { isStaff } from "@/lib/staff";
import { requireVisitor } from "@/lib/session";
import { recordLook } from "@/lib/lookRank";
import { getAccounts } from "@/lib/store";
import { lookGrant, lookOf, loadMe } from "@/lib/store/accounts";
import type { WearResponse } from "@/lib/types";
import { readBody, WearSchema } from "@/lib/validate";

/**
 * 벗어 둔 꾸미기 다시 입기 `{ itemId }` (남은 시간 그대로, 같은 부위에 입던 것은 벗어 둔 쪽으로) + 착용 증서.
 * 벗어 둔 꾸미기에 없거나 만료됐으면(이미 입고 있는 것 포함) 409 NO_ITEM
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, WearSchema);
  await rateLimit("shop", req, visitorId);
  // 31번 운영자 전용 꾸미기는 운영자만 입는다 (운영자에서 풀리면 벗어 둔 채로)
  if (isStaffItem(itemId) && !(await isStaff(visitorId))) throw new HttpError(403, "FORBIDDEN", "운영자만 입을 수 있는 꾸미기예요.");
  const accounts = getAccounts();
  const now = Date.now();
  if (!(await accounts.wear(visitorId, itemId, itemById(itemId)!.slot!, now)))
    throw new HttpError(409, "NO_ITEM", "벗어 둔 꾸미기 중에 그 아이템이 없어요.");
  const me = await loadMe(accounts, visitorId, now);
  await recordLook(visitorId, me, { now }); // 꾸미기 랭킹 점수
  return json<WearResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now, me) });
});

import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { lookGrant, lookOf, loadMe } from "@/lib/store/accounts";
import type { WearResponse } from "@/lib/types";
import { readBody, UnequipSchema } from "@/lib/validate";

/** 그 부위 벗기 `{ slot }` (벗어 둔 꾸미기로, 남은 시간은 계속 흐른다) + 착용 증서. 입은 게 없으면 409 NO_ITEM */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { slot } = await readBody(req, UnequipSchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const now = Date.now();
  if (!(await accounts.unequip(visitorId, slot, now))) throw new HttpError(409, "NO_ITEM", "그 부위에 입은 게 없어요.");
  const me = await loadMe(accounts, visitorId, now);
  return json<WearResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now, me) });
});

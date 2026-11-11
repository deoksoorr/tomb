import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { ActivitySeenSchema, readBody } from "@/lib/validate";

/** 여기까지 읽음 `{ at }` (뒤로 되돌리지 않는다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { at } = await readBody(req, ActivitySeenSchema);
  const accounts = getAccounts();
  const lastSeenAt = await accounts.seeActivity(visitorId, Math.min(at, Date.now()));
  const { items } = await accounts.activity(visitorId);
  // 49번에서 없어진 살려주세요 소식은 세지 않는다 (GET /api/me/activity와 같은 기준)
  return json({ lastSeenAt, unread: items.filter((i) => i.kind !== "revive" && i.at > lastSeenAt).length });
});

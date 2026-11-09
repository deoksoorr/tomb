import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import type { ActivityResponse } from "@/lib/types";

/** 내 소식 (최신 순 50개). `?since=ms`면 그 뒤의 것만. unread = 읽음 시각 뒤의 것 수 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0) || 0;
  const { items, lastSeenAt } = await getAccounts().activity(visitorId);
  return json<ActivityResponse>({
    items: items.filter((i) => i.at > since),
    unread: items.filter((i) => i.at > lastSeenAt).length,
    lastSeenAt,
  });
});

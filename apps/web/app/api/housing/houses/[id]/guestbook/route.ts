import { handler, json } from "@/lib/http";
import { GuestSchema } from "@/lib/housing/schemas";
import { findVisibleHouse, getHouseStore, guestView, postGuest } from "@/lib/housing/service";
import type { GuestbookResponse } from "@/lib/housing/types";
import { myBrief } from "@/lib/housing/points";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId, requireVisitor } from "@/lib/session";
import { pushActivity } from "@/lib/store";
import { readBody } from "@/lib/validate";

/** 방명록 (최신 50개, 가린 글 제외). 내가 쓴 글 표시(mine)가 있어 공유 캐시에 올리지 않는다 */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("detail", req);
  const store = getHouseStore();
  const [h, visitorId] = await Promise.all([findVisibleHouse(store, id), getVisitorId(req)]);
  return json<GuestbookResponse>({ entries: await guestView(store, h.id, visitorId) }, { headers: { "Cache-Control": "private, no-store" } });
});

/** 방명록 남기기 `{ text }` (1~80자, 링크·금칙어 불가, 하루 10개) */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  const { text } = await readBody(req, GuestSchema);
  await rateLimit("reaction", req, visitorId);
  const store = getHouseStore();
  const me = await myBrief(visitorId);
  await postGuest(store, id, visitorId, me.name ?? "지나가던 유령", text);
  const h = await store.get(id);
  if (h) await pushActivity(h.owner, { kind: "guestbook", actorId: visitorId, targetId: id, targetName: h.name });
  return json<GuestbookResponse>({ entries: await guestView(store, id, visitorId) }, { status: 201 });
});

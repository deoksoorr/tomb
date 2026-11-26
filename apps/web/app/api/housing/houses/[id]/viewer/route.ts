import { handler, json } from "@/lib/http";
import { findVisibleHouse, getHouseStore } from "@/lib/housing/service";
import type { HouseViewerResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { kstDay } from "@/lib/store/accounts";

/** 이 집에 대한 내 상태 (내 집인지, 오늘 좋아요를 눌렀는지) */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("detail", req);
  const store = getHouseStore();
  // 11/26 좋아요 여부도 집 확인과 함께 읽는다 (집이 없으면 404 — 읽은 것은 버린다)
  const hp = findVisibleHouse(store, id);
  hp.catch(() => undefined);
  const visitorId = await getVisitorId(req);
  const [h, likedToday] = await Promise.all([hp, visitorId ? store.likedToday(id, visitorId, kstDay()) : false]);
  return json<HouseViewerResponse>({ mine: !!visitorId && h.owner === visitorId, likedToday }, { headers: { "Cache-Control": "private, no-store" } });
});

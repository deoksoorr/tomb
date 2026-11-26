import { handler, json } from "@/lib/http";
import { CreateHouseSchema, ProfileSchema, zoneOfQuery } from "@/lib/housing/schemas";
import { buyCampHome, buyCottage, buyPlot, editProfile, getHouseStore, myHouse } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { notifyHomes } from "@/lib/housing/homesNotify";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { myBrief } from "@/lib/housing/points";
import { readBody } from "@/lib/validate";

/** 내 집 + 가진 물건 + 포인트 + 11/26 값표(prices) (방문자별이라 캐시하지 않는다). 11/16 `?zone=sea` = 내 포구 오두막, 11/26 `?zone=camp` = 내 캠핑장 집 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<MyHouseResponse>(await myHouse(getHouseStore(), visitorId, undefined, zoneOfQuery(req.nextUrl.searchParams.get("zone"))));
});

/**
 * 분양 `{ name, intro, ch, lot?, tier? }`: 고른 터 크기(없으면 작은 터)의 바로 사기 값(분양가+넓히기 누적)을 쓰고 ch 채널 주거 구역에 내 집을 만든다 (계정 전체에서 1채).
 * lot이 없으면 그 채널의 가장 앞의 빈 번지. 다른 채널의 같은 번지와는 서로 다른 필지다 (채널마다 번지 색인이 따로)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, CreateHouseSchema);
  await rateLimit("shop", req, visitorId);
  const me = await myBrief(visitorId);
  const ownerName = me.name ?? "이름 없는 유령";
  // 11/16 `zone: "sea"` = 포구 오두막 (값 1.5배, 마을 집이 있으면 별장 2배. style = 겉모습)
  // 11/26 `zone: "camp"` = 캠핑장 집 (lot 필수 — 종류는 터로 정해진다. tier·style은 무시, 카라반은 design = 고른 디자인)
  const house =
    body.zone === "sea"
      ? await buyCottage(getHouseStore(), visitorId, body.name, body.intro, ownerName, body.lot ?? null, body.ch, body.tier, body.style)
      : body.zone === "camp"
        ? await buyCampHome(getHouseStore(), visitorId, body.name, body.intro, ownerName, body.lot, body.ch, body.kind, body.design)
        : await buyPlot(getHouseStore(), visitorId, body.name, body.intro, ownerName, body.lot ?? null, body.ch, body.tier);
  return json<MyHouseResponse>(notifyHomes(house), { status: 201 });
});

/** 이름·소개 바꾸기 (무료). 11/26 문패가 그대로면(소개만·같은 값 저장) 집 바뀜 알림을 보내지 않는다 — 마을 목록에는 문패만 보인다 */
export const PATCH = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name, intro, zone } = await readBody(req, ProfileSchema);
  await rateLimit("shop", req, visitorId);
  const { house, renamed } = await editProfile(getHouseStore(), visitorId, name, intro, zone);
  return json<MyHouseResponse>(renamed ? notifyHomes(house) : house);
});

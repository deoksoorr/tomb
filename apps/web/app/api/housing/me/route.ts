import { handler, json } from "@/lib/http";
import { CreateHouseSchema, ProfileSchema } from "@/lib/housing/schemas";
import { buyPlot, editProfile, getHouseStore, myHouse } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { myPoints } from "@/lib/housing/points";
import { readBody } from "@/lib/validate";

/** 내 집 + 가진 물건 + 포인트 (방문자별이라 캐시하지 않는다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<MyHouseResponse>(await myHouse(getHouseStore(), visitorId));
});

/**
 * 분양 `{ name, intro, ch, lot? }`: 작은 터 가격을 쓰고 ch 채널 주거 구역에 내 집을 만든다 (계정 전체에서 1채).
 * lot이 없으면 그 채널의 가장 앞의 빈 번지. 다른 채널의 같은 번지와는 서로 다른 필지다 (채널마다 번지 색인이 따로)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, CreateHouseSchema);
  await rateLimit("shop", req, visitorId);
  const me = await myPoints(visitorId);
  const house = await buyPlot(getHouseStore(), visitorId, body.name, body.intro, me.name ?? "이름 없는 유령", body.lot ?? null, body.ch);
  return json<MyHouseResponse>(house, { status: 201 });
});

/** 이름·소개 바꾸기 (무료) */
export const PATCH = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name, intro } = await readBody(req, ProfileSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await editProfile(getHouseStore(), visitorId, name, intro));
});

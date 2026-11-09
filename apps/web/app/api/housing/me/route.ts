import { handler, json } from "@/lib/http";
import { CreateHouseSchema, ProfileSchema } from "@/lib/housing/schemas";
import { buyPlot, editProfile, getHouseStore, myHouse } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { myPoints } from "@/lib/housing/points";
import { readBody } from "@/lib/validate";

/** 내 묘역 + 가진 물건 + 포인트 (방문자별이라 캐시하지 않는다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<MyHouseResponse>(await myHouse(getHouseStore(), visitorId));
});

/** 분양 `{ name, intro, lot? }`: 작은 터 가격을 쓰고 내 묘역을 만든다 (계정당 1채). lot이 없으면 가장 앞의 빈 번지 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name, intro, lot } = await readBody(req, CreateHouseSchema);
  await rateLimit("shop", req, visitorId);
  const me = await myPoints(visitorId);
  return json<MyHouseResponse>(await buyPlot(getHouseStore(), visitorId, name, intro, me.name ?? "이름 없는 유령", lot ?? null), { status: 201 });
});

/** 이름·소개 바꾸기 (무료) */
export const PATCH = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name, intro } = await readBody(req, ProfileSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await editProfile(getHouseStore(), visitorId, name, intro));
});

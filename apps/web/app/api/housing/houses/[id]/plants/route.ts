import { HttpError, handler, json } from "@/lib/http";
import type { PlantsResponse } from "@/lib/housing/plants";
import { getHouseStore, housePlants, waterPlant } from "@/lib/housing/service";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

// 3번 화분: 물 준 기록(GET)과 물 주기(POST {u}). 누구든 물을 줄 수 있고 화분마다 몇 시간에 한 번.

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("detail", req);
  return json<PlantsResponse>(await housePlants(getHouseStore(), id), { headers: { "Cache-Control": "no-store" } });
});

export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const body = (await req.json().catch(() => null)) as { u?: unknown } | null;
  const u = body?.u;
  if (typeof u !== "string" || !/^[a-z0-9]{1,8}$/.test(u)) throw new HttpError(400, "BAD_REQUEST", "어느 화분인지 알 수 없어요.");
  return json<PlantsResponse>(await waterPlant(getHouseStore(), id, u));
});

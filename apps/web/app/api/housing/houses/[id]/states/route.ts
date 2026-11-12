import { HttpError, handler, json } from "@/lib/http";
import { getHouseStore, houseStates, setHouseState } from "@/lib/housing/service";
import type { HouseStatesResponse } from "@/lib/housing/states";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

// 3번 가구 상태: 방 입장 때 받기(GET)와 바꾼 값 저장(POST {u, a}).
// 방 안 누구든 바꿀 수 있다 (방 중계 use와 같은 권한). 도배는 reaction 한도 (클라이언트도 연타를 모아서 보낸다)

export const GET = handler<{ id: string }>(async (req, { id }) => {
  await rateLimit("detail", req);
  return json<HouseStatesResponse>(await houseStates(getHouseStore(), id), { headers: { "Cache-Control": "no-store" } });
});

export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const body = (await req.json().catch(() => null)) as { u?: unknown; a?: unknown } | null;
  const u = body?.u;
  const a = body?.a;
  if (typeof u !== "string" || !/^[a-z0-9]{1,8}$/.test(u)) throw new HttpError(400, "BAD_REQUEST", "어느 가구인지 알 수 없어요.");
  if (typeof a !== "number" || !Number.isInteger(a)) throw new HttpError(400, "BAD_REQUEST", "알 수 없는 값이에요.");
  await setHouseState(getHouseStore(), id, u, a);
  return json({ ok: true as const });
});

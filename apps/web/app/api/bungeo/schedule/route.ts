import { serverNow } from "@/lib/devClock";
import { handler, json } from "@/lib/http";
import { bungeoSchedule, type BungeoSchedule } from "@/lib/bungeo/service";
import { requireVisitor } from "@/lib/session";

/** 11/22 붕어빵 수레 다음 출현 일정 (운영자 계정만 — 아니면 403. 게임 안 운영자 창이 부른다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<BungeoSchedule>(await bungeoSchedule(visitorId, serverNow(visitorId)));
});

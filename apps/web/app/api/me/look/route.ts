import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, lookGrant, lookOf } from "@/lib/store/accounts";
import type { LookGrantResponse } from "@/lib/types";

/** 지금 착용 상태의 증서 (재접속 때 게임이 실시간 서버로 보낸다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const look = lookOf(await getAccounts().get(visitorId, kstDay(now), now));
  return json<LookGrantResponse>({ look, lookGrant: await lookGrant(env.joinSecret(), visitorId, look, now) });
});

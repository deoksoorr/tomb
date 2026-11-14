import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe, lookGrant, lookOf } from "@/lib/store/accounts";
import { champBitsFor, getChamp } from "@/lib/store/champ";
import type { WearResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";
import { isStaff } from "@/lib/staff";

const AuraSchema = z.object({ on: z.boolean() });

/**
 * "전용 오라 보이기"(1위 오라) 켜기·끄기 `{ on }` (기본 켜짐). 지금 1위(지난주 1위 자격)인 사람만 바꿀 수 있다 (아니면 409 NOT_CHAMP).
 * 설정은 남아서 다음에 1위가 되면 그대로 쓴다. 응답의 착용 증서를 게임이 실시간 서버로 보내 다른 사람 화면의 오라도 바로 바뀐다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { on } = await readBody(req, AuraSchema);
  await rateLimit("shop", req, visitorId);
  const now = Date.now();
  // 1위(전용 오라)이거나 31번 운영자(운영자 오라)만 — 같은 끔 설정을 쓴다
  if (!(await champBitsFor(visitorId, now)) && !(await isStaff(visitorId))) throw new HttpError(409, "NOT_CHAMP", "지금은 전용 오라가 없어요.");
  await getChamp().setAuraOff(visitorId, !on);
  const me = await loadMe(getAccounts(), visitorId, now);
  return json<WearResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now, me) });
});

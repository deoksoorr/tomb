import { env } from "@/lib/env";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { recordLook } from "@/lib/lookRank";
import { getAccounts } from "@/lib/store";
import { getStyleStore } from "@/lib/store/style";
import { kstDay, lookGrant, lookOf } from "@/lib/store/accounts";
import type { LookGrantResponse } from "@/lib/types";

/** 지금 착용 상태의 증서 (재접속 때 게임이 실시간 서버로 보낸다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const accounts = getAccounts();
  const [a, style] = await Promise.all([accounts.get(visitorId, kstDay(now), now), getStyleStore(accounts).get(visitorId)]);
  const look = lookOf(a);
  // 46·25번: 염색·몸 모양도 같이 (게임이 내 아바타에 입히고, 증서로 다른 사람 화면에도)
  const appearance = { dye: style.dye, body: a.body };
  // 재접속할 때마다 꾸미기 랭킹 점수도 지금 착용으로 맞춘다 (자리를 비운 사이 끝난 기간제 반영)
  await recordLook(visitorId, { equipped: a.equipped, ...appearance }, { now });
  return json<LookGrantResponse>({ look, ...appearance, lookGrant: await lookGrant(env.joinSecret(), visitorId, look, now, appearance) });
});

import { handler, json } from "@/lib/http";
import { issueJoin } from "@/lib/joinToken";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { getStyleStore } from "@/lib/store/style";
import { kstDay, lookOf } from "@/lib/store/accounts";
import type { JoinResponse } from "@/lib/types";
import { JoinRequestSchema, readBody } from "@/lib/validate";

/**
 * 입장 토큰(60초) 발급. 채널 상한은 Channel DO가 강제하고, 여기서는 채널만 고른다.
 * 전체 만석이면 대기열 주소(`{ mode: "queue" }`)를 준다. 토큰에는 몸 모양(요청에 없으면 계정 값)과 착용 중인 꾸미기가 들어간다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { channel, name, color, body } = await readBody(req, JoinRequestSchema);
  await rateLimit("join", req, visitorId);
  const now = Date.now();
  const accounts = getAccounts();
  const [account, style] = await Promise.all([accounts.get(visitorId, kstDay(now), now), getStyleStore(accounts).get(visitorId)]);
  // 25번 외형 바꾸기: 계정에 몸 모양이 있으면 그것이 정답 (요청 값은 입장 화면에서 처음 고른 몸)
  const claims = { visitorId, name, color, body: account.body ?? body ?? "hood", look: lookOf(account), dye: style.dye };
  return json<JoinResponse>(await issueJoin(channel, claims));
});

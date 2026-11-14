import { isTitleId, titleOfLook } from "@tomb/protocol";
import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { lookGrant, lookOf, loadMe } from "@/lib/store/accounts";
import { earnedTitles, titleStatus } from "@/lib/titlesServer";
import type { TitlesResponse, WearResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";

/** 칭호 끼우기 `{ id }` (id = null이면 빼기) */
const TitleSetSchema = z.object({
  id: z
    .string()
    .refine((s) => isTitleId(s), "모르는 칭호예요.")
    .nullable(),
});

/**
 * GET: 얻은 칭호 id·지금 낀 칭호 + 알림 상태 (fresh = 새로 알릴 칭호, unseen = 가방에서 안 본 칭호, first = 처음 확인 — lib/titlesServer).
 * 목록·이름·얻는 방법은 화면이 lib/titles에서. 화면은 입장·도감 등록·1위 지급·집 저장 뒤 등에 이걸 보고 새 칭호 알림 창을 띄운다
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const [st, me] = await Promise.all([titleStatus(visitorId, now), loadMe(getAccounts(), visitorId, now)]);
  return json<TitlesResponse>({ ...st, equipped: titleOfLook(lookOf(me)) }, { headers: { "Cache-Control": "private, no-store" } });
});

/**
 * POST: 칭호 하나 끼우기·빼기 + 착용 증서 (머리 위 칭호가 같은 방 사람들에게도 바로 바뀐다).
 * 얻은 칭호만 낄 수 있다 (도감·주간 1위·집 점수 — lib/titlesServer). 빼기는 언제나 된다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id } = await readBody(req, TitleSetSchema);
  await rateLimit("shop", req, visitorId);
  const now = Date.now();
  if (id && !(await earnedTitles(visitorId, now)).includes(id)) throw new HttpError(403, "TITLE_LOCKED", "아직 얻지 못한 칭호예요.");
  const accounts = getAccounts();
  await accounts.setTitle(visitorId, id);
  const me = await loadMe(accounts, visitorId, now);
  return json<WearResponse>({ me, lookGrant: await lookGrant(env.joinSecret(), visitorId, lookOf(me), now, me) });
});

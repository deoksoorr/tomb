import { nanoid } from "nanoid";
import { z } from "zod";
import { BBQ_DAILY, BBQ_MENU, bbqItem, GRANT_TTL_SEC, signGrant } from "@tomb/protocol";
import { campOpen } from "@/lib/camp";
import { BBQ_FULL_MESSAGE, type BbqResponse, type BbqStatusResponse } from "@/lib/campBbq";
import { env } from "@/lib/env";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getBbqDay, spendPoints } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";

const BbqSchema = z.object({ item: z.enum(BBQ_MENU.map((m) => m.id) as [string, ...string[]], "메뉴를 골라 주세요.") });

/** 11/15 캠핑장 바베큐: 오늘 먹은 접시 수 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!campOpen()) throw notFound();
  return json<BbqStatusResponse>({ eaten: await getBbqDay().count(visitorId, kstDay(Date.now())), daily: BBQ_DAILY });
});

/**
 * 11/15 캠핑장 바베큐 `{ item }`: 하루 BBQ_DAILY접시까지 → 포인트 차감(spendPoints) → 한 접시 증서(grants "bbq", 60초).
 * 게임이 증서를 실시간 서버로 보내면 서버가 검증해 같은 맵 사람들에게 "잠깐 커진" 모습을 알린다 (재미용, 능력치 변화 없음).
 * 캠핑장이 닫힌 서버(운영 CAMP_ENABLED 없음)에서는 없는 경로. 그날 횟수는 차감 전에 원자적으로 올리고 실패하면 되돌린다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!campOpen()) throw notFound();
  const { item: id } = await readBody(req, BbqSchema);
  await rateLimit("shop", req, visitorId);
  const item = bbqItem(id)!;
  const days = getBbqDay();
  const now = Date.now();
  const day = kstDay(now);
  const eaten = await days.take(visitorId, day);
  if (eaten > BBQ_DAILY) {
    await days.undo(visitorId, day);
    throw new HttpError(429, "RATE_LIMITED", BBQ_FULL_MESSAGE);
  }
  let me;
  try {
    me = await spendPoints(visitorId, item.price, `camp:bbq ${item.name}`);
  } catch (e) {
    await days.undo(visitorId, day);
    throw e;
  }
  const until = now + item.ms;
  const grant = await signGrant(env.joinSecret(), { kind: "bbq", visitorId, item: item.id, until, nonce: nanoid(12), exp: Math.floor(now / 1000) + GRANT_TTL_SEC });
  return json<BbqResponse>({ me, grant, item: item.id, until, eaten, daily: BBQ_DAILY });
});

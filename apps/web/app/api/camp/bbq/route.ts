import { nanoid } from "nanoid";
import { z } from "zod";
import { BBQ_MENU, bbqItem, drinkOne, drunkLevel, drunkUntil, GRANT_TTL_SEC, signGrant } from "@tomb/protocol";
import { campOpen } from "@/lib/camp";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import { env } from "@/lib/env";
import { handler, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getBbqDay, spendPoints } from "@/lib/store";
import { readBody } from "@/lib/validate";

const BbqSchema = z.object({ item: z.enum(BBQ_MENU.map((m) => m.id) as [string, ...string[]], "메뉴를 골라 주세요.") });

/** 11/15 캠핑장 바베큐: 지금 취기 단계 (다른 기기에서 마셨어도 메뉴 창이 안다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!campOpen()) throw notFound();
  const drunk = await getBbqDay().drunk(visitorId);
  return json<BbqStatusResponse>({ drunk: drunkLevel(drunk, Date.now()) });
});

/**
 * 11/15 캠핑장 바베큐 `{ item }`: 포인트 차감(spendPoints) → 한 접시·한 잔 증서(grants "bbq", 60초). 하루 한도는 없다.
 * 게임이 증서를 실시간 서버로 보내면 서버가 검증해 같은 맵 사람들에게 "잠깐 커진" 모습을 알린다 (재미용, 능력치 변화 없음).
 * 캠핑장이 닫힌 서버(운영 CAMP_ENABLED 없음)에서는 없는 경로. 마실 거리는 취기가 최대 5단계에서 멈추고 깨는 시계만 다시 시작한다
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!campOpen()) throw notFound();
  const { item: id } = await readBody(req, BbqSchema);
  await rateLimit("shop", req, visitorId);
  const item = bbqItem(id)!;
  const days = getBbqDay();
  const me = await spendPoints(visitorId, item.price, `camp:bbq ${item.name}`);
  const now = Date.now();
  // 마실 거리(취기): 지금 취기 + 1 (10분에 1씩 깬다) → 증서에 단계·마신 시각, 끝나는 시각 = 다 깨는 시각
  if (item.kind === "drunk") {
    const drunk = drinkOne(await days.drunk(visitorId), now);
    await days.setDrunk(visitorId, drunk);
    const until = drunkUntil(drunk);
    const grant = await signGrant(env.joinSecret(), { kind: "bbq", visitorId, item: item.id, until, nonce: nanoid(12), exp: Math.floor(now / 1000) + GRANT_TTL_SEC, lv: drunk.lv, at: drunk.at });
    return json<BbqResponse>({ me, grant, item: item.id, until, lv: drunk.lv, at: drunk.at });
  }
  const until = now + item.ms;
  const grant = await signGrant(env.joinSecret(), { kind: "bbq", visitorId, item: item.id, until, nonce: nanoid(12), exp: Math.floor(now / 1000) + GRANT_TTL_SEC });
  return json<BbqResponse>({ me, grant, item: item.id, until });
});

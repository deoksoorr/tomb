import { nanoid } from "nanoid";
import { z } from "zod";
import { BBQ_MENU, BBQ_STANDS, bbqItem, bbqStands, drinkOne, drunkLevel, drunkUntil, GRANT_TTL_SEC, signGrant, soberOne, type BbqStand } from "@tomb/protocol";
import { campOpen } from "@/lib/camp";
import { seaOpen } from "@/lib/sea";
import { BBQ_NOT_TIPSY_MESSAGE, BBQ_WRONG_STAND_MESSAGE, type BbqResponse, type BbqStatusResponse } from "@/lib/campBbq";
import { env } from "@/lib/env";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getBbqDay, spendPoints } from "@/lib/store";
import { readBody } from "@/lib/validate";

// stand = 산 곳 (그릴·자판기). 옛 클라이언트는 보내지 않는다 → 그때는 따지지 않는다
const BbqSchema = z.object({ item: z.enum(BBQ_MENU.map((m) => m.id) as [string, ...string[]], "메뉴를 골라 주세요."), stand: z.enum(BBQ_STANDS as [string, ...string[]]).optional() });

/** 11/15 캠핑장 바베큐: 지금 취기 단계 (다른 기기에서 마셨어도 메뉴 창이 안다) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!campOpen() && !seaOpen()) throw notFound();
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
  if (!campOpen() && !seaOpen()) throw notFound();
  const { item: id, stand } = await readBody(req, BbqSchema);
  await rateLimit("shop", req, visitorId);
  const item = bbqItem(id)!;
  // 먹거리는 바베큐 그릴, 마실 거리는 음료 자판기, 11/16 바닷가 매점 메뉴는 매점에서만 판다 (bbqStands)
  if (stand && !bbqStands(item).includes(stand as BbqStand)) throw new HttpError(400, "WRONG_STAND", BBQ_WRONG_STAND_MESSAGE);
  // 11/16 r12 stand를 안 보내는 옛 캠핑장 클라이언트는 캠핑장(그릴·자판기) 메뉴만 (바닷가 매점·자판기 메뉴는 파는 곳을 밝혀야 해요)
  if (!stand && !bbqStands(item).some((s) => s === "grill" || s === "vending")) throw new HttpError(400, "WRONG_STAND", BBQ_WRONG_STAND_MESSAGE);
  // 바닷가 매점·바닷가 자판기(r12)는 바닷가가 열린 서버에서만, 그릴·캠핑장 자판기(그리고 stand를 안 보내는 옛 클라이언트)는 캠핑장이 열린 서버에서만
  if (stand === "kiosk" || stand === "seaVend" ? !seaOpen() : !campOpen()) throw notFound();
  const days = getBbqDay();
  // 컨디숑(술 깨기): 취기가 없으면 포인트를 쓰지 않고 안내만
  if (item.kind === "sober") {
    const before = await days.drunk(visitorId);
    if (!soberOne(before, Date.now())) throw new HttpError(409, "NOT_TIPSY", BBQ_NOT_TIPSY_MESSAGE);
    const me = await spendPoints(visitorId, item.price, `camp:bbq ${item.name}`);
    const now = Date.now();
    // 포인트를 쓰는 사이 마지막 단계가 저절로 깼어도 0으로 맞춘다
    const after = soberOne(await days.drunk(visitorId), now) ?? { lv: 0, at: now };
    await days.setDrunk(visitorId, after);
    const until = drunkUntil(after);
    const grant = await signGrant(env.joinSecret(), { kind: "bbq", visitorId, item: item.id, until, nonce: nanoid(12), exp: Math.floor(now / 1000) + GRANT_TTL_SEC, lv: after.lv, at: after.at });
    return json<BbqResponse>({ me, grant, item: item.id, until, lv: after.lv, at: after.at });
  }
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

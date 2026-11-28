import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { gearAction, type GearActionResponse } from "@/lib/rpg/gearService";
import { GearActionSchema } from "@/lib/rpg/schemas";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/15 세트 장비·강화: 강화(enhance) · 옵션 굴리기(reroll) · 바꾸기(exchange) · 분해(disassemble) · 판매(sell, 11/27 포인트) · 세트 장비 끼기(equip) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const action = await readBody(req, GearActionSchema);
  // 강화는 여러 번 이어 누르니 스킬 찍기와 같은 넉넉한 한도
  await rateLimit(action.type === "enhance" ? "rpgSkill" : "shop", req, visitorId);
  return json<GearActionResponse>(await gearAction(visitorId, action, Date.now(), ipHash(req)));
});

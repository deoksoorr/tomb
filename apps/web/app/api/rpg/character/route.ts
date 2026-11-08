import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { CharacterActionSchema } from "@/lib/rpg/schemas";
import { characterAction } from "@/lib/rpg/service";
import type { RpgView } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 캐릭터 바꾸기: 능력치 올리기(alloc) · 스킬 배우기(learn) · 단축키(hotbar) · 장착/해제(equip) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const action = await readBody(req, CharacterActionSchema);
  await rateLimit("shop", req, visitorId);
  return json<RpgView>(await characterAction(visitorId, action));
});

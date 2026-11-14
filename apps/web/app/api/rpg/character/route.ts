import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { CharacterActionSchema } from "@/lib/rpg/schemas";
import { characterAction } from "@/lib/rpg/service";
import type { RpgView } from "@/lib/rpg/types";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 캐릭터 바꾸기: 능력치 올리기(alloc) · 스킬 찍기(learn) · 단축키(hotbar) · 장착/해제(equip) · 스킬 초기화(respec) · 능력치 초기화(resetStats) · 트리 안내 확인(ackTree) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const action = await readBody(req, CharacterActionSchema);
  // 스킬 찍기·단축키·안내 확인은 자주 누르니 따로 넉넉한 한도, 나머지(능력치·장착·초기화)는 상점과 같은 한도
  await rateLimit(action.type === "learn" || action.type === "hotbar" || action.type === "ackTree" ? "rpgSkill" : "shop", req, visitorId);
  return json<RpgView>(await characterAction(visitorId, action));
});

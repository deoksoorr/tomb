import { z } from "zod";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { setMeteorForced } from "@/lib/rpg/meteorDev";
import { getRpgStore } from "@/lib/rpg/store";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const DevSchema = z.object({
  /** 켜면 다음 별자리 잇기 판부터 맑은 밤이 아니어도 굴리고 확률 1 (완성 별자리 1개 이상은 그대로 필요) */
  force: z.boolean(),
  /** 천장 진행·받은 표시(캐릭터 mt 칸)를 지운다 (이미 받은 오라는 그대로) */
  reset: z.boolean().optional(),
});

/**
 * 개발 전용 (운영 404): 11/20 「유성우 오라」 QA. 내 계정의 굴림을 확률 1로 켜고 끈다 (lib/rpg/meteorDev — 운영에서는 켜져도 무시).
 * 지급·마을 알림·망원경 창 천장 표시를 실제 별자리 잇기 판으로 확인할 때 쓴다
 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, DevSchema);
  setMeteorForced(visitorId, body.force);
  if (body.reset) await getRpgStore().update(visitorId, (s) => ({ state: { ...s, mt: undefined }, result: null }));
  return json({ ok: true, force: body.force });
});

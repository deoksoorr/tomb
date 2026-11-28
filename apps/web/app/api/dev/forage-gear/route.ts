import { z } from "zod";
import { env } from "@/lib/env";
import { gearForced, setGearForced } from "@/lib/forage/gearDev";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const DevSchema = z.object({ raft: z.boolean().optional(), sunken: z.boolean().optional() });

/**
 * 개발 전용 (운영 404): 11/28 낚시 꾸미기 QA. 내 계정의 좌대 코디(raft)·물에 빠진 꾸미기(sunken) 굴림을 확률 1로 켜고 끈다 (lib/forage/gearDev).
 * 지급 직후 가방 [꾸미기]·[지금 모습]이 새로고침 없이 바뀌는지 실제 낚시로 확인할 때 쓴다
 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, DevSchema);
  if (body.raft !== undefined) setGearForced(visitorId, "raft", body.raft);
  if (body.sunken !== undefined) setGearForced(visitorId, "sunken", body.sunken);
  return json({ ok: true, raft: gearForced(visitorId, "raft"), sunken: gearForced(visitorId, "sunken") });
});

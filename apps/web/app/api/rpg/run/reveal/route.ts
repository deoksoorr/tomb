import { z } from "zod";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { revealDrops } from "@/lib/rpg/service";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 11/18 드롭 시드 `{ ticket }` → `{ dropSeed }`: 화면이 우두머리 드롭·상자를 바닥에 떨구는 연출에 쓴다 (보상은 언제나 판 끝에 서버가).
 * 진행 중인 판이고 첫 우두머리가 나올 수 있는 시간이 지났을 때만 (판을 시작하자마자 드롭을 미리 알 수 없게)
 */
const Body = z.object({ ticket: z.string().min(1).max(2000) });

export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("rpgSkill", req, visitorId);
  const { ticket } = await readBody(req, Body);
  return json(await revealDrops(visitorId, ticket));
});

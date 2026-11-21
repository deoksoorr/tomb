import { z } from "zod";
import { finishChair, type ChairFinishResponse } from "@/lib/chairman/service";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const Body = z.object({
  ticket: z.string().min(1).max(1000),
  damage: z.number().finite().min(0).max(1e16),
  durationMs: z.number().finite().min(0).max(24 * 3_600_000),
  /** 11/21 개발 서버 무적(시험) 판 → 연습 판 (운영에서는 서비스가 무시) */
  god: z.boolean().optional(),
});

/** 11/20 회장님 독대 끝 `{ ticket, damage, durationMs }` → 기록·포인트(지갑 전용). 판 시간·피해 상한을 넘으면 422 (기록·포인트 없이 티켓만 쓴다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ticket, damage, durationMs, god } = await readBody(req, Body);
  return json<ChairFinishResponse>(await finishChair(visitorId, ticket, damage, durationMs, Date.now(), { god }));
});

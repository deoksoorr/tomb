import { z } from "zod";
import { startChair, type ChairStartResponse } from "@/lib/chairman/service";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

const Body = z.object({ mode: z.enum(["normal", "hell"]), practice: z.boolean().optional() });

/** 11/20 회장님 독대 시작 `{ mode, practice? }` → 서명한 티켓 + 시드 (+ 지옥 봉인 순서). 유료 판은 하루 모드마다 2판 (시작하면 한 판), 다 쓰면 409 NO_RUNS */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { mode, practice } = await readBody(req, Body);
  return json<ChairStartResponse>(await startChair(visitorId, mode, !!practice));
});

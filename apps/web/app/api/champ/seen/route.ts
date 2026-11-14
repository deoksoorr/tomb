import { z } from "zod";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getChamp } from "@/lib/store/champ";
import { readBody } from "@/lib/validate";

// week = 그 주 월요일 또는 테스트 서버 시험 지급 id ("test:…")
const SeenSchema = z.object({ week: z.string().regex(/^(\d{8}|test:\d{1,16})$/) });

/** 1위 알림 창을 봤다 `{ week }` (그 주 알림은 다시 띄우지 않는다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { week } = await readBody(req, SeenSchema);
  await getChamp().setSeen(visitorId, week);
  return json({ ok: true });
});

import { isTitleId, TITLE_IDS } from "@tomb/protocol";
import { z } from "zod";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getTitleMarks } from "@/lib/store/titleMarks";
import { readBody } from "@/lib/validate";

const ids = z
  .array(z.string().refine((s) => isTitleId(s), "모르는 칭호예요."))
  .max(TITLE_IDS.length)
  .optional();
const MarksSchema = z.object({ announced: ids, seen: ids });

/** 칭호 알림 기록 `{ announced?, seen? }`: 알림 창을 띄운 칭호 · 가방 [칭호] 칸에서 본 칭호 (lib/store/titleMarks) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, MarksSchema);
  await rateLimit("shop", req, visitorId);
  const store = getTitleMarks();
  if (body.announced) await store.add(visitorId, "announced", body.announced);
  if (body.seen) await store.add(visitorId, "seen", body.seen);
  return json<{ ok: true }>({ ok: true });
});

import { isTitleId, TITLE_IDS } from "@tomb/protocol";
import { z } from "zod";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getTitleMarks } from "@/lib/store/titleMarks";
import { earnedTitles, forgetTitles, reachedTitles } from "@/lib/titlesServer";
import { readBody } from "@/lib/validate";

const ids = z
  .array(z.string().refine((s) => isTitleId(s), "모르는 칭호예요."))
  .max(TITLE_IDS.length)
  .optional();
const MarksSchema = z.object({ announced: ids, seen: ids });

/**
 * 칭호 알림 기록 `{ announced?, seen? }`: 알림 창을 띄운 칭호 · 가방 [칭호] 칸에서 본 칭호 (lib/store/titleMarks).
 * 11/18 보안: 알렸음은 지금 기록으로 닿은 칭호만, 봤음은 얻은 칭호만 적는다 (나머지는 조용히 버린다 — 알림 기록이 칭호를 주지 않게)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, MarksSchema);
  await rateLimit("shop", req, visitorId);
  const store = getTitleMarks();
  const now = Date.now();
  // 빈 목록도 그대로 적는다 (처음 확인 표시 — store.add)
  if (body.announced) {
    const reached = body.announced.length ? new Set(await reachedTitles(visitorId, now)) : null;
    await store.add(visitorId, "announced", reached ? body.announced.filter((id) => reached.has(id)) : []);
  }
  if (body.seen) {
    const earned = body.seen.length ? new Set(await earnedTitles(visitorId, now)) : null;
    await store.add(visitorId, "seen", earned ? body.seen.filter((id) => earned.has(id)) : []);
  }
  forgetTitles(visitorId);
  return json<{ ok: true }>({ ok: true });
});

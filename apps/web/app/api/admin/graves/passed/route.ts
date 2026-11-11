import { listAdminPassed, requireAdmin, type AdminPassedResponse } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { normalizeQuery } from "@/lib/store/passing";

/** 성불한 묘비 (숨김 포함, 최신 성불 순). `?q=` 검색, `?offset=` 다음 쪽 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const params = req.nextUrl.searchParams;
  const offset = Number(params.get("offset") ?? 0);
  return json<AdminPassedResponse>(await listAdminPassed(normalizeQuery(params.get("q")), Number.isFinite(offset) ? offset : 0));
});

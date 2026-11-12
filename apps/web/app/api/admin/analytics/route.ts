import { requireAdmin } from "@/lib/admin";
import { ANALYTICS_RANGES, buildReport, type AnalyticsRange, type AnalyticsReport } from "@/lib/analyticsReport";
import { getAnalytics, sampleConcurrency } from "@/lib/analyticsService";
import { handler, HttpError, json } from "@/lib/http";

/**
 * 47번 방문 분석 `?range=hour|day|week|month`. 관리자 화면을 열 때마다 지금 동시 접속도 한 번 찍는다
 * (cron 없이 쌓는 표본 중 하나 — 나머지는 방문·머무르기 요청이 1분 간격으로 찍는다)
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const raw = req.nextUrl.searchParams.get("range") ?? "day";
  if (!(ANALYTICS_RANGES as readonly string[]).includes(raw)) throw new HttpError(400, "INVALID_INPUT", "기간은 hour·day·week·month 중 하나예요.");
  // 표본을 먼저 찍어야 오늘 최고값에 들어간다 (로비가 느리면 1.5초에서 포기)
  await sampleConcurrency(true, Date.now(), undefined, 1500).catch(() => null);
  return json<AnalyticsReport>(await buildReport(getAnalytics(), raw as AnalyticsRange));
});

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
  // 지금 표본도 오늘 최고값에 들어가게: 11/26부터 표본 찍기(실시간 서버 로비 → Redis)와 보고서 읽기를 함께 돌리고, 보고서가 표본 값을 더한다
  // (예전엔 표본을 다 찍은 뒤에야 읽기 시작했다). 로비가 느리면 1.5초에서 포기 — 그때는 표본 없이
  const now = Date.now();
  const live = sampleConcurrency(true, now, undefined, 1500).catch(() => null);
  return json<AnalyticsReport>(await buildReport(getAnalytics(), raw as AnalyticsRange, now, live));
});

import { recordError } from "@/lib/errors";
import { handler } from "@/lib/http";
import { logClientErrors } from "@/lib/opsLog";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId } from "@/lib/session";
import { ErrorBatchSchema, readBody } from "@/lib/validate";

/**
 * 클라이언트 오류 보고 (세션 없어도 됨, IP당 분당 10회 + 11/18 하루 한도 — IP 300, 계정 100). 같은 오류는 묶어서 횟수만 센다.
 * 하루에 새로 묶는 종류도 상한(lib/store/errors ERROR_GROUPS_PER_DAY). 204
 * 11/26 한 번에 5개까지 묶어 받는다 (`{ reports }`, 옛 화면은 하나). 로그인한 계정이면 그 계정의 접속 기록에도 남긴다
 */
export const POST = handler(async (req) => {
  const { reports } = await readBody(req, ErrorBatchSchema);
  await rateLimit("errors", req);
  const visitorId = await getVisitorId(req);
  await rateLimit("errorsDay", req, visitorId ?? undefined);
  const ua = req.headers.get("user-agent")?.slice(0, 300) ?? undefined;
  for (const report of reports) await recordError({ ...report, source: "client", ua: report.ua ?? ua });
  if (visitorId) logClientErrors(visitorId, reports);
  return new Response(null, { status: 204 });
});

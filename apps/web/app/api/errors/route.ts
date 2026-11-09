import { recordError } from "@/lib/errors";
import { handler } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ErrorReportSchema, readBody } from "@/lib/validate";

/** 클라이언트 오류 보고 (세션 없어도 됨, IP당 분당 10회). 같은 오류는 묶어서 횟수만 센다. 204 */
export const POST = handler(async (req) => {
  const report = await readBody(req, ErrorReportSchema);
  await rateLimit("errors", req);
  await recordError({ ...report, source: "client", ua: report.ua ?? req.headers.get("user-agent")?.slice(0, 300) ?? undefined });
  return new Response(null, { status: 204 });
});

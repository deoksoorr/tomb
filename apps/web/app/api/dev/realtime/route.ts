import { z } from "zod";
import { setDevRealtimeUrl } from "@/lib/ban";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { readBody } from "@/lib/validate";

/**
 * 개발 전용 (운영 404): 서버 → 실시간 서버 내부 요청(47번 강퇴·유저 신고)을 QA가 따로 띄운 로컬 실시간 서버로 돌린다.
 * `{ url: "http://localhost:8812" }`, null이면 원래대로. 로컬 주소만 받는다
 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const { url } = await readBody(req, z.object({ url: z.string().regex(/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/).nullable() }));
  setDevRealtimeUrl(url);
  return json({ ok: true, url });
});

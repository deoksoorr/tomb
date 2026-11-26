import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { connHealth24h, type ConnHealth } from "@/lib/opsLog";

/** 11/26 대시보드: 최근 24시간 들어옴·나감 수와 비정상 종료(연결 끊김·응답 없음·오류) 비율. 시간 칸 24개를 파이프라인 한 번에 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<ConnHealth>(await connHealth24h(), { headers: { "Cache-Control": "no-store" } });
});

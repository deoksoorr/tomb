import { chairStatus, type ChairStatusResponse } from "@/lib/chairman/service";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";

/** 11/20 회장님 독대 입장 창: 자격(야근 빌딩 100층)·오늘 남은 판·내 최고·이번 주 내 순위·모드별 상위 3명. 지난주 정리가 아직이면 여기서 한다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  return json<ChairStatusResponse>(await chairStatus(visitorId));
});

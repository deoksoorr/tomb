import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { AdminStayFillSchema, readBody } from "@/lib/validate";

export type AdminStayFillResponse = { next: string; raised: number; minutes: number };

/**
 * 총 접속 시간 채우기 `{ cursor?, count? }` (관리자). 계정을 count개씩 훑어, 아직 남은 날짜별 머무르기 기록(최근 3일치)을 더한 값이
 * 지금 총 접속 시간보다 크면 그 값으로 올린다. 더하지 않고 큰 쪽을 쓰므로 여러 번 돌려도 두 번 세지 않는다.
 * 응답의 next를 다시 넘기며 "0"이 나올 때까지 부른다. 날짜별 기록은 2일 뒤 사라지니 배포하고 바로 한 번 돌린다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { cursor, count } = await readBody(req, AdminStayFillSchema);
  return json<AdminStayFillResponse>(await getAccounts().backfillStay(cursor, count, Date.now()));
});

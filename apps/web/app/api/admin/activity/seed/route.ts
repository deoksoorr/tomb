import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { seedActivity } from "@/lib/userActivity";
import { AdminStayFillSchema, readBody } from "@/lib/validate";

export type AdminActivitySeedResponse = { next: string; recorded: number };

/**
 * 기록 전 활동 채우기 `{ cursor?, count? }` (관리자). 계정을 count개씩 훑어 남은 머무르기 기록(최근 3일)과
 * 그 안의 처음 입장일·마지막 접속일을 활동한 날로 남긴다. 그날 이미 있으면 세지 않아 여러 번 돌려도 그대로.
 * 응답의 next를 다시 넘기며 "0"이 나올 때까지 부른다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { cursor, count } = await readBody(req, AdminStayFillSchema);
  return json<AdminActivitySeedResponse>(await seedActivity(cursor, count, Date.now()));
});

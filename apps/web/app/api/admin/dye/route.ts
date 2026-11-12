import { requireAdmin } from "@/lib/admin";
import { AdminDyeIssueSchema } from "@/lib/dye/schemas";
import { issueFixedDye } from "@/lib/dye/service";
import type { AdminDyeIssueResponse, AdminDyeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { getStyleStore } from "@/lib/store/style";
import { readBody } from "@/lib/validate";

/** 46번 관리자: 고정 색 염색권 정의(최근 것 먼저)와 발급 기록 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const st = getStyleStore(getAccounts());
  const [defs, issues] = await Promise.all([st.fixedDefs(), st.issues()]);
  return json<AdminDyeResponse>({ defs: Object.values(defs).sort((a, b) => b.createdAt - a.createdAt), issues });
});

/**
 * 고정 색 염색권 발급 `{ name, color, parts?, count, target }`: 새 염색권(dyefix_*)을 만들어 대상의 가방에 count장 넣는다.
 * target = "all"(포인트를 가진 적 있는 모든 계정) 또는 계정 id. 색 형식은 서버가 #rrggbb로 검증한다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, AdminDyeIssueSchema);
  return json<AdminDyeIssueResponse>(await issueFixedDye(input));
});

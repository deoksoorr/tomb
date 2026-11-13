import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { codeReissueLog, reissueCode, type CodeReissueLogResponse, type CodeReissueResponse } from "@/lib/adminMembers";
import { adminActor } from "@/lib/ban";
import { handler, json } from "@/lib/http";
import { readBody } from "@/lib/validate";

const Schema = z.object({
  accountId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "계정 id가 올바르지 않아요."),
});

/**
 * 관리자 접속 코드 재발급 `{ accountId }`. 원문 코드는 해시로만 저장돼 되찾을 수 없으므로 새 코드를 만들고 이전 코드는 무효가 된다.
 * 새 코드는 이 응답에서 한 번만 보여 준다(로그·감사 기록에 남기지 않는다). 운영자 계정은 막는다(403). 본인 확인은 운영자가 문의 내용으로 한다.
 * 누가·언제·누구 코드를 재발급했는지는 감사 기록(admin:audit)에 남는다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { accountId } = await readBody(req, Schema);
  return json<CodeReissueResponse>(await reissueCode(accountId, await adminActor(req)));
});

/** 최근 코드 재발급 기록 (최신 먼저 30개) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<CodeReissueLogResponse>({ log: await codeReissueLog() });
});

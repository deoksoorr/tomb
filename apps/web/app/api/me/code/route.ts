import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { codeHash, newCode } from "@/lib/store/accounts";
import type { CodeResponse } from "@/lib/types";

/** 개인 코드 발급·재발급. 원문은 이 응답에서 한 번만 주고 해시만 저장한다. 재발급하면 이전 코드는 무효 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const code = newCode();
  await getAccounts().setCode(visitorId, codeHash(code));
  return json<CodeResponse>({ code });
});

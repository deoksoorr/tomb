import { handler, HttpError, json } from "@/lib/http";
import { assertCodeLoginOpen, recordCodeLoginFailure } from "@/lib/ratelimit";
import { setSessionCookie } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { codeHash, loadMe } from "@/lib/store/accounts";
import type { CodeLoginResponse } from "@/lib/types";
import { CodeLoginSchema, readBody } from "@/lib/validate";

/**
 * 개인 코드로 이 기기를 그 계정으로 전환 `{ code }` → 세션 쿠키를 그 계정 id로 바꾼다.
 * 틀린 코드는 IP당 시간당 10회까지만 받는다 (운영자 IP도 예외 없음).
 */
export const POST = handler(async (req) => {
  await assertCodeLoginOpen(req);
  const { code } = await readBody(req, CodeLoginSchema);
  const accounts = getAccounts();
  const accountId = await accounts.findByCode(codeHash(code));
  if (!accountId) {
    await recordCodeLoginFailure(req);
    throw new HttpError(404, "INVALID_CODE", "이 코드에 맞는 계정이 없어요. 다시 확인해 주세요.");
  }
  const res = json<CodeLoginResponse>({ me: await loadMe(accounts, accountId) });
  await setSessionCookie(res, accountId);
  return res;
});

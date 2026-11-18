import { handler, json } from "@/lib/http";
import { bumpSessionGen, requireVisitor, setSessionCookie } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { codeHash, kstDay, newCode } from "@/lib/store/accounts";
import type { CodeResponse } from "@/lib/types";

/**
 * 개인 코드 발급·재발급. 원문은 이 응답에서 한 번만 주고 해시만 저장한다. 재발급하면 이전 코드는 무효.
 * 11/18 재발급이면(이미 코드가 있었다) 세션 세대도 올려 옛 코드로 들어온 다른 기기를 모두 끊는다 (지금 기기는 새 쿠키로 남는다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const accounts = getAccounts();
  const now = Date.now();
  const had = (await accounts.get(visitorId, kstDay(now), now)).hasCode;
  const code = newCode();
  await accounts.setCode(visitorId, codeHash(code));
  const res = json<CodeResponse>({ code });
  if (had) await setSessionCookie(res, visitorId, await bumpSessionGen(visitorId));
  return res;
});

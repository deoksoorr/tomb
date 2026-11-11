import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { codeHash, newCode } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";

const Schema = z.object({ accountId: z.string().min(4).max(64) });

/**
 * 관리자 코드 재발급 `{ accountId }`. 원문 코드는 해시로만 저장돼 되찾을 수 없으므로 새 코드를 만들고 이전 코드는 무효가 된다.
 * 새 코드는 이 응답에서 한 번만 보여 준다(로그에 남기지 않는다). 본인 확인은 운영자가 문의 내용으로 한다.
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { accountId } = await readBody(req, Schema);
  const accounts = getAccounts();
  const ranked = await accounts.pointRank(10_000, accountId);
  if (!ranked.mine) throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요.");
  const code = newCode();
  await accounts.setCode(accountId, codeHash(code));
  return json({ accountId, name: ranked.mine.name, code });
});

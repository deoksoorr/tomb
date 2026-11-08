import { handler, json } from "@/lib/http";
import { ipHash, requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, kstYesterday, loadMe } from "@/lib/store/accounts";
import type { AttendResponse } from "@/lib/types";
import { AttendSchema, readBody } from "@/lib/validate";

/**
 * 출석 `{ name? }` (입장할 때 부른다). KST 하루 1번, 7일 연속마다 보너스.
 * 같은 IP에서 하루에 포인트를 받는 계정 수는 ATTEND_ACCOUNTS_PER_IP개까지.
 * 이름은 계정에 아직 없을 때만 저장한다 → 개인 코드로 시작한 기기에서도 계정의 닉네임이 그대로 유지된다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { name } = await readBody(req, AttendSchema);
  const accounts = getAccounts();
  const now = Date.now();
  const earned = await accounts.attend(visitorId, ipHash(req), name ?? null, kstDay(now), kstYesterday(now));
  return json<AttendResponse>({ me: await loadMe(accounts, visitorId, now), earned });
});

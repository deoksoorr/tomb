import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { AttendResponse } from "@/lib/types";
import { AttendSchema, readBody } from "@/lib/validate";

/**
 * 입장 기록 `{ name?, color?, body? }` (입장할 때 부른다).
 * 이름·색·몸 모양은 계정에 아직 없을 때만 저장한다 → 개인 코드로 시작·이어서 들어온 기기에서도 계정의 닉네임·아바타가 그대로 유지된다.
 * 10번 개편: 출석 포인트는 여기서 주지 않는다 (earned는 항상 0). 그날 1시간 머문 뒤 출석 달력(/api/me/calendar/claim)에서 받는다
 * → 옛 화면이 입장 때 이 경로를 불러도 포인트가 두 번 나가지 않는다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const profile = await readBody(req, AttendSchema);
  const accounts = getAccounts();
  const now = Date.now();
  await accounts.enter(visitorId, profile, now);
  return json<AttendResponse>({ me: await loadMe(accounts, visitorId, now), earned: 0 });
});

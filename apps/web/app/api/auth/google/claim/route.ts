import { claimGoogle } from "@/lib/googleAccount";
import { clearPendingCookie, googleConfig, readPending } from "@/lib/googleAuth";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import type { GoogleClaimResponse } from "@/lib/types";

/**
 * 구글로 새로 만들기의 마지막: 이름·모습을 정한 새 계정에 방금 확인한 구글(대기 쿠키의 해시)을 연결한다.
 * 개인 코드가 없는 계정이면 코드를 만들어 이 응답에서 한 번만 준다 (서버엔 해시만)
 */
export const POST = handler(async (req) => {
  if (!googleConfig()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const visitorId = await requireVisitor(req);
  const hash = readPending(req);
  if (!hash) throw new HttpError(410, "GOOGLE_EXPIRED", "구글 확인 시간이 지났어요. 내 정보에서 다시 연결해 주세요.");
  const res = json<GoogleClaimResponse>(await claimGoogle(visitorId, hash));
  clearPendingCookie(res);
  return res;
});

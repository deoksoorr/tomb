import { unlinkGoogle } from "@/lib/googleAccount";
import { googleConfig } from "@/lib/googleAuth";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getGoogleLinks } from "@/lib/store/googleLinks";
import type { GoogleStatusResponse } from "@/lib/types";

// 내 정보의 구글 계정 칸: 연결 상태 보기(GET) · 연결 끊기(DELETE). 구글 설정이 없으면 404 (칸을 그리지 않는다)

const off = () => new HttpError(404, "NOT_FOUND", "없는 경로예요.");

export const GET = handler(async (req) => {
  if (!googleConfig()) throw off();
  const visitorId = await requireVisitor(req);
  const link = await getGoogleLinks().linkOf(visitorId);
  return json<GoogleStatusResponse>({ linked: !!link, linkedAt: link?.at ?? null });
});

export const DELETE = handler(async (req) => {
  if (!googleConfig()) throw off();
  const visitorId = await requireVisitor(req);
  await unlinkGoogle(visitorId);
  return json<GoogleStatusResponse>({ linked: false, linkedAt: null });
});

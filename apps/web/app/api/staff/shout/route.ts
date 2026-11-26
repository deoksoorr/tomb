import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import type { OpShoutResponse } from "@/lib/opShout";
import { sendOpShout } from "@/lib/opShoutSend";
import { requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { readBody } from "@/lib/validate";

const Schema = z.object({ text: z.string().max(400) });

/**
 * 11/26 운영자 외치기 (게임 채팅 「/외치기 할 말」) `{ text }`: 31번 운영자 계정만 (매니저·일반 계정은 403).
 * 고정 공지(/api/megaphone/pin)와 같은 운영자 판별. 보내기·검사·간격은 관리자 화면과 같다 (lib/opShoutSend, 기록에 남기지 않는다)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  if (!(await isStaff(visitorId))) throw new HttpError(403, "FORBIDDEN", "운영자만 외칠 수 있어요.");
  const { text } = await readBody(req, Schema);
  return json<OpShoutResponse>(await sendOpShout(text));
});

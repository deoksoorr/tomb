import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import type { OpShoutResponse } from "@/lib/opShout";
import { sendOpShout } from "@/lib/opShoutSend";
import { readBody } from "@/lib/validate";

const Schema = z.object({ text: z.string().max(400) });

/**
 * 11/26 운영자 외치기 (관리자 화면 대시보드) `{ text }`: 모든 채널에 확성기 모양 「운영자」 알림을 지금 띄운다.
 * 기록에 남기지 않는다 (lib/opShoutSend). 게임 안 운영자 계정은 /api/staff/shout (관리자 IP 밖에서도 — /api/admin은 proxy가 IP로 막는다)
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { text } = await readBody(req, Schema);
  return json<OpShoutResponse>(await sendOpShout(text));
});

import { requireAdmin } from "@/lib/admin";
import { GiftSendSchema, sendGift } from "@/lib/gifts";
import { handler, json } from "@/lib/http";
import { getGifts } from "@/lib/store";
import type { GiftLogEntry, GiftRecord } from "@/lib/store/gifts";
import { readBody } from "@/lib/validate";

/** 11번 관리자 선물 발송 기록 (최신 먼저, 받은 계정 수 포함) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<{ gifts: GiftLogEntry[] }>({ gifts: await getGifts().log(100) });
});

/**
 * 선물 보내기 `{ target: "all" | 계정 id, targetName?, from?, note, points?, items? }`.
 * 전체 발송은 선물 하나만 저장하고 계정마다 받을 때 상태가 생긴다 (보낸 시각 이전에 들어온 계정만 대상).
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, GiftSendSchema);
  return json<{ gift: GiftRecord }>({ gift: await sendGift(input) }, { status: 201 });
});

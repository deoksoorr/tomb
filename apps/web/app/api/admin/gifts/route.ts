import { requireAdmin } from "@/lib/admin";
import { runAfter } from "@/lib/analyticsService";
import { notifyMe } from "@/lib/ban";
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
 * 선물 보내기 `{ target: "all" | 계정 id, targetName?, from?, note, points?, items?: { itemId, count, term? }[] }` (term = 꾸미기 기간 3d·7d·30d·perm).
 * 전체 발송은 선물 하나만 저장하고 계정마다 받을 때 상태가 생긴다 (보낸 시각 이전에 들어온 계정만 대상).
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, GiftSendSchema);
  const gift = await sendGift(input);
  // 한 사람에게 보낸 선물: 접속 중이면 그 화면의 선물함(빨간 점)을 바로 맞춘다
  if (input.target !== "all") runAfter(() => notifyMe([input.target]));
  return json<{ gift: GiftRecord }>({ gift }, { status: 201 });
});

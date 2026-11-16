import { requireAdmin } from "@/lib/admin";
import { runAfter } from "@/lib/analyticsService";
import { notifyMe } from "@/lib/ban";
import { GiftSendSchema, sendGift } from "@/lib/gifts";
import { handler, HttpError, json } from "@/lib/http";
import { getGifts } from "@/lib/store";
import { ONCE_PENDING, onceClaim, onceDone, onceRelease } from "@/lib/store/once";
import type { GiftLogEntry, GiftRecord } from "@/lib/store/gifts";
import { readBody } from "@/lib/validate";

/** 11번 관리자 선물 발송 기록 (최신 먼저, 받은 계정 수 포함) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<{ gifts: GiftLogEntry[] }>({ gifts: await getGifts().log(100) });
});

/**
 * 선물 보내기 `{ target?: "all" | 계정 id, targetName?, targets?: { id, name? }[], from?, note, points?, items?: { itemId, count, term? }[] }` (term = 꾸미기 기간 3d·7d·30d·perm).
 * 전체 발송은 선물 하나만 저장하고 계정마다 받을 때 상태가 생긴다 (보낸 시각 이전에 들어온 계정만 대상).
 * targets = 여러 계정에 한 번에 (같은 id는 한 번만, 최대 GIFT_MAX_TARGETS명). 계정마다 선물함에 들어가고 발송 기록은 한 줄
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, GiftSendSchema);
  // 11/16 같은 요청 번호는 한 번만 보낸다 (두 번 누르거나 다시 보내기로 두 번 나가지 않게). 이미 보냈으면 그때 선물을 돌려준다
  const once = input.requestId ? `gift:${input.requestId}` : null;
  if (once) {
    const prior = await onceClaim(once);
    if (prior === ONCE_PENDING) throw new HttpError(409, "IN_PROGRESS", "이미 보내는 중이에요. 잠시 뒤 발송 기록을 확인해 주세요.");
    if (prior !== null) return json<{ gift: GiftRecord }>({ gift: JSON.parse(prior) as GiftRecord }, { status: 200 });
  }
  let gift: GiftRecord;
  try {
    gift = await sendGift(input);
  } catch (e) {
    if (once) await onceRelease(once).catch(() => undefined);
    throw e;
  }
  if (once) await onceDone(once, JSON.stringify(gift));
  // 계정을 골라 보낸 선물: 접속 중이면 그 화면의 선물함(빨간 점)을 바로 맞춘다
  if (gift.target !== "all") runAfter(() => notifyMe(gift.targets ?? [gift.target]));
  return json<{ gift: GiftRecord }>({ gift }, { status: 201 });
});

import { requireAdmin } from "@/lib/admin";
import { runAfter } from "@/lib/analyticsService";
import { adminActor } from "@/lib/ban";
import type { GiftOnlinePreview, GiftOnlineResult } from "@/lib/giftOnline";
import { notifyOnline, onlineTargets, previewOnline, sendOnlineGift } from "@/lib/giftOnlineServer";
import { GiftOnlineSchema } from "@/lib/gifts";
import { handler, HttpError, json } from "@/lib/http";
import { ONCE_PENDING, onceClaim, onceDone, onceRelease } from "@/lib/store/once";
import { readBody } from "@/lib/validate";

/** 11/17 지금 접속 중인 사람 수 (운영자·정지·없는 계정 뺀 수). 확인 화면이 「지금 접속 중인 N명에게 보내요」로 먼저 보여 준다 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<GiftOnlinePreview>(await previewOnline(), { headers: { "Cache-Control": "no-store" } });
});

/**
 * 지금 접속 중인 사람 모두에게 선물 `{ from?, note, points?, items?, requestId?, expect? }`.
 * 받는 사람은 지금 다시 묻는다 (확인한 뒤 들고 난 사람이 있으면 수가 조금 다를 수 있다 — 응답 sent가 실제 수).
 * 1,000명씩 나눠 선물 여러 개로 보내고, 관리자 감사 기록에 한 줄 남긴다
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const input = await readBody(req, GiftOnlineSchema);
  const once = input.requestId ? `giftOnline:${input.requestId}` : null;
  if (once) {
    const prior = await onceClaim(once);
    if (prior === ONCE_PENDING) throw new HttpError(409, "IN_PROGRESS", "이미 보내는 중이에요. 잠시 뒤 발송 기록을 확인해 주세요.");
    if (prior !== null) return json<GiftOnlineResult>(JSON.parse(prior) as GiftOnlineResult);
  }
  let out: GiftOnlineResult;
  let ids: string[] = [];
  try {
    const targets = await onlineTargets();
    if (!targets) throw new HttpError(503, "REALTIME_DOWN", "실시간 서버에 닿지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (!targets.ids.length) throw new HttpError(409, "NO_TARGET", "지금 접속 중인 사람이 없어요.");
    const res = await sendOnlineGift(input, await adminActor(req), Date.now(), targets);
    out = { sent: res!.sent, gifts: res!.gifts, expect: res!.expect };
    ids = targets.ids;
  } catch (e) {
    if (once) await onceRelease(once).catch(() => undefined);
    throw e;
  }
  if (once) await onceDone(once, JSON.stringify(out));
  runAfter(() => notifyOnline(ids));
  return json<GiftOnlineResult>(out, { status: 201 });
});

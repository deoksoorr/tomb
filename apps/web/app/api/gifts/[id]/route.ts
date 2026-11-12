import { giftAccountCreatedAt } from "@/lib/gifts";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getGifts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { GiftClaimResponse, GiftEntry } from "@/lib/types";

const gone = () => new HttpError(404, "NOT_FOUND", "선물을 찾을 수 없어요. 보관 기간(30일)이 지났을 수 있어요.");

/** 받기: 한 번만 (원자적). 포인트는 지갑 상한까지, 아이템은 가방으로 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("gift", req, visitorId);
  const now = Date.now();
  const r = await getGifts().claim(visitorId, id, await giftAccountCreatedAt(visitorId, now), now);
  if (!r.ok && r.reason === "gone") throw gone();
  if (!r.ok) throw new HttpError(409, "ALREADY", "이미 받았거나 지운 선물이에요.");
  const { gift } = r;
  const entry: GiftEntry = {
    id: gift.id,
    from: gift.from,
    note: gift.note,
    points: gift.points,
    items: gift.items,
    createdAt: gift.createdAt,
    expiresAt: gift.expiresAt,
    claimedAt: now,
  };
  return json<GiftClaimResponse>({ gift: entry, me: await loadMe(getAccounts(), visitorId, now), points: r.points });
});

/** 지우기 (안 받은 선물을 지우면 버려진다) */
export const DELETE = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("gift", req, visitorId);
  const now = Date.now();
  if (!(await getGifts().remove(visitorId, id, await giftAccountCreatedAt(visitorId, now), now))) throw gone();
  return json({ ok: true });
});

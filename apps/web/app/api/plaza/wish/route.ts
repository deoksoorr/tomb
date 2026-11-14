import { randomInt } from "node:crypto";
import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import { assertRateLimitOpen, rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts, getWishDay } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";
import { msUntilWishReset, pickFortune, rollBonus, WISH_MAX, WISH_MIN, WISH_USED_MESSAGE, type WishResponse } from "@/lib/wish";

const WishSchema = z.object({
  amount: z.number().int("동전은 1~5포인트예요.").min(WISH_MIN, "동전은 1~5포인트예요.").max(WISH_MAX, "동전은 1~5포인트예요."),
});

/** 서버 난수 0..1 (Math.random 대신 — 결과가 포인트라서) */
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

/**
 * 50번 소원 분수 `{ amount }` (1~5P): 동전 값만큼 차감 → 오늘의 운세 → 가끔 몇 포인트가 튀어 돌아온다(적립 "wish", 하루 한도).
 * 계정당 하루(게임 날짜, 한국 시간 새벽 5시에 바뀐다) 한 번 — 운영자 IP도 예외 없다: 차감 전에 그날 자리를 원자적으로 잡고(lib/store/wishDay SET NX),
 * 포인트가 모자라거나 IP 한도에 걸리면 풀어 준다 → 실패한 시도는 횟수에서 빠진다. 새벽 5시가 지나면 새 날짜 키라 다시 던질 수 있다.
 * IP 한도(lib/ratelimit "wish")는 계정 여러 개로 농사하는 것만 막는다 (운영자 IP는 여기서만 빠진다).
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { amount } = await readBody(req, WishSchema);
  await assertRateLimitOpen("wish", req, visitorId);
  const accounts = getAccounts();
  const days = getWishDay();
  const now = Date.now();
  const day = kstDay(now);
  if (!(await days.claim(visitorId, day))) {
    const retryAfter = Math.max(1, Math.ceil(msUntilWishReset(now) / 1000));
    throw new HttpError(429, "RATE_LIMITED", WISH_USED_MESSAGE, { "Retry-After": String(retryAfter) });
  }
  let left: number | null;
  try {
    left = await accounts.spend(visitorId, amount, `plaza:wish ${amount}P`, now);
  } catch (e) {
    await days.release(visitorId, day);
    throw e;
  }
  if (left === null) {
    await days.release(visitorId, day);
    throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  }
  try {
    await rateLimit("wish", req, visitorId);
  } catch (e) {
    // 같은 IP에서 계정 여러 개로 한도를 넘었다: 차감과 그날 자리를 돌려준다
    await accounts.refund(visitorId, amount, "plaza:wish refund", now);
    await days.release(visitorId, day);
    throw e;
  }
  const fortune = pickFortune(rand(), rand());
  const roll = rollBonus(amount, rand(), rand());
  const bonus = roll > 0 ? await accounts.earn(visitorId, "wish", day, { amount: roll }) : 0;
  return json<WishResponse>({ me: await loadMe(accounts, visitorId, now), fortune, bonus, spent: amount });
});

import { randomInt } from "node:crypto";
import { z } from "zod";
import { handler, HttpError, json } from "@/lib/http";
import { assertRateLimitOpen, rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import { readBody } from "@/lib/validate";
import { pickFortune, rollBonus, WISH_MAX, WISH_MIN, type WishResponse } from "@/lib/wish";

const WishSchema = z.object({
  amount: z.number().int("동전은 1~5포인트예요.").min(WISH_MIN, "동전은 1~5포인트예요.").max(WISH_MAX, "동전은 1~5포인트예요."),
});

/** 서버 난수 0..1 (Math.random 대신 — 결과가 포인트라서) */
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

/**
 * 50번 소원 분수 `{ amount }` (1~5P): 동전 값만큼 차감 → 오늘의 운세 → 가끔 몇 포인트가 튀어 돌아온다(적립 "wish", 하루 한도).
 * 하루 3번(방문자 기준, lib/ratelimit "wish"): 남았는지 먼저 보고(쓰지 않음) → 차감에 성공한 뒤에만 한 번을 쓴다
 * → 포인트가 모자라 실패한 시도는 횟수에서 빠지지 않는다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { amount } = await readBody(req, WishSchema);
  await assertRateLimitOpen("wish", req, visitorId);
  const accounts = getAccounts();
  const now = Date.now();
  const left = await accounts.spend(visitorId, amount, `plaza:wish ${amount}P`, now);
  if (left === null) throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  try {
    await rateLimit("wish", req, visitorId);
  } catch (e) {
    // 동시에 여러 번 눌러 한도를 넘었다: 차감을 돌려준다
    await accounts.refund(visitorId, amount, "plaza:wish refund", now);
    throw e;
  }
  const fortune = pickFortune(rand(), rand());
  const roll = rollBonus(amount, rand(), rand());
  const bonus = roll > 0 ? await accounts.earn(visitorId, "wish", kstDay(now), { amount: roll }) : 0;
  return json<WishResponse>({ me: await loadMe(accounts, visitorId, now), fortune, bonus, spent: amount });
});

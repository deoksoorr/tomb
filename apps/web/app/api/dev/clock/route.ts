import { PRESENCE_INTERVAL_MS } from "@/lib/types";
import { advanceDevClock, serverNow } from "@/lib/devClock";
import { env } from "@/lib/env";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";

/**
 * 개발 전용 (운영 404): 내 시계를 `{ minutes }`(1~240)만큼 앞당기며 그동안 머물렀던 것처럼 10분마다 머무르기 기록을 남긴다.
 * 10번 출석 달력의 "1시간 머묾" 조건을 실제로 기다리지 않고 확인하는 QA용. 다른 방문자의 시간은 그대로다
 */
export const POST = handler(async (req) => {
  if (env.isProd()) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const visitorId = await requireVisitor(req);
  const body = (await req.json().catch(() => ({}))) as { minutes?: unknown };
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new HttpError(400, "INVALID_INPUT", "minutes는 1~240");
  const accounts = getAccounts();
  let earned = 0;
  for (let left = minutes * 60_000; left > 0; left -= PRESENCE_INTERVAL_MS) {
    advanceDevClock(visitorId, Math.min(left, PRESENCE_INTERVAL_MS));
    if (left < PRESENCE_INTERVAL_MS) break;
    const now = serverNow(visitorId);
    earned += (await accounts.presence(visitorId, kstDay(now), now)) ?? 0;
  }
  const now = serverNow(visitorId);
  return json<{ me: Me; earned: number; offsetMs: number }>({ me: await loadMe(accounts, visitorId, now), earned, offsetMs: now - Date.now() });
});

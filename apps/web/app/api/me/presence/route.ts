import { runAfter, sampleConcurrency } from "@/lib/analyticsService";
import { handler, json } from "@/lib/http";
import { serverNow } from "@/lib/devClock";
import { beatAutoFish } from "@/lib/forage/autoSettle";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { staffAccountId } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import { getTitleStats } from "@/lib/store/titleStats";
import { STAY_TICK_MINUTES } from "@/lib/attendStay";
import type { PresenceResponse } from "@/lib/types";

/**
 * 머무르기 포인트 (화면이 켜져 있는 동안 PRESENCE_INTERVAL_MS마다). 직전 지급 후 9.5분이 지났을 때만 +5, 하루 60까지.
 * 실시간 서버를 거치지 않는 Vercel 호출이라 채널 DO를 깨우지 않는다. 너무 일찍 부르면 earned 0.
 * 10번: 받아 준 기록은 포인트 한도와 상관없이 "오늘 머문 시간"(10분씩)으로 쌓여 출석 달력 도장 조건이 된다.
 * `?lite=1`(지금 화면): 계정 전체(loadMe = 명령 10개 남짓)를 다시 읽지 않고 적립 Lua가 돌려준 값만 tick으로 준다 (Redis 명령 절약).
 * 운영자는 지갑을 채워야 해서, lite가 없는 옛 화면은 응답 모양을 지키려고 예전처럼 me 전체.
 * `?sid=`(화면마다 하나): 숨긴 탭은 30분마다 한 번만 보내므로, 같은 화면의 연달은 기록이면 흐른 시간만큼 몰아서 센다
 * (규칙·부정 방지는 lib/store/types.ts presenceCatchup)
 */
const SID_RE = /^[A-Za-z0-9_-]{8,32}$/;
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("presence", req, visitorId);
  const accounts = getAccounts();
  const now = serverNow(visitorId); // 운영은 Date.now() (개발 QA만 시계를 앞당길 수 있다)
  const rawSid = req.nextUrl.searchParams.get("sid") ?? "";
  const tick = await accounts.presenceTick(visitorId, kstDay(now), now, SID_RE.test(rawSid) ? rawSid : "");
  const earned = tick?.earned ?? 0;
  // 자동 낚시: 숨은 탭에서도 오는 이 기록을 "접속해 있음" 신호로 쓴다 (끊긴 구간은 세지 않게). 실패해도 머무르기는 그대로
  await beatAutoFish(visitorId, now).catch((e) => console.error("[forage] 자동 낚시 신호 실패", e));
  // 47번: 누군가 머무는 동안 동시 접속을 1분에 한 번씩 찍어 둔다 (cron 없이)
  runAfter(() => sampleConcurrency());
  // 칭호용 누적 접속 시간 (받아 준 기록만, 처음이면 오늘 머문 기록부터. 몰아서 센 만큼). 실패해도 머무르기는 그대로
  // 몰아서 센 기록도 한 번에 (Redis 2명령)
  if (tick && tick.ticks > 0) await getTitleStats().addStay(visitorId, tick.ticks, tick.stayTicks).catch((e) => console.error("[titles] 접속 시간 기록 실패", e));
  const lite = req.nextUrl.searchParams.get("lite") === "1" && (await staffAccountId()) !== visitorId;
  if (lite) {
    return json<PresenceResponse>(
      tick
        ? {
            earned,
            tick: { points: tick.points, lifetimePoints: tick.lifetimePoints, todayEarned: tick.todayEarned, stayMinutes: tick.stayTicks * STAY_TICK_MINUTES },
          }
        : { earned },
    );
  }
  return json<PresenceResponse>({ earned, me: await loadMe(accounts, visitorId, now) });
});

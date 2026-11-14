import { createHash } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { classifyReferrer, cleanUtm, countryOf, kstHour, landingOf, parseUa, utmKey } from "./analytics";
import { env } from "./env";
import { fetchLobbyServer } from "./joinToken";
import { kstDayAgo } from "./analyticsReport";
import { MemoryAnalytics, RedisAnalytics, type AnalyticsStore, type DailyEvent } from "./store/analytics";

// 47번 방문 분석: 저장소 선택 + 기록 도우미. 기록 실패는 본 기능(입장·묘비·사냥)을 막지 않는다 (삼키고 로그만).

const g = globalThis as typeof globalThis & { __tombAnalytics?: AnalyticsStore };

/** Redis가 있으면 Redis, 없으면 메모리 (분석은 운영에서도 Redis가 없다고 실패시키지 않는다) */
export function getAnalytics(): AnalyticsStore {
  const cur = g.__tombAnalytics;
  const conn = env.redis();
  if (conn) return cur instanceof RedisAnalytics ? cur : (g.__tombAnalytics = new RedisAnalytics(conn));
  if (cur instanceof MemoryAnalytics) return cur;
  return (g.__tombAnalytics = cur ? Object.assign(new MemoryAnalytics(), cur) : new MemoryAnalytics());
}

/** 응답을 보낸 뒤에 돌린다 (요청 밖·테스트에서는 바로 돌리고 기다리지 않는다) */
export function runAfter(task: () => Promise<unknown>): void {
  const safe = () => task().catch((e: unknown) => console.error("[analytics]", e));
  try {
    after(safe);
  } catch {
    void safe();
  }
}

/** 하루 사건 하나 (신규 가입·묘비 작성·사냥 판) */
export async function recordEvent(ev: DailyEvent, now = Date.now()): Promise<void> {
  await getAnalytics()
    .bump(kstDayAgo(now, 0), kstHour(now), ev)
    .catch((e: unknown) => console.error("[analytics] 사건 기록 실패", e));
}

/** 방문 쿠키(무작위 값) → 고유 방문자 해시. 쿠키 값 자체는 어디에도 저장하지 않는다 */
export function visitorHash(cookie: string): string {
  return createHash("sha256").update(`an|${cookie}|${env.sessionSecret()}`).digest("hex").slice(0, 24);
}

export type HitBody = { ref?: string | null; path?: string | null; grave?: boolean; utm?: { source?: string | null; medium?: string | null; campaign?: string | null } };

/** 방문 한 번을 집계 이름으로 바꿔 기록한다 */
export async function recordHit(req: NextRequest, body: HitBody, cookie: string, isNew: boolean, now = Date.now()): Promise<void> {
  const ua = parseUa(req.headers.get("user-agent") ?? "");
  const source = cleanUtm(body.utm?.source);
  const { cat, domain } = classifyReferrer(body.ref, req.headers.get("host"), source, ua.inApp);
  await getAnalytics().hit({
    day: kstDayAgo(now, 0),
    hour: kstHour(now),
    visitor: visitorHash(cookie),
    isNew,
    ref: cat,
    domain,
    utm: utmKey(source, cleanUtm(body.utm?.medium), cleanUtm(body.utm?.campaign)),
    landing: landingOf(body.path, !!body.grave),
    device: ua.device,
    browser: ua.browser,
    country: countryOf(req.headers.get("x-vercel-ip-country")),
  });
}

/** 동시 접속 표본 간격 (cron 없이: 머무르기·방문 요청이 올 때 이 간격에 한 번만 로비를 본다) */
export const SAMPLE_GAP_MS = 60_000;
/** 이 인스턴스가 다음에 표본 잠금을 시도해 볼 시각 */
let nextSampleTry = 0;

/**
 * 지금 동시 접속(실시간 서버 로비 total)을 그 시간대 최고값으로 남긴다. force가 아니면 SAMPLE_GAP_MS에 한 번만.
 * 로비가 응답하지 않으면 아무것도 하지 않는다. 찍은 값(또는 null)을 돌려준다
 */
export async function sampleConcurrency(force = false, now = Date.now(), total?: number, timeoutMs = 2500): Promise<number | null> {
  const store = getAnalytics();
  if (!force) {
    // 이 인스턴스가 간격 안에 이미 시도했으면 Redis 잠금(SET NX)도 묻지 않는다 (요청마다 명령 1개씩 아끼기)
    if (now < nextSampleTry) return null;
    nextSampleTry = now + SAMPLE_GAP_MS;
  }
  if (!force && !(await store.lockSample(SAMPLE_GAP_MS, now))) return null;
  const n = total ?? (await fetchLobbyServer(timeoutMs))?.total;
  if (typeof n !== "number") return null;
  await store.concurrent(kstDayAgo(now, 0), kstHour(now), n);
  return n;
}

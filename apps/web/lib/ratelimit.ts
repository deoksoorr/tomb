import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { clientIp, HttpError } from "./http";
import { isAdminIp } from "./ipAllow";
import { ipHash } from "./session";

const MIN = 60;
const DAY = 24 * 60 * MIN;

/**
 * 방문자(쿠키)와 IP 해시에 한도를 따로 두고, 둘 중 하나라도 넘으면 429.
 * → 쿠키를 새로 받거나 IP를 바꾸는 것만으로는 한도를 우회할 수 없다.
 * 입장·반응은 같은 와이파이(NAT) 뒤 여러 사람이 동시에 쓰는 경우가 흔하므로 IP 한도를 넉넉히 둔다.
 * visitor가 null인 항목은 쿠키 없이도 부르는 공개 조회라 IP 한도만 둔다.
 */
const LIMITS = {
  grave: { visitor: 3, ip: 3, windowSec: DAY, message: "묘비는 하루에 3개까지 세울 수 있어요." },
  upload: { visitor: 5, ip: 5, windowSec: DAY, message: "사진은 하루에 5장까지 올릴 수 있어요." },
  reaction: { visitor: 30, ip: 120, windowSec: MIN, message: "조금만 천천히 눌러 주세요." },
  join: { visitor: 10, ip: 60, windowSec: MIN, message: "입장 요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  report: { visitor: 10, ip: 10, windowSec: DAY, message: "오늘은 더 신고할 수 없어요." },
  detail: { visitor: null, ip: 120, windowSec: MIN, message: "요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  shop: { visitor: 20, ip: 60, windowSec: MIN, message: "상점 요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  inquiry: { visitor: 3, ip: 3, windowSec: DAY, message: "문의는 하루에 3번까지 보낼 수 있어요." },
  presence: { visitor: 2, ip: 60, windowSec: MIN, message: "요청이 너무 잦아요." },
  room: { visitor: 20, ip: 120, windowSec: MIN, message: "방 입장 요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  errors: { visitor: null, ip: 10, windowSec: MIN, message: "오류 보고가 너무 많아요." },
  rank: { visitor: null, ip: 60, windowSec: MIN, message: "요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  // 50번 소원 분수: 하루 1번 (lib/wish.ts WISH_DAILY). 같은 와이파이 여러 명을 생각해 IP는 넉넉히
  wish: { visitor: 1, ip: 10, windowSec: DAY, message: "소원은 하루에 한 번만 빌 수 있어요. 내일 다시 와 주세요." },
  // 10번 출석 달력 받기 · 11번 선물함 받기·지우기
  calendar: { visitor: 10, ip: 60, windowSec: MIN, message: "요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  gift: { visitor: 30, ip: 120, windowSec: MIN, message: "요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
  // 23번 확성기: 계정마다 간격(MEGAPHONE_COOLDOWN_MS)과 별개로 하루 상한 (도배 방지)
  megaphone: { visitor: 20, ip: 60, windowSec: DAY, message: "확성기는 하루에 20번까지 쓸 수 있어요." },
  // 47번 방문 분석 기록 (방문·체류 신호). 넘치면 조용히 버린다
  visit: { visitor: null, ip: 60, windowSec: MIN, message: "요청이 너무 잦아요." },
} as const;

/** 관리자 키 대입 방지: IP당 분당 실패 10회 */
const ADMIN_FAILURES = { tokens: 10, windowSec: MIN };
/** 개인 코드 대입 방지: IP당 시간당 실패 10회 */
const CODE_FAILURES = { tokens: 10, windowSec: 60 * MIN };

export type LimitAction = keyof typeof LIMITS;
type Verdict = { success: boolean; reset: number };
type Rule = { tokens: number; windowSec: number };
type Limiter = { take(key: string): Promise<Verdict>; peek(key: string): Promise<Verdict> };

// ── Upstash (운영) ──
const upstash = new Map<string, Ratelimit>();

function upstashLimiter(name: string, { tokens, windowSec }: Rule, conn: { url: string; token: string }): Limiter {
  let rl = upstash.get(name);
  if (!rl) {
    rl = new Ratelimit({
      redis: new Redis(conn),
      limiter: Ratelimit.slidingWindow(tokens, `${windowSec} s`),
      prefix: `rl:${name}`,
    });
    upstash.set(name, rl);
  }
  const limiter = rl;
  return {
    take: (key) => limiter.limit(key),
    peek: async (key) => {
      const { remaining, reset } = await limiter.getRemaining(key);
      return { success: remaining > 0, reset };
    },
  };
}

// ── 메모리 슬라이딩 윈도 (로컬) ──
const hits = new Map<string, number[]>();

function memoryLimiter(name: string, { tokens, windowSec }: Rule): Limiter {
  const windowMs = windowSec * 1000;
  const recent = (key: string, now: number) => (hits.get(`${name}:${key}`) ?? []).filter((t) => t > now - windowMs);
  return {
    async take(key) {
      const now = Date.now();
      const r = recent(key, now);
      const success = r.length < tokens;
      if (success) r.push(now);
      hits.set(`${name}:${key}`, r);
      return { success, reset: r[0] + windowMs };
    },
    async peek(key) {
      const now = Date.now();
      const r = recent(key, now);
      return { success: r.length < tokens, reset: (r[0] ?? now) + windowMs };
    },
  };
}

function limiter(name: string, rule: Rule): Limiter {
  const conn = env.redis();
  return conn ? upstashLimiter(name, rule, conn) : memoryLimiter(name, rule);
}

function tooMany(message: string, reset: number): HttpError {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return new HttpError(429, "RATE_LIMITED", message, { "Retry-After": String(retryAfter) });
}

/** 운영자 IP(ADMIN_ALLOWED_IPS에 명시된 경우만)는 테스트를 반복하므로 방문자 한도에서 뺀다. 관리자 키 실패 한도는 그대로 */
function isOperator(req: NextRequest): boolean {
  const allow = env.adminAllowedIps();
  return !!allow && isAdminIp(clientIp(req), allow, env.isProd());
}

/** 한도를 넘으면 429 RATE_LIMITED를 던진다 */
export async function rateLimit(action: LimitAction, req: NextRequest, visitorId?: string): Promise<void> {
  if (isOperator(req)) return;
  const { visitor, ip, windowSec, message } = LIMITS[action];
  const checks = [limiter(`${action}:ip`, { tokens: ip, windowSec }).take(ipHash(req))];
  if (visitor !== null && visitorId) checks.push(limiter(`${action}:v`, { tokens: visitor, windowSec }).take(visitorId));
  const verdicts = await Promise.all(checks);
  const blocked = verdicts.filter((v) => !v.success);
  if (blocked.length) throw tooMany(message, Math.max(...blocked.map((v) => v.reset)));
}

/** 한도를 쓰지 않고 지금 남아 있는지만 본다. 이미 다 썼으면 같은 429를 던진다 */
export async function assertRateLimitOpen(action: LimitAction, req: NextRequest, visitorId: string): Promise<void> {
  if (isOperator(req)) return;
  const { visitor, ip, windowSec, message } = LIMITS[action];
  const checks = [limiter(`${action}:ip`, { tokens: ip, windowSec }).peek(ipHash(req))];
  if (visitor !== null) checks.push(limiter(`${action}:v`, { tokens: visitor, windowSec }).peek(visitorId));
  const blocked = (await Promise.all(checks)).filter((v) => !v.success);
  if (blocked.length) throw tooMany(message, Math.max(...blocked.map((v) => v.reset)));
}

/** 실패가 한도에 닿은 IP는 키가 맞아도 잠시 막는다 (맞았는지 여부로 키를 알아내지 못하게) */
export async function assertAdminNotLocked(req: NextRequest): Promise<void> {
  const v = await limiter("admin-fail", ADMIN_FAILURES).peek(ipHash(req));
  if (!v.success) throw tooMany("시도가 너무 많아요. 잠시 뒤에 다시 시도해 주세요.", v.reset);
}

export async function recordAdminFailure(req: NextRequest): Promise<void> {
  await limiter("admin-fail", ADMIN_FAILURES).take(ipHash(req));
}

/**
 * 개인 코드 로그인: 실패가 한도에 닿은 IP는 맞는 코드여도 잠시 막는다.
 * 계정을 통째로 가져가는 경로라 운영자 IP도 예외로 두지 않는다.
 */
export async function assertCodeLoginOpen(req: NextRequest): Promise<void> {
  const v = await limiter("code-fail", CODE_FAILURES).peek(ipHash(req));
  if (!v.success) throw tooMany("코드 입력을 너무 많이 틀렸어요. 한 시간 뒤에 다시 시도해 주세요.", v.reset);
}

export async function recordCodeLoginFailure(req: NextRequest): Promise<void> {
  await limiter("code-fail", CODE_FAILURES).take(ipHash(req));
}

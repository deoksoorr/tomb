import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";

// 오류 모음 (외부 서비스 없이). 같은 오류는 해시로 묶어 하루마다 횟수·마지막 시각·샘플 1개만 둔다.
// Redis: HASH errors:{YYYYMMDD} — `{해시}` → 샘플 JSON(처음 것), `{해시}:n` → 횟수, `{해시}:last` → 마지막 시각. 14일 보관
// 11/27 STRING errors:seen — 관리자가 오류 탭을 열어 확인한 시각 (메뉴 배지 = 오늘 묶음 중 이보다 늦게 난 것)

export const ERROR_KEEP_DAYS = 14;
const TTL_SEC = ERROR_KEEP_DAYS * 86_400;
/**
 * 11/18 하루에 새로 묶는 오류 종류 상한 (브라우저가 보낸 것만). 넘으면 이미 있는 종류의 횟수만 세고 새 종류는 버린다 —
 * 로그인 없이 부르는 경로라 메시지를 바꿔 가며 보내 저장소·관리자 오류 탭을 부풀리지 못하게
 */
export const ERROR_GROUPS_PER_DAY = 300;

export type ErrorSample = {
  kind: string;
  /** client = 브라우저가 보낸 것, server = API 500 */
  source: "client" | "server";
  message: string;
  stack?: string;
  url: string;
  ua?: string;
};
export type ErrorGroup = ErrorSample & { hash: string; count: number; lastAt: number };

export interface ErrorStore {
  /** cap = 그날 종류 상한 (없으면 무제한 — 서버 500). 상한에 닿아 새 종류를 버렸으면 false */
  record(day: string, hash: string, sample: ErrorSample, now: number, cap?: number): Promise<boolean>;
  /** 그날 모은 오류 묶음 */
  day(day: string): Promise<ErrorGroup[]>;
  /** 11/27 관리자가 오류를 어디까지 확인했나 (마지막 시각 lastAt이 이보다 늦은 묶음 = 새 오류). 0 = 아직 없음 */
  seenAt(): Promise<number>;
  /** 확인 시각을 at으로 (앞으로만 간다 — 늦게 도착한 옛 요청이 되돌리지 못하게). 반환: 저장된 값 */
  markSeen(at: number): Promise<number>;
}

export class MemoryErrors implements ErrorStore {
  private days = new Map<string, Map<string, ErrorGroup>>();

  async record(day: string, hash: string, sample: ErrorSample, now: number, cap?: number): Promise<boolean> {
    let m = this.days.get(day);
    if (!m) this.days.set(day, (m = new Map()));
    const g = m.get(hash);
    if (!g && cap !== undefined && m.size >= cap) return false;
    m.set(hash, g ? { ...g, count: g.count + 1, lastAt: now } : { ...sample, hash, count: 1, lastAt: now });
    return true;
  }

  async day(day: string): Promise<ErrorGroup[]> {
    return [...(this.days.get(day)?.values() ?? [])].map((g) => ({ ...g }));
  }

  private seen = 0;
  async seenAt(): Promise<number> {
    return this.seen;
  }
  async markSeen(at: number): Promise<number> {
    return (this.seen = Math.max(this.seen, at));
  }
}

/** 11/27 오류 확인 시각 (만료 없음 — 숫자 하나) */
const SEEN_KEY = "errors:seen";
// KEYS[1] 확인 시각 · ARGV 새 시각. 더 늦을 때만 쓴다. 반환: 저장된 값
const SEEN_LUA = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0') or 0
local at = tonumber(ARGV[1]) or 0
if at > cur then redis.call('SET', KEYS[1], ARGV[1]) return at end
return cur`;

// KEYS[1] 그날 해시 · ARGV 해시, 샘플, 시각, TTL, 필드 상한(0 = 무제한). 새 종류인데 상한에 닿았으면 0
const RECORD_LUA = `
if tonumber(ARGV[5]) > 0 and redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 0 end
redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2])
redis.call('HINCRBY', KEYS[1], ARGV[1] .. ':n', 1)
redis.call('HSET', KEYS[1], ARGV[1] .. ':last', ARGV[3])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
return 1`;

export class RedisErrors implements ErrorStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "errors");
  }

  async record(day: string, hash: string, sample: ErrorSample, now: number, cap?: number): Promise<boolean> {
    // 종류마다 필드가 3개 (샘플·횟수·마지막 시각) → 필드 수 / 3 = 종류 수. 확인과 쓰기를 한 번에 (명령 1개)
    const ok = await this.redis.eval(
      RECORD_LUA,
      [`errors:${day}`],
      [hash, JSON.stringify(sample), String(now), String(TTL_SEC), String(cap === undefined ? 0 : cap * 3)],
    );
    return Number(ok) === 1;
  }

  async day(day: string): Promise<ErrorGroup[]> {
    const flat = (await this.redis.hgetall(`errors:${day}`)) as unknown as string[] | null;
    const f = new Map<string, string>();
    for (let i = 0; flat && i + 1 < flat.length; i += 2) f.set(flat[i], flat[i + 1]);
    return [...f]
      .filter(([k]) => !k.includes(":"))
      .map(([hash, raw]) => ({
        ...(JSON.parse(raw) as ErrorSample),
        hash,
        count: Number(f.get(`${hash}:n`) ?? 1),
        lastAt: Number(f.get(`${hash}:last`) ?? 0),
      }));
  }

  async seenAt(): Promise<number> {
    return Number(await this.redis.get(SEEN_KEY)) || 0;
  }

  async markSeen(at: number): Promise<number> {
    return Number(await this.redis.eval(SEEN_LUA, [SEEN_KEY], [String(Math.floor(at))])) || 0;
  }
}

import type { Redis } from "@upstash/redis";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import { OVERFLOW_LABEL, SIGNUP_DAY_LABEL_MAX, signupDayLabel, type SignupSrc } from "../signupSource";

// 11/26 가입 유입 경로·이번 접속 유입 (lib/signupSource).
//
// Redis 키 (이 파일에서만 쓴다)
//  - signup:src            HASH 계정 → 가입 유입 JSON (처음 한 번만 — HSETNX. 실제로 계정이 만들어질 때만 쓴다 — 첫 입장 기록 /api/me/attend)
//  - signup:day:{YYYYMMDD} HASH 유입 묶음 이름(signupDayLabel) → 그날 가입 수 (관리자 유입 분석, SIGNUP_DAY_TTL_SEC 보관.
//                          이름은 하루 SIGNUP_DAY_LABEL_MAX개까지, 넘으면 「기타」로 센다)
//  - livesrc:{YYYYMMDD}    HASH 계정 → { s: 이번 접속 유입 이름, at: 이번 접속 시작 } (그 탭의 첫 입장 때, 2일 보관 — 「지금 접속자」)

const SIGNUP_DAY_TTL_SEC = 120 * 86_400;
const LIVE_TTL_SEC = 2 * 86_400;

/** 이번 접속: 유입 이름·이 탭에서 처음 들어온 시각 */
export type LiveSrc = { s: string; at: number };

export interface SignupSrcStore {
  /** 가입 유입 저장 (이미 있으면 그대로 — false). 새로 넣었으면 그날 유입별 가입 수도 +1 */
  save(accountId: string, src: SignupSrc, day: string): Promise<boolean>;
  /** 계정들의 가입 유입 (없으면 null, ids 순서 그대로) */
  get(ids: readonly string[]): Promise<(SignupSrc | null)[]>;
  /** 날짜들의 유입별 가입 수 합 */
  dayCounts(days: readonly string[]): Promise<Record<string, number>>;
  /** 이번 접속 유입 */
  setLive(accountId: string, live: LiveSrc, day: string): Promise<void>;
  /** 계정들의 이번 접속 유입 (날짜 칸을 앞에서부터 찾는다 — 오늘, 어제) */
  live(ids: readonly string[], days: readonly string[]): Promise<(LiveSrc | null)[]>;
}

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class MemorySignupSrc implements SignupSrcStore {
  private src = new Map<string, SignupSrc>();
  private days = new Map<string, Record<string, number>>();
  private lives = new Map<string, Map<string, LiveSrc>>();

  async save(accountId: string, src: SignupSrc, day: string): Promise<boolean> {
    if (this.src.has(accountId)) return false;
    this.src.set(accountId, { ...src });
    const d = this.days.get(day) ?? {};
    let label = signupDayLabel(src);
    if (d[label] === undefined && Object.keys(d).length >= SIGNUP_DAY_LABEL_MAX) label = OVERFLOW_LABEL;
    d[label] = (d[label] ?? 0) + 1;
    this.days.set(day, d);
    return true;
  }
  async get(ids: readonly string[]): Promise<(SignupSrc | null)[]> {
    return ids.map((id) => (this.src.has(id) ? { ...this.src.get(id)! } : null));
  }
  async dayCounts(days: readonly string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const day of days) for (const [k, n] of Object.entries(this.days.get(day) ?? {})) out[k] = (out[k] ?? 0) + n;
    return out;
  }
  async setLive(accountId: string, live: LiveSrc, day: string): Promise<void> {
    const m = this.lives.get(day) ?? new Map<string, LiveSrc>();
    m.set(accountId, { ...live });
    this.lives.set(day, m);
  }
  async live(ids: readonly string[], days: readonly string[]): Promise<(LiveSrc | null)[]> {
    return ids.map((id) => {
      for (const d of days) {
        const v = this.lives.get(d)?.get(id);
        if (v) return { ...v };
      }
      return null;
    });
  }
}

// KEYS[1] signup:src, KEYS[2] 그날 유입별 수 · ARGV 계정, JSON, 묶음 이름, TTL, 이름 칸 상한, 넘칠 때 이름. 새로 넣었으면 1
const SAVE_LUA = `
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return 0 end
local label = ARGV[3]
if redis.call('HEXISTS', KEYS[2], label) == 0 and redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[5]) then label = ARGV[6] end
redis.call('HINCRBY', KEYS[2], label, 1)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
return 1`;

// KEYS[1] livesrc:{day} · ARGV 계정, JSON, TTL
const LIVE_LUA = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return 1`;

export class RedisSignupSrc implements SignupSrcStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "signupSrc");
  }

  async save(accountId: string, src: SignupSrc, day: string): Promise<boolean> {
    const r = await this.redis.eval(SAVE_LUA, ["signup:src", `signup:day:${day}`], [
      accountId,
      JSON.stringify(src),
      signupDayLabel(src),
      String(SIGNUP_DAY_TTL_SEC),
      String(SIGNUP_DAY_LABEL_MAX),
      OVERFLOW_LABEL,
    ]);
    return Number(r) === 1;
  }

  async get(ids: readonly string[]): Promise<(SignupSrc | null)[]> {
    if (!ids.length) return [];
    // automaticDeserialization: false → HMGET은 배열 (메모리 노트 redis-hmget-array)
    const got = (await this.redis.hmget("signup:src", ...ids)) as unknown;
    const list = Array.isArray(got) ? got : ids.map((id) => (got as Record<string, unknown> | null)?.[id] ?? null);
    return ids.map((_, i) => parse<SignupSrc>(list[i]));
  }

  async dayCounts(days: readonly string[]): Promise<Record<string, number>> {
    if (!days.length) return {};
    const p = this.redis.pipeline();
    for (const d of days) p.hgetall(`signup:day:${d}`);
    const rows = await p.exec<unknown[]>();
    const out: Record<string, number> = {};
    for (const got of rows) {
      const flat = Array.isArray(got) ? (got as string[]) : Object.entries((got ?? {}) as Record<string, string>).flat();
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = (out[flat[i]] ?? 0) + (Number(flat[i + 1]) || 0);
    }
    return out;
  }

  async setLive(accountId: string, live: LiveSrc, day: string): Promise<void> {
    await this.redis.eval(LIVE_LUA, [`livesrc:${day}`], [accountId, JSON.stringify(live), String(LIVE_TTL_SEC)]);
  }

  async live(ids: readonly string[], days: readonly string[]): Promise<(LiveSrc | null)[]> {
    if (!ids.length || !days.length) return ids.map(() => null);
    const p = this.redis.pipeline();
    for (const d of days) p.hmget(`livesrc:${d}`, ...ids);
    const rows = await p.exec<unknown[]>();
    const lists = rows.map((got) => (Array.isArray(got) ? got : ids.map((id) => (got as Record<string, unknown> | null)?.[id] ?? null)));
    return ids.map((_, i) => {
      for (const list of lists) {
        const v = parse<LiveSrc>(list[i]);
        if (v) return v;
      }
      return null;
    });
  }
}

const g = globalThis as typeof globalThis & { __tombSignupSrc?: SignupSrcStore };

export function getSignupSrc(): SignupSrcStore {
  const cur = g.__tombSignupSrc;
  const conn = env.redis();
  if (conn) return cur instanceof RedisSignupSrc ? cur : (g.__tombSignupSrc = new RedisSignupSrc(conn));
  if (cur instanceof MemorySignupSrc) return cur;
  return (g.__tombSignupSrc = cur ? Object.assign(new MemorySignupSrc(), cur) : new MemorySignupSrc());
}

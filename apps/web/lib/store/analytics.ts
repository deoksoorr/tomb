import { Redis } from "@upstash/redis";
import { hh } from "../analytics";

// 47번 방문 분석 저장소. 날짜는 KST YYYYMMDD, 시각은 KST 0~23. 모든 키는 ANALYTICS_TTL_SEC(90일) 뒤 저절로 지워진다.
//
// Redis 키
//  - an:d:{day}        HASH  카운터. v(방문=세션 수)·v:new·v:ret·stay(머문 초)·signup·grave·hunt
//                            h:{HH}:{v|stay|signup|grave|hunt} (시간대별), ref:{분류}·dom:{도메인}·utm:{s / m / c}·
//                            land:{경로 모양}·dev:{기기}·br:{브라우저}·cc:{국가}
//  - an:u:{day}        HLL   그날 고유 방문자 (방문 쿠키의 HMAC만 넣는다 — HLL은 값 자체를 남기지 않는다)
//  - an:uh:{day}:{HH}  HLL   그 시간대 고유 방문자
//  - an:c:{day}        ZSET  HH → 그 시간대 최고 동시 접속 (로비 값을 이따금 찍어 둔 것 중 최댓값)
//  - an:lock:sample    STRING NX PX  동시 접속 찍기 간격 잠금
// 도메인·utm·랜딩처럼 값이 열려 있는 필드는 하루 해시 필드가 FIELD_CAP개를 넘으면 새 이름을 더 만들지 않는다 (도배 방지).

export const ANALYTICS_TTL_SEC = 90 * 86_400;
/** 하루 해시 필드 상한 (값이 열려 있는 필드만 이 상한을 본다) */
export const FIELD_CAP = 1500;

export const AK = {
  day: (day: string) => `an:d:${day}`,
  uniq: (day: string) => `an:u:${day}`,
  uniqHour: (day: string, h: number) => `an:uh:${day}:${hh(h)}`,
  conc: (day: string) => `an:c:${day}`,
  lock: "an:lock:sample",
};

/** 방문 한 번 (세션 시작). 필드 이름은 lib/analytics.ts가 이미 다듬은 값 */
export type HitRecord = {
  day: string;
  hour: number;
  /** 고유 방문자 판정용 해시 (원래 쿠키 값이 아니다) */
  visitor: string;
  isNew: boolean;
  ref: string;
  domain: string | null;
  utm: string | null;
  landing: string;
  device: string;
  browser: string;
  country: string;
};
export type DailyEvent = "signup" | "grave" | "hunt";

/** 하루 원자료: 카운터 필드 + 고유 방문자 + 시간대별 최고 동시 접속 */
export type DayRaw = { day: string; fields: Record<string, number>; uniques: number; peaks: Record<string, number> };

export interface AnalyticsStore {
  hit(h: HitRecord): Promise<void>;
  bump(day: string, hour: number, ev: DailyEvent): Promise<void>;
  /** 머문 시간(초)을 그날·그 시간대에 더한다 */
  stay(day: string, hour: number, sec: number): Promise<void>;
  /** 동시 접속 표본: 그 시간대 최고값보다 크면 바꾼다 */
  concurrent(day: string, hour: number, n: number): Promise<void>;
  /** 표본 찍기 잠금: ttlMs 동안 한 번만 true */
  lockSample(ttlMs: number, now: number): Promise<boolean>;
  days(days: readonly string[]): Promise<DayRaw[]>;
  /** 날짜 묶음마다 고유 방문자 (묶음 안 날짜들을 합집합으로 센다 → 주·월 고유 방문자) */
  uniqueOver(groups: readonly (readonly string[])[]): Promise<number[]>;
  /** [day, hour] 목록의 시간대별 고유 방문자 */
  hourUniques(slots: readonly (readonly [string, number])[]): Promise<number[]>;
}

/** 방문 한 번이 올리는 필드 [이름, 상한 적용 여부] */
export function hitFields(h: HitRecord): [string, boolean][] {
  const out: [string, boolean][] = [
    ["v", false],
    [h.isNew ? "v:new" : "v:ret", false],
    [`h:${hh(h.hour)}:v`, false],
    [`ref:${h.ref}`, false],
    [`land:${h.landing}`, true],
    [`dev:${h.device}`, false],
    [`br:${h.browser}`, true],
    [`cc:${h.country}`, true],
  ];
  if (h.domain) out.push([`dom:${h.domain}`, true]);
  if (h.utm) out.push([`utm:${h.utm}`, true]);
  return out;
}

// ── 메모리 (로컬·테스트). HLL 대신 집합으로 정확히 센다 ──

export class MemoryAnalytics implements AnalyticsStore {
  private fields = new Map<string, Map<string, number>>();
  private uniq = new Map<string, Set<string>>();
  private conc = new Map<string, Map<string, number>>();
  private lockUntil = 0;

  private hash(day: string): Map<string, number> {
    let m = this.fields.get(day);
    if (!m) this.fields.set(day, (m = new Map()));
    return m;
  }
  private add(key: string, v: string): void {
    let s = this.uniq.get(key);
    if (!s) this.uniq.set(key, (s = new Set()));
    s.add(v);
  }
  private incr(day: string, field: string, n: number, capped = false): void {
    const m = this.hash(day);
    if (capped && !m.has(field) && m.size >= FIELD_CAP) return;
    m.set(field, (m.get(field) ?? 0) + n);
  }

  async hit(h: HitRecord): Promise<void> {
    this.add(AK.uniq(h.day), h.visitor);
    this.add(AK.uniqHour(h.day, h.hour), h.visitor);
    for (const [f, capped] of hitFields(h)) this.incr(h.day, f, 1, capped);
  }
  async bump(day: string, hour: number, ev: DailyEvent): Promise<void> {
    this.incr(day, ev, 1);
    this.incr(day, `h:${hh(hour)}:${ev}`, 1);
  }
  async stay(day: string, hour: number, sec: number): Promise<void> {
    this.incr(day, "stay", sec);
    this.incr(day, `h:${hh(hour)}:stay`, sec);
  }
  async concurrent(day: string, hour: number, n: number): Promise<void> {
    let m = this.conc.get(day);
    if (!m) this.conc.set(day, (m = new Map()));
    if (n > (m.get(hh(hour)) ?? -1)) m.set(hh(hour), n);
  }
  async lockSample(ttlMs: number, now: number): Promise<boolean> {
    if (now < this.lockUntil) return false;
    this.lockUntil = now + ttlMs;
    return true;
  }
  async days(days: readonly string[]): Promise<DayRaw[]> {
    return days.map((day) => ({
      day,
      fields: Object.fromEntries(this.fields.get(day) ?? []),
      uniques: this.uniq.get(AK.uniq(day))?.size ?? 0,
      peaks: Object.fromEntries(this.conc.get(day) ?? []),
    }));
  }
  async uniqueOver(groups: readonly (readonly string[])[]): Promise<number[]> {
    return groups.map((g) => {
      const all = new Set<string>();
      for (const d of g) for (const v of this.uniq.get(AK.uniq(d)) ?? []) all.add(v);
      return all.size;
    });
  }
  async hourUniques(slots: readonly (readonly [string, number])[]): Promise<number[]> {
    return slots.map(([d, h]) => this.uniq.get(AK.uniqHour(d, h))?.size ?? 0);
  }
}

// ── Redis ──

// 방문 한 번: 고유 방문자(날·시간대 HLL) + 필드 증가 + 만료 연장을 한 번에.
// KEYS: 하루 해시, 하루 HLL, 시간대 HLL  ARGV: ttl, 방문자 해시, 필드 상한, (필드, 상한 적용 "1"|"0") 반복
const HIT_LUA = `
local ttl = tonumber(ARGV[1])
redis.call('PFADD', KEYS[2], ARGV[2])
redis.call('PFADD', KEYS[3], ARGV[2])
local cap = tonumber(ARGV[3])
local i = 4
while i < #ARGV do
  local f = ARGV[i]
  if ARGV[i + 1] ~= '1' or redis.call('HEXISTS', KEYS[1], f) == 1 or redis.call('HLEN', KEYS[1]) < cap then
    redis.call('HINCRBY', KEYS[1], f, 1)
  end
  i = i + 2
end
for k = 1, 3 do redis.call('EXPIRE', KEYS[k], ttl) end
return 1
`;

// 시간대 최고 동시 접속: 지금 값이 더 크면 바꾼다. KEYS: an:c:{day}  ARGV: HH, n, ttl
const CONC_LUA = `
local cur = tonumber(redis.call('ZSCORE', KEYS[1], ARGV[1]) or '-1')
local n = tonumber(ARGV[2])
if n > cur then redis.call('ZADD', KEYS[1], n, ARGV[1]) end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return n
`;

/** HGETALL 결과 → 숫자 객체 (automaticDeserialization: false면 평평한 배열) */
function numHash(flat: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = Number(flat[i + 1]) || 0;
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) out[k] = Number(v) || 0;
  return out;
}

export class RedisAnalytics implements AnalyticsStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async hit(h: HitRecord): Promise<void> {
    const args = [String(ANALYTICS_TTL_SEC), h.visitor, String(FIELD_CAP)];
    for (const [f, capped] of hitFields(h)) args.push(f, capped ? "1" : "0");
    await this.redis.eval(HIT_LUA, [AK.day(h.day), AK.uniq(h.day), AK.uniqHour(h.day, h.hour)], args);
  }
  async bump(day: string, hour: number, ev: DailyEvent): Promise<void> {
    const k = AK.day(day);
    await this.redis.multi().hincrby(k, ev, 1).hincrby(k, `h:${hh(hour)}:${ev}`, 1).expire(k, ANALYTICS_TTL_SEC).exec();
  }
  async stay(day: string, hour: number, sec: number): Promise<void> {
    const k = AK.day(day);
    await this.redis.multi().hincrby(k, "stay", sec).hincrby(k, `h:${hh(hour)}:stay`, sec).expire(k, ANALYTICS_TTL_SEC).exec();
  }
  async concurrent(day: string, hour: number, n: number): Promise<void> {
    await this.redis.eval(CONC_LUA, [AK.conc(day)], [hh(hour), String(n), String(ANALYTICS_TTL_SEC)]);
  }
  async lockSample(ttlMs: number): Promise<boolean> {
    return (await this.redis.set(AK.lock, "1", { nx: true, px: ttlMs })) !== null;
  }
  async days(days: readonly string[]): Promise<DayRaw[]> {
    if (!days.length) return [];
    const p = this.redis.pipeline();
    for (const d of days) p.hgetall(AK.day(d)).pfcount(AK.uniq(d)).zrange(AK.conc(d), 0, -1, { withScores: true });
    const res = (await p.exec()) as unknown[];
    return days.map((day, i) => {
      const z = (res[i * 3 + 2] as unknown[] | null) ?? [];
      const peaks: Record<string, number> = {};
      for (let j = 0; j + 1 < z.length; j += 2) peaks[String(z[j])] = Number(z[j + 1]) || 0;
      return { day, fields: numHash(res[i * 3]), uniques: Number(res[i * 3 + 1]) || 0, peaks };
    });
  }
  async uniqueOver(groups: readonly (readonly string[])[]): Promise<number[]> {
    const live = groups.filter((g) => g.length);
    if (!live.length) return groups.map(() => 0);
    const p = this.redis.pipeline();
    for (const g of live) p.pfcount(...(g.map((d) => AK.uniq(d)) as [string, ...string[]]));
    const res = (await p.exec()) as unknown[];
    let i = 0;
    return groups.map((g) => (g.length ? Number(res[i++]) || 0 : 0));
  }
  async hourUniques(slots: readonly (readonly [string, number])[]): Promise<number[]> {
    if (!slots.length) return [];
    const p = this.redis.pipeline();
    for (const [d, h] of slots) p.pfcount(AK.uniqHour(d, h));
    return ((await p.exec()) as unknown[]).map((n) => Number(n) || 0);
  }
}

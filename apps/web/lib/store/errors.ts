import { Redis } from "@upstash/redis";

// 오류 모음 (외부 서비스 없이). 같은 오류는 해시로 묶어 하루마다 횟수·마지막 시각·샘플 1개만 둔다.
// Redis: HASH errors:{YYYYMMDD} — `{해시}` → 샘플 JSON(처음 것), `{해시}:n` → 횟수, `{해시}:last` → 마지막 시각. 14일 보관

export const ERROR_KEEP_DAYS = 14;
const TTL_SEC = ERROR_KEEP_DAYS * 86_400;

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
  record(day: string, hash: string, sample: ErrorSample, now: number): Promise<void>;
  /** 그날 모은 오류 묶음 */
  day(day: string): Promise<ErrorGroup[]>;
}

export class MemoryErrors implements ErrorStore {
  private days = new Map<string, Map<string, ErrorGroup>>();

  async record(day: string, hash: string, sample: ErrorSample, now: number): Promise<void> {
    let m = this.days.get(day);
    if (!m) this.days.set(day, (m = new Map()));
    const g = m.get(hash);
    m.set(hash, g ? { ...g, count: g.count + 1, lastAt: now } : { ...sample, hash, count: 1, lastAt: now });
  }

  async day(day: string): Promise<ErrorGroup[]> {
    return [...(this.days.get(day)?.values() ?? [])].map((g) => ({ ...g }));
  }
}

export class RedisErrors implements ErrorStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async record(day: string, hash: string, sample: ErrorSample, now: number): Promise<void> {
    const k = `errors:${day}`;
    await this.redis
      .pipeline()
      .hsetnx(k, hash, JSON.stringify(sample))
      .hincrby(k, `${hash}:n`, 1)
      .hset(k, { [`${hash}:last`]: String(now) })
      .expire(k, TTL_SEC)
      .exec();
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
}

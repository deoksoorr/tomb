import { Redis } from "@upstash/redis";
import { env } from "../env";
import { K } from "./keys";

// 유저 활동 기록 (관리자 「유저 활동」: DAU·리텐션·단골·휴면). 계정이 그 게임 날짜(한국 시간 새벽 5시에 바뀐다)에
// 마을에 들어오거나(입장) 그날 첫 머무르기 기록이 쌓이면 그날 활동한 것으로 친다. 날마다 한 번만 센다 (SADD가 0이면 끝).
//  - act:d:{day}  SET  그날 활동한 계정. ACT_DAY_TTL_SEC 뒤 저절로 지워진다 (리텐션은 최근 60일만 본다)
//  - act:days     HASH 계정 → 활동한 날 수 (기록을 시작한 뒤)
//  - act:since    STRING 기록이 있는 가장 이른 날 (그 전 날짜는 화면에서 「기록 없음」)
// 운영자도 똑같이 기록하고, 통계에서 뺄지는 읽을 때 정한다

export const ACT_DAY_TTL_SEC = 120 * 86_400;

export interface ActivityStore {
  /** [계정, 날짜] 묶음을 활동으로 남긴다. 그날 처음인 것만 센다. 새로 남긴 수 */
  record(pairs: readonly (readonly [string, string])[]): Promise<number>;
  /** 날짜마다 그날 활동한 계정 */
  daySets(days: readonly string[]): Promise<Map<string, Set<string>>>;
  /** 기록이 있는 가장 이른 날 (없으면 null) */
  since(): Promise<string | null>;
  /** 계정마다 활동한 날 수 (ids 순서) */
  activeDays(ids: readonly string[]): Promise<number[]>;
}

export class MemoryActivity implements ActivityStore {
  private days = new Map<string, Set<string>>();
  private counts = new Map<string, number>();
  private first: string | null = null;

  async record(pairs: readonly (readonly [string, string])[]): Promise<number> {
    let n = 0;
    for (const [id, day] of pairs) {
      let set = this.days.get(day);
      if (!set) this.days.set(day, (set = new Set()));
      if (set.has(id)) continue;
      set.add(id);
      this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
      if (!this.first || day < this.first) this.first = day;
      n++;
    }
    return n;
  }
  async daySets(days: readonly string[]): Promise<Map<string, Set<string>>> {
    return new Map(days.map((d) => [d, new Set(this.days.get(d) ?? [])]));
  }
  async since(): Promise<string | null> {
    return this.first;
  }
  async activeDays(ids: readonly string[]): Promise<number[]> {
    return ids.map((id) => this.counts.get(id) ?? 0);
  }
}

// 활동 남기기 (여러 묶음을 한 번에). 그날 SET에 처음 들어갈 때만 날 수를 올리고, 가장 이른 날을 앞당긴다
// KEYS: actDays, actSince, 그 뒤 묶음마다 actDay(날짜)  ARGV: ttl, 그 뒤 묶음마다 [계정, 날짜]
const RECORD_LUA = `
local n = 0
for i = 3, #KEYS do
  local id = ARGV[2 + (i - 3) * 2]
  local day = ARGV[3 + (i - 3) * 2]
  if redis.call('SADD', KEYS[i], id) == 1 then
    redis.call('EXPIRE', KEYS[i], ARGV[1])
    redis.call('HINCRBY', KEYS[1], id, 1)
    local s = redis.call('GET', KEYS[2])
    if not s or day < s then redis.call('SET', KEYS[2], day) end
    n = n + 1
  end
end
return n
`;

export class RedisActivity implements ActivityStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async record(pairs: readonly (readonly [string, string])[]): Promise<number> {
    if (!pairs.length) return 0;
    const n = await this.redis.eval<string[], number>(
      RECORD_LUA,
      [K.actDays, K.actSince, ...pairs.map(([, day]) => K.actDay(day))],
      [String(ACT_DAY_TTL_SEC), ...pairs.flatMap(([id, day]) => [id, day])],
    );
    return Number(n) || 0;
  }

  /** SMEMBERS 날짜 수만큼을 파이프라인 한 번으로 */
  async daySets(days: readonly string[]): Promise<Map<string, Set<string>>> {
    if (!days.length) return new Map();
    const p = this.redis.pipeline();
    for (const d of days) p.smembers(K.actDay(d));
    const r = await p.exec<(string[] | null)[]>();
    return new Map(days.map((d, i) => [d, new Set(r[i] ?? [])]));
  }

  async since(): Promise<string | null> {
    const v = await this.redis.get<string>(K.actSince);
    return v ? String(v) : null;
  }

  async activeDays(ids: readonly string[]): Promise<number[]> {
    if (!ids.length) return [];
    const v = (await this.redis.hmget(K.actDays, ...ids)) as unknown;
    const list = Array.isArray(v) ? (v as (string | null)[]) : ids.map((id) => ((v ?? {}) as Record<string, string | null>)[id] ?? null);
    return ids.map((_, i) => Number(list[i] ?? 0) || 0);
  }
}

const g = globalThis as typeof globalThis & { __tombActivity?: ActivityStore };

/** 계정 저장소와 같은 백엔드 (Redis가 없으면 로컬 메모리) */
export function getActivity(): ActivityStore {
  const cur = g.__tombActivity;
  const conn = env.redis();
  if (conn) return cur instanceof RedisActivity ? cur : (g.__tombActivity = new RedisActivity(conn));
  if (cur instanceof MemoryActivity) return cur;
  return (g.__tombActivity = cur ? Object.assign(new MemoryActivity(), cur) : new MemoryActivity());
}

/** 입장·그날 첫 머무르기에서 부른다. 실패해도 게임은 그대로 (기록만 빠진다) */
export async function recordActive(accountId: string, day: string): Promise<void> {
  await getActivity()
    .record([[accountId, day]])
    .catch((e: unknown) => console.error("[activity] 활동 기록 실패", e));
}

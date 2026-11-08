import { Redis } from "@upstash/redis";
import { REPORT_LOG_MAX, type ReportLogEntry, type ReportReason } from "../reports";
import type { Grave, GraveDecor, ReviveResponse } from "../types";
import { DECOR, HIDDEN, K } from "./keys";
import {
  FLOWER_TTL_SEC,
  REPORT_HIDE_THRESHOLD,
  type GraveRecord,
  type GraveStore,
  type ReportSummary,
  type ViewerState,
} from "./types";

// 반응은 모두 Lua 스크립트 하나로 처리한다. 스크립트 실행 중에는 다른 명령이 끼어들 수 없으므로
// "묘비가 있을 때만" 조건과 분기를 원자적으로 묶을 수 있다 (삭제와 경합해 고아 키가 생기지 않는다).
// 공통: KEYS[1] = graves:meta, ARGV[1] = 묘비 id

// spec은 살려주세요 토글을 MULTI로 적었지만, MULTI 안에서는 SADD의 결과를 보고 분기할 수 없다. 이 스크립트가 원자적 등가물이다.
const REVIVE_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return nil end
if redis.call('SADD', KEYS[2], ARGV[2]) == 1 then
  return {1, redis.call('ZINCRBY', KEYS[3], 1, ARGV[1])}
end
redis.call('SREM', KEYS[2], ARGV[2])
return {0, redis.call('ZINCRBY', KEYS[3], -1, ARGV[1])}
`;

const FLOWER_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return nil end
if not redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then return {0} end
return {1, redis.call('ZINCRBY', KEYS[3], 1, ARGV[1])}
`;

// KEYS: meta, reports(IP), reporters(방문자), reportlog, graves:reported
// ARGV: id, ipHash, visitorId, 숨김 기준, 기록 JSON, 기록 최대 개수
const REPORT_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return nil end
if redis.call('SISMEMBER', KEYS[3], ARGV[3]) == 1 or redis.call('SADD', KEYS[2], ARGV[2]) == 0 then return 0 end
redis.call('SADD', KEYS[3], ARGV[3])
redis.call('LPUSH', KEYS[4], ARGV[5])
redis.call('LTRIM', KEYS[4], 0, tonumber(ARGV[6]) - 1)
local n = redis.call('SCARD', KEYS[2])
redis.call('ZADD', KEYS[5], n, ARGV[1])
if n >= tonumber(ARGV[4]) then redis.call('HSET', KEYS[1], '${HIDDEN}' .. ARGV[1], '1') end
return 1
`;

// 숨김 해제는 신고 수만 0으로 되돌리고(집합 삭제 + 요약 점수 0) 기록은 남긴다
// KEYS: meta, reports, reporters, graves:reported  ARGV: id, '1'|'0'
const SET_HIDDEN_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
if ARGV[2] == '1' then
  redis.call('HSET', KEYS[1], '${HIDDEN}' .. ARGV[1], '1')
else
  redis.call('HDEL', KEYS[1], '${HIDDEN}' .. ARGV[1])
  redis.call('DEL', KEYS[2], KEYS[3])
  redis.call('ZADD', KEYS[4], 'XX', 0, ARGV[1])
end
return 1
`;

// KEYS: meta, reports, reporters, reportlog, graves:reported  ARGV: id
const RESET_REPORTS_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('DEL', KEYS[2], KEYS[3], KEYS[4])
redis.call('ZREM', KEYS[5], ARGV[1])
return 1
`;

type Raw = string | null;

/** [k1, v1, k2, v2, ...] → Map (HGETALL / ZRANGE WITHSCORES 응답) */
function pairs(flat: string[] | null): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; flat && i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
  return m;
}

const parse = (raw: string) => JSON.parse(raw) as Grave;
const parseDecor = (raw: string | null | undefined) => (raw ? (JSON.parse(raw) as GraveDecor[]) : undefined);
/** 압축 JSON: 비어 있는 선택 필드는 빠지고, 숨김·꾸미기는 별도 필드라 넣지 않는다 */
const encode = (g: Grave) => JSON.stringify({ ...g, hidden: undefined, decor: undefined });
const isGraveField = (field: string) => !field.startsWith(HIDDEN) && !field.startsWith(DECOR);

export class RedisStore implements GraveStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    // 응답을 원문 문자열로 받는다. 자동 JSON 파싱을 켜 두면 숫자처럼 생긴 id("1e5..")가 숫자로 바뀔 수 있다.
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  /** 명령 3개를 파이프라인 1회로. TODO: 묘비가 1,000개를 넘으면 graves:created 기준으로 페이지를 나눈다 */
  async list(): Promise<GraveRecord[]> {
    const [meta, revive, flower] = await this.redis
      .pipeline()
      .hgetall(K.meta)
      .zrange(K.revive, 0, -1, { withScores: true })
      .zrange(K.flower, 0, -1, { withScores: true })
      .exec<[string[] | null, string[], string[]]>();
    const fields = pairs(meta);
    const revives = pairs(revive);
    const flowers = pairs(flower);
    return [...fields]
      .filter(([field]) => isGraveField(field))
      .map(([id, raw]) => ({
        ...parse(raw),
        hidden: fields.has(HIDDEN + id) || undefined,
        decor: parseDecor(fields.get(DECOR + id)),
        flowers: Number(flowers.get(id) ?? 0),
        revives: Number(revives.get(id) ?? 0),
      }));
  }

  async get(id: string): Promise<GraveRecord | null> {
    const [raw, hidden, decor, revives, flowers] = await this.redis
      .pipeline()
      .hget(K.meta, id)
      .hexists(K.meta, HIDDEN + id)
      .hget(K.meta, DECOR + id)
      .zscore(K.revive, id)
      .zscore(K.flower, id)
      .exec<[Raw, number, Raw, Raw, Raw]>();
    if (!raw) return null;
    return {
      ...parse(raw),
      hidden: Number(hidden) === 1 || undefined,
      decor: parseDecor(decor),
      flowers: Number(flowers ?? 0),
      revives: Number(revives ?? 0),
    };
  }

  async put(grave: Grave): Promise<void> {
    await this.redis
      .multi()
      .hset(K.meta, { [grave.id]: encode(grave) })
      .zadd(K.created, { score: grave.createdAt, member: grave.id })
      .exec();
  }

  async remove(id: string): Promise<Grave | null> {
    const raw = await this.redis.hget<string>(K.meta, id);
    if (!raw) return null;
    // flower:{id}:{visitorId} 키는 SCAN 없이 찾을 수 없으므로 24시간 TTL로 저절로 사라지게 둔다
    await this.redis
      .multi()
      .hdel(K.meta, id, HIDDEN + id, DECOR + id)
      .zrem(K.created, id)
      .zrem(K.revive, id)
      .zrem(K.flower, id)
      .zrem(K.reported, id)
      .del(K.revivers(id), K.reviveEarned(id), K.reports(id), K.reporters(id), K.reportLog(id), K.decor(id))
      .exec();
    return parse(raw);
  }

  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(
      SET_HIDDEN_LUA,
      [K.meta, K.reports(id), K.reporters(id), K.reported],
      [id, hidden ? "1" : "0"],
    );
    return Number(r) === 1;
  }

  async resetReports(id: string): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(
      RESET_REPORTS_LUA,
      [K.meta, K.reports(id), K.reporters(id), K.reportLog(id), K.reported],
      [id],
    );
    return Number(r) === 1;
  }

  /** ZRANGE 1회 + 신고된 묘비마다 LRANGE (파이프라인 1회). 관리자 화면에서만 부른다 */
  async reportSummary(): Promise<Map<string, ReportSummary>> {
    const counts = pairs(await this.redis.zrange<string[]>(K.reported, 0, -1, { withScores: true }));
    const out = new Map<string, ReportSummary>();
    if (!counts.size) return out;
    const p = this.redis.pipeline();
    for (const id of counts.keys()) p.lrange(K.reportLog(id), 0, -1);
    const logs = await p.exec<string[][]>();
    [...counts].forEach(([id, count], i) => {
      out.set(id, { count: Number(count), log: logs[i].map((raw) => JSON.parse(raw) as ReportLogEntry) });
    });
    return out;
  }

  async viewer(id: string, visitorId: string): Promise<ViewerState> {
    const [member, marked] = await this.redis
      .pipeline()
      .sismember(K.revivers(id), visitorId)
      .exists(K.flowerMark(id, visitorId))
      .exec<[number, number]>();
    return { myRevive: Number(member) === 1, myFlowerToday: Number(marked) === 1 };
  }

  async flower(id: string, visitorId: string): Promise<number | "already" | null> {
    const r = await this.redis.eval<string[], [number, string?] | null>(
      FLOWER_LUA,
      [K.meta, K.flowerMark(id, visitorId), K.flower],
      [id, String(FLOWER_TTL_SEC)],
    );
    if (!r) return null;
    return Number(r[0]) === 1 ? Number(r[1]) : "already";
  }

  async firstRevive(id: string, visitorId: string): Promise<boolean> {
    return Number(await this.redis.sadd(K.reviveEarned(id), visitorId)) === 1;
  }

  async toggleRevive(id: string, visitorId: string): Promise<ReviveResponse | null> {
    const r = await this.redis.eval<string[], [number, string] | null>(
      REVIVE_LUA,
      [K.meta, K.revivers(id), K.revive],
      [id, visitorId],
    );
    return r ? { revived: Number(r[0]) === 1, count: Number(r[1]) } : null;
  }

  async report(
    id: string,
    visitorId: string,
    ipHash: string,
    reason: ReportReason,
    at = Date.now(),
  ): Promise<"added" | "duplicate" | null> {
    const entry: ReportLogEntry = { at, reason };
    const r = await this.redis.eval<string[], number | null>(
      REPORT_LUA,
      [K.meta, K.reports(id), K.reporters(id), K.reportLog(id), K.reported],
      [id, ipHash, visitorId, String(REPORT_HIDE_THRESHOLD), JSON.stringify(entry), String(REPORT_LOG_MAX)],
    );
    if (r === null) return null;
    return Number(r) === 1 ? "added" : "duplicate";
  }
}

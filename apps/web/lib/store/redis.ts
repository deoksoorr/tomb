import { Redis } from "@upstash/redis";
import { GRAVE_CHANNELS } from "./channels";
import { REPORT_LOG_MAX, type ReportLogEntry, type ReportReason } from "../reports";
import type { Grave, GraveDecor, ReviveResponse } from "../types";
import { chKeys, DECOR, HIDDEN, K } from "./keys";
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
export const encode = (g: Grave) => JSON.stringify({ ...g, hidden: undefined, decor: undefined });
const isGraveField = (field: string) => !field.startsWith(HIDDEN) && !field.startsWith(DECOR);

/** 이 프로젝트에서 묘비를 둘 수 있는 채널 */
const CHANNELS = Array.from({ length: GRAVE_CHANNELS }, (_, i) => i + 1);

export class RedisStore implements GraveStore {
  private redis: Redis;
  /** 묘비 id → 채널. 묘비는 채널을 옮기지 않으므로 한 번 찾으면 인스턴스 안에서 다시 묻지 않는다 */
  private channels = new Map<string, number>();

  constructor(conn: { url: string; token: string }) {
    // 응답을 원문 문자열로 받는다. 자동 JSON 파싱을 켜 두면 숫자처럼 생긴 id("1e5..")가 숫자로 바뀔 수 있다.
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  /** 묘비의 채널 (기록이 없으면 채널 개편 전 묘비 = 1채널) */
  private async channelOf(id: string): Promise<number> {
    let ch = this.channels.get(id);
    if (ch === undefined) {
      ch = Number((await this.redis.hget<string>(K.graveChannel, id)) ?? 1);
      if (this.channels.size > 10_000) this.channels.clear();
      this.channels.set(id, ch);
    }
    return ch;
  }

  private async keysOf(id: string) {
    const channel = await this.channelOf(id);
    return { channel, ...chKeys(channel) };
  }

  /** 한 채널의 메타 해시·랭킹 두 개 → 묘비 목록 */
  private static records(channel: number, meta: string[] | null, revive: string[], flower: string[]): GraveRecord[] {
    const fields = pairs(meta);
    const revives = pairs(revive);
    const flowers = pairs(flower);
    return [...fields]
      .filter(([field]) => isGraveField(field))
      .map(([id, raw]) => ({
        ...parse(raw),
        channel,
        hidden: fields.has(HIDDEN + id) || undefined,
        decor: parseDecor(fields.get(DECOR + id)),
        flowers: Number(flowers.get(id) ?? 0),
        revives: Number(revives.get(id) ?? 0),
      }));
  }

  /** 명령 3개를 파이프라인 1회로. TODO: 한 채널 묘비가 1,000개를 넘으면 created 기준으로 페이지를 나눈다 */
  async list(channel: number): Promise<GraveRecord[]> {
    const k = chKeys(channel);
    const [meta, revive, flower] = await this.redis
      .pipeline()
      .hgetall(k.meta)
      .zrange(k.revive, 0, -1, { withScores: true })
      .zrange(k.flower, 0, -1, { withScores: true })
      .exec<[string[] | null, string[], string[]]>();
    return RedisStore.records(channel, meta, revive, flower);
  }

  /** 모든 채널을 파이프라인 1회로 (채널마다 명령 3개) */
  async listAll(): Promise<GraveRecord[]> {
    const p = this.redis.pipeline();
    for (const ch of CHANNELS) {
      const k = chKeys(ch);
      p.hgetall(k.meta).zrange(k.revive, 0, -1, { withScores: true }).zrange(k.flower, 0, -1, { withScores: true });
    }
    const r = await p.exec<(string[] | null)[]>();
    return CHANNELS.flatMap((ch, i) => RedisStore.records(ch, r[i * 3], r[i * 3 + 1] ?? [], r[i * 3 + 2] ?? []));
  }

  async get(id: string): Promise<GraveRecord | null> {
    const k = await this.keysOf(id);
    const [raw, hidden, decor, revives, flowers] = await this.redis
      .pipeline()
      .hget(k.meta, id)
      .hexists(k.meta, HIDDEN + id)
      .hget(k.meta, DECOR + id)
      .zscore(k.revive, id)
      .zscore(k.flower, id)
      .exec<[Raw, number, Raw, Raw, Raw]>();
    if (!raw) return null;
    return {
      ...parse(raw),
      channel: k.channel,
      hidden: Number(hidden) === 1 || undefined,
      decor: parseDecor(decor),
      flowers: Number(flowers ?? 0),
      revives: Number(revives ?? 0),
    };
  }

  async put(grave: Grave): Promise<void> {
    const channel = grave.channel ?? 1;
    const k = chKeys(channel);
    this.channels.set(grave.id, channel);
    await this.redis
      .multi()
      .hset(k.meta, { [grave.id]: encode({ ...grave, channel }) })
      .zadd(k.created, { score: grave.createdAt, member: grave.id })
      .hset(K.graveChannel, { [grave.id]: String(channel) })
      .exec();
  }

  async remove(id: string): Promise<Grave | null> {
    const k = await this.keysOf(id);
    const raw = await this.redis.hget<string>(k.meta, id);
    if (!raw) return null;
    // flower:{id}:{visitorId} 키는 SCAN 없이 찾을 수 없으므로 24시간 TTL로 저절로 사라지게 둔다
    await this.redis
      .multi()
      .hdel(k.meta, id, HIDDEN + id, DECOR + id)
      .zrem(k.created, id)
      .zrem(k.revive, id)
      .zrem(k.flower, id)
      .zrem(K.reported, id)
      .hdel(K.graveChannel, id)
      .del(K.revivers(id), K.reviveEarned(id), K.reports(id), K.reporters(id), K.reportLog(id), K.decor(id))
      .exec();
    return { ...parse(raw), channel: k.channel };
  }

  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    const k = await this.keysOf(id);
    const r = await this.redis.eval<string[], number>(
      SET_HIDDEN_LUA,
      [k.meta, K.reports(id), K.reporters(id), K.reported],
      [id, hidden ? "1" : "0"],
    );
    return Number(r) === 1;
  }

  async resetReports(id: string): Promise<boolean> {
    const k = await this.keysOf(id);
    const r = await this.redis.eval<string[], number>(
      RESET_REPORTS_LUA,
      [k.meta, K.reports(id), K.reporters(id), K.reportLog(id), K.reported],
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
    const k = await this.keysOf(id);
    const r = await this.redis.eval<string[], [number, string?] | null>(
      FLOWER_LUA,
      [k.meta, K.flowerMark(id, visitorId), k.flower],
      [id, String(FLOWER_TTL_SEC)],
    );
    if (!r) return null;
    return Number(r[0]) === 1 ? Number(r[1]) : "already";
  }

  async firstRevive(id: string, visitorId: string): Promise<boolean> {
    return Number(await this.redis.sadd(K.reviveEarned(id), visitorId)) === 1;
  }

  async toggleRevive(id: string, visitorId: string): Promise<ReviveResponse | null> {
    const k = await this.keysOf(id);
    const r = await this.redis.eval<string[], [number, string] | null>(
      REVIVE_LUA,
      [k.meta, K.revivers(id), k.revive],
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
    const k = await this.keysOf(id);
    const entry: ReportLogEntry = { at, reason };
    const r = await this.redis.eval<string[], number | null>(
      REPORT_LUA,
      [k.meta, K.reports(id), K.reporters(id), K.reportLog(id), K.reported],
      [id, ipHash, visitorId, String(REPORT_HIDE_THRESHOLD), JSON.stringify(entry), String(REPORT_LOG_MAX)],
    );
    if (r === null) return null;
    return Number(r) === 1 ? "added" : "duplicate";
  }
}

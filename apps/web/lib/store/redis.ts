import { Redis } from "@upstash/redis";
import { GRAVE_CHANNELS } from "./channels";
import { REPORT_LOG_MAX, type ReportLogEntry, type ReportReason } from "../reports";
import { DEFAULT_PASS_DAYS, type Grave, type GraveDecor, type PassReason } from "../types";
import { chKeys, DECOR, HIDDEN, K } from "./keys";
import {
  FLOWER_TTL_SEC,
  REPORT_HIDE_THRESHOLD,
  type GraveRecord,
  type GraveSettings,
  type GraveStore,
  type PassedRecord,
  type ReportSummary,
  SHRINE_KEEP_MS,
  type ShrineRecord,
  type ViewerState,
} from "./types";

// 반응은 모두 Lua 스크립트 하나로 처리한다. 스크립트 실행 중에는 다른 명령이 끼어들 수 없으므로
// "묘비가 있을 때만" 조건과 분기를 원자적으로 묶을 수 있다 (삭제와 경합해 고아 키가 생기지 않는다).
// 공통: KEYS[1] = graves:meta, ARGV[1] = 묘비 id

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

// 성황당으로 옮기기: 메타·숨김·꾸미기 필드와 채널 랭킹 점수를 하나의 보관 JSON으로 묶어 계정 성황당에 둔다.
// 반응한 사람 집합·신고 기록·꾸미기 ZSET 같은 묘비 id 키는 그대로 두었다가 복구 때 그대로 쓴다.
// KEYS: meta, created, revive, flower, graveCh, shrine, shrineAll  ARGV: id, removedAt, expiresAt, channel, member
const TO_SHRINE_LUA = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return nil end
local hidden = redis.call('HEXISTS', KEYS[1], '${HIDDEN}' .. ARGV[1]) == 1 and 'true' or 'false'
local decor = redis.call('HGET', KEYS[1], '${DECOR}' .. ARGV[1]) or 'null'
local revives = redis.call('ZSCORE', KEYS[3], ARGV[1]) or '0'
local flowers = redis.call('ZSCORE', KEYS[4], ARGV[1]) or '0'
redis.call('HDEL', KEYS[1], ARGV[1], '${HIDDEN}' .. ARGV[1], '${DECOR}' .. ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
redis.call('HDEL', KEYS[5], ARGV[1])
redis.call('HSET', KEYS[6], ARGV[1], '{"grave":' .. raw .. ',"channel":' .. ARGV[4] .. ',"flowers":' .. flowers .. ',"revives":' .. revives ..
  ',"hidden":' .. hidden .. ',"decor":' .. decor .. ',"removedAt":' .. ARGV[2] .. '}')
redis.call('ZADD', KEYS[7], ARGV[3], ARGV[5])
return raw
`;

// 성황당에서 되돌리기 (다른 요청이 먼저 되돌렸으면 0)
// KEYS: shrine, shrineAll, meta, created, revive, flower, graveCh
// ARGV: id, member, graveJson, createdAt, flowers, revives, hidden('1'|'0'), decorJson(''=없음), channel
const RESTORE_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[2])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[3])
redis.call('ZADD', KEYS[4], ARGV[4], ARGV[1])
if tonumber(ARGV[5]) > 0 then redis.call('ZADD', KEYS[6], ARGV[5], ARGV[1]) end
if tonumber(ARGV[6]) ~= 0 then redis.call('ZADD', KEYS[5], ARGV[6], ARGV[1]) end
if ARGV[7] == '1' then redis.call('HSET', KEYS[3], '${HIDDEN}' .. ARGV[1], '1') end
if ARGV[8] ~= '' then redis.call('HSET', KEYS[3], '${DECOR}' .. ARGV[1], ARGV[8]) end
redis.call('HSET', KEYS[7], ARGV[1], ARGV[9])
return 1
`;

// 만료된 성황당 묘비를 완전히 지운다 (그새 되돌려졌으면 색인만 정리)
// KEYS: shrine, shrineAll, reported, revivers, reviveEarned, reports, reporters, reportLog, decor  ARGV: id, member
const PURGE_LUA = `
redis.call('ZREM', KEYS[2], ARGV[2])
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('DEL', KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9])
return 1
`;

// 성불: 성황당 옮기기와 같은 방식으로 메타·숨김·꾸미기 필드와 채널 점수를 보관 JSON 하나로 묶어 성불 리스트에 둔다.
// 묘비가 이미 없으면(먼저 성불했거나 이장·삭제됨) nil → 여러 요청이 겹쳐도 한 번만 옮겨진다.
// 반응한 사람 집합·신고 기록·꾸미기 ZSET 같은 묘비 id 키는 그대로 둔다 (관리자가 지울 때 같이 지운다).
// KEYS: meta, created, revive, flower, graveCh, passedMeta, passedAt  ARGV: id, passedAt, channel, reason
const PASS_LUA = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return nil end
local hidden = redis.call('HEXISTS', KEYS[1], '${HIDDEN}' .. ARGV[1]) == 1 and 'true' or 'false'
local decor = redis.call('HGET', KEYS[1], '${DECOR}' .. ARGV[1]) or 'null'
local revives = redis.call('ZSCORE', KEYS[3], ARGV[1]) or '0'
local flowers = redis.call('ZSCORE', KEYS[4], ARGV[1]) or '0'
redis.call('HDEL', KEYS[1], ARGV[1], '${HIDDEN}' .. ARGV[1], '${DECOR}' .. ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('ZREM', KEYS[4], ARGV[1])
redis.call('HDEL', KEYS[5], ARGV[1])
local env = '{"grave":' .. raw .. ',"channel":' .. ARGV[3] .. ',"flowers":' .. flowers .. ',"revives":' .. revives ..
  ',"hidden":' .. hidden .. ',"decor":' .. decor .. ',"passedAt":' .. ARGV[2] .. ',"reason":"' .. ARGV[4] .. '"}'
redis.call('HSET', KEYS[6], ARGV[1], env)
redis.call('ZADD', KEYS[7], ARGV[2], ARGV[1])
return env
`;

// 성불한 묘비를 완전히 지운다 (관리자). 없으면 nil
// KEYS: passedMeta, passedAt, reported, revivers, reviveEarned, reports, reporters, reportLog, decor  ARGV: id
const REMOVE_PASSED_LUA = `
local env = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
if not env then return nil end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('DEL', KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8], KEYS[9])
return env
`;

/** 성불 보관 JSON */
type PassedEnvelope = {
  grave: Grave;
  channel: number;
  flowers: number;
  revives: number;
  hidden: boolean;
  decor: GraveDecor[] | null;
  passedAt: number;
  reason: PassReason;
};

const fromPassed = (e: PassedEnvelope): PassedRecord => ({
  record: {
    ...e.grave,
    channel: e.channel,
    hidden: e.hidden || undefined,
    decor: e.decor ?? undefined,
    flowers: Number(e.flowers),
    revives: Number(e.revives),
  },
  passedAt: Number(e.passedAt),
  reason: e.reason,
});

/** 성황당 보관 JSON */
type ShrineEnvelope = {
  grave: Grave;
  channel: number;
  flowers: number;
  revives: number;
  hidden: boolean;
  decor: GraveDecor[] | null;
  removedAt: number;
};

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

  async toShrine(id: string, accountId: string, now: number): Promise<Grave | null> {
    const k = await this.keysOf(id);
    const raw = await this.redis.eval<string[], string | null>(
      TO_SHRINE_LUA,
      [k.meta, k.created, k.revive, k.flower, K.graveChannel, K.shrine(accountId), K.shrineAll],
      [id, String(now), String(now + SHRINE_KEEP_MS), String(k.channel), `${accountId}|${id}`],
    );
    this.channels.delete(id);
    return raw ? { ...parse(raw), channel: k.channel } : null;
  }

  private static fromEnvelope(e: ShrineEnvelope): ShrineRecord {
    return {
      record: {
        ...e.grave,
        channel: e.channel,
        hidden: e.hidden || undefined,
        decor: e.decor ?? undefined,
        flowers: Number(e.flowers),
        revives: Number(e.revives),
      },
      removedAt: e.removedAt,
      expiresAt: e.removedAt + SHRINE_KEEP_MS,
    };
  }

  async shrine(accountId: string, now: number): Promise<ShrineRecord[]> {
    const flat = (await this.redis.hgetall(K.shrine(accountId))) as unknown as string[] | null;
    return [...pairs(flat).values()]
      .map((raw) => RedisStore.fromEnvelope(JSON.parse(raw) as ShrineEnvelope))
      .filter((e) => e.expiresAt > now)
      .sort((a, b) => b.removedAt - a.removedAt);
  }

  async restore(accountId: string, id: string, now: number): Promise<GraveRecord | null> {
    const raw = await this.redis.hget<string>(K.shrine(accountId), id);
    if (!raw) return null;
    const e = JSON.parse(raw) as ShrineEnvelope;
    if (e.removedAt + SHRINE_KEEP_MS <= now) return null;
    const grave: Grave = { ...e.grave, channel: e.channel, createdAt: now };
    const k = chKeys(e.channel);
    const ok = await this.redis.eval<string[], number>(
      RESTORE_LUA,
      [K.shrine(accountId), K.shrineAll, k.meta, k.created, k.revive, k.flower, K.graveChannel],
      [
        id,
        `${accountId}|${id}`,
        encode(grave),
        String(now),
        String(e.flowers),
        String(e.revives),
        e.hidden ? "1" : "0",
        e.decor ? JSON.stringify(e.decor) : "",
        String(e.channel),
      ],
    );
    if (Number(ok) !== 1) return null;
    this.channels.set(id, e.channel);
    return RedisStore.fromEnvelope({ ...e, grave }).record;
  }

  async purgeShrine(now: number, limit: number): Promise<Grave[]> {
    const members = await this.redis.zrange<string[]>(K.shrineAll, "-inf", now, { byScore: true, offset: 0, count: limit });
    const out: Grave[] = [];
    for (const member of members) {
      const [accountId, id] = member.split("|");
      const raw = await this.redis.hget<string>(K.shrine(accountId), id);
      const keys = [K.revivers(id), K.reviveEarned(id), K.reports(id), K.reporters(id), K.reportLog(id), K.decor(id)];
      const done = await this.redis.eval<string[], number>(
        PURGE_LUA,
        [K.shrine(accountId), K.shrineAll, K.reported, ...keys],
        [id, member],
      );
      if (Number(done) === 1 && raw) out.push((JSON.parse(raw) as ShrineEnvelope).grave);
    }
    return out;
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
    return { myFlowerToday: Number(await this.redis.exists(K.flowerMark(id, visitorId))) === 1 };
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

  async passOn(id: string, passedAt: number, reason: PassReason): Promise<PassedRecord | null> {
    const k = await this.keysOf(id);
    const env = await this.redis.eval<string[], string | null>(
      PASS_LUA,
      [k.meta, k.created, k.revive, k.flower, K.graveChannel, K.passedMeta, K.passedAt],
      [id, String(passedAt), String(k.channel), reason],
    );
    this.channels.delete(id);
    return env ? fromPassed(JSON.parse(env) as PassedEnvelope) : null;
  }

  async passedAll(): Promise<PassedRecord[]> {
    const flat = (await this.redis.hgetall(K.passedMeta)) as unknown as string[] | null;
    return [...pairs(flat).values()].map((raw) => fromPassed(JSON.parse(raw) as PassedEnvelope));
  }

  async passedSince(since: number, limit: number): Promise<PassedRecord[]> {
    const ids = await this.redis.zrange<string[]>(K.passedAt, "+inf", `(${since}`, {
      byScore: true,
      rev: true,
      offset: 0,
      count: limit,
    });
    if (!ids.length) return [];
    const raws = (await this.redis.hmget(K.passedMeta, ...ids)) as unknown as Record<string, string | null> | (string | null)[] | null;
    const vals = Array.isArray(raws) ? raws : ids.map((id) => raws?.[id] ?? null);
    return vals.flatMap((raw) => (raw ? [fromPassed(JSON.parse(raw) as PassedEnvelope)] : []));
  }

  async removePassed(id: string): Promise<Grave | null> {
    const keys = [K.revivers(id), K.reviveEarned(id), K.reports(id), K.reporters(id), K.reportLog(id), K.decor(id)];
    const env = await this.redis.eval<string[], string | null>(
      REMOVE_PASSED_LUA,
      [K.passedMeta, K.passedAt, K.reported, ...keys],
      [id],
    );
    return env ? (JSON.parse(env) as PassedEnvelope).grave : null;
  }

  async settings(now: number): Promise<GraveSettings> {
    const [, flat] = await this.redis
      .pipeline()
      .hsetnx(K.graveCfg, "passEpoch", String(now))
      .hgetall(K.graveCfg)
      .exec<[number, string[] | null]>();
    const cfg = pairs(flat);
    const days = Number(cfg.get("passDays"));
    return {
      passDays: Number.isFinite(days) && days > 0 ? days : DEFAULT_PASS_DAYS,
      passEpoch: Number(cfg.get("passEpoch") ?? now),
    };
  }

  async setPassDays(days: number): Promise<void> {
    await this.redis.hset(K.graveCfg, { passDays: String(days) });
  }

  async lockSweep(ttlMs: number): Promise<boolean> {
    // 잠금 만료는 Redis 서버 시계(PX)로 잰다 (함수 인스턴스마다 시계가 조금씩 달라도 겹치지 않게)
    return (await this.redis.set(K.passSweep, "1", { nx: true, px: ttlMs })) !== null;
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

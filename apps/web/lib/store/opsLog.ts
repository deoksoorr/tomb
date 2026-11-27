import type { Redis } from "@upstash/redis";
import type { ConnWhy } from "@tomb/protocol";
import { env } from "../env";
import type { MoveLogEntry } from "../moveLog";
import { redisClient } from "../redisUsage";

// 11/26 운영 기록: 접속 기록(들어옴·나감·화면 오류)과 사냥터 기록(입장·나감·튕김·쓰러짐·보상·서버 판정 거절).
// 계정당 LOG_KEEP_USER줄, 전체 LOG_KEEP_ALL줄만 두고 오래된 것은 바로 잘라 낸다 (리스트 트림). IP는 남기지 않는다.
// 쓰기는 묶어서 한 번: 여러 줄을 스크립트 하나(명령 1개)로 넣고 자른다 — 실시간 서버가 1분마다 모아 보내는 접속 기록이 한 번에 들어온다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - log:{conn|hunt}:all        LIST 최신 먼저 (전체 LOG_KEEP_ALL)
//  - log:{conn|hunt}:u:{계정}   LIST 최신 먼저 (계정당 LOG_KEEP_USER, 마지막 기록 뒤 USER_TTL_SEC에 사라짐)
//  - log:conn:h:{YYYYMMDDHH}    HASH 그 시각(한국 시각 1시간) 나감 종류별 수 + "in" (대시보드 24시간 비정상 종료 비율, 26시간 보관)

export const LOG_KEEP_ALL = 500;
export const LOG_KEEP_USER = 50;
const USER_TTL_SEC = 30 * 86_400;
const HOUR_TTL_SEC = 26 * 3_600;

export type LogList = "conn" | "hunt";

/** 접속 기록 한 줄. in = 들어옴, out = 나감(why), err = 화면 오류·API 실패(msg) */
export type ConnLogEntry = { a: string; k: "in" | "out" | "err"; at: number; ch?: number; dev?: string; why?: ConnWhy; msg?: string };
/** 사냥터 기록 종류: 입장·나감(그만두고 나옴)·튕김(앞 판을 끝내지 못함)·쓰러짐·보상 지급·서버 판정 거절 */
export type HuntLogKind = "start" | "leave" | "drop" | "die" | "reward" | "reject";
export type HuntLogEntry = {
  a: string;
  k: HuntLogKind;
  at: number;
  /** 사냥터 (zone id), 난이도, 야근 빌딩 시작 층 */
  zone?: string;
  d?: string;
  tw?: number;
  /** 보상: 경험치·포인트·드롭 수 / 야근 빌딩 깬 층 */
  exp?: number;
  pts?: number;
  drops?: number;
  floors?: number;
  /** 판 시간 (초) */
  sec?: number;
  /** 거절: 오류 코드·문구 */
  code?: string;
  msg?: string;
};
/** 11/27 접속 기록 목록에는 자리 옮김 줄(k: "mv" — lib/moveLog)도 들어간다 (계정 목록에만) */
export type LogEntry = ConnLogEntry | HuntLogEntry | MoveLogEntry;

export interface OpsLogStore {
  /**
   * 여러 줄 한 번에 (오래된 것부터 넣는다 → 목록은 최신 먼저). hourKey가 있으면 접속 기록 시간별 수도 센다.
   * 11/26 opts.all === false면 계정 목록에만 넣는다 (화면 오류 줄 — 누구나 보낼 수 있어 전체 목록을 밀어내지 않게)
   */
  push(list: LogList, entries: readonly LogEntry[], hourKey?: string, opts?: { all?: boolean }): Promise<void>;
  /** 전체 최신 순 */
  recent(list: LogList, limit?: number): Promise<LogEntry[]>;
  /** 한 계정 최신 순 */
  ofAccount(list: LogList, accountId: string): Promise<LogEntry[]>;
  /** 시간 칸들의 종류별 합 */
  hourCounts(hourKeys: readonly string[]): Promise<Record<string, number>>;
}

/** 시간별 수에 더할 칸 (나감은 종류, 들어옴은 "in", 그 밖은 없음) */
export function hourField(e: LogEntry): string {
  if (e.k === "out") return (e as ConnLogEntry).why ?? "drop";
  if (e.k === "in") return "in";
  return "";
}

/** 한국 시각 1시간 칸 이름 (YYYYMMDDHH) */
export function hourKeyOf(now: number): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 13).replace(/[-T]/g, "");
}

/** now부터 거꾸로 hours개 칸 */
export function lastHourKeys(now: number, hours = 24): string[] {
  return Array.from({ length: hours }, (_, i) => hourKeyOf(now - i * 3_600_000));
}

// ── 메모리 (로컬·시험) ──

export class MemoryOpsLog implements OpsLogStore {
  private all = new Map<LogList, LogEntry[]>();
  private users = new Map<string, LogEntry[]>();
  private hours = new Map<string, Record<string, number>>();

  async push(list: LogList, entries: readonly LogEntry[], hourKey?: string, opts?: { all?: boolean }): Promise<void> {
    const all = this.all.get(list) ?? [];
    const toAll = opts?.all !== false;
    for (const e of entries) {
      const copy = { ...e };
      if (toAll) all.unshift(copy);
      const uk = `${list}:${e.a}`;
      const u = this.users.get(uk) ?? [];
      u.unshift(copy);
      this.users.set(uk, u.slice(0, LOG_KEEP_USER));
      const f = hourKey ? hourField(e) : "";
      if (hourKey && f) {
        const h = this.hours.get(hourKey) ?? {};
        h[f] = (h[f] ?? 0) + 1;
        this.hours.set(hourKey, h);
      }
    }
    this.all.set(list, all.slice(0, LOG_KEEP_ALL));
  }
  async recent(list: LogList, limit = LOG_KEEP_ALL): Promise<LogEntry[]> {
    return (this.all.get(list) ?? []).slice(0, limit).map((e) => ({ ...e }));
  }
  async ofAccount(list: LogList, accountId: string): Promise<LogEntry[]> {
    return (this.users.get(`${list}:${accountId}`) ?? []).map((e) => ({ ...e }));
  }
  async hourCounts(hourKeys: readonly string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const k of hourKeys) for (const [f, n] of Object.entries(this.hours.get(k) ?? {})) out[f] = (out[f] ?? 0) + n;
    return out;
  }
}

// ── Redis ──

// KEYS[1] 전체 목록, KEYS[2] 시간 칸(안 쓰면 아무 이름), KEYS[3..] 계정 목록(겹치지 않게)
// ARGV[1] 전체 상한, ARGV[2] 계정 상한, ARGV[3] 계정 목록 TTL, ARGV[4] 시간 칸 TTL, ARGV[5] 줄 수 N, ARGV[6] 전체 목록에도 넣는지('1'/'0'),
// 그 뒤 줄마다 3개: 계정 목록 번호(1부터 — KEYS[2 + 번호]), JSON, 시간 칸 필드('' = 세지 않음)
const PUSH_LUA = `
local n = tonumber(ARGV[5])
local toAll = ARGV[6] == '1'
local touched = {}
local counted = false
for i = 0, n - 1 do
  local ki = tonumber(ARGV[7 + i * 3])
  local v = ARGV[8 + i * 3]
  local hf = ARGV[9 + i * 3]
  if toAll then redis.call('LPUSH', KEYS[1], v) end
  redis.call('LPUSH', KEYS[2 + ki], v)
  touched[ki] = true
  if hf ~= '' then
    redis.call('HINCRBY', KEYS[2], hf, 1)
    counted = true
  end
end
if toAll then redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[1]) - 1) end
for ki, _ in pairs(touched) do
  redis.call('LTRIM', KEYS[2 + ki], 0, tonumber(ARGV[2]) - 1)
  redis.call('EXPIRE', KEYS[2 + ki], tonumber(ARGV[3]))
end
if counted then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4])) end
return n`;

const allKey = (list: LogList) => `log:${list}:all`;
const userKey = (list: LogList, id: string) => `log:${list}:u:${id}`;
const hourKeyName = (h: string) => `log:conn:h:${h}`;

function parseRows(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const s of raw) {
    try {
      const e = typeof s === "string" ? (JSON.parse(s) as LogEntry) : (s as LogEntry);
      if (e && typeof e.a === "string" && typeof e.at === "number") out.push(e);
    } catch {
      // 깨진 줄은 건너뛴다
    }
  }
  return out;
}

export class RedisOpsLog implements OpsLogStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "opsLog");
  }

  async push(list: LogList, entries: readonly LogEntry[], hourKey?: string, opts?: { all?: boolean }): Promise<void> {
    if (!entries.length) return;
    const ids = [...new Set(entries.map((e) => e.a))];
    const idx = new Map(ids.map((id, i) => [id, i + 1]));
    const keys = [allKey(list), hourKey ? hourKeyName(hourKey) : `log:${list}:none`, ...ids.map((id) => userKey(list, id))];
    const args = [String(LOG_KEEP_ALL), String(LOG_KEEP_USER), String(USER_TTL_SEC), String(HOUR_TTL_SEC), String(entries.length), opts?.all === false ? "0" : "1"];
    for (const e of entries) args.push(String(idx.get(e.a)), JSON.stringify(e), hourKey ? hourField(e) : "");
    await this.redis.eval(PUSH_LUA, keys, args);
  }

  async recent(list: LogList, limit = LOG_KEEP_ALL): Promise<LogEntry[]> {
    return parseRows(await this.redis.lrange(allKey(list), 0, Math.min(limit, LOG_KEEP_ALL) - 1));
  }

  async ofAccount(list: LogList, accountId: string): Promise<LogEntry[]> {
    return parseRows(await this.redis.lrange(userKey(list, accountId), 0, LOG_KEEP_USER - 1));
  }

  async hourCounts(hourKeys: readonly string[]): Promise<Record<string, number>> {
    if (!hourKeys.length) return {};
    const p = this.redis.pipeline();
    for (const k of hourKeys) p.hgetall(hourKeyName(k));
    const rows = await p.exec<unknown[]>();
    const out: Record<string, number> = {};
    for (const got of rows) {
      const flat = Array.isArray(got) ? (got as string[]) : Object.entries((got ?? {}) as Record<string, string>).flat();
      for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = (out[flat[i]] ?? 0) + (Number(flat[i + 1]) || 0);
    }
    return out;
  }
}

const g = globalThis as typeof globalThis & { __tombOpsLog?: OpsLogStore };

/** Redis가 있으면 Redis, 없으면(로컬·시험) 메모리 */
export function getOpsLog(): OpsLogStore {
  const cur = g.__tombOpsLog;
  const conn = env.redis();
  if (conn) return cur instanceof RedisOpsLog ? cur : (g.__tombOpsLog = new RedisOpsLog(conn));
  if (cur instanceof MemoryOpsLog) return cur;
  return (g.__tombOpsLog = cur ? Object.assign(new MemoryOpsLog(), cur) : new MemoryOpsLog());
}

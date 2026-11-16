import type { Redis } from "@upstash/redis";
import { kstHour } from "../ambience";
import { env } from "../env";
import { gameDay, nextDayStartMs } from "../gameDay";
import { STAMP_CAP } from "../forage/quests/catalog";
import { questStore } from "../forage/quests/service";
import { questKey, type MemoryQuestStore } from "../forage/quests/store";
import { redisClient } from "../redisUsage";

// 11/16 달물결 포구 등대 등불: 해가 진 뒤(한국 시각 17:30 ~ 새벽 5시) 채널마다 그날 처음 불을 켠 사람이 「오늘의 등대지기」.
// 켠 사람은 수집 의뢰 도장 +1 (도장 상한 STAMP_CAP). 하루 = 게임 날 (새벽 5시에 바뀐다).
// Redis: 켜기 = Lua 1번 (SET NX EX 다음 새벽 5시까지 + 도장), 보기 = GET 1번 (인스턴스 메모리에 기억).
//  sea:lamp:{ch}:{yyyymmdd}  STRING 켠 사람 이름 (EX 다음 새벽 5시까지)

export const lampKey = (ch: number, day: string) => `sea:lamp:${ch}:${day}`;

/** 해가 진 뒤인가 (ambience timePhase의 해질녘 17:30부터 게임 날이 바뀌는 새벽 5시 전까지) */
export function lampHour(now = Date.now()): boolean {
  const h = kstHour(now);
  return h >= 17.5 || h < 5;
}

export type LampState = { ch: number; day: string; name: string | null };
export type LightResult = { lit: true; name: string; stamps: number } | { lit: false; name: string };

// KEYS: lamp, quest  ARGV: name, ttlSec, cap  → {1, name, 새 도장 수} | {0, 켠 사람 이름}
const LIGHT_LUA = `
if not redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then return {0, redis.call('GET', KEYS[1]) or ''} end
local st = tonumber(redis.call('HGET', KEYS[2], 'st') or '0') or 0
local n = math.min(tonumber(ARGV[3]), st + 1)
if n > st then redis.call('HSET', KEYS[2], 'st', n) end
return {1, ARGV[1], n}
`;

export interface LampStore {
  get(ch: number, day: string): Promise<string | null>;
  /** 그날 처음이면 켜고 도장 +1 (한 번에) */
  light(ch: number, day: string, accountId: string, name: string, ttlSec: number): Promise<LightResult>;
}

export class MemoryLampStore implements LampStore {
  private lit = new Map<string, { name: string; until: number }>();
  async get(ch: number, day: string) {
    const v = this.lit.get(lampKey(ch, day));
    return v && v.until > Date.now() ? v.name : null;
  }
  async light(ch: number, day: string, accountId: string, name: string, ttlSec: number): Promise<LightResult> {
    const k = lampKey(ch, day);
    const cur = this.lit.get(k);
    if (cur && cur.until > Date.now()) return { lit: false, name: cur.name };
    this.lit.set(k, { name, until: Date.now() + ttlSec * 1000 });
    const stamps = (questStore() as MemoryQuestStore).addStampsNow(accountId, 1, STAMP_CAP);
    return { lit: true, name, stamps };
  }
}

export class RedisLampStore implements LampStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "sea/lamp");
  }
  async get(ch: number, day: string) {
    const v = await this.redis.get<string>(lampKey(ch, day));
    return v ? String(v) : null;
  }
  async light(ch: number, day: string, accountId: string, name: string, ttlSec: number): Promise<LightResult> {
    const r = await this.redis.eval<string[], (string | number)[]>(LIGHT_LUA, [lampKey(ch, day), questKey(accountId)], [name, String(ttlSec), String(STAMP_CAP)]);
    if (Number(r[0]) === 1) return { lit: true, name: String(r[1]), stamps: Number(r[2]) || 0 };
    return { lit: false, name: String(r[1] ?? "") };
  }
}

const g = globalThis as typeof globalThis & { __tombLamp?: LampStore; __tombLampMemo?: Map<string, { name: string | null; at: number }> };

export function getLampStore(): LampStore {
  const conn = env.redis();
  const cur = g.__tombLamp;
  if (conn) return cur instanceof RedisLampStore ? cur : (g.__tombLamp = new RedisLampStore(conn));
  if (env.isProd()) throw new Error("[sea/lamp] Redis 환경변수가 없습니다.");
  return cur instanceof MemoryLampStore ? cur : (g.__tombLamp = new MemoryLampStore());
}

/** 켜지지 않은 상태를 인스턴스 메모리에 기억하는 시간 (켜진 뒤로는 그날 내내 기억 — 바뀌지 않는다) */
const UNLIT_MEMO_MS = 20_000;
const memo = () => (g.__tombLampMemo ??= new Map());

/** 지금 그 채널 등대 (fresh = 메모리 기억을 건너뛴다: 누가 켰다는 소식을 받은 직후) */
export async function lampState(ch: number, now = Date.now(), fresh = false): Promise<LampState> {
  const day = gameDay(now);
  const k = lampKey(ch, day);
  const hit = memo().get(k);
  if (hit && (hit.name || (!fresh && now - hit.at < UNLIT_MEMO_MS))) return { ch, day, name: hit.name };
  const name = await getLampStore().get(ch, day);
  memo().set(k, { name, at: now });
  // 지난 날 기억은 버린다 (채널 수만큼만 남게)
  for (const key of memo().keys()) if (!key.endsWith(`:${day}`)) memo().delete(key);
  return { ch, day, name };
}

/** 등불 켜기. 해 지기 전이면 null (라우트가 안내) */
export async function lightLamp(ch: number, accountId: string, name: string, now = Date.now(), force = false): Promise<LightResult | null> {
  if (!force && !lampHour(now)) return null;
  const day = gameDay(now);
  const ttl = Math.max(60, Math.ceil((nextDayStartMs(now) - now) / 1000));
  const r = await getLampStore().light(ch, day, accountId, name, ttl);
  memo().set(lampKey(ch, day), { name: r.name || null, at: now });
  return r;
}

/** 시험용 */
export function resetLampMemo(): void {
  memo().clear();
}

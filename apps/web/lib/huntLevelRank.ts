import { Redis } from "@upstash/redis";
import { findBan } from "./ban";
import { env } from "./env";
import { gearById } from "./rpg/catalog";
import { getRpgStore } from "./rpg/store";
import { staffAccountId } from "./staff";
import { getAccounts, NO_NAME } from "./store";
import { kstDay } from "./store/accounts";
import { K } from "./store/keys";
import type { AccountStore } from "./store/types";
import type { RankRow } from "./types";

// 사냥 레벨 랭킹: 사냥터 캐릭터 레벨 높은 순, 같으면 경험치 많은 순. 사냥 저장소(lib/rpg)는 읽기만 한다 —
// 기록은 판 끝(/api/rpg/run/finish)·캐릭터 조회(/api/rpg) 라우트와, 랭킹을 볼 때 내 캐릭터에서 한다.
// 운영자(lib/staffRank 규칙: 목록에 없고 본인이 보면 mine = null · staff)·정지 계정은 목록에서 뺀다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - rank:huntLevel       ZSET 계정 id → 레벨 × LEVEL_SCALE + 경험치 (레벨이 같으면 경험치로 줄 세운다)
//  - rank:huntLevel:gear  HASH 계정 id → 장착한 무기 id (랭킹 아이콘용, 없으면 필드 없음)

const ZKEY = "rank:huntLevel";
const GEAR_KEY = "rank:huntLevel:gear";
/** 경험치가 레벨 자리를 넘지 않게 (한 레벨 경험치는 이보다 훨씬 작다) */
export const LEVEL_SCALE = 1e9;
/** 정지·운영자로 빠질 몫까지 더 읽는다 */
const EXTRA = 10;

export const levelScore = (level: number, exp: number) => Math.max(1, Math.floor(level)) * LEVEL_SCALE + Math.min(LEVEL_SCALE - 1, Math.max(0, Math.floor(exp)));
export const levelOf = (score: number) => Math.floor(score / LEVEL_SCALE);
export const expOf = (score: number) => score % LEVEL_SCALE;

/** 랭킹에 올릴 사냥 캐릭터 상태 (lib/rpg CharacterState에서 필요한 것만) */
export type HuntLevelInput = { level: number; exp: number; runs: number; equip: { weapon?: string | null } };
type Entry = { accountId: string; score: number };

export interface HuntLevelStore {
  /** score ≤ 0이면 뺀다 */
  put(accountId: string, score: number, weapon: string | null): Promise<void>;
  top(count: number): Promise<Entry[]>;
  countAbove(score: number): Promise<number>;
  /** 이름·무기 (표시용) */
  info(ids: readonly string[], now: number): Promise<Map<string, { name: string | null; weapon: string | null }>>;
}

export class MemoryHuntLevel implements HuntLevelStore {
  private scores = new Map<string, number>();
  private gear = new Map<string, string>();
  constructor(public accounts: () => AccountStore) {}
  async put(accountId: string, score: number, weapon: string | null): Promise<void> {
    if (score > 0) this.scores.set(accountId, score);
    else this.scores.delete(accountId);
    if (score > 0 && weapon) this.gear.set(accountId, weapon);
    else this.gear.delete(accountId);
  }
  async top(count: number): Promise<Entry[]> {
    return [...this.scores]
      .map(([accountId, score]) => ({ accountId, score }))
      .sort((a, b) => b.score - a.score || b.accountId.localeCompare(a.accountId))
      .slice(0, count);
  }
  async countAbove(score: number): Promise<number> {
    let n = 0;
    for (const s of this.scores.values()) if (s > score) n++;
    return n;
  }
  async info(ids: readonly string[], now: number) {
    const accounts = this.accounts();
    const out = new Map<string, { name: string | null; weapon: string | null }>();
    await Promise.all(ids.map(async (id) => out.set(id, { name: (await accounts.get(id, kstDay(now), now)).name, weapon: this.gear.get(id) ?? null })));
    return out;
  }
}

export class RedisHuntLevel implements HuntLevelStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }
  async put(accountId: string, score: number, weapon: string | null): Promise<void> {
    const p = this.redis.pipeline();
    if (score > 0) p.zadd(ZKEY, { score, member: accountId });
    else p.zrem(ZKEY, accountId);
    if (score > 0 && weapon) p.hset(GEAR_KEY, { [accountId]: weapon });
    else p.hdel(GEAR_KEY, accountId);
    await p.exec();
  }
  async top(count: number): Promise<Entry[]> {
    const flat = (await this.redis.zrange(ZKEY, 0, count - 1, { rev: true, withScores: true })) as unknown[];
    const out: Entry[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ accountId: String(flat[i]), score: Number(flat[i + 1]) });
    return out;
  }
  async countAbove(score: number): Promise<number> {
    return Number(await this.redis.zcount(ZKEY, `(${score}`, "+inf"));
  }
  async info(ids: readonly string[]) {
    const out = new Map<string, { name: string | null; weapon: string | null }>();
    if (!ids.length) return out;
    const p = this.redis.pipeline();
    for (const id of ids) p.hget(K.acct(id), "name").hget(GEAR_KEY, id);
    const res = (await p.exec()) as unknown[];
    ids.forEach((id, i) => {
      const [name, weapon] = [res[i * 2], res[i * 2 + 1]];
      out.set(id, { name: name === null || name === undefined ? null : String(name), weapon: weapon === null || weapon === undefined ? null : String(weapon) });
    });
    return out;
  }
}

const g = globalThis as typeof globalThis & { __tombHuntLevel?: HuntLevelStore };

export function getHuntLevelStore(accounts: AccountStore = getAccounts()): HuntLevelStore {
  const cur = g.__tombHuntLevel;
  const conn = env.redis();
  if (conn) return cur instanceof RedisHuntLevel ? cur : (g.__tombHuntLevel = new RedisHuntLevel(conn));
  if (env.isProd()) throw new Error("[huntLevel] Redis 환경변수가 없습니다.");
  const mem = cur instanceof MemoryHuntLevel ? cur : (g.__tombHuntLevel = cur ? Object.assign(new MemoryHuntLevel(() => accounts), cur) : new MemoryHuntLevel(() => accounts));
  mem.accounts = () => accounts;
  return mem;
}

export type HuntLevelOptions = {
  now?: number;
  staffId?: string | null;
  isBanned?: (accountId: string) => Promise<boolean>;
  store?: HuntLevelStore;
};

/** 한 판도 안 한 새 캐릭터(1레벨·경험치 0)는 순위에 올리지 않는다 */
const ranked = (c: HuntLevelInput) => c.level > 1 || c.exp > 0 || c.runs > 0;

/** 캐릭터가 바뀐 뒤 부른다 (운영자는 빼 둔다). 오류는 삼킨다 — 사냥 결과 저장이 랭킹 때문에 실패하면 안 된다 */
export async function recordHuntLevel(accountId: string, c: HuntLevelInput, opts: HuntLevelOptions = {}): Promise<void> {
  try {
    const staff = accountId === (opts.staffId === undefined ? await staffAccountId() : opts.staffId);
    const store = opts.store ?? getHuntLevelStore();
    await store.put(accountId, staff || !ranked(c) ? 0 : levelScore(c.level, c.exp), c.equip.weapon ?? null);
  } catch (e) {
    console.warn("[huntLevel] 기록 실패", e);
  }
}

export type HuntLevelRow = RankRow & { accountId: string };

/**
 * 사냥 레벨 상위 size명 + 내 줄 (판 밖일 때만 mine). value = 레벨, sub = 경험치, gear = 장착 무기 id.
 * me가 있으면 내 캐릭터를 사냥 저장소에서 읽어 기록부터 맞춘다
 */
export async function huntLevelRank(me: string | null, size: number, opts: HuntLevelOptions = {}): Promise<{ rows: HuntLevelRow[]; mine: HuntLevelRow | null; staff: boolean }> {
  const now = opts.now ?? Date.now();
  const store = opts.store ?? getHuntLevelStore();
  const staffId = opts.staffId === undefined ? await staffAccountId() : opts.staffId;
  const isBanned = opts.isBanned ?? (async (id: string) => !!(await findBan(id, null)));
  const isStaffMe = !!me && me === staffId;

  let myScore = 0;
  if (me && !isStaffMe) {
    const c = await getRpgStore().get(me);
    myScore = ranked(c) ? levelScore(c.level, c.exp) : 0;
    await store.put(me, myScore, c.equip.weapon ?? null).catch(() => undefined);
  }

  const top = (await store.top(size + EXTRA)).filter((e) => e.accountId !== staffId);
  const banned = await Promise.all(top.map((e) => isBanned(e.accountId)));
  const list = top.filter((_, i) => !banned[i]).slice(0, size);
  const mineOut = !!me && !isStaffMe && myScore > 0 && !list.some((e) => e.accountId === me) && !(await isBanned(me));
  const info = await store.info(mineOut ? [...list.map((e) => e.accountId), me!] : list.map((e) => e.accountId), now);
  const row = (e: Entry, rank: number): HuntLevelRow => {
    const i = info.get(e.accountId);
    const weapon = i?.weapon && gearById(i.weapon) ? i.weapon : null;
    return {
      rank,
      accountId: e.accountId,
      name: i?.name ?? NO_NAME,
      value: levelOf(e.score),
      me: e.accountId === me,
      sub: `경험치 ${expOf(e.score).toLocaleString("ko-KR")}`,
      ...(weapon ? { gear: weapon } : {}),
    };
  };
  const rows = list.map((e, i) => row(e, i + 1));
  if (!mineOut) return { rows, mine: null, staff: isStaffMe };
  const above = await store.countAbove(myScore);
  return { rows, mine: row({ accountId: me!, score: myScore }, Math.max(size + 1, above + 1)), staff: false };
}

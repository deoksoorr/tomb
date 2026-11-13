import { Redis } from "@upstash/redis";
import { findBan } from "./ban";
import { env } from "./env";
import { gearById } from "./rpg/catalog";
import { autoFill, FILL_BATCH, FILL_DONE, MemoryFillMark, RedisFillMark, type FillMark } from "./rankFill";
import { getRpgStore, type RpgStore } from "./rpg/store";
import { staffAccountId } from "./staff";
import { getAccounts, NO_NAME } from "./store";
import { kstDay } from "./store/accounts";
import { K } from "./store/keys";
import type { AccountStore } from "./store/types";
import type { RankRow } from "./types";

// 사냥 레벨 랭킹: 사냥터 캐릭터 레벨 높은 순, 같으면 경험치 많은 순. 사냥 저장소(lib/rpg)는 읽기만 한다 —
// 기록은 판 끝(/api/rpg/run/finish)·캐릭터 조회(/api/rpg) 라우트와, 랭킹을 볼 때 내 캐릭터에서 한다.
// 랭킹이 생기기 전부터 있던 캐릭터는 처음 읽을 때 사냥 저장소를 한 번 훑어 채운다 (lib/rankFill, 관리자 「운영 점검」에서 다시 채우기).
// 운영자(lib/staffRank 규칙: 목록에 없고 본인이 보면 mine = null · staff)·정지 계정은 목록에서 뺀다.
//
// Redis 키 (이 파일에서만 쓴다)
//  - rank:huntLevel       ZSET 계정 id → 레벨 × LEVEL_SCALE + 경험치 (레벨이 같으면 경험치로 줄 세운다)
//  - rank:huntLevel:gear  HASH 계정 id → 장착한 무기 id (랭킹 아이콘용, 없으면 필드 없음)
//  - rank:huntLevel:filled       STRING 기존 캐릭터 채우기 표시 ("done" 또는 이어서 훑을 커서)
//  - rank:huntLevel:filled:lock  STRING 채우기 잠금 (30초)

const ZKEY = "rank:huntLevel";
const GEAR_KEY = "rank:huntLevel:gear";
const FILL_KEY = "rank:huntLevel:filled";
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
type PutRow = Entry & { weapon: string | null };

export interface HuntLevelStore {
  /** score ≤ 0이면 뺀다 */
  put(accountId: string, score: number, weapon: string | null): Promise<void>;
  /** 여러 명을 한 번에 (기존 캐릭터 채우기) */
  putMany(rows: readonly PutRow[]): Promise<void>;
  /** 기존 캐릭터 채우기 표시·잠금 */
  readonly fill: FillMark;
  top(count: number): Promise<Entry[]>;
  countAbove(score: number): Promise<number>;
  /** 이름·무기 (표시용) */
  info(ids: readonly string[], now: number): Promise<Map<string, { name: string | null; weapon: string | null }>>;
  /** 랭킹에 기록된 점수 (ids 순서대로, 없으면 null — 운영자·한 판도 안 한 캐릭터). 관리자 회원 목록의 사냥 레벨용 */
  scoresOf(ids: readonly string[]): Promise<(number | null)[]>;
}

export class MemoryHuntLevel implements HuntLevelStore {
  private scores = new Map<string, number>();
  private gear = new Map<string, string>();
  readonly fill: FillMark = new MemoryFillMark();
  constructor(public accounts: () => AccountStore) {}
  async put(accountId: string, score: number, weapon: string | null): Promise<void> {
    if (score > 0) this.scores.set(accountId, score);
    else this.scores.delete(accountId);
    if (score > 0 && weapon) this.gear.set(accountId, weapon);
    else this.gear.delete(accountId);
  }
  async putMany(rows: readonly PutRow[]): Promise<void> {
    for (const r of rows) await this.put(r.accountId, r.score, r.weapon);
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
  async scoresOf(ids: readonly string[]): Promise<(number | null)[]> {
    return ids.map((id) => this.scores.get(id) ?? null);
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
  readonly fill: FillMark;
  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
    this.fill = new RedisFillMark(this.redis, FILL_KEY);
  }
  async put(accountId: string, score: number, weapon: string | null): Promise<void> {
    await this.putMany([{ accountId, score, weapon }]);
  }
  async putMany(rows: readonly PutRow[]): Promise<void> {
    if (!rows.length) return;
    const p = this.redis.pipeline();
    for (const { accountId, score, weapon } of rows) {
      if (score > 0) p.zadd(ZKEY, { score, member: accountId });
      else p.zrem(ZKEY, accountId);
      if (score > 0 && weapon) p.hset(GEAR_KEY, { [accountId]: weapon });
      else p.hdel(GEAR_KEY, accountId);
    }
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
  async scoresOf(ids: readonly string[]): Promise<(number | null)[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.zscore(ZKEY, id);
    const res = (await p.exec()) as unknown[];
    return res.map((v) => (v === null || v === undefined ? null : Number(v)));
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
  /** 사냥 캐릭터 저장소 (주지 않으면 getRpgStore) */
  rpg?: RpgStore;
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

/**
 * 기존 캐릭터 채우기 한 묶음: 사냥 저장소를 커서부터 count개 훑어 레벨·경험치를 랭킹에 적는다 (운영자·새 캐릭터는 뺀다,
 * 정지 계정은 기록은 두고 읽을 때 뺀다). next "0" = 끝 → 채움 표시를 "done"으로. 관리자 다시 채우기는 "0"부터 끝까지 부른다
 */
export async function fillHuntLevel(cursor: string, count: number, opts: HuntLevelOptions = {}): Promise<{ next: string; filled: number }> {
  const store = opts.store ?? getHuntLevelStore();
  const staffId = opts.staffId === undefined ? await staffAccountId() : opts.staffId;
  const { next, chars } = await (opts.rpg ?? getRpgStore()).scanChars(cursor, count);
  const rows = chars.map(([accountId, c]): PutRow => ({
    accountId,
    score: accountId === staffId || !ranked(c) ? 0 : levelScore(c.level, c.exp),
    weapon: c.equip.weapon ?? null,
  }));
  await store.putMany(rows);
  if (next === "0") await store.fill.set(FILL_DONE);
  return { next, filled: rows.filter((r) => r.score > 0).length };
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
  const rpg = opts.rpg ?? getRpgStore();
  // 기존 캐릭터를 아직 안 채웠으면 한 번 훑는다 (끝나면 다시 안 돈다)
  await autoFill(store.fill, (c) => fillHuntLevel(c, FILL_BATCH, { store, staffId, rpg }), "huntLevel");

  let myScore = 0;
  if (me && !isStaffMe) {
    const c = await rpg.get(me);
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

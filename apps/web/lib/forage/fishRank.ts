import { Redis } from "@upstash/redis";
import { env } from "../env";
import { getAccounts } from "../store";
import { kstDay, WEEK_RANK_TTL_SEC } from "../store/accounts";
import { K } from "../store/keys";

// 최대어 랭킹: 물고기별·전체 가장 큰 크기 기록 (이번 주·전체). 낚시 결과 API(reelIn)에서 서버만 기록한다.
// Redis 정렬 집합 (점수 = 크기 cm×10, 멤버 = 계정 id). 한 사람은 판마다 한 줄 — 더 큰 기록일 때만 바꾼다 (Lua 한 번, 원자적).
// 전체(모든 물고기) 판은 그 기록이 어떤 물고기인지 옆 해시에 함께 둔다.

export type FishRankEntry = { accountId: string; name: string | null; size: number; rank: number; sp?: string };
export type FishBoard = { rows: FishRankEntry[]; mine: FishRankEntry | null };

export interface FishRankStore {
  /** 새 기록이면 그 판들(물고기별·전체 × 주간·전체)을 바꾼다 */
  record(acct: string, sp: string, size: number, week: string): Promise<void>;
  /** sp = 물고기 id, null = 모든 물고기 */
  board(sp: string | null, week: string | null, limit: number, me: string | null): Promise<FishBoard>;
}

const FK = {
  sp: (sp: string) => `rank:fish:sp:${sp}`,
  spWeek: (sp: string, week: string) => `rank:fish:sp:${sp}:w:${week}`,
  all: "rank:fish:all",
  allWeek: (week: string) => `rank:fish:all:w:${week}`,
  /** 전체 판의 기록 물고기 (HASH 계정 → 물고기 id) */
  allSp: "rank:fish:all:sp",
  allWeekSp: (week: string) => `rank:fish:all:w:${week}:sp`,
};

/**
 * KEYS: 물고기별 전체, 물고기별 주간, 전체, 주간, 전체 물고기 해시, 주간 물고기 해시
 * ARGV: 계정, 크기, 물고기 id, 주간 TTL
 */
const RECORD_LUA = `
local size = tonumber(ARGV[2])
for i = 1, 4 do
  local cur = redis.call('ZSCORE', KEYS[i], ARGV[1])
  if not cur or size > tonumber(cur) then
    redis.call('ZADD', KEYS[i], size, ARGV[1])
    if i >= 3 then redis.call('HSET', KEYS[i + 2], ARGV[1], ARGV[3]) end
  end
end
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[4], ARGV[4])
redis.call('EXPIRE', KEYS[6], ARGV[4])
return 1
`;

function boardKeys(sp: string | null, week: string | null): { z: string; h: string | null } {
  if (sp) return { z: week ? FK.spWeek(sp, week) : FK.sp(sp), h: null };
  return { z: week ? FK.allWeek(week) : FK.all, h: week ? FK.allWeekSp(week) : FK.allSp };
}

export class RedisFishRank implements FishRankStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async record(acct: string, sp: string, size: number, week: string): Promise<void> {
    if (!(size > 0)) return;
    await this.redis.eval<string[], number>(
      RECORD_LUA,
      [FK.sp(sp), FK.spWeek(sp, week), FK.all, FK.allWeek(week), FK.allSp, FK.allWeekSp(week)],
      [acct, String(Math.round(size)), sp, String(WEEK_RANK_TTL_SEC)],
    );
  }

  async board(sp: string | null, week: string | null, limit: number, me: string | null): Promise<FishBoard> {
    const { z, h } = boardKeys(sp, week);
    const flat = (await this.redis.zrange<string[]>(z, 0, limit - 1, { rev: true, withScores: true })) ?? [];
    const top: [string, number][] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) top.push([String(flat[i]), Number(flat[i + 1])]);
    const p = this.redis.pipeline();
    // 이름은 계정에서 지금 이름을 읽는다 (닉네임을 바꾸거나 운영자가 바꿔도 바로 맞게)
    for (const [id] of top) {
      p.hget(K.acct(id), "name");
      if (h) p.hget(h, id);
    }
    if (me) {
      p.zrevrank(z, me).zscore(z, me).hget(K.acct(me), "name");
      if (h) p.hget(h, me);
    }
    const r = top.length || me ? await p.exec<(string | number | null)[]>() : [];
    const per = h ? 2 : 1;
    const rows = top.map(([accountId, size], i) => ({
      accountId,
      name: (r[i * per] as string | null) ?? null,
      size,
      rank: i + 1,
      ...(h && r[i * per + 1] ? { sp: String(r[i * per + 1]) } : {}),
    }));
    const [myRank, mySize, myName, mySp] = r.slice(top.length * per);
    const mine =
      me && myRank !== null && myRank !== undefined
        ? { accountId: me, name: (myName as string | null) ?? null, size: Number(mySize), rank: Number(myRank) + 1, ...(h && mySp ? { sp: String(mySp) } : {}) }
        : null;
    return { rows, mine };
  }
}

/** 개발용 (Redis 없을 때). 한 프로세스 안에서 await 없이 바꿔 원자적이다 */
export class MemoryFishRank implements FishRankStore {
  /** 판 키 → 계정 → { 크기, 물고기, 기록 순서 } */
  boards = new Map<string, Map<string, { size: number; sp: string; seq: number }>>();
  private seq = 0;

  async record(acct: string, sp: string, size: number, week: string): Promise<void> {
    if (!(size > 0)) return;
    for (const key of [FK.sp(sp), FK.spWeek(sp, week), FK.all, FK.allWeek(week)]) {
      let b = this.boards.get(key);
      if (!b) this.boards.set(key, (b = new Map()));
      const cur = b.get(acct);
      if (!cur || size > cur.size) b.set(acct, { size, sp, seq: ++this.seq });
    }
  }

  async board(sp: string | null, week: string | null, limit: number, me: string | null, now = Date.now()): Promise<FishBoard> {
    const { z, h } = boardKeys(sp, week);
    const sorted = [...(this.boards.get(z) ?? new Map())].sort((a, b) => b[1].size - a[1].size || a[1].seq - b[1].seq);
    const accounts = getAccounts();
    const nameOf = async (id: string) => (await accounts.get(id, kstDay(now), now)).name;
    const entry = async ([accountId, v]: [string, { size: number; sp: string }], i: number): Promise<FishRankEntry> => ({
      accountId,
      name: await nameOf(accountId),
      size: v.size,
      rank: i + 1,
      ...(h ? { sp: v.sp } : {}),
    });
    const rows = await Promise.all(sorted.slice(0, limit).map(entry));
    const at = me ? sorted.findIndex(([id]) => id === me) : -1;
    return { rows, mine: at >= 0 ? await entry(sorted[at], at) : null };
  }
}

const g = globalThis as typeof globalThis & { __tombFishRank?: FishRankStore };

export function getFishRank(): FishRankStore {
  const cur = g.__tombFishRank;
  const conn = env.redis();
  if (conn) return cur instanceof RedisFishRank ? cur : (g.__tombFishRank = new RedisFishRank(conn));
  if (cur instanceof MemoryFishRank) return cur;
  return (g.__tombFishRank = new MemoryFishRank());
}

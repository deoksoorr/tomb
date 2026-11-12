import { Redis } from "@upstash/redis";
import { BALANCE_CAP } from "../economy";
import type { GiftEntry, GiftItem } from "../types";
import { kstDay } from "./accounts";
import type { MemoryAccounts } from "./accounts-memory";
import { K } from "./keys";
import { ECON_TTL_SEC } from "./types";

// 11번 선물함. 관리자가 포인트·아이템을 쪽지와 함께 보내고, 유저는 선물함에서 읽기·받기·지우기.
//  - 전체 발송은 선물 하나(gifts:all)만 저장한다. 계정마다 복사하지 않고, 받거나 지울 때 그 계정의 상태(gifts:st:{id})만 생긴다
//    → 계정이 아무리 많아도 발송은 쓰기 1번.
//  - 전체 선물은 보낸 시각 이전에 처음 들어온 계정만 받을 수 있다 (새 계정을 만들어 같은 선물을 거듭 받지 못하게)
//  - 받기는 원자적으로 한 번만: 상태 필드가 이미 있으면(받음·지움) 거절한다. 포인트·가방 반영도 같은 연산에서
//  - 받지 않은 선물은 보낸 지 GIFT_KEEP_DAYS일이 지나면 사라진다

export const GIFT_KEEP_DAYS = 30;
export const GIFT_KEEP_MS = GIFT_KEEP_DAYS * 86_400_000;
/** 계정별 상태 보관 (선물 보관 기간보다 하루 길게 → 지운·받은 전체 선물이 다시 살아나지 않는다) */
const STATE_TTL_SEC = (GIFT_KEEP_DAYS + 1) * 86_400;
/** 관리자 발송 기록 보관 개수 */
export const GIFT_LOG_KEEP = 200;

/** 저장 형태. target = "all"(전체) 또는 받는 계정 id */
export type GiftRecord = {
  id: string;
  from: string;
  note: string;
  points: number;
  items: GiftItem[];
  createdAt: number;
  expiresAt: number;
  target: string;
  /** 특정 계정에 보냈으면 그때의 닉네임 (관리자 기록 표시용) */
  targetName: string | null;
};
/** 관리자 발송 기록 한 줄: 받은 계정 수 포함 */
export type GiftLogEntry = GiftRecord & { claims: number };

export type GiftClaimResult = { ok: true; gift: GiftRecord; points: number } | { ok: false; reason: "gone" | "done" };

export interface GiftStore {
  /** 보내기 (전체 또는 한 계정) + 발송 기록 */
  send(gift: GiftRecord): Promise<void>;
  /** 내 선물함: 보관 기간 안의 것 중 지우지 않은 것 (최신 먼저). acctCreatedAt = 계정이 처음 들어온 시각 (0 = 모름 → 전체 선물 없음) */
  inbox(accountId: string, acctCreatedAt: number, now: number): Promise<GiftEntry[]>;
  /** 받기 (한 번만, 포인트·아이템을 계정에 바로 넣는다). 없거나 만료·대상 아님이면 gone, 이미 받았거나 지웠으면 done */
  claim(accountId: string, giftId: string, acctCreatedAt: number, now: number): Promise<GiftClaimResult>;
  /** 지우기 (안 받은 선물이면 버려진다). 내 선물함에 없는 것이면 false */
  remove(accountId: string, giftId: string, acctCreatedAt: number, now: number): Promise<boolean>;
  /** 관리자 발송 기록 (최신 먼저) */
  log(limit: number): Promise<GiftLogEntry[]>;
}

/** 이 계정이 받을 수 있는 선물인지 (보관 기간 안 + 대상) */
export function giftFor(g: GiftRecord, accountId: string, acctCreatedAt: number, now: number): boolean {
  if (g.expiresAt <= now) return false;
  if (g.target === "all") return acctCreatedAt > 0 && acctCreatedAt <= g.createdAt;
  return g.target === accountId;
}

const toEntry = (g: GiftRecord, state: string | undefined): GiftEntry => ({
  id: g.id,
  from: g.from,
  note: g.note,
  points: g.points,
  items: g.items,
  createdAt: g.createdAt,
  expiresAt: g.expiresAt,
  claimedAt: state?.startsWith("c:") ? Number(state.slice(2)) : null,
});
const newestFirst = (a: GiftEntry, b: GiftEntry) => b.createdAt - a.createdAt || a.id.localeCompare(b.id);

// ── 메모리 (로컬) ──

export class MemoryGifts implements GiftStore {
  private all = new Map<string, GiftRecord>();
  private to = new Map<string, Map<string, GiftRecord>>();
  private state = new Map<string, Map<string, string>>();
  private sent: GiftRecord[] = [];
  private claims = new Map<string, number>();

  /** 받기는 계정 저장소(MemoryAccounts.deposit)에 포인트·아이템을 넣는다 (HMR로 바뀌어도 최신 것을 쓰게 함수로 받는다) */
  constructor(private accounts: () => MemoryAccounts) {}

  private find(accountId: string, giftId: string, created: number, now: number): GiftRecord | null {
    const g = this.all.get(giftId) ?? this.to.get(accountId)?.get(giftId);
    return g && giftFor(g, accountId, created, now) ? g : null;
  }

  async send(gift: GiftRecord): Promise<void> {
    if (gift.target === "all") this.all.set(gift.id, gift);
    else {
      let m = this.to.get(gift.target);
      if (!m) this.to.set(gift.target, (m = new Map()));
      m.set(gift.id, gift);
    }
    this.sent = [gift, ...this.sent].slice(0, GIFT_LOG_KEEP);
  }

  async inbox(accountId: string, created: number, now: number): Promise<GiftEntry[]> {
    const st = this.state.get(accountId);
    return [...this.all.values(), ...(this.to.get(accountId)?.values() ?? [])]
      .filter((g) => giftFor(g, accountId, created, now) && st?.get(g.id) !== "d")
      .map((g) => toEntry(g, st?.get(g.id)))
      .sort(newestFirst);
  }

  async claim(accountId: string, giftId: string, created: number, now: number): Promise<GiftClaimResult> {
    const g = this.find(accountId, giftId, created, now);
    if (!g) return { ok: false, reason: "gone" };
    let st = this.state.get(accountId);
    if (!st) this.state.set(accountId, (st = new Map()));
    if (st.has(giftId)) return { ok: false, reason: "done" };
    st.set(giftId, `c:${now}`);
    this.claims.set(giftId, (this.claims.get(giftId) ?? 0) + 1);
    return { ok: true, gift: g, points: this.accounts().deposit(accountId, g.points, g.items, now) };
  }

  async remove(accountId: string, giftId: string, created: number, now: number): Promise<boolean> {
    if (!this.find(accountId, giftId, created, now)) return false;
    let st = this.state.get(accountId);
    if (!st) this.state.set(accountId, (st = new Map()));
    if (st.get(giftId) === "d") return false;
    st.set(giftId, "d");
    return true;
  }

  async log(limit: number): Promise<GiftLogEntry[]> {
    return this.sent.slice(0, limit).map((g) => ({ ...g, claims: this.claims.get(g.id) ?? 0 }));
  }
}

// ── Redis (운영) ──

// 받기: 상태 필드가 없을 때만 "받음"으로 바꾸고 포인트(지갑 상한, 모은 포인트·랭킹·경제 통계 earn:gift)와 아이템을 넣는다.
// MemoryGifts.claim + MemoryAccounts.deposit과 같은 규칙. 이미 받았거나 지웠으면 -1, 아니면 실제로 들어간 포인트
// KEYS: state, acct, inv, rank, econ, claims
// ARGV: giftId, now, points, balanceCap, accountId, stateTtl, 아이템 수 n, (itemId, count) × n
const GIFT_CLAIM_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return -1 end
redis.call('HSET', KEYS[1], ARGV[1], 'c:' .. ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[6])
local got = 0
local pts = tonumber(ARGV[3])
if pts > 0 then
  local before = tonumber(redis.call('HGET', KEYS[2], 'points') or '0')
  local bal = math.min(tonumber(ARGV[4]), before + pts)
  if bal > before then
    got = bal - before
    redis.call('HSET', KEYS[2], 'points', bal)
    redis.call('HSETNX', KEYS[2], 'lifetime', before)
    redis.call('ZADD', KEYS[4], redis.call('HINCRBY', KEYS[2], 'lifetime', got), ARGV[5])
    redis.call('HINCRBY', KEYS[5], 'earn:gift', got)
    redis.call('EXPIRE', KEYS[5], ${ECON_TTL_SEC})
  end
end
local n = tonumber(ARGV[7])
for i = 1, n do
  local c = tonumber(ARGV[7 + i * 2])
  if c and c > 0 then redis.call('HINCRBY', KEYS[3], ARGV[6 + i * 2], c) end
end
redis.call('HINCRBY', KEYS[6], ARGV[1], 1)
return got
`;

// 지우기: 이미 지웠으면 0. 계정 앞으로 온 선물이면 본문도 지운다
// KEYS: state, to  ARGV: giftId, stateTtl
const GIFT_REMOVE_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) == 'd' then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], 'd')
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

function pairs(flat: string[] | null): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; flat && i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

export class RedisGifts implements GiftStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async send(gift: GiftRecord): Promise<void> {
    const json = JSON.stringify(gift);
    const p = this.redis.multi();
    if (gift.target === "all") p.hset(K.giftsAll, { [gift.id]: json });
    else p.hset(K.giftsTo(gift.target), { [gift.id]: json }).expire(K.giftsTo(gift.target), STATE_TTL_SEC);
    await p.lpush(K.giftLog, json).ltrim(K.giftLog, 0, GIFT_LOG_KEEP - 1).exec();
    await this.prune(gift.createdAt);
  }

  /** 보관 기간이 지난 전체 선물을 지운다 (발송·선물함 조회 때 조금씩) */
  private async prune(now: number, all?: [string, string][]): Promise<void> {
    const rows = all ?? pairs((await this.redis.hgetall(K.giftsAll)) as unknown as string[] | null);
    const old = rows.filter(([, v]) => (JSON.parse(v) as GiftRecord).expiresAt <= now).map(([id]) => id);
    if (old.length) await this.redis.hdel(K.giftsAll, ...old);
  }

  private async load(accountId: string): Promise<{ gifts: GiftRecord[]; state: Map<string, string>; all: [string, string][] }> {
    const [all, to, st] = await this.redis
      .pipeline()
      .hgetall(K.giftsAll)
      .hgetall(K.giftsTo(accountId))
      .hgetall(K.giftState(accountId))
      .exec<[string[] | null, string[] | null, string[] | null]>();
    const allRows = pairs(all);
    return {
      gifts: [...allRows, ...pairs(to)].map(([, v]) => JSON.parse(v) as GiftRecord),
      state: new Map(pairs(st)),
      all: allRows,
    };
  }

  async inbox(accountId: string, created: number, now: number): Promise<GiftEntry[]> {
    const { gifts, state, all } = await this.load(accountId);
    if (all.some(([, v]) => (JSON.parse(v) as GiftRecord).expiresAt <= now)) await this.prune(now, all);
    return gifts
      .filter((g) => giftFor(g, accountId, created, now) && state.get(g.id) !== "d")
      .map((g) => toEntry(g, state.get(g.id)))
      .sort(newestFirst);
  }

  private async find(accountId: string, giftId: string, created: number, now: number): Promise<GiftRecord | null> {
    const [all, to] = await this.redis
      .pipeline()
      .hget(K.giftsAll, giftId)
      .hget(K.giftsTo(accountId), giftId)
      .exec<[string | null, string | null]>();
    const raw = all ?? to;
    const g = raw ? (JSON.parse(raw) as GiftRecord) : null;
    return g && giftFor(g, accountId, created, now) ? g : null;
  }

  async claim(accountId: string, giftId: string, created: number, now: number): Promise<GiftClaimResult> {
    // 선물 내용은 보낸 뒤 바뀌지 않으므로 먼저 읽고, 한 번만 받는 판정과 반영은 Lua 한 번에 한다
    const g = await this.find(accountId, giftId, created, now);
    if (!g) return { ok: false, reason: "gone" };
    const r = Number(
      await this.redis.eval<string[], number>(
        GIFT_CLAIM_LUA,
        [K.giftState(accountId), K.acct(accountId), K.inv(accountId), K.rankPoints, K.econ(kstDay(now)), K.giftClaims],
        [
          g.id,
          String(now),
          String(g.points),
          String(BALANCE_CAP),
          accountId,
          String(STATE_TTL_SEC),
          String(g.items.length),
          ...g.items.flatMap((i) => [i.itemId, String(i.count)]),
        ],
      ),
    );
    return r < 0 ? { ok: false, reason: "done" } : { ok: true, gift: g, points: r };
  }

  async remove(accountId: string, giftId: string, created: number, now: number): Promise<boolean> {
    if (!(await this.find(accountId, giftId, created, now))) return false;
    const r = await this.redis.eval<string[], number>(GIFT_REMOVE_LUA, [K.giftState(accountId), K.giftsTo(accountId)], [giftId, String(STATE_TTL_SEC)]);
    return Number(r) === 1;
  }

  async log(limit: number): Promise<GiftLogEntry[]> {
    const rows = (await this.redis.lrange(K.giftLog, 0, limit - 1)).map((raw) => JSON.parse(raw) as GiftRecord);
    if (!rows.length) return [];
    const counts = (await this.redis.hmget(K.giftClaims, ...rows.map((g) => g.id))) as unknown as (string | null)[] | null;
    return rows.map((g, i) => ({ ...g, claims: Number(counts?.[i] ?? 0) }));
  }
}

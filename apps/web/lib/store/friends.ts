import { Redis } from "@upstash/redis";
import { FRIEND_MAX, FRIEND_PENDING_MAX, FRIEND_REQUEST_KEEP_DAYS } from "@tomb/protocol";
import type { MemoryAccounts } from "./accounts-memory";
import { kstDay } from "./accounts";
import { K } from "./keys";

// 친구 (서로 동의해야 맺어진다). 계정 id끼리의 관계만 저장하고 이름·위치·집은 읽을 때 붙인다 (lib/friends.ts).
//  - 친구: 양쪽 계정에 똑같이 적는다 (한쪽만 남는 일이 없게 쓰기는 언제나 한 번에)
//  - 신청: 보낸 사람의 "보낸 신청"과 받는 사람의 "받은 신청"에 함께 적는다. 이미 상대가 나에게 신청해 뒀으면 바로 친구
//  - 답하지 않은 신청은 FRIEND_REQUEST_KEEP_DAYS일 뒤 사라진다 (읽거나 쓸 때 정리)
//  - 상한: 친구 FRIEND_MAX명(양쪽 모두), 보낸·받은 신청 각각 FRIEND_PENDING_MAX개
// 포인트·아이템 보상은 없다 (부계정으로 친구를 늘려 얻을 것이 없게).

export const FRIEND_REQUEST_KEEP_MS = FRIEND_REQUEST_KEEP_DAYS * 86_400_000;
/** 신청 키 보관 (답하지 않은 신청 보관 기간보다 하루 길게) */
const PENDING_TTL_SEC = (FRIEND_REQUEST_KEEP_DAYS + 1) * 86_400;

/** 상대 계정 id + 맺은(신청한) 시각 */
export type FriendLink = { id: string; at: number };
export type FriendLists = { friends: FriendLink[]; incoming: FriendLink[]; outgoing: FriendLink[] };

/**
 * 신청 결과. sent = 보냄, accepted = 상대가 먼저 나에게 신청해 둬서 바로 친구, already = 이미 친구, pending = 이미 보냄,
 * full = 내 친구가 가득, their_full = 상대 친구가 가득, out_full = 내가 보낸 신청이 너무 많음, in_full = 상대가 받은 신청이 너무 많음
 */
export type FriendRequestResult = "sent" | "accepted" | "already" | "pending" | "full" | "their_full" | "out_full" | "in_full";
/** 수락 결과. none = 받은 신청이 없음(취소·만료) */
export type FriendAcceptResult = "ok" | "none" | "full" | "their_full";

export interface FriendStore {
  /** 친구·받은 신청·보낸 신청 (최근 먼저). 만료된 신청은 빼고 정리한다 */
  lists(id: string, now: number): Promise<FriendLists>;
  request(from: string, to: string, now: number): Promise<FriendRequestResult>;
  /** me가 from의 신청을 받아들인다 */
  accept(me: string, from: string, now: number): Promise<FriendAcceptResult>;
  /** 받은 신청 거절 (상대의 보낸 신청에서도 지운다). 없으면 false */
  reject(me: string, from: string): Promise<boolean>;
  /** 보낸 신청 취소. 없으면 false */
  cancel(me: string, to: string): Promise<boolean>;
  /** 친구 끊기 (양쪽에서). 친구가 아니었으면 false */
  remove(me: string, other: string): Promise<boolean>;
  isFriend(a: string, b: string): Promise<boolean>;
  /** 계정 닉네임 여러 개를 한 번에 (없으면 null). 친구 목록 표시용 — 계정 전체를 읽지 않는다 */
  names(ids: string[]): Promise<(string | null)[]>;
  /** 마지막 접속(= 마지막 머무르기 기록 시각, 게임 중 10분마다 남는다). 없으면 0 */
  seenAt(ids: string[]): Promise<number[]>;
}

const newestFirst = (a: FriendLink, b: FriendLink) => b.at - a.at || a.id.localeCompare(b.id);

// ── 메모리 (로컬·테스트) ──

type Z = Map<string, number>;

export class MemoryFriends implements FriendStore {
  private friends = new Map<string, Z>();
  private incoming = new Map<string, Z>();
  private outgoing = new Map<string, Z>();

  /** 닉네임은 계정 저장소에서 읽는다 (HMR로 바뀌어도 최신 것을 쓰게 함수로 받는다) */
  constructor(private accounts: () => MemoryAccounts) {}

  private z(m: Map<string, Z>, id: string): Z {
    let z = m.get(id);
    if (!z) m.set(id, (z = new Map()));
    return z;
  }

  /** 만료된 신청을 지운다 (한쪽만 남지 않게 짝도 함께) */
  private prune(id: string, now: number): void {
    const cutoff = now - FRIEND_REQUEST_KEEP_MS;
    for (const [other, at] of this.z(this.incoming, id))
      if (at < cutoff) {
        this.z(this.incoming, id).delete(other);
        this.z(this.outgoing, other).delete(id);
      }
    for (const [other, at] of this.z(this.outgoing, id))
      if (at < cutoff) {
        this.z(this.outgoing, id).delete(other);
        this.z(this.incoming, other).delete(id);
      }
  }

  private link(a: string, b: string, now: number): void {
    this.z(this.friends, a).set(b, now);
    this.z(this.friends, b).set(a, now);
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      this.z(this.incoming, x).delete(y);
      this.z(this.outgoing, x).delete(y);
    }
  }

  async lists(id: string, now: number): Promise<FriendLists> {
    this.prune(id, now);
    const out = (m: Map<string, Z>) => [...this.z(m, id)].map(([other, at]) => ({ id: other, at })).sort(newestFirst);
    return { friends: out(this.friends), incoming: out(this.incoming), outgoing: out(this.outgoing) };
  }

  async request(from: string, to: string, now: number): Promise<FriendRequestResult> {
    this.prune(from, now);
    this.prune(to, now);
    const myF = this.z(this.friends, from);
    const theirF = this.z(this.friends, to);
    if (myF.has(to)) return "already";
    if (this.z(this.incoming, from).has(to)) {
      if (myF.size >= FRIEND_MAX) return "full";
      if (theirF.size >= FRIEND_MAX) return "their_full";
      this.link(from, to, now);
      return "accepted";
    }
    if (this.z(this.outgoing, from).has(to)) return "pending";
    if (myF.size >= FRIEND_MAX) return "full";
    if (theirF.size >= FRIEND_MAX) return "their_full";
    if (this.z(this.outgoing, from).size >= FRIEND_PENDING_MAX) return "out_full";
    if (this.z(this.incoming, to).size >= FRIEND_PENDING_MAX) return "in_full";
    this.z(this.outgoing, from).set(to, now);
    this.z(this.incoming, to).set(from, now);
    return "sent";
  }

  async accept(me: string, from: string, now: number): Promise<FriendAcceptResult> {
    this.prune(me, now);
    if (!this.z(this.incoming, me).has(from)) return "none";
    if (this.z(this.friends, me).size >= FRIEND_MAX) return "full";
    if (this.z(this.friends, from).size >= FRIEND_MAX) return "their_full";
    this.link(me, from, now);
    return "ok";
  }

  async reject(me: string, from: string): Promise<boolean> {
    this.z(this.outgoing, from).delete(me);
    return this.z(this.incoming, me).delete(from);
  }

  async cancel(me: string, to: string): Promise<boolean> {
    this.z(this.incoming, to).delete(me);
    return this.z(this.outgoing, me).delete(to);
  }

  async remove(me: string, other: string): Promise<boolean> {
    this.z(this.friends, other).delete(me);
    return this.z(this.friends, me).delete(other);
  }

  async isFriend(a: string, b: string): Promise<boolean> {
    return this.z(this.friends, a).has(b);
  }

  async names(ids: string[]): Promise<(string | null)[]> {
    const now = Date.now();
    return Promise.all(ids.map(async (id) => (await this.accounts().get(id, kstDay(now), now)).name));
  }

  async seenAt(ids: string[]): Promise<number[]> {
    // 개발 중 HMR로 옛 계정 저장소 인스턴스가 남아 있으면 그 메서드가 없을 수 있다 → 기록 없음
    const acc = this.accounts() as Partial<Pick<MemoryAccounts, "lastPresence">>;
    return ids.map((id) => acc.lastPresence?.(id) ?? 0);
  }
}

// ── Redis (운영) ──

// 만료된 신청 정리 (쓰는 키들만). 상대 쪽 짝은 상대가 읽거나 쓸 때 정리된다 (만료 판정이 같아 결과는 같다)
const PRUNE_LUA = `
local function prune(cutoff, ...)
  for _, k in ipairs({...}) do redis.call('ZREMRANGEBYSCORE', k, '-inf', '(' .. cutoff) end
end
`;

// 신청. KEYS: 내 친구, 상대 친구, 내 보낸, 상대 받은, 내 받은, 상대 보낸
// ARGV: 나, 상대, now, 친구 상한, 신청 상한, 만료 기준(now - 보관), 신청 키 TTL
const REQUEST_LUA = `${PRUNE_LUA}
local me, them, now = ARGV[1], ARGV[2], ARGV[3]
local max, pmax = tonumber(ARGV[4]), tonumber(ARGV[5])
prune(ARGV[6], KEYS[3], KEYS[4], KEYS[5], KEYS[6])
if redis.call('ZSCORE', KEYS[1], them) then return 'already' end
if redis.call('ZSCORE', KEYS[5], them) then
  if redis.call('ZCARD', KEYS[1]) >= max then return 'full' end
  if redis.call('ZCARD', KEYS[2]) >= max then return 'their_full' end
  redis.call('ZADD', KEYS[1], now, them)
  redis.call('ZADD', KEYS[2], now, me)
  redis.call('ZREM', KEYS[5], them)
  redis.call('ZREM', KEYS[6], me)
  redis.call('ZREM', KEYS[3], them)
  redis.call('ZREM', KEYS[4], me)
  return 'accepted'
end
if redis.call('ZSCORE', KEYS[3], them) then return 'pending' end
if redis.call('ZCARD', KEYS[1]) >= max then return 'full' end
if redis.call('ZCARD', KEYS[2]) >= max then return 'their_full' end
if redis.call('ZCARD', KEYS[3]) >= pmax then return 'out_full' end
if redis.call('ZCARD', KEYS[4]) >= pmax then return 'in_full' end
redis.call('ZADD', KEYS[3], now, them)
redis.call('EXPIRE', KEYS[3], ARGV[7])
redis.call('ZADD', KEYS[4], now, me)
redis.call('EXPIRE', KEYS[4], ARGV[7])
return 'sent'
`;

// 수락. KEYS: 내 친구, 상대 친구, 내 받은, 상대 보낸, 내 보낸, 상대 받은
// ARGV: 나, 상대, now, 친구 상한, 만료 기준
const ACCEPT_LUA = `${PRUNE_LUA}
local me, them, now = ARGV[1], ARGV[2], ARGV[3]
local max = tonumber(ARGV[4])
prune(ARGV[5], KEYS[3], KEYS[4])
if not redis.call('ZSCORE', KEYS[3], them) then return 'none' end
if redis.call('ZCARD', KEYS[1]) >= max then return 'full' end
if redis.call('ZCARD', KEYS[2]) >= max then return 'their_full' end
redis.call('ZADD', KEYS[1], now, them)
redis.call('ZADD', KEYS[2], now, me)
redis.call('ZREM', KEYS[3], them)
redis.call('ZREM', KEYS[4], me)
redis.call('ZREM', KEYS[5], them)
redis.call('ZREM', KEYS[6], me)
return 'ok'
`;

function links(flat: string[] | null): FriendLink[] {
  const out: FriendLink[] = [];
  for (let i = 0; flat && i + 1 < flat.length; i += 2) out.push({ id: flat[i], at: Number(flat[i + 1]) });
  return out.sort(newestFirst);
}

export class RedisFriends implements FriendStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async lists(id: string, now: number): Promise<FriendLists> {
    // 오래된 신청은 지우지 않고 읽을 때 거른다 (읽기마다 쓰기 2개를 아낀다. 지우기는 신청·수락 Lua와 키 만료가 한다)
    const cutoff = `(${now - FRIEND_REQUEST_KEEP_MS}` as const;
    const [f, i, o] = await this.redis
      .pipeline()
      .zrange(K.friends(id), 0, -1, { withScores: true })
      .zrange(K.friendsIn(id), cutoff, "+inf", { byScore: true, withScores: true })
      .zrange(K.friendsOut(id), cutoff, "+inf", { byScore: true, withScores: true })
      .exec<[string[] | null, string[] | null, string[] | null]>();
    return { friends: links(f), incoming: links(i), outgoing: links(o) };
  }

  async request(from: string, to: string, now: number): Promise<FriendRequestResult> {
    const r = await this.redis.eval<string[], string>(
      REQUEST_LUA,
      [K.friends(from), K.friends(to), K.friendsOut(from), K.friendsIn(to), K.friendsIn(from), K.friendsOut(to)],
      [from, to, String(now), String(FRIEND_MAX), String(FRIEND_PENDING_MAX), String(now - FRIEND_REQUEST_KEEP_MS), String(PENDING_TTL_SEC)],
    );
    return String(r) as FriendRequestResult;
  }

  async accept(me: string, from: string, now: number): Promise<FriendAcceptResult> {
    const r = await this.redis.eval<string[], string>(
      ACCEPT_LUA,
      [K.friends(me), K.friends(from), K.friendsIn(me), K.friendsOut(from), K.friendsOut(me), K.friendsIn(from)],
      [me, from, String(now), String(FRIEND_MAX), String(now - FRIEND_REQUEST_KEEP_MS)],
    );
    return String(r) as FriendAcceptResult;
  }

  async reject(me: string, from: string): Promise<boolean> {
    const [n] = await this.redis.multi().zrem(K.friendsIn(me), from).zrem(K.friendsOut(from), me).exec<[number, number]>();
    return Number(n) > 0;
  }

  async cancel(me: string, to: string): Promise<boolean> {
    const [n] = await this.redis.multi().zrem(K.friendsOut(me), to).zrem(K.friendsIn(to), me).exec<[number, number]>();
    return Number(n) > 0;
  }

  async remove(me: string, other: string): Promise<boolean> {
    const [n] = await this.redis.multi().zrem(K.friends(me), other).zrem(K.friends(other), me).exec<[number, number]>();
    return Number(n) > 0;
  }

  async isFriend(a: string, b: string): Promise<boolean> {
    return (await this.redis.zscore(K.friends(a), b)) !== null;
  }

  async names(ids: string[]): Promise<(string | null)[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.hget(K.acct(id), "name");
    return (await p.exec<(string | null)[]>()).map((v) => (v === null || v === undefined ? null : String(v)));
  }

  async seenAt(ids: string[]): Promise<number[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.hget(K.acct(id), "presenceAt");
    return (await p.exec<(string | null)[]>()).map((v) => Number(v ?? 0) || 0);
  }
}

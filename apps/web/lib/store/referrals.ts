import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import type { SameLevel } from "../sameUserRules";
import { isRefMode, type RefMode } from "../referralRules";
import { K } from "./keys";

// 추천 코드 저장소 (규칙은 lib/referralRules.ts, 판정·보상은 lib/referralService.ts). 키는 keys.ts의 ref:* 묶음.
// 코드 만들기·추천인 정하기·조건 달성은 모두 한 번에 (Redis는 Lua 한 번) → 동시에 불러도 두 번 되지 않는다

/** 추천 기록 하나 (데려온 이웃마다) */
export type ReferralRecord = {
  refereeId: string;
  referrerId: string;
  at: number;
  via: "signup" | "later";
  /** 새 이웃이 정할 때의 IP 해시 (lib/ban.ts banIpHash, 원본 IP 아님). 모르면 null */
  ip: string | null;
  /** 같은 사람 같음 (lib/sameUserRules) → 자동 보상·칭호 수 없음 */
  same: boolean;
  /** 같은 사람 판정 이유 코드 (lib/sameUserRules) */
  reasons: string[];
  /** 보상 보류: 0 없음, 1 확인 기다림, 2 관리자 승인(보상 보냄), 3 관리자 거절 */
  hold: 0 | 1 | 2 | 3;
  /** 조건 달성 시각 (0 = 아직) */
  qualifiedAt: number;
  referrerPaid: boolean;
  refereePaid: boolean;
  /** 추천인의 추천인 (2단계, 추천인을 정할 때 정해진다. 없으면 null) */
  grandId: string | null;
  /** 2단계 보상: "" 아직·없음, paid 보냄, cap 그달 상한, skip:이유 건너뜀 (lib/referralRules GRAND_SKIP_TEXT) */
  grand: string;
};

/** gJoined·gPaid = 2단계 (친구가 데려온 이웃 수 · 그 보상을 받은 수) */
export type ReferrerStats = { joined: number; qualified: number; credited: number; paid: number; month: number; gJoined: number; gPaid: number };
export type ReferralTotals = {
  entered: number;
  qualified: number;
  paidReferrer: number;
  paidReferee: number;
  paidGrand: number;
  same: number;
  held: number;
  denied: number;
};
/** 2단계 보상 판정 (보상을 보낼 때 같이 쓴다): skip = 건너뛸 이유("" = 보낸다), cap = 추천인의 추천인 한 달 상한 */
export type GrandOpts = { skip: string; cap: number };
/** 조건 달성 결과 (이미 됐거나 기록이 없으면 null). held = 확인 필요라 보상을 보류했다 */
export type QualifyResult = { referrerId: string; refereePaid: boolean; referrerPaid: boolean; grandPaid: boolean; credited: number; same: boolean; held: boolean };
/** 관리자 승인·거절 결과 (보류 중이 아니면 null) */
export type DecideResult = { referrerId: string; approved: boolean; refereePaid: boolean; referrerPaid: boolean; grandPaid: boolean; credited: number };
export type LinkInput = Pick<ReferralRecord, "refereeId" | "referrerId" | "at" | "via" | "ip" | "same" | "reasons">;

/** 한 달 보상 표 보관 (달이 바뀐 뒤에도 관리자가 지난달을 잠깐 볼 수 있게) */
export const REF_MONTH_TTL_SEC = 70 * 86_400;

export interface ReferralStore {
  codeOf(accountId: string): Promise<string | null>;
  /** 이 계정 코드가 있으면 그것, 없으면 candidate로 정한다. candidate가 이미 다른 계정 것이면 null (다른 후보로 다시) */
  ensureCode(accountId: string, candidate: string): Promise<string | null>;
  ownerOf(code: string): Promise<string | null>;
  get(refereeId: string): Promise<ReferralRecord | null>;
  getMany(refereeIds: readonly string[]): Promise<(ReferralRecord | null)[]>;
  /** 추천인 정하기: 이미 정했으면 already, 추천인이 나를 추천인으로 정해 둔 사이면 cycle */
  link(rec: LinkInput): Promise<"ok" | "already" | "cycle">;
  /**
   * 조건 달성 (한 번만). level = 지금 다시 본 같은 사람 단계, reasons = 그 이유 (기록에 덮어쓴다). 보상 방식(mode)은 저장소 안에서 같이 읽는다:
   *  - review(모두 확인): 단계와 상관없이 보류(hold 1) → 관리자 승인 때 칭호 수 +1·보상
   *  - auto: clear면 칭호 수 +1·보상, review면 보류, same이면 둘 다 없음
   *  - off: 기록만 (clear면 칭호 수만 +1)
   */
  qualify(refereeId: string, now: number, month: string, level: SameLevel, reasons: readonly string[], cap: number, grand: GrandOpts): Promise<QualifyResult | null>;
  /** 보류한 보상 승인(칭호 수 +1·보상, 추천인·추천인의 추천인 보상은 각자 그달 상한 안에서) 또는 거절. 보류 중이 아니면 null */
  decide(refereeId: string, approve: boolean, month: string, cap: number, grand: GrandOpts): Promise<DecideResult | null>;
  /** 판정 이유만 바꾼다 (무리 신호를 다른 이웃 기록에도 남길 때). 기록이 없으면 아무것도 안 한다 */
  setReasons(refereeId: string, reasons: readonly string[]): Promise<void>;
  stats(referrerId: string, month: string): Promise<ReferrerStats>;
  /** 데려온 이웃 (최근 먼저) */
  refereesOf(referrerId: string, limit: number): Promise<string[]>;
  /** 관리자 최근 목록 (최근 먼저) */
  recent(limit: number): Promise<string[]>;
  /** 가입 수 많은 추천인 */
  topReferrers(limit: number): Promise<string[]>;
  statsMany(ids: readonly string[], month: string): Promise<ReferrerStats[]>;
  totals(): Promise<ReferralTotals>;
  mode(): Promise<RefMode>;
  setMode(mode: RefMode): Promise<void>;
  /** 확인 기다리는 새 이웃 (조건 달성이 오래된 것 먼저) */
  heldList(limit: number): Promise<string[]>;
  /** 칭호에 세는 수 (조건 달성 중 같은 곳 가입이 아닌 것) */
  credited(accountId: string): Promise<number>;
}

// ── 메모리 (로컬·테스트) ──

export class MemoryReferrals implements ReferralStore {
  private codes = new Map<string, string>();
  private mine = new Map<string, string>();
  private recs = new Map<string, ReferralRecord>();
  private joined = new Map<string, number>();
  private qual = new Map<string, number>();
  private credit = new Map<string, number>();
  private paid = new Map<string, number>();
  private months = new Map<string, Map<string, number>>();
  private gJoined = new Map<string, number>();
  private gPaid = new Map<string, number>();
  private gMonths = new Map<string, Map<string, number>>();
  private sums: ReferralTotals = { entered: 0, qualified: 0, paidReferrer: 0, paidReferee: 0, paidGrand: 0, same: 0, held: 0, denied: 0 };
  private modeNow: RefMode = "review";

  private bump(m: Map<string, number>, id: string, by = 1): number {
    const v = (m.get(id) ?? 0) + by;
    m.set(id, v);
    return v;
  }
  private byRecent(filter: (r: ReferralRecord) => boolean, limit: number): string[] {
    return [...this.recs.values()]
      .filter(filter)
      .sort((a, b) => b.at - a.at || b.refereeId.localeCompare(a.refereeId))
      .slice(0, limit)
      .map((r) => r.refereeId);
  }

  async codeOf(accountId: string) {
    return this.mine.get(accountId) ?? null;
  }
  async ensureCode(accountId: string, candidate: string) {
    const had = this.mine.get(accountId);
    if (had) return had;
    if (this.codes.has(candidate)) return null;
    this.codes.set(candidate, accountId);
    this.mine.set(accountId, candidate);
    return candidate;
  }
  async ownerOf(code: string) {
    return this.codes.get(code) ?? null;
  }
  async get(refereeId: string) {
    const r = this.recs.get(refereeId);
    return r ? { ...r, reasons: [...r.reasons] } : null;
  }
  async getMany(ids: readonly string[]) {
    return Promise.all(ids.map((id) => this.get(id)));
  }
  async link(rec: LinkInput) {
    if (this.recs.has(rec.refereeId)) return "already" as const;
    if (this.recs.get(rec.referrerId)?.referrerId === rec.refereeId) return "cycle" as const;
    // 2단계는 추천인의 추천인 하나만 (그 위로는 보지 않는다)
    const grandId = this.recs.get(rec.referrerId)?.referrerId ?? null;
    this.recs.set(rec.refereeId, { ...rec, reasons: [...rec.reasons], qualifiedAt: 0, referrerPaid: false, refereePaid: false, hold: 0, grandId, grand: "" });
    this.bump(this.joined, rec.referrerId);
    if (grandId) this.bump(this.gJoined, grandId);
    this.sums.entered++;
    if (rec.same) this.sums.same++;
    return "ok" as const;
  }
  /** 2단계: 추천인의 추천인이 있으면 건너뛸 이유가 없고 그달 상한 안일 때 보상 */
  private payGrand(r: ReferralRecord, month: string, g: GrandOpts): boolean {
    if (!r.grandId) return false;
    if (g.skip) {
      r.grand = `skip:${g.skip}`;
      return false;
    }
    let m = this.gMonths.get(month);
    if (!m) this.gMonths.set(month, (m = new Map()));
    if ((m.get(r.grandId) ?? 0) >= g.cap) {
      r.grand = "cap";
      return false;
    }
    this.bump(m, r.grandId);
    this.bump(this.gPaid, r.grandId);
    this.sums.paidGrand++;
    r.grand = "paid";
    return true;
  }
  /** 새 이웃 보상 + 그달 상한 안이면 추천인 보상 */
  private pay(r: ReferralRecord, month: string, cap: number) {
    r.refereePaid = true;
    this.sums.paidReferee++;
    let m = this.months.get(month);
    if (!m) this.months.set(month, (m = new Map()));
    if ((m.get(r.referrerId) ?? 0) < cap) {
      this.bump(m, r.referrerId);
      this.bump(this.paid, r.referrerId);
      r.referrerPaid = true;
      this.sums.paidReferrer++;
    }
  }
  async qualify(refereeId: string, now: number, month: string, level: SameLevel, reasons: readonly string[], cap: number, grand: GrandOpts): Promise<QualifyResult | null> {
    const r = this.recs.get(refereeId);
    if (!r || r.qualifiedAt > 0) return null;
    r.reasons = [...reasons];
    if (level === "same" && !r.same) {
      r.same = true;
      this.sums.same++;
    }
    r.qualifiedAt = now;
    this.bump(this.qual, r.referrerId);
    this.sums.qualified++;
    let credited = this.credit.get(r.referrerId) ?? 0;
    let grandPaid = false;
    if (this.modeNow === "review" || (this.modeNow === "auto" && level === "review")) {
      r.hold = 1;
      this.sums.held++;
    } else if (level === "clear") {
      credited = this.bump(this.credit, r.referrerId);
      if (this.modeNow === "auto") {
        this.pay(r, month, cap);
        grandPaid = this.payGrand(r, month, grand);
      }
    }
    return { referrerId: r.referrerId, refereePaid: r.refereePaid, referrerPaid: r.referrerPaid, grandPaid, credited, same: r.same, held: r.hold === 1 };
  }
  async decide(refereeId: string, approve: boolean, month: string, cap: number, grand: GrandOpts): Promise<DecideResult | null> {
    const r = this.recs.get(refereeId);
    if (!r || r.hold !== 1) return null;
    this.sums.held--;
    if (!approve) {
      r.hold = 3;
      this.sums.denied++;
      return { referrerId: r.referrerId, approved: false, refereePaid: false, referrerPaid: false, grandPaid: false, credited: this.credit.get(r.referrerId) ?? 0 };
    }
    r.hold = 2;
    const credited = this.bump(this.credit, r.referrerId);
    this.pay(r, month, cap);
    const grandPaid = this.payGrand(r, month, grand);
    return { referrerId: r.referrerId, approved: true, refereePaid: r.refereePaid, referrerPaid: r.referrerPaid, grandPaid, credited };
  }
  async setReasons(refereeId: string, reasons: readonly string[]) {
    const r = this.recs.get(refereeId);
    if (r) r.reasons = [...reasons];
  }
  async stats(referrerId: string, month: string) {
    return (await this.statsMany([referrerId], month))[0];
  }
  async refereesOf(referrerId: string, limit: number) {
    return this.byRecent((r) => r.referrerId === referrerId, limit);
  }
  async recent(limit: number) {
    return this.byRecent(() => true, limit);
  }
  async topReferrers(limit: number) {
    return [...this.joined]
      .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
      .slice(0, limit)
      .map(([id]) => id);
  }
  async statsMany(ids: readonly string[], month: string) {
    const m = this.months.get(month);
    return ids.map((id) => ({
      joined: this.joined.get(id) ?? 0,
      qualified: this.qual.get(id) ?? 0,
      credited: this.credit.get(id) ?? 0,
      paid: this.paid.get(id) ?? 0,
      month: m?.get(id) ?? 0,
      gJoined: this.gJoined.get(id) ?? 0,
      gPaid: this.gPaid.get(id) ?? 0,
    }));
  }
  async totals() {
    return { ...this.sums };
  }
  async mode() {
    return this.modeNow;
  }
  async setMode(mode: RefMode) {
    this.modeNow = mode;
  }
  async heldList(limit: number) {
    return [...this.recs.values()]
      .filter((r) => r.hold === 1)
      .sort((a, b) => a.qualifiedAt - b.qualifiedAt || a.refereeId.localeCompare(b.refereeId))
      .slice(0, limit)
      .map((r) => r.refereeId);
  }
  async credited(accountId: string) {
    return this.credit.get(accountId) ?? 0;
  }
}

// ── Redis ──

// 코드 정하기. KEYS: refMine, refCode  ARGV: 계정, 후보 → 정해진 코드 | ""(후보가 이미 다른 계정 것)
const ENSURE_LUA = `
local c = redis.call('HGET', KEYS[1], ARGV[1])
if c then return c end
if redis.call('HSETNX', KEYS[2], ARGV[2], ARGV[1]) == 0 then return '' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return ARGV[2]
`;

// 추천인 정하기. KEYS: rec(새 이웃), rec(추천인), refJoined, refRecent, refOf(추천인), refStats, refGJoined
// (추천인의 추천인 = rec(추천인).by를 gb로 남긴다 — 2단계까지만)
// ARGV: 새 이웃, 추천인, at, via, ip, same(1/0), 이유(쉼표로)
const LINK_LUA = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 'already' end
if redis.call('HGET', KEYS[2], 'by') == ARGV[1] then return 'cycle' end
redis.call('HSET', KEYS[1], 'by', ARGV[2], 'at', ARGV[3], 'via', ARGV[4], 'ip', ARGV[5], 'same', ARGV[6], 'rs', ARGV[7], 'q', '0', 'rr', '0', 'er', '0', 'hold', '0')
local gb = redis.call('HGET', KEYS[2], 'by')
if gb then
  redis.call('HSET', KEYS[1], 'gb', gb)
  redis.call('ZINCRBY', KEYS[7], 1, gb)
end
redis.call('ZINCRBY', KEYS[3], 1, ARGV[2])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[1])
redis.call('ZADD', KEYS[5], ARGV[3], ARGV[1])
redis.call('HINCRBY', KEYS[6], 'entered', 1)
if ARGV[6] == '1' then redis.call('HINCRBY', KEYS[6], 'same', 1) end
return 'ok'
`;

// 새 이웃 보상 + 그달 상한 안이면 추천인 보상 (조건 달성·승인 Lua가 같이 쓴다). KEYS[1] rec, KEYS[5] refPaid, KEYS[6] refMonth, KEYS[7] refStats
const PAY_LUA = `
local function pay(by, cap, ttl)
  redis.call('HSET', KEYS[1], 'er', '1')
  redis.call('HINCRBY', KEYS[7], 'paidReferee', 1)
  if (tonumber(redis.call('HGET', KEYS[6], by) or '0') or 0) < tonumber(cap) then
    redis.call('HINCRBY', KEYS[6], by, 1)
    redis.call('EXPIRE', KEYS[6], ttl)
    redis.call('HSET', KEYS[1], 'rr', '1')
    redis.call('ZINCRBY', KEYS[5], 1, by)
    redis.call('HINCRBY', KEYS[7], 'paidReferrer', 1)
    return 1
  end
  return 0
end
-- 2단계 (KEYS[9] refGMonth, KEYS[10] refGPaid): 추천인의 추천인이 있고 건너뛸 이유가 없으면 그달 상한 안에서
local function payGrand(skip, gcap, ttl)
  local gb = redis.call('HGET', KEYS[1], 'gb')
  if not gb or gb == '' then return 0 end
  if skip ~= '' then
    redis.call('HSET', KEYS[1], 'gr', 'skip:' .. skip)
    return 0
  end
  if (tonumber(redis.call('HGET', KEYS[9], gb) or '0') or 0) >= tonumber(gcap) then
    redis.call('HSET', KEYS[1], 'gr', 'cap')
    return 0
  end
  redis.call('HINCRBY', KEYS[9], gb, 1)
  redis.call('EXPIRE', KEYS[9], ttl)
  redis.call('ZINCRBY', KEYS[10], 1, gb)
  redis.call('HINCRBY', KEYS[7], 'paidGrand', 1)
  redis.call('HSET', KEYS[1], 'gr', 'paid')
  return 1
end
`;

// 조건 달성 (한 번만). KEYS: rec, refCfg, refQual, refCredit, refPaid, refMonth(달), refStats, refHeld, refGMonth(달), refGPaid
// ARGV: now, 단계(clear|review|same — 지금 다시 본 값), 한 달 상한, 달 표 TTL, 이유(쉼표로), 새 이웃, 2단계 건너뛸 이유, 2단계 한 달 상한
// → {0} 이미 됐거나 기록 없음 | {1, 추천인, 새 이웃 보상, 추천인 보상, 칭호 수, 같은 사람, 보류}
const QUALIFY_LUA = `${PAY_LUA}
local by = redis.call('HGET', KEYS[1], 'by')
if not by then return {0} end
if (tonumber(redis.call('HGET', KEYS[1], 'q') or '0') or 0) > 0 then return {0} end
redis.call('HSET', KEYS[1], 'rs', ARGV[5], 'q', ARGV[1])
local same = redis.call('HGET', KEYS[1], 'same') == '1'
if ARGV[2] == 'same' and not same then
  same = true
  redis.call('HSET', KEYS[1], 'same', '1')
  redis.call('HINCRBY', KEYS[7], 'same', 1)
end
redis.call('ZINCRBY', KEYS[3], 1, by)
redis.call('HINCRBY', KEYS[7], 'qualified', 1)
local credited = tonumber(redis.call('ZSCORE', KEYS[4], by) or '0') or 0
local mode = redis.call('HGET', KEYS[2], 'mode')
if not mode then mode = (redis.call('HGET', KEYS[2], 'auto') == '0') and 'off' or 'review' end
local er, rr, gg, held = 0, 0, 0, 0
if mode == 'review' or (mode == 'auto' and ARGV[2] == 'review') then
  held = 1
  redis.call('HSET', KEYS[1], 'hold', '1')
  redis.call('HINCRBY', KEYS[7], 'held', 1)
  redis.call('ZADD', KEYS[8], ARGV[1], ARGV[6])
elseif ARGV[2] == 'clear' then
  credited = tonumber(redis.call('ZINCRBY', KEYS[4], 1, by))
  if mode == 'auto' then
    er = 1
    rr = pay(by, ARGV[3], ARGV[4])
    gg = payGrand(ARGV[7], ARGV[8], ARGV[4])
  end
end
return {1, by, er, rr, credited, same and 1 or 0, held, gg}
`;

// 보류한 보상 승인·거절. KEYS: 조건 달성과 같은 자리 (refCfg·refQual은 안 쓴다 — PAY_LUA가 자리 번호로 키를 찾는다)
// ARGV: 승인(1/0), 한 달 상한, 달 표 TTL, 새 이웃, 2단계 건너뛸 이유, 2단계 한 달 상한
// → {0} 보류 중 아님 | {1, 추천인, 승인, 새 이웃 보상, 추천인 보상, 칭호 수, 2단계 보상}
const DECIDE_LUA = `${PAY_LUA}
local by = redis.call('HGET', KEYS[1], 'by')
if not by or redis.call('HGET', KEYS[1], 'hold') ~= '1' then return {0} end
redis.call('HINCRBY', KEYS[7], 'held', -1)
redis.call('ZREM', KEYS[8], ARGV[4])
if ARGV[1] ~= '1' then
  redis.call('HSET', KEYS[1], 'hold', '3')
  redis.call('HINCRBY', KEYS[7], 'denied', 1)
  return {1, by, 0, 0, 0, tonumber(redis.call('ZSCORE', KEYS[4], by) or '0') or 0, 0}
end
redis.call('HSET', KEYS[1], 'hold', '2')
local credited = tonumber(redis.call('ZINCRBY', KEYS[4], 1, by))
local rr = pay(by, ARGV[2], ARGV[3])
local gg = payGrand(ARGV[5], ARGV[6], ARGV[3])
return {1, by, 1, 1, rr, credited, gg}
`;

/** HGETALL 결과 (배열·객체 둘 다) → 객체 */
function hash(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    const o: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) o[String(raw[i])] = String(raw[i + 1]);
    return o;
  }
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
}

function toRecord(refereeId: string, raw: unknown): ReferralRecord | null {
  const h = hash(raw);
  if (!h.by) return null;
  return {
    refereeId,
    referrerId: h.by,
    at: Number(h.at) || 0,
    via: h.via === "later" ? "later" : "signup",
    ip: h.ip || null,
    same: h.same === "1",
    reasons: h.rs ? h.rs.split(",").filter(Boolean) : [],
    hold: (Number(h.hold) || 0) as ReferralRecord["hold"],
    grandId: h.gb || null,
    grand: h.gr ?? "",
    qualifiedAt: Number(h.q) || 0,
    referrerPaid: h.rr === "1",
    refereePaid: h.er === "1",
  };
}

const num = (v: unknown) => Math.floor(Number(v) || 0);

export class RedisReferrals implements ReferralStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "referrals");
  }

  async codeOf(accountId: string) {
    const v = await this.redis.hget<string>(K.refMine, accountId);
    return v ? String(v) : null;
  }
  async ensureCode(accountId: string, candidate: string) {
    const v = await this.redis.eval<string[], string>(ENSURE_LUA, [K.refMine, K.refCode], [accountId, candidate]);
    return v ? String(v) : null;
  }
  async ownerOf(code: string) {
    const v = await this.redis.hget<string>(K.refCode, code);
    return v ? String(v) : null;
  }
  async get(refereeId: string) {
    return toRecord(refereeId, await this.redis.hgetall(K.refRec(refereeId)));
  }
  async getMany(ids: readonly string[]) {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.hgetall(K.refRec(id));
    const r = await p.exec<unknown[]>();
    return ids.map((id, i) => toRecord(id, r[i]));
  }
  async link(rec: LinkInput) {
    const v = await this.redis.eval<string[], string>(
      LINK_LUA,
      [K.refRec(rec.refereeId), K.refRec(rec.referrerId), K.refJoined, K.refRecent, K.refOf(rec.referrerId), K.refStats, K.refGJoined],
      [rec.refereeId, rec.referrerId, String(rec.at), rec.via, rec.ip ?? "", rec.same ? "1" : "0", rec.reasons.join(",")],
    );
    return v === "already" || v === "cycle" ? v : "ok";
  }
  private keys(refereeId: string, month: string) {
    return [K.refRec(refereeId), K.refCfg, K.refQual, K.refCredit, K.refPaid, K.refMonth(month), K.refStats, K.refHeld, K.refGMonth(month), K.refGPaid];
  }
  async qualify(refereeId: string, now: number, month: string, level: SameLevel, reasons: readonly string[], cap: number, grand: GrandOpts): Promise<QualifyResult | null> {
    const r = await this.redis.eval<string[], unknown[]>(QUALIFY_LUA, this.keys(refereeId, month), [
      String(now),
      level,
      String(cap),
      String(REF_MONTH_TTL_SEC),
      reasons.join(","),
      refereeId,
      grand.skip,
      String(grand.cap),
    ]);
    if (!Array.isArray(r) || num(r[0]) !== 1) return null;
    return {
      referrerId: String(r[1]),
      refereePaid: num(r[2]) === 1,
      referrerPaid: num(r[3]) === 1,
      credited: num(r[4]),
      same: num(r[5]) === 1,
      held: num(r[6]) === 1,
      grandPaid: num(r[7]) === 1,
    };
  }
  async decide(refereeId: string, approve: boolean, month: string, cap: number, grand: GrandOpts): Promise<DecideResult | null> {
    const r = await this.redis.eval<string[], unknown[]>(DECIDE_LUA, this.keys(refereeId, month), [
      approve ? "1" : "0",
      String(cap),
      String(REF_MONTH_TTL_SEC),
      refereeId,
      grand.skip,
      String(grand.cap),
    ]);
    if (!Array.isArray(r) || num(r[0]) !== 1) return null;
    return {
      referrerId: String(r[1]),
      approved: num(r[2]) === 1,
      refereePaid: num(r[3]) === 1,
      referrerPaid: num(r[4]) === 1,
      credited: num(r[5]),
      grandPaid: num(r[6]) === 1,
    };
  }
  async setReasons(refereeId: string, reasons: readonly string[]) {
    // 기록이 있을 때만 (HSET이 빈 기록을 만들지 않게)
    await this.redis.eval(`if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('HSET', KEYS[1], 'rs', ARGV[1]) end return 1`, [K.refRec(refereeId)], [reasons.join(",")]);
  }
  async stats(referrerId: string, month: string) {
    return (await this.statsMany([referrerId], month))[0];
  }
  async refereesOf(referrerId: string, limit: number) {
    return (await this.redis.zrange<string[]>(K.refOf(referrerId), 0, limit - 1, { rev: true })).map(String);
  }
  async recent(limit: number) {
    return (await this.redis.zrange<string[]>(K.refRecent, 0, limit - 1, { rev: true })).map(String);
  }
  async topReferrers(limit: number) {
    return (await this.redis.zrange<string[]>(K.refJoined, 0, limit - 1, { rev: true })).map(String);
  }
  /** 계정마다 ZSCORE 6개 + HGET 1개를 파이프라인 한 번으로 */
  async statsMany(ids: readonly string[], month: string) {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids)
      p.zscore(K.refJoined, id).zscore(K.refQual, id).zscore(K.refCredit, id).zscore(K.refPaid, id).hget(K.refMonth(month), id).zscore(K.refGJoined, id).zscore(K.refGPaid, id);
    const r = await p.exec<unknown[]>();
    const n = 7;
    return ids.map((_, i) => ({
      joined: num(r[i * n]),
      qualified: num(r[i * n + 1]),
      credited: num(r[i * n + 2]),
      paid: num(r[i * n + 3]),
      month: num(r[i * n + 4]),
      gJoined: num(r[i * n + 5]),
      gPaid: num(r[i * n + 6]),
    }));
  }
  async totals() {
    const h = hash(await this.redis.hgetall(K.refStats));
    return {
      entered: num(h.entered),
      qualified: num(h.qualified),
      paidReferrer: num(h.paidReferrer),
      paidReferee: num(h.paidReferee),
      paidGrand: num(h.paidGrand),
      same: num(h.same),
      held: num(h.held),
      denied: num(h.denied),
    };
  }
  async mode(): Promise<RefMode> {
    // HMGET은 배열 또는 객체로 온다 (userActivity와 같은 처리)
    const v = (await this.redis.hmget(K.refCfg, "mode", "auto")) as unknown;
    const o = (v ?? {}) as Record<string, unknown>;
    const [mode, old] = Array.isArray(v) ? v : [o.mode, o.auto];
    return isRefMode(mode) ? mode : old === "0" || old === 0 ? "off" : "review";
  }
  async setMode(mode: RefMode) {
    await this.redis.hset(K.refCfg, { mode });
  }
  async heldList(limit: number) {
    return (await this.redis.zrange<string[]>(K.refHeld, 0, limit - 1)).map(String);
  }
  async credited(accountId: string) {
    return num(await this.redis.zscore(K.refCredit, accountId));
  }
}

const g = globalThis as typeof globalThis & { __tombReferrals?: ReferralStore };

/** 계정 저장소와 같은 백엔드 (Redis가 없으면 로컬 메모리) */
export function getReferrals(): ReferralStore {
  const cur = g.__tombReferrals;
  const conn = env.redis();
  if (conn) return cur instanceof RedisReferrals ? cur : (g.__tombReferrals = new RedisReferrals(conn));
  if (env.isProd()) throw new Error("[referrals] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryReferrals) return cur;
  return (g.__tombReferrals = cur ? Object.assign(new MemoryReferrals(), cur) : new MemoryReferrals());
}

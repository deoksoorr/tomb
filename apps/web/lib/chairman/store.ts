import type { Redis } from "@upstash/redis";
import { WALLET_MAX } from "../economy";
import { env } from "../env";
import { redisClient } from "../redisUsage";
import { getAccounts } from "../store";
import { econKeyFor } from "../store/accounts";
import { K } from "../store/keys";
import { ECON_TTL_SEC, type AccountStore } from "../store/types";
import type { ChairPay } from "./rewards";
import type { ChairMode } from "./rules";

// 11/20 회장님 독대 저장소. 판마다 Redis 왕복 두 번: 시작(START_LUA — 진행 중 판 바꾸기 + 하루 판 수) · 끝(FINISH_LUA — 티켓 한 번만 + 최고 기록 + 주간 순위 + 지갑).
// 11/22 시작 전 나가기(ABORT_LUA — 티켓 버리기 + 하루 한 번 판 돌려주기)도 한 번.
//
// Redis 키
//  - chair:run:{계정}          STRING 진행 중 판 nonce (티켓 수명 EX). 새로 시작하면 바뀐다 → 예전 티켓은 끝낼 수 없다 (판은 늘 하나)
//  - chair:me:{계정}           HASH d = 판 수를 센 게임 날짜, cn·ch = 그날 유료 판 수(일반·지옥), bn·bh = 한 판 최고 피해(전체 기간), mn·mh = 그 최고 판 ms (11/20부터 — 옛 기록은 없음),
//                              rf = 판을 돌려받은 게임 날짜 (11/22 — d와 같으면 오늘 돌려받기를 썼다. 날짜로 비교해서 따로 지우지 않는다)
//  - chair:w:{모드}:{주}       ZSET 계정 → 그 주 한 판 최고 피해 (운영자는 넣지 않는다). 60일 뒤 지워진다
//  - chair:wa:{모드}:{주}      HASH 계정 → "시각|판 ms|최대 초당 피해" 그 최고 피해를 낸 판 (동점이면 먼저 낸 사람 · 1위 기록 확인에 싣는다)
//  - chair:settle:{주}         STRING 그 주 정리 기록 JSON (SET NX — 처음 정한 것만)
//  - chair:weeks               ZSET 정리한 주 → 점수 = 주 YYYYMMDD 숫자 (11/22 명예의 전당 색인 — createSettle 때마다 넣는다. 같은 주는 다시 넣어도 하나)
//  - chair:lock:{주}           STRING 정리 잠금 (60초)
//  - chair:paid                HASH 지급 표시 → 계정 (HSETNX — 같은 지급은 한 번만)
//  - chair:leadcool:{모드}     STRING 이번 주 1위 바뀜 공지 쉼 (PX — 레이스 champ:leadcool과 같은 규칙, 1위가 바뀐 판에서만 쓴다)
//  11/23 1위 바뀜은 FINISH_LUA가 순위에 넣기 전 1위(ZREVRANGE 0 0 + 점수)와 비교해 같이 돌려준다 — 판마다 왕복은 그대로 한 번

const WEEK_TTL_SEC = 60 * 86_400;
const LOCK_SEC = 60;

const mk = {
  run: (a: string) => `chair:run:${a}`,
  me: (a: string) => `chair:me:${a}`,
  week: (m: ChairMode, w: string) => `chair:w:${m}:${w}`,
  weekAt: (m: ChairMode, w: string) => `chair:wa:${m}:${w}`,
  settle: (w: string) => `chair:settle:${w}`,
  weeks: "chair:weeks",
  lock: (w: string) => `chair:lock:${w}`,
  paid: "chair:paid",
  leadCool: (m: ChairMode) => `chair:leadcool:${m}`,
};
const countField = (m: ChairMode) => (m === "normal" ? "cn" : "ch");
const bestField = (m: ChairMode) => (m === "normal" ? "bn" : "bh");
const bestMsField = (m: ChairMode) => (m === "normal" ? "mn" : "mh");

export type ChairCounts = { normal: number; hell: number };
/** 주간 순위 줄. ms·dm = 그 판 시간·캐릭터 최대 초당 피해 (관리자 기록 확인용) */
export type ChairEntry = { accountId: string; damage: number; at: number; ms?: number; dm?: number };
/** 정리 때 정한 순위 줄. streak = 1위의 연속 1위 주 수 (이번 주 포함, 2 이상일 때만) */
export type ChairWinner = ChairEntry & { name: string; rank: number; streak?: number };
/** 한 주 정리 기록 (처음 정한 것만 남는다) */
export type ChairSettle = { week: string; settledAt: number; ranks: Record<ChairMode, ChairWinner[]>; pay: ChairPay[] };

export type ChairStartIn = { acct: string; nonce: string; mode: ChairMode; practice: boolean; day: string; ttlMs: number; max: number };
/** refunded = 오늘 판 돌려받기를 이미 썼다 */
export type ChairStartOut = { ok: true; used: ChairCounts; refunded: boolean } | { ok: false; why: "no_runs"; used: ChairCounts };

/** 11/22 시작 전 나가기: 티켓을 버리고, refund면 그 모드 오늘 판 수를 하나 돌려준다 (오늘 이미 돌려받았으면 안 돌려준다) */
export type ChairAbortIn = { acct: string; nonce: string; mode: ChairMode; day: string; refund: boolean };
/** ok false = 이미 끝났거나 시간이 지난 티켓. refunded = 이번에 돌려줬다 · refundUsed = 오늘 돌려받기를 썼다 */
export type ChairAbortOut = { ok: false } | { ok: true; refunded: boolean; used: ChairCounts; refundUsed: boolean };

export type ChairFinishIn = {
  acct: string;
  nonce: string;
  mode: ChairMode;
  week: string;
  day: string;
  damage: number;
  at: number;
  durationMs: number;
  /** 그 판 캐릭터 최대 초당 피해 (dealCap) */
  dm: number;
  /** 최고 기록에 넣는다 (연습·거절 판은 false) */
  keepBest: boolean;
  /** 주간 순위에 넣는다 (연습·거절 판·운영자는 false) */
  ranked: boolean;
  /** 지갑에 넣을 포인트 (0이면 없음) */
  points: number;
};
/**
 * leadUp = 11/23 이미 이번 주 1위인 내가 내 1위 기록을 더 올렸다. overtook = 11/23 이 판으로 이번 주 1위가 다른 사람에서 나로 바뀌었다 (그 주 1위 기록보다 큰 피해 — 같은 피해는 먼저 낸 사람이 1위라 아니다).
 * 그 주 첫 기록(앞 1위 없음)·내 기록 갱신으로 1위 유지는 아니다 (주간 레이스 noteLeaders와 같은 규칙)
 */
export type ChairFinishOut = { ok: false } | { ok: true; prevBest: number; best: number; weekRank: number | null; got: number; used: ChairCounts; overtook?: true; leadUp?: true };

/** bestMs·ms = 그 최고 판 버틴 시간 (옛 기록은 0·없음) */
export type ChairMine = { used: ChairCounts; refunded: boolean; best: ChairCounts; bestMs: ChairCounts; week: Record<ChairMode, { damage: number; rank: number; ms?: number } | null> };

export interface ChairStore {
  start(s: ChairStartIn): Promise<ChairStartOut>;
  finish(f: ChairFinishIn): Promise<ChairFinishOut>;
  abort(a: ChairAbortIn): Promise<ChairAbortOut>;
  mine(acct: string, day: string, week: string): Promise<ChairMine>;
  /** 그 주 높은 피해부터 n명 (동점이면 먼저 낸 사람) */
  top(mode: ChairMode, week: string, n: number): Promise<ChairEntry[]>;
  getSettle(week: string): Promise<ChairSettle | null>;
  /** 처음이면 저장하고 true */
  createSettle(rec: ChairSettle): Promise<boolean>;
  /** 11/22 명예의 전당: 정리 기록을 최근 주부터 limit개 */
  hall(limit: number): Promise<ChairSettle[]>;
  lock(week: string): Promise<boolean>;
  unlock(week: string): Promise<void>;
  /** 지급 표시: 처음이면 true (원자적) */
  claim(mark: string, acct: string): Promise<boolean>;
  paid(marks: readonly string[]): Promise<(string | null)[]>;
  /** 11/23 1위 바뀜 공지 쉼: ms 안에 그 모드 공지를 이미 했으면 false, 아니면 표시하고 true (원자적) */
  leadCooldown(mode: ChairMode, ms: number): Promise<boolean>;
}

const zero = (): ChairCounts => ({ normal: 0, hell: 0 });
const byDamage = (a: ChairEntry, b: ChairEntry) => b.damage - a.damage || a.at - b.at || a.accountId.localeCompare(b.accountId);

// ── 메모리 (로컬·테스트) ──

type MemMe = { d: string; cn: number; ch: number; bn: number; bh: number; mn?: number; mh?: number; rf?: string };

export class MemoryChairStore implements ChairStore {
  private runs = new Map<string, { nonce: string; until: number }>();
  private me = new Map<string, MemMe>();
  private weeks = new Map<string, Map<string, { damage: number; at: number; ms?: number; dm?: number }>>();
  private settles = new Map<string, ChairSettle>();
  private locks = new Map<string, number>();
  private marks = new Map<string, string>();

  constructor(private accounts: () => AccountStore = getAccounts) {}

  private meOf(acct: string, day: string): MemMe {
    let m = this.me.get(acct);
    if (!m) this.me.set(acct, (m = { d: day, cn: 0, ch: 0, bn: 0, bh: 0 }));
    if (m.d !== day) Object.assign(m, { d: day, cn: 0, ch: 0 });
    return m;
  }
  private board(mode: ChairMode, week: string) {
    const k = `${mode}:${week}`;
    let b = this.weeks.get(k);
    if (!b) this.weeks.set(k, (b = new Map()));
    return b;
  }
  private rankIn(mode: ChairMode, week: string, acct: string): number | null {
    const list = this.sorted(mode, week);
    const i = list.findIndex((e) => e.accountId === acct);
    return i < 0 ? null : i + 1;
  }
  private sorted(mode: ChairMode, week: string): ChairEntry[] {
    return [...this.board(mode, week)].map(([accountId, v]) => ({ accountId, ...v })).sort(byDamage);
  }

  async start(s: ChairStartIn): Promise<ChairStartOut> {
    const m = this.meOf(s.acct, s.day);
    const used = () => ({ normal: m.cn, hell: m.ch });
    const f = countField(s.mode);
    if (!s.practice) {
      if (m[f] >= s.max) return { ok: false, why: "no_runs", used: used() };
      m[f]++;
    }
    this.runs.set(s.acct, { nonce: s.nonce, until: Date.now() + s.ttlMs });
    return { ok: true, used: used(), refunded: m.rf === s.day };
  }
  async abort(a: ChairAbortIn): Promise<ChairAbortOut> {
    const r = this.runs.get(a.acct);
    if (!r || r.nonce !== a.nonce || r.until < Date.now()) return { ok: false };
    this.runs.delete(a.acct);
    const m = this.me.get(a.acct);
    if (!m || m.d !== a.day) return { ok: true, refunded: false, used: zero(), refundUsed: false };
    const f = countField(a.mode);
    let refunded = false;
    if (a.refund && m.rf !== a.day && m[f] > 0) {
      m[f]--;
      m.rf = a.day;
      refunded = true;
    }
    return { ok: true, refunded, used: { normal: m.cn, hell: m.ch }, refundUsed: m.rf === a.day };
  }
  async finish(f: ChairFinishIn): Promise<ChairFinishOut> {
    const r = this.runs.get(f.acct);
    if (!r || r.nonce !== f.nonce || r.until < Date.now()) return { ok: false };
    this.runs.delete(f.acct);
    const m = this.meOf(f.acct, f.day);
    const bf = bestField(f.mode);
    const prevBest = m[bf];
    if (f.keepBest && f.damage > prevBest) {
      m[bf] = f.damage;
      m[bestMsField(f.mode)] = Math.round(f.durationMs);
    }
    let weekRank: number | null = null;
    let overtook = false;
    let leadUp = false;
    if (f.ranked) {
      const b = this.board(f.mode, f.week);
      const lead = this.sorted(f.mode, f.week)[0];
      const cur = b.get(f.acct);
      if (!cur || f.damage > cur.damage) {
        b.set(f.acct, { damage: f.damage, at: f.at, ms: f.durationMs, dm: f.dm });
        overtook = !!lead && lead.accountId !== f.acct && f.damage > lead.damage;
        leadUp = !!lead && lead.accountId === f.acct && f.damage > lead.damage;
      }
      weekRank = this.rankIn(f.mode, f.week, f.acct);
    }
    const got = f.points > 0 ? await this.accounts().walletGrant(f.acct, f.points, "earn:chair", f.at) : 0;
    return { ok: true, prevBest, best: m[bf], weekRank, got, used: { normal: m.cn, hell: m.ch }, ...(overtook ? { overtook: true as const } : leadUp ? { leadUp: true as const } : {}) };
  }
  async mine(acct: string, day: string, week: string): Promise<ChairMine> {
    const m = this.me.get(acct);
    const today = m && m.d === day;
    const wk = (mode: ChairMode) => {
      const v = this.board(mode, week).get(acct);
      return v ? { damage: v.damage, rank: this.rankIn(mode, week, acct)!, ...(v.ms ? { ms: v.ms } : {}) } : null;
    };
    return {
      used: today ? { normal: m.cn, hell: m.ch } : zero(),
      refunded: !!today && m.rf === day,
      best: { normal: m?.bn ?? 0, hell: m?.bh ?? 0 },
      bestMs: { normal: m?.mn ?? 0, hell: m?.mh ?? 0 },
      week: { normal: wk("normal"), hell: wk("hell") },
    };
  }
  async top(mode: ChairMode, week: string, n: number): Promise<ChairEntry[]> {
    return this.sorted(mode, week).slice(0, n);
  }
  async getSettle(week: string) {
    const r = this.settles.get(week);
    return r ? structuredClone(r) : null;
  }
  async createSettle(rec: ChairSettle) {
    if (this.settles.has(rec.week)) return false;
    this.settles.set(rec.week, structuredClone(rec));
    return true;
  }
  async hall(limit: number) {
    return [...this.settles.values()]
      .sort((a, b) => b.week.localeCompare(a.week))
      .slice(0, Math.max(0, limit))
      .map((r) => structuredClone(r));
  }
  async lock(week: string) {
    const now = Date.now();
    if ((this.locks.get(week) ?? 0) > now) return false;
    this.locks.set(week, now + LOCK_SEC * 1000);
    return true;
  }
  async unlock(week: string) {
    this.locks.delete(week);
  }
  private cools = new Map<ChairMode, number>();
  async leadCooldown(mode: ChairMode, ms: number) {
    const now = Date.now();
    if ((this.cools.get(mode) ?? 0) > now) return false;
    this.cools.set(mode, now + ms);
    return true;
  }
  async claim(mark: string, acct: string) {
    if (this.marks.has(mark)) return false;
    this.marks.set(mark, acct);
    return true;
  }
  async paid(marks: readonly string[]) {
    return marks.map((m) => this.marks.get(m) ?? null);
  }
}

// ── Redis ──

// KEYS: run, me  ARGV: nonce, 판 수 칸(cn|ch), 연습('1'|'0'), 게임 날짜, 티켓 ms, 하루 판 수 → {1|-2, cn, ch, 오늘 돌려받음(1|0)}
const START_LUA = `
if redis.call('HGET', KEYS[2], 'd') ~= ARGV[4] then
  redis.call('HSET', KEYS[2], 'd', ARGV[4], 'cn', 0, 'ch', 0)
end
if ARGV[3] == '0' then
  local c = tonumber(redis.call('HGET', KEYS[2], ARGV[2]) or '0')
  if c >= tonumber(ARGV[6]) then
    return {-2, tonumber(redis.call('HGET', KEYS[2], 'cn') or '0'), tonumber(redis.call('HGET', KEYS[2], 'ch') or '0')}
  end
  redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[5])
local rf = 0
if redis.call('HGET', KEYS[2], 'rf') == ARGV[4] then rf = 1 end
return {1, tonumber(redis.call('HGET', KEYS[2], 'cn') or '0'), tonumber(redis.call('HGET', KEYS[2], 'ch') or '0'), rf}
`;

// 11/22 시작 전 나가기: 티켓 한 번만(진행 중 nonce가 같을 때만 지운다) → 돌려주기(오늘 판 수가 센 날이고, 오늘 아직 안 돌려받았고, 그 모드 판 수 > 0)
// KEYS: run, me  ARGV: nonce, 판 수 칸(cn|ch), 게임 날짜, 돌려주기('1'|'0') → {1, 돌려줌(1|0), cn, ch, 오늘 돌려받음(1|0)} | {-1}
const ABORT_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return {-1} end
redis.call('DEL', KEYS[1])
if redis.call('HGET', KEYS[2], 'd') ~= ARGV[3] then return {1, 0, 0, 0, 0} end
local got = 0
if ARGV[4] == '1' and redis.call('HGET', KEYS[2], 'rf') ~= ARGV[3] then
  local c = tonumber(redis.call('HGET', KEYS[2], ARGV[2]) or '0')
  if c > 0 then
    redis.call('HINCRBY', KEYS[2], ARGV[2], -1)
    redis.call('HSET', KEYS[2], 'rf', ARGV[3])
    got = 1
  end
end
local rf = 0
if redis.call('HGET', KEYS[2], 'rf') == ARGV[3] then rf = 1 end
return {1, got, tonumber(redis.call('HGET', KEYS[2], 'cn') or '0'), tonumber(redis.call('HGET', KEYS[2], 'ch') or '0'), rf}
`;

// 판 끝: 티켓 한 번만(진행 중 nonce가 같을 때만 지운다) → 최고 기록 → 주간 순위(더 클 때만 — 같으면 먼저 낸 기록) → 지갑 (accounts-redis.ts WALLET_GRANT_LUA와 같은 규칙)
// KEYS: run, me, week, weekAt, acct, econ  ARGV: nonce, 계정, 피해, "시각|판 ms|최대 초당 피해", 최고 칸(bn|bh), 최고 넣기('1'|'0'), 주간 넣기('1'|'0'), 포인트, 지갑 상한, 게임 날짜, 최고 ms 칸(mn|mh), 판 ms
// → {1, 이전 최고, 지금 최고, 주간 순위(0부터, 없으면 -1), 지갑에 들어간 포인트, cn, ch} | {-1}
const FINISH_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return {-1} end
redis.call('DEL', KEYS[1])
local dmg = tonumber(ARGV[3])
local prev = tonumber(redis.call('HGET', KEYS[2], ARGV[5]) or '0')
local best = prev
if ARGV[6] == '1' and dmg > prev then
  redis.call('HSET', KEYS[2], ARGV[5], ARGV[3], ARGV[11], ARGV[12])
  best = dmg
end
local rank = -1
local over = 0
if ARGV[7] == '1' then
  local cur = redis.call('ZSCORE', KEYS[3], ARGV[2])
  if (not cur) or dmg > tonumber(cur) then
    local lead = redis.call('ZREVRANGE', KEYS[3], 0, 0, 'WITHSCORES')
    if lead[1] and lead[1] ~= ARGV[2] and dmg > tonumber(lead[2]) then over = 1
    elseif lead[1] == ARGV[2] and dmg > tonumber(lead[2]) then over = 2 end
    redis.call('ZADD', KEYS[3], dmg, ARGV[2])
    redis.call('HSET', KEYS[4], ARGV[2], ARGV[4])
    redis.call('EXPIRE', KEYS[3], ${WEEK_TTL_SEC})
    redis.call('EXPIRE', KEYS[4], ${WEEK_TTL_SEC})
  end
  rank = redis.call('ZREVRANK', KEYS[3], ARGV[2])
end
local got = 0
local pts = tonumber(ARGV[8])
if pts > 0 then
  local before = tonumber(redis.call('HGET', KEYS[5], 'points') or '0')
  local bal = math.min(tonumber(ARGV[9]), before + pts)
  if bal > before then
    got = bal - before
    redis.call('HSET', KEYS[5], 'points', bal)
    redis.call('HSETNX', KEYS[5], 'lifetime', before)
    redis.call('HINCRBY', KEYS[6], 'earn:chair', got)
    redis.call('EXPIRE', KEYS[6], ${ECON_TTL_SEC})
  end
end
local cn, ch = 0, 0
if redis.call('HGET', KEYS[2], 'd') == ARGV[10] then
  cn = tonumber(redis.call('HGET', KEYS[2], 'cn') or '0')
  ch = tonumber(redis.call('HGET', KEYS[2], 'ch') or '0')
end
return {1, prev, best, rank, got, cn, ch, over}
`;

const num = (v: unknown) => Number(v ?? 0) || 0;

export class RedisChairStore implements ChairStore {
  private redis: Redis;
  private token = new Map<string, string>();
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "chairman");
  }

  async start(s: ChairStartIn): Promise<ChairStartOut> {
    const r = await this.redis.eval<string[], number[]>(
      START_LUA,
      [mk.run(s.acct), mk.me(s.acct)],
      [s.nonce, countField(s.mode), s.practice ? "1" : "0", s.day, String(Math.round(s.ttlMs)), String(s.max)],
    );
    const used = { normal: num(r[1]), hell: num(r[2]) };
    return num(r[0]) === 1 ? { ok: true, used, refunded: num(r[3]) === 1 } : { ok: false, why: "no_runs", used };
  }
  async abort(a: ChairAbortIn): Promise<ChairAbortOut> {
    const r = await this.redis.eval<string[], number[]>(ABORT_LUA, [mk.run(a.acct), mk.me(a.acct)], [a.nonce, countField(a.mode), a.day, a.refund ? "1" : "0"]);
    if (num(r[0]) !== 1) return { ok: false };
    return { ok: true, refunded: num(r[1]) === 1, used: { normal: num(r[2]), hell: num(r[3]) }, refundUsed: num(r[4]) === 1 };
  }
  async finish(f: ChairFinishIn): Promise<ChairFinishOut> {
    const r = await this.redis.eval<string[], number[]>(
      FINISH_LUA,
      [mk.run(f.acct), mk.me(f.acct), mk.week(f.mode, f.week), mk.weekAt(f.mode, f.week), K.acct(f.acct), await econKeyFor(f.acct, f.day)],
      [
        f.nonce,
        f.acct,
        String(Math.floor(f.damage)),
        `${f.at}|${Math.round(f.durationMs)}|${Math.round(f.dm)}`,
        bestField(f.mode),
        f.keepBest ? "1" : "0",
        f.ranked ? "1" : "0",
        String(Math.max(0, Math.floor(f.points))),
        String(WALLET_MAX),
        f.day,
        bestMsField(f.mode),
        String(Math.round(f.durationMs)),
      ],
    );
    if (num(r[0]) !== 1) return { ok: false };
    const rank = num(r[3]);
    return {
      ok: true,
      prevBest: num(r[1]),
      best: num(r[2]),
      weekRank: f.ranked && rank >= 0 ? rank + 1 : null,
      got: num(r[4]),
      used: { normal: num(r[5]), hell: num(r[6]) },
      ...(num(r[7]) === 1 ? { overtook: true as const } : num(r[7]) === 2 ? { leadUp: true as const } : {}),
    };
  }
  async mine(acct: string, day: string, week: string): Promise<ChairMine> {
    const [me, ns, nr, na, hs, hr, ha] = await this.redis
      .pipeline()
      .hmget(mk.me(acct), "d", "cn", "ch", "bn", "bh", "mn", "mh", "rf")
      .zscore(mk.week("normal", week), acct)
      .zrevrank(mk.week("normal", week), acct)
      .hget(mk.weekAt("normal", week), acct)
      .zscore(mk.week("hell", week), acct)
      .zrevrank(mk.week("hell", week), acct)
      .hget(mk.weekAt("hell", week), acct)
      .exec<[unknown, number | null, number | null, unknown, number | null, number | null, unknown]>();
    // 11/21 이 클라이언트(redisClient)는 HMGET을 필드 이름 없는 배열로 준다 — 이름 붙은 객체로 바꿔 읽는다 (객체로 와도 그대로)
    const ME = ["d", "cn", "ch", "bn", "bh", "mn", "mh", "rf"] as const;
    const mv = hmgetList(me, ME);
    const m = Object.fromEntries(ME.map((f, i) => [f, mv[i]])) as Record<(typeof ME)[number], string | null>;
    const today = String(m.d ?? "") === day;
    const wk = (s: number | null, r: number | null, at: unknown) => {
      if (s === null || s === undefined || r === null || r === undefined) return null;
      const ms = num(String(at ?? "").split("|")[1]);
      return { damage: num(s), rank: num(r) + 1, ...(ms ? { ms } : {}) };
    };
    return {
      used: today ? { normal: num(m.cn), hell: num(m.ch) } : zero(),
      refunded: today && String(m.rf ?? "") === day,
      best: { normal: num(m.bn), hell: num(m.bh) },
      bestMs: { normal: num(m.mn), hell: num(m.mh) },
      week: { normal: wk(ns, nr, na), hell: wk(hs, hr, ha) },
    };
  }
  async top(mode: ChairMode, week: string, n: number): Promise<ChairEntry[]> {
    // 동점 경계를 넉넉히 보려고 조금 더 읽고, 같은 피해는 먼저 낸 순으로 다시 줄 세운다
    const raw = (await this.redis.zrange<(string | number)[]>(mk.week(mode, week), 0, n + 4, { rev: true, withScores: true })) ?? [];
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(String(raw[i]));
      scores.push(num(raw[i + 1]));
    }
    if (!ids.length) return [];
    const ats = hmgetList(await this.redis.hmget(mk.weekAt(mode, week), ...ids), ids);
    return ids
      .map((accountId, i) => {
        const [at, ms, dm] = String(ats[i] ?? "0").split("|").map(num);
        return { accountId, damage: scores[i], at, ...(ms ? { ms } : {}), ...(dm ? { dm } : {}) };
      })
      .sort(byDamage)
      .slice(0, n);
  }
  async getSettle(week: string) {
    return settleOf(await this.redis.get<unknown>(mk.settle(week)));
  }
  async createSettle(rec: ChairSettle) {
    const ok = (await this.redis.set(mk.settle(rec.week), JSON.stringify(rec), { nx: true })) !== null;
    // 처음이 아니어도 색인에 넣는다 (같은 주는 하나 — 기록만 있고 색인이 빠진 주도 다음 정리 때 채워진다)
    await this.redis.zadd(mk.weeks, { score: Number(rec.week) || 0, member: rec.week });
    return ok;
  }
  async hall(limit: number) {
    if (limit <= 0) return [];
    // 이 클라이언트는 자동으로 풀지 않는다 — 주는 문자열(또는 숫자), MGET은 JSON 문자열 배열로 온다
    const weeks = ((await this.redis.zrange<unknown[]>(mk.weeks, 0, limit - 1, { rev: true })) ?? []).map(String);
    if (!weeks.length) return [];
    const raws = await this.redis.mget<unknown[]>(...weeks.map(mk.settle));
    const list = Array.isArray(raws) ? raws : [];
    return weeks.flatMap((_, i) => {
      const r = settleOf(list[i]);
      return r ? [r] : [];
    });
  }
  async lock(week: string) {
    const t = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = (await this.redis.set(mk.lock(week), t, { nx: true, ex: LOCK_SEC })) !== null;
    if (ok) this.token.set(week, t);
    return ok;
  }
  async unlock(week: string) {
    const t = this.token.get(week);
    this.token.delete(week);
    if (t) await this.redis.eval<string[], number>("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", [mk.lock(week)], [t]);
  }
  async claim(mark: string, acct: string) {
    return Number(await this.redis.hsetnx(mk.paid, mark, acct)) === 1;
  }
  async leadCooldown(mode: ChairMode, ms: number) {
    return (await this.redis.set(mk.leadCool(mode), "1", { nx: true, px: Math.max(1, Math.round(ms)) })) !== null;
  }
  async paid(marks: readonly string[]) {
    if (!marks.length) return [];
    const r = hmgetList(await this.redis.hmget(mk.paid, ...marks), marks);
    return r.map((v) => (v === null || v === undefined ? null : String(v)));
  }
}

/** 정리 기록 한 칸 (JSON 문자열이든 이미 풀린 객체든 — 망가졌거나 없으면 null) */
export function settleOf(raw: unknown): ChairSettle | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = v as Partial<ChairSettle> | null;
  return r && typeof r === "object" && typeof r.week === "string" && r.ranks ? (r as ChairSettle) : null;
}

/** HMGET 결과를 필드 순서대로 (배열로 오든 이름 붙은 객체로 오든 — lib/store/accounts-redis hmgetList와 같은 규칙) */
export function hmgetList(got: unknown, fields: readonly string[]): (string | null)[] {
  if (Array.isArray(got)) return fields.map((_, i) => (got[i] === null || got[i] === undefined ? null : String(got[i])));
  const o = (got ?? {}) as Record<string, unknown>;
  return fields.map((f) => (o[f] === null || o[f] === undefined ? null : String(o[f])));
}

const g = globalThis as typeof globalThis & { __tombChair?: ChairStore };

/** 회장님 독대 저장소 (Redis 환경변수가 있으면 Redis, 없으면 로컬 메모리) */
export function getChairStore(): ChairStore {
  const cur = g.__tombChair;
  const conn = env.redis();
  if (conn) return cur instanceof RedisChairStore ? cur : (g.__tombChair = new RedisChairStore(conn));
  if (env.isProd()) throw new Error("[chairman] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryChairStore) return cur;
  // 11/22 개발 서버가 이 모듈을 다시 읽으면(HMR) 클래스가 바뀌어 instanceof가 틀린다 — 예전 메모리 기록을 옮겨 담는다 (lib/store/champ getChamp와 같은 방식)
  return (g.__tombChair = cur && "settles" in cur ? Object.assign(new MemoryChairStore(), cur) : new MemoryChairStore());
}

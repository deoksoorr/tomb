import type { Redis } from "@upstash/redis";
import { redisClient } from "../../redisUsage";
import { env } from "../../env";
import { K } from "../../store/keys";
import { titleStatsKey } from "../../store/titleStats";
import { BAG_TAKE_LUA, lk } from "../store";
import { questKey } from "./store";
import { countOf, URGENT_TTL_SEC, type UrgentKind } from "./urgent";

// 11/15: 긴급 의뢰 저장소. 언제·무엇은 저장하지 않는다(lib/forage/quests/urgent 시드). 목표·막대·순위·받은 표시만.
// 바뀌는 연산은 하나씩 원자적이다 (Redis는 Lua 한 번, 메모리는 await 없는 구간). urgent.test.ts가 메모리 구현에 계약을 돌린다.
//
// Redis 키 (의뢰 id = "YYYYMMDD-0|1", 테스트 서버 시험 의뢰는 "t…"). 모두 TTL URGENT_TTL_SEC (약 4일)
//  - urg:{id}       HASH  goal = 목표(처음 정한 값) · n = 낸 수(막대) · fest = 150%에 닿은 시각(ms, 축제 시작)
//                         last = 마지막 1분에 100%를 넘긴 계정 · at100 = 100%에 처음 닿은 시각(ms, 화면 축하 폭죽) · a0·a2·a1 = 시작·축제·끝 확성기 남김
//                         festBy = 150%를 넘긴 계정 (11/15 150%에 닿으면 그 시각(fest)에 의뢰가 일찍 끝난다 — 그 뒤 납품은 Lua가 'done'으로 막는다)
//                         cap = 11/16 한 사람이 낼 수 있는 수. 목표를 처음 쓸 때만 함께 쓴다 (URGENT_GOAL_LUA) — 목표만 있고 cap이 없으면
//                               그 전 코드가 정한 의뢰라 예전 규칙 그대로 (상한 없음 · 1등 한 사람만 배달왕 · 목표 그대로)
//  - urg:{id}:by    ZSET  계정 → 낸 수 + 먼저 닿은 순서(소수부, lib/forage/quests/urgent rankScore)
//  - urg:{id}:nm    HASH  계정 → 이름 (순위 3명 표시용)
//  - urg:{id}:got   HASH  계정 → 받은 보상 JSON (한 번만 — HSETNX)
//  - urg:test       STRING 테스트 서버 시험 의뢰 JSON (운영 서버에서는 읽지도 쓰지도 않는다)
//                         rs = 11/22 관리자 결과 기록을 남김 (saveResult — 한 번만)
//  - urg:results    LIST  11/22 관리자 「긴급 의뢰 결과」 JSON (최신이 앞, URGENT_RESULTS_KEEP개까지 — TTL 없음)
//  - urgbox:{a}     HASH  아직 안 연 「수집가의 뒷주머니」: 의뢰 id → 받은 시각 (내용물은 (의뢰, 계정) 시드라 저장하지 않는다. TTL 없음 — 열 때까지 남는다)
//                         가방의 상자 개수(acct:{a}:inv u_box_pocket)와 함께 바뀐다
// 함께 바꾸는 키: 가방 forage:{a}:bag(납품·상자 물고기) · 의뢰 도장 quest:{a}(st) · 계정 acct:{a}:inv(염색권)·:look·:stash(사이렌 모자)
//                 · 칭호 누적 titles:stats:{a}(urgKing·urgLast = 칭호가 끝나는 시각 ms)

export const uk = {
  ev: (id: string) => `urg:${id}`,
  by: (id: string) => `urg:${id}:by`,
  nm: (id: string) => `urg:${id}:nm`,
  got: (id: string) => `urg:${id}:got`,
  test: "urg:test",
  results: "urg:results",
  box: (a: string) => `urgbox:${a}`,
};

export type UrgentState = { goal: number; cap: number; n: number; fest: number; at100: number; last: string | null; festBy: string | null; a0: boolean; a1: boolean; a2: boolean; rs: boolean };

/** 11/22 관리자 결과 기록을 남겨 두는 수 */
export const URGENT_RESULTS_KEEP = 20;
export type NoticeField = "a0" | "a1" | "a2";
export type UrgentTop = { acct: string; name: string; n: number };
export type UrgentMine = { id: string; n: number; got: string | null };
/** 시험 의뢰 (테스트 서버) */
export type UrgentTest = { id: string; kind: UrgentKind; start: number; end: number };

export type DeliverArgs = {
  /** 목표 (저장된 값) */
  goal: number;
  end: number;
  now: number;
  /** 순위 소수부 (먼저 닿은 사람이 위) */
  frac: number;
  /** 마지막 1분이 시작하는 시각 */
  lastFrom: number;
  /** 11/16 한 사람 상한 (0 = 없음). 내 수 + 이번 납품이 넘으면 cap (아무것도 바뀌지 않는다) */
  cap: number;
  /** 테스트 서버 시험(막대 +%): 가방을 보지 않고 낸 것으로만 센다 (순위·참여·보상에 들어간다). 11/16 한 사람 상한도 보지 않는다 */
  free?: boolean;
};
/** done = 이미 150%를 채워 끝난 의뢰, cap = 11/16 한 사람 상한을 넘는다 (left = 앞으로 더 낼 수 있는 수). 둘 다 아무것도 바뀌지 않는다 */
export type UrgentDeliverResult = { status: "ok"; n: number; mine: number; fest: number } | { status: "bag" | "done" } | { status: "cap"; left: number };

/** 받기: 단계 도장 + 상자(가방에 넣기만 — 여는 건 openPocket) + 칭호·모자를 한 번에 */
export type ClaimPlan = {
  /** 받은 표시에 남길 JSON */
  record: string;
  stamps: number;
  stampCap: number;
  /** 「수집가의 뒷주머니」 가방에 넣기 (아이템 id, 없으면 "") */
  pocket: string;
  /** 사이렌 모자 (없으면 null) */
  hat: { id: string; slot: string; until: number } | null;
  now: number;
  /** 칭호가 끝나는 시각 (0 = 없음) */
  kingUntil: number;
  lastUntil: number;
};
export type ClaimResult = { status: "ok"; stamps: number } | { status: "dup" | "noacct" };

/** 도감에 적을 물고기 (크기는 cm×10, cat·pts = 처음 등록 보상) */
export type PocketDex = { id: string; day: string; size: number; cat: string; pts: number };

/** 상자 열기: 그 의뢰의 상자 하나를 빼고 내용물 지급 */
export type OpenPlan = {
  /** 상자를 준 의뢰 id */
  id: string;
  /** 가방의 상자 아이템 id */
  pocket: string;
  stamps: number;
  stampCap: number;
  /** 염색권 아이템 id (없으면 "") */
  dye: string;
  /** 물고기 id (없으면 "") — 가방 칸이 가득이면 대신 fishFallback 도장 */
  fish: string;
  fishFallback: number;
  stackMax: number;
};
export type OpenResult = { status: "ok"; stamps: number; fish: boolean } | { status: "none" };

export interface UrgentStore {
  /** 막대·목표 (명령 1개) */
  state(id: string): Promise<UrgentState>;
  /**
   * 목표·한 사람 상한을 처음 한 번 정한다 (원자적). 목표가 이미 있으면 아무것도 쓰지 않고 저장된 값을 돌려준다 —
   * 11/16 그 전 코드가 정한 의뢰(목표만 있다)는 cap 0 (상한 없음)으로 남는다
   */
  setGoal(id: string, goal: number, cap: number): Promise<{ goal: number; cap: number }>;
  /** 확성기 남김 표시 (처음이면 true) */
  mark(id: string, field: NoticeField): Promise<boolean>;
  /**
   * 납품 (원자적): 가방에 모자라면 bag (아무것도 바뀌지 않는다). 아니면 가방에서 빼고 막대 +낸 수, 순위 +낸 수, 이름 기억.
   * 150%를 처음 넘기면 fest = now·festBy = 이 계정, 마지막 1분에 100%를 처음 넘기면 last = 이 계정.
   * 이미 150%를 넘겨 끝난 의뢰면 done, 11/16 내 수 + 이번 납품이 한 사람 상한(a.cap)을 넘으면 cap (둘 다 가방도 막대도 그대로)
   */
  deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult>;
  /** 많이 낸 순 k명 (명령 2개) */
  top(id: string, k: number): Promise<UrgentTop[]>;
  /** 11/16 cap개 이상 낸 사람 수 (공동 배달왕, 명령 1개 — ZCOUNT. 순위 점수 소수부는 0.5 미만이라 점수 ≥ cap ⇔ 낸 수 ≥ cap) */
  capped(id: string, cap: number): Promise<number>;
  /** 의뢰마다 내가 낸 수·받은 기록 (의뢰마다 명령 2개) */
  mine(ids: readonly string[], acct: string): Promise<UrgentMine[]>;
  /** 보상 받기 (원자적, 의뢰·계정마다 한 번). 계정이 없으면 noacct, 이미 받았으면 dup */
  claim(id: string, acct: string, plan: ClaimPlan): Promise<ClaimResult>;
  /** 아직 안 연 상자의 의뢰 id (오래된 것부터) */
  pockets(acct: string): Promise<string[]>;
  /** 상자 열기 (원자적): 그 의뢰의 상자가 없으면 none (두 번 열 수 없다). 있으면 표시·가방 상자 1개를 빼고 내용물 지급 */
  openPocket(acct: string, plan: OpenPlan): Promise<OpenResult>;
  /**
   * 11/16 주머니에서 나온 물고기를 도감에 적는다 (예전엔 가방에만 들어가고 도감에 안 떴다).
   * onlyNew = 아직 도감에 없을 때만 (지난 주머니 채우기 — 여러 번 돌려도 두 번 세지 않는다). 처음 등록이면 true
   */
  pocketDex(acct: string, d: PocketDex, onlyNew: boolean): Promise<boolean>;
  /** 그 의뢰에서 보상을 받은 계정 → 받은 기록(JSON) (지난 주머니 채우기·관리자 결과용) */
  claimedAll(id: string): Promise<Record<string, string>>;
  /**
   * 11/22 끝난 의뢰의 결과 기록 남기기 (원자적, 의뢰마다 한 번 — 표시 rs가 먼저). 처음이면 true.
   * 결과 목록 맨 앞에 넣고 최근 keep개만 남긴다
   */
  saveResult(id: string, json: string, keep: number): Promise<boolean>;
  /** 11/22 결과 기록 (최신 순, JSON) */
  results(limit: number): Promise<string[]>;
  /** 시험 의뢰 (테스트 서버 전용) */
  testGet(): Promise<UrgentTest | null>;
  testSet(t: UrgentTest | null): Promise<void>;
}

const num = (v: unknown) => Number(v) || 0;
export function stateOf(h: Record<string, string>): UrgentState {
  return { goal: num(h.goal), cap: num(h.cap), n: num(h.n), fest: num(h.fest), at100: num(h.at100), last: h.last || null, festBy: h.festBy || null, a0: h.a0 === "1", a1: h.a1 === "1", a2: h.a2 === "1", rs: h.rs === "1" };
}

// ── 메모리 (로컬·시험) ──

/** 메모리 구현이 함께 바꾸는 다른 저장소 (모두 동기) */
export type UrgentMemDeps = {
  takeBag(acct: string, items: Record<string, number>): boolean;
  bagHas(acct: string, id: string): number;
  giveBag(acct: string, id: string, n: number): void;
  hasAccount(acct: string): boolean;
  giveInv(acct: string, itemId: string): void;
  /** 계정 가방에서 1개 빼기 (없으면 false) */
  takeInv(acct: string, itemId: string): boolean;
  /** 의뢰 도장 더하기 (상한까지). 새 도장 수 */
  addStamps(acct: string, n: number, cap: number): number;
  /** 기간 꾸미기 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기 — 더 길 때만) */
  grantTimed(acct: string, itemId: string, slot: string, until: number): void;
  setTitleUntil(acct: string, field: "urgKing" | "urgLast", until: number): void;
  /** 도감에 한 마리 적기 (처음이면 true) */
  dexAdd(acct: string, d: PocketDex, onlyNew: boolean): boolean;
};

export class MemoryUrgentStore implements UrgentStore {
  private evs = new Map<string, Record<string, string>>();
  private bys = new Map<string, Map<string, number>>();
  private nms = new Map<string, Map<string, string>>();
  private gots = new Map<string, Map<string, string>>();
  private boxes = new Map<string, Map<string, string>>();
  private test: UrgentTest | null = null;
  private resultLog: string[] = [];
  constructor(private deps: () => UrgentMemDeps) {}

  private ev(id: string) {
    let x = this.evs.get(id);
    if (!x) this.evs.set(id, (x = {}));
    return x;
  }
  private map<T>(m: Map<string, Map<string, T>>, id: string) {
    let x = m.get(id);
    if (!x) m.set(id, (x = new Map()));
    return x;
  }

  async state(id: string) {
    return stateOf({ ...(this.evs.get(id) ?? {}) });
  }
  async setGoal(id: string, goal: number, cap: number) {
    const e = this.ev(id);
    if (e.goal === undefined) {
      e.goal = String(goal);
      e.cap = String(cap);
    }
    return { goal: Number(e.goal), cap: num(e.cap) };
  }
  async mark(id: string, field: NoticeField) {
    const e = this.ev(id);
    if (e[field] === "1") return false;
    e[field] = "1";
    return true;
  }
  async deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult> {
    if (num(this.evs.get(id)?.fest) > 0) return { status: "done" };
    const add = Object.values(items).reduce((s, n) => s + n, 0);
    const had = countOf(this.bys.get(id)?.get(acct) ?? 0);
    if (!a.free && a.cap > 0 && had + add > a.cap) return { status: "cap", left: Math.max(0, a.cap - had) };
    if (!a.free && !this.deps().takeBag(acct, items)) return { status: "bag" };
    const e = this.ev(id);
    const before = num(e.n);
    const n = before + add;
    e.n = String(n);
    const by = this.map(this.bys, id);
    const mine = had + add;
    by.set(acct, mine + a.frac);
    this.map(this.nms, id).set(acct, name);
    if (!e.fest && before * 2 < a.goal * 3 && n * 2 >= a.goal * 3) {
      e.fest = String(a.now);
      e.festBy = acct;
    }
    if (!e.last && before < a.goal && n >= a.goal && a.now >= a.lastFrom) e.last = acct;
    if (!e.at100 && before < a.goal && n >= a.goal) e.at100 = String(a.now);
    return { status: "ok", n, mine, fest: num(e.fest) };
  }
  async top(id: string, k: number) {
    const by = [...(this.bys.get(id) ?? new Map<string, number>())].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? 1 : -1)).slice(0, k);
    const nm = this.nms.get(id);
    return by.map(([acct, s]) => ({ acct, name: nm?.get(acct) ?? "", n: countOf(s) }));
  }
  async capped(id: string, cap: number) {
    return [...(this.bys.get(id)?.values() ?? [])].filter((s) => countOf(s) >= cap).length;
  }
  async mine(ids: readonly string[], acct: string) {
    return ids.map((id) => ({ id, n: countOf(this.bys.get(id)?.get(acct) ?? 0), got: this.gots.get(id)?.get(acct) ?? null }));
  }
  async claim(id: string, acct: string, p: ClaimPlan): Promise<ClaimResult> {
    const d = this.deps();
    if (!d.hasAccount(acct)) return { status: "noacct" };
    const got = this.map(this.gots, id);
    if (got.has(acct)) return { status: "dup" };
    got.set(acct, p.record);
    if (p.pocket) {
      d.giveInv(acct, p.pocket);
      this.map(this.boxes, acct).set(id, String(p.now));
    }
    const stamps = d.addStamps(acct, p.stamps, p.stampCap);
    if (p.hat) d.grantTimed(acct, p.hat.id, p.hat.slot, p.hat.until);
    if (p.kingUntil > 0) d.setTitleUntil(acct, "urgKing", p.kingUntil);
    if (p.lastUntil > 0) d.setTitleUntil(acct, "urgLast", p.lastUntil);
    return { status: "ok", stamps };
  }
  async pockets(acct: string) {
    return [...(this.boxes.get(acct)?.keys() ?? [])].sort();
  }
  async openPocket(acct: string, p: OpenPlan): Promise<OpenResult> {
    const d = this.deps();
    const box = this.boxes.get(acct);
    if (!box?.has(p.id)) return { status: "none" };
    box.delete(p.id);
    d.takeInv(acct, p.pocket);
    let st = p.stamps;
    if (p.dye) d.giveInv(acct, p.dye);
    let fish = false;
    if (p.fish) {
      if (d.bagHas(acct, p.fish) < p.stackMax) {
        d.giveBag(acct, p.fish, 1);
        fish = true;
      } else st += p.fishFallback;
    }
    return { status: "ok", stamps: d.addStamps(acct, st, p.stampCap), fish };
  }
  async pocketDex(acct: string, d: PocketDex, onlyNew: boolean) {
    return this.deps().dexAdd(acct, d, onlyNew);
  }
  async claimedAll(id: string) {
    return Object.fromEntries(this.gots.get(id) ?? new Map<string, string>());
  }
  async saveResult(id: string, json: string, keep: number) {
    const e = this.ev(id);
    if (e.rs === "1") return false;
    e.rs = "1";
    // HMR로 옛 저장소를 이어받았으면 목록이 없을 수 있다
    this.resultLog = [json, ...(this.resultLog ?? [])].slice(0, keep);
    return true;
  }
  async results(limit: number) {
    return (this.resultLog ?? []).slice(0, limit);
  }
  async testGet() {
    return this.test;
  }
  async testSet(t: UrgentTest | null) {
    this.test = t;
  }
}

// ── Redis (운영) ──

// 11/16 목표·한 사람 상한. KEYS: ev  ARGV: 목표, 상한, ttl → {목표, 상한} (저장된 값. 상한이 없으면 false → 0 = 상한 없음)
// 목표를 처음 쓸 때만 상한도 쓴다 — 그 전 코드가 목표만 정해 둔 진행 중 의뢰에 상한을 끼워 넣지 않게
export const URGENT_GOAL_LUA = `
if redis.call('HSETNX', KEYS[1], 'goal', ARGV[1]) == 1 then redis.call('HSET', KEYS[1], 'cap', ARGV[2]) end
redis.call('EXPIRE', KEYS[1], ARGV[3])
return redis.call('HMGET', KEYS[1], 'goal', 'cap')
`;

// KEYS: ev, by, nm, bag  ARGV: 계정, 이름, 목표, 지금, 순위 소수부, 마지막 1분 시작, ttl, 'bag'|'free'(시험: 가방·상한 안 봄), 한 사람 상한(0 = 없음), (id, 개수)...
// → {'ok', 막대, 내 수, fest} | {'bag'} | {'done'} (11/15 이미 150%를 넘겨 끝난 의뢰 — 아무것도 바꾸지 않는다)
//   | {'cap', 더 낼 수 있는 수} (11/16 내 수 + 이번 납품이 상한을 넘는다 — 아무것도 바꾸지 않는다. ZSCORE를 앞으로 옮겨 명령 수는 그대로)
// 11/22 가방은 종 단위로 본다 (대물·월척 칸도 그 종 — 보통부터 낸다, store BAG_TAKE_LUA)
export const URGENT_DELIVER_LUA = `${BAG_TAKE_LUA}
if tonumber(redis.call('HGET', KEYS[1], 'fest') or '0') > 0 then return {'done'} end
local free = ARGV[8] == 'free'
local add = 0
for i = 10, #ARGV, 2 do add = add + tonumber(ARGV[i + 1]) end
local had = math.floor(tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]) or '0') + 1e-9)
local cap = tonumber(ARGV[9])
if not free and cap > 0 and had + add > cap then return {'cap', math.max(0, cap - had)} end
if not free then
  for i = 10, #ARGV, 2 do
    if bagHave(KEYS[4], ARGV[i]) < tonumber(ARGV[i + 1]) then return {'bag'} end
  end
  for i = 10, #ARGV, 2 do bagTake(KEYS[4], ARGV[i], tonumber(ARGV[i + 1])) end
end
local goal, now = tonumber(ARGV[3]), tonumber(ARGV[4])
local n = redis.call('HINCRBY', KEYS[1], 'n', add)
local before = n - add
local mine = had + add
redis.call('ZADD', KEYS[2], mine + tonumber(ARGV[5]), ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], ARGV[2])
if before * 2 < goal * 3 and n * 2 >= goal * 3 then
  redis.call('HSETNX', KEYS[1], 'fest', ARGV[4])
  redis.call('HSETNX', KEYS[1], 'festBy', ARGV[1])
end
if before < goal and n >= goal and now >= tonumber(ARGV[6]) then redis.call('HSETNX', KEYS[1], 'last', ARGV[1]) end
if before < goal and n >= goal then redis.call('HSETNX', KEYS[1], 'at100', ARGV[4]) end
if before == 0 then redis.call('EXPIRE', KEYS[1], ARGV[7]) end
if mine == add then
  redis.call('EXPIRE', KEYS[2], ARGV[7])
  redis.call('EXPIRE', KEYS[3], ARGV[7])
end
return {'ok', n, mine, redis.call('HGET', KEYS[1], 'fest') or '0'}
`;

// KEYS: got, quest, inv, look, stash, tstats, acct, urgbox
// ARGV: 계정, 기록, 도장, 도장 상한, 상자 아이템 id(없으면 ''), 의뢰 id, 모자 id, 모자 부위, 모자 끝, 지금, 배달왕 끝, 마감 끝, ttl
// 기간 꾸미기는 lib/store/accounts-redis.ts TIER_LUA와 같은 자리 규칙 (입고 있으면 그 자리, 아니면 벗어 둔 꾸미기 — 더 길 때만)
// → {'ok', 도장} | {'dup'} | {'noacct'}
export const URGENT_CLAIM_LUA = `
if redis.call('EXISTS', KEYS[7]) == 0 then return {'noacct'} end
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return {'dup'} end
redis.call('EXPIRE', KEYS[1], ARGV[13])
if ARGV[5] ~= '' then
  redis.call('HINCRBY', KEYS[3], ARGV[5], 1)
  redis.call('HSET', KEYS[8], ARGV[6], ARGV[10])
end
local st = tonumber(ARGV[3])
local total = tonumber(redis.call('HGET', KEYS[2], 'st') or '0')
if st > 0 then
  total = math.min(tonumber(ARGV[4]), total + st)
  redis.call('HSET', KEYS[2], 'st', total)
end
if ARGV[7] ~= '' then
  local id, slot, u, now = ARGV[7], ARGV[8], tonumber(ARGV[9]), tonumber(ARGV[10])
  local cur = redis.call('HGET', KEYS[4], slot)
  local ci, cu = nil, 0
  if cur then
    local a, b = string.match(cur, '^([^|]+)|(.+)$')
    ci, cu = a, tonumber(b) or 0
  end
  if ci == id and cu > now then
    if u > cu then redis.call('HSET', KEYS[4], slot, id .. '|' .. u) end
  else
    local had = tonumber(redis.call('HGET', KEYS[5], id) or '0')
    if u > had then redis.call('HSET', KEYS[5], id, u) end
  end
end
if tonumber(ARGV[11]) > 0 then redis.call('HSET', KEYS[6], 'urgKing', ARGV[11]) end
if tonumber(ARGV[12]) > 0 then redis.call('HSET', KEYS[6], 'urgLast', ARGV[12]) end
return {'ok', total}
`;

// 상자 열기. KEYS: urgbox, inv, quest, bag  ARGV: 의뢰 id, 상자 아이템 id, 도장, 도장 상한, 염색권 id, 물고기 id, 가득일 때 도장, 칸 상한
// 표시 HDEL이 먼저라 같은 상자를 두 번 열 수 없다 → {'ok', 도장, 물고기 넣음(1/0)} | {'none'}
export const URGENT_OPEN_LUA = `
if redis.call('HDEL', KEYS[1], ARGV[1]) == 0 then return {'none'} end
if redis.call('HINCRBY', KEYS[2], ARGV[2], -1) <= 0 then redis.call('HDEL', KEYS[2], ARGV[2]) end
local st = tonumber(ARGV[3])
if ARGV[5] ~= '' then redis.call('HINCRBY', KEYS[2], ARGV[5], 1) end
local fish = 0
if ARGV[6] ~= '' then
  if tonumber(redis.call('HGET', KEYS[4], ARGV[6]) or '0') < tonumber(ARGV[8]) then
    redis.call('HINCRBY', KEYS[4], ARGV[6], 1)
    fish = 1
  else
    st = st + tonumber(ARGV[7])
  end
end
local total = tonumber(redis.call('HGET', KEYS[3], 'st') or '0')
if st > 0 then
  total = math.min(tonumber(ARGV[4]), total + st)
  redis.call('HSET', KEYS[3], 'st', total)
end
return {'ok', total, fish}
`;

// KEYS: dex, dexpay  ARGV: 물고기 id, 날짜, 크기(cm×10), 도감 칸, 처음 등록 보상, onlyNew('1'/'0') → 처음 등록이면 1
// 낚을 때(lib/forage/store.ts CLAIM_LUA)와 같은 필드: n:{id} 수 · first:{id} 처음 날 · max:{id} 가장 큰 크기 · 정산한 계정만 p:{칸}에 보상
export const URGENT_POCKET_DEX_LUA = `
local id = ARGV[1]
if ARGV[6] == '1' and tonumber(redis.call('HGET', KEYS[1], 'n:' .. id) or '0') > 0 then return 0 end
local isNew = redis.call('HINCRBY', KEYS[1], 'n:' .. id, 1) == 1
if isNew then
  redis.call('HSET', KEYS[1], 'first:' .. id, ARGV[2])
  if tonumber(ARGV[5]) > 0 and redis.call('HEXISTS', KEYS[2], 'settled') == 1 then redis.call('HINCRBY', KEYS[2], 'p:' .. ARGV[4], tonumber(ARGV[5])) end
end
if tonumber(redis.call('HGET', KEYS[1], 'max:' .. id) or '0') < tonumber(ARGV[3]) then redis.call('HSET', KEYS[1], 'max:' .. id, ARGV[3]) end
return isNew and 1 or 0
`;

// 11/22 결과 기록. KEYS: ev, results  ARGV: 기록 JSON, 남길 수, ttl → 처음이면 1 (표시 rs HSETNX가 먼저 — 두 번 남기지 않는다)
// 의뢰 해시에 TTL이 없으면(처음 만든 키) 같이 건다 — 결과 목록은 TTL 없이 남길 수만큼
export const URGENT_RESULT_LUA = `
if redis.call('HSETNX', KEYS[1], 'rs', '1') == 0 then return 0 end
if redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[3]) end
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[2]) - 1)
return 1
`;

function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

export class RedisUrgentStore implements UrgentStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "forage/quests/urgentStore");
  }
  async state(id: string) {
    return stateOf(hashOf(await this.redis.hgetall(uk.ev(id))));
  }
  async setGoal(id: string, goal: number, cap: number) {
    const r = (await this.redis.eval<string[], unknown[]>(URGENT_GOAL_LUA, [uk.ev(id)], [String(goal), String(cap), String(URGENT_TTL_SEC)])) as unknown[];
    return { goal: num(r?.[0]) || goal, cap: num(r?.[1]) };
  }
  async mark(id: string, field: NoticeField) {
    return Number(await this.redis.hsetnx(uk.ev(id), field, "1")) === 1;
  }
  async deliver(id: string, acct: string, name: string, items: Record<string, number>, a: DeliverArgs): Promise<UrgentDeliverResult> {
    const pairs = Object.entries(items)
      .filter(([, n]) => n > 0)
      .flatMap(([sp, n]) => [sp, String(n)]);
    const r = (await this.redis.eval<string[], unknown[]>(
      URGENT_DELIVER_LUA,
      [uk.ev(id), uk.by(id), uk.nm(id), lk.bag(acct)],
      [acct, name, String(a.goal), String(a.now), String(a.frac), String(a.lastFrom), String(URGENT_TTL_SEC), a.free ? "free" : "bag", String(a.cap), ...pairs],
    )) as unknown[];
    if (String(r?.[0]) === "done") return { status: "done" };
    if (String(r?.[0]) === "cap") return { status: "cap", left: num(r[1]) };
    if (String(r?.[0]) !== "ok") return { status: "bag" };
    return { status: "ok", n: num(r[1]), mine: num(r[2]), fest: num(r[3]) };
  }
  async top(id: string, k: number) {
    const z = ((await this.redis.zrange(uk.by(id), 0, k - 1, { rev: true, withScores: true })) as unknown[]) ?? [];
    const rows: { acct: string; n: number }[] = [];
    for (let i = 0; i + 1 < z.length; i += 2) rows.push({ acct: String(z[i]), n: countOf(Number(z[i + 1]) || 0) });
    if (!rows.length) return [];
    const names = ((await this.redis.hmget(uk.nm(id), ...rows.map((r) => r.acct))) as unknown) ?? [];
    const list = Array.isArray(names) ? names : rows.map((r) => (names as Record<string, unknown>)[r.acct]);
    return rows.map((r, i) => ({ ...r, name: list[i] == null ? "" : String(list[i]) }));
  }
  async capped(id: string, cap: number) {
    return Number(await this.redis.zcount(uk.by(id), cap, "+inf")) || 0;
  }
  async mine(ids: readonly string[], acct: string) {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.zscore(uk.by(id), acct).hget(uk.got(id), acct);
    const r = (await p.exec()) as unknown[];
    return ids.map((id, i) => ({ id, n: countOf(Number(r[i * 2]) || 0), got: r[i * 2 + 1] == null ? null : String(r[i * 2 + 1]) }));
  }
  async claim(id: string, acct: string, p: ClaimPlan): Promise<ClaimResult> {
    const r = (await this.redis.eval<string[], unknown[]>(
      URGENT_CLAIM_LUA,
      [uk.got(id), questKey(acct), K.inv(acct), K.look(acct), K.stash(acct), titleStatsKey(acct), K.acct(acct), uk.box(acct)],
      [
        acct,
        p.record,
        String(p.stamps),
        String(p.stampCap),
        p.pocket,
        id,
        p.hat?.id ?? "",
        p.hat?.slot ?? "",
        String(p.hat?.until ?? 0),
        String(p.now),
        String(p.kingUntil),
        String(p.lastUntil),
        String(URGENT_TTL_SEC),
      ],
    )) as unknown[];
    const s = String(r?.[0]);
    if (s === "ok") return { status: "ok", stamps: num(r[1]) };
    return { status: s === "noacct" ? "noacct" : "dup" };
  }
  async pockets(acct: string) {
    const keys = ((await this.redis.hkeys(uk.box(acct))) as unknown[]) ?? [];
    return keys.map(String).sort();
  }
  async openPocket(acct: string, p: OpenPlan): Promise<OpenResult> {
    const r = (await this.redis.eval<string[], unknown[]>(
      URGENT_OPEN_LUA,
      [uk.box(acct), K.inv(acct), questKey(acct), lk.bag(acct)],
      [p.id, p.pocket, String(p.stamps), String(p.stampCap), p.dye, p.fish, String(p.fishFallback), String(p.stackMax)],
    )) as unknown[];
    if (String(r?.[0]) !== "ok") return { status: "none" };
    return { status: "ok", stamps: num(r[1]), fish: num(r[2]) === 1 };
  }
  async pocketDex(acct: string, d: PocketDex, onlyNew: boolean) {
    const r = await this.redis.eval<string[], unknown>(URGENT_POCKET_DEX_LUA, [lk.dex(acct), lk.pay(acct)], [d.id, d.day, String(d.size), d.cat, String(d.pts), onlyNew ? "1" : "0"]);
    return Number(r) === 1;
  }
  async claimedAll(id: string) {
    return hashOf(await this.redis.hgetall(uk.got(id)));
  }
  async saveResult(id: string, json: string, keep: number) {
    const r = await this.redis.eval<string[], unknown>(URGENT_RESULT_LUA, [uk.ev(id), uk.results], [json, String(keep), String(URGENT_TTL_SEC)]);
    return Number(r) === 1;
  }
  async results(limit: number) {
    const rows = ((await this.redis.lrange<string>(uk.results, 0, limit - 1)) as unknown[]) ?? [];
    return rows.map(String);
  }
  async testGet() {
    const raw = await this.redis.get<string>(uk.test);
    if (!raw) return null;
    try {
      return JSON.parse(String(raw)) as UrgentTest;
    } catch {
      return null;
    }
  }
  async testSet(t: UrgentTest | null) {
    if (t) await this.redis.set(uk.test, JSON.stringify(t), { ex: URGENT_TTL_SEC });
    else await this.redis.del(uk.test);
  }
}

const g = globalThis as typeof globalThis & { __tombUrgent?: UrgentStore };

/** 메모리 구현의 다른 저장소 연결 (lib/forage/quests/urgentService가 넘긴다 — 순환 import를 피하려고) */
export function getUrgentStore(memDeps: () => UrgentMemDeps): UrgentStore {
  const cur = g.__tombUrgent;
  const conn = env.redis();
  if (conn) return cur instanceof RedisUrgentStore ? cur : (g.__tombUrgent = new RedisUrgentStore(conn));
  if (env.isProd()) throw new Error("[urgent] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryUrgentStore) {
    (cur as unknown as { deps: () => UrgentMemDeps }).deps = memDeps;
    return cur;
  }
  const mem = new MemoryUrgentStore(memDeps);
  if (cur) Object.assign(mem, cur, { deps: memDeps });
  return (g.__tombUrgent = mem);
}

import type { Redis } from "@upstash/redis";
import { redisClient } from "../../redisUsage";
import { env } from "../../env";
import { K } from "../../store/keys";
import { styleKey } from "../../store/style";
import { titleStatsKey } from "../../store/titleStats";
import { BAG_TAKE_LUA, lk } from "../store";

// 11/15: 수집 의뢰 저장소. 의뢰 목록은 저장하지 않고(lib/forage/quests/gen이 시드로 만든다) 끝낸 표시·바꾼 칸·도장만 둔다.
// 바뀌는 연산은 하나씩 원자적이다 (Redis는 Lua 한 번, 메모리는 await 없는 구간). store.test.ts가 메모리 구현에 계약을 돌린다.
//
// Redis 키
//  - quest:{a}   HASH  st = 도장 · n = 끝낸 의뢰 수 · day = 오늘 기록의 날짜 · dd = 오늘 칸마다 끝냄 "0100000" · rr = 오늘 바꾼 칸
//                      wk = 주 기록의 주(월요일) · wd = 이번 주 큰 의뢰 끝냄(1) · got:{id} = 교환소 한 번짜리 받은 날 · buy:{id} = 염색권 받은 수
//                      (날짜가 바뀌면 day·dd·rr은 다음 납품·바꾸기 때 새로 쓴다 → 읽을 때는 day가 오늘이 아니면 빈 것으로 본다. TTL 없음)
// 함께 바꾸는 키: 가방 forage:{a}:bag(납품) · 계정 acct:{a}·:inv·:look·:stash·:style(교환) · 칭호 누적 titles:stats:{a}(quests·qking)

export const questKey = (a: string) => `quest:${a}`;

/** 저장된 그대로 (날짜 판단은 questView) */
export type QuestRow = {
  stamps: number;
  total: number;
  day: string | null;
  done: string;
  reroll: number | null;
  week: string | null;
  weekDone: boolean;
  /** 한 번짜리 교환 → 받은 날 */
  got: Record<string, string>;
  /** 여러 번 받는 것 → 받은 수 */
  bought: Record<string, number>;
};

/** 오늘·이번 주 기준으로 본 상태 */
export type QuestView = { done: boolean[]; reroll: number | null; weekDone: boolean };

export function questView(r: QuestRow, today: string, week: string, slots: number): QuestView {
  const fresh = r.day === today;
  return {
    done: Array.from({ length: slots }, (_, i) => fresh && r.done[i] === "1"),
    reroll: fresh ? r.reroll : null,
    weekDone: r.week === week && r.weekDone,
  };
}

/** 납품할 칸: 오늘의 의뢰 slot(그때 본 바꾼 칸 reroll — 그 사이 바뀌었으면 거절) 또는 이번 주 큰 의뢰 */
export type DeliverTarget = { kind: "day"; slot: number; reroll: number | null } | { kind: "week" };
export type DeliverResult = { status: "ok"; stamps: number; total: number } | { status: "done" | "bag" | "changed" };
export type RerollResult = "ok" | "used" | "done";
/** 교환할 것: kind별로 cosmetic이면 부위, body면 몸 id */
export type ExchangeItem = { id: string; price: number; kind: "flag" | "ticket" | "cosmetic" | "body"; slot?: string; body?: string };
export type ExchangeResult = { status: "ok"; stamps: number } | { status: "insufficient" | "owned" | "noacct" };

export interface QuestStore {
  /** 읽기 (Redis 명령 1개) */
  get(acct: string): Promise<QuestRow>;
  /**
   * 납품 (원자적): 이미 끝낸 칸이면 done, 바꾼 칸이 달라졌으면 changed, 가방에 모자라면 bag (아무것도 바뀌지 않는다).
   * 아니면 가방에서 items를 빼고 끝낸 표시 + 도장 stamps(상한 cap) + 끝낸 수 +1 (칭호 누적 quests도 +1)
   */
  deliver(acct: string, today: string, week: string, target: DeliverTarget, stamps: number, cap: number, items: Record<string, number>): Promise<DeliverResult>;
  /** 오늘 의뢰 하나 바꾸기 (원자적, 하루 한 번). 이미 바꿨으면 used, 끝낸 칸이면 done */
  reroll(acct: string, today: string, slot: number): Promise<RerollResult>;
  /**
   * 교환 (원자적): 계정이 없으면 noacct, 한 번짜리를 이미 받았으면(꾸미기는 이미 영구로 가졌어도) owned, 도장이 모자라면 insufficient.
   * 아니면 도장을 빼고 지급: flag = 가방에 표시 1개, ticket = 가방에 1장 더, cosmetic = 영구 소장(입고 있으면 그 자리, 아니면 벗어 둔 꾸미기),
   * body = 외형 해금 + 칭호 누적 qking
   */
  exchange(acct: string, today: string, item: ExchangeItem, permUntil: number): Promise<ExchangeResult>;
}

/** HGETALL → 기록 */
export function rowOf(h: Record<string, string>): QuestRow {
  const got: Record<string, string> = {};
  const bought: Record<string, number> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k.startsWith("got:")) got[k.slice(4)] = v;
    else if (k.startsWith("buy:")) bought[k.slice(4)] = Number(v) || 0;
  }
  const rr = h.rr === undefined || h.rr === "" ? null : Number(h.rr);
  return {
    stamps: Number(h.st) || 0,
    total: Number(h.n) || 0,
    day: h.day || null,
    done: h.dd ?? "",
    reroll: rr === null || Number.isNaN(rr) ? null : rr,
    week: h.wk || null,
    weekDone: h.wd === "1",
    got,
    bought,
  };
}

const setDone = (dd: string, slot: number) => {
  const a = dd.padEnd(slot + 1, "0").split("");
  a[slot] = "1";
  return a.join("");
};

// ── 메모리 (로컬·시험). 다른 저장소의 동기 함수만 불러 await 없이 끝낸다 → 이벤트 루프 안에서 원자적 ──

/** 메모리 구현이 함께 바꾸는 다른 저장소 (모두 동기) */
export type QuestMemDeps = {
  /** 가방에서 빼기 (전부 있을 때만). 11/22 종 단위 — 보통부터 대물·월척 칸 차례로 */
  takeBag(acct: string, items: Record<string, number>): boolean;
  hasAccount(acct: string): boolean;
  /** 계정 가방(acct inv)에 더하기. flag면 1개로 둔다 */
  giveInv(acct: string, itemId: string, flag: boolean): void;
  /** 이미 영구로 가진 꾸미기인지 */
  ownsPermanent(acct: string, itemId: string, slot: string, permUntil: number): boolean;
  grantPermanent(acct: string, itemId: string, slot: string, permUntil: number): void;
  giveBody(acct: string, body: string): void;
  bumpStat(acct: string, field: "quests" | "qking", by: number): void;
};

export class MemoryQuestStore implements QuestStore {
  private rows = new Map<string, Record<string, string>>();
  constructor(private deps: () => QuestMemDeps) {}

  private h(a: string) {
    let x = this.rows.get(a);
    if (!x) this.rows.set(a, (x = {}));
    return x;
  }

  async get(acct: string) {
    return rowOf({ ...(this.rows.get(acct) ?? {}) });
  }

  async deliver(acct: string, today: string, week: string, target: DeliverTarget, stamps: number, cap: number, items: Record<string, number>): Promise<DeliverResult> {
    const h = this.h(acct);
    const fresh = h.day === today;
    if (target.kind === "week") {
      if (h.wk === week && h.wd === "1") return { status: "done" };
    } else {
      const rr = fresh ? (h.rr ?? "") : "";
      if (rr !== (target.reroll === null ? "" : String(target.reroll))) return { status: "changed" };
      if (fresh && (h.dd ?? "")[target.slot] === "1") return { status: "done" };
    }
    if (!this.deps().takeBag(acct, items)) return { status: "bag" };
    if (target.kind === "week") {
      h.wk = week;
      h.wd = "1";
    } else {
      if (!fresh) {
        h.day = today;
        h.dd = "";
        delete h.rr;
      }
      h.dd = setDone(h.dd ?? "", target.slot);
    }
    const st = Math.min(cap, (Number(h.st) || 0) + stamps);
    h.st = String(st);
    h.n = String((Number(h.n) || 0) + 1);
    this.deps().bumpStat(acct, "quests", 1);
    return { status: "ok", stamps: st, total: Number(h.n) };
  }

  /** 도장 더하기 (상한까지, 동기 — 긴급 의뢰 메모리 저장소가 받기와 한 번에 부른다). 새 도장 수 */
  addStampsNow(acct: string, n: number, cap: number): number {
    const h = this.h(acct);
    const st = Math.min(cap, (Number(h.st) || 0) + Math.max(0, n));
    if (n > 0) h.st = String(st);
    return Number(h.st) || 0;
  }

  async reroll(acct: string, today: string, slot: number): Promise<RerollResult> {
    const h = this.h(acct);
    if (h.day !== today) {
      h.day = today;
      h.dd = "";
      delete h.rr;
    }
    if (h.rr !== undefined) return "used";
    if ((h.dd ?? "")[slot] === "1") return "done";
    h.rr = String(slot);
    return "ok";
  }

  async exchange(acct: string, today: string, item: ExchangeItem, permUntil: number): Promise<ExchangeResult> {
    const d = this.deps();
    if (!d.hasAccount(acct)) return { status: "noacct" };
    const h = this.h(acct);
    if (item.kind !== "ticket" && h[`got:${item.id}`] !== undefined) return { status: "owned" };
    if (item.kind === "cosmetic" && d.ownsPermanent(acct, item.id, item.slot!, permUntil)) return { status: "owned" };
    const st = Number(h.st) || 0;
    if (st < item.price) return { status: "insufficient" };
    h.st = String(st - item.price);
    if (item.kind === "ticket") {
      d.giveInv(acct, item.id, false);
      h[`buy:${item.id}`] = String((Number(h[`buy:${item.id}`]) || 0) + 1);
    } else h[`got:${item.id}`] = today;
    if (item.kind === "flag") d.giveInv(acct, item.id, true);
    if (item.kind === "cosmetic") d.grantPermanent(acct, item.id, item.slot!, permUntil);
    if (item.kind === "body") {
      d.giveBody(acct, item.body!);
      d.bumpStat(acct, "qking", 1);
    }
    return { status: "ok", stamps: st - item.price };
  }
}

// ── Redis (운영) ──

// KEYS: quest, bag, tstats  ARGV: today, week, 칸('w' = 이번 주, 아니면 오늘 칸 번호), 본 바꾼 칸('' = 없음), 도장, 상한, (종 id, 개수)...
// → {'ok', 도장, 끝낸 수} | {'done'} | {'changed'} | {'bag'}
// 11/22 가방은 종 단위로 본다 (대물·월척 칸도 그 종 — 보통부터 낸다, store BAG_TAKE_LUA)
export const DELIVER_LUA = `${BAG_TAKE_LUA}
local q = KEYS[1]
local week = ARGV[3] == 'w'
local fresh = redis.call('HGET', q, 'day') == ARGV[1]
local dd = ''
if week then
  if redis.call('HGET', q, 'wk') == ARGV[2] and redis.call('HGET', q, 'wd') == '1' then return {'done'} end
else
  local rr = ''
  if fresh then
    dd = redis.call('HGET', q, 'dd') or ''
    rr = redis.call('HGET', q, 'rr') or ''
  end
  if rr ~= ARGV[4] then return {'changed'} end
  local s = tonumber(ARGV[3]) + 1
  if string.sub(dd, s, s) == '1' then return {'done'} end
end
for i = 7, #ARGV, 2 do
  if bagHave(KEYS[2], ARGV[i]) < tonumber(ARGV[i + 1]) then return {'bag'} end
end
for i = 7, #ARGV, 2 do bagTake(KEYS[2], ARGV[i], tonumber(ARGV[i + 1])) end
if week then
  redis.call('HSET', q, 'wk', ARGV[2], 'wd', '1')
else
  if not fresh then
    redis.call('HDEL', q, 'rr')
    dd = ''
  end
  local s = tonumber(ARGV[3]) + 1
  while string.len(dd) < s do dd = dd .. '0' end
  dd = string.sub(dd, 1, s - 1) .. '1' .. string.sub(dd, s + 1)
  redis.call('HSET', q, 'day', ARGV[1], 'dd', dd)
end
local st = redis.call('HINCRBY', q, 'st', tonumber(ARGV[5]))
if st > tonumber(ARGV[6]) then
  st = tonumber(ARGV[6])
  redis.call('HSET', q, 'st', st)
end
local n = redis.call('HINCRBY', q, 'n', 1)
redis.call('HINCRBY', KEYS[3], 'quests', 1)
return {'ok', st, n}
`;

// KEYS: quest  ARGV: today, 칸  → 'ok' | 'used' | 'done'
export const REROLL_LUA = `
local q = KEYS[1]
if redis.call('HGET', q, 'day') ~= ARGV[1] then
  redis.call('HSET', q, 'day', ARGV[1], 'dd', '')
  redis.call('HDEL', q, 'rr')
end
if redis.call('HEXISTS', q, 'rr') == 1 then return 'used' end
local s = tonumber(ARGV[2]) + 1
local dd = redis.call('HGET', q, 'dd') or ''
if string.sub(dd, s, s) == '1' then return 'done' end
redis.call('HSET', q, 'rr', ARGV[2])
return 'ok'
`;

// KEYS: quest, acct, inv, look, stash, style, tstats  ARGV: id, 값, 종류, 부위, 영구 만료 ms, today, 몸 id
// 꾸미기 영구 지급은 lib/store/staff.ts GRANT_LUA와 같은 규칙 (입고 있으면 그 자리에서 영구로, 아니면 벗어 둔 꾸미기에 영구로)
// → {'ok', 남은 도장} | {'noacct'} | {'owned'} | {'insufficient'}
export const EXCHANGE_LUA = `
local q, id, kind = KEYS[1], ARGV[1], ARGV[3]
if redis.call('EXISTS', KEYS[2]) == 0 then return {'noacct'} end
if kind ~= 'ticket' and redis.call('HEXISTS', q, 'got:' .. id) == 1 then return {'owned'} end
local perm = tonumber(ARGV[5])
local cur, curItem = nil, nil
if kind == 'cosmetic' then
  cur = redis.call('HGET', KEYS[4], ARGV[4])
  local curUntil = 0
  if cur then
    local ci, cu = string.match(cur, '^([^|]+)|(.+)$')
    curItem, curUntil = ci, tonumber(cu) or 0
  end
  if curItem == id and curUntil >= perm then return {'owned'} end
  if tonumber(redis.call('HGET', KEYS[5], id) or '0') >= perm then return {'owned'} end
end
local price = tonumber(ARGV[2])
if tonumber(redis.call('HGET', q, 'st') or '0') < price then return {'insufficient'} end
local st = redis.call('HINCRBY', q, 'st', -price)
if kind == 'ticket' then
  redis.call('HINCRBY', KEYS[3], id, 1)
  redis.call('HINCRBY', q, 'buy:' .. id, 1)
else
  redis.call('HSET', q, 'got:' .. id, ARGV[6])
end
if kind == 'flag' then redis.call('HSET', KEYS[3], id, '1') end
if kind == 'cosmetic' then
  if curItem == id then redis.call('HSET', KEYS[4], ARGV[4], id .. '|' .. ARGV[5]) else redis.call('HSET', KEYS[5], id, ARGV[5]) end
end
if kind == 'body' then
  local owned = redis.call('HGET', KEYS[6], 'bodies') or ''
  if not string.find(',' .. owned .. ',', ',' .. ARGV[7] .. ',', 1, true) then
    if owned == '' then owned = ARGV[7] else owned = owned .. ',' .. ARGV[7] end
    redis.call('HSET', KEYS[6], 'bodies', owned)
  end
  redis.call('HSET', KEYS[7], 'qking', '1')
end
return {'ok', st}
`;

function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

export class RedisQuestStore implements QuestStore {
  private redis: Redis;
  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "forage/quests/store");
  }

  async get(acct: string) {
    return rowOf(hashOf(await this.redis.hgetall(questKey(acct))));
  }

  async deliver(acct: string, today: string, week: string, target: DeliverTarget, stamps: number, cap: number, items: Record<string, number>): Promise<DeliverResult> {
    const pairs = Object.entries(items)
      .filter(([, n]) => n > 0)
      .flatMap(([id, n]) => [id, String(n)]);
    const argv = [
      today,
      week,
      target.kind === "week" ? "w" : String(target.slot),
      target.kind === "day" && target.reroll !== null ? String(target.reroll) : "",
      String(stamps),
      String(cap),
      ...pairs,
    ];
    const r = (await this.redis.eval<string[], unknown[]>(DELIVER_LUA, [questKey(acct), lk.bag(acct), titleStatsKey(acct)], argv)) as unknown[];
    const s = String(r?.[0]);
    if (s === "ok") return { status: "ok", stamps: Number(r[1]) || 0, total: Number(r[2]) || 0 };
    return { status: s === "done" || s === "changed" ? s : "bag" };
  }

  async reroll(acct: string, today: string, slot: number): Promise<RerollResult> {
    const r = String(await this.redis.eval<string[], string>(REROLL_LUA, [questKey(acct)], [today, String(slot)]));
    return r === "ok" || r === "done" ? r : "used";
  }

  async exchange(acct: string, today: string, item: ExchangeItem, permUntil: number): Promise<ExchangeResult> {
    const r = (await this.redis.eval<string[], unknown[]>(
      EXCHANGE_LUA,
      [questKey(acct), K.acct(acct), K.inv(acct), K.look(acct), K.stash(acct), styleKey(acct), titleStatsKey(acct)],
      [item.id, String(item.price), item.kind, item.slot ?? "", String(permUntil), today, item.body ?? ""],
    )) as unknown[];
    const s = String(r?.[0]);
    if (s === "ok") return { status: "ok", stamps: Number(r[1]) || 0 };
    return { status: s === "owned" || s === "noacct" ? s : "insufficient" };
  }
}

const g = globalThis as typeof globalThis & { __tombQuests?: QuestStore };

/** 메모리 구현의 다른 저장소 연결 (lib/forage/quests/service가 넘긴다 — 순환 import를 피하려고) */
export function getQuestStore(memDeps: () => QuestMemDeps): QuestStore {
  const cur = g.__tombQuests;
  const conn = env.redis();
  if (conn) return cur instanceof RedisQuestStore ? cur : (g.__tombQuests = new RedisQuestStore(conn));
  if (env.isProd()) throw new Error("[quests] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryQuestStore) {
    (cur as unknown as { deps: () => QuestMemDeps }).deps = memDeps;
    return cur;
  }
  const mem = new MemoryQuestStore(memDeps);
  if (cur) Object.assign(mem, cur, { deps: memDeps });
  return (g.__tombQuests = mem);
}

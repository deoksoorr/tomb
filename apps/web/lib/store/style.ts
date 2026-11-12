import { Redis } from "@upstash/redis";
import { DYE_PARTS, premiumBody, PREMIUM_BODIES, type AvatarDye, type CosmeticSlot, type DyePart } from "@tomb/protocol";
import { env } from "../env";
import type { DyeTier } from "../dye/palette";
import { kstDay } from "./accounts";
import type { MemoryAccounts } from "./accounts-memory";
import { K } from "./keys";
import { ECON_TTL_SEC, spendCategory, type AccountStore } from "./types";

// 46번 염색 · 25번 외형 바꾸기 · 30번 영구 코디 저장소. 포인트·가방을 함께 바꾸는 연산은 모두 원자적이다
// (Redis는 Lua 한 번, 메모리는 await 없는 구간 — 계정 상태는 MemoryAccounts의 style* 메서드로 바꾼다).
//
// Redis 키
//  - acct:{id}:style   HASH  head/body/accent → "#rrggbb"(염색한 부위만), session → 진행 중인 무작위 염색 JSON,
//                            bodies → 선택권으로 해금한 프리미엄 외형 id (쉼표로 이음)
//  - dye:fixed         HASH  고정 색 염색권 id(dyefix_*) → 정의 JSON {name, color, parts?, createdAt}
//  - dye:fixed:log     LIST  관리자 발급 기록 JSON (최신 먼저 최대 100개)
// 계정 포인트·가방·착용 키(acct:{id}, :inv, :look, :stash, :ledger)와 경제 통계(econ:{날짜})는 accounts-redis.ts와 같이 쓴다.

export const styleKey = (id: string) => `acct:${id}:style`;
const FIXED_KEY = "dye:fixed";
const FIXED_LOG_KEY = "dye:fixed:log";

/** 진행 중인 무작위 염색 한 판 */
export type DyeSession = {
  seed: string;
  tier: DyeTier;
  part: DyePart;
  itemId: string;
  startedAt: number;
  endsAt: number;
  /** 시간이 끝난 순간 조준점 색 (서버가 판정). decideBy까지 "새 색으로"/"지금 색 유지"를 고른다 */
  candidate?: DyeCandidate;
};
export type DyeCandidate = { color: string; decideBy: number };
/** 관리자가 만든 고정 색 염색권 */
export type FixedDyeDef = { id: string; name: string; color: string; parts?: DyePart[]; createdAt: number };
/** 관리자 발급 기록 (giftId = 선물함으로 보낸 선물) */
export type FixedDyeIssue = { at: number; defId: string; name: string; color: string; count: number; target: "all" | string; giftId: string };

/** bodies = 선택권으로 영구 해금한 프리미엄 외형 */
export type StyleState = { dye: AvatarDye; session: DyeSession | null; bodies: string[] };
export type ChargeResult = "ok" | "insufficient" | "same";
/** 외형 바꾸기 결과: ok = 소장한 외형으로 무료로 바꿨다, unlocked = 프리미엄 외형을 이번에 해금하면서 바꿨다 (선택권 값을 냈다) */
export type ReshapeResult = ChargeResult | "unlocked";
/** 아직 해금하지 않은 프리미엄 외형이면 이 값·사유로 해금하면서 바꾼다 (이미 소장했으면 무료) */
export type ReshapeUnlock = { price: number; reason: string };
/** 선택권으로 해금하는(소장 기록이 남는) 외형 id — 쉼표로 이어 Lua에 넘긴다 */
const PREMIUM_IDS = PREMIUM_BODIES.map((b) => b.id).join(",");

export interface StyleStore {
  get(id: string): Promise<StyleState>;
  /**
   * 무작위 염색 시작: 진행 중인 판이 있으면 그 판(resumed, 염색권을 쓰지 않는다). 없으면 염색권 1장을 쓰고 새 판을 연다.
   * 가방에 염색권이 없으면 null. 시간이 지난 판은 호출자가 먼저 finish로 끝낸다
   */
  begin(id: string, itemId: string, session: DyeSession): Promise<{ session: DyeSession; resumed: boolean } | null>;
  /** 진행 중인 판(seed)을 끝내고 그 판의 부위를 color로. 판이 없거나 다른 판이면 false (두 번 끝낼 수 없다) */
  finish(id: string, seed: string, color: string): Promise<boolean>;
  /** 진행 중인 판(seed)에 후보 색을 적는다. 판이 없거나 다른 판이거나 이미 후보가 있으면 false */
  propose(id: string, seed: string, candidate: DyeCandidate): Promise<boolean>;
  /** 진행 중인 판(seed)을 색을 바꾸지 않고 끝낸다 (염색권은 돌려주지 않는다). 판이 없거나 다른 판이면 false */
  cancel(id: string, seed: string): Promise<boolean>;
  /** 고정 색 염색권 1장을 쓰고 part를 color로. 가방에 없으면 false */
  applyFixed(id: string, itemId: string, part: DyePart, color: string): Promise<boolean>;
  /** price 포인트를 내고 part를 기본색으로 되돌린다. 이미 기본색이면 "same" (포인트를 쓰지 않는다) */
  reset(id: string, part: DyePart, price: number, reason: string, now: number): Promise<ChargeResult>;
  /**
   * 몸 모양을 바꾼다 (부위 색은 그대로 따라간다). 이미 그 몸이면 "same".
   * 소장한 외형(처음 6종 · 해금한 프리미엄)끼리는 무료. unlock이 있고 아직 해금 전인 프리미엄 외형이면
   * unlock.price를 내고 영구 해금까지 한 번에 ("unlocked"). 입고 있던 프리미엄 외형이 소장 기록에 빠져 있으면 함께 채운다
   */
  reshape(id: string, body: string, now: number, unlock?: ReshapeUnlock): Promise<ReshapeResult>;
  /**
   * 영구 꾸미기 구매: 이미 영구로 가졌으면 "owned", 가방에 같은 꾸미기 이용권(새것)이 있으면 "ticket",
   * 포인트가 모자라면 "insufficient". 사면 입고 있던 기간제는 그대로 영구가 되고, 아니면 벗어 둔 꾸미기에 영구로 들어간다
   */
  buyPermanent(id: string, itemId: string, slot: CosmeticSlot, price: number, permUntil: number, reason: string, now: number): Promise<"ok" | "insufficient" | "owned" | "ticket">;
  putFixed(def: FixedDyeDef): Promise<void>;
  /** ids가 없으면 전부 */
  fixedDefs(ids?: readonly string[]): Promise<Record<string, FixedDyeDef>>;
  logIssue(e: FixedDyeIssue): Promise<void>;
  issues(): Promise<FixedDyeIssue[]>;
}

/** HGETALL 결과 → 객체 (automaticDeserialization: false면 [필드, 값, …] 평평한 배열로 온다) */
function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}

function dyeOf(h: Record<string, string>): AvatarDye {
  const out: AvatarDye = {};
  for (const p of DYE_PARTS) if (h[p]) out[p] = h[p];
  return out;
}

function parseSession(raw: string | undefined | null): DyeSession | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DyeSession;
  } catch {
    return null;
  }
}

// ── 메모리 (로컬 개발) ──

export class MemoryStyle implements StyleStore {
  private styles = new Map<string, { dye: AvatarDye; session: DyeSession | null; bodies?: string[] }>();
  private fixed = new Map<string, FixedDyeDef>();
  private log: FixedDyeIssue[] = [];
  /** 계정 저장소 (HMR로 바뀌어도 최신 것을 쓰게 매번 받는다) */
  accounts: () => MemoryAccounts = () => {
    throw new Error("[style] 계정 저장소가 없습니다");
  };

  private st(id: string) {
    let s = this.styles.get(id);
    if (!s) this.styles.set(id, (s = { dye: {}, session: null }));
    return s;
  }

  async get(id: string): Promise<StyleState> {
    const s = this.styles.get(id);
    return { dye: { ...(s?.dye ?? {}) }, session: s?.session ? { ...s.session } : null, bodies: [...(s?.bodies ?? [])] };
  }

  async begin(id: string, itemId: string, session: DyeSession) {
    const s = this.st(id);
    if (s.session) return { session: { ...s.session }, resumed: true };
    if (!this.accounts().styleTake(id, itemId)) return null;
    s.session = { ...session };
    return { session: { ...session }, resumed: false };
  }

  async finish(id: string, seed: string, color: string): Promise<boolean> {
    const s = this.styles.get(id);
    if (!s?.session || s.session.seed !== seed) return false;
    s.dye = { ...s.dye, [s.session.part]: color };
    s.session = null;
    return true;
  }

  async propose(id: string, seed: string, candidate: DyeCandidate): Promise<boolean> {
    const s = this.styles.get(id);
    if (!s?.session || s.session.seed !== seed || s.session.candidate) return false;
    s.session = { ...s.session, candidate: { ...candidate } };
    return true;
  }

  async cancel(id: string, seed: string): Promise<boolean> {
    const s = this.styles.get(id);
    if (!s?.session || s.session.seed !== seed) return false;
    s.session = null;
    return true;
  }

  async applyFixed(id: string, itemId: string, part: DyePart, color: string): Promise<boolean> {
    if (!this.accounts().styleTake(id, itemId)) return false;
    const s = this.st(id);
    s.dye = { ...s.dye, [part]: color };
    return true;
  }

  async reset(id: string, part: DyePart, price: number, reason: string, now: number): Promise<ChargeResult> {
    const s = this.st(id);
    if (!s.dye[part]) return "same";
    if (!this.accounts().styleCharge(id, price, reason, now)) return "insufficient";
    const next = { ...s.dye };
    delete next[part];
    s.dye = next;
    return "ok";
  }

  async reshape(id: string, body: string, now: number, unlock?: ReshapeUnlock): Promise<ReshapeResult> {
    const accts = this.accounts();
    const cur = accts.styleBody(id) ?? "hood";
    if (cur === body) return "same";
    const s = this.st(id);
    // 입고 있던 프리미엄 외형은 소장한 것 (기록이 빠졌어도 되살린다 — RESHAPE_LUA와 같은 규칙)
    if (premiumBody(cur) && !(s.bodies ?? []).includes(cur)) s.bodies = [...(s.bodies ?? []), cur];
    const fresh = !!unlock && !(s.bodies ?? []).includes(body);
    if (fresh && !accts.styleCharge(id, unlock.price, unlock.reason, now)) return "insufficient";
    if (fresh) s.bodies = [...(s.bodies ?? []), body];
    accts.styleSetBody(id, body);
    return fresh ? "unlocked" : "ok";
  }

  async buyPermanent(id: string, itemId: string, slot: CosmeticSlot, price: number, permUntil: number, reason: string, now: number) {
    const accts = this.accounts();
    const state = accts.stylePermanent(id, itemId, slot, permUntil, now, false);
    if (state !== "ok") return state;
    if (!accts.styleCharge(id, price, reason, now)) return "insufficient" as const;
    accts.stylePermanent(id, itemId, slot, permUntil, now, true);
    return "ok" as const;
  }

  async putFixed(def: FixedDyeDef): Promise<void> {
    this.fixed.set(def.id, { ...def });
  }

  async fixedDefs(ids?: readonly string[]): Promise<Record<string, FixedDyeDef>> {
    const out: Record<string, FixedDyeDef> = {};
    for (const [id, d] of this.fixed) if (!ids || ids.includes(id)) out[id] = { ...d };
    return out;
  }

  async logIssue(e: FixedDyeIssue): Promise<void> {
    this.log = [e, ...this.log].slice(0, 100);
  }

  async issues(): Promise<FixedDyeIssue[]> {
    return [...this.log];
  }
}

// ── Redis ──

/** 가방에서 1개 꺼내기 (accounts-redis.ts TAKE_FN과 같다) */
const TAKE_FN = `
local function take(inv, item)
  if tonumber(redis.call('HGET', inv, item) or '0') < 1 then return false end
  if redis.call('HINCRBY', inv, item, -1) <= 0 then redis.call('HDEL', inv, item) end
  return true
end
`;

/** 포인트 내기 + 사용 기록 + 경제 통계 (accounts-redis.ts SPEND_LUA와 같은 규칙). c = {acct, ledger, econ} */
const CHARGE_FN = `
local function charge(acct, ledger, econ, amount, entry, field)
  if tonumber(redis.call('HGET', acct, 'points') or '0') < amount then return false end
  redis.call('HINCRBY', acct, 'points', -amount)
  redis.call('LPUSH', ledger, entry)
  redis.call('LTRIM', ledger, 0, 99)
  redis.call('HINCRBY', econ, field, amount)
  redis.call('EXPIRE', econ, ${ECON_TTL_SEC})
  return true
end
`;

// KEYS: inv, style  ARGV: itemId, sessionJson  → {2, 진행 중 JSON} | {1, 새 JSON} | {0, ''}(염색권 없음)
const BEGIN_LUA = `${TAKE_FN}
local cur = redis.call('HGET', KEYS[2], 'session')
if cur then return {2, cur} end
if not take(KEYS[1], ARGV[1]) then return {0, ''} end
redis.call('HSET', KEYS[2], 'session', ARGV[2])
return {1, ARGV[2]}
`;

// KEYS: style  ARGV: seed, color
const FINISH_LUA = `
local cur = redis.call('HGET', KEYS[1], 'session')
if not cur then return 0 end
if string.match(cur, '"seed":"([^"]+)"') ~= ARGV[1] then return 0 end
local part = string.match(cur, '"part":"([a-z]+)"')
if not part then return 0 end
redis.call('HDEL', KEYS[1], 'session')
redis.call('HSET', KEYS[1], part, ARGV[2])
return 1
`;

// KEYS: style  ARGV: seed, candidateJson  (판 JSON 끝에 candidate를 붙인다 — 이미 있으면 0)
const PROPOSE_LUA = `
local cur = redis.call('HGET', KEYS[1], 'session')
if not cur then return 0 end
if string.match(cur, '"seed":"([^"]+)"') ~= ARGV[1] then return 0 end
if string.find(cur, '"candidate"', 1, true) then return 0 end
redis.call('HSET', KEYS[1], 'session', string.sub(cur, 1, -2) .. ',"candidate":' .. ARGV[2] .. '}')
return 1
`;

// KEYS: style  ARGV: seed
const CANCEL_LUA = `
local cur = redis.call('HGET', KEYS[1], 'session')
if not cur then return 0 end
if string.match(cur, '"seed":"([^"]+)"') ~= ARGV[1] then return 0 end
redis.call('HDEL', KEYS[1], 'session')
return 1
`;

// KEYS: inv, style  ARGV: itemId, part, color
const FIXED_LUA = `${TAKE_FN}
if not take(KEYS[1], ARGV[1]) then return 0 end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1
`;

// KEYS: acct, ledger, econ, style  ARGV: part, price, entry, field  → -1 같음 | 0 부족 | 1
const RESET_LUA = `${CHARGE_FN}
if redis.call('HEXISTS', KEYS[4], ARGV[1]) == 0 then return -1 end
if not charge(KEYS[1], KEYS[2], KEYS[3], tonumber(ARGV[2]), ARGV[3], ARGV[4]) then return 0 end
redis.call('HDEL', KEYS[4], ARGV[1])
return 1
`;

// 소장한 외형(처음 6종 · bodies에 적힌 프리미엄)끼리는 무료. 해금 전 프리미엄만 선택권 값을 내고 bodies에 더한다.
// 입고 있던 프리미엄 외형이 bodies에 빠져 있으면 함께 채운다 (입고 있었다 = 소장한 것)
// KEYS: acct, ledger, econ, style  ARGV: body, premiumIds(쉼표), unlockPrice('' = 프리미엄 아님), unlockEntry, field
// → -1 같은 몸 | 0 부족 | 1 바꿈(무료) | 2 해금하면서 바꿈
const RESHAPE_LUA = `${CHARGE_FN}
local function has(list, id) return string.find(',' .. list .. ',', ',' .. id .. ',', 1, true) ~= nil end
local cur = redis.call('HGET', KEYS[1], 'body') or 'hood'
if cur == ARGV[1] then return -1 end
local owned = redis.call('HGET', KEYS[4], 'bodies') or ''
local function own(id) owned = owned == '' and id or (owned .. ',' .. id) end
local before = owned
if has(ARGV[2], cur) and not has(owned, cur) then own(cur) end
local fresh = ARGV[3] ~= '' and not has(owned, ARGV[1])
local ok = (not fresh) or charge(KEYS[1], KEYS[2], KEYS[3], tonumber(ARGV[3]), ARGV[4], ARGV[5])
if ok and fresh then own(ARGV[1]) end
if owned ~= before then redis.call('HSET', KEYS[4], 'bodies', owned) end
if not ok then return 0 end
redis.call('HSET', KEYS[1], 'body', ARGV[1])
if fresh then return 2 end
return 1
`;

// 30번 영구 꾸미기. look = HASH 부위 → `${itemId}|${만료 ms}`, stash = HASH itemId → 만료 ms (accounts-redis.ts LOOK_FN과 같은 모양)
// KEYS: acct, inv, look, stash, ledger, econ  ARGV: itemId, slot, price, now, permUntil, entry, field
// → -1 이미 영구 | -2 가방에 이용권 | 0 부족 | 1
const PERMANENT_LUA = `${CHARGE_FN}
local item, slot, now, perm = ARGV[1], ARGV[2], tonumber(ARGV[4]), tonumber(ARGV[5])
local cur = redis.call('HGET', KEYS[3], slot)
local curItem, curUntil = nil, 0
if cur then
  local i, u = string.match(cur, '^([^|]+)|(.+)$')
  curItem, curUntil = i, tonumber(u) or 0
end
if curItem == item and curUntil >= perm then return -1 end
if tonumber(redis.call('HGET', KEYS[4], item) or '0') >= perm then return -1 end
if tonumber(redis.call('HGET', KEYS[2], item) or '0') > 0 then return -2 end
if not charge(KEYS[1], KEYS[5], KEYS[6], tonumber(ARGV[3]), ARGV[6], ARGV[7]) then return 0 end
if curItem == item and curUntil > now then
  redis.call('HSET', KEYS[3], slot, item .. '|' .. ARGV[5])
else
  redis.call('HSET', KEYS[4], item, ARGV[5])
end
return 1
`;

export class RedisStyle implements StyleStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async get(id: string): Promise<StyleState> {
    const h = hashOf(await this.redis.hgetall(styleKey(id)));
    return { dye: dyeOf(h), session: parseSession(h.session), bodies: h.bodies ? h.bodies.split(",").filter(Boolean) : [] };
  }

  async begin(id: string, itemId: string, session: DyeSession) {
    const [code, raw] = await this.redis.eval<string[], [number, string]>(BEGIN_LUA, [K.inv(id), styleKey(id)], [itemId, JSON.stringify(session)]);
    if (Number(code) === 0) return null;
    const s = parseSession(String(raw));
    return s ? { session: s, resumed: Number(code) === 2 } : null;
  }

  async finish(id: string, seed: string, color: string): Promise<boolean> {
    return Number(await this.redis.eval<string[], number>(FINISH_LUA, [styleKey(id)], [seed, color])) === 1;
  }

  async propose(id: string, seed: string, candidate: DyeCandidate): Promise<boolean> {
    const json = JSON.stringify({ color: candidate.color, decideBy: candidate.decideBy });
    return Number(await this.redis.eval<string[], number>(PROPOSE_LUA, [styleKey(id)], [seed, json])) === 1;
  }

  async cancel(id: string, seed: string): Promise<boolean> {
    return Number(await this.redis.eval<string[], number>(CANCEL_LUA, [styleKey(id)], [seed])) === 1;
  }

  async applyFixed(id: string, itemId: string, part: DyePart, color: string): Promise<boolean> {
    return Number(await this.redis.eval<string[], number>(FIXED_LUA, [K.inv(id), styleKey(id)], [itemId, part, color])) === 1;
  }

  private entry(amount: number, reason: string, now: number): string {
    return JSON.stringify({ at: now, amount: -amount, reason });
  }

  async reset(id: string, part: DyePart, price: number, reason: string, now: number): Promise<ChargeResult> {
    const r = Number(
      await this.redis.eval<string[], number>(RESET_LUA, [K.acct(id), K.ledger(id), K.econ(kstDay(now)), styleKey(id)], [
        part,
        String(price),
        this.entry(price, reason, now),
        `spend:${spendCategory(reason)}`,
      ]),
    );
    return r === 1 ? "ok" : r === 0 ? "insufficient" : "same";
  }

  async reshape(id: string, body: string, now: number, unlock?: ReshapeUnlock): Promise<ReshapeResult> {
    const r = Number(
      await this.redis.eval<string[], number>(RESHAPE_LUA, [K.acct(id), K.ledger(id), K.econ(kstDay(now)), styleKey(id)], [
        body,
        PREMIUM_IDS,
        unlock ? String(unlock.price) : "",
        unlock ? this.entry(unlock.price, unlock.reason, now) : "",
        unlock ? `spend:${spendCategory(unlock.reason)}` : "",
      ]),
    );
    return r === 2 ? "unlocked" : r === 1 ? "ok" : r === 0 ? "insufficient" : "same";
  }

  async buyPermanent(id: string, itemId: string, slot: CosmeticSlot, price: number, permUntil: number, reason: string, now: number) {
    const r = Number(
      await this.redis.eval<string[], number>(
        PERMANENT_LUA,
        [K.acct(id), K.inv(id), K.look(id), K.stash(id), K.ledger(id), K.econ(kstDay(now))],
        [itemId, slot, String(price), String(now), String(permUntil), this.entry(price, reason, now), `spend:${spendCategory(reason)}`],
      ),
    );
    return r === 1 ? ("ok" as const) : r === 0 ? ("insufficient" as const) : r === -2 ? ("ticket" as const) : ("owned" as const);
  }

  async putFixed(def: FixedDyeDef): Promise<void> {
    await this.redis.hset(FIXED_KEY, { [def.id]: JSON.stringify(def) });
  }

  async fixedDefs(ids?: readonly string[]): Promise<Record<string, FixedDyeDef>> {
    const out: Record<string, FixedDyeDef> = {};
    if (ids && !ids.length) return out;
    let rows: [string, string | null][];
    if (ids) {
      // HMGET은 값 배열(요청 순서) 또는 객체로 온다
      const raw = (await this.redis.hmget(FIXED_KEY, ...ids)) as unknown as Record<string, string | null> | (string | null)[] | null;
      rows = Array.isArray(raw) ? ids.map((id, i) => [id, raw[i] ?? null]) : Object.entries(raw ?? {});
    } else rows = Object.entries(hashOf(await this.redis.hgetall(FIXED_KEY)));
    for (const [id, raw] of rows) {
      if (!raw) continue;
      try {
        out[id] = JSON.parse(raw) as FixedDyeDef;
      } catch {
        /* 깨진 정의는 건너뛴다 */
      }
    }
    return out;
  }

  async logIssue(e: FixedDyeIssue): Promise<void> {
    await this.redis.multi().lpush(FIXED_LOG_KEY, JSON.stringify(e)).ltrim(FIXED_LOG_KEY, 0, 99).exec();
  }

  async issues(): Promise<FixedDyeIssue[]> {
    const rows = await this.redis.lrange<string>(FIXED_LOG_KEY, 0, -1);
    return rows.flatMap((r) => {
      try {
        return [JSON.parse(r) as FixedDyeIssue];
      } catch {
        return [];
      }
    });
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombStyle?: StyleStore };

/** accounts = getAccounts() (로컬이면 MemoryAccounts — 포인트·가방을 같이 바꾼다) */
export function getStyleStore(accounts: AccountStore): StyleStore {
  const cur = g.__tombStyle;
  const conn = env.redis();
  if (conn) return cur instanceof RedisStyle ? cur : (g.__tombStyle = new RedisStyle(conn));
  if (env.isProd()) throw new Error("[style] Redis 환경변수가 없습니다.");
  const mem = cur instanceof MemoryStyle ? cur : (g.__tombStyle = cur ? Object.assign(new MemoryStyle(), cur) : new MemoryStyle());
  mem.accounts = () => accounts as MemoryAccounts;
  return mem;
}

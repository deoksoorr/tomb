import { Redis } from "@upstash/redis";
import {
  defaultExterior,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  LEGACY_HOUSING_CHANNEL,
  LIKE_WEIGHT,
  VILLAGE_MAX_LOTS,
  type HouseSort,
  type PlotTierId,
} from "./catalog";
import { emptyLayout, normalizeExterior } from "./layout";
import {
  GUEST_DAY_TTL_SEC,
  GUEST_REPORT_TTL_SEC,
  LIKE_TTL_SEC,
  scoreOf,
  type HouseRecord,
  type CreateResult,
  type HouseStore,
  type NewHouse,
  type SaveResult,
  type StoredGuest,
} from "./store";
import { parsePlant, type PlantState } from "./plants";
import { parseState, stateSigs, WINDOW_SIG, type HouseState } from "./states";
import type { HouseExterior, HouseLayout } from "./types";

// Redis 키 (집 id = 계정 id의 HMAC. 계정 id는 키에도 공개 응답에도 드러나지 않는다)
//  house:{id}                HASH owner, name, intro, ownerName, tier, ch, lot, exterior(JSON), createdAt, updatedAt, likes, placedScore, items, hidden
//                            (ch가 없으면 채널이 생기기 전에 분양된 집 → 1채널)
//  houses:lots:{ch}          HASH 번지 → 집 id (채널마다 분양 마을이 따로. 번지 배정은 HEXISTS 확인과 HSET을 Lua 하나로)
//  houses:lots               HASH 옛 번지 색인 (채널 없음). 1채널 색인을 쓰는 Lua가 먼저 houses:lots:1로 옮긴다 (MIGRATE_FN)
//  house:{id}:layout         STRING 배치 JSON
//  house:{id}:inv            HASH 물건 id → 가진 개수 (놓은 것 포함)
//  house:{id}:placed         HASH 물건 id → 놓은 개수 (되팔기 판정용, 배치 저장과 같이 바뀐다)
//  house:{id}:guest          LIST 방명록 JSON, 최신 먼저 GUEST_KEEP개
//  house:{id}:guesthide      SET 가린 글 id
//  house:{id}:guestrep       HASH 글 id → 신고 수
//  house:{id}:guestrep:{eid} SET 신고한 IP 해시 (30일)
//  house:{id}:plants         HASH 화분 배치 id → {n, at} JSON (3번 물 주기)
//  house:{id}:states         HASH 가구 배치 id(창문 "w0"…) → {a, s} JSON (3번 불·스탠드·라디오·창문. s = 서명, states.ts)
//  house:{id}:like:{visitor}:{yyyymmdd}  STRING NX EX (하루 1회 좋아요)
//  house:guestday:{visitor}:{yyyymmdd}   STRING 오늘 남긴 방명록 수
//  houses:all                ZSET 분양 시각 (숨김 포함, 관리자 목록)
//  houses:new / houses:score / houses:likes   ZSET 공개 목록 (숨긴 집은 빠진다)
export const HK = {
  meta: (id: string) => `house:${id}`,
  layout: (id: string) => `house:${id}:layout`,
  inv: (id: string) => `house:${id}:inv`,
  placed: (id: string) => `house:${id}:placed`,
  guest: (id: string) => `house:${id}:guest`,
  guestHide: (id: string) => `house:${id}:guesthide`,
  guestRep: (id: string) => `house:${id}:guestrep`,
  guestRepIps: (id: string, eid: string) => `house:${id}:guestrep:${eid}`,
  plants: (id: string) => `house:${id}:plants`,
  states: (id: string) => `house:${id}:states`,
  like: (id: string, visitor: string, day: string) => `house:${id}:like:${visitor}:${day}`,
  guestDay: (visitor: string, day: string) => `house:guestday:${visitor}:${day}`,
  all: "houses:all",
  new: "houses:new",
  score: "houses:score",
  likes: "houses:likes",
  /** 채널 ch의 번지 색인 */
  lots: (ch: number) => `houses:lots:${ch}`,
  /** 옛 번지 색인 (채널이 생기기 전. 읽기 호환·이전용) */
  legacyLots: "houses:lots",
};

const isLegacyCh = (ch: number) => (ch === LEGACY_HOUSING_CHANNEL ? "1" : "0");

const SORT_KEY: Record<HouseSort, string> = { score: HK.score, likes: HK.likes, new: HK.new };

// 가장 앞의 빈 번지 (없으면 nil)
const FREE_LOT_FN = `
local function freeLot(lots, max)
  for l = 1, max do
    if redis.call('HEXISTS', lots, tostring(l)) == 0 then return l end
  end
  return nil
end
`;

// 옛 번지 색인(houses:lots, 채널 없음)을 1채널 색인(houses:lots:1)으로 옮긴다. 같은 번지 그대로.
//  - 1채널에 그 번지가 비어 있으면 옮기고, 이미 같은 집이면(이전에 옮김) 옛 칸만 지운다 → 몇 번을 돌아도 결과가 같다(멱등)
//  - 1채널의 그 번지에 다른 집이 있으면(있어서는 안 되는 충돌) 옛 칸을 지우지 않고 남겨 둔다 (지우지 않는다. left로 알린다)
//  - 1채널 색인을 쓰는 Lua(분양·번지 배정·마을 읽기) 안에서 먼저 불러, 옮기기와 그 동작이 한 번에(원자적으로) 일어난다
const MIGRATE_FN = `
local function migrateLegacy(legacy, lots1)
  local flat = redis.call('HGETALL', legacy)
  local moved = 0
  for i = 1, #flat, 2 do
    local cur = redis.call('HGET', lots1, flat[i])
    if not cur then
      redis.call('HSET', lots1, flat[i], flat[i + 1])
      redis.call('HDEL', legacy, flat[i])
      moved = moved + 1
    elseif cur == flat[i + 1] then
      redis.call('HDEL', legacy, flat[i])
    end
  end
  return moved
end
`;

// KEYS: legacyLots, lots:1  반환: {옮긴 수, 옛 색인에 남은 수(충돌)}
const MIGRATE_LUA = `${MIGRATE_FN}
local moved = migrateLegacy(KEYS[1], KEYS[2])
return {moved, redis.call('HLEN', KEYS[1])}
`;

// 한 채널의 번지 색인 (1채널이면 옛 색인을 먼저 옮기고 읽는다)
// KEYS: lots(ch), legacyLots  ARGV: legacy('1'|'0')
const VILLAGE_LUA = `${MIGRATE_FN}
if ARGV[1] == '1' then migrateLegacy(KEYS[2], KEYS[1]) end
return redis.call('HGETALL', KEYS[1])
`;

// KEYS: meta, layout, all, new, score, likes, lots(ch), legacyLots
// ARGV: id, owner, name, intro, ownerName, tier, now, emptyLayout, lot(''=자동), maxLots, exteriorJson, ch, legacy('1'|'0')
// 반환: 번지, -1 이미 있음, -2 그 번지는 이미 분양됨, -3 빈 번지 없음
const CREATE_LUA = `${FREE_LOT_FN}${MIGRATE_FN}
if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
if ARGV[13] == '1' then migrateLegacy(KEYS[8], KEYS[7]) end
local lot
if ARGV[9] ~= '' then
  if redis.call('HEXISTS', KEYS[7], ARGV[9]) == 1 then return -2 end
  lot = tonumber(ARGV[9])
else
  lot = freeLot(KEYS[7], tonumber(ARGV[10]))
  if not lot then return -3 end
end
redis.call('HSET', KEYS[7], tostring(lot), ARGV[1])
redis.call('HSET', KEYS[1], 'owner', ARGV[2], 'name', ARGV[3], 'intro', ARGV[4], 'ownerName', ARGV[5], 'tier', ARGV[6],
  'createdAt', ARGV[7], 'updatedAt', ARGV[7], 'likes', 0, 'placedScore', 0, 'items', 0, 'ch', ARGV[12], 'lot', lot, 'exterior', ARGV[11])
redis.call('SET', KEYS[2], ARGV[8])
redis.call('ZADD', KEYS[3], ARGV[7], ARGV[1])
redis.call('ZADD', KEYS[4], ARGV[7], ARGV[1])
redis.call('ZADD', KEYS[5], 0, ARGV[1])
redis.call('ZADD', KEYS[6], 0, ARGV[1])
return lot
`;

// 번지가 없는 예전 집에 그 집 채널(ch 없으면 1)의 빈 번지를 준다
// KEYS: meta, lots(ch), legacyLots  ARGV: id, maxLots, legacy('1'|'0')
const ASSIGN_LOT_LUA = `${FREE_LOT_FN}${MIGRATE_FN}
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[3] == '1' then migrateLegacy(KEYS[3], KEYS[2]) end
local cur = tonumber(redis.call('HGET', KEYS[1], 'lot') or '0')
if cur > 0 then return cur end
local lot = freeLot(KEYS[2], tonumber(ARGV[2]))
if not lot then return 0 end
redis.call('HSET', KEYS[2], tostring(lot), ARGV[1])
redis.call('HSET', KEYS[1], 'lot', lot)
return lot
`;

// 집을 지울 때 번지 칸도 비운다 (그 칸이 이 집일 때만. 옛 색인에 남은 칸도)
// KEYS: lots(ch), legacyLots  ARGV: lot, id
const UNLOT_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then redis.call('HDEL', KEYS[1], ARGV[1]) end
if redis.call('HGET', KEYS[2], ARGV[1]) == ARGV[2] then redis.call('HDEL', KEYS[2], ARGV[1]) end
return 1
`;

// KEYS: meta  ARGV: from, to, now
const UPGRADE_LUA = `
if redis.call('HGET', KEYS[1], 'tier') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'tier', ARGV[2], 'updatedAt', ARGV[3])
return 1
`;

// KEYS: meta, inv  ARGV: itemId, max
const ADD_ITEM_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
if tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0') >= tonumber(ARGV[2]) then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
return 1
`;

// KEYS: inv, placed  ARGV: itemId
const TAKE_ITEM_LUA = `
local n = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
if n < 1 then return -1 end
if n - tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0') < 1 then return 0 end
if redis.call('HINCRBY', KEYS[1], ARGV[1], -1) <= 0 then redis.call('HDEL', KEYS[1], ARGV[1]) end
return 1
`;

// 가진 개수 확인과 배치·놓은 개수·점수 갱신을 한 번에 (되팔기와 경합해 가진 것보다 많이 놓이지 않게)
// 배치가 바뀌면 같은 Lua에서 치우거나 옮긴 가구 상태(서명이 다른 것)와 없어진 화분 기록을 지운다 (states.ts keepState와 같은 규칙)
// KEYS: meta, layout, inv, placed, score, states, plants
// ARGV: id, tier, layoutJson(''=그대로), placedScore, itemsCount, now, likeWeight, exteriorJson(''=그대로),
//       sigsJson(배치 id → 서명, 상태 없는 가구는 ''), potsJson(화분 배치 id → true), [itemId, count]...
const SAVE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
if redis.call('HGET', KEYS[1], 'tier') ~= ARGV[2] then return -2 end
for i = 11, #ARGV, 2 do
  if tonumber(redis.call('HGET', KEYS[3], ARGV[i]) or '0') < tonumber(ARGV[i + 1]) then return -3 end
end
redis.call('DEL', KEYS[4])
for i = 11, #ARGV, 2 do redis.call('HSET', KEYS[4], ARGV[i], ARGV[i + 1]) end
if ARGV[3] ~= '' then
  redis.call('SET', KEYS[2], ARGV[3])
  redis.call('HSET', KEYS[1], 'items', ARGV[5])
  local sigs = cjson.decode(ARGV[9])
  local st = redis.call('HGETALL', KEYS[6])
  for i = 1, #st, 2 do
    local ok, v = pcall(cjson.decode, st[i + 1])
    local keep = false
    if ok and type(v) == 'table' and type(v.s) == 'string' then
      local sig = sigs[st[i]]
      if sig ~= nil then keep = sig ~= '' and sig == v.s else keep = v.s == '${WINDOW_SIG}' end
    end
    if not keep then redis.call('HDEL', KEYS[6], st[i]) end
  end
  local pots = cjson.decode(ARGV[10])
  local pl = redis.call('HKEYS', KEYS[7])
  for i = 1, #pl do
    if not pots[pl[i]] then redis.call('HDEL', KEYS[7], pl[i]) end
  end
end
if ARGV[8] ~= '' then redis.call('HSET', KEYS[1], 'exterior', ARGV[8]) end
redis.call('HSET', KEYS[1], 'placedScore', ARGV[4], 'updatedAt', ARGV[6])
if redis.call('HGET', KEYS[1], 'hidden') ~= '1' then
  local likes = tonumber(redis.call('HGET', KEYS[1], 'likes') or '0')
  redis.call('ZADD', KEYS[5], tonumber(ARGV[4]) + likes * tonumber(ARGV[7]), ARGV[1])
end
return 1
`;

// KEYS: meta, likeMark, score, likes  ARGV: id, ttl, likeWeight
const LIKE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('HGET', KEYS[1], 'hidden') == '1' then return nil end
if not redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then return {0} end
local likes = redis.call('HINCRBY', KEYS[1], 'likes', 1)
local score = tonumber(redis.call('HGET', KEYS[1], 'placedScore') or '0') + likes * tonumber(ARGV[3])
redis.call('ZADD', KEYS[3], score, ARGV[1])
redis.call('ZADD', KEYS[4], likes, ARGV[1])
return {1, likes, score}
`;

// 숨기면 공개 목록에서 빼고, 풀면 현재 값으로 다시 넣는다
// KEYS: meta, new, score, likes  ARGV: id, hidden('1'|'0'), likeWeight
const HIDE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[2] == '1' then
  redis.call('HSET', KEYS[1], 'hidden', '1')
  redis.call('ZREM', KEYS[2], ARGV[1])
  redis.call('ZREM', KEYS[3], ARGV[1])
  redis.call('ZREM', KEYS[4], ARGV[1])
else
  redis.call('HDEL', KEYS[1], 'hidden')
  local likes = tonumber(redis.call('HGET', KEYS[1], 'likes') or '0')
  redis.call('ZADD', KEYS[2], redis.call('HGET', KEYS[1], 'createdAt'), ARGV[1])
  redis.call('ZADD', KEYS[3], tonumber(redis.call('HGET', KEYS[1], 'placedScore') or '0') + likes * tonumber(ARGV[3]), ARGV[1])
  redis.call('ZADD', KEYS[4], likes, ARGV[1])
end
return 1
`;

// KEYS: meta, guest, guestDay  ARGV: entryJson, keep, perDay, ttl
const GUEST_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('HGET', KEYS[1], 'hidden') == '1' then return -1 end
local n = redis.call('INCR', KEYS[3])
if n == 1 then redis.call('EXPIRE', KEYS[3], ARGV[4]) end
if n > tonumber(ARGV[3]) then return 0 end
redis.call('LPUSH', KEYS[2], ARGV[1])
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[2]) - 1)
return 1
`;

// 글 id로 찾아 지운다 (id는 [A-Za-z0-9_-]라 패턴에 그대로 넣어도 안전하다)
// KEYS: guest, guestHide, guestRep, guestRepIps  ARGV: entryId
const REMOVE_GUEST_LUA = `
local all = redis.call('LRANGE', KEYS[1], 0, -1)
local needle = '"id":"' .. ARGV[1] .. '"'
for i = 1, #all do
  if string.find(all[i], needle, 1, true) then
    redis.call('LREM', KEYS[1], 1, all[i])
    redis.call('SREM', KEYS[2], ARGV[1])
    redis.call('HDEL', KEYS[3], ARGV[1])
    redis.call('DEL', KEYS[4])
    return all[i]
  end
end
return nil
`;

// KEYS: guest, guestRepIps, guestRep, guestHide  ARGV: entryId, ipHash, ttl, hideAt
const REPORT_GUEST_LUA = `
local all = redis.call('LRANGE', KEYS[1], 0, -1)
local needle = '"id":"' .. ARGV[1] .. '"'
local found = false
for i = 1, #all do
  if string.find(all[i], needle, 1, true) then found = true break end
end
if not found then return -1 end
if redis.call('SADD', KEYS[2], ARGV[2]) == 0 then return 0 end
redis.call('EXPIRE', KEYS[2], ARGV[3])
local n = redis.call('HINCRBY', KEYS[3], ARGV[1], 1)
if n >= tonumber(ARGV[4]) then redis.call('SADD', KEYS[4], ARGV[1]) end
return 1
`;

function pairs(flat: string[] | null): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; flat && i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
  return m;
}

function parseLayout(raw: string | null): HouseLayout {
  if (!raw) return emptyLayout();
  try {
    const v = JSON.parse(raw) as HouseLayout;
    return Array.isArray(v.items) ? v : emptyLayout();
  } catch {
    return emptyLayout();
  }
}

function toRecord(id: string, m: Map<string, string>, layout: HouseLayout | null): HouseRecord | null {
  if (!m.has("owner")) return null;
  const likes = Number(m.get("likes") ?? 0);
  const placedScore = Number(m.get("placedScore") ?? 0);
  let exterior: unknown = null;
  try {
    exterior = JSON.parse(m.get("exterior") ?? "null");
  } catch {
    exterior = null;
  }
  return {
    id,
    ch: housingChannelOf(m.get("ch")),
    lot: Number(m.get("lot") ?? 0),
    exterior: normalizeExterior(exterior),
    owner: m.get("owner")!,
    name: m.get("name") ?? "",
    intro: m.get("intro") ?? "",
    ownerName: m.get("ownerName") ?? "",
    tier: (m.get("tier") ?? "small") as PlotTierId,
    layout: layout ?? emptyLayout(),
    likes,
    placedScore,
    score: scoreOf(placedScore, likes),
    items: Number(m.get("items") ?? 0),
    createdAt: Number(m.get("createdAt") ?? 0),
    updatedAt: Number(m.get("updatedAt") ?? 0),
    hidden: m.get("hidden") === "1",
  };
}

function parseGuest(raw: string): StoredGuest | null {
  try {
    return JSON.parse(raw) as StoredGuest;
  } catch {
    return null;
  }
}

export class RedisHouseStore implements HouseStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async get(id: string) {
    const [meta, layout] = await this.redis
      .pipeline()
      .hgetall(HK.meta(id))
      .get(HK.layout(id))
      .exec<[string[] | null, string | null]>();
    return toRecord(id, pairs(meta), parseLayout(layout));
  }

  async inventory(id: string) {
    const flat = (await this.redis.hgetall(HK.inv(id))) as unknown as string[] | null;
    return Object.fromEntries([...pairs(flat)].map(([k, v]) => [k, Number(v)]));
  }

  async create(n: NewHouse): Promise<CreateResult> {
    const ch = housingChannelOf(n.ch ?? LEGACY_HOUSING_CHANNEL);
    const r = Number(
      await this.redis.eval<string[], number>(
        CREATE_LUA,
        [HK.meta(n.id), HK.layout(n.id), HK.all, HK.new, HK.score, HK.likes, HK.lots(ch), HK.legacyLots],
        [
          n.id,
          n.owner,
          n.name,
          n.intro,
          n.ownerName,
          n.tier,
          String(n.now),
          JSON.stringify(emptyLayout()),
          n.lot === null ? "" : String(n.lot),
          String(VILLAGE_MAX_LOTS),
          JSON.stringify(defaultExterior()),
          String(ch),
          isLegacyCh(ch),
        ],
      ),
    );
    return r > 0 ? { lot: r } : r === -1 ? "exists" : r === -2 ? "lot_taken" : "full";
  }

  async assignLot(id: string) {
    // 집의 채널은 바뀌지 않는다 (분양 때 정해진다). 먼저 읽고 그 채널 색인으로 Lua를 부른다
    const ch = housingChannelOf(await this.redis.hget<string>(HK.meta(id), "ch"));
    const r = Number(
      await this.redis.eval<string[], number>(ASSIGN_LOT_LUA, [HK.meta(id), HK.lots(ch), HK.legacyLots], [id, String(VILLAGE_MAX_LOTS), isLegacyCh(ch)]),
    );
    return r > 0 ? r : null;
  }

  /** 옛 번지 색인을 1채널로 옮긴다 (원자적·멱등. 1채널 색인을 쓰는 동작은 어차피 먼저 옮기므로, 운영자가 한 번에 끝내고 싶을 때) */
  async migrateLegacyLots(): Promise<{ moved: number; left: number }> {
    const r = await this.redis.eval<string[], number[]>(MIGRATE_LUA, [HK.legacyLots, HK.lots(LEGACY_HOUSING_CHANNEL)], []);
    return { moved: Number(r[0]), left: Number(r[1]) };
  }

  async village(ch = LEGACY_HOUSING_CHANNEL) {
    const flat = await this.redis.eval<string[], string[] | null>(VILLAGE_LUA, [HK.lots(ch), HK.legacyLots], [isLegacyCh(ch)]);
    const byLot = new Map([...pairs(flat)].map(([lot, id]) => [id, Number(lot)]));
    const recs = await this.records([...byLot.keys()], false);
    // 색인과 집 기록이 서로 맞는 것만 (채널·번지가 다르면 색인이 낡은 것)
    return recs.filter((r) => r.lot > 0 && r.ch === ch && byLot.get(r.id) === r.lot).sort((a, b) => a.lot - b.lot);
  }

  async remove(id: string) {
    const [eids, meta] = await Promise.all([
      this.guestbook(id, true).then((l) => l.map((g) => g.id)),
      this.redis.hmget<{ lot: string | null; ch: string | null }>(HK.meta(id), "lot", "ch"),
    ]);
    if (meta?.lot) await this.redis.eval<string[], number>(UNLOT_LUA, [HK.lots(housingChannelOf(meta.ch)), HK.legacyLots], [String(meta.lot), id]);
    const p = this.redis.pipeline();
    p.del(HK.meta(id), HK.layout(id), HK.inv(id), HK.placed(id), HK.guest(id), HK.guestHide(id), HK.guestRep(id), HK.plants(id), HK.states(id));
    for (const e of eids) p.del(HK.guestRepIps(id, e));
    for (const z of [HK.all, HK.new, HK.score, HK.likes]) p.zrem(z, id);
    await p.exec();
  }

  async setProfile(id: string, name: string, intro: string, now: number) {
    if (!(await this.redis.exists(HK.meta(id)))) return false;
    await this.redis.hset(HK.meta(id), { name, intro, updatedAt: String(now) });
    return true;
  }

  async upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number) {
    return Number(await this.redis.eval<string[], number>(UPGRADE_LUA, [HK.meta(id)], [from, to, String(now)])) === 1;
  }

  async addItem(id: string, itemId: string, max: number) {
    const r = Number(await this.redis.eval<string[], number>(ADD_ITEM_LUA, [HK.meta(id), HK.inv(id)], [itemId, String(max)]));
    return r < 0 ? ("no_house" as const) : r === 0 ? ("max" as const) : ("ok" as const);
  }

  async takeItem(id: string, itemId: string) {
    const r = Number(await this.redis.eval<string[], number>(TAKE_ITEM_LUA, [HK.inv(id), HK.placed(id)], [itemId]));
    return r < 0 ? ("none" as const) : r === 0 ? ("placed" as const) : ("ok" as const);
  }

  async saveDesign(
    id: string,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
  ): Promise<SaveResult> {
    const r = Number(
      await this.redis.eval<string[], number>(
        SAVE_LUA,
        [HK.meta(id), HK.layout(id), HK.inv(id), HK.placed(id), HK.score, HK.states(id), HK.plants(id)],
        [
          id,
          tier,
          layout ? JSON.stringify(layout) : "",
          String(placedScore),
          String(layout?.items.length ?? 0),
          String(now),
          String(LIKE_WEIGHT),
          exterior ? JSON.stringify(exterior) : "",
          layout ? JSON.stringify(stateSigs(layout)) : "",
          layout ? JSON.stringify(Object.fromEntries(layout.items.filter((p) => p.i === "pot").map((p) => [p.u, true]))) : "",
          ...Object.entries(counts).flatMap(([k, v]) => [k, String(v)]),
        ],
      ),
    );
    return r === 1 ? "ok" : r === -1 ? "no_house" : r === -2 ? "tier" : "not_owned";
  }

  async like(id: string, visitorId: string, day: string) {
    const r = await this.redis.eval<string[], number[] | null>(
      LIKE_LUA,
      [HK.meta(id), HK.like(id, visitorId, day), HK.score, HK.likes],
      [id, String(LIKE_TTL_SEC), String(LIKE_WEIGHT)],
    );
    if (!r) return null;
    if (Number(r[0]) === 0) return "already" as const;
    return { likes: Number(r[1]), score: Number(r[2]) };
  }

  async plants(id: string) {
    const flat = (await this.redis.hgetall(HK.plants(id))) as unknown as string[] | null;
    const out: Record<string, PlantState> = {};
    for (const [u, raw] of pairs(flat)) {
      try {
        const st = parsePlant(JSON.parse(raw));
        if (st) out[u] = st;
      } catch {
        // 깨진 기록은 버린다
      }
    }
    return out;
  }

  async setPlant(id: string, u: string, st: PlantState) {
    await this.redis.hset(HK.plants(id), { [u]: JSON.stringify(st) });
  }

  async states(id: string) {
    const flat = (await this.redis.hgetall(HK.states(id))) as unknown as string[] | null;
    const out: Record<string, HouseState> = {};
    for (const [u, raw] of pairs(flat)) {
      try {
        const st = parseState(JSON.parse(raw));
        if (st) out[u] = st;
      } catch {
        // 깨진 기록은 버린다
      }
    }
    return out;
  }

  async setState(id: string, u: string, st: HouseState | null) {
    if (st && st.a !== 0) await this.redis.hset(HK.states(id), { [u]: JSON.stringify(st) });
    else await this.redis.hdel(HK.states(id), u);
  }

  async likedToday(id: string, visitorId: string, day: string) {
    return (await this.redis.exists(HK.like(id, visitorId, day))) === 1;
  }

  private async records(ids: string[], withLayout: boolean): Promise<HouseRecord[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) {
      p.hgetall(HK.meta(id));
      if (withLayout) p.get(HK.layout(id));
    }
    const res = await p.exec<(string[] | string | null)[]>();
    const step = withLayout ? 2 : 1;
    return ids.flatMap((id, i) => {
      const meta = res[i * step] as string[] | null;
      const layout = withLayout ? parseLayout(res[i * step + 1] as string | null) : null;
      const r = toRecord(id, pairs(meta), layout);
      return r ? [r] : [];
    });
  }

  async list(sort: HouseSort, limit: number) {
    const ids = await this.redis.zrange<string[]>(SORT_KEY[sort], 0, limit - 1, { rev: true });
    return (await this.records(ids, false)).filter((r) => !r.hidden);
  }

  async listAll() {
    const ids = await this.redis.zrange<string[]>(HK.all, 0, 999, { rev: true });
    return this.records(ids, false);
  }

  async setHidden(id: string, hidden: boolean) {
    const r = await this.redis.eval<string[], number>(
      HIDE_LUA,
      [HK.meta(id), HK.new, HK.score, HK.likes],
      [id, hidden ? "1" : "0", String(LIKE_WEIGHT)],
    );
    return Number(r) === 1;
  }

  async addGuest(id: string, entry: StoredGuest, day: string) {
    const r = Number(
      await this.redis.eval<string[], number>(
        GUEST_LUA,
        [HK.meta(id), HK.guest(id), HK.guestDay(entry.author, day)],
        [JSON.stringify(entry), String(GUEST_KEEP), String(GUEST_PER_DAY), String(GUEST_DAY_TTL_SEC)],
      ),
    );
    return r < 0 ? ("no_house" as const) : r === 0 ? ("limit" as const) : ("ok" as const);
  }

  async guestbook(id: string, withHidden: boolean) {
    const [list, hidden] = await this.redis
      .pipeline()
      .lrange(HK.guest(id), 0, -1)
      .smembers(HK.guestHide(id))
      .exec<[string[], string[]]>();
    const hide = new Set(hidden);
    return list
      .map(parseGuest)
      .filter((g): g is StoredGuest => !!g)
      .map((g) => ({ ...g, hidden: hide.has(g.id) }))
      .filter((g) => withHidden || !g.hidden);
  }

  async removeGuest(id: string, entryId: string) {
    const raw = await this.redis.eval<string[], string | null>(
      REMOVE_GUEST_LUA,
      [HK.guest(id), HK.guestHide(id), HK.guestRep(id), HK.guestRepIps(id, entryId)],
      [entryId],
    );
    return raw ? parseGuest(raw) : null;
  }

  async reportGuest(id: string, entryId: string, ipHash: string) {
    const r = Number(
      await this.redis.eval<string[], number>(
        REPORT_GUEST_LUA,
        [HK.guest(id), HK.guestRepIps(id, entryId), HK.guestRep(id), HK.guestHide(id)],
        [entryId, ipHash, String(GUEST_REPORT_TTL_SEC), String(GUEST_REPORT_HIDE)],
      ),
    );
    return r < 0 ? null : r === 0 ? ("duplicate" as const) : ("added" as const);
  }

  async setGuestHidden(id: string, entryId: string, hidden: boolean) {
    const exists = (await this.guestbook(id, true)).some((g) => g.id === entryId);
    if (!exists) return false;
    if (hidden) await this.redis.sadd(HK.guestHide(id), entryId);
    else await this.redis.pipeline().srem(HK.guestHide(id), entryId).hdel(HK.guestRep(id), entryId).del(HK.guestRepIps(id, entryId)).exec();
    return true;
  }

  async guestReports(id: string) {
    const flat = (await this.redis.hgetall(HK.guestRep(id))) as unknown as string[] | null;
    return new Map([...pairs(flat)].map(([k, v]) => [k, Number(v)]));
  }
}

import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { CLOSED_LOTS } from "@tomb/protocol";
import {
  defaultExterior,
  FURNITURE,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  LEGACY_HOUSING_CHANNEL,
  LIKE_WEIGHT,
  cottageStyleOf,
  type CottageStyleId,
  type HouseSort,
  type HouseZone,
  type PlotTierId,
} from "./catalog";
import { K } from "../store/keys";
import { emptyLayout, normalizeExterior } from "./layout";
import {
  GUEST_DAY_TTL_SEC,
  GUEST_REPORT_TTL_SEC,
  invView,
  LIKE_TTL_SEC,
  pairIds,
  scoreOf,
  SEA_STARTER_KEEP,
  type HousePair,
  type InvView,
  type HouseRecord,
  type CreateResult,
  type HouseStore,
  type NewHouse,
  type PendingReclaim,
  type ReclaimInput,
  type ReclaimResult,
  type SaveResult,
  type StoredGuest,
  zoneMaxLots,
} from "./store";
import { parsePlant, type PlantState } from "./plants";
import { parseState, stateSigs, WINDOW_SIG, type HouseState } from "./states";
import type { HouseExterior, HouseLayout } from "./types";

// Redis 키 (집 id = 계정 id의 HMAC. 계정 id는 키에도 공개 응답에도 드러나지 않는다)
//  house:{id}                HASH owner, name, intro, ownerName, tier, ch, lot, exterior(JSON), createdAt, updatedAt, likes, placedScore, items, hidden, paid
//                            (ch가 없으면 채널이 생기기 전에 분양된 집 → 1채널. paid = 낸 포인트, 이 기록이 생기기 전에 분양된 집은 없다)
//  houses:lots:{ch}          HASH 번지 → 집 id (채널마다 분양 마을이 따로. 번지 배정은 HEXISTS 확인과 HSET을 Lua 하나로)
//  houses:sealots:{ch}       HASH 11/16 포구 오두막 터 번호(1..6) → 집 id (마을 번지와 따로. 오두막 집 기록은 zone=sea, style)
//                            (오두막 집 id = 계정 id의 다른 HMAC — 한 계정이 마을 집 + 오두막을 따로 가진다)
//  house:{id}:inv 의 "~starter" 칸 = 시작 가구를 이미 준 표시 (가방 읽기에서 뺀다)
//  houses:lots               HASH 옛 번지 색인 (채널 없음). 1채널 색인을 쓰는 Lua가 먼저 houses:lots:1로 옮긴다 (MIGRATE_FN)
//  house:{id}:layout         STRING 배치 JSON
//  house:{id}:inv            HASH 그 집 몫 물건 id → 개수 (놓은 것 포함): 바닥·벽지·외관 + 오두막 시작 가구 (11/16 공용 가방 뒤)
//                            "~pooled" 칸 = 옛 가방의 가구를 공용 가방으로 옮김 (한 번만. POOL_FN pmerge)
//  house:{마을 집 id}:pool   HASH 11/16 공용 가구 가방: 물건 id → 개수 (한 계정의 두 집이 나눠 놓는다. 마을 집이 없어도 이 자리)
//  house:{id}:placed         HASH 물건 id → 그 집에 놓은 개수 (되팔기·공용 가방 판정용, 배치 저장과 같이 바뀐다)
//  house:{id}:guest          LIST 방명록 JSON, 최신 먼저 GUEST_KEEP개
//  house:{id}:guesthide      SET 가린 글 id
//  house:{id}:guestrep       HASH 글 id → 신고 수
//  house:{id}:guestrep:{eid} SET 신고한 IP 해시 (30일)
//  house:{id}:plants         HASH 화분 배치 id → {n, at} JSON (3번 물 주기)
//  house:{id}:states         HASH 가구 배치 id(창문 "w0"…) → {a, s} JSON (3번 불·스탠드·라디오·창문. s = 서명, states.ts)
//  house:{id}:reclaimed      HASH `r:{비운 시각}` → {points, label} JSON (오래 비워 정리한 집, 선물함으로 보내면 그 칸을 지운다. TTL 없음)
//  houses:reclaim:lock       STRING 정리 잠금 (SET NX PX)
//  house:{id}:like:{visitor}:{yyyymmdd}  STRING NX EX (하루 1회 좋아요)
//  house:guestday:{visitor}:{yyyymmdd}   STRING 오늘 남긴 방명록 수
//  houses:all                ZSET 분양 시각 (숨김 포함, 관리자 목록)
//  houses:new / houses:score / houses:likes   ZSET 공개 목록 (숨긴 집은 빠진다)
export const HK = {
  meta: (id: string) => `house:${id}`,
  layout: (id: string) => `house:${id}:layout`,
  inv: (id: string) => `house:${id}:inv`,
  /** 11/16 공용 가구 가방 (마을 집 id) */
  pool: (villageId: string) => `house:${villageId}:pool`,
  placed: (id: string) => `house:${id}:placed`,
  guest: (id: string) => `house:${id}:guest`,
  guestHide: (id: string) => `house:${id}:guesthide`,
  guestRep: (id: string) => `house:${id}:guestrep`,
  guestRepIps: (id: string, eid: string) => `house:${id}:guestrep:${eid}`,
  plants: (id: string) => `house:${id}:plants`,
  states: (id: string) => `house:${id}:states`,
  reclaimed: (id: string) => `house:${id}:reclaimed`,
  reclaimLock: "houses:reclaim:lock",
  like: (id: string, visitor: string, day: string) => `house:${id}:like:${visitor}:${day}`,
  guestDay: (visitor: string, day: string) => `house:guestday:${visitor}:${day}`,
  all: "houses:all",
  new: "houses:new",
  score: "houses:score",
  likes: "houses:likes",
  /** 채널 ch의 번지 색인 */
  lots: (ch: number) => `houses:lots:${ch}`,
  /** 11/16 채널 ch의 포구 오두막 터 색인 */
  seaLots: (ch: number) => `houses:sealots:${ch}`,
  /** 옛 번지 색인 (채널이 생기기 전. 읽기 호환·이전용) */
  legacyLots: "houses:lots",
};

const isLegacyCh = (ch: number, zone?: HouseZone | string | null) => (ch === LEGACY_HOUSING_CHANNEL && zone !== "sea" ? "1" : "0");
/** 그 구역의 번지 색인 키 */
const lotsKey = (ch: number, zone?: HouseZone | string | null) => (zone === "sea" ? HK.seaLots(ch) : HK.lots(ch));
const STARTER_MARK = "~starter";

const SORT_KEY: Record<HouseSort, string> = { score: HK.score, likes: HK.likes, new: HK.new };

// 가장 앞의 빈 번지 (없으면 nil)
// 비운 번지(CLOSED_LOTS, 지금은 없다)는 자동 배정에서 건너뛴다 (스크립트에 상수로 박는다 — 키·인자는 그대로)
const FREE_LOT_FN = `
local closed = {${CLOSED_LOTS.map((l) => `[${l}]=true`).join(",")}}
local function freeLot(lots, max)
  for l = 1, max do
    if not closed[l] and redis.call('HEXISTS', lots, tostring(l)) == 0 then return l end
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

// KEYS: meta, layout, all, new, score, likes, lots(ch), legacyLots, inv, placed
// ARGV: id, owner, name, intro, ownerName, tier, now, layoutJson, lot(''=자동), maxLots, exteriorJson, ch, legacy('1'|'0'), paid(''=기록 없음),
//       zone(''|'sea'), style, starterJson(''=없음: 가방에 +1씩, ~starter 표시가 없을 때만),
//       placedJson(''=없음: 처음 배치에 놓인 개수), placedScore, itemsCount
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
if ARGV[14] and ARGV[14] ~= '' then redis.call('HSET', KEYS[1], 'paid', ARGV[14]) end
if ARGV[15] == 'sea' then redis.call('HSET', KEYS[1], 'zone', 'sea', 'style', ARGV[16]) end
if ARGV[17] and ARGV[17] ~= '' and redis.call('HSETNX', KEYS[9], '${"~starter"}', '1') == 1 then
  for _, it in ipairs(cjson.decode(ARGV[17])) do redis.call('HINCRBY', KEYS[9], it, 1) end
end
redis.call('SET', KEYS[2], ARGV[8])
local score0 = 0
if ARGV[18] and ARGV[18] ~= '' then
  redis.call('DEL', KEYS[10])
  for it, n in pairs(cjson.decode(ARGV[18])) do redis.call('HSET', KEYS[10], it, n) end
  score0 = tonumber(ARGV[19]) or 0
  redis.call('HSET', KEYS[1], 'placedScore', score0, 'items', ARGV[20])
end
redis.call('ZADD', KEYS[3], ARGV[7], ARGV[1])
redis.call('ZADD', KEYS[4], ARGV[7], ARGV[1])
redis.call('ZADD', KEYS[5], score0, ARGV[1])
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

// 관리자 번지 옮기기: 새 번지가 비어 있을 때만, 옛 번지 칸(이 집일 때만)을 비우고 새 칸에 넣는다
// KEYS: meta, lots(ch), legacyLots  ARGV: id, lot, legacy('1'|'0')  반환: 1 옮김, -1 집 없음, -2 그 번지에 다른 집
const MOVE_LOT_LUA = `${MIGRATE_FN}
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
if ARGV[3] == '1' then migrateLegacy(KEYS[3], KEYS[2]) end
local cur = redis.call('HGET', KEYS[2], ARGV[2])
if cur and cur ~= ARGV[1] then return -2 end
local old = redis.call('HGET', KEYS[1], 'lot')
if old and redis.call('HGET', KEYS[2], old) == ARGV[1] then redis.call('HDEL', KEYS[2], old) end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[1], 'lot', ARGV[2])
return 1
`;

// 11/15 낡은 번지 칸 정리: 색인 칸이 가리키는 집이 이제 없거나(삭제됨) 다른 번지에 있으면 그 칸을 비운다.
// 철거한 번지가 화면에는 빈 땅인데(마을 목록은 기록과 맞는 칸만 보인다) 분양은 HEXISTS로 「이미 분양됨」이 되던 일 (운영 1채널 1번지)
// KEYS: lots(ch), meta(칸의 집)  ARGV: lot, 칸의 집 id
const CLEAR_STALE_LOT_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
if redis.call('EXISTS', KEYS[2]) == 1 and tostring(redis.call('HGET', KEYS[2], 'lot')) == ARGV[1] then return 0 end
redis.call('HDEL', KEYS[1], ARGV[1])
return 1
`;

// 낸 포인트(paid)는 기록이 있을 때만 넓히기 값을 더한다 (기록 없는 옛 집에 넓히기 값만 남지 않게)
// KEYS: meta  ARGV: from, to, now, price
const UPGRADE_LUA = `
if redis.call('HGET', KEYS[1], 'tier') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'tier', ARGV[2], 'updatedAt', ARGV[3])
if tonumber(ARGV[4] or '0') > 0 and redis.call('HEXISTS', KEYS[1], 'paid') == 1 then redis.call('HINCRBY', KEYS[1], 'paid', ARGV[4]) end
return 1
`;

// 오래 비운 집 정리: 주인·터 크기가 그대로이고 주인 계정의 마지막 접속(seenAt·presenceAt·createdAt 중 가장 늦은 것,
// accounts-redis.ts NAME_FNS dormant와 같은 규칙. 규칙을 켠 시각 since 전 접속은 since로 센다 — catalog reclaimLastSeen)이 cutoff 이전일 때만. 확인·번지 칸 비우기·집 지우기·정리 기록을 한 번에 →
// 비우는 도중에 그 번지가 팔리거나, 두 번 비워 두 번 돌려주거나, 그 사이 돌아온 주인의 집을 비우는 일이 없다.
// 가방(inv)은 남기고 놓은 개수(placed)는 지운다 (새로 분양받으면 다시 놓을 수 있게)
// KEYS: meta, layout, placed, guest, guestHide, guestRep, plants, states, all, new, score, likes, lots(ch), legacyLots, acct(주인), reclaimed
// ARGV: id, owner, tier, cutoff, field(r:{now}), entryJson, since
// 반환: 1 비움, -1 없음·주인 다름, -2 터 크기 바뀜, -3 주인이 돌아옴(또는 접속 기록 없음)
const RECLAIM_LUA = `
if redis.call('HGET', KEYS[1], 'owner') ~= ARGV[2] then return -1 end
if redis.call('HGET', KEYS[1], 'tier') ~= ARGV[3] then return -2 end
local v = redis.call('HMGET', KEYS[15], 'seenAt', 'presenceAt', 'createdAt')
local last = 0
for i = 1, 3 do
  local n = tonumber(v[i] or '0') or 0
  if n > last then last = n end
end
if last == 0 then return -3 end
local since = tonumber(ARGV[7] or '0') or 0
if since > last then last = since end
if last > tonumber(ARGV[4]) then return -3 end
local lot = redis.call('HGET', KEYS[1], 'lot')
if lot then
  if redis.call('HGET', KEYS[13], lot) == ARGV[1] then redis.call('HDEL', KEYS[13], lot) end
  if redis.call('HGET', KEYS[14], lot) == ARGV[1] then redis.call('HDEL', KEYS[14], lot) end
end
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[6], KEYS[7], KEYS[8])
for i = 9, 12 do redis.call('ZREM', KEYS[i], ARGV[1]) end
redis.call('HSET', KEYS[16], ARGV[5], ARGV[6])
return 1
`;

// 오두막 겉모습 (오두막일 때만)  KEYS: meta  ARGV: style, now
const STYLE_LUA = `
if redis.call('HGET', KEYS[1], 'zone') ~= 'sea' then return 0 end
redis.call('HSET', KEYS[1], 'style', ARGV[1], 'updatedAt', ARGV[2])
return 1
`;

// 11/16 공용 가구 가방 (store.ts invView·fitsPool·takeFrom과 같은 규칙).
//  OWN = 집에 딸린 물건 (바닥·벽지·외관 — 공용 가방에 넣지 않는다), KEEP = 오두막 시작 가구 (오두막 몫으로 1개씩)
//  pmerge: 옛 집 가방(물건이 다 들어 있던 inv)의 가구를 공용 가방으로 한 번만 옮긴다. "~pooled" 표시를 HSETNX로 먼저 세우므로
//  몇 번을 불러도 두 번 더하지 않는다(멱등). 가방을 쓰는 Lua마다 맨 앞에서 두 집 가방에 부른다 → 옮기기와 그 동작이 한 번에(원자적으로).
//  시작 가구를 받은 오두막(~starter)은 시작 가구를 1개씩 오두막 몫으로 남긴다. 놓인 개수(placed)는 그대로 → 옮긴 뒤에도 배치가 유효하다
//  (각 집이 몫을 넘게 놓은 수 ≤ 그 집이 옮긴 수라서 두 집 합계 ≤ 공용 개수)
//  over: 그 집이 몫을 넘게 놓은 수 = 공용 가방에서 꺼내 놓은 수
const POOL_FN = `
local OWN = {${FURNITURE.filter((f) => f.skin || f.ext)
  .map((f) => `[${JSON.stringify(f.id)}]=true`)
  .join(",")}}
local KEEP = {${SEA_STARTER_KEEP.map((i) => `[${JSON.stringify(i)}]=true`).join(",")}}
local function num(k, f) return tonumber(redis.call('HGET', k, f) or '0') or 0 end
local function pmerge(inv, pool, sea)
  if redis.call('EXISTS', inv) == 0 or redis.call('HSETNX', inv, '~pooled', '1') == 0 then return end
  local starter = sea and redis.call('HEXISTS', inv, '${"~starter"}') == 1
  local flat = redis.call('HGETALL', inv)
  for i = 1, #flat, 2 do
    local it = flat[i]
    if string.sub(it, 1, 1) ~= '~' and not OWN[it] then
      local n = tonumber(flat[i + 1]) or 0
      local keep = 0
      if starter and KEEP[it] and n > 0 then keep = 1 end
      if n - keep > 0 then redis.call('HINCRBY', pool, it, n - keep) end
      if keep == 0 then redis.call('HDEL', inv, it) elseif n ~= keep then redis.call('HSET', inv, it, keep) end
    end
  end
end
local function over(placed, inv, it)
  local d = num(placed, it) - num(inv, it)
  if d > 0 then return d end
  return 0
end
`;

// 가방 Lua 공통 KEYS 앞 5개: pool, inv(이 집), inv(다른 집), placed(이 집), placed(다른 집)  ARGV[1]: 이 집이 오두막('1'|'0')
const POOL_MERGE = `
pmerge(KEYS[2], KEYS[1], ARGV[1] == '1')
pmerge(KEYS[3], KEYS[1], ARGV[1] ~= '1')
`;

// 그 집에서 본 가방 (옮기기 먼저)  반환: {pool, inv, otherInv, otherPlaced} HGETALL 넷
const INV_LUA = `${POOL_FN}${POOL_MERGE}
return {redis.call('HGETALL', KEYS[1]), redis.call('HGETALL', KEYS[2]), redis.call('HGETALL', KEYS[3]), redis.call('HGETALL', KEYS[5])}
`;

// KEYS: pool, inv, otherInv, placed, otherPlaced, meta(이 집)  ARGV: sea, itemId, max
// 가구는 공용 가방에, 집에 딸린 물건은 이 집 가방에
const ADD_ITEM_LUA = `${POOL_FN}
if redis.call('EXISTS', KEYS[6]) == 0 then return -1 end
${POOL_MERGE}
local bag = KEYS[1]
if OWN[ARGV[2]] then bag = KEYS[2] end
if num(bag, ARGV[2]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HINCRBY', bag, ARGV[2], 1)
return 1
`;

// 되팔기 1개 (store.ts takeFrom): 두 집 어디에도 놓이지 않은 공용 몫이 있으면 공용에서, 아니면 이 집 몫에서
// KEYS: pool, inv, otherInv, placed, otherPlaced  ARGV: sea, itemId
// 반환: 1 뺐음, -1 없음, 0 이 집에 다 놓임, -2 남은 건 다른 집에 놓임
const TAKE_ITEM_LUA = `${POOL_FN}${POOL_MERGE}
local it = ARGV[2]
local o = num(KEYS[2], it)
local p = num(KEYS[1], it)
if o + p < 1 then return -1 end
local out = over(KEYS[5], KEYS[3], it)
local bag
if p - over(KEYS[4], KEYS[2], it) - out >= 1 then bag = KEYS[1]
elseif o - num(KEYS[4], it) >= 1 then bag = KEYS[2]
elseif out > 0 and num(KEYS[4], it) == 0 then return -2
else return 0 end
if redis.call('HINCRBY', bag, it, -1) <= 0 then redis.call('HDEL', bag, it) end
return 1
`;

// 가진 개수 확인과 배치·놓은 개수·점수 갱신을 한 번에 (되팔기·다른 집 저장과 경합해 가진 것보다 많이 놓이지 않게)
// 11/16 공용 가방: 물건마다 (이 집이 몫을 넘게 놓을 수) + (다른 집이 몫을 넘게 놓은 수) ≤ 공용 개수 (store.ts fitsPool).
//  두 집 저장이 모두 이 Lua라 두 집을 동시에 저장해도 합쳐서 넘게 놓이지 않는다
// 배치가 바뀌면 같은 Lua에서 치우거나 옮긴 가구 상태(서명이 다른 것)와 없어진 화분 기록을 지운다 (states.ts keepState와 같은 규칙)
// KEYS: pool, inv, otherInv, placed, otherPlaced, meta, layout, score, states, plants
// ARGV: sea, id, tier, layoutJson(''=그대로), placedScore, itemsCount, now, likeWeight, exteriorJson(''=그대로),
//       sigsJson(배치 id → 서명, 상태 없는 가구는 ''), potsJson(화분 배치 id → true), [itemId, count]...
const SAVE_LUA = `${POOL_FN}
if redis.call('EXISTS', KEYS[6]) == 0 then return -1 end
if redis.call('HGET', KEYS[6], 'tier') ~= ARGV[3] then return -2 end
${POOL_MERGE}
for i = 12, #ARGV, 2 do
  local it = ARGV[i]
  local need = tonumber(ARGV[i + 1]) - num(KEYS[2], it)
  if need < 0 then need = 0 end
  if need + over(KEYS[5], KEYS[3], it) > num(KEYS[1], it) then return -3 end
end
redis.call('DEL', KEYS[4])
for i = 12, #ARGV, 2 do redis.call('HSET', KEYS[4], ARGV[i], ARGV[i + 1]) end
if ARGV[4] ~= '' then
  redis.call('SET', KEYS[7], ARGV[4])
  redis.call('HSET', KEYS[6], 'items', ARGV[6])
  local sigs = cjson.decode(ARGV[10])
  local st = redis.call('HGETALL', KEYS[9])
  for i = 1, #st, 2 do
    local ok, v = pcall(cjson.decode, st[i + 1])
    local keep = false
    if ok and type(v) == 'table' and type(v.s) == 'string' then
      local sig = sigs[st[i]]
      if sig ~= nil then keep = sig ~= '' and sig == v.s else keep = v.s == '${WINDOW_SIG}' end
    end
    if not keep then redis.call('HDEL', KEYS[9], st[i]) end
  end
  local pots = cjson.decode(ARGV[11])
  local pl = redis.call('HKEYS', KEYS[10])
  for i = 1, #pl do
    if not pots[pl[i]] then redis.call('HDEL', KEYS[10], pl[i]) end
  end
end
if ARGV[9] ~= '' then redis.call('HSET', KEYS[6], 'exterior', ARGV[9]) end
redis.call('HSET', KEYS[6], 'placedScore', ARGV[5], 'updatedAt', ARGV[7])
if redis.call('HGET', KEYS[6], 'hidden') ~= '1' then
  local likes = tonumber(redis.call('HGET', KEYS[6], 'likes') or '0')
  redis.call('ZADD', KEYS[8], tonumber(ARGV[5]) + likes * tonumber(ARGV[8]), ARGV[2])
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

/** 가방 해시(HGETALL 줄) → 물건 → 개수 ("~"로 시작하는 표시 칸은 뺀다) */
function counts(flat: string[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of pairs(Array.isArray(flat) ? flat : null)) {
    const n = Number(v);
    if (!k.startsWith("~") && n > 0) out[k] = n;
  }
  return out;
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
    ...(m.get("zone") === "sea" ? { zone: "sea" as const, style: cottageStyleOf(m.get("style")) } : {}),
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
    ...(m.has("paid") ? { paid: Number(m.get("paid")) || 0 } : {}),
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
    this.redis = redisClient(conn, "housing/store");
  }

  async get(id: string) {
    const [meta, layout] = await this.redis
      .pipeline()
      .hgetall(HK.meta(id))
      .get(HK.layout(id))
      .exec<[string[] | null, string | null]>();
    return toRecord(id, pairs(meta), parseLayout(layout));
  }

  async hasStarter(id: string) {
    return (await this.redis.hexists(HK.inv(id), STARTER_MARK)) === 1;
  }

  /** 가방 Lua 공통 KEYS 앞 5개와 ARGV[1] (POOL_MERGE) */
  private poolKeys(pair: HousePair, zone: HouseZone): { keys: string[]; sea: string } {
    const { self, other } = pairIds(pair, zone);
    return { keys: [HK.pool(pair.village), HK.inv(self), HK.inv(other), HK.placed(self), HK.placed(other)], sea: zone === "sea" ? "1" : "0" };
  }

  async inventory(pair: HousePair, zone: HouseZone): Promise<InvView> {
    const { keys, sea } = this.poolKeys(pair, zone);
    const r = await this.redis.eval<string[], (string[] | null)[]>(INV_LUA, keys, [sea]);
    return invView(counts(r?.[0]), counts(r?.[1]), counts(r?.[2]), counts(r?.[3]));
  }

  async ownItems(id: string) {
    return counts((await this.redis.hgetall(HK.inv(id))) as unknown as string[] | null);
  }

  async create(n: NewHouse): Promise<CreateResult> {
    const ch = housingChannelOf(n.ch ?? LEGACY_HOUSING_CHANNEL);
    const zone = n.zone === "sea" ? "sea" : "";
    if (n.lot !== null) await this.clearStaleLot(ch, n.lot, zone);
    const r = Number(
      await this.redis.eval<string[], number>(
        CREATE_LUA,
        [HK.meta(n.id), HK.layout(n.id), HK.all, HK.new, HK.score, HK.likes, lotsKey(ch, zone), HK.legacyLots, HK.inv(n.id), HK.placed(n.id)],
        [
          n.id,
          n.owner,
          n.name,
          n.intro,
          n.ownerName,
          n.tier,
          String(n.now),
          JSON.stringify(n.layout ?? emptyLayout()),
          n.lot === null ? "" : String(n.lot),
          String(zoneMaxLots(n.zone)),
          JSON.stringify(defaultExterior()),
          String(ch),
          isLegacyCh(ch, zone),
          n.paid === undefined ? "" : String(n.paid),
          zone,
          zone ? cottageStyleOf(n.style) : "",
          n.starter?.length ? JSON.stringify(n.starter) : "",
          n.placed && Object.keys(n.placed).length ? JSON.stringify(n.placed) : "",
          String(n.placedScore ?? 0),
          String(n.layout?.items.length ?? 0),
        ],
      ),
    );
    return r > 0 ? { lot: r } : r === -1 ? "exists" : r === -2 ? "lot_taken" : "full";
  }

  async assignLot(id: string) {
    // 집의 채널은 바뀌지 않는다 (분양 때 정해진다). 먼저 읽고 그 채널 색인으로 Lua를 부른다
    const meta = await this.redis.hmget<{ ch: string | null; zone: string | null }>(HK.meta(id), "ch", "zone");
    const ch = housingChannelOf(meta?.ch);
    const zone = meta?.zone === "sea" ? "sea" : undefined;
    const r = Number(
      await this.redis.eval<string[], number>(ASSIGN_LOT_LUA, [HK.meta(id), lotsKey(ch, zone), HK.legacyLots], [id, String(zoneMaxLots(zone)), isLegacyCh(ch, zone)]),
    );
    return r > 0 ? r : null;
  }

  /** 옛 번지 색인을 1채널로 옮긴다 (원자적·멱등. 1채널 색인을 쓰는 동작은 어차피 먼저 옮기므로, 운영자가 한 번에 끝내고 싶을 때) */
  async migrateLegacyLots(): Promise<{ moved: number; left: number }> {
    const r = await this.redis.eval<string[], number[]>(MIGRATE_LUA, [HK.legacyLots, HK.lots(LEGACY_HOUSING_CHANNEL)], []);
    return { moved: Number(r[0]), left: Number(r[1]) };
  }

  async village(ch = LEGACY_HOUSING_CHANNEL, zone?: HouseZone) {
    const sea = zone === "sea";
    // 포구 색인은 HGETALL 하나 (옛 색인 옮기기가 필요 없다)
    const flat = sea
      ? ((await this.redis.hgetall(HK.seaLots(ch))) as unknown as string[] | Record<string, string> | null)
      : await this.redis.eval<string[], string[] | null>(VILLAGE_LUA, [HK.lots(ch), HK.legacyLots], [isLegacyCh(ch)]);
    const entries: [string, string][] = Array.isArray(flat) || flat === null ? [...pairs(flat)] : Object.entries(flat).map(([k, v]) => [k, String(v)]);
    const byLot = new Map(entries.map(([lot, id]) => [id, Number(lot)]));
    const recs = await this.records([...byLot.keys()], false);
    // 색인과 집 기록이 서로 맞는 것만 (채널·번지·구역이 다르면 색인이 낡은 것)
    return recs.filter((r) => r.lot > 0 && r.ch === ch && (r.zone === "sea") === sea && byLot.get(r.id) === r.lot).sort((a, b) => a.lot - b.lot);
  }

  /** 번지 칸이 낡았으면(가리키는 집이 없거나 다른 번지) 비운다 */
  private async clearStaleLot(ch: number, lot: number, zone?: HouseZone | string | null) {
    if (isLegacyCh(ch, zone) === "1") await this.redis.eval<string[], number[]>(MIGRATE_LUA, [HK.legacyLots, HK.lots(ch)], []);
    const key = lotsKey(ch, zone);
    const holder = await this.redis.hget<string>(key, String(lot));
    if (holder) await this.redis.eval<string[], number>(CLEAR_STALE_LOT_LUA, [key, HK.meta(String(holder))], [String(lot), String(holder)]);
  }

  async moveLot(id: string, lot: number) {
    const meta = await this.redis.hmget<{ ch: string | null; zone: string | null }>(HK.meta(id), "ch", "zone");
    const ch = housingChannelOf(meta?.ch ?? undefined);
    const zone = meta?.zone === "sea" ? "sea" : undefined;
    await this.clearStaleLot(ch, lot, zone);
    const r = Number(await this.redis.eval<string[], number>(MOVE_LOT_LUA, [HK.meta(id), lotsKey(ch, zone), HK.legacyLots], [id, String(lot), isLegacyCh(ch, zone)]));
    return r === 1 ? ("ok" as const) : r === -1 ? ("no_house" as const) : ("taken" as const);
  }

  async remove(id: string) {
    const [eids, meta] = await Promise.all([
      this.guestbook(id, true).then((l) => l.map((g) => g.id)),
      this.redis.hmget<{ lot: string | null; ch: string | null; zone: string | null }>(HK.meta(id), "lot", "ch", "zone"),
    ]);
    if (meta?.lot) await this.redis.eval<string[], number>(UNLOT_LUA, [lotsKey(housingChannelOf(meta.ch), meta.zone), HK.legacyLots], [String(meta.lot), id]);
    const p = this.redis.pipeline();
    p.del(HK.meta(id), HK.layout(id), HK.inv(id), HK.placed(id), HK.guest(id), HK.guestHide(id), HK.guestRep(id), HK.plants(id), HK.states(id));
    for (const e of eids) p.del(HK.guestRepIps(id, e));
    for (const z of [HK.all, HK.new, HK.score, HK.likes]) p.zrem(z, id);
    await p.exec();
  }

  async setStyle(id: string, style: CottageStyleId, now: number) {
    return Number(await this.redis.eval<string[], number>(STYLE_LUA, [HK.meta(id)], [style, String(now)])) === 1;
  }

  async setProfile(id: string, name: string, intro: string, now: number) {
    if (!(await this.redis.exists(HK.meta(id)))) return false;
    await this.redis.hset(HK.meta(id), { name, intro, updatedAt: String(now) });
    return true;
  }

  async upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number, price = 0) {
    return Number(await this.redis.eval<string[], number>(UPGRADE_LUA, [HK.meta(id)], [from, to, String(now), String(price)])) === 1;
  }

  async reclaim(id: string, r: ReclaimInput): Promise<ReclaimResult> {
    // 방명록 신고 IP 묶음(글마다 키)은 Lua 밖에서 지운다 (30일 TTL이라 남아도 사라진다)
    const eids = (await this.guestbook(id, true)).map((g) => g.id);
    const code = Number(
      await this.redis.eval<string[], number>(
        RECLAIM_LUA,
        [
          HK.meta(id),
          HK.layout(id),
          HK.placed(id),
          HK.guest(id),
          HK.guestHide(id),
          HK.guestRep(id),
          HK.plants(id),
          HK.states(id),
          HK.all,
          HK.new,
          HK.score,
          HK.likes,
          lotsKey(housingChannelOf(r.ch), r.zone),
          HK.legacyLots,
          K.acct(r.owner),
          HK.reclaimed(id),
        ],
        [id, r.owner, r.tier, String(r.cutoff), `r:${r.now}`, JSON.stringify({ points: r.points, label: r.label }), String(r.since)],
      ),
    );
    if (code === -1) return "gone";
    if (code === -2) return "changed";
    if (code === -3) return "active";
    if (eids.length) await this.redis.del(...eids.map((e) => HK.guestRepIps(id, e)));
    return { points: r.points };
  }

  async pendingReclaims(id: string): Promise<PendingReclaim[]> {
    const flat = (await this.redis.hgetall(HK.reclaimed(id))) as unknown as string[] | null;
    const out: PendingReclaim[] = [];
    for (const [field, raw] of pairs(flat)) {
      const at = Number(field.slice(2));
      try {
        const v = JSON.parse(raw) as { points?: unknown; label?: unknown };
        if (field.startsWith("r:") && at > 0) out.push({ at, points: Number(v.points) || 0, label: String(v.label ?? "") });
      } catch {
        // 깨진 칸은 건너뛴다 (지우지 않고 남겨 둔다)
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  async settleReclaim(id: string, at: number) {
    await this.redis.hdel(HK.reclaimed(id), `r:${at}`);
  }

  async lockReclaim(ttlMs: number) {
    return (await this.redis.set(HK.reclaimLock, "1", { nx: true, px: ttlMs })) !== null;
  }

  async addItem(pair: HousePair, zone: HouseZone, itemId: string, max: number) {
    const { keys, sea } = this.poolKeys(pair, zone);
    const r = Number(await this.redis.eval<string[], number>(ADD_ITEM_LUA, [...keys, HK.meta(pairIds(pair, zone).self)], [sea, itemId, String(max)]));
    return r < 0 ? ("no_house" as const) : r === 0 ? ("max" as const) : ("ok" as const);
  }

  async takeItem(pair: HousePair, zone: HouseZone, itemId: string) {
    const { keys, sea } = this.poolKeys(pair, zone);
    const r = Number(await this.redis.eval<string[], number>(TAKE_ITEM_LUA, keys, [sea, itemId]));
    return r === -1 ? ("none" as const) : r === -2 ? ("away" as const) : r === 0 ? ("placed" as const) : ("ok" as const);
  }

  async saveDesign(
    pair: HousePair,
    zone: HouseZone,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
  ): Promise<SaveResult> {
    const id = pairIds(pair, zone).self;
    const { keys, sea } = this.poolKeys(pair, zone);
    const r = Number(
      await this.redis.eval<string[], number>(
        SAVE_LUA,
        [...keys, HK.meta(id), HK.layout(id), HK.score, HK.states(id), HK.plants(id)],
        [
          sea,
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

import type { QuestHook } from "../store/types";
import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { caravanDesignKey, CLOSED_LOTS, isCampYard, parseCaravanDesign, type CaravanDesign } from "@tomb/protocol";
import {
  defaultExterior,
  FURNITURE,
  isHouseOwnDef,
  isSharedSkinDef,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  LEGACY_HOUSING_CHANNEL,
  LIKE_WEIGHT,
  PLOT_TIERS,
  TIER_SCORE_BONUS,
  CAMP_LOT_COUNT,
  campLotByNo,
  campSizeBonus,
  cottageStyleOf,
  type CampInfo,
  type CottageStyleId,
  type HouseSort,
  type HouseZone,
  type PlotTierId,
} from "./catalog";
import type { ReportBy } from "../reports";
import { K } from "../store/keys";
import { emptyLayout, itemCount, liftWindowSkins, normalizeExterior } from "./layout";
import {
  GUEST_DAY_TTL_SEC,
  GUEST_REPORT_TTL_SEC,
  invView,
  LIKE_TTL_SEC,
  pairIds,
  recordScore,
  SCORE_RULE_VER,
  SEA_STARTER_KEEP,
  zoneTag,
  type HouseBrief,
  type HousePair,
  type InvView,
  type HouseRecord,
  type CreateResult,
  type GuestReporter,
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
//  houses:sealots:{ch}       HASH 11/16 포구 오두막 터 번호(1..11) → 집 id (마을 번지와 따로. 오두막 집 기록은 zone=sea, style)
//                            (오두막 집 id = 계정 id의 다른 HMAC — 한 계정이 마을 집 + 오두막을 따로 가진다)
//  houses:camplots:{ch}      HASH 11/26 캠핑장 집터 번호(1..16) → 집 id (캠핑장 집 기록은 zone=camp, kind(caravan|pension|rural — 터로 정해짐), yard(1..3 앞마당))
//                            (캠핑장 집 id = 계정 id의 또 다른 HMAC — 종류와 상관없이 한 사람 한 채)
//  house:{id} 의 villa 칸     11/26 별장 표시 '1'|'0' (살 때 정한다. 칸이 없으면 옛 기록 — 처음 읽을 때 HSETNX로 한 번 남긴다)
//  house:{id}:inv 의 "~starter" 칸 = 시작 가구를 이미 준 표시 (가방 읽기에서 뺀다)
//  houses:lots               HASH 옛 번지 색인 (채널 없음). 1채널 색인을 쓰는 Lua가 먼저 houses:lots:1로 옮긴다 (MIGRATE_FN)
//  house:{id}:layout         STRING 배치 JSON
//  house:{id}:inv            HASH 그 집 몫 물건 id → 개수 (놓은 것 포함): 바닥·벽지·외관 + 오두막 시작 가구 (11/16 공용 가방 뒤)
//                            "~pooled" 칸 = 옛 가방의 가구를 공용 가방으로 옮김 (한 번만. POOL_FN pmerge)
//  house:{마을 집 id}:pool   HASH 11/16 공용 가구 가방: 물건 id → 개수 (한 계정의 집들 — 11/26 마을·포구·캠핑장 세 채 — 이 나눠 놓는다. 마을 집이 없어도 이 자리)
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
//                            houses:score 점수 = placedScore + likes × LIKE_WEIGHT + 11/22 터 크기 점수 (TIER_FN — 집 해시에는 물건 몫만 남긴다)
//  houses:score:ver          STRING 11/22 houses:score를 맞춘 점수 규칙 판 (SCORE_RULE_VER와 다르면 syncRankScores가 한 번 다시 맞춘다)
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
  /** 11/18 글을 신고한 계정 → {이름, 시각, weak} JSON (계정 단위 중복 막기 겸 관리자 신고함 「누가」). 옛 guestRepIps(IP 집합)는 저절로 사라진다 */
  guestRepBy: (id: string, eid: string) => `house:${id}:guestrepby:${eid}`,
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
  /** 11/22 순위 ZSET을 맞춘 점수 규칙 판 */
  scoreVer: "houses:score:ver",
  /** 채널 ch의 번지 색인 */
  lots: (ch: number) => `houses:lots:${ch}`,
  /** 11/16 채널 ch의 포구 오두막 터 색인 */
  seaLots: (ch: number) => `houses:sealots:${ch}`,
  /** 11/26 채널 ch의 캠핑장 집터 색인 */
  campLots: (ch: number) => `houses:camplots:${ch}`,
  /** 옛 번지 색인 (채널이 생기기 전. 읽기 호환·이전용) */
  legacyLots: "houses:lots",
};

const isLegacyCh = (ch: number, zone?: HouseZone | string | null) => (ch === LEGACY_HOUSING_CHANNEL && !zoneTag(zone) ? "1" : "0");
/** 그 구역의 번지 색인 키 */
const lotsKey = (ch: number, zone?: HouseZone | string | null) => (zone === "sea" ? HK.seaLots(ch) : zone === "camp" ? HK.campLots(ch) : HK.lots(ch));
const STARTER_MARK = "~starter";

const SORT_KEY: Record<HouseSort, string> = { score: HK.score, likes: HK.likes, new: HK.new };

// 11/22 터 크기 꾸밈 점수 (catalog TIER_SCORE_BONUS를 상수로 박는다) + 순위 점수 한 곳 계산 (store.ts scoreOf와 같은 식).
// 집 해시의 placedScore는 물건 몫만이라, 순위 ZSET을 쓰는 Lua마다 이 함수로 그 집의 지금 tier·likes에서 다시 센다
// 11/26 캠핑장 집은 터 크기 대신 넓히기·앞마당 점수 (catalog campSizeBonus를 "터:tier:앞마당" 표로 박는다 — 0인 칸은 뺀다)
const CAMP_BONUS_TABLE = Array.from({ length: CAMP_LOT_COUNT }, (_, i) => i + 1)
  .flatMap((lot) => ["small", "wide"].flatMap((t) => [1, 2, 3].map((y) => [`${lot}:${t}:${y}`, campSizeBonus(lot, t, y)] as const)))
  .filter(([, b]) => b > 0)
  .map(([k, b]) => `[${JSON.stringify(k)}]=${b}`)
  .join(",");
const TIER_FN = `
local TIER_BONUS = {${PLOT_TIERS.map((t) => `${t.id}=${TIER_SCORE_BONUS[t.id]}`).join(",")}}
local CAMP_BONUS = {${CAMP_BONUS_TABLE}}
local function tierBonus(t) return TIER_BONUS[t or ''] or 0 end
local function sizeBonus(t, zone, lot, yard)
  if zone == 'camp' then return CAMP_BONUS[tostring(lot or '') .. ':' .. tostring(t or '') .. ':' .. tostring(yard or '1')] or 0 end
  return tierBonus(t)
end
local function rankScore(meta, w)
  local v = redis.call('HMGET', meta, 'placedScore', 'likes', 'tier', 'zone', 'lot', 'yard')
  return (tonumber(v[1] or '0') or 0) + (tonumber(v[2] or '0') or 0) * tonumber(w) + sizeBonus(v[3], v[4], v[5], v[6])
end
`;

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
//       zone(''|'sea'|'camp'), style, starterJson(''=없음: 가방에 +1씩, ~starter 표시가 없을 때만),
//       placedJson(''=없음: 처음 배치에 놓인 개수), placedScore, itemsCount,
//       11/26 villa(''=기록 안 함 | '0' 첫 집 | '1' 별장), kind(캠핑장 집 종류), yard(캠핑장 앞마당), design(''=없음 | 카라반 디자인 "airstream.2.1")
// KEYS[11..] = 11/26 같은 계정의 다른 집 meta (villa가 '0'인데 그중 하나라도 있으면 -4 — 동시에 두 집을 사서 둘 다 첫 집 값이 되지 않게)
// 반환: 번지, -1 이미 있음, -2 그 번지는 이미 분양됨, -3 빈 번지 없음, -4 그 사이 다른 집이 생김 (별장 값으로 다시)
const CREATE_LUA = `${FREE_LOT_FN}${MIGRATE_FN}${TIER_FN}
if redis.call('EXISTS', KEYS[1]) == 1 then return -1 end
if ARGV[21] == '0' then
  for i = 11, #KEYS do
    if redis.call('EXISTS', KEYS[i]) == 1 then return -4 end
  end
end
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
if ARGV[15] == 'camp' then redis.call('HSET', KEYS[1], 'zone', 'camp', 'kind', ARGV[22], 'yard', ARGV[23]) end
if ARGV[15] == 'camp' and ARGV[24] and ARGV[24] ~= '' then redis.call('HSET', KEYS[1], 'design', ARGV[24]) end
if ARGV[21] ~= '' then redis.call('HSET', KEYS[1], 'villa', ARGV[21]) end
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
redis.call('ZADD', KEYS[5], score0 + sizeBonus(ARGV[6], ARGV[15], lot, ARGV[23]), ARGV[1])
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

// 11/19 「필지 대기」 (2단지를 닫으며 메인 맵에 빈 번지가 없을 때): 색인 칸이 이 집이면 비우고 집의 번지를 0으로
// KEYS: meta, lots(ch), legacyLots  ARGV: id, legacy('1'|'0')  반환: 1 (집이 없으면 0)
const UNASSIGN_LOT_LUA = `${MIGRATE_FN}
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
if ARGV[2] == '1' then migrateLegacy(KEYS[3], KEYS[2]) end
local old = redis.call('HGET', KEYS[1], 'lot')
if old and redis.call('HGET', KEYS[2], old) == ARGV[1] then redis.call('HDEL', KEYS[2], old) end
redis.call('HSET', KEYS[1], 'lot', 0)
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
// 11/22 같은 Lua에서 순위 점수도 새 터 크기 점수로 (숨긴 집은 순위에 없으니 그대로)
// KEYS: meta, score  ARGV: from, to, now, price, id, likeWeight
const UPGRADE_LUA = `${TIER_FN}
if redis.call('HGET', KEYS[1], 'tier') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'tier', ARGV[2], 'updatedAt', ARGV[3])
if tonumber(ARGV[4] or '0') > 0 and redis.call('HEXISTS', KEYS[1], 'paid') == 1 then redis.call('HINCRBY', KEYS[1], 'paid', ARGV[4]) end
if redis.call('HGET', KEYS[1], 'hidden') ~= '1' then redis.call('ZADD', KEYS[2], rankScore(KEYS[1], ARGV[6]), ARGV[5]) end
return 1
`;

// 11/22 한 집의 순위 점수를 지금 규칙으로 다시 쓴다 (터 크기 점수가 생기기 전에 넓힌 집. 숨긴 집·없는 집은 건드리지 않는다 → 몇 번을 불러도 같다)
// KEYS: meta, score  ARGV: id, likeWeight  반환: 1 썼음, 0 건너뜀
const RESCORE_LUA = `${TIER_FN}
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('HGET', KEYS[1], 'hidden') == '1' then return 0 end
redis.call('ZADD', KEYS[2], rankScore(KEYS[1], ARGV[2]), ARGV[1])
return 1
`;

// 11/26 캠핑장 앞마당 다음 단계: 캠핑장 집이고 지금 단계가 from일 때만. 낸 포인트(paid) 기록이 있으면 더하고, 순위 점수도 같은 Lua에서
// KEYS: meta, score  ARGV: from, to, now, price, id, likeWeight  반환: 1 바꿈, 0 아님(다른 집·단계가 이미 바뀜)
const YARD_LUA = `${TIER_FN}
if redis.call('HGET', KEYS[1], 'zone') ~= 'camp' then return 0 end
if (redis.call('HGET', KEYS[1], 'yard') or '1') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'yard', ARGV[2], 'updatedAt', ARGV[3])
if tonumber(ARGV[4] or '0') > 0 and redis.call('HEXISTS', KEYS[1], 'paid') == 1 then redis.call('HINCRBY', KEYS[1], 'paid', ARGV[4]) end
if redis.call('HGET', KEYS[1], 'hidden') ~= '1' then redis.call('ZADD', KEYS[2], rankScore(KEYS[1], ARGV[6]), ARGV[5]) end
return 1
`;

// 11/26 별장 표시가 없는 옛 기록에 한 번 남긴다 (HSETNX — 이미 있으면 그대로). KEYS: meta  ARGV: '1'|'0'  반환: 남은 값, 집이 없으면 -1
const SETTLE_VILLA_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
redis.call('HSETNX', KEYS[1], 'villa', ARGV[1])
return redis.call('HGET', KEYS[1], 'villa')
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

// 문패·소개 바꾸기  KEYS: meta  ARGV: name, intro, now  반환: {바꾸기 전 이름}, 집이 없으면 nil (11/26 — 이름이 같으면 집 바뀜 알림을 건너뛴다)
const PROFILE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
local prev = redis.call('HGET', KEYS[1], 'name') or ''
redis.call('HSET', KEYS[1], 'name', ARGV[1], 'intro', ARGV[2], 'updatedAt', ARGV[3])
return { prev }
`;

// 11/26 카라반 디자인 (캠핑장 카라반일 때만)  KEYS: meta  ARGV: design("airstream.2.1"), now  반환: 1 바꿈, 0 카라반 아님·없음
const CAMP_DESIGN_LUA = `
if redis.call('HGET', KEYS[1], 'zone') ~= 'camp' or redis.call('HGET', KEYS[1], 'kind') ~= 'caravan' then return 0 end
redis.call('HSET', KEYS[1], 'design', ARGV[1], 'updatedAt', ARGV[2])
return 1
`;

// 오두막 겉모습 (오두막일 때만)  KEYS: meta  ARGV: style, now
const STYLE_LUA = `
if redis.call('HGET', KEYS[1], 'zone') ~= 'sea' then return 0 end
redis.call('HSET', KEYS[1], 'style', ARGV[1], 'updatedAt', ARGV[2])
return 1
`;

// 11/16 공용 가구 가방 (store.ts invView·fitsPool·takeFrom과 같은 규칙).
//  OWN = 집에 딸린 물건 (외관 — 공용 가방에 넣지 않는다), KEEP = 오두막 시작 가구 (오두막 몫으로 1개씩)
//  pmerge: 옛 집 가방(물건이 다 들어 있던 inv)의 가구를 공용 가방으로 한 번만 옮긴다. "~pooled" 표시를 HSETNX로 먼저 세우므로
//  몇 번을 불러도 두 번 더하지 않는다(멱등). 가방을 쓰는 Lua마다 맨 앞에서 두 집 가방에 부른다 → 옮기기와 그 동작이 한 번에(원자적으로).
//  시작 가구를 받은 오두막(~starter)은 시작 가구를 1개씩 오두막 몫으로 남긴다. 놓인 개수(placed)는 그대로 → 옮긴 뒤에도 배치가 유효하다
//  (각 집이 몫을 넘게 놓은 수 ≤ 그 집이 옮긴 수라서 두 집 합계 ≤ 공용 개수)
//  11/24 smerge: 바닥·벽지(SKIN)도 공용 가방. 예전 집 몫(~pooled 뒤에 남은 것·오두막 시작 바닥·벽지·비운 집 가방)을 공용 가방으로 옮긴다.
//  옮긴 칸은 지우므로 몇 번 불러도 두 번 더하지 않는다(멱등). placed는 그대로 → 지금 입힌 바닥·벽지는 그대로 쓰는 중으로 센다
//  (각 집이 몫을 넘게 놓은 수가 옮긴 만큼만 늘어 두 집 합계 ≤ 공용 개수)
//  over: 그 집이 몫을 넘게 놓은 수 = 공용 가방에서 꺼내 놓은 수
const POOL_FN = `
local OWN = {${FURNITURE.filter((f) => isHouseOwnDef(f))
  .map((f) => `[${JSON.stringify(f.id)}]=true`)
  .join(",")}}
local SKIN = {${FURNITURE.filter((f) => isSharedSkinDef(f))
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
local function smerge(inv, pool)
  local flat = redis.call('HGETALL', inv)
  for i = 1, #flat, 2 do
    if SKIN[flat[i]] then
      local n = tonumber(flat[i + 1]) or 0
      if n > 0 then redis.call('HINCRBY', pool, flat[i], n) end
      redis.call('HDEL', inv, flat[i])
    end
  end
end
local function over(placed, inv, it)
  local d = num(placed, it) - num(inv, it)
  if d > 0 then return d end
  return 0
end
`;

// 가방 Lua 공통 KEYS 앞 7개 (11/26 세 집): pool, inv(이 집), placed(이 집), inv(다른 집 1), placed(다른 집 1), inv(다른 집 2), placed(다른 집 2)
// ARGV[1]: 포구 오두막 자리 ('0' 이 집 · '1' 다른 집 1 · '2' 다른 집 2 — 시작 가구를 오두막 몫으로 남길 집). store.ts pairIds와 같은 순서
// outOthers = 다른 두 집이 공용 가방에서 꺼내 놓은 수 합 (store.ts overOthers)
const POOL_MERGE = `
pmerge(KEYS[2], KEYS[1], ARGV[1] == '0')
pmerge(KEYS[4], KEYS[1], ARGV[1] == '1')
pmerge(KEYS[6], KEYS[1], ARGV[1] == '2')
smerge(KEYS[2], KEYS[1])
smerge(KEYS[4], KEYS[1])
smerge(KEYS[6], KEYS[1])
local function outOthers(it) return over(KEYS[5], KEYS[4], it) + over(KEYS[7], KEYS[6], it) end
`;

// 그 집에서 본 가방 (옮기기 먼저)  반환: {pool, inv, inv1, placed1, inv2, placed2} HGETALL 여섯
const INV_LUA = `${POOL_FN}${POOL_MERGE}
return {redis.call('HGETALL', KEYS[1]), redis.call('HGETALL', KEYS[2]), redis.call('HGETALL', KEYS[4]), redis.call('HGETALL', KEYS[5]), redis.call('HGETALL', KEYS[6]), redis.call('HGETALL', KEYS[7])}
`;

// KEYS: 가방 7개, meta(이 집)  ARGV: seaSlot, itemId, max
// 가구는 공용 가방에, 집에 딸린 물건은 이 집 가방에
const ADD_ITEM_LUA = `${POOL_FN}
if redis.call('EXISTS', KEYS[8]) == 0 then return -1 end
${POOL_MERGE}
local bag = KEYS[1]
if OWN[ARGV[2]] then bag = KEYS[2] end
if num(bag, ARGV[2]) >= tonumber(ARGV[3]) then return 0 end
redis.call('HINCRBY', bag, ARGV[2], 1)
return 1
`;

// 되팔기 1개 (store.ts takeFrom): 세 집 어디에도 놓이지 않은 공용 몫이 있으면 공용에서, 아니면 이 집 몫에서
// KEYS: 가방 7개  ARGV: seaSlot, itemId
// 반환: 1 뺐음, -1 없음, 0 이 집에 다 놓임, -2 남은 건 다른 집에 놓임
const TAKE_ITEM_LUA = `${POOL_FN}${POOL_MERGE}
local it = ARGV[2]
local o = num(KEYS[2], it)
local p = num(KEYS[1], it)
if o + p < 1 then return -1 end
local out = outOthers(it)
local bag
if p - over(KEYS[3], KEYS[2], it) - out >= 1 then bag = KEYS[1]
elseif o - num(KEYS[3], it) >= 1 then bag = KEYS[2]
elseif out > 0 and num(KEYS[3], it) == 0 then return -2
else return 0 end
if redis.call('HINCRBY', bag, it, -1) <= 0 then redis.call('HDEL', bag, it) end
return 1
`;

// 가진 개수 확인과 배치·놓은 개수·점수 갱신을 한 번에 (되팔기·다른 집 저장과 경합해 가진 것보다 많이 놓이지 않게)
// 11/16 공용 가방: 물건마다 (이 집이 몫을 넘게 놓을 수) + (다른 집이 몫을 넘게 놓은 수) ≤ 공용 개수 (store.ts fitsPool).
//  두 집 저장이 모두 이 Lua라 두 집을 동시에 저장해도 합쳐서 넘게 놓이지 않는다
// 배치가 바뀌면 같은 Lua에서 치우거나 옮긴 가구 상태(서명이 다른 것)와 없어진 화분 기록을 지운다 (states.ts keepState와 같은 규칙)
// KEYS: 가방 7개, meta, layout, score, states, plants
// ARGV: seaSlot, id, tier, layoutJson(''=그대로), placedScore, itemsCount, now, likeWeight, exteriorJson(''=그대로),
//       sigsJson(배치 id → 서명, 상태 없는 가구는 ''), potsJson(화분 배치 id → true), base, [itemId, count]...
const SAVE_LUA = `${POOL_FN}${TIER_FN}
if redis.call('EXISTS', KEYS[8]) == 0 then return -1 end
if redis.call('HGET', KEYS[8], 'tier') ~= ARGV[3] then return -2 end
local was = tonumber(redis.call('HGET', KEYS[8], 'updatedAt') or '0') or 0
if ARGV[12] ~= '' and was ~= tonumber(ARGV[12]) then return -4 end
${POOL_MERGE}
for i = 13, #ARGV, 2 do
  local it = ARGV[i]
  local need = tonumber(ARGV[i + 1]) - num(KEYS[2], it)
  if need < 0 then need = 0 end
  if need + outOthers(it) > num(KEYS[1], it) then return -3 end
end
redis.call('DEL', KEYS[3])
for i = 13, #ARGV, 2 do redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 1]) end
if ARGV[4] ~= '' then
  redis.call('SET', KEYS[9], ARGV[4])
  redis.call('HSET', KEYS[8], 'items', ARGV[6])
  local sigs = cjson.decode(ARGV[10])
  local st = redis.call('HGETALL', KEYS[11])
  for i = 1, #st, 2 do
    local ok, v = pcall(cjson.decode, st[i + 1])
    local keep = false
    if ok and type(v) == 'table' and type(v.s) == 'string' then
      local sig = sigs[st[i]]
      if sig ~= nil then keep = sig ~= '' and sig == v.s else keep = v.s == '${WINDOW_SIG}' end
    end
    if not keep then redis.call('HDEL', KEYS[11], st[i]) end
  end
  local pots = cjson.decode(ARGV[11])
  local pl = redis.call('HKEYS', KEYS[12])
  for i = 1, #pl do
    if not pots[pl[i]] then redis.call('HDEL', KEYS[12], pl[i]) end
  end
end
if ARGV[9] ~= '' then redis.call('HSET', KEYS[8], 'exterior', ARGV[9]) end
redis.call('HSET', KEYS[8], 'placedScore', ARGV[5], 'updatedAt', math.max(tonumber(ARGV[7]), was + 1))
if redis.call('HGET', KEYS[8], 'hidden') ~= '1' then
  redis.call('ZADD', KEYS[10], rankScore(KEYS[8], ARGV[8]), ARGV[2])
end
return 1
`;

// KEYS: meta, likeMark, score, likes  ARGV: id, ttl, likeWeight
// 11/18 KEYS[5]·ARGV[4]·ARGV[5]가 있으면 누른 사람의 오늘의 할 일 진행 칸도 +1 (오늘 적립 해시, 칸이 처음 생기면 만료) → 맨 뒤에 진행 값
const LIKE_LUA = `${TIER_FN}
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('HGET', KEYS[1], 'hidden') == '1' then return nil end
if not redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then return {0} end
local likes = redis.call('HINCRBY', KEYS[1], 'likes', 1)
local score = rankScore(KEYS[1], ARGV[3])
redis.call('ZADD', KEYS[3], score, ARGV[1])
redis.call('ZADD', KEYS[4], likes, ARGV[1])
if KEYS[5] then
  local q = redis.call('HINCRBY', KEYS[5], ARGV[4], 1)
  if q == 1 then redis.call('EXPIRE', KEYS[5], ARGV[5]) end
  return {1, likes, score, q}
end
return {1, likes, score}
`;

// 숨기면 공개 목록에서 빼고, 풀면 현재 값으로 다시 넣는다
// KEYS: meta, new, score, likes  ARGV: id, hidden('1'|'0'), likeWeight
const HIDE_LUA = `${TIER_FN}
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
  redis.call('ZADD', KEYS[3], rankScore(KEYS[1], ARGV[3]), ARGV[1])
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
// KEYS: guest, guestHide, guestRep, guestRepIps, guestRepBy  ARGV: entryId
const REMOVE_GUEST_LUA = `
local all = redis.call('LRANGE', KEYS[1], 0, -1)
local needle = '"id":"' .. ARGV[1] .. '"'
for i = 1, #all do
  if string.find(all[i], needle, 1, true) then
    redis.call('LREM', KEYS[1], 1, all[i])
    redis.call('SREM', KEYS[2], ARGV[1])
    redis.call('HDEL', KEYS[3], ARGV[1])
    redis.call('DEL', KEYS[4], KEYS[5])
    return all[i]
  end
end
return nil
`;

// 11/18 계정 단위: 신고한 계정 해시에 HSETNX (같은 계정이면 중복). 약한 신고(갓 만든 계정)는 신고 수를 올리지 않는다
// KEYS: guest, guestRepBy, guestRep, guestHide  ARGV: entryId, accountId, ttl, hideAt, weak, 기록 JSON
const REPORT_GUEST_LUA = `
local all = redis.call('LRANGE', KEYS[1], 0, -1)
local needle = '"id":"' .. ARGV[1] .. '"'
local found = false
for i = 1, #all do
  if string.find(all[i], needle, 1, true) then found = true break end
end
if not found then return -1 end
if redis.call('HSETNX', KEYS[2], ARGV[2], ARGV[6]) == 0 then return 0 end
redis.call('EXPIRE', KEYS[2], ARGV[3])
if ARGV[5] == '1' then
  redis.call('HINCRBY', KEYS[3], ARGV[1], 0)
  return 1
end
local n = redis.call('HINCRBY', KEYS[3], ARGV[1], 1)
if n >= tonumber(ARGV[4]) then redis.call('SADD', KEYS[4], ARGV[1]) end
return 1
`;

/**
 * 집 해시의 ch·lot·zone (HMGET). 이 클라이언트(redisClient, automaticDeserialization false)는 HMGET을 이름 없는 배열로 준다 —
 * 객체로 읽으면(meta.ch) 늘 비어 지우기가 번지를 못 비우고, 다른 채널 집도 1채널 색인을 썼다 (11/22 실제 Redis 시험으로 잡음). 객체로 와도 받는다
 */
async function metaLoc(redis: Redis, id: string): Promise<{ lot: string | null; ch: string | null; zone: string | null }> {
  const got = (await redis.hmget(HK.meta(id), "lot", "ch", "zone")) as unknown;
  const at = (i: number, f: string) => {
    const v = Array.isArray(got) ? got[i] : (got as Record<string, unknown> | null)?.[f];
    return v === null || v === undefined ? null : String(v);
  };
  return { lot: at(0, "lot"), ch: at(1, "ch"), zone: at(2, "zone") };
}

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
    // 11/24 예전에 바닥에 놓은 눈꽃 창가는 창문 모양으로 읽는다 (layout.ts liftWindowSkins)
    return Array.isArray(v.items) ? liftWindowSkins(v) : emptyLayout();
  } catch {
    return emptyLayout();
  }
}

/** 11/26 캠핑장 집 종류·앞마당·카라반 디자인 (종류 칸이 이상하면 터로 정한다 — 터가 종류를 정한다. 디자인 칸이 없거나 이상하면 비워 둔다 → 서비스가 그 자리 기본 모습) */
function campInfoOf(kind: string | null | undefined, yard: string | null | undefined, lot: number, design?: string | null): CampInfo {
  const byLot = campLotByNo(lot)?.kind;
  const k = kind === "caravan" || kind === "pension" || kind === "rural" ? kind : (byLot ?? "caravan");
  const y = Number(yard ?? 1);
  const d = k === "caravan" ? parseCaravanDesign(design) : null;
  return { kind: k, yard: isCampYard(y) ? y : 1, ...(d ? { design: d } : {}) };
}

/** HMGET 결과 (redisClient는 이름 없는 배열, 혹시 객체로 와도 받는다) → 필드 이름 → 값 */
function hmgetMap(got: unknown, fields: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  fields.forEach((f, i) => {
    const v = Array.isArray(got) ? got[i] : (got as Record<string, unknown> | null)?.[f];
    if (v !== null && v !== undefined) m.set(f, String(v));
  });
  return m;
}

/** 집 요약에 읽는 칸 (brief) */
const BRIEF_FIELDS = ["owner", "zone", "ch", "lot", "tier", "villa", "kind", "yard", "paid", "design"] as const;

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
  const lot = Number(m.get("lot") ?? 0);
  const zone = zoneTag(m.get("zone"));
  const camp = zone === "camp" ? campInfoOf(m.get("kind"), m.get("yard"), lot, m.get("design")) : null;
  const tier = (m.get("tier") ?? "small") as PlotTierId;
  return {
    id,
    ch: housingChannelOf(m.get("ch")),
    lot,
    ...(zone === "sea" ? { zone: "sea" as const, style: cottageStyleOf(m.get("style")) } : {}),
    ...(camp ? { zone: "camp" as const, camp } : {}),
    ...(m.has("villa") ? { villa: m.get("villa") === "1" } : {}),
    exterior: normalizeExterior(exterior),
    owner: m.get("owner")!,
    name: m.get("name") ?? "",
    intro: m.get("intro") ?? "",
    ownerName: m.get("ownerName") ?? "",
    tier,
    layout: layout ?? emptyLayout(),
    likes,
    placedScore,
    score: recordScore({ placedScore, likes, tier, lot, ...(camp ? { zone: "camp" as const, camp } : {}) }),
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
  /** 가방 Lua 공통 KEYS 앞 7개와 ARGV[1] (POOL_MERGE — 포구 오두막 자리) */
  private poolKeys(pair: HousePair, zone: HouseZone): { keys: string[]; sea: string } {
    const { self, others, seaSlot } = pairIds(pair, zone);
    return {
      keys: [HK.pool(pair.village), HK.inv(self), HK.placed(self), HK.inv(others[0]), HK.placed(others[0]), HK.inv(others[1]), HK.placed(others[1])],
      sea: String(seaSlot + 1),
    };
  }

  async inventory(pair: HousePair, zone: HouseZone): Promise<InvView> {
    const { keys, sea } = this.poolKeys(pair, zone);
    const r = await this.redis.eval<string[], (string[] | null)[]>(INV_LUA, keys, [sea]);
    return invView(counts(r?.[0]), counts(r?.[1]), [
      { own: counts(r?.[2]), placed: counts(r?.[3]) },
      { own: counts(r?.[4]), placed: counts(r?.[5]) },
    ]);
  }

  async ownItems(id: string) {
    return counts((await this.redis.hgetall(HK.inv(id))) as unknown as string[] | null);
  }

  async create(n: NewHouse): Promise<CreateResult> {
    const ch = housingChannelOf(n.ch ?? LEGACY_HOUSING_CHANNEL);
    const zone = zoneTag(n.zone) ?? "";
    const camp = zone === "camp" ? (n.camp ?? campInfoOf(null, null, n.lot ?? 0)) : null;
    if (n.lot !== null) await this.clearStaleLot(ch, n.lot, zone);
    const r = Number(
      await this.redis.eval<string[], number>(
        CREATE_LUA,
        [
          HK.meta(n.id),
          HK.layout(n.id),
          HK.all,
          HK.new,
          HK.score,
          HK.likes,
          lotsKey(ch, zone),
          HK.legacyLots,
          HK.inv(n.id),
          HK.placed(n.id),
          ...(n.villa === false ? (n.others ?? []).map((o) => HK.meta(o)) : []),
        ],
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
          zone === "sea" ? cottageStyleOf(n.style) : "",
          n.starter?.length ? JSON.stringify(n.starter) : "",
          n.placed && Object.keys(n.placed).length ? JSON.stringify(n.placed) : "",
          String(n.placedScore ?? 0),
          String(n.layout ? itemCount(n.layout) : 0),
          n.villa === undefined ? "" : n.villa ? "1" : "0",
          camp ? camp.kind : "",
          camp ? String(camp.yard) : "",
          camp?.kind === "caravan" && camp.design ? caravanDesignKey(camp.design) : "",
        ],
      ),
    );
    return r > 0 ? { lot: r } : r === -1 ? "exists" : r === -2 ? "lot_taken" : r === -4 ? "villa_changed" : "full";
  }

  async assignLot(id: string) {
    // 집의 채널은 바뀌지 않는다 (분양 때 정해진다). 먼저 읽고 그 채널 색인으로 Lua를 부른다
    const meta = await metaLoc(this.redis, id);
    const ch = housingChannelOf(meta?.ch);
    const zone = zoneTag(meta?.zone);
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
    const want = zoneTag(zone);
    // 포구·캠핑장 색인은 HGETALL 하나 (옛 색인 옮기기가 필요 없다)
    const flat = want
      ? ((await this.redis.hgetall(lotsKey(ch, want))) as unknown as string[] | Record<string, string> | null)
      : await this.redis.eval<string[], string[] | null>(VILLAGE_LUA, [HK.lots(ch), HK.legacyLots], [isLegacyCh(ch)]);
    const entries: [string, string][] = Array.isArray(flat) || flat === null ? [...pairs(flat)] : Object.entries(flat).map(([k, v]) => [k, String(v)]);
    const byLot = new Map(entries.map(([lot, id]) => [id, Number(lot)]));
    const recs = await this.records([...byLot.keys()], false);
    // 색인과 집 기록이 서로 맞는 것만 (채널·번지·구역이 다르면 색인이 낡은 것)
    return recs.filter((r) => r.lot > 0 && r.ch === ch && r.zone === want && byLot.get(r.id) === r.lot).sort((a, b) => a.lot - b.lot);
  }

  /** 번지 칸이 낡았으면(가리키는 집이 없거나 다른 번지) 비운다 */
  private async clearStaleLot(ch: number, lot: number, zone?: HouseZone | string | null) {
    if (isLegacyCh(ch, zone) === "1") await this.redis.eval<string[], number[]>(MIGRATE_LUA, [HK.legacyLots, HK.lots(ch)], []);
    const key = lotsKey(ch, zone);
    const holder = await this.redis.hget<string>(key, String(lot));
    if (holder) await this.redis.eval<string[], number>(CLEAR_STALE_LOT_LUA, [key, HK.meta(String(holder))], [String(lot), String(holder)]);
  }

  async unlot(id: string) {
    const meta = await metaLoc(this.redis, id);
    const ch = housingChannelOf(meta?.ch ?? undefined);
    const zone = zoneTag(meta?.zone);
    return Number(await this.redis.eval<string[], number>(UNASSIGN_LOT_LUA, [HK.meta(id), lotsKey(ch, zone), HK.legacyLots], [id, isLegacyCh(ch, zone)])) === 1;
  }

  async moveLot(id: string, lot: number) {
    const meta = await metaLoc(this.redis, id);
    const ch = housingChannelOf(meta?.ch ?? undefined);
    const zone = zoneTag(meta?.zone);
    await this.clearStaleLot(ch, lot, zone);
    const r = Number(await this.redis.eval<string[], number>(MOVE_LOT_LUA, [HK.meta(id), lotsKey(ch, zone), HK.legacyLots], [id, String(lot), isLegacyCh(ch, zone)]));
    return r === 1 ? ("ok" as const) : r === -1 ? ("no_house" as const) : ("taken" as const);
  }

  async remove(id: string) {
    const [eids, meta] = await Promise.all([
      this.guestbook(id, true).then((l) => l.map((g) => g.id)),
      metaLoc(this.redis, id),
    ]);
    if (meta?.lot) await this.redis.eval<string[], number>(UNLOT_LUA, [lotsKey(housingChannelOf(meta.ch), meta.zone), HK.legacyLots], [String(meta.lot), id]);
    const p = this.redis.pipeline();
    p.del(HK.meta(id), HK.layout(id), HK.inv(id), HK.placed(id), HK.guest(id), HK.guestHide(id), HK.guestRep(id), HK.plants(id), HK.states(id));
    for (const e of eids) p.del(HK.guestRepIps(id, e), HK.guestRepBy(id, e));
    for (const z of [HK.all, HK.new, HK.score, HK.likes]) p.zrem(z, id);
    await p.exec();
  }

  async setStyle(id: string, style: CottageStyleId, now: number) {
    return Number(await this.redis.eval<string[], number>(STYLE_LUA, [HK.meta(id)], [style, String(now)])) === 1;
  }

  async setCampDesign(id: string, design: CaravanDesign, now: number) {
    return Number(await this.redis.eval<string[], number>(CAMP_DESIGN_LUA, [HK.meta(id)], [caravanDesignKey(design), String(now)])) === 1;
  }

  async setProfile(id: string, name: string, intro: string, now: number) {
    const r = (await this.redis.eval(PROFILE_LUA, [HK.meta(id)], [name, intro, String(now)])) as unknown;
    return Array.isArray(r) ? String(r[0] ?? "") : null;
  }

  async upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number, price = 0) {
    return Number(await this.redis.eval<string[], number>(UPGRADE_LUA, [HK.meta(id), HK.score], [from, to, String(now), String(price), id, String(LIKE_WEIGHT)])) === 1;
  }

  async setYard(id: string, from: number, to: number, now: number, price: number) {
    return Number(await this.redis.eval<string[], number>(YARD_LUA, [HK.meta(id), HK.score], [String(from), String(to), String(now), String(price), id, String(LIKE_WEIGHT)])) === 1;
  }

  async settleVilla(id: string, villa: boolean) {
    const r = await this.redis.eval<string[], string | number | null>(SETTLE_VILLA_LUA, [HK.meta(id)], [villa ? "1" : "0"]);
    if (r === null || r === undefined || Number(r) === -1) return null;
    return String(r) === "1";
  }

  async brief(ids: readonly string[]): Promise<(HouseBrief | null)[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.hmget(HK.meta(id), ...BRIEF_FIELDS);
    const res = await p.exec<unknown[]>();
    return ids.map((id, i): HouseBrief | null => {
      const m = hmgetMap(res[i], BRIEF_FIELDS);
      if (!m.has("owner")) return null;
      const lot = Number(m.get("lot") ?? 0);
      const zone = zoneTag(m.get("zone"));
      return {
        id,
        ...(zone ? { zone } : {}),
        ch: housingChannelOf(m.get("ch")),
        lot,
        tier: (m.get("tier") ?? "small") as PlotTierId,
        ...(m.has("villa") ? { villa: m.get("villa") === "1" } : {}),
        ...(zone === "camp" ? { camp: campInfoOf(m.get("kind"), m.get("yard"), lot, m.get("design")) } : {}),
        ...(m.has("paid") ? { paid: Number(m.get("paid")) || 0 } : {}),
      };
    });
  }

  /**
   * 11/22 순위 ZSET을 지금 점수 규칙으로 한 번 다시 맞춘다 (터 크기 점수가 생기기 전에 넓힌 집 — 다시 저장하지 않아도).
   * 표시(houses:score:ver)가 SCORE_RULE_VER면 GET 하나로 끝. 아니면 모든 집(houses:all)을 집마다 Lua 하나로 다시 쓰고 표시를 남긴다.
   * 집마다 그 집의 지금 값에서 세므로 두 인스턴스가 겹쳐 돌거나 좋아요·저장과 겹쳐도 같은 결과다 (멱등)
   */
  async syncRankScores(): Promise<number | null> {
    if ((await this.redis.get<string>(HK.scoreVer)) === SCORE_RULE_VER) return null;
    const ids = await this.redis.zrange<string[]>(HK.all, 0, -1);
    let n = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const p = this.redis.pipeline();
      for (const id of ids.slice(i, i + 50)) p.eval(RESCORE_LUA, [HK.meta(id), HK.score], [id, String(LIKE_WEIGHT)]);
      n += (await p.exec<number[]>()).reduce((sum, r) => sum + (Number(r) === 1 ? 1 : 0), 0);
    }
    await this.redis.set(HK.scoreVer, SCORE_RULE_VER);
    return n;
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
    if (eids.length) await this.redis.del(...eids.flatMap((e) => [HK.guestRepIps(id, e), HK.guestRepBy(id, e)]));
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
    base?: number,
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
          String(layout ? itemCount(layout) : 0),
          String(now),
          String(LIKE_WEIGHT),
          exterior ? JSON.stringify(exterior) : "",
          layout ? JSON.stringify(stateSigs(layout)) : "",
          layout ? JSON.stringify(Object.fromEntries(layout.items.filter((p) => p.i === "pot").map((p) => [p.u, true]))) : "",
          base === undefined ? "" : String(base),
          ...Object.entries(counts).flatMap(([k, v]) => [k, String(v)]),
        ],
      ),
    );
    return r === 1 ? "ok" : r === -1 ? "no_house" : r === -2 ? "tier" : r === -4 ? "conflict" : "not_owned";
  }

  async like(id: string, visitorId: string, day: string, quest?: QuestHook | null) {
    const r = await this.redis.eval<string[], number[] | null>(
      LIKE_LUA,
      [HK.meta(id), HK.like(id, visitorId, day), HK.score, HK.likes, ...(quest ? [quest.key] : [])],
      [id, String(LIKE_TTL_SEC), String(LIKE_WEIGHT), ...(quest ? [quest.field, String(quest.ttlSec)] : [])],
    );
    if (!r) return null;
    if (Number(r[0]) === 0) return "already" as const;
    if (quest && r[3] !== undefined) quest.have = Number(r[3]) || 0;
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
    const out = (await this.records(ids, false)).filter((r) => !r.hidden);
    // 11/22 점수 순은 읽은 집 기록의 점수(터 크기 점수 포함)로 한 번 더 줄 세운다 — 순위 ZSET을 아직 다시 맞추지 않은 옛 집도 화면 순서가 맞게 (같은 점수는 ZSET 순서 그대로)
    return sort === "score" ? out.sort((a, b) => b.score - a.score) : out;
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
      [HK.guest(id), HK.guestHide(id), HK.guestRep(id), HK.guestRepIps(id, entryId), HK.guestRepBy(id, entryId)],
      [entryId],
    );
    return raw ? parseGuest(raw) : null;
  }

  async reportGuest(id: string, entryId: string, by: ReportBy, weak = false, at = Date.now()) {
    const rec = JSON.stringify({ name: by.name, at, ...(weak ? { weak: true } : {}) });
    const r = Number(
      await this.redis.eval<string[], number>(
        REPORT_GUEST_LUA,
        [HK.guest(id), HK.guestRepBy(id, entryId), HK.guestRep(id), HK.guestHide(id)],
        [entryId, by.accountId, String(GUEST_REPORT_TTL_SEC), String(GUEST_REPORT_HIDE), weak ? "1" : "0", rec],
      ),
    );
    return r < 0 ? null : r === 0 ? ("duplicate" as const) : ("added" as const);
  }

  async guestReporters(id: string, entryId: string) {
    const flat = (await this.redis.hgetall(HK.guestRepBy(id, entryId))) as unknown;
    // Upstash는 해시를 객체로 돌려주고 JSON 값은 풀어서 줄 수 있다
    const obj: Record<string, unknown> = Array.isArray(flat) ? Object.fromEntries(pairs(flat as string[])) : ((flat as Record<string, unknown> | null) ?? {});
    const out: GuestReporter[] = [];
    for (const [accountId, raw] of Object.entries(obj)) {
      const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as { name?: string | null; at?: number; weak?: boolean };
      out.push({ accountId, name: v.name ?? null, at: Number(v.at) || 0, ...(v.weak ? { weak: true as const } : {}) });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async setGuestHidden(id: string, entryId: string, hidden: boolean) {
    const exists = (await this.guestbook(id, true)).some((g) => g.id === entryId);
    if (!exists) return false;
    if (hidden) await this.redis.sadd(HK.guestHide(id), entryId);
    else await this.redis.pipeline().srem(HK.guestHide(id), entryId).hdel(HK.guestRep(id), entryId).del(HK.guestRepIps(id, entryId), HK.guestRepBy(id, entryId)).exec();
    return true;
  }

  async guestReports(id: string) {
    const flat = (await this.redis.hgetall(HK.guestRep(id))) as unknown as string[] | null;
    return new Map([...pairs(flat)].map(([k, v]) => [k, Number(v)]));
  }

  async guestReportsMany(ids: readonly string[]) {
    const out = new Map<string, Map<string, number>>();
    if (!ids.length) return out;
    const p = this.redis.pipeline();
    for (const id of ids) p.hgetall(HK.guestRep(id));
    const r = await p.exec<(string[] | null)[]>();
    ids.forEach((id, i) => out.set(id, new Map([...pairs(r[i] ?? null)].map(([k, v]) => [k, Number(v)]))));
    return out;
  }
}

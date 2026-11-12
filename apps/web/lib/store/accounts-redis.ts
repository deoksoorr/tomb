import { Redis } from "@upstash/redis";
import { MAX_DECOR_PER_GRAVE, type CosmeticSlot } from "@tomb/protocol";
import { CALENDAR_TTL_SEC, legacyAttendDays, type AttendClaim, type CalendarMonthRecord } from "../calendar";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import { STAY_BONUS_AMOUNTS, STAY_BONUS_EVERY_TICKS } from "../stayBonus";
import type { ActivityItem, Grave, GraveDecor } from "../types";
import { kstDay, WEEK_RANK_TTL_SEC, weekOfDay } from "./accounts";
import { chKeys, DECOR, K } from "./keys";
import { encode } from "./redis";
import {
  ACTIVITY_KEEP,
  ECON_TTL_SEC,
  PRESENCE_MIN_GAP_MS,
  spendCategory,
  type NameChangeResult,
  type AccountRecord,
  type AccountStore,
  type EarnOptions,
  type EquippedItem,
  type Profile,
  type RankEntry,
} from "./types";

// 포인트·가방은 모두 Lua 스크립트 하나로 바꾼다. 스크립트 실행 중에는 다른 명령이 끼어들 수 없으므로
// 잔액 확인과 차감, 한도 확인과 적립 사이에 경쟁이 생기지 않는다 (동시 구매로 잔액이 음수가 되지 않는다).
// 스크립트가 건드리는 키는 모두 KEYS로 넘긴다.

/** 오늘 적립 기록은 날짜가 지나면 필요 없다 (KST 자정 경계 여유로 2일) */
const EARN_TTL_SEC = 2 * 86_400;

/**
 * 항목별 하루 한도·하루 전체 한도·지갑 한도(+ ipKey가 있으면 같은 IP의 그 항목 합계) 안에서 적립하고
 * 모은 포인트(lifetime)와 포인트 랭킹을 같이 올린다. 개편 전 계정의 모은 포인트는 지금 잔액에서 시작한다.
 * 경제 통계(econ:{날짜})의 earn:{source}도 함께 올린다.
 * 그 주에 모은 포인트(주간 랭킹, c.week)도 같이 올린다.
 * MemoryAccounts.credit과 같은 규칙. c = { acct, earn, rank, econ, week, id, dailyCap, balanceCap, ttl }
 */
const CREDIT_FN = `
local function credit(c, source, points, dailyMax, ipKey, ipMax)
  local got = tonumber(redis.call('HGET', c.earn, source) or '0')
  local total = tonumber(redis.call('HGET', c.earn, '_total') or '0')
  local bal = tonumber(redis.call('HGET', c.acct, 'points') or '0')
  -- c.outsideTotal: 하루 전체 한도(_total)에 막히지도, 더하지도 않는다 (접속 보너스)
  local amount = math.min(points, dailyMax - got, c.outsideTotal and points or c.dailyCap - total, c.balanceCap - bal)
  if ipKey then amount = math.min(amount, ipMax - tonumber(redis.call('HGET', ipKey, source) or '0')) end
  if amount <= 0 then return 0 end
  redis.call('HINCRBY', c.earn, source, amount)
  if not c.outsideTotal then redis.call('HINCRBY', c.earn, '_total', amount) end
  redis.call('EXPIRE', c.earn, c.ttl)
  if ipKey then
    redis.call('HINCRBY', ipKey, source, amount)
    redis.call('EXPIRE', ipKey, c.ttl)
  end
  redis.call('HINCRBY', c.acct, 'points', amount)
  redis.call('HSETNX', c.acct, 'lifetime', bal)
  redis.call('ZADD', c.rank, redis.call('HINCRBY', c.acct, 'lifetime', amount), c.id)
  redis.call('ZINCRBY', c.week, amount, c.id)
  redis.call('EXPIRE', c.week, ${WEEK_RANK_TTL_SEC})
  redis.call('HINCRBY', c.econ, 'earn:' .. source, amount)
  redis.call('EXPIRE', c.econ, ${ECON_TTL_SEC})
  return amount
end
`;

/** 가방에서 1개 꺼내기. 없으면 false */
const TAKE_FN = `
local function take(inv, item)
  if tonumber(redis.call('HGET', inv, item) or '0') < 1 then return false end
  if redis.call('HINCRBY', inv, item, -1) <= 0 then redis.call('HDEL', inv, item) end
  return true
end
`;

/**
 * 캐릭터 꾸미기 착용 도우미. look = HASH 부위 → `${itemId}|${만료 ms}`, stash = HASH itemId → 만료 ms.
 *  - prune: 만료된 착용품·벗어 둔 꾸미기를 지운다
 *  - puton: 그 부위에 입힌다. 입던 것은 stash로 (같은 아이템이면 새 것이 대신하므로 버린다),
 *    입는 아이템은 stash에서 지운다 → 한 아이템은 look과 stash 중 한 곳에만 있다. MemoryAccounts.putOn과 같은 규칙
 */
const LOOK_FN = `
local function prune(look, stash, now)
  local l = redis.call('HGETALL', look)
  for i = 1, #l, 2 do
    local untilMs = tonumber(string.match(l[i + 1], '|(.+)$') or '0')
    if not untilMs or untilMs <= now then redis.call('HDEL', look, l[i]) end
  end
  local s = redis.call('HGETALL', stash)
  for i = 1, #s, 2 do
    if (tonumber(s[i + 1]) or 0) <= now then redis.call('HDEL', stash, s[i]) end
  end
end
local function puton(look, stash, slot, item, untilMs)
  local old = redis.call('HGET', look, slot)
  if old then
    local oldItem, oldUntil = string.match(old, '^([^|]+)|(.+)$')
    if oldItem and oldItem ~= item then redis.call('HSET', stash, oldItem, oldUntil) end
  end
  redis.call('HDEL', stash, item)
  redis.call('HSET', look, slot, item .. '|' .. untilMs)
end
`;

// KEYS: acct, earn, rank, econ, week, [earnIp]  ARGV: id, source, points, dailyMax, dailyCap, balanceCap, ttl, ipMax
const EARN_LUA = `${CREDIT_FN}
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[5]), balanceCap = tonumber(ARGV[6]), ttl = ARGV[7] }
return credit(c, ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4]), KEYS[6], tonumber(ARGV[8]))
`;

// 머무르기: 직전 지급 후 gap이 지났을 때만 (아니면 -1)
// KEYS: acct, earn, rank, econ, week  ARGV: id, now, gap, points, dailyMax, dailyCap, balanceCap, ttl
const PRESENCE_LUA = `${CREDIT_FN}
if tonumber(ARGV[2]) - tonumber(redis.call('HGET', KEYS[1], 'presenceAt') or '0') < tonumber(ARGV[3]) then return -1 end
redis.call('HSET', KEYS[1], 'presenceAt', ARGV[2])
-- 10번: 머문 기록은 포인트 한도와 상관없이 센다 (출석 도장 조건)
redis.call('HINCRBY', KEYS[2], '_stay', 1)
redis.call('EXPIRE', KEYS[2], ARGV[8])
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[6]), balanceCap = tonumber(ARGV[7]), ttl = ARGV[8] }
return credit(c, 'presence', tonumber(ARGV[4]), tonumber(ARGV[5]))
`;

// 접속 시간 보너스: 오늘 머문 기록(_stay)으로 열린 구간 중 안 받은 구간(_bonus 다음부터)을 한 번에. 없으면 -1.
// 받은 구간 수를 먼저 올리므로 동시에 눌러도 한 번만 나간다. lib/stayBonus.ts·MemoryAccounts.claimStayBonus와 같은 규칙
// KEYS: acct, earn, rank, econ, week  ARGV: id, every(기록 수/구간), dailyMax, dailyCap, balanceCap, ttl, 구간별 보너스...
const STAY_BONUS_LUA = `${CREDIT_FN}
local amounts = {}
for i = 7, #ARGV do amounts[#amounts + 1] = tonumber(ARGV[i]) end
local tiers = math.min(math.floor(tonumber(redis.call('HGET', KEYS[2], '_stay') or '0') / tonumber(ARGV[2])), #amounts)
local claimed = tonumber(redis.call('HGET', KEYS[2], '_bonus') or '0')
if tiers <= claimed then return {-1, 0} end
local sum = 0
for i = claimed + 1, tiers do sum = sum + amounts[i] end
redis.call('HSET', KEYS[2], '_bonus', tiers)
redis.call('EXPIRE', KEYS[2], ARGV[6])
-- 하루 전체 한도(800)와 별개: 자기 하루 상한(dailyMax)·지갑 상한만 본다
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[4]), balanceCap = tonumber(ARGV[5]), ttl = ARGV[6], outsideTotal = true }
return { credit(c, 'stayBonus', sum, tonumber(ARGV[3])), tiers - claimed }
`;

// 입장 기록: 이름·색·몸 모양·처음 입장 시각은 계정에 값이 없을 때만 저장한다
// KEYS: acct  ARGV: name, color, body, now
const ENTER_LUA = `
if ARGV[1] ~= '' then redis.call('HSETNX', KEYS[1], 'name', ARGV[1]) end
if ARGV[2] ~= '' then redis.call('HSETNX', KEYS[1], 'color', ARGV[2]) end
if ARGV[3] ~= '' then redis.call('HSETNX', KEYS[1], 'body', ARGV[3]) end
redis.call('HSETNX', KEYS[1], 'createdAt', ARGV[4])
return 1
`;

// 10번: 달력 개편 전 출석을 도장으로 옮긴다 (한 번만). 읽은 뒤 마지막 출석일이 바뀌었으면(그 사이 도장) 0 → 다시 읽어 시도.
// KEYS: acct, cal(달)... ARGV: lastAttend(''=없음), ttl, 그다음 KEYS[i+1]마다 그 달의 DD 목록을 쉼표로
const CAL_INIT_LUA = `
if redis.call('HEXISTS', KEYS[1], 'calInit') == 1 then return 1 end
if (redis.call('HGET', KEYS[1], 'lastAttend') or '') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'calInit', '1')
for i = 2, #KEYS do
  for dd in string.gmatch(ARGV[i + 1], '[^,]+') do redis.call('HSETNX', KEYS[i], dd, '0') end
  redis.call('EXPIRE', KEYS[i], ARGV[2])
end
return 1
`;

// 10번 출석 달력 오늘 칸 받기. {-1}(오늘 이미 받음) | {-2, 머문 기록 수} | {1, 출석, 7일 연속, 한 달 개근, 연속 일수}
// 달력 보상은 하루 전체 한도에 막히지 않는다(dailyCap을 크게) — MemoryAccounts.claimAttend와 같은 규칙
// KEYS: acct, earn, attendIp, rank, econ, week, cal
// ARGV: id, day, yesterday, perIp, ttl, attendPts, attendMax, streakPts, streakMax, monthlyPts, monthlyMax, balanceCap, needTicks, dd, monthDays, calTtl
const CLAIM_LUA = `${CREDIT_FN}
local last = redis.call('HGET', KEYS[1], 'lastAttend')
if last == ARGV[2] then
  redis.call('HSETNX', KEYS[7], ARGV[14], '0')
  redis.call('EXPIRE', KEYS[7], ARGV[16])
  return {-1, 0, 0, 0, 0}
end
local ticks = tonumber(redis.call('HGET', KEYS[2], '_stay') or '0')
if ticks < tonumber(ARGV[13]) then return {-2, ticks, 0, 0, 0} end
local streak = 1
if last == ARGV[3] then streak = tonumber(redis.call('HGET', KEYS[1], 'streak') or '0') + 1 end
redis.call('HSET', KEYS[1], 'lastAttend', ARGV[2], 'streak', streak)
local paid = redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 or redis.call('SCARD', KEYS[3]) < tonumber(ARGV[4])
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[4], econ = KEYS[5], week = KEYS[6], id = ARGV[1], dailyCap = 1000000000, balanceCap = tonumber(ARGV[12]), ttl = ARGV[5] }
local a, s, m = 0, 0, 0
if paid then
  redis.call('SADD', KEYS[3], ARGV[1])
  redis.call('EXPIRE', KEYS[3], ARGV[5])
  a = credit(c, 'attend', tonumber(ARGV[6]), tonumber(ARGV[7]))
  if streak % 7 == 0 then s = credit(c, 'streak', tonumber(ARGV[8]), tonumber(ARGV[9])) end
end
redis.call('HSET', KEYS[7], ARGV[14], a + s)
if paid and redis.call('HEXISTS', KEYS[7], '_month') == 0 then
  local n = 0
  for _, f in ipairs(redis.call('HKEYS', KEYS[7])) do
    if string.sub(f, 1, 1) ~= '_' then n = n + 1 end
  end
  if n >= tonumber(ARGV[15]) then
    m = credit(c, 'monthly', tonumber(ARGV[10]), tonumber(ARGV[11]))
    redis.call('HSET', KEYS[7], '_month', m)
  end
end
redis.call('EXPIRE', KEYS[7], ARGV[16])
return {1, a, s, m, streak}
`;

// 구매. unique('1')면 가방에 있거나 지금 착용 중이거나 벗어 둔 것(만료 전)이 있을 때 -1. 잔액 부족은 0
// KEYS: acct, inv, look, econ, stash  ARGV: itemId, price, unique, now
const BUY_LUA = `
if ARGV[3] == '1' then
  if tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0') > 0 then return -1 end
  if tonumber(redis.call('HGET', KEYS[5], ARGV[1]) or '0') > tonumber(ARGV[4]) then return -1 end
  for _, v in ipairs(redis.call('HVALS', KEYS[3])) do
    local item, untilMs = string.match(v, '^([^|]+)|(.+)$')
    if item == ARGV[1] and tonumber(untilMs) > tonumber(ARGV[4]) then return -1 end
  end
end
local price = tonumber(ARGV[2])
if tonumber(redis.call('HGET', KEYS[1], 'points') or '0') < price then return 0 end
redis.call('HINCRBY', KEYS[1], 'points', -price)
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
redis.call('HINCRBY', KEYS[4], 'spend:shop', price)
redis.call('EXPIRE', KEYS[4], ${ECON_TTL_SEC})
return 1
`;

// 돌려주기: 잔액만 (지갑 상한에서 잘림), 모은 포인트·랭킹은 그대로
// KEYS: acct, ledger, econ  ARGV: amount, balanceCap, entryJson
const REFUND_LUA = `
local before = tonumber(redis.call('HGET', KEYS[1], 'points') or '0')
redis.call('HSETNX', KEYS[1], 'lifetime', before)
local bal = math.min(tonumber(ARGV[2]), before + tonumber(ARGV[1]))
redis.call('HSET', KEYS[1], 'points', bal)
redis.call('LPUSH', KEYS[2], ARGV[3])
redis.call('LTRIM', KEYS[2], 0, 99)
redis.call('HINCRBY', KEYS[3], 'refund', bal - before)
redis.call('EXPIRE', KEYS[3], ${ECON_TTL_SEC})
return bal
`;

// 포인트 쓰기 (다른 기능 공용). 모자라면 -1, 아니면 남은 잔액
// KEYS: acct, ledger, econ  ARGV: amount, entryJson, 통계 필드(spend:{분류})
const SPEND_LUA = `
local amount = tonumber(ARGV[1])
if tonumber(redis.call('HGET', KEYS[1], 'points') or '0') < amount then return -1 end
local left = redis.call('HINCRBY', KEYS[1], 'points', -amount)
redis.call('LPUSH', KEYS[2], ARGV[2])
redis.call('LTRIM', KEYS[2], 0, 99)
redis.call('HINCRBY', KEYS[3], ARGV[3], amount)
redis.call('EXPIRE', KEYS[3], ${ECON_TTL_SEC})
return left
`;

// KEYS: inv  ARGV: itemId
const CONSUME_LUA = `${TAKE_FN}
if take(KEYS[1], ARGV[1]) then return 1 end
return 0
`;

// 가방에서 꺼내 입기 (입던 것은 stash로)
// KEYS: inv, look, stash  ARGV: itemId, slot, until, now
const EQUIP_LUA = `${TAKE_FN}${LOOK_FN}
if not take(KEYS[1], ARGV[1]) then return 0 end
prune(KEYS[2], KEYS[3], tonumber(ARGV[4]))
puton(KEYS[2], KEYS[3], ARGV[2], ARGV[1], ARGV[3])
return 1
`;

// 벗어 둔 꾸미기 다시 입기 (남은 시간 그대로, 입던 것은 stash로). stash에 없으면(만료 포함) 0
// KEYS: look, stash  ARGV: itemId, slot, now
const WEAR_LUA = `${LOOK_FN}
prune(KEYS[1], KEYS[2], tonumber(ARGV[3]))
local untilMs = redis.call('HGET', KEYS[2], ARGV[1])
if not untilMs then return 0 end
puton(KEYS[1], KEYS[2], ARGV[2], ARGV[1], untilMs)
return 1
`;

// 그 부위 벗기 (stash로, 남은 시간 그대로). 입은 게 없으면(만료 포함) 0
// KEYS: look, stash  ARGV: slot, now
const UNEQUIP_LUA = `${LOOK_FN}
prune(KEYS[1], KEYS[2], tonumber(ARGV[2]))
local cur = redis.call('HGET', KEYS[1], ARGV[1])
if not cur then return 0 end
local item, untilMs = string.match(cur, '^([^|]+)|(.+)$')
redis.call('HDEL', KEYS[1], ARGV[1])
if item then redis.call('HSET', KEYS[2], item, untilMs) end
return 1
`;

// 묘비 꾸미기는 ZSET(`${itemId}|${nonce}` → 만료 ms)으로 관리하고, 목록이 HGETALL 한 번으로 읽도록
// graves:meta의 `decor:{id}` 필드에 JSON을 다시 써 둔다 (아이템 id는 카탈로그의 [a-z_]라 손으로 만들어도 안전하다).
// KEYS: meta, inv, decor  ARGV: graveId, itemId, until, now, max, nonce
const DECOR_LUA = `${TAKE_FN}
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return nil end
if not take(KEYS[2], ARGV[2]) then return '' end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[4])
while redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) do redis.call('ZPOPMIN', KEYS[3]) end
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[2] .. '|' .. ARGV[6])
local all = redis.call('ZRANGE', KEYS[3], 0, -1, 'WITHSCORES')
local parts = {}
for i = 1, #all, 2 do
  parts[#parts + 1] = '{"itemId":"' .. string.match(all[i], '^[^|]+') .. '","until":' .. all[i + 1] .. '}'
end
local json = '[' .. table.concat(parts, ',') .. ']'
redis.call('HSET', KEYS[1], '${DECOR}' .. ARGV[1], json)
return json
`;

// 유료 디자인 묘비 저장: 디자인권 차감과 묘비 저장(RedisStore.put과 같은 세 명령)을 한 번에
// KEYS: inv, meta, created, graveChannel  ARGV: itemId, graveId, json, createdAt, channel
const PUT_WITH_ITEM_LUA = `${TAKE_FN}
if not take(KEYS[1], ARGV[1]) then return 0 end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
redis.call('ZADD', KEYS[3], ARGV[4], ARGV[2])
redis.call('HSET', KEYS[4], ARGV[2], ARGV[5])
return 1
`;

// 관리자 조정. 늘어난 만큼은 모은 포인트·랭킹에도 더한다. 계정 해시가 없으면 -1
// KEYS: acct, rank, econ  ARGV: delta, balanceCap, id
const ADJUST_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local before = tonumber(redis.call('HGET', KEYS[1], 'points') or '0')
local bal = math.max(0, math.min(tonumber(ARGV[2]), before + tonumber(ARGV[1])))
redis.call('HSET', KEYS[1], 'points', bal)
if bal > before then
  redis.call('HSETNX', KEYS[1], 'lifetime', before)
  redis.call('ZADD', KEYS[2], redis.call('HINCRBY', KEYS[1], 'lifetime', bal - before), ARGV[3])
  redis.call('HINCRBY', KEYS[3], 'earn:admin', bal - before)
elseif bal < before then
  redis.call('HINCRBY', KEYS[3], 'spend:admin', before - bal)
end
redis.call('EXPIRE', KEYS[3], ${ECON_TTL_SEC})
return bal
`;

// 닉네임 변경: 쿨다운 → (두 번째부터) 비용 차감 → 이름·시각·횟수. {-2, 다음 가능 시각} | {-1, 0}(포인트 부족) | {비용, 0}
// KEYS: acct, ledger, econ  ARGV: name, now, price, cooldownMs, entryJson
const NAME_LUA = `
local now = tonumber(ARGV[2])
local changed = tonumber(redis.call('HGET', KEYS[1], 'nameChangedAt') or '0')
if changed > 0 and now < changed + tonumber(ARGV[4]) then return {-2, changed + tonumber(ARGV[4])} end
local cost = 0
if tonumber(redis.call('HGET', KEYS[1], 'nameChanges') or '0') > 0 then cost = tonumber(ARGV[3]) end
if cost > 0 then
  if tonumber(redis.call('HGET', KEYS[1], 'points') or '0') < cost then return {-1, 0} end
  redis.call('HINCRBY', KEYS[1], 'points', -cost)
  redis.call('LPUSH', KEYS[2], ARGV[5])
  redis.call('LTRIM', KEYS[2], 0, 99)
  redis.call('HINCRBY', KEYS[3], 'spend:name', cost)
  redis.call('EXPIRE', KEYS[3], ${ECON_TTL_SEC})
end
redis.call('HSET', KEYS[1], 'name', ARGV[1], 'nameChangedAt', now)
redis.call('HINCRBY', KEYS[1], 'nameChanges', 1)
return {cost, 0}
`;

// 읽음 시각은 앞으로만 간다. KEYS: acct  ARGV: at
const SEEN_LUA = `
local cur = tonumber(redis.call('HGET', KEYS[1], 'activitySeen') or '0')
if tonumber(ARGV[1]) > cur then redis.call('HSET', KEYS[1], 'activitySeen', ARGV[1]); return tonumber(ARGV[1]) end
return cur
`;

// 코드 교체. 읽은 뒤 바뀌었으면(동시에 재발급) 0을 돌려 다시 시도하게 한다 → 옛 코드가 살아남지 않는다.
// KEYS: acct, oldCode(없으면 newCode와 같게), newCode  ARGV: oldHash('' = 없음), newHash, id
const SET_CODE_LUA = `
if (redis.call('HGET', KEYS[1], 'codeHash') or '') ~= ARGV[1] then return 0 end
if ARGV[1] ~= '' then redis.call('DEL', KEYS[2]) end
redis.call('HSET', KEYS[1], 'codeHash', ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
return 1
`;

// 사냥 기록 (49번 랭킹). 처치 수는 전체·그 주에 더하고, 클리어 시간은 더 짧을 때만 바꾼다 (ZADD LT와 같은 뜻을 Lua로)
// KEYS: killsAll, killsWeek, bestAll, bestWeek  ARGV: id, kills, clearMs(''=클리어 못 함), weekTtl
const HUNT_LUA = `
if tonumber(ARGV[2]) > 0 then
  redis.call('ZINCRBY', KEYS[1], ARGV[2], ARGV[1])
  redis.call('ZINCRBY', KEYS[2], ARGV[2], ARGV[1])
  redis.call('EXPIRE', KEYS[2], ARGV[4])
end
if ARGV[3] ~= '' then
  for i = 3, 4 do
    local cur = redis.call('ZSCORE', KEYS[i], ARGV[1])
    if not cur or tonumber(ARGV[3]) < tonumber(cur) then redis.call('ZADD', KEYS[i], ARGV[3], ARGV[1]) end
  end
  redis.call('EXPIRE', KEYS[4], ARGV[4])
end
return 1
`;

function pairs(flat: string[] | null): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; flat && i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
  return m;
}

export class RedisAccounts implements AccountStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = new Redis({ ...conn, automaticDeserialization: false });
  }

  async get(id: string, day: string, now: number): Promise<AccountRecord> {
    const [acct, inv, look, graves, today, activity, stashRaw, stay, bonus] = await this.redis
      .pipeline()
      .hgetall(K.acct(id))
      .hgetall(K.inv(id))
      .hgetall(K.look(id))
      .smembers(K.acctGraves(id))
      .hget(K.earn(id, day), "_total")
      .lrange(K.activity(id), 0, -1)
      .hgetall(K.stash(id))
      .hget(K.earn(id, day), "_stay")
      .hget(K.earn(id, day), "_bonus")
      .exec<[string[] | null, string[] | null, string[] | null, string[], string | null, string[], string[] | null, string | null, string | null]>();
    const a = pairs(acct);
    const equipped: EquippedItem[] = [...pairs(look).values()].flatMap((v) => {
      const [itemId, until] = v.split("|");
      return Number(until) > now ? [{ itemId, until: Number(until) }] : [];
    });
    const stash: EquippedItem[] = [...pairs(stashRaw)]
      .map(([itemId, until]) => ({ itemId, until: Number(until) }))
      .filter((e) => e.until > now)
      .sort((x, y) => x.until - y.until || x.itemId.localeCompare(y.itemId));
    return {
      points: Number(a.get("points") ?? 0),
      lifetimePoints: Number(a.get("lifetime") ?? a.get("points") ?? 0),
      name: a.get("name") ?? null,
      color: a.get("color") ?? null,
      body: a.get("body") ?? null,
      streak: Number(a.get("streak") ?? 0),
      lastAttend: a.get("lastAttend") ?? null,
      stayTicks: Number(stay ?? 0),
      bonusClaimed: Number(bonus ?? 0),
      createdAt: Number(a.get("createdAt") ?? 0),
      hasCode: a.has("codeHash"),
      inventory: Object.fromEntries([...pairs(inv)].map(([k, v]) => [k, Number(v)])),
      equipped,
      stash,
      graves,
      todayEarned: Number(today ?? 0),
      activityUnread: activity.filter((raw) => {
        const item = JSON.parse(raw) as ActivityItem;
        return item.kind !== "revive" && item.at > Number(a.get("activitySeen") ?? 0);
      }).length,
      nameChangedAt: Number(a.get("nameChangedAt") ?? 0),
      nameChanges: Number(a.get("nameChanges") ?? 0),
      tutorialDone: a.get("tutorialDone") === "1",
    };
  }

  async earn(id: string, source: EarnSource, day: string, opts: EarnOptions = {}): Promise<number> {
    const rule = earnRule(source);
    const keys = [K.acct(id), K.earn(id, day), K.rankPoints, K.econ(day), K.rankPointsWeek(weekOfDay(day))];
    if (opts.ipHash) keys.push(K.earnIp(opts.ipHash, day));
    const r = await this.redis.eval<string[], number>(EARN_LUA, keys, [
      id,
      source,
      String(opts.amount ?? rule.points),
      String(rule.dailyMax),
      String(DAILY_EARN_CAP),
      String(BALANCE_CAP),
      String(EARN_TTL_SEC),
      String(rule.dailyMax * ATTEND_ACCOUNTS_PER_IP),
    ]);
    return Number(r);
  }

  async spend(id: string, amount: number, reason: string, now: number): Promise<number | null> {
    const entry = JSON.stringify({ at: now, amount: -amount, reason });
    const r = Number(
      await this.redis.eval<string[], number>(SPEND_LUA, [K.acct(id), K.ledger(id), K.econ(kstDay(now))], [
        String(amount),
        entry,
        `spend:${spendCategory(reason)}`,
      ]),
    );
    return r < 0 ? null : r;
  }

  async refund(id: string, amount: number, reason: string, now: number): Promise<number> {
    const entry = JSON.stringify({ at: now, amount, reason });
    return Number(
      await this.redis.eval<string[], number>(REFUND_LUA, [K.acct(id), K.ledger(id), K.econ(kstDay(now))], [
        String(amount),
        String(BALANCE_CAP),
        entry,
      ]),
    );
  }

  async presence(id: string, day: string, now: number): Promise<number | null> {
    const rule = earnRule("presence");
    const r = Number(
      await this.redis.eval<string[], number>(
        PRESENCE_LUA,
        [K.acct(id), K.earn(id, day), K.rankPoints, K.econ(day), K.rankPointsWeek(weekOfDay(day))],
        [
        id,
        String(now),
        String(PRESENCE_MIN_GAP_MS),
        String(rule.points),
        String(rule.dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(EARN_TTL_SEC),
      ]),
    );
    return r < 0 ? null : r;
  }

  async claimStayBonus(id: string, day: string): Promise<{ earned: number; count: number } | null> {
    const [earned, count] = await this.redis.eval<string[], [number, number]>(
      STAY_BONUS_LUA,
      [K.acct(id), K.earn(id, day), K.rankPoints, K.econ(day), K.rankPointsWeek(weekOfDay(day))],
      [
        id,
        String(STAY_BONUS_EVERY_TICKS),
        String(earnRule("stayBonus").dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(EARN_TTL_SEC),
        ...STAY_BONUS_AMOUNTS.map(String),
      ],
    );
    return Number(earned) < 0 ? null : { earned: Number(earned), count: Number(count) };
  }

  /** ZRANGE 1회 + (상위 limit명 이름, 내 순위·점수) 파이프라인 1회. asc면 점수가 작을수록 위 (최단 기록) */
  private async board(key: string, limit: number, me: string | null, asc = false): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    const flat = await this.redis.zrange<string[]>(key, 0, limit - 1, { rev: !asc, withScores: true });
    const top = [...pairs(flat)];
    const p = this.redis.pipeline();
    for (const [id] of top) p.hget(K.acct(id), "name");
    if (me) (asc ? p.zrank(key, me) : p.zrevrank(key, me)).zscore(key, me).hget(K.acct(me), "name");
    const r = top.length || me ? await p.exec<(string | number | null)[]>() : [];
    const rows = top.map(([accountId, score], i) => ({
      accountId,
      name: (r[i] as string | null) ?? null,
      points: Number(score),
      rank: i + 1,
    }));
    const [myRank, myScore, myName] = r.slice(top.length);
    const mine =
      me && myRank !== null && myRank !== undefined
        ? { accountId: me, name: (myName as string | null) ?? null, points: Number(myScore), rank: Number(myRank) + 1 }
        : null;
    return { rows, mine };
  }

  pointRank(limit: number, me: string | null, week?: string): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    return this.board(week ? K.rankPointsWeek(week) : K.rankPoints, limit, me);
  }

  async recordHunt(id: string, zone: string, run: { kills: number; clearMs: number | null }, week: string): Promise<void> {
    await this.redis.eval<string[], number>(
      HUNT_LUA,
      [K.rankHuntKills, K.rankHuntKillsWeek(week), K.rankHuntBest(zone), K.rankHuntBestWeek(zone, week)],
      [id, String(Math.max(0, Math.floor(run.kills))), run.clearMs === null ? "" : String(Math.round(run.clearMs)), String(WEEK_RANK_TTL_SEC)],
    );
  }

  huntRank(
    board: "kills" | "best",
    limit: number,
    me: string | null,
    opts: { zone?: string; week?: string },
  ): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    if (board === "kills") return this.board(opts.week ? K.rankHuntKillsWeek(opts.week) : K.rankHuntKills, limit, me);
    const zone = opts.zone ?? "easy";
    return this.board(opts.week ? K.rankHuntBestWeek(zone, opts.week) : K.rankHuntBest(zone), limit, me, true);
  }

  async enter(id: string, profile: Profile, now: number): Promise<void> {
    await this.redis.eval<string[], number>(ENTER_LUA, [K.acct(id)], [profile.name ?? "", profile.color ?? "", profile.body ?? "", String(now)]);
  }

  /** 달력 개편 전 출석을 도장으로 옮긴다 (한 번만, 경합하면 다시 읽어 시도) */
  private async initCalendar(id: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      // automaticDeserialization: false라 필드 순서대로의 배열이 온다
      const raw = (await this.redis.hmget(K.acct(id), "calInit", "lastAttend", "streak")) as unknown as (string | null)[] | null;
      const [init, last, streak] = raw ?? [null, null, null];
      if (init) return;
      const byMonth = new Map<string, string[]>();
      for (const d of legacyAttendDays(last, Number(streak ?? 0))) byMonth.set(d.slice(0, 6), [...(byMonth.get(d.slice(0, 6)) ?? []), d.slice(6)]);
      const months = [...byMonth];
      const ok = await this.redis.eval<string[], number>(
        CAL_INIT_LUA,
        [K.acct(id), ...months.map(([m]) => K.cal(id, m))],
        [last ?? "", String(CALENDAR_TTL_SEC), ...months.map(([, dds]) => dds.join(","))],
      );
      if (Number(ok) === 1) return;
    }
  }

  async attendCalendar(id: string, month: string): Promise<CalendarMonthRecord> {
    await this.initCalendar(id);
    const m = pairs((await this.redis.hgetall<Record<string, string>>(K.cal(id, month))) as unknown as string[] | null);
    return {
      days: Object.fromEntries([...m].filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, Number(v)])),
      monthBonus: m.has("_month") ? Number(m.get("_month")) : null,
    };
  }

  async claimAttend(id: string, ipHash: string, day: string, yesterday: string, monthDays: number, needTicks: number): Promise<AttendClaim> {
    await this.initCalendar(id);
    const [attend, streak, monthly] = [earnRule("attend"), earnRule("streak"), earnRule("monthly")];
    const r = (
      await this.redis.eval<string[], number[]>(
        CLAIM_LUA,
        [K.acct(id), K.earn(id, day), K.attendIp(ipHash, day), K.rankPoints, K.econ(day), K.rankPointsWeek(weekOfDay(day)), K.cal(id, day.slice(0, 6))],
        [
          id,
          day,
          yesterday,
          String(ATTEND_ACCOUNTS_PER_IP),
          String(EARN_TTL_SEC),
          String(attend.points),
          String(attend.dailyMax),
          String(streak.points),
          String(streak.dailyMax),
          String(monthly.points),
          String(monthly.dailyMax),
          String(BALANCE_CAP),
          String(needTicks),
          day.slice(6),
          String(monthDays),
          String(CALENDAR_TTL_SEC),
        ],
      )
    ).map(Number);
    if (r[0] === -1) return { ok: false, reason: "already" };
    if (r[0] === -2) return { ok: false, reason: "stay", stayTicks: r[1] };
    return { ok: true, earned: { daily: r[1], streak: r[2], monthly: r[3] }, streak: r[4] };
  }

  async setCode(id: string, codeHash: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const old = (await this.redis.hget<string>(K.acct(id), "codeHash")) ?? "";
      const ok = await this.redis.eval<string[], number>(
        SET_CODE_LUA,
        [K.acct(id), K.code(old || codeHash), K.code(codeHash)],
        [old, codeHash, id],
      );
      if (Number(ok) === 1) return;
    }
    throw new Error("[accounts] 개인 코드 교체가 계속 경합합니다");
  }

  async findByCode(codeHash: string): Promise<string | null> {
    return (await this.redis.get<string>(K.code(codeHash))) ?? null;
  }

  async buy(
    id: string,
    itemId: string,
    price: number,
    opts: { unique?: boolean; now?: number } = {},
  ): Promise<"ok" | "insufficient" | "owned"> {
    const r = Number(
      await this.redis.eval<string[], number>(BUY_LUA, [K.acct(id), K.inv(id), K.look(id), K.econ(kstDay(opts.now ?? Date.now())), K.stash(id)], [
        itemId,
        String(price),
        opts.unique ? "1" : "0",
        String(opts.now ?? Date.now()),
      ]),
    );
    return r === 1 ? "ok" : r === 0 ? "insufficient" : "owned";
  }

  async consume(id: string, itemId: string): Promise<boolean> {
    return Number(await this.redis.eval<string[], number>(CONSUME_LUA, [K.inv(id)], [itemId])) === 1;
  }

  async equip(id: string, itemId: string, slot: CosmeticSlot, until: number, now: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(EQUIP_LUA, [K.inv(id), K.look(id), K.stash(id)], [
      itemId,
      slot,
      String(until),
      String(now),
    ]);
    return Number(r) === 1;
  }

  async wear(id: string, itemId: string, slot: CosmeticSlot, now: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(WEAR_LUA, [K.look(id), K.stash(id)], [itemId, slot, String(now)]);
    return Number(r) === 1;
  }

  async unequip(id: string, slot: CosmeticSlot, now: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(UNEQUIP_LUA, [K.look(id), K.stash(id)], [slot, String(now)]);
    return Number(r) === 1;
  }

  async placeDecor(
    id: string,
    graveId: string,
    channel: number,
    itemId: string,
    until: number,
    now: number,
  ): Promise<GraveDecor[] | "no_item" | null> {
    const nonce = Math.random().toString(36).slice(2, 10);
    const r = await this.redis.eval<string[], string | null>(
      DECOR_LUA,
      [chKeys(channel).meta, K.inv(id), K.decor(graveId)],
      [graveId, itemId, String(until), String(now), String(MAX_DECOR_PER_GRAVE), nonce],
    );
    if (r === null) return null;
    return r === "" ? "no_item" : (JSON.parse(r) as GraveDecor[]);
  }

  async putGraveUsing(id: string, itemId: string, grave: Grave): Promise<boolean> {
    const channel = grave.channel ?? 1;
    const k = chKeys(channel);
    const r = await this.redis.eval<string[], number>(
      PUT_WITH_ITEM_LUA,
      [K.inv(id), k.meta, k.created, K.graveChannel],
      [itemId, grave.id, encode({ ...grave, channel }), String(grave.createdAt), String(channel)],
    );
    return Number(r) === 1;
  }

  async adjustPoints(id: string, delta: number): Promise<number | null> {
    const r = Number(
      await this.redis.eval<string[], number>(ADJUST_LUA, [K.acct(id), K.rankPoints, K.econ(kstDay())], [
        String(delta),
        String(BALANCE_CAP),
        id,
      ]),
    );
    return r < 0 ? null : r;
  }

  async addGrave(id: string, graveId: string): Promise<void> {
    await this.redis.sadd(K.acctGraves(id), graveId);
  }

  async removeGrave(id: string, graveId: string): Promise<void> {
    await this.redis.srem(K.acctGraves(id), graveId);
  }

  async pushActivity(id: string, item: ActivityItem): Promise<void> {
    await this.redis.multi().lpush(K.activity(id), JSON.stringify(item)).ltrim(K.activity(id), 0, ACTIVITY_KEEP - 1).exec();
  }

  async activity(id: string): Promise<{ items: ActivityItem[]; lastSeenAt: number }> {
    const [items, seen] = await this.redis
      .pipeline()
      .lrange(K.activity(id), 0, -1)
      .hget(K.acct(id), "activitySeen")
      .exec<[string[], string | null]>();
    return { items: items.map((raw) => JSON.parse(raw) as ActivityItem), lastSeenAt: Number(seen ?? 0) };
  }

  async seeActivity(id: string, at: number): Promise<number> {
    return Number(await this.redis.eval<string[], number>(SEEN_LUA, [K.acct(id)], [String(at)]));
  }

  async changeName(id: string, name: string, now: number, price: number, cooldownMs: number): Promise<NameChangeResult> {
    const entry = JSON.stringify({ at: now, amount: -price, reason: "name" });
    const [code, next] = (
      await this.redis.eval<string[], [number, number]>(NAME_LUA, [K.acct(id), K.ledger(id), K.econ(kstDay(now))], [
        name,
        String(now),
        String(price),
        String(cooldownMs),
        entry,
      ])
    ).map(Number);
    if (code === -2) return { ok: false, reason: "cooldown", nextAllowedAt: next };
    if (code === -1) return { ok: false, reason: "points" };
    return { ok: true, cost: code };
  }

  async setTutorialDone(id: string): Promise<void> {
    await this.redis.hset(K.acct(id), { tutorialDone: "1" });
  }

  async economy(days: string[]): Promise<{ date: string; fields: Record<string, number> }[]> {
    if (!days.length) return [];
    const p = this.redis.pipeline();
    for (const d of days) p.hgetall(K.econ(d));
    const r = await p.exec<(string[] | null)[]>();
    return days.map((date, i) => ({ date, fields: Object.fromEntries([...pairs(r[i])].map(([k, v]) => [k, Number(v)])) }));
  }

  /** 랭킹에 오른 계정(포인트를 모은 적 있는 계정)의 잔액 합계. 관리자 화면에서만 부른다 */
  async walletTotals(): Promise<{ wallets: number; accounts: number }> {
    const ids = await this.redis.zrange<string[]>(K.rankPoints, 0, -1);
    if (!ids.length) return { wallets: 0, accounts: 0 };
    const p = this.redis.pipeline();
    for (const id of ids) p.hget(K.acct(id), "points");
    const pts = await p.exec<(string | null)[]>();
    return { wallets: pts.reduce((n, v) => n + Number(v ?? 0), 0), accounts: ids.length };
  }
}

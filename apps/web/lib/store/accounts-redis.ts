import { Redis } from "@upstash/redis";
import { CHAMP_ITEM_IDS, MAX_DECOR_PER_GRAVE, nameKey, PERMANENT_UNTIL, type CosmeticSlot } from "@tomb/protocol";
import { CALENDAR_TTL_SEC, legacyAttendDays, type AttendClaim, type CalendarMonthRecord } from "../calendar";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import { STAY_BONUS_AMOUNTS, STAY_BONUS_EVERY_TICKS } from "../stayBonus";
import type { ActivityItem, Grave, GraveDecor } from "../types";
import { econKeyFor, kstDay, rankValue, WEEK_RANK_TTL_SEC, WEEK_TIE_SCALE, weekOfDay } from "./accounts";
import { chKeys, DECOR, K } from "./keys";
import { encode } from "./redis";
import {
  ACTIVITY_KEEP,
  DORMANT_MS,
  ECON_TTL_SEC,
  PRESENCE_CATCHUP_MAX_TICKS,
  PRESENCE_CATCHUP_WINDOW_MS,
  PRESENCE_MIN_GAP_MS,
  PRESENCE_TICK_MS,
  PRESENCE_TICK_SLACK_MS,
  spendCategory,
  type NameChangeResult,
  type NameClaimResult,
  type VisitResult,
  type AccountRecord,
  type AccountStore,
  type AccountSummary,
  type EarnOptions,
  type EquippedItem,
  type PresenceTick,
  type Profile,
  type RankEntry,
} from "./types";

// 포인트·가방은 모두 Lua 스크립트 하나로 바꾼다. 스크립트 실행 중에는 다른 명령이 끼어들 수 없으므로
// 잔액 확인과 차감, 한도 확인과 적립 사이에 경쟁이 생기지 않는다 (동시 구매로 잔액이 음수가 되지 않는다).
// 스크립트가 건드리는 키는 모두 KEYS로 넘긴다.

/** 오늘 적립 기록은 날짜가 지나면 필요 없다 (새벽 5시 경계 여유로 2일) */
const EARN_TTL_SEC = 2 * 86_400;

/**
 * 주간 랭킹(포인트·사냥 처치) 더하기. 동점이면 먼저 달성한 사람이 위 (주간 1위 보상 — lib/weeklyChamp):
 * 점수 = 정수 합계 + 달성 시각 소수부(lib/store/accounts.ts weekTieFrac — 이른 시각일수록 크다, 늘 0과 1 사이).
 * 읽을 때는 소수부를 버린다(rankValue). now가 없으면(옛 호출) 예전처럼 정수만 더한다
 */
const WEEK_FN = `
local function weekAdd(key, id, amount, now)
  if not now then return redis.call('ZINCRBY', key, amount, id) end
  local cur = math.floor(tonumber(redis.call('ZSCORE', key, id) or '0'))
  redis.call('ZADD', key, string.format('%.17g', cur + amount + (${WEEK_TIE_SCALE} - now) / ${WEEK_TIE_SCALE}), id)
end
`;

/**
 * 항목별 하루 한도·하루 전체 한도·지갑 한도(+ ipKey가 있으면 같은 IP의 그 항목 합계) 안에서 적립하고
 * 모은 포인트(lifetime)와 포인트 랭킹을 같이 올린다. 개편 전 계정의 모은 포인트는 지금 잔액에서 시작한다.
 * 경제 통계(econ:{날짜})의 earn:{source}도 함께 올린다.
 * 그 주에 모은 포인트(주간 랭킹, c.week)도 같이 올린다.
 * MemoryAccounts.credit과 같은 규칙. c = { acct, earn, rank, econ, week, id, dailyCap, balanceCap, ttl }
 */
const CREDIT_FN = `${WEEK_FN}
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
  weekAdd(c.week, c.id, amount, c.now)
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

// KEYS: acct, earn, rank, econ, week, [earnIp]  ARGV: id, source, points, dailyMax, dailyCap, balanceCap, ttl, ipMax, now
const EARN_LUA = `${CREDIT_FN}
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[5]), balanceCap = tonumber(ARGV[6]), ttl = ARGV[7], now = tonumber(ARGV[9]) }
return credit(c, ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4]), KEYS[6], tonumber(ARGV[8]))
`;

// 머무르기: 직전 지급 후 gap이 지났을 때만 (아니면 -1). 같은 화면(sid)의 연달은 기록이면 흐른 시간만큼 몰아서
// (lib/store/types.ts presenceCatchup과 같은 규칙: 창 window 안·10분(tick) 단위·slack 여유·최대 maxTicks, 다음 기준 = 센 만큼만 앞으로)
// KEYS: acct, earn, rank, econ, week  ARGV: id, now, gap, points, dailyMax, dailyCap, balanceCap, ttl, sid, tick, slack, maxTicks, window
const PRESENCE_LUA = `${CREDIT_FN}
local now = tonumber(ARGV[2])
local pv = redis.call('HMGET', KEYS[1], 'presenceAt', 'presenceSid')
local last = tonumber(pv[1] or '0') or 0
local elapsed = now - last
if elapsed < tonumber(ARGV[3]) then return -1 end
local sid = ARGV[9]
local ticks = 1
local nextAt = now
if sid ~= '' and pv[2] == sid and last > 0 and elapsed <= tonumber(ARGV[13]) then
  local tick = tonumber(ARGV[10])
  ticks = math.max(1, math.min(tonumber(ARGV[12]), math.floor((elapsed + tonumber(ARGV[11])) / tick)))
  nextAt = math.min(now, last + ticks * tick)
end
redis.call('HSET', KEYS[1], 'presenceAt', tostring(nextAt))
if sid ~= '' then redis.call('HSET', KEYS[1], 'presenceSid', sid) else redis.call('HDEL', KEYS[1], 'presenceSid') end
-- 10번: 머문 기록은 포인트 한도와 상관없이 센다 (출석 도장 조건)
redis.call('HINCRBY', KEYS[2], '_stay', ticks)
redis.call('EXPIRE', KEYS[2], ARGV[8])
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[6]), balanceCap = tonumber(ARGV[7]), ttl = ARGV[8], now = now }
local amount = credit(c, 'presence', tonumber(ARGV[4]) * ticks, tonumber(ARGV[5]))
-- 화면이 바로 쓸 값도 같이 (머무르기 응답이 계정 전체를 다시 읽지 않게): 적립, 센 기록 수, 잔액, 모은 포인트, 오늘 쌓은 포인트, 오늘 머문 기록 수
local bal = redis.call('HMGET', KEYS[1], 'points', 'lifetime')
local points = tonumber(bal[1] or '0') or 0
return { amount, ticks, points, tonumber(bal[2] or '') or points, tonumber(redis.call('HGET', KEYS[2], '_total') or '0'), tonumber(redis.call('HGET', KEYS[2], '_stay') or '0') }
`;

// 접속 시간 보너스: 오늘 머문 기록(_stay)으로 열린 구간 중 안 받은 구간(_bonus 다음부터)을 한 번에. 없으면 -1.
// 받은 구간 수를 먼저 올리므로 동시에 눌러도 한 번만 나간다. lib/stayBonus.ts·MemoryAccounts.claimStayBonus와 같은 규칙
// KEYS: acct, earn, rank, econ, week  ARGV: id, every(기록 수/구간), dailyMax, dailyCap, balanceCap, ttl, now, 구간별 보너스...
const STAY_BONUS_LUA = `${CREDIT_FN}
local amounts = {}
for i = 8, #ARGV do amounts[#amounts + 1] = tonumber(ARGV[i]) end
local tiers = math.min(math.floor(tonumber(redis.call('HGET', KEYS[2], '_stay') or '0') / tonumber(ARGV[2])), #amounts)
local claimed = tonumber(redis.call('HGET', KEYS[2], '_bonus') or '0')
if tiers <= claimed then return {-1, 0} end
local sum = 0
for i = claimed + 1, tiers do sum = sum + amounts[i] end
redis.call('HSET', KEYS[2], '_bonus', tiers)
redis.call('EXPIRE', KEYS[2], ARGV[6])
-- 하루 전체 한도(800)와 별개: 자기 하루 상한(dailyMax)·지갑 상한만 본다
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], week = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[4]), balanceCap = tonumber(ARGV[5]), ttl = ARGV[6], outsideTotal = true, now = tonumber(ARGV[7]) }
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
// ARGV: id, day, yesterday, perIp, ttl, attendPts, attendMax, streakPts, streakMax, monthlyPts, monthlyMax, balanceCap, needTicks, dd, monthDays, calTtl, now
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
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[4], econ = KEYS[5], week = KEYS[6], id = ARGV[1], dailyCap = 1000000000, balanceCap = tonumber(ARGV[12]), ttl = ARGV[5], now = tonumber(ARGV[17]) }
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

// 출석 구간 코디 보상 (그달 구간마다 한 번). 달력 해시의 `_r{구간 일수}` = 받은 꾸미기 id (도장 수를 셀 때 `_` 필드는 빠진다).
// 꾸미기: 입고 있으면 그 자리(look), 아니면 벗어 둔 꾸미기(stash)의 만료 시각을 늘린다 — lib/store/gifts.ts GIFT_CLAIM_LUA,
// MemoryAccounts.grantAttendTier, lib/attendTiers.ts tierUntil과 같은 규칙. 'perm'이면 영구 소장
// KEYS: cal, look, stash  ARGV: field, tierDays, itemId, slot, 기간 ms|'perm', now, 영구 만료 ms, calTtl  → 1 줌 | 0 이미 받음·도장 모자람
const TIER_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
local n = 0
for _, f in ipairs(redis.call('HKEYS', KEYS[1])) do
  if string.sub(f, 1, 1) ~= '_' then n = n + 1 end
end
if n < tonumber(ARGV[2]) then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[8])
local id, slot, now, perm = ARGV[3], ARGV[4], tonumber(ARGV[6]), tonumber(ARGV[7])
local cur = redis.call('HGET', KEYS[2], slot)
local curItem, curUntil = nil, 0
if cur then
  local ci, cu = string.match(cur, '^([^|]+)|(.+)$')
  curItem, curUntil = ci, tonumber(cu) or 0
end
local wearing = curItem == id and curUntil > now
local had = curUntil
if not wearing then
  had = tonumber(redis.call('HGET', KEYS[3], id) or '0')
  if had <= now then had = 0 end
end
local u = perm
if ARGV[5] ~= 'perm' then u = math.min(perm, math.max(had, now) + tonumber(ARGV[5])) end
if u > had then
  if wearing then redis.call('HSET', KEYS[2], slot, id .. '|' .. u) else redis.call('HSET', KEYS[3], id, u) end
end
return 1
`;

// 주간 랭킹 1위 보상 (mark = `${주}:${랭킹}`마다 한 번). 지급 표시 HSETNX가 먼저라 동시에 불려도 한 번만 준다.
// 꾸미기: 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 만료 시각을 until로 늘린다 (이미 더 길면 그대로 — 연속 1위면 이어진다).
// 포인트: 잔액(지갑 상한)·모은 포인트·전체 포인트 랭킹 (주간 랭킹엔 넣지 않는다), 경제 통계 earn:champ. MemoryAccounts.grantChamp와 같은 규칙
// 전용 모자는 늘 지금 자격에 맞는 것 하나만: 다른 전용 꾸미기(ARGV[9..])는 가방·벗어 둔 꾸미기·착용 칸에서 거두고,
// 그걸 입고 있었으면 새 모자를 그 칸에 입힌다
// KEYS: paid(champ:paid), acct, look, stash, rank, econ, inv  ARGV: mark, 계정, itemId, slot, until, points, balanceCap, now, 다른 전용 꾸미기 id...  → 1 줌 | 0 이미 줌
const CHAMP_LUA = `
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return 0 end
local id, slot, target, now = ARGV[3], ARGV[4], tonumber(ARGV[5]), tonumber(ARGV[8])
local others = {}
for i = 9, #ARGV do
  if ARGV[i] ~= id then
    others[ARGV[i]] = true
    redis.call('HDEL', KEYS[7], ARGV[i])
    redis.call('HDEL', KEYS[4], ARGV[i])
  end
end
local cur = redis.call('HGET', KEYS[3], slot)
local curItem, curUntil = nil, 0
if cur then
  local ci, cu = string.match(cur, '^([^|]+)|(.+)$')
  curItem, curUntil = ci, tonumber(cu) or 0
end
local swapIn = curItem ~= nil and others[curItem] == true
local wearing = curItem == id and curUntil > now
local had = curUntil
if not wearing then
  had = tonumber(redis.call('HGET', KEYS[4], id) or '0')
  if had <= now then had = 0 end
end
if swapIn then
  redis.call('HSET', KEYS[3], slot, id .. '|' .. math.max(target, had))
  redis.call('HDEL', KEYS[4], id)
elseif target > had then
  if wearing then redis.call('HSET', KEYS[3], slot, id .. '|' .. target) else redis.call('HSET', KEYS[4], id, target) end
end
local pts = tonumber(ARGV[6])
if pts > 0 then
  local before = tonumber(redis.call('HGET', KEYS[2], 'points') or '0')
  local bal = math.min(tonumber(ARGV[7]), before + pts)
  if bal > before then
    redis.call('HSET', KEYS[2], 'points', bal)
    redis.call('HSETNX', KEYS[2], 'lifetime', before)
    redis.call('ZADD', KEYS[5], redis.call('HINCRBY', KEYS[2], 'lifetime', bal - before), ARGV[2])
    redis.call('HINCRBY', KEYS[6], 'earn:champ', bal - before)
    redis.call('EXPIRE', KEYS[6], ${ECON_TTL_SEC})
  end
end
return 1
`;

// 전용 꾸미기 거두기 (시험 해제): 가방·벗어 둔 꾸미기에서 지우고, 착용 칸에 있으면 벗긴다
// KEYS: inv, stash, look  ARGV: itemId...
const REVOKE_CHAMP_LUA = `
local drop = {}
for i = 1, #ARGV do
  drop[ARGV[i]] = true
  redis.call('HDEL', KEYS[1], ARGV[i])
  redis.call('HDEL', KEYS[2], ARGV[i])
end
local l = redis.call('HGETALL', KEYS[3])
for i = 1, #l, 2 do
  local item = string.match(l[i + 1], '^([^|]+)|')
  if item and drop[item] then redis.call('HDEL', KEYS[3], l[i]) end
end
return 1
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

// ── 닉네임 중복 금지: 이름 색인(names: 비교 키 → 계정 id) Lua 공용 함수 ──
// 점유자 계정 키는 TS가 먼저 읽어 KEYS로 넘기고(expected), Lua 안에서 그대로인지 다시 본다 → 바뀌었으면 -9(다시 읽고 시도)
const NAME_FNS = `
-- 마지막 접속 = seenAt·presenceAt·createdAt 중 가장 늦은 것 (0 = 기록 없음 → 휴면으로 보지 않는다)
local function dormant(acct, now, ms)
  local v = redis.call('HMGET', acct, 'seenAt', 'presenceAt', 'createdAt')
  local last = 0
  for i = 1, 3 do
    local n = tonumber(v[i] or '0') or 0
    if n > last then last = n end
  end
  return last > 0 and now - last > ms
end
-- id가 그 키를 가질 수 있나: 1 = 비었거나 내 것이거나 점유자가 휴면, 0 = 다른 계정이 쓰는 중, -9 = 점유자가 바뀜
local function canTake(names, key, id, expected, ownerAcct, now, ms)
  local owner = redis.call('HGET', names, key)
  if not owner or owner == id then return 1 end
  if owner ~= expected then return -9 end
  if dormant(ownerAcct, now, ms) then return 1 end
  return 0
end
-- id가 그 키를 차지한다: 내 옛 키는 풀고, 휴면 점유자에게서 가져오면 그 계정의 nameKey를 지운다
local function take(acct, names, key, id, ownerAcct)
  local old = redis.call('HGET', acct, 'nameKey')
  if old and old ~= key and redis.call('HGET', names, old) == id then redis.call('HDEL', names, old) end
  local owner = redis.call('HGET', names, key)
  if owner and owner ~= id and redis.call('HGET', ownerAcct, 'nameKey') == key then redis.call('HDEL', ownerAcct, 'nameKey') end
  redis.call('HSET', names, key, id)
  redis.call('HSET', acct, 'nameKey', key)
  redis.call('HDEL', acct, 'nameDup', 'renameRequired')
end
`;

// 이름 등록 (이름이 없거나 휴면 재설정 중일 때). 1 = 등록(또는 이미 이 이름), 0 = 다른 계정이 씀, 2 = 이미 이름이 있음, -9 = 다시 시도
// KEYS: acct, names, ownerAcct  ARGV: id, name, key, expected, now, dormantMs, onlyEmpty('1' = 휴면 재설정도 하지 않음)
const CLAIM_NAME_LUA = `${NAME_FNS}
if redis.call('HGET', KEYS[1], 'name') and (ARGV[7] == '1' or redis.call('HGET', KEYS[1], 'renameRequired') ~= '1') then
  if redis.call('HGET', KEYS[1], 'nameKey') == ARGV[3] then return 1 end
  return 2
end
local c = canTake(KEYS[2], ARGV[3], ARGV[1], ARGV[4], KEYS[3], tonumber(ARGV[5]), tonumber(ARGV[6]))
if c ~= 1 then return c end
take(KEYS[1], KEYS[2], ARGV[3], ARGV[1], KEYS[3])
redis.call('HSET', KEYS[1], 'name', ARGV[2], 'seenAt', ARGV[5])
return 1
`;

// 입장·계정 확인: 휴면이면 재설정 표시 + 내 이름 색인 해제, 아니면(touch) 마지막 입장 시각. {휴면 재설정 중 1/0, 색인 채울 필요 1/0, 이름}
// KEYS: acct, names  ARGV: id, now, dormantMs, touch('1')
const VISIT_LUA = `${NAME_FNS}
local name = redis.call('HGET', KEYS[1], 'name')
local again = redis.call('HGET', KEYS[1], 'renameRequired') == '1'
if name and not again and dormant(KEYS[1], tonumber(ARGV[2]), tonumber(ARGV[3])) then
  again = true
  local old = redis.call('HGET', KEYS[1], 'nameKey')
  if old and redis.call('HGET', KEYS[2], old) == ARGV[1] then redis.call('HDEL', KEYS[2], old) end
  redis.call('HDEL', KEYS[1], 'nameKey', 'nameDup')
  redis.call('HSET', KEYS[1], 'renameRequired', '1')
end
if not again and ARGV[4] == '1' then redis.call('HSET', KEYS[1], 'seenAt', ARGV[2]) end
local need = 0
if name and not again and not redis.call('HGET', KEYS[1], 'nameKey') then need = 1 end
return { again and 1 or 0, need, name or '' }
`;

// 옛 계정 이름을 색인에 채운다. 1 = 채움(또는 이미 있음), 2 = 다른 계정이 차지 → nameDup 표시만, 3 = 그 사이 이름이 바뀜, -9 = 다시 시도
// KEYS: acct, names, ownerAcct  ARGV: id, name(읽은 이름), key, expected, now, dormantMs
const INDEX_NAME_LUA = `${NAME_FNS}
if redis.call('HGET', KEYS[1], 'name') ~= ARGV[2] or redis.call('HGET', KEYS[1], 'renameRequired') == '1' then return 3 end
if redis.call('HGET', KEYS[1], 'nameKey') then return 1 end
local c = canTake(KEYS[2], ARGV[3], ARGV[1], ARGV[4], KEYS[3], tonumber(ARGV[5]), tonumber(ARGV[6]))
if c == -9 then return -9 end
if c == 0 then redis.call('HSET', KEYS[1], 'nameDup', '1'); return 2 end
take(KEYS[1], KEYS[2], ARGV[3], ARGV[1], KEYS[3])
return 1
`;

// 닉네임 변경: 쿨다운 → 중복 → (두 번째부터) 비용 차감 → 이름 색인·이름·시각·횟수.
// {-2, 다음 가능 시각} | {-3, 0}(다른 계정이 쓰는 이름) | {-9, 0}(점유자가 바뀜, 다시 시도) | {-1, 0}(포인트 부족) | {비용, 0}
// KEYS: acct, ledger, econ, names, ownerAcct  ARGV: name, now, price, cooldownMs, entryJson, key, expected, dormantMs, id
const NAME_LUA = `${NAME_FNS}
local now = tonumber(ARGV[2])
local changed = tonumber(redis.call('HGET', KEYS[1], 'nameChangedAt') or '0')
if changed > 0 and now < changed + tonumber(ARGV[4]) then return {-2, changed + tonumber(ARGV[4])} end
local can = canTake(KEYS[4], ARGV[6], ARGV[9], ARGV[7], KEYS[5], now, tonumber(ARGV[8]))
if can == 0 then return {-3, 0} end
if can == -9 then return {-9, 0} end
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
take(KEYS[1], KEYS[4], ARGV[6], ARGV[9], KEYS[5])
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
// KEYS: killsAll, killsWeek, bestAll, bestWeek  ARGV: id, kills, clearMs(''=클리어 못 함), weekTtl, now (주간 처치 수 동점은 먼저 달성한 사람이 위)
const HUNT_LUA = `${WEEK_FN}
if tonumber(ARGV[2]) > 0 then
  redis.call('ZINCRBY', KEYS[1], ARGV[2], ARGV[1])
  weekAdd(KEYS[2], ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[5]))
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
    // 오늘 적립 기록 세 필드는 HMGET 하나로 (명령 9개 → 7개)
    const [acct, inv, look, graves, earnToday, activity, stashRaw] = await this.redis
      .pipeline()
      .hgetall(K.acct(id))
      .hgetall(K.inv(id))
      .hgetall(K.look(id))
      .smembers(K.acctGraves(id))
      .hmget(K.earn(id, day), "_total", "_stay", "_bonus")
      .lrange(K.activity(id), 0, -1)
      .hgetall(K.stash(id))
      .exec<[string[] | null, string[] | null, string[] | null, string[], unknown, string[], string[] | null]>();
    const [today, stay, bonus] = hmgetList(earnToday, ["_total", "_stay", "_bonus"]);
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
      renameRequired: a.get("renameRequired") === "1",
    };
  }

  async earn(id: string, source: EarnSource, day: string, opts: EarnOptions = {}): Promise<number> {
    const rule = earnRule(source);
    const keys = [K.acct(id), K.earn(id, day), K.rankPoints, await econKeyFor(id, day), K.rankPointsWeek(weekOfDay(day))];
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
      String(Date.now()),
    ]);
    return Number(r);
  }

  async spend(id: string, amount: number, reason: string, now: number): Promise<number | null> {
    const entry = JSON.stringify({ at: now, amount: -amount, reason });
    const r = Number(
      await this.redis.eval<string[], number>(SPEND_LUA, [K.acct(id), K.ledger(id), await econKeyFor(id, kstDay(now))], [
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
      await this.redis.eval<string[], number>(REFUND_LUA, [K.acct(id), K.ledger(id), await econKeyFor(id, kstDay(now))], [
        String(amount),
        String(BALANCE_CAP),
        entry,
      ]),
    );
  }

  async appearance(id: string, now: number): Promise<Pick<AccountRecord, "name" | "color" | "body" | "equipped">> {
    const [nb, look] = await this.redis
      .pipeline()
      .hmget(K.acct(id), "name", "color", "body")
      .hgetall(K.look(id))
      .exec<[unknown, string[] | null]>();
    const [name, color, body] = hmgetList(nb, ["name", "color", "body"]);
    const equipped: EquippedItem[] = [...pairs(look).values()].flatMap((v) => {
      const [itemId, until] = v.split("|");
      return Number(until) > now ? [{ itemId, until: Number(until) }] : [];
    });
    return { name: name ?? null, color: color ?? null, body: body ?? null, equipped };
  }

  async presence(id: string, day: string, now: number): Promise<number | null> {
    return (await this.presenceTick(id, day, now))?.earned ?? null;
  }

  async presenceTick(id: string, day: string, now: number, sid = ""): Promise<PresenceTick | null> {
    const rule = earnRule("presence");
    const r = await this.redis.eval<string[], number | number[]>(
      PRESENCE_LUA,
      [K.acct(id), K.earn(id, day), K.rankPoints, await econKeyFor(id, day), K.rankPointsWeek(weekOfDay(day))],
      [
        id,
        String(now),
        String(PRESENCE_MIN_GAP_MS),
        String(rule.points),
        String(rule.dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(EARN_TTL_SEC),
        sid,
        String(PRESENCE_TICK_MS),
        String(PRESENCE_TICK_SLACK_MS),
        String(PRESENCE_CATCHUP_MAX_TICKS),
        String(PRESENCE_CATCHUP_WINDOW_MS),
      ],
    );
    // 너무 이르면 -1 (배열이 아니다)
    if (!Array.isArray(r)) return null;
    const [earned, ticks, points, lifetimePoints, todayEarned, stayTicks] = r.map((x) => Number(x) || 0);
    return { earned, ticks, points, lifetimePoints, todayEarned, stayTicks };
  }

  async claimStayBonus(id: string, day: string): Promise<{ earned: number; count: number } | null> {
    const [earned, count] = await this.redis.eval<string[], [number, number]>(
      STAY_BONUS_LUA,
      [K.acct(id), K.earn(id, day), K.rankPoints, await econKeyFor(id, day), K.rankPointsWeek(weekOfDay(day))],
      [
        id,
        String(STAY_BONUS_EVERY_TICKS),
        String(earnRule("stayBonus").dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(EARN_TTL_SEC),
        String(Date.now()),
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
      points: rankValue(score),
      rank: i + 1,
    }));
    const [myRank, myScore, myName] = r.slice(top.length);
    const mine =
      me && myRank !== null && myRank !== undefined
        ? { accountId: me, name: (myName as string | null) ?? null, points: rankValue(myScore), rank: Number(myRank) + 1 }
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
      [id, String(Math.max(0, Math.floor(run.kills))), run.clearMs === null ? "" : String(Math.round(run.clearMs)), String(WEEK_RANK_TTL_SEC), String(Date.now())],
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
    // 이름은 이름 색인과 함께 등록한다 (다른 계정이 쓰는 이름이면 저장하지 않는다). 휴면 재설정은 여기서 하지 않는다
    if (profile.name) await this.claim(id, profile.name, now, true);
    await this.redis.eval<string[], number>(ENTER_LUA, [K.acct(id)], ["", profile.color ?? "", profile.body ?? "", String(now)]);
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
      tiers: Object.fromEntries([...m].filter(([k]) => /^_r\d+$/.test(k)).map(([k, v]) => [k.slice(2), v])),
    };
  }

  async grantAttendTier(id: string, month: string, tierDays: number, itemId: string, slot: CosmeticSlot, termMs: number | null, now: number): Promise<boolean> {
    await this.initCalendar(id);
    const r = await this.redis.eval<string[], number>(
      TIER_LUA,
      [K.cal(id, month), K.look(id), K.stash(id)],
      [`_r${tierDays}`, String(tierDays), itemId, slot, termMs === null ? "perm" : String(termMs), String(now), String(PERMANENT_UNTIL), String(CALENDAR_TTL_SEC)],
    );
    return Number(r) === 1;
  }

  async grantChamp(id: string, mark: string, itemId: string, slot: CosmeticSlot, until: number, points: number, now: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(
      CHAMP_LUA,
      [K.champPaid, K.acct(id), K.look(id), K.stash(id), K.rankPoints, await econKeyFor(id, kstDay(now)), K.inv(id)],
      [mark, id, itemId, slot, String(until), String(points), String(BALANCE_CAP), String(now), ...CHAMP_ITEM_IDS],
    );
    return Number(r) === 1;
  }

  async revokeChamp(id: string, itemIds: readonly string[]): Promise<void> {
    if (!itemIds.length) return;
    await this.redis.eval<string[], number>(REVOKE_CHAMP_LUA, [K.inv(id), K.stash(id), K.look(id)], [...itemIds]);
  }

  async champPaid(marks: readonly string[]): Promise<(string | null)[]> {
    if (!marks.length) return [];
    const r = (await this.redis.hmget(K.champPaid, ...marks)) as unknown as (string | null)[] | null;
    return marks.map((_, i) => r?.[i] ?? null);
  }

  async claimAttend(id: string, ipHash: string, day: string, yesterday: string, monthDays: number, needTicks: number): Promise<AttendClaim> {
    await this.initCalendar(id);
    const [attend, streak, monthly] = [earnRule("attend"), earnRule("streak"), earnRule("monthly")];
    const r = (
      await this.redis.eval<string[], number[]>(
        CLAIM_LUA,
        [K.acct(id), K.earn(id, day), K.attendIp(ipHash, day), K.rankPoints, await econKeyFor(id, day), K.rankPointsWeek(weekOfDay(day)), K.cal(id, day.slice(0, 6))],
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
          String(Date.now()),
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
      await this.redis.eval<string[], number>(BUY_LUA, [K.acct(id), K.inv(id), K.look(id), await econKeyFor(id, kstDay(opts.now ?? Date.now())), K.stash(id)], [
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

  async setTitle(id: string, titleId: string | null): Promise<void> {
    // 착용 해시의 "title" 필드 (만료 없음 = PERMANENT_UNTIL). 읽기·만료 정리는 다른 착용품과 같다
    if (titleId) await this.redis.hset(K.look(id), { title: `${titleId}|${PERMANENT_UNTIL}` });
    else await this.redis.hdel(K.look(id), "title");
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
      await this.redis.eval<string[], number>(ADJUST_LUA, [K.acct(id), K.rankPoints, await econKeyFor(id, kstDay())], [
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
    const key = nameKey(name);
    const econ = await econKeyFor(id, kstDay(now));
    const [code, next] = await this.withOwner(
      key,
      id,
      async (expected, ownerAcct) =>
        (
          await this.redis.eval<string[], [number, number]>(NAME_LUA, [K.acct(id), K.ledger(id), econ, K.names, ownerAcct], [
            name,
            String(now),
            String(price),
            String(cooldownMs),
            entry,
            key,
            expected,
            String(DORMANT_MS),
            id,
          ])
        ).map(Number),
      ([c]) => c === -9,
    );
    if (code === -2) return { ok: false, reason: "cooldown", nextAllowedAt: next };
    if (code === -3 || code === -9) return { ok: false, reason: "taken" };
    if (code === -1) return { ok: false, reason: "points" };
    return { ok: true, cost: code };
  }

  // ── 닉네임 중복 금지 (이름 색인) ──

  /** 이름 색인 Lua를 지금 점유자(expected, 그 계정 키)와 함께 부른다. 그 사이 점유자가 바뀌면 다시 읽어 시도 */
  private async withOwner<T>(key: string, id: string, run: (expected: string, ownerAcct: string) => Promise<T>, again: (r: T) => boolean): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const owner = (await this.redis.hget<string>(K.names, key)) ?? "";
      const r = await run(owner, K.acct(owner || id));
      if (!again(r) || attempt >= 4) return r;
    }
  }

  async nameOwner(key: string, now: number): Promise<string | null> {
    const owner = await this.redis.hget<string>(K.names, key);
    if (!owner) return null;
    const v = (await this.redis.hmget(K.acct(owner), "seenAt", "presenceAt", "createdAt")) as unknown as (string | null)[] | null;
    const last = Math.max(0, ...(v ?? []).map((x) => Number(x ?? 0) || 0));
    return last > 0 && now - last > DORMANT_MS ? null : owner;
  }

  private async claim(id: string, name: string, now: number, onlyEmpty: boolean): Promise<NameClaimResult> {
    const key = nameKey(name);
    const r = await this.withOwner(
      key,
      id,
      async (expected, ownerAcct) =>
        Number(
          await this.redis.eval<string[], number>(CLAIM_NAME_LUA, [K.acct(id), K.names, ownerAcct], [
            id,
            name,
            key,
            expected,
            String(now),
            String(DORMANT_MS),
            onlyEmpty ? "1" : "0",
          ]),
        ),
      (c) => c === -9,
    );
    return r === 1 ? "ok" : r === 2 ? "has" : "taken";
  }

  claimName(id: string, name: string, now: number): Promise<NameClaimResult> {
    return this.claim(id, name, now, false);
  }

  /** 옛 계정 이름을 색인에 채운다: indexed = 채움, dup = 다른 계정이 이미 차지(nameDup 표시만), none = 할 일 없음 */
  private async indexName(id: string, name: string, now: number): Promise<"indexed" | "dup" | "none"> {
    const key = nameKey(name);
    const r = await this.withOwner(
      key,
      id,
      async (expected, ownerAcct) =>
        Number(
          await this.redis.eval<string[], number>(INDEX_NAME_LUA, [K.acct(id), K.names, ownerAcct], [id, name, key, expected, String(now), String(DORMANT_MS)]),
        ),
      (c) => c === -9,
    );
    return r === 1 ? "indexed" : r === 2 || r === -9 ? "dup" : "none";
  }

  async visit(id: string, now: number, touch: boolean): Promise<VisitResult> {
    const [again, need, name] = await this.redis.eval<string[], [number, number, string]>(VISIT_LUA, [K.acct(id), K.names], [
      id,
      String(now),
      String(DORMANT_MS),
      touch ? "1" : "0",
    ]);
    if (Number(need) === 1 && name) await this.indexName(id, String(name), now);
    return { renameRequired: Number(again) === 1 };
  }

  async reindexNames(cursor: string, count: number, now: number): Promise<{ next: string; indexed: number; dup: number }> {
    const [next, keys] = await this.redis.scan(cursor, { match: "acct:*", count, type: "hash" });
    const ids = keys.filter((k) => /^acct:[^:]+$/.test(k)).map((k) => k.slice("acct:".length));
    let indexed = 0;
    let dup = 0;
    for (const id of ids) {
      const v = (await this.redis.hmget(K.acct(id), "name", "nameKey", "renameRequired")) as unknown as (string | null)[] | null;
      const [name, key, again] = v ?? [null, null, null];
      if (!name || key || again === "1") continue;
      const r = await this.indexName(id, name, now);
      if (r === "indexed") indexed++;
      else if (r === "dup") dup++;
    }
    return { next: String(next), indexed, dup };
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

  /** 랭킹에 오른 계정(포인트를 모은 적 있는 계정)의 잔액 합계 (exclude 계정은 뺀다 — 운영자). 관리자 화면에서만 부른다 */
  async walletTotals(exclude: string | null = null): Promise<{ wallets: number; accounts: number }> {
    const ids = (await this.redis.zrange<string[]>(K.rankPoints, 0, -1)).filter((id) => id !== exclude);
    if (!ids.length) return { wallets: 0, accounts: 0 };
    const p = this.redis.pipeline();
    for (const id of ids) p.hget(K.acct(id), "points");
    const pts = await p.exec<(string | null)[]>();
    return { wallets: pts.reduce((n, v) => n + Number(v ?? 0), 0), accounts: ids.length };
  }

  /** 계정 해시 HMGET 한 번씩을 파이프라인 한 번으로 (관리자 회원 목록) */
  async summaries(ids: readonly string[]): Promise<(AccountSummary | null)[]> {
    if (!ids.length) return [];
    const p = this.redis.pipeline();
    for (const id of ids) p.hmget(K.acct(id), ...SUMMARY_FIELDS);
    const rows = await p.exec<((string | null)[] | null)[]>();
    return ids.map((id, i) => summaryOf(id, rows[i]));
  }

  /** SCAN acct:* (해시만) → 계정 해시(acct:{id})만 골라 요약. 부속 키(acct:{id}:inv 등)는 거른다 */
  async scanAccounts(cursor: string, count: number): Promise<{ next: string; accounts: AccountSummary[] }> {
    const [next, keys] = await this.redis.scan(cursor, { match: "acct:*", count, type: "hash" });
    const ids = keys.filter((k) => /^acct:[^:]+$/.test(k)).map((k) => k.slice("acct:".length));
    const rows = await this.summaries(ids);
    return { next: String(next), accounts: rows.filter((r): r is AccountSummary => r !== null) };
  }
}

/** HMGET 결과 → 필드 순서 값 (automaticDeserialization: false면 배열, 혹시 객체로 와도) */
function hmgetList(got: unknown, fields: readonly string[]): (string | null)[] {
  if (Array.isArray(got)) return fields.map((_, i) => (got[i] as string | null) ?? null);
  const o = (got ?? {}) as Record<string, string | null>;
  return fields.map((f) => o[f] ?? null);
}

const SUMMARY_FIELDS = ["name", "createdAt", "seenAt", "presenceAt", "points", "renameRequired", "codeHash"] as const;

/** HMGET 결과 → 요약. 필드가 하나도 없으면 없는 계정 */
function summaryOf(accountId: string, v: (string | null)[] | null): AccountSummary | null {
  if (!v || v.every((x) => x === null || x === undefined)) return null;
  const [name, createdAt, seenAt, presenceAt, points, again, code] = v;
  const created = Number(createdAt ?? 0) || 0;
  return {
    accountId,
    name: name ?? null,
    createdAt: created,
    lastSeenAt: Math.max(Number(seenAt ?? 0) || 0, Number(presenceAt ?? 0) || 0, created),
    points: Number(points ?? 0) || 0,
    renameRequired: again === "1",
    hasCode: !!code,
  };
}

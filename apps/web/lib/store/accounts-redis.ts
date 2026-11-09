import { Redis } from "@upstash/redis";
import { MAX_DECOR_PER_GRAVE, type CosmeticSlot } from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import type { ActivityItem, Grave, GraveDecor } from "../types";
import { kstDay } from "./accounts";
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
 * MemoryAccounts.credit과 같은 규칙. c = { acct, earn, rank, econ, id, dailyCap, balanceCap, ttl }
 */
const CREDIT_FN = `
local function credit(c, source, points, dailyMax, ipKey, ipMax)
  local got = tonumber(redis.call('HGET', c.earn, source) or '0')
  local total = tonumber(redis.call('HGET', c.earn, '_total') or '0')
  local bal = tonumber(redis.call('HGET', c.acct, 'points') or '0')
  local amount = math.min(points, dailyMax - got, c.dailyCap - total, c.balanceCap - bal)
  if ipKey then amount = math.min(amount, ipMax - tonumber(redis.call('HGET', ipKey, source) or '0')) end
  if amount <= 0 then return 0 end
  redis.call('HINCRBY', c.earn, source, amount)
  redis.call('HINCRBY', c.earn, '_total', amount)
  redis.call('EXPIRE', c.earn, c.ttl)
  if ipKey then
    redis.call('HINCRBY', ipKey, source, amount)
    redis.call('EXPIRE', ipKey, c.ttl)
  end
  redis.call('HINCRBY', c.acct, 'points', amount)
  redis.call('HSETNX', c.acct, 'lifetime', bal)
  redis.call('ZADD', c.rank, redis.call('HINCRBY', c.acct, 'lifetime', amount), c.id)
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

// KEYS: acct, earn, rank, econ, [earnIp]  ARGV: id, source, points, dailyMax, dailyCap, balanceCap, ttl, ipMax
const EARN_LUA = `${CREDIT_FN}
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], id = ARGV[1], dailyCap = tonumber(ARGV[5]), balanceCap = tonumber(ARGV[6]), ttl = ARGV[7] }
return credit(c, ARGV[2], tonumber(ARGV[3]), tonumber(ARGV[4]), KEYS[5], tonumber(ARGV[8]))
`;

// 머무르기: 직전 지급 후 gap이 지났을 때만 (아니면 -1)
// KEYS: acct, earn, rank, econ  ARGV: id, now, gap, points, dailyMax, dailyCap, balanceCap, ttl
const PRESENCE_LUA = `${CREDIT_FN}
if tonumber(ARGV[2]) - tonumber(redis.call('HGET', KEYS[1], 'presenceAt') or '0') < tonumber(ARGV[3]) then return -1 end
redis.call('HSET', KEYS[1], 'presenceAt', ARGV[2])
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[3], econ = KEYS[4], id = ARGV[1], dailyCap = tonumber(ARGV[6]), balanceCap = tonumber(ARGV[7]), ttl = ARGV[8] }
return credit(c, 'presence', tonumber(ARGV[4]), tonumber(ARGV[5]))
`;

// 출석. 이름·색·몸 모양은 계정에 값이 없을 때만 저장한다
// KEYS: acct, earn, attendIp, rank, econ
// ARGV: id, day, yesterday, name, perIp, ttl, attendPts, attendMax, streakPts, streakMax, dailyCap, balanceCap, now, color, body
const ATTEND_LUA = `${CREDIT_FN}
if ARGV[4] ~= '' then redis.call('HSETNX', KEYS[1], 'name', ARGV[4]) end
if ARGV[14] ~= '' then redis.call('HSETNX', KEYS[1], 'color', ARGV[14]) end
if ARGV[15] ~= '' then redis.call('HSETNX', KEYS[1], 'body', ARGV[15]) end
redis.call('HSETNX', KEYS[1], 'createdAt', ARGV[13])
local last = redis.call('HGET', KEYS[1], 'lastAttend')
if last == ARGV[2] then return 0 end
local streak = 1
if last == ARGV[3] then streak = tonumber(redis.call('HGET', KEYS[1], 'streak') or '0') + 1 end
redis.call('HSET', KEYS[1], 'lastAttend', ARGV[2], 'streak', streak)
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 0 and redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[5]) then return 0 end
redis.call('SADD', KEYS[3], ARGV[1])
redis.call('EXPIRE', KEYS[3], ARGV[6])
local c = { acct = KEYS[1], earn = KEYS[2], rank = KEYS[4], econ = KEYS[5], id = ARGV[1], dailyCap = tonumber(ARGV[11]), balanceCap = tonumber(ARGV[12]), ttl = ARGV[6] }
local earned = credit(c, 'attend', tonumber(ARGV[7]), tonumber(ARGV[8]))
if streak % 7 == 0 then earned = earned + credit(c, 'streak', tonumber(ARGV[9]), tonumber(ARGV[10])) end
return earned
`;

// 구매. unique('1')면 가방에 있거나 지금 착용 중일 때 -1. 잔액 부족은 0
// KEYS: acct, inv, look, econ  ARGV: itemId, price, unique, now
const BUY_LUA = `
if ARGV[3] == '1' then
  if tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0') > 0 then return -1 end
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

// KEYS: inv, look  ARGV: itemId, slot, until
const EQUIP_LUA = `${TAKE_FN}
if not take(KEYS[1], ARGV[1]) then return 0 end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[1] .. '|' .. ARGV[3])
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
    const [acct, inv, look, graves, today, activity] = await this.redis
      .pipeline()
      .hgetall(K.acct(id))
      .hgetall(K.inv(id))
      .hgetall(K.look(id))
      .smembers(K.acctGraves(id))
      .hget(K.earn(id, day), "_total")
      .lrange(K.activity(id), 0, -1)
      .exec<[string[] | null, string[] | null, string[] | null, string[], string | null, string[]]>();
    const a = pairs(acct);
    const equipped: EquippedItem[] = [...pairs(look).values()].flatMap((v) => {
      const [itemId, until] = v.split("|");
      return Number(until) > now ? [{ itemId, until: Number(until) }] : [];
    });
    return {
      points: Number(a.get("points") ?? 0),
      lifetimePoints: Number(a.get("lifetime") ?? a.get("points") ?? 0),
      name: a.get("name") ?? null,
      color: a.get("color") ?? null,
      body: a.get("body") ?? null,
      streak: Number(a.get("streak") ?? 0),
      lastAttend: a.get("lastAttend") ?? null,
      hasCode: a.has("codeHash"),
      inventory: Object.fromEntries([...pairs(inv)].map(([k, v]) => [k, Number(v)])),
      equipped,
      graves,
      todayEarned: Number(today ?? 0),
      activityUnread: activity.filter((raw) => (JSON.parse(raw) as ActivityItem).at > Number(a.get("activitySeen") ?? 0)).length,
      nameChangedAt: Number(a.get("nameChangedAt") ?? 0),
      nameChanges: Number(a.get("nameChanges") ?? 0),
      tutorialDone: a.get("tutorialDone") === "1",
    };
  }

  async earn(id: string, source: EarnSource, day: string, opts: EarnOptions = {}): Promise<number> {
    const rule = earnRule(source);
    const keys = [K.acct(id), K.earn(id, day), K.rankPoints, K.econ(day)];
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
      await this.redis.eval<string[], number>(PRESENCE_LUA, [K.acct(id), K.earn(id, day), K.rankPoints, K.econ(day)], [
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

  /** ZRANGE 1회 + (상위 limit명 이름, 내 순위·점수) 파이프라인 1회 */
  async pointRank(limit: number, me: string | null): Promise<{ rows: RankEntry[]; mine: RankEntry | null }> {
    const flat = await this.redis.zrange<string[]>(K.rankPoints, 0, limit - 1, { rev: true, withScores: true });
    const top = [...pairs(flat)];
    const p = this.redis.pipeline();
    for (const [id] of top) p.hget(K.acct(id), "name");
    if (me) p.zrevrank(K.rankPoints, me).zscore(K.rankPoints, me).hget(K.acct(me), "name");
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

  async attend(id: string, ipHash: string, profile: Profile, day: string, yesterday: string): Promise<number> {
    const attend = earnRule("attend");
    const streak = earnRule("streak");
    const r = await this.redis.eval<string[], number>(
      ATTEND_LUA,
      [K.acct(id), K.earn(id, day), K.attendIp(ipHash, day), K.rankPoints, K.econ(day)],
      [
        id,
        day,
        yesterday,
        profile.name ?? "",
        String(ATTEND_ACCOUNTS_PER_IP),
        String(EARN_TTL_SEC),
        String(attend.points),
        String(attend.dailyMax),
        String(streak.points),
        String(streak.dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(Date.now()),
        profile.color ?? "",
        profile.body ?? "",
      ],
    );
    return Number(r);
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
      await this.redis.eval<string[], number>(BUY_LUA, [K.acct(id), K.inv(id), K.look(id), K.econ(kstDay(opts.now ?? Date.now()))], [
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

  async equip(id: string, itemId: string, slot: CosmeticSlot, until: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(EQUIP_LUA, [K.inv(id), K.look(id)], [itemId, slot, String(until)]);
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

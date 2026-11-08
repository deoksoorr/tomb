import { Redis } from "@upstash/redis";
import { MAX_DECOR_PER_GRAVE, type CosmeticSlot } from "@tomb/protocol";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, earnRule, type EarnSource } from "../economy";
import type { GraveDecor } from "../types";
import { DECOR, K } from "./keys";
import type { AccountRecord, AccountStore, EquippedItem } from "./types";

// 포인트·가방은 모두 Lua 스크립트 하나로 바꾼다. 스크립트 실행 중에는 다른 명령이 끼어들 수 없으므로
// 잔액 확인과 차감, 한도 확인과 적립 사이에 경쟁이 생기지 않는다 (동시 구매로 잔액이 음수가 되지 않는다).
// 스크립트가 건드리는 키는 모두 KEYS로 넘긴다.

/** 오늘 적립 기록은 날짜가 지나면 필요 없다 (KST 자정 경계 여유로 2일) */
const EARN_TTL_SEC = 2 * 86_400;

/** 항목별 하루 한도·하루 전체 한도·지갑 한도 안에서 적립 (MemoryAccounts.credit과 같은 규칙) */
const CREDIT_FN = `
local function credit(acct, earnKey, source, points, dailyMax, dailyCap, balanceCap, ttl)
  local got = tonumber(redis.call('HGET', earnKey, source) or '0')
  local total = tonumber(redis.call('HGET', earnKey, '_total') or '0')
  local bal = tonumber(redis.call('HGET', acct, 'points') or '0')
  local amount = math.min(points, dailyMax - got, dailyCap - total, balanceCap - bal)
  if amount <= 0 then return 0 end
  redis.call('HINCRBY', earnKey, source, amount)
  redis.call('HINCRBY', earnKey, '_total', amount)
  redis.call('EXPIRE', earnKey, ttl)
  redis.call('HINCRBY', acct, 'points', amount)
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

// KEYS: acct, earn  ARGV: source, points, dailyMax, dailyCap, balanceCap, ttl
const EARN_LUA = `${CREDIT_FN}
return credit(KEYS[1], KEYS[2], ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), ARGV[6])
`;

// KEYS: acct, earn, attendIp
// ARGV: id, day, yesterday, name, perIp, ttl, attendPts, attendMax, streakPts, streakMax, dailyCap, balanceCap, now
const ATTEND_LUA = `${CREDIT_FN}
if ARGV[4] ~= '' then redis.call('HSET', KEYS[1], 'name', ARGV[4]) end
redis.call('HSETNX', KEYS[1], 'createdAt', ARGV[13])
local last = redis.call('HGET', KEYS[1], 'lastAttend')
if last == ARGV[2] then return 0 end
local streak = 1
if last == ARGV[3] then streak = tonumber(redis.call('HGET', KEYS[1], 'streak') or '0') + 1 end
redis.call('HSET', KEYS[1], 'lastAttend', ARGV[2], 'streak', streak)
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 0 and redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[5]) then return 0 end
redis.call('SADD', KEYS[3], ARGV[1])
redis.call('EXPIRE', KEYS[3], ARGV[6])
local caps = { tonumber(ARGV[11]), tonumber(ARGV[12]), ARGV[6] }
local earned = credit(KEYS[1], KEYS[2], 'attend', tonumber(ARGV[7]), tonumber(ARGV[8]), caps[1], caps[2], caps[3])
if streak % 7 == 0 then
  earned = earned + credit(KEYS[1], KEYS[2], 'streak', tonumber(ARGV[9]), tonumber(ARGV[10]), caps[1], caps[2], caps[3])
end
return earned
`;

// KEYS: acct, inv  ARGV: itemId, price
const BUY_LUA = `
local price = tonumber(ARGV[2])
if tonumber(redis.call('HGET', KEYS[1], 'points') or '0') < price then return 0 end
redis.call('HINCRBY', KEYS[1], 'points', -price)
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
return 1
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
    const [acct, inv, look, graves, today] = await this.redis
      .pipeline()
      .hgetall(K.acct(id))
      .hgetall(K.inv(id))
      .hgetall(K.look(id))
      .smembers(K.acctGraves(id))
      .hget(K.earn(id, day), "_total")
      .exec<[string[] | null, string[] | null, string[] | null, string[], string | null]>();
    const a = pairs(acct);
    const equipped: EquippedItem[] = [...pairs(look).values()].flatMap((v) => {
      const [itemId, until] = v.split("|");
      return Number(until) > now ? [{ itemId, until: Number(until) }] : [];
    });
    return {
      points: Number(a.get("points") ?? 0),
      name: a.get("name") ?? null,
      streak: Number(a.get("streak") ?? 0),
      lastAttend: a.get("lastAttend") ?? null,
      hasCode: a.has("codeHash"),
      inventory: Object.fromEntries([...pairs(inv)].map(([k, v]) => [k, Number(v)])),
      equipped,
      graves,
      todayEarned: Number(today ?? 0),
    };
  }

  async earn(id: string, source: EarnSource, day: string): Promise<number> {
    const rule = earnRule(source);
    const r = await this.redis.eval<string[], number>(
      EARN_LUA,
      [K.acct(id), K.earn(id, day)],
      [source, String(rule.points), String(rule.dailyMax), String(DAILY_EARN_CAP), String(BALANCE_CAP), String(EARN_TTL_SEC)],
    );
    return Number(r);
  }

  async attend(id: string, ipHash: string, name: string | null, day: string, yesterday: string): Promise<number> {
    const attend = earnRule("attend");
    const streak = earnRule("streak");
    const r = await this.redis.eval<string[], number>(
      ATTEND_LUA,
      [K.acct(id), K.earn(id, day), K.attendIp(ipHash, day)],
      [
        id,
        day,
        yesterday,
        name ?? "",
        String(ATTEND_ACCOUNTS_PER_IP),
        String(EARN_TTL_SEC),
        String(attend.points),
        String(attend.dailyMax),
        String(streak.points),
        String(streak.dailyMax),
        String(DAILY_EARN_CAP),
        String(BALANCE_CAP),
        String(Date.now()),
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

  async buy(id: string, itemId: string, price: number): Promise<boolean> {
    const r = await this.redis.eval<string[], number>(BUY_LUA, [K.acct(id), K.inv(id)], [itemId, String(price)]);
    return Number(r) === 1;
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
    itemId: string,
    until: number,
    now: number,
  ): Promise<GraveDecor[] | "no_item" | null> {
    const nonce = Math.random().toString(36).slice(2, 10);
    const r = await this.redis.eval<string[], string | null>(
      DECOR_LUA,
      [K.meta, K.inv(id), K.decor(graveId)],
      [graveId, itemId, String(until), String(now), String(MAX_DECOR_PER_GRAVE), nonce],
    );
    if (r === null) return null;
    return r === "" ? "no_item" : (JSON.parse(r) as GraveDecor[]);
  }

  async addGrave(id: string, graveId: string): Promise<void> {
    await this.redis.sadd(K.acctGraves(id), graveId);
  }

  async removeGrave(id: string, graveId: string): Promise<void> {
    await this.redis.srem(K.acctGraves(id), graveId);
  }
}

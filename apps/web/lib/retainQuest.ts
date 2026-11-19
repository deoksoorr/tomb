import type { Redis } from "@upstash/redis";
import { campOpen } from "./camp";
import { env } from "./env";
import { redisClient } from "./redisUsage";
import { todoDef, todoField, todoPicks, type TodoKind, type TodoOpen, type TodoTick } from "./retain";
import { seaOpen } from "./sea";
import { staffAccountIdNow } from "./staff";
import { getAccounts } from "./store";
import type { MemoryAccounts } from "./store/accounts-memory";
import { K } from "./store/keys";
import type { QuestHook } from "./store/types";

// 11/18 오늘 미션 진행 올리기 (lib/retain.ts). 행동을 처리하는 원래 저장소 명령(Lua·파이프라인)에 실어 같은 왕복에서 올린다.
// 그날 미션에 든 행동일 때만 명령이 하나 는다 (HINCRBY — 칸이 처음 생기면 EXPIRE 하나 더). 응답에는 올린 뒤 값을 실어 화면이 바로 맞춘다.
// 11/19 다 채운 칸은 이 인스턴스가 기억해 그날 더 올리지 않는다 (진행 칸 명령을 아낀다 — 받기 판정은 칸 값 ≥ 필요 수라 더 올릴 필요가 없다)

/** 오늘 적립 해시 만료 (accounts-redis.ts EARN_TTL_SEC와 같다 — 날짜가 지나면 필요 없다) */
const EARN_TTL_SEC = 2 * 86_400;

/** 지금 서버에 열린 나들이 장소 (환경값 — 날 동안 바뀌지 않는다) */
export const todoOpenNow = (): TodoOpen => ({ camp: campOpen(), sea: seaOpen() });

/** 다 채운 칸 기억 `계정|날짜|칸` (인스턴스 메모리 — 날이 바뀌면 키가 달라진다. 너무 커지면 비운다) */
const g = globalThis as typeof globalThis & { __tombQuestFull?: Set<string> };
const full = (g.__tombQuestFull ??= new Set<string>());
const FULL_MAX = 50_000;
const fullKey = (accountId: string, day: string, field: string) => `${accountId}|${day}|${field}`;

/**
 * 오늘 이 계정의 미션에 든 행동이면 진행 칸 올리기 정보 (아니면 null → 저장소 명령이 그대로 — 명령도 늘지 않는다).
 * kinds = 이 행동이 셀 수 있는 미션들 (앞쪽 먼저 — 예: 바다 낚시는 ["seaFish", "fish"]). 같은 묶음은 하루에 하나만 뽑히므로 하나만 걸린다.
 * 미션은 날짜 + 계정 해시로 정해지므로 저장소를 묻지 않는다. 머무르기는 원래 있던 _stay를 그대로 보므로 올리지 않는다
 */
export function questHook(accountId: string, day: string, kinds: Exclude<TodoKind, "stay"> | readonly Exclude<TodoKind, "stay">[]): QuestHook | null {
  // 11/19 운영자는 미션이 없다 (화면에도 안 나온다 — 진행 칸 명령을 아낀다. 운영자 id는 인스턴스 기억값)
  if (staffAccountIdNow() === accountId) return null;
  const picks = todoPicks(day, accountId, todoOpenNow());
  const kind = (typeof kinds === "string" ? [kinds] : kinds).find((k) => picks.includes(k));
  if (!kind) return null;
  const field = todoField(kind);
  if (full.has(fullKey(accountId, day, field))) return null;
  return {
    key: K.earn(accountId, day),
    field,
    ttlSec: EARN_TTL_SEC,
    local: (n) => (getAccounts() as MemoryAccounts).bumpQuest(accountId, day, field, n),
  };
}

/** 행동 응답에 실을 진행 한 칸 (올리지 않았으면 빈 객체 — 응답에 펼쳐 넣는다). 다 채웠으면 기억해 둔다 */
export function todoTickOf(hook: QuestHook | null, day: string): { todo?: TodoTick } {
  if (!hook || hook.have === undefined) return {};
  const kind = hook.field.slice(3) as TodoKind;
  const need = todoDef(kind)?.need ?? 1;
  const acct = hook.key.split(":")[1];
  if (hook.have >= need && acct) {
    if (full.size > FULL_MAX) full.clear();
    full.add(fullKey(acct, day, hook.field));
  }
  return { todo: { kind, have: hook.have, day } };
}

// KEYS: 오늘 적립 해시  ARGV: 칸, 만료 → 올린 값 (칸이 처음 생기면 만료도)
const BUMP_LUA = `
local v = redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
if v == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return v
`;
const r = globalThis as typeof globalThis & { __tombQuestRedis?: Redis };

/**
 * 11/19 붙일 저장소 명령이 없는 행동(소원 분수·방명록·의뢰 납품·바베큐·놀이 판 기록)의 진행 +1: 스크립트 하나(왕복 하나).
 * 그날 미션에 든 행동이 성공했을 때만, 다 채우기 전까지만 부른다 (questHook이 null이면 아무것도 안 한다)
 */
export async function bumpQuest(hook: QuestHook | null): Promise<void> {
  if (!hook) return;
  const conn = env.redis();
  if (!conn) {
    hook.have = hook.local(1);
    return;
  }
  const redis = (r.__tombQuestRedis ??= redisClient(conn, "retain/quest"));
  hook.have = Number(await redis.eval<string[], number>(BUMP_LUA, [hook.key], [hook.field, String(hook.ttlSec)])) || 0;
}

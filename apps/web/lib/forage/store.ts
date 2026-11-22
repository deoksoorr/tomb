import type { Redis } from "@upstash/redis";
import { redisClient } from "../redisUsage";
import { env } from "../env";
import { BAG_MAX, bagIdOf, DEX_CATS, DEX_REWARD, DEX_REWARD_TABLE, DEX_TIERS, dexCatOf, dexClaimKey, dexRewardOf, takePlan, type DexCat, type FishGrade } from "./catalog";
import { nodeBaseWindow, tookMember } from "./rules";
import type { DexEntry, LifeDay } from "./types";
import type { QuestHook } from "../store/types";

// 낚시·채집 저장소. 가방·도감·진행 중 기록은 모두 계정마다 따로이고, 바뀌는 연산은 하나씩 원자적이다
// (Redis는 Lua 한 번, 메모리는 await 없는 구간). 로컬은 같은 규칙의 메모리 구현을 쓴다. store.test.ts가 두 구현에 같은 계약을 돌린다.
//
// Redis 키 (모두 forage:{accountId}:*)
//  - forage:{a}:bag         HASH  종류 id → 개수 (0이 되면 지운다). 11/22 직접 낚은 대물·월척은 `${종}~1`·`${종}~2` 칸에 따로 (catalog bagIdOf)
//  - forage:{a}:dex         HASH  n:{id} 잡은 수 · max:{id} 가장 큰 크기(cm×10) · first:{id} 처음 잡은 날(YYYYMMDD)
//                                별자리(c_*)는 n = 완성 횟수 · pf:{id} 완벽으로만 이은 횟수 (가방에는 들어가지 않는다)
//                                11/16 몬스터(lib/rpg/catalog id)는 n = 처치 수 · first = 처음 쓰러뜨린 날 (가방에는 들어가지 않는다)
//  - forage:{a}:claims      HASH  `${cat}:${tier}` → 받은 날 (예전 25·50·75·100% 단계 보상. 지금은 새로 쓰지 않고 전환 정산 근거·칭호로만 읽는다)
//  - forage:{a}:dexpay      HASH  종마다 처음 등록 보상 (lib/forage/dexReward): settled = 전환 정산한 날(계정당 한 번) ·
//                                p:{cat} 받을 도감 보상(예전 한도·꽉 찬 지갑으로 못 받은 것) · g:{cat} 새 방식으로 받은 포인트 · t:{cat}:{50|100} 붙은 칭호 표시
//                                정산 표시(settled)가 있을 때만 등록 순간 p:{cat}에 보상을 쌓는다 (그 전 등록은 정산이 한꺼번에 센다 → 두 번 세지 않는다)
//  - forage:{a}:active      STRING `${nonce}|${JSON}` 진행 중인 낚시·채집 (새로 시작하면 바뀐다, TTL)
//  - forage:{a}:used:{n}    STRING 끝낸 티켓 표시 (SET NX, 1일) → 같은 티켓을 두 번 낼 수 없다
//  - forage:{a}:hour:{h}    STRING 이번 한 시간 동안 시작한 수 (INCR, 1시간)
//  - forage:{a}:day:{게임 날짜}   HASH  fish/gather/auto(오늘 잡은 수 — 보여 주기만, 11/19 한도 없음) (2일).
//                                예전 fishP/gatherP/dexP(판 포인트, 한도용)는 11/19부터 쓰지 않는다
//  - forage:{a}:tk:{b}      SET   11/16 창 TOOK_BUCKET개(10분 × 3 = 30분)를 한 키로: `${창}:${지점 id}` (40분).
//                                창을 15분 → 10분으로 줄이며 창마다 키를 만들지 않게 묶었다 (예전 took:{창} = 15분마다 한 키·2시간)
//                                11/22 긴급 의뢰 5분 창(음수 id — lib/forage/rules nodeBloomRule)도 자기가 든 10분 창의 키에 같이 (키·읽기가 늘지 않는다)
//  - forage:{a}:auto        STRING 자동 낚시 세션 JSON (lib/forage/auto.ts, 바꿀 때는 이전 값과 같을 때만 = 비교 후 교체)

export type ClaimResult = { status: "ok"; payload: string } | { status: "reused" | "stale" };
/** grade = 11/22 크기 등급 (직접 낚은 물고기만 — 가방은 등급 칸에, 도감은 종 id에. grantAuto는 보지 않는다) */
export type GrantItem = { id: string; size: number; grade?: FishGrade };
/** 별자리 도감 등록 한 건 */
export type StarDexItem = { id: string; perfect: boolean };
/** 11/16 몬스터 도감에 더할 처치 한 건 (id = 몬스터, n = 이번 판 처치 수) */
export type MobKillItem = { id: string; n: number };
export type Granted = { id: string; size: number; kept: boolean; isNew: boolean; record: boolean; rest?: boolean; grade?: FishGrade };
/** 도감 보상 장부 (forage:{a}:dexpay). marks = 붙은 칭호 표시 (`${cat}:${50|100}`) */
export type DexPay = {
  settled: string | null;
  pending: Partial<Record<DexCat, number>>;
  paid: Partial<Record<DexCat, number>>;
  marks: string[];
};
export type Snapshot = {
  bag: Record<string, number>;
  dex: Record<string, DexEntry>;
  claims: Record<string, string>;
  pay: DexPay;
  day: LifeDay;
  /** 11/22 이번 묶음 키의 캔 자리 기록 그대로 (`${창}:${지점}` — 지점마다 어느 창을 볼지는 규칙이 정한다: lib/forage/rules takenNow) */
  took: string[];
};
export type DayField = keyof LifeDay;

const USED_TTL_SEC = 86_400;
const DAY_TTL_SEC = 2 * 86_400;
/** 11/16 캔 지점 키 하나에 묶는 창 수 (10분 창 × 3 = 30분에 키 하나 — 예전 15분 창마다 하나보다 적다) */
export const TOOK_BUCKET = 3;
/** 묶음 키 보관: 묶음(30분)이 끝나고 진행 중인 채집(최대 2분 반)까지 넉넉히 */
export const TOOK_TTL_SEC = 40 * 60;
/** 묶음 키 멤버 (`${창}:${지점}`) 중 글자만 */
const tookOf = (members: Iterable<unknown>): string[] => [...members].filter((m): m is string => typeof m === "string");
/** 자동 낚시 세션 보관 (켜 둔 채 떠나도 다음 날 돌아와 정산할 수 있게) */
export const AUTO_TTL_SEC = 2 * 86_400;

export interface ForageStore {
  /** 가방·도감·보상·오늘 기록·이번 창에 캔 지점 */
  snapshot(acct: string, day: string, window: number): Promise<Snapshot>;
  /** 오늘 기록과 이번 묶음의 캔 자리 기록만 (시작 확인용 — 가방·도감을 읽지 않는다, 명령 2개). window = 10분 창 (5분 창 id여도 같은 키) */
  today(acct: string, day: string, window: number): Promise<Pick<Snapshot, "day" | "took">>;
  /** 남의 도감 구경용 (가방·오늘 기록 없이) */
  dex(acct: string): Promise<{ dex: Record<string, DexEntry>; claims: Record<string, string>; pay: DexPay }>;
  /** 도감 기록만 (입장 배지용 — 보상·지급 기록은 읽지 않는다, 명령 1개) */
  dexEntries(acct: string): Promise<Record<string, DexEntry>>;
  /** 시간당 시작 수를 세고(한도면 false) 진행 기록을 남긴다 (이전 진행은 버려진다) */
  /** 시작 기록. 시간 한도에 걸리면 false, 끝내지 않은 낚시를 덮어썼으면 "replacedFish" (11/18) */
  begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number): Promise<boolean | "replacedFish">;
  /** 끝내기: 처음 내는 티켓이고 지금 진행 중인 기록이어야 ok (기록을 지우고 돌려준다) */
  claim(acct: string, nonce: string): Promise<ClaimResult>;
  /**
   * 잡은 것 넣기 (원자적): take가 있으면 먼저 그 창의 지점을 캔 것으로 표시하고(이미 캤으면 아무것도 하지 않고 null),
   * 오늘 잡은 수(count 칸)를 items 수만큼 올리고, 가방(한 칸 stackMax까지, 11/19 전체 BAG_MAX까지)과 도감(수·최대 크기·처음 날)을 바꾼다.
   * 처음 등록이면 정산을 마친 계정에 한해 그 종의 보상(dexRewardOf)을 받을 도감 보상(p:{cat})에 쌓는다 (grantAuto·addStars도 같다)
   */
  grant(
    acct: string,
    day: string,
    count: "fish" | "gather",
    items: GrantItem[],
    stackMax: number,
    take?: { window: number; node: string },
    /** 11/18 오늘의 할 일 진행 (lib/retainQuest — 하나라도 들어가면 같은 스크립트에서 +1, 올린 값은 quest.have) */
    quest?: QuestHook | null,
  ): Promise<Granted[] | null>;
  /** 가방에서 꺼내기 (가방 칸 id 그대로 — 전부 있을 때만, 한 번에). 모자라면 false */
  remove(acct: string, items: Record<string, number>): Promise<boolean>;
  /** 가방에 되돌리기 (한 칸 stackMax까지) */
  restore(acct: string, items: Record<string, number>, stackMax: number): Promise<void>;
  /** 오늘 잡은 수에 더하기 (물에 빠진 꾸미기를 건졌을 때처럼 grant를 거치지 않는 낚시) */
  addDay(acct: string, day: string, field: DayField, n: number): Promise<void>;
  /** 예전 단계 보상 받음 표시 (한 번만 true). 지금은 서비스가 쓰지 않는다 — 옛 기록을 만드는 시험용으로만 남겨 둔다 */
  claimDex(acct: string, key: string, day: string): Promise<boolean>;
  /** 도감 보상 장부만 */
  dexPay(acct: string): Promise<DexPay>;
  /**
   * 전환 정산 (원자적, 계정당 한 번): 칸마다 (지금 등록된 종의 보상 합 − 그 칸에서 받은 예전 단계 보상 합)이 양수면
   * 받을 도감 보상에 더하고 정산 표시를 남긴다. 칸별로 더한 값(음수는 0)을 돌려준다. 이미 정산했으면 null
   */
  settleDex(acct: string, day: string): Promise<Partial<Record<DexCat, number>> | null>;
  /** 받을 도감 보상에서 max까지 꺼내기 (원자적, 꺼낸 값). 동시에 꺼내도 합이 쌓인 값을 넘지 않는다 */
  takeDexPending(acct: string, cat: DexCat, max: number): Promise<number>;
  /** 꺼낸 것 중 실제로 지갑에 들어간 earned는 받은 기록(g)에, 못 들어간 나머지(taken − earned)는 받을 보상(p)에 되돌린다 */
  dexPaid(acct: string, cat: DexCat, taken: number, earned: number): Promise<void>;
  /** 칭호 붙음 표시 (이미 있으면 그대로) */
  markDexTitles(acct: string, keys: string[], day: string): Promise<void>;
  /**
   * 별자리 도감 등록 (원자적, 가방·오늘 잡은 수와 무관): 항목마다 완성 횟수 +1, 처음이면 그날을 남기고, perfect면 완벽 횟수 +1.
   * 돌려주는 값은 항목마다 처음 등록인지
   */
  addStars(acct: string, day: string, items: StarDexItem[]): Promise<boolean[]>;
  /**
   * 11/16 몬스터 도감에 한 판 처치 수 더하기 (원자적, 한 번에): 항목마다 n:{id} += n, 처음이면 그날을 남기고 정산한 계정이면 p:mob에 보상을 쌓는다.
   * 돌려주는 값은 항목마다 처음 등록인지
   */
  addKills(acct: string, day: string, items: MobKillItem[]): Promise<boolean[]>;
  /** 자동 낚시 세션 (없으면 null) */
  autoGet(acct: string): Promise<string | null>;
  /** 비교 후 교체 (원자적): 지금 값이 expected(null = 없음)와 같을 때만 next(null = 지움)로 바꾸고 true */
  autoSwap(acct: string, expected: string | null, next: string | null): Promise<boolean>;
  /**
   * 자동 낚시로 낚은 것 넣기 (원자적): 전부 넣고 오늘 fish·auto를 그만큼 올린다 (11/19 하루 한도 없음).
   * 도감은 수·처음 날·최대 크기까지 (최대어 순위는 여기서 다루지 않는다 — 직접 낚은 것만 service가 올린다).
   * id가 "@"로 시작하면(물에 빠진 꾸미기 자리) 낚은 수만 세고 가방·도감은 건드리지 않는다.
   * 11/19 가방이 BAG_MAX만큼 차 있으면 그 뒤로는 쉰다 (rest: 아무것도 세지 않고 가방·도감도 그대로)
   */
  grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number): Promise<Granted[]>;
}

export const lk = {
  bag: (a: string) => `forage:${a}:bag`,
  dex: (a: string) => `forage:${a}:dex`,
  claims: (a: string) => `forage:${a}:claims`,
  active: (a: string) => `forage:${a}:active`,
  used: (a: string, n: string) => `forage:${a}:used:${n}`,
  hour: (a: string, h: string) => `forage:${a}:hour:${h}`,
  day: (a: string, d: string) => `forage:${a}:day:${d}`,
  /** 창 w가 든 묶음 키 (10분 창 TOOK_BUCKET개마다 하나 — 11/22 5분 창은 자기가 든 10분 창의 키) */
  took: (a: string, w: number) => `forage:${a}:tk:${Math.floor(nodeBaseWindow(w) / TOOK_BUCKET)}`,
  auto: (a: string) => `forage:${a}:auto`,
  pay: (a: string) => `forage:${a}:dexpay`,
};

/** 정산에 쓰는 예전 단계 보상 표 (claims 키 → 칸·포인트) */
const LEGACY_TIER_TABLE = DEX_CATS.flatMap((cat) => DEX_TIERS.map((t) => ({ key: dexClaimKey(cat, t), cat, pts: DEX_REWARD[t] })));

/** dexpay 해시 → 장부 */
export function payFromHash(h: Record<string, string>): DexPay {
  const out: DexPay = { settled: h.settled ?? null, pending: {}, paid: {}, marks: [] };
  for (const [k, v] of Object.entries(h)) {
    if (k.startsWith("t:")) out.marks.push(k.slice(2));
    else if (k.startsWith("p:") || k.startsWith("g:")) {
      const n = Number(v) || 0;
      if (n > 0) (k[0] === "p" ? out.pending : out.paid)[k.slice(2) as DexCat] = n;
    }
  }
  out.marks.sort();
  return out;
}

/** 메모리·Redis 공통 정산 계산 (등록 여부·받은 단계 → 칸별 더할 값) */
export function settleAmounts(has: (id: string) => boolean, claimed: (key: string) => boolean): Record<DexCat, number> {
  const owed = Object.fromEntries(DEX_CATS.map((c) => [c, 0])) as Record<DexCat, number>;
  for (const r of DEX_REWARD_TABLE) if (has(r.id)) owed[r.cat] += r.pts;
  for (const t of LEGACY_TIER_TABLE) if (claimed(t.key)) owed[t.cat] -= t.pts;
  for (const c of DEX_CATS) owed[c] = Math.max(0, owed[c]);
  return owed;
}

const emptyDay = (): LifeDay => ({ fish: 0, gather: 0, auto: 0 });

/** dex 해시(n:/max:/first: 필드) → 칸별 기록 */
export function dexFromHash(h: Record<string, string>): Record<string, DexEntry> {
  const out: Record<string, DexEntry> = {};
  for (const [k, v] of Object.entries(h)) {
    const i = k.indexOf(":");
    if (i <= 0) continue;
    const f = k.slice(0, i);
    const id = k.slice(i + 1);
    const e = (out[id] ??= { n: 0, max: 0, first: "" });
    if (f === "n") e.n = Number(v) || 0;
    else if (f === "max") e.max = Number(v) || 0;
    else if (f === "first") e.first = v;
    else if (f === "pf") e.pf = Number(v) || 0;
  }
  for (const [id, e] of Object.entries(out)) if (e.n <= 0) delete out[id];
  return out;
}

function dayFromHash(h: Record<string, string>): LifeDay {
  const d = emptyDay();
  for (const k of Object.keys(d) as DayField[]) d[k] = Number(h[k] ?? 0) || 0;
  return d;
}

// ── 메모리 (로컬·테스트). await 없이 끝나는 구간이라 이벤트 루프 안에서 원자적이다 ──

type Acct = {
  bag: Map<string, number>;
  dex: Map<string, string>;
  claims: Map<string, string>;
  /** dexpay 해시와 같은 필드 */
  pay: Map<string, string>;
  active: { value: string; until: number } | null;
};

export class MemoryForageStore implements ForageStore {
  private accts = new Map<string, Acct>();
  private used = new Map<string, number>();
  private hours = new Map<string, number>();
  private days = new Map<string, LifeDay>();
  private took = new Map<string, Set<string>>();
  private autos = new Map<string, string>();

  private acct(a: string): Acct {
    let x = this.accts.get(a);
    if (!x) this.accts.set(a, (x = { bag: new Map(), dex: new Map(), claims: new Map(), pay: new Map(), active: null }));
    // HMR로 옛 모양의 계정이 남아 있을 수 있다
    x.pay ??= new Map();
    return x;
  }

  /** 처음 등록 보상 쌓기 (정산을 마친 계정만) */
  private credit(a: Acct, id: string) {
    if (!a.pay.has("settled")) return;
    const pts = dexRewardOf(id);
    const cat = dexCatOf(id);
    if (!pts || !cat) return;
    a.pay.set(`p:${cat}`, String(Number(a.pay.get(`p:${cat}`) ?? 0) + pts));
  }

  async snapshot(acct: string, day: string, window: number) {
    const a = this.acct(acct);
    return {
      bag: Object.fromEntries([...a.bag].filter(([, n]) => n > 0)),
      dex: dexFromHash(Object.fromEntries(a.dex)),
      claims: Object.fromEntries(a.claims),
      pay: payFromHash(Object.fromEntries(a.pay)),
      day: { ...(this.days.get(lk.day(acct, day)) ?? emptyDay()) },
      took: tookOf(this.took.get(lk.took(acct, window)) ?? []),
    };
  }

  async today(acct: string, day: string, window: number) {
    return { day: { ...(this.days.get(lk.day(acct, day)) ?? emptyDay()) }, took: tookOf(this.took.get(lk.took(acct, window)) ?? []) };
  }

  async dex(acct: string) {
    const a = this.acct(acct);
    return { dex: dexFromHash(Object.fromEntries(a.dex)), claims: Object.fromEntries(a.claims), pay: payFromHash(Object.fromEntries(a.pay)) };
  }

  async dexEntries(acct: string) {
    return dexFromHash(Object.fromEntries(this.acct(acct).dex));
  }

  async begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number) {
    const k = lk.hour(acct, hour);
    const n = (this.hours.get(k) ?? 0) + 1;
    this.hours.set(k, n);
    if (n > perHour) return false;
    const prev = this.acct(acct).active;
    this.acct(acct).active = { value: `${nonce}|${payload}`, until: Date.now() + ttlSec * 1000 };
    if (prev && prev.until > Date.now() && prev.value.includes(FISH_MARK)) return "replacedFish" as const;
    return true;
  }

  async claim(acct: string, nonce: string): Promise<ClaimResult> {
    const k = lk.used(acct, nonce);
    if (this.used.has(k)) return { status: "reused" };
    this.used.set(k, Date.now());
    const a = this.acct(acct);
    const v = a.active;
    if (!v || v.until < Date.now() || !v.value.startsWith(`${nonce}|`)) return { status: "stale" };
    a.active = null;
    return { status: "ok", payload: v.value.slice(nonce.length + 1) };
  }

  async grant(acct: string, day: string, count: "fish" | "gather", items: GrantItem[], stackMax: number, take?: { window: number; node: string }, quest?: QuestHook | null) {
    if (take) {
      const k = lk.took(acct, take.window);
      let s = this.took.get(k);
      if (!s) this.took.set(k, (s = new Set()));
      const m = tookMember(take.window, take.node);
      if (s.has(m)) return null;
      s.add(m);
    }
    if (quest && items.length) quest.have = quest.local(1);
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    d[count] += items.length;
    this.days.set(dk, d);
    const a = this.acct(acct);
    let total = [...a.bag.values()].reduce((n, v) => n + v, 0);
    return items.map(({ id, size, grade = 0 }) => {
      // 11/22 대물·월척은 가방의 등급 칸에 (도감은 종 id 그대로)
      const bid = bagIdOf(id, grade);
      const have = a.bag.get(bid) ?? 0;
      const kept = have < stackMax && total < BAG_MAX;
      if (kept) {
        a.bag.set(bid, have + 1);
        total++;
      }
      const n = Number(a.dex.get(`n:${id}`) ?? 0) + 1;
      a.dex.set(`n:${id}`, String(n));
      const isNew = n === 1;
      if (isNew) {
        a.dex.set(`first:${id}`, day);
        this.credit(a, id);
      }
      let record = false;
      if (size > 0) {
        const old = Number(a.dex.get(`max:${id}`) ?? 0);
        if (size > old) {
          a.dex.set(`max:${id}`, String(size));
          record = old > 0;
        }
      }
      return { id, size, kept, isNew, record, ...(grade > 0 ? { grade } : {}) };
    });
  }

  async remove(acct: string, items: Record<string, number>) {
    return this.removeNow(acct, items);
  }

  /** remove의 동기판 (수집 의뢰 메모리 저장소가 납품과 한 번에 부른다) */
  removeNow(acct: string, items: Record<string, number>): boolean {
    const a = this.acct(acct);
    for (const [id, n] of Object.entries(items)) if ((a.bag.get(id) ?? 0) < n) return false;
    for (const [id, n] of Object.entries(items)) {
      const left = (a.bag.get(id) ?? 0) - n;
      if (left > 0) a.bag.set(id, left);
      else a.bag.delete(id);
    }
    return true;
  }

  /**
   * 11/22 종 단위로 꺼내기 (동기 — 수집·긴급 의뢰 메모리 저장소가 납품과 한 번에 부른다): 그 종의 보통 → 대물 → 월척 칸 차례로 (catalog takePlan).
   * 모자라면 아무것도 빼지 않고 false (Redis는 BAG_TAKE_LUA가 같은 차례)
   */
  takeSpeciesNow(acct: string, items: Record<string, number>): boolean {
    const plan = takePlan(Object.fromEntries(this.acct(acct).bag), items);
    return !!plan && this.removeNow(acct, plan);
  }

  /** 가방의 그 칸 수 (동기 — 긴급 의뢰 메모리 저장소가 받기와 한 번에 본다) */
  bagNow(acct: string, id: string): number {
    return this.acct(acct).bag.get(id) ?? 0;
  }

  /** 11/16 도감에 한 마리 적기 (동기 — 긴급 의뢰 주머니 물고기). onlyNew면 이미 있을 때 그대로. 처음 등록이면 true */
  dexNow(acct: string, id: string, day: string, size: number, onlyNew: boolean): boolean {
    const a = this.acct(acct);
    const had = Number(a.dex.get(`n:${id}`) ?? 0);
    if (onlyNew && had > 0) return false;
    a.dex.set(`n:${id}`, String(had + 1));
    if (had === 0) {
      a.dex.set(`first:${id}`, day);
      this.credit(a, id);
    }
    if (size > Number(a.dex.get(`max:${id}`) ?? 0)) a.dex.set(`max:${id}`, String(size));
    return had === 0;
  }

  /** 가방에 더하기 (동기, 칸 상한은 부르는 쪽이 본다 — 긴급 의뢰 상자 물고기) */
  giveNow(acct: string, id: string, n: number): void {
    const a = this.acct(acct);
    a.bag.set(id, (a.bag.get(id) ?? 0) + n);
  }

  async restore(acct: string, items: Record<string, number>, stackMax: number) {
    const a = this.acct(acct);
    for (const [id, n] of Object.entries(items)) {
      const have = a.bag.get(id) ?? 0;
      const add = Math.min(n, stackMax - have);
      if (add > 0) a.bag.set(id, have + add);
    }
  }

  async addDay(acct: string, day: string, field: DayField, n: number) {
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    d[field] += n;
    this.days.set(dk, d);
  }

  async claimDex(acct: string, key: string, day: string) {
    const a = this.acct(acct);
    if (a.claims.has(key)) return false;
    a.claims.set(key, day);
    return true;
  }

  async dexPay(acct: string) {
    return payFromHash(Object.fromEntries(this.acct(acct).pay));
  }

  async settleDex(acct: string, day: string) {
    const a = this.acct(acct);
    if (a.pay.has("settled")) return null;
    const owed = settleAmounts(
      (id) => Number(a.dex.get(`n:${id}`) ?? 0) > 0,
      (key) => a.claims.has(key),
    );
    for (const [cat, n] of Object.entries(owed)) if (n > 0) a.pay.set(`p:${cat}`, String(Number(a.pay.get(`p:${cat}`) ?? 0) + n));
    a.pay.set("settled", day);
    return owed;
  }

  async takeDexPending(acct: string, cat: DexCat, max: number) {
    const a = this.acct(acct);
    const have = Number(a.pay.get(`p:${cat}`) ?? 0);
    const take = Math.max(0, Math.min(have, Math.floor(max)));
    if (take > 0) a.pay.set(`p:${cat}`, String(have - take));
    return take;
  }

  async dexPaid(acct: string, cat: DexCat, taken: number, earned: number) {
    const a = this.acct(acct);
    const back = taken - earned;
    if (back > 0) a.pay.set(`p:${cat}`, String(Number(a.pay.get(`p:${cat}`) ?? 0) + back));
    if (earned > 0) a.pay.set(`g:${cat}`, String(Number(a.pay.get(`g:${cat}`) ?? 0) + earned));
  }

  async markDexTitles(acct: string, keys: string[], day: string) {
    const a = this.acct(acct);
    for (const k of keys) if (!a.pay.has(`t:${k}`)) a.pay.set(`t:${k}`, day);
  }

  async addStars(acct: string, day: string, items: StarDexItem[]) {
    const a = this.acct(acct);
    return items.map(({ id, perfect }) => {
      const n = Number(a.dex.get(`n:${id}`) ?? 0) + 1;
      a.dex.set(`n:${id}`, String(n));
      if (n === 1) {
        a.dex.set(`first:${id}`, day);
        this.credit(a, id);
      }
      if (perfect) a.dex.set(`pf:${id}`, String(Number(a.dex.get(`pf:${id}`) ?? 0) + 1));
      return n === 1;
    });
  }

  async addKills(acct: string, day: string, items: MobKillItem[]) {
    const a = this.acct(acct);
    return items.map(({ id, n: add }) => {
      if (!Number.isInteger(add) || add <= 0) return false;
      const before = Number(a.dex.get(`n:${id}`) ?? 0);
      a.dex.set(`n:${id}`, String(before + add));
      const isNew = before === 0;
      if (isNew) {
        a.dex.set(`first:${id}`, day);
        this.credit(a, id);
      }
      return isNew;
    });
  }

  async autoGet(acct: string) {
    return this.autos.get(acct) ?? null;
  }

  async autoSwap(acct: string, expected: string | null, next: string | null) {
    if ((this.autos.get(acct) ?? null) !== expected) return false;
    if (next === null) this.autos.delete(acct);
    else this.autos.set(acct, next);
    return true;
  }

  async grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number) {
    const dk = lk.day(acct, day);
    const d = this.days.get(dk) ?? emptyDay();
    const a = this.acct(acct);
    let total = [...a.bag.values()].reduce((n, v) => n + v, 0);
    const out = items.map(({ id, size }) => {
      // 11/19 가방이 차 있으면 쉰다 (세지도 넣지도 않는다)
      if (total >= BAG_MAX) return { id, size, kept: false, isNew: false, record: false, rest: true };
      d.fish++;
      d.auto++;
      if (id.startsWith("@")) return { id, size, kept: false, isNew: false, record: false };
      const have = a.bag.get(id) ?? 0;
      const kept = have < stackMax;
      if (kept) {
        a.bag.set(id, have + 1);
        total++;
      }
      const n = Number(a.dex.get(`n:${id}`) ?? 0) + 1;
      a.dex.set(`n:${id}`, String(n));
      if (n === 1) {
        a.dex.set(`first:${id}`, day);
        this.credit(a, id);
      }
      // 크기는 내 도감의 최대 기록에만 (최대어 순위는 service가 직접 낚은 것만 올린다)
      let record = false;
      if (size > 0) {
        const old = Number(a.dex.get(`max:${id}`) ?? 0);
        if (size > old) {
          a.dex.set(`max:${id}`, String(size));
          record = old > 0;
        }
      }
      return { id, size, kept, isNew: n === 1, record };
    });
    this.days.set(dk, d);
    return out;
  }
}

// ── Redis (운영) ──

/** automaticDeserialization을 끈 클라이언트의 HGETALL은 [필드, 값, ...] 배열이다 (객체로 오는 경우도 받는다) */
function hashOf(flat: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(flat)) for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = String(flat[i + 1]);
  else if (flat && typeof flat === "object") for (const [k, v] of Object.entries(flat)) out[k] = String(v);
  return out;
}

// KEYS: hour, active  ARGV: nonce|payload, ttl, perHour
// 11/18 보안: 끝내지 않은 낚시(찌)를 덮어쓰면 2 (서비스가 오늘 낚시 1번으로 센다 — 그림자만 보고 다시 던지며 큰 것 고르기 막기)
/** 진행 기록 값에 낚시 판이 실려 있는지 (payload JSON 앞부분 — castLine의 FishPayload) */
export const FISH_MARK = '"k":"fish"';

export const BEGIN_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
if n > tonumber(ARGV[3]) then return 0 end
local prev = redis.call('GET', KEYS[2])
redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[2]))
if prev and string.find(prev, '${FISH_MARK}', 1, true) then return 2 end
return 1
`;

// KEYS: used, active  ARGV: nonce, usedTtl
// 진행 기록 값은 "nonce|payload" — 접두어로 같은 판인지 본다 (cjson 없이)
export const CLAIM_LUA = `
if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', tonumber(ARGV[2])) then return 'reused' end
local v = redis.call('GET', KEYS[2])
if not v then return 'stale' end
local p = ARGV[1] .. '|'
if string.sub(v, 1, string.len(p)) ~= p then return 'stale' end
redis.call('DEL', KEYS[2])
return v
`;

// KEYS: bag, dex, day, took, dexpay, [11/18 오늘 적립 해시 — 오늘의 할 일]  ARGV: day, countField, take('1'/'0'), `${창}:${지점}`, tookTtl, dayTtl, stackMax, 개수, (id, size, cat, 보상)...
// 돌려주는 값: 'taken' 또는 아이템마다 "id:{kept}{isNew}{record}" (각 0/1). 처음 등록이면 정산한 계정만 p:{cat}에 보상을 쌓는다
// 11/19 가방 전체가 BAG_MAX만큼 차 있으면 넣지 않는다 (kept 0, 도감에는 남는다). 가방 칸은 많아야 수십 개라 HVALS 한 번이 가볍다
export const GRANT_LUA = `
local settled = redis.call('HEXISTS', KEYS[5], 'settled') == 1
if ARGV[3] == '1' then
  if redis.call('SADD', KEYS[4], ARGV[4]) == 0 then return 'taken' end
  redis.call('EXPIRE', KEYS[4], tonumber(ARGV[5]))
end
redis.call('HINCRBY', KEYS[3], ARGV[2], tonumber(ARGV[8]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[6]))
local stackMax = tonumber(ARGV[7])
local total = 0
for _, v in ipairs(redis.call('HVALS', KEYS[1])) do total = total + tonumber(v) end
local out = {}
-- 11/18 오늘 미션 (KEYS[6] = 오늘 적립 해시가 있을 때만): 하나라도 들어가면 그 미션 칸 +1, 값은 맨 뒤 '#q:{값}'.
-- 11/19 칸 이름은 아이템 뒤 ARGV[9 + 4n] (바닷가·캠핑장 미션 _q:seaFish 등 — 예전엔 _q:fish·_q:gather로 고정돼 그 미션이 안 채워졌다)
local n = tonumber(ARGV[8])
local q = nil
if KEYS[6] and n > 0 then
  local field = ARGV[9 + 4 * n]
  if not field or field == '' then field = '_q:' .. ARGV[2] end
  q = redis.call('HINCRBY', KEYS[6], field, 1)
  if q == 1 then redis.call('EXPIRE', KEYS[6], tonumber(ARGV[6])) end
end
for i = 9, 8 + 4 * n, 4 do
  local id = ARGV[i]
  -- 11/22 id는 가방 칸 (대물·월척이면 '~1'·'~2'가 붙는다). 도감은 꼬리를 뗀 종 id로
  local sp = (string.gsub(id, '~%d$', ''))
  local size = tonumber(ARGV[i + 1])
  local kept = '0'
  if total < ${BAG_MAX} and tonumber(redis.call('HGET', KEYS[1], id) or '0') < stackMax then
    redis.call('HINCRBY', KEYS[1], id, 1)
    total = total + 1
    kept = '1'
  end
  local isNew = '0'
  if redis.call('HINCRBY', KEYS[2], 'n:' .. sp, 1) == 1 then
    isNew = '1'
    redis.call('HSET', KEYS[2], 'first:' .. sp, ARGV[1])
    local pts = tonumber(ARGV[i + 3])
    if settled and pts > 0 then redis.call('HINCRBY', KEYS[5], 'p:' .. ARGV[i + 2], pts) end
  end
  local rec = '0'
  if size > 0 then
    local old = tonumber(redis.call('HGET', KEYS[2], 'max:' .. sp) or '0')
    if size > old then
      redis.call('HSET', KEYS[2], 'max:' .. sp, ARGV[i + 1])
      if old > 0 then rec = '1' end
    end
  end
  out[#out + 1] = id .. ':' .. kept .. isNew .. rec
end
if q then out[#out + 1] = '#q:' .. q end
return out
`;

// KEYS: bag  ARGV: (id, n)...  전부 있을 때만 한 번에 뺀다 (0이 되면 칸을 지운다)
export const REMOVE_LUA = `
for i = 1, #ARGV, 2 do
  if tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0') < tonumber(ARGV[i + 1]) then return 0 end
end
for i = 1, #ARGV, 2 do
  if redis.call('HINCRBY', KEYS[1], ARGV[i], -tonumber(ARGV[i + 1])) <= 0 then redis.call('HDEL', KEYS[1], ARGV[i]) end
end
return 1
`;

/**
 * 11/22 종 단위로 가방에서 꺼내는 Lua 함수 (수집 의뢰 DELIVER_LUA·긴급 의뢰 URGENT_DELIVER_LUA 맨 앞에 붙인다).
 * bagHave(가방 키, 종) = 보통·대물·월척 칸 합 (HMGET 한 번), bagTake(가방 키, 종, 개수) = 보통 → 대물 → 월척 차례로 뺀다 (catalog takePlan과 같은 차례).
 * 부르는 쪽이 먼저 bagHave로 다 있는지 본 뒤 bagTake를 부른다
 */
export const BAG_TAKE_LUA = `
local function bagCells(bag, sp)
  local v = redis.call('HMGET', bag, sp, sp .. '~1', sp .. '~2')
  return {tonumber(v[1] or '0'), tonumber(v[2] or '0'), tonumber(v[3] or '0')}
end
local function bagHave(bag, sp)
  local c = bagCells(bag, sp)
  return c[1] + c[2] + c[3]
end
local function bagTake(bag, sp, n)
  local c = bagCells(bag, sp)
  local ks = {sp, sp .. '~1', sp .. '~2'}
  for j = 1, 3 do
    local t = math.min(n, c[j])
    if t > 0 then
      if redis.call('HINCRBY', bag, ks[j], -t) <= 0 then redis.call('HDEL', bag, ks[j]) end
      n = n - t
    end
  end
end
`;

// KEYS: bag  ARGV: stackMax, (id, n)...  한 칸 stackMax까지만 되돌린다
export const RESTORE_LUA = `
local stackMax = tonumber(ARGV[1])
for i = 2, #ARGV, 2 do
  local have = tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0')
  local add = math.min(tonumber(ARGV[i + 1]), stackMax - have)
  if add > 0 then redis.call('HINCRBY', KEYS[1], ARGV[i], add) end
end
return 1
`;

// KEYS: auto  ARGV: expected('' = 없음), next('' = 지움), ttl
export const AUTO_SWAP_LUA = `
local cur = redis.call('GET', KEYS[1])
if ARGV[1] == '' then
  if cur then return 0 end
elseif cur ~= ARGV[1] then
  return 0
end
if ARGV[2] == '' then redis.call('DEL', KEYS[1]) else redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3])) end
return 1
`;

// KEYS: bag, dex, day, dexpay  ARGV: day, stackMax, dayTtl, (id, size, cat, 보상)...
// 전부 넣는다 (11/19 하루 한도를 없애며 오늘 수를 읽던 HGET 2번을 뺐다). 돌려주는 값: 넣은 아이템마다 "id:{kept}{isNew}{record}"
// (도감 최대 크기도 GRANT_LUA처럼 기록한다. 최대어 순위에는 넣지 않는다 — 그건 직접 낚은 것만). "@"로 시작하는 id(물에 빠진 꾸미기 자리)는 수만 센다 → "id:0000"
// 11/19 가방 전체가 BAG_MAX만큼 차 있으면 그 뒤로는 쉰다 → "id:0001" (오늘 수·가방·도감 모두 그대로)
// 처음 등록 보상은 GRANT_LUA와 같다 (정산한 계정만 p:{cat}에)
export const GRANT_AUTO_LUA = `
local settled = redis.call('HEXISTS', KEYS[4], 'settled') == 1
local room = (#ARGV - 3) / 4
local out = {}
if room <= 0 then return out end
local total = 0
for _, v in ipairs(redis.call('HVALS', KEYS[1])) do total = total + tonumber(v) end
local stackMax = tonumber(ARGV[2])
local counted = 0
for j = 0, room - 1 do
  local id = ARGV[4 + j * 4]
  local kept = '0'
  local isNew = '0'
  local rec = '0'
  local rest = '0'
  if total >= ${BAG_MAX} then
    rest = '1'
  else
    counted = counted + 1
  end
  if rest == '0' and string.sub(id, 1, 1) ~= '@' then
    if tonumber(redis.call('HGET', KEYS[1], id) or '0') < stackMax then
      redis.call('HINCRBY', KEYS[1], id, 1)
      total = total + 1
      kept = '1'
    end
    if redis.call('HINCRBY', KEYS[2], 'n:' .. id, 1) == 1 then
      isNew = '1'
      redis.call('HSET', KEYS[2], 'first:' .. id, ARGV[1])
      local pts = tonumber(ARGV[7 + j * 4])
      if settled and pts > 0 then redis.call('HINCRBY', KEYS[4], 'p:' .. ARGV[6 + j * 4], pts) end
    end
    local size = tonumber(ARGV[5 + j * 4])
    if size > 0 then
      local old = tonumber(redis.call('HGET', KEYS[2], 'max:' .. id) or '0')
      if size > old then
        redis.call('HSET', KEYS[2], 'max:' .. id, ARGV[5 + j * 4])
        if old > 0 then rec = '1' end
      end
    end
  end
  out[#out + 1] = id .. ':' .. kept .. isNew .. rec .. rest
end
if counted > 0 then
  redis.call('HINCRBY', KEYS[3], 'fish', counted)
  redis.call('HINCRBY', KEYS[3], 'auto', counted)
  redis.call('EXPIRE', KEYS[3], tonumber(ARGV[3]))
end
return out
`;

// KEYS: dex, dexpay  ARGV: day, (id, perfect '1'/'0', 보상)...  돌려주는 값: 항목마다 처음 등록이면 1, 아니면 0
// 처음 등록이면 정산한 계정만 p:star에 보상을 쌓는다
export const STARS_LUA = `
local settled = redis.call('HEXISTS', KEYS[2], 'settled') == 1
local out = {}
for i = 2, #ARGV, 3 do
  local id = ARGV[i]
  local n = redis.call('HINCRBY', KEYS[1], 'n:' .. id, 1)
  if n == 1 then
    redis.call('HSET', KEYS[1], 'first:' .. id, ARGV[1])
    local pts = tonumber(ARGV[i + 2])
    if settled and pts > 0 then redis.call('HINCRBY', KEYS[2], 'p:star', pts) end
  end
  if ARGV[i + 1] == '1' then redis.call('HINCRBY', KEYS[1], 'pf:' .. id, 1) end
  out[#out + 1] = (n == 1) and 1 or 0
end
return out
`;

// KEYS: dex, dexpay  ARGV: day, (id, 처치 수, 보상)...  돌려주는 값: 항목마다 처음 등록이면 1, 아니면 0
// 11/16 몬스터 도감: 처치 수를 한 번에 더하고, 처음 등록이면 정산한 계정만 p:mob에 보상을 쌓는다
export const KILLS_LUA = `
local settled = redis.call('HEXISTS', KEYS[2], 'settled') == 1
local out = {}
for i = 2, #ARGV, 3 do
  local id = ARGV[i]
  local add = tonumber(ARGV[i + 1])
  local n = redis.call('HINCRBY', KEYS[1], 'n:' .. id, add)
  local isNew = add > 0 and n == add
  if isNew then
    redis.call('HSET', KEYS[1], 'first:' .. id, ARGV[1])
    local pts = tonumber(ARGV[i + 2])
    if settled and pts > 0 then redis.call('HINCRBY', KEYS[2], 'p:mob', pts) end
  end
  out[#out + 1] = isNew and 1 or 0
end
return out
`;

// KEYS: dex, claims, dexpay  ARGV: day, 단계 수 k, (claims 키, cat, 포인트) × k, (id, cat, 보상)...
// 전환 정산 (계정당 한 번): 칸마다 등록된 종의 보상 합 − 받은 예전 단계 보상 합. 양수만 p:{cat}에 더한다.
// 돌려주는 값: 이미 정산했으면 'done', 아니면 [cat, 더한 값(음수는 0), ...]
export const SETTLE_LUA = `
if redis.call('HEXISTS', KEYS[3], 'settled') == 1 then return 'done' end
local k = tonumber(ARGV[2])
local owed = {}
local order = {}
local i = 3 + k * 3
while i <= #ARGV do
  local cat = ARGV[i + 1]
  if owed[cat] == nil then
    owed[cat] = 0
    order[#order + 1] = cat
  end
  if tonumber(redis.call('HGET', KEYS[1], 'n:' .. ARGV[i]) or '0') > 0 then owed[cat] = owed[cat] + tonumber(ARGV[i + 2]) end
  i = i + 3
end
for j = 0, k - 1 do
  local b = 3 + j * 3
  if redis.call('HEXISTS', KEYS[2], ARGV[b]) == 1 then
    local cat = ARGV[b + 1]
    if owed[cat] == nil then
      owed[cat] = 0
      order[#order + 1] = cat
    end
    owed[cat] = owed[cat] - tonumber(ARGV[b + 2])
  end
end
redis.call('HSET', KEYS[3], 'settled', ARGV[1])
local out = {}
for _, cat in ipairs(order) do
  local n = owed[cat]
  if n < 0 then n = 0 end
  if n > 0 then redis.call('HINCRBY', KEYS[3], 'p:' .. cat, n) end
  out[#out + 1] = cat
  out[#out + 1] = tostring(n)
end
return out
`;

// KEYS: dexpay  ARGV: p:{cat}, max  받을 도감 보상에서 max까지 꺼낸다 (꺼낸 값)
export const TAKE_PENDING_LUA = `
local have = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local take = math.min(have, tonumber(ARGV[2]))
if take <= 0 then return 0 end
redis.call('HINCRBY', KEYS[1], ARGV[1], -take)
return take
`;

// KEYS: dexpay  ARGV: cat, 되돌릴 값, 받은 값  (지갑에 못 들어간 만큼 p로 되돌리고, 들어간 만큼 g에 적는다)
export const DEX_PAID_LUA = `
if tonumber(ARGV[2]) > 0 then redis.call('HINCRBY', KEYS[1], 'p:' .. ARGV[1], tonumber(ARGV[2])) end
if tonumber(ARGV[3]) > 0 then redis.call('HINCRBY', KEYS[1], 'g:' .. ARGV[1], tonumber(ARGV[3])) end
return 1
`;

/** Lua 인자: 아이템마다 (가방 칸 id, 크기, 칸, 처음 등록 보상). 11/22 대물·월척이면 가방 칸 id에 등급 꼬리 (GRANT_LUA가 도감엔 떼고 쓴다) */
function grantArgs(items: GrantItem[]): string[] {
  return items.flatMap((it) => [bagIdOf(it.id, it.grade ?? 0), String(Math.max(0, Math.round(it.size))), dexCatOf(it.id) ?? "", String(dexRewardOf(it.id))]);
}

/** GRANT_LUA 결과 한 줄 → 기록 (크기는 넘긴 값) */
export function parseGranted(lines: unknown, items: GrantItem[]): Granted[] | null {
  if (lines === "taken" || !Array.isArray(lines)) return null;
  return items.map((it, i) => {
    const s = String(lines[i] ?? "");
    const f = s.slice(s.lastIndexOf(":") + 1);
    return {
      id: it.id,
      size: it.size,
      kept: f[0] === "1",
      isNew: f[1] === "1",
      record: f[2] === "1",
      ...(f[3] === "1" ? { rest: true } : {}),
      ...(it.grade ? { grade: it.grade } : {}),
    };
  });
}

export class RedisForageStore implements ForageStore {
  private redis: Redis;

  constructor(conn: { url: string; token: string }) {
    this.redis = redisClient(conn, "forage/store");
  }

  async snapshot(acct: string, day: string, window: number) {
    const p = this.redis.pipeline();
    p.hgetall(lk.bag(acct));
    p.hgetall(lk.dex(acct));
    p.hgetall(lk.claims(acct));
    p.hgetall(lk.day(acct, day));
    p.smembers(lk.took(acct, window));
    p.hgetall(lk.pay(acct));
    const [bag, dex, claims, d, took, pay] = await p.exec<[unknown, unknown, unknown, unknown, unknown, unknown]>();
    const bagH = hashOf(bag);
    return {
      bag: Object.fromEntries(Object.entries(bagH).map(([k, v]) => [k, Number(v) || 0]).filter(([, n]) => (n as number) > 0)),
      dex: dexFromHash(hashOf(dex)),
      claims: hashOf(claims),
      pay: payFromHash(hashOf(pay)),
      day: dayFromHash(hashOf(d)),
      took: Array.isArray(took) ? tookOf(took) : [],
    };
  }

  async dex(acct: string) {
    const [dex, claims, pay] = await Promise.all([this.redis.hgetall(lk.dex(acct)), this.redis.hgetall(lk.claims(acct)), this.redis.hgetall(lk.pay(acct))]);
    return { dex: dexFromHash(hashOf(dex)), claims: hashOf(claims), pay: payFromHash(hashOf(pay)) };
  }

  async today(acct: string, day: string, window: number) {
    const p = this.redis.pipeline();
    p.hgetall(lk.day(acct, day));
    p.smembers(lk.took(acct, window));
    const [d, took] = await p.exec<[unknown, unknown]>();
    return { day: dayFromHash(hashOf(d)), took: Array.isArray(took) ? tookOf(took) : [] };
  }

  async dexEntries(acct: string) {
    return dexFromHash(hashOf(await this.redis.hgetall(lk.dex(acct))));
  }

  async begin(acct: string, nonce: string, payload: string, ttlSec: number, hour: string, perHour: number) {
    const r = Number(await this.redis.eval<string[], number>(BEGIN_LUA, [lk.hour(acct, hour), lk.active(acct)], [`${nonce}|${payload}`, String(ttlSec), String(perHour)]));
    return r === 2 ? ("replacedFish" as const) : r === 1;
  }

  async claim(acct: string, nonce: string): Promise<ClaimResult> {
    const r = String(await this.redis.eval<string[], string>(CLAIM_LUA, [lk.used(acct, nonce), lk.active(acct)], [nonce, String(USED_TTL_SEC)]));
    if (r === "reused" || r === "stale") return { status: r };
    return { status: "ok", payload: r.slice(nonce.length + 1) };
  }

  async grant(acct: string, day: string, count: "fish" | "gather", items: GrantItem[], stackMax: number, take?: { window: number; node: string }, quest?: QuestHook | null) {
    const argv = [day, count, take ? "1" : "0", take ? tookMember(take.window, take.node) : "", String(TOOK_TTL_SEC), String(DAY_TTL_SEC), String(stackMax), String(items.length), ...grantArgs(items), ...(quest ? [quest.field] : [])];
    const r = await this.redis.eval<string[], unknown>(
      GRANT_LUA,
      [lk.bag(acct), lk.dex(acct), lk.day(acct, day), lk.took(acct, take?.window ?? 0), lk.pay(acct), ...(quest ? [quest.key] : [])],
      argv,
    );
    // 11/18 맨 뒤 '#q:{값}' = 오늘의 할 일 진행 (아이템 줄과 섞이지 않게 떼어 낸다)
    if (Array.isArray(r) && String(r[r.length - 1] ?? "").startsWith("#q:")) {
      if (quest) quest.have = Number(String(r[r.length - 1]).slice(3)) || 0;
      return parseGranted(r.slice(0, -1), items);
    }
    return parseGranted(r, items);
  }

  async remove(acct: string, items: Record<string, number>) {
    const argv = Object.entries(items).flatMap(([id, n]) => [id, String(n)]);
    if (!argv.length) return true;
    return Number(await this.redis.eval<string[], number>(REMOVE_LUA, [lk.bag(acct)], argv)) === 1;
  }

  async restore(acct: string, items: Record<string, number>, stackMax: number) {
    const pairs = Object.entries(items).flatMap(([id, n]) => [id, String(n)]);
    if (!pairs.length) return;
    await this.redis.eval<string[], number>(RESTORE_LUA, [lk.bag(acct)], [String(stackMax), ...pairs]);
  }

  async addDay(acct: string, day: string, field: DayField, n: number) {
    if (!n) return;
    const k = lk.day(acct, day);
    const p = this.redis.pipeline();
    p.hincrby(k, field, n);
    p.expire(k, DAY_TTL_SEC);
    await p.exec();
  }

  async claimDex(acct: string, key: string, day: string) {
    return Number(await this.redis.hsetnx(lk.claims(acct), key, day)) === 1;
  }

  async dexPay(acct: string) {
    return payFromHash(hashOf(await this.redis.hgetall(lk.pay(acct))));
  }

  async settleDex(acct: string, day: string) {
    const argv = [day, String(LEGACY_TIER_TABLE.length)];
    for (const t of LEGACY_TIER_TABLE) argv.push(t.key, t.cat, String(t.pts));
    for (const r of DEX_REWARD_TABLE) argv.push(r.id, r.cat, String(r.pts));
    const r = await this.redis.eval<string[], unknown>(SETTLE_LUA, [lk.dex(acct), lk.claims(acct), lk.pay(acct)], argv);
    if (!Array.isArray(r)) return null;
    const out: Partial<Record<DexCat, number>> = {};
    for (let i = 0; i + 1 < r.length; i += 2) out[String(r[i]) as DexCat] = Number(r[i + 1]) || 0;
    return out;
  }

  async takeDexPending(acct: string, cat: DexCat, max: number) {
    const m = Math.floor(max);
    if (!(m > 0)) return 0;
    return Number(await this.redis.eval<string[], number>(TAKE_PENDING_LUA, [lk.pay(acct)], [`p:${cat}`, String(Math.min(m, 1e12))])) || 0;
  }

  async dexPaid(acct: string, cat: DexCat, taken: number, earned: number) {
    const back = Math.max(0, taken - earned);
    if (!back && !(earned > 0)) return;
    await this.redis.eval<string[], number>(DEX_PAID_LUA, [lk.pay(acct)], [cat, String(back), String(Math.max(0, earned))]);
  }

  async markDexTitles(acct: string, keys: string[], day: string) {
    if (!keys.length) return;
    const p = this.redis.pipeline();
    for (const k of keys) p.hsetnx(lk.pay(acct), `t:${k}`, day);
    await p.exec();
  }

  async addStars(acct: string, day: string, items: StarDexItem[]) {
    if (!items.length) return [];
    const argv = [day, ...items.flatMap((it) => [it.id, it.perfect ? "1" : "0", String(dexRewardOf(it.id))])];
    const r = await this.redis.eval<string[], unknown>(STARS_LUA, [lk.dex(acct), lk.pay(acct)], argv);
    return items.map((_, i) => Array.isArray(r) && Number(r[i]) === 1);
  }

  async addKills(acct: string, day: string, items: MobKillItem[]) {
    const list = items.filter((it) => Number.isInteger(it.n) && it.n > 0);
    if (!list.length) return items.map(() => false);
    const argv = [day, ...list.flatMap((it) => [it.id, String(it.n), String(dexRewardOf(it.id))])];
    const r = await this.redis.eval<string[], unknown>(KILLS_LUA, [lk.dex(acct), lk.pay(acct)], argv);
    let k = 0;
    return items.map((it) => (Number.isInteger(it.n) && it.n > 0 ? Array.isArray(r) && Number(r[k++]) === 1 : false));
  }

  async autoGet(acct: string) {
    const v = await this.redis.get<string>(lk.auto(acct));
    return v == null ? null : String(v);
  }

  async autoSwap(acct: string, expected: string | null, next: string | null) {
    const r = await this.redis.eval<string[], number>(AUTO_SWAP_LUA, [lk.auto(acct)], [expected ?? "", next ?? "", String(AUTO_TTL_SEC)]);
    return Number(r) === 1;
  }

  async grantAuto(acct: string, day: string, items: GrantItem[], stackMax: number) {
    if (!items.length) return [];
    // 11/22 자동 낚시는 늘 보통 (등급을 넘겨도 버린다)
    items = items.map(({ id, size }) => ({ id, size }));
    const argv = [day, String(stackMax), String(DAY_TTL_SEC), ...grantArgs(items)];
    const r = await this.redis.eval<string[], unknown>(GRANT_AUTO_LUA, [lk.bag(acct), lk.dex(acct), lk.day(acct, day), lk.pay(acct)], argv);
    if (!Array.isArray(r)) return [];
    return parseGranted(r, items.slice(0, r.length)) ?? [];
  }
}

// HMR로 모듈이 다시 로드돼도 로컬 데이터가 남게 globalThis에 둔다 (lib/store와 같은 방식)
const g = globalThis as typeof globalThis & { __tombForage?: ForageStore };

export function getForageStore(): ForageStore {
  const cur = g.__tombForage;
  const conn = env.redis();
  if (conn) return cur instanceof RedisForageStore ? cur : (g.__tombForage = new RedisForageStore(conn));
  if (env.isProd()) throw new Error("[forage] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryForageStore) return cur;
  g.__tombForage = cur ? Object.assign(new MemoryForageStore(), cur) : new MemoryForageStore();
  return g.__tombForage;
}

import { nanoid } from "nanoid";
import { isShopListed, itemById, isTitleId, permanentPrice } from "@tomb/protocol";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import { addDays, dayStartMs } from "../../gameDay";
import { itemLookScore } from "../../lookScore";
import { getAccounts } from "../../store";
import { getTitleStats } from "../../store/titleStats";
import { earnedTitleIds, titleDef } from "../../titles";
import { SPECIES, speciesById, STACK_MAX } from "../catalog";
import { candidates, conditionsAt, pickWeighted, weightOf } from "../rules";
import { getForageStore } from "../store";
import { questBoard } from "./service";
import {
  BOX_FISH,
  BOX_WEIGHTS,
  FEST_MS,
  FEST_RARE_BOOST,
  festWeight,
  openBox,
  rankScore,
  countOf,
  URGENT_DEF,
  URGENT_GAP_MS,
  URGENT_HAT,
  URGENT_KINDS,
  URGENT_MS,
  URGENT_REF_ONLINE,
  urgentGoal,
  urgentReward,
  urgentSchedule,
  urgentStage,
  type UrgentSlot,
} from "./urgent";
import { claimUrgent, deliverUrgent, festivalOn, testStartUrgent, urgentMine, urgentPublic, urgentStore } from "./urgentService";
import { MemoryUrgentStore, type UrgentMemDeps } from "./urgentStore";

// 11/15 긴급 의뢰: 시각(시드·범위)·목표·단계·보상·상자 확률·축제 범위, 그리고 서버 흐름(제한 시간·중복 수령)을 메모리 저장소로.
// Redis Lua는 같은 계약 (lib/forage/quests/urgentStore.ts 주석)

const HOUR = 3_600_000;
const kstHourOf = (t: number) => new Date(t + 9 * HOUR).getUTCHours() + new Date(t + 9 * HOUR).getUTCMinutes() / 60;

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "SESSION_SECRET", "JOIN_SECRET", "ADMIN_ALLOWED_IPS", "VERCEL_ENV"]) vi.stubEnv(k, "");
  vi.stubEnv("MOCK_GRAVES", "0");
  // 로비(접속자 수)는 응답하지 않는 것으로 → 기준 접속자 수로 목표
  vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("언제 (날짜 시드)", () => {
  it("같은 (비밀값, 날짜)면 늘 같고, 날짜·비밀값이 다르면 다르다", () => {
    const a = urgentSchedule("20261115", "s1");
    expect(urgentSchedule("20261115", "s1")).toEqual(a);
    expect(urgentSchedule("20261115", "s2")).not.toEqual(a);
    expect(urgentSchedule("20261116", "s1")).not.toEqual(a);
  });

  it("하루 한두 번, 한국 시각 낮 12시 ~ 밤 12시 안에서 20분, 두 번이면 2시간 넘게 떨어지고 종류가 다르다 (2년치)", () => {
    let ones = 0;
    let twos = 0;
    const hours = new Set<number>();
    for (let i = 0; i < 730; i++) {
      const day = addDays("20261101", i);
      const s = urgentSchedule(day, "secret");
      expect(s.length === 1 || s.length === 2).toBe(true);
      if (s.length === 1) ones++;
      else twos++;
      for (const [k, e] of s.entries()) {
        expect(e.id).toBe(`${day}-${k}`);
        expect(e.end - e.start).toBe(URGENT_MS);
        expect(e.start % 60_000).toBe(0);
        expect(kstHourOf(e.start)).toBeGreaterThanOrEqual(12);
        // 끝이 밤 12시를 넘지 않는다 (게임 날짜 안: 새벽 5시 전)
        expect(e.end).toBeLessThanOrEqual(dayStartMs(day) + 19 * HOUR);
        expect(e.start).toBeGreaterThanOrEqual(dayStartMs(day) + 7 * HOUR);
        expect(URGENT_KINDS).toContain(e.kind);
        hours.add(Math.floor(kstHourOf(e.start)));
      }
      if (s.length === 2) {
        expect(s[1].start - s[0].start).toBeGreaterThanOrEqual(URGENT_GAP_MS);
        expect(s[0].kind).not.toBe(s[1].kind);
      }
    }
    // 한 번·두 번이 섞이고, 시작 시각이 오후·저녁·밤에 고루 퍼진다
    expect(ones).toBeGreaterThan(200);
    expect(twos).toBeGreaterThan(200);
    expect([...hours].sort((a, b) => a - b)).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe("목표 (접속자 수에 맞춰)", () => {
  it("기준 접속자면 기본 목표 (생선 100 · 약초 80 · 광석 60 · 발굴품 30)", () => {
    expect(URGENT_KINDS.map((k) => urgentGoal(k, URGENT_REF_ONLINE))).toEqual([100, 80, 60, 30]);
  });
  it("사람이 적으면 낮게(최소값 아래로는 안 내려간다), 많아도 기본의 2배까지, 사람 수에 따라 줄지 않는다", () => {
    for (const k of URGENT_KINDS) {
      const d = URGENT_DEF[k];
      let prev = 0;
      for (let online = 0; online <= 200; online++) {
        const g = urgentGoal(k, online);
        expect(g).toBeGreaterThanOrEqual(d.min);
        expect(g).toBeLessThanOrEqual(d.base * 2);
        expect(g).toBeGreaterThanOrEqual(prev);
        prev = g;
      }
      expect(urgentGoal(k, 2)).toBeLessThan(d.base);
      expect(urgentGoal(k, 0)).toBe(d.min);
      expect(urgentGoal(k, 1_000)).toBe(d.base * 2);
      expect(urgentGoal(k, Number.NaN)).toBe(d.base);
    }
    expect(urgentGoal("fish", 5)).toBe(25);
    expect(urgentGoal("dig", 3)).toBe(5);
  });
});

describe("단계 · 보상 판정", () => {
  it("50% · 100% · 150% 경계", () => {
    expect(urgentStage(0, 100)).toBe(0);
    expect(urgentStage(49, 100)).toBe(0);
    expect(urgentStage(50, 100)).toBe(50);
    expect(urgentStage(99, 100)).toBe(50);
    expect(urgentStage(100, 100)).toBe(100);
    expect(urgentStage(149, 100)).toBe(100);
    expect(urgentStage(150, 100)).toBe(150);
    expect(urgentStage(15, 30)).toBe(50);
    expect(urgentStage(45, 30)).toBe(150);
    expect(urgentStage(8, 15)).toBe(50);
    expect(urgentStage(7, 15)).toBe(0);
  });

  const base = { id: "20261115-0", acct: "me", goal: 100, top: "other", last: null };
  it("낸 것이 없으면 없음, 50% 도장 2, 100% 도장 2+3과 상자, 150%도 같은 개인 보상", () => {
    expect(urgentReward({ ...base, n: 200, mine: 0 })).toBeNull();
    expect(urgentReward({ ...base, n: 40, mine: 5 })).toMatchObject({ stage: 0, stamps: 0, box: null, king: false, last: false });
    expect(urgentReward({ ...base, n: 60, mine: 5 })).toMatchObject({ stage: 50, stamps: 2, box: null });
    const full = urgentReward({ ...base, n: 100, mine: 5 })!;
    expect(full).toMatchObject({ stage: 100, stamps: 5 });
    expect(full.box).not.toBeNull();
    expect(urgentReward({ ...base, n: 170, mine: 5 })).toMatchObject({ stage: 150, stamps: 5 });
  });
  it("가장 많이 낸 사람은 50% 이상일 때만 배달왕, 마감 칭호는 100%를 채운 사람만", () => {
    expect(urgentReward({ ...base, n: 30, mine: 30, top: "me" })!.king).toBe(false);
    expect(urgentReward({ ...base, n: 60, mine: 30, top: "me" })!.king).toBe(true);
    expect(urgentReward({ ...base, n: 60, mine: 30, last: "me" })!.last).toBe(false);
    expect(urgentReward({ ...base, n: 100, mine: 30, last: "me" })!.last).toBe(true);
  });
  it("상자는 (의뢰, 계정)으로 정해져 다시 받아도 같다", () => {
    expect(openBox("20261115-0|a")).toEqual(openBox("20261115-0|a"));
    expect(urgentReward({ ...base, n: 100, mine: 1 })!.box).toEqual(openBox("20261115-0|me"));
  });
  it("순위 점수: 정수부는 낸 수, 먼저 닿은 사람이 위", () => {
    const end = 1_000_000_000;
    const early = rankScore(10, end - URGENT_MS + 1000, end);
    const late = rankScore(10, end - 1000, end);
    expect(countOf(early)).toBe(10);
    expect(countOf(late)).toBe(10);
    expect(early).toBeGreaterThan(late);
    expect(rankScore(11, end - 1, end)).toBeGreaterThan(early);
  });
});

describe("수집가의 뒷주머니 (상자 확률)", () => {
  it("무게 합 10,000, 특수색 확정 염색권은 0.5% 미만 (아주 드물게)", () => {
    expect(BOX_WEIGHTS.stamps + BOX_WEIGHTS.dye_pick + BOX_WEIGHTS.fish + BOX_WEIGHTS.dye_special).toBe(10_000);
    expect(BOX_WEIGHTS.dye_special / 10_000).toBeLessThan(0.005);
    expect(BOX_WEIGHTS.dye_special).toBeGreaterThan(0);
  });
  it("10만 번 열면 비율이 표와 맞고, 도장은 1~10 (적을수록 잘 나온다), 물고기는 희귀(★3)만", () => {
    const N = 100_000;
    const c = { stamps: 0, dye_pick: 0, dye_special: 0, fish: 0 };
    const st = new Array(11).fill(0);
    for (let i = 0; i < N; i++) {
      const p = openBox(`sim|${i}`);
      c[p.kind]++;
      if (p.kind === "stamps") st[p.n]++;
      if (p.kind === "fish") expect(speciesById(p.id)?.rarity).toBe(3);
    }
    expect(c.dye_special / N).toBeLessThan(0.006);
    expect(c.dye_special / N).toBeGreaterThan(0.0005);
    expect(Math.abs(c.dye_pick / N - 0.12)).toBeLessThan(0.01);
    expect(Math.abs(c.fish / N - 0.16)).toBeLessThan(0.01);
    expect(st[0]).toBe(0);
    for (let k = 1; k <= 10; k++) expect(st[k]).toBeGreaterThan(0);
    expect(st[1]).toBeGreaterThan(st[5]);
    expect(st[5]).toBeGreaterThan(st[10]);
    // 아주 희귀·전설 물고기는 상자에 없다
    expect(BOX_FISH.length).toBeGreaterThan(0);
    expect(BOX_FISH.every((s) => s.rarity === 3 && !s.junk && s.cat === "fish")).toBe(true);
  });
});

describe("축제 효과 범위", () => {
  it("희귀(★3) 이상만 1.25배, 흔한 것·축제 아닐 때는 그대로", () => {
    expect(FEST_RARE_BOOST).toBeGreaterThan(1);
    expect(FEST_RARE_BOOST).toBeLessThanOrEqual(1.5);
    for (const r of [1, 2]) expect(festWeight(r, true)).toBe(1);
    for (const r of [3, 4, 5]) expect(festWeight(r, true)).toBe(FEST_RARE_BOOST);
    for (const r of [1, 3, 5]) expect(festWeight(r, false)).toBe(1);
  });
  it("실제 물·채집터 후보에서 희귀 이상 확률이 조금만 오른다 (+0~5%p, 1.5배 이하)", () => {
    const share = (list: ReturnType<typeof candidates>, fest: boolean) => {
      const w = (s: (typeof list)[number]) => weightOf(s) * festWeight(s.rarity, fest);
      const all = list.reduce((n, s) => n + w(s), 0);
      return list.filter((s) => s.rarity >= 3).reduce((n, s) => n + w(s), 0) / all;
    };
    for (let h = 0; h < 24; h += 3) {
      const cond = conditionsAt(dayStartMs("20261115") + h * HOUR);
      for (const [cat, where] of [["fish", "lake"], ["fish", "river"], ["herb", "forest"], ["ore", "hill"], ["dig", "meadow"]] as const) {
        const list = candidates(cat, where, cond);
        if (!list.length) continue;
        const a = share(list, false);
        const b = share(list, true);
        expect(b).toBeGreaterThanOrEqual(a);
        expect(b - a).toBeLessThan(0.05);
        if (a > 0) expect(b / a).toBeLessThanOrEqual(1.5);
      }
    }
    // 뽑기에 배율이 실린다
    const list = candidates("fish", "lake", conditionsAt(dayStartMs("20261115") + 6 * HOUR));
    let rare0 = 0;
    let rare1 = 0;
    for (let i = 0; i < 4000; i++) {
      const r = (i + 0.5) / 4000;
      if ((pickWeighted(list, r)?.rarity ?? 0) >= 3) rare0++;
      if ((pickWeighted(list, r, (s) => festWeight(s.rarity, true))?.rarity ?? 0) >= 3) rare1++;
    }
    expect(rare1).toBeGreaterThan(rare0);
  });
});

describe("사이렌 모자 · 칭호 등록", () => {
  it("사이렌 모자는 상점·영구 구매 없음, 꾸미기 점수 0, 머리 칸", () => {
    const it = itemById(URGENT_HAT)!;
    expect(it.slot).toBe("head");
    expect(it.urgent).toBe(true);
    expect(isShopListed(it)).toBe(false);
    expect(permanentPrice(URGENT_HAT)).toBeNull();
    expect(itemLookScore(URGENT_HAT)).toBe(0);
  });
  it("칭호 「긴급 배달왕」·「아슬아슬 마감」은 기간 안일 때만 얻은 것", () => {
    expect(isTitleId("t_urgKing") && isTitleId("t_urgLast")).toBe(true);
    expect(titleDef("t_urgKing")).toMatchObject({ name: "긴급 배달왕", transient: true, timed: true });
    expect(titleDef("t_urgLast")).toMatchObject({ name: "아슬아슬 마감", transient: true, timed: true });
    const f = { dexTitleNames: [], champBoards: [], metrics: {} };
    expect(earnedTitleIds({ ...f, timed: ["t_urgKing"] })).toContain("t_urgKing");
    expect(earnedTitleIds(f)).not.toContain("t_urgKing");
  });
});

// ── 서버 흐름 (메모리 저장소) ──

const DAY = "20261115";
const sched = () => urgentSchedule(DAY, env.sessionSecret());
const acct = () => `t-urg-${nanoid(8)}`;
async function newAcct(name: string, t: number) {
  const a = acct();
  await getAccounts().enter(a, { name }, t);
  return a;
}
const catOf = (ev: UrgentSlot) => URGENT_DEF[ev.kind].cat;
/** 그 의뢰에 맞는 싼 것을 가방에 n개 */
async function fill(a: string, ev: UrgentSlot, n: number) {
  const sp = SPECIES.filter((s) => s.cat === catOf(ev) && !s.junk).sort((x, y) => x.price - y.price);
  const items = Array.from({ length: n }, (_, i) => ({ id: sp[i % 3].id, size: 0 }));
  await getForageStore().grant(a, DAY, "fish", items, STACK_MAX);
  const bag: Record<string, number> = {};
  for (const x of items) bag[x.id] = (bag[x.id] ?? 0) + 1;
  return bag;
}

describe("서버 흐름", () => {
  it("의뢰가 없을 때는 상태가 비고 저장소를 읽지 않는다", async () => {
    const ev = sched()[0];
    const spy = vi.spyOn(MemoryUrgentStore.prototype, "state");
    const r = await urgentPublic(ev.start - 5 * 60_000);
    expect(r.body.ev).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(r.cacheSec).toBeLessThanOrEqual(30);
    spy.mockRestore();
  });

  it("제한 시간 안의 납품만: 시작 전·끝난 뒤는 거절, 맞지 않는 종류도 거절", async () => {
    const ev = sched()[0];
    const a = await newAcct("배달1", ev.start);
    const bag = await fill(a, ev, 6);
    await expect(deliverUrgent(a, ev.id, bag, ev.start - 1)).rejects.toMatchObject({ code: "URGENT_NOT_YET" });
    await expect(deliverUrgent(a, ev.id, bag, ev.end)).rejects.toMatchObject({ code: "URGENT_OVER" });
    const wrong = SPECIES.find((s) => s.cat !== catOf(ev) && !s.junk)!;
    await expect(deliverUrgent(a, ev.id, { [wrong.id]: 1 }, ev.start + 1000)).rejects.toMatchObject({ code: "URGENT_PICK" });
    await expect(deliverUrgent(a, ev.id, { [Object.keys(bag)[0]]: 99 }, ev.start + 1000)).rejects.toMatchObject({ code: "BAG_CHANGED" });
    const r = await deliverUrgent(a, ev.id, bag, ev.start + 1000);
    expect(r.mine).toBe(6);
    expect(r.goal).toBe(urgentGoal(ev.kind, URGENT_REF_ONLINE));
    expect(r.n).toBeGreaterThanOrEqual(6);
    // 가방에서 빠졌다
    const snap = await getForageStore().snapshot(a, DAY, 0);
    for (const id of Object.keys(bag)) expect(snap.bag[id] ?? 0).toBe(0);
  });

  it("다 같이 150%까지: 막대·순위·축제·마감 칭호, 끝나면 막대가 멈추고 보상은 한 번만", async () => {
    // 앞 시험과 다른 날 (같은 의뢰를 쓰지 않게)
    const ev = urgentSchedule(addDays(DAY, 1), env.sessionSecret())[0];
    const goal = urgentGoal(ev.kind, URGENT_REF_ONLINE);
    const big = await newAcct("큰손", ev.start);
    const small = await newAcct("작은손", ev.start);
    const late = await newAcct("막차", ev.start);
    const none = await newAcct("구경", ev.start);
    // 시작 상태 (확성기도 남는다)
    const s0 = await urgentPublic(ev.start + 500);
    expect(s0.body.ev).toMatchObject({ id: ev.id, goal, n: 0 });
    expect(s0.cacheSec).toBe(5);
    await deliverUrgent(big, ev.id, await fill(big, ev, goal - 6), ev.start + 60_000);
    await deliverUrgent(small, ev.id, await fill(small, ev, 3), ev.start + 120_000);
    expect(await festivalOn(ev.start + 130_000)).toBe(false);
    // 마지막 1분에 100%를 넘긴 사람
    await deliverUrgent(late, ev.id, await fill(late, ev, 4), ev.end - 30_000);
    const mid = await urgentPublic(ev.end - 20_000);
    expect(mid.body.ev!.n).toBe(goal + 1);
    expect(mid.body.ev!.top.map((t) => t.name)).toEqual(["큰손", "막차", "작은손"]);
    expect(mid.body.ev!.lastName).toBe("막차");
    // 150% → 축제 (참여 안 한 사람도)
    await deliverUrgent(big, ev.id, await fill(big, ev, Math.ceil(goal / 2)), ev.end - 10_000);
    expect(await festivalOn(ev.end - 5_000)).toBe(true);
    const fin = await urgentPublic(ev.end + 1_000);
    expect(fin.body.ev!.festUntil).toBeGreaterThan(ev.end);
    expect(fin.body.ev!.festUntil).toBeLessThanOrEqual(ev.end - 10_000 + FEST_MS);
    expect(await festivalOn(ev.end - 10_000 + FEST_MS + 1)).toBe(false);
    // 끝난 뒤 납품은 거절 → 막대가 멈춘다
    await expect(deliverUrgent(small, ev.id, await fill(small, ev, 2), ev.end + 2_000)).rejects.toMatchObject({ code: "URGENT_OVER" });
    expect((await urgentPublic(ev.end + 3_000)).body.ev!.n).toBe(fin.body.ev!.n);
    // 진행 중엔 받을 수 없다
    await expect(claimUrgent(big, ev.id, ev.end - 1)).rejects.toMatchObject({ code: "URGENT_LIVE" });

    const t = ev.end + 60_000;
    const stamps0 = (await questBoard(big, t)).stamps;
    const mine = await urgentMine(big, t);
    const row = mine.rows.find((r) => r.id === ev.id)!;
    expect(row).toMatchObject({ done: true, mine: goal - 6 + Math.ceil(goal / 2), reward: { stage: 150, stamps: 5, box: true, king: true, last: false }, claimed: null });

    const r1 = await claimUrgent(big, ev.id, t);
    expect(r1.claimed).toMatchObject({ stage: 150, stamps: 5, king: true });
    const box = r1.claimed.box!;
    const boxStamps = box.kind === "stamps" ? box.n : 0;
    expect(r1.stamps).toBe(stamps0 + 5 + boxStamps);
    // 사이렌 모자 24시간 + 칭호 하루
    const me = await getAccounts().get(big, DAY, t);
    const hat = [...me.equipped, ...(me.stash ?? [])].find((e) => e.itemId === URGENT_HAT);
    expect(hat?.until).toBe(t + 24 * HOUR);
    expect((await getTitleStats().get(big)).urgKing).toBe(t + 24 * HOUR);
    // 중복 수령 막기
    await expect(claimUrgent(big, ev.id, t + 1)).rejects.toMatchObject({ code: "URGENT_CLAIMED" });
    await Promise.all([claimUrgent(late, ev.id, t), claimUrgent(late, ev.id, t)].map((p) => p.catch((e: { code: string }) => e.code))).then((rs) => {
      expect(rs.filter((x) => x === "URGENT_CLAIMED")).toHaveLength(1);
    });
    expect((await getTitleStats().get(late)).urgLast).toBe(t + 24 * HOUR);
    expect((await getTitleStats().get(small)).urgLast).toBe(0);
    expect((await questBoard(big, t)).stamps).toBe(r1.stamps);
    // 이미 받은 기록이 보인다
    expect((await urgentMine(big, t)).rows.find((r) => r.id === ev.id)!.claimed).toMatchObject({ stage: 150 });
    // 낸 것이 없으면 보상 없음
    await expect(claimUrgent(none, ev.id, t)).rejects.toMatchObject({ code: "NO_REWARD" });
    // 기간이 지나면 못 받는다
    await expect(claimUrgent(small, ev.id, ev.end + 3 * 24 * HOUR)).rejects.toMatchObject({ code: "URGENT_EXPIRED" });
  });

  it("시험 의뢰는 테스트 서버 운영자만 (운영 서버에서는 404)", async () => {
    const a = await newAcct("운영아님", Date.now());
    await expect(testStartUrgent(a, "fish")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(testStartUrgent(a, "fish")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("VERCEL_ENV", "");
  });

  it("메모리 저장소 계약: 가방이 모자라면 아무것도 바뀌지 않는다", async () => {
    let bag: Record<string, number> = { f_crucian: 2 };
    const deps: UrgentMemDeps = {
      takeBag: (_a, items) => {
        if (Object.entries(items).some(([k, n]) => (bag[k] ?? 0) < n)) return false;
        bag = Object.fromEntries(Object.entries(bag).map(([k, n]) => [k, n - (items[k] ?? 0)]));
        return true;
      },
      bagHas: () => 0,
      giveBag: () => undefined,
      hasAccount: () => true,
      giveInv: () => undefined,
      addStamps: () => 0,
      grantTimed: () => undefined,
      setTitleUntil: () => undefined,
    };
    const s = new MemoryUrgentStore(() => deps);
    const args = { goal: 10, end: 2_000, now: 1_000, frac: 0.1, lastFrom: 1_940 };
    expect(await s.deliver("x", "a", "에이", { f_crucian: 3 }, args)).toEqual({ status: "bag" });
    expect((await s.state("x")).n).toBe(0);
    expect(await s.deliver("x", "a", "에이", { f_crucian: 2 }, args)).toMatchObject({ status: "ok", n: 2, mine: 2 });
    expect(await s.setGoal("x", 10)).toBe(10);
    expect(await s.setGoal("x", 99)).toBe(10);
    expect(await s.mark("x", "a0")).toBe(true);
    expect(await s.mark("x", "a0")).toBe(false);
    void urgentStore;
  });
});

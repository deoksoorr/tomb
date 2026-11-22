import { nanoid } from "nanoid";
import { isShopListed, itemById, isTitleId, permanentPrice } from "@tomb/protocol";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import { addDays, dayStartMs, gameDay } from "../../gameDay";
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
  urgentCosRoll,
  urgentLucky,
  URGENT_POCKET,
  URGENT_KINDS,
  URGENT_MS,
  URGENT_REF_ONLINE,
  urgentCap,
  URGENT_CAP_SHARE,
  urgentCapError,
  urgentCapLine,
  urgentEndAt,
  urgentEndNotice,
  URGENT_KING_LINE,
  urgentFilled,
  urgentLastAcct,
  urgentGoal,
  urgentPrize,
  urgentReward,
  urgentRewardLine,
  urgentSchedule,
  urgentStage,
  type UrgentSlot,
} from "./urgent";
import {
  backfillPocketDex,
  claimUrgent,
  deliverUrgent,
  festivalOn,
  openUrgentPocket,
  testAddUrgent,
  testEndUrgent,
  testStartUrgent,
  urgentEnabled,
  urgentMine,
  urgentNoticeId,
  urgentPublic,
  urgentStore,
} from "./urgentService";
import { verifyInternal, type InternalSay } from "@tomb/protocol";
import { NextRequest } from "next/server";
import { getMegaphone } from "../../store";
import { setStaff } from "../../staff";
import { MemoryUrgentStore, URGENT_DELIVER_LUA, URGENT_GOAL_LUA, type UrgentMemDeps } from "./urgentStore";

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
  // 11/16 접속자 수에 그대로 비례 (2배 상한 없음): 한 사람당 생선 8 · 약초 6 · 광석 5 · 발굴품 2, 종류별 최소·최대 안에서
  it("접속자 수별 목표 표 (로비를 못 물으면 20명으로)", () => {
    const table: [number, number[]][] = [
      [0, [40, 30, 25, 10]],
      [3, [40, 30, 25, 10]],
      [5, [40, 30, 25, 10]],
      [7, [55, 40, 35, 14]],
      [10, [80, 60, 50, 20]],
      [20, [160, 120, 100, 40]],
      [40, [320, 240, 200, 80]],
      [60, [480, 360, 300, 120]],
      [100, [800, 600, 500, 200]],
      [500, [800, 600, 500, 200]],
    ];
    for (const [online, goals] of table) expect([online, URGENT_KINDS.map((k) => urgentGoal(k, online))]).toEqual([online, goals]);
    expect(URGENT_REF_ONLINE).toBe(20);
    expect(URGENT_KINDS.map((k) => urgentGoal(k, Number.NaN))).toEqual([160, 120, 100, 40]);
  });
  it("최소·최대 안에서 사람 수에 따라 줄지 않고, 5 단위 (발굴품은 1 단위)", () => {
    for (const k of URGENT_KINDS) {
      const d = URGENT_DEF[k];
      let prev = 0;
      for (let online = 0; online <= 300; online++) {
        const g = urgentGoal(k, online);
        expect(g).toBeGreaterThanOrEqual(d.min);
        expect(g).toBeLessThanOrEqual(d.max);
        expect(g).toBeGreaterThanOrEqual(prev);
        expect(g % (k === "dig" ? 1 : 5)).toBe(0);
        prev = g;
      }
      expect(urgentGoal(k, 0)).toBe(d.min);
      expect(urgentGoal(k, 1_000)).toBe(d.max);
    }
    expect(urgentGoal("dig", 13)).toBe(26);
  });
  it("11/19 한 사람 상한 없음: 혼자서도 끝까지 낼 수 있다 (새 의뢰는 cap 0)", () => {
    for (const k of URGENT_KINDS) for (const online of [0, 3, 9, 10, 20, 120]) expect(urgentCap(urgentGoal(k, online), online)).toBe(0);
  });
  it("상한 안내·거절 문구 (해요체, 단위)", () => {
    expect(urgentCapLine("fish", 40, 12)).toBe("한 사람이 40마리까지 낼 수 있어요. 지금 12마리 더 낼 수 있어요.");
    expect(urgentCapLine("ore", 25, 0)).toBe("이번 의뢰엔 낼 만큼 다 냈어요.");
    expect(urgentCapError("herb", 30, 5)).toBe("이번 의뢰는 한 사람이 30개까지 낼 수 있어요. 앞으로 5개 더 낼 수 있어요.");
    expect(urgentCapError("fish", 40, 0)).toBe("이번 의뢰는 한 사람이 40마리까지 낼 수 있어요. 낼 만큼 다 냈어요.");
    expect(URGENT_KING_LINE).toContain("150%");
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

  const base = { id: "20261115-0", acct: "me", goal: 100, cap: 0, top: "other", last: null };
  it("낸 것이 없으면 없음, 50% 도장 2, 100% 도장 2+3과 상자, 150%도 같은 개인 보상", () => {
    expect(urgentReward({ ...base, n: 200, mine: 0 })).toBeNull();
    expect(urgentReward({ ...base, n: 40, mine: 5 })).toMatchObject({ stage: 0, stamps: 0, box: null, king: false, last: false });
    expect(urgentReward({ ...base, n: 60, mine: 5 })).toMatchObject({ stage: 50, stamps: 2, box: null });
    const full = urgentReward({ ...base, n: 100, mine: 5 })!;
    expect(full).toMatchObject({ stage: 100, stamps: 5 });
    expect(full.box).not.toBeNull();
    expect(urgentReward({ ...base, n: 170, mine: 5 })).toMatchObject({ stage: 150, stamps: 5 });
  });
  it("11/18 가장 많이 낸 사람은 150%를 채웠을 때만 배달왕, 마감 칭호는 100%를 채운 사람만", () => {
    expect(urgentReward({ ...base, n: 30, mine: 30, top: "me" })!.king).toBe(false);
    expect(urgentReward({ ...base, n: 60, mine: 30, top: "me" })!.king).toBe(false);
    expect(urgentReward({ ...base, n: 100, mine: 30, top: "me" })!.king).toBe(false);
    expect(urgentReward({ ...base, n: 150, mine: 30, top: "me" })!.king).toBe(true);
    expect(urgentReward({ ...base, n: 60, mine: 30, last: "me" })!.last).toBe(false);
    expect(urgentReward({ ...base, n: 100, mine: 30, last: "me" })!.last).toBe(true);
  });
  it("11/18 공동 배달왕은 없다: 상한까지 다 내도 1등이 아니면 아니고, 1등 한 사람만 (150%일 때)", () => {
    expect(urgentReward({ ...base, cap: 25, n: 150, mine: 25, top: "other" })!.king).toBe(false);
    expect(urgentReward({ ...base, cap: 25, n: 150, mine: 25, top: "me" })!.king).toBe(true);
    expect(urgentReward({ ...base, cap: 25, n: 150, mine: 20, top: "other" })!.king).toBe(false);
    // 상한 없음(cap 0 — 그 전 코드가 정한 의뢰): 많이 내도 1등이 아니면 아니다
    expect(urgentReward({ ...base, cap: 0, n: 120, mine: 50, top: "other" })!.king).toBe(false);
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

describe("끝난 뒤 문구 (위쪽 막대·게시판·확성기)", () => {
  it("끝 확성기: 0개면 '아무도 오지 않은 채', 채웠으면 몇 %를 채웠는지 ('멈춤' 같은 말은 쓰지 않는다)", () => {
    expect(urgentEndNotice("dig", 5, 0)).toBe("긴급 의뢰(발굴품 5개)는 아무도 오지 않은 채 끝났어요.");
    expect(urgentEndNotice("fish", 20, 9)).toBe("긴급 의뢰(생선 20마리)가 끝났어요. 목표의 45%를 채웠어요.");
    expect(urgentEndNotice("dig", 5, 6)).toBe("긴급 의뢰(발굴품 5개)가 끝났어요. 목표의 120%를 채웠어요! 낸 사람은 게시판에서 보상을 받아요.");
    for (const k of URGENT_KINDS) for (const n of [0, 1, 7, 10, 15, 30]) expect(urgentEndNotice(k, 10, n)).not.toMatch(/멈/);
  });

  it("모은 양: 1%가 안 되면 0%라고 하지 않고 수로", () => {
    expect(urgentFilled("ore", 9, 20)).toBe("목표의 45%를 채웠어요");
    expect(urgentFilled("fish", 1, 200)).toBe("1마리를 모았어요");
  });

  it("보상 한 줄: 낸 사람·안 낸 사람·받은 뒤·50% 못 넘김", () => {
    expect(urgentPrize(50)).toBe("도장 2개");
    expect(urgentPrize(150)).toBe("도장 5개와 수집가의 뒷주머니");
    expect(urgentRewardLine({ n: 9, goal: 20, mine: true })).toBe("50%를 못 넘겨 이번엔 보상이 없어요.");
    expect(urgentRewardLine({ n: 11, goal: 20, mine: true })).toBe("50%를 넘겨 도장 2개를 받아요.");
    expect(urgentRewardLine({ n: 10, goal: 20, mine: true })).toBe("50%를 채워 도장 2개를 받아요.");
    expect(urgentRewardLine({ n: 24, goal: 20, mine: true, claimed: true })).toBe("100%를 넘겨 도장 5개와 수집가의 뒷주머니를 받았어요.");
    expect(urgentRewardLine({ n: 11, goal: 20, mine: false })).toBe("낸 사람은 도장 2개를 받아요.");
    // 내 것을 아직 모르면 비운다
    expect(urgentRewardLine({ n: 11, goal: 20, mine: null })).toBe("");
  });

  it("11/15 150%로 일찍 끝남: 끝 시각·문구·마감 칭호 계정", () => {
    expect(urgentEndAt(10_000, 0)).toBe(10_000);
    expect(urgentEndAt(10_000, 4_000)).toBe(4_000);
    expect(urgentFilled("fish", 24, 15, true)).toBe("목표의 160%를 채워서 일찍 끝났어요");
    expect(urgentEndNotice("fish", 15, 23, true)).toBe("긴급 의뢰(생선 15마리)가 목표의 153%를 채워서 일찍 끝났어요! 낸 사람은 게시판에서 보상을 받아요.");
    // 마지막 1분에 100%를 넘긴 사람이 있으면 그 사람, 없으면 150%를 채워 끝낸 사람, 예전 기록(festBy 없음)은 없음
    expect(urgentLastAcct({ fest: 5, festBy: "b", last: "a" })).toBe("a");
    expect(urgentLastAcct({ fest: 5, festBy: "b", last: null })).toBe("b");
    expect(urgentLastAcct({ fest: 5, festBy: null, last: null })).toBeNull();
    expect(urgentLastAcct({ fest: 0, festBy: null, last: null })).toBeNull();
  });

  it("아무도 안 냈을 때 게시판 한 줄은 종류마다 있다", () => {
    for (const k of URGENT_KINDS) expect(URGENT_DEF[k].nobody).toMatch(/요\.$/);
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

describe("11/19 무작위 꾸미기 · 행운의 배달부", () => {
  const tiers = [["c_a", "c_b"], ["c_c"], ["c_d"], ["c_e"]];
  it("같은 시드면 늘 같고, 기간은 1·3·7일, 영구로 가진 것은 뺀다", () => {
    const a = urgentCosRoll("ev|acct", tiers, new Set());
    expect(urgentCosRoll("ev|acct", tiers, new Set())).toEqual(a);
    let siren = 0;
    for (let i = 0; i < 2000; i++) {
      const r = urgentCosRoll(`ev${i}|x`, tiers, new Set(["c_a", "c_b", "c_c"]))!;
      expect([1, 3, 7]).toContain(r.days);
      expect(["c_a", "c_b", "c_c"]).not.toContain(r.id);
      if (r.id === URGENT_HAT) siren++;
    }
    // 사이렌 모자는 아주 드물게 (5% 안팎)
    expect(siren / 2000).toBeGreaterThan(0.02);
    expect(siren / 2000).toBeLessThan(0.09);
  });
  it("행운의 배달부: 낸 사람 중 한 명, 배달왕은 빼고, 같은 의뢰면 늘 같은 사람", () => {
    const accts = ["a", "b", "c", "d"];
    const w = urgentLucky("ev1", accts, "a");
    expect(["b", "c", "d"]).toContain(w);
    expect(urgentLucky("ev1", [...accts].reverse(), "a")).toBe(w);
    expect(urgentLucky("ev1", ["a"], "a")).toBeNull();
    const seen = new Set(Array.from({ length: 200 }, (_, i) => urgentLucky(`ev${i}`, accts, null)));
    expect(seen.size).toBe(4);
  });
  it("100%를 넘긴 판의 뽑힌 사람만 lucky, 150% 1등만 king", () => {
    const base = { id: "e", n: 100, goal: 100, cap: 0, mine: 3, top: "a", last: null };
    expect(urgentReward({ ...base, acct: "b", lucky: "b" })).toMatchObject({ lucky: true, king: false });
    expect(urgentReward({ ...base, n: 60, acct: "b", lucky: "b" })).toMatchObject({ lucky: false });
    expect(urgentReward({ ...base, n: 150, acct: "a", lucky: "b" })).toMatchObject({ king: true, lucky: false });
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

/** 11/16 그 전 코드가 남긴 저장 값 흉내: 목표만 있고 cap 칸이 없는 의뢰 (메모리 저장소) */
function seedLegacyGoal(id: string, goal: number) {
  (urgentStore() as unknown as { evs: Map<string, Record<string, string>> }).evs.set(id, { goal: String(goal) });
}

describe("서버 흐름", () => {
  it("의뢰가 없을 때는 상태가 비고 저장소를 읽지 않는다", async () => {
    const ev = sched()[0];
    const spy = vi.spyOn(MemoryUrgentStore.prototype, "state");
    const r = await urgentPublic(ev.start - 5 * 60_000);
    expect(r.body.ev).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(r.cacheSec).toBeLessThanOrEqual(10);
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
    await expect(deliverUrgent(a, ev.id, { [Object.keys(bag)[0]]: 5 }, ev.start + 1000)).rejects.toMatchObject({ code: "BAG_CHANGED" });
    const r = await deliverUrgent(a, ev.id, bag, ev.start + 1000);
    expect(r.mine).toBe(6);
    expect(r.goal).toBe(urgentGoal(ev.kind, URGENT_REF_ONLINE));
    expect(r.n).toBeGreaterThanOrEqual(6);
    // 가방에서 빠졌다
    const snap = await getForageStore().snapshot(a, DAY, 0);
    for (const id of Object.keys(bag)) expect(snap.bag[id] ?? 0).toBe(0);
  });

  it("다 같이 150%까지 (11/16 그 전 코드가 목표만 정한 의뢰 — 상한 없음·목표 그대로·1등만 배달왕): 막대·순위·축제·마감 칭호, 끝나면 막대가 멈추고 보상은 한 번만", async () => {
    // 앞 시험과 다른 날 (같은 의뢰를 쓰지 않게)
    const ev = urgentSchedule(addDays(DAY, 1), env.sessionSecret())[0];
    // 그 전 코드가 남긴 저장 값 흉내: 목표만 있고 cap 칸이 없다 (예전 공식 값)
    const goal = 60;
    seedLegacyGoal(ev.id, goal);
    const big = await newAcct("큰손", ev.start);
    const small = await newAcct("작은손", ev.start);
    const late = await newAcct("막차", ev.start);
    const none = await newAcct("구경", ev.start);
    // 시작 상태 (확성기도 남는다)
    const s0 = await urgentPublic(ev.start + 500);
    expect(s0.body.ev).toMatchObject({ id: ev.id, goal, n: 0 });
    expect(s0.body.ev!.cap).toBeUndefined();
    expect(s0.body.ev!.kings).toBeUndefined();
    expect(s0.cacheSec).toBe(5);
    // 상한이 없으니 혼자 목표의 90%를 내도 된다
    await deliverUrgent(big, ev.id, await fill(big, ev, goal - 6), ev.start + 60_000);
    await deliverUrgent(small, ev.id, await fill(small, ev, 3), ev.start + 120_000);
    expect((await urgentStore().state(ev.id)).cap).toBe(0);
    expect(await festivalOn(ev.start + 130_000)).toBe(false);
    // 마지막 1분에 100%를 넘긴 사람
    await deliverUrgent(late, ev.id, await fill(late, ev, 4), ev.end - 30_000);
    const mid = await urgentPublic(ev.end - 20_000);
    expect(mid.body.ev!.n).toBe(goal + 1);
    expect(mid.body.ev!.top.map((t) => t.name)).toEqual(["큰손", "막차", "작은손"]);
    expect(mid.body.ev!.lastName).toBe("막차");
    // 100%에 처음 닿은 시각 (화면 축하 폭죽 기준)
    expect(mid.body.ev!.goalAt).toBe(ev.end - 30_000);
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
    // 진행 중엔 받을 수 없다 (150%에 닿기 전). 11/15 150%에 닿은 뒤(ev.end − 10초)는 남은 시간이 있어도 끝난 것
    await expect(claimUrgent(big, ev.id, ev.end - 20_000)).rejects.toMatchObject({ code: "URGENT_LIVE" });
    expect(fin.body.ev).toMatchObject({ end: ev.end - 10_000, early: true, lastName: "막차" });
    expect(fin.body.ev!.lastFest).toBeUndefined();

    const t = ev.end + 60_000;
    const stamps0 = (await questBoard(big, t)).stamps;
    const mine = await urgentMine(big, t);
    const row = mine.rows.find((r) => r.id === ev.id)!;
    expect(row).toMatchObject({ done: true, goal, mine: goal - 6 + Math.ceil(goal / 2), reward: { stage: 150, stamps: 5, box: true, king: true, last: false }, claimed: null });
    expect(row.cap).toBeUndefined();
    // 예전 규칙: 1등이 아니면 배달왕이 아니다
    expect((await urgentMine(late, t)).rows.find((r) => r.id === ev.id)!.reward).toMatchObject({ king: false, last: true });

    const r1 = await claimUrgent(big, ev.id, t);
    // 상자는 바로 열지 않고 가방에 (내용물은 아직 안 준다)
    expect(r1.claimed).toMatchObject({ stage: 150, stamps: 5, king: true, pocket: true, box: null });
    expect(r1.stamps).toBe(stamps0 + 5);
    expect((await getAccounts().get(big, DAY, t)).inventory[URGENT_POCKET]).toBe(1);
    // 가방에서 열기: (의뢰, 계정) 시드 그대로, 상자 1개가 빠지고 내용물 지급. 두 번 열 수 없다
    const prize = openBox(`${ev.id}|${big}`);
    const [o1, o2] = await Promise.all([openUrgentPocket(big), openUrgentPocket(big).catch((e: { code: string }) => e.code)]);
    expect(o1.prize).toEqual(prize);
    expect(o2).toBe("NO_POCKET");
    expect(o1.left).toBe(0);
    expect((await getAccounts().get(big, DAY, t)).inventory[URGENT_POCKET] ?? 0).toBe(0);
    expect(o1.stamps).toBe(r1.stamps + (prize.kind === "stamps" ? prize.n : 0));
    if (prize.kind === "dye_pick") expect(o1.me.inventory.q_dye_pick).toBe(1);
    if (prize.kind === "fish") expect((await getForageStore().snapshot(big, DAY, 0)).bag[prize.id]).toBe(1);
    await expect(openUrgentPocket(big)).rejects.toMatchObject({ code: "NO_POCKET" });
    // 11/19 배달왕: 칭호 하루 + 무작위 꾸미기 기간제 ((의뢰, 계정) 시드 — 사이렌 모자 고정 아님)
    const cos = r1.claimed.cos!;
    expect(cos).toBeTruthy();
    expect([1, 3, 7]).toContain(cos.days);
    const me = await getAccounts().get(big, DAY, t);
    const got = [...me.equipped, ...(me.stash ?? [])].find((e) => e.itemId === cos.id);
    expect(got?.until).toBe(t + cos.days * 24 * HOUR);
    expect((await getTitleStats().get(big)).urgKing).toBe(t + 24 * HOUR);
    // 중복 수령 막기
    await expect(claimUrgent(big, ev.id, t + 1)).rejects.toMatchObject({ code: "URGENT_CLAIMED" });
    await Promise.all([claimUrgent(late, ev.id, t), claimUrgent(late, ev.id, t)].map((p) => p.catch((e: { code: string }) => e.code))).then((rs) => {
      expect(rs.filter((x) => x === "URGENT_CLAIMED")).toHaveLength(1);
    });
    expect((await getTitleStats().get(late)).urgLast).toBe(t + 24 * HOUR);
    expect((await getTitleStats().get(small)).urgLast).toBe(0);
    expect((await questBoard(big, t)).stamps).toBe(o1.stamps);
    // 이미 받은 기록이 보인다
    expect((await urgentMine(big, t)).rows.find((r) => r.id === ev.id)!.claimed).toMatchObject({ stage: 150 });
    // 낸 것이 없으면 보상 없음
    await expect(claimUrgent(none, ev.id, t)).rejects.toMatchObject({ code: "NO_REWARD" });
    // 기간이 지나면 못 받는다
    await expect(claimUrgent(small, ev.id, ev.end + 3 * 24 * HOUR)).rejects.toMatchObject({ code: "URGENT_EXPIRED" });
  });

  it("시험 막대 +50%는 누른 운영자가 낸 것으로 센다 (순위·참여·보상), 100% 시각·150% 축제도 진짜 납품과 같다", async () => {
    const now = Date.now();
    const op = await newAcct("시험운영자", now);
    await setStaff(op, now);
    const t = await testStartUrgent(op, "fish", now);
    const goal = urgentGoal("fish", URGENT_REF_ONLINE);
    await testAddUrgent(op, 50, now + 1_000);
    const half = (await urgentPublic(now + 1_500)).body.ev!;
    expect(half).toMatchObject({ id: t.id, n: goal / 2, goalAt: 0 });
    await testAddUrgent(op, 50, now + 2_000);
    const full = (await urgentPublic(now + 2_500)).body.ev!;
    expect(full).toMatchObject({ n: goal, goalAt: now + 2_000, festUntil: 0 });
    expect(full.top[0]).toMatchObject({ name: "시험운영자", n: goal });
    const row = (await urgentMine(op, now + 3_000)).rows.find((r) => r.id === t.id)!;
    expect(row.mine).toBe(goal);
    await testAddUrgent(op, 50, now + 4_000);
    expect((await urgentPublic(now + 4_500)).body.ev!.festUntil).toBe(now + 4_000 + FEST_MS);
    await setStaff(null, now);
  });

  it("시험 의뢰는 테스트 서버 운영자만 (운영 서버에서는 404)", async () => {
    const a = await newAcct("운영아님", Date.now());
    await expect(testStartUrgent(a, "fish")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(testStartUrgent(a, "fish")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("VERCEL_ENV", "");
  });

  it("운영 서버는 URGENT_ENABLED=1이 아니면 긴급 의뢰가 아예 없다 (일정·축제 모두)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(urgentEnabled()).toBe(false);
    for (let h = 0; h < 48; h++) expect((await urgentPublic(Date.UTC(2026, 10, 16, h))).body.ev).toBeNull();
    expect(await festivalOn()).toBe(false);
    vi.stubEnv("URGENT_ENABLED", "1");
    expect(urgentEnabled()).toBe(true);
    vi.stubEnv("URGENT_ENABLED", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect(urgentEnabled()).toBe(true);
  });

  it("11/15 150%에 닿으면 그 순간 끝난다: 끝 시각·끝 공지, 그 뒤 납품은 막고(가방 그대로) 보상은 바로, 마감 칭호는 150%를 채운 사람 (11/18 배달왕은 1등 한 사람만)", async () => {
    const ev = urgentSchedule(addDays(DAY, 2), env.sessionSecret())[0];
    const goal = urgentGoal(ev.kind, URGENT_REF_ONLINE);
    // 11/16~11/18에 상한을 정해 연 의뢰 흉내 (11/19부터 새 의뢰는 상한 없음 — 저장된 상한은 끝날 때까지 그대로)
    const cap = Math.ceil(goal * URGENT_CAP_SHARE);
    await urgentStore().setGoal(ev.id, goal, cap);
    const target = Math.ceil((goal * 3) / 2);
    // 상한까지씩 여러 사람이 채우고 (마지막 사람은 남은 만큼), 150%까지 1개 남았을 때 끝판왕이 1개
    const helpers: string[] = [];
    let n = 0;
    while (n < target - 1) {
      const a = await newAcct(`거든손${helpers.length}`, ev.start);
      const k = Math.min(cap, target - 1 - n);
      await deliverUrgent(a, ev.id, await fill(a, ev, k), ev.start + 30_000 + helpers.length);
      helpers.push(a);
      n += k;
    }
    const fullHelpers = Math.floor((target - 1) / cap);
    expect(helpers.length).toBeGreaterThanOrEqual(5);
    const closer = await newAcct("끝판왕", ev.start);
    const lateComer = await newAcct("늦은손", ev.start);
    const t150 = ev.start + 60_000;
    const r = await deliverUrgent(closer, ev.id, await fill(closer, ev, 1), t150);
    expect(r.festUntil).toBe(t150 + FEST_MS);
    expect(r.cap).toBe(cap);
    // 남은 시간이 18분이 넘어도 끝난 것으로 (끝 시각 = 150%에 닿은 시각)
    const pub = await urgentPublic(t150 + 1_000);
    expect(pub.body.ev).toMatchObject({ end: t150, early: true, lastName: "끝판왕", lastFest: true, cap, kings: fullHelpers });
    expect(pub.cacheSec).toBe(15);
    expect((await urgentStore().state(ev.id)).a1).toBe(true);
    // 그 뒤 납품은 막는다 (가방은 그대로)
    const bag = await fill(lateComer, ev, 3);
    await expect(deliverUrgent(lateComer, ev.id, bag, t150 + 2_000)).rejects.toMatchObject({ code: "URGENT_DONE" });
    const snap = await getForageStore().snapshot(lateComer, DAY, 0);
    for (const [id, k] of Object.entries(bag)) expect(snap.bag[id] ?? 0).toBeGreaterThanOrEqual(k);
    expect((await urgentStore().state(ev.id)).n).toBe(target);
    // 내 것: 끝난 줄 (끝 시각도 150% 시각), 받을 보상이 바로 보이고 받을 수 있다
    const row = (await urgentMine(closer, t150 + 3_000)).rows.find((x) => x.id === ev.id)!;
    expect(row).toMatchObject({ done: true, end: t150, cap, left: cap - 1, reward: { stage: 150, last: true, king: false } });
    const c = await claimUrgent(closer, ev.id, t150 + 3_000);
    expect(c.claimed).toMatchObject({ stage: 150, last: true, king: false, pocket: true });
    // 11/18 공동 배달왕은 없다: 상한까지 낸 거든손들 중 먼저 닿은 1등 한 사람만 배달왕 (사이렌 모자·칭호)
    const kings: string[] = [];
    for (const h of helpers.slice(0, fullHelpers)) {
      const got = await claimUrgent(h, ev.id, t150 + 3_000);
      expect(got.claimed).toMatchObject({ stage: 150, last: false });
      if (got.claimed.king) {
        kings.push(h);
        expect((await getTitleStats().get(h)).urgKing).toBe(t150 + 3_000 + 24 * HOUR);
      }
    }
    expect(kings.length).toBeLessThanOrEqual(1);
    // 상한에 못 미친 마지막 거든손은 (1등이 아니면) 배달왕이 아니다
    if (helpers.length > fullHelpers) expect((await claimUrgent(helpers[fullHelpers], ev.id, t150 + 3_000)).claimed.king).toBe(false);
    expect((await getTitleStats().get(closer)).urgLast).toBe(t150 + 3_000 + 24 * HOUR);
    // 안 낸 사람은 여전히 받을 것이 없다
    await expect(claimUrgent(lateComer, ev.id, t150 + 3_000)).rejects.toMatchObject({ code: "NO_REWARD" });
  });

  it("11/19 새 의뢰는 한 사람 상한이 없다: 혼자 150%까지 내서 끝낼 수 있다", async () => {
    const ev = urgentSchedule(addDays(DAY, 4), env.sessionSecret())[0];
    const goal = urgentGoal(ev.kind, URGENT_REF_ONLINE);
    const target = Math.ceil((goal * 3) / 2);
    const solo = await newAcct("혼자손", ev.start);
    const r = await deliverUrgent(solo, ev.id, await fill(solo, ev, target), ev.start + 1_000);
    expect(r.mine).toBe(target);
    expect(r.cap).toBeUndefined();
    expect((await urgentPublic(ev.start + 2_000)).body.ev).toMatchObject({ n: target, early: true });
    expect((await urgentPublic(ev.start + 2_000)).body.ev!.cap).toBeUndefined();
  });

  it("11/16 한 사람 상한: 넘게 내면 URGENT_CAP(가방·막대 그대로, 남은 수 안내), 상한까지는 나눠 낼 수 있고, 내 줄에 상한·남은 수", async () => {
    const ev = urgentSchedule(addDays(DAY, 3), env.sessionSecret())[0];
    const goal = urgentGoal(ev.kind, URGENT_REF_ONLINE);
    // 11/16~11/18에 상한을 정해 연 의뢰 흉내 (저장된 상한은 그대로 지킨다)
    const cap = Math.ceil(goal * URGENT_CAP_SHARE);
    await urgentStore().setGoal(ev.id, goal, cap);
    const unit = URGENT_DEF[ev.kind].unit;
    const a = await newAcct("욕심손", ev.start);
    const b = await newAcct("보통손", ev.start);
    // 시작할 때 목표와 함께 상한도 정해져 저장된다
    expect((await urgentPublic(ev.start + 100)).body.ev).toMatchObject({ goal, cap, kings: 0 });
    expect(await urgentStore().state(ev.id)).toMatchObject({ goal, cap });
    // 혼자 상한보다 많이: 거절, 가방·막대 그대로
    const big = await fill(a, ev, cap + 5);
    const err = await deliverUrgent(a, ev.id, big, ev.start + 1_000).catch((e: { status: number; code: string; message: string }) => e);
    expect(err).toMatchObject({ status: 409, code: "URGENT_CAP", message: `이번 의뢰는 한 사람이 ${cap}${unit}까지 낼 수 있어요. 앞으로 ${cap}${unit} 더 낼 수 있어요.` });
    expect((await urgentStore().state(ev.id)).n).toBe(0);
    const snap = await getForageStore().snapshot(a, DAY, 0);
    for (const [id, k] of Object.entries(big)) expect(snap.bag[id] ?? 0).toBeGreaterThanOrEqual(k);
    // 상한 안에서 나눠 내기
    const first = Math.floor(cap / 2);
    const pickN = (k: number) => {
      const out: Record<string, number> = {};
      let rest = k;
      for (const [id, have] of Object.entries(big)) {
        const x = Math.min(have, rest);
        if (x > 0) out[id] = x;
        rest -= x;
        big[id] -= x;
      }
      return out;
    };
    const r1 = await deliverUrgent(a, ev.id, pickN(first), ev.start + 2_000);
    expect(r1).toMatchObject({ mine: first, cap });
    expect((await urgentMine(a, ev.start + 2_100)).rows.find((x) => x.id === ev.id)).toMatchObject({ mine: first, cap, left: cap - first, done: false });
    await expect(deliverUrgent(a, ev.id, pickN(cap - first + 1), ev.start + 3_000)).rejects.toMatchObject({
      code: "URGENT_CAP",
      message: `이번 의뢰는 한 사람이 ${cap}${unit}까지 낼 수 있어요. 앞으로 ${cap - first}${unit} 더 낼 수 있어요.`,
    });
    // 거절된 만큼 가방에 그대로 있으니 되돌려 센다
    Object.assign(big, (await getForageStore().snapshot(a, DAY, 0)).bag);
    expect((await deliverUrgent(a, ev.id, pickN(cap - first), ev.start + 4_000)).mine).toBe(cap);
    await expect(deliverUrgent(a, ev.id, pickN(1), ev.start + 5_000)).rejects.toMatchObject({ code: "URGENT_CAP", message: `이번 의뢰는 한 사람이 ${cap}${unit}까지 낼 수 있어요. 낼 만큼 다 냈어요.` });
    expect((await urgentMine(a, ev.start + 5_100)).rows.find((x) => x.id === ev.id)).toMatchObject({ mine: cap, left: 0 });
    // 다른 사람은 상관없이 낸다. 상한까지 낸 사람 수(공동 배달왕)가 상태에 보인다
    await deliverUrgent(b, ev.id, await fill(b, ev, 2), ev.start + 6_000);
    expect((await urgentPublic(ev.start + 6_100)).body.ev).toMatchObject({ n: cap + 2, cap, kings: 1 });
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
      takeInv: () => true,
      addStamps: () => 0,
      grantTimed: () => undefined,
      setTitleUntil: () => undefined,
      dexAdd: () => false,
    };
    const s = new MemoryUrgentStore(() => deps);
    const args = { goal: 10, cap: 0, end: 2_000, now: 1_000, frac: 0.1, lastFrom: 1_940 };
    expect(await s.deliver("x", "a", "에이", { f_crucian: 3 }, args)).toEqual({ status: "bag" });
    expect((await s.state("x")).n).toBe(0);
    expect(await s.deliver("x", "a", "에이", { f_crucian: 2 }, args)).toMatchObject({ status: "ok", n: 2, mine: 2 });
    expect(await s.setGoal("x", 10, 3)).toEqual({ goal: 10, cap: 3 });
    expect(await s.setGoal("x", 99, 50)).toEqual({ goal: 10, cap: 3 });
    expect(await s.mark("x", "a0")).toBe(true);
    expect(await s.mark("x", "a0")).toBe(false);
    // 11/15 150%(목표 10 → 15)를 넘기면 fest·festBy가 남고, 그 뒤 납품은 done (가방도 막대도 그대로)
    bag = { f_crucian: 20 };
    expect(await s.deliver("x", "b", "비", { f_crucian: 14 }, { ...args, now: 1_500 })).toMatchObject({ status: "ok", n: 16, fest: 1_500 });
    expect(await s.state("x")).toMatchObject({ fest: 1_500, festBy: "b" });
    expect(await s.deliver("x", "a", "에이", { f_crucian: 1 }, { ...args, now: 1_600 })).toEqual({ status: "done" });
    expect(bag.f_crucian).toBe(6);
    expect((await s.state("x")).n).toBe(16);
    void urgentStore;
  });

  it("11/16 메모리 저장소 계약: 한 사람 상한 (넘으면 cap — 가방·막대·순위 그대로), 시험(free)은 상한을 안 본다, 목표만 있던 의뢰엔 상한을 끼워 넣지 않는다", async () => {
    let bag: Record<string, number> = { f_crucian: 50 };
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
      takeInv: () => true,
      addStamps: () => 0,
      grantTimed: () => undefined,
      setTitleUntil: () => undefined,
      dexAdd: () => false,
    };
    const s = new MemoryUrgentStore(() => deps);
    const { goal, cap } = await s.setGoal("y", 40, 10);
    const args = { goal, cap, end: 2_000, now: 1_000, frac: 0.1, lastFrom: 1_940 };
    expect(await s.deliver("y", "a", "에이", { f_crucian: 11 }, args)).toEqual({ status: "cap", left: 10 });
    expect(bag.f_crucian).toBe(50);
    expect(await s.state("y")).toMatchObject({ n: 0, cap: 10 });
    expect(await s.top("y", 3)).toEqual([]);
    expect(await s.deliver("y", "a", "에이", { f_crucian: 7 }, args)).toMatchObject({ status: "ok", mine: 7 });
    expect(await s.deliver("y", "a", "에이", { f_crucian: 4 }, args)).toEqual({ status: "cap", left: 3 });
    expect(await s.deliver("y", "a", "에이", { f_crucian: 3 }, args)).toMatchObject({ status: "ok", mine: 10 });
    expect(await s.deliver("y", "a", "에이", { f_crucian: 1 }, args)).toEqual({ status: "cap", left: 0 });
    expect(await s.capped("y", cap)).toBe(1);
    // 가방이 모자라도 상한이 먼저 (어느 쪽이든 아무것도 안 바뀐다)
    expect(await s.deliver("y", "b", "비", { f_crucian: 99 }, args)).toEqual({ status: "cap", left: 10 });
    expect(await s.deliver("y", "b", "비", { f_crucian: 9 }, args)).toMatchObject({ status: "ok", mine: 9 });
    expect(await s.capped("y", cap)).toBe(1);
    expect(bag.f_crucian).toBe(31);
    // 시험(free): 상한을 보지 않는다
    expect(await s.deliver("y", "op", "운영", { test: 25 }, { ...args, free: true })).toMatchObject({ status: "ok", mine: 25 });
    expect(await s.capped("y", cap)).toBe(2);
    // 그 전 코드가 목표만 정해 둔 의뢰: setGoal이 상한을 끼워 넣지 않는다 → 상한 0 (예전 규칙)
    (s as unknown as { evs: Map<string, Record<string, string>> }).evs.set("old", { goal: "100" });
    expect(await s.setGoal("old", 160, 40)).toEqual({ goal: 100, cap: 0 });
    expect((await s.state("old")).cap).toBe(0);
  });

  it("11/16 Redis Lua도 같은 계약: 상한 검사는 가방을 빼기 전, 시험(free)은 안 보고, 목표를 처음 쓸 때만 상한을 쓴다 (명령 수는 그대로)", () => {
    const capAt = URGENT_DELIVER_LUA.indexOf("return {'cap'");
    expect(capAt).toBeGreaterThan(0);
    expect(capAt).toBeLessThan(URGENT_DELIVER_LUA.indexOf("return {'bag'}"));
    // 11/22 가방 빼기는 종 단위 bagTake (store BAG_TAKE_LUA — 대물·월척 칸도 그 종, 보통부터)
    expect(capAt).toBeLessThan(URGENT_DELIVER_LUA.indexOf("bagTake(KEYS[4]"));
    expect(URGENT_DELIVER_LUA).toMatch(/if not free and cap > 0 and had \+ add > cap then/);
    // 예전 스크립트와 같은 redis.call 수 (ZSCORE를 앞으로 옮겼을 뿐. 11/22 HGET·HINCRBY·HDEL이 BAG_TAKE_LUA의 HMGET·HINCRBY·HDEL로)
    expect(URGENT_DELIVER_LUA.match(/redis\.call\(/g)).toHaveLength(16);
    expect(URGENT_GOAL_LUA).toMatch(/if redis\.call\('HSETNX', KEYS\[1\], 'goal', ARGV\[1\]\) == 1 then redis\.call\('HSET', KEYS\[1\], 'cap', ARGV\[2\]\) end/);
  });
});

describe("끝 확성기 (기록 + 실시간 + 시작 공지 바꿔 끼우기)", () => {
  /** 실시간 서버 흉내: /internal/say만 받아 기록한다 (나머지는 연결 실패) */
  function fakeSay() {
    const said: InternalSay[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes("/internal/say")) throw new Error("offline");
        const r = await verifyInternal(env.joinSecret(), String(init?.body ?? ""), new Headers(init?.headers).get("X-Tomb-Internal"));
        if (r?.op !== "say") return new Response("not found", { status: 404 });
        said.push(r);
        return Response.json({ sent: 1 });
      }),
    );
    return said;
  }
  const listed = async () => {
    const megaphone = await import("@/app/api/megaphone/route");
    const res = await megaphone.GET(new NextRequest("http://localhost/api/megaphone?channel=1"));
    return ((await res.json()) as { entries: { id: string; text: string; system?: true; replaces?: string }[] }).entries;
  };

  it("0개로 끝나면 '아무도 오지 않은 채' 끝 공지가 시작 공지를 바꿔 끼우고, 시작·끝 모두 실시간 서버로 바로 보낸다", async () => {
    const said = fakeSay();
    const now = Date.now();
    const op = await newAcct("공지운영자", now);
    await setStaff(op, now);
    const t = await testStartUrgent(op, "dig", now);
    const goal = urgentGoal("dig", URGENT_REF_ONLINE);
    await urgentPublic(now + 100);
    const a0 = urgentNoticeId(t.id, "a0");
    const a1 = urgentNoticeId(t.id, "a1");
    // 앞 시험들이 남긴 공지도 늦게 올 수 있어 이 의뢰 것만 본다
    const mineSaid = () => said.filter((x) => x.id.startsWith(`urg-${t.id}-`));
    await vi.waitFor(() => expect(mineSaid().map((x) => x.id)).toEqual([a0]));
    expect(mineSaid()[0].text).toMatch(/\(20분\)$/);
    expect((await listed()).map((e) => e.id)).toContain(a0);

    await testEndUrgent(op, false, now + 1_000);
    await urgentPublic(now + 1_500);
    await urgentPublic(now + 2_000); // 두 번 물어도 끝 공지는 한 번
    const rec = (await getMegaphone().recent(100)).find((r) => r.id === a1)!;
    expect(rec).toMatchObject({ text: `긴급 의뢰(발굴품 ${goal}개)는 아무도 오지 않은 채 끝났어요.`, replaces: a0, name: "공지" });
    await vi.waitFor(() => expect(mineSaid().map((x) => x.id)).toEqual([a0, a1]));
    expect(mineSaid()[1]).toMatchObject({ replaces: a0, name: "공지", text: rec.text });
    // 확성기 목록에서는 시작 공지("(20분)")가 빠지고 끝 공지만
    const ids = (await listed()).map((e) => e.id);
    expect(ids).toContain(a1);
    expect(ids).not.toContain(a0);
    await setStaff(null, now);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });

  it("일부 채우고 끝나면 '목표의 50%를 채웠어요!' 끝 공지", async () => {
    const said = fakeSay();
    const now = Date.now() + 10_000;
    const op = await newAcct("공지운영자2", now);
    await setStaff(op, now);
    const t = await testStartUrgent(op, "fish", now);
    const goal = urgentGoal("fish", URGENT_REF_ONLINE);
    await testAddUrgent(op, 50, now + 500);
    await testEndUrgent(op, false, now + 1_000);
    await urgentPublic(now + 1_500);
    const a1 = urgentNoticeId(t.id, "a1");
    await vi.waitFor(() => expect(said.map((x) => x.id)).toContain(a1));
    expect(said.find((x) => x.id === a1)!.text).toBe(`긴급 의뢰(생선 ${goal}마리)가 끝났어요. 목표의 50%를 채웠어요! 낸 사람은 게시판에서 보상을 받아요.`);
    await setStaff(null, now);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });

  it("11/15 시험 막대로 150%를 채우면 일찍 끝난 공지가 시작 공지를 바꿔 끼우고, 더 더하면 URGENT_DONE", async () => {
    const said = fakeSay();
    const now = Date.now() + 20_000;
    const op = await newAcct("공지운영자3", now);
    await setStaff(op, now);
    const t = await testStartUrgent(op, "fish", now);
    const goal = urgentGoal("fish", URGENT_REF_ONLINE);
    await urgentPublic(now + 100);
    await testAddUrgent(op, 150, now + 500);
    await expect(testAddUrgent(op, 10, now + 600)).rejects.toMatchObject({ code: "URGENT_DONE" });
    const pub = await urgentPublic(now + 700);
    expect(pub.body.ev).toMatchObject({ end: now + 500, early: true });
    const a1 = urgentNoticeId(t.id, "a1");
    await vi.waitFor(() => expect(said.map((x) => x.id)).toContain(a1));
    expect(said.find((x) => x.id === a1)).toMatchObject({
      text: `긴급 의뢰(생선 ${goal}마리)가 목표의 150%를 채워서 일찍 끝났어요! 낸 사람은 게시판에서 보상을 받아요.`,
      replaces: urgentNoticeId(t.id, "a0"),
    });
    // 바로 받는다 (시험 운영자가 낸 것으로 센다)
    expect((await claimUrgent(op, t.id, now + 800)).claimed).toMatchObject({ stage: 150 });
    await setStaff(null, now);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
  });
});

describe("11/16 주머니 물고기 도감", () => {
  it("지난 주머니(이미 연 것)의 물고기를 도감에 없을 때만 적고, 두 번 돌려도 그대로", async () => {
    const now = Date.now();
    const id = `${gameDay(now)}-0`;
    // 내용물은 (의뢰, 계정) 시드 → 물고기가 나오는 계정을 찾는다
    let a = "";
    for (let i = 0; i < 400 && !a; i++) {
      const c = await newAcct(`주${i}`, now);
      if (openBox(`${id}|${c}`).kind === "fish") a = c;
    }
    expect(a).not.toBe("");
    const fish = (openBox(`${id}|${a}`) as { id: string }).id;
    const st = urgentStore();
    const plan = { record: JSON.stringify({ stage: 100, stamps: 3, box: null, pocket: true, king: false, last: false, at: now }), stamps: 0, stampCap: 99, pocket: URGENT_POCKET, hat: null, now, kingUntil: 0, lastUntil: 0 };
    expect((await st.claim(id, a, plan)).status).toBe("ok");
    // 아직 안 연 주머니는 건드리지 않는다
    expect((await backfillPocketDex(now)).added.find((x) => x.acct === a)).toBeUndefined();
    // 예전 방식으로 연 것처럼 (도감엔 안 적힌 채)
    await st.openPocket(a, { id, pocket: URGENT_POCKET, stamps: 0, stampCap: 99, dye: "", fish, fishFallback: 0, stackMax: STACK_MAX });
    expect((await getForageStore().dexEntries(a))[fish]).toBeUndefined();
    expect((await backfillPocketDex(now)).added).toContainEqual({ acct: a, fish });
    const e = (await getForageStore().dexEntries(a))[fish];
    expect(e).toMatchObject({ n: 1, first: gameDay(now) });
    expect(e.max).toBeGreaterThan(0);
    expect((await backfillPocketDex(now)).added.find((x) => x.acct === a)).toBeUndefined();
    expect((await getForageStore().dexEntries(a))[fish].n).toBe(1);
  });
});

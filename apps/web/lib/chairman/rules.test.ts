import { describe, expect, it } from "vitest";
import { weekEndMs, weekStartMs } from "../gameDay";
import { raceClock } from "../raceClock";
import { chairPayouts, chairRankPoints } from "./rewards";
import {
  CHAIR_FAIR_DIV,
  CHAIR_UNFAIR_TEXT,
  chairBossStats,
  chairDamageCap,
  chairEff,
  chairFloorText,
  chairPhase,
  chairPoints,
  chairSealedCount,
  chairSealOrder,
  chairSealPool,
  chairThreat,
  chairTimePoints,
  checkChairFinish,
  CHAIR_FIRST_WEEK,
  chairQuitNote,
  chairWeek,
} from "./rules";

// 회장님 독대 순수 규칙: 세기 곡선 · 포인트(크런치 두 배·상한·30% 검사) · 판 끝 검사 · 지옥 봉인 순서 · 주간 보상 나누기

const MIN = 60_000;

describe("세기 곡선 · 페이즈", () => {
  it("일반 0~5분 1+0.2t, 그 뒤 2×1.35^(t−5) · 지옥 0.7+0.14t, 1.4×1.35^(t−5)", () => {
    expect(chairThreat("normal", 0)).toBe(1);
    expect(chairThreat("normal", 2.5 * MIN)).toBeCloseTo(1.5);
    expect(chairThreat("normal", 5 * MIN)).toBeCloseTo(2);
    expect(chairThreat("normal", 7 * MIN)).toBeCloseTo(2 * 1.35 ** 2);
    expect(chairThreat("hell", 5 * MIN)).toBeCloseTo(1.4);
    expect(chairThreat("hell", 6 * MIN)).toBeCloseTo(1.4 * 1.35);
  });
  it("1분마다 페이즈 0..4, 5분부터 크런치(5)", () => {
    expect(chairPhase(0)).toBe(0);
    expect(chairPhase(MIN - 1)).toBe(0);
    expect(chairPhase(MIN)).toBe(1);
    expect(chairPhase(4.5 * MIN)).toBe(4);
    expect(chairPhase(5 * MIN)).toBe(5);
  });
});

describe("포인트", () => {
  it("11/21 분당 노멀 40·헬 70, 크런치(5분)부터 두 배, 판 상한 400·700", () => {
    expect(chairTimePoints("normal", 5 * MIN)).toBe(200);
    expect(chairTimePoints("normal", 6 * MIN)).toBe(280);
    expect(chairTimePoints("normal", 7 * MIN)).toBe(360);
    expect(chairTimePoints("normal", 7.5 * MIN)).toBe(400);
    expect(chairTimePoints("normal", 20 * MIN)).toBe(400);
    expect(chairTimePoints("hell", 5 * MIN)).toBe(350);
    expect(chairTimePoints("hell", 6 * MIN)).toBe(490);
    expect(chairTimePoints("hell", 7 * MIN)).toBe(630);
    expect(chairTimePoints("hell", 20 * MIN)).toBe(700);
  });
  it("평균 초당 피해가 캐릭터 최대의 30% 아래면 0 + 사유, 연습 판은 0", () => {
    const dm = 30_000; // 30% 기준 = 0.3 × 30000 / 30 = 300/초
    const sec = 300;
    expect(CHAIR_FAIR_DIV).toBe(30);
    expect(chairPoints({ mode: "normal", practice: false, damage: 299 * sec, durationMs: sec * 1000, maxDps: dm })).toEqual({ points: 0, reason: CHAIR_UNFAIR_TEXT });
    expect(chairPoints({ mode: "normal", practice: false, damage: 301 * sec, durationMs: sec * 1000, maxDps: dm })).toEqual({ points: 200 });
    expect(chairPoints({ mode: "hell", practice: true, damage: 1e9, durationMs: sec * 1000, maxDps: dm })).toEqual({ points: 0 });
  });
  it("30% 기준은 회장님 방어·내 명중 몫(eff)만큼 낮춘다 (dealCap은 방어를 안 본다)", () => {
    const b = chairBossStats();
    expect(b.def).toBeGreaterThan(0);
    const eff = chairEff(b.flee);
    expect(eff).toBeGreaterThan(0);
    expect(eff).toBeLessThan(1);
    const sec = 300;
    // 30% 기준 300/초 × eff
    expect(chairPoints({ mode: "normal", practice: false, damage: Math.ceil(301 * eff) * sec, durationMs: sec * 1000, maxDps: 30_000, eff })).toEqual({ points: 200 });
    expect(chairPoints({ mode: "normal", practice: false, damage: Math.floor(299 * eff) * sec, durationMs: sec * 1000, maxDps: 30_000, eff })).toMatchObject({ points: 0 });
  });
});

describe("판 끝 검사", () => {
  const ok = { damage: 1000, durationMs: 60_000, ageMs: 61_000, maxDps: 100 };
  it("피해 상한 = 최대 초당 피해 × 3 × 판 시간", () => {
    expect(chairDamageCap(100, 60_000)).toBe(18_000);
    expect(checkChairFinish({ ...ok, damage: 18_000 }).ok).toBe(true);
    expect(checkChairFinish({ ...ok, damage: 18_001 })).toMatchObject({ ok: false });
  });
  it("판 시간은 20분까지 · 티켓 나이 + 여유까지", () => {
    expect(checkChairFinish({ ...ok, durationMs: 20 * MIN, ageMs: 21 * MIN }).ok).toBe(true);
    expect(checkChairFinish({ ...ok, durationMs: 20 * MIN + 1, ageMs: 21 * MIN }).ok).toBe(false);
    expect(checkChairFinish({ ...ok, durationMs: 60_000, ageMs: 50_000 }).ok).toBe(false);
  });
});

describe("지옥 봉인", () => {
  const pool = ["wk_leap", "em_stoke", "fr_mist", "ult_x", "wk_tireless"];
  const flat = () => ({ lv: 1, tier: 1 });
  it("동률이면 같은 시드·같은 풀은 늘 같은 순서 (풀 순서와 무관), 시드가 다르면 대체로 다르다", () => {
    const a = chairSealOrder(12345, pool, flat);
    expect(chairSealOrder(12345, [...pool].reverse(), flat)).toEqual(a);
    expect([...a].sort()).toEqual([...pool].sort());
    const others = [1, 2, 3, 4, 5].map((s) => chairSealOrder(s, pool, flat).join());
    expect(new Set(others).size).toBeGreaterThan(1);
  });
  it("한 갈래만 있으면 랭크 높은 순 → 같으면 단 높은 순, 1랭크를 잔뜩 찍어도 맨 뒤", () => {
    const lv: Record<string, [number, number]> = { hi: [10, 1], midT3: [5, 3], midT1: [5, 1], ult: [3, 5], p1: [1, 1], p2: [1, 2], p3: [1, 1], p4: [1, 1] };
    const rank = (id: string) => ({ lv: lv[id][0], tier: lv[id][1] });
    for (const seed of [1, 7, 99, 12345]) {
      const o = chairSealOrder(seed, Object.keys(lv), rank);
      expect(o.slice(0, 5)).toEqual(["hi", "midT3", "midT1", "ult", "p2"]);
      expect(o.slice(5).sort()).toEqual(["p1", "p3", "p4"]);
      expect(chairSealOrder(seed, Object.keys(lv).reverse(), rank)).toEqual(o);
    }
  });
  // 11/21 패시브 70% 먼저: 액티브 a10·a5·a1x2, 패시브 s9·s4·s1x2
  const mix: Record<string, [number, number, boolean]> = { a10: [10, 1, false], a5: [5, 1, false], a1x: [1, 1, false], a1y: [1, 1, false], s9: [9, 1, true], s4: [4, 1, true], s1x: [1, 1, true], s1y: [1, 1, true] };
  const mixRank = (id: string) => ({ lv: mix[id][0], tier: mix[id][1], passive: mix[id][2] });
  it("섞이면 갈래 안에서는 늘 높은 레벨부터, 1랭크 채우기는 갈래 맨 뒤 · 같은 시드면 같은 순서", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const o = chairSealOrder(seed, Object.keys(mix), mixRank);
      expect([...o].sort()).toEqual(Object.keys(mix).sort());
      const act = o.filter((id) => !mix[id][2]);
      const pas = o.filter((id) => mix[id][2]);
      expect(act.slice(0, 2)).toEqual(["a10", "a5"]);
      expect(pas.slice(0, 2)).toEqual(["s9", "s4"]);
      expect(chairSealOrder(seed, Object.keys(mix).reverse(), mixRank)).toEqual(o);
    }
  });
  it("앞 10개 중 패시브는 평균 7개쯤 (70% 몫 — 패시브 14 · 액티브 6)", () => {
    const real: Record<string, boolean> = {};
    for (let i = 0; i < 14; i++) real[`p${i}`] = true;
    for (let i = 0; i < 6; i++) real[`a${i}`] = false;
    const rank = (id: string) => ({ lv: 5, tier: 1, passive: real[id] });
    let sum = 0;
    for (let seed = 1; seed <= 3000; seed++) sum += chairSealOrder(seed * 7919, Object.keys(real), rank).slice(0, 10).filter((id) => real[id]).length;
    expect(sum / 3000).toBeGreaterThan(6.5);
    expect(sum / 3000).toBeLessThan(7.5);
  });
  it("11/22 몫: 둘 다 남은 동안 앞 n개 중 액티브는 floor(0.3n + 0.3)개를 넘지 않는다 → 앞 셋은 패시브, 앞 7개 중 패시브 다섯 이상 (패시브 14 · 액티브 6, 시드 5000개)", () => {
    const real: Record<string, boolean> = {};
    for (let i = 0; i < 14; i++) real[`p${i}`] = true;
    for (let i = 0; i < 6; i++) real[`a${i}`] = false;
    const rank = (id: string) => ({ lv: 5, tier: 1, passive: real[id] });
    let first7Pas = 99;
    for (let seed = 1; seed <= 5000; seed++) {
      const o = chairSealOrder(seed * 104729, Object.keys(real), rank);
      let a = 0;
      let p = 0;
      o.forEach((id, i) => {
        if (real[id]) p++;
        else a++;
        if (p < 14) expect(a).toBeLessThanOrEqual(Math.floor(0.3 * (i + 1) + 0.3));
      });
      first7Pas = Math.min(first7Pas, o.slice(0, 7).filter((id) => real[id]).length);
      // 앞 셋은 늘 패시브
      expect(o.slice(0, 3).every((id) => real[id])).toBe(true);
    }
    expect(first7Pas).toBeGreaterThanOrEqual(5);
  });
  it("풀 = 단축키(궁극기 포함) + 배운 패시브, 45초마다 하나", () => {
    const p = chairSealPool(["a", null, "b", "ult"], { a: 3, pas1: 2, pas0: 0, act: 5 }, (id) => id.startsWith("pas"));
    expect(p.sort()).toEqual(["a", "b", "pas1", "ult"]);
    expect(chairSealedCount(44_999, 4)).toBe(0);
    expect(chairSealedCount(45_000, 4)).toBe(1);
    expect(chairSealedCount(20 * MIN, 4)).toBe(4);
  });
});

describe("주간 보상 나누기", () => {
  it("1·2·3위 5,000/3,000/2,000, 3주 연속 1위부터 절반", () => {
    expect([1, 2, 3].map((r) => chairRankPoints(r, 1))).toEqual([5000, 3000, 2000]);
    expect(chairRankPoints(1, 2)).toBe(5000);
    expect(chairRankPoints(1, 3)).toBe(2500);
  });
  it("두 모드면 큰 쪽 하나: 바로 줄 몫(2·3위)을 먼저, 1위가 더 크면 차이만 인정 뒤에", () => {
    const pay = chairPayouts({ normal: ["a", "b", "c"], hell: ["b", "d", "a"] }, () => 1);
    const by = Object.fromEntries(pay.map((p) => [p.accountId, p]));
    expect(by.a).toMatchObject({ now: 2000, pending: 3000, ranks: { normal: 1, hell: 3 } });
    expect(by.b).toMatchObject({ now: 3000, pending: 2000 });
    expect(by.c).toMatchObject({ now: 2000, pending: 0 });
    expect(by.d).toMatchObject({ now: 3000, pending: 0 });
    // 두 모드 1위 (한쪽은 연속으로 절반) → 큰 쪽 5,000만
    const both = chairPayouts({ normal: ["a"], hell: ["a"] }, (m) => (m === "normal" ? 3 : 1));
    expect(both[0]).toMatchObject({ now: 0, pending: 5000, streak: ["normal"] });
  });
});

it("자격 문구", () => {
  expect(chairFloorText(87)).toBe("잼민이는 회장실에 못 들어가요. 주니어는 주니어답게, 야근 빌딩 100층부터 찍고 오세요. 지금 87층이에요.");
});

describe("11/22 첫 순위 주 · 나가기 안내", () => {
  it("chairWeek: 첫 주 전은 첫 주로, 그 뒤는 게임 주 그대로 · 남은 시간 줄도 첫 주 끝(11/30 05:00)", () => {
    expect(CHAIR_FIRST_WEEK).toBe("20261123");
    const sun = weekStartMs("20261116") + 6 * 86_400_000 + 12 * 3_600_000; // 11/22(일) 17시
    expect(chairWeek(sun)).toBe("20261123");
    expect(chairWeek(weekStartMs("20261123") - 1)).toBe("20261123");
    expect(chairWeek(weekStartMs("20261123"))).toBe("20261123");
    expect(chairWeek(weekEndMs("20261123"))).toBe("20261130");
    const c = raceClock(sun, chairWeek);
    expect(c.endsAt).toBe(weekEndMs("20261123"));
    expect(c.endLine).toBe("이번 레이스는 7일 12시간 뒤에 끝나요");
    expect(c.nextLine).toBe("다음 레이스는 11월 30일 월요일 새벽 5시에 시작해요");
    // 일반 주간 레이스는 그대로
    expect(raceClock(sun).nextLine).toBe("다음 레이스는 11월 23일 월요일 새벽 5시에 시작해요");
  });

  it("브리핑 멈춤 창 나가기 안내", () => {
    expect(chairQuitNote({ practice: false, refundLeft: 1 })).toBe("아직 시작 전이에요. 지금 나가면 오늘 판을 돌려드려요. 하루에 한 번만 돼요.");
    expect(chairQuitNote({ practice: false, refundLeft: 0 })).toBe("아직 시작 전이에요. 오늘은 이미 한 번 돌려받아서, 지금 나가면 판을 쓴 것으로 쳐요.");
    expect(chairQuitNote({ practice: true, refundLeft: 1 })).toBe("아직 시작 전이에요. 나가면 마을로 가요.");
    expect(chairQuitNote({ practice: false, refundLeft: 1, late: true })).toBe("아직 시작 전이에요. 시간이 지나서 지금 나가면 판을 쓴 것으로 쳐요.");
  });
});

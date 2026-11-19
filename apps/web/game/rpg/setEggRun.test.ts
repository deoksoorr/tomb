import { describe, expect, it } from "vitest";
import { GEAR_SLOTS, type GearSlot } from "@/lib/rpg/catalog";
import { encodeSg, SG_EGG_BIT, SG_EGG_FX, SG_SETS, type SgSet } from "@/lib/rpg/setGear";
import { SetEggRun } from "./setEggRun";

// 11/19 숨겨진 5세트 효과 (판 하나): 언제 켜지나 · 처음 켜진 세트만 「발견!」 · 마일리지 한 번 +30%

const wear = (set: SgSet, n = 5): Record<GearSlot, string | null> =>
  Object.fromEntries(GEAR_SLOTS.map((slot, i) => [slot, i < n ? encodeSg({ s: SG_SETS.indexOf(set), p: i, g: 2, u: i + 1, e: 0, o: [], L: 0, rr: 0, f: 0 }) : null])) as Record<GearSlot, string | null>;

describe("SetEggRun", () => {
  it("다섯 부위가 아니면 아무것도 안 한다", () => {
    const r = new SetEggRun(wear("overtime", 4), 0, () => 0);
    expect(r.any).toBe(false);
    expect(r.leave(5_000)).toEqual({ mul: 1, start: false });
    expect([r.stamp(1), r.talk(1), r.walk(99_999)]).toEqual([false, false, false]);
    expect(r.hitMul(1, true)).toBe(1);
    expect(r.takeFound()).toEqual([]);
  });

  it("칼퇴 본능: 남은 10초부터 이동 +20%·말풍선은 층마다 한 번, 「발견!」은 처음 한 번만", () => {
    const r = new SetEggRun(wear("overtime"));
    expect(r.leave(15_000)).toEqual({ mul: 1, start: false });
    expect(r.leave(SG_EGG_FX.leaveMs)).toEqual({ mul: 1 + SG_EGG_FX.leaveMove, start: true });
    expect(r.leave(8_000)).toEqual({ mul: 1 + SG_EGG_FX.leaveMove, start: false });
    expect(r.takeFound()).toEqual(["overtime"]);
    // 엘리베이터 중엔 재지 않는다 → 다음 층 (시간이 다시 늘면 꺼졌다가 10초에 다시 켜진다)
    expect(r.leave(3_000, true).start).toBe(false);
    expect(r.leave(40_000)).toEqual({ mul: 1, start: false });
    expect(r.leave(9_000).start).toBe(true);
    expect(r.takeFound()).toEqual([]);
    // 시간이 다 되면 꺼진다
    expect(r.leave(0).mul).toBe(1);
  });

  it("이미 발견한 세트(캐릭터 sgEgg)는 다시 알리지 않는다", () => {
    const r = new SetEggRun(wear("overtime"), SG_EGG_BIT.overtime);
    expect(r.leave(5_000).start).toBe(true);
    expect(r.takeFound()).toEqual([]);
  });

  it("도장 쾅: 치명타마다 확률로, 찍으면 잠깐 쉰다", () => {
    let roll = 0;
    const r = new SetEggRun(wear("approval"), 0, () => roll);
    expect(r.stamp(1_000)).toBe(true);
    expect(r.stamp(1_000 + SG_EGG_FX.stampCdMs - 1)).toBe(false);
    expect(r.stamp(1_000 + SG_EGG_FX.stampCdMs)).toBe(true);
    roll = SG_EGG_FX.stampChance;
    expect(r.stamp(99_000)).toBe(false);
    expect(r.takeFound()).toEqual(["approval"]);
    expect(r.icon("approval")).toEqual({ icon: { shape: "sg:102", main: 0, accent: 0 }, grade: 2 });
  });

  it("회의가 길어진다: 스킬마다 확률로, 쉬는 시간", () => {
    let roll = 0.99;
    const r = new SetEggRun(wear("meeting"), 0, () => roll);
    expect(r.talk(1_000)).toBe(false);
    roll = 0;
    expect(r.talk(1_000)).toBe(true);
    expect(r.talk(1_000 + SG_EGG_FX.talkCdMs - 1)).toBe(false);
    expect(r.talk(1_000 + SG_EGG_FX.talkCdMs)).toBe(true);
    expect(r.takeFound()).toEqual(["meeting"]);
  });

  it("마일리지 적립: 걸은 거리가 차면 다음 기본 공격(한 번 휘두름에 맞은 몬스터 모두) +30% 한 번, 스킬은 쓰지 않는다", () => {
    const r = new SetEggRun(wear("trip"));
    expect(r.walk(SG_EGG_FX.mileFull / 2)).toBe(false);
    expect(r.mileRatio()).toBeCloseTo(0.5);
    expect(r.hitMul(100, true)).toBe(1);
    expect(r.walk(SG_EGG_FX.mileFull)).toBe(true);
    expect(r.mileRatio()).toBe(1);
    expect(r.walk(10)).toBe(false);
    expect(r.takeFound()).toEqual(["trip"]);
    expect(r.hitMul(200, false)).toBe(1);
    expect(r.hitMul(300, true)).toBe(1 + SG_EGG_FX.tripHit);
    expect(r.hitMul(300, true)).toBe(1 + SG_EGG_FX.tripHit);
    expect(r.hitMul(301, true)).toBe(1);
    expect(r.mileRatio()).toBe(0);
    // 다시 차도 「발견!」은 한 번뿐
    r.walk(SG_EGG_FX.mileFull);
    expect(r.takeFound()).toEqual([]);
  });
});

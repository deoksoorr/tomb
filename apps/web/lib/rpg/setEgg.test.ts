import { describe, expect, it } from "vitest";
import { GEAR_SLOTS, type GearSlot } from "./catalog";
import { newCharacter, normalize } from "./character";
import { maxDealPerSec } from "./dealCap";
import { derive } from "./formulas";
import { EGG_SHOW_MS, eggProc } from "./procs";
import { activeSets, discoverEgg, eggKnown, encodeSg, SG_EGG, SG_EGG_ALL, SG_EGG_BIT, SG_EGG_FX, SG_PIECES, SG_SET_INFO, SG_SETS, sgCombat, sgCombatPower, type SgSet } from "./setGear";
import type { CharacterState } from "./types";

// 11/19 숨겨진 5세트 효과 (lib/rpg/setGear SG_EGG): 다섯 부위 판정 · 발견 비트 저장(옛 데이터 안전) · 성능 몫(아주 작게, 서버 상한에 포함) · 알림

const code = (set: SgSet, p: number, u: number) => encodeSg({ s: SG_SETS.indexOf(set), p, g: 0, u, e: 0, o: [], L: 0, rr: 0, f: 0 });
/** 칸 순서(무기·갑옷·머리·장신구 둘) = 부위 순서. pieces = 그 칸에 낄 부위 번호 (null = 빈 칸) */
function wear(set: SgSet, pieces: (number | null)[] = [0, 1, 2, 3, 4]): Record<GearSlot, string | null> {
  return Object.fromEntries(GEAR_SLOTS.map((slot, i) => [slot, pieces[i] === null || pieces[i] === undefined ? null : code(set, pieces[i]!, i + 1)])) as Record<GearSlot, string | null>;
}

describe("5세트 판정", () => {
  it("같은 세트 다섯 부위를 다 끼면 five, 넷이면 아니다. 장신구 두 칸에 같은 장신구면 네 부위", () => {
    expect(SG_PIECES).toHaveLength(5);
    for (const set of SG_SETS) {
      expect(activeSets(wear(set)).five).toEqual([set]);
      expect(activeSets(wear(set)).four).toEqual([set]);
      expect(activeSets(wear(set, [0, 1, 2, 3, null])).five).toEqual([]);
      expect(activeSets(wear(set, [0, 1, 2, 3, 3])).five).toEqual([]);
      expect(sgCombat(wear(set)).five).toEqual([set]);
    }
    // 섞어 끼면 없다
    const mixed = { ...wear("overtime"), acc2: code("trip", 4, 9) };
    expect(activeSets(mixed).five).toEqual([]);
    expect(sgCombat({}).five).toEqual([]);
  });
});

describe("숨김·공개 저장 (캐릭터 sgEgg 비트)", () => {
  it("발견은 지금 그 세트 다섯 부위를 다 꼈을 때만 켜지고, 다른 비트는 지킨다", () => {
    expect(SG_SETS.map((s) => SG_EGG_BIT[s])).toEqual([1, 2, 4, 8]);
    expect(discoverEgg(0, "overtime", wear("overtime"))).toBe(1);
    expect(discoverEgg(8, "approval", wear("approval"))).toBe(10);
    // 안 낀 세트·네 부위는 그대로
    expect(discoverEgg(8, "approval", wear("trip"))).toBe(8);
    expect(discoverEgg(0, "meeting", wear("meeting", [0, 1, 2, 3, null]))).toBe(0);
    // 이미 켜졌으면 그대로, 모르는 비트는 버린다
    expect(discoverEgg(1, "overtime", wear("overtime"))).toBe(1);
    expect(discoverEgg(0xff, "trip", {})).toBe(SG_EGG_ALL);
    expect(eggKnown(5, "overtime") && eggKnown(5, "meeting") && !eggKnown(5, "approval") && !eggKnown(undefined, "trip")).toBe(true);
  });

  it("옛 저장값(칸 없음)은 0 — 모두 「???」, 이상한 값은 버린다", () => {
    const old = { ...newCharacter() } as Partial<CharacterState>;
    delete old.sgEgg;
    expect(normalize(old as CharacterState).sgEgg).toBe(0);
    expect(normalize({ ...newCharacter(), sgEgg: 5 }).sgEgg).toBe(5);
    expect(normalize({ ...newCharacter(), sgEgg: 0x1f3 }).sgEgg).toBe(0x1f3 & SG_EGG_ALL);
    expect(normalize({ ...newCharacter(), sgEgg: -3 }).sgEgg).toBe(0);
    expect(normalize({ ...newCharacter(), sgEgg: "x" as unknown as number }).sgEgg).toBe(0);
    expect(normalize({ ...newCharacter(), sgEgg: 2.5 }).sgEgg).toBe(0);
  });
});

describe("효과 수치 (성능은 아주 작게, 서버 상한에 포함)", () => {
  it("이름·설명·알림이 세트마다 있고, 숫자는 작다", () => {
    for (const set of SG_SETS) {
      expect(SG_EGG[set].name.length).toBeGreaterThan(1);
      expect(SG_EGG[set].desc.length).toBeGreaterThan(10);
      const p = eggProc(set, { shape: "sg:000", main: 0, accent: 0 });
      expect(p).toMatchObject({ key: `sg:egg:${set}`, name: "숨겨진 세트 효과", tag: "발견!", ms: EGG_SHOW_MS });
      expect(p.line).toContain(SG_EGG[set].name);
      expect(p.left).toContain(SG_SET_INFO[set].name);
    }
    expect(Object.values(SG_EGG).map((x) => x.name)).toEqual(["칼퇴 본능", "도장 쾅", "회의가 길어진다", "마일리지 적립"]);
    expect(SG_EGG_FX.leaveMs).toBe(10_000);
    expect(SG_EGG_FX.leaveMove).toBeLessThanOrEqual(0.2);
    expect(SG_EGG_FX.stampFreezeMs).toBeLessThanOrEqual(300);
    expect(SG_EGG_FX.talkMs).toBeLessThanOrEqual(1_000);
    expect(SG_EGG_FX.tripHit).toBeLessThanOrEqual(0.3);
  });

  it("마일리지 적립은 쉬지 않고 걸으며 초당 2번 쳐도 평균 피해 +3% 아래", () => {
    const move = derive(50, newCharacter().stats, wear("trip")).move;
    const hitsPerFill = (SG_EGG_FX.mileFull / move) * 2;
    expect(SG_EGG_FX.tripHit / hitsPerFill).toBeLessThan(0.03);
  });

  it("서버 처치 속도 상한(sgCombatPower → dealCap·장비 힘)에 성능 몫이 들어간다: 출장 5세트만 ×1.3, 나머지는 연출이라 그대로", () => {
    const four = (set: SgSet) => sgCombatPower(wear(set, [0, 1, 2, 3, null]));
    expect(sgCombatPower(wear("trip")) / four("trip")).toBeCloseTo(1 + SG_EGG_FX.tripHit, 6);
    for (const set of ["overtime", "approval", "meeting"] as const) expect(sgCombatPower(wear(set))).toBeCloseTo(four(set), 6);
    // 판 시작 때 재는 초당 최대 피해도 그만큼 넉넉해진다 (다섯째 부위 능력치 몫까지)
    const stats = newCharacter().stats;
    expect(maxDealPerSec(50, stats, wear("trip"), {}) / maxDealPerSec(50, stats, wear("trip", [0, 1, 2, 3, null]), {})).toBeGreaterThanOrEqual(1 + SG_EGG_FX.tripHit - 1e-6);
  });
});

import { describe, expect, it } from "vitest";
import { CAMP_LOTS } from "./campHomes";
import {
  CARAVAN_AWNING_COUNT,
  CARAVAN_AWNING_NAMES,
  CARAVAN_COLOR_COUNT,
  CARAVAN_COLOR_NAMES,
  CARAVAN_MODELS,
  caravanDesignKey,
  caravanDesignName,
  caravanDesignOf,
  defaultCaravanDesign,
  isCaravanDesign,
  parseCaravanDesign,
  type CaravanDesign,
} from "./caravanDesign";

const ALL: CaravanDesign[] = CARAVAN_MODELS.flatMap((model) =>
  Array.from({ length: CARAVAN_COLOR_COUNT }, (_, color) => Array.from({ length: CARAVAN_AWNING_COUNT }, (_, awning) => ({ model, color, awning }))).flat(),
);

describe("카라반 디자인 (11/26)", () => {
  it("모델 3 × 몸통 색 4 × 차양 색 4 = 48가지, 이름이 다 있고 겹치지 않아요", () => {
    expect(ALL).toHaveLength(48);
    for (const m of CARAVAN_MODELS) {
      expect(CARAVAN_COLOR_NAMES[m]).toHaveLength(CARAVAN_COLOR_COUNT);
      expect(new Set(CARAVAN_COLOR_NAMES[m]).size).toBe(CARAVAN_COLOR_COUNT);
    }
    expect(new Set(CARAVAN_AWNING_NAMES).size).toBe(CARAVAN_AWNING_COUNT);
    expect(new Set(ALL.map(caravanDesignName)).size).toBe(48);
  });

  it("고르기 전 옛 카라반은 예전 자리 번호 규칙 그대로예요 (지금 주인 눈에 안 바뀐다)", () => {
    for (const l of CAMP_LOTS.filter((q) => q.kind === "caravan")) {
      const model = l.grade === "falls" ? "airstream" : l.grade === "river" ? "teardrop" : "bus";
      expect(defaultCaravanDesign(l.lot)).toEqual({ model, color: model === "teardrop" ? l.lot % 4 : l.lot % 2, awning: l.lot % 4 });
      expect(caravanDesignOf(l.lot)).toEqual(defaultCaravanDesign(l.lot));
      expect(caravanDesignOf(l.lot, null)).toEqual(defaultCaravanDesign(l.lot));
    }
  });

  it("범위 밖·모양이 틀린 값은 디자인이 아니에요 (그 자리 기본 모습)", () => {
    const bad: unknown[] = [
      null,
      "teardrop",
      { model: "van", color: 0, awning: 0 },
      { model: "bus", color: 4, awning: 0 },
      { model: "bus", color: -1, awning: 0 },
      { model: "bus", color: 1.5, awning: 0 },
      { model: "bus", color: 0, awning: 4 },
      { model: "bus", color: "1", awning: 0 },
      { model: "bus", color: 0 },
    ];
    for (const b of bad) {
      expect(isCaravanDesign(b)).toBe(false);
      expect(caravanDesignOf(2, b)).toEqual(defaultCaravanDesign(2));
    }
    for (const d of ALL) expect(caravanDesignOf(2, { ...d, extra: 1 })).toEqual(d);
  });

  it("저장 글자로 바꿨다 되읽어도 같아요 · 이상한 글자는 null", () => {
    for (const d of ALL) expect(parseCaravanDesign(caravanDesignKey(d))).toEqual(d);
    for (const s of [null, undefined, "", "bus", "bus.4.0", "bus.0.4", "van.0.0", "bus.a.0", "bus.0", "bus.-1.0"]) expect(parseCaravanDesign(s)).toBeNull();
  });
});

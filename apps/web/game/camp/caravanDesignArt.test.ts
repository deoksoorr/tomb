import { CAMP_LOTS, CARAVAN_AWNING_COUNT, CARAVAN_COLOR_COUNT, CARAVAN_MODELS, defaultCaravanDesign, type CampYard, type CaravanDesign } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import * as A from "./campHomeArt";
import { campHomePlan, planKey, type HomeState } from "./campHousingPlan";
import { campOf } from "./campSaleApi";

// 11/26 카라반 디자인 고르기: 모델 3 × 몸통 색 4 × 차양 색 4 그림 · 옛 카라반은 예전 그림 그대로 · 맵 그림 키에 디자인이 들어간다

const YARDS: CampYard[] = [1, 2, 3];
const ALL: CaravanDesign[] = CARAVAN_MODELS.flatMap((model) =>
  Array.from({ length: CARAVAN_COLOR_COUNT }, (_, color) => Array.from({ length: CARAVAN_AWNING_COUNT }, (_, awning) => ({ model, color, awning }))).flat(),
);
const CARAVANS = CAMP_LOTS.filter((l) => l.kind === "caravan");
const st = (o: Partial<HomeState> = {}): HomeState => ({ owned: true, yard: 1, wide: false, snowy: false, xmas: false, night: false, ...o });
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const dist = (a: number, b: number) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

describe("카라반 디자인 그림 (11/26)", () => {
  it("모델마다 몸통 색 4가지가 서로 또렷이 달라요 (에어스트림 색 띠·버스 몸통은 원래 둘 + 새로 둘)", () => {
    for (const m of CARAVAN_MODELS) {
      const sw = Array.from({ length: CARAVAN_COLOR_COUNT }, (_, i) => A.caravanBodySwatch(m, i));
      // 원래 있던 티어드롭 민트·하늘(48)도 지나가게 40, 새로 넣은 색(에어스트림·버스 2·3번)은 다른 색과 70 넘게
      for (let i = 0; i < sw.length; i++)
        for (let j = i + 1; j < sw.length; j++) expect(dist(sw[i], sw[j]), `${m} ${i}·${j}`).toBeGreaterThan(m !== "teardrop" && j >= 2 ? 70 : 40);
    }
    expect(A.AIR_ACCENT.slice(0, 2)).toEqual([0x3a5a8a, 0xc84a3a]);
    expect(A.BUS_PALS.slice(0, 2).map((p) => p.body)).toEqual([0x6cb0d4, 0x86b894]);
    expect(A.AWNING_COLORS).toHaveLength(CARAVAN_AWNING_COUNT);
  });

  it("48가지 디자인 × 앞마당 3단계 × 크리스마스: 문·계단·창·차양 규칙이 그대로예요", () => {
    for (const d of ALL)
      for (const y of YARDS)
        for (const xmas of [false, true]) {
          const a = A.caravanDesignArt(d, y, { xmas });
          expect(a.grid.filled(a.door.x, a.door.y - 1)).toBe(true);
          expect(a.grid.filled(a.door.x, a.door.y + 3)).toBe(true);
          for (const w of a.windows) expect(a.grid.filled(w.x, w.y)).toBe(true);
          expect(!!a.awning).toBe(y >= 2);
        }
  });

  it("같은 모델이면 색이 달라도 크기가 같고, 몸통 색·차양 색을 바꾸면 그림이 달라져요", () => {
    for (const m of CARAVAN_MODELS) {
      const base = A.caravanDesignArt({ model: m, color: 0, awning: 0 }, 2);
      for (let c = 1; c < CARAVAN_COLOR_COUNT; c++) {
        const o = A.caravanDesignArt({ model: m, color: c, awning: 0 }, 2);
        expect([o.grid.w, o.grid.h]).toEqual([base.grid.w, base.grid.h]);
        expect(Buffer.from(o.grid.px.buffer).equals(Buffer.from(base.grid.px.buffer))).toBe(false);
      }
      for (let k = 1; k < CARAVAN_AWNING_COUNT; k++) {
        const o = A.caravanDesignArt({ model: m, color: 0, awning: k }, 2);
        expect(Buffer.from(o.grid.px.buffer).equals(Buffer.from(base.grid.px.buffer))).toBe(false);
      }
    }
  });

  it("디자인을 안 고른 옛 카라반은 예전 그림 그대로예요 (자리 번호로 고르던 색·차양)", () => {
    for (const l of CARAVANS)
      for (const y of YARDS) {
        const t = l.grade === "falls" ? "airstream" : l.grade === "river" ? "teardrop" : "bus";
        const color = t === "teardrop" ? l.lot % 4 : l.lot % 2;
        const old = (t === "teardrop" ? A.teardropArt : t === "airstream" ? A.airstreamArt : A.busCamperArt)(color, y, { awning: l.lot % 4 });
        const now = A.caravanDesignArt(defaultCaravanDesign(l.lot), y);
        expect(Buffer.from(now.grid.px.buffer).equals(Buffer.from(old.grid.px.buffer))).toBe(true);
        // 맵 그림 키도 예전과 같다 (chome-cv-{종류}{색}-{단계}-a{차양})
        const p = campHomePlan(l, st({ yard: y }));
        expect(p.props.some((q) => q.key.startsWith(`chome-cv-${t}${color}-${y}-a${l.lot % 4}-`))).toBe(true);
        expect(planKey(l, st({ yard: y }))).toBe(planKey(l, st({ yard: y, design: defaultCaravanDesign(l.lot) })));
      }
  });

  it("고른 디자인으로 맵에 그리고, 디자인이 바뀌면 다시 그려요 (planKey)", () => {
    const l = CARAVANS[0];
    const d: CaravanDesign = { model: "bus", color: 3, awning: 2 };
    const p = campHomePlan(l, st({ yard: 3, design: d }));
    expect(p.props.some((q) => q.key.startsWith("chome-cv-bus3-3-a2-"))).toBe(true);
    expect(planKey(l, st({ design: d }))).not.toBe(planKey(l, st()));
    // 펜션·촌캉스는 디자인과 상관없다
    const pension = CAMP_LOTS.find((q) => q.kind === "pension")!;
    expect(planKey(pension, st({ design: d }))).toBe(planKey(pension, st()));
  });

  it("campOf: 카라반은 서버 디자인(없으면 그 자리 기본 모습), 펜션·촌캉스는 디자인 없음", () => {
    const l = CARAVANS[1];
    expect(campOf({ lot: l.lot }).design).toEqual(defaultCaravanDesign(l.lot));
    expect(campOf({ lot: l.lot, camp: { kind: "caravan", yard: 2, design: { model: "airstream", color: 3, awning: 1 } } })).toEqual({
      kind: "caravan",
      yard: 2,
      design: { model: "airstream", color: 3, awning: 1 },
    });
    expect(campOf({ lot: l.lot, camp: { kind: "caravan", yard: 1, design: { model: "airstream", color: 9, awning: 1 } } }).design).toEqual(defaultCaravanDesign(l.lot));
    expect(campOf({ lot: 13 }).design).toBeUndefined();
  });
});

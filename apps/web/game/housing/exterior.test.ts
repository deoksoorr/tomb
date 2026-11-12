import { HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { defaultExterior, EXT_SLOTS, FURNITURE, type HouseExteriorMap } from "@/lib/housing/catalog";
import { facadeInfo, housePlan, litAlpha, lotLayers } from "./exterior";

// F2·F18: 터 크기별 집 그림, 돌벽이 벽 밖으로 나가지 않는지, 필지 크기를 따르는지

const ext = (over: Partial<HouseExteriorMap> = {}): HouseExteriorMap => ({ ...defaultExterior(), ...over });

describe("필지 그림 (exterior)", () => {
  it("터가 클수록 집이 넓고 높다 (넓은 터로 올리면 겉모습이 바뀐다)", () => {
    const [s, w, m] = (["small", "wide", "manor"] as const).map((t) => facadeInfo(ext(), t));
    expect(w.body.w).toBeGreaterThan(s.body.w + 16);
    expect(m.body.w).toBeGreaterThan(w.body.w + 8);
    expect(m.roofTop).toBeLessThan(w.roofTop);
    expect(w.roofTop).toBeLessThanOrEqual(s.roofTop);
    expect(housePlan("manor").blocks).toHaveLength(3);
    expect(housePlan("wide").blocks).toHaveLength(2);
    expect(housePlan("small").blocks).toHaveLength(1);
  });

  it("문 앞은 프로토콜의 필지 문 자리와 같다 (상호작용 위치)", () => {
    const lot = HOUSE_LOTS[0];
    for (const t of ["small", "wide", "manor"]) {
      const i = facadeInfo(ext(), t);
      expect(lot.x + i.door.x).toBe(lot.door.x);
      expect(lot.y + i.door.y).toBe(lot.door.y);
    }
  });

  it("몸체·지붕이 필지 안에 있다", () => {
    for (const t of ["small", "wide", "manor"]) {
      const p = housePlan(t);
      for (const b of p.blocks) {
        expect(b.x - b.over).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w + b.over).toBeLessThanOrEqual(HOUSE_LOT_W);
      }
      expect(p.roofTop).toBeGreaterThanOrEqual(0);
      expect(p.baseY).toBeLessThan(HOUSE_LOT_H);
    }
  });

  it("돌벽 무늬가 벽 밖(옆 빈 마당)에 칠해지지 않는다 (F18)", () => {
    for (const t of ["small", "wide", "manor"]) {
      const plain = lotLayers(ext({ facade: "facade_plank" }), t).house;
      const stone = lotLayers(ext({ facade: "facade_stone" }), t).house;
      // 벽 무늬만 다르므로, 칠해진 칸(투명 여부)은 똑같아야 한다
      for (let i = 0; i < plain.px.length; i++) expect((stone.px[i] & 255) > 0, `${t} px ${i}`).toBe((plain.px[i] & 255) > 0);
    }
  });

  it("모든 외관 아이템 조합을 그릴 수 있고 필지 크기가 바뀌면 그림도 따라간다", () => {
    for (const { slot } of EXT_SLOTS)
      for (const f of FURNITURE.filter((x) => x.ext === slot)) for (const t of ["small", "wide", "manor"]) expect(() => lotLayers(ext({ [slot]: f.id }), t)).not.toThrow();
    const big = lotLayers(ext(), "manor", { w: 160, h: 128 });
    expect(big.house.w).toBe(160);
    expect(big.info.door.y).toBe(128 - 12);
    expect(big.info.body.w).toBeGreaterThan(facadeInfo(ext(), "manor").body.w);
  });

  it("밤 창 불빛: 낮에는 꺼지고 해 질 녘·밤에는 켜진다", () => {
    expect(litAlpha(0.1)).toBe(0);
    expect(litAlpha(0.7)).toBeCloseTo(1);
    expect(litAlpha(1)).toBe(1);
    expect(litAlpha(0.5)).toBeGreaterThan(0.5);
  });
});

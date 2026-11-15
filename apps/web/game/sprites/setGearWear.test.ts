import { describe, expect, it } from "vitest";
import { avatarFrameGrid, lookKey } from "./avatar";
import { huntLook, sgWearOf } from "./setGearWear";

// 11/15 사냥 중 입은 세트 장비: 착용 목록·시트 키·몸·방향마다 그려진다

const equip = { weapon: "s303.a.15.a8.0.0", armor: "s313.b.0.h10.0.0", head: "s323.c.0.c6.0.0", acc1: "s333.d.0.a8.0.0", acc2: null };

describe("사냥 중 세트 장비 입기", () => {
  it("같은 자리 마을 꾸미기보다 먼저: 머리 꾸미기·목 꾸미기·망토를 빼고 오라·펫은 그대로", () => {
    const look = huntLook(["hat_cat", "neck_scarf", "back_cape", "aura_fog", "back_wings"], equip);
    expect(look).toEqual(["aura_fog", "back_wings", "sgw.a.33", "sgw.c.33", "sgw.h.33"]);
    expect(huntLook(["hat_cat"], { weapon: "w_stamp" })).toEqual(["hat_cat"]);
    expect(sgWearOf(look)).toEqual({ a: ["trip", 3], h: ["trip", 3], c: [["trip", 3]] });
    // 시트 키에 장비 조합이 들어간다 (장비가 바뀔 때만 새 시트)
    expect(lookKey(look)).toContain("sgw.a.33");
    expect(lookKey(look)).not.toBe(lookKey(huntLook([], { ...equip, armor: "s013.b.0.h10.0.0" })));
  });

  it("세트·직급·몸·방향마다 그림이 달라지고 오류 없이 그려진다", () => {
    const bodies = ["hood", "cat", "bun", "sheet", "tall", "round", "suit", "king"];
    for (const body of bodies)
      for (const view of ["down", "side", "up"] as const)
        for (const s of [0, 1, 2, 3])
          for (const g of [0, 3]) {
            const look = [`sgw.a.${s}${g}`, `sgw.h.${s}${g}`, `sgw.c.${s}${g}`];
            const plain = avatarFrameGrid(body, view, 2, "#9fb8d8", []);
            const worn = avatarFrameGrid(body, view, 2, "#9fb8d8", look);
            expect(
              [...worn.px].some((v, i) => v !== plain.px[i]),
              `${body} ${view} ${s}${g}`,
            ).toBe(true);
          }
    // 사원급과 임원급은 다르게 보인다
    const a = avatarFrameGrid("hood", "down", 0, "#9fb8d8", ["sgw.a.00", "sgw.h.00"]);
    const b = avatarFrameGrid("hood", "down", 0, "#9fb8d8", ["sgw.a.03", "sgw.h.03"]);
    expect([...a.px].some((v, i) => v !== b.px[i])).toBe(true);
  });
});

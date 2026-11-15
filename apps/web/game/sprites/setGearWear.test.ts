import { describe, expect, it } from "vitest";
import { avatarFrameGrid, lookKey } from "./avatar";
import { GEAR } from "@/lib/rpg/catalog";
import { huntLook, huntPeerLook, sgWearOf, villageLook } from "./setGearWear";

// 11/15 사냥 중 입은 세트 장비: 착용 목록·시트 키·몸·방향마다 그려진다

const equip = { weapon: "s303.a.15.a8.0.0", armor: "s313.b.0.h10.0.0", head: "s323.c.0.c6.0.0", acc1: "s333.d.0.a8.0.0", acc2: null };

describe("사냥 중 세트 장비 입기", () => {
  it("같은 자리 마을 꾸미기보다 먼저: 머리 꾸미기·목 꾸미기·망토를 빼고 오라·펫은 그대로", () => {
    const look = huntLook(["hat_cat", "neck_scarf", "back_cape", "aura_fog", "back_wings"], equip);
    expect(look).toEqual(["aura_fog", "back_wings", "sgw.a.33", "sgw.c.33", "sgw.h.33"]);
    expect(huntLook(["hat_cat"], { weapon: "w_stamp" })).toEqual(["hat_cat"]);
    expect(sgWearOf(look)).toEqual({ a: { set: "trip", grade: 3 }, h: { set: "trip", grade: 3 }, c: [{ set: "trip", grade: 3 }] });
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

  it("상점·주운 장비도 입는다 (갑옷 10 · 머리 8 · 장신구 11 — 무기는 손에), +5 이상은 표시가 붙는다", () => {
    const worn = GEAR.filter((g) => g.kind !== "weapon");
    expect(worn).toHaveLength(29);
    for (const g of worn) {
      const slot = g.kind === "acc" ? "acc1" : g.kind;
      const look = huntLook(["hat_cat", "neck_scarf"], { [slot]: g.id });
      const w = sgWearOf(look);
      const piece = g.kind === "armor" ? w.a : g.kind === "head" ? w.h : w.c[0];
      expect(piece, g.id).toMatchObject({ shop: g.id, shape: g.art.shape });
      if (g.kind === "head") expect(look).not.toContain("hat_cat");
      for (const view of ["down", "side", "up"] as const) {
        const plain = avatarFrameGrid("hood", view, 0, "#9fb8d8", []);
        const grid = avatarFrameGrid(
          "hood",
          view,
          0,
          "#9fb8d8",
          look.filter((x) => x.startsWith("sgw.")),
        );
        if (view !== "up" || g.kind !== "acc")
          expect(
            [...grid.px].some((v, i) => v !== plain.px[i]),
            `${g.id} ${view}`,
          ).toBe(true);
      }
    }
    expect(huntLook([], { armor: "a_hazmat+5@b.0" })).toEqual(["sgw.a.a_hazmat+"]);
    expect(sgWearOf(["sgw.a.a_hazmat+"]).a).toMatchObject({ hi: true });
    // 마을에서는 사냥 장비 표시를 뺀다 · 다른 사람 사냥 장비는 같은 자리 꾸미기를 이긴다
    expect(villageLook(["hat_cat", "sgw.h.h_cap"])).toEqual(["hat_cat"]);
    expect(huntPeerLook(["hat_cat", "aura_fog", "sgw.h.h_cap"])).toEqual(["aura_fog", "sgw.h.h_cap"]);
  });
});

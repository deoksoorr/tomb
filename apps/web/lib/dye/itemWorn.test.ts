import { describe, expect, it } from "vitest";
import { styleDyeOf } from "../store/style";
import { withoutWornItemDyes, withWornItemDyes, wornItemDyes } from "./itemWorn";

// 11/22 /api/me는 입은 아이템 색(dye.items)을 빼고 보낸다 → 화면이 색 보관함(itemDyes)에서 서버와 똑같이 다시 계산해야 한다

describe("입은 아이템 색 다시 계산", () => {
  const h: Record<string, string> = {
    head: "#ff0000",
    "i:wr_shirt:0": "#123456",
    "i:wr_shirt:1": "#abcdef~g",
    "s:wr_shirt": "1",
    "c:wr_shirt": "2",
    "i:hat_straw:0": "#00ff00",
    "s:hat_straw": "-",
    "i:neck_scarf:0": "#222222",
    "c:back_cape": "3",
  };

  it("서버 styleDyeOf의 dye.items와 같다 (고른 칸 · 원래 색 · 칸만 산 것 · 고른 칸 없음 = 0번)", () => {
    const { dye, items } = styleDyeOf(h);
    expect(wornItemDyes(items)).toEqual(dye.items);
    expect(dye.items).toEqual({ wr_shirt: "#abcdef~g", neck_scarf: "#222222" });
  });

  it("응답에서 빼고 화면에서 채우면 원래 내 정보와 같다 (이미 있으면 그대로)", () => {
    const { dye, items } = styleDyeOf(h);
    const me = { points: 1, dye, itemDyes: items };
    const wire = withoutWornItemDyes(me);
    expect(wire.dye).toEqual({ head: "#ff0000" });
    expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(me).length);
    expect(withWornItemDyes(JSON.parse(JSON.stringify(wire)))).toEqual(me);
    expect(withWornItemDyes(me)).toBe(me);
    const plain = { points: 1, dye: { head: "#ff0000" } };
    expect(withoutWornItemDyes(plain)).toBe(plain);
    expect(withWornItemDyes(plain)).toBe(plain);
  });
});

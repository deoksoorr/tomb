import { describe, expect, it } from "vitest";
import { DIR, ITEMS, itemById } from "@tomb/protocol";
import { fittingLook, FITTING_VIEWS, rotateView } from "./fitting";

// 이름은 카탈로그에서 바뀔 수 있으니 id와 slot으로만 확인한다
const cosmetics = ITEMS.filter((i) => i.kind === "cosmetic");
const sameSlotPair = () => {
  for (const a of cosmetics)
    for (const b of cosmetics) if (a.id !== b.id && a.slot === b.slot) return [a, b] as const;
  throw new Error("같은 부위 꾸미기가 둘 이상 있어야 한다");
};
const otherSlot = (slot: string | undefined) => cosmetics.find((i) => i.slot !== slot)!;

describe("fittingLook", () => {
  it("빈 부위면 지금 모습에 더한다", () => {
    const [hat] = sameSlotPair();
    const other = otherSlot(hat.slot);
    const r = fittingLook([other.id], hat.id);
    expect(r.look).toEqual([other.id, hat.id]);
    expect(r.replaced).toBeNull();
    expect(r.wearing).toBe(false);
  });

  it("같은 부위를 입고 있으면 그 자리를 대신한다 (서버 equip과 같은 규칙)", () => {
    const [a, b] = sameSlotPair();
    const other = otherSlot(a.slot);
    const r = fittingLook([a.id, other.id], b.id);
    expect(r.look).toEqual([other.id, b.id]);
    expect(r.replaced?.id).toBe(a.id);
    expect(r.replaced?.name).toBe(itemById(a.id)!.name);
  });

  it("반딧불·안개처럼 같은 aura 부위끼리도 바꿔 낀다", () => {
    const r = fittingLook(["aura_firefly"], "aura_fog");
    expect(r.look).toEqual(["aura_fog"]);
    expect(r.replaced?.id).toBe("aura_firefly");
  });

  it("이미 입은 것을 고르면 그대로 (착용 중)", () => {
    const [a] = sameSlotPair();
    const r = fittingLook([a.id], a.id);
    expect(r.look).toEqual([a.id]);
    expect(r.wearing).toBe(true);
    expect(r.replaced).toBeNull();
  });

  it("꾸미기가 아니거나 모르는 아이템이면 지금 모습 그대로", () => {
    const [a] = sameSlotPair();
    const firework = ITEMS.find((i) => i.kind === "firework")!;
    expect(fittingLook([a.id], firework.id)).toEqual({ look: [a.id], replaced: null, wearing: false });
    expect(fittingLook([a.id], "nope").look).toEqual([a.id]);
    expect(fittingLook([a.id], null).look).toEqual([a.id]);
  });

  it("지금 모습에 섞인 잘못된 값·같은 부위 중복은 정리한다", () => {
    const [a, b] = sameSlotPair();
    expect(fittingLook([a.id, b.id, "fw_small", "nope"], null).look).toEqual([a.id]);
  });

  it("모든 꾸미기는 아무것도 안 입은 모습에 그대로 입혀진다", () => {
    for (const it of cosmetics) expect(fittingLook([], it.id).look).toEqual([it.id]);
  });
});

describe("rotateView", () => {
  it("앞 → 옆 → 뒤 → 앞, 반대로도 돈다", () => {
    expect(FITTING_VIEWS.map((v) => v.dir)).toEqual([DIR.down, DIR.right, DIR.up]);
    expect(rotateView(DIR.down, 1)).toBe(DIR.right);
    expect(rotateView(DIR.right, 1)).toBe(DIR.up);
    expect(rotateView(DIR.up, 1)).toBe(DIR.down);
    expect(rotateView(DIR.down, -1)).toBe(DIR.up);
    // 미리보기에 없는 방향(왼쪽)은 앞에서 시작
    expect(rotateView(DIR.left, 1)).toBe(DIR.right);
  });
});

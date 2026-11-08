import { describe, expect, it } from "vitest";
import { GRAVE_STYLES } from "@tomb/protocol";
import { spendsTicket, styleChoices, styleShape } from "./graveStyles";

describe("styleChoices", () => {
  it("무료는 늘 고를 수 있고, 유료는 디자인권이 있어야 한다", () => {
    const choices = styleChoices({ gs_duck: 2 });
    expect(choices).toHaveLength(GRAVE_STYLES.length);
    const by = Object.fromEntries(choices.map((c) => [c.id, c]));
    expect(by.auto).toMatchObject({ free: true, locked: false, price: null });
    expect(by.duck).toMatchObject({ free: false, owned: 2, locked: false });
    expect(by.gold.locked).toBe(true);
    expect(by.gold.price).toBeGreaterThan(0);
  });

  it("고치는 묘비에 이미 쓴 유료 디자인은 디자인권이 없어도 그대로 둘 수 있다", () => {
    expect(styleChoices({}, "gold").find((c) => c.id === "gold")?.locked).toBe(false);
  });
});

describe("spendsTicket", () => {
  it("유료 디자인으로 바꿀 때만 쓴다", () => {
    expect(spendsTicket("auto")).toBe(false);
    expect(spendsTicket("cross")).toBe(false);
    expect(spendsTicket("duck")).toBe(true);
    expect(spendsTicket("duck", "duck")).toBe(false);
    expect(spendsTicket("gold", "duck")).toBe(true);
  });
});

describe("styleShape", () => {
  it("자동은 생존 기간 규칙, 그릴 수 없는 유료 디자인은 null", () => {
    expect(styleShape(undefined, 3)).toBe("woodSign");
    expect(styleShape("auto", 400)).toBe("pagoda");
    expect(styleShape("cross", 3)).toBe("cross");
    expect(styleShape("duck", 3)).toBeNull();
  });
});

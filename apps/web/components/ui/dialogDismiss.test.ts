import { describe, expect, it } from "vitest";
import { backdropCloses, escapeAction } from "./dialogDismiss";

describe("창 닫힘 판단", () => {
  const base = {
    closable: true,
    backdropClose: true,
    pressedBackdrop: true,
    clickedBackdrop: true,
  };
  it("배경 클릭: backdropClose=false면 닫히지 않는다 (다른 창은 그대로 닫힌다)", () => {
    expect(backdropCloses(base)).toBe(true);
    expect(backdropCloses({ ...base, backdropClose: false })).toBe(false);
    expect(backdropCloses({ ...base, closable: false })).toBe(false);
    // 창 안에서 누르고 배경에서 뗀 것(끌기)은 닫지 않는다
    expect(backdropCloses({ ...base, pressedBackdrop: false })).toBe(false);
  });
  it("Esc: onEscape가 있으면 그것(확인), 없으면 닫기, 닫을 수 없으면 무시", () => {
    expect(escapeAction(true, true)).toBe("escape");
    expect(escapeAction(true, false)).toBe("close");
    expect(escapeAction(false, true)).toBe("none");
  });
});

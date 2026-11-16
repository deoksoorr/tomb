import { describe, expect, it, vi } from "vitest";
import { VIEW_ALLOWED_CODES, viewKeyAllowed, viewKeyFilter, type ViewKeyEvent } from "./viewKeyGuard";

// 11/16 r19 바라보는 장면 동안 단축키 막기 (한곳에서 거르는 keydown 거르개)

function key(code: string, mods: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">> = {}) {
  const e = { code, ctrlKey: false, metaKey: false, altKey: false, ...mods, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn() };
  return e as ViewKeyEvent & { stopImmediatePropagation: ReturnType<typeof vi.fn>; preventDefault: ReturnType<typeof vi.fn> };
}

describe("viewKeyFilter — 바라보는 장면 동안", () => {
  const setup = (view = true, editable = false) => {
    const onEscape = vi.fn();
    const f = viewKeyFilter({ viewing: () => view, editable: () => editable, onEscape });
    return { f, onEscape };
  };

  it("게임 단축키(폭죽 G·상호작용 E·Space·표현 T·창 P/L/U/M/B/O/N/I·Y·X·숫자)는 모두 막아요", () => {
    const { f } = setup();
    for (const code of ["KeyG", "KeyE", "Space", "KeyT", "KeyP", "KeyL", "KeyU", "KeyM", "KeyB", "KeyO", "KeyN", "KeyI", "KeyY", "KeyX", "KeyC", "KeyQ", "KeyR", "KeyF", "KeyH", "KeyJ", "KeyK", "Digit1", "Slash"]) {
      const e = key(code);
      f(e);
      expect(e.stopImmediatePropagation, code).toHaveBeenCalled();
      expect(e.preventDefault, code).toHaveBeenCalled();
    }
  });

  it("채팅(Enter)·장면 켜기·끄기(V)·움직이는 키는 그대로 가요", () => {
    const { f, onEscape } = setup();
    for (const code of ["Enter", "NumpadEnter", "KeyV", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "Tab"]) {
      const e = key(code);
      f(e);
      expect(e.stopImmediatePropagation, code).not.toHaveBeenCalled();
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("Esc는 그대로 가고 장면에서 나가요", () => {
    const { f, onEscape } = setup();
    const e = key("Escape");
    f(e);
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("채팅 입력칸에 치는 글은 어떤 키든 그대로 (Esc도 입력칸 몫)", () => {
    const { f, onEscape } = setup(true, true);
    for (const code of ["KeyG", "KeyE", "Space", "KeyP", "Escape"]) {
      const e = key(code);
      f(e);
      expect(e.stopImmediatePropagation, code).not.toHaveBeenCalled();
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("브라우저 단축키(Ctrl/⌘/Alt 조합)는 막지 않아요", () => {
    const { f } = setup();
    for (const e of [key("KeyR", { ctrlKey: true }), key("KeyC", { metaKey: true }), key("KeyG", { altKey: true })]) {
      f(e);
      expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
    }
  });

  it("장면이 아니면 아무것도 막지 않아요", () => {
    const { f, onEscape } = setup(false);
    for (const code of ["KeyG", "KeyE", "Space", "Escape"]) {
      const e = key(code);
      f(e);
      expect(e.stopImmediatePropagation, code).not.toHaveBeenCalled();
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("허용 목록은 채팅·V·Esc·움직이는 키뿐이에요", () => {
    expect([...VIEW_ALLOWED_CODES].every((c) => /^(Key[VWASD]|Escape|Enter|NumpadEnter|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Tab)$/.test(c))).toBe(true);
    expect(viewKeyAllowed({ code: "KeyE", ctrlKey: false, metaKey: false, altKey: false }, false)).toBe(false);
  });
});

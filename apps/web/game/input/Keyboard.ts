// 키보드 입력. Phaser 키보드 플러그인 대신 window 이벤트를 직접 받는다:
//  - 입력창(input/textarea/select/contenteditable)에 포커스가 있으면 무시 → 폼에서 WASD·스페이스가 그대로 입력됨
//  - Space = 점프, E(또는 Enter) = 상호작용, X/C = 앉기, 1 = 손 흔들기, 2 = 환호 (감정표현)
//  - 오버레이 버튼에 "지금" 포커스가 남아 있으면 Space/Enter는 버튼 몫으로 둔다.
//    (UI가 게임 키를 누르면 캡처 단계에서 버튼을 blur 하므로 e.target이 아닌 document.activeElement로 판단한다.
//     그래야 HUD 버튼을 클릭한 직후의 첫 Space도 게임 상호작용이 된다)
//  - ui:blockKeys 동안은 전부 무시하고 눌린 키를 모두 뗀 것으로 친다
// event.code 기준이라 한글 자판 상태(ㅈㅁㄴㅇ)에서도 동작한다.

export type KeyAction = "sit" | "interact" | "jump" | "wave" | "cheer";

const UP_KEYS = ["KeyW", "ArrowUp"] as const;
const DOWN_KEYS = ["KeyS", "ArrowDown"] as const;
const LEFT_KEYS = ["KeyA", "ArrowLeft"] as const;
const RIGHT_KEYS = ["KeyD", "ArrowRight"] as const;
const UP = new Set<string>(UP_KEYS);
const DOWN = new Set<string>(DOWN_KEYS);
const LEFT = new Set<string>(LEFT_KEYS);
const RIGHT = new Set<string>(RIGHT_KEYS);
const RUN = new Set(["ShiftLeft", "ShiftRight"]);
const SIT = new Set(["KeyX", "KeyC"]);
const INTERACT = new Set(["KeyE", "Enter", "NumpadEnter"]);
const JUMP = new Set(["Space"]);
const WAVE = new Set(["Digit1", "Numpad1"]);
const CHEER = new Set(["Digit2", "Numpad2"]);
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isButtonLike(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === "BUTTON" || t.tagName === "A" || t.getAttribute("role") === "button" || t.tagName === "SUMMARY";
}

export class KeyboardInput {
  private readonly down = new Set<string>();
  private blocked = false;
  private attached = false;

  constructor(private readonly onAction: (a: KeyAction) => void) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.clear);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.clear);
    this.clear();
  }

  setBlocked(b: boolean): void {
    this.blocked = b;
    if (b) this.clear();
  }

  readonly clear = (): void => {
    this.down.clear();
  };

  private any(keys: readonly string[]): boolean {
    for (let i = 0; i < keys.length; i++) if (this.down.has(keys[i])) return true;
    return false;
  }

  /** -1..1 축 (매 프레임 호출 — 할당 없음) */
  axis(out: { ax: number; ay: number }): void {
    out.ax = (this.any(RIGHT_KEYS) ? 1 : 0) - (this.any(LEFT_KEYS) ? 1 : 0);
    out.ay = (this.any(DOWN_KEYS) ? 1 : 0) - (this.any(UP_KEYS) ? 1 : 0);
  }

  get running(): boolean {
    return this.down.has("ShiftLeft") || this.down.has("ShiftRight");
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.blocked || e.isComposing || isEditable(e.target) || isEditable(document.activeElement)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code;
    const relevant = UP.has(code) || DOWN.has(code) || LEFT.has(code) || RIGHT.has(code) || RUN.has(code) || SIT.has(code) || INTERACT.has(code) || JUMP.has(code) || WAVE.has(code) || CHEER.has(code);
    if (!relevant) return;
    if ((code === "Space" || code === "Enter") && isButtonLike(document.activeElement)) return;
    if (SCROLL_KEYS.has(code)) e.preventDefault();
    // 모달이 닫힌 뒤에도 계속 누르고 있던 키는 반복 이벤트로만 들어온다 → 눌림으로는 기록하고 액션만 건너뛴다
    this.down.add(code);
    if (e.repeat) return;
    if (SIT.has(code)) this.onAction("sit");
    else if (INTERACT.has(code)) this.onAction("interact");
    else if (JUMP.has(code)) this.onAction("jump");
    else if (WAVE.has(code)) this.onAction("wave");
    else if (CHEER.has(code)) this.onAction("cheer");
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
}

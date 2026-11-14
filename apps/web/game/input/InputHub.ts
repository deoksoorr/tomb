import type { MoveInput } from "../logic/movement";
import { KeyboardInput, type KeyAction } from "./Keyboard";

// 키보드·모바일 조이스틱·버튼 입력을 한곳에 모아, 지금 활성 씬(월드 또는 상점)으로 보낸다.

export class InputHub {
  readonly keys: KeyboardInput;
  private joyX = 0;
  private joyY = 0;
  private runToggle = false;
  private blocked = false;
  private handler: ((a: KeyAction) => void) | null = null;

  constructor() {
    this.keys = new KeyboardInput((a) => this.dispatch(a));
  }

  attach(): void {
    this.keys.attach();
  }

  detach(): void {
    this.keys.detach();
  }

  /** 앉기·상호작용을 받을 씬 */
  setHandler(fn: ((a: KeyAction) => void) | null): void {
    this.handler = fn;
  }

  dispatch(a: KeyAction): void {
    if (!this.blocked) this.handler?.(a);
  }

  /**
   * 화면 단추로 고른 동작(표현 창의 손 흔들기·환호): 창이 열려 키 입력이 막혀 있어도 보낸다.
   * (dispatch는 막힌 동안 버려서, 폰에서 표현 창을 띄운 채 누른 몸짓이 사라졌다)
   */
  trigger(a: KeyAction): void {
    this.handler?.(a);
  }

  setJoystick(x: number, y: number): void {
    this.joyX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
    this.joyY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  }

  setRunToggle(on: boolean): void {
    this.runToggle = on;
  }

  setBlocked(b: boolean): void {
    this.blocked = b;
    this.keys.setBlocked(b);
    if (b) this.joyX = this.joyY = 0;
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  /** 이번 프레임 이동 입력: 키보드 축과 조이스틱 중 큰 쪽 */
  read(out: MoveInput): MoveInput {
    this.keys.axis(out);
    const jm = Math.hypot(this.joyX, this.joyY);
    if (jm > 0 && jm >= Math.hypot(out.ax, out.ay) * 0.99) {
      out.ax = this.joyX;
      out.ay = this.joyY;
    }
    out.run = this.keys.running || this.runToggle;
    return out;
  }
}

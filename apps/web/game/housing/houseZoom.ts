// 집 안 확대·축소: 마을(game/world/CameraRig.ts)과 같은 규칙·한계.
//  - 마우스 휠: 한 칸에 0.5 단계 (1.5~5). 트랙패드처럼 잘게 오는 값은 모아서 한 칸씩, 80ms 간격
//  - 휴대폰: 두 손가락 벌리기·오므리기 (단계 없이 연속, 손을 떼면 0.5 단계로 맞춘다)
//  - 목표 줌으로 지수 감쇠해 부드럽게 다가간다
// 씬은 update에서 step(dt)를 부르고, 바뀐 줌을 카메라에 넣은 뒤 경계를 다시 잡는다.

import { approach, clampZoom, pinchZoom, snapZoom, stepZoom } from "../world/cameraMath";

/** 휠 한 칸으로 보는 누적량 (CameraRig와 같다) */
const WHEEL_STEP = 50;
const WHEEL_GAP_MS = 80;
const WHEEL_RESET_MS = 250;
const ZOOM_TAU_MS = 70;

export type WheelAcc = { acc: number; at: number; last: number };

/**
 * 휠 이벤트 하나 → 줌 방향 (+1 확대, -1 축소, 0 아직). 순수 함수 (houseZoom.test.ts)
 * deltaMode: 0 = 픽셀, 1 = 줄(16px), 2 = 쪽(400px)
 */
export function wheelNotch(s: WheelAcc, deltaY: number, deltaMode: number, now: number): -1 | 0 | 1 {
  if (now - s.last > WHEEL_RESET_MS) s.acc = 0;
  s.last = now;
  s.acc += deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
  if (Math.abs(s.acc) < WHEEL_STEP || now - s.at <= WHEEL_GAP_MS) return 0;
  const dir = s.acc > 0 ? -1 : 1;
  s.acc = 0;
  s.at = now;
  return dir;
}

type Pt = { x: number; y: number };

export class HouseZoom {
  zoom: number;
  target: number;
  private readonly wheel: WheelAcc = { acc: 0, at: -Infinity, last: -Infinity };
  private readonly touches = new Map<number, Pt>();
  private pinch: { dist: number; zoom: number } | null = null;
  private readonly off: (() => void)[] = [];

  /**
   * @param canvas 게임 캔버스 (휠·터치를 받는다)
   * @param start 처음 줌 (집 크기에 맞춘 값)
   * @param enabled 지금 받아도 되는지 (창이 떠 있어 게임 키가 막혀 있으면 false)
   * @param onPinchStart 두 손가락이 닿았다 (씬이 편집 끌기를 그만둔다)
   */
  constructor(
    canvas: HTMLCanvasElement,
    start: number,
    private readonly enabled: () => boolean,
    private readonly onPinchStart: () => void = () => undefined,
  ) {
    this.zoom = this.target = clampZoom(start);
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opt);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opt));
    };
    on(canvas, "wheel", (e) => this.onWheel(e), { passive: false });
    on(canvas, "pointerdown", (e) => this.onDown(e));
    on(window, "pointermove", (e) => this.onMove(e as PointerEvent));
    on(window, "pointerup", (e) => this.onUp(e as PointerEvent));
    on(window, "pointercancel", (e) => this.onUp(e as PointerEvent));
  }

  /** 두 손가락으로 줌 중인지 (그동안 씬은 끌기·이동 탭을 받지 않는다) */
  get pinching(): boolean {
    return this.pinch !== null;
  }

  /** 집 크기에 맞춘 줌으로 다시 (편집 모드 진입·창 크기 변경) */
  reset(z: number): void {
    this.zoom = this.target = clampZoom(z);
    this.pinch = null;
  }

  /** 매 프레임: 목표로 다가간다. 줌이 바뀌었으면 true */
  step(dtMs: number): boolean {
    if (this.pinch || this.zoom === this.target) return false;
    this.zoom = approach(this.zoom, this.target, dtMs, ZOOM_TAU_MS);
    if (Math.abs(this.zoom - this.target) < 0.003) this.zoom = this.target;
    return true;
  }

  destroy(): void {
    for (const f of this.off.splice(0)) f();
    this.touches.clear();
    this.pinch = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.enabled()) return;
    const dir = wheelNotch(this.wheel, e.deltaY, e.deltaMode, performance.now());
    if (dir) this.target = stepZoom(this.target, dir);
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === "mouse") return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2 && this.enabled()) {
      const [a, b] = [...this.touches.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      this.onPinchStart();
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.pinch;
    if (!p || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()];
    this.zoom = this.target = pinchZoom(p.zoom, p.dist, Math.hypot(a.x - b.x, a.y - b.y));
  }

  private onUp(e: PointerEvent): void {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
      this.target = snapZoom(this.zoom);
    }
  }
}

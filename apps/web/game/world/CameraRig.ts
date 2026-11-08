import * as Phaser from "phaser";
import { MAP_WIDTH, mapHeight } from "@tomb/protocol";
import { bridge } from "../bridge";
import { CAMERA_FOLLOW_OFFSET_Y, CAMERA_LERP, LS_ZOOM } from "../config";
import { approach, cameraBounds, parseStoredZoom, pinchZoom, snapZoom, stepZoom } from "./cameraMath";

// 카메라: 캐릭터를 lerp로 따라가고 맵 경계에서 멈춘다.
//  - 휠 / camera:zoom: 0.5 단계 줌 (1.5~5), 지수 감쇠로 부드럽게. 마지막 줌은 localStorage(tomb.zoom)
//  - 우클릭 드래그: 시점 이동 (추적 해제). 캐릭터가 걷기 시작하거나 camera:recenter면 부드럽게 돌아와 다시 추적
//  - 모바일: 캔버스 위 두 손가락 핀치 줌 + 두 손가락 드래그 팬 (조이스틱은 React 오버레이가 받으므로 캔버스엔 오지 않음)
//  - 한 손가락/왼클릭 탭은 onTap(월드 좌표)로 넘긴다 (묘비 클릭)
// 입력은 Phaser 입력 시스템이 아닌 캔버스 DOM 포인터 이벤트로 직접 받는다 (오버레이 클릭과 섞이지 않게).

const ZOOM_TAU_MS = 70;
const RETURN_TAU_MS = 110;
const PAN_TAU_MS = 160;
const TAP_SLOP = 8;
const TAP_MS = 500;
const WHEEL_STEP = 50;

type Pt = { x: number; y: number };

export class CameraRig {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  zoom: number;
  private target: number;
  detached = false;
  private returning = false;
  private panGoal: Pt | null = null;
  private mapH = mapHeight(0);
  private emitted: { detached: boolean; zoom: number } | null = null;
  private readonly touches = new Map<number, Pt>();
  private rightDrag: (Pt & { id: number; moved: boolean }) | null = null;
  private pinch: { dist: number; zoom: number; mid: Pt; panned: boolean } | null = null;
  private tap: (Pt & { id: number; t: number }) | null = null;
  private wheelAcc = 0;
  private wheelAt = 0;
  private wheelLast = 0;
  private readonly off: (() => void)[] = [];
  private readonly tmp = new Phaser.Math.Vector2();

  constructor(
    scene: Phaser.Scene,
    private readonly follow: Phaser.GameObjects.Sprite,
    private readonly canvas: HTMLCanvasElement,
    private readonly onTap: (wx: number, wy: number) => void,
  ) {
    this.cam = scene.cameras.main;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LS_ZOOM);
    } catch {
      // 저장소를 못 쓰면 기본 줌
    }
    this.zoom = this.target = parseStoredZoom(stored);
    this.cam.setZoom(this.zoom);
    this.cam.setRoundPixels(true);
    this.cam.startFollow(follow, true, CAMERA_LERP, CAMERA_LERP, 0, CAMERA_FOLLOW_OFFSET_Y);
    this.applyBounds();
    this.attach();
    this.emitState();
  }

  /** 라벨을 화면 1:1 픽셀로 보이게 하는 배율 */
  get labelScale(): number {
    return 1 / this.cam.zoom;
  }

  setMapHeight(h: number): void {
    this.mapH = h;
    this.applyBounds();
  }

  applyBounds(): void {
    const b = cameraBounds(this.cam.width / this.cam.zoom, this.cam.height / this.cam.zoom, MAP_WIDTH, this.mapH);
    this.cam.setBounds(b.x, b.y, b.w, b.h);
  }

  zoomBy(delta: number): void {
    this.target = stepZoom(this.target, delta);
    this.persist();
    this.emitState();
  }

  /** 캐릭터로 돌아가 다시 따라가기 */
  recenter(): void {
    if (!this.detached && !this.panGoal) return;
    this.panGoal = null;
    this.detached = false;
    this.returning = true;
    this.emitState();
  }

  /** 추적을 풀고 (x,y)로 부드럽게 이동 */
  focus(x: number, y: number): void {
    this.detach();
    this.panGoal = { x, y };
  }

  private detach(): void {
    this.cam.stopFollow();
    this.returning = false;
    if (!this.detached) {
      this.detached = true;
      this.emitState();
    }
  }

  update(dt: number): void {
    const cam = this.cam;
    if (this.zoom !== this.target && !this.pinch) {
      this.zoom = approach(this.zoom, this.target, dt, ZOOM_TAU_MS);
      if (Math.abs(this.zoom - this.target) < 0.003) this.zoom = this.target;
    }
    if (cam.zoom !== this.zoom) {
      cam.setZoom(this.zoom);
      this.applyBounds();
    }

    const goal = this.returning ? { x: this.follow.x, y: this.follow.y - CAMERA_FOLLOW_OFFSET_Y } : this.panGoal;
    if (goal) {
      const tx = cam.clampX(goal.x - cam.width / 2);
      const ty = cam.clampY(goal.y - cam.height / 2);
      const tau = this.returning ? RETURN_TAU_MS : PAN_TAU_MS;
      cam.scrollX = approach(cam.scrollX, tx, dt, tau);
      cam.scrollY = approach(cam.scrollY, ty, dt, tau);
      if (this.returning && Math.abs(cam.scrollX - tx) < 1 && Math.abs(cam.scrollY - ty) < 1) {
        this.returning = false;
        cam.startFollow(this.follow, true, CAMERA_LERP, CAMERA_LERP, 0, CAMERA_FOLLOW_OFFSET_Y);
      }
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(LS_ZOOM, String(this.target));
    } catch {
      // 무시
    }
  }

  private emitState(): void {
    const s = { detached: this.detached, zoom: this.target };
    if (this.emitted && this.emitted.detached === s.detached && this.emitted.zoom === s.zoom) return;
    this.emitted = s;
    bridge.emit("camera:state", s);
  }

  // ── DOM 입력 ──

  private toWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) * this.canvas.width) / Math.max(1, r.width);
    const sy = ((clientY - r.top) * this.canvas.height) / Math.max(1, r.height);
    this.cam.getWorldPoint(sx, sy, this.tmp);
    return { x: this.tmp.x, y: this.tmp.y };
  }

  private panBy(dxScreen: number, dyScreen: number): void {
    this.detach();
    this.panGoal = null;
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / Math.max(1, r.width);
    this.cam.scrollX = this.cam.clampX(this.cam.scrollX - (dxScreen * k) / this.cam.zoom);
    this.cam.scrollY = this.cam.clampY(this.cam.scrollY - (dyScreen * k) / this.cam.zoom);
  }

  private listen<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) {
    this.canvas.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => this.canvas.removeEventListener(type, fn as EventListener, opts));
  }

  private attach(): void {
    this.listen("contextmenu", (e) => e.preventDefault());
    this.listen("pointerdown", (e) => this.onDown(e));
    this.listen("pointermove", (e) => this.onMove(e));
    this.listen("pointerup", (e) => this.onUp(e, false));
    this.listen("pointercancel", (e) => this.onUp(e, true));
    this.listen("wheel", (e) => this.onWheel(e), { passive: false });
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === "mouse") {
      if (e.button === 2) {
        e.preventDefault();
        this.rightDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        this.capture(e.pointerId);
      } else if (e.button === 0) {
        this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      }
      return;
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.capture(e.pointerId);
    if (this.touches.size === 1) this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.touches.size === 2) {
      this.tap = null;
      const [a, b] = [...this.touches.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: this.zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        panned: false,
      };
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.tap && this.tap.id === e.pointerId && Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) > TAP_SLOP) this.tap = null;

    const rd = this.rightDrag;
    if (rd && rd.id === e.pointerId) {
      const dx = e.clientX - rd.x;
      const dy = e.clientY - rd.y;
      if (!rd.moved && Math.hypot(dx, dy) < 3) return;
      rd.moved = true;
      rd.x = e.clientX;
      rd.y = e.clientY;
      this.panBy(dx, dy);
      return;
    }

    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.pinch;
    if (p && this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoom = this.target = pinchZoom(p.zoom, p.dist, dist);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const mdx = mid.x - p.mid.x;
      const mdy = mid.y - p.mid.y;
      if (p.panned || Math.hypot(mdx, mdy) > 6) {
        p.panned = true;
        p.mid = mid;
        this.panBy(mdx, mdy);
      }
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    if (this.rightDrag && this.rightDrag.id === e.pointerId) {
      this.rightDrag = null;
      this.release(e.pointerId);
    }
    const tap = this.tap;
    if (!cancelled && tap && tap.id === e.pointerId && performance.now() - tap.t < TAP_MS) {
      const w = this.toWorld(e.clientX, e.clientY);
      this.onTap(w.x, w.y);
    }
    if (tap?.id === e.pointerId) this.tap = null;
    if (this.touches.delete(e.pointerId)) this.release(e.pointerId);
    if (this.pinch && this.touches.size < 2) {
      this.pinch = null;
      this.target = snapZoom(this.zoom);
      this.persist();
      this.emitState();
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const now = performance.now();
    // 트랙패드는 작은 delta가 연달아 오므로 모아서 한 칸씩, 너무 빠르게 넘기지 않게 80ms 간격
    if (now - this.wheelLast > 250) this.wheelAcc = 0;
    this.wheelLast = now;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.wheelAcc += e.deltaY * unit;
    if (Math.abs(this.wheelAcc) >= WHEEL_STEP && now - this.wheelAt > 80) {
      this.zoomBy(-Math.sign(this.wheelAcc));
      this.wheelAcc = 0;
      this.wheelAt = now;
    }
  }

  private capture(id: number): void {
    try {
      this.canvas.setPointerCapture(id);
    } catch {
      // 이미 끝난 포인터
    }
  }

  private release(id: number): void {
    try {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    } catch {
      // 무시
    }
  }

  destroy(): void {
    for (const f of this.off) f();
    this.off.length = 0;
  }
}

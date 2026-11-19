import * as Phaser from "phaser";
import { photoScale } from "@/lib/photo/photoRules";
import { bridge, type UiEvents } from "../bridge";
import { DEPTH, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../config";
import { setAmbiencePreview } from "../world/ambiencePreview";
import { cameraBounds } from "../world/cameraMath";

// 11/19 촬영 모드 게임 쪽 (game/photo/install이 촬영 모드에 처음 들어갈 때만 불러와요 — 평소엔 이 코드가 돌지 않아요).
// 지금 보이는 장면(마을·캠핑장·바닷가·잡화점·집·분양 마을) 하나만 만져요. 서버에는 아무것도 보내지 않아요.
//  - 이름표 끄기: 이름표 층(DEPTH.labels 둘레 — 사람·NPC 이름, 칭호·배지, 장소 이름)을 이 카메라에서만 빼요 (cameraFilter, 끝나면 되돌려요)
//  - 내 캐릭터 끄기: 내 아바타(AvatarView)를 내 화면에서만 숨겨요 (다른 사람 화면은 그대로)
//  - 시간대·날씨: world/ambiencePreview로 하늘(Atmosphere)만 미리보기
//  - 카메라: 마을·캠핑장·바닷가는 CameraRig가 photo:mode를 직접 들어요. 카메라 장치가 없는 잡화점·집·분양 마을은 여기서 휠·끌기·핀치를 받아요
//  - 찍기: 캔버스만(화면 위 단추·HUD는 DOM이라 안 찍혀요) renderer.snapshot → 2배 nearest로 늘려 PNG

type Filters = UiEvents["photo:set"];
type AvatarLike = { visible: boolean; setVisible(v: boolean): void };
type PhotoScene = Phaser.Scene & { player?: { view?: AvatarLike }; playerGlow?: Phaser.GameObjects.Image; rig?: unknown };
type Hideable = Phaser.GameObjects.GameObject & { depth?: number; cameraFilter: number };

/** 이름표 층: NPC·강아지 이름(labels-2)부터 툴팁까지. 나무 팻말(SignPlate, labels-3)과 말풍선(bubble)은 남겨요 */
const NAME_MIN = DEPTH.labels - 2;
const NAME_MAX = DEPTH.tooltip + 1_000;

/** 카메라 장치(CameraRig)가 없는 장면용 간단한 촬영 카메라 */
class FreeCam {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly saved: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    follow: Phaser.GameObjects.GameObject | null;
    lerp: [number, number];
    offset: [number, number];
    bounds: Phaser.Geom.Rectangle | null;
  };
  /** 손을 대기 전엔 장면 카메라 그대로 (따라가기 포함) */
  private taken = false;
  private zoom: number;
  private zMin: number;
  private cx = 0;
  private cy = 0;
  private readonly pts = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
  private readonly off: (() => void)[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const cam = (this.cam = scene.cameras.main);
    const follow = (cam as unknown as { _follow?: Phaser.GameObjects.GameObject | null })._follow ?? null;
    const b = cam.useBounds ? cam.getBounds() : null;
    this.saved = {
      zoom: cam.zoom,
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      follow,
      lerp: [cam.lerp.x, cam.lerp.y],
      offset: [cam.followOffset.x, cam.followOffset.y],
      bounds: b ? new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height) : null,
    };
    this.zoom = cam.zoom;
    // 방이 화면보다 작으면 들어갈 때 줌보다 더 멀리 빼지 않아요 (빈 곳이 보이게 되니)
    const fit = b ? Math.max(cam.width / Math.max(1, b.width), cam.height / Math.max(1, b.height)) : ZOOM_MIN;
    this.zMin = Math.max(ZOOM_MIN, Math.min(cam.zoom, fit));
    // 장면의 탭(걷기·꾸미기)보다 먼저 캔버스 둘레에서 받아 멈춰요
    const host = canvas.parentElement ?? canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, passive = true) => {
      const run = (e: Event) => {
        if (e.target !== canvas) return;
        e.stopPropagation();
        fn(e as HTMLElementEventMap[K]);
      };
      host.addEventListener(type, run, { capture: true, passive });
      this.off.push(() => host.removeEventListener(type, run, { capture: true }));
    };
    on("pointerdown", (e) => this.down(e));
    on("pointermove", (e) => this.move(e));
    on("pointerup", (e) => this.up(e));
    on("pointercancel", (e) => this.up(e));
    on("wheel", (e) => this.wheel(e), false);
  }

  private take(): void {
    if (this.taken) return;
    this.taken = true;
    this.cam.stopFollow();
    this.cx = this.cam.midPoint.x;
    this.cy = this.cam.midPoint.y;
  }

  private screenK(): number {
    const r = this.canvas.getBoundingClientRect();
    return this.canvas.width / Math.max(1, r.width);
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 이미 끝난 포인터
    }
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
    }
  }

  private move(e: PointerEvent): void {
    const prev = this.pts.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    this.pts.set(e.pointerId, next);
    this.take();
    if (this.pinch && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      if (this.pinch.dist > 0) this.zoom = this.clampZoom((this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.dist);
      return;
    }
    const k = this.screenK() / this.cam.zoom;
    this.cx -= (next.x - prev.x) * k;
    this.cy -= (next.y - prev.y) * k;
  }

  private up(e: PointerEvent): void {
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinch = null;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (!e.deltaY) return;
    this.take();
    this.zoom = this.clampZoom(Math.round((this.zoom - Math.sign(e.deltaY) * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP);
  }

  private clampZoom(z: number): number {
    return Math.max(this.zMin, Math.min(ZOOM_MAX, z));
  }

  /** 장면 update 뒤 매 프레임: 손을 댔으면 이 카메라 값으로 */
  apply(): void {
    if (!this.taken) return;
    const cam = this.cam;
    if (cam.zoom !== this.zoom) cam.setZoom(this.zoom);
    const b = this.saved.bounds;
    if (b) {
      const vb = cameraBounds(cam.width / this.zoom, cam.height / this.zoom, b.width, b.height);
      cam.setBounds(b.x + vb.x, b.y + vb.y, vb.w, vb.h);
    }
    cam.centerOn(this.cx, this.cy);
    if (b) {
      // 경계 밖으로 끌고 나간 만큼은 되돌려 둬요 (다시 끌 때 바로 움직이게)
      cam.scrollX = cam.clampX(cam.scrollX);
      cam.scrollY = cam.clampY(cam.scrollY);
      this.cx = cam.scrollX + cam.width / 2;
      this.cy = cam.scrollY + cam.height / 2;
    }
  }

  /** 원래 카메라로 (줌·경계·따라가기) */
  restore(): void {
    for (const f of this.off.splice(0)) f();
    if (!this.taken) return;
    const cam = this.cam;
    const s = this.saved;
    cam.setZoom(s.zoom);
    if (s.bounds) cam.setBounds(s.bounds.x, s.bounds.y, s.bounds.width, s.bounds.height);
    if (s.follow) cam.startFollow(s.follow, true, s.lerp[0], s.lerp[1], s.offset[0], s.offset[1]);
    else cam.setScroll(s.scrollX, s.scrollY);
  }
}

export class PhotoController {
  private scene: PhotoScene | null = null;
  private filters: Filters = { names: true, me: true, hour: null, weather: null };
  /** 이름표를 빼 둔 오브젝트 (끝나면 이것만 되돌려요) */
  private readonly hiddenNames = new Set<Hideable>();
  /** 내가 숨긴 내 캐릭터 */
  private hidMe: AvatarLike | null = null;
  private glowHidden: Phaser.GameObjects.Image | null = null;
  private free: FreeCam | null = null;
  private readonly tick = () => this.frame();
  private readonly gone = () => this.detach();

  constructor(private readonly game: Phaser.Game) {}

  /** 지금 보이는 맨 위 장면 (내 캐릭터가 있는 곳) */
  private pickScene(): PhotoScene | null {
    const scenes = this.game.scene.getScenes(true) as PhotoScene[];
    for (let i = scenes.length - 1; i >= 0; i--) {
      const s = scenes[i];
      if (s.sys.isVisible() && s.player?.view) return s;
    }
    return null;
  }

  enter(): void {
    if (this.scene) return;
    const scene = this.pickScene();
    if (!scene) return;
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.gone);
    scene.events.once(Phaser.Scenes.Events.SLEEP, this.gone);
    if (!scene.rig) this.free = new FreeCam(scene, this.game.canvas);
    this.applyFilters();
  }

  exit(): void {
    this.filters = { names: true, me: true, hour: null, weather: null };
    this.applyFilters();
    this.detach();
  }

  set(f: Filters): void {
    this.filters = { ...f };
    this.applyFilters();
  }

  private applyFilters(): void {
    const f = this.filters;
    setAmbiencePreview(f.hour === null && f.weather === null ? null : { ...(f.hour !== null ? { hour: f.hour } : {}), ...(f.weather ? { weather: f.weather } : {}) });
    if (f.names) this.showNames();
    if (f.me) this.showMe();
    if (this.scene) this.frame();
  }

  private frame(): void {
    const scene = this.scene;
    if (!scene) return;
    this.free?.apply();
    const cam = scene.cameras.main;
    if (!this.filters.names && cam.id) {
      const list = scene.children.list as Hideable[];
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        const d = o.depth ?? 0;
        if (d < NAME_MIN || d >= NAME_MAX || (o.cameraFilter & cam.id) !== 0) continue;
        o.cameraFilter |= cam.id;
        this.hiddenNames.add(o);
      }
    }
    if (!this.filters.me) {
      const view = scene.player?.view;
      if (view && view.visible) {
        view.setVisible(false);
        this.hidMe = view;
      }
      const glow = scene.playerGlow;
      if (glow && (glow.cameraFilter & cam.id) === 0) {
        glow.cameraFilter |= cam.id;
        this.glowHidden = glow;
      }
    }
  }

  private showNames(): void {
    const id = this.scene?.cameras.main?.id ?? 0;
    for (const o of this.hiddenNames) if (o.scene) o.cameraFilter &= ~id;
    this.hiddenNames.clear();
  }

  private showMe(): void {
    if (this.hidMe && !this.hidMe.visible) this.hidMe.setVisible(true);
    this.hidMe = null;
    const id = this.scene?.cameras.main?.id ?? 0;
    if (this.glowHidden?.scene) this.glowHidden.cameraFilter &= ~id;
    this.glowHidden = null;
  }

  /** 장면에서 떨어져요 (끝내기·장면이 내려감) */
  private detach(): void {
    this.showNames();
    this.showMe();
    this.free?.restore();
    this.free = null;
    const scene = this.scene;
    this.scene = null;
    if (!scene) return;
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.tick);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.gone);
    scene.events.off(Phaser.Scenes.Events.SLEEP, this.gone);
  }

  /** 캔버스만 PNG로 (2배 nearest). 큰 그림 dataURL은 바로 버리고 Blob만 넘겨요 */
  shoot(): void {
    const fail = () => bridge.emit("photo:shot", { blob: null, width: 0, height: 0 });
    try {
      this.game.renderer.snapshot((snap) => {
        if (!(snap instanceof HTMLImageElement)) return fail();
        const w = snap.naturalWidth || snap.width;
        const h = snap.naturalHeight || snap.height;
        const k = photoScale(w, h);
        const out = document.createElement("canvas");
        out.width = w * k;
        out.height = h * k;
        const ctx = out.getContext("2d");
        if (!ctx || !w || !h) return fail();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(snap, 0, 0, w * k, h * k);
        snap.src = "";
        out.toBlob((blob) => {
          out.width = out.height = 0;
          bridge.emit("photo:shot", { blob, width: w * k, height: h * k });
        }, "image/png");
      });
    } catch {
      fail();
    }
  }

  destroy(): void {
    this.exit();
  }
}

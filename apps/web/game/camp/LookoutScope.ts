import * as Phaser from "phaser";
import { DEPTH } from "../config";
import { Grid } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { CameraRig } from "../world/CameraRig";
import { CAMP_TEX_PREFIX } from "./campTypes";
import { aimedDeck, clampAim, flicker, SCOPE_HOME, SCOPE_STAND, SCOPE_ZOOM, scopeCaption, stepAim, swayAt, tentViews, type LookoutTent, type LookoutTentView } from "./lookoutMath";

// 11/15 캠핑장 전망대 망원경: 전망대에서 E → 캠프파이어 광장과 둘레 데크를 내려다보는 망원 뷰.
//  - 카메라를 광장으로 옮겨 확대한다 (CameraRig.cinematic) → 맵·사람·밤 빛은 원래 그림 그대로 보인다 (새로 찍지 않는다)
//  - 화면 고정 렌즈 테두리 (둥근 시야·렌즈 비네트·작은 눈금·십자선)를 덮고, 손에 든 망원경처럼 살짝 흔들린다 (움직임 줄이기면 멈춤)
//  - 방향키로 데크 사이를 훑는다. E·Space·X·Esc·탭으로 내려놓는다
//  - 텐트(다음 차수): setTents([{ deck, style, lit, people }])로 받으면 데크마다 텐트 불빛 깜빡임·연기·사람 실루엣. 지금은 빈 배열 → 빈 데크
//  - 렌즈·불빛·연기·실루엣 텍스처는 열 때 굽고 닫을 때 지운다. 망원경 받침 그림(작다)만 장면 동안 남는다 (CampMap.destroy가 camp- 접두어로 지운다)

const P = `${CAMP_TEX_PREFIX}scope-`;
const TEX = { tripod: `${P}tripod`, lens: `${P}lens`, glare: `${P}glare`, glow: `${P}glow`, puff: `${P}puff`, figure: `${P}figure` } as const;
/** 렌즈 테두리 캔버스 해상도 (화면 3px = 1칸, 픽셀 아트 줌과 같다) */
const LENS_SCALE = 3;
const DEPTH_LENS = DEPTH.tooltip + 10;
const PUFFS = 4;
const PUFF_MS = 2600;

export type LookoutScopeOptions = {
  rig: CameraRig;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 닫혔다 (입력 돌려받기 등) */
  onClose?: () => void;
};

type TentFx = { view: LookoutTentView; glow: Phaser.GameObjects.Image | null; puffs: Phaser.GameObjects.Image[]; people: Phaser.GameObjects.Image[]; seed: number };

export class LookoutScope {
  private opened = false;
  private aim: { x: number; y: number } = { x: SCOPE_HOME.x, y: SCOPE_HOME.y };
  private lens: Phaser.GameObjects.Image | null = null;
  private glare: Phaser.GameObjects.Image | null = null;
  private caption: Phaser.GameObjects.BitmapText | null = null;
  private captionText = "";
  private tents: LookoutTent[] = [];
  private fx: TentFx[] = [];
  private readonly tripod: Phaser.GameObjects.Image;
  private openedAt = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === "Escape" && this.opened) this.close();
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: LookoutScopeOptions,
  ) {
    if (!scene.textures.exists(TEX.tripod)) scene.textures.addCanvas(TEX.tripod, tripodArt().toCanvas());
    this.tripod = scene.add.image(SCOPE_STAND.x, SCOPE_STAND.y, TEX.tripod).setOrigin(0.5, 1).setDepth(SCOPE_STAND.y);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 전망대 E: 광장을 겨눈 채로 연다 */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.openedAt = this.scene.time.now;
    this.aim = { x: SCOPE_HOME.x, y: SCOPE_HOME.y };
    const s = this.scene;
    this.buildLens();
    if (!s.textures.exists(TEX.glare)) s.textures.addCanvas(TEX.glare, radial(64, [[0, "rgba(255,240,200,0.9)"], [0.5, "rgba(255,220,150,0.25)"], [1, "rgba(255,220,150,0)"]]));
    this.glare = s.add.image(0, 0, TEX.glare).setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_LENS - 1).setAlpha(0);
    this.o.atlas.ensure("0123456789번데크는비어있어요.에텐트가불이켜져방향키로둘러봐요E를누르면내려놓아요");
    this.caption = s.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH_LENS + 1).setTint(0xf2e6c8);
    this.captionText = "";
    this.buildTents();
    this.o.rig.cinematic({ x: this.aim.x, y: this.aim.y, zoom: SCOPE_ZOOM }, this.o.reduced);
    window.addEventListener("keydown", this.onKey);
    this.layout();
  }

  /** 내려놓기: 원래 줌·추적으로 */
  close(): void {
    if (!this.opened) return;
    this.opened = false;
    window.removeEventListener("keydown", this.onKey);
    this.o.rig.cinematic(null, this.o.reduced);
    this.dropOverlay();
    this.o.onClose?.();
  }

  /**
   * 다음 차수: 데크별 텐트 (서버가 알려 준 것). 열려 있으면 바로 다시 그린다.
   * 지금은 아무도 부르지 않는다 → 빈 데크
   */
  setTents(list: readonly LookoutTent[]): void {
    this.tents = [...list];
    if (this.opened) this.buildTents();
  }

  /**
   * 매 프레임 (닫혀 있으면 아무것도 안 한다). input = 방향 입력 (-1..1, 이 동안 캐릭터는 움직이지 않는다),
   * darkness = 밤 정도 0..1 (낮엔 렌즈에 햇살)
   */
  update(time: number, dt: number, input: { ax: number; ay: number }, darkness: number): void {
    if (!this.opened) return;
    this.aim = stepAim(this.aim, input.ax, input.ay, dt);
    const sway = swayAt(time - this.openedAt, this.o.reduced);
    this.o.rig.cinematic({ x: this.aim.x + sway.x / SCOPE_ZOOM, y: this.aim.y + sway.y / SCOPE_ZOOM, zoom: SCOPE_ZOOM });
    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    if (this.lens) this.fix(this.lens, cx + Math.round(sway.x), cy + Math.round(sway.y), LENS_SCALE);
    if (this.glare) {
      const r = lensRadius(cam.width, cam.height);
      this.fix(this.glare, cx - r * 0.42 + sway.x, cy - r * 0.42 + sway.y, (r * 0.9) / 64).setAlpha(0.22 * Math.max(0, 1 - darkness * 1.6));
    }
    if (this.caption) this.fix(this.caption, Math.round(cx), Math.round(cy + lensRadius(cam.width, cam.height) * 0.78), 1);
    const text = scopeCaption(aimedDeck(clampAim(this.aim)), this.fx.map((f) => f.view));
    if (text !== this.captionText && this.caption) {
      this.captionText = text;
      this.o.atlas.ensure(text);
      this.caption.setText(text);
    }
    this.animateTents(time, darkness);
  }

  /** 화면 크기가 바뀌면 렌즈를 다시 굽는다 */
  resize(): void {
    if (!this.opened) return;
    this.buildLens();
    this.layout();
  }

  destroy(): void {
    if (this.opened) {
      this.opened = false;
      window.removeEventListener("keydown", this.onKey);
      this.dropOverlay();
    }
    this.tripod.destroy();
    if (this.scene.textures.exists(TEX.tripod)) this.scene.textures.remove(TEX.tripod);
  }

  // ── 안쪽 ──

  private layout(): void {
    const cam = this.scene.cameras.main;
    const r = lensRadius(cam.width, cam.height);
    if (this.lens) this.fix(this.lens, cam.width / 2, cam.height / 2, LENS_SCALE);
    if (this.caption) this.fix(this.caption, Math.round(cam.width / 2), Math.round(cam.height / 2 + r * 0.78), 1);
  }

  /**
   * 화면 고정 그림을 화면 좌표 (sx, sy)·배율 scale로 놓는다. scrollFactor 0이어도 카메라 줌은 화면 가운데를 기준으로 걸리므로
   * (Atmosphere 화면 고정 층과 같은 셈) 줌만큼 되돌린다 — 망원 뷰는 줌이 바뀌는 중에도 테두리가 화면에 딱 맞는다
   */
  private fix<T extends Phaser.GameObjects.Components.Transform>(o: T, sx: number, sy: number, scale: number): T {
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    o.setPosition(cam.width / 2 + (sx - cam.width / 2) / z, cam.height / 2 + (sy - cam.height / 2) / z);
    o.setScale(scale / z);
    return o;
  }

  private buildLens(): void {
    const s = this.scene;
    const cam = s.cameras.main;
    const w = Math.ceil(cam.width / LENS_SCALE) + 2;
    const h = Math.ceil(cam.height / LENS_SCALE) + 2;
    this.lens?.destroy();
    if (s.textures.exists(TEX.lens)) s.textures.remove(TEX.lens);
    s.textures.addCanvas(TEX.lens, lensCanvas(w, h, lensRadius(cam.width, cam.height) / LENS_SCALE));
    this.lens = s.add.image(0, 0, TEX.lens).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH_LENS);
  }

  private buildTents(): void {
    this.clearTents();
    const views = tentViews(this.tents);
    if (!views.length) return;
    const s = this.scene;
    if (!s.textures.exists(TEX.glow)) s.textures.addCanvas(TEX.glow, radial(32, [[0, "rgba(255,210,140,1)"], [0.45, "rgba(255,170,80,0.45)"], [1, "rgba(255,150,60,0)"]]));
    if (!s.textures.exists(TEX.puff)) s.textures.addCanvas(TEX.puff, puffArt().toCanvas());
    if (!s.textures.exists(TEX.figure)) s.textures.addCanvas(TEX.figure, figureArt().toCanvas());
    for (const v of views) {
      const glow = v.lit ? s.add.image(v.x, v.y - 6, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights + 1).setScale(1.3) : null;
      const puffs = Array.from({ length: PUFFS }, () => s.add.image(v.x + 11, v.y - 12, TEX.puff).setDepth(v.y - 20).setAlpha(0));
      const people = Array.from({ length: v.people }, (_, i) => s.add.image(v.x - 16 + i * 8, v.y + 12, TEX.figure).setOrigin(0.5, 1).setDepth(v.y + 12));
      this.fx.push({ view: v, glow, puffs, people, seed: v.deck * 2.3 });
    }
  }

  private animateTents(time: number, darkness: number): void {
    const still = this.o.reduced;
    for (const f of this.fx) {
      if (f.glow) f.glow.setAlpha((0.25 + 0.75 * darkness) * (still ? 0.85 : flicker(time, f.seed)));
      // 연기: 몇 개가 차례로 올라가며 흐려진다
      f.puffs.forEach((p, i) => {
        const k = (((time + (i * PUFF_MS) / PUFFS + f.seed * 400) % PUFF_MS) + PUFF_MS) % PUFF_MS / PUFF_MS;
        p.setPosition(f.view.x + 11 + Math.sin(k * 5 + f.seed) * 2 * k, f.view.y - 12 - k * 22)
          .setScale(0.8 + k * 1.2)
          .setAlpha(still ? (i === 0 ? 0.4 : 0) : 0.5 * Math.sin(k * Math.PI));
      });
      // 사람 실루엣: 숨쉬듯 조금씩
      f.people.forEach((p, i) => p.setScale(1, still ? 1 : 1 + 0.04 * Math.sin(time / 400 + i * 1.7 + f.seed)));
    }
  }

  private clearTents(): void {
    for (const f of this.fx) {
      f.glow?.destroy();
      for (const p of f.puffs) p.destroy();
      for (const p of f.people) p.destroy();
    }
    this.fx = [];
  }

  private dropOverlay(): void {
    this.lens?.destroy();
    this.glare?.destroy();
    this.caption?.destroy();
    this.lens = this.glare = null;
    this.caption = null;
    this.clearTents();
    const s = this.scene;
    for (const k of [TEX.lens, TEX.glare, TEX.glow, TEX.puff, TEX.figure]) if (s.textures.exists(k)) s.textures.remove(k);
  }
}

/** 렌즈 반지름 (화면 px): 짧은 변의 46% */
function lensRadius(w: number, h: number): number {
  return Math.min(w, h) * 0.46;
}

/** 둥근 시야: 바깥은 어둡게, 가장자리 비네트, 테두리·눈금·십자선·유리 반사 */
function lensCanvas(w: number, h: number, r: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = "#07090c";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // 렌즈 비네트
  const g = ctx.createRadialGradient(cx, cy, r * 0.68, cx, cy, r);
  g.addColorStop(0, "rgba(6,8,12,0)");
  g.addColorStop(1, "rgba(6,8,12,0.78)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 경통 테두리 (어두운 테 + 위쪽 놋쇠 빛)
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2b2620";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(196,160,96,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1.5, Math.PI * 1.08, Math.PI * 1.62);
  ctx.stroke();
  // 작은 눈금 (15도마다, 네 방향은 길게)
  ctx.fillStyle = "rgba(226,232,214,0.5)";
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const long = i % 6 === 0;
    const len = long ? 4 : 2;
    for (let k = 0; k < len; k++) {
      const rr = r - 4 - k;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1);
    }
  }
  // 십자선 (가운데는 비운다)
  ctx.fillStyle = "rgba(226,232,214,0.26)";
  const inner = Math.max(3, r * 0.06);
  const outer = r * 0.32;
  ctx.fillRect(Math.round(cx - outer), Math.round(cy), Math.round(outer - inner), 1);
  ctx.fillRect(Math.round(cx + inner), Math.round(cy), Math.round(outer - inner), 1);
  ctx.fillRect(Math.round(cx), Math.round(cy - outer), 1, Math.round(outer - inner));
  ctx.fillRect(Math.round(cx), Math.round(cy + inner), 1, Math.round(outer - inner));
  // 유리 반사 (왼쪽 위 옅은 호)
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, Math.PI * 1.15, Math.PI * 1.38);
  ctx.stroke();
  return c;
}

function radial(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** 전망대 망원경 (삼각대 + 놋쇠 경통, 캠핑장 쪽 왼쪽 아래를 겨눈다) 14×20 */
function tripodArt(): Grid {
  const g = new Grid(14, 20);
  const leg = 0x6b4a2e;
  const legHi = 0x8f6a44;
  // 다리 셋
  for (let i = 0; i < 9; i++) {
    g.set(7 - Math.round(i * 0.55), 10 + i, leg);
    g.set(7 + Math.round(i * 0.55), 10 + i, leg);
    g.set(7, 10 + i, i % 3 === 0 ? legHi : leg);
  }
  // 받침 머리
  g.rect(5, 9, 5, 2, 0x4a3a2c);
  // 경통 (왼쪽 아래로 기울어진 놋쇠 + 진녹색 띠)
  for (let i = 0; i < 9; i++) {
    const x = 11 - i;
    const y = 4 + Math.round(i * 0.45);
    g.rect(x, y, 2, 3, i < 2 ? 0x2f4a3a : 0xb08840);
    g.set(x, y, i < 2 ? 0x46664f : 0xe0bd6a);
  }
  // 대물렌즈 테
  g.rect(1, 7, 2, 4, 0x6a5428);
  g.set(1, 8, 0xa8d0e0);
  g.outline(0x1f1a14);
  // 그림자
  for (let x = 3; x <= 11; x++) if (!g.filled(x, 19)) g.set(x, 19, 0x000000, 60);
  return g;
}

/** 연기 한 점 5×5 */
function puffArt(): Grid {
  const g = new Grid(5, 5);
  g.ellipse(2.5, 2.5, 2.5, 2.5, 0xc8c4bc, 200);
  g.set(1, 1, 0xe6e2da, 220);
  return g;
}

/** 텐트 앞 사람 실루엣 5×10 */
function figureArt(): Grid {
  const g = new Grid(5, 10);
  g.ellipse(2.5, 2, 1.6, 1.6, 0x1c1814);
  g.rect(1, 4, 3, 4, 0x1c1814);
  g.set(1, 8, 0x1c1814);
  g.set(3, 8, 0x1c1814);
  g.set(1, 9, 0x1c1814);
  g.set(3, 9, 0x1c1814);
  return g;
}

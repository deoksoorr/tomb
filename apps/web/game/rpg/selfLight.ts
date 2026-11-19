import * as Phaser from "phaser";

// 11/15 야근 빌딩: 테마 분위기 층(depth 9000~9002의 곱하기 사각형)이 내 캐릭터까지 어둡게 칠해서 캐릭터가 잘 안 보였다.
// 분위기 층에 "내 캐릭터 둘레만 부드럽게 덜 칠하는" 반전 마스크를 씌운다 → 맵 분위기는 그대로, 캐릭터와 발밑만 또렷하다.
// 그리는 순서(몬스터·벽 가림)는 건드리지 않는다. 테마가 층마다 분위기 층을 새로 만들 수 있어 0.4초마다 다시 찾아 씌운다.
// WebGL에서만 (캔버스 렌더러는 마스크를 못 쓴다 — 그대로 둔다).

const DEPTH_MIN = 9000;
const DEPTH_MAX = 9010;
/** 마스크 반지름 (px) · 세기 (1 = 가운데는 분위기 층이 하나도 안 칠해진다) */
const RADIUS = 42;
const STRENGTH = 0.75;
const RESCAN_MS = 400;
const TEX = "rpg-selflight-mask";

function maskCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.45, "rgba(255,255,255,0.75)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

export class SelfLight {
  private readonly img: Phaser.GameObjects.Image | null = null;
  private readonly mask: Phaser.Display.Masks.BitmapMask | null = null;
  private readonly masked = new Set<Phaser.GameObjects.GameObject>();
  private scanAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    if (scene.sys.game.renderer.type !== Phaser.WEBGL) return;
    if (!scene.textures.exists(TEX)) scene.textures.addCanvas(TEX, maskCanvas());
    this.img = scene.make
      .image({ x: 0, y: 0, key: TEX, add: false })
      .setScale((RADIUS * 2) / 128)
      .setAlpha(STRENGTH);
    this.mask = new Phaser.Display.Masks.BitmapMask(scene, this.img);
    this.mask.invertAlpha = true;
  }

  /** 매 프레임: 캐릭터 몸 가운데 (월드 좌표) */
  update(x: number, y: number, now: number): void {
    if (!this.img || !this.mask) return;
    this.img.setPosition(x, y);
    if (now < this.scanAt) return;
    this.scanAt = now + RESCAN_MS;
    for (const o of this.scene.children.list) {
      if (this.masked.has(o) || !(o instanceof Phaser.GameObjects.Rectangle)) continue;
      if (o.blendMode !== Phaser.BlendModes.MULTIPLY || o.depth < DEPTH_MIN || o.depth > DEPTH_MAX || o.mask) continue;
      o.setMask(this.mask);
      this.masked.add(o);
    }
  }

  destroy(): void {
    for (const o of this.masked) if (o.active && (o as Phaser.GameObjects.Rectangle).mask === this.mask) (o as Phaser.GameObjects.Rectangle).clearMask();
    this.masked.clear();
    this.mask?.destroy();
    this.img?.destroy();
  }
}

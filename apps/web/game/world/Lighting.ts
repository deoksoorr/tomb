import * as Phaser from "phaser";
import { DEPTH } from "../config";

// 어둠 레이어 + 빛 구멍.
// 화면 크기의 1/4 해상도 RenderTexture에 어둠을 칠하고, 빛(부드러운 원형 브러시)을 ERASE로 한 번에 지운다.
//  - 내 캐릭터 둘레: 밤일수록 넓고 진하게, 손등불을 들면 더 넓게
//  - 화면에 보이는 묘비마다 위쪽에 은은한 스폿, 석등·촛불 주변, 원격 아바타는 아주 약하게, 폭죽이 터진 자리
// 빛 개수만큼 batchDrawFrame 한 번씩이고 프레임당 클리어·채우기·블릿 1회라 묘비 500기에서도 비용이 일정하다.

/** 화면 픽셀 몇 개를 어둠 텍스처 1픽셀로 (어둠은 부드러워서 낮은 해상도로 충분하다) */
const RT_DIV = 4;
const DARK = 0x070812;
/** 미리 만들어 두는 빛 브러시 지름 (어둠 텍스처 픽셀) */
const BRUSHES = [6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const MAX_LIGHTS = 512;

type Light = { x: number; y: number; r: number; a: number };

function brushKey(d: number): string {
  return `light-brush-${d}`;
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private rtW = 0;
  private rtH = 0;
  private readonly lights: Light[] = [];
  private n = 0;
  private view = new Phaser.Geom.Rectangle();
  private darkness = 0;
  private color = DARK;

  constructor(private readonly scene: Phaser.Scene) {
    for (const d of BRUSHES) {
      const key = brushKey(d);
      if (scene.textures.exists(key)) continue;
      const tex = scene.textures.createCanvas(key, d, d);
      if (!tex) continue;
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.75)");
      g.addColorStop(0.75, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, d, d);
      tex.refresh();
    }
    for (let i = 0; i < MAX_LIGHTS; i++) this.lights.push({ x: 0, y: 0, r: 0, a: 0 });
    this.rt = this.makeRT();
  }

  private makeRT(): Phaser.GameObjects.RenderTexture {
    const cam = this.scene.cameras.main;
    this.rtW = Math.max(16, Math.ceil(cam.width / RT_DIV));
    this.rtH = Math.max(16, Math.ceil(cam.height / RT_DIV));
    const rt = this.scene.add.renderTexture(0, 0, this.rtW, this.rtH).setScrollFactor(0).setOrigin(0.5, 0.5).setDepth(DEPTH.dark);
    rt.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return rt;
  }

  resize(): void {
    this.rt.destroy();
    this.rt = this.makeRT();
  }

  /** 프레임 시작: 화면(월드 좌표)과 어둠 세기·색 (바깥은 시간대별 남색·보라 어둠, 실내는 기본색) */
  begin(view: Phaser.Geom.Rectangle, darkness: number, color: number = DARK): void {
    this.view.setTo(view.x, view.y, view.width, view.height);
    this.darkness = darkness;
    this.color = color;
    this.n = 0;
  }

  /** 월드 좌표 (x,y)에 반지름 r(월드 px), 세기 a(0..1)의 빛 */
  add(x: number, y: number, r: number, a: number): void {
    if (this.n >= MAX_LIGHTS || a <= 0.01 || r <= 0) return;
    const v = this.view;
    if (x + r < v.x || x - r > v.right || y + r < v.y || y - r > v.bottom) return;
    const l = this.lights[this.n++];
    l.x = x;
    l.y = y;
    l.r = r;
    l.a = Math.min(1, a);
  }

  /** 프레임 끝: 어둠을 칠하고 빛을 지운다 */
  end(): void {
    const rt = this.rt;
    const cam = this.scene.cameras.main;
    if (this.darkness < 0.004) {
      rt.setVisible(false);
      return;
    }
    rt.setVisible(true);
    rt.setPosition(cam.width / 2, cam.height / 2).setDisplaySize(cam.width / cam.zoom + 2, cam.height / cam.zoom + 2);
    rt.clear();
    rt.fill(this.color, this.darkness);
    if (!this.n) return;
    const v = this.view;
    const kx = this.rtW / v.width;
    const ky = this.rtH / v.height;
    rt.beginDraw();
    for (let i = 0; i < this.n; i++) {
      const l = this.lights[i];
      const want = l.r * 2 * kx;
      let d = BRUSHES[BRUSHES.length - 1];
      for (let b = 0; b < BRUSHES.length; b++) {
        if (BRUSHES[b] >= want) {
          d = BRUSHES[b];
          break;
        }
      }
      rt.batchDrawFrame(brushKey(d), undefined, (l.x - v.x) * kx - d / 2, (l.y - v.y) * ky - d / 2, l.a);
    }
    rt.endDraw(true);
  }

  destroy(): void {
    this.rt.destroy();
  }
}

export { playerLightRadius } from "./fxMath";

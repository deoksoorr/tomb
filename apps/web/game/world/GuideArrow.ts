import * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { Grid } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { edgePoint } from "./guideMath";

// 첫 방문 안내 화살표 (guide:point): 대상 위에서 깜빡이며 통통 튀는 화살표 + 라벨.
// 대상이 화면 밖이면 화면 가장자리에 그 방향을 가리키는 화살표(+라벨)를 띄운다.

const TEX_ARROW = "fx-guide-arrow";
function arrowCanvas(): HTMLCanvasElement {
  // 아래를 가리키는 화살표 (11×12)
  const g = new Grid(11, 12);
  const c = 0xffd76a;
  const hi = 0xfff2b8;
  g.rect(3, 0, 5, 6, c);
  g.vline(4, 0, 5, hi);
  for (let y = 6; y < 11; y++) g.hline(y - 5, 15 - y, y, c);
  g.set(5, 10, c);
  g.outline(0x3a2a10);
  return g.toCanvas();
}

export class GuideArrow {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.BitmapText;
  private target: { x: number; y: number; text: string } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly reduced: boolean,
  ) {
    if (!scene.textures.exists(TEX_ARROW)) addCanvasTexture(scene, TEX_ARROW, { canvas: arrowCanvas() });
    this.arrow = scene.add.image(0, 0, TEX_ARROW).setOrigin(0.5, 1).setDepth(DEPTH.tooltip + 2).setVisible(false);
    this.label = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xffe9a8).setDepth(DEPTH.tooltip + 2).setVisible(false);
  }

  /** 대상 (월드 좌표, 대상 그림의 위쪽 끝). null이면 지운다 */
  set(t: { x: number; y: number; text: string } | null): void {
    this.target = t;
    if (!t) {
      this.arrow.setVisible(false);
      this.label.setVisible(false);
      return;
    }
    this.atlas.ensure(t.text);
    this.label.setText(t.text);
  }

  get active(): boolean {
    return this.target !== null;
  }

  update(now: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    const t = this.target;
    if (!t) return;
    const cam = this.scene.cameras.main;
    const blink = this.reduced ? 1 : 0.65 + 0.35 * Math.abs(Math.sin(now / 260));
    const bob = this.reduced ? 0 : Math.round(Math.abs(Math.sin(now / 300)) * 4);
    const sx = ((t.x - view.x) / view.width) * cam.width;
    const sy = ((t.y - view.y) / view.height) * cam.height;
    const e = edgePoint(sx, sy, cam.width, cam.height);
    const a = this.arrow;
    const l = this.label;
    if (!e) {
      // 화면 안: 대상 바로 위 (월드 좌표)
      a.setScrollFactor(1).setOrigin(0.5, 1).setRotation(0).setScale(1).setPosition(t.x, t.y - 2 - bob).setAlpha(blink).setVisible(true);
      l.setScrollFactor(1).setScale(labelScale).setPosition(t.x, a.y - a.height - 1).setAlpha(1).setVisible(true);
      return;
    }
    // 화면 밖: 가장자리에서 그쪽을 가리킨다 (카메라 고정 좌표 = 줌 중심 기준)
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    const z = cam.zoom;
    const px = ox + (e.x - ox) / z;
    const py = oy + (e.y - oy) / z;
    const push = this.reduced ? 0 : (Math.sin(now / 220) * 2) / z;
    a.setScrollFactor(0)
      .setOrigin(0.5, 0.5)
      .setRotation(e.angle - Math.PI / 2)
      .setScale(1)
      .setPosition(px + Math.cos(e.angle) * push, py + Math.sin(e.angle) * push)
      .setAlpha(blink)
      .setVisible(true);
    // 라벨은 화살표에서 화면 안쪽으로
    const lx = px - Math.cos(e.angle) * (16 / z) * 1.4;
    const ly = py - Math.sin(e.angle) * (12 / z) * 1.4 + 4 / z;
    l.setScrollFactor(0).setScale(labelScale).setPosition(lx, ly).setAlpha(0.95).setVisible(true);
  }

  destroy(): void {
    this.arrow.destroy();
    this.label.destroy();
  }
}

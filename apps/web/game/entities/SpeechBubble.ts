import type * as Phaser from "phaser";
import { TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

export { phraseOf } from "../logic/phrases";

// 말풍선(say): 정해진 문장(PHRASES)을 아바타 이름표 위에 4초 띄운다.
// 글꼴에 외곽선이 구워져 있어 어두운 바탕 + 밝은 글자로 그린다. 이름표처럼 화면 픽셀 크기(labelScale)로 그리고, 원점은 가운데 아래 (LabelBox와 같은 규약 → 겹침 풀기에 그대로 넣는다).

export const SAY_MS = 4000;
const FADE_MS = 220;
const PAD_X = 4;
const PAD_Y = 2;

export class SpeechBubble {
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly border: Phaser.GameObjects.Image;
  private readonly tail: Phaser.GameObjects.Image;
  private until = 0;
  private born = 0;
  private scale = 1;
  /** 겹침 풀기용 상자 (가운데 아래 원점, 월드 단위) */
  readonly box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
  ) {
    this.border = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 1).setTint(0xcfc4a4).setDepth(DEPTH.bubble + 2).setVisible(false);
    this.bg = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 1).setTint(0x24211d).setDepth(DEPTH.bubble + 3).setVisible(false);
    this.tail = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 0).setTint(0xcfc4a4).setDepth(DEPTH.bubble + 3).setVisible(false);
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xf8f0d8).setDepth(DEPTH.bubble + 4).setVisible(false);
  }

  show(text: string, now: number): void {
    this.atlas.ensure(text);
    this.text.setText(text);
    this.born = now;
    this.until = now + SAY_MS;
  }

  active(now: number): boolean {
    return now < this.until;
  }

  /** 프레임마다: (x, bottom)에 놓는다. 끝났으면 숨긴다 */
  place(x: number, bottom: number, labelScale: number, now: number, visible: boolean): void {
    if (now >= this.until || !visible) {
      this.hide();
      if (now >= this.until) this.until = 0;
      return;
    }
    if (this.scale !== labelScale) {
      this.scale = labelScale;
      this.text.setScale(labelScale);
    }
    const s = labelScale;
    const w = this.text.width + PAD_X * 2 * s;
    const h = this.text.height + PAD_Y * 2 * s + 2 * s;
    this.box.x = Math.round(x);
    this.box.y = bottom;
    this.box.w = w + 2 * s;
    this.box.h = h + 2 * s;
    this.setBottom(bottom);
    const a = Math.min(1, (now - this.born) / FADE_MS, (this.until - now) / FADE_MS);
    for (const o of [this.border, this.bg, this.tail, this.text]) o.setAlpha(a).setVisible(true);
  }

  /** 겹침 풀기로 정해진 아래쪽 y */
  setBottom(bottom: number): void {
    const s = this.scale;
    const x = this.box.x;
    this.box.y = bottom;
    const w = this.box.w - 2 * s;
    const h = this.box.h - 2 * s;
    // 꼬리(2px)만큼 띄운다
    const b = bottom - 2 * s;
    this.border.setPosition(x, b + s).setDisplaySize(w + 2 * s, h);
    this.bg.setPosition(x, b).setDisplaySize(w, h - 2 * s);
    this.tail.setPosition(x, b - 0.01).setDisplaySize(2 * s, 2 * s);
    this.text.setPosition(x, b - PAD_Y * s);
  }

  hide(): void {
    if (!this.text.visible) return;
    for (const o of [this.border, this.bg, this.tail, this.text]) o.setVisible(false);
  }

  destroy(): void {
    for (const o of [this.border, this.bg, this.tail, this.text]) o.destroy();
  }
}

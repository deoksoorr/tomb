import type * as Phaser from "phaser";
import { DEPTH } from "../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 11/16 간판 이름표 (사용자: "간판 글씨가 너무 안 읽혀요"). 이름표처럼 화면에서 늘 같은 크기인 또렷한 글씨를
// 진한 판 위에 밝게 (또는 크림 판 위에 진하게) 띄워요. 판과 글씨를 함께 1/zoom으로 키우고 줄여요 (setScale).
// 바닷가(SeaMap)의 시장·부동산·매점·오두막 터·정류장, 마을 정류장 둘(FishZoneView)이 써요.

export type SignPlateStyle = {
  /** 글씨 색 */
  text: number;
  /** 판 색 */
  fill: number;
  /** 테 색 */
  edge: number;
  /** 판 불투명도 */
  alpha?: number;
};

/** 진한 남색 판 + 밝은 글씨 (바닷가 기본) */
export const PLATE_SEA: SignPlateStyle = { text: 0xfdf6e6, fill: 0x2c4a66, edge: 0xbfe6f2, alpha: 0.92 };
/** 크림 판 + 진한 글씨 */
export const PLATE_CREAM: SignPlateStyle = { text: 0x3a2e3a, fill: 0xfbf1dc, edge: 0x8a6e7a, alpha: 0.95 };

/** 이름표 글씨(FONT_PX)에 곱하는 크기 (정수배라 픽셀 글씨가 뭉개지지 않아요) */
export const PLATE_SIZE = 2;

export class SignPlate {
  readonly text: Phaser.GameObjects.BitmapText;
  readonly bg: Phaser.GameObjects.Rectangle;
  private scale = 0;

  constructor(
    scene: Phaser.Scene,
    atlas: GlyphAtlas,
    private readonly x: number,
    /** 판 아랫변 y (월드) */
    private readonly y: number,
    content: string,
    style: SignPlateStyle = PLATE_SEA,
    depth: number = DEPTH.labels - 3,
  ) {
    for (const line of content.split("\n")) atlas.ensure(line);
    this.text = scene.add.bitmapText(x, y, FONT_KEY, content, FONT_PX).setOrigin(0.5, 1).setCenterAlign().setTint(style.text).setDepth(depth + 1);
    const w = Math.ceil(this.text.width) + 10;
    const h = Math.ceil(this.text.height) + 6;
    this.bg = scene.add
      .rectangle(x, y, w, h, style.fill, style.alpha ?? 0.9)
      .setOrigin(0.5, 1)
      .setStrokeStyle(1, style.edge, 0.95)
      .setDepth(depth);
    this.setScale(1);
  }

  /** 화면 크기 맞추기 (보통 1/zoom). 이름표 글씨보다 2배 크게 (간판이라 멀리서도 읽히게 — 글씨는 짧게 한 줄로) */
  setScale(s: number): void {
    const v = s * PLATE_SIZE;
    if (Math.abs(v - this.scale) < 1e-4) return;
    this.scale = v;
    this.place();
  }

  setVisible(v: boolean): this {
    this.text.setVisible(v);
    this.bg.setVisible(v);
    return this;
  }

  private place(): void {
    const s = this.scale;
    this.bg.setScale(s).setPosition(this.x, this.y);
    // 글씨는 판 아랫변에서 여백(3)만큼 위
    this.text.setScale(s).setPosition(this.x, this.y - 3 * s);
  }

  destroy(): void {
    this.text.destroy();
    this.bg.destroy();
  }
}

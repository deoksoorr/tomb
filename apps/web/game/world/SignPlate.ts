import type * as Phaser from "phaser";
import { DEPTH } from "../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 11/16 간판 이름표 (바닷가 시장·부동산·매점·오두막 터). 사용자: "테두리만 너무 두껍다" → 둥근 칠한 나무 판에 1px 얇은 테,
// 위 가장자리 밝은 줄, 판 아래 작은 기둥 하나. 글씨는 이름표와 같은 크기(12px)로 또렷하게 (판은 화면에서 늘 같은 크기 — 1/zoom).
// 판은 Graphics로 화면 px 단위에 맞춰 다시 그려요 (줌이 바뀔 때만). 정류장은 간판 없이 예전처럼 떠 있는 이름표만 써요.

export type SignPlateStyle = {
  /** 글씨 색 (밝은 글씨 + 글꼴의 어두운 외곽선) */
  text: number;
  /** 판 · 위 가장자리 밝은 줄 · 1px 테 · 기둥 */
  fill: number;
  hi: number;
  edge: number;
  post: number;
  /** 11/16 r16 판 없이 마을 이름표처럼 글씨만 (마을 분양 사무소·빈 집터 이름표와 같은 모양) */
  plain?: boolean;
  alpha?: number;
};

/** 칠한 나무 판 (바닷가 기본 — 밝은 모래빛에 어울리는 부드러운 나무색) */
export const PLATE_WOOD: SignPlateStyle = { text: 0xfffaf0, fill: 0xd8a57a, hi: 0xf2cfa6, edge: 0x9c7254, post: 0xb88a64 };
/** 민트 칠 판 (오두막 터 — 분양 준비 중) */
export const PLATE_MINT: SignPlateStyle = { text: 0xffffff, fill: 0x7fc9b8, hi: 0xb8eadc, edge: 0x4f9686, post: 0xb88a64 };

/** 11/16 r16 사용자 "바닷가 간판이 다른 게임 같아요" → 마을 이름표와 같은 글씨만 (마을 분양 사무소 이름표 색) */
export const PLATE_LABEL: SignPlateStyle = { text: 0xd8e4ec, fill: 0, hi: 0, edge: 0, post: 0, plain: true, alpha: 1 };
/** 마을 빈 집터 이름표와 같은 색 (빈 터) · 집이 선 터 */
export const PLATE_LOT_FREE: SignPlateStyle = { text: 0xd9d4c3, fill: 0, hi: 0, edge: 0, post: 0, plain: true, alpha: 0.8 };
export const PLATE_LOT_HOUSE: SignPlateStyle = { text: 0xf0e6d0, fill: 0, hi: 0, edge: 0, post: 0, plain: true, alpha: 0.9 };

/** 판 안쪽 여백 (화면 px) · 기둥 높이 · 모서리 둥글기 */
const PAD_X = 6;
const PAD_Y = 3;
const POST_H = 5;
const RADIUS = 3;

export class SignPlate {
  readonly text: Phaser.GameObjects.BitmapText;
  readonly bg: Phaser.GameObjects.Graphics;
  private scale = 0;
  private readonly tw: number;
  private readonly th: number;

  constructor(
    scene: Phaser.Scene,
    atlas: GlyphAtlas,
    private readonly x: number,
    /** 기둥 아래 끝 y (월드). 판은 그 위에 서요 */
    private readonly y: number,
    content: string,
    private readonly style: SignPlateStyle = PLATE_WOOD,
    depth: number = DEPTH.labels - 3,
    private readonly post = true,
  ) {
    for (const line of content.split("\n")) atlas.ensure(line);
    this.text = scene.add.bitmapText(x, y, FONT_KEY, content, FONT_PX).setOrigin(0.5, 1).setCenterAlign().setTint(style.text).setDepth(depth + 1);
    this.tw = Math.ceil(this.text.width);
    this.th = Math.ceil(this.text.height);
    this.bg = scene.add.graphics().setDepth(depth);
    this.setScale(1);
  }

  /** 화면 크기 맞추기 (1/zoom) — 바뀌었을 때만 다시 그려요 */
  setScale(s: number): void {
    if (Math.abs(s - this.scale) < 1e-4) return;
    this.scale = s;
    const st = this.style;
    if (st.plain) {
      this.bg.clear();
      this.text.setScale(s).setPosition(this.x, this.y).setAlpha(st.alpha ?? 1);
      return;
    }
    const w = (this.tw + PAD_X * 2) * s;
    const h = (this.th + PAD_Y * 2) * s;
    const postH = this.post ? POST_H * s : 0;
    const left = this.x - w / 2;
    const top = this.y - postH - h;
    const g = this.bg.clear();
    if (this.post) {
      g.fillStyle(st.post, 1).fillRect(this.x - s, this.y - postH, 2 * s, postH);
      g.fillStyle(st.edge, 1).fillRect(this.x - s, this.y - s, 2 * s, s);
    }
    g.fillStyle(st.fill, 0.97).fillRoundedRect(left, top, w, h, RADIUS * s);
    g.fillStyle(st.hi, 1).fillRect(left + RADIUS * s, top + s, w - RADIUS * 2 * s, s);
    g.lineStyle(s, st.edge, 1).strokeRoundedRect(left, top, w, h, RADIUS * s);
    this.text.setScale(s).setPosition(this.x, top + h - PAD_Y * s + s);
  }

  setVisible(v: boolean): this {
    this.text.setVisible(v);
    this.bg.setVisible(v);
    return this;
  }

  destroy(): void {
    this.text.destroy();
    this.bg.destroy();
  }
}

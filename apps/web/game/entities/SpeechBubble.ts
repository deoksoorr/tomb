import type * as Phaser from "phaser";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { DEPTH } from "../config";
import { EMOTE_ICONS, emoteGrid, emoteTexKey, type EmoteIcon } from "../sprites/emotes";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

export { phraseOf } from "../logic/phrases";

// 말풍선(say)과 이모티콘(손 흔들기·환호·헌화·살려주세요): 아바타 이름표 바로 위에 뜬다 (머리 꾸미기 → 이름표 → 말풍선 순).
// 글꼴에 외곽선이 구워져 있어 어두운 바탕 + 밝은 글자로 그린다. 이름표처럼 화면 픽셀 크기(labelScale)로 그리되
// 이름표보다 크게 (글자 TEXT_SCALE배, 이모티콘은 화면 픽셀 ICON_PX배). 원점은 가운데 아래 (LabelBox와 같은 규약 → 겹침 풀기에 그대로 넣는다).

export const SAY_MS = 4000;
/** 이모티콘이 떠 있는 시간 */
export const EMOTE_MS = 1800;
const FADE_MS = 220;
const POP_MS = 160;
/** 말풍선 글자 배율 (이름표 대비) */
const TEXT_SCALE = 1.5;
/** 이모티콘 그림 1px = 화면 ICON_PX px */
const ICON_PX = 3;
const PAD_X = 5;
const PAD_Y = 3;
const TAIL = 3;

/** 이모티콘 텍스처 (게임 전체에 한 번) */
export function ensureEmoteTextures(scene: Phaser.Scene): void {
  for (const k of EMOTE_ICONS) {
    const key = emoteTexKey(k);
    if (!scene.textures.exists(key)) addCanvasTexture(scene, key, { canvas: emoteGrid(k).toCanvas() });
  }
}

export class SpeechBubble {
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly bg: Phaser.GameObjects.Image;
  private readonly border: Phaser.GameObjects.Image;
  private readonly tail: Phaser.GameObjects.Image;
  private readonly tailIn: Phaser.GameObjects.Image;
  private mode: "text" | "icon" = "text";
  private until = 0;
  private born = 0;
  private scale = 0;
  private pop = 1;
  /** 겹침 풀기용 상자 (가운데 아래 원점, 월드 단위) */
  readonly box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
  ) {
    this.border = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 1).setTint(0xcfc4a4).setDepth(DEPTH.bubble + 2).setVisible(false);
    this.bg = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 1).setTint(0x24211d).setDepth(DEPTH.bubble + 3).setVisible(false);
    this.tail = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 0).setTint(0xcfc4a4).setDepth(DEPTH.bubble + 2).setVisible(false);
    this.tailIn = scene.add.image(0, 0, TEX.pixel).setOrigin(0.5, 0).setTint(0xcfc4a4).setDepth(DEPTH.bubble + 3).setVisible(false);
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setCenterAlign().setTint(0xf8f0d8).setDepth(DEPTH.bubble + 4).setVisible(false);
    ensureEmoteTextures(scene);
    this.icon = scene.add.image(0, 0, emoteTexKey("wave")).setOrigin(0.5, 1).setDepth(DEPTH.bubble + 4).setVisible(false);
  }

  /** 글 말풍선 (ms 동안. 정해진 문장은 SAY_MS, 자유 채팅은 CHAT_SHOW_MS). 떠 있던 말풍선·이모티콘은 바로 바뀐다 */
  show(text: string, now: number, ms = SAY_MS): void {
    this.atlas.ensure(text);
    this.text.setText(text);
    this.icon.setVisible(false);
    this.mode = "text";
    this.born = now;
    this.until = now + ms;
    this.scale = 0;
  }

  /** 이모티콘 (같은 자리, 말풍선을 대신한다) */
  showIcon(kind: EmoteIcon, now: number, ms = EMOTE_MS): void {
    ensureEmoteTextures(this.scene);
    this.icon.setTexture(emoteTexKey(kind));
    this.text.setVisible(false);
    this.mode = "icon";
    this.born = now;
    this.until = now + ms;
    this.scale = 0;
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
    // 이모티콘은 톡 튀어나온다 (처음 POP_MS 동안 조금 크게 → 제 크기)
    const t = (now - this.born) / POP_MS;
    const pop = this.mode === "icon" && t < 1 ? 1 + 0.25 * Math.sin(t * Math.PI) : 1;
    if (this.scale !== labelScale || this.pop !== pop) {
      this.scale = labelScale;
      this.pop = pop;
      this.text.setScale(labelScale * TEXT_SCALE);
      this.icon.setScale(labelScale * ICON_PX * pop);
    }
    const s = labelScale;
    const content = this.mode === "text" ? this.text : this.icon;
    const cw = this.mode === "text" ? this.text.width : this.icon.width * s * ICON_PX;
    const ch = this.mode === "text" ? this.text.height : this.icon.height * s * ICON_PX;
    this.box.x = Math.round(x);
    this.box.w = cw + (PAD_X * 2 + 2) * s;
    this.box.h = ch + (PAD_Y * 2 + 2 + TAIL) * s;
    this.setBottom(bottom);
    const a = Math.min(1, (now - this.born) / FADE_MS, (this.until - now) / FADE_MS);
    for (const o of [this.border, this.bg, this.tail, this.tailIn, content]) (o as Phaser.GameObjects.Image).setAlpha(a).setVisible(true);
  }

  /** 겹침 풀기로 정해진 아래쪽 y (꼬리 끝) */
  setBottom(bottom: number): void {
    const s = this.scale || 1;
    const x = this.box.x;
    this.box.y = bottom;
    const w = this.box.w;
    const h = this.box.h - TAIL * s;
    const b = bottom - TAIL * s;
    this.border.setPosition(x, b).setDisplaySize(w, h);
    this.bg.setPosition(x, b - s).setDisplaySize(w - 2 * s, h - 2 * s);
    // 꼬리: 테두리색 계단 삼각형 (3칸 → 1칸)
    this.tail.setPosition(x, b).setDisplaySize(3 * s, s);
    this.tailIn.setPosition(x, b + s).setDisplaySize(s, (TAIL - 1) * s);
    const cy = b - s - PAD_Y * s;
    if (this.mode === "text") this.text.setPosition(x, cy);
    else this.icon.setPosition(x, cy + (this.icon.displayHeight - this.icon.height * s * ICON_PX) / 2);
  }

  hide(): void {
    if (!this.border.visible) return;
    for (const o of [this.border, this.bg, this.tail, this.tailIn, this.text, this.icon]) o.setVisible(false);
  }

  destroy(): void {
    for (const o of [this.border, this.bg, this.tail, this.tailIn, this.text, this.icon]) o.destroy();
  }
}

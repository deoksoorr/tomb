import * as Phaser from "phaser";

// 이름 라벨용 동적 비트맵 폰트.
// Galmuri에는 한글 글리프가 수천 개라 미리 아틀라스를 만들 수 없다. 그래서 지금 필요한 글자(채널 사람들 이름,
// 근처 묘비 툴팁)만 CSS 웹폰트(Galmuri11)로 캔버스에 그려 비트맵 폰트로 등록하고, 새 글자가 보이면 이어 붙인다.
// 각 글리프는 픽셀이 뭉개지지 않게 알파를 이진화하고, 어두운 외곽선을 1px 둘러 어떤 바닥 위에서도 읽히게 한다.
// 라벨은 월드에 1/zoom 배율로 놓아 화면에서 1:1 픽셀(12px)로 보인다.
// 새 글자를 그리면 표시만 해 두고, GPU 업로드(1024² 전체)는 렌더 직전에 프레임당 최대 1회만 한다.

export const FONT_KEY = "galmuri-dyn";
const TEX_KEY = "glyph-atlas";
const ATLAS_W = 1024;
const ATLAS_H = 1024;
/** Galmuri11의 기준 크기 (12px = 9pt) */
export const FONT_PX = 12;
const PAD = 1;
const OUTLINE: [number, number, number, number] = [10, 11, 16, 235];

type CharData = Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & { xAdvance: number };

export class GlyphAtlas {
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scratch: CanvasRenderingContext2D;
  private readonly chars: Record<number, CharData> = {};
  private readonly font: string;
  private readonly ascent: number;
  private readonly cellH: number;
  private cx = 0;
  private cy = 0;
  private full = false;
  private dirty = false;

  constructor(scene: Phaser.Scene, family = "Galmuri11") {
    if (scene.textures.exists(TEX_KEY)) scene.textures.remove(TEX_KEY);
    const tex = scene.textures.createCanvas(TEX_KEY, ATLAS_W, ATLAS_H);
    if (!tex) throw new Error("glyph atlas texture");
    this.tex = tex;
    this.ctx = tex.getContext();
    this.font = `${FONT_PX}px "${family}", "Galmuri9", monospace`;

    const sc = document.createElement("canvas");
    sc.width = 64;
    sc.height = 64;
    const sctx = sc.getContext("2d", { willReadFrequently: true });
    if (!sctx) throw new Error("canvas 2d unavailable");
    this.scratch = sctx;
    sctx.font = this.font;
    sctx.textBaseline = "alphabetic";
    const m = sctx.measureText("가Ag");
    this.ascent = Math.round(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || FONT_PX * 0.85);
    const descent = Math.round(m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || FONT_PX * 0.2);
    this.cellH = this.ascent + descent + PAD * 2;

    const data: Phaser.Types.GameObjects.BitmapText.BitmapFontData = {
      font: FONT_KEY,
      size: FONT_PX,
      lineHeight: this.ascent + descent + 1,
      retroFont: false,
      chars: this.chars,
    };
    scene.cache.bitmapFont.remove(FONT_KEY);
    scene.cache.bitmapFont.add(FONT_KEY, { data, texture: TEX_KEY, frame: null, fromAtlas: false });
    this.ensure(" ?…·");
    scene.sys.events.on(Phaser.Scenes.Events.PRE_RENDER, this.flush, this);
    scene.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.sys.events.off(Phaser.Scenes.Events.PRE_RENDER, this.flush, this));
  }

  /** 렌더 직전: 이번 프레임에 글자가 추가됐으면 텍스처를 한 번만 다시 올린다 */
  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.tex.refresh();
  }

  /** text에 쓰인 글자를 아틀라스에 준비한다 (글자 정보는 즉시, 텍스처 업로드는 렌더 직전에) */
  ensure(text: string): void {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // 서로게이트(이모지 등)와 제어문자는 건너뛴다. BitmapText도 charCodeAt 단위로 그린다
      if (code < 32 || (code >= 0xd800 && code <= 0xdfff) || this.chars[code]) continue;
      if (this.addGlyph(code)) this.dirty = true;
    }
  }

  private addGlyph(code: number): boolean {
    if (this.full) return false;
    const ch = String.fromCharCode(code);
    const s = this.scratch;
    s.font = this.font;
    const adv = Math.max(1, Math.round(s.measureText(ch).width));
    if (code === 32) {
      this.chars[code] = this.charData(0, 0, 0, 0, adv);
      return false;
    }
    const w = adv + PAD * 2 + 2;
    const h = this.cellH;
    if (this.cx + w > ATLAS_W) {
      this.cx = 0;
      this.cy += h + 1;
    }
    if (this.cy + h > ATLAS_H) {
      this.full = true;
      return false;
    }

    s.clearRect(0, 0, w + 2, h + 2);
    s.fillStyle = "#fff";
    s.fillText(ch, PAD + 1, PAD + this.ascent);
    const src = s.getImageData(0, 0, w, h).data;
    const out = this.ctx.createImageData(w, h);
    const d = out.data;
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] >= 128;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        if (on(x, y)) {
          d[k] = d[k + 1] = d[k + 2] = d[k + 3] = 255;
        } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)) {
          [d[k], d[k + 1], d[k + 2], d[k + 3]] = OUTLINE;
        }
      }
    }
    this.ctx.putImageData(out, this.cx, this.cy);
    this.chars[code] = this.charData(this.cx, this.cy, w, h, adv);
    this.cx += w + 1;
    return true;
  }

  private charData(x: number, y: number, w: number, h: number, adv: number): CharData {
    return {
      x,
      y,
      width: w,
      height: h,
      centerX: Math.floor(w / 2),
      centerY: Math.floor(h / 2),
      xOffset: -(PAD + 1),
      yOffset: -PAD,
      xAdvance: adv,
      data: {},
      kerning: {},
      u0: x / ATLAS_W,
      v0: y / ATLAS_H,
      u1: (x + w) / ATLAS_W,
      v1: (y + h) / ATLAS_H,
    };
  }
}

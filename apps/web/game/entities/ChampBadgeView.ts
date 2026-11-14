import * as Phaser from "phaser";
import { champBadgeText, champBoards, CHAMP_BOARDS } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { makeCanvas } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 주간 랭킹 1위 배지: 이름표 바로 위 작은 판 "♛ 이번 주 포인트왕" (2·3개면 "이번 주 2관왕/3관왕").
// 판 테두리·글자 색은 랭킹 색(포인트 금 · 사냥 빨강 · 낚시 파랑), 다관왕은 두 색이 번갈아, 3관왕은 무지개로 돈다.
// 배지는 오라 끔(본인 설정)과 상관없이 늘 보인다. 1위 값은 실시간 서버가 입장 토큰·착용 증서(Vercel 서명)에서 받은 것만 온다.

const BOARD_COLOR = [0xffd36a, 0xff7a5a, 0x7ad8ff];
const CROWN_KEY = "champ-badge-crown";
const CROWN = ["w..w..w", "g..g..g", "gg.g.gg", "ggggggg", "grgbgrg", "ggggggg"];

function ensureCrown(scene: Phaser.Scene): string {
  if (!scene.textures.exists(CROWN_KEY)) {
    const { canvas, ctx } = makeCanvas(CROWN[0].length, CROWN.length);
    const pal: Record<string, string> = { g: "#ffd84a", r: "#ff4a5a", b: "#4ab0ff", w: "#fffbe0" };
    CROWN.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] && ((ctx.fillStyle = pal[ch]), ctx.fillRect(x, y, 1, 1))));
    addCanvasTexture(scene, CROWN_KEY, { canvas });
  }
  return CROWN_KEY;
}

function hueColor(h: number): number {
  const c = Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, 0.6, 1) as Phaser.Types.Display.ColorObject;
  return (c.r << 16) | (c.g << 8) | c.b;
}

export class ChampBadgeView {
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly crown: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly halo: Phaser.GameObjects.Image;
  private colors: number[] = [BOARD_COLOR[0]];
  private frameKey = "";
  /** 판 맨 위 (말풍선을 그 위로 올린다) */
  top = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    depth: number,
  ) {
    this.halo = scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth - 0.02).setVisible(false);
    this.frame = scene.add.graphics().setDepth(depth - 0.01).setVisible(false);
    this.crown = scene.add.image(0, 0, ensureCrown(scene)).setOrigin(0, 1).setDepth(depth).setVisible(false);
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0, 1).setDepth(depth).setVisible(false);
  }

  /** 1위 값 (비트 묶음). 바뀌면 글자·색을 다시 */
  set(bits: number): void {
    const label = champBadgeText(bits);
    this.atlas.ensure(label);
    this.text.setText(label);
    this.colors = champBoards(bits).map((b) => BOARD_COLOR[CHAMP_BOARDS.indexOf(b)]);
    this.frameKey = "";
  }

  /** 이름표 위에 놓는다. 판 맨 위 y를 돌려준다. lift = 이름표 바탕판(닉네임 꾸미기)이 있으면 그 위로 더 올릴 높이 */
  sync(label: Phaser.GameObjects.BitmapText, sc: number, vis: boolean, alpha: number, now: number, reduced: boolean, lift = 0): number {
    const on = vis && label.visible && this.text.text !== "";
    const rainbow = this.colors.length === 3;
    const t = reduced ? 0 : now;
    // 다관왕은 두 색이 번갈아, 3관왕은 무지개가 돈다
    const color = rainbow ? hueColor(t / 2400) : this.colors[Math.floor(t / 900) % this.colors.length];
    const tw = this.text.width;
    const th = this.text.height;
    const cw = CROWN[0].length * sc;
    const gap = 2 * sc;
    const padX = 2 * sc;
    const w = cw + gap + tw + padX * 2;
    const h = th + sc;
    const cx = label.x;
    const bottom = label.y - label.height - sc - lift;
    this.top = bottom - h;
    if (this.text.scaleX !== sc) {
      this.text.setScale(sc);
      this.crown.setScale(sc);
    }
    const key = `${w}|${h}|${sc}|${color}`;
    if (on && key !== this.frameKey) {
      this.frameKey = key;
      this.frame
        .clear()
        .fillStyle(0x120e1c, 0.78)
        .fillRect(-w / 2, -h, w, h)
        .lineStyle(sc, color, 1)
        .strokeRect(-w / 2, -h, w, h);
    }
    const x0 = Math.round(cx - w / 2 + padX);
    this.frame.setPosition(Math.round(cx), Math.round(bottom)).setAlpha(alpha).setVisible(on);
    this.crown.setPosition(x0, Math.round(bottom - (h - CROWN.length * sc) / 2)).setAlpha(alpha).setVisible(on);
    this.text
      .setPosition(x0 + cw + gap, Math.round(bottom))
      .setTint(color)
      .setAlpha(alpha)
      .setVisible(on);
    const breathe = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 650);
    this.halo
      .setTint(color)
      .setPosition(cx, bottom - h / 2)
      .setDisplaySize(w + 16 * sc, h + 10 * sc)
      .setAlpha(alpha * (0.18 + 0.22 * breathe))
      .setVisible(on);
    return on ? this.top : label.y - label.height - lift;
  }

  setVisible(v: boolean): void {
    if (v) return; // 다음 sync가 켠다
    this.text.setVisible(false);
    this.crown.setVisible(false);
    this.frame.setVisible(false);
    this.halo.setVisible(false);
  }

  destroy(): void {
    this.text.destroy();
    this.crown.destroy();
    this.frame.destroy();
    this.halo.destroy();
  }
}

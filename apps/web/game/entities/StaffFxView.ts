import * as Phaser from "phaser";
import { DIR, type DirId } from "@tomb/protocol";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { makeCanvas } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 31번 운영자 계정의 저승사자 차림: 검은 망토(AvatarView가 색을 STAFF_COLOR로 바꾼다) + 손에 든 낫 + 발밑에 은은한 안개 +
// 이름표 왼쪽 "운영자" 배지. 운영자 표시는 실시간 서버가 입장 토큰(Vercel 서명)에서 받은 것만 오므로 흉내 낼 수 없다.

/** 저승사자 망토 색 표기 (기본|머리|몸|포인트): 거의 검은 두건·망토, 보랏빛 회색 목도리 */
export const STAFF_COLOR = "#3a3446|#2b2734|#24212c|#6f6488";
export const STAFF_BADGE = "운영자";
const BADGE_TINT = 0xc8b0ff;

// 낫 그림 (오른쪽을 보고 든 모습). L 외곽선, S 날, H 날 반짝임, W 자루, w 자루 그늘
const SCYTHE = [
  "....LLLLL....",
  "...LHHHSSLL..",
  "..LWSSSSSSSL.",
  "..LWLLLLSSSSL",
  "..LWL...LLSSL",
  "..LWL.....LSL",
  "..LWL......LL",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "..LWL........",
  "..LWL........",
  "..LwL........",
  "...L.........",
];
const PAL: Record<string, string> = { L: "#1b1822", S: "#b7bccb", H: "#eef1f8", W: "#6e5238", w: "#4e3a28" };
const SCYTHE_W = SCYTHE[0].length;
const SCYTHE_H = SCYTHE.length;
/** 쥐는 자리 (그림 안 픽셀) */
const GRIP_X = 3.5;
const GRIP_Y = 12;
const SCYTHE_KEY = "staff-scythe";

function ensureScythe(scene: Phaser.Scene): string {
  if (!scene.textures.exists(SCYTHE_KEY)) {
    const { canvas, ctx } = makeCanvas(SCYTHE_W, SCYTHE_H);
    SCYTHE.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const c = PAL[ch];
        if (!c) return;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    addCanvasTexture(scene, SCYTHE_KEY, { canvas });
  }
  return SCYTHE_KEY;
}

export type StaffSync = {
  now: number;
  /** 발밑 (표시 기준) */
  x: number;
  y: number;
  dir: DirId;
  /** 손 위치: 발밑에서 옆으로 dx, 위로 up */
  hand: { dx: number; up: number };
  depth: number;
  moving: boolean;
  /** 물속·해먹·눕기처럼 손이 안 보이는 자세 */
  hidden: boolean;
  reduced: boolean;
  label: Phaser.GameObjects.BitmapText;
  labelScale: number;
};

export class StaffFxView {
  private readonly scythe: Phaser.GameObjects.Image;
  private readonly fog: Phaser.GameObjects.Image[] = [];
  private readonly badge: Phaser.GameObjects.BitmapText;
  /** 마지막으로 본 이름표 글자 ("운영자"면 배지를 숨긴다) */
  private lastLabel = "";

  constructor(scene: Phaser.Scene, atlas: GlyphAtlas, labelDepth: number) {
    this.scythe = scene.add.image(0, 0, ensureScythe(scene));
    for (let i = 0; i < 4; i++)
      this.fog.push(
        scene.add
          .image(0, 0, TEX.glow)
          .setTint(i % 2 ? 0x8a7cb0 : 0x15121c)
          .setBlendMode(i % 2 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setScale(0.5, 0.16),
      );
    atlas.ensure(STAFF_BADGE);
    this.badge = scene.add.bitmapText(0, 0, FONT_KEY, STAFF_BADGE, FONT_PX).setOrigin(1, 1).setDepth(labelDepth).setTint(BADGE_TINT);
  }

  sync(s: StaffSync, vis: boolean): void {
    const side = s.dir === DIR.left || s.dir === DIR.right;
    const flip = s.dir === DIR.left;
    const bob = s.moving && !s.reduced ? Math.round(Math.sin(s.now / 110)) : 0;
    this.scythe
      .setFlipX(flip)
      .setOrigin((flip ? SCYTHE_W - GRIP_X : GRIP_X) / SCYTHE_W, GRIP_Y / SCYTHE_H)
      .setPosition(Math.round(s.x + s.hand.dx), Math.round(s.y - s.hand.up + bob))
      // 뒷모습이면 몸 뒤, 나머지는 앞 (옆모습은 손이 앞에 있다)
      .setDepth(s.dir === DIR.up ? s.depth - 0.06 : s.depth + (side ? 0.06 : 0.04))
      .setVisible(vis && !s.hidden);

    for (let i = 0; i < this.fog.length; i++) {
      const a = s.now / 2100 + i * 1.7;
      const dark = i % 2 === 0;
      const breathe = s.reduced ? 0 : Math.sin(s.now / 900 + i);
      this.fog[i]
        .setPosition(s.x + Math.cos(a) * 7, s.y - 1 + Math.sin(a * 1.3) * 1.5)
        .setAlpha(dark ? 0.32 + 0.06 * breathe : 0.1 + 0.04 * breathe)
        .setDepth(s.depth + (dark ? -0.08 : 0.08))
        .setVisible(vis && !s.hidden);
    }

    const l = s.label;
    this.lastLabel = l.text;
    if (this.badge.scaleX !== s.labelScale) this.badge.setScale(s.labelScale);
    // 이름표가 이미 "운영자"이므로 배지를 함께 띄우면 "운영자 운영자"가 된다 → 이름이 "운영자"면 배지는 숨긴다
    this.badge.setPosition(Math.round(l.x - l.width / 2 - 3 * s.labelScale), l.y).setVisible(vis && l.visible && l.text !== STAFF_BADGE);
  }

  setVisible(v: boolean): void {
    this.scythe.setVisible(v);
    for (const f of this.fog) f.setVisible(v);
    this.badge.setVisible(v && this.lastLabel !== STAFF_BADGE);
  }

  destroy(): void {
    this.scythe.destroy();
    for (const f of this.fog) f.destroy();
    this.badge.destroy();
  }
}

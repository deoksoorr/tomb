import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";

// 11/15 캠핑장 「번개 닭꼬치」: 걸을 때 몸 뒤로 반투명 잔상이 몇 장 따라온다 (AvatarView가 하나씩 가진다).
// 잔상은 몸 그림(지금 프레임·방향·크기)을 메뉴 색 한 가지로 칠한 그림자다. 몇 장만 만들어 돌려 쓴다 (풀).
// 움직임 줄이기면 잔상 대신 발밑에 은은한 빛만.

/** 잔상 장 수 (풀 크기) */
export const TRAIL_GHOSTS = 5;
/** 잔상 하나가 사라지는 시간 (ms) */
const LIFE_MS = 560;
/** 이만큼 움직이고 이만큼 지나야 새 잔상을 남긴다 */
const GAP_PX = 9;
const GAP_MS = 110;
const ALPHA = 0.5;

type Body = Phaser.GameObjects.Sprite;

export class SpeedTrail {
  private ghosts: Phaser.GameObjects.Image[] = [];
  private born: number[] = [];
  private depth: number[] = [];
  private next = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastAt = -Infinity;
  private glow: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private tint: number,
    private readonly reduced: boolean,
  ) {}

  setTint(tint: number): void {
    if (tint === this.tint) return;
    this.tint = tint;
    for (const g of this.ghosts) g.setTintFill(tint);
    this.glow?.setTint(tint);
  }

  /** 매 프레임. moving = 걷거나 뛰는 중(물·탈것 밖), vis = 몸이 보인다, fade = 몸 투명도, big = 바베큐 배율 */
  sync(now: number, s: Body, moving: boolean, vis: boolean, fade: number, big: number): void {
    if (this.reduced) {
      this.glow ??= this.scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(this.tint);
      this.glow
        .setPosition(s.x, s.y - 9 * big)
        .setScale(0.55 * big)
        .setAlpha(0.45 * fade)
        // 몸 위에 살짝 겹쳐 빛나게 한다. 몸 뒤에 두면 낮에는 안 보인다
        .setDepth(s.depth + 0.05)
        .setVisible(vis);
      return;
    }
    if (moving && vis) {
      const far = !(Math.hypot(s.x - this.lastX, s.y - this.lastY) < GAP_PX);
      if (far && now - this.lastAt >= GAP_MS) this.drop(now, s);
    } else this.lastX = Number.NaN;
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i];
      const u = (now - this.born[i]) / LIFE_MS;
      if (u < 0 || u >= 1 || !vis) {
        if (g.visible) g.setVisible(false);
        continue;
      }
      // 몸보다 늘 뒤에 (위로 걸어도 잔상이 몸을 덮지 않게)
      g.setAlpha(ALPHA * (1 - u) * fade).setDepth(Math.min(this.depth[i], s.depth - 0.3 - 0.01 * i));
    }
  }

  /** 지금 몸 그림을 잔상 하나로 남긴다 (가장 오래된 것을 다시 쓴다) */
  private drop(now: number, s: Body): void {
    const i = this.next;
    this.next = (i + 1) % TRAIL_GHOSTS;
    let g = this.ghosts[i];
    if (!g) {
      g = this.scene.add.image(0, 0, s.texture.key, s.frame.name).setTintFill(this.tint);
      this.ghosts[i] = g;
    } else g.setTexture(s.texture.key, s.frame.name);
    g.setOrigin(s.originX, s.originY)
      .setDisplayOrigin(s.displayOriginX, s.displayOriginY)
      .setFlipX(s.flipX)
      .setScale(s.scaleX, s.scaleY)
      .setAngle(s.angle)
      .setPosition(s.x, s.y)
      .setVisible(true);
    this.born[i] = now;
    this.depth[i] = s.depth - 0.3;
    this.lastX = s.x;
    this.lastY = s.y;
    this.lastAt = now;
  }

  destroy(): void {
    for (const g of this.ghosts) g.destroy();
    this.ghosts = [];
    this.glow?.destroy();
    this.glow = null;
  }
}

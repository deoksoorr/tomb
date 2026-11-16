import * as Phaser from "phaser";
import { TEX } from "../assets/manifest";

// 11/16 1위·명예 갈래 칭호(lib/titles TITLE_PERK_GROUP champ): 걸을 때 발자국 자리에 작은 금빛 반짝이가 잠깐 남았다 사라진다.
// 11/16 발 칸 꾸미기(발자국 아이템)를 끼고 있으면 만들지 않는다 (AvatarView setTitle — 그 아이템 발자국이 먼저).
// 화면 연출만 (서버·포인트와 무관). 착용 목록의 칭호로 정하므로 다른 사람 화면에도 같이 보인다 (AvatarView가 하나씩 가진다).
// 몇 개만 만들어 돌려 쓴다 (풀). 움직임 줄이기면 아예 그리지 않는다.

/** 반짝이 수 (풀 크기) */
const SPARKS = 6;
/** 반짝이 하나가 사라지는 시간 (ms) */
const LIFE_MS = 650;
/** 이만큼 움직이고 이만큼 지나야 새 반짝이를 남긴다 (발걸음 간격쯤) */
const GAP_PX = 10;
const GAP_MS = 140;
const ALPHA = 0.75;
const TINT = 0xffe08a;

export class TitleSparkle {
  private sparks: Phaser.GameObjects.Image[] = [];
  private born: number[] = [];
  private baseY: number[] = [];
  private next = 0;
  private side = 1;
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private lastAt = -Infinity;

  constructor(private readonly scene: Phaser.Scene) {}

  /** 매 프레임. x·y = 발 위치, moving = 걷거나 뛰는 중(물·탈것 밖), vis = 몸이 보인다, fade = 몸 투명도, depth = 몸 깊이 */
  sync(now: number, x: number, y: number, depth: number, moving: boolean, vis: boolean, fade: number): void {
    if (moving && vis) {
      const far = !(Math.hypot(x - this.lastX, y - this.lastY) < GAP_PX);
      if (far && now - this.lastAt >= GAP_MS) this.drop(now, x, y, depth);
    } else this.lastX = Number.NaN;
    for (let i = 0; i < this.sparks.length; i++) {
      const g = this.sparks[i];
      const u = (now - this.born[i]) / LIFE_MS;
      if (u < 0 || u >= 1 || !vis) {
        if (g.visible) g.setVisible(false);
        continue;
      }
      // 반짝 떴다가(앞 20%) 천천히 사라진다. 살짝 위로 떠오른다
      const a = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
      g.setAlpha(ALPHA * a * fade)
        .setScale(0.5 + 0.25 * (1 - u))
        .setY(this.baseY[i] - 4 * u);
    }
  }

  /** 발밑에 반짝이 하나 (가장 오래된 것을 다시 쓴다). 좌우 발을 번갈아 */
  private drop(now: number, x: number, y: number, depth: number): void {
    if (!this.scene.textures.exists(TEX.spark)) return;
    const i = this.next;
    this.next = (i + 1) % SPARKS;
    this.side = -this.side;
    const g = (this.sparks[i] ??= this.scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setTint(TINT));
    g.setPosition(x + this.side * 2, y - 1).setDepth(depth - 0.2).setVisible(true);
    this.born[i] = now;
    this.baseY[i] = y - 1;
    this.lastX = x;
    this.lastY = y;
    this.lastAt = now;
  }

  destroy(): void {
    for (const g of this.sparks) g.destroy();
    this.sparks = [];
  }
}

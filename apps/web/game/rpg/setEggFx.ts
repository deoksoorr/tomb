import * as Phaser from "phaser";

// 11/19 숨겨진 5세트 효과 그림 (game/rpg/setEggRun이 언제 켜지는지 정하고, HuntScene이 이걸로 그린다). 도트 톤으로 가볍게:
//  - 말풍선 (칼퇴 본능 「퇴근!」 · 회의 「…그래서 말인데요」): 머리 위를 따라다니다 사라진다
//  - 「승인」 도장 (도장 쾅): 빨간 테두리 도장이 쾅 내려와 찍히고 바랜다
//  - 졸음 「z」 (회의): 조는 적 머리 위로 떠오른다
//  - 발밑 마일리지 (출장): 발밑 작은 막대, 가득 차면 반짝인다
// 동작 줄이기(reduced)면 움직임 없이 나타났다 사라지기만 한다. 글자·말풍선은 화면 크기 그대로(1/zoom)로 그린다.

const FONT = '"Galmuri11", "Galmuri9", monospace';
const DEPTH = 1e6 - 2;

type Bubble = { box: Phaser.GameObjects.Container; until: number; dy: number };

export class SetEggFx {
  private bubbles: Bubble[] = [];
  private mileG: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {}

  private get inv(): number {
    return 1 / (this.scene.cameras.main.zoom || 1);
  }

  /** 머리 위 말풍선 (ms 동안, follow로 위치를 맞춘다) */
  bubble(x: number, y: number, text: string, ms: number, accent = "#3a2c1c"): void {
    // 같은 자리에 하나만 (새 말이 옛 말을 밀어낸다)
    for (const b of this.bubbles) b.box.destroy();
    this.bubbles = [];
    const t = this.scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: "12px", color: accent, resolution: 1 }).setOrigin(0.5, 0.5);
    const w = Math.ceil(t.width) + 10;
    const h = Math.ceil(t.height) + 6;
    const g = this.scene.add.graphics();
    // 도트 말풍선: 검은 1px 테두리 + 크림색 속 + 아래 꼬리 (모서리는 한 칸 깎는다)
    g.fillStyle(0x16121a, 1);
    g.fillRect(-w / 2, -h / 2 - 1, w, h + 2);
    g.fillRect(-w / 2 - 1, -h / 2, w + 2, h);
    g.fillStyle(0xfff6dc, 1);
    g.fillRect(-w / 2 + 1, -h / 2, w - 2, h);
    g.fillRect(-w / 2, -h / 2 + 1, w, h - 2);
    g.fillStyle(0x16121a, 1);
    g.fillRect(-3, h / 2, 6, 2);
    g.fillRect(-2, h / 2 + 2, 4, 2);
    g.fillRect(-1, h / 2 + 4, 2, 1);
    g.fillStyle(0xfff6dc, 1);
    g.fillRect(-2, h / 2, 4, 2);
    g.fillRect(-1, h / 2 + 2, 2, 1);
    const box = this.scene.add.container(x, y, [g, t]).setDepth(DEPTH).setScale(this.inv);
    const dy = h / 2 + 6;
    const now = this.scene.time.now;
    this.bubbles.push({ box, until: now + ms, dy });
    if (!this.reduced) {
      box.setScale(this.inv * 0.6).setAlpha(0);
      this.scene.tweens.add({ targets: box, scale: this.inv, alpha: 1, duration: 140, ease: "Back.easeOut" });
    }
  }

  /** 매 프레임: 말풍선을 머리(x, top) 위로 따라가게, 끝난 것은 지운다 */
  follow(x: number, top: number): void {
    if (!this.bubbles.length) return;
    const now = this.scene.time.now;
    const inv = this.inv;
    this.bubbles = this.bubbles.filter((b) => {
      if (now >= b.until) {
        b.box.destroy();
        return false;
      }
      b.box.setPosition(Math.round(x), Math.round(top - b.dy * inv));
      if (now >= b.until - 220) b.box.setAlpha((b.until - now) / 220);
      return true;
    });
  }

  /** 「승인」 도장 쾅 (도장 쾅) */
  stamp(x: number, y: number): void {
    const t = this.scene.add.text(0, 0, "승인", { fontFamily: FONT, fontSize: "18px", color: "#e0303c", resolution: 1 }).setOrigin(0.5, 0.5);
    const w = Math.ceil(t.width) + 12;
    const h = Math.ceil(t.height) + 6;
    const g = this.scene.add.graphics();
    // 도장 테두리 두 줄 (도트 — 잉크가 고르지 않게 군데군데 빈 칸)
    g.lineStyle(2, 0xe0303c, 1).strokeRect(-w / 2, -h / 2, w, h);
    g.lineStyle(1, 0xe0303c, 0.85).strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
    g.fillStyle(0xfff6dc, 1);
    g.fillRect(-w / 2 + 5, -h / 2 - 1, 2, 2);
    g.fillRect(w / 2 - 1, -h / 2 + 4, 2, 2);
    const box = this.scene.add.container(Math.round(x), Math.round(y), [g, t]).setDepth(DEPTH).setRotation(-0.21);
    const inv = this.inv;
    if (this.reduced) {
      box.setScale(inv);
      this.scene.tweens.add({ targets: box, alpha: 0, delay: 650, duration: 250, onComplete: () => box.destroy() });
      return;
    }
    box.setScale(inv * 2.2).setAlpha(0);
    this.scene.tweens.add({
      targets: box,
      scale: inv,
      alpha: 1,
      duration: 110,
      ease: "Quad.easeIn",
      onComplete: () => {
        this.scene.cameras.main.shake(70, 0.0025);
        this.scene.tweens.add({ targets: box, alpha: 0, delay: 520, duration: 260, onComplete: () => box.destroy() });
      },
    });
  }

  /** 조는 적 머리 위 「z」 (회의) */
  doze(x: number, top: number, i: number): void {
    const t = this.scene.add
      .text(Math.round(x + 4), Math.round(top), i % 2 ? "z" : "Z", { fontFamily: FONT, fontSize: "11px", color: "#bcd8ff", stroke: "#16121a", strokeThickness: 3, resolution: 1 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH)
      .setScale(this.inv);
    if (this.reduced) {
      this.scene.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300, onComplete: () => t.destroy() });
      return;
    }
    this.scene.tweens.add({ targets: t, y: top - 14, x: x + 9, alpha: { from: 1, to: 0 }, delay: i * 60, duration: 1000, ease: "Sine.easeOut", onComplete: () => t.destroy() });
  }

  /** 발밑 마일리지 막대 (출장). ratio 0..1, 가득이면 반짝인다. 안 쓰면 숨긴다 */
  mile(x: number, y: number, ratio: number, on: boolean): void {
    if (!on) {
      this.mileG?.setVisible(false);
      return;
    }
    const g = (this.mileG ??= this.scene.add.graphics());
    g.clear().setVisible(true).setDepth(Math.round(y) + 2);
    // 공격 쿨다운 게이지(발밑 y+3) 바로 아래 한 줄: 주황 막대 + 왼쪽 끝 작은 비행기 점
    const bx = Math.round(x) - 6;
    const by = Math.round(y) + 7;
    const full = ratio >= 1;
    g.fillStyle(0x16121a, 0.7).fillRect(bx - 1, by - 1, 14, 4);
    g.fillStyle(0x5a3414, 1).fillRect(bx, by, 12, 2);
    g.fillStyle(full ? 0xffd27a : 0xf08a24, 1).fillRect(bx, by, Math.round(12 * Math.min(1, ratio)), 2);
    g.fillStyle(0xfff6dc, 1).fillRect(bx - 4, by, 2, 1).fillRect(bx - 3, by - 1, 1, 3);
    if (!full) return;
    // 가득: 막대 둘레 반짝이 (동작 줄이기면 깜빡이지 않고 그대로)
    const blink = this.reduced ? 0 : Math.floor(this.scene.time.now / 160) % 4;
    g.fillStyle(0xfff2a8, 1);
    const pts: [number, number][] = [
      [bx + 14, by],
      [bx + 6, by - 3],
      [bx + 2, by + 4],
      [bx + 10, by + 4],
    ];
    pts.forEach(([px, py], i) => {
      if (this.reduced || i !== blink) g.fillRect(px, py, 1, 1);
    });
  }

  destroy(): void {
    for (const b of this.bubbles) b.box.destroy();
    this.bubbles = [];
    this.mileG?.destroy();
    this.mileG = null;
  }
}

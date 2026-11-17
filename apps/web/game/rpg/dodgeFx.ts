import * as Phaser from "phaser";
import { FXT } from "./combatFx";
import type { Layer } from "./skillSound";

// 11/17 사냥터 낙법 연출: 캐릭터 그림을 굴러가는 쪽으로 기울이고 살짝 뜨게 (HuntScene이 매 프레임 rollPose를 입힌다),
// 지나간 자리에 옅은 잔상, 발밑 흙먼지(시작·착지), 짧은 휙 소리 + 착지 툭. 움직임 줄이기면 잔상·기울기 없이 먼지만.

/** 잔상 간격 (ms) — 0.4초에 네 장쯤 */
const TRAIL_GAP_MS = 90;
const TRAIL_TINT = 0xd8ecff;
const DUST_TINT = 0xd9c7a0;

/** 구르는 동안 몸의 기울기(도)와 뜨는 높이(px). t: 진행 0..1, sx: 굴러가는 쪽 좌우 부호 (위·아래로 구르면 1) */
export function rollPose(t: number, sx: number, reduced: boolean): { angle: number; lift: number } {
  if (reduced || t >= 1) return { angle: 0, lift: 0 };
  const arc = Math.sin(Math.PI * Math.max(0, t));
  // 앞으로 확 숙였다가 일어난다 (한 바퀴를 다 돌리면 발밑 원점이라 몸이 바닥을 쓸고 지나가 어색하다)
  return { angle: Math.round(sx * 38 * arc), lift: Math.round(3 * arc) };
}

/** 구르기 소리: 옷자락 휙(잡음이 위로 쓸림) + 착지 툭 (재생은 RpgSfx.synth) */
export function dodgeSound(): Layer[] {
  return [
    { src: "noise", at: 0, dur: 0.2, gain: 0.26, atk: 0.03, env: "swell", flt: { type: "bandpass", f0: 600, f1: 2400, q: 1.4 }, pan: -0.1 },
    { src: "noise", at: 0.04, dur: 0.12, gain: 0.1, atk: 0.006, env: "perc", flt: { type: "highpass", f0: 3000, f1: 4200, q: 0 } },
    { src: "osc", wave: "sine", at: 0.3, dur: 0.09, f0: 150, f1: 70, gain: 0.22, atk: 0.003, env: "perc" },
    { src: "noise", at: 0.3, dur: 0.1, gain: 0.12, atk: 0.003, env: "perc", flt: { type: "lowpass", f0: 1200, f1: 300, q: 0 } },
  ];
}

export class DodgeFx {
  private trailAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {}

  /** 구르기 시작: 발밑에서 뒤로 흙먼지 */
  start(x: number, y: number, dir: { x: number; y: number }): void {
    this.trailAt = 0;
    this.dust(x, y, -dir.x, -dir.y, this.reduced ? 2 : 4);
  }

  /** 구르는 중 (매 프레임): 일정 간격으로 지금 모습 그대로 옅은 잔상 */
  trail(sprite: Phaser.GameObjects.Sprite, now: number): void {
    if (this.reduced || !sprite.texture || now < this.trailAt) return;
    this.trailAt = now + TRAIL_GAP_MS;
    const g = this.scene.add
      .image(sprite.x, sprite.y, sprite.texture.key, sprite.frame?.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setFlipX(sprite.flipX)
      .setAngle(sprite.angle)
      .setScale(sprite.scaleX, sprite.scaleY)
      .setDepth(sprite.depth - 1)
      .setTintFill(TRAIL_TINT)
      .setAlpha(0.42);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 260, ease: "Quad.easeOut", onComplete: () => g.destroy() });
  }

  /** 착지: 양옆으로 낮게 퍼지는 먼지 */
  land(x: number, y: number, dir: { x: number; y: number }): void {
    this.dust(x, y, dir.x * 0.4, dir.y * 0.4, this.reduced ? 1 : 3);
  }

  /** 흙먼지 n덩이 (dx·dy 쪽으로 퍼진다) */
  private dust(x: number, y: number, dx: number, dy: number, n: number): void {
    const sc = this.scene;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * 0.7;
      const ang = Math.atan2(dy || 0.0001, dx || 0.0001) + spread;
      const d = 5 + Math.random() * 4;
      const p = sc.add
        .image(x + (Math.random() - 0.5) * 4, y - 1, FXT.puff, 1)
        .setTint(DUST_TINT)
        .setAlpha(0.75)
        .setScale(0.5 + Math.random() * 0.2)
        .setDepth(y - 0.5);
      sc.tweens.add({
        targets: p,
        x: p.x + Math.cos(ang) * d,
        y: p.y + Math.sin(ang) * d * 0.5 - 2,
        scale: p.scale * 1.7,
        alpha: 0,
        duration: 340 + Math.random() * 120,
        ease: "Quad.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }
}

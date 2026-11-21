import * as Phaser from "phaser";
import { DEPTH } from "../config";

// 11/20 운영자 순간이동 반짝임 (떠난 자리 out · 도착한 자리 in). 마을·캠핑장·바닷가 장면이 같이 쓴다.
// 텍스처 없이 픽셀 사각형만: 빛기둥 하나 + 둘레로 튀는 별가루 8개. 밤 어둠 위(DEPTH.lights)라 밤에도 보인다

const COLORS = [0xfff4c2, 0xbfe8ff, 0xffd6f4] as const;
const MS = 520;

export function playTeleportFx(scene: Phaser.Scene, x: number, y: number, k: "out" | "in", reduced = false): void {
  if (!scene.sys.isActive()) return;
  const depth = DEPTH.lights + 2;
  const cx = Math.round(x);
  const cy = Math.round(y) - 10; // 몸 가운데쯤
  // 빛기둥: 떠날 때는 위로 길어지며 사라지고, 올 때는 위에서 내려와 줄어든다
  const beam = scene.add.rectangle(cx, cy, 6, 30, 0xfff8dc, 0.85).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  beam.setScale(1, k === "out" ? 0.4 : 1.4);
  scene.tweens.add({
    targets: beam,
    scaleY: k === "out" ? 1.6 : 0.2,
    scaleX: 0.2,
    alpha: 0,
    duration: reduced ? MS / 2 : MS,
    ease: "Sine.easeOut",
    onComplete: () => beam.destroy(),
  });
  if (reduced) return;
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + (k === "in" ? Math.PI / 8 : 0);
    const r0 = k === "in" ? 22 : 4;
    const r1 = k === "in" ? 4 : 22;
    const dot = scene.add
      .rectangle(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7, 2, 2, COLORS[i % COLORS.length], 1)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: dot,
      x: cx + Math.cos(a) * r1,
      y: cy + Math.sin(a) * r1 * 0.7 - 6,
      alpha: 0,
      duration: MS,
      delay: (i % 3) * 30,
      ease: "Quad.easeOut",
      onComplete: () => dot.destroy(),
    });
  }
}

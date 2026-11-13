import * as Phaser from "phaser";
import { DEPTH } from "../../config";
import { makeCanvas } from "../../sprites/pixel";

// 채집 지점(약초·광석·발굴·곤충 수풀) 연출 (사용자 요청: "필 때·사라질 때 티가 나게, 처음 온 사람도 저기 뭔가 있다를 바로 알게").
// - 새로 필 때: 땅에서 솟는 빛 기둥 + 위로 오르는 반짝이 + 옆으로 이는 먼지 (+ "뿅" 소리는 Foraging)
// - 피어 있는 동안: 발밑의 은은한 빛(땅바닥 층, 더하기 섞기 — 밤엔 어둠에 작은 빛 구멍) + 가끔 반짝이는 별. 가까이 가면 더 밝게
// - 창이 끝나 갈 때(몇 초 전): 깜빡이다가, 사라질 때 연기처럼 흩어진다
// - 캐서 없어질 때: 반짝이가 사방으로 터진다

export const NTEX = { glow: "forage-fx-glow", beam: "forage-fx-beam", star: "forage-fx-star", puff: "forage-fx-puff" } as const;

/** 종류별 빛 색 */
export const NODE_GLOW: Record<string, number> = { herb: 0x9cff8a, ore: 0x9ad8ff, dig: 0xffd27a, bug: 0xfff0a0 };

export function ensureNodeFxTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(NTEX.glow)) return;
  {
    // 발밑 빛: 납작한 부드러운 원 (흰색 → 색은 tint). 32×32 원을 세로 절반으로 눌러 캔버스를 꽉 채운다
    // (예전엔 4px 내려 그려서 윗부분이 일자로 잘려 보였다)
    const { canvas, ctx } = makeCanvas(32, 16);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.45, "rgba(255,255,255,0.35)");
    g.addColorStop(0.8, "rgba(255,255,255,0.06)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.setTransform(1, 0, 0, 0.5, 0, 0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tx.addCanvas(NTEX.glow, canvas);
  }
  {
    // 빛 기둥: 아래가 밝고 위로 사라지는 세로 띠
    const { canvas, ctx } = makeCanvas(10, 56);
    const g = ctx.createLinearGradient(0, 56, 0, 0);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.5, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(2, 0, 6, 56);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(0, 20, 1, 36);
    ctx.fillRect(9, 20, 1, 36);
    tx.addCanvas(NTEX.beam, canvas);
  }
  {
    // 반짝 별 (십자)
    const { canvas, ctx } = makeCanvas(5, 5);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
    tx.addCanvas(NTEX.star, canvas);
  }
  {
    // 연기·먼지 한 덩이
    const { canvas, ctx } = makeCanvas(8, 8);
    const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 8);
    tx.addCanvas(NTEX.puff, canvas);
  }
}

/** 피어 있는 지점 하나의 은은한 빛·반짝 별 */
export type NodeAura = { glow: Phaser.GameObjects.Image; star: Phaser.GameObjects.Image; seed: number; color: number };

export function makeAura(scene: Phaser.Scene, x: number, y: number, kind: string): NodeAura {
  const color = NODE_GLOW[kind] ?? 0xffffff;
  // 빛은 땅바닥 층(물건·사람 밑)에 깐다. 밤에는 Foraging.addLights가 어둠에 작은 구멍을 내서 보이게 한다
  const glow = scene.add.image(x, y, NTEX.glow).setDepth(DEPTH.decal + 4).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(0.3);
  const star = scene.add.image(x, y - 10, NTEX.star).setDepth(DEPTH.lights + 2).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffffff).setAlpha(0);
  return { glow, star, seed: (x * 31 + y * 17) % 997, color };
}

/**
 * 매 프레임: 빛은 천천히 숨쉬고, 가까우면 더 밝다. 별은 가끔 반짝. blink(0..1) = 창이 끝나 가는 정도 (0이면 평소)
 * 돌려주는 값 = 지점 그림에 줄 알파 (깜빡임)
 */
export function updateAura(a: NodeAura, now: number, near: number, blink: number, reduced: boolean): number {
  const breathe = reduced ? 0 : Math.sin((now + a.seed * 13) / 700) * 0.08;
  let alpha = 0.4 + breathe + near * 0.45;
  let imgAlpha = 1;
  if (blink > 0) {
    // 끝나 갈수록 빠르게 깜빡인다
    const rate = 160 - blink * 90;
    const on = Math.sin(now / rate) > 0;
    imgAlpha = on ? 1 : 0.35;
    alpha *= on ? 1 : 0.4;
  }
  a.glow.setAlpha(Math.max(0, alpha)).setScale(1 + near * 0.35);
  // 반짝 별: 1.4초마다 한 번, 자리는 그때그때 다르게
  if (!reduced) {
    const cyc = (now + a.seed * 7) / 1400;
    const k = cyc % 1;
    const n = Math.floor(cyc);
    if (k < 0.28) {
      const s = Math.sin((k / 0.28) * Math.PI);
      const ox = ((n * 37 + a.seed) % 13) - 6;
      const oy = ((n * 53 + a.seed) % 7) + 6;
      a.star.setPosition(a.glow.x + ox, a.glow.y - oy).setAlpha(s * (0.6 + near * 0.4) * (blink > 0 ? imgAlpha : 1)).setScale(0.6 + s * 0.6);
    } else a.star.setAlpha(0);
  }
  return imgAlpha;
}

export function destroyAura(a: NodeAura): void {
  a.glow.destroy();
  a.star.destroy();
}

/** 새로 필 때: 빛 기둥 + 오르는 반짝이 + 먼지 */
export function spawnFx(scene: Phaser.Scene, x: number, y: number, kind: string, reduced: boolean): void {
  const color = NODE_GLOW[kind] ?? 0xffffff;
  const beam = scene.add.image(x, y + 1, NTEX.beam).setOrigin(0.5, 1).setDepth(DEPTH.lights + 2).setBlendMode(Phaser.BlendModes.ADD).setTint(color);
  if (reduced) {
    beam.setAlpha(0.7);
    scene.time.delayedCall(700, () => beam.destroy());
    return;
  }
  beam.setScale(1, 0.1).setAlpha(1);
  scene.tweens.add({ targets: beam, scaleY: 1, duration: 260, ease: "Quad.easeOut" });
  scene.tweens.add({ targets: beam, alpha: 0, scaleX: 0.4, delay: 380, duration: 700, onComplete: () => beam.destroy() });
  for (let i = 0; i < 8; i++) {
    const s = scene.add.image(x + (i - 3.5) * 2, y - 2, NTEX.star).setDepth(DEPTH.lights + 3).setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0xffffff : color).setScale(0.6);
    scene.tweens.add({ targets: s, x: x + (i - 3.5) * 4, y: y - 16 - (i % 4) * 7, alpha: 0, scale: 0.2, delay: i * 35, duration: 700 + (i % 3) * 120, ease: "Quad.easeOut", onComplete: () => s.destroy() });
  }
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const d = scene.add.image(x, y, NTEX.puff).setDepth(y + 2).setTint(0xb8a07a).setAlpha(0.7).setScale(0.6);
    scene.tweens.add({ targets: d, x: x + side * (8 + i * 3), y: y - 2 - i, alpha: 0, scale: 1.3, duration: 520, ease: "Quad.easeOut", onComplete: () => d.destroy() });
  }
}

/** 시간이 다 돼 사라질 때: 그림이 옅어지며 연기처럼 흩어진다 */
export function vanishFx(scene: Phaser.Scene, img: Phaser.GameObjects.Image, reduced: boolean): void {
  const { x, y } = img;
  if (reduced) {
    img.destroy();
    return;
  }
  scene.tweens.add({ targets: img, alpha: 0, scaleX: 1.2, scaleY: 0.5, duration: 600, ease: "Quad.easeIn", onComplete: () => img.destroy() });
  for (let i = 0; i < 7; i++) {
    const p = scene.add.image(x + (i - 3) * 3, y - 4 - (i % 3) * 2, NTEX.puff).setDepth(y + 3).setTint(0xc8c8d0).setAlpha(0.75).setScale(0.8);
    scene.tweens.add({ targets: p, x: p.x + (i - 3) * 3, y: p.y - 14 - (i % 4) * 4, alpha: 0, scale: 2, delay: i * 40, duration: 900, ease: "Sine.easeOut", onComplete: () => p.destroy() });
  }
}

/** 캐서 없어질 때: 반짝이가 사방으로 */
export function gatheredFx(scene: Phaser.Scene, x: number, y: number, kind: string, reduced: boolean): void {
  if (reduced) return;
  const color = NODE_GLOW[kind] ?? 0xffffff;
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const s = scene.add.image(x, y - 5, NTEX.star).setDepth(DEPTH.lights + 3).setBlendMode(Phaser.BlendModes.ADD).setTint(i % 2 ? 0xffffff : color);
    scene.tweens.add({ targets: s, x: x + Math.cos(a) * 14, y: y - 5 + Math.sin(a) * 9, alpha: 0, scale: 0.3, duration: 520, ease: "Quad.easeOut", onComplete: () => s.destroy() });
  }
}

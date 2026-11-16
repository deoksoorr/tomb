import type * as Phaser from "phaser";
import { darken, Grid, lighten, radial, type Color } from "../../sprites/pixel";

// 11/16 바닷가·캠핑장 주민 손 소품 (픽셀 그림, 파일 없이). 테두리는 검정 대신 그 색을 어둡게 한 색 (아바타·바닷가 그림과 같은 부드러운 톤).
// 그림은 오른쪽을 보는 모습 — 왼쪽을 보면 Folk가 뒤집는다.

export const FTEX = {
  tewak: "folk-tewak",
  basket: "folk-basket",
  hoe: "folk-hoe",
  icebox: "folk-icebox",
  rescue: "folk-rescue",
  camera: "folk-camera",
  flash: "folk-flash",
  axe: "folk-axe",
  stump: "folk-stump",
  tongs: "folk-tongs",
  pole: "folk-pole",
  rod: "folk-rod",
  scope: "folk-scope",
  ball: "folk-ball",
  puff: "folk-puff",
} as const;

/** 바깥 테두리 = 채운 색 중 가장 많은 색을 어둡게 (톤을 맞춘 테두리) */
function soft(g: Grid, base: Color, k = 0.42): HTMLCanvasElement {
  g.outline(darken(base, k));
  return g.toCanvas();
}

function tewak(): HTMLCanvasElement {
  // 해녀 테왁: 주황 공 + 그물 망사리
  const base = 0xf0903c;
  const g = new Grid(11, 10);
  g.ellipse(5, 4, 4.2, 3.6, base);
  g.hline(3, 5, 2, lighten(base, 0.45));
  const net = darken(base, 0.3);
  for (const x of [3, 5, 7]) g.vline(x, 5, 7, net);
  g.hline(2, 8, 6, net);
  g.rect(4, 8, 3, 1, 0x7a9a8a); // 망사리 끝
  return soft(g, base);
}

function basket(): HTMLCanvasElement {
  const base = 0xc8a064;
  const g = new Grid(10, 8);
  g.rect(1, 3, 8, 4, base);
  g.hline(1, 8, 4, darken(base, 0.18));
  g.hline(1, 8, 6, darken(base, 0.18));
  g.set(3, 2, 0xe8dcc0);
  g.set(5, 2, 0xd8c8a8);
  g.set(6, 2, 0xe8dcc0); // 조개
  return soft(g, base);
}

function hoe(): HTMLCanvasElement {
  // 호미: 짧은 나무 손잡이 + 굽은 날
  const wood = 0xa0703c;
  const g = new Grid(9, 8);
  g.vline(2, 2, 6, wood);
  g.vline(3, 2, 6, darken(wood, 0.12));
  g.hline(3, 6, 1, 0x9aa6aa);
  g.hline(5, 7, 2, 0x9aa6aa);
  g.set(7, 3, 0x9aa6aa);
  return soft(g, wood);
}

function icebox(): HTMLCanvasElement {
  // 아이스박스: 하늘색 통 + 흰 뚜껑 + 어깨끈 고리
  const base = 0x8ec8e6;
  const g = new Grid(11, 9);
  g.rect(1, 3, 9, 5, base);
  g.rect(1, 2, 9, 2, 0xf4f4ee);
  g.hline(3, 7, 5, lighten(base, 0.35));
  g.set(5, 6, 0xf08aa0); // 딸기 아이스크림 그림
  g.set(5, 5, 0xf8d8a0);
  g.set(1, 1, 0xd0c0a0);
  g.set(9, 1, 0xd0c0a0);
  return soft(g, base);
}

function rescue(): HTMLCanvasElement {
  // 구조 튜브 (빨간 레스큐 캔)
  const base = 0xe2604c;
  const g = new Grid(14, 6);
  g.rect(1, 1, 12, 4, base);
  g.hline(2, 11, 1, lighten(base, 0.35));
  g.rect(5, 2, 4, 2, 0xf6eee2);
  return soft(g, base);
}

function camera(): HTMLCanvasElement {
  const base = 0x5a5f6a;
  const g = new Grid(8, 7);
  g.rect(1, 2, 6, 4, base);
  g.rect(2, 1, 2, 1, base);
  g.ellipse(4.5, 3.8, 1.4, 1.2, 0x9ab8d0);
  g.set(6, 2, 0xf4e6b0);
  return soft(g, base, 0.3);
}

function axe(): HTMLCanvasElement {
  // 손도끼 (손잡이 아래가 쥐는 곳)
  const wood = 0xa8783e;
  const g = new Grid(9, 12);
  g.vline(3, 2, 10, wood);
  g.vline(4, 2, 10, darken(wood, 0.12));
  g.rect(5, 1, 3, 4, 0xa4aeb2);
  g.set(7, 0, 0xa4aeb2);
  g.set(7, 5, 0xa4aeb2);
  g.vline(8, 1, 4, 0xd8e0e2);
  return soft(g, wood);
}

function stump(): HTMLCanvasElement {
  // 장작 패는 그루터기 + 올려 둔 장작
  const bark = 0x8a5a34;
  const g = new Grid(16, 10);
  g.rect(2, 4, 12, 5, bark);
  g.ellipse(8, 4, 6, 2, 0xd8b480);
  g.ellipse(8, 4, 3, 1, 0xc49a64);
  g.rect(6, 1, 4, 3, 0xc8925a);
  g.hline(6, 9, 1, lighten(0xc8925a, 0.3));
  return soft(g, bark);
}

function tongs(): HTMLCanvasElement {
  const steel = 0xb4bcc0;
  const g = new Grid(10, 5);
  g.hline(1, 8, 1, steel);
  g.hline(1, 8, 3, steel);
  g.vline(1, 1, 3, 0x6a4a34);
  g.vline(0, 1, 3, 0x6a4a34);
  return soft(g, steel, 0.45);
}

function pole(): HTMLCanvasElement {
  // 등산 스틱 하나 (위 손잡이 · 아래 촉)
  const g = new Grid(3, 14);
  g.vline(1, 1, 12, 0x7a8ea8);
  g.set(1, 1, 0x3a4a5a);
  g.set(1, 2, 0x3a4a5a);
  g.set(1, 13, 0xa0a8b0);
  return soft(g, 0x7a8ea8, 0.35);
}

function rod(): HTMLCanvasElement {
  // 대나무 낚싯대 (왼쪽 아래 손잡이 → 오른쪽 위 끝) + 늘어진 줄
  const bamboo = 0xc8a85a;
  const g = new Grid(18, 14);
  for (let i = 0; i < 13; i++) g.set(1 + i, 12 - Math.round(i * 0.8), i < 4 ? darken(bamboo, 0.2) : bamboo);
  const tipX = 13;
  const tipY = 2;
  for (let y = tipY + 1; y <= 11; y++) g.set(tipX + (y > 8 ? 1 : 0), y, 0xe8e8e0, 170);
  g.set(14, 12, 0xe85a4a);
  g.set(14, 11, 0xf4f0e8);
  return g.toCanvas();
}

function scope(): HTMLCanvasElement {
  // 작은 망원경 + 세발 받침
  const body = 0x6a7aa8;
  const g = new Grid(12, 12);
  for (let i = 0; i < 7; i++) {
    g.set(2 + i, 6 - Math.round(i * 0.6), body);
    g.set(2 + i, 7 - Math.round(i * 0.6), darken(body, 0.15));
  }
  g.set(9, 2, 0xd8e4f0);
  const leg = 0x8a6a4a;
  g.vline(5, 7, 11, leg);
  g.set(4, 10, leg);
  g.set(3, 11, leg);
  g.set(6, 10, leg);
  g.set(7, 11, leg);
  return soft(g, body, 0.35);
}

function ball(): HTMLCanvasElement {
  const g = new Grid(8, 8);
  g.ellipse(3.5, 3.5, 3.2, 3.2, 0xf4f0e6);
  g.rect(1, 2, 2, 3, 0xe86a5a);
  g.rect(5, 2, 2, 3, 0x6aa8e0);
  g.rect(3, 0, 2, 2, 0xf0c850);
  return soft(g, 0xf4f0e6, 0.35);
}

/** 한 번만 만든다 (장면이 바뀌어도 텍스처는 남는다) */
export function ensureFolkTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(FTEX.ball)) return;
  tx.addCanvas(FTEX.tewak, tewak());
  tx.addCanvas(FTEX.basket, basket());
  tx.addCanvas(FTEX.hoe, hoe());
  tx.addCanvas(FTEX.icebox, icebox());
  tx.addCanvas(FTEX.rescue, rescue());
  tx.addCanvas(FTEX.camera, camera());
  tx.addCanvas(FTEX.flash, radial(24, [[0, "rgba(255,255,248,1)"], [0.35, "rgba(255,250,230,0.7)"], [1, "rgba(255,250,230,0)"]]));
  tx.addCanvas(FTEX.axe, axe());
  tx.addCanvas(FTEX.stump, stump());
  tx.addCanvas(FTEX.tongs, tongs());
  tx.addCanvas(FTEX.pole, pole());
  tx.addCanvas(FTEX.rod, rod());
  tx.addCanvas(FTEX.scope, scope());
  tx.addCanvas(FTEX.puff, radial(12, [[0, "rgba(236,232,226,0.8)"], [1, "rgba(236,232,226,0)"]]));
  tx.addCanvas(FTEX.ball, ball());
}

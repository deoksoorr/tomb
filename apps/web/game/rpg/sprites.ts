import type * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import { AV_COLS, AV_H, AV_W, buildAvatarSheet } from "../sprites/avatar";
import { darken, Grid, lighten, type Color } from "../sprites/pixel";
import { monsterFrameSize, monsterSheet } from "./monsterArt";

// 사냥터·미니게임 텍스처 (코드로 그린 픽셀아트). 씬이 처음 뜰 때 한 번 만들고 게임이 끝날 때까지 둔다.

const OUT = 0x141218;

export const RTEX = {
  player: "rpg-player",
  monster: (id: MonsterId) => `rpg-m-${id}`,
  slash: "rpg-slash",
  spark: "rpg-spark",
  orb: "rpg-orb",
  fire: "rpg-fire",
  ring: "rpg-ring",
  helper: "rpg-helper",
  shadow: "rpg-shadow",
  floor: (seed: string) => `rpg-floor-${seed}`,
  desk: "rpg-desk",
  tree: "rpg-tree",
  rock: "rpg-rock",
  bug: "rpg-bug",
  golden: "rpg-golden",
  decoy: "rpg-decoy",
  star: "rpg-star",
  glow: "rpg-glow",
  dust: "rpg-dust",
  feature: "rpg-feature",
  splat: "rpg-splat",
  coffee: "rpg-coffee",
  runner: "rpg-runner",
} as const;

/** 캔버스를 프레임 여러 개짜리 텍스처로 등록 (가로로 나열된 프레임) */
function addFrames(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, fw: number, fh: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) return;
  const cols = Math.floor(canvas.width / fw);
  const rows = Math.floor(canvas.height / fh);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
}

function addOnce(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement, fw?: number, fh?: number): void {
  if (scene.textures.exists(key)) return;
  const c = make();
  addFrames(scene, key, c, fw ?? c.width, fh ?? c.height);
}

/** 내 아바타 시트 (월드와 같은 그림). 색·꾸미기가 바뀌었을 수 있으니 판마다 새로 만든다 */
export function makePlayer(scene: Phaser.Scene, color: string, look: readonly string[], body = "hood"): void {
  addFrames(scene, RTEX.player, buildAvatarSheet(color, look, body), AV_W, AV_H);
}
export const avFrame = (dirRow: number, col: number) => dirRow * AV_COLS + col;

// ── 몬스터: 40번에서 동작별 12프레임 시트로 (game/rpg/monsterArt.ts) ──

// ── 효과·지형 ──

function slash(): HTMLCanvasElement {
  const g = new Grid(24, 24);
  for (let t = 0; t < 40; t++) {
    const ang = -Math.PI * 0.75 + (t / 40) * Math.PI * 1.5;
    for (let r = 8; r < 11; r++) g.set(12 + Math.cos(ang) * r, 12 + Math.sin(ang) * r, r === 10 ? 0xffffff : 0xd9e8f2, 230);
  }
  return g.toCanvas();
}

function dot(r: number, c: Color, rim: Color): HTMLCanvasElement {
  const g = new Grid(r * 2 + 2, r * 2 + 2);
  g.ellipse(r + 1, r + 1, r, r, c);
  g.ellipse(r + 0.5, r + 0.5, r * 0.45, r * 0.45, lighten(c, 0.6));
  g.outline(rim);
  return g.toCanvas();
}

function ring(): HTMLCanvasElement {
  const g = new Grid(64, 64);
  for (let t = 0; t < 200; t++) {
    const ang = (t / 200) * Math.PI * 2;
    g.set(32 + Math.cos(ang) * 31, 32 + Math.sin(ang) * 31, 0xffffff);
    g.set(32 + Math.cos(ang) * 30, 32 + Math.sin(ang) * 30, 0xffffff, 140);
  }
  return g.toCanvas();
}

function shadow(): HTMLCanvasElement {
  const g = new Grid(16, 6);
  g.ellipse(8, 3, 7, 2.5, 0x000000, 90);
  return g.toCanvas();
}

function helper(): HTMLCanvasElement {
  const sheet = new Grid(28, 14);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(14, 14);
    g.ellipse(7, 6 - f, 5, 5, 0xd9dccf, 220);
    g.rect(2, 6 - f, 10, 5, 0xd9dccf, 220);
    g.set(5, 5 - f, OUT);
    g.set(9, 5 - f, OUT);
    g.rect(9, 9 - f, 4, 2, 0x55704f);
    g.outline(0x55704f);
    sheet.draw(g, f * 14, 0);
  }
  return sheet.toCanvas();
}

function floorTile(a: Color, b: Color, deco: Color, seed: number): HTMLCanvasElement {
  const g = new Grid(32, 32);
  g.rect(0, 0, 32, 32, a);
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 40; i++) g.set(r() * 32, r() * 32, b);
  for (let i = 0; i < 4; i++) g.set(r() * 32, r() * 32, deco, 120);
  g.hline(0, 31, 31, darken(a, 0.12));
  g.vline(31, 0, 31, darken(a, 0.12));
  return g.toCanvas();
}

function desk(): HTMLCanvasElement {
  const g = new Grid(28, 18);
  g.rect(1, 4, 26, 6, 0x8a6a4a);
  g.rect(1, 4, 26, 1, 0xa88a6a);
  g.rect(2, 10, 2, 7, 0x5a3e22);
  g.rect(24, 10, 2, 7, 0x5a3e22);
  g.rect(10, 0, 9, 5, 0x2a2e36);
  g.rect(11, 1, 7, 3, 0x6ad0c8);
  g.outline(OUT);
  return g.toCanvas();
}

function tree(): HTMLCanvasElement {
  const g = new Grid(22, 28);
  g.rect(9, 16, 4, 11, 0x4a3e2a);
  g.ellipse(11, 10, 9, 9, 0x2e4a2a);
  g.ellipse(9, 8, 5, 5, 0x3e5a36);
  for (let i = 0; i < 6; i++) g.set(5 + i * 2, 6 + (i % 3) * 3, 0x6ad07a);
  g.outline(OUT);
  return g.toCanvas();
}

function rock(): HTMLCanvasElement {
  const g = new Grid(20, 14);
  g.ellipse(10, 8, 9, 5.5, 0x4a4552);
  g.ellipse(8, 6, 4, 2, 0x6a6572);
  g.outline(OUT);
  return g.toCanvas();
}

function bug(golden: boolean, decoy = false): HTMLCanvasElement {
  const sheet = new Grid(32, 16);
  const body = decoy ? 0x7a7f88 : golden ? 0xf0c83c : 0xc83c3c;
  for (let f = 0; f < 2; f++) {
    const g = new Grid(16, 16);
    g.ellipse(8, 9, 4.5, 5, body);
    g.ellipse(8, 4, 2.5, 2, darken(body, 0.4));
    g.vline(8, 5, 13, darken(body, 0.4));
    g.set(6, 7, 0xf2ead3);
    g.set(10, 10, 0xf2ead3);
    for (const y of [6, 9, 12]) {
      g.set(2 + f, y + (f ? 1 : 0), OUT);
      g.set(13 - f, y + (f ? 0 : 1), OUT);
    }
    g.set(6, 1 + f, OUT);
    g.set(10, 2 - f, OUT);
    if (golden) {
      g.set(4, 3, 0xffffff);
      g.set(12, 14, 0xffffff);
    }
    if (decoy) {
      // 주석 처리: 몸통을 가로지르는 '//'
      for (let i = 0; i < 9; i++) g.set(3 + i, 13 - i, 0xe8e8ec);
      for (let i = 0; i < 9; i++) g.set(6 + i, 13 - i, 0xe8e8ec);
    }
    g.outline(OUT);
    sheet.draw(g, f * 16, 0);
  }
  return sheet.toCanvas();
}

function feature(): HTMLCanvasElement {
  const sheet = new Grid(32, 16);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(16, 16);
    g.ellipse(8, 8, 6, 6, 0x40a050);
    const ck = [[4, 8], [5, 9], [6, 10], [7, 9], [8, 8], [9, 7], [10, 6], [11, 5]];
    for (const [x, y] of ck) g.rect(x, y - f, 2, 1, 0xf2ead3);
    g.outline(0x205028);
    sheet.draw(g, f * 16, 0);
  }
  return sheet.toCanvas();
}

function splat(): HTMLCanvasElement {
  const g = new Grid(20, 20);
  g.ellipse(10, 10, 5, 4, 0x8a2a2a);
  for (const [x, y] of [[3, 5], [16, 4], [4, 15], [17, 14], [10, 2], [10, 18]]) g.rect(x, y, 2, 2, 0x8a2a2a);
  return g.toCanvas();
}

function coffee(): HTMLCanvasElement {
  const g = new Grid(12, 12);
  g.rect(2, 3, 7, 8, 0xe8d9b0);
  g.rect(2, 3, 7, 2, 0x6a4a30);
  g.rect(9, 5, 2, 4, 0xe8d9b0);
  g.set(4, 1, 0xd9dccf);
  g.set(6, 0, 0xd9dccf);
  g.outline(OUT);
  return g.toCanvas();
}

/** 별: 네 갈래 반짝임이 있는 작은 별 (흰 → 노란 중심) */
function starTex(): HTMLCanvasElement {
  const g = new Grid(15, 15);
  for (let i = 0; i < 15; i++) {
    const a = 255 - Math.abs(i - 7) * 34;
    g.set(i, 7, 0xfff3c8, Math.max(40, a));
    g.set(7, i, 0xfff3c8, Math.max(40, a));
  }
  g.ellipse(7.5, 7.5, 2.6, 2.6, 0xfff3c8);
  g.ellipse(7.5, 7.5, 1.4, 1.4, 0xffffff);
  return g.toCanvas();
}

/** 부드러운 빛 번짐 (가산 혼합용, 안티앨리어싱 허용) */
function glowTex(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,200,0.9)");
  gr.addColorStop(0.35, "rgba(255,220,150,0.35)");
  gr.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/** 씬 공용 텍스처를 한 번만 만든다 */
export function ensureRpgTextures(scene: Phaser.Scene): void {
  for (const id of Object.keys(MONSTERS) as MonsterId[]) {
    const fs = monsterFrameSize(id);
    addOnce(scene, RTEX.monster(id), () => monsterSheet(id), fs, fs);
  }
  addOnce(scene, RTEX.slash, slash);
  addOnce(scene, RTEX.spark, () => dot(2, 0xffe39a, 0xc87a2a));
  addOnce(scene, RTEX.orb, () => dot(3, 0xd9dccf, 0x5a6a8a));
  addOnce(scene, RTEX.fire, () => dot(4, 0xffb040, 0xa83c3c));
  addOnce(scene, RTEX.ring, ring);
  addOnce(scene, RTEX.helper, helper, 14, 14);
  addOnce(scene, RTEX.shadow, shadow);
  addOnce(scene, RTEX.desk, desk);
  addOnce(scene, RTEX.tree, tree);
  addOnce(scene, RTEX.rock, rock);
  addOnce(scene, RTEX.bug, () => bug(false), 16, 16);
  addOnce(scene, RTEX.golden, () => bug(true), 16, 16);
  addOnce(scene, RTEX.decoy, () => bug(false, true), 16, 16);
  addOnce(scene, RTEX.star, starTex);
  addOnce(scene, RTEX.glow, glowTex);
  addOnce(scene, RTEX.dust, () => dot(1, 0xfff3c8, 0xfff3c8));
  addOnce(scene, RTEX.feature, feature, 16, 16);
  addOnce(scene, RTEX.splat, splat);
  addOnce(scene, RTEX.coffee, coffee);
}

export function ensureFloor(scene: Phaser.Scene, key: string, a: Color, b: Color, deco: Color, seed: number): string {
  const k = RTEX.floor(key);
  addOnce(scene, k, () => floorTile(a, b, deco, seed));
  return k;
}

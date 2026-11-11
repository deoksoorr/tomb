import * as Phaser from "phaser";
import { darken, Grid, lighten, type Color } from "../sprites/pixel";

// 32번 곤충 채집: 옛 사냥터 "벌레 잡기"를 마을 수풀로 옮긴 그림. 같은 규칙(9칸·콤보)이지만
// 창 대신 풀숲 9군데, 버그 대신 나비·잠자리(낮) / 반딧불이(밤), 금빛 곤충, 건드리면 안 되는 꿀벌, 나비처럼 보이는 낙엽.
// 2프레임 시트(16×16 × 2, 날갯짓)라 BugsScene이 같은 방식으로 프레임을 돌린다.

export const MTEX = {
  bug: (night: boolean) => (night ? "meadow-firefly" : "meadow-butterfly"),
  golden: "meadow-golden",
  feature: "meadow-bee",
  decoy: "meadow-leaf",
  tuft: "meadow-tuft",
  splat: "meadow-catch",
} as const;

const OUT = 0x16121a;

function sheet(draw: (g: Grid, f: number) => void): HTMLCanvasElement {
  const s = new Grid(32, 16);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(16, 16);
    draw(g, f);
    s.draw(g, f * 16, 0);
  }
  return s.toCanvas();
}

function wings(g: Grid, f: number, w1: Color, w2: Color, body: Color): void {
  const spread = f ? 3.4 : 2.2;
  g.ellipse(8 - spread, 6, spread, 3, w1);
  g.ellipse(8 + spread, 6, spread, 3, w1);
  g.ellipse(8 - spread * 0.8, 10, spread * 0.8, 2.2, w2);
  g.ellipse(8 + spread * 0.8, 10, spread * 0.8, 2.2, w2);
  g.vline(8, 4, 12, body);
  g.set(7, 2, body);
  g.set(9, 2, body);
  g.outline(OUT, false, 200);
}

const butterfly = () => sheet((g, f) => wings(g, f, 0xf4f4ee, 0xe0e8f0, 0x2a2420));
const golden = () =>
  sheet((g, f) => {
    wings(g, f, 0xffd040, 0xf0a020, 0x5a3a10);
    g.set(5, 5, 0xffffff);
    g.set(11, 9, 0xfff6c0);
  });
const firefly = () =>
  sheet((g, f) => {
    g.ellipse(8, 9, f ? 6 : 5, f ? 6 : 5, 0xffe060, f ? 90 : 60);
    g.ellipse(8, 9, 2.6, 2.6, 0xfff0a0, 200);
    g.rect(7, 4, 2, 4, 0x2a2420);
    g.set(6, 5 - f, 0xd0d8e0);
    g.set(9, 5 - f, 0xd0d8e0);
    g.rect(7, 8, 2, 3, 0xfff8c0);
  });
const bee = () =>
  sheet((g, f) => {
    g.ellipse(5.5, 5 - f, 2.6, 1.8, 0xe8f4ff, 210);
    g.ellipse(10.5, 5 - f, 2.6, 1.8, 0xe8f4ff, 210);
    g.ellipse(8, 9, 4.5, 3.4, 0xf0c030);
    for (const x of [6, 9]) g.vline(x, 6, 12, 0x2a2420);
    g.set(13, 9, 0x2a2420);
    g.set(3, 8, 0x101014);
    g.outline(OUT, false, 200);
  });
const leaf = () =>
  sheet((g, f) => {
    const c = 0xc87a3a;
    g.ellipse(8, 8 + f, 5, 3.2, c);
    g.recolor((x, y) => y < 8 + f, lighten(c, 0.15));
    for (let i = 0; i < 9; i++) g.set(4 + i, 8 + f, darken(c, 0.3));
    g.set(13, 9 + f, 0x6a4a2a);
    g.outline(OUT, false, 200);
  });

/** 풀숲 한 칸 (76×58 창 자리): 잔디 바닥 + 가장자리 풀잎 + 꽃 몇 송이 */
function tuft(seed: number): HTMLCanvasElement {
  const g = new Grid(76, 58);
  let s = seed;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  g.ellipse(38, 33, 36, 24, 0x2e4a2a);
  g.ellipse(38, 35, 31, 19, 0x3a5a32);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(6 + r() * 64);
    const y = Math.floor(12 + r() * 40);
    if (!g.filled(x, y)) continue;
    const c = r() < 0.5 ? 0x4a7a3a : 0x5a8a42;
    g.vline(x, y - 2, y, c);
  }
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(10 + r() * 56);
    const y = Math.floor(16 + r() * 32);
    const c = [0xe8a0c0, 0xf0e070, 0xf4f4ee, 0xa0b0f0][i % 4];
    g.set(x, y, c);
    g.set(x + 1, y, c);
    g.set(x, y + 1, c);
    g.set(x + 1, y + 1, lighten(c, 0.4));
  }
  return g.toCanvas();
}

function sparkle(): HTMLCanvasElement {
  const g = new Grid(20, 20);
  for (const [x, y] of [[10, 2], [10, 17], [2, 10], [17, 10], [5, 5], [15, 5], [5, 15], [15, 15]]) g.rect(x, y, 2, 2, 0xfff2b0, 200);
  g.ellipse(10, 10, 3, 3, 0xffffff, 160);
  return g.toCanvas();
}

function addSheet(scene: Phaser.Scene, key: string, build: () => HTMLCanvasElement, fw?: number, fh?: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, build());
  if (!tex || !fw || !fh) return;
  for (let i = 0; i < 2; i++) tex.add(i, 0, i * fw, 0, fw, fh);
}

export function ensureMeadowTextures(scene: Phaser.Scene): void {
  addSheet(scene, MTEX.bug(false), butterfly, 16, 16);
  addSheet(scene, MTEX.bug(true), firefly, 16, 16);
  addSheet(scene, MTEX.golden, golden, 16, 16);
  addSheet(scene, MTEX.feature, bee, 16, 16);
  addSheet(scene, MTEX.decoy, leaf, 16, 16);
  addSheet(scene, MTEX.splat, sparkle);
  for (let i = 0; i < 9; i++) addSheet(scene, `${MTEX.tuft}-${i}`, () => tuft(17 + i * 31));
}

/** 곤충 채집 문구 (사냥터 버그 잡기 문구 대신) */
export const MEADOW_TEXT = {
  feature: "벌은 건드리지 마세요",
  decoy: "낙엽이에요",
  miss: "날아갔다",
} as const;

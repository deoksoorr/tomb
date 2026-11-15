import type * as Phaser from "phaser";
import { Grid, lighten, darken } from "../../sprites/pixel";
import type { Layer } from "../skillSound";

// 11/15 능력 카드 판 안 그림 (투사체·결재판·서류 방패·인턴·불·독·얼음)과 짧은 합성음. 텍스처는 씬마다 한 번만 만든다.

export const CDT = {
  wave: "cd-wave",
  board: "cd-board",
  paper: "cd-paper",
  intern: "cd-intern",
  plane: "cd-plane",
  flame: "cd-flame",
  bubble: "cd-bubble",
  ice: "cd-ice",
  spark: "cd-spark",
  glow: "cd-glow",
} as const;

const OUT = 0x16151a;
const PAPER = 0xf2ead3;

function add(scene: Phaser.Scene, key: string, g: Grid, fw?: number, fh?: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, g.toCanvas());
  if (!tex || !fw || !fh) return;
  const cols = Math.floor(g.w / fw);
  for (let c = 0; c < cols; c++) tex.add(c, 0, c * fw, 0, fw, fh);
}

/** 서류 바람 (병렬 처리 근접): 초승달 모양 종이 바람, 오른쪽을 본다 */
function waveTex(): Grid {
  const g = new Grid(12, 14);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 12; x++) {
      const d0 = Math.hypot(x - 2, y - 6.5);
      const d1 = Math.hypot(x - 0, y - 6.5);
      if (d0 < 9 && d1 > 8) g.set(x, y, d0 > 7.6 ? 0xffffff : 0xcfe8ff);
    }
  g.outline(0x5a7aa8);
  return g;
}

function boardTex(): Grid {
  const g = new Grid(9, 11);
  g.rect(0, 1, 9, 10, 0xc8884a);
  g.rect(1, 3, 7, 7, PAPER);
  g.hline(2, 6, 5, 0xb8ad94);
  g.hline(2, 6, 7, 0xb8ad94);
  g.rect(3, 0, 3, 2, 0x9aa3ad);
  g.rect(5, 7, 2, 2, 0xe84a4a);
  g.outline(OUT);
  return g;
}

function paperTex(): Grid {
  const g = new Grid(7, 8);
  g.rect(0, 0, 6, 7, PAPER);
  g.rect(4, 0, 2, 2, darken(PAPER, 0.2));
  g.hline(1, 4, 2, 0x9ab0c8);
  g.hline(1, 4, 4, 0x9ab0c8);
  g.outline(0x5a7aa8);
  return g;
}

/** 인턴: 두 칸 (걷기 흔들림) 12×14 */
function internSheet(): Grid {
  const g = new Grid(24, 14);
  for (let f = 0; f < 2; f++) {
    const o = f * 12;
    const b = f;
    g.ellipse(o + 6, 3.5 + b * 0.5, 3, 3, 0xf0c8a0);
    g.rect(o + 3, 0 + b, 6, 2, 0x3a2a1e);
    g.set(o + 5, 4 + b, 0x16151a);
    g.set(o + 7, 4 + b, 0x16151a);
    g.rect(o + 3, 7, 6, 5, 0x6ab0e8);
    g.vline(o + 5, 7, 9, PAPER);
    g.vline(o + 6, 7, 9, PAPER);
    g.rect(o + 5, 9, 2, 2, PAPER);
    g.rect(o + 3 + (f ? 1 : 0), 12, 2, 2, 0x2a2e48);
    g.rect(o + 7 - (f ? 1 : 0), 12, 2, 2, 0x2a2e48);
    g.rect(o + 9, 8 + b, 2, 3, PAPER);
  }
  g.outline(OUT);
  return g;
}

function planeTex(): Grid {
  const g = new Grid(7, 5);
  g.rect(0, 0, 7, 1, PAPER);
  g.rect(1, 1, 5, 1, PAPER);
  g.rect(2, 2, 3, 1, darken(PAPER, 0.15));
  g.rect(3, 3, 2, 1, darken(PAPER, 0.15));
  g.set(6, 1, PAPER);
  return g;
}

/** 불꽃 세 칸 5×7 */
function flameSheet(): Grid {
  const g = new Grid(15, 7);
  for (let f = 0; f < 3; f++) {
    const o = f * 5;
    g.ellipse(o + 2.5, 4.5 - f * 0.3, 2.2 - f * 0.4, 2.6 - f * 0.5, 0xff7a3a);
    g.ellipse(o + 2.5, 5, 1.2, 1.4, 0xffe08a);
    if (f < 2) g.set(o + 2, 1 + f, 0xff7a3a);
  }
  return g;
}

function bubbleSheet(): Grid {
  const g = new Grid(10, 5);
  for (let f = 0; f < 2; f++) {
    const o = f * 5;
    const r = f ? 1.5 : 2.2;
    g.ellipse(o + 2.5, 2.5, r, r, 0x8ac83a);
    g.set(o + 2, 1, lighten(0x8ac83a, 0.5));
  }
  return g;
}

function iceTex(): Grid {
  const g = new Grid(14, 14);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      const edge = x === 0 || y === 0 || x === 13 || y === 13;
      g.set(x, y, edge ? 0xe8f8ff : (x + y) % 5 === 0 ? 0xbfeaff : 0x8ad8f0, edge ? 230 : 120);
    }
  g.rect(2, 2, 3, 1, 0xffffff);
  g.rect(2, 2, 1, 4, 0xffffff);
  return g;
}

function sparkTex(): Grid {
  const g = new Grid(5, 5);
  g.set(2, 0, 0xffffff);
  g.set(2, 4, 0xffffff);
  g.set(0, 2, 0xffffff);
  g.set(4, 2, 0xffffff);
  g.rect(1, 1, 3, 3, 0xffffff);
  return g;
}

function glowTex(): Grid {
  const g = new Grid(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8;
      if (d < 1) g.set(x, y, 0xffffff, Math.round(255 * (1 - d) ** 2));
    }
  return g;
}

export function ensureCardTextures(scene: Phaser.Scene): void {
  add(scene, CDT.wave, waveTex());
  add(scene, CDT.board, boardTex());
  add(scene, CDT.paper, paperTex());
  add(scene, CDT.intern, internSheet(), 12, 14);
  add(scene, CDT.plane, planeTex());
  add(scene, CDT.flame, flameSheet(), 5, 7);
  add(scene, CDT.bubble, bubbleSheet(), 5, 5);
  add(scene, CDT.ice, iceTex());
  add(scene, CDT.spark, sparkTex());
  add(scene, CDT.glow, glowTex());
}

// ── 합성음 (sfx.synth) ──

const tone = (at: number, dur: number, f0: number, f1: number, gain: number, wave: Layer["wave"] = "square"): Layer => ({ src: "osc", wave, at, dur, gain, atk: 0.005, env: "perc", f0, f1 });

export const CARD_SND: Record<"level" | "flip" | "pick" | "legend" | "zap" | "board" | "block" | "deal" | "revive" | "oneshot", Layer[]> = {
  // 판 레벨 업: 위로 올라가는 세 음
  level: [tone(0, 0.09, 660, 660, 0.18), tone(0.08, 0.09, 880, 880, 0.18), tone(0.16, 0.22, 1320, 1320, 0.2, "triangle")],
  flip: [{ src: "noise", at: 0, dur: 0.06, gain: 0.12, atk: 0.003, env: "perc", flt: { type: "bandpass", f0: 3000, f1: 1800, q: 2 } }],
  pick: [tone(0, 0.08, 523, 784, 0.18, "triangle"), tone(0.06, 0.2, 1046, 1046, 0.16, "triangle"), { src: "noise", at: 0, dur: 0.12, gain: 0.08, atk: 0.003, env: "perc", flt: { type: "highpass", f0: 4000, f1: 6000, q: 1 } }],
  legend: [tone(0, 0.5, 392, 392, 0.14, "sawtooth"), tone(0, 0.5, 587, 587, 0.12, "triangle"), tone(0.12, 0.6, 784, 784, 0.12, "triangle"), tone(0.24, 0.7, 1175, 1175, 0.1, "sine")],
  zap: [{ src: "noise", at: 0, dur: 0.1, gain: 0.16, atk: 0.002, env: "perc", flt: { type: "bandpass", f0: 5200, f1: 2200, q: 3 } }, tone(0, 0.08, 1800, 600, 0.06, "sawtooth")],
  board: [{ src: "noise", at: 0, dur: 0.05, gain: 0.1, atk: 0.002, env: "perc", flt: { type: "lowpass", f0: 1600, f1: 600, q: 1 } }],
  block: [tone(0, 0.06, 1400, 900, 0.08, "triangle")],
  deal: [tone(0, 0.25, 220, 180, 0.16, "sawtooth"), tone(0.1, 0.35, 165, 130, 0.14, "square")],
  revive: [tone(0, 0.3, 330, 660, 0.16, "triangle"), tone(0.2, 0.5, 660, 1320, 0.14, "triangle")],
  oneshot: [{ src: "noise", at: 0, dur: 0.16, gain: 0.18, atk: 0.002, env: "perc", flt: { type: "lowpass", f0: 900, f1: 200, q: 2 } }, tone(0.02, 0.18, 300, 120, 0.16, "square")],
};

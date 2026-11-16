// 11/16 바닷가 갈매기 울음 한 번씩 (3가지): "끼-욕" 미끄러지는 높은 소리 + 거친 떨림 + 숨소리 같은 잡음.
// 지도·바다 보기 장면에서 가끔 따로 울려요 (게임이 높낮이·좌우·크기를 바꿔 써요). 결과는 apps/web/public/sfx/gull-1..3.mp3 (자체 제작, CC0).
// 사용: node scripts/gen-gull.mjs  (ffmpeg 필요)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
let seed = 1116;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

/**
 * 울음 한 마디: f0(Hz)에서 올라 peak에 닿았다가 끝으로 내려와요 (끼-욕). rough = 목 떨림(진폭 변조) 세기
 * 소리 = 기본음 + 2·3배음 (목소리처럼 2배음이 커요) + 높은 띠 잡음 조금
 */
function call(out, t0, len, f0, peak, end, amp, rough) {
  const i0 = Math.round(t0 * SR);
  const n = Math.round(len * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const u = i / n;
    // 앞 30%는 빠르게 올라가고, 뒤는 천천히 내려와요
    const f = u < 0.3 ? f0 + (peak - f0) * Math.sin((u / 0.3) * (Math.PI / 2)) : peak + (end - peak) * Math.pow((u - 0.3) / 0.7, 1.4);
    const vib = 1 + 0.025 * Math.sin(i / SR * 2 * Math.PI * 7.5);
    ph += (2 * Math.PI * f * vib) / SR;
    const am = 1 - rough * (0.5 + 0.5 * Math.sin(i / SR * 2 * Math.PI * (55 + 20 * u)));
    const env = Math.min(1, u / 0.06) * Math.pow(1 - u, 0.8);
    const tone = Math.sin(ph) * 0.45 + Math.sin(ph * 2 + 0.4) * 0.38 + Math.sin(ph * 3 + 1.1) * 0.17;
    lp += ((rnd() * 2 - 1) - lp) * 0.35;
    out[i0 + i] += (tone * am + lp * 0.08) * env * amp;
  }
}

const VARIANTS = [
  // 1: 한 번 길게 "끼-요옥"
  { len: 0.95, calls: [[0.02, 0.62, 1250, 2300, 1350, 1, 0.35]] },
  // 2: 짧게 세 번 "깍깍깍" (웃는 듯)
  {
    len: 1.2,
    calls: [
      [0.02, 0.26, 1500, 2100, 1600, 0.9, 0.5],
      [0.36, 0.24, 1550, 2150, 1650, 0.85, 0.5],
      [0.7, 0.32, 1450, 2000, 1400, 0.8, 0.45],
    ],
  },
  // 3: 높게 두 번 "끼욕 끼욕"
  {
    len: 1.0,
    calls: [
      [0.02, 0.38, 1600, 2600, 1700, 1, 0.3],
      [0.48, 0.42, 1500, 2500, 1500, 0.9, 0.3],
    ],
  },
];

function wav(mono) {
  const n = mono.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mono[i])) * 32767), 44 + i * 2);
  return buf;
}

const dir = mkdtempSync(join(tmpdir(), "gull-"));
VARIANTS.forEach((v, k) => {
  const out = new Float32Array(Math.round(v.len * SR));
  for (const c of v.calls) call(out, ...c);
  // 봉우리 -6 dBFS (다른 효과음과 비슷한 크기 — 게임이 상황마다 더 작게 써요)
  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  const g = 0.5 / Math.max(1e-6, peak);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  const file = join(dir, `gull-${k + 1}.wav`);
  writeFileSync(file, wav(out));
  const OUT = fileURLToPath(new URL(`../apps/web/public/sfx/gull-${k + 1}.mp3`, import.meta.url));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-ac", "1", "-b:a", "48k", OUT]);
  console.log("wrote", OUT);
});

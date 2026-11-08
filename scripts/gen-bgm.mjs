// 자체 제작 플레이스홀더 BGM 생성기. 외부 음원 없이 코드로 합성하므로 라이선스 문제가 없다(CC0로 배포).
// 실제 음원(Pixabay 등)을 넣으면 이 파일들은 지워도 된다.
// 사용: node scripts/gen-bgm.mjs  (ffmpeg 필요) → apps/web/public/bgm/{orgel,lofi,rain}/*.mp3
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SR = 44100;
const OUT = join(import.meta.dirname, "../apps/web/public/bgm");

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

function reverb(buf, mix = 0.3) {
  // Schroeder: 병렬 comb 4개 + 직렬 allpass 2개
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  const aps = [225, 556].map((d) => ({ d, b: new Float32Array(d), i: 0 }));
  const out = new Float32Array(buf.length);
  for (let n = 0; n < buf.length; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.b[c.i];
      c.b[c.i] = buf[n] + y * 0.84;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    s *= 0.25;
    for (const a of aps) {
      const y = a.b[a.i];
      const v = s + y * 0.5;
      a.b[a.i] = v;
      a.i = (a.i + 1) % a.d;
      s = y - v * 0.5;
    }
    out[n] = buf[n] * (1 - mix) + s * mix;
  }
  return out;
}

function lowpass(buf, cutoff) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  let y = 0;
  for (let n = 0; n < buf.length; n++) buf[n] = y += a * (buf[n] - y);
  return buf;
}

function finish(buf, fade = 3) {
  const f = fade * SR;
  for (let n = 0; n < buf.length; n++) {
    const g = Math.min(1, n / f, (buf.length - n) / f);
    buf[n] *= g;
  }
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.8 / peak : 1;
  for (let n = 0; n < buf.length; n++) buf[n] *= k;
  return buf;
}

function bell(buf, start, hz, amp, len = 3) {
  const partials = [
    [1, 1, 1.6],
    [2, 0.45, 2.6],
    [3, 0.2, 4],
    [4.2, 0.12, 6],
    [5.4, 0.05, 8],
  ];
  const s0 = Math.floor(start * SR);
  const n1 = Math.min(buf.length, s0 + Math.floor(len * SR));
  for (let n = s0; n < n1; n++) {
    const t = (n - s0) / SR;
    const atk = Math.min(1, t / 0.003);
    let v = 0;
    for (const [r, a, d] of partials) v += a * Math.exp(-t * d) * Math.sin(2 * Math.PI * hz * r * t);
    buf[n] += v * amp * atk;
  }
}

function orgel(seed, seconds, root) {
  const buf = new Float32Array(seconds * SR);
  const r = rng(seed);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  const bpm = 64;
  const eighth = 60 / bpm / 2;
  const prog = [0, -3, 5, -5]; // I vi IV V 근음 이동
  let idx = 4;
  let t = 0.5;
  let bar = 0;
  while (t < seconds - 4) {
    const chord = root - 12 + prog[bar % 4];
    bell(buf, t, midiHz(chord), 0.35, 4);
    bell(buf, t + eighth * 4, midiHz(chord + 7), 0.22, 3);
    for (let k = 0; k < 8; k++) {
      if (r() < 0.22 && k % 2 === 1) continue;
      idx = Math.max(0, Math.min(scale.length - 1, idx + Math.round((r() - 0.5) * 4)));
      const sw = k % 2 === 1 ? eighth * 0.12 : 0;
      bell(buf, t + k * eighth + sw, midiHz(root + 12 + scale[idx]), 0.28 + r() * 0.1, 2.5);
    }
    t += eighth * 8;
    bar++;
  }
  return finish(reverb(buf, 0.35), 4);
}

function rain(seed, seconds) {
  const buf = new Float32Array(seconds * SR);
  const r = rng(seed);
  // 저역 쏴아 소리: 화이트노이즈 → 로우패스, 느린 진폭 변화
  let lp = 0;
  let hp = 0;
  for (let n = 0; n < buf.length; n++) {
    const w = r() * 2 - 1;
    lp += 0.08 * (w - lp);
    hp = lp - hp * 0.995;
    const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * n) / (SR * 17)) * Math.sin((2 * Math.PI * n) / (SR * 7.3));
    buf[n] = lp * 0.9 * swell;
  }
  // 빗방울: 짧은 처프
  const drops = seconds * 9;
  for (let i = 0; i < drops; i++) {
    const s0 = Math.floor(r() * (buf.length - SR));
    const hz = 1800 + r() * 2600;
    const amp = 0.04 + r() * 0.08;
    const len = Math.floor(0.03 * SR);
    for (let k = 0; k < len; k++) {
      const t = k / SR;
      buf[s0 + k] += amp * Math.exp(-t * 140) * Math.sin(2 * Math.PI * hz * (1 - t * 6) * t);
    }
  }
  return finish(reverb(buf, 0.2), 4);
}

function epiano(buf, start, hz, amp, len) {
  const s0 = Math.floor(start * SR);
  const n1 = Math.min(buf.length, s0 + Math.floor(len * SR));
  for (let n = s0; n < n1; n++) {
    const t = (n - s0) / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.2) * Math.min(1, (n1 - n) / (0.08 * SR));
    const mod = Math.sin(2 * Math.PI * hz * t) * 1.2 * Math.exp(-t * 3);
    buf[n] += amp * env * Math.sin(2 * Math.PI * hz * t + mod);
  }
}

function lofi(seed, seconds, root) {
  const buf = new Float32Array(seconds * SR);
  const drums = new Float32Array(seconds * SR);
  const r = rng(seed);
  const bpm = 74;
  const beat = 60 / bpm;
  // ii7 - V7 - Imaj7 - vi7
  const chords = [
    [2, 5, 9, 12],
    [7, 11, 14, 17],
    [0, 4, 7, 11],
    [9, 12, 16, 19],
  ];
  let t = 0.3;
  let bar = 0;
  while (t < seconds - 3) {
    const c = chords[bar % 4];
    for (const iv of c) epiano(buf, t + r() * 0.02, midiHz(root + iv), 0.12, beat * 3.8);
    epiano(buf, t, midiHz(root - 12 + c[0]), 0.2, beat * 3.5);
    if (r() < 0.6) epiano(buf, t + beat * 2.5, midiHz(root + 12 + c[1 + Math.floor(r() * 3)]), 0.08, beat * 1.2);
    for (let b = 0; b < 4; b++) {
      const bt = t + b * beat;
      if (b === 0 || b === 2) {
        const s0 = Math.floor(bt * SR);
        for (let k = 0; k < 0.25 * SR && s0 + k < drums.length; k++) {
          const tt = k / SR;
          drums[s0 + k] += 0.5 * Math.exp(-tt * 18) * Math.sin(2 * Math.PI * (50 + 70 * Math.exp(-tt * 30)) * tt);
        }
      }
      for (const off of [0, beat * 0.58]) {
        const s0 = Math.floor((bt + off) * SR);
        for (let k = 0; k < 0.04 * SR && s0 + k < drums.length; k++) drums[s0 + k] += 0.05 * Math.exp((-k / SR) * 90) * (r() * 2 - 1);
      }
    }
    t += beat * 4;
    bar++;
  }
  lowpass(buf, 2400);
  // 테이프 워블은 생략하고 바이닐 크래클만
  for (let n = 0; n < buf.length; n++) {
    buf[n] += drums[n] + (r() < 0.0006 ? (r() - 0.5) * 0.25 : 0) + (r() * 2 - 1) * 0.004;
  }
  return finish(reverb(buf, 0.18), 3);
}

function toMp3(samples, file) {
  const wav = join(tmpdir(), `bgm-${process.pid}.wav`);
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  writeFileSync(wav, data);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "2", "-b:a", "128k", file]);
  rmSync(wav);
}

const tracks = [
  ["orgel", "moonlit-orgel.mp3", () => orgel(7, 80, 72)],
  ["orgel", "unfinished-lullaby.mp3", () => orgel(21, 80, 69)],
  ["lofi", "late-commit.mp3", () => lofi(3, 90, 60)],
  ["lofi", "todo-forever.mp3", () => lofi(11, 90, 57)],
  ["rain", "rain-on-stones.mp3", () => rain(5, 120)],
];
for (const [dir, name, make] of tracks) {
  mkdirSync(join(OUT, dir), { recursive: true });
  toMp3(make(), join(OUT, dir, name));
  console.log("wrote", dir, name);
}

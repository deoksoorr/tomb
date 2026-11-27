// 11/27 캠핑장 폭포(달그늘 소) 환경음 루프를 코드로 합성해요: 파도처럼 밀려왔다 빠지는 박자 없이 한결같이 쏟아지는 물소리.
//  - 쏟아지는 물: 분홍 소음 + 갈색 소음, 고음은 깎고(10kHz 위 없음) 0.1~0.3Hz로 아주 느리게만 일렁여요
//  - 소(沼)가 울리는 낮은 웅웅 소리 60~150Hz
//  - 물방울이 튀는 반짝임: 3~8kHz 짧은 방울·탁탁 소리를 드문드문 무작위로
//  - 좌우는 살짝 넓게 (두 귀에 같은 소리 반, 따로 반)
// 36초 루프. 끝 2초를 처음 2초에 같은 힘으로 겹쳐(cos/sin) 이어 붙여서 이음새가 안 들려요. 느린 일렁임도 36초에 딱 맞는 주기만 써요.
// 파일은 36.04초: 게임이 앞뒤 20ms를 잘라 돌리므로(ambientLoop.ts) 그 자리에 루프의 이어지는 소리를 덧대 두었어요.
// 크기는 바닷가 파도 루프(sea-loop.mp3)의 통합 음량(LUFS)에 맞추고, 같은 mp3 56k로 구워요. 결과는 apps/web/public/sfx/falls-loop.mp3 (자체 제작, CC0).
// 사용: node scripts/gen-falls-loop.mjs [기본|잔잔] [출력 경로]  (ffmpeg 필요, 기본은 「기본」 → falls-loop.mp3)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VARIANTS = {
  // 게임에 거는 소리: 폭포 바로 앞 — 소 울림이 받쳐 주고 물방울이 또렷해요
  기본: { rumbleDb: -1, bodyDb: -4.5, rushLp: 7000, shelfDb: -4, dropDb: -17, dropRate: 26, seed: 20261127 },
  // 조금 떨어져서 듣는 소리: 고음을 더 깎고 물방울도 적게
  잔잔: { rumbleDb: -5, bodyDb: -3, rushLp: 4200, shelfDb: -7, dropDb: -23, dropRate: 12, seed: 20261128 },
};
const name = process.argv[2] ?? "기본";
const V = VARIANTS[name];
if (!V) throw new Error(`모르는 갈래: ${name} (${Object.keys(VARIANTS).join(", ")})`);
const OUT = process.argv[3] ?? fileURLToPath(new URL("../apps/web/public/sfx/falls-loop.mp3", import.meta.url));
const REF = fileURLToPath(new URL("../apps/web/public/sfx/sea-loop.mp3", import.meta.url));

const SR = 44100;
const DUR = 36;
const XF = 2; // 이어 붙이는 겹침 (초)
const N = Math.round((DUR + XF) * SR);
const M = DUR * SR;
const X = XF * SR;

let seed = V.seed;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const white = () => rnd() * 2 - 1;

// RBJ 쿡북 2차 필터 (lp·hp·peak·highshelf)
function biquad(type, f, q = 0.707, db = 0) {
  const w = (2 * Math.PI * f) / SR;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const al = sn / (2 * q);
  const A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lp") [b0, b1, b2, a0, a1, a2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === "hp") [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al];
  else if (type === "peak") [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A];
  else if (type === "bp") [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cs, 1 - al];
  else {
    const sq = 2 * Math.sqrt(A) * al;
    [b0, b1, b2, a0, a1, a2] = [
      A * (A + 1 + (A - 1) * cs + sq),
      -2 * A * (A - 1 + (A + 1) * cs),
      A * (A + 1 + (A - 1) * cs - sq),
      A + 1 - (A - 1) * cs + sq,
      2 * (A - 1 - (A + 1) * cs),
      A + 1 - (A - 1) * cs - sq,
    ];
  }
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
const chain = (...fs) => (x) => fs.reduce((v, f) => f(v), x);

// 분홍 소음 (Paul Kellet)
function pinkGen() {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = white();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return p * 0.11;
  };
}
// 갈색 소음 (새는 적분)
function brownGen() {
  let b = 0;
  return () => (b = Math.max(-1, Math.min(1, b * 0.997 + white() * 0.05)));
}

// 36초에 딱 맞는 느린 일렁임 (k/36 Hz — 0.1~0.3Hz), 루프 이음새에서도 이어져요
function slowLfo(ks, depth) {
  const parts = ks.map((k) => ({ w: (2 * Math.PI * k) / DUR, ph: rnd() * 2 * Math.PI, a: depth * (0.6 + 0.4 * rnd()) }));
  return (t) => parts.reduce((s, p) => s + p.a * Math.sin(p.w * t + p.ph), 0);
}

// 성분마다 한 줄씩 만들고 크기(RMS)를 1로 맞춘 뒤 dB로 섞어요
function normalize(L, R) {
  let s = 0;
  for (let i = 0; i < N; i++) s += L[i] * L[i] + R[i] * R[i];
  const g = 1 / Math.sqrt(s / (2 * N));
  for (let i = 0; i < N; i++) {
    L[i] *= g;
    R[i] *= g;
  }
}

// 쏟아지는 물: 두 귀 공통 분홍 소음 + 따로 분홍 소음 (상관 약 0.55 — 살짝 넓게)
function rush() {
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const pc = pinkGen();
  const pl = pinkGen();
  const pr = pinkGen();
  const shape = () =>
    chain(
      biquad("hp", 110, 0.6),
      biquad("peak", 1100, 0.8, 2.5),
      biquad("shelf", 3800, 0.7, V.shelfDb),
      biquad("lp", V.rushLp, 0.6),
    );
  const fL = shape();
  const fR = shape();
  const amp = slowLfo([4, 7, 10], 0.07);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const c = pc();
    const e = 1 + amp(t);
    L[i] = fL(0.74 * c + 0.67 * pl()) * e;
    R[i] = fR(0.74 * c + 0.67 * pr()) * e;
  }
  normalize(L, R);
  return [L, R];
}

// 물 몸통: 갈색 소음 300~900Hz (쏟아지는 물의 두께), 좌우 느린 일렁임이 서로 달라요
function body() {
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const bl = brownGen();
  const br = brownGen();
  const fL = chain(biquad("hp", 160, 0.7), biquad("lp", 900, 0.7));
  const fR = chain(biquad("hp", 160, 0.7), biquad("lp", 900, 0.7));
  const aL = slowLfo([5, 8], 0.1);
  const aR = slowLfo([6, 9], 0.1);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    L[i] = fL(bl()) * (1 + aL(t));
    R[i] = fR(br()) * (1 + aR(t));
  }
  normalize(L, R);
  return [L, R];
}

// 소가 울리는 낮은 웅웅 60~150Hz (거의 가운데)
function rumble() {
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const nc = brownGen();
  const nl = brownGen();
  const nr = brownGen();
  const shape = () => chain(biquad("hp", 58, 0.7), biquad("hp", 58, 0.7), biquad("lp", 150, 0.7), biquad("lp", 150, 0.7));
  const fL = shape();
  const fR = shape();
  const amp = slowLfo([4, 6, 11], 0.08);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const c = nc();
    const e = 1 + amp(t);
    L[i] = fL(0.9 * c + 0.44 * nl()) * e;
    R[i] = fR(0.9 * c + 0.44 * nr()) * e;
  }
  normalize(L, R);
  return [L, R];
}

// 물방울: 3~8kHz 짧은 방울(살짝 올라가는 사인) 반, 탁탁(좁은 대역 소음) 반, 드문드문 무작위 자리·좌우
function droplets() {
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  let t = 0;
  while (true) {
    t += -Math.log(1 - rnd()) / V.dropRate;
    const i0 = Math.round(t * SR);
    if (i0 >= N) break;
    const pan = 0.5 + (rnd() - 0.5) * 1.5; // 0.125..0.875
    const gl = Math.cos((pan * Math.PI) / 2);
    const gr = Math.sin((pan * Math.PI) / 2);
    const amp = Math.exp((rnd() - 0.7) * 2.2); // 대부분 작고 가끔 또렷
    if (rnd() < 0.5) {
      const f0 = 3000 + rnd() * 4000;
      const rise = 1 + 0.1 + rnd() * 0.25;
      const len = 0.008 + rnd() * 0.018;
      const tau = len / 3;
      const n = Math.round(len * SR);
      let ph = 0;
      for (let k = 0; k < n && i0 + k < N; k++) {
        const u = k / n;
        ph += (2 * Math.PI * f0 * (1 + (rise - 1) * u)) / SR;
        const e = Math.min(1, k / (0.0008 * SR)) * Math.exp(-(k / SR) / tau);
        const v = Math.sin(ph) * e * amp;
        L[i0 + k] += v * gl;
        R[i0 + k] += v * gr;
      }
    } else {
      const f = biquad("bp", 3500 + rnd() * 4500, 2.5);
      const len = 0.002 + rnd() * 0.005;
      const n = Math.round(len * 3 * SR);
      for (let k = 0; k < n && i0 + k < N; k++) {
        const e = Math.exp(-(k / SR) / len);
        const v = f(white() * e) * amp * 2.2;
        L[i0 + k] += v * gl;
        R[i0 + k] += v * gr;
      }
    }
  }
  normalize(L, R);
  return [L, R];
}

const parts = [
  [rush(), 0],
  [body(), V.bodyDb],
  [rumble(), V.rumbleDb],
  [droplets(), V.dropDb],
];
const L = new Float32Array(N);
const R = new Float32Array(N);
for (const [[pl, pr], db] of parts) {
  const g = Math.pow(10, db / 20);
  for (let i = 0; i < N; i++) {
    L[i] += pl[i] * g;
    R[i] += pr[i] * g;
  }
}

// 귀가 피곤하지 않게: 10kHz 위는 깎아요 (2차 두 번 — 24dB/oct)
{
  const fL = chain(biquad("lp", 9500, 0.54), biquad("lp", 9500, 1.31));
  const fR = chain(biquad("lp", 9500, 0.54), biquad("lp", 9500, 1.31));
  for (let i = 0; i < N; i++) {
    L[i] = fL(L[i]);
    R[i] = fR(R[i]);
  }
}

// 끝 2초를 처음 2초에 같은 힘으로 겹쳐요 (서로 다른 소음이라 cos/sin — 가운데서 작아지지 않게)
for (let i = 0; i < X; i++) {
  const u = (i / X) * (Math.PI / 2);
  const a = Math.sin(u);
  const b = Math.cos(u);
  L[i] = L[i] * a + L[M + i] * b;
  R[i] = R[i] * a + R[M + i] * b;
}

// 일단 -20 dBFS RMS로 적고, ffmpeg로 잰 LUFS 차이만큼 맞춰 구워요
let sum = 0;
for (let i = 0; i < M; i++) sum += L[i] * L[i] + R[i] * R[i];
let g = Math.pow(10, -20 / 20) / Math.sqrt(sum / (2 * M));
let peak = 0;
for (let i = 0; i < M; i++) peak = Math.max(peak, Math.abs(L[i] * g), Math.abs(R[i] * g));
if (peak > 0.89) g *= 0.89 / peak;

// 게임(AmbientLoop)은 앞뒤 20ms를 잘라 그 사이만 돌려요 → 루프 앞에 끝 20ms, 뒤에 처음 20ms를 덧대서 잘린 구간이 딱 36초 루프가 되게
const P = Math.round(0.02 * SR);
const T = M + 2 * P;
const at = (j) => (j - P + M) % M;
const buf = Buffer.alloc(44 + T * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + T * 4, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(T * 4, 40);
for (let j = 0; j < T; j++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[at(j)] * g)) * 32767), 44 + j * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[at(j)] * g)) * 32767), 46 + j * 4);
}
const dir = mkdtempSync(join(tmpdir(), "falls-loop-"));
const wav = join(dir, "falls-loop.wav");
writeFileSync(wav, buf);

/** ffmpeg ebur128로 잰 통합 음량 (LUFS) — 요약은 stderr로 나와요 */
function measure(file) {
  const r = execFileSync("sh", ["-c", 'ffmpeg -hide_banner -nostats -i "$1" -af ebur128 -f null - 2>&1', "sh", file], {
    encoding: "utf8",
  });
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(r);
  if (!m) throw new Error(`LUFS를 못 쟀어요: ${file}`);
  return Number(m[1]);
}

const target = measure(REF);
let adj = target - measure(wav);
const enc = (db) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", `volume=${db.toFixed(2)}dB`, "-ac", "2", "-b:a", "56k", OUT]);
enc(adj);
// mp3로 구우면 조금 달라져요 — 한 번 더 맞춰요
adj += target - measure(OUT);
enc(adj);
console.log(`wrote ${OUT} (${name}) — ${measure(OUT).toFixed(1)} LUFS (파도 ${target.toFixed(1)} LUFS)`);

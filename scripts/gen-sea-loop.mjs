// 11/16 바닷가(달물결 포구) 환경음 루프를 코드로 합성해요: 밀려왔다 빠지는 파도 4번(6초마다 — 화면의 물가 물거품과 같은 박자) + 물거품 쉬는 소리 + 멀리서 갈매기 두 번.
// 24초 루프. 끝 1초를 처음에 겹쳐 이어 붙여서 이음새가 안 들려요. 결과는 apps/web/public/sfx/sea-loop.mp3 (자체 제작, CC0).
// 사용: node scripts/gen-sea-loop.mjs  (ffmpeg 필요)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const DUR = 24;
const XF = 1; // 이어 붙이는 겹침 (초)
const N = Math.round((DUR + XF) * SR);
const OUT = fileURLToPath(new URL("../apps/web/public/sfx/sea-loop.mp3", import.meta.url));

let seed = 20261116;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const L = new Float32Array(N);
const R = new Float32Array(N);

// 파도 하나의 크기: 1.8초 동안 밀려와 부서지고 4초 동안 쓸려 나가요
function surge(t) {
  const p = ((t % 6) + 6) % 6;
  if (p < 1.8) {
    const u = p / 1.8;
    return 0.25 + 0.75 * u * u * (3 - 2 * u);
  }
  const u = (p - 1.8) / 4.2;
  return 0.25 + 0.75 * Math.exp(-u * 3.2);
}

// 파도: 갈색 소음(낮게 웅웅) + 분홍 소음, 한 극 저역 필터를 파도 크기에 따라 열고 닫아요
let brownL = 0;
let brownR = 0;
let lpL = 0;
let lpR = 0;
let hpPrevL = 0;
let hpOutL = 0;
let hpPrevR = 0;
let hpOutR = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const env = surge(t) * (1 + 0.08 * Math.sin(t * 0.7));
  brownL = Math.max(-1, Math.min(1, brownL * 0.995 + (rnd() * 2 - 1) * 0.06));
  brownR = Math.max(-1, Math.min(1, brownR * 0.995 + (rnd() * 2 - 1) * 0.06));
  const fc = 300 + 1700 * env * env;
  const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
  lpL += a * (rnd() * 2 - 1 - lpL);
  lpR += a * (rnd() * 2 - 1 - lpR);
  // 물거품 쉬는 소리: 높은 소리만 (한 극 고역), 부서진 뒤에 커져요
  const wL = rnd() * 2 - 1;
  const wR = rnd() * 2 - 1;
  hpOutL = 0.97 * (hpOutL + wL - hpPrevL);
  hpPrevL = wL;
  hpOutR = 0.97 * (hpOutR + wR - hpPrevR);
  hpPrevR = wR;
  const p = ((t % 6) + 6) % 6;
  const foam = p > 1.6 && p < 4.6 ? Math.sin(((p - 1.6) / 3) * Math.PI) : 0;
  L[i] += brownL * 0.55 * (0.5 + 0.5 * env) + lpL * 0.5 * env + hpOutL * 0.06 * foam;
  R[i] += brownR * 0.55 * (0.5 + 0.5 * env) + lpR * 0.5 * env + hpOutR * 0.06 * foam;
}

// 갈매기: "끼욕" 서너 번 (높은 데서 내려오는 소리, 떨림), 멀리서 작게
function gull(t0, pan, n, amp) {
  for (let k = 0; k < n; k++) {
    const s0 = t0 + k * (0.32 + 0.06 * k);
    const len = 0.26 + 0.04 * (k % 2);
    const i0 = Math.round(s0 * SR);
    const i1 = Math.min(N, Math.round((s0 + len) * SR));
    let ph = 0;
    for (let i = i0; i < i1; i++) {
      const u = (i - i0) / (i1 - i0);
      const f = 1900 - 850 * u + 40 * Math.sin((i / SR) * 2 * Math.PI * 28);
      ph += (2 * Math.PI * f) / SR;
      const e = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * 0.4);
      const v = (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.28 + Math.sin(ph * 3) * 0.12) * e * amp;
      L[i] += v * (1 - pan);
      R[i] += v * pan;
    }
  }
}
gull(5.4, 0.3, 3, 0.05);
gull(15.9, 0.72, 4, 0.04);
gull(21.2, 0.55, 2, 0.03);

// 끝 1초를 처음 1초에 겹쳐요 (이음새 없이 돌게)
const M = DUR * SR;
const X = XF * SR;
for (let i = 0; i < X; i++) {
  const w = i / X;
  L[i] = L[i] * w + L[M + i] * (1 - w);
  R[i] = R[i] * w + R[M + i] * (1 - w);
}

// 크기: 평균을 약 -21 dBFS에 (모닥불·빗소리 루프처럼 은은하게), 봉우리는 -2 dBFS 아래로
let sum = 0;
for (let i = 0; i < M; i++) sum += L[i] * L[i] + R[i] * R[i];
const rms = Math.sqrt(sum / (2 * M));
let g = Math.pow(10, -21 / 20) / rms;
let peak = 0;
for (let i = 0; i < M; i++) peak = Math.max(peak, Math.abs(L[i] * g), Math.abs(R[i] * g));
if (peak > 0.79) g *= 0.79 / peak;

const buf = Buffer.alloc(44 + M * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + M * 4, 4);
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
buf.writeUInt32LE(M * 4, 40);
for (let i = 0; i < M; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
}
const dir = mkdtempSync(join(tmpdir(), "sea-loop-"));
const wav = join(dir, "sea-loop.wav");
writeFileSync(wav, buf);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "2", "-b:a", "56k", OUT]);
console.log("wrote", OUT);

// 11/16 바닷가 안개 낀 날 멀리서 울리는 등대 무적(뱃고동 같은 낮은 소리) 한 번 — 2.8초. 결과는 apps/web/public/sfx/foghorn.mp3 (자체 제작, CC0).
// 낮은 두 음(약 98Hz·147Hz, 5도)이 천천히 커졌다가 길게 잦아들고, 먼 곳 느낌으로 높은 소리를 깎아요.
// 사용: node scripts/gen-foghorn.mjs  (ffmpeg 필요)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const DUR = 2.8;
const N = Math.round(DUR * SR);
const out = new Float32Array(N);
let p1 = 0;
let p2 = 0;
let lp = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const att = Math.min(1, t / 0.35);
  const rel = t > 1.7 ? Math.exp(-(t - 1.7) * 3.2) : 1;
  const env = att * att * (3 - 2 * att) * rel;
  const vib = 1 + 0.004 * Math.sin(t * 2 * Math.PI * 4.2);
  p1 += (2 * Math.PI * 98 * vib) / SR;
  p2 += (2 * Math.PI * 147 * vib) / SR;
  // 리드 같은 소리 (홀수 배음 조금) — 두 음을 섞어요
  const v = Math.sin(p1) * 0.55 + Math.sin(3 * p1) * 0.12 + Math.sin(p2) * 0.4 + Math.sin(3 * p2) * 0.08;
  // 먼 곳: 한 극 저역 필터
  lp += (v - lp) * 0.08;
  out[i] = lp * env;
}
let peak = 0;
for (const s of out) peak = Math.max(peak, Math.abs(s));
const g = 0.45 / Math.max(1e-6, peak);
const buf = Buffer.alloc(44 + N * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 2, 4);
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
buf.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
const dir = mkdtempSync(join(tmpdir(), "foghorn-"));
const wav = join(dir, "foghorn.wav");
writeFileSync(wav, buf);
const OUT = fileURLToPath(new URL("../apps/web/public/sfx/foghorn.mp3", import.meta.url));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "48k", OUT]);
console.log("wrote", OUT);

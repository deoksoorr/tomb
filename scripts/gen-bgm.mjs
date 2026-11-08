// 한때는... BGM 생성기 — 외부 음원 없이 코드로 작곡·합성한다. 결과물은 CC0.
// 사용: node scripts/gen-bgm.mjs [이름 필터]   (ffmpeg + libmp3lame 필요, npm 의존성 없음)
//  → apps/web/public/bgm/{orgel,lofi,rain}/*.mp3 와 tracks.json
// 트랙마다 고정 시드를 쓰므로 다시 돌려도 같은 파일이 나온다. 필터를 주면 그 트랙만 다시 굽고 tracks.json은 그대로 둔다.
// 환경변수 BGM_DEBUG=1 이면 스템별 RMS를 출력한다.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const SR = 44100;
const TAU = 2 * Math.PI;
const OUT = join(import.meta.dirname, "../apps/web/public/bgm");
const TARGET_LUFS = -18.65; // 모든 트랙 공통 통합 라우드니스(128k MP3 인코딩 후 약 -19 LUFS가 된다)
const CEILING = 10 ** (-2 / 20); // MP3 인코딩 전 샘플 피크 상한(-2 dBFS → 인코딩 후 true peak ≤ -1 dBTP 여유)
const ARTIST = "한때는... (자체 제작)";
const DEBUG = !!process.env.BGM_DEBUG;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const dB = (x) => 20 * Math.log10(Math.max(x, 1e-12));

// ───────────────────────── 난수 · 버스 ─────────────────────────
class Rng {
  constructor(seed) {
    this.s = seed >>> 0;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return a + Math.floor((b - a + 1) * this.next());
  }
  pick(a) {
    return a[Math.floor(this.next() * a.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  bi() {
    return this.next() * 2 - 1;
  }
}

const stereo = (n) => [new Float32Array(n), new Float32Array(n)];
function panGains(p) {
  const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}
function addBus(dst, src, g = 1) {
  for (let c = 0; c < 2; c++) {
    const d = dst[c], s = src[c];
    for (let i = 0; i < d.length; i++) d[i] += s[i] * g;
  }
  return dst;
}
function gainBus(bus, g) {
  for (const x of bus) for (let i = 0; i < x.length; i++) x[i] *= g;
  return bus;
}
function rmsDb(bus) {
  let s = 0;
  for (const x of bus) for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return dB(Math.sqrt(s / (bus[0].length * 2)));
}
function peakOf(bus) {
  let p = 0;
  for (const x of bus) for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
}
const stem = (name, bus) => DEBUG && console.log(`   stem ${name.padEnd(8)} ${rmsDb(bus).toFixed(1)} dB`);

// ───────────────────────── 음원(오실레이터) ─────────────────────────
// 감쇠 사인 하나(점화식 오실레이터라 빠르다). 벨·오르골·피아노 배음의 기본 단위.
function partial(bus, t0, f, amp, decay, p = 0, atk = 0.002, maxDur = 20, rel = 0.03, phase = 0) {
  if (!(f > 18 && f < SR * 0.45) || amp <= 0) return;
  const [L, R] = bus, n = L.length, s0 = Math.max(0, Math.round(t0 * SR));
  const life = decay > 0 ? Math.log(amp * 3e4 + 1) / decay : maxDur;
  const len = Math.min(Math.floor(Math.min(life, maxDur) * SR), n - s0);
  if (len <= 8) return;
  const w = (TAU * f) / SR, r = Math.exp(-decay / SR), c = 2 * r * Math.cos(w), r2 = r * r;
  let y1 = Math.sin(phase - w) / r, y2 = Math.sin(phase - 2 * w) / r2;
  const [gl, gr] = panGains(p);
  const atkN = Math.max(1, Math.round(atk * SR)), relN = Math.max(1, Math.min(len, Math.round(Math.max(rel, 2 / f) * SR)));
  const relStart = len - relN;
  for (let i = 0; i < len; i++) {
    const y = c * y1 - r2 * y2;
    y2 = y1;
    y1 = y;
    let e = amp;
    if (i < atkN) e *= i / atkN;
    if (i > relStart) e *= (len - i) / relN;
    const v = y * e, k = s0 + i;
    L[k] += v * gl;
    R[k] += v * gr;
  }
}

// 지속음 사인(상승·하강 코사인 엔벨로프). 패드·드론용.
function tone(bus, t0, dur, f, amp, p = 0, atk = 1, rel = 1, phase = 0) {
  if (!(f > 18 && f < SR * 0.45)) return;
  const [L, R] = bus, n = L.length, s0 = Math.round(t0 * SR);
  const atkN = Math.max(1, Math.round(atk * SR)), relS = Math.round(dur * SR), relN = Math.max(1, Math.round(rel * SR));
  const total = relS + relN, w = (TAU * f) / SR, c = 2 * Math.cos(w);
  let y1 = Math.sin(phase - w), y2 = Math.sin(phase - 2 * w);
  const [gl, gr] = panGains(p);
  for (let i = 0; i < total; i++) {
    const y = c * y1 - y2;
    y2 = y1;
    y1 = y;
    const k = s0 + i;
    if (k >= n) break;
    if (k < 0) continue;
    let e = amp;
    if (i < atkN) e *= 0.5 - 0.5 * Math.cos((Math.PI * i) / atkN);
    if (i >= relS) e *= 0.5 + 0.5 * Math.cos((Math.PI * (i - relS)) / relN);
    const v = y * e;
    L[k] += v * gl;
    R[k] += v * gr;
  }
}

// ───────────────────────── 필터 · 이펙트 ─────────────────────────
function coefs(type, f, q = Math.SQRT1_2, gain = 0) {
  const w = (TAU * Math.min(f, SR * 0.49)) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q), A = 10 ** (gain / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lp") [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === "hp") [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === "bp") [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cw, 1 - al];
  else if (type === "peak") [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
  else if (type === "hs") {
    const s = 2 * Math.sqrt(A) * al;
    [b0, b1, b2] = [A * (A + 1 + (A - 1) * cw + s), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - s)];
    [a0, a1, a2] = [A + 1 - (A - 1) * cw + s, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - s];
  } else throw new Error(type);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquad(x, type, f, q, gain) {
  const [b0, b1, b2, a1, a2] = coefs(type, f, q, gain);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
  return x;
}
const filt = (bus, type, f, q, gain) => {
  for (const x of bus) biquad(x, type, f, q, gain);
  return bus;
};

// 컷오프가 시간에 따라 움직이는 SVF(TPT). fc는 샘플별 배열.
function svf(x, fc, q, mode) {
  const k = 1 / q;
  let ic1 = 0, ic2 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) {
      const g = Math.tan((Math.PI * clamp(fc[i], 20, SR * 0.45)) / SR);
      a1 = 1 / (1 + g * (g + k));
      a2 = g * a1;
      a3 = g * a2;
    }
    const v0 = x[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    x[i] = mode === "lp" ? v2 : k * v1;
  }
  return x;
}

// Freeverb(병렬 콤 8 + 직렬 올패스 4, 좌우 23샘플 스프레드). 입력은 저역을 덜어내 탁해지지 않게 한다.
function reverb(bus, { room = 0.8, damp = 0.4, wet = 0.25, dry = 1, width = 1, pre = 0.02, lowCut = 160 } = {}) {
  const [L, R] = bus, n = L.length;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const fb = room * 0.28 + 0.7, d1 = damp * 0.4, d2 = 1 - d1;
  const mk = (ts, o) => ts.map((t) => ({ b: new Float32Array(t + o), i: 0, f: 0 }));
  const cl = mk(combT, 0), cr = mk(combT, 23), al = mk(apT, 0), ar = mk(apT, 23);
  const preN = Math.max(1, Math.round(pre * SR)), pb = new Float32Array(preN);
  const wet1 = wet * 3 * (width / 2 + 0.5), wet2 = wet * 3 * ((1 - width) / 2);
  const hpA = 1 - Math.exp((-TAU * lowCut) / SR);
  let pi = 0, lpS = 0;
  const run = (cs, as, x) => {
    let o = 0;
    for (let k = 0; k < 8; k++) {
      const c = cs[k], y = c.b[c.i];
      c.f = y * d2 + c.f * d1;
      c.b[c.i] = x + c.f * fb;
      if (++c.i === c.b.length) c.i = 0;
      o += y;
    }
    for (let k = 0; k < 4; k++) {
      const a = as[k], y = a.b[a.i];
      a.b[a.i] = o + y * 0.5;
      if (++a.i === a.b.length) a.i = 0;
      o = y - o;
    }
    return o;
  };
  for (let i = 0; i < n; i++) {
    let x = (L[i] + R[i]) * 0.015;
    lpS += hpA * (x - lpS);
    x -= lpS;
    const xd = pb[pi];
    pb[pi] = x;
    if (++pi === preN) pi = 0;
    const oL = run(cl, al, xd), oR = run(cr, ar, xd);
    L[i] = L[i] * dry + oL * wet1 + oR * wet2;
    R[i] = R[i] * dry + oR * wet1 + oL * wet2;
  }
  return bus;
}

// 테이프 워블: 느린 LFO + 플러터로 지연시간을 흔들어 음정을 살짝 출렁이게 한다.
function wobble(bus, rng, { rate = 0.5, cents = 8, flutter = 1.2 } = {}) {
  const n = bus[0].length, ratio = 2 ** (cents / 1200) - 1;
  const A = (ratio * SR) / (TAU * rate), Af = ((2 ** (flutter / 1200) - 1) * SR) / (TAU * 6.1);
  const ph1 = rng.range(0, TAU), ph2 = rng.range(0, TAU), drift = smoothNoise(n, rng, 3.3);
  const base = A + Af + A * 0.3 + 4;
  for (const x of bus) {
    const src = Float32Array.from(x);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const d = base + A * Math.sin(TAU * rate * t + ph1) + Af * Math.sin(TAU * 6.1 * t + ph2) + A * 0.3 * (drift[i] * 2 - 1);
      const p = i - d;
      if (p < 0) {
        x[i] = 0;
        continue;
      }
      const j = Math.floor(p), fr = p - j;
      x[i] = src[j] * (1 - fr) + (j + 1 < n ? src[j + 1] : 0) * fr;
    }
  }
  return bus;
}

function saturate(bus, drive = 1.5) {
  const k = 1 / Math.tanh(drive);
  for (const x of bus) for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) * k * 0.5 + x[i] * 0.5;
  return bus;
}

function autopan(bus, rate, depth) {
  const [L, R] = bus;
  for (let i = 0; i < L.length; i++) {
    const s = depth * Math.sin((TAU * rate * i) / SR);
    L[i] *= 1 + s;
    R[i] *= 1 - s;
  }
  return bus;
}

// ───────────────────────── 노이즈 ─────────────────────────
function white(n, rng) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.bi();
  return x;
}
function pink(n, rng) {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.bi();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return x;
}
function brown(n, rng) {
  const x = new Float32Array(n);
  let b = 0;
  for (let i = 0; i < n; i++) x[i] = b = 0.998 * b + 0.06 * rng.bi();
  return x;
}
// 0..1 사이를 period초마다 새 값으로 부드럽게 옮겨 가는 느린 무작위 곡선
function smoothNoise(n, rng, period) {
  const x = new Float32Array(n), step = Math.max(2, Math.round(period * SR));
  let a = rng.next(), b = rng.next();
  for (let i = 0; i < n; i++) {
    const k = i % step;
    if (k === 0 && i > 0) {
      a = b;
      b = rng.next();
    }
    x[i] = a + (b - a) * (0.5 - 0.5 * Math.cos((Math.PI * k) / step));
  }
  return x;
}
function normPeak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  if (p > 0) for (let i = 0; i < x.length; i++) x[i] /= p;
  return x;
}
// 짧은 샘플(빗방울 등)을 무작위 시각·세기·위치로 흩뿌린다
function scatter(bus, rng, bank, perSec, lo, hi, width = 0.9, from = 0, to = Infinity) {
  const [L, R] = bus, n = L.length, a0 = Math.round(from * SR), a1 = Math.min(n, Math.round(to * SR));
  const count = Math.round((perSec * (a1 - a0)) / SR);
  for (let k = 0; k < count; k++) {
    const i0 = a0 + Math.floor(rng.next() * (a1 - a0)), s = bank[Math.floor(rng.next() * bank.length)];
    const amp = lo + (hi - lo) * rng.next() ** 2.5, [gl, gr] = panGains(rng.range(-width, width));
    const m = Math.min(s.length, n - i0);
    for (let j = 0; j < m; j++) {
      L[i0 + j] += s[j] * amp * gl;
      R[i0 + j] += s[j] * amp * gr;
    }
  }
}
function place(bus, s, t, amp, p = 0) {
  const [L, R] = bus, i0 = Math.max(0, Math.round(t * SR)), m = Math.min(s.length, L.length - i0), [gl, gr] = panGains(p);
  for (let j = 0; j < m; j++) {
    L[i0 + j] += s[j] * amp * gl;
    R[i0 + j] += s[j] * amp * gr;
  }
}
const bank = (rng, count, make) => Array.from({ length: count }, () => make(rng));

// ───────────────────────── 마스터링 ─────────────────────────
// ITU-R BS.1770 통합 라우드니스(K-가중, 400ms 블록, 절대·상대 게이트)
function lufs(bus) {
  const n = bus[0].length, hop = Math.round(0.1 * SR), H = Math.floor(n / hop), e = new Float64Array(H);
  for (const x of bus) {
    const s1 = coefs("hs", 1681.974450955533, 0.7071752369554196, 3.999843853973347);
    const s2 = coefs("hp", 38.13547087602444, 0.5003270373238773);
    let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let i = 0; i < H * hop; i++) {
      const v = x[i], y = s1[0] * v + z1;
      z1 = s1[1] * v - s1[3] * y + z2;
      z2 = s1[2] * v - s1[4] * y;
      const u = s2[0] * y + w1;
      w1 = s2[1] * y - s2[3] * u + w2;
      w2 = s2[2] * y - s2[4] * u;
      e[Math.floor(i / hop)] += u * u;
    }
  }
  const blocks = [];
  for (let b = 0; b + 4 <= H; b++) blocks.push((e[b] + e[b + 1] + e[b + 2] + e[b + 3]) / (4 * hop));
  const L = (z) => -0.691 + 10 * Math.log10(z);
  let g = blocks.filter((z) => L(z) > -70);
  const rel = L(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter((z) => L(z) > rel);
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}

// 룩어헤드 피크 리미터(5ms). 게인은 항상 필요한 값 이하라 상한을 넘지 않는다.
function limiter(bus, ceil) {
  const [L, R] = bus, n = L.length, W = Math.round(0.005 * SR), g = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    g[i] = a > ceil ? ceil / a : 1;
    if (a > ceil) any = true;
  }
  if (!any) return 1;
  const h = new Float32Array(n), dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let m = n - 1; m >= 0; m--) {
    while (tail > head && g[dq[tail - 1]] >= g[m]) tail--;
    dq[tail++] = m;
    while (dq[head] > m + W - 1) head++;
    h[m] = g[dq[head]];
  }
  const rel = 1 - Math.exp(-1 / (0.15 * SR));
  let sum = 0, r = 1, minG = 1;
  for (let i = 0; i < n; i++) {
    sum += h[i];
    if (i >= W) sum -= h[i - W];
    r = Math.min(sum / Math.min(i + 1, W), r + (1 - r) * rel);
    L[i] *= r;
    R[i] *= r;
    if (r < minG) minG = r;
  }
  return minG;
}

function finalize(bus, { lp = 0, hp = 30, fadeIn = 3, fadeOut = 4 } = {}) {
  filt(bus, "hp", hp, 0.6);
  if (lp) filt(bus, "lp", lp, 0.6);
  const n = bus[0].length, fi = fadeIn * SR, fo = fadeOut * SR;
  for (const x of bus)
    for (let i = 0; i < n; i++) {
      const u = Math.min(1, i / fi, (n - 1 - i) / fo);
      if (u < 1) x[i] *= Math.sin((Math.PI / 2) * Math.max(0, u)) ** 2;
    }
  let minG = 1;
  for (let it = 0; it < 5; it++) {
    const l = lufs(bus);
    if (Math.abs(l - TARGET_LUFS) < 0.05 && peakOf(bus) <= CEILING) break;
    gainBus(bus, 10 ** ((TARGET_LUFS - l) / 20));
    minG = Math.min(minG, limiter(bus, CEILING));
  }
  return { lufs: lufs(bus), peak: dB(peakOf(bus)), gr: dB(minG) };
}

function encode(bus, file, seed) {
  const [L, R] = bus, n = L.length, pcm = new Int16Array(n * 2), rng = new Rng(seed ^ 0x5bd1e995);
  for (let i = 0; i < n; i++) {
    pcm[2 * i] = clamp(Math.round(L[i] * 32767 + rng.next() - rng.next()), -32768, 32767);
    pcm[2 * i + 1] = clamp(Math.round(R[i] * 32767 + rng.next() - rng.next()), -32768, 32767);
  }
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", String(SR), "-ac", "2", "-i", "pipe:0"];
  args.push("-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-id3v2_version", "0", file);
  execFileSync(process.env.FFMPEG || "ffmpeg", args, { input: Buffer.from(pcm.buffer), stdio: ["pipe", "ignore", "inherit"], maxBuffer: 1 << 30 });
}

// ───────────────────────── 화성 도구 ─────────────────────────
const SCALES = {
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
// 오르골용 3·4화음(근음 포함)
const TRI = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], sus2: [0, 2, 7] };
// 로파이용 보이싱(근음 생략형 위주, 베이스가 근음을 친다)
const LQ = {
  M7: [0, 4, 7, 11], M9: [4, 7, 11, 14], m7: [0, 3, 7, 10], m9: [3, 7, 10, 14], 9: [4, 7, 10, 14], 13: [4, 10, 14, 21],
  "7b9": [4, 7, 10, 13], m7b5: [0, 3, 6, 10], m6: [0, 3, 7, 9], 69: [4, 9, 14, 19],
};
const pc = (m) => ((m % 12) + 12) % 12;
const pcSet = (root, ivs) => new Set([0, ...ivs].map((i) => pc(root + i)));

// 음계 도수 ↔ MIDI
function degMidi(cx, d) {
  const n = cx.scale.length, o = Math.floor(d / n);
  return cx.tonic + 12 * o + cx.scale[d - o * n];
}
function snap(cx, d, pcs, rng) {
  const ord = rng.chance(0.5) ? [0, -1, 1, -2, 2] : [0, 1, -1, 2, -2];
  for (const k of ord) {
    const x = d + k;
    if (x >= cx.lo && x <= cx.hi && pcs.has(pc(degMidi(cx, x)))) return x;
  }
  return clamp(d, cx.lo, cx.hi);
}
// 화음음 중 d에 가까운 것. 직전 음(avoid)과 같은 음은 되도록 피해 선율이 제자리걸음하지 않게 한다.
function chordTone(cx, d, pcs, rng, avoid) {
  let best = clamp(d, cx.lo, cx.hi), bc = Infinity;
  for (let x = d - 3; x <= d + 3; x++) {
    if (x < cx.lo || x > cx.hi || !pcs.has(pc(degMidi(cx, x)))) continue;
    const c = Math.abs(x - d) + (x === avoid ? 1.6 : 0) + rng.range(0, 0.5);
    if (c < bc) [best, bc] = [x, c];
  }
  return best;
}
// 선율 윤곽: 시작→끝 도수를 아치형으로 잇고, 강박·긴 음은 화음음으로 맞춘다. 도약은 3도 안쪽으로.
function contour(rng, cx, rh, pcsAt, s, e, arch, strong) {
  const N = rh.length, out = [];
  for (let i = 0; i < N; i++) {
    const u = N === 1 ? 1 : i / (N - 1), prev = out[i - 1];
    let d = Math.round(s + (e - s) * u + arch * Math.sin(Math.PI * u) + rng.range(-0.45, 0.45));
    if (prev !== undefined && Math.abs(d - prev) > 3) d = prev + Math.sign(d - prev) * (rng.chance(0.3) ? 3 : 2);
    if (i === N - 1) d = e;
    else if (strong(rh[i])) d = chordTone(cx, d, pcsAt(rh[i].pos), rng, prev);
    else if (d === prev && rng.chance(0.75)) d += e > d ? 1 : e < d ? -1 : rng.pick([-1, 1]);
    out.push(clamp(d, cx.lo, cx.hi));
  }
  return out;
}
// 동기를 다른 화음 위에서 되풀이: 윤곽을 그대로 두고 통째로 몇 도 옮겨(시퀀스) 화음에 가장 잘 맞는 위치를 고른다
function seqFit(cx, degs, rh, pcs, rng, prefer = 0) {
  let best = 0, bs = -Infinity;
  for (const sh of [0, -1, 1, -2, 2, -3, 3]) {
    let sc = -Math.abs(sh - prefer) * 0.4;
    degs.forEach((d, i) => {
      const x = d + sh;
      if (x < cx.lo || x > cx.hi) sc -= 3;
      else if (pcs.has(pc(degMidi(cx, x)))) sc += i === 0 ? 2 : rh[i].len >= 2 ? 1 : 0.3;
    });
    if (sc > bs) [best, bs] = [sh, sc];
  }
  return degs.map((d, i) => {
    const x = clamp(d + best, cx.lo, cx.hi);
    return (i === 0 || rh[i].len >= 3) && !pcs.has(pc(degMidi(cx, x))) ? chordTone(cx, x, pcs, rng, null) : x;
  });
}
const toRh = (lens) => {
  let pos = 0;
  return lens.map((len) => {
    const r = { pos, len };
    pos += len;
    return r;
  });
};
const toRhB = (pairs) => pairs.map(([pos, len]) => ({ pos, len }));

// 로파이 보이싱: 직전 화음과 가장 가깝게(보이스 리딩), 중심 음역 근처로
function voicing(rootPc, q, prev, center) {
  const pcs = LQ[q].map((i) => pc(rootPc + i)), k = pcs.length;
  let best = null, bestCost = Infinity;
  for (let rot = 0; rot < k; rot++)
    for (let base = 48; base <= 66; base++) {
      if (pc(base) !== pcs[rot]) continue;
      const v = [base];
      for (let j = 1; j < k; j++) {
        let m = v[j - 1] + 1;
        while (pc(m) !== pcs[(rot + j) % k]) m++;
        v.push(m);
      }
      if (v[0] < 50 || v[k - 1] > 79) continue;
      const mean = v.reduce((a, b) => a + b, 0) / k;
      let cost = Math.abs(mean - center) * 0.7 + (v[1] - v[0] === 1 ? 3 : 0);
      for (let j = 2; j < k; j++) if (v[j] - v[j - 1] === 1) cost += 1.6; // 안쪽 반음 뭉침도 되도록 피한다
      if (prev) cost += prev.length === k ? v.reduce((a, m, j) => a + Math.abs(m - prev[j]), 0) / k : Math.abs(mean - prev.reduce((a, b) => a + b, 0) / prev.length);
      if (cost < bestCost) [best, bestCost] = [v, cost];
    }
  return best;
}
const inRange = (p, lo) => lo + pc(p - lo); // lo 이상에서 처음 나오는 해당 음이름

// ───────────────────────── 악기 ─────────────────────────
function musicBox(bus, t, m, v, p) {
  const f = mtof(m), d = 1.0 + f / 900;
  partial(bus, t, f, v, d, p, 0.0015);
  partial(bus, t, f * 2.003, v * 0.16, d * 2.2, p, 0.001);
  partial(bus, t, f * 5.95, v * 0.04, 14 + f / 200, p, 0.0008);
}
function celesta(bus, t, m, v, p) {
  const f = mtof(m), d = 1.3 + f / 1100;
  partial(bus, t, f, v, d, p, 0.003);
  partial(bus, t, f * 2, v * 0.2, d * 2.4, p, 0.003);
  partial(bus, t, f * 3, v * 0.05, d * 4, p, 0.003);
  partial(bus, t, f * 4.02, v * 0.05, d * 7, p, 0.002);
}
function lowBell(bus, t, m, v, p) {
  const f = mtof(m);
  partial(bus, t, f, v, 0.75, p, 0.008);
  partial(bus, t, f * 2, v * 0.3, 1.3, p, 0.008);
  partial(bus, t, f * 3, v * 0.09, 2.2, p, 0.006);
  partial(bus, t, f * 4.2, v * 0.035, 3.6, p, 0.005);
}
function vibes(bus, t, m, v, p) {
  const f = mtof(m);
  partial(bus, t, f, v, 1.1, p, 0.002);
  partial(bus, t, f * 4, v * 0.1, 5, p, 0.0015);
  partial(bus, t, f * 2.0, v * 0.05, 2.5, p, 0.002);
}
// 펠트 피아노 느낌: 늘어난 배음 + 두 현의 미세한 디튠으로 맥놀이
function piano(bus, t, m, v, p, hold = 6, rng) {
  const f0 = mtof(m), B = 0.00035, bright = 0.35 + 0.6 * v;
  for (let k = 1; k <= 10; k++) {
    const fk = f0 * k * Math.sqrt(1 + B * k * k);
    if (fk > 6000) break;
    const a = v * k ** -1.25 * bright ** (k - 1), d = 0.32 + 0.17 * k + f0 / 800, ph = rng.range(0, TAU);
    partial(bus, t, fk * 1.00035, a * 0.5, d, p, 0.004, hold, 0.18, ph);
    partial(bus, t, fk * 0.99965, a * 0.5, d * 1.18, p, 0.004, hold, 0.18, ph + 1);
  }
}
// 로즈풍 FM 일렉 피아노: 어택에서 배음(바크)이 생겼다가 금방 둥글어진다
function epiano(bus, t0, m, v, dur, p = 0) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), rel = 0.14;
  const len = Math.min(L.length - s0, Math.round((dur + rel) * SR));
  const w = (TAU * f) / SR, durN = dur * SR, relN = rel * SR, [gl, gr] = panGains(p);
  const amp = v * (f < 220 ? 1 : (220 / f) ** 0.3), idx0 = 0.5 + 1.5 * v;
  const km = Math.exp(-7 / SR), ka = Math.exp(-(0.75 + f / 1000) / SR);
  let em = 1, ea = 1;
  for (let i = 0; i < len; i++) {
    const ph = w * i, I = idx0 * em + 0.15;
    let env = amp * ea;
    em *= km;
    ea *= ka;
    if (i < 120) env *= i / 120;
    if (i > durN) env *= Math.max(0, 1 - (i - durN) / relN);
    const y = env * (Math.sin(ph + I * Math.sin(ph)) + 0.12 * em * Math.sin(2 * ph));
    L[s0 + i] += y * gl;
    R[s0 + i] += y * gr;
  }
}
// 부드러운 플루트: 사인 + 약한 배음 + 숨소리 + 늦게 들어오는 비브라토
function flute(bus, t0, m, v, dur, p, rng) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), rel = 0.2, atk = 0.07;
  const len = Math.min(L.length - s0, Math.round((dur + rel) * SR)), [gl, gr] = panGains(p);
  let ph = 0, nz = 0, nz2 = 0;
  const vibPh = rng.range(0, TAU);
  for (let i = 0; i < len; i++) {
    const t = i / SR, vib = 1 + 0.0045 * Math.min(1, Math.max(0, (t - 0.25) / 0.4)) * Math.sin(TAU * 5.1 * t + vibPh);
    ph += (TAU * f * vib) / SR;
    let env = v * Math.min(1, t / atk);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / rel);
    nz += 0.25 * (rng.bi() - nz);
    nz2 += 0.25 * (nz - nz2);
    const y = env * (Math.sin(ph) + 0.18 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph) + 0.35 * (nz - nz2));
    L[s0 + i] += y * gl;
    R[s0 + i] += y * gr;
  }
}
function bassNote(bus, t0, m, v, dur) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), rel = 0.08;
  const len = Math.min(L.length - s0, Math.round((dur + rel) * SR)), w = (TAU * f) / SR, durN = dur * SR, relN = rel * SR;
  const k = Math.exp(-0.9 / SR);
  let e = v;
  for (let i = 0; i < len; i++) {
    const ph = w * i;
    let env = e;
    e *= k;
    if (i < 330) env *= i / 330;
    if (i > durN) env *= Math.max(0, 1 - (i - durN) / relN);
    const y = env * Math.tanh(1.3 * (Math.sin(ph) + 0.25 * Math.sin(2 * ph)));
    L[s0 + i] += y;
    R[s0 + i] += y;
  }
}
function padNote(bus, t, dur, m, amp, p, atk, rel) {
  const f = mtof(m);
  [1, 0.3, 0.12, 0.05].forEach((a, k) => {
    tone(bus, t, dur, f * (k + 1) * 1.0016, amp * a * 0.5, p - 0.45, atk, rel, k);
    tone(bus, t, dur, f * (k + 1) * 0.9984, amp * a * 0.5, p + 0.45, atk, rel, k + 2);
  });
}
// 먼 산사의 범종: 낮은 허밍 + 비조화 배음, 짝을 이룬 배음끼리 '맥놀이'
function templeBell(bus, t, f0, amp, p) {
  const P = [[0.5, 0.18, 0.09, 0], [1, 1, 0.14, 0.31], [2.02, 0.5, 0.24, 0.47], [2.76, 0.32, 0.4, 0], [3.95, 0.17, 0.62, 0], [5.36, 0.09, 0.9, 0], [6.9, 0.04, 1.4, 0]];
  for (const [r, a, d, beat] of P) {
    if (beat) {
      partial(bus, t, f0 * r - beat / 2, amp * a * 0.5, d, p - 0.25, 0.006, 28, 1);
      partial(bus, t, f0 * r + beat / 2, amp * a * 0.5, d, p + 0.25, 0.006, 28, 1);
    } else partial(bus, t, f0 * r, amp * a, d, p, 0.006, 28, 1);
  }
  partial(bus, t, 180, amp * 0.12, 30, p, 0.004); // 당목이 닿는 둔한 소리
}

// 드럼 원샷(트랙마다 시드로 몇 가지 변형을 미리 만든다)
function kickS(rng) {
  const n = Math.round(0.42 * SR), x = new Float32Array(n), f1 = rng.range(44, 52), f0 = f1 + rng.range(55, 75), k = rng.range(22, 30), d = rng.range(7, 9.5);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t * k))) / SR;
    x[i] = Math.sin(ph) * (1 - Math.exp(-t * 900)) * Math.exp(-t * d) + (i < 180 ? 0.1 * rng.bi() * (1 - i / 180) : 0);
  }
  return normPeak(biquad(x, "lp", 2600, 0.7));
}
function snareS(rng) {
  const n = Math.round(0.3 * SR), x = new Float32Array(n), dn = rng.range(16, 22), fb = rng.range(175, 200);
  for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.exp((-i / SR) * dn);
  biquad(x, "bp", rng.range(1600, 2100), 0.7);
  biquad(x, "lp", 6000, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = 1.6 * x[i] + 0.5 * Math.sin(TAU * fb * t) * Math.exp(-t * 28) + 0.18 * Math.sin(TAU * 330 * t) * Math.exp(-t * 38);
  }
  return normPeak(x);
}
function rimS(rng) {
  const n = Math.round(0.1 * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.exp((-i / SR) * 150);
  biquad(x, "bp", 2300, 1.4);
  const f1 = rng.range(1450, 1750);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] = 0.9 * x[i] + 0.55 * Math.sin(TAU * f1 * t) * Math.exp(-t * 110) + 0.45 * Math.sin(TAU * 820 * t) * Math.exp(-t * 70);
  }
  return normPeak(biquad(x, "lp", 6500, 0.7));
}
function hatS(rng, open) {
  const n = Math.round((open ? 0.35 : 0.08) * SR), x = new Float32Array(n), d = open ? 11 : rng.range(55, 75);
  for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.exp((-i / SR) * d) * Math.min(1, i / 20);
  biquad(x, "hp", 6500, 0.7);
  biquad(x, "lp", 9500, 0.7);
  return normPeak(x);
}

// ───────────────────────── 오르골 ─────────────────────────
const ORH = {
  4: {
    motif: [[2, 1, 1, 2, 2], [3, 1, 2, 2], [2, 2, 1, 1, 2], [1, 1, 2, 2, 2], [2, 1, 1, 4], [3, 1, 4], [2, 2, 2, 2], [1, 1, 2, 4]],
    end: [[2, 2, 4], [4, 4], [3, 1, 4], [2, 6], [1, 1, 6]],
  },
  3: { motif: [[2, 1, 1, 2], [2, 2, 2], [3, 1, 2], [1, 1, 2, 2], [4, 1, 1], [2, 1, 1, 1, 1]], end: [[2, 4], [6], [3, 3], [1, 1, 4]] },
};

function planOrgel(o) {
  const barSec = (o.meter * 60) / o.bpm, start = 0.8, end = 9, intro = o.intro ?? 2;
  const P = Math.max(4, Math.round(((o.dur - start - end) / barSec - intro) / 4));
  // 형식: A(앞악절) A'(뒷악절) B A' … 홀수면 중간에 간주(I)를 넣고, 언제나 A'로 끝난다
  const form = ["A1", "A2"];
  if (P % 2) form.push("I");
  form.push("B1", "A2");
  const pairs = [["A1", "A2"], ["B1", "A2"]];
  for (let k = 0; form.length < P; k++) form.push(...pairs[k % 2]);
  form.length = P;
  return { dur: Math.round(start + (intro + 4 * P) * barSec + end), barSec, start, intro, P, form, bpm: o.bpm };
}

function orgelMelody(rng, cx, o) {
  const n = cx.scale.length, lib = ORH[o.meter], fifth = cx.scale.indexOf(7);
  const strong = (r) => r.pos === 0 || r.len >= 3 || (r.pos % 2 === 0 && rng.chance(0.5));
  const two = (arr) => {
    const a = rng.pick(arr);
    let b = rng.pick(arr);
    for (let k = 0; k < 6 && b === a; k++) b = rng.pick(arr);
    return [toRh(a), toRh(b)];
  };
  const [M1, M2] = two(lib.motif), [N1, N2] = two(lib.motif), [E1, E2] = two(lib.end);
  const A = o.progA, B = o.progB, I = [0, A[0][1]];
  const P = (ch) => pcSet(o.tonic + ch[0], TRI[ch[1]]);
  const at = (ch) => () => P(ch);
  const near = (d, ch) => snap(cx, d, P(ch), rng);
  const home = rng.pick([2, fifth, n]);
  const a1 = contour(rng, cx, M1, at(A[0]), home, home + rng.pick([-2, -1, 1, 2]), rng.pick([1, 1.5, 2]), strong);
  const a2 = contour(rng, cx, M2, at(A[1]), a1.at(-1) + rng.pick([-1, 1]), near(rng.pick([fifth, 1, fifth + 1]), A[1]), rng.pick([-1, 1]), strong);
  const a3 = seqFit(cx, a1, M1, P(A[2]), rng);
  const a4o = contour(rng, cx, E1, at(A[3]), a3.at(-1), near(rng.pick([fifth, 1]), A[3]), rng.pick([-0.5, 0.5]), strong);
  const tonicDeg = Math.abs(a3.at(-1) - n) < Math.abs(a3.at(-1)) ? n : 0;
  const a4c = contour(rng, cx, E2, at(I), a3.at(-1), tonicDeg, rng.pick([-0.5, 0.5, 1]), strong);
  const bh = Math.min(cx.hi - 1, home + rng.pick([2, 3]));
  const b1 = contour(rng, cx, N1, at(B[0]), bh, bh - 1, rng.pick([1, 1.5]), strong);
  const b2 = contour(rng, cx, N2, at(B[1]), b1.at(-1), bh - 3, rng.pick([-1, 0.5]), strong);
  const b3 = seqFit(cx, b1, N1, P(B[2]), rng, -1); // 한 칸 아래에서 다시(시퀀스)
  const b4 = contour(rng, cx, E1, at(B[3]), b3.at(-1), near(fifth, B[3]), 0.5, strong);
  return {
    A1: { chords: A, bars: [[M1, a1], [M2, a2], [M1, a3], [E1, a4o]] },
    A2: { chords: [A[0], A[1], A[2], I], bars: [[M1, a1], [M2, a2], [M1, a3], [E2, a4c]] },
    B1: { chords: B, bars: [[N1, b1], [N2, b2], [N1, b3], [E1, b4]] },
    I: { chords: [A[0], A[1], A[2], I], bars: [[M1, a1.map((d) => d - n)], null, [M1, a3.map((d) => d - n)], [toRh([o.meter * 2]), [0 - n]]] },
  };
}

function orgel(o, pl) {
  const rng = new Rng(o.seed), n = pl.dur * SR, bus = stereo(n);
  const cx = { scale: SCALES[o.scale], tonic: o.tonic, lo: -3, hi: SCALES[o.scale].length + 2 };
  const ns = cx.scale.length, mel = orgelMelody(rng, cx, o);
  const e8 = pl.barSec / (o.meter * 2), lead = o.timbre === "celesta" ? celesta : musicBox, soft = lead === celesta ? musicBox : celesta;
  const play = (fn, t, m, v, p) => fn(bus, Math.max(0, t + rng.range(-0.006, 0.006)), m, v * rng.range(0.9, 1.07), p);
  const tBar = (b) => pl.start + b * pl.barSec;

  const accomp = (t0, ch, vel = 1) => {
    const iv = TRI[ch[1]], rp = pc(o.tonic + ch[0]), r = inRange(rp, o.tonic - 14);
    const T = [r, r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2]];
    const b = inRange(rp, 41);
    play(lowBell, t0, b, 0.5 * vel, 0);
    if (o.meter === 4 && o.bass2) play(lowBell, t0 + 4 * e8, b + 7 > 52 ? b - 5 : b + 7, 0.25 * vel, 0);
    if (o.acc === "arp") {
      const pat = o.meter === 4 ? [0, 1, 2, 1, 3, 1, 2, 1] : [0, 1, 2, 3, 2, 1];
      pat.forEach((k, s) => play(soft, t0 + s * e8, T[k], (s === 0 ? 0.24 : 0.17) * vel, -0.25));
    } else if (o.acc === "waltz") {
      const d1 = inRange(pc(r + iv[1]), o.tonic - 10), d2 = inRange(pc(r + iv[2]), d1 + 1);
      for (const s of [2, 4]) {
        play(soft, t0 + s * e8, d1, 0.16 * vel, -0.3);
        play(soft, t0 + s * e8 + 0.012, d2, 0.14 * vel, 0.25);
      }
    } else if (o.acc === "block") {
      [T[0], T[1], T[3]].forEach((m, k) => play(soft, t0 + k * 0.05, m, 0.2 * vel, -0.3 + k * 0.3));
      if (o.meter === 4) [T[1], T[3]].forEach((m, k) => play(soft, t0 + 4 * e8 + k * 0.04, m, 0.12 * vel, 0));
    } else {
      for (let q = 0; q < o.meter; q++) play(soft, t0 + q * 2 * e8, [T[1], T[3], T[2], T[3]][q], (q === 0 ? 0.19 : 0.14) * vel, -0.2);
    }
  };

  for (let b = 0; b < pl.intro; b++) accomp(tBar(b), o.progA[b % 4], 0.85);
  let cPrev = o.tonic - 3;
  pl.form.forEach((ph, k) => {
    const sec = mel[ph], deco = k >= 4 ? 1 : 0, deco2 = k >= 8 && ph !== "I";
    for (let j = 0; j < 4; j++) {
      const t0 = tBar(pl.intro + k * 4 + j), ch = sec.chords[j];
      accomp(t0, ch, ph === "I" ? 0.9 : 1);
      const bar = sec.bars[j];
      if (ph === "I") {
        // 간주: 아래 성부가 동기를 받아 부른다(부름-응답)
        if (bar) bar[0].forEach((r, i) => play(soft, t0 + r.pos * e8, degMidi(cx, bar[1][i]), 0.42, -0.35));
        else play(lead, t0 + 2 * e8, degMidi(cx, snap(cx, ns + 1, pcSet(o.tonic + ch[0], TRI[ch[1]]), rng)), 0.3, 0.4);
        continue;
      }
      const [rh, degs] = bar;
      rh.forEach((r, i) => {
        const t = t0 + r.pos * e8, m = degMidi(cx, degs[i]);
        const v = 0.55 + (r.pos === 0 ? 0.08 : 0) + (r.len >= 3 ? 0.04 : 0);
        play(lead, t, m, v, 0.12);
        if (deco && o.counter === "echo") play(soft, t + 2 * e8, m + 12 <= 93 ? m + 12 : m, v * 0.3, -0.5);
        if (deco && o.counter === "thirds" && r.pos % 2 === 0) play(soft, t + 0.004, degMidi(cx, degs[i] - (ns === 5 ? 1 : 2)), v * 0.36, -0.3);
        if (deco2 && m + 12 <= 96) play(lead, t + 0.003, m + 12, v * 0.16, 0.35);
      });
      if (deco && o.counter === "line") {
        // 대선율: 긴 음으로 화음음을 따라 부드럽게 움직인다
        const pcs = pcSet(o.tonic + ch[0], TRI[ch[1]]);
        const hits = o.meter === 4 ? [0, 4] : [0];
        for (const s of hits) {
          let best = cPrev, bc = Infinity;
          for (let m = o.tonic - 9; m <= o.tonic + 2; m++) {
            if (!pcs.has(pc(m))) continue;
            const c = Math.abs(m - cPrev) + (m === cPrev ? 1.5 : 0) + rng.range(0, 0.8);
            if (c < bc) [best, bc] = [m, c];
          }
          cPrev = best;
          play(soft, t0 + s * e8, best, s === 0 ? 0.3 : 0.22, -0.4);
        }
      }
    }
  });
  // 마무리: 으뜸화음을 굴려 치고 울림을 남긴다
  const tEnd = tBar(pl.intro + 4 * pl.P), iv = TRI[o.progA[0][1]], r = inRange(pc(o.tonic), o.tonic - 14);
  play(lowBell, tEnd, inRange(pc(o.tonic), 41), 0.5, 0);
  [r, r + iv[2], r + 12 + iv[1]].forEach((m, k) => play(soft, tEnd + k * 0.07, m, 0.22, -0.3 + 0.3 * k));
  play(lead, tEnd + 0.3, o.tonic + 12 <= 84 ? o.tonic + 12 : o.tonic, 0.42, 0.15);
  play(lead, tEnd + 1.1, degMidi(cx, ns + 2 <= cx.hi ? ns + 2 : ns), 0.2, 0.35);

  stem("dry", bus);
  reverb(bus, { room: 0.84, damp: 0.42, wet: o.wet ?? 0.3, width: 0.9, pre: 0.025 });
  return { bus, master: { lp: 9000, hp: 40 } };
}

// ───────────────────────── 로파이 ─────────────────────────
const COMP = {
  whole: (L) => [[0, L - 0.15, 1]],
  push: (L) => [[-0.5, L - 0.15, 1]],
  twoHit: (L) => (L >= 4 ? [[0, 2.4, 1], [2.5, 1.35, 0.75]] : [[0, L - 0.15, 1]]),
  charleston: (L) => (L >= 4 ? [[0, 1.4, 1], [1.5, 2.35, 0.8]] : [[0, L - 0.15, 1]]),
  stab: (L) => (L >= 4 ? [[0, 0.8, 1], [1.5, 0.45, 0.7], [2.5, 1.35, 0.85]] : [[0, 0.8, 1], [1.5, 0.4, 0.7]]),
};
const BASSP = {
  root: (L) => (L >= 4 ? [[0, 2.8, 0], [3.5, 0.42, "app"]] : [[0, L - 0.3, 0]]),
  two: (L) => (L >= 4 ? [[0, 1.6, 0], [2.5, 1.2, 7]] : [[0, L - 0.3, 0]]),
  synco: (L) => (L >= 4 ? [[0, 1.2, 0], [1.5, 0.4, 0], [2.5, 1.3, 12]] : [[0, 0.9, 0], [1.5, 0.4, 0]]),
  dotted: (L) => (L >= 4 ? [[0, 1.4, 0], [1.5, 2.2, 0]] : [[0, L - 0.3, 0]]),
};
// 16분 스텝: [위치, 세기]
const DRUMP = {
  boom: { k: [[0, 1], [10, 0.8]], s: [[4, 1], [12, 1]], g: [[15, 0.22], [7, 0.14]] },
  lazy: { k: [[0, 1], [7, 0.55], [10, 0.8]], s: [[4, 1], [12, 1]], g: [[14, 0.2]] },
  bounce: { k: [[0, 1], [3, 0.55], [8, 0.75], [11, 0.5]], s: [[4, 1], [12, 1]], g: [[6, 0.17], [15, 0.22]] },
  half: { k: [[0, 1], [10, 0.7]], s: [[8, 1]], g: [[14, 0.2], [3, 0.13], [12, 0.24]] },
};
const LR = [
  [[0, 1], [1, 0.5], [1.5, 1.5]],
  [[0.5, 0.5], [1, 1], [2, 2]],
  [[0, 1.5], [1.5, 0.5], [2, 1]],
  [[1, 0.5], [1.5, 0.5], [2, 1.5]],
  [[0, 0.5], [0.5, 0.5], [1, 2]],
  [[0, 1], [1.5, 0.5], [2, 0.5], [2.5, 1.5]],
];
const LE = [[[0, 3]], [[0, 1], [1, 3]], [[0, 0.5], [0.5, 3]], [[0, 1.5], [1.5, 2.5]]];
const LT = [[[2.5, 0.5], [3, 1]], [[3, 0.5], [3.5, 0.5]], []];

function planLofi(o) {
  const barSec = 240 / o.bpm, start = 0.3, end = 7;
  const bars = Math.max(20, Math.round((o.dur - start - end) / barSec / 4) * 4);
  const secs = [], add = (name, len) => {
    for (let i = 0; i < len; i++) secs.push({ name, i, len });
  };
  add("intro", 4);
  const cyc = [["A", 8], ["B", 8], ["brk", 4], ["A", 8], ["B", 8], ["A", 8], ["B", 8], ["brk", 4]], mids = [];
  for (let rem = bars - 8, k = 0; rem > 0; k++) {
    const [nm, l] = cyc[k % cyc.length], len = Math.min(l, rem);
    mids.push([nm, len]);
    rem -= len;
  }
  if (mids.at(-1)[0] === "brk") mids.at(-1)[0] = "A";
  mids.forEach(([nm, len]) => add(nm, len));
  add("outro", 4);
  return { dur: Math.round(start + bars * barSec + end), barSec, start, bars, secs, bpm: o.bpm };
}

function lofi(o, pl) {
  const rng = new Rng(o.seed), n = pl.dur * SR, beat = pl.barSec / 4, sw = o.swing, start = pl.start;
  const keys = stereo(n), bass = stereo(n), drums = stereo(n), lead = stereo(n);
  const keyPc = pc(o.key), totalBeats = pl.bars * 4, secAt = (b) => pl.secs[Math.min(pl.bars - 1, Math.floor(b / 4))];
  const swing = (b) => {
    const f = b - Math.floor(b);
    return Math.abs(f - 0.5) < 1e-6 ? (sw - 0.5) * beat : 0;
  };
  const T = (b) => start + b * beat + swing(b);

  // 화음 구간
  const segs = [];
  for (let b = 0, k = 0; b < totalBeats; k++) {
    const c = o.prog[k % o.prog.length];
    segs.push({ b, L: c[0], root: pc(keyPc + c[1]), q: c[2] });
    b += c[0];
  }
  const chordAt = (b) => segs.findLast((s) => s.b <= b) ?? segs[0];
  const chordPcs = (b) => {
    const s = chordAt(b);
    return pcSet(s.root, LQ[s.q]);
  };

  // 키(로즈) + 베이스
  const vel = { intro: 0.46, A: 0.55, B: 0.58, brk: 0.48, outro: 0.45 };
  let prevV = null;
  const kickTimes = [];
  segs.forEach((s, si) => {
    const sec = secAt(s.b), v = voicing(s.root, s.q, prevV, o.center ?? 62);
    prevV = v;
    const style = sec.name === "A" ? o.comp : sec.name === "B" ? o.comp2 : "whole";
    for (const [hb, hl, hv] of COMP[style](s.L)) {
      const t = Math.max(start, T(s.b + hb)), strum = rng.range(0.008, 0.02);
      v.forEach((m, j) => epiano(keys, t + j * strum + rng.range(0, 0.004), m, vel[sec.name] * hv * (j === v.length - 1 ? 0.62 : 0.5) * rng.range(0.92, 1.05), hl * beat, -0.25 + (0.5 * j) / (v.length - 1)));
    }
    if (sec.name === "A" || sec.name === "B" || (sec.name === "outro" && sec.i < 2)) {
      const br = inRange(s.root, 33), next = segs[si + 1] ?? segs[0];
      for (const [hb, hl, iv] of BASSP[o.bass](s.L)) {
        let m = br + (typeof iv === "number" ? iv : 0);
        if (iv === "app") {
          if (!rng.chance(0.6)) continue;
          const nr = inRange(next.root, 33);
          m = nr === br ? br + 7 : rng.chance(0.6) ? nr - 1 : nr + 1;
        }
        if (m > 52) m -= 12;
        bassNote(bass, T(s.b + hb), m, 0.42 * rng.range(0.92, 1.05), hl * beat);
      }
    }
  });
  // 마지막 으뜸화음
  const tEnd = start + totalBeats * beat, tonicQ = o.mode === "minor" ? "m9" : "M9";
  voicing(keyPc, tonicQ, prevV, o.center ?? 62).forEach((m, j) => epiano(keys, tEnd + j * 0.03, m, 0.45, 4.5, -0.25 + j * 0.17));
  bassNote(bass, tEnd, inRange(keyPc, 33), 0.38, 4);

  // 리드(B 구간): 부름 4마디 + 응답 4마디를 한 번 만들고 매번 똑같이 반복한다
  const lt = 60 + pc(o.key - 60);
  const lcx = { scale: o.mode === "minor" ? SCALES.minPent : SCALES.majPent, tonic: lt, lo: -2, hi: 7 };
  const strongL = (r) => Number.isInteger(r.pos) && (r.pos % 2 === 0 || r.len >= 1);
  const m1 = toRhB(rng.pick(LR)), m2 = toRhB(rng.pick(LR)), tl = toRhB(rng.pick(LT)), e1 = toRhB(rng.pick(LE)), e2 = toRhB(rng.pick(LE));
  const home = rng.pick([2, 3, 4]);
  const phrase = (b0, answer) => {
    const out = [], P = (bar) => (pos) => chordPcs(b0 + bar * 4 + pos);
    const d0 = contour(rng, lcx, m1, P(0), answer ? home + 1 : home, home + rng.pick([-1, 1, 2]), 1, strongL);
    out.push([0, m1, d0]);
    if (answer) out.push([1, m2, contour(rng, lcx, m2, P(1), d0.at(-1), home - 1, -0.5, strongL)]);
    else if (tl.length) out.push([1, tl, contour(rng, lcx, tl, P(1), d0.at(-1) + 1, d0.at(-1), 0, strongL)]);
    out.push([2, m1, seqFit(lcx, d0, m1, P(2)(0), rng)]);
    const e = answer ? e2 : e1, endT = answer ? (Math.abs(d0.at(-1) - 5) < Math.abs(d0.at(-1)) ? 5 : 0) : rng.pick([1, 3]);
    out.push([3, e, contour(rng, lcx, e, P(3), d0.at(-1), snap(lcx, endT, P(3)(e.at(-1).pos), rng), 0.5, strongL)]);
    return out;
  };
  const leadPhr = [phrase(0, false), phrase(4, true)];
  const leadFn = o.lead;
  const playLead = (t, m, v, dur) => {
    if (leadFn === "flute") flute(lead, t, m, v * 0.32, dur * 0.95, 0.2, rng);
    else if (leadFn === "vibes") vibes(lead, t, m, v * 0.5, 0.2);
    else if (leadFn === "musicbox") musicBox(lead, t, m + 12, v * 0.42, 0.2);
    else epiano(lead, t, m, v * 0.42, dur, 0.15);
  };
  for (let bar = 0; bar < pl.bars; bar++) {
    const sec = pl.secs[bar];
    if (sec.name === "B" && sec.i % 4 === 0 && sec.len - sec.i >= 4) {
      const ph = leadPhr[Math.floor(sec.i / 4) % 2];
      for (const [bo, rh, degs] of ph)
        rh.forEach((r, i) => playLead(T((bar + bo) * 4 + r.pos), degMidi(lcx, degs[i]), (r.pos === 0 ? 1 : 0.88) * rng.range(0.9, 1.05), r.len * beat));
    }
    // A·인트로의 4마디 끝에는 가끔 짧은 응답 프레이즈를 키로 넣는다
    if ((sec.name === "A" || sec.name === "intro") && sec.i % 4 === 3 && rng.chance(0.55)) {
      const d = snap(lcx, rng.pick([3, 4, 5]), chordPcs(bar * 4 + 3), rng);
      epiano(lead, T(bar * 4 + 3), degMidi(lcx, d + 1), 0.24, beat * 0.45, 0.3);
      epiano(lead, T(bar * 4 + 3.5), degMidi(lcx, d), 0.26, beat * 1.2, 0.3);
    }
  }

  // 드럼
  const ks = bank(rng, 3, kickS), ss = bank(rng, 3, o.snare === "rim" ? rimS : snareS), hs = bank(rng, 4, (r) => hatS(r, false)), ho = bank(rng, 2, (r) => hatS(r, true));
  const pat = DRUMP[o.drums], st = [0, sw / 2, sw, sw + (1 - sw) / 2];
  const stepT = (bar, s) => start + (bar * 4 + Math.floor(s / 4) + st[s % 4]) * beat;
  const sGain = o.snare === "rim" ? 0.3 : 0.42;
  for (let bar = 0; bar < pl.bars; bar++) {
    const sec = pl.secs[bar], nxt = pl.secs[bar + 1]?.name, full = sec.name === "A" || sec.name === "B";
    const lastOfSec = sec.i === sec.len - 1;
    const hum = () => rng.range(-0.004, 0.004);
    if (full) {
      const stop = lastOfSec && (nxt === "brk" || nxt === "outro"); // 쉬어가기 전 마디는 3박에서 멈춘다
      for (const [s, v] of pat.k) if (!(stop && s > 8)) {
        const t = stepT(bar, s) + hum();
        place(drums, rng.pick(ks), t, 0.8 * v * rng.range(0.92, 1.04), 0);
        kickTimes.push(t);
      }
      for (const [s, v] of pat.s) if (!(stop && s > 8)) place(drums, rng.pick(ss), stepT(bar, s) + (o.lazy ?? 0.012) + hum(), sGain * v * rng.range(0.9, 1.04), 0.06);
      for (const [s, v] of pat.g) if (rng.chance(0.7)) place(drums, rng.pick(ss), stepT(bar, s) + hum(), sGain * v * rng.range(0.8, 1.1), 0.06);
      if (lastOfSec && !stop && rng.chance(0.7)) for (const s of [13, 14, 15]) place(drums, rng.pick(ss), stepT(bar, s), sGain * 0.16 * rng.range(0.8, 1.2), 0.06);
    }
    const hats = full || (sec.name === "brk" && o.brkHats) || (sec.name === "intro" && sec.i === 3);
    if (hats) {
      for (let s = sec.name === "intro" ? 8 : 0; s < 16; s += 2) {
        const isOpen = s === 14 && bar % 4 === 3 && rng.chance(0.5);
        const v = (s % 4 === 0 ? 0.8 : 0.55) * (sec.name === "brk" ? 0.6 : 1) * rng.range(0.85, 1.1);
        place(drums, rng.pick(isOpen ? ho : hs), stepT(bar, s) + hum(), 0.11 * v * (isOpen ? 0.7 : 1), 0.3);
      }
      if (full && rng.chance(0.25)) place(drums, rng.pick(hs), stepT(bar, 15), 0.05, 0.3);
    }
  }

  // 믹스
  // 키: 구간별 필터 자동화(인트로는 벽 너머처럼 먹먹하게 → 열림, 브레이크는 다시 닫힘)
  const cut = new Float32Array(n), open = o.keyCut ?? 3500;
  for (let i = 0; i < n; i++) {
    const b = (i / SR - start) / beat, sec = secAt(Math.max(0, b)), u = clamp(b / 16, 0, 1);
    let f = sec.name === "intro" ? 700 + (open - 700) * u * u : sec.name === "brk" ? 1300 : sec.name === "outro" ? open * (1 - 0.7 * clamp((b - (pl.bars - 4) * 4) / 20, 0, 1)) : open;
    if (b < 0) f = 700;
    if (b > totalBeats) f = open * 0.3;
    cut[i] = f;
  }
  const cs = new Float32Array(n);
  let sm = cut[0];
  for (let i = 0; i < n; i++) cs[i] = sm += (cut[i] - sm) * 0.0002; // ~0.1초로 부드럽게
  for (const x of keys) svf(x, cs, 0.75, "lp");
  for (const x of lead) svf(x, cs.map((f) => Math.min(f * 1.4, 5000)), 0.7, "lp");
  // 킥에 맞춰 키를 살짝 눌러 숨 쉬게(사이드체인)
  {
    const kIdx = new Set(kickTimes.map((t) => Math.round(t * SR)));
    let d = 0, g = 1;
    const dk = Math.exp(-1 / (0.16 * SR));
    for (let i = 0; i < n; i++) {
      if (kIdx.has(i)) d = 0.22;
      d *= dk;
      g += (1 - d - g) * 0.01;
      keys[0][i] *= g;
      keys[1][i] *= g;
    }
  }
  autopan(keys, o.trem ?? 3.6, 0.09);
  saturate(keys, 1.4);
  filt(bass, "lp", 420, 0.7);
  saturate(bass, 1.2);
  filt(drums, "lp", 8000, 0.7);
  saturate(drums, 1.5);
  reverb(drums, { room: 0.45, damp: 0.6, wet: 0.08, lowCut: 300 });
  gainBus(keys, 1.0);
  gainBus(bass, 0.95);
  gainBus(lead, 1.0);
  gainBus(drums, 1.25);
  stem("keys", keys);
  stem("bass", bass);
  stem("lead", lead);
  stem("drums", drums);
  const music = addBus(addBus(keys, bass), lead);
  reverb(music, { room: 0.72, damp: 0.5, wet: 0.13, width: 0.8, lowCut: 250 });
  wobble(music, rng, { rate: o.wob ?? 0.5, cents: o.wobC ?? 9 });
  addBus(music, drums);
  const vin = vinyl(n, rng, o.vinyl ?? 1);
  stem("vinyl", vin);
  addBus(music, vin);
  return { bus: music, master: { lp: 9000, hp: 30 } };
}

function vinyl(n, rng, amt) {
  const bus = stereo(n), [L, R] = bus;
  const ticks = Math.round((n / SR) * 9 * amt);
  for (let k = 0; k < ticks; k++) {
    const i = Math.floor(rng.next() * (n - 64)), a = 0.9 * rng.next() ** 3 + 0.05, side = rng.next(), len = 2 + Math.floor(rng.next() * 6);
    for (let j = 0; j < len; j++) {
      const v = a * rng.bi() * (1 - j / len);
      if (side < 0.45) L[i + j] += v;
      else if (side < 0.9) R[i + j] += v;
      else (L[i + j] += v), (R[i + j] += v);
    }
  }
  for (let k = 0, pops = Math.round((n / SR) * 0.15 * amt); k < pops; k++) {
    const i = Math.floor(rng.next() * (n - 400)), a = rng.range(0.5, 1.2);
    for (let j = 0; j < 300; j++) {
      const v = a * rng.bi() * Math.exp(-j / 40);
      L[i + j] += v;
      R[i + j] += v * 0.8;
    }
  }
  filt(bus, "hp", 900, 0.7);
  filt(bus, "lp", 6500, 0.7);
  for (const x of bus) {
    const h = biquad(biquad(white(n, rng), "lp", 4500, 0.7), "hp", 300, 0.7);
    for (let i = 0; i < n; i++) x[i] = (x[i] * 0.6 + h[i] * 0.008) * amt;
  }
  return bus;
}

// ───────────────────────── 빗소리 · 앰비언트 ─────────────────────────
function rainBed(n, rng, { level, hp = 300, lp = 5000, width = 0.8, swell = 0.2, period = 7 }) {
  const a = pink(n, rng), b = pink(n, rng), c = pink(n, rng), wc = 1 - width;
  for (let i = 0; i < n; i++) {
    a[i] = a[i] * width + c[i] * wc;
    b[i] = b[i] * width + c[i] * wc;
  }
  const bus = [a, b];
  filt(bus, "hp", hp, 0.7);
  filt(bus, "lp", lp, 0.7);
  filt(bus, "lp", lp * 1.4, 0.7);
  const m1 = smoothNoise(n, rng, period), m2 = smoothNoise(n, rng, period * 2.7);
  for (let i = 0; i < n; i++) {
    const g = level * (1 + swell * ((0.6 * m1[i] + 0.4 * m2[i]) * 2 - 1));
    a[i] *= g;
    b[i] *= g;
  }
  return bus;
}
// 돌에 떨어지는 빗방울: 아주 짧은 잡음 + 작은 '톡'
function stoneTick(rng) {
  const n = Math.round(0.05 * SR), x = new Float32Array(n), d = rng.range(250, 600), f2 = rng.range(250, 700);
  for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.exp((-i / SR) * d);
  biquad(x, "bp", rng.range(1300, 3800), rng.range(1.5, 3.5));
  for (let i = 0; i < n; i++) x[i] += 0.25 * Math.sin((TAU * f2 * i) / SR) * Math.exp((-i / SR) * 90);
  return normPeak(x);
}
// 물웅덩이 방울: 위로 휘는 짧은 사인(공기방울 공명)
function plink(rng, lo = 900, hi = 2600) {
  const n = Math.round(0.14 * SR), x = new Float32Array(n), f0 = rng.range(lo, hi), rise = rng.range(0.3, 1.0), d = rng.range(25, 55);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * f0 * (1 + rise * (1 - Math.exp(-t * 40)))) / SR;
    x[i] = Math.sin(ph) * Math.exp(-t * d) * Math.min(1, i / 40);
  }
  return x;
}
function tinPing(rng) {
  const n = Math.round(0.22 * SR), x = new Float32Array(n), f0 = rng.range(1500, 3000);
  [[1, 1], [1.47, 0.55], [2.09, 0.32], [2.56, 0.18]].forEach(([r, a], k) => {
    const f = f0 * (r + (k ? rng.range(-0.04, 0.04) : 0)), d = rng.range(20, 40) * (1 + k * 0.4);
    for (let i = 0; i < n; i++) x[i] += a * Math.sin((TAU * f * i) / SR) * Math.exp((-d * i) / SR);
  });
  for (let i = 0; i < 80; i++) x[i] += 0.3 * rng.bi() * (1 - i / 80);
  return normPeak(biquad(x, "lp", 6000, 0.7));
}
function roofThunk(rng) {
  const n = Math.round(0.15 * SR), x = new Float32Array(n), f = rng.range(160, 320);
  for (let i = 0; i < n; i++) x[i] = Math.sin((TAU * f * i) / SR) * Math.exp((-i / SR) * 35) + 0.3 * rng.bi() * Math.exp((-i / SR) * 70);
  return normPeak(biquad(x, "lp", 900, 0.7));
}
// 먼 천둥: 저역 갈색 잡음을 여러 번 '구르는' 완만한 엔벨로프로. 갑작스러운 크랙은 없다.
function thunder(bus, rng, t0, amp) {
  const dur = rng.range(9, 13), len = Math.round(dur * SR), s0 = Math.round(t0 * SR), [L, R] = bus;
  const bumps = [];
  let c = rng.range(2.5, 3.5);
  for (let k = 0, K = rng.int(3, 5); k < K; k++) {
    bumps.push([c, rng.range(1.4, 2.4), rng.range(1.5, 3), k === 0 ? rng.range(0.6, 0.9) : rng.range(0.35, 0.8)]);
    c += rng.range(0.8, 2.2);
  }
  const nl = brown(len, rng), nr = brown(len, rng), nc = brown(len, rng);
  for (const x of [nl, nr, nc]) {
    biquad(x, "lp", 170, 0.7);
    biquad(x, "lp", 260, 0.6);
    biquad(x, "hp", 28, 0.7);
    normPeak(x);
  }
  const [gl, gr] = panGains(rng.range(-0.5, 0.5));
  for (let i = 0; i < len && s0 + i < L.length; i++) {
    const t = i / SR;
    let e = 0;
    for (const [bc, rise, fall, h] of bumps) e += h * (t < bc ? Math.exp(-3 * ((bc - t) / rise) ** 2) : Math.exp(-(t - bc) / fall));
    e *= Math.min(1, (len - i) / (1.5 * SR));
    L[s0 + i] += amp * e * (0.6 * nl[i] + 0.4 * nc[i]) * gl;
    R[s0 + i] += amp * e * (0.6 * nr[i] + 0.4 * nc[i]) * gr;
  }
}
function crickets(bus, rng, dur, count, level) {
  const [L, R] = bus, n = L.length;
  for (let c = 0; c < count; c++) {
    const fc = rng.range(3400, 4600), period = rng.range(0.42, 0.9), pulses = rng.int(2, 4), pl = rng.range(0.012, 0.02), gap = rng.range(0.008, 0.014);
    const amp = level * rng.range(0.35, 1), [gl, gr] = panGains(rng.range(-0.85, 0.85));
    let t = rng.range(0, 3), on = true, flip = t + rng.range(8, 22);
    while (t < dur) {
      if (t > flip) {
        on = !on;
        flip = t + (on ? rng.range(8, 22) : rng.range(2, 7));
      }
      if (on) {
        const a = amp * rng.range(0.75, 1), m = Math.round(pl * SR);
        for (let p = 0; p < pulses; p++) {
          const s0 = Math.round((t + p * (pl + gap)) * SR);
          for (let j = 0; j < m && s0 + j < n; j++) {
            const u = j / m, v = a * Math.sin(Math.PI * u) ** 2 * Math.sin((TAU * fc * (1 - 0.015 * u) * j) / SR);
            L[s0 + j] += v * gl;
            R[s0 + j] += v * gr;
          }
        }
      }
      t += period * rng.range(0.96, 1.04);
    }
  }
}
function owl(bus, rng, t0, amp, p) {
  const [L, R] = bus, f = rng.range(330, 400), [gl, gr] = panGains(p);
  for (const [dt, len] of [[0, 0.5], [0.85, 0.26], [1.2, 0.6]]) {
    const s0 = Math.round((t0 + dt) * SR), m = Math.round(len * SR);
    let ph = 0;
    for (let j = 0; j < m && s0 + j < L.length; j++) {
      const u = j / m, e = Math.min(1, j / (0.06 * SR)) * Math.min(1, (m - j) / (0.18 * SR));
      ph += (TAU * f * (1 - 0.05 * u)) / SR;
      const v = amp * e * (Math.sin(ph) + 0.12 * Math.sin(2 * ph));
      L[s0 + j] += v * gl;
      R[s0 + j] += v * gr;
    }
  }
}
function wind(n, rng, { level, lo, hi, q = 1.2, period = 6 }) {
  const g1 = smoothNoise(n, rng, period), out = [];
  for (let c = 0; c < 2; c++) {
    const g = smoothNoise(n, rng, period * 0.33), x = pink(n, rng), fc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      g[i] = (0.7 * g1[i] + 0.3 * g[i]) ** 1.5;
      fc[i] = lo + (hi - lo) * g[i];
    }
    svf(x, fc, q, "bp");
    for (let i = 0; i < n; i++) x[i] *= level * (0.15 + 0.85 * g[i]);
    out.push(x);
  }
  return { bus: out, gust: g1 };
}
function leaves(n, rng, gust, level) {
  const out = [];
  for (let c = 0; c < 2; c++) {
    const x = biquad(biquad(white(n, rng), "hp", 1600, 0.7), "lp", 4800, 0.7), r = smoothNoise(n, rng, 0.05);
    for (let i = 0; i < n; i++) x[i] *= level * gust[i] ** 2 * (0.2 + 2.5 * r[i] ** 3);
    out.push(x);
  }
  return out;
}

function pianoPart(bus, rng, dur) {
  const beat = 60 / 52, bar = beat * 4, start = 2.5, bars = Math.floor((dur - start - 11) / bar);
  const prog = [[9, "m9"], [5, "M9"], [0, "M9"], [7, "69"]];
  const cx = { scale: SCALES.majPent, tonic: 72, lo: -2, hi: 7 };
  const MR = [[[0, 1.5], [1.5, 0.5], [2, 2]], [[1, 1], [2, 2]], [[0.5, 0.5], [1, 1], [2, 1.5]], [[0, 1], [1, 1], [2, 2]]];
  const strong = (r) => Number.isInteger(r.pos);
  let prevV = null, motif = null, mdeg = null;
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % 4], rp = pc(root), t0 = start + b * bar, v = voicing(rp, q, prevV, 66), hold = bar + 0.5;
    prevV = v;
    const phase = b / bars, dens = phase < 0.12 || phase > 0.88 ? 0 : Math.floor(b / 8) % 2 ? 2 : 1;
    const lh = inRange(rp, 40);
    piano(bus, t0, lh, 0.42, -0.2, hold, rng);
    if (rng.chance(0.6)) piano(bus, t0 + beat * rng.pick([1, 1.5]), lh + rng.pick([7, 12]), 0.24, -0.15, hold - beat, rng);
    const times = [1.5, 2, 2.5, 3].filter(() => rng.chance(dens === 0 ? 0.25 : 0.5)).slice(0, dens + 1);
    times.forEach((tb, k) => piano(bus, t0 + tb * beat, v[(k * 2 + 1) % v.length], 0.22 + 0.06 * rng.next(), 0.15, hold - tb * beat, rng));
    if (dens === 2) {
      const j = b % 4, pcs = () => pcSet(rp, LQ[q]);
      if (j === 0) {
        motif = toRhB(rng.pick(MR));
        mdeg = contour(rng, cx, motif, pcs, rng.pick([2, 3, 4]), rng.pick([1, 3, 5]), 1, strong);
      }
      const play = (rh, degs) => rh.forEach((r, i) => piano(bus, t0 + r.pos * beat, degMidi(cx, degs[i]), 0.36, 0.25, hold - r.pos * beat, rng));
      if (j === 0) play(motif, mdeg);
      if (j === 2 && motif) play(motif, seqFit(cx, mdeg, motif, pcs(), rng));
      if (j === 3) piano(bus, t0, degMidi(cx, snap(cx, rng.pick([0, 2, 5]), pcs(), rng)), 0.32, 0.25, hold, rng);
    }
  }
  const tEnd = start + bars * bar;
  piano(bus, tEnd, 36, 0.4, -0.2, 9, rng);
  voicing(0, "M9", prevV, 66).forEach((m, k) => piano(bus, tEnd + 0.15 + k * 0.12, m, 0.26, 0.1, 9, rng));
  piano(bus, tEnd + 0.8, 79, 0.24, 0.3, 9, rng);
}

function rain(o, pl) {
  const rng = new Rng(o.seed), dur = pl.dur, n = dur * SR, bus = stereo(n);
  const lowRain = (level, lp = 700) => rainBed(n, rng, { level, hp: 70, lp, width: 0.5, swell: 0.3, period: 11 });
  let master = { lp: 7500, hp: 30 };
  switch (o.kind) {
    case "stones": {
      addBus(bus, rainBed(n, rng, { level: 0.22, hp: 350, lp: 4500, width: 0.85, swell: 0.2 }));
      addBus(bus, lowRain(0.1));
      stem("bed", bus);
      const fx = stereo(n);
      scatter(fx, rng, bank(rng, 48, stoneTick), 16, 0.03, 0.15, 0.9);
      scatter(fx, rng, bank(rng, 24, (r) => plink(r)), 0.7, 0.03, 0.1, 0.7);
      stem("drops", fx);
      addBus(bus, fx);
      reverb(bus, { room: 0.6, damp: 0.5, wet: 0.12 });
      master = { lp: 6500, hp: 30 };
      break;
    }
    case "thunder": {
      addBus(bus, rainBed(n, rng, { level: 0.3, hp: 250, lp: 4600, width: 0.9, swell: 0.25, period: 9 }));
      addBus(bus, lowRain(0.18, 900));
      scatter(bus, rng, bank(rng, 48, stoneTick), 34, 0.02, 0.14, 0.95);
      stem("rain", bus);
      const th = stereo(n);
      for (let t = rng.range(9, 14); t < dur - 16; t += rng.range(24, 38)) thunder(th, rng, t, rng.range(0.17, 0.26));
      stem("thunder", th);
      addBus(bus, th, 0.9);
      reverb(bus, { room: 0.7, damp: 0.6, wet: 0.1, lowCut: 120 });
      master = { lp: 6500, hp: 30 };
      break;
    }
    case "piano": {
      addBus(bus, rainBed(n, rng, { level: 0.14, hp: 250, lp: 3800, width: 0.85, swell: 0.2 }));
      addBus(bus, lowRain(0.06, 600));
      scatter(bus, rng, bank(rng, 32, stoneTick), 6, 0.01, 0.06, 0.9);
      filt(bus, "lp", 4200, 0.7);
      stem("rain", bus);
      const pno = stereo(n);
      pianoPart(pno, rng, dur);
      filt(pno, "lp", 3200, 0.7);
      reverb(pno, { room: 0.86, damp: 0.5, wet: 0.3, width: 0.9, pre: 0.03 });
      stem("piano", pno);
      addBus(bus, pno, 1.0);
      break;
    }
    case "crickets": {
      const w1 = wind(n, rng, { level: 0.9, lo: 180, hi: 650, q: 1.4, period: 7 }), w2 = wind(n, rng, { level: 0.35, lo: 600, hi: 1600, q: 2, period: 5 });
      addBus(bus, w1.bus);
      addBus(bus, w2.bus);
      stem("wind", bus);
      const cr = stereo(n);
      crickets(cr, rng, dur, 5, 0.05);
      for (let t = rng.range(18, 30); t < dur - 10; t += rng.range(28, 45)) owl(cr, rng, t, 0.05, rng.range(-0.6, 0.6));
      filt(cr, "lp", 6000, 0.7);
      reverb(cr, { room: 0.75, damp: 0.5, wet: 0.25 });
      stem("bugs", cr);
      addBus(bus, cr);
      break;
    }
    case "trees": {
      const w = wind(n, rng, { level: 0.8, lo: 250, hi: 900, q: 1.1, period: 8 });
      addBus(bus, w.bus);
      addBus(bus, leaves(n, rng, w.gust, 0.16));
      stem("wind", bus);
      const pad = stereo(n), ch = [[50, 57, 64, 66], [47, 54, 62, 69], [43, 50, 59, 66], [45, 52, 59, 64]];
      for (let t = 1, k = 0; t < dur - 8; k++) {
        const d = rng.range(12, 16);
        ch[k % 4].forEach((m, j) => padNote(pad, t + j * 0.4, d, m, 0.05, (j - 1.5) * 0.3, 4, 6));
        t += d - 1;
      }
      filt(pad, "lp", 1800, 0.7);
      reverb(pad, { room: 0.9, damp: 0.5, wet: 0.35, width: 1 });
      stem("pad", pad);
      addBus(bus, pad);
      break;
    }
    case "tinroof": {
      addBus(bus, rainBed(n, rng, { level: 0.13, hp: 150, lp: 2500, width: 0.7, swell: 0.25 }));
      stem("bed", bus);
      const fx = stereo(n);
      scatter(fx, rng, bank(rng, 48, tinPing), 22, 0.02, 0.12, 0.9);
      scatter(fx, rng, bank(rng, 16, roofThunk), 3, 0.03, 0.12, 0.8);
      // 처마 끝 낙숫물: 거의 일정한 간격으로 웅덩이에 떨어진다
      const gut = bank(rng, 8, (r) => plink(r, 550, 900)), gp = rng.range(-0.6, 0.6);
      for (let t = 2, per = 0.9; t < dur - 1; t += per * rng.range(0.85, 1.15)) {
        place(fx, rng.pick(gut), t, rng.range(0.07, 0.12), gp);
        per = clamp(per + rng.range(-0.05, 0.05), 0.7, 1.3);
      }
      stem("drops", fx);
      addBus(bus, fx);
      reverb(bus, { room: 0.55, damp: 0.5, wet: 0.1 });
      master = { lp: 7000, hp: 30 };
      break;
    }
    case "bell": {
      addBus(bus, rainBed(n, rng, { level: 0.13, hp: 500, lp: 4600, width: 0.9, swell: 0.25 }));
      addBus(bus, lowRain(0.05, 600));
      scatter(bus, rng, bank(rng, 32, stoneTick), 7, 0.01, 0.06, 0.9);
      stem("drizzle", bus);
      const bell = stereo(n);
      for (let t = rng.range(4, 7); t < dur - 18; t += rng.range(24, 34)) templeBell(bell, t, rng.range(150, 170), 0.048, rng.range(-0.3, 0.3));
      filt(bell, "lp", 1600, 0.7);
      reverb(bell, { room: 0.92, damp: 0.5, wet: 0.4, width: 1, pre: 0.04, lowCut: 100 });
      stem("bell", bell);
      addBus(bus, bell);
      break;
    }
    case "fog": {
      const pad = stereo(n), root = 38;
      for (let t = 0; t < dur; t += 22) {
        padNote(pad, t, 28, root, 0.055, -0.2, 8, 10);
        padNote(pad, t + 3, 26, root + 7, 0.04, 0.2, 9, 10);
        padNote(pad, t + 6, 24, root + 12, 0.03, 0, 9, 10);
      }
      const pool = [62, 64, 69, 71, 74, 76, 81];
      for (let t = 4; t < dur - 8; t += rng.range(5, 9)) padNote(pad, t, rng.range(9, 14), rng.pick(pool), 0.03, rng.range(-0.7, 0.7), 4, 6);
      for (let t = 10; t < dur - 15; t += rng.range(14, 22)) tone(pad, t, 8, mtof(rng.pick([86, 88, 93])), 0.006, rng.range(-0.8, 0.8), 6, 6);
      filt(pad, "lp", 2200, 0.7);
      stem("pad", pad);
      const air = rainBed(n, rng, { level: 0.06, hp: 80, lp: 600, width: 0.9, swell: 0.4, period: 9 });
      stem("air", air);
      addBus(bus, pad);
      addBus(bus, air);
      reverb(bus, { room: 0.92, damp: 0.5, wet: 0.45, width: 1, pre: 0.03, lowCut: 90 });
      master = { lp: 6000, hp: 30 };
      break;
    }
  }
  return { bus, master };
}

// ───────────────────────── 트랙 목록 ─────────────────────────
const PLAYLISTS = [
  { id: "orgel", title: "오르골" },
  { id: "lofi", title: "로파이" },
  { id: "rain", title: "빗소리 앰비언트" },
];
const M = (r, q) => [r, q];
const SPECS = [
  // 오르골: tonic = 선율의 으뜸음(MIDI), progA = 앞악절 화음(으뜸음 기준 반음, 화음 종류), progB = B악절
  { pl: "orgel", file: "moonlit-orgel", title: "달빛 오르골", seed: 7, tonic: 72, scale: "majPent", bpm: 64, meter: 4, progA: [M(0, "M"), M(9, "m"), M(5, "M"), M(7, "M")], progB: [M(5, "M"), M(0, "M"), M(2, "m"), M(7, "M")], acc: "arp", counter: "line", timbre: "musicbox", dur: 112 },
  { pl: "orgel", file: "unfinished-lullaby", title: "끝내지 못한 자장가", seed: 21, tonic: 69, scale: "minPent", bpm: 60, meter: 3, progA: [M(0, "m"), M(8, "M"), M(3, "M"), M(10, "M")], progB: [M(5, "m"), M(0, "m"), M(8, "M"), M(10, "M")], acc: "waltz", counter: "echo", timbre: "musicbox", dur: 118 },
  { pl: "orgel", file: "first-commit-waltz", title: "첫 커밋의 왈츠", seed: 33, tonic: 65, scale: "major", bpm: 72, meter: 3, progA: [M(0, "M"), M(5, "M"), M(0, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(0, "M"), M(7, "7")], acc: "waltz", counter: "thirds", timbre: "celesta", dur: 104 },
  { pl: "orgel", file: "archived-dreams", title: "보관된 꿈", seed: 45, tonic: 74, scale: "dorian", bpm: 58, meter: 4, progA: [M(0, "m7"), M(5, "M"), M(0, "m7"), M(5, "M")], progB: [M(10, "M"), M(5, "M"), M(3, "M"), M(7, "m")], acc: "block", counter: "line", timbre: "musicbox", dur: 116, bass2: true },
  { pl: "orgel", file: "hello-world", title: "안녕, 세상", seed: 52, tonic: 67, scale: "majPent", bpm: 76, meter: 4, progA: [M(0, "M"), M(7, "M"), M(9, "m"), M(5, "M")], progB: [M(5, "M"), M(0, "M"), M(5, "M"), M(7, "M")], acc: "pulse", counter: "echo", timbre: "musicbox", dur: 100 },
  { pl: "orgel", file: "forgotten-readme", title: "잊힌 README", seed: 64, tonic: 64, scale: "minPent", bpm: 66, meter: 3, progA: [M(0, "m"), M(5, "m"), M(10, "M"), M(3, "M")], progB: [M(8, "M"), M(10, "M"), M(0, "m"), M(7, "m")], acc: "arp", counter: "line", timbre: "celesta", dur: 108 },
  { pl: "orgel", file: "localhost-lullaby", title: "로컬호스트 자장가", seed: 71, tonic: 70, scale: "major", bpm: 56, meter: 4, progA: [M(0, "M"), M(4, "m"), M(5, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(2, "m"), M(7, "M")], acc: "arp", counter: "thirds", timbre: "musicbox", dur: 124 },
  { pl: "orgel", file: "sleeping-prototype", title: "잠든 프로토타입", seed: 88, tonic: 65, scale: "lydian", bpm: 62, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(0, "M7"), M(2, "M")], progB: [M(9, "m"), M(4, "m"), M(7, "M"), M(2, "M")], acc: "arp", counter: "echo", timbre: "celesta", dur: 114 },
  { pl: "orgel", file: "deprecated-star", title: "지원 종료된 별", seed: 97, tonic: 67, scale: "minor", bpm: 70, meter: 3, progA: [M(0, "m"), M(5, "m"), M(0, "m"), M(7, "M")], progB: [M(8, "M"), M(10, "M"), M(3, "M"), M(7, "M")], acc: "waltz", counter: "line", timbre: "musicbox", dur: 110 },
  { pl: "orgel", file: "version-zero-one", title: "v0.1의 기억", seed: 105, tonic: 69, scale: "majPent", bpm: 68, meter: 4, progA: [M(0, "M"), M(5, "M"), M(9, "m"), M(7, "M")], progB: [M(2, "m"), M(5, "M"), M(0, "M"), M(7, "M")], acc: "block", counter: "echo", timbre: "musicbox", dur: 106 },

  // 로파이: key = 으뜸음(MIDI), prog = [박 수, 으뜸음 기준 근음, 보이싱]
  { pl: "lofi", file: "late-commit", title: "늦은 커밋", seed: 3, key: 65, mode: "major", bpm: 74, prog: [[4, 2, "m9"], [4, 7, "13"], [4, 0, "M9"], [4, 9, "m9"]], comp: "push", comp2: "charleston", drums: "boom", snare: "snare", swing: 0.6, bass: "root", lead: "flute", dur: 118 },
  { pl: "lofi", file: "todo-forever", title: "영원한 TODO", seed: 11, key: 62, mode: "major", bpm: 70, prog: [[4, 0, "M9"], [4, 5, "M9"], [4, 0, "M9"], [4, 5, "69"]], comp: "whole", comp2: "twoHit", drums: "lazy", snare: "rim", swing: 0.62, bass: "dotted", lead: "vibes", dur: 126, brkHats: true },
  { pl: "lofi", file: "debugging-at-3am", title: "새벽 3시의 디버깅", seed: 19, key: 63, mode: "major", bpm: 82, prog: [[4, 9, "m9"], [4, 2, "m9"], [4, 7, "13"], [4, 0, "M9"]], comp: "charleston", comp2: "stab", drums: "bounce", snare: "snare", swing: 0.58, bass: "synco", lead: "musicbox", dur: 112 },
  { pl: "lofi", file: "empty-repository", title: "빈 레포지토리", seed: 27, key: 60, mode: "major", bpm: 76, prog: [[4, 4, "m7"], [4, 9, "m9"], [4, 2, "m9"], [4, 7, "7b9"]], comp: "push", comp2: "whole", drums: "boom", snare: "rim", swing: 0.6, bass: "two", lead: "keys", dur: 120 },
  { pl: "lofi", file: "sleeping-server-room", title: "잠든 서버실", seed: 36, key: 57, mode: "minor", bpm: 68, prog: [[4, 0, "m9"], [4, 8, "M7"], [4, 2, "m7b5"], [4, 7, "7b9"]], comp: "whole", comp2: "twoHit", drums: "half", snare: "snare", swing: 0.6, bass: "root", lead: "flute", dur: 132, keyCut: 2800 },
  { pl: "lofi", file: "stale-branch", title: "오래된 브랜치", seed: 44, key: 62, mode: "minor", bpm: 86, prog: [[4, 0, "m9"], [4, 5, "9"], [4, 0, "m9"], [4, 5, "9"]], comp: "stab", comp2: "charleston", drums: "bounce", snare: "rim", swing: 0.57, bass: "synco", lead: "vibes", dur: 110, brkHats: true },
  { pl: "lofi", file: "cold-coffee-stack-trace", title: "식은 커피와 스택 트레이스", seed: 58, key: 67, mode: "major", bpm: 72, prog: [[4, 0, "M7"], [4, 4, "m7"], [4, 5, "M9"], [4, 5, "m6"]], comp: "push", comp2: "twoHit", drums: "lazy", snare: "snare", swing: 0.63, bass: "root", lead: "flute", dur: 124, center: 60 },
  { pl: "lofi", file: "stashed-summer", title: "git stash 속의 여름", seed: 61, key: 70, mode: "major", bpm: 80, prog: [[4, 5, "M9"], [4, 4, "m7"], [4, 2, "m9"], [4, 0, "M9"]], comp: "charleston", comp2: "push", drums: "boom", snare: "snare", swing: 0.6, bass: "two", lead: "musicbox", dur: 116, keyCut: 3600 },
  { pl: "lofi", file: "expired-domain", title: "만료된 도메인", seed: 77, key: 64, mode: "major", bpm: 70, prog: [[4, 8, "M7"], [4, 10, "9"], [4, 0, "M9"], [4, 0, "69"]], comp: "whole", comp2: "stab", drums: "half", snare: "rim", swing: 0.61, bass: "dotted", lead: "vibes", dur: 128, brkHats: true },
  { pl: "lofi", file: "sunday-side-project", title: "일요일의 사이드 프로젝트", seed: 83, key: 65, mode: "major", bpm: 88, prog: [[4, 2, "m9"], [4, 7, "9"], [4, 4, "m7"], [4, 9, "7b9"]], comp: "stab", comp2: "charleston", drums: "bounce", snare: "snare", swing: 0.58, bass: "synco", lead: "flute", dur: 108, keyCut: 3600 },
  { pl: "lofi", file: "merge-tomorrow", title: "충돌은 내일 해결하기로", seed: 92, key: 60, mode: "minor", bpm: 76, prog: [[4, 0, "m9"], [4, 5, "m9"], [4, 10, "13"], [4, 3, "M9"]], comp: "twoHit", comp2: "push", drums: "boom", snare: "rim", swing: 0.62, bass: "two", lead: "keys", dur: 122 },
  { pl: "lofi", file: "last-deploy", title: "마지막 배포", seed: 99, key: 68, mode: "major", bpm: 78, prog: [[2, 0, "M9"], [2, 9, "m7"], [2, 2, "m9"], [2, 7, "13"], [2, 4, "m7"], [2, 9, "m9"], [2, 2, "m9"], [2, 7, "7b9"]], comp: "whole", comp2: "stab", drums: "lazy", snare: "snare", swing: 0.6, bass: "root", lead: "musicbox", dur: 130, center: 60 },

  // 빗소리·앰비언트
  { pl: "rain", file: "rain-on-stones", title: "비석 위의 비", seed: 5, kind: "stones", dur: 126 },
  { pl: "rain", file: "distant-thunder", title: "멀리서 우는 천둥", seed: 13, kind: "thunder", dur: 134 },
  { pl: "rain", file: "rainy-night-etude", title: "비 오는 밤의 연습곡", seed: 23, kind: "piano", dur: 130 },
  { pl: "rain", file: "night-crickets", title: "풀벌레 우는 밤", seed: 31, kind: "crickets", dur: 120 },
  { pl: "rain", file: "wind-in-the-trees", title: "묘지 숲의 바람", seed: 41, kind: "trees", dur: 124 },
  { pl: "rain", file: "tin-roof", title: "양철 지붕의 비", seed: 53, kind: "tinroof", dur: 116 },
  { pl: "rain", file: "drizzle-far-bell", title: "이슬비와 먼 종소리", seed: 67, kind: "bell", dur: 128 },
  { pl: "rain", file: "foggy-dawn", title: "안개 낀 새벽", seed: 79, kind: "fog", dur: 132 },
];

const planOf = (s) => (s.pl === "orgel" ? planOrgel(s) : s.pl === "lofi" ? planLofi(s) : { dur: s.dur });

function render(i) {
  const s = SPECS[i], pl = planOf(s), t0 = Date.now();
  const { bus, master } = s.pl === "orgel" ? orgel(s, pl) : s.pl === "lofi" ? lofi(s, pl) : rain(s, pl);
  const st = finalize(bus, master);
  mkdirSync(join(OUT, s.pl), { recursive: true });
  encode(bus, join(OUT, s.pl, `${s.file}.mp3`), s.seed);
  return { i, dur: pl.dur, bpm: pl.bpm, ...st, sec: (Date.now() - t0) / 1000 };
}

function writeManifest() {
  const row = (o) => `{ ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;
  const lists = PLAYLISTS.map((p) => {
    const tracks = SPECS.filter((s) => s.pl === p.id).map((s) =>
      row({ file: `/bgm/${s.pl}/${s.file}.mp3`, title: s.title, artist: ARTIST, sourceUrl: "", license: "CC0", durationSec: planOf(s).dur }),
    );
    return `    {\n      "id": ${JSON.stringify(p.id)},\n      "title": ${JSON.stringify(p.title)},\n      "tracks": [\n${tracks.map((t) => `        ${t}`).join(",\n")}\n      ]\n    }`;
  });
  writeFileSync(join(OUT, "tracks.json"), `{\n  "playlists": [\n${lists.join(",\n")}\n  ]\n}\n`);
}

if (isMainThread) {
  const filter = process.argv[2];
  const ids = SPECS.map((_, i) => i).filter((i) => !filter || `${SPECS[i].pl}/${SPECS[i].file}`.includes(filter));
  if (!ids.length) throw new Error(`no track matches "${filter}"`);
  const W = Math.min(ids.length, Math.max(1, Math.min(8, availableParallelism() - 2)));
  const groups = Array.from({ length: W }, (_, w) => ids.filter((_, k) => k % W === w));
  const t0 = Date.now();
  const results = (
    await Promise.all(
      groups.map(
        (g) =>
          new Promise((res, rej) => {
            const out = [];
            const w = new Worker(new URL(import.meta.url), { workerData: g });
            w.on("message", (m) => {
              const s = SPECS[m.i];
              console.log(`${`${s.pl}/${s.file}`.padEnd(32)} ${String(m.dur).padStart(4)}s ${m.bpm ? `${m.bpm}bpm` : "     "}  ${m.lufs.toFixed(2)} LUFS  peak ${m.peak.toFixed(2)} dB  limit ${m.gr.toFixed(2)} dB  (${m.sec.toFixed(1)}s)`);
              out.push(m);
            });
            w.on("error", rej);
            w.on("exit", (code) => (code ? rej(new Error(`worker exited ${code}`)) : res(out)));
          }),
      ),
    )
  ).flat();
  console.log(`rendered ${results.length} tracks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!filter) {
    writeManifest();
    // 목록에 없는 예전 파일은 지운다
    for (const p of PLAYLISTS) {
      const keep = new Set(SPECS.filter((s) => s.pl === p.id).map((s) => `${s.file}.mp3`));
      for (const f of readdirSync(join(OUT, p.id))) if (f.endsWith(".mp3") && !keep.has(f)) rmSync(join(OUT, p.id, f));
    }
    console.log("wrote tracks.json");
  }
} else {
  for (const i of workerData) parentPort.postMessage(render(i));
}

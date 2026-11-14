// 한때는... BGM 생성기 — 외부 음원 없이 코드로 작곡·합성한다. 결과물은 CC0.
// 사용: node scripts/gen-bgm.mjs [이름 필터] [--fetch] [--missing]   (ffmpeg + libmp3lame 필요, npm 의존성 없음)
//  --missing: 아직 파일이 없는 자체 제작곡만 굽고 tracks.json을 다시 쓴다(이미 있는 mp3는 건드리지 않는다)
//  → apps/web/public/bgm/{playlist}/*.mp3, tracks.json, 그리고 효과음 apps/web/public/sfx/*.mp3
// 트랙마다 고정 시드를 쓰므로 다시 돌려도 같은 파일이 나온다. 필터를 주면 그 트랙만 다시 굽고 tracks.json은 그대로 둔다.
// 외부 무료 음원(EXTERNAL, 라이선스 확인 완료)은 --fetch 때만 원본을 내려받아 128kbps·같은 음량으로 다시 굽는다.
// 평소에는 이미 구워 둔 파일을 그대로 두고 tracks.json에만 넣는다.
// 환경변수 BGM_DEBUG=1 이면 스템별 RMS를 출력한다.
//
// ※ 2026-11: 로파이·재즈·어쿠스틱 기타 목록은 픽사베이 곡으로 바꿨다(PIXABAY_LISTS — tracks.json에서 직접 관리).
//   이 스크립트는 그 세 목록의 곡을 굽지도, 지우지도 않고, tracks.json을 쓸 때도 그 세 목록은 지금 파일의 내용을 그대로 옮긴다.
//   나머지 6개 목록(오르골·빗소리·피아노·8비트·앰비언트·레트로 RPG)과 효과음은 예전처럼 굽는다.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const SR = 44100;
const TAU = 2 * Math.PI;
const OUT = join(import.meta.dirname, "../apps/web/public/bgm");
const SFX_OUT = join(import.meta.dirname, "../apps/web/public/sfx");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
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
  let tail = 0;
  for (const x of bus) {
    const s1 = coefs("hs", 1681.974450955533, 0.7071752369554196, 3.999843853973347);
    const s2 = coefs("hp", 38.13547087602444, 0.5003270373238773);
    let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let i = 0; i < n; i++) {
      const v = x[i], y = s1[0] * v + z1;
      z1 = s1[1] * v - s1[3] * y + z2;
      z2 = s1[2] * v - s1[4] * y;
      const u = s2[0] * y + w1;
      w1 = s2[1] * y - s2[3] * u + w2;
      w2 = s2[2] * y - s2[4] * u;
      const b = Math.floor(i / hop);
      if (b < H) e[b] += u * u;
      else tail += u * u;
    }
  }
  const blocks = [];
  for (let b = 0; b + 4 <= H; b++) blocks.push((e[b] + e[b + 1] + e[b + 2] + e[b + 3]) / (4 * hop));
  if (!blocks.length) blocks.push((e.reduce((a, b) => a + b, 0) + tail) / (4 * hop)); // 0.4초보다 짧은 효과음
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

function finalize(bus, { lp = 0, hp = 30, fadeIn = 3, fadeOut = 4, target = TARGET_LUFS, ceil = CEILING } = {}) {
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
    if (Math.abs(l - target) < 0.05 && peakOf(bus) <= ceil) break;
    gainBus(bus, 10 ** ((target - l) / 20));
    minG = Math.min(minG, limiter(bus, ceil));
  }
  return { lufs: lufs(bus), peak: dB(peakOf(bus)), gr: dB(minG) };
}

function encode(bus, file, seed, kbps = 128) {
  const [L, R] = bus, n = L.length, pcm = new Int16Array(n * 2), rng = new Rng(seed ^ 0x5bd1e995);
  for (let i = 0; i < n; i++) {
    pcm[2 * i] = clamp(Math.round(L[i] * 32767 + rng.next() - rng.next()), -32768, 32767);
    pcm[2 * i + 1] = clamp(Math.round(R[i] * 32767 + rng.next() - rng.next()), -32768, 32767);
  }
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", String(SR), "-ac", "2", "-i", "pipe:0"];
  args.push("-c:a", "libmp3lame", "-b:a", `${kbps}k`, "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-id3v2_version", "0", file);
  execFileSync(FFMPEG, args, { input: Buffer.from(pcm.buffer), stdio: ["pipe", "ignore", "inherit"], maxBuffer: 1 << 30 });
}

// ───────────────────────── 화성 도구 ─────────────────────────
const SCALES = {
  majPent: [0, 2, 4, 7, 9],
  minPent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
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
function bassNote(bus, t0, m, v, dur, dec = 0.9) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), rel = 0.08;
  const len = Math.min(L.length - s0, Math.round((dur + rel) * SR)), w = (TAU * f) / SR, durN = dur * SR, relN = rel * SR;
  const k = Math.exp(-dec / SR);
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
// 칩튠 펄스파(PolyBLEP로 앨리어싱을 줄인 사각파). duty 0.125/0.25/0.5
function pulse(bus, t0, m, v, p, dur, duty = 0.25, { atk = 0.004, dec = 0.12, sus = 0.55, rel = 0.05, vib = 0 } = {}) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), len = Math.min(L.length - s0, Math.round((dur + rel) * SR));
  const [gl, gr] = panGains(p), dc = 2 * duty - 1;
  const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR, dt = (f / SR) * (vib ? 1 + vib * Math.sin(TAU * 5.5 * t) * clamp((t - 0.15) / 0.2, 0, 1) : 1);
    ph += dt;
    if (ph >= 1) ph -= 1;
    const y = (ph < duty ? 1 : -1) + blep(ph, dt) - blep((ph + 1 - duty) % 1, dt) - dc;
    let e = t < atk ? t / atk : sus + (1 - sus) * Math.exp(-(t - atk) / dec);
    if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
    const val = y * v * e;
    L[s0 + i] += val * gl;
    R[s0 + i] += val * gr;
  }
}
// 칩튠 삼각파 베이스
function tri(bus, t0, m, v, dur) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR)), rel = 0.03, len = Math.min(L.length - s0, Math.round((dur + rel) * SR));
  for (let i = 0; i < len; i++) {
    const t = i / SR, ph = (f * t) % 1;
    let e = v * Math.min(1, t / 0.003);
    if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
    const y = (4 * Math.abs(ph - 0.5) - 1) * e;
    L[s0 + i] += y;
    R[s0 + i] += y;
  }
}
function chipDrumKit(rng) {
  const mk = (sec, fn) => {
    const x = new Float32Array(Math.round(sec * SR));
    for (let i = 0; i < x.length; i++) x[i] = fn(i / SR);
    return x;
  };
  let ph = 0;
  const kick = mk(0.16, (t) => ((ph += (150 * Math.exp(-t * 25) + 45) / SR), (4 * Math.abs((ph % 1) - 0.5) - 1) * Math.exp(-t * 18)));
  const snare = biquad(mk(0.12, (t) => rng.bi() * Math.exp(-t * 32)), "bp", 2600, 0.8);
  const hat = biquad(mk(0.04, (t) => rng.bi() * Math.exp(-t * 110)), "hp", 6500, 0.7);
  return { kick: normPeak(kick), snare: normPeak(snare), hat: normPeak(hat) };
}
// 스테레오 핑퐁 에코(칩튠에서 흔히 쓰는 지연 채널 흉내)
function echo(bus, time, fb, mix) {
  const [L, R] = bus, d = Math.round(time * SR), bl = new Float32Array(d), br = new Float32Array(d);
  let k = 0;
  for (let i = 0; i < L.length; i++) {
    const yl = bl[k], yr = br[k];
    bl[k] = R[i] + yr * fb;
    br[k] = L[i] + yl * fb;
    L[i] += yl * mix;
    R[i] += yr * mix;
    if (++k === d) k = 0;
  }
  return bus;
}
// 기타·하프: Karplus-Strong 뜯는 현(노이즈로 튕긴 뒤 지연선이 스스로 걸러지며 울린다)
function pluck(bus, t0, m, v, p, dur, rng, bright = 0.5, t60 = 2.5) {
  const [L, R] = bus, f = mtof(m), s0 = Math.max(0, Math.round(t0 * SR));
  const len = Math.min(L.length - s0, Math.round(Math.min(dur + 1.8, 6) * SR));
  if (len <= 0) return;
  const d = SR / f - 0.5, D = Math.floor(d), fr = d - D, rho = 10 ** (-3 / (t60 * f * (1 + f / 2000))), y = new Float32Array(len);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    let x = 0;
    if (i < D) x = lp += bright * (rng.bi() - lp);
    const a = i - D >= 0 ? (1 - fr) * y[i - D] + (i - D - 1 >= 0 ? fr * y[i - D - 1] : 0) : 0;
    const b = i - D - 1 >= 0 ? (1 - fr) * y[i - D - 1] + (i - D - 2 >= 0 ? fr * y[i - D - 2] : 0) : 0;
    y[i] = x + rho * 0.5 * (a + b);
  }
  const [gl, gr] = panGains(p), fade = Math.round(0.08 * SR);
  for (let i = 0; i < len; i++) {
    const e = v * (i > len - fade ? (len - i) / fade : 1);
    L[s0 + i] += y[i] * e * gl;
    R[s0 + i] += y[i] * e * gr;
  }
}
// 오르골 엔진에 꽂아 쓰는 악기 세트(lead/soft/bass)
function instSet(kind, rng) {
  if (kind === "guitar")
    return {
      lead: (bus, t, m, v, p, dur) => pluck(bus, t, m, v * 0.9, p, dur, rng, 0.55, 2.2),
      soft: (bus, t, m, v, p, dur) => pluck(bus, t, m, v * 1.1, p, dur, rng, 0.35, 2.4),
      bass: (bus, t, m, v, p, dur) => pluck(bus, t, m, v * 0.9, p, dur, rng, 0.3, 3.5),
    };
  if (kind === "retro")
    return {
      lead: (bus, t, m, v, p, dur) => pulse(bus, t, m, v * 0.36, p, Math.max(0.1, dur * 0.92), 0.5, { dec: 0.3, sus: 0.6, vib: 0.005 }),
      soft: (bus, t, m, v, p, dur) => pluck(bus, t, m + 12, v * 1.1, p, dur, rng, 0.4, 1.6),
      bass: (bus, t, m, v, p, dur) => tri(bus, t, m, v * 0.85, dur * 0.85),
    };
  if (kind === "piano") {
    const pn = (hold, k = 1) => (bus, t, m, v, p, dur) => piano(bus, t, m, v * k, p, Math.max(hold, dur ?? 0) + 0.25, rng);
    return { lead: pn(1.2), soft: pn(0.9, 1.25), bass: pn(2.2, 0.9) };
  }
  if (kind === "chip")
    return {
      lead: (bus, t, m, v, p, dur) => pulse(bus, t, m, v * 0.42, p, Math.max(0.08, dur * 0.9), 0.25, { dec: 0.16, sus: 0.5, vib: 0.004 }),
      soft: (bus, t, m, v, p, dur) => pulse(bus, t, m, v * 0.45, p, Math.min(0.22, dur * 0.8), 0.125, { dec: 0.05, sus: 0.25 }),
      bass: (bus, t, m, v, p, dur) => tri(bus, t, m, v * 0.85, dur * 0.85),
    };
  throw new Error(kind);
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

function rideS(rng) {
  const n = Math.round(1.1 * SR), x = new Float32Array(n);
  for (let k = 0; k < 7; k++) {
    const f = rng.range(2800, 6800), a = rng.range(0.3, 1), d = rng.range(2.5, 5);
    for (let i = 0; i < n; i++) x[i] += a * Math.sin((TAU * f * i) / SR + k) * Math.exp((-d * i) / SR);
  }
  for (let i = 0; i < n; i++) x[i] += 1.4 * rng.bi() * Math.exp((-i / SR) * 10);
  biquad(x, "hp", 2500, 0.7);
  return normPeak(biquad(x, "lp", 8500, 0.7));
}
function brushS(rng) {
  const n = Math.round(0.28 * SR), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.bi() * Math.min(1, i / (0.02 * SR)) * Math.exp((-i / SR) * 13);
  biquad(x, "bp", rng.range(2600, 3400), 0.6);
  return normPeak(biquad(x, "lp", 7000, 0.7));
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
  const e8 = pl.barSec / (o.meter * 2);
  let lead = o.timbre === "celesta" ? celesta : musicBox, soft = lead === celesta ? musicBox : celesta, bassI = lowBell;
  if (o.inst) ({ lead, soft, bass: bassI } = instSet(o.inst, rng));
  // dur(초)은 지속음 악기(피아노 페달, 칩 펄스)에만 쓰이고 벨류는 무시한다
  const play = (fn, t, m, v, p, dur = e8 * 2) => fn(bus, Math.max(0, t + rng.range(-0.006, 0.006)), m, v * rng.range(0.9, 1.07), p, dur);
  const tBar = (b) => pl.start + b * pl.barSec;

  const accomp = (t0, ch, vel = 1) => {
    const iv = TRI[ch[1]], rp = pc(o.tonic + ch[0]), r = inRange(rp, o.tonic - 14);
    const T = [r, r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2]];
    const b = inRange(rp, 41);
    const half = o.meter === 4 && o.bass2;
    play(bassI, t0, b, 0.5 * vel, 0, (half ? 4 : o.meter * 2) * e8 * 0.92);
    if (half) play(bassI, t0 + 4 * e8, b + 7 > 52 ? b - 5 : b + 7, 0.25 * vel, 0, 4 * e8 * 0.92);
    if (o.acc === "arp") {
      const pat = o.meter === 4 ? [0, 1, 2, 1, 3, 1, 2, 1] : [0, 1, 2, 3, 2, 1];
      pat.forEach((k, s) => play(soft, t0 + s * e8, T[k], (s === 0 ? 0.24 : 0.17) * vel, -0.25, e8));
    } else if (o.acc === "waltz") {
      const d1 = inRange(pc(r + iv[1]), o.tonic - 10), d2 = inRange(pc(r + iv[2]), d1 + 1);
      for (const s of [2, 4]) {
        play(soft, t0 + s * e8, d1, 0.16 * vel, -0.3, 2 * e8);
        play(soft, t0 + s * e8 + 0.012, d2, 0.14 * vel, 0.25, 2 * e8);
      }
    } else if (o.acc === "block") {
      [T[0], T[1], T[3]].forEach((m, k) => play(soft, t0 + k * 0.05, m, 0.2 * vel, -0.3 + k * 0.3, 4 * e8));
      if (o.meter === 4) [T[1], T[3]].forEach((m, k) => play(soft, t0 + 4 * e8 + k * 0.04, m, 0.12 * vel, 0, 4 * e8));
    } else if (o.acc === "alberti") {
      // 알베르티 베이스: 근음-5음-3음-5음을 8분음으로 고르게
      for (let s = 0; s < o.meter * 2; s++) play(soft, t0 + s * e8, T[[2, 4, 3, 4][s % 4]], (s === 0 ? 0.2 : 0.14) * vel, -0.2, e8);
    } else if (o.acc === "strum") {
      // 기타 스트럼: 화음을 아래→위(업스트로크는 위→아래)로 훑는다
      const hits = o.meter === 4 ? [[0, 1, 1], [3, 0.6, -1], [4, 0.85, 1], [6, 0.6, -1]] : [[0, 1, 1], [2, 0.65, -1], [4, 0.65, -1]];
      for (const [s, hv, dir] of hits) {
        const ns = dir > 0 ? T : [...T].reverse();
        ns.forEach((m, k) => play(soft, t0 + s * e8 + k * 0.014, m, 0.12 * hv * vel, -0.35 + 0.17 * k, 2 * e8));
      }
    } else if (o.acc === "arp16") {
      // 16분 빠른 분산화음(칩·레트로 게임 느낌)
      const pat = [0, 2, 3, 4, 3, 2, 1, 2];
      for (let s = 0; s < o.meter * 4; s++) play(soft, t0 + (s * e8) / 2, T[pat[s % 8]], (s % 4 === 0 ? 0.17 : 0.11) * vel, -0.25, e8 / 2);
    } else {
      for (let q = 0; q < o.meter; q++) play(soft, t0 + q * 2 * e8, [T[1], T[3], T[2], T[3]][q], (q === 0 ? 0.19 : 0.14) * vel, -0.2, 2 * e8);
    }
  };
  // 칩튠 드럼(소음 채널 느낌): 인트로 뒤부터 조용히
  const drums = o.drums ? chipDrumKit(rng) : null;
  const drumBar = (t0) => {
    const v = o.drums;
    for (let s = 0; s < o.meter * 2; s++) {
      const t = t0 + s * e8;
      if (s === 0 || (o.meter === 4 && s === 4)) place(bus, drums.kick, t, 0.5 * v, 0);
      else if (o.meter === 4 && (s === 2 || s === 6)) place(bus, drums.snare, t, 0.22 * v, 0.1);
      place(bus, drums.hat, t, (s % 2 ? 0.07 : 0.1) * v, 0.25);
    }
  };

  for (let b = 0; b < pl.intro; b++) accomp(tBar(b), o.progA[b % 4], 0.85);
  let cPrev = o.tonic - 3;
  pl.form.forEach((ph, k) => {
    const sec = mel[ph], deco = k >= 4 ? 1 : 0, deco2 = k >= 8 && ph !== "I";
    for (let j = 0; j < 4; j++) {
      const t0 = tBar(pl.intro + k * 4 + j), ch = sec.chords[j];
      accomp(t0, ch, ph === "I" ? 0.9 : 1);
      if (drums) drumBar(t0);
      const bar = sec.bars[j];
      if (ph === "I") {
        // 간주: 아래 성부가 동기를 받아 부른다(부름-응답)
        if (bar) bar[0].forEach((r, i) => play(soft, t0 + r.pos * e8, degMidi(cx, bar[1][i]), 0.42, -0.35, r.len * e8));
        else play(lead, t0 + 2 * e8, degMidi(cx, snap(cx, ns + 1, pcSet(o.tonic + ch[0], TRI[ch[1]]), rng)), 0.3, 0.4);
        continue;
      }
      const [rh, degs] = bar;
      rh.forEach((r, i) => {
        const t = t0 + r.pos * e8, m = degMidi(cx, degs[i]);
        const v = 0.55 + (r.pos === 0 ? 0.08 : 0) + (r.len >= 3 ? 0.04 : 0);
        const d = r.len * e8;
        play(lead, t, m, v, 0.12, d);
        if (deco && o.counter === "echo") play(soft, t + 2 * e8, m + 12 <= 93 ? m + 12 : m, v * 0.3, -0.5, d);
        if (deco && o.counter === "thirds" && r.pos % 2 === 0) play(soft, t + 0.004, degMidi(cx, degs[i] - (ns === 5 ? 1 : 2)), v * 0.36, -0.3, d);
        if (deco2 && m + 12 <= 96) play(lead, t + 0.003, m + 12, v * 0.16, 0.35, d);
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
          play(soft, t0 + s * e8, best, s === 0 ? 0.3 : 0.22, -0.4, (o.meter === 4 ? 4 : 6) * e8);
        }
      }
    }
  });
  // 마무리: 으뜸화음을 굴려 치고 울림을 남긴다
  const tEnd = tBar(pl.intro + 4 * pl.P), iv = TRI[o.progA[0][1]], r = inRange(pc(o.tonic), o.tonic - 14);
  play(bassI, tEnd, inRange(pc(o.tonic), 41), 0.5, 0, 5);
  [r, r + iv[2], r + 12 + iv[1]].forEach((m, k) => play(soft, tEnd + k * 0.07, m, 0.22, -0.3 + 0.3 * k, 4.5));
  play(lead, tEnd + 0.3, o.tonic + 12 <= 84 ? o.tonic + 12 : o.tonic, 0.42, 0.15, 4);
  play(lead, tEnd + 1.1, degMidi(cx, ns + 2 <= cx.hi ? ns + 2 : ns), 0.2, 0.35, 3);

  stem("dry", bus);
  if (o.inst === "guitar") filt(bus, "lp", 6000, 0.7);
  if (o.inst === "retro") {
    echo(bus, 3 * e8, 0.22, 0.18);
    filt(bus, "lp", 7000, 0.7);
  }
  if (o.inst === "chip") {
    echo(bus, (3 * e8) / 1, 0.28, 0.22);
    filt(bus, "lp", 6500, 0.7);
  }
  if (o.inst === "piano") filt(bus, "lp", 5200, 0.7);
  reverb(bus, { room: 0.84, damp: 0.42, wet: o.wet ?? 0.3, width: 0.9, pre: 0.025 });
  return { bus, master: { lp: o.inst === "chip" ? 8000 : 9000, hp: 40 } };
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
  // 중복 정리 때 추가: 엇박 킥(skip), 끌리는 킥과 늦은 고스트(dusty)
  skip: { k: [[0, 1], [6, 0.6], [11, 0.75]], s: [[4, 1], [12, 1]], g: [[9, 0.15], [15, 0.2]] },
  dusty: { k: [[0, 1], [2, 0.45], [9, 0.7]], s: [[4, 1], [12, 1]], g: [[7, 0.18], [13, 0.14]] },
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
  const keys = stereo(n), bass = stereo(n), drums = stereo(n), lead = stereo(n), jazz = o.style === "jazz";
  // 재즈 카페 스타일은 같은 뼈대에 어쿠스틱 피아노 컴핑·워킹 베이스·라이드/브러시 드럼을 쓴다
  const keyNote = jazz ? (bus, t, m, v, dur, p) => piano(bus, t, m, v * 0.8, p, dur + 0.15, rng) : epiano;
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
  let prevV = null, walkPrev = 40;
  const kickTimes = [];
  segs.forEach((s, si) => {
    const sec = secAt(s.b), v = voicing(s.root, s.q, prevV, o.center ?? 62);
    prevV = v;
    const style = sec.name === "A" ? o.comp : sec.name === "B" ? o.comp2 : "whole";
    for (const [hb, hl, hv] of COMP[style](s.L)) {
      const t = Math.max(start, T(s.b + hb)), strum = rng.range(0.008, 0.02);
      v.forEach((m, j) => keyNote(keys, t + j * strum + rng.range(0, 0.004), m, vel[sec.name] * hv * (j === v.length - 1 ? 0.62 : 0.5) * rng.range(0.92, 1.05), hl * beat, -0.25 + (0.5 * j) / (v.length - 1)));
    }
    if (o.bass === "walk" && (sec.name !== "intro" && !(sec.name === "outro" && sec.i >= 2))) {
      // 워킹 베이스: 1박 근음 → 화음음으로 걷다가 → 마지막 박은 다음 근음으로 반음 접근
      const next = segs[si + 1] ?? segs[0], tones = pcSet(s.root, LQ[s.q]);
      const near = (p0, ref) => {
        let m = inRange(p0, 33);
        while (m + 12 <= 50 && Math.abs(m + 12 - ref) < Math.abs(m - ref)) m += 12;
        return m;
      };
      for (let k = 0; k < s.L; k++) {
        let m;
        if (k === 0) m = near(s.root, walkPrev);
        else if (k === s.L - 1) {
          const tgt = near(next.root, walkPrev);
          m = tgt + (rng.chance(0.55) ? -1 : 1);
          if (m === walkPrev) m = 2 * tgt - m;
        } else {
          const tgt = near(next.root, walkPrev), dir = Math.sign(tgt - walkPrev) || (rng.chance(0.5) ? 1 : -1);
          let best = walkPrev + dir * 2, bc = Infinity;
          for (let x = Math.max(33, walkPrev - 5); x <= Math.min(50, walkPrev + 5); x++) {
            if (x === walkPrev || !tones.has(pc(x))) continue;
            const c = Math.abs(x - (walkPrev + dir * 3)) + rng.range(0, 1.2);
            if (c < bc) [best, bc] = [x, c];
          }
          m = best;
        }
        bassNote(bass, T(s.b + k), clamp(m, 31, 52), 0.4 * (k === 0 ? 1 : 0.82) * rng.range(0.92, 1.05), beat * 0.88, 2.4);
        walkPrev = clamp(m, 31, 52);
      }
    } else if (o.bass !== "walk" && (sec.name === "A" || sec.name === "B" || (sec.name === "outro" && sec.i < 2))) {
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
  voicing(keyPc, tonicQ, prevV, o.center ?? 62).forEach((m, j) => keyNote(keys, tEnd + j * 0.03, m, 0.45, 4.5, -0.25 + j * 0.17));
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
    else keyNote(lead, t, jazz ? m + 12 : m, v * 0.42, dur, 0.15);
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
      keyNote(lead, T(bar * 4 + 3), degMidi(lcx, d + 1) + (jazz ? 12 : 0), 0.24, beat * 0.45, 0.3);
      keyNote(lead, T(bar * 4 + 3.5), degMidi(lcx, d) + (jazz ? 12 : 0), 0.26, beat * 1.2, 0.3);
    }
  }

  // 드럼
  const ks = bank(rng, 3, kickS), ss = bank(rng, 3, o.snare === "rim" ? rimS : snareS), hs = bank(rng, 4, (r) => hatS(r, false)), ho = bank(rng, 2, (r) => hatS(r, true));
  const pat = DRUMP[o.drums], st = [0, sw / 2, sw, sw + (1 - sw) / 2];
  const stepT = (bar, s) => start + (bar * 4 + Math.floor(s / 4) + st[s % 4]) * beat;
  const sGain = o.snare === "rim" ? 0.3 : 0.42;
  const jk = jazz ? { ride: bank(rng, 4, rideS), brush: bank(rng, 3, brushS) } : null;
  for (let bar = 0; bar < pl.bars && jazz; bar++) {
    // 재즈 키트: 라이드 '칭-치기-칭', 2·4박 하이햇 페달과 브러시, 깃털처럼 가벼운 킥
    const sec = pl.secs[bar], full = sec.name === "A" || sec.name === "B", hum = () => rng.range(-0.005, 0.005);
    if (!(full || sec.name === "brk" || (sec.name === "outro" && sec.i < 2) || (sec.name === "intro" && sec.i === 3))) continue;
    const rv = full ? 1 : 0.6;
    if (o.kit === "bossa") {
      // 보사노바 키트: 8분 하이햇(셰이커처럼) + 2마디 림 클릭 패턴 + 1·3박을 받치는 킥
      for (let b = 0; b < 4; b += 0.5) place(drums, rng.pick(hs), T(bar * 4 + b) + hum(), (b % 1 ? 0.035 : 0.055) * rv * rng.range(0.85, 1.1), 0.3);
      if (!full) continue;
      for (const b of bar % 2 ? [1, 2.5] : [0, 1.5, 3]) place(drums, rng.pick(ss), T(bar * 4 + b) + hum(), 0.2 * rng.range(0.85, 1.05), -0.1);
      for (const [b, v] of [[0, 1], [1.5, 0.55], [2, 0.9], [3.5, 0.55]]) place(drums, rng.pick(ks), T(bar * 4 + b) + hum(), 0.17 * v * rng.range(0.9, 1.05), 0);
      continue;
    }
    for (const b of [0, 1, 1.5, 2, 3, 3.5]) {
      if (b % 1 && !rng.chance(0.85)) continue;
      place(drums, rng.pick(jk.ride), T(bar * 4 + b) + hum(), 0.15 * rv * (b === 1 || b === 3 ? 1 : 0.78) * rng.range(0.9, 1.05), 0.35);
    }
    for (const b of [1, 3]) place(drums, rng.pick(hs), T(bar * 4 + b) + hum(), 0.05 * rv, -0.25);
    if (!full) continue;
    for (const b of [1, 3]) place(drums, rng.pick(jk.brush), T(bar * 4 + b) - 0.012, 0.3 * rng.range(0.85, 1.05), 0.1);
    for (let b = 0; b < 4; b++) place(drums, rng.pick(ks), T(bar * 4 + b) + hum(), 0.14 * rng.range(0.85, 1.1), 0);
    if (rng.chance(0.35)) place(drums, rng.pick(ss), T(bar * 4 + rng.pick([1.5, 2.5, 3.5])), 0.09, 0.05);
  }
  for (let bar = 0; bar < pl.bars && !jazz; bar++) {
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
  if (jazz) {
    filt(keys, "lp", 5500, 0.7);
    filt(lead, "lp", 6500, 0.7);
  } else {
    for (const x of keys) svf(x, cs, 0.75, "lp");
    for (const x of lead) svf(x, cs.map((f) => Math.min(f * 1.4, 5000)), 0.7, "lp");
  }
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
  if (!jazz) autopan(keys, o.trem ?? 3.6, 0.09);
  saturate(keys, jazz ? 1.1 : 1.4);
  filt(bass, "lp", jazz ? 600 : 420, 0.7);
  saturate(bass, 1.2);
  filt(drums, "lp", 8000, 0.7);
  if (!jazz) saturate(drums, 1.5);
  reverb(drums, { room: jazz ? 0.6 : 0.45, damp: 0.6, wet: jazz ? 0.12 : 0.08, lowCut: 300 });
  gainBus(keys, 1.0);
  gainBus(bass, 0.95);
  gainBus(lead, 1.0);
  gainBus(drums, 1.25);
  stem("keys", keys);
  stem("bass", bass);
  stem("lead", lead);
  stem("drums", drums);
  const music = addBus(addBus(keys, bass), lead);
  reverb(music, { room: jazz ? 0.8 : 0.72, damp: 0.5, wet: jazz ? 0.16 : 0.13, width: 0.8, lowCut: 250 });
  if (jazz) return { bus: addBus(music, drums), master: { lp: 9000, hp: 30 } };
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

// opt(모두 생략 가능): key = 으뜸음 반음 이동, bpm, prog = [으뜸음 기준 근음, 보이싱], scale, endQ = 마지막 화음
function pianoPart(bus, rng, dur, opt = {}) {
  const key = opt.key ?? 0, beat = 60 / (opt.bpm ?? 52), bar = beat * 4, start = 2.5, bars = Math.floor((dur - start - 11) / bar);
  const prog = opt.prog ?? [[9, "m9"], [5, "M9"], [0, "M9"], [7, "69"]];
  const cx = { scale: SCALES[opt.scale ?? "majPent"], tonic: 72 + key, lo: -2, hi: 7 };
  const MR = [[[0, 1.5], [1.5, 0.5], [2, 2]], [[1, 1], [2, 2]], [[0.5, 0.5], [1, 1], [2, 1.5]], [[0, 1], [1, 1], [2, 2]]];
  const strong = (r) => Number.isInteger(r.pos);
  let prevV = null, motif = null, mdeg = null;
  for (let b = 0; b < bars; b++) {
    const [root, q] = prog[b % prog.length], rp = pc(root + key), t0 = start + b * bar, v = voicing(rp, q, prevV, 66), hold = bar + 0.5;
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
  piano(bus, tEnd, inRange(pc(key), 36), 0.4, -0.2, 9, rng);
  voicing(pc(key), opt.endQ ?? "M9", prevV, 66).forEach((m, k) => piano(bus, tEnd + 0.15 + k * 0.12, m, 0.26, 0.1, 9, rng));
  piano(bus, tEnd + 0.8, 79 + key, 0.24, 0.3, 9, rng);
}

// 젖은 길을 지나가는 차: 타이어 물보라(대역 잡음)가 한쪽에서 다가와 반대쪽으로 멀어진다
function carPass(bus, rng, t0, len, amp) {
  const [L, R] = bus, s0 = Math.round(t0 * SR), m = Math.min(Math.round(len * SR), L.length - s0);
  if (m <= 0) return;
  const hiss = biquad(biquad(pink(m, rng), "bp", rng.range(900, 1600), 0.5), "lp", 3200, 0.7);
  const rumble = biquad(brown(m, rng), "lp", 160, 0.7), dir = rng.chance(0.5) ? 1 : -1;
  for (let j = 0; j < m; j++) {
    const u = j / m, e = amp * Math.sin(Math.PI * u) ** 3, a = ((clamp(dir * (2 * u - 1) * 0.85, -1, 1) + 1) * Math.PI) / 4;
    const v = e * (hiss[j] + 0.6 * rumble[j]);
    L[s0 + j] += v * Math.cos(a) * Math.SQRT2;
    R[s0 + j] += v * Math.sin(a) * Math.SQRT2;
  }
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
      addBus(bus, rainBed(n, rng, { level: o.rainLv ?? 0.3, hp: 250, lp: 4600, width: 0.9, swell: 0.25, period: 9 }));
      addBus(bus, lowRain(0.18, 900));
      scatter(bus, rng, bank(rng, 48, stoneTick), 34, 0.02, 0.14, 0.95);
      stem("rain", bus);
      const th = stereo(n);
      const [g0, g1] = o.thunderGap ?? [24, 38];
      for (let t = rng.range(9, 14); t < dur - 16; t += rng.range(g0, g1)) thunder(th, rng, t, rng.range(0.17, 0.26));
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
      pianoPart(pno, rng, dur, o.piano);
      filt(pno, "lp", 3200, 0.7);
      reverb(pno, { room: 0.86, damp: 0.5, wet: 0.3, width: 0.9, pre: 0.03 });
      stem("piano", pno);
      addBus(bus, pno, 1.0);
      // 먼 천둥(선택): 다른 곡의 난수 순서를 바꾸지 않도록 맨 끝에서만 굴린다
      if (o.thunderGap) {
        const th = stereo(n), [g0, g1] = o.thunderGap;
        for (let t = rng.range(12, 18); t < dur - 16; t += rng.range(g0, g1)) thunder(th, rng, t, rng.range(0.1, 0.15));
        filt(th, "lp", 1800, 0.7);
        stem("thunder", th);
        addBus(bus, th, 0.8);
      }
      break;
    }
    case "crickets": {
      const w1 = wind(n, rng, { level: 0.9, lo: 180, hi: 650, q: 1.4, period: 7 }), w2 = wind(n, rng, { level: 0.35, lo: 600, hi: 1600, q: 2, period: 5 });
      addBus(bus, w1.bus);
      addBus(bus, w2.bus);
      stem("wind", bus);
      const cr = stereo(n);
      crickets(cr, rng, dur, o.count ?? 5, 0.05);
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
      scatter(fx, rng, bank(rng, 48, tinPing), o.density ?? 22, 0.02, 0.12, 0.9);
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
    case "street": {
      // 비 오는 출근길: 젖은 길을 지나가는 차 소리 + 우산 위 빗방울 + 먼 도시의 웅웅거림
      addBus(bus, rainBed(n, rng, { level: o.rainLv ?? 0.18, hp: 300, lp: 4200, width: 0.85, swell: 0.25, period: 8 }));
      addBus(bus, lowRain(0.12, 500));
      stem("rain", bus);
      const fx = stereo(n);
      scatter(fx, rng, bank(rng, 32, tinPing), o.umbrella ?? 9, 0.015, 0.07, 0.5); // 우산 천에 떨어지는 방울
      scatter(fx, rng, bank(rng, 16, (r) => plink(r, 700, 1500)), 0.5, 0.02, 0.06, 0.9);
      filt(fx, "lp", 3800, 0.7);
      const [g0, g1] = o.carGap ?? [7, 16];
      for (let t = rng.range(2, 6); t < dur - 8; t += rng.range(g0, g1)) carPass(fx, rng, t, rng.range(4, 7), rng.range(0.05, 0.1));
      stem("street", fx);
      addBus(bus, fx);
      const hum = rainBed(n, rng, { level: 0.05, hp: 40, lp: 220, width: 0.6, swell: 0.4, period: 12 });
      addBus(bus, hum);
      reverb(bus, { room: 0.7, damp: 0.55, wet: 0.12, lowCut: 140 });
      master = { lp: 6500, hp: 30 };
      break;
    }
    case "window":
    case "guitar": {
      // 창가 자리: 유리창 너머 빗소리 + 느린 화음(로즈 또는 뜯는 기타)
      addBus(bus, rainBed(n, rng, { level: o.rainLv ?? 0.15, hp: 280, lp: 4000, width: 0.85, swell: 0.25 }));
      addBus(bus, lowRain(0.06, 650));
      scatter(bus, rng, bank(rng, 24, (r) => plink(r, 1300, 3200)), 1.1, 0.015, 0.05, 0.85);
      filt(bus, "lp", 4600, 0.7);
      stem("rain", bus);
      const mu = stereo(n), beat = 60 / o.bpm, bar = beat * o.meter, start = 2, bars = Math.floor((dur - start - 10) / bar);
      let prevV = null;
      for (let b = 0; b < bars; b++) {
        const [root, q] = o.prog[b % o.prog.length], rp = pc(o.key + root), t0 = start + b * bar, u = b / bars;
        const vel = u < 0.12 ? 0.75 : u > 0.88 ? 0.8 : 1;
        if (o.kind === "window") {
          const v = voicing(rp, q, prevV, o.center ?? 62);
          prevV = v;
          v.forEach((m, j) => epiano(mu, t0 + j * rng.range(0.012, 0.024), m, 0.21 * vel * (j === v.length - 1 ? 1.2 : 1) * rng.range(0.92, 1.05), bar * 0.92, -0.3 + (0.6 * j) / (v.length - 1)));
          bassNote(mu, t0, inRange(rp, 34), 0.2 * vel, bar * 0.9, 1.4);
          if (u > 0.12 && u < 0.88 && rng.chance(0.55)) {
            const top = v.at(-1), m = top + rng.pick([2, 3, 5]);
            epiano(mu, t0 + beat * rng.pick([2, 2.5]), m, 0.16, beat * 1.2, 0.3);
            epiano(mu, t0 + beat * 3, top, 0.14, beat * 1.5, 0.3);
          }
        } else {
          // 핑거피킹: 엄지가 근음, 나머지 손가락이 화음음을 오르내린다
          const iv = TRI[q], r = inRange(rp, 40), T = [r, r + iv[2], r + 12, r + 12 + iv[1], r + 12 + iv[2]];
          const pat = o.meter === 3 ? [0, 2, 3, 4, 3, 2] : [0, 2, 3, 2, 4, 2, 3, 1];
          pat.forEach((k, s) => pluck(mu, t0 + s * (beat / 2) + rng.range(-0.006, 0.006), T[k], (s === 0 ? 0.32 : 0.22) * vel * rng.range(0.9, 1.06), -0.3 + 0.12 * k, beat, rng, 0.4, 2.6));
        }
      }
      const tEnd = start + bars * bar, rk = pc(o.key);
      if (o.kind === "window") voicing(rk, o.endQ ?? "M9", prevV, o.center ?? 62).forEach((m, j) => epiano(mu, tEnd + j * 0.03, m, 0.2, 5, -0.3 + 0.2 * j));
      else [0, 7, 12, 16, 19].forEach((iv, j) => pluck(mu, tEnd + j * 0.05, inRange(rk, 40) + iv - (o.endMinor && iv === 16 ? 1 : 0), 0.26, -0.3 + 0.15 * j, 4, rng, 0.35, 3));
      filt(mu, "lp", o.kind === "window" ? 2600 : 3600, 0.7);
      if (o.kind === "window") autopan(mu, 3.2, 0.08);
      reverb(mu, { room: 0.84, damp: 0.5, wet: 0.28, width: 0.9, pre: 0.025 });
      stem("music", mu);
      addBus(bus, mu, o.kind === "guitar" ? 2.2 : 1);
      master = { lp: 7000, hp: 30 };
      break;
    }
    case "rainpad": {
      // 장마철 오후: 고른 빗소리 위로 느리게 바뀌는 패드 화음
      addBus(bus, rainBed(n, rng, { level: o.rainLv ?? 0.17, hp: 260, lp: 4400, width: 0.9, swell: 0.3, period: 9 }));
      addBus(bus, lowRain(0.08, 700));
      scatter(bus, rng, bank(rng, 32, stoneTick), 8, 0.01, 0.06, 0.9);
      stem("rain", bus);
      const pad = stereo(n);
      for (let t = 1, k = 0; t < dur - 8; k++) {
        const d = rng.range(11, 15);
        o.chords[k % o.chords.length].forEach((m, j) => padNote(pad, t + j * 0.45, d, m, 0.045, (j - 1.5) * 0.3, 4, 6));
        t += d - 1.2;
      }
      filt(pad, "lp", 1900, 0.7);
      reverb(pad, { room: 0.9, damp: 0.5, wet: 0.35, width: 1 });
      stem("pad", pad);
      addBus(bus, pad);
      master = { lp: 7000, hp: 30 };
      break;
    }
    case "dream": {
      // 몽환 앰비언트: 느린 패드 화음 + 드문드문 반짝이는 종소리(또는 유리 같은 사인) + 옅은 공기
      const pad = stereo(n), sp = stereo(n), scale = SCALES[o.scale], cxs = { scale, tonic: o.tonic, lo: 0, hi: scale.length * 2 };
      for (let t = 0.5, k = 0; t < dur - 8; k++) {
        const d = rng.range(o.chordLen ?? 11, (o.chordLen ?? 11) + 4);
        o.chords[k % o.chords.length].forEach((m, j) => padNote(pad, t + j * 0.5, d, m, o.padAmp ?? 0.045, (j - 1.5) * 0.35, 4.5, 6.5));
        t += d - 1.5;
      }
      if (o.drone) for (let t = 0; t < dur; t += 20) padNote(pad, t, 26, o.drone, 0.04, 0, 8, 9);
      filt(pad, "lp", o.padLp ?? 2000, 0.7);
      let prev = 3;
      for (let t = rng.range(5, 8); t < dur - 10; t += rng.range(o.gap?.[0] ?? 1.8, o.gap?.[1] ?? 4.5)) {
        const deg = clamp(prev + rng.pick([-2, -1, 1, 2, 3]), 0, cxs.hi - 1), m = degMidi(cxs, deg), p = rng.range(-0.8, 0.8);
        prev = deg;
        if (o.sparkle === "glass") tone(sp, t, rng.range(1.5, 3), mtof(m), 0.05, p, 1.2, 3);
        else if (o.sparkle === "piano") piano(sp, t, m, 0.3, p, 4, rng);
        else if (o.sparkle === "vibes") vibes(sp, t, m, 0.26, p);
        else if (o.sparkle === "pluck") pluck(sp, t, m, 0.7, p, 3, rng, 0.35, 3.2);
        else if (o.sparkle === "musicbox") musicBox(sp, t, m, 0.2, p);
        else celesta(sp, t, m, 0.22, p);
      }
      filt(sp, "lp", 5000, 0.7);
      reverb(sp, { room: 0.92, damp: 0.4, wet: 0.5, width: 1, pre: 0.04 });
      stem("pad", pad);
      stem("sparkle", sp);
      addBus(bus, pad);
      addBus(bus, sp, o.sparkleGain ?? 1);
      addBus(bus, rainBed(n, rng, { level: o.air ?? 0.03, hp: 150, lp: 1500, width: 0.9, swell: 0.4, period: 10 }));
      reverb(bus, { room: 0.9, damp: 0.5, wet: 0.35, width: 1, pre: 0.03, lowCut: 100 });
      master = { lp: 7500, hp: 30 };
      break;
    }
    case "fog": {
      const pad = stereo(n), root = o.root ?? 38;
      for (let t = 0; t < dur; t += 22) {
        padNote(pad, t, 28, root, 0.055, -0.2, 8, 10);
        padNote(pad, t + 3, 26, root + 7, 0.04, 0.2, 9, 10);
        padNote(pad, t + 6, 24, root + 12, 0.03, 0, 9, 10);
      }
      const pool = o.pool ?? [62, 64, 69, 71, 74, 76, 81];
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

// ───────────────────────── 효과음 ─────────────────────────
const SFX_LUFS = -15.65; // 인코딩 후 약 -16 LUFS
const SFX_CEIL = 10 ** (-2.5 / 20);
function sfx(o) {
  const rng = new Rng(o.seed), n = Math.round(o.dur * SR), bus = stereo(n), [L, R] = bus;
  const master = { hp: 60, lp: 11000, fadeIn: 0.003, fadeOut: 0.1 };
  if (o.kind === "launch") {
    // '퉁' 하고 쏘아 올린 뒤 휘이익 올라가는 휘파람 + 바람결
    const th = biquad(brown(Math.round(0.14 * SR), rng), "lp", 260, 0.7);
    normPeak(th);
    for (let i = 0; i < th.length; i++) th[i] *= Math.exp((-i / SR) * 28);
    place(bus, th, 0, 0.45, 0);
    partial(bus, 0.004, 92, 0.35, 24, 0, 0.002);
    const air = white(n, rng), fc = new Float32Array(n), envA = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, u = clamp((t - 0.06) / 1.0, 0, 1), f = 650 * (2300 / 650) ** (u ** 0.85) * (1 + 0.006 * Math.sin(TAU * 9 * t));
      const env = clamp((t - 0.05) / 0.12, 0, 1) * clamp((1.17 - t) / 0.28, 0, 1) * (0.65 + 0.35 * u);
      ph += (TAU * f) / SR;
      const [gl, gr] = panGains(-0.25 + 0.5 * u), v = env * 0.2 * Math.sin(ph);
      L[i] += v * gl;
      R[i] += v * gr;
      fc[i] = f;
      envA[i] = env;
    }
    svf(air, fc, 5, "bp");
    for (let i = 0; i < n; i++) {
      L[i] += air[i] * envA[i] * 0.35;
      R[i] += air[i] * envA[i] * 0.35;
    }
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.14 });
    master.fadeOut = 0.12;
  } else if (o.kind === "burst") {
    // 낮은 '펑' + 짧은 파열 + 지지직 흩어지는 불꽃
    const boom = biquad(biquad(brown(n, rng), "lp", 170, 0.7), "lp", 170, 0.7);
    normPeak(boom);
    for (let i = 0; i < n; i++) {
      const t = i / SR, e = Math.min(1, t / 0.015) * Math.exp(-t * 4.5);
      L[i] += boom[i] * e * 0.3;
      R[i] += boom[i] * e * 0.27;
    }
    partial(bus, 0, 62, 0.22, 7, 0, 0.015);
    const cr = biquad(white(Math.round(0.15 * SR), rng), "bp", 1100, 0.7);
    for (let i = 0; i < cr.length; i++) cr[i] *= Math.min(1, i / 200) * Math.exp((-i / SR) * 30);
    place(bus, normPeak(cr), 0, 0.18, 0);
    const ticks = bank(rng, 24, (r) => {
      const x = new Float32Array(r.int(40, 140));
      for (let i = 0; i < x.length; i++) x[i] = r.bi() * Math.exp(-i / (x.length / 4));
      return normPeak(biquad(x, "bp", r.range(2500, 6000), 1.2));
    });
    for (let k = 0; k < 650; k++) {
      const t = 0.18 + 1.65 * rng.next() ** 1.25, a = 0.15 * (1 - (t - 0.18) / 1.75) ** 1.3 * (0.3 + 0.7 * rng.next());
      place(bus, rng.pick(ticks), t, a, rng.range(-0.85, 0.85));
    }
    for (let k = 0; k < 22; k++) {
      const t = 0.2 + 1.3 * rng.next() ** 1.5;
      partial(bus, t, rng.range(3000, 5200), 0.05 * (1 - (t - 0.2) / 1.4), 45, rng.range(-0.8, 0.8), 0.001);
    }
    reverb(bus, { room: 0.75, damp: 0.5, wet: 0.25, lowCut: 120 });
    master.fadeOut = 0.4;
    master.lp = 10000;
  } else if (o.kind === "coin") {
    // 짤랑: 두 음(B5→E6) 금속 핑 + 작은 동전 부딪는 소리
    const ping = (t, f, v, p) => {
      partial(bus, t, f, v, 9, p, 0.001, 0.5);
      partial(bus, t, f * 2.76, v * 0.3, 16, p, 0.001, 0.5);
      partial(bus, t, f * 5.4, v * 0.12, 30, p, 0.001, 0.5);
    };
    ping(0, 988, 0.5, -0.1);
    ping(0.07, 1319, 0.55, 0.1);
    for (let k = 0; k < 3; k++) ping(0.03 + k * 0.035 + rng.range(0, 0.01), rng.range(2200, 3400), 0.07, rng.range(-0.5, 0.5));
    reverb(bus, { room: 0.5, damp: 0.5, wet: 0.1 });
    master.fadeOut = 0.08;
  } else if (o.kind === "flower") {
    // 헌화: 맑은 종소리 아르페지오(C6 E6 G6 C7)
    [84, 88, 91, 96].forEach((m, k) => {
      const f = mtof(m), t = 0.005 + k * 0.075, p = -0.3 + 0.2 * k;
      partial(bus, t, f, 0.4 - k * 0.05, 3.5, p, 0.002, 1);
      partial(bus, t, f * 2, 0.07, 7, p, 0.002, 1);
      partial(bus, t, f * 3.01, 0.03, 12, p, 0.002, 1);
    });
    reverb(bus, { room: 0.8, damp: 0.45, wet: 0.3 });
    master.fadeOut = 0.25;
  } else Object.assign(master, SFX2[o.kind](bus, rng, n));
  return { bus, master };
}

// 짧은 소음 조각(필터·감쇠 적용)
function noiseHit(rng, sec, type, f, q, decay, atk = 0.001) {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) x[i] = rng.bi() * Math.min(1, i / (atk * SR + 1)) * Math.exp((-i / SR) * decay);
  return normPeak(biquad(x, type, f, q));
}
// 음높이가 미끄러지는 음(펄스/사인). f(t)는 Hz를 돌려준다
function glide(bus, t0, sec, fOf, amp, p, { duty = 0, atk = 0.005, rel = 0.05 } = {}) {
  const [L, R] = bus, s0 = Math.round(t0 * SR), len = Math.min(L.length - s0, Math.round(sec * SR)), [gl, gr] = panGains(p);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    ph += fOf(t) / SR;
    const y = duty ? ((ph % 1) < duty ? 1 : -1) - (2 * duty - 1) : Math.sin(TAU * ph);
    const e = amp * Math.min(1, t / atk) * Math.min(1, (sec - t) / rel);
    L[s0 + i] += y * e * gl;
    R[s0 + i] += y * e * gr;
  }
}
const notes = (bus, list, fn) => list.forEach(([t, m, v, d, p = 0]) => fn(bus, t, m, v, d, p));
const chipNote = (bus, t, m, v, d, p) => pulse(bus, t, m, v * 0.35, p, d, 0.25, { dec: 0.15, sus: 0.6 });
const bellNote = (bus, t, m, v, d, p) => {
  const f = mtof(m);
  partial(bus, t, f, v, 3.2, p, 0.002, d + 1);
  partial(bus, t, f * 2.01, v * 0.25, 6, p, 0.002, d + 1);
  partial(bus, t, f * 3.98, v * 0.08, 12, p, 0.002, d + 1);
};
const SFX2 = {
  bell: (bus, rng) => {
    templeBell(bus, 0.01, 118, 0.5, 0);
    reverb(bus, { room: 0.9, damp: 0.5, wet: 0.35, width: 1, lowCut: 80 });
    return { fadeOut: 0.8, hp: 40, lp: 6000 };
  },
  splash: (bus, rng, n) => {
    place(bus, noiseHit(rng, 0.5, "bp", 1400, 0.6, 9, 0.025), 0, 0.5, 0);
    place(bus, noiseHit(rng, 0.25, "lp", 400, 0.7, 14, 0.02), 0.03, 0.2, 0);
    for (let k = 0; k < 14; k++) place(bus, plink(rng, 700, 2200), 0.12 + rng.next() ** 1.5 * 0.7, rng.range(0.02, 0.06), rng.range(-0.7, 0.7));
    reverb(bus, { room: 0.5, damp: 0.5, wet: 0.12 });
    return { fadeOut: 0.2, target: -16.5 };
  },
  swim: (bus, rng) => {
    // 1.6초 루프: 물장구 4번(끝을 이어 붙여도 튀지 않게 양끝은 조용하다)
    for (let k = 0; k < 4; k++) {
      const t = 0.05 + k * 0.4;
      place(bus, noiseHit(rng, 0.28, "bp", rng.range(900, 1400), 0.7, 14, 0.04), t, 0.4, k % 2 ? 0.3 : -0.3);
      for (let j = 0; j < 3; j++) place(bus, plink(rng, 600, 1600), t + rng.range(0.03, 0.2), 0.06, rng.range(-0.6, 0.6));
    }
    return { fadeIn: 0.01, fadeOut: 0.02 };
  },
  bubble: (bus, rng) => {
    const b = stereo(bus[0].length);
    for (let k = 0; k < 16; k++) place(b, plink(rng, 250, 900), 0.05 + rng.next() * 1.0, rng.range(0.15, 0.4), rng.range(-0.6, 0.6));
    place(b, noiseHit(rng, 0.8, "lp", 300, 0.7, 4, 0.08), 0, 0.3, 0);
    filt(b, "lp", 1800, 0.7);
    addBus(bus, reverb(b, { room: 0.7, damp: 0.7, wet: 0.3 }));
    return { fadeOut: 0.2, lp: 4000 };
  },
  swing: (bus, rng) => {
    // 삐걱: 마찰(stick-slip) 펄스열이 나무 공명을 두드린다 — 앞으로, 뒤로 두 번
    for (const [t0, sec, rate0, rate1] of [[0.02, 0.55, 38, 62], [0.75, 0.6, 58, 34]]) {
      const x = new Float32Array(Math.round(sec * SR));
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const u = i / x.length;
        ph += (rate0 + (rate1 - rate0) * u) * (1 + 0.15 * rng.bi()) / SR;
        if (ph >= 1) {
          ph -= 1;
          x[i] = rng.range(0.6, 1);
        }
      }
      const y = addBus([Float32Array.from(x), Float32Array.from(x)], [biquad(Float32Array.from(x), "bp", 1250, 12), biquad(Float32Array.from(x), "bp", 1250, 12)]);
      for (const c of y) {
        biquad(c, "bp", 640, 8);
        for (let i = 0; i < c.length; i++) c[i] *= Math.sin((Math.PI * i) / c.length);
      }
      place(bus, normPeak(y[0]), t0, 0.5, -0.2);
    }
    reverb(bus, { room: 0.4, damp: 0.6, wet: 0.08 });
    return { fadeOut: 0.1, target: -17.5 };
  },
  wave: (bus) => {
    // 짧은 휘파람 '휘-익'
    glide(bus, 0.02, 0.28, (t) => 1300 + 500 * (t / 0.28) + 15 * Math.sin(TAU * 6 * t), 0.3, 0, { atk: 0.03, rel: 0.05 });
    glide(bus, 0.34, 0.4, (t) => 1900 - 700 * (t / 0.4) ** 1.5 + 20 * Math.sin(TAU * 6 * t), 0.3, 0, { atk: 0.02, rel: 0.12 });
    reverb(bus, { room: 0.5, damp: 0.5, wet: 0.12 });
    return { fadeOut: 0.05 };
  },
  cheer: (bus, rng) => {
    // 작은 무리의 환호: 모음 포먼트를 지난 목소리들 + 박수
    for (let v = 0; v < 12; v++) {
      const f0 = rng.range(170, 330), t0 = rng.range(0, 0.25), sec = rng.range(1.0, 1.6), x = new Float32Array(Math.round(sec * SR));
      let ph = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / SR;
        ph += f0 * (1 + 0.25 * Math.sin(Math.min(1, t / 0.2) * Math.PI) - 0.15 * (t / sec) + 0.01 * Math.sin(TAU * 5 * t)) / SR;
        x[i] = ((ph % 1) * 2 - 1) * Math.min(1, t / 0.06) * Math.min(1, (sec - t) / 0.4);
      }
      const a = biquad(Float32Array.from(x), "bp", rng.range(650, 800), 4), b = biquad(Float32Array.from(x), "bp", rng.range(1100, 1300), 5);
      for (let i = 0; i < x.length; i++) a[i] += 0.6 * b[i];
      place(bus, normPeak(a), t0, 0.12, rng.range(-0.8, 0.8));
    }
    for (let k = 0; k < 60; k++) place(bus, noiseHit(rng, 0.04, "bp", rng.range(1200, 2200), 1, 90), 0.1 + rng.next() * 1.7, rng.range(0.05, 0.14), rng.range(-0.9, 0.9));
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.18 });
    return { fadeOut: 0.5 };
  },
  hit: (bus, rng) => {
    // 16번 타격: 짧은 딸깍(어택) + 퍽(낮은 몸통) + 톡(나무 같은 중음) — 빨리 반복해도 귀가 안 아프게 짧게
    place(bus, noiseHit(rng, 0.012, "hp", 3500, 0.7, 300), 0, 0.35, 0);
    glide(bus, 0, 0.11, (t) => 175 * Math.exp(-t * 22) + 58, 0.75, 0, { atk: 0.0008, rel: 0.05 });
    place(bus, noiseHit(rng, 0.07, "bp", 1900, 0.9, 60), 0.002, 0.42, 0);
    partial(bus, 0.003, 820, 0.18, 45, 0, 0.0008, 0.15);
    return { fadeOut: 0.04 };
  },
  crit: (bus, rng) => {
    // 치명타: 더 깊은 쿵 + 갈라지는 소리 + 쇳소리 울림 + 위로 솟는 반짝 꼬리
    place(bus, noiseHit(rng, 0.015, "hp", 3000, 0.7, 250), 0, 0.45, 0);
    glide(bus, 0, 0.2, (t) => 210 * Math.exp(-t * 15) + 45, 0.85, 0, { atk: 0.0008, rel: 0.08 });
    place(bus, noiseHit(rng, 0.14, "bp", 2600, 0.6, 26), 0.004, 0.5, 0);
    [1760, 2640, 3520, 4400].forEach((f, k) => partial(bus, 0.012, f, 0.13 / (k + 1), 8 + k * 2, (k - 1.5) * 0.3, 0.001, 0.5));
    glide(bus, 0.03, 0.28, (t) => 1100 + 3000 * (t / 0.28) ** 0.7, 0.05, 0, { duty: 0.5, rel: 0.12 });
    reverb(bus, { room: 0.5, damp: 0.5, wet: 0.12 });
    return { fadeOut: 0.1 };
  },
  "monster-die": (bus, rng) => {
    glide(bus, 0, 0.55, (t) => 620 * Math.exp(-t * 4.5) + 70, 0.35, 0, { duty: 0.25, rel: 0.1 });
    const poof = noiseHit(rng, 0.7, "lp", 1200, 0.7, 6, 0.04);
    place(bus, poof, 0.15, 0.35, 0);
    reverb(bus, { room: 0.55, damp: 0.5, wet: 0.15 });
    return { fadeOut: 0.15 };
  },
  levelup: (bus, rng) => {
    // 레벨 업: 위로 오르는 아르페지오 → 밝은 화음 + 종 + 반짝이 비
    notes(bus, [[0, 67, 0.55, 0.09], [0.08, 72, 0.55, 0.09], [0.16, 76, 0.6, 0.09], [0.24, 79, 0.6, 0.09], [0.34, 84, 0.75, 0.6]], chipNote);
    notes(bus, [[0.34, 76, 0.35, 0.6, -0.35], [0.34, 79, 0.35, 0.6, 0.35]], (b, t, m, v, d, p) => pulse(b, t, m, v * 0.3, p, d, 0.125, { dec: 0.2, sus: 0.5 }));
    notes(bus, [[0.34, 88, 0.3, 0.7, 0.4], [0.37, 91, 0.25, 0.7, -0.4], [0.42, 96, 0.18, 0.7, 0]], bellNote);
    [[0, 48, 0.3], [0.34, 48, 0.6]].forEach(([t, m, d]) => tri(bus, t, m, 0.28, d));
    for (let k = 0; k < 14; k++) partial(bus, 0.38 + k * 0.045, rng.range(3000, 5600), 0.05, 25, rng.range(-0.8, 0.8), 0.001);
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.16 });
    return { fadeOut: 0.25 };
  },
  potion: (bus, rng) => {
    for (const [t, lo] of [[0, 260], [0.13, 320], [0.26, 380]]) place(bus, plink(rng, lo, lo + 60), t, 0.5, 0);
    notes(bus, [[0.42, 84, 0.25, 0.3, -0.2], [0.48, 91, 0.2, 0.3, 0.2]], bellNote);
    return { fadeOut: 0.15 };
  },
  skill: (bus, rng) => {
    const n = bus[0].length, x = white(n, rng), fc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      fc[i] = 500 * 8 ** u;
      x[i] *= Math.sin(Math.PI * u) ** 1.5;
    }
    svf(x, fc, 4, "bp");
    place(bus, x, 0, 0.5, 0);
    [76, 83, 88].forEach((m, k) => tone(bus, 0.1 + k * 0.05, 0.35, mtof(m) * (1 + 0.003 * k), 0.06, (k - 1) * 0.5, 0.08, 0.25));
    reverb(bus, { room: 0.7, damp: 0.4, wet: 0.25 });
    return { fadeOut: 0.15 };
  },
  "coin-drop": (bus, rng) => {
    // 떨어진 동전이 통통 튀다 멈춘다: 간격과 세기가 점점 줄어든다
    let t = 0.01, gap = 0.18, a = 0.45;
    while (t < 0.7 && a > 0.03) {
      const f = rng.range(2400, 2700);
      partial(bus, t, f, a, 22, 0.1, 0.001, 0.4);
      partial(bus, t, f * 1.52, a * 0.4, 30, 0.1, 0.001, 0.4);
      t += gap;
      gap *= 0.72;
      a *= 0.72;
    }
    return { fadeOut: 0.05 };
  },
  defeat: (bus) => {
    notes(bus, [[0, 67, 0.6, 0.3], [0.32, 66, 0.6, 0.3], [0.64, 65, 0.6, 0.3], [0.96, 64, 0.7, 0.6]], chipNote);
    [[0, 43, 0.3], [0.64, 41, 0.3], [0.96, 40, 0.6]].forEach(([t, m, d]) => tri(bus, t, m, 0.3, d));
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.15 });
    return { fadeOut: 0.2 };
  },
  victory: (bus) => {
    notes(bus, [[0, 67, 0.55, 0.1], [0.12, 72, 0.55, 0.1], [0.24, 76, 0.55, 0.1], [0.36, 79, 0.6, 0.18], [0.6, 76, 0.55, 0.12], [0.75, 84, 0.7, 0.6]], chipNote);
    notes(bus, [[0.75, 79, 0.35, 0.6, -0.4], [0.75, 76, 0.3, 0.6, 0.4]], (b, t, m, v, d, p) => pulse(b, t, m, v * 0.3, p, d, 0.125, { dec: 0.2, sus: 0.5 }));
    [[0, 48, 0.3], [0.36, 43, 0.3], [0.75, 48, 0.6]].forEach(([t, m, d]) => tri(bus, t, m, 0.3, d));
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.15 });
    return { fadeOut: 0.2 };
  },
  tick: (bus, rng) => {
    // 나무 블록 '똑'
    partial(bus, 0, 1900, 0.5, 70, 0, 0.0005);
    partial(bus, 0, 2950, 0.2, 90, 0, 0.0005);
    place(bus, noiseHit(rng, 0.01, "hp", 3000, 0.7, 400), 0, 0.15, 0);
    return { fadeIn: 0.0005, fadeOut: 0.02, target: -21 };
  },
  campfire: (bus, rng, n) => {
    // 모닥불 루프: 낮은 웅웅(불길) + 쉭쉭 + 탁탁 튀는 장작. 꼬리를 머리에 겹쳐 이음새 없이 돈다
    const X = 2 * SR, m = n + X, t = stereo(m);
    for (let c = 0; c < 2; c++) {
      const lo = biquad(biquad(brown(m, rng), "lp", 180, 0.7), "hp", 35, 0.7), hi = biquad(biquad(pink(m, rng), "bp", 1600, 0.5), "lp", 4000, 0.7);
      const g1 = smoothNoise(m, rng, 1.7), g2 = smoothNoise(m, rng, 0.35);
      for (let i = 0; i < m; i++) t[c][i] = lo[i] * 0.5 * (0.6 + 0.4 * g1[i]) + hi[i] * 0.05 * (0.4 + 0.6 * g2[i] ** 2);
    }
    const ticks = bank(rng, 32, (r) => normPeak(noiseHit(r, r.range(0.004, 0.02), "bp", r.range(1500, 5000), 1.5, r.range(150, 400))));
    const pops = bank(rng, 8, (r) => {
      const x = noiseHit(r, 0.06, "bp", r.range(700, 1400), 2, 60);
      const f = r.range(250, 450);
      for (let i = 0; i < x.length; i++) x[i] += 0.5 * Math.sin((TAU * f * i) / SR) * Math.exp((-i / SR) * 50);
      return normPeak(x);
    });
    scatter(t, rng, ticks, 9, 0.05, 0.35, 0.7);
    scatter(t, rng, pops, 0.6, 0.15, 0.4, 0.5);
    reverb(t, { room: 0.35, damp: 0.6, wet: 0.08 });
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < n; i++) {
        const u = i / X;
        bus[c][i] = i < X ? t[c][i] * Math.sqrt(u) + t[c][n + i] * Math.sqrt(1 - u) : t[c][i];
      }
    return { fadeIn: 0, fadeOut: 0, hp: 20, lp: 9000, target: -19.65 };
  },
  "rain-loop": (bus, rng, n) => {
    // 날씨 '비' 루프: 넓은 빗줄기 + 낮게 깔리는 쏴아 + 돌·지붕에 톡톡 + 가끔 웅덩이 방울. 꼬리를 머리에 겹쳐 이음새 없이 돈다
    const X = 2 * SR, m = n + X;
    const t = rainBed(m, rng, { level: 0.3, hp: 300, lp: 4800, width: 0.85, swell: 0.18, period: 6 });
    addBus(t, rainBed(m, rng, { level: 0.16, hp: 70, lp: 800, width: 0.5, swell: 0.25, period: 9 }));
    scatter(t, rng, bank(rng, 40, stoneTick), 22, 0.02, 0.12, 0.95);
    scatter(t, rng, bank(rng, 16, (r) => plink(r)), 0.8, 0.02, 0.07, 0.7);
    reverb(t, { room: 0.5, damp: 0.55, wet: 0.08 });
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < n; i++) {
        const u = i / X;
        bus[c][i] = i < X ? t[c][i] * Math.sqrt(u) + t[c][n + i] * Math.sqrt(1 - u) : t[c][i];
      }
    return { fadeIn: 0, fadeOut: 0, hp: 30, lp: 8000, target: -21 };
  },
  thunder: (bus, rng) => {
    // 가까운 천둥 한 번: 찢어지는 크랙 몇 번 + 낮은 쿵 + 길게 구르는 우르릉 (게임 날씨용)
    let at = 0.02;
    for (let k = 0; k < 5; k++) {
      place(bus, noiseHit(rng, rng.range(0.15, 0.4), "bp", rng.range(600, 1800), 0.6, rng.range(8, 18), 0.002), at, 0.42 * (1 - k * 0.13), rng.range(-0.4, 0.4));
      at += rng.range(0.04, 0.12);
    }
    const boom = biquad(biquad(brown(Math.round(3.2 * SR), rng), "lp", 140, 0.7), "lp", 140, 0.7);
    normPeak(boom);
    for (let i = 0; i < boom.length; i++) boom[i] *= Math.min(1, i / (0.03 * SR)) * Math.exp((-i / SR) * 1.1);
    place(bus, boom, 0.03, 0.7, 0);
    thunder(bus, rng, 0.2, 0.42);
    reverb(bus, { room: 0.85, damp: 0.6, wet: 0.2, lowCut: 60 });
    return { fadeIn: 0.001, fadeOut: 1.5, hp: 25, lp: 7000, target: -17 };
  },
  say: (bus) => {
    // 말풍선 '뿅': 짧게 솟는 사인
    glide(bus, 0, 0.12, (t) => 520 + 900 * (1 - Math.exp(-t * 35)), 0.5, 0, { atk: 0.003, rel: 0.07 });
    return { fadeOut: 0.02, target: -21 };
  },
  miss: (bus, rng, n) => {
    // 헛손질: 바람 가르는 '휙' (위로 쓸리는 대역 잡음) + 아주 작은 내림 음
    const x = white(n, rng), fc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      fc[i] = 500 * 5 ** Math.min(1, u * 1.6);
      x[i] *= Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 2;
    }
    svf(x, fc, 3, "bp");
    place(bus, x, 0, 0.55, 0);
    glide(bus, 0.05, 0.14, (t) => 520 - 900 * t, 0.06, 0, { duty: 0.5, rel: 0.06 });
    return { fadeOut: 0.06, target: -18 };
  },
  // ── 50번 조각배·광장 놀거리 ──
  row: (bus, rng) => {
    // 노 한 번 젓기: 노가 물을 가르는 '쏴아' (부풀었다 잦아드는 대역 잡음) + 노를 빼며 '찰방' + 물방울
    const n = Math.round(0.55 * SR), x = white(n, rng), fc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      fc[i] = 700 + 900 * Math.sin(Math.PI * u);
      x[i] *= Math.sin(Math.PI * u) ** 1.6;
    }
    svf(x, fc, 1.6, "bp");
    place(bus, normPeak(x), 0.02, 0.32, -0.15);
    place(bus, noiseHit(rng, 0.18, "bp", 1100, 0.8, 22, 0.01), 0.5, 0.22, 0.2);
    for (let k = 0; k < 5; k++) place(bus, plink(rng, 600, 1500), 0.55 + rng.next() * 0.3, rng.range(0.03, 0.07), rng.range(-0.6, 0.6));
    reverb(bus, { room: 0.5, damp: 0.6, wet: 0.12 });
    return { fadeOut: 0.12, target: -18 };
  },
  "boat-board": (bus, rng) => {
    // 배에 오르내릴 때: 나무 배가 '쿵' + 출렁이는 물 + 삐걱
    glide(bus, 0.01, 0.16, (t) => 150 * Math.exp(-t * 9) + 70, 0.55, 0, { atk: 0.002, rel: 0.08 });
    place(bus, noiseHit(rng, 0.09, "bp", 700, 1.2, 40), 0.01, 0.35, 0);
    place(bus, noiseHit(rng, 0.45, "bp", 900, 0.6, 7, 0.06), 0.08, 0.25, 0.1);
    for (let k = 0; k < 4; k++) place(bus, plink(rng, 500, 1200), 0.18 + rng.next() * 0.35, rng.range(0.03, 0.06), rng.range(-0.5, 0.5));
    reverb(bus, { room: 0.45, damp: 0.6, wet: 0.1 });
    return { fadeOut: 0.12 };
  },
  seesaw: (bus, rng) => {
    // 시소 끝이 땅에 '통' + 받침이 '끼익'
    glide(bus, 0, 0.14, (t) => 120 * Math.exp(-t * 12) + 60, 0.6, 0, { atk: 0.002, rel: 0.07 });
    place(bus, noiseHit(rng, 0.06, "lp", 900, 0.8, 45), 0, 0.3, 0);
    const sq = new Float32Array(Math.round(0.3 * SR));
    let ph = 0;
    for (let i = 0; i < sq.length; i++) {
      ph += (34 + 18 * (i / sq.length)) * (1 + 0.2 * rng.bi()) / SR;
      if (ph >= 1) {
        ph -= 1;
        sq[i] = rng.range(0.6, 1);
      }
    }
    biquad(sq, "bp", 1400, 10);
    for (let i = 0; i < sq.length; i++) sq[i] *= Math.sin((Math.PI * i) / sq.length);
    place(bus, normPeak(sq), 0.08, 0.18, 0.25);
    return { fadeOut: 0.08, target: -18 };
  },
  boing: (bus, rng) => {
    // 트램펄린 '보잉': 낮게 눌렸다 튀어 오르는 떨리는 음 + 매트 '퉁'
    glide(bus, 0, 0.5, (t) => (180 + 260 * (1 - Math.exp(-t * 9))) * (1 + 0.06 * Math.sin(TAU * 22 * t) * Math.exp(-t * 5)), 0.45, 0, { atk: 0.004, rel: 0.2 });
    glide(bus, 0, 0.12, (t) => 90 * Math.exp(-t * 10) + 50, 0.5, 0, { atk: 0.002, rel: 0.06 });
    place(bus, noiseHit(rng, 0.05, "lp", 600, 0.8, 50), 0, 0.2, 0);
    return { fadeOut: 0.1, target: -18 };
  },
  wish: (bus, rng) => {
    // 소원 분수: 동전 '팅' → 물에 '퐁당' → 맑은 종소리 셋
    const ping = (t, f, v) => {
      partial(bus, t, f, v, 10, 0, 0.001, 0.6);
      partial(bus, t, f * 2.76, v * 0.3, 18, 0, 0.001, 0.6);
    };
    ping(0.01, 1568, 0.4);
    ping(0.06, 2093, 0.3);
    glide(bus, 0.42, 0.12, (t) => 380 + 900 * (t / 0.12), 0.35, 0, { atk: 0.002, rel: 0.05 });
    place(bus, noiseHit(rng, 0.2, "bp", 1200, 0.8, 18, 0.005), 0.42, 0.2, 0);
    for (let k = 0; k < 4; k++) place(bus, plink(rng, 700, 1700), 0.5 + rng.next() * 0.25, rng.range(0.03, 0.06), rng.range(-0.5, 0.5));
    [79, 83, 86].forEach((m, k) => {
      const f = mtof(m);
      partial(bus, 0.62 + k * 0.11, f, 0.22, 3.2, -0.3 + 0.3 * k, 0.002, 1);
      partial(bus, 0.62 + k * 0.11, f * 2, 0.04, 7, -0.3 + 0.3 * k, 0.002, 1);
    });
    reverb(bus, { room: 0.75, damp: 0.45, wet: 0.25 });
    return { fadeOut: 0.3 };
  },
  "carousel-loop": (bus) => {
    // 회전목마 오르골: 3박 왈츠 8마디(0.4초 박) — 끝을 이어 붙여 돈다. 마지막 마디는 가볍게 끝내 이음새가 덜 들린다
    const beat = 0.4;
    const mel = [
      [76, 1], [79, 1], [84, 1], [83, 2], [79, 1], [81, 1], [79, 1], [76, 1], [74, 3],
      [77, 1], [81, 1], [84, 1], [83, 2], [81, 1], [79, 1], [77, 1], [74, 1], [72, 3],
    ];
    let t = 0.01;
    for (const [m, d] of mel) {
      musicBox(bus, t, m, 0.32, 0.1);
      t += d * beat;
    }
    // 반주: 마디 첫 박 베이스 + 둘째·셋째 박 화음 (C G7 C F | F C G7 C)
    const chords = [[48, 64, 67], [43, 62, 65], [48, 64, 67], [41, 65, 69], [41, 65, 69], [48, 64, 67], [43, 62, 65], [48, 64, 67]];
    chords.forEach(([b, x, y], k) => {
      const t0 = 0.01 + k * 3 * beat;
      musicBox(bus, t0, b + 12, 0.22, -0.2);
      for (const j of [1, 2]) {
        musicBox(bus, t0 + j * beat, x, 0.12, -0.25);
        musicBox(bus, t0 + j * beat, y, 0.1, 0.25);
      }
    });
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.18 });
    return { fadeIn: 0.005, fadeOut: 0.06, lp: 7000 };
  },
  // ── 사냥 손맛 (40번 무기마다 소리 · 2번 경고·보스 · 16번 처치) ──
  kill: (bus, rng) => {
    // 처치: '퐁' 터지는 소리 + 내려가는 짧은 삑 + 동전 두 알 짤랑
    place(bus, noiseHit(rng, 0.25, "lp", 1400, 0.7, 22, 0.002), 0, 0.5, 0);
    glide(bus, 0, 0.16, (t) => 260 * Math.exp(-t * 18) + 70, 0.55, 0, { atk: 0.001, rel: 0.06 });
    glide(bus, 0.02, 0.18, (t) => 1500 - 4500 * t, 0.07, 0, { duty: 0.25, rel: 0.05 });
    [[0.16, 1568, -0.2], [0.23, 2093, 0.2]].forEach(([t, f, p]) => {
      partial(bus, t, f, 0.22, 14, p, 0.001, 0.4);
      partial(bus, t, f * 2.76, 0.06, 26, p, 0.001, 0.3);
    });
    reverb(bus, { room: 0.45, damp: 0.5, wet: 0.1 });
    return { fadeOut: 0.08 };
  },
  swish: (bus, rng, n) => {
    // 휘두르기: 짧게 쓸리는 바람 소리
    const x = white(n, rng), fc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      fc[i] = 800 * 4.5 ** Math.min(1, u * 1.8);
      x[i] *= Math.sin(Math.PI * Math.min(1, u * 1.6)) ** 1.5;
    }
    svf(x, fc, 2.5, "bp");
    place(bus, x, 0, 0.6, 0);
    return { fadeOut: 0.03, target: -18 };
  },
  thud: (bus, rng) => {
    // 내려찍기: 무거운 쿵 + 나무 울림 + 흙먼지
    glide(bus, 0, 0.28, (t) => 130 * Math.exp(-t * 10) + 38, 0.9, 0, { atk: 0.001, rel: 0.1 });
    place(bus, noiseHit(rng, 0.3, "lp", 500, 0.7, 14, 0.003), 0, 0.55, 0);
    partial(bus, 0.002, 230, 0.25, 18, 0, 0.001, 0.3);
    place(bus, noiseHit(rng, 0.2, "bp", 1800, 0.6, 20, 0.01), 0.03, 0.12, 0);
    return { fadeOut: 0.08 };
  },
  stab: (bus, rng) => {
    // 찌르기: 날카롭게 '슉' + 끝에 쇳소리 '틱'
    const x = noiseHit(rng, 0.09, "hp", 2200, 0.8, 30, 0.012);
    place(bus, x, 0, 0.5, 0);
    glide(bus, 0, 0.08, (t) => 1600 + 9000 * t, 0.08, 0, { duty: 0.5, rel: 0.03 });
    partial(bus, 0.07, 3300, 0.2, 55, 0, 0.0008, 0.15);
    partial(bus, 0.07, 5100, 0.07, 80, 0, 0.0008, 0.1);
    return { fadeOut: 0.04, target: -18 };
  },
  clack: (bus, rng) => {
    // 연타(키보드): 기계식 키 두 번 '딸깍'
    for (const [t, f] of [[0, 2300], [0.045, 2650]]) {
      place(bus, noiseHit(rng, 0.012, "hp", 3800, 0.7, 380), t, 0.5, 0);
      partial(bus, t, f, 0.3, 160, 0, 0.0005, 0.06);
      partial(bus, t + 0.004, 420, 0.25, 90, 0, 0.0008, 0.06);
    }
    return { fadeIn: 0.0005, fadeOut: 0.02, target: -19 };
  },
  twang: (bus, rng) => {
    // 고무줄 총: 퉁 하고 떨리는 고무줄
    const [L, R] = bus, len = Math.round(0.28 * SR);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR, f = 210 + 260 * Math.exp(-t * 30) + 14 * Math.sin(TAU * 32 * t) * Math.exp(-t * 8);
      ph += f / SR;
      const y = (Math.sin(TAU * ph) + 0.35 * Math.sin(2 * TAU * ph)) * Math.exp(-t * 14) * Math.min(1, i / 30) * 0.5;
      L[i] += y;
      R[i] += y;
    }
    place(bus, noiseHit(rng, 0.02, "bp", 2500, 1, 200), 0, 0.3, 0);
    return { fadeOut: 0.04 };
  },
  flick: (bus, rng) => {
    // 카드 던지기: 손끝 '탁' + 날아가는 '휙'
    place(bus, noiseHit(rng, 0.015, "bp", 3200, 1.2, 250), 0, 0.5, 0);
    const x = noiseHit(rng, 0.16, "bp", 2400, 1.5, 18, 0.03);
    place(bus, x, 0.01, 0.3, 0.2);
    glide(bus, 0.01, 0.12, (t) => 900 + 9000 * t, 0.04, 0, { rel: 0.05 });
    return { fadeOut: 0.04, target: -18.5 };
  },
  ink: (bus, rng) => {
    // 범위 마법(잉크): 낮은 '뽀옹' + 철퍽 + 방울
    glide(bus, 0, 0.22, (t) => 320 * Math.exp(-t * 9) + 110, 0.45, 0, { atk: 0.004, rel: 0.08 });
    place(bus, noiseHit(rng, 0.3, "bp", 950, 0.6, 13, 0.01), 0.02, 0.5, 0);
    for (let k = 0; k < 4; k++) place(bus, plink(rng, 600, 1500), 0.06 + k * 0.05 + rng.range(0, 0.03), 0.12, rng.range(-0.6, 0.6));
    reverb(bus, { room: 0.4, damp: 0.6, wet: 0.1 });
    return { fadeOut: 0.08 };
  },
  warn: (bus) => {
    // 몬스터 경고: 낮게 차오르는 '우웅' (귀에 거슬리지 않게 작고 둥글게)
    glide(bus, 0, 0.22, (t) => 190 + 160 * (t / 0.22), 0.3, 0, { duty: 0.5, atk: 0.02, rel: 0.08 });
    glide(bus, 0, 0.22, (t) => 380 + 320 * (t / 0.22), 0.08, 0, { atk: 0.02, rel: 0.08 });
    return { fadeOut: 0.04, lp: 3000, target: -21 };
  },
  slam: (bus, rng) => {
    // 몬스터 내려찍기·폭발: 깊은 쿵 + 바스러짐
    const boom = biquad(biquad(brown(Math.round(0.5 * SR), rng), "lp", 180, 0.7), "lp", 180, 0.7);
    normPeak(boom);
    for (let i = 0; i < boom.length; i++) boom[i] *= Math.min(1, i / 60) * Math.exp((-i / SR) * 7);
    place(bus, boom, 0, 0.6, 0);
    glide(bus, 0, 0.3, (t) => 95 * Math.exp(-t * 6) + 34, 0.6, 0, { atk: 0.001, rel: 0.1 });
    place(bus, noiseHit(rng, 0.18, "bp", 1300, 0.6, 22), 0.005, 0.25, 0);
    reverb(bus, { room: 0.6, damp: 0.5, wet: 0.14, lowCut: 90 });
    return { fadeOut: 0.12, hp: 30 };
  },
  roar: (bus, rng, n) => {
    // 우두머리 단계 바뀜: 낮게 으르렁 (떨리는 톱니 + 거친 숨)
    const [L, R] = bus, len = Math.round(1.0 * SR);
    let ph = 0;
    for (let i = 0; i < len && i < n; i++) {
      const t = i / SR, f = 92 - 26 * t + 6 * Math.sin(TAU * 7 * t);
      ph += f / SR;
      const saw = 2 * (ph % 1) - 1, env = Math.min(1, t / 0.08) * Math.min(1, (1.0 - t) / 0.3) * (0.75 + 0.25 * Math.sin(TAU * 13 * t));
      L[i] += saw * env * 0.22;
      R[i] += saw * env * 0.22;
    }
    filt(bus, "lp", 900, 0.9);
    place(bus, noiseHit(rng, 0.9, "bp", 420, 0.8, 3.5, 0.08), 0, 0.35, 0);
    reverb(bus, { room: 0.7, damp: 0.5, wet: 0.2, lowCut: 70 });
    return { fadeOut: 0.2, hp: 35 };
  },
};

// ───────────────────────── 외부 무료 음원 ─────────────────────────
// 원본 페이지에서 라이선스를 직접 확인한 곡만 넣는다(2026-11 확인). CC BY는 artist·license·sourceUrl로 저작자를 표시한다.
// 변경 사항: 44.1kHz 스테레오 128kbps로 다시 인코딩하고 음량을 다른 곡과 같은 -19 LUFS로 맞췄다(일부 CC0 곡은 고역을 살짝 깎음).
const OGA = "https://opengameart.org/sites/default/files/";
const OGA_PAGE = "https://opengameart.org/content/";
const KM = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/";
const KM_PAGE = "https://incompetech.com/music/royalty-free/index.html?isrc=";
const KMA = "Kevin MacLeod (incompetech.com)";
const ext = (pl, file, title, artist, license, sourceUrl, src, more = {}) => ({ pl, file, title, artist, license, sourceUrl, src, ext: true, ...more });
const EXTERNAL = [
  ext("orgel", "moonlit-lullaby-for-the-lost", "Moonlit Lullaby for the Lost", "Tsorthan Grove", "CC0", OGA_PAGE + "moonlit-lullaby-for-the-lost", OGA + "moonlit_lullaby_for_the_lost.flac"),
  ext("orgel", "music-box-sad-tune", "Sad Tune (Music Box)", "Aureolus_Omicron", "CC0", OGA_PAGE + "4-music-box-tracks", OGA + "musicbox3_sad_tune.ogg"),
  ext("orgel", "music-box-cute-tune", "Cute Tune (Music Box)", "Aureolus_Omicron", "CC0", OGA_PAGE + "4-music-box-tracks", OGA + "musicbox2_cute_tune.ogg"),
  ext("orgel", "frost-waltz", "Frost Waltz", KMA, "CC BY 4.0", KM_PAGE + "USUAN1100516", KM + "Frost%20Waltz.mp3"),
  ext("lofi", "chill-lofi-inspired", "Chill lofi inspired", "omfgdude", "CC0", OGA_PAGE + "chill-lofi-inspired", OGA + "ChillLofi.ogg"),
  ext("lofi", "happy-lofi-day", "happy lofi day", "Tarush Singhal", "CC0", OGA_PAGE + "happy-lofi-day", OGA + "rhodes.mp3", { lp: 11000 }),
  ext("lofi", "in-the-lobby", "In the Lobby", "Umplix", "CC0", OGA_PAGE + "in-the-lobby", OGA + "in_the_lobby.wav"),
  ext("lofi", "dimly-lit", "Dimly lit", "iamoneabe", "CC0", OGA_PAGE + "dimly-lit", OGA + "dimlylit.wav", { lp: 11000 }),
  ext("piano", "calm-piano-vaporware", "Calm Piano 1 (Vaporware)", "The Cynic Project (cynicmusic.com)", "CC0", OGA_PAGE + "calm-piano-1-vaporware", OGA + "003_Vaporware_2.mp3"),
  ext("piano", "calmant", "Calmant", KMA, "CC BY 4.0", KM_PAGE + "USUAN1100859", KM + "Calmant.mp3"),
  ext("piano", "dreamer", "Dreamer", KMA, "CC BY 4.0", KM_PAGE + "USUAN1600043", KM + "Dreamer.mp3"),
  ext("chiptune", "apple-cider", "Apple Cider", "Zane Little Music", "CC0", OGA_PAGE + "apple-cider", OGA + "apple_cider.ogg", { lp: 9000 }),
  ext("chiptune", "napping-on-a-cloud", "Napping on a Cloud", "congusbongus", "CC0", OGA_PAGE + "napping-on-a-cloud", OGA + "napping_on_a_cloud.ogg"),
  ext("chiptune", "8bit-bossa", "8bit Bossa", "Joth", "CC0", OGA_PAGE + "bossa-nova", OGA + "8bit%20Bossa.mp3"),
  ext("jazz", "mocha-frapp", "Mocha Frapp", "Alex McCulloch (Pro Sensory)", "CC0", OGA_PAGE + "mocha-frapp", OGA + "mocha_frapp_2.mp3"),
  ext("jazz", "blue-rain", "Blue Rain", "Alex McCulloch (Pro Sensory)", "CC0", OGA_PAGE + "blue-rain", OGA + "blue_rain_0.mp3"),
  ext("jazz", "once-in-a-while", "Once In a While", "Alex McCulloch (Pro Sensory)", "CC0", OGA_PAGE + "once-in-a-while", OGA + "Once%20In%20A%20while_4.mp3"),
  ext("jazz", "coffee-house-bump", "Coffee House Bump", "OatCog", "CC0", OGA_PAGE + "coffee-house-bump", OGA + "little_cafe_0.wav"),
  ext("jazz", "lobby-time", "Lobby Time", KMA, "CC BY 4.0", KM_PAGE + "USUAN1600054", KM + "Lobby%20Time.mp3"),
  ext("acoustic", "a-small-fire-will-do", "A Small Fire Will Do", "Cal McEachern (Trex0n)", "CC0", OGA_PAGE + "a-small-fire-will-do-calming-loop", OGA + "a_small_fire_will_do.wav"),
  ext("acoustic", "just-you-and-me", "Just You and Me (Guitar)", "Alex McCulloch (Pro Sensory)", "CC0", OGA_PAGE + "just-you-and-me-guitar", OGA + "Just%20you%20and%20me_2.mp3"),
  ext("acoustic", "ladada-guitar", "LaDaDa Guitar", "Alex McCulloch (Pro Sensory)", "CC0", OGA_PAGE + "ladada-guitar", OGA + "LaDaDaGuitar_2.mp3"),
  ext("ambient", "waking-states", "Waking States", "Tsorthan Grove", "CC0", OGA_PAGE + "waking-states", OGA + "waking_states.mp3"),
  ext("ambient", "dream-ambience", "Dream (Ambience)", "TokyoGeisha", "CC0", OGA_PAGE + "dream-ambience", OGA + "Dream%20%28Ambience%29_1.mp3"),
  ext("ambient", "contemplation", "Contemplation", "Joth", "CC0", OGA_PAGE + "contemplation-0", OGA + "Contemplation.mp3"),
  ext("retro", "welcome-to-the-item-shop", "Welcome to the Item Shop", "congusbongus", "CC0", OGA_PAGE + "welcome-to-the-item-shop", OGA + "welcome_to_the_item_shop_1.ogg"),
  ext("retro", "quaint-town", "Quaint Town", "neonarkade", "CC0", OGA_PAGE + "quaint-town", OGA + "Quaint%20Town_0.mp3"),
  ext("retro", "a-new-town", "A New Town", "The Cynic Project (cynicmusic.com)", "CC0", OGA_PAGE + "a-new-town-rpg-theme", OGA + "025_A_New_Town.mp3"),
  ext("retro", "magic-town", "Magic Town", "controllerhead", "CC0", OGA_PAGE + "magic-town", OGA + "Magic%20Town_0.mp3"),
];
const hashSeed = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
function importExternal(s) {
  const dir = join(process.env.BGM_CACHE || join(tmpdir(), "tomb-bgm-src"), s.file);
  mkdirSync(dir, { recursive: true });
  const src = join(dir, `src${extname(decodeURIComponent(new URL(s.src).pathname)).toLowerCase()}`);
  if (!existsSync(src)) execFileSync("curl", ["-sSfL", "--max-time", "300", "-A", "Mozilla/5.0", "-o", src, s.src]);
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", src, "-map", "0:a:0", "-ac", "2", "-ar", String(SR), "-f", "f32le", "pipe:1"], { maxBuffer: 1 << 30 });
  const f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)), n = f.length >> 1, bus = stereo(n);
  for (let i = 0; i < n; i++) {
    bus[0][i] = f[2 * i];
    bus[1][i] = f[2 * i + 1];
  }
  const st = finalize(bus, { hp: 20, lp: s.lp ?? 0, fadeIn: 0.02, fadeOut: 0.6 });
  mkdirSync(join(OUT, s.pl), { recursive: true });
  encode(bus, join(OUT, s.pl, `${s.file}.mp3`), hashSeed(s.file));
  return { dur: Math.round(n / SR), ...st };
}

// ───────────────────────── 트랙 목록 ─────────────────────────
// tracks.json 목록 순서 (로파이가 맨 앞 — 처음 들어오면 로파이로 시작한다)
const PLAYLISTS = [
  { id: "lofi", title: "로파이" },
  { id: "orgel", title: "오르골" },
  { id: "rain", title: "빗소리" },
  { id: "piano", title: "피아노" },
  { id: "chiptune", title: "8비트" },
  { id: "jazz", title: "재즈" },
  { id: "ambient", title: "앰비언트" },
  { id: "acoustic", title: "어쿠스틱 기타" },
  { id: "retro", title: "레트로 RPG" },
];
/** 픽사베이 곡으로 바꾼 목록: 여기서 굽거나 지우지 않고, tracks.json의 지금 내용을 그대로 쓴다 */
const PIXABAY_LISTS = new Set(["lofi", "jazz", "acoustic"]);
const M = (r, q) => [r, q];
// 시드 1001 이상은 '들으면 사실상 같은 곡'을 정리하며 다시 만든 곡이다. 다른 곡과 진행(근음열)·조·템포·반주·빗소리 구성이 겹치지 않게 골랐다.
const SPECS = [
  // 오르골: tonic = 선율의 으뜸음(MIDI), progA = 앞악절 화음(으뜸음 기준 반음, 화음 종류), progB = B악절
  { pl: "orgel", file: "moonlit-orgel", title: "불 끄고 누운 밤", seed: 7, tonic: 72, scale: "majPent", bpm: 64, meter: 4, progA: [M(0, "M"), M(9, "m"), M(5, "M"), M(7, "M")], progB: [M(5, "M"), M(0, "M"), M(2, "m"), M(7, "M")], acc: "arp", counter: "line", timbre: "musicbox", dur: 112 },
  { pl: "orgel", file: "unfinished-lullaby", title: "내일 걱정은 내일 하기", seed: 21, tonic: 69, scale: "minPent", bpm: 60, meter: 3, progA: [M(0, "m"), M(8, "M"), M(3, "M"), M(10, "M")], progB: [M(5, "m"), M(0, "m"), M(8, "M"), M(10, "M")], acc: "waltz", counter: "echo", timbre: "musicbox", dur: 118 },
  { pl: "orgel", file: "first-commit-waltz", title: "주말 아침 커튼 사이 햇살", seed: 33, tonic: 65, scale: "major", bpm: 72, meter: 3, progA: [M(0, "M"), M(5, "M"), M(0, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(0, "M"), M(7, "7")], acc: "waltz", counter: "thirds", timbre: "celesta", dur: 104 },
  { pl: "orgel", file: "archived-dreams", title: "꿈에서도 출근하는 밤", seed: 45, tonic: 74, scale: "dorian", bpm: 58, meter: 4, progA: [M(0, "m7"), M(5, "M"), M(0, "m7"), M(5, "M")], progB: [M(10, "M"), M(5, "M"), M(3, "M"), M(7, "m")], acc: "block", counter: "line", timbre: "musicbox", dur: 116, bass2: true },
  { pl: "orgel", file: "hello-world", title: "토요일 아침 이불 속", seed: 52, tonic: 67, scale: "majPent", bpm: 76, meter: 4, progA: [M(0, "M"), M(7, "M"), M(9, "m"), M(5, "M")], progB: [M(5, "M"), M(0, "M"), M(5, "M"), M(7, "M")], acc: "pulse", counter: "echo", timbre: "musicbox", dur: 100 },
  { pl: "orgel", file: "forgotten-readme", title: "읽다 만 책을 덮으며", seed: 64, tonic: 64, scale: "minPent", bpm: 66, meter: 3, progA: [M(0, "m"), M(5, "m"), M(10, "M"), M(3, "M")], progB: [M(8, "M"), M(10, "M"), M(0, "m"), M(7, "m")], acc: "arp", counter: "line", timbre: "celesta", dur: 108 },
  { pl: "orgel", file: "localhost-lullaby", title: "알람 맞추고 눈 감기", seed: 71, tonic: 70, scale: "major", bpm: 56, meter: 4, progA: [M(0, "M"), M(4, "m"), M(5, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(2, "m"), M(7, "M")], acc: "arp", counter: "thirds", timbre: "musicbox", dur: 124 },
  { pl: "orgel", file: "sleeping-prototype", title: "베개 옆 휴대폰 무음", seed: 88, tonic: 65, scale: "lydian", bpm: 62, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(0, "M7"), M(2, "M")], progB: [M(9, "m"), M(4, "m"), M(7, "M"), M(2, "M")], acc: "arp", counter: "echo", timbre: "celesta", dur: 114 },
  { pl: "orgel", file: "deprecated-star", title: "창밖 가로등 하나", seed: 97, tonic: 67, scale: "minor", bpm: 70, meter: 3, progA: [M(0, "m"), M(5, "m"), M(0, "m"), M(7, "M")], progB: [M(8, "M"), M(10, "M"), M(3, "M"), M(7, "M")], acc: "waltz", counter: "line", timbre: "musicbox", dur: 110 },
  { pl: "orgel", file: "version-zero-one", title: "주말 늦잠 뒤 기지개", seed: 105, tonic: 69, scale: "majPent", bpm: 68, meter: 4, progA: [M(0, "M"), M(5, "M"), M(9, "m"), M(7, "M")], progB: [M(2, "m"), M(5, "M"), M(0, "M"), M(7, "M")], acc: "block", counter: "echo", timbre: "musicbox", dur: 106 },

  // 로파이: key = 으뜸음(MIDI), prog = [박 수, 으뜸음 기준 근음, 보이싱]
  { pl: "lofi", file: "late-commit", title: "밤 아홉 시 사무실", seed: 3, key: 65, mode: "major", bpm: 74, prog: [[4, 2, "m9"], [4, 7, "13"], [4, 0, "M9"], [4, 9, "m9"]], comp: "push", comp2: "charleston", drums: "boom", snare: "snare", swing: 0.6, bass: "root", lead: "flute", dur: 118 },
  { pl: "lofi", file: "todo-forever", title: "끝나지 않는 할 일 목록", seed: 11, key: 62, mode: "major", bpm: 70, prog: [[4, 0, "M9"], [4, 5, "M9"], [4, 0, "M9"], [4, 5, "69"]], comp: "whole", comp2: "twoHit", drums: "lazy", snare: "rim", swing: 0.62, bass: "dotted", lead: "vibes", dur: 126, brkHats: true },
  { pl: "lofi", file: "debugging-at-3am", title: "새벽 두 시 마감 직전", seed: 1051, key: 55, mode: "minor", bpm: 92, prog: [[4, 0, "m9"], [4, 3, "M7"], [4, 8, "M7"], [4, 7, "7b9"]], comp: "charleston", comp2: "push", drums: "bounce", snare: "snare", swing: 0.57, bass: "synco", lead: "musicbox", dur: 112, keyCut: 3000 },
  { pl: "lofi", file: "empty-repository", title: "편의점 삼각김밥 야식", seed: 27, key: 60, mode: "major", bpm: 76, prog: [[4, 4, "m7"], [4, 9, "m9"], [4, 2, "m9"], [4, 7, "7b9"]], comp: "push", comp2: "whole", drums: "boom", snare: "rim", swing: 0.6, bass: "two", lead: "keys", dur: 120 },
  { pl: "lofi", file: "sleeping-server-room", title: "불 꺼진 층에 혼자", seed: 36, key: 57, mode: "minor", bpm: 68, prog: [[4, 0, "m9"], [4, 8, "M7"], [4, 2, "m7b5"], [4, 7, "7b9"]], comp: "whole", comp2: "twoHit", drums: "half", snare: "snare", swing: 0.6, bass: "root", lead: "flute", dur: 132, keyCut: 2800 },
  { pl: "lofi", file: "stale-branch", title: "모니터 불빛만 남은 밤", seed: 1113, key: 63, mode: "major", bpm: 80, prog: [[4, 9, "m7"], [4, 4, "m7"], [4, 5, "M9"], [4, 7, "9"]], comp: "stab", comp2: "charleston", drums: "skip", snare: "rim", swing: 0.6, bass: "two", lead: "flute", dur: 110, brkHats: true },
  { pl: "lofi", file: "cold-coffee-stack-trace", title: "식어 버린 믹스커피", seed: 58, key: 67, mode: "major", bpm: 72, prog: [[4, 0, "M7"], [4, 4, "m7"], [4, 5, "M9"], [4, 5, "m6"]], comp: "push", comp2: "twoHit", drums: "lazy", snare: "snare", swing: 0.63, bass: "root", lead: "flute", dur: 124, center: 60 },
  { pl: "lofi", file: "stashed-summer", title: "야근 끝 편의점 아이스크림", seed: 61, key: 70, mode: "major", bpm: 80, prog: [[4, 5, "M9"], [4, 4, "m7"], [4, 2, "m9"], [4, 0, "M9"]], comp: "charleston", comp2: "push", drums: "boom", snare: "snare", swing: 0.6, bass: "two", lead: "musicbox", dur: 116, keyCut: 3600 },
  { pl: "lofi", file: "expired-domain", title: "자정 넘은 회의실", seed: 1059, key: 56, mode: "major", bpm: 62, prog: [[2, 0, "M9"], [2, 4, "m7"], [2, 5, "M9"], [2, 7, "13"], [2, 9, "m9"], [2, 7, "13"], [2, 5, "M9"], [2, 2, "m9"]], comp: "charleston", comp2: "twoHit", drums: "half", snare: "rim", swing: 0.61, bass: "synco", lead: "keys", dur: 128 },
  { pl: "lofi", file: "sunday-side-project", title: "택시 기다리는 새벽 한 시", seed: 1053, key: 66, mode: "major", bpm: 64, prog: [[4, 5, "M9"], [4, 0, "M9"], [4, 5, "M9"], [4, 7, "9"]], comp: "whole", comp2: "push", drums: "lazy", snare: "rim", swing: 0.63, bass: "root", lead: "keys", dur: 108, center: 60, keyCut: 2600 },
  { pl: "lofi", file: "merge-tomorrow", title: "혼자 내려가는 엘리베이터", seed: 1057, key: 58, mode: "minor", bpm: 84, prog: [[4, 0, "m7"], [4, 3, "M7"], [4, 5, "m9"], [4, 10, "13"]], comp: "push", comp2: "stab", drums: "dusty", snare: "snare", swing: 0.59, bass: "root", lead: "vibes", dur: 122 },
  { pl: "lofi", file: "last-deploy", title: "퇴근 버튼 누르기 직전", seed: 99, key: 68, mode: "major", bpm: 78, prog: [[2, 0, "M9"], [2, 9, "m7"], [2, 2, "m9"], [2, 7, "13"], [2, 4, "m7"], [2, 9, "m9"], [2, 2, "m9"], [2, 7, "7b9"]], comp: "whole", comp2: "stab", drums: "lazy", snare: "snare", swing: 0.6, bass: "root", lead: "musicbox", dur: 130, center: 60 },

  // 빗소리·앰비언트
  { pl: "rain", file: "rain-on-stones", title: "보도블록에 떨어지는 비", seed: 5, kind: "stones", dur: 126 },
  { pl: "rain", file: "distant-thunder", title: "먼 천둥 치는 출근길", seed: 13, kind: "thunder", dur: 134 },
  { pl: "rain", file: "rainy-night-etude", title: "비 오는 밤 창가 피아노", seed: 23, kind: "piano", dur: 130 },
  { pl: "rain", file: "night-crickets", title: "비 그친 밤 풀벌레", seed: 31, kind: "crickets", dur: 120 },
  { pl: "rain", file: "wind-in-the-trees", title: "비 갠 뒤 회사 앞 가로수", seed: 41, kind: "trees", dur: 124 },
  { pl: "rain", file: "tin-roof", title: "옥상 창고 양철 지붕의 비", seed: 53, kind: "tinroof", dur: 116 },
  { pl: "rain", file: "drizzle-far-bell", title: "이슬비 속 먼 종소리", seed: 67, kind: "bell", dur: 128 },
  { pl: "rain", file: "foggy-dawn", title: "비 그친 새벽 안개", seed: 79, kind: "fog", dur: 132 },

  // 잔잔한 피아노: 오르골 엔진 + 펠트 피아노
  { pl: "piano", file: "after-the-last-commit", title: "노을 지는 퇴근길 다리", seed: 201, inst: "piano", tonic: 74, scale: "major", bpm: 58, meter: 3, progA: [M(0, "M7"), M(5, "M7"), M(0, "M7"), M(5, "M7")], progB: [M(9, "m7"), M(4, "m7"), M(5, "M7"), M(7, "M")], acc: "waltz", counter: "line", dur: 92, wet: 0.32 },
  { pl: "piano", file: "closed-issues", title: "오늘도 수고한 나에게", seed: 207, inst: "piano", tonic: 69, scale: "minor", bpm: 64, meter: 4, progA: [M(0, "m"), M(8, "M"), M(3, "M"), M(10, "M")], progB: [M(5, "m"), M(0, "m"), M(8, "M"), M(7, "M")], acc: "arp", counter: "thirds", dur: 90, wet: 0.3 },
  { pl: "piano", file: "commented-out-feelings", title: "보내지 못한 메시지", seed: 213, inst: "piano", tonic: 68, scale: "majPent", bpm: 56, meter: 4, progA: [M(0, "M7"), M(4, "m7"), M(5, "M7"), M(5, "m")], progB: [M(9, "m7"), M(2, "m7"), M(7, "7"), M(7, "sus2")], acc: "block", counter: "echo", dur: 94, bass2: true, wet: 0.32 },

  // 8비트: 오르골 엔진 + 펄스·삼각파·소음 드럼
  { pl: "chiptune", file: "pixel-graveyard-walk", title: "점심시간 동전 오락실", seed: 301, inst: "chip", drums: 1, tonic: 72, scale: "majPent", bpm: 92, meter: 4, progA: [M(0, "M"), M(9, "m"), M(5, "M"), M(7, "M")], progB: [M(5, "M"), M(7, "M"), M(4, "m"), M(7, "M")], acc: "arp", counter: "echo", dur: 88, wet: 0.18 },
  { pl: "chiptune", file: "save-point", title: "오전 업무 저장 완료", seed: 1011, inst: "chip", drums: 0.8, tonic: 70, scale: "dorian", bpm: 100, meter: 4, progA: [M(0, "m7"), M(3, "M"), M(5, "M"), M(10, "M")], progB: [M(7, "m"), M(3, "M"), M(5, "M"), M(0, "m7")], acc: "arp16", counter: "line", dur: 90, wet: 0.2 },
  { pl: "chiptune", file: "no-extra-life", title: "남은 연차 0개", seed: 311, inst: "chip", drums: 1, tonic: 69, scale: "minPent", bpm: 88, meter: 4, progA: [M(0, "m"), M(8, "M"), M(5, "m"), M(7, "m")], progB: [M(8, "M"), M(10, "M"), M(3, "M"), M(7, "M")], acc: "pulse", counter: "echo", dur: 86, bass2: true, wet: 0.18 },
  { pl: "chiptune", file: "stuck-on-title-screen", title: "월요일 아침 로딩 중", seed: 317, inst: "chip", drums: 0.8, tonic: 67, scale: "major", bpm: 96, meter: 3, progA: [M(0, "M"), M(4, "m"), M(5, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(0, "M"), M(7, "7")], acc: "waltz", counter: "thirds", dur: 88, wet: 0.18 },

  // 재즈 카페: 로파이 엔진 + 피아노 컴핑·워킹 베이스·라이드/브러시
  { pl: "jazz", file: "cafe-refactoring", title: "퇴근길 재즈 바 첫 잔", seed: 1111, style: "jazz", key: 64, mode: "major", bpm: 118, prog: [[2, 2, "m9"], [2, 1, "7b9"], [4, 0, "M9"], [2, 5, "M9"], [2, 10, "9"], [4, 0, "69"]], comp: "charleston", comp2: "stab", snare: "snare", swing: 0.64, bass: "walk", lead: "vibes", dur: 92 },
  { pl: "jazz", file: "blue-screen-blues", title: "월요일 퇴근 후 블루스", seed: 409, style: "jazz", key: 64, mode: "minor", bpm: 100, prog: [[2, 5, "m7"], [2, 10, "9"], [2, 3, "M7"], [2, 8, "M7"], [2, 2, "m7b5"], [2, 7, "7b9"], [4, 0, "m9"]], comp: "whole", comp2: "stab", snare: "snare", swing: 0.66, bass: "walk", lead: "vibes", dur: 96 },
  { pl: "jazz", file: "closed-startup-cafe", title: "회사 앞 카페 마지막 주문", seed: 419, style: "jazz", key: 63, mode: "major", bpm: 88, prog: [[4, 0, "M9"], [4, 9, "m9"], [4, 2, "m9"], [4, 7, "13"]], comp: "twoHit", comp2: "charleston", snare: "snare", swing: 0.62, bass: "walk", lead: "keys", dur: 94 },

  // 2차 보강: 기존 장르
  { pl: "orgel", file: "last-star-on-the-graph", title: "포근한 이불 냄새", seed: 1001, tonic: 63, scale: "major", bpm: 56, meter: 4, progA: [M(0, "M7"), M(9, "m7"), M(4, "m"), M(5, "M")], progB: [M(2, "m7"), M(5, "M"), M(7, "sus2"), M(7, "7")], acc: "block", counter: "thirds", timbre: "musicbox", dur: 104 },
  { pl: "lofi", file: "rubber-duck-at-midnight", title: "자정의 혼잣말", seed: 113, key: 61, mode: "major", bpm: 78, prog: [[4, 5, "M9"], [4, 7, "13"], [4, 4, "m7"], [4, 9, "m9"]], comp: "charleston", comp2: "push", drums: "lazy", snare: "rim", swing: 0.61, bass: "two", lead: "flute", dur: 112 },
  { pl: "piano", file: "deprecated-docs", title: "퇴근 후 혼자 먹는 저녁", seed: 219, inst: "piano", tonic: 66, scale: "dorian", bpm: 60, meter: 4, progA: [M(0, "m7"), M(5, "M"), M(0, "m7"), M(5, "M")], progB: [M(3, "M7"), M(10, "M"), M(8, "M7"), M(7, "m")], acc: "arp", counter: "line", dur: 90, wet: 0.32 },
  { pl: "piano", file: "snow-on-the-server", title: "퇴근길에 내린 눈", seed: 223, inst: "piano", tonic: 73, scale: "majPent", bpm: 54, meter: 3, progA: [M(0, "M"), M(5, "M"), M(9, "m"), M(7, "M")], progB: [M(5, "M7"), M(4, "m"), M(2, "m7"), M(7, "M")], acc: "waltz", counter: "echo", dur: 96, wet: 0.34 },
  { pl: "jazz", file: "pull-request-bossa", title: "월급날 저녁 보사노바", seed: 421, style: "jazz", key: 62, mode: "major", bpm: 120, prog: [[4, 0, "M9"], [4, 2, "m9"], [4, 4, "m7"], [4, 3, "M7"]], comp: "stab", comp2: "charleston", snare: "rim", swing: 0.56, bass: "walk", lead: "vibes", dur: 90 },
  { pl: "jazz", file: "late-shift-ballad", title: "야근 끝 위스키 한 잔", seed: 431, style: "jazz", key: 58, mode: "major", bpm: 76, prog: [[4, 0, "M9"], [4, 4, "7b9"], [4, 9, "m9"], [2, 2, "m9"], [2, 7, "13"]], comp: "whole", comp2: "twoHit", snare: "snare", swing: 0.64, bass: "walk", lead: "keys", dur: 98 },

  // 몽환 앰비언트
  { pl: "ambient", file: "dreaming-in-the-cloud", title: "구름 보며 멍때리기", seed: 601, kind: "dream", tonic: 77, scale: "lydian", chords: [[53, 60, 64, 69], [55, 62, 67, 71], [57, 64, 67, 72], [50, 57, 64, 69]], sparkle: "celesta", dur: 108 },
  { pl: "ambient", file: "garbage-collected-memories", title: "아무 생각 없는 오후", seed: 607, kind: "dream", tonic: 74, scale: "minPent", chords: [[50, 57, 64, 65], [46, 53, 60, 65], [43, 55, 62, 65], [45, 52, 60, 64]], sparkle: "glass", drone: 38, dur: 112, gap: [2.5, 6] },
  { pl: "ambient", file: "sleep-mode", title: "휴대폰 끄고 누운 오후", seed: 613, kind: "dream", tonic: 72, scale: "majPent", chords: [[48, 55, 64, 67], [45, 52, 60, 64], [41, 53, 57, 64], [43, 50, 59, 62]], sparkle: "piano", dur: 104, gap: [3, 7], chordLen: 13 },

  // 어쿠스틱 기타: 오르골 엔진 + 뜯는 현
  { pl: "acoustic", file: "campfire-standup", title: "모닥불 앞 수다", seed: 701, inst: "guitar", tonic: 64, scale: "majPent", bpm: 76, meter: 4, progA: [M(0, "M"), M(7, "M"), M(9, "m"), M(5, "M")], progB: [M(5, "M"), M(0, "M"), M(2, "m"), M(7, "M")], acc: "arp", counter: "line", dur: 92, wet: 0.22 },
  { pl: "acoustic", file: "porch-of-the-old-repo", title: "할머니 댁 툇마루", seed: 707, inst: "guitar", tonic: 67, scale: "major", bpm: 66, meter: 3, progA: [M(0, "M"), M(5, "M"), M(0, "M"), M(7, "M")], progB: [M(9, "m"), M(4, "m"), M(5, "M"), M(7, "7")], acc: "arp", counter: "thirds", dur: 96, wet: 0.24 },
  { pl: "acoustic", file: "autumn-backlog", title: "가을 캠핑장 아침 안개", seed: 1021, inst: "guitar", tonic: 64, scale: "minor", bpm: 78, meter: 4, progA: [M(0, "m"), M(5, "m"), M(7, "m"), M(0, "m")], progB: [M(8, "M"), M(3, "M"), M(10, "M"), M(7, "m")], acc: "alberti", counter: "thirds", dur: 90, wet: 0.24 },

  // 레트로 RPG 마을: 오르골 엔진 + 펄스 리드·하프·삼각파
  { pl: "retro", file: "item-shop-of-unfinished-swords", title: "사내 매점은 아이템 상점", seed: 801, inst: "retro", drums: 0.6, tonic: 72, scale: "major", bpm: 100, meter: 4, progA: [M(0, "M"), M(5, "M"), M(2, "m"), M(7, "M")], progB: [M(9, "m"), M(4, "m"), M(5, "M"), M(7, "M")], acc: "arp", counter: "echo", dur: 88, wet: 0.2 },
  { pl: "retro", file: "inn-at-version-zero", title: "신입 사원 마을의 여관", seed: 809, inst: "retro", tonic: 67, scale: "major", bpm: 84, meter: 3, progA: [M(0, "M"), M(9, "m"), M(5, "M"), M(7, "M")], progB: [M(4, "m"), M(9, "m"), M(2, "m"), M(7, "7")], acc: "waltz", counter: "thirds", dur: 92, wet: 0.22 },
  { pl: "retro", file: "village-of-abandoned-quests", title: "미뤄 둔 업무의 마을", seed: 811, inst: "retro", drums: 0.5, tonic: 69, scale: "dorian", bpm: 90, meter: 4, progA: [M(0, "m7"), M(5, "M"), M(0, "m7"), M(10, "M")], progB: [M(3, "M"), M(10, "M"), M(5, "M"), M(7, "m")], acc: "arp", counter: "line", dur: 90, bass2: true, wet: 0.2 },

  // 3차 보강(플레이리스트마다 20곡): 용량을 아끼려고 64kbps(빗소리·앰비언트는 잡음이 많아 80kbps)로 굽는다
  ...[
    // 오르골
    { pl: "orgel", file: "sunday-eleven-pm", title: "월요일 전날 잠 못 드는 밤", seed: 1003, tonic: 65, scale: "minor", bpm: 54, meter: 3, progA: [M(0, "m"), M(3, "M"), M(10, "M"), M(5, "m")], progB: [M(8, "M"), M(5, "m"), M(3, "M"), M(7, "M")], acc: "arp", counter: "echo", timbre: "celesta", dur: 74 },
    { pl: "orgel", file: "payday-night-music-box", title: "월급 들어온 밤의 단잠", seed: 127, tonic: 72, scale: "major", bpm: 70, meter: 4, progA: [M(0, "M7"), M(9, "m7"), M(2, "m7"), M(7, "7")], progB: [M(4, "m"), M(9, "m"), M(5, "M"), M(7, "sus2")], acc: "arp", counter: "thirds", timbre: "musicbox", dur: 72 },
    { pl: "orgel", file: "first-snow-commute", title: "첫눈 예보 듣고 잠들기", seed: 133, tonic: 66, scale: "minor", bpm: 60, meter: 3, progA: [M(0, "m"), M(10, "M"), M(8, "M"), M(7, "M")], progB: [M(3, "M"), M(10, "M"), M(5, "m"), M(7, "M")], acc: "waltz", counter: "echo", timbre: "musicbox", dur: 74 },
    { pl: "orgel", file: "after-the-dishes", title: "설거지 끝내고 불 끄기", seed: 139, tonic: 67, scale: "mixolydian", bpm: 66, meter: 4, progA: [M(0, "M"), M(10, "M"), M(5, "M"), M(0, "M")], progB: [M(5, "M"), M(10, "M"), M(2, "m"), M(7, "m")], acc: "block", counter: "line", timbre: "celesta", dur: 72, bass2: true },
    { pl: "orgel", file: "saturday-no-alarm", title: "알람 없는 토요일 아침", seed: 145, tonic: 64, scale: "lydian", bpm: 58, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(4, "m"), M(2, "M")], progB: [M(9, "m"), M(7, "M"), M(4, "m7"), M(2, "M")], acc: "pulse", counter: "echo", timbre: "musicbox", dur: 72 },

    // 로파이
    { pl: "lofi", file: "friday-six-pm", title: "금요일 밤 편의점 앞 테이블", seed: 1061, key: 69, mode: "major", bpm: 90, prog: [[4, 0, "M9"], [4, 2, "9"], [4, 4, "m7"], [4, 5, "m6"]], comp: "stab", comp2: "twoHit", drums: "skip", snare: "snare", swing: 0.56, bass: "synco", lead: "vibes", dur: 74, brkHats: true },
    { pl: "lofi", file: "cup-noodle-overtime", title: "야근 저녁은 컵라면", seed: 1121, key: 68, mode: "minor", bpm: 88, prog: [[4, 0, "m9"], [4, 10, "13"], [4, 5, "m7"], [4, 7, "7b9"]], comp: "push", comp2: "stab", drums: "boom", snare: "snare", swing: 0.58, bass: "root", lead: "keys", dur: 76, keyCut: 3000 },
    { pl: "lofi", file: "last-subway-home", title: "막차 놓친 밤", seed: 1063, key: 59, mode: "minor", bpm: 66, prog: [[4, 0, "m9"], [4, 0, "m6"], [4, 8, "M7"], [4, 2, "m7b5"]], comp: "twoHit", comp2: "charleston", drums: "dusty", snare: "snare", swing: 0.62, bass: "dotted", lead: "musicbox", dur: 74, keyCut: 3200 },

    // 빗소리
    { pl: "rain", file: "umbrella-crosswalk", title: "우산 쓰고 건너는 횡단보도", seed: 91, kind: "street", dur: 72 },
    { pl: "rain", file: "bus-stop-downpour", title: "장대비 내리는 버스 정류장", seed: 1093, kind: "rainpad", rainLv: 0.22, chords: [[50, 57, 60, 65], [48, 55, 62, 64], [46, 53, 60, 65], [45, 52, 57, 64]], dur: 70 },
    { pl: "rain", file: "cafe-window-seat", title: "출근 전 카페 창가", seed: 1117, kind: "window", key: 61, bpm: 58, meter: 4, prog: [[9, "m9"], [2, "m9"], [5, "M9"], [7, "13"]], dur: 72 },
    { pl: "rain", file: "meeting-room-monsoon", title: "회의실 창밖 장맛비", seed: 85, kind: "window", key: 57, bpm: 56, meter: 4, prog: [[0, "m9"], [5, "m9"], [10, "13"], [3, "M9"]], endQ: "m9", center: 60, rainLv: 0.19, dur: 74 },
    { pl: "rain", file: "rainy-monday-morning", title: "비 오는 월요일 아침", seed: 101, kind: "piano", piano: { key: -2, bpm: 60, prog: [[0, "M9"], [4, "m7"], [9, "m9"], [5, "69"]] }, dur: 72 },
    { pl: "rain", file: "wet-sneakers", title: "젖은 우산 접고 자리에 앉기", seed: 1119, kind: "piano", piano: { key: 1, bpm: 54, prog: [[0, "M9"], [5, "69"], [9, "m9"], [4, "m7"]] }, dur: 74 },
    { pl: "rain", file: "waiting-under-the-eaves", title: "처마 밑에서 비 피하기", seed: 107, kind: "guitar", key: 7, bpm: 66, meter: 4, prog: [[0, "M"], [7, "M"], [9, "m"], [5, "M"]], dur: 72 },
    { pl: "rain", file: "no-umbrella-going-home", title: "우산 없이 나온 퇴근길", seed: 109, kind: "guitar", key: 2, bpm: 72, meter: 3, prog: [[0, "m"], [10, "M"], [8, "M"], [7, "m"]], endMinor: true, rainLv: 0.18, dur: 70 },
    { pl: "rain", file: "convenience-store-awning", title: "편의점 차양 아래 비 구경", seed: 1097, kind: "window", key: 65, bpm: 72, meter: 3, prog: [[0, "M7"], [2, "m9"], [5, "69"], [4, "m7"]], center: 64, dur: 70 },
    { pl: "rain", file: "thunder-overtime", title: "천둥 치는 야근 밤", seed: 1091, kind: "piano", piano: { key: -5, bpm: 50, scale: "minPent", prog: [[0, "m9"], [8, "M7"], [3, "M9"], [10, "13"]], endQ: "m9" }, thunderGap: [22, 34], dur: 74 },
    { pl: "rain", file: "foggy-bus-window", title: "김 서린 버스 창문", seed: 1099, kind: "dream", tonic: 70, scale: "majPent", chords: [[46, 53, 57, 62], [39, 46, 55, 62], [48, 55, 58, 63], [41, 48, 53, 60]], sparkle: "musicbox", air: 0.16, gap: [2.5, 5.5], dur: 72 },
    { pl: "rain", file: "monsoon-office-afternoon", title: "장마철 사무실 오후", seed: 119, kind: "rainpad", chords: [[50, 57, 62, 66], [47, 54, 57, 62], [43, 50, 57, 59], [45, 52, 57, 61]], dur: 72 },

    // 피아노
    { pl: "piano", file: "back-seat-of-the-bus", title: "퇴근 버스 맨 뒷자리", seed: 231, inst: "piano", tonic: 70, scale: "major", bpm: 66, meter: 4, progA: [M(0, "M7"), M(4, "m7"), M(9, "m7"), M(5, "M7")], progB: [M(2, "m7"), M(7, "7"), M(0, "M7"), M(9, "m")], acc: "arp", counter: "line", dur: 74, wet: 0.3 },
    { pl: "piano", file: "convenience-store-light", title: "골목 끝 편의점 불빛", seed: 235, inst: "piano", tonic: 64, scale: "majPent", bpm: 60, meter: 3, progA: [M(0, "M"), M(9, "m"), M(4, "m"), M(5, "M")], progB: [M(5, "M7"), M(7, "M"), M(9, "m7"), M(7, "sus2")], acc: "waltz", counter: "echo", dur: 72, wet: 0.32 },
    { pl: "piano", file: "empty-elevator", title: "혼자 탄 엘리베이터", seed: 239, inst: "piano", tonic: 62, scale: "dorian", bpm: 64, meter: 4, progA: [M(0, "m7"), M(7, "m7"), M(5, "M"), M(0, "m7")], progB: [M(3, "M7"), M(5, "M"), M(10, "M"), M(7, "m")], acc: "alberti", counter: "thirds", dur: 74, wet: 0.3 },
    { pl: "piano", file: "ten-pm-laundry", title: "밤 열 시의 세탁기", seed: 243, inst: "piano", tonic: 65, scale: "lydian", bpm: 68, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(9, "m7"), M(7, "M")], progB: [M(4, "m"), M(9, "m"), M(2, "M"), M(7, "M")], acc: "block", counter: "line", dur: 72, bass2: true, wet: 0.32 },
    { pl: "piano", file: "payday-sunset", title: "월급날 퇴근길 노을", seed: 247, inst: "piano", tonic: 67, scale: "major", bpm: 70, meter: 3, progA: [M(0, "M"), M(4, "m"), M(5, "M"), M(7, "7")], progB: [M(9, "m"), M(2, "m7"), M(5, "M7"), M(7, "sus2")], acc: "alberti", counter: "echo", dur: 70, wet: 0.3 },
    { pl: "piano", file: "letter-back-in-the-drawer", title: "다시 서랍에 넣은 사직서", seed: 251, inst: "piano", tonic: 69, scale: "minor", bpm: 62, meter: 4, progA: [M(0, "m"), M(5, "m"), M(10, "M"), M(3, "M")], progB: [M(8, "M"), M(3, "M"), M(5, "m7"), M(7, "M")], acc: "arp", counter: "line", dur: 76, wet: 0.32 },
    { pl: "piano", file: "holiday-train-home", title: "명절 귀성 열차", seed: 255, inst: "piano", tonic: 63, scale: "majPent", bpm: 64, meter: 4, progA: [M(0, "M"), M(7, "M"), M(9, "m"), M(4, "m")], progB: [M(5, "M"), M(0, "M"), M(5, "M7"), M(7, "M")], acc: "pulse", counter: "thirds", dur: 74, wet: 0.3 },
    { pl: "piano", file: "ten-minutes-on-the-roof", title: "옥상에서 쉬는 10분", seed: 259, inst: "piano", tonic: 72, scale: "mixolydian", bpm: 72, meter: 4, progA: [M(0, "M"), M(10, "M"), M(5, "M"), M(0, "M")], progB: [M(5, "M7"), M(10, "M"), M(7, "m"), M(0, "M")], acc: "arp", counter: "echo", dur: 72, wet: 0.28 },
    { pl: "piano", file: "month-end-closing", title: "월말 마감 끝낸 저녁", seed: 263, inst: "piano", tonic: 68, scale: "major", bpm: 58, meter: 3, progA: [M(0, "M7"), M(5, "M7"), M(2, "m7"), M(7, "7")], progB: [M(4, "m7"), M(9, "m7"), M(2, "m7"), M(7, "sus2")], acc: "waltz", counter: "thirds", dur: 74, wet: 0.32 },
    { pl: "piano", file: "after-the-farewell-party", title: "송별회 끝난 밤길", seed: 267, inst: "piano", tonic: 66, scale: "minor", bpm: 60, meter: 3, progA: [M(0, "m7"), M(5, "m7"), M(8, "M7"), M(7, "M")], progB: [M(3, "M7"), M(10, "M"), M(8, "M7"), M(7, "7")], acc: "arp", counter: "echo", dur: 72, wet: 0.32 },
    { pl: "piano", file: "sunday-shirt-ironing", title: "일요일 밤 셔츠 다림질", seed: 271, inst: "piano", tonic: 71, scale: "majPent", bpm: 66, meter: 4, progA: [M(0, "M"), M(4, "m"), M(9, "m"), M(7, "M")], progB: [M(5, "M"), M(2, "m"), M(7, "M"), M(7, "sus2")], acc: "block", counter: "line", dur: 72, wet: 0.3 },
    { pl: "piano", file: "first-workday-of-the-year", title: "새해 첫 출근", seed: 275, inst: "piano", tonic: 65, scale: "major", bpm: 74, meter: 4, progA: [M(0, "M"), M(2, "m"), M(4, "m"), M(5, "M")], progB: [M(9, "m"), M(7, "M"), M(5, "M"), M(7, "7")], acc: "alberti", counter: "line", dur: 70, wet: 0.28 },

    // 8비트
    { pl: "chiptune", file: "lunch-menu-dilemma", title: "점심 메뉴 룰렛", seed: 321, inst: "chip", drums: 1, tonic: 72, scale: "majPent", bpm: 132, meter: 4, progA: [M(0, "M"), M(5, "M"), M(7, "M"), M(0, "M")], progB: [M(9, "m"), M(5, "M"), M(2, "m"), M(7, "M")], acc: "arp16", counter: "echo", dur: 70, wet: 0.16 },
    { pl: "chiptune", file: "last-meal-ticket", title: "식권 한 장 남았다", seed: 325, inst: "chip", drums: 0.9, tonic: 69, scale: "minPent", bpm: 112, meter: 4, progA: [M(0, "m"), M(10, "M"), M(8, "M"), M(7, "m")], progB: [M(5, "m"), M(8, "M"), M(10, "M"), M(7, "m")], acc: "pulse", counter: "thirds", dur: 72, bass2: true, wet: 0.18 },
    { pl: "chiptune", file: "elevator-mind-game", title: "엘리베이터 눈치 게임", seed: 329, inst: "chip", drums: 0.7, tonic: 67, scale: "major", bpm: 120, meter: 3, progA: [M(0, "M"), M(7, "M"), M(9, "m"), M(4, "m")], progB: [M(5, "M"), M(0, "M"), M(2, "m"), M(7, "7")], acc: "arp", counter: "line", dur: 70, wet: 0.18 },
    { pl: "chiptune", file: "coffee-ladder-game", title: "커피 내기 사다리 타기", seed: 333, inst: "chip", drums: 1, tonic: 74, scale: "mixolydian", bpm: 126, meter: 4, progA: [M(0, "M"), M(10, "M"), M(5, "M"), M(0, "M")], progB: [M(7, "m"), M(5, "M"), M(10, "M"), M(0, "M")], acc: "arp16", counter: "echo", dur: 70, wet: 0.16 },
    { pl: "chiptune", file: "afternoon-meeting-boss", title: "오후 회의 보스전", seed: 337, inst: "chip", drums: 1, tonic: 64, scale: "minor", bpm: 140, meter: 4, progA: [M(0, "m"), M(8, "M"), M(10, "M"), M(0, "m")], progB: [M(5, "m"), M(8, "M"), M(3, "M"), M(7, "M")], acc: "arp16", counter: "thirds", dur: 70, bass2: true, wet: 0.16 },
    { pl: "chiptune", file: "pantry-snack-raid", title: "탕비실 과자 쟁탈전", seed: 341, inst: "chip", drums: 0.8, tonic: 70, scale: "majPent", bpm: 116, meter: 4, progA: [M(0, "M"), M(4, "m"), M(9, "m"), M(7, "M")], progB: [M(5, "M"), M(7, "M"), M(9, "m"), M(0, "M")], acc: "pulse", counter: "echo", dur: 72, wet: 0.18 },
    { pl: "chiptune", file: "clock-out-speedrun", title: "칼퇴 스피드런", seed: 345, inst: "chip", drums: 1, tonic: 71, scale: "major", bpm: 144, meter: 4, progA: [M(0, "M"), M(5, "M"), M(9, "m"), M(7, "M")], progB: [M(2, "m"), M(7, "M"), M(4, "m"), M(9, "m")], acc: "arp16", counter: "line", dur: 70, wet: 0.16 },
    { pl: "chiptune", file: "punch-in-combo", title: "출근 도장 콤보", seed: 349, inst: "chip", drums: 0.9, tonic: 65, scale: "dorian", bpm: 104, meter: 4, progA: [M(0, "m7"), M(10, "M"), M(5, "M"), M(7, "m")], progB: [M(3, "M"), M(10, "M"), M(5, "M"), M(7, "m")], acc: "arp", counter: "echo", dur: 72, wet: 0.18 },
    { pl: "chiptune", file: "weekly-report-quest", title: "주간 보고 마감 퀘스트", seed: 1013, inst: "chip", drums: 1, tonic: 62, scale: "mixolydian", bpm: 128, meter: 4, progA: [M(0, "M"), M(7, "m"), M(10, "M"), M(5, "M")], progB: [M(2, "m"), M(10, "M"), M(0, "M"), M(5, "M")], acc: "pulse", counter: "thirds", dur: 72, wet: 0.18 },
    { pl: "chiptune", file: "employee-badge-level-up", title: "사원증 레벨 업", seed: 357, inst: "chip", drums: 1, tonic: 72, scale: "major", bpm: 136, meter: 4, progA: [M(0, "M"), M(5, "M"), M(2, "m"), M(7, "M")], progB: [M(4, "m"), M(9, "m"), M(5, "M"), M(7, "7")], acc: "arp16", counter: "echo", dur: 70, wet: 0.16 },
    { pl: "chiptune", file: "post-lunch-walk-stage", title: "점심 산책 스테이지", seed: 361, inst: "chip", drums: 0.6, tonic: 67, scale: "majPent", bpm: 96, meter: 4, progA: [M(0, "M"), M(9, "m"), M(2, "m"), M(7, "M")], progB: [M(5, "M"), M(4, "m"), M(2, "m"), M(7, "M")], acc: "pulse", counter: "line", dur: 72, wet: 0.2 },
    { pl: "chiptune", file: "vending-machine-jackpot", title: "자판기 잭팟", seed: 1017, inst: "chip", drums: 1, tonic: 63, scale: "major", bpm: 148, meter: 4, progA: [M(0, "M"), M(7, "M"), M(4, "m"), M(9, "m")], progB: [M(5, "M"), M(2, "m"), M(7, "7"), M(0, "M")], acc: "arp16", counter: "echo", dur: 70, wet: 0.16 },
    { pl: "chiptune", file: "parcel-arrived-alert", title: "회사로 온 택배 알림", seed: 369, inst: "chip", drums: 0.9, tonic: 73, scale: "majPent", bpm: 118, meter: 4, progA: [M(0, "M"), M(5, "M"), M(0, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(9, "m"), M(7, "M")], acc: "alberti", counter: "echo", dur: 72, bass2: true, wet: 0.18 },

    // 재즈 카페
    { pl: "jazz", file: "morning-americano", title: "퇴근 후 동료와 하이볼", seed: 1071, style: "jazz", key: 69, mode: "major", bpm: 108, prog: [[4, 0, "69"], [4, 4, "7b9"], [4, 9, "m9"], [4, 5, "M9"], [4, 5, "m6"], [4, 0, "M9"], [4, 2, "m9"], [4, 7, "13"]], comp: "twoHit", comp2: "push", snare: "snare", swing: 0.6, bass: "walk", lead: "flute", dur: 72 },
    { pl: "jazz", file: "lunch-break-bossa", title: "점심시간 보사노바", seed: 445, style: "jazz", kit: "bossa", key: 60, mode: "major", bpm: 128, prog: [[4, 0, "M9"], [4, 2, "9"], [4, 2, "m9"], [4, 7, "13"]], comp: "stab", comp2: "charleston", snare: "rim", swing: 0.5, bass: "two", lead: "flute", dur: 72 },
    { pl: "jazz", file: "rainy-day-latte", title: "비 오는 퇴근길 바 창가", seed: 449, style: "jazz", key: 67, mode: "minor", bpm: 92, prog: [[4, 0, "m9"], [4, 5, "9"], [4, 10, "M9"], [4, 3, "M7"], [2, 8, "M7"], [2, 2, "m7b5"], [4, 7, "7b9"]], comp: "whole", comp2: "twoHit", snare: "snare", swing: 0.62, bass: "walk", lead: "keys", dur: 74 },
    { pl: "jazz", file: "friday-happy-hour", title: "불금 퇴근 한 잔", seed: 453, style: "jazz", key: 70, mode: "major", bpm: 132, prog: [[2, 0, "M9"], [2, 9, "7b9"], [2, 2, "m9"], [2, 7, "13"]], comp: "stab", comp2: "charleston", snare: "snare", swing: 0.66, bass: "walk", lead: "vibes", dur: 70 },
    { pl: "jazz", file: "promotion-news-bossa", title: "혼자 마시는 와인 한 잔", seed: 1073, style: "jazz", kit: "bossa", key: 69, mode: "minor", bpm: 112, prog: [[4, 0, "m9"], [4, 0, "m6"], [4, 2, "m7b5"], [4, 7, "7b9"], [4, 5, "m9"], [4, 10, "13"], [4, 3, "M7"], [4, 8, "M7"]], comp: "twoHit", comp2: "push", snare: "rim", swing: 0.5, bass: "two", lead: "vibes", dur: 72 },
    { pl: "jazz", file: "espresso-before-overtime", title: "야근 전 에스프레소", seed: 461, style: "jazz", key: 62, mode: "minor", bpm: 104, prog: [[4, 0, "m9"], [4, 0, "m6"], [4, 5, "9"], [4, 7, "7b9"]], comp: "twoHit", comp2: "stab", snare: "snare", swing: 0.64, bass: "walk", lead: "keys", dur: 72 },
    { pl: "jazz", file: "rooftop-sunset-swing", title: "루프톱 바 노을 스윙", seed: 465, style: "jazz", key: 68, mode: "major", bpm: 140, prog: [[4, 5, "M9"], [4, 4, "m7"], [4, 9, "7b9"], [4, 2, "m9"], [4, 7, "13"], [4, 0, "M9"], [4, 2, "m9"], [4, 7, "13"]], comp: "charleston", comp2: "push", snare: "snare", swing: 0.66, bass: "walk", lead: "vibes", dur: 70 },
    { pl: "jazz", file: "cancelled-field-meeting", title: "회식 2차는 재즈 바", seed: 1077, style: "jazz", key: 56, mode: "major", bpm: 150, prog: [[4, 5, "M9"], [4, 10, "9"], [4, 0, "M9"], [2, 4, "m7"], [2, 9, "7b9"]], comp: "stab", comp2: "charleston", snare: "snare", swing: 0.66, bass: "walk", lead: "keys", dur: 72 },
    { pl: "jazz", file: "year-end-party-ballad", title: "막잔 비우는 밤", seed: 1079, style: "jazz", key: 66, mode: "minor", bpm: 64, prog: [[4, 0, "m9"], [4, 5, "9"], [4, 0, "m6"], [4, 8, "M7"], [4, 2, "m7b5"], [4, 7, "7b9"], [4, 0, "m9"], [4, 0, "m9"]], comp: "whole", comp2: "push", snare: "snare", swing: 0.62, bass: "two", lead: "vibes", dur: 74 },
    { pl: "jazz", file: "monday-cafe-bossa", title: "월요일 퇴근 후 칵테일", seed: 1081, style: "jazz", key: 65, mode: "minor", bpm: 84, prog: [[4, 0, "m9"], [4, 8, "M7"], [4, 1, "M7"], [4, 7, "7b9"]], comp: "push", comp2: "whole", snare: "snare", swing: 0.62, bass: "walk", lead: "vibes", dur: 72 },

    // 앰비언트
    { pl: "ambient", file: "first-morning-of-leave", title: "연차 첫날 아침", seed: 621, kind: "dream", tonic: 74, scale: "majPent", chords: [[50, 57, 64, 66], [43, 50, 59, 64], [47, 54, 62, 69], [45, 52, 59, 62]], sparkle: "vibes", dur: 72 },
    { pl: "ambient", file: "rainy-day-off", title: "비 오는 휴일 오후", seed: 625, kind: "dream", tonic: 76, scale: "minPent", chords: [[52, 59, 62, 66], [48, 55, 59, 64], [45, 52, 59, 60], [47, 54, 57, 62]], sparkle: "glass", drone: 40, gap: [2.5, 6], dur: 72 },
    { pl: "ambient", file: "four-pm-wake-up", title: "낮잠 자다 깬 오후 네 시", seed: 629, kind: "dream", tonic: 77, scale: "lydian", chords: [[53, 60, 64, 71], [55, 62, 67, 71], [52, 59, 62, 67], [57, 60, 64, 67]], sparkle: "pluck", dur: 72 },
    { pl: "ambient", file: "waiting-for-the-parcel", title: "택배 기다리는 오후", seed: 633, kind: "dream", tonic: 68, scale: "majPent", chords: [[44, 51, 60, 67], [41, 48, 56, 63], [49, 56, 60, 65], [51, 58, 61, 65]], sparkle: "piano", gap: [3, 7], dur: 72 },
    { pl: "ambient", file: "saturday-sleep-in", title: "늦잠 자도 되는 토요일", seed: 637, kind: "dream", tonic: 72, scale: "dorian", chords: [[48, 55, 58, 62], [53, 57, 60, 63], [46, 53, 57, 62], [44, 51, 55, 60]], sparkle: "celesta", chordLen: 13, dur: 72 },
    { pl: "ambient", file: "sunny-window-sofa", title: "햇살 드는 창가 소파", seed: 1137, kind: "dream", tonic: 76, scale: "major", chords: [[40, 47, 51, 54], [37, 44, 47, 54], [45, 52, 56, 63], [47, 52, 56, 61]], sparkle: "vibes", gap: [2, 5], dur: 72 },
    { pl: "ambient", file: "after-work-bath", title: "퇴근 후 반신욕", seed: 645, kind: "dream", tonic: 70, scale: "lydian", chords: [[46, 53, 57, 62], [46, 52, 55, 60], [43, 50, 57, 58], [51, 55, 58, 62]], sparkle: "glass", air: 0.05, dur: 72 },
    { pl: "ambient", file: "folding-laundry-sunday", title: "일요일 저녁 빨래 개기", seed: 649, kind: "dream", tonic: 69, scale: "minPent", chords: [[45, 52, 59, 60], [41, 53, 57, 64], [50, 53, 57, 64], [52, 57, 59, 64]], sparkle: "pluck", drone: 33, dur: 72 },
    { pl: "ambient", file: "payday-night-walk", title: "연차 날 동네 한 바퀴", seed: 1139, kind: "dream", tonic: 72, scale: "majPent", chords: [[48, 55, 64, 67], [47, 55, 62, 64], [45, 53, 60, 64], [43, 50, 57, 62]], sparkle: "piano", chordLen: 14, dur: 72 },
    { pl: "ambient", file: "no-meeting-friday", title: "회의 없는 금요일 오후", seed: 1141, kind: "dream", tonic: 74, scale: "minor", chords: [[38, 45, 53, 55], [46, 53, 57, 64], [43, 50, 57, 58], [45, 52, 55, 62]], sparkle: "glass", drone: 38, dur: 72 },
    { pl: "ambient", file: "airplane-mode-day", title: "비행기 모드로 쉬는 날", seed: 1133, kind: "dream", tonic: 77, scale: "lydian", chords: [[41, 48, 55, 59], [43, 50, 57, 59], [40, 47, 50, 55], [45, 52, 59, 60]], sparkle: "celesta", gap: [3, 6.5], dur: 72 },
    { pl: "ambient", file: "dangerous-outside-the-blanket", title: "이불 밖은 위험해", seed: 665, kind: "dream", tonic: 72, scale: "majPent", chords: [[48, 55, 62, 64], [45, 52, 59, 60], [41, 52, 55, 60], [43, 50, 57, 60]], sparkle: "piano", chordLen: 15, gap: [3.5, 8], dur: 74 },
    { pl: "ambient", file: "last-night-of-leave", title: "연차 마지막 날 밤", seed: 669, kind: "dream", tonic: 75, scale: "lydian", chords: [[51, 58, 62, 69], [51, 57, 60, 65], [48, 55, 58, 62], [46, 53, 58, 60]], sparkle: "musicbox", drone: 39, dur: 72 },
    { pl: "ambient", file: "half-day-off-nap", title: "오후 반차 후 낮잠", seed: 1131, kind: "dream", tonic: 69, scale: "minor", chords: [[45, 52, 59, 60], [41, 52, 57, 59], [43, 52, 55, 59], [38, 45, 53, 59]], sparkle: "pluck", chordLen: 14, air: 0.04, dur: 72 },

    // 어쿠스틱 기타
    { pl: "acoustic", file: "saturday-tent-morning", title: "토요일 아침 텐트", seed: 721, inst: "guitar", tonic: 67, scale: "majPent", bpm: 80, meter: 4, progA: [M(0, "M"), M(5, "M"), M(9, "m"), M(7, "M")], progB: [M(5, "M"), M(0, "M"), M(2, "m"), M(7, "M")], acc: "strum", counter: "line", dur: 70, wet: 0.22 },
    { pl: "acoustic", file: "highway-to-the-campsite", title: "캠핑장 가는 고속도로", seed: 725, inst: "guitar", tonic: 69, scale: "mixolydian", bpm: 92, meter: 4, progA: [M(0, "M"), M(10, "M"), M(5, "M"), M(0, "M")], progB: [M(5, "M"), M(7, "m"), M(10, "M"), M(0, "M")], acc: "strum", counter: "echo", dur: 70, wet: 0.2 },
    { pl: "acoustic", file: "toasted-marshmallow", title: "모닥불에 구운 마시멜로", seed: 1023, inst: "guitar", tonic: 69, scale: "majPent", bpm: 86, meter: 4, progA: [M(0, "M"), M(2, "m"), M(9, "m"), M(7, "M")], progB: [M(5, "M"), M(4, "m"), M(9, "m"), M(0, "M")], acc: "block", counter: "line", dur: 72, wet: 0.24 },
    { pl: "acoustic", file: "weekend-farm-lettuce", title: "주말농장 상추", seed: 733, inst: "guitar", tonic: 62, scale: "majPent", bpm: 84, meter: 4, progA: [M(0, "M"), M(7, "M"), M(5, "M"), M(0, "M")], progB: [M(9, "m"), M(5, "M"), M(0, "M"), M(7, "M")], acc: "pulse", counter: "echo", dur: 70, bass2: true, wet: 0.22 },
    { pl: "acoustic", file: "riverside-picnic-mat", title: "강변 돗자리", seed: 737, inst: "guitar", tonic: 66, scale: "major", bpm: 74, meter: 4, progA: [M(0, "M7"), M(5, "M7"), M(4, "m7"), M(9, "m7")], progB: [M(2, "m7"), M(7, "7"), M(0, "M7"), M(7, "sus2")], acc: "arp", counter: "line", dur: 72, wet: 0.24 },
    { pl: "acoustic", file: "trailhead-gimbap", title: "등산로 입구 김밥", seed: 741, inst: "guitar", tonic: 69, scale: "majPent", bpm: 88, meter: 4, progA: [M(0, "M"), M(9, "m"), M(2, "m"), M(7, "M")], progB: [M(5, "M"), M(4, "m"), M(9, "m"), M(7, "M")], acc: "alberti", counter: "echo", dur: 70, wet: 0.22 },
    { pl: "acoustic", file: "feet-in-the-stream", title: "계곡물에 발 담그고", seed: 745, inst: "guitar", tonic: 71, scale: "lydian", bpm: 70, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(0, "M7"), M(2, "M")], progB: [M(4, "m"), M(9, "m"), M(7, "M"), M(2, "M")], acc: "arp", counter: "thirds", dur: 72, wet: 0.24 },
    { pl: "acoustic", file: "nap-in-the-camping-chair", title: "캠핑 의자에서 낮잠", seed: 749, inst: "guitar", tonic: 65, scale: "major", bpm: 64, meter: 3, progA: [M(0, "M"), M(5, "M"), M(2, "m"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(0, "M"), M(7, "sus2")], acc: "arp", counter: "line", dur: 72, wet: 0.26 },
    { pl: "acoustic", file: "stargazing-sunday-night", title: "별 보는 일요일 밤", seed: 1027, inst: "guitar", tonic: 66, scale: "dorian", bpm: 60, meter: 3, progA: [M(0, "m7"), M(2, "m"), M(3, "M7"), M(5, "M")], progB: [M(10, "M"), M(3, "M"), M(7, "m"), M(0, "m7")], acc: "arp", counter: "echo", dur: 72, wet: 0.26 },
    { pl: "acoustic", file: "night-before-monday", title: "캠핑 짐 싸는 일요일 오후", seed: 757, inst: "guitar", tonic: 63, scale: "dorian", bpm: 72, meter: 3, progA: [M(0, "m7"), M(5, "M"), M(0, "m7"), M(10, "M")], progB: [M(3, "M"), M(5, "M"), M(8, "M"), M(7, "m")], acc: "waltz", counter: "line", dur: 72, wet: 0.24 },
    { pl: "acoustic", file: "sunday-bike-ride", title: "자전거 타는 일요일", seed: 1029, inst: "guitar", tonic: 62, scale: "mixolydian", bpm: 104, meter: 4, progA: [M(0, "M"), M(5, "M"), M(10, "M"), M(5, "M")], progB: [M(7, "m"), M(10, "M"), M(2, "m"), M(0, "M")], acc: "strum", counter: "line", dur: 70, wet: 0.2 },
    { pl: "acoustic", file: "car-camping-by-the-sea", title: "바닷가 차박", seed: 765, inst: "guitar", tonic: 64, scale: "majPent", bpm: 76, meter: 4, progA: [M(0, "M"), M(9, "m"), M(5, "M"), M(5, "m")], progB: [M(4, "m"), M(9, "m"), M(2, "m"), M(7, "M")], acc: "block", counter: "echo", dur: 72, wet: 0.26 },
    { pl: "acoustic", file: "autumn-leaves-drive", title: "단풍 구경 드라이브", seed: 769, inst: "guitar", tonic: 70, scale: "dorian", bpm: 82, meter: 4, progA: [M(0, "m7"), M(10, "M"), M(5, "M"), M(7, "m")], progB: [M(3, "M7"), M(5, "M"), M(10, "M"), M(0, "m7")], acc: "alberti", counter: "line", dur: 70, wet: 0.22 },
    { pl: "acoustic", file: "watering-the-garden", title: "텃밭에 물 주는 아침", seed: 1031, inst: "guitar", tonic: 67, scale: "lydian", bpm: 84, meter: 3, progA: [M(0, "M7"), M(2, "M"), M(11, "m"), M(9, "m")], progB: [M(4, "m"), M(2, "M"), M(7, "M"), M(0, "M7")], acc: "strum", counter: "echo", dur: 72, wet: 0.24 },

    // 레트로 RPG
    { pl: "retro", file: "first-login-after-work", title: "퇴근 후 첫 접속", seed: 1041, inst: "retro", drums: 0.5, tonic: 62, scale: "lydian", bpm: 92, meter: 4, progA: [M(0, "M"), M(7, "M"), M(2, "M"), M(9, "m")], progB: [M(4, "m"), M(11, "m"), M(2, "M"), M(7, "M")], acc: "alberti", counter: "thirds", dur: 72, wet: 0.2 },
    { pl: "retro", file: "guild-meetup-friday", title: "길드 정모는 금요일", seed: 1107, inst: "retro", drums: 0.8, tonic: 70, scale: "major", bpm: 132, meter: 4, progA: [M(0, "M"), M(4, "m"), M(2, "m"), M(7, "M")], progB: [M(5, "M"), M(9, "m"), M(7, "M"), M(0, "M")], acc: "arp16", counter: "thirds", dur: 70, wet: 0.18 },
    { pl: "retro", file: "pajama-dungeon", title: "잠옷 입고 던전", seed: 1043, inst: "retro", drums: 0.7, tonic: 69, scale: "dorian", bpm: 112, meter: 4, progA: [M(0, "m7"), M(10, "M"), M(0, "m7"), M(5, "M")], progB: [M(3, "M"), M(7, "m"), M(5, "M"), M(10, "M")], acc: "arp16", counter: "line", dur: 72, bass2: true, wet: 0.2 },
    { pl: "retro", file: "late-night-snack-buff", title: "야식 버프", seed: 1047, inst: "retro", drums: 0.7, tonic: 66, scale: "major", bpm: 120, meter: 4, progA: [M(0, "M"), M(4, "m"), M(5, "M"), M(2, "m")], progB: [M(7, "M"), M(9, "m"), M(4, "m"), M(7, "7")], acc: "arp16", counter: "echo", dur: 70, wet: 0.2 },
    { pl: "retro", file: "daily-login-reward", title: "출석 보상 받는 밤", seed: 837, inst: "retro", tonic: 65, scale: "major", bpm: 88, meter: 3, progA: [M(0, "M"), M(4, "m"), M(9, "m"), M(5, "M")], progB: [M(2, "m"), M(7, "M"), M(0, "M"), M(7, "7")], acc: "waltz", counter: "thirds", dur: 72, wet: 0.22 },
    { pl: "retro", file: "quest-do-the-dishes", title: "퀘스트: 설거지하기", seed: 841, inst: "retro", drums: 0.7, tonic: 70, scale: "major", bpm: 120, meter: 4, progA: [M(0, "M"), M(2, "m"), M(5, "M"), M(7, "M")], progB: [M(9, "m"), M(5, "M"), M(2, "m"), M(7, "7")], acc: "alberti", counter: "echo", dur: 70, wet: 0.18 },
    { pl: "retro", file: "weekend-raid-lobby", title: "주말 레이드 대기실", seed: 845, inst: "retro", drums: 0.8, tonic: 66, scale: "dorian", bpm: 104, meter: 4, progA: [M(0, "m7"), M(5, "M"), M(10, "M"), M(0, "m7")], progB: [M(3, "M"), M(10, "M"), M(5, "M"), M(7, "m")], acc: "arp16", counter: "line", dur: 72, wet: 0.2 },
    { pl: "retro", file: "blacksmith-overtime", title: "마을 대장간의 야근", seed: 849, inst: "retro", drums: 0.5, tonic: 62, scale: "minor", bpm: 92, meter: 4, progA: [M(0, "m"), M(5, "m"), M(8, "M"), M(7, "M")], progB: [M(3, "M"), M(10, "M"), M(5, "m"), M(7, "M")], acc: "pulse", counter: "thirds", dur: 72, bass2: true, wet: 0.2 },
    { pl: "retro", file: "nap-at-the-inn", title: "여관에서 한숨 자기", seed: 1049, inst: "retro", tonic: 65, scale: "major", bpm: 70, meter: 3, progA: [M(0, "M"), M(2, "m7"), M(5, "M"), M(0, "M")], progB: [M(9, "m"), M(4, "m"), M(2, "m7"), M(7, "sus2")], acc: "waltz", counter: "echo", dur: 72, wet: 0.24 },
    { pl: "retro", file: "convenience-store-checkpoint", title: "편의점 앞 중간 저장", seed: 1103, inst: "retro", drums: 0.6, tonic: 60, scale: "majPent", bpm: 104, meter: 4, progA: [M(0, "M"), M(5, "M"), M(2, "m"), M(9, "m")], progB: [M(7, "M"), M(5, "M"), M(4, "m"), M(9, "m")], acc: "pulse", counter: "echo", dur: 72, wet: 0.2 },
    { pl: "retro", file: "max-level-monday", title: "만렙 찍은 월요일", seed: 861, inst: "retro", drums: 0.8, tonic: 73, scale: "lydian", bpm: 116, meter: 4, progA: [M(0, "M7"), M(2, "M"), M(0, "M7"), M(7, "M")], progB: [M(9, "m"), M(4, "m"), M(2, "M"), M(7, "M")], acc: "arp16", counter: "echo", dur: 70, wet: 0.18 },
    { pl: "retro", file: "alarm-before-the-boss", title: "보스 앞에서 울린 알람", seed: 865, inst: "retro", drums: 0.9, tonic: 63, scale: "minPent", bpm: 124, meter: 4, progA: [M(0, "m"), M(10, "M"), M(8, "M"), M(10, "M")], progB: [M(5, "m"), M(3, "M"), M(10, "M"), M(7, "m")], acc: "arp16", counter: "thirds", dur: 70, wet: 0.18 },
    { pl: "retro", file: "credits-and-cup-noodles", title: "엔딩 크레딧과 컵라면", seed: 1101, inst: "retro", tonic: 64, scale: "minor", bpm: 84, meter: 3, progA: [M(0, "m"), M(7, "m"), M(8, "M"), M(3, "M")], progB: [M(5, "m"), M(10, "M"), M(3, "M"), M(7, "M")], acc: "arp", counter: "line", dur: 72, wet: 0.22 },
  ].map((s) => ({ kbps: s.pl === "rain" || s.pl === "ambient" ? 80 : 64, ...s })),

  // 효과음(게임용, tracks.json에는 넣지 않는다)
  { pl: "sfx", file: "firework-launch", kind: "launch", seed: 501, dur: 1.2 },
  { pl: "sfx", file: "firework-burst", kind: "burst", seed: 503, dur: 2.0 },
  { pl: "sfx", file: "coin", kind: "coin", seed: 505, dur: 0.4 },
  { pl: "sfx", file: "flower", kind: "flower", seed: 507, dur: 0.8 },
  ...[
    ["bell", 4], ["splash", 1], ["swim", 1.6], ["bubble", 1.3], ["swing", 1.5], ["wave", 0.8], ["cheer", 2], ["hit", 0.25], ["crit", 0.5],
    ["monster-die", 0.8], ["levelup", 1.2], ["potion", 0.8], ["skill", 0.8], ["coin-drop", 0.8], ["defeat", 1.8], ["victory", 1.6], ["tick", 0.12], ["miss", 0.45],
    ["campfire", 16], ["say", 0.2],
  ].map(([kind, dur], k) => ({ pl: "sfx", file: kind, kind, seed: 520 + k, dur })),
  // 50번 조각배·광장 놀거리
  ...[["row", 0.9], ["boat-board", 0.75], ["seesaw", 0.5], ["boing", 0.6], ["wish", 1.6], ["carousel-loop", 9.6]].map(([kind, dur], k) => ({ pl: "sfx", file: kind, kind, seed: 600 + k, dur, kbps: kind === "carousel-loop" ? 64 : undefined })),
  // 사냥 손맛 (2·16·40번): 짧아서 64kbps면 충분하다
  ...[["kill", 0.6], ["swish", 0.2], ["thud", 0.4], ["stab", 0.2], ["clack", 0.12], ["twang", 0.32], ["flick", 0.22], ["ink", 0.45], ["warn", 0.26], ["slam", 0.6], ["roar", 1.2]].map(([kind, dur], k) => ({ pl: "sfx", file: kind, kind, seed: 700 + k, dur, kbps: 64 })),
  // 날씨(비·천둥): 용량을 아끼려고 56kbps
  { pl: "sfx", file: "rain-loop", kind: "rain-loop", seed: 560, dur: 12, kbps: 56 },
  { pl: "sfx", file: "thunder", kind: "thunder", seed: 562, dur: 8, kbps: 56 },
  ...EXTERNAL,
];

const engineOf = (s) =>
  s.ext ? "ext" : s.pl === "sfx" ? "sfx" : ["orgel", "piano", "chiptune", "acoustic", "retro"].includes(s.pl) ? "melody" : ["lofi", "jazz"].includes(s.pl) ? "band" : "ambient";
const planOf = (s) => (engineOf(s) === "melody" ? planOrgel(s) : engineOf(s) === "band" ? planLofi(s) : { dur: s.dur });
const outFile = (s) => (s.pl === "sfx" ? join(SFX_OUT, `${s.file}.mp3`) : join(OUT, s.pl, `${s.file}.mp3`));

function render(i) {
  const s = SPECS[i], t0 = Date.now(), eng = engineOf(s);
  if (eng === "ext") return { i, ...importExternal(s), sec: (Date.now() - t0) / 1000 };
  const pl = planOf(s);
  const { bus, master } = eng === "melody" ? orgel(s, pl) : eng === "band" ? lofi(s, pl) : eng === "sfx" ? sfx(s) : rain(s, pl);
  const st = finalize(bus, eng === "sfx" ? { ...master, target: master.target ?? SFX_LUFS, ceil: SFX_CEIL } : master);
  mkdirSync(eng === "sfx" ? SFX_OUT : join(OUT, s.pl), { recursive: true });
  encode(bus, outFile(s), s.seed, s.kbps);
  return { i, dur: pl.dur, bpm: pl.bpm, ...st, sec: (Date.now() - t0) / 1000 };
}

const probeDur = (f) => Math.round(parseFloat(execFileSync(process.env.FFPROBE || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString()));
// 자체 제작곡 사이사이에 외부 곡을 고르게 섞는다
function ordered(id) {
  const g = SPECS.filter((s) => s.pl === id && !s.ext), e = SPECS.filter((s) => s.pl === id && s.ext && existsSync(outFile(s)));
  const out = [], total = g.length + e.length;
  for (let k = 0, gi = 0, ei = 0; k < total; k++) out.push(ei < e.length && (gi >= g.length || Math.floor(((k + 1) * e.length) / total) > ei) ? e[ei++] : g[gi++]);
  return out;
}
function writeManifest() {
  const row = (o) => `{ ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }`;
  const current = JSON.parse(readFileSync(join(OUT, "tracks.json"), "utf8")).playlists;
  const lists = PLAYLISTS.map((p) => {
    const kept = PIXABAY_LISTS.has(p.id) ? current.find((c) => c.id === p.id) : null;
    if (PIXABAY_LISTS.has(p.id) && !kept) throw new Error(`tracks.json에 ${p.id} 목록이 없다 (픽사베이 곡은 직접 넣는다)`);
    const tracks = kept ? kept.tracks.map(row) : ordered(p.id).map((s) =>
      row({ file: `/bgm/${s.pl}/${s.file}.mp3`, title: s.title, artist: s.artist ?? ARTIST, sourceUrl: s.sourceUrl ?? "", license: s.license ?? "CC0", durationSec: s.ext ? probeDur(outFile(s)) : planOf(s).dur }),
    );
    return `    {\n      "id": ${JSON.stringify(p.id)},\n      "title": ${JSON.stringify(p.title)},\n      "tracks": [\n${tracks.map((t) => `        ${t}`).join(",\n")}\n      ]\n    }`;
  });
  writeFileSync(join(OUT, "tracks.json"), `{\n  "playlists": [\n${lists.join(",\n")}\n  ]\n}\n`);
}

if (isMainThread) {
  const args = process.argv.slice(2), fetchExt = args.includes("--fetch"), missing = args.includes("--missing"), filter = args.find((a) => !a.startsWith("--"));
  const ids = SPECS.map((_, i) => i).filter(
    (i) => !PIXABAY_LISTS.has(SPECS[i].pl) && (fetchExt || !SPECS[i].ext) && (!filter || `${SPECS[i].pl}/${SPECS[i].file}`.includes(filter)) && !(missing && existsSync(outFile(SPECS[i]))),
  );
  if (!ids.length && !missing) throw new Error(`no track matches "${filter}"`);
  const W = Math.min(Math.max(1, ids.length), Math.max(1, Math.min(8, availableParallelism() - 2)));
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
              console.log(`${`${s.pl}/${s.file}`.padEnd(36)} ${String(m.dur).padStart(4)}s ${m.bpm ? `${m.bpm}bpm` : "     "}  ${m.lufs.toFixed(2)} LUFS  peak ${m.peak.toFixed(2)} dB  limit ${m.gr.toFixed(2)} dB  (${m.sec.toFixed(1)}s)`);
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
    const extMissing = SPECS.filter((s) => s.ext && !PIXABAY_LISTS.has(s.pl) && !existsSync(outFile(s)));
    if (extMissing.length) console.warn(`외부 곡 ${extMissing.length}개가 아직 없다 → node scripts/gen-bgm.mjs --fetch`);
    writeManifest();
    // 목록에 없는 예전 파일은 지운다(BGM 폴더만)
    for (const p of PLAYLISTS.filter((pl) => !PIXABAY_LISTS.has(pl.id))) {
      const keep = new Set(SPECS.filter((s) => s.pl === p.id).map((s) => `${s.file}.mp3`));
      mkdirSync(join(OUT, p.id), { recursive: true });
      for (const f of readdirSync(join(OUT, p.id))) if (f.endsWith(".mp3") && !keep.has(f)) rmSync(join(OUT, p.id, f));
    }
    console.log("wrote tracks.json");
  }
} else {
  for (const i of workerData) parentPort.postMessage(render(i));
}

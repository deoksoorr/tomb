import { describe, expect, it, vi } from "vitest";
import { SKILL_FX, SKILL_IDS, skillById, type SkillId } from "@/lib/rpg/skillTree";
import { skillPower } from "./skillMoves";
import {
  fillCrackle,
  fillImpulse,
  fillNoise,
  hasSkillSound,
  LIMIT_CEILING,
  rngOf,
  skillSound,
  SOUND_LIMITS,
  soundEnd,
  soundSignature,
  ultimateSequence,
  ULTIMATES,
  type Layer,
  type SoundEv,
  type UltId,
} from "./skillSound";

// 스킬 소리 설계 검사: 33종 모두 있고 서로 다른지, 등급(단·랭크)이 오를수록 무거워지는지, 궁극기 시퀀스 길이,
// 그리고 브라우저 없이 겹들을 직접 렌더해(오실레이터·잡음·바이쿼드 필터·엔벨로프·좌우·잔향 컨볼루션·리미터 곡선) 길이·최대 음량을 잰다.
// SKILL_SOUND_REPORT=1 이면 스킬별 수치 표를 찍는다.

// 단·랭크 계수(skillPower)는 연출 파일에서 가져온다 — 그 파일이 부르는 Phaser·그림은 가짜로
vi.mock("phaser", () => ({}));
vi.mock("./skillFx", () => ({ PALETTES: { ember: {}, frost: {}, soul: {} }, SKT: {}, DEPTH_FX: 0, DEPTH_GROUND: 0, pick: () => 0, rnd: () => 0 }));
vi.mock("./skillArt", () => ({ art: () => "" }));

const EVS: SoundEv[] = ["cast", "hit", "tick"];
const KS = [0.75, 0.9, 1.05, 1.2, 1.35, 1.5];
const isUlt = (id: SkillId): id is UltId => (ULTIMATES as readonly string[]).includes(id);
const ultFx = (id: UltId, lv: number) => SKILL_FX[id](lv);

/** 스킬 하나의 소리 묶음 (궁극기는 전체 시퀀스, 나머지는 있는 사건 전부) */
function allSounds(id: SkillId, k: number): Layer[][] {
  if (isUlt(id)) return [ultimateSequence(id, k, ultFx(id, 3).hitAt)];
  return EVS.filter((ev) => hasSkillSound(id, ev)).map((ev) => skillSound(id, ev, k, ev === "cast" ? { n: 3, ms: 700 } : { i: 1 }));
}

// ── 순수 렌더 (Web Audio와 같은 식) ──
const SR = 24000;
const IR_SECS = 2.2;
const NOISE = (() => {
  const d = new Float32Array(SR * 2);
  fillNoise(d, rngOf("noise"));
  return d;
})();
const CRACKLE = (() => {
  const d = new Float32Array(SR * 2);
  fillCrackle(d, SR, rngOf("crackle"));
  return d;
})();
const IR = (() => {
  const d = new Float32Array(Math.floor(SR * IR_SECS));
  fillImpulse([d], SR, rngOf("ir"), IR_SECS);
  return d;
})();

const wave = (w: string, ph: number) => {
  const x = ph - Math.floor(ph);
  if (w === "square") return x < 0.5 ? 1 : -1;
  if (w === "sawtooth") return 2 * x - 1;
  if (w === "triangle") return x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
  return Math.sin(2 * Math.PI * x);
};

/** 엔벨로프 (sfx.ts layerNode와 같은 모양) */
function envAt(l: Layer, t: number): number {
  const dur = Math.max(0.02, l.dur);
  const pk = Math.max(0.0002, l.gain);
  const lo = 0.0001;
  const exp = (a: number, b: number, x: number) => a * (b / a) ** Math.max(0, Math.min(1, x));
  if (l.env === "swell") {
    const tp = dur * 0.92;
    return t < tp ? exp(lo, pk, t / tp) : pk + (lo - pk) * ((t - tp) / (dur - tp));
  }
  const atk = Math.min(dur * 0.9, Math.max(0.001, l.atk));
  if (t < atk) return lo + (pk - lo) * (t / atk);
  const hold = l.env === "hold" ? Math.max(atk, dur * 0.6) : atk;
  if (t < hold) return pk;
  return exp(pk, lo, (t - hold) / (dur - hold));
}

function biquad(type: string, f: number, q: number) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.49)) / SR;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  // Web Audio: lowpass·highpass의 Q는 dB(공명), bandpass는 배수
  const alpha = type === "bandpass" ? sn / (2 * Math.max(0.0001, q)) : sn / (2 * 10 ** (q / 20));
  let b0: number, b1: number, b2: number;
  if (type === "lowpass") [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
  else if (type === "highpass") [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cs) / a0, a2: (1 - alpha) / a0 };
}

function fft(re: Float64Array, im: Float64Array, inv: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const ai = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j + len / 2] = re[i + j] - ar;
        im[i + j + len / 2] = im[i + j] - ai;
        re[i + j] += ar;
        im[i + j] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (!inv) return;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

type Render = { len: number; tail: number; dryPeak: number; peak: number; rms: number };

/** 겹들을 소리로 렌더: 길이(초, 잔향 꼬리가 -60dB 아래로 내려가는 데까지), 버스 입력 최대값(dry+wet), 리미터 뒤 최대값, RMS */
function render(ls: Layer[]): Render {
  const end = soundEnd(ls);
  const n = Math.ceil((end + IR_SECS) * SR);
  const L = new Float64Array(n);
  const Rr = new Float64Array(n);
  const wetIn = new Float64Array(n);
  for (const l of ls) {
    const s0 = Math.floor(l.at * SR);
    const dur = Math.max(0.02, l.dur);
    const cnt = Math.floor(dur * SR);
    let ph = 0;
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    let co = l.flt ? biquad(l.flt.type, l.flt.f0, l.flt.q) : null;
    const x = ((l.pan ?? 0) + 1) / 2;
    const gl = l.pan ? Math.cos((x * Math.PI) / 2) : 1;
    const gr = l.pan ? Math.sin((x * Math.PI) / 2) : 1;
    const off = (l.at * 7919) % 1.5;
    for (let i = 0; i < cnt && s0 + i < n; i++) {
      const t = i / SR;
      const lfo = l.lfo ? Math.sin(2 * Math.PI * l.lfo.hz * t) * l.lfo.cents : 0;
      let v: number;
      if (l.src === "osc") {
        const f0 = l.f0 ?? 440;
        const f1 = l.f1 ?? f0;
        const g = Math.min(dur, l.glide ?? dur);
        const f = f0 * (f1 / f0) ** Math.min(1, t / g) * 2 ** (((l.det ?? 0) + (l.lfo?.on === "pitch" ? lfo : 0)) / 1200);
        ph += f / SR;
        v = wave(l.wave ?? "sine", ph);
      } else {
        const buf = l.src === "noise" ? NOISE : CRACKLE;
        v = buf[(Math.floor(off * SR) + i) % buf.length];
      }
      if (l.flt) {
        if (i % 32 === 0) {
          const f = l.flt.f0 * (l.flt.f1 / l.flt.f0) ** (t / dur) * 2 ** ((l.lfo && (l.lfo.on === "filter" || l.src !== "osc") ? lfo : 0) / 1200);
          co = biquad(l.flt.type, f, l.flt.q);
        }
        const c = co!;
        const y = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1;
        x1 = v;
        y2 = y1;
        y1 = y;
        v = y;
      }
      v *= envAt(l, t);
      L[s0 + i] += v * gl;
      Rr[s0 + i] += v * gr;
      if (l.verb) wetIn[s0 + i] += ((v * (gl + gr)) / 2) * l.verb;
    }
  }
  // 잔향: 임펄스와 컨볼루션 (FFT)
  let m = 1;
  while (m < n + IR.length) m <<= 1;
  const ar = new Float64Array(m);
  const ai = new Float64Array(m);
  const br = new Float64Array(m);
  const bi = new Float64Array(m);
  ar.set(wetIn);
  for (let i = 0; i < IR.length; i++) br[i] = IR[i];
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < m; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
  }
  fft(ar, ai, true);
  let dryPeak = 0;
  let peak = 0;
  let sq = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    for (const v0 of [L[i] + ar[i], Rr[i] + ar[i]]) {
      const a = Math.abs(v0);
      dryPeak = Math.max(dryPeak, a);
      // 버스: 입력 0.75 → 컴프레서(자동 보정 이득 ≈ 1.36, 임계 아래는 거의 그대로) → 리미터 곡선
      const out = Math.abs(LIMIT_CEILING * Math.tanh((v0 * 0.75 * 1.36) / LIMIT_CEILING));
      peak = Math.max(peak, out);
      sq += out * out;
      if (out > 0.001) last = i;
    }
  }
  return { len: end, tail: last / SR, dryPeak, peak, rms: Math.sqrt(sq / (2 * n)) };
}

describe("스킬 소리 33종", () => {
  it("33종 모두 소리 설계가 있다", () => {
    expect(SKILL_IDS.length).toBe(33);
    for (const id of SKILL_IDS) {
      const sounds = allSounds(id, 1);
      expect(sounds.length, id).toBeGreaterThan(0);
      for (const s of sounds) expect(s.length, id).toBeGreaterThan(0);
    }
  });

  it("스킬마다 소리가 다르다 (매개변수 서명 비교, 등급마다)", () => {
    for (const k of [0.75, 1.1, 1.5]) {
      const sig = new Map<string, SkillId>();
      for (const id of SKILL_IDS) {
        const s = allSounds(id, k).map(soundSignature).join("#");
        expect(sig.get(s), `${id}와 ${sig.get(s)}가 같다`).toBeUndefined();
        sig.set(s, id);
      }
      expect(sig.size).toBe(33);
    }
    // 첫 사건(주된 소리)끼리도 서로 다르다
    const first = new Set(SKILL_IDS.map((id) => soundSignature(allSounds(id, 1)[0])));
    expect(first.size).toBe(33);
  });

  it("등급(단·랭크)이 오를수록 겹수·저음 무게·잔향·음량·길이가 는다", () => {
    const metric = (ls: Layer[]) => ({
      layers: ls.length,
      energy: ls.reduce((s, l) => s + l.gain * l.gain * l.dur, 0),
      low: ls.filter((l) => l.src === "osc" && Math.min(l.f0 ?? 1e9, l.f1 ?? 1e9) < 120).reduce((s, l) => s + l.gain, 0),
      verb: Math.max(...ls.map((l) => l.verb ?? 0)),
      end: soundEnd(ls),
    });
    for (const id of SKILL_IDS) {
      const evs: [SoundEv, object][] = isUlt(id) ? [["cast", { ms: 820 }], ["hit", { i: 0 }], ["hit", { i: 4, last: true }]] : EVS.filter((ev) => hasSkillSound(id, ev)).map((ev) => [ev, {}]);
      for (const [ev, o] of evs) {
        const ms = KS.map((k) => metric(skillSound(id, ev, k, o)));
        for (let i = 1; i < ms.length; i++) {
          const a = ms[i - 1];
          const b = ms[i];
          const tag = `${id}.${ev} k=${KS[i]}`;
          expect(b.layers, tag).toBeGreaterThanOrEqual(a.layers);
          expect(b.energy, tag).toBeGreaterThan(a.energy);
          expect(b.low, tag).toBeGreaterThanOrEqual(a.low);
          expect(b.verb, tag).toBeGreaterThan(a.verb);
          expect(b.end, tag).toBeGreaterThanOrEqual(a.end - 1e-9);
        }
        // 1단 1랭크 → 5단 만랭크: 겹이 늘고 저음이 확실히 무거워진다
        expect(ms[5].layers, id).toBeGreaterThan(ms[0].layers);
        expect(ms[5].low, id).toBeGreaterThan(ms[0].low);
      }
    }
    // 실제 단·랭크 계수 순서와도 맞다 (같은 스킬, 랭크가 오르면 더 무겁다)
    const def = skillById("em_kindle")!;
    const e = (lv: number) => skillSound("em_kindle", "hit", skillPower(def.tier, lv, def.maxLevel)).reduce((s, l) => s + l.gain * l.gain * l.dur, 0);
    expect(e(5)).toBeGreaterThan(e(1));
  });

  it("궁극기: 기 모으기 → 첫 박자 폭발 → 박자마다 타격 → 여파, 연출 길이(2.3~2.4초)에 맞는다", () => {
    for (const id of ULTIMATES) {
      for (const lv of [1, 2, 3]) {
        const fx = ultFx(id, lv);
        const def = skillById(id)!;
        const k = skillPower(def.tier, lv, def.maxLevel);
        const seq = ultimateSequence(id, k, fx.hitAt);
        const t0 = fx.hitAt[0] / 1000;
        const tEnd = fx.hitAt[fx.hitAt.length - 1] / 1000;
        const end = soundEnd(seq);
        // 전체: 연출(castMs)보다 짧지 않고, 여파 잔향까지 2초 안에 끝난다
        expect(end, id).toBeGreaterThanOrEqual(fx.castMs / 1000);
        expect(end, id).toBeLessThanOrEqual(Math.min(SOUND_LIMITS.ultMaxLen, fx.castMs / 1000 + 2));
        // 기 모으기: 첫 폭발 전에 심장 박동(낮은 사인)이 여러 번, 상승음은 위로 휜다
        const pre = seq.filter((l) => l.at < t0 - 0.01);
        expect(pre.filter((l) => l.src === "osc" && (l.f0 ?? 0) <= 80 && l.dur < 0.3).length, id).toBeGreaterThanOrEqual(8);
        expect(pre.some((l) => l.env === "swell" && (l.f1 ?? 0) > (l.f0 ?? 0) * 3), id).toBe(true);
        // 폭발 (첫 박자·마지막 박자): 서브 베이스 쿵 + 넓은 잡음 + 고음 쨍
        for (const tb of [t0, tEnd]) {
          const at = seq.filter((l) => Math.abs(l.at - tb) < 0.005);
          expect(at.some((l) => l.src === "osc" && (l.f1 ?? 1e9) <= 40 && l.dur >= 1), `${id} 서브 ${tb}`).toBe(true);
          expect(at.some((l) => l.src === "noise" && l.dur >= 1 && (l.flt?.f0 ?? 0) >= 6000), `${id} 잡음 ${tb}`).toBe(true);
          expect(at.some((l) => l.src === "osc" && (l.f0 ?? 0) >= 2500), `${id} 쨍 ${tb}`).toBe(true);
        }
        // 박자마다 소리가 있다
        for (const ms of fx.hitAt) expect(seq.some((l) => Math.abs(l.at - ms / 1000) < 0.005), `${id} ${ms}`).toBe(true);
        // 여파: 마지막 박자 뒤 1.5초 넘게 이어지는 겹
        expect(seq.some((l) => l.at > tEnd && l.at + l.dur > tEnd + 1.5), id).toBe(true);
      }
    }
  });

  it("렌더: 모든 스킬 소리의 길이·최대 음량이 상한 안", () => {
    const rows: string[] = [];
    const bad: string[] = [];
    for (const id of SKILL_IDS) {
      const def = skillById(id)!;
      for (const lv of [1, def.maxLevel]) {
        const k = skillPower(def.tier, lv, def.maxLevel);
        allSounds(id, k).forEach((ls, j) => {
          const r = render(ls);
          const max = isUlt(id) ? SOUND_LIMITS.ultMaxLen : SOUND_LIMITS.maxLen;
          // 한 번의 소리는 리미터를 세게 때리지 않게 설계한다 (버스 입력 최대 1.0 이하, 궁극기 1.6 이하)
          if (r.len > max) bad.push(`${id}.${j} 길이 ${r.len}`);
          if (r.peak > LIMIT_CEILING) bad.push(`${id}.${j} 출력 최대 ${r.peak}`);
          if (r.dryPeak > (isUlt(id) ? 1.6 : 1.0)) bad.push(`${id}.${j} 랭크${lv} 입력 최대 ${r.dryPeak.toFixed(3)}`);
          if (r.peak < 0.02) bad.push(`${id}.${j} 너무 작다 ${r.peak}`);
          rows.push(`${id.padEnd(14)} ${String(j).padEnd(2)} 단${def.tier} 랭크${lv} k=${k.toFixed(2)} 겹${String(ls.length).padStart(3)} 길이${r.len.toFixed(2)}s 꼬리${r.tail.toFixed(2)}s 입력최대${r.dryPeak.toFixed(2)} 출력최대${r.peak.toFixed(2)} RMS${r.rms.toFixed(3)}`);
        });
      }
    }
    if (process.env.SKILL_SOUND_REPORT) console.log(rows.join("\n"));
    expect(bad).toEqual([]);
  }, 60_000);

  it("렌더: 같은 스킬은 등급이 높을수록 크다 (RMS)", () => {
    for (const id of ["em_kindle", "fr_nova", "so_chain", "em_meteor", "so_harvest"] as SkillId[]) {
      const ev: SoundEv = hasSkillSound(id, "hit") ? "hit" : hasSkillSound(id, "tick") ? "tick" : "cast";
      const lo = render(skillSound(id, ev, 0.75, { i: 0 }));
      const hi = render(skillSound(id, ev, 1.5, { i: 0 }));
      expect(hi.rms, id).toBeGreaterThan(lo.rms);
      expect(hi.tail, id).toBeGreaterThan(lo.tail);
    }
  }, 30_000);
});

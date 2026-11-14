import { releaseOnEnd } from "@/lib/sharedAudio";
import { AudioHost } from "../world/audioHost";

// 귀신의집 소리 (파일 없이 WebAudio로 합성). 13번: 전부 효과음 갈래(sfx 버스, audio:mix)의 크기를 따른다.
//  - 바탕: 낮게 웅웅거리는 공기 + 먼 바람 (들어가 있는 동안 계속)
//  - 바닥 삐걱임 · 멀리서 속삭임(좌우 어디선가) · 심장 박동 · 촛불 꺼지는 "후" · 그림자 스치는 소리
//  - 비명: 높은 음이 미끄러져 올라갔다 떨어지며 떨림 + 잡음. 끝단에 압축기(리미터)를 둬서 귀가 아프지 않게 크기를 묶는다
//  - 쿵: 낮게 떨어지는 사인파 + 낮게 거른 잡음
//  - 귀신마다 비명 목소리(ScreamVoice)와 다가올 때 나는 소리가 다르다: 밧줄 삐걱·킥킥 웃음·바닥 두드림·뼈 꺾이는 소리·
//    유리 깨짐·벽 긁기·숨소리·문 쾅·나무 마디 딱·구르는 소리·오르골·으르렁·순간이동 쉭. 모두 같은 리미터를 지난다

/** 비명 목소리 (귀신마다 다르다). 크기는 모두 원래 비명(wail)과 같게 묶는다 */
export type ScreamVoice = "wail" | "child" | "growl" | "shriek" | "choir" | "stutter" | "low";

type VoiceSpec = {
  /** 시작 → 꼭대기 → 버팀 → 끝 높이 (Hz) */
  f: readonly [number, number, number, number];
  /** 떨림 빠르기 시작·끝 (Hz) 과 깊이 (Hz) */
  vib: readonly [number, number];
  depth: number;
  /** 고음 깎기 (Hz) */
  lp: number;
  dur: number;
  /** 갈라지는 잡음 띠 시작·끝 (Hz) */
  noise: readonly [number, number];
  /** 여러 목소리가 겹치는 배수 (합창) */
  voices?: readonly number[];
  /** 끊겼다 이어졌다 하는 빠르기 (Hz) */
  gate?: number;
};

const VOICES: Record<ScreamVoice, VoiceSpec> = {
  wail: { f: [700, 1650, 1380, 820], vib: [7, 13], depth: 55, lp: 3600, dur: 1.25, noise: [2400, 1300] },
  child: { f: [1000, 2000, 1750, 1150], vib: [10, 17], depth: 70, lp: 3800, dur: 1.0, noise: [3000, 1800] },
  growl: { f: [150, 240, 190, 80], vib: [5, 9], depth: 18, lp: 1500, dur: 1.4, noise: [800, 300] },
  shriek: { f: [1250, 2250, 2050, 1400], vib: [18, 24], depth: 110, lp: 3800, dur: 0.95, noise: [3400, 2200] },
  choir: { f: [560, 1250, 1100, 640], vib: [6, 10], depth: 40, lp: 3200, dur: 1.4, noise: [2000, 1000], voices: [1, 0.74, 1.33] },
  stutter: { f: [520, 1300, 1100, 520], vib: [6, 12], depth: 45, lp: 3400, dur: 1.2, noise: [2200, 1100], gate: 13 },
  low: { f: [380, 900, 820, 420], vib: [4, 8], depth: 30, lp: 3000, dur: 1.3, noise: [1600, 800] },
};

export class HauntSound extends AudioHost {
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bed: { stop(): void } | null = null;

  /** 모든 소리가 지나가는 끝단: 볼륨 → 리미터 → 스피커 */
  private out(ac: AudioContext): GainNode {
    if (!this.master) {
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const g = ac.createGain();
      g.gain.value = this.volume;
      g.connect(comp).connect(this.output);
      this.master = g;
    }
    return this.master;
  }

  protected onMixChanged(): void {
    const ac = this.context;
    if (this.master && ac) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ac.currentTime, 0.05);
  }

  private noiseBuf(ac: AudioContext): AudioBuffer {
    if (!this.noise) {
      const n = Math.floor(ac.sampleRate * 2);
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private panner(ac: AudioContext, pan: number): AudioNode {
    if (typeof ac.createStereoPanner !== "function") return this.out(ac);
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.out(ac));
    return p;
  }

  /** 들어가 있는 동안 계속 깔리는 웅웅거림·바람 */
  startBed(): void {
    if (this.bed) return;
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 2.5);
    g.connect(this.out(ac));
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    lp.connect(g);
    const oscs = [41, 55.3, 61.7].map((f, i) => {
      const o = ac.createOscillator();
      o.type = i === 1 ? "triangle" : "sine";
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = i === 0 ? 0.9 : 0.35;
      o.connect(og).connect(lp);
      o.start(t);
      return o;
    });
    // 바람: 띠로 거른 잡음을 느리게 흔든다
    const wind = ac.createBufferSource();
    wind.buffer = this.noiseBuf(ac);
    wind.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.8;
    const wg = ac.createGain();
    wg.gain.value = 0.18;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ac.createGain();
    lg.gain.value = 220;
    lfo.connect(lg).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(g);
    wind.start(t);
    lfo.start(t);
    this.bed = {
      stop: () => {
        const now = ac.currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + 0.6);
        for (const o of [...oscs, lfo]) o.stop(now + 0.7);
        wind.stop(now + 0.7);
      },
    };
  }

  stopBed(): void {
    this.bed?.stop();
    this.bed = null;
  }

  /** 심장 박동 (쿵-쿵). k 0..1 = 얼마나 급한지 (클수록 크게) */
  heartbeat(k: number): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const v = 0.35 + 0.45 * k;
    this.thump(ac, t, v, 62);
    this.thump(ac, t + 0.2, v * 0.7, 54);
  }

  private thump(ac: AudioContext, t: number, v: number, f: number): void {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.out(ac));
    o.start(t);
    o.stop(t + 0.25);
  }

  /** 바닥 삐걱임 (낡은 마루가 천천히 휘는 소리). pan -1..1 */
  creak(pan = 0, v = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const dur = 0.45 + Math.random() * 0.5;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    const f0 = 140 + Math.random() * 90;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.25), t + dur);
    // 마찰처럼 들리게 진폭을 잘게 떤다
    const trem = ac.createOscillator();
    trem.type = "square";
    trem.frequency.value = 26 + Math.random() * 18;
    const tg = ac.createGain();
    tg.gain.value = 0.5;
    const am = ac.createGain();
    am.gain.value = 0.5;
    trem.connect(tg).connect(am.gain);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 3;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * v, t + 0.08);
    g.gain.linearRampToValueAtTime(0.07 * v, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(am).connect(bp).connect(g).connect(this.panner(ac, pan));
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.05);
    trem.stop(t + dur + 0.05);
  }

  /** 멀리서 속삭임: 숨소리 같은 잡음에 모음 같은 띠를 옮겨 가며 (좌우 어딘가) */
  whisper(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const dur = 1.2 + Math.random() * 0.9;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 6;
    // 음절처럼 띠가 오르내린다
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i <= n; i++) bp.frequency.setValueAtTime(1800 + Math.random() * 2600, t + (dur * i) / n);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const a = t + (dur * i) / n;
      g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, a + 0.06);
      g.gain.linearRampToValueAtTime(0.01, a + (dur / n) * 0.9);
    }
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(hp).connect(bp).connect(g).connect(this.panner(ac, pan));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** 촛불이 꺼지는 "후" */
  puff(): void {
    const ac = this.audio();
    if (!ac) return;
    this.hiss(ac, ac.currentTime + 0.01, 0.35, 900, 300, 0.12, 0);
  }

  /** 그림자가 스치는 소리 (휙). pan: 지나가는 쪽 */
  swoosh(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    this.hiss(ac, ac.currentTime + 0.01, 0.5, 300, 1400, 0.1, pan);
  }

  private hiss(ac: AudioContext, t: number, dur: number, f0: number, f1: number, v: number, pan: number): void {
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(g).connect(this.panner(ac, pan));
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** 비명: 높은 음이 미끄러지며 떨린다 + 거친 잡음. 리미터를 거쳐 너무 크지 않게 (목소리마다 크기는 같다) */
  scream(voice: ScreamVoice = "wail"): void {
    const ac = this.audio();
    if (!ac) return;
    const v = VOICES[voice];
    const t = ac.currentTime + 0.005;
    const dur = v.dur;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // 날카로운 고음을 조금 깎아 귀가 아프지 않게
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = v.lp;
    // 끊기는 목소리: 네모파로 크기를 잘게 자른다 (0.25..1)
    let gate: GainNode | null = null;
    let gateOsc: OscillatorNode | null = null;
    if (v.gate) {
      gate = ac.createGain();
      gate.gain.value = 0.625;
      gateOsc = ac.createOscillator();
      gateOsc.type = "square";
      gateOsc.frequency.value = v.gate;
      const gd = ac.createGain();
      gd.gain.value = 0.375;
      gateOsc.connect(gd).connect(gate.gain);
      lp.connect(gate).connect(g).connect(this.out(ac));
      gateOsc.start(t);
      gateOsc.stop(t + dur + 0.05);
    } else lp.connect(g).connect(this.out(ac));
    // 떨림 (비브라토)
    const lfo = ac.createOscillator();
    lfo.frequency.setValueAtTime(v.vib[0], t);
    lfo.frequency.linearRampToValueAtTime(v.vib[1], t + dur);
    const lfoG = ac.createGain();
    lfoG.gain.value = v.depth;
    lfo.connect(lfoG);
    const voices = v.voices ?? [1];
    const share = 1 / Math.sqrt(voices.length);
    for (const vm of voices) {
      for (const [type, mul, vol] of [
        ["sawtooth", 1, 0.32],
        ["sawtooth", 1.013, 0.24],
        ["square", 0.497, 0.12],
      ] as const) {
        const m = mul * vm;
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(v.f[0] * m, t);
        o.frequency.exponentialRampToValueAtTime(v.f[1] * m, t + dur * 0.15);
        o.frequency.linearRampToValueAtTime(v.f[2] * m, t + dur * 0.48);
        o.frequency.exponentialRampToValueAtTime(v.f[3] * m, t + dur);
        lfoG.connect(o.frequency);
        const og = ac.createGain();
        og.gain.value = vol * share;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 0.05);
        releaseOnEnd(o, og);
      }
    }
    // 목이 갈라지는 잡음
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(v.noise[0], t);
    bp.frequency.exponentialRampToValueAtTime(v.noise[1], t + dur);
    bp.Q.value = 1.4;
    const ng = ac.createGain();
    ng.gain.value = 0.35;
    src.connect(bp).connect(ng).connect(lp);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    releaseOnEnd(src, bp, ng);
    lfo.start(t);
    lfo.stop(t + dur + 0.06);
    releaseOnEnd(lfo, lfoG, lp, g, ...(gate ? [gate] : []), ...(gateOsc ? [gateOsc] : []));
  }

  // ── 귀신마다 다른 소리 (다가올 때·나타날 때) ──

  /** 짧은 잡음 한 번 (띠 거름). 여러 소리의 재료 */
  private burst(ac: AudioContext, t: number, dur: number, type: BiquadFilterType, f: number, q: number, v: number, pan: number, f1 = f): void {
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = this.panner(ac, pan);
    src.connect(fl).connect(g).connect(p);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
    releaseOnEnd(src, fl, g, ...(p === this.master ? [] : [p]));
  }

  /** 짧은 음 하나 (사인·세모 등). 여러 소리의 재료 */
  private tone(ac: AudioContext, t: number, dur: number, type: OscillatorType, f0: number, f1: number, v: number, pan: number): void {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const p = this.panner(ac, pan);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + dur + 0.02);
    releaseOnEnd(o, g, ...(p === this.master ? [] : [p]));
  }

  /** 천장의 여자: 밧줄이 무게에 끌려 삐걱 + 머리카락 쓸리는 소리 */
  rope(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    for (let i = 0; i < 3; i++) this.tone(ac, t + i * 0.16, 0.22, "sawtooth", 120 - i * 8, 95 - i * 8, 0.05, pan);
    this.burst(ac, t + 0.1, 0.6, "highpass", 3000, 0.7, 0.07, pan);
  }

  /** 기어 오는 아이: 낮게 킥킥거리는 웃음 */
  giggle(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 820 + Math.random() * 160 - i * 30;
      this.tone(ac, t + i * 0.12, 0.1, "triangle", f, f * 0.82, 0.06, pan);
      this.burst(ac, t + i * 0.12, 0.08, "bandpass", 2600, 3, 0.03, pan);
    }
  }

  /** 바닥을 손바닥으로 두드리는 소리 (기어 오는 걸음) */
  knock(pan = 0, n = 2): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    for (let i = 0; i < n; i++) {
      const a = t + i * (0.09 + Math.random() * 0.05);
      this.tone(ac, a, 0.12, "sine", 190, 80, 0.22, pan);
      this.burst(ac, a, 0.06, "lowpass", 700, 0.7, 0.12, pan);
    }
  }

  /** 목 꺾인 것: 뼈마디가 뚝뚝 꺾이는 소리 */
  bones(pan = 0, n = 2): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    for (let i = 0; i < n; i++) {
      const a = t + i * (0.05 + Math.random() * 0.06);
      this.burst(ac, a, 0.035, "bandpass", 2200 + Math.random() * 1400, 2.5, 0.22, pan);
      this.tone(ac, a, 0.05, "square", 320 + Math.random() * 120, 200, 0.05, pan);
    }
  }

  /** 거울: 유리에 금이 가며 깨지는 소리 */
  glass(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    this.burst(ac, t, 0.4, "highpass", 4200, 0.8, 0.16, pan);
    for (let i = 0; i < 7; i++) this.tone(ac, t + Math.random() * 0.25, 0.3 + Math.random() * 0.4, "sine", 2400 + Math.random() * 2200, 2200 + Math.random() * 1800, 0.035, pan + (Math.random() - 0.5) * 0.6);
  }

  /** 벽 속의 손: 손톱으로 벽을 긁는 소리 여럿 */
  scratch(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    for (let i = 0; i < 5; i++) {
      const p = pan + (i % 2 ? -0.5 : 0.5) * Math.random();
      this.burst(ac, t + i * 0.09, 0.25 + Math.random() * 0.2, "bandpass", 1800 + Math.random() * 1600, 4, 0.1, p, 1200 + Math.random() * 800);
    }
  }

  /** 문틈의 눈: 바로 곁에서 들리는 숨소리 (들이쉬고 내쉰다) */
  breath(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const one = (a: number, d: number, f0: number, f1: number, v: number) => {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf(ac);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.5;
      bp.frequency.setValueAtTime(f0, a);
      bp.frequency.linearRampToValueAtTime(f1, a + d);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(v, a + d * 0.6);
      g.gain.linearRampToValueAtTime(0, a + d);
      const p = this.panner(ac, pan);
      src.connect(bp).connect(g).connect(p);
      src.start(a, Math.random());
      src.stop(a + d + 0.02);
      releaseOnEnd(src, bp, g, ...(p === this.master ? [] : [p]));
    };
    one(t, 0.9, 500, 1300, 0.09);
    one(t + 1.0, 0.7, 1100, 450, 0.07);
  }

  /** 문이 쾅 열린다 */
  bang(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    this.tone(ac, t, 0.4, "sine", 150, 45, 0.5, pan);
    this.burst(ac, t, 0.25, "lowpass", 1400, 0.7, 0.4, pan, 300);
    this.burst(ac, t + 0.05, 0.5, "bandpass", 420, 4, 0.12, pan);
  }

  /** 마네킹: 나무 마디가 딱 하고 맞부딪는 소리 */
  clack(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    this.tone(ac, t, 0.05, "triangle", 900, 600, 0.16, pan);
    this.burst(ac, t, 0.04, "bandpass", 1900, 3, 0.18, pan);
    this.tone(ac, t + 0.07, 0.04, "triangle", 760, 520, 0.08, pan);
  }

  /** 인형 머리가 마루 위를 구르는 소리 (dur 초) */
  roll(pan = 0, dur = 0.8): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const n = Math.max(2, Math.round(dur / 0.11));
    for (let i = 0; i < n; i++) this.burst(ac, t + i * 0.11, 0.09, "lowpass", 380, 0.8, 0.14, pan);
  }

  /** 인형 머리: 늘어진 오르골 몇 음 (단조, 조금씩 음이 샌다) */
  musicBox(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.02;
    const notes = [880, 1046.5, 987.8, 784, 659.3];
    notes.forEach((f, i) => {
      const a = t + i * (0.32 + i * 0.04);
      const ff = f * (1 - Math.random() * 0.025);
      this.tone(ac, a, 0.9, "sine", ff, ff * 0.995, 0.06, pan);
      this.tone(ac, a, 0.4, "sine", ff * 3, ff * 2.98, 0.012, pan);
    });
  }

  /** 빛 밖의 그림자: 바닥을 울리는 낮은 으르렁 */
  growl(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const dur = 1.1;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(62, t);
    o.frequency.linearRampToValueAtTime(48, t + dur);
    const am = ac.createGain();
    am.gain.value = 0.6;
    const trem = ac.createOscillator();
    trem.frequency.value = 23;
    const tg = ac.createGain();
    tg.gain.value = 0.4;
    trem.connect(tg).connect(am.gain);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.25);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const p = this.panner(ac, pan);
    o.connect(am).connect(lp).connect(g).connect(p);
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.02);
    trem.stop(t + dur + 0.02);
    releaseOnEnd(o, am, lp, g, ...(p === this.master ? [] : [p]));
    releaseOnEnd(trem, tg);
  }

  /** 흰 소복이 순간이동할 때: 거꾸로 감은 듯 빨려 드는 쉭 + 높은 울림 */
  sting(pan = 0): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.45);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.44);
    g.gain.linearRampToValueAtTime(0, t + 0.47);
    const p = this.panner(ac, pan);
    src.connect(bp).connect(g).connect(p);
    src.start(t, Math.random());
    src.stop(t + 0.5);
    releaseOnEnd(src, bp, g, ...(p === this.master ? [] : [p]));
    this.tone(ac, t + 0.2, 0.5, "sine", 2600, 2900, 0.025, pan);
  }

  /** 쿵 (몸이 울리는 낮은 소리) */
  thud(): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(g).connect(this.out(ac));
    o.start(t);
    o.stop(t + 0.75);
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(lp).connect(ng).connect(this.out(ac));
    src.start(t, Math.random());
    src.stop(t + 0.4);
  }

  /** 출구: 숨을 돌리는 맑은 화음 */
  relief(): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.02;
    [392, 494, 587, 784].forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ac.createGain();
      const a = t + i * 0.09;
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(0.12, a + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, a + 1.6);
      o.connect(g).connect(this.out(ac));
      o.start(a);
      o.stop(a + 1.7);
    });
  }

  destroy(): void {
    this.stopBed();
    this.master = null;
    this.closeAudio();
  }
}

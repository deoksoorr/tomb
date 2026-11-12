import { AudioHost } from "../world/audioHost";

// 귀신의집 소리 (파일 없이 WebAudio로 합성). 13번: 전부 효과음 갈래(sfx 버스, audio:mix)의 크기를 따른다.
//  - 바탕: 낮게 웅웅거리는 공기 + 먼 바람 (들어가 있는 동안 계속)
//  - 바닥 삐걱임 · 멀리서 속삭임(좌우 어디선가) · 심장 박동 · 촛불 꺼지는 "후" · 그림자 스치는 소리
//  - 비명: 높은 음이 미끄러져 올라갔다 떨어지며 떨림 + 잡음. 끝단에 압축기(리미터)를 둬서 귀가 아프지 않게 크기를 묶는다
//  - 쿵: 낮게 떨어지는 사인파 + 낮게 거른 잡음

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
      g.connect(comp).connect(ac.destination);
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

  /** 비명: 높은 음이 미끄러지며 떨린다 + 거친 잡음. 리미터를 거쳐 너무 크지 않게 */
  scream(): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    const dur = 1.25;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.03);
    g.gain.setValueAtTime(0.32, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // 날카로운 고음을 조금 깎아 귀가 아프지 않게
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3600;
    lp.connect(g).connect(this.out(ac));
    // 떨림 (비브라토)
    const lfo = ac.createOscillator();
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.linearRampToValueAtTime(13, t + dur);
    const lfoG = ac.createGain();
    lfoG.gain.value = 55;
    lfo.connect(lfoG);
    for (const [type, mul, v] of [
      ["sawtooth", 1, 0.32],
      ["sawtooth", 1.013, 0.24],
      ["square", 0.497, 0.12],
    ] as const) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(700 * mul, t);
      o.frequency.exponentialRampToValueAtTime(1650 * mul, t + 0.18);
      o.frequency.linearRampToValueAtTime(1380 * mul, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(820 * mul, t + dur);
      lfoG.connect(o.frequency);
      const og = ac.createGain();
      og.gain.value = v;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    // 목이 갈라지는 잡음
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(1300, t + dur);
    bp.Q.value = 1.4;
    const ng = ac.createGain();
    ng.gain.value = 0.35;
    src.connect(bp).connect(ng).connect(lp);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
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

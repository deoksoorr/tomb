import { AudioHost } from "@/game/world/audioHost";

// 11/20 입장 연출 소리 (파일 없이 WebAudio 합성, 효과음 갈래 — 끄거나 볼륨 0이면 아무 소리도 안 낸다):
// 낮은 웅웅거림(점점 커짐) · 심장 쿵쿵 · 번개 우르릉 · 들킴 브람 · 문 삐걱 · 섬광 쾅

export class IntroSound extends AudioHost {
  private out: GainNode | null = null;
  private drone: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;

  constructor() {
    super("sfx");
  }

  private ctx(): { ac: AudioContext; out: GainNode } | null {
    const ac = this.audio();
    if (!ac) return null;
    if (!this.out) {
      this.out = ac.createGain();
      this.out.gain.value = this.busGain();
      this.out.connect(this.output);
    }
    return { ac, out: this.out };
  }

  private noiseBuf(ac: AudioContext): AudioBuffer {
    if (!this.noise) {
      const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      // 갈색 잡음 (우르릉)
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
      this.noise = b;
    }
    return this.noise;
  }

  /** 낮은 웅웅거림 (걷는 동안 점점 커진다) */
  start(walkSec: number, hell: boolean): void {
    const c = this.ctx();
    if (!c) return;
    const { ac, out } = c;
    const t = ac.currentTime;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.linearRampToValueAtTime(hell ? 420 : 320, t + walkSec);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 1.2);
    g.gain.linearRampToValueAtTime(0.3, t + walkSec);
    lp.connect(g).connect(out);
    for (const f of hell ? [36.7, 37.2, 55.4] : [41.2, 41.7, 61.9]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      this.drone.push(o);
    }
  }

  /** 심장 쿵쿵 (세기 0..1) */
  heart(k: number): void {
    const c = this.ctx();
    if (!c) return;
    const { ac, out } = c;
    for (const [dt, a] of [
      [0, 1],
      [0.17, 0.6],
    ] as const) {
      const t = ac.currentTime + dt;
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(36, t + 0.14);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.75 * a * (0.5 + 0.5 * k), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.22);
    }
  }

  /** 번개 우르릉 (쾅 + 길게 끄는 낮은 울림) */
  thunder(big = 1): void {
    const c = this.ctx();
    if (!c) return;
    const { ac, out } = c;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + 1.4);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * big, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.35 * big, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    src.connect(lp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 2);
  }

  /** 들킴: 낮고 거친 브람 (필터가 열렸다 닫힌다) */
  sting(): void {
    const c = this.ctx();
    if (!c) return;
    const { ac, out } = c;
    const t = ac.currentTime;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(1100, t + 0.18);
    lp.frequency.exponentialRampToValueAtTime(150, t + 1.1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    lp.connect(g).connect(out);
    for (const f of [55, 58.3, 82.4]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.25);
    }
  }

  /** 문 삐걱 (떨리는 낮은 톱니 + 좁은 띠 필터) */
  creak(sec: number): void {
    const c = this.ctx();
    if (!c) return;
    const { ac, out } = c;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(52, t + sec);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 23;
    const lg = ac.createGain();
    lg.gain.value = 14;
    lfo.connect(lg).connect(o.frequency);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 820;
    bp.Q.value = 7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + sec * 0.25);
    g.gain.exponentialRampToValueAtTime(0.12, t + sec * 0.4);
    g.gain.exponentialRampToValueAtTime(0.55, t + sec * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    o.connect(bp).connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + sec + 0.05);
    lfo.stop(t + sec + 0.05);
  }

  /** 소리를 천천히 걷고 닫는다 */
  stop(fadeSec = 0.4): void {
    const ac = this.context;
    const out = this.out;
    if (ac && out) {
      const t = ac.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + fadeSec);
      for (const o of this.drone) o.stop(t + fadeSec + 0.05);
    }
    this.drone = [];
    const close = () => {
      this.out = null;
      this.closeAudio();
    };
    if (ac && out) setTimeout(close, fadeSec * 1000 + 100);
    else close();
  }
}

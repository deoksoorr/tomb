import { releaseOnEnd } from "@/lib/sharedAudio";
import { AudioHost } from "./audioHost";

// 놀이기구 2 소리 (WebAudio로 바로 만든다 — 파일 없음, 효과음 갈래 sfx 버스):
//  - 바람: 높이 올라갈수록 커지는 걸러 낸 잡음 (관람차·열기구 하늘 시점에서만)
//  - 버너: 열기구 버너를 켜는 동안 "후우-" 불꽃 소리 (낮은 웅웅 + 쉭)
//  - 삐걱: 관람차 칸이 가끔 살짝 삐걱 (짧은 나무 마찰음)

const NOISE_SEC = 2;

export class SkySound extends AudioHost {
  private noise: AudioBuffer | null = null;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private burner: { src: AudioBufferSourceNode; low: OscillatorNode; gain: GainNode } | null = null;
  private windLevel = 0;
  private burnLevel = 0;

  constructor() {
    super("sfx");
  }

  private noiseBuffer(ac: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ac.sampleRate) return this.noise;
    const n = Math.floor(ac.sampleRate * NOISE_SEC);
    const b = ac.createBuffer(1, n, ac.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      // 갈색 잡음 (부드러운 바람)
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    this.noise = b;
    return b;
  }

  protected override onMixChanged(): void {
    this.apply();
  }

  /** 바람 크기 0..1 (매 프레임 불러도 된다) */
  setWind(level: number): void {
    this.windLevel = Math.max(0, Math.min(1, level));
    this.apply();
  }

  /** 버너 켜짐 0..1 */
  setBurner(level: number): void {
    this.burnLevel = Math.max(0, Math.min(1, level));
    this.apply();
  }

  private apply(): void {
    const vol = this.busGain();
    const want = this.windLevel > 0.01 || this.burnLevel > 0.01;
    if (!want || vol <= 0) {
      this.fadeOut();
      return;
    }
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime;
    if (!this.wind) {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer(ac);
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.output);
      src.start();
      this.wind = { src, filter, gain };
    }
    if (!this.burner) {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer(ac);
      src.loop = true;
      src.playbackRate.value = 2.6;
      const band = ac.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900;
      band.Q.value = 0.7;
      const low = ac.createOscillator();
      low.type = "sawtooth";
      low.frequency.value = 52;
      const lowGain = ac.createGain();
      lowGain.gain.value = 0.18;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(gain);
      low.connect(lowGain).connect(gain);
      gain.connect(this.output);
      src.start();
      low.start();
      this.burner = { src, low, gain };
    }
    const w = this.windLevel;
    this.wind.gain.gain.setTargetAtTime(0.32 * w * vol, t, 0.4);
    this.wind.filter.frequency.setTargetAtTime(350 + 900 * w, t, 0.6);
    this.burner.gain.gain.setTargetAtTime(0.42 * this.burnLevel * vol, t, this.burnLevel > 0 ? 0.08 : 0.25);
  }

  private fadeOut(): void {
    const ac = this.context;
    if (!ac) return;
    const t = ac.currentTime;
    this.wind?.gain.gain.setTargetAtTime(0, t, 0.3);
    this.burner?.gain.gain.setTargetAtTime(0, t, 0.15);
  }

  /** 관람차 칸 삐걱 (짧게) */
  creak(gain = 1): void {
    if (gain <= 0.01) return;
    const vol = this.busGain();
    const ac = vol > 0 ? this.audio() : null;
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(320 + Math.random() * 60, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.22);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * gain * vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.26);
    o.connect(g).connect(this.output);
    o.start(t);
    o.stop(t + 0.3);
    releaseOnEnd(o, g);
  }

  destroy(): void {
    try {
      this.wind?.src.stop();
      this.burner?.src.stop();
      this.burner?.low.stop();
    } catch {
      // 이미 멈췄다
    }
    this.wind = null;
    this.burner = null;
    this.closeAudio();
  }
}

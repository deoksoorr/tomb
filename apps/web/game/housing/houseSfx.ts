import { releaseOnEnd } from "@/lib/sharedAudio";
import { AudioHost } from "../world/audioHost";
import { pianoFreq } from "./interact";

// 3번 집 안 가구 소리 (파일 없이 WebAudio로 합성). 13번: 효과음 갈래(sfx 버스, audio:mix)를 따른다.
// gain = 거리 감쇠까지 곱한 크기 (내가 낸 소리는 1, 방의 다른 사람이 낸 소리는 멀수록 작게).

export type HouseSound =
  | "key"
  | "page"
  | "static"
  | "tune"
  | "click"
  | "fireOn"
  | "pop"
  | "fridge"
  | "meow"
  | "coffee"
  | "vend"
  | "chime"
  | "bong"
  | "pour"
  | "splash"
  | "bubble"
  | "creak"
  | "bird"
  | "cricket"
  | "wind"
  | "sheet"
  | "snore"
  // ── 모든 가구 상호작용 ──
  | "step"
  | "squeak"
  | "rustle"
  | "marker"
  | "sparkle";

/** 거리 → 크기 (0..1): 가까우면 그대로, HEAR_FAR px 밖이면 안 들린다 */
export const HEAR_FAR = 260;
export function hearGain(d: number): number {
  return Math.max(0, Math.min(1, 1 - (d - 40) / (HEAR_FAR - 40)));
}

export class HouseSfx extends AudioHost {
  private noise: AudioBuffer | null = null;
  constructor() {
    super("sfx");
  }

  private noiseBuf(ac: AudioContext): AudioBuffer {
    if (!this.noise) {
      const n = Math.floor(ac.sampleRate * 0.8);
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private hiss(ac: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = "bandpass", q = 1): void {
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf(ac);
    const bp = ac.createBiquadFilter();
    bp.type = type;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    bp.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.output);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
    releaseOnEnd(src, bp, g);
  }

  private tone(ac: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine", attack = 0.006): void {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.output);
    o.start(t);
    o.stop(t + dur + 0.02);
    releaseOnEnd(o, g);
  }

  /** 피아노 음 (i = 0..PIANO_NOTES-1) */
  note(i: number, gain = 1): void {
    const ac = this.audio();
    if (!ac || gain <= 0) return;
    const t = ac.currentTime + 0.005;
    const v = Math.min(1, this.volume * gain);
    const f = pianoFreq(i);
    this.tone(ac, t, 1.4, f, f, v * 0.22, "triangle", 0.004);
    this.tone(ac, t, 0.9, f * 2, f * 2, v * 0.06, "sine", 0.004);
    this.hiss(ac, t, 0.03, 3000, 2000, v * 0.04, "highpass");
  }

  play(name: HouseSound, gain = 1): void {
    const ac = this.audio();
    if (!ac || gain <= 0) return;
    const t = ac.currentTime + 0.01;
    const v = Math.min(1, this.volume * gain);
    const r = Math.random();
    switch (name) {
      case "key": // 자판 한 번 (딸깍)
        this.hiss(ac, t, 0.025, 4200 + r * 1500, 3000, v * 0.16, "bandpass", 2);
        this.tone(ac, t, 0.02, 1800 + r * 400, 1200, v * 0.03, "square");
        break;
      case "page":
        this.hiss(ac, t, 0.22, 1800, 5200, v * 0.12, "bandpass", 0.8);
        break;
      case "static": // 라디오 지직
        this.hiss(ac, t, 0.55, 2400, 1800, v * 0.22, "bandpass", 0.5);
        for (let i = 0; i < 6; i++) this.hiss(ac, t + i * 0.07 + Math.random() * 0.03, 0.02, 5000, 4000, v * 0.18, "highpass");
        break;
      case "tune": // 채널이 잡혔다 (짧은 세 음)
        [523, 659, 784].forEach((f, i) => this.tone(ac, t + 0.5 + i * 0.09, 0.18, f, f, v * 0.1, "square"));
        break;
      case "click":
        this.tone(ac, t, 0.03, 2400, 1600, v * 0.12, "square");
        break;
      case "fireOn": // 성냥 + 확 붙는 소리
        this.hiss(ac, t, 0.12, 6000, 2000, v * 0.2, "highpass");
        this.hiss(ac, t + 0.1, 0.6, 400, 900, v * 0.25, "lowpass");
        break;
      case "pop": // 장작 타닥
        this.hiss(ac, t, 0.03 + r * 0.03, 1500 + r * 2500, 800, v * (0.1 + r * 0.12), "bandpass", 1.5);
        break;
      case "fridge":
        this.tone(ac, t, 0.12, 140, 90, v * 0.25);
        this.tone(ac, t + 0.05, 0.6, 60, 60, v * 0.06, "sawtooth");
        break;
      case "meow":
        this.tone(ac, t, 0.42, 620, 480, v * 0.16, "triangle", 0.05);
        this.tone(ac, t + 0.05, 0.3, 900, 760, v * 0.05, "sine", 0.05);
        for (let i = 0; i < 5; i++) this.tone(ac, t + 0.5 + i * 0.09, 0.08, 48, 44, v * 0.12, "sawtooth"); // 골골
        break;
      case "coffee":
        for (let i = 0; i < 8; i++) this.hiss(ac, t + i * 0.12 + Math.random() * 0.05, 0.08, 500 + Math.random() * 400, 300, v * 0.16, "bandpass", 3);
        this.tone(ac, t + 1.1, 0.25, 1320, 1320, v * 0.08);
        break;
      case "vend":
        this.tone(ac, t, 0.08, 2600, 2600, v * 0.12);
        this.tone(ac, t + 0.07, 0.12, 3100, 3100, v * 0.08);
        this.tone(ac, t + 0.45, 0.16, 90, 50, v * 0.3);
        this.hiss(ac, t + 0.45, 0.1, 600, 200, v * 0.2, "lowpass");
        break;
      case "chime":
        [1568, 2093, 1760, 2349].forEach((f, i) => this.tone(ac, t + i * 0.13, 1.2, f, f, v * 0.07));
        break;
      case "bong":
        this.tone(ac, t, 0.05, 1800, 1800, v * 0.05, "square"); // 째깍
        this.tone(ac, t + 0.25, 2.2, 220, 218, v * 0.22, "sine", 0.01);
        this.tone(ac, t + 0.25, 1.6, 440, 438, v * 0.08, "sine", 0.01);
        break;
      case "pour":
        this.hiss(ac, t, 0.9, 900, 1600, v * 0.16, "bandpass", 1.2);
        for (let i = 0; i < 4; i++) this.tone(ac, t + 0.2 + i * 0.15, 0.08, 700 + i * 90, 500, v * 0.05);
        break;
      case "splash":
        this.hiss(ac, t, 0.4, 1600, 400, v * 0.3, "bandpass", 0.7);
        this.tone(ac, t + 0.05, 0.15, 500, 180, v * 0.15);
        break;
      case "bubble":
        this.tone(ac, t, 0.08, 500 + r * 300, 1100 + r * 300, v * 0.07);
        break;
      case "creak":
        this.tone(ac, t, 0.35, 180, 140, v * 0.08, "sawtooth", 0.05);
        this.hiss(ac, t + 0.2, 0.4, 900, 300, v * 0.12, "lowpass");
        break;
      case "bird": // 바깥 새소리 (짹짹)
        for (let i = 0; i < 2 + Math.floor(r * 3); i++) this.tone(ac, t + i * 0.13, 0.09, 3200 + r * 800, 4200 + r * 600, v * 0.06);
        break;
      case "cricket":
        for (let i = 0; i < 4; i++) this.tone(ac, t + i * 0.05, 0.03, 4700, 4700, v * 0.04, "square");
        break;
      case "wind":
        this.hiss(ac, t, 1.6, 300, 700, v * 0.1, "bandpass", 0.6);
        break;
      case "sheet": // 이불 바스락
        this.hiss(ac, t, 0.35, 900, 2600, v * 0.12, "bandpass", 0.6);
        break;
      case "snore":
        this.hiss(ac, t, 0.9, 200, 160, v * 0.08, "lowpass");
        break;
      case "step": // 디딤돌 또각
        this.tone(ac, t, 0.05, 900 + r * 200, 500, v * 0.08, "triangle", 0.002);
        this.hiss(ac, t, 0.04, 2400, 1200, v * 0.05, "bandpass", 2);
        break;
      case "squeak": // 고무 오리 삑
        this.tone(ac, t, 0.16, 1200, 1700, v * 0.12, "square", 0.01);
        this.tone(ac, t + 0.14, 0.12, 1600, 1100, v * 0.07, "square", 0.01);
        break;
      case "rustle": // 덤불 부스럭
        for (let i = 0; i < 5; i++) this.hiss(ac, t + i * 0.08 + Math.random() * 0.04, 0.12, 2200 + Math.random() * 1500, 1500, v * 0.14, "bandpass", 1.2);
        break;
      case "marker": // 마커 끄적끄적
        for (let i = 0; i < 4; i++) this.hiss(ac, t + i * 0.13, 0.1, 3800, 5200, v * 0.1, "bandpass", 4);
        break;
      case "sparkle": // 포자·반딧불 반짝
        [2637, 3136, 3520].forEach((f, i) => this.tone(ac, t + i * 0.07, 0.4, f, f, v * 0.04));
        break;
    }
  }

  destroy(): void {
    this.closeAudio();
  }
}

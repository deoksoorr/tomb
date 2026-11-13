import { releaseOnEnd } from "@/lib/sharedAudio";
import { AudioHost } from "../audioHost";

// 4·32번 낚시·채집 효과음 (파일 없이 WebAudio로 합성, 아주 짧게). 13번: 효과음 갈래(sfx 버스, audio:mix)를 따른다.
// 던지기(휙) · 찌 퐁당 · 입질(톡톡) · 릴 감기(딸깍) · 줄 끊김(팅) · 잡았다(짜잔) · 풀 뜯기(바스락) · 광석(챙) · 땅 파기(퍽) · 판매(동전)
// 채집 지점: 새로 핌(뿅) · 시간이 다 돼 사라짐(스르륵) · 캐서 없어짐(반짝)

export type ForageSound = "cast" | "plop" | "bite" | "reel" | "snap" | "catch" | "herb" | "ore" | "dig" | "coin" | "miss" | "spawn" | "vanish" | "gathered";

export class ForageSfx extends AudioHost {
  private noise: AudioBuffer | null = null;

  private noiseBuf(ac: AudioContext): AudioBuffer {
    if (!this.noise) {
      const n = Math.floor(ac.sampleRate * 0.6);
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** 걸러낸 잡음 한 번 */
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
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.output);
    src.start(t);
    src.stop(t + dur + 0.02);
    releaseOnEnd(src, bp, g);
  }

  /** 음 하나 (주파수 미끄러짐 가능) */
  private tone(ac: AudioContext, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = "sine"): void {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.output);
    o.start(t);
    o.stop(t + dur + 0.02);
    releaseOnEnd(o, g);
  }

  play(name: ForageSound, gain = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const v = Math.min(1, this.volume * gain);
    switch (name) {
      case "cast":
        this.hiss(ac, t, 0.28, 2400, 700, v * 0.35, "bandpass", 1.4);
        break;
      case "plop":
        this.tone(ac, t, 0.12, 620, 180, v * 0.4);
        this.hiss(ac, t, 0.18, 1500, 400, v * 0.18);
        break;
      case "bite":
        this.tone(ac, t, 0.06, 980, 980, v * 0.22, "square");
        this.tone(ac, t + 0.1, 0.06, 1180, 1180, v * 0.22, "square");
        this.hiss(ac, t, 0.25, 1800, 500, v * 0.25);
        break;
      case "reel":
        this.hiss(ac, t, 0.03, 5200, 4200, v * 0.22, "highpass", 0.7);
        this.tone(ac, t, 0.03, 2400, 2000, v * 0.06, "square");
        break;
      case "snap":
        this.tone(ac, t, 0.32, 420, 70, v * 0.28, "sawtooth");
        break;
      case "miss":
        this.tone(ac, t, 0.22, 330, 220, v * 0.18, "triangle");
        break;
      case "catch":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ac, t + i * 0.08, 0.28, f, f, v * 0.2, "triangle"));
        this.hiss(ac, t, 0.35, 1600, 500, v * 0.25);
        break;
      case "herb":
        this.hiss(ac, t, 0.16, 3200, 1400, v * 0.25, "bandpass", 0.8);
        this.hiss(ac, t + 0.09, 0.12, 2800, 1200, v * 0.18, "bandpass", 0.8);
        break;
      case "ore":
        this.tone(ac, t, 0.22, 1800, 1700, v * 0.18);
        this.tone(ac, t, 0.16, 2710, 2600, v * 0.1);
        this.hiss(ac, t, 0.05, 4000, 2000, v * 0.2, "highpass");
        break;
      case "dig":
        this.tone(ac, t, 0.14, 140, 60, v * 0.4);
        this.hiss(ac, t, 0.16, 600, 200, v * 0.25, "lowpass");
        break;
      case "spawn":
        // 뿅: 짧게 솟는 음 + 반짝
        this.tone(ac, t, 0.12, 420, 1250, v * 0.2, "sine");
        this.tone(ac, t + 0.07, 0.16, 1760, 2350, v * 0.07, "triangle");
        break;
      case "vanish":
        // 스르륵: 내려가는 바람 소리
        this.hiss(ac, t, 0.5, 2600, 500, v * 0.12, "bandpass", 1.2);
        this.tone(ac, t, 0.35, 880, 440, v * 0.04, "sine");
        break;
      case "gathered":
        [1319, 1760].forEach((f, i) => this.tone(ac, t + i * 0.06, 0.2, f, f, v * 0.1, "triangle"));
        break;
      case "coin":
        this.tone(ac, t, 0.08, 988, 988, v * 0.18, "square");
        this.tone(ac, t + 0.08, 0.3, 1319, 1319, v * 0.18, "square");
        break;
    }
  }

  destroy(): void {
    this.closeAudio();
  }
}

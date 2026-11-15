import { playBuffer, preloadSound, soundMissing } from "@/lib/sharedAudio";
import { AmbientLoop } from "./ambientLoop";
import { AudioHost } from "./audioHost";

// 50번 조각배·광장 놀거리 효과음 (scripts/gen-bgm.mjs가 굽는다: /sfx/row·boat-board·seesaw·boing·wish·carousel-loop).
// game/world/Sfx.ts와 같은 방식(공용 WebAudio 버퍼 + 13번 효과음 갈래 sfx 버스). 파일이 없거나 재생이 막히면 조용히 넘어간다.

export type RideSoundName = "row" | "boat-board" | "seesaw" | "boing" | "wish";
const NAMES: readonly RideSoundName[] = ["row", "boat-board", "seesaw", "boing", "wish"];
const MAX_VOICES = 6;

export class RideSound extends AudioHost {
  private voices = 0;
  /** 회전목마 오르골 (내가 목마에 탔을 때만 — PlazaRides가 rides.carouselOrganLevel로 정한다) */
  private readonly organ = new AmbientLoop(this, "/sfx/carousel-loop.mp3", { gain: 0.55 });
  constructor() {
    super("sfx");
    for (const name of NAMES) void preloadSound(`/sfx/${name}.mp3`);
  }

  protected override onMixChanged(): void {
    this.organ.refresh();
  }

  /** gain 0..1 (UI 볼륨에 곱한다), rate: 재생 속도 (살짝 바꿔 같은 소리가 덜 반복돼 들리게) */
  play(name: RideSoundName, gain = 1, rate = 1): void {
    const url = `/sfx/${name}.mp3`;
    if (this.muted || this.volume <= 0 || this.hidden || gain <= 0.01 || soundMissing(url) || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const started = playBuffer(ac, this.output, url, {
      gain: Math.max(0, Math.min(1, this.volume * gain)),
      rate,
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
      },
    });
    if (started) this.voices++;
  }

  /**
   * 11/15 오리배 꽥: 파일 없이 바로 합성한다 — 톱니파 두 가닥(살짝 어긋난 음)이 높았다 떨어지고,
   * 콧소리 같은 띠 통과 필터 두 개(꽥의 "ㅙ")를 지나 짧게 끊긴다. gain 0..1, rate = 음 높이 배율
   */
  quack(gain = 1, rate = 1): void {
    if (this.muted || this.volume <= 0 || this.hidden || gain <= 0.01 || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const dur = 0.24;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(Math.max(0.001, Math.min(1, this.volume * gain) * 0.5), t + 0.02);
    out.gain.setValueAtTime(Math.max(0.001, Math.min(1, this.volume * gain) * 0.42), t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.output);
    const f1 = ac.createBiquadFilter();
    f1.type = "bandpass";
    f1.Q.value = 5;
    f1.frequency.setValueAtTime(1300 * rate, t);
    f1.frequency.linearRampToValueAtTime(900 * rate, t + dur);
    const f2 = ac.createBiquadFilter();
    f2.type = "bandpass";
    f2.Q.value = 7;
    f2.frequency.value = 2600 * rate;
    const mixF2 = ac.createGain();
    mixF2.gain.value = 0.55;
    f1.connect(out);
    f2.connect(mixF2).connect(out);
    this.voices++;
    for (const det of [1, 1.012]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(330 * rate * det, t);
      o.frequency.linearRampToValueAtTime(420 * rate * det, t + 0.05);
      o.frequency.exponentialRampToValueAtTime(250 * rate * det, t + dur);
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + dur + 0.02);
      if (det === 1)
        o.onended = () => {
          this.voices = Math.max(0, this.voices - 1);
          out.disconnect();
        };
    }
  }

  /**
   * 11/16 범퍼카 「쿵」: 파일 없이 합성한다 — 낮은 사인파가 뚝 떨어지고(고무 범퍼가 눌리는 둔한 울림) 짧은 잡음이 덧붙는다.
   * gain 0..1 (세게 부딪힐수록 크게), rate = 음 높이 배율
   */
  thump(gain = 1, rate = 1): void {
    if (this.muted || this.volume <= 0 || this.hidden || gain <= 0.01 || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    const v = Math.max(0.001, Math.min(1, this.volume * gain));
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(v * 0.9, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    out.connect(this.output);
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150 * rate, t);
    o.frequency.exponentialRampToValueAtTime(55 * rate, t + 0.2);
    o.connect(out);
    // 고무 「퉁」 소리 겉면: 짧은 잡음을 낮은 띠로
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const n = ac.createBufferSource();
    n.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900 * rate;
    const ng = ac.createGain();
    ng.gain.value = 0.45;
    n.connect(f).connect(ng).connect(out);
    this.voices++;
    o.start(t);
    o.stop(t + 0.28);
    n.start(t);
    o.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      out.disconnect();
    };
  }

  /** 11/16 범퍼카 빵빵: 네모파 두 음(장3도)을 짧게 두 번. gain 0..1, rate = 음 높이 배율 */
  honk(gain = 1, rate = 1): void {
    if (this.muted || this.volume <= 0 || this.hidden || gain <= 0.01 || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const t0 = ac.currentTime + 0.01;
    const v = Math.max(0.001, Math.min(1, this.volume * gain)) * 0.22;
    const out = ac.createGain();
    out.gain.value = 1;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2400;
    f.connect(out);
    out.connect(this.output);
    this.voices++;
    let last: OscillatorNode | null = null;
    for (const at of [0, 0.19]) {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(v, t0 + at + 0.015);
      g.gain.setValueAtTime(v, t0 + at + 0.11);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.15);
      g.connect(f);
      for (const hz of [392, 494]) {
        const o = ac.createOscillator();
        o.type = "square";
        o.frequency.value = hz * rate;
        o.connect(g);
        o.start(t0 + at);
        o.stop(t0 + at + 0.16);
        last = o;
      }
    }
    if (last)
      last.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
        out.disconnect();
      };
  }

  /** 회전목마 음악 크기 0..1 (매 프레임 불러도 된다) */
  carousel(level: number): void {
    this.organ.set(level);
  }

  destroy(): void {
    this.organ.destroy();
    this.closeAudio();
  }
}

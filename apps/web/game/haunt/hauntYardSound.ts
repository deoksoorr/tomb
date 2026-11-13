import { releaseOnEnd } from "@/lib/sharedAudio";
import { AudioHost } from "../world/audioHost";

// 마을의 귀신의집 근처에서 가끔 들리는 아주 작은 소리 (파일 없이 WebAudio 합성). 효과음 갈래(sfx 버스) 볼륨을 따른다.
//  - 킥킥 웃음: 짧은 높은 음 몇 개가 떨리며 내려간다
//  - 먼 비명: 건물 안에서 새어 나오는 듯 먹먹하게 (낮은 통과 필터) 올라갔다 떨어진다
// 미로 안의 큰 소리(hauntSound.ts)와 달리 언제나 배경처럼 작게 — 최대 크기 YARD_GAIN.

/** 효과음 볼륨에 곱하는 최대 크기 (아주 작게) */
const YARD_GAIN = 0.16;

export class HauntYardSound extends AudioHost {
  private master: GainNode | null = null;

  private out(ac: AudioContext): GainNode {
    if (!this.master) {
      const g = ac.createGain();
      g.gain.value = (this.muted ? 0 : this.volume) * YARD_GAIN;
      g.connect(this.output);
      this.master = g;
    }
    return this.master;
  }

  protected onMixChanged(): void {
    const ac = this.context;
    if (this.master && ac) this.master.gain.setTargetAtTime((this.muted ? 0 : this.volume) * YARD_GAIN, ac.currentTime, 0.05);
  }

  /** 소리 하나의 출구 (크기·좌우). 돌려준 nodes는 소리가 끝나면 releaseOnEnd로 뗀다 */
  private dest(ac: AudioContext, v: number, pan: number): { head: AudioNode; nodes: AudioNode[] } {
    const g = ac.createGain();
    g.gain.value = Math.max(0, Math.min(1, v));
    if (typeof ac.createStereoPanner === "function") {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.out(ac));
      return { head: g, nodes: [g, p] };
    }
    g.connect(this.out(ac));
    return { head: g, nodes: [g] };
  }

  /** 킥킥 웃음. v 0..1 (거리), pan -1..1 */
  giggle(v: number, pan: number): void {
    const ac = this.audio();
    if (!ac || v <= 0) return;
    const t0 = ac.currentTime + 0.02;
    const dst = this.dest(ac, v, pan);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    bp.connect(dst.head);
    const n = 4 + Math.floor(Math.random() * 3);
    const base = 760 + Math.random() * 180;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.11;
      const o = ac.createOscillator();
      o.type = "triangle";
      const f = base * (1 - i * 0.04);
      o.frequency.setValueAtTime(f * 1.12, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      o.connect(g).connect(bp);
      o.start(t);
      o.stop(t + 0.1);
      // 마지막 음이 끝나면 필터·출구까지 뗀다
      releaseOnEnd(o, g, ...(i === n - 1 ? [bp, ...dst.nodes] : []));
    }
  }

  /** 건물 안에서 새어 나오는 먼 비명. v 0..1 (거리), pan -1..1 */
  shriek(v: number, pan: number): void {
    const ac = this.audio();
    if (!ac || v <= 0) return;
    const t = ac.currentTime + 0.02;
    const dur = 0.9 + Math.random() * 0.3;
    const dst = this.dest(ac, v * 0.8, pan);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1700;
    lp.connect(dst.head);
    const o = ac.createOscillator();
    o.type = "sawtooth";
    const f0 = 620 + Math.random() * 120;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    // 떨림
    const lfo = ac.createOscillator();
    lfo.frequency.value = 7;
    const lg = ac.createGain();
    lg.gain.value = 26;
    lfo.connect(lg).connect(o.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.08);
    g.gain.setValueAtTime(0.28, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(lp);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    releaseOnEnd(lfo, lg);
    releaseOnEnd(o, g, lp, ...dst.nodes);
  }

  destroy(): void {
    this.master?.disconnect();
    this.master = null;
    this.closeAudio();
  }
}

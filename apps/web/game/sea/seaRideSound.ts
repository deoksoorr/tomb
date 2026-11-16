import { AudioHost } from "../world/audioHost";

// 11/16 r13 제트스키 엔진 소리 (파일 없이 합성 — 효과음 갈래 sfx 볼륨·끄기를 따라요).
// 톱니파 + 한 옥타브 위 네모파를 낮은 통과 필터로 둥글게 하고, 빠른 떨림(LFO)으로 「부르르」. 세기(level)와 회전(rpm)을 매 프레임 받아요.
// 아무도 안 타면(세기 0이 잠시 이어지면) 발진기를 멈춰요.

const STOP_AFTER_MS = 1500;

export class SeaEngineSound extends AudioHost {
  private nodes: { o1: OscillatorNode; o2: OscillatorNode; lfo: OscillatorNode; lp: BiquadFilterNode; out: GainNode; am: GainNode } | null = null;
  private quietSince = 0;

  constructor() {
    super("sfx");
  }

  protected override onMixChanged(): void {
    if (this.muted || this.volume <= 0) this.stop();
  }

  /** level 0..1 (들리는 크기), rpm 0..1 (빠를수록 높고 거칠게) */
  set(level: number, rpm: number, nowMs: number): void {
    if (level <= 0.01 || this.muted || this.volume <= 0 || this.hidden) {
      if (this.nodes) {
        this.nodes.out.gain.setTargetAtTime(0, this.nodes.out.context.currentTime, 0.08);
        if (!this.quietSince) this.quietSince = nowMs;
        else if (nowMs - this.quietSince > STOP_AFTER_MS) this.stop();
      }
      return;
    }
    this.quietSince = 0;
    const n = this.nodes ?? this.start();
    if (!n) return;
    const t = n.out.context.currentTime;
    const r = Math.max(0, Math.min(1, rpm));
    const f = 52 + r * 78;
    n.o1.frequency.setTargetAtTime(f, t, 0.12);
    n.o2.frequency.setTargetAtTime(f * 2.02, t, 0.12);
    n.lfo.frequency.setTargetAtTime(16 + r * 22, t, 0.15);
    n.lp.frequency.setTargetAtTime(380 + r * 900, t, 0.15);
    n.out.gain.setTargetAtTime(Math.min(1, this.volume * level) * 0.2, t, 0.1);
  }

  private start(): SeaEngineSound["nodes"] {
    const ac = this.audio();
    if (!ac) return null;
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(this.output);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2.2;
    lp.frequency.value = 420;
    // 떨림: am 게인을 LFO로 0.55~1 사이에서 흔들어요
    const am = ac.createGain();
    am.gain.value = 0.78;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 18;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = 0.22;
    lfo.connect(lfoDepth).connect(am.gain);
    const o1 = ac.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 55;
    const o2 = ac.createOscillator();
    o2.type = "square";
    o2.frequency.value = 111;
    const g2 = ac.createGain();
    g2.gain.value = 0.28;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(am).connect(out);
    const t = ac.currentTime;
    o1.start(t);
    o2.start(t);
    lfo.start(t);
    this.nodes = { o1, o2, lfo, lp, out, am };
    return this.nodes;
  }

  stop(): void {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    this.quietSince = 0;
    try {
      n.o1.stop();
      n.o2.stop();
      n.lfo.stop();
    } catch {
      // 이미 멈췄어요
    }
    n.out.disconnect();
  }

  destroy(): void {
    this.stop();
    this.closeAudio();
  }
}

// 효과음 (폭죽). Phaser 오디오는 꺼 두었으므로 HTMLAudioElement를 직접 쓴다.
// 파일이 아직 없거나 재생이 막히면 조용히 넘어간다. 볼륨·음소거는 UI의 audio:settings(BGM과 같은 값)를 따른다.

export type SfxName = "launch" | "burst";

const FILES: Record<SfxName, string> = {
  launch: "/sfx/firework-launch.mp3",
  burst: "/sfx/firework-burst.mp3",
};

/** 같은 소리가 너무 많이 겹치지 않게 (피날레·여러 사람이 동시에 쏠 때도 이 이상은 안 겹친다) */
const MAX_VOICES = 12;

export class Sfx {
  private readonly base = new Map<SfxName, HTMLAudioElement>();
  private readonly missing = new Set<SfxName>();
  private voices = 0;
  private volume = 0.7;
  private muted = false;

  constructor() {
    if (typeof Audio === "undefined") return;
    for (const [name, url] of Object.entries(FILES) as [SfxName, string][]) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("error", () => this.missing.add(name), { once: true });
      a.src = url;
      this.base.set(name, a);
    }
  }

  /** UI 볼륨: 0..1 (혹시 0..100이 오면 나눠서) */
  setSettings(volume: number, muted: boolean): void {
    const v = Number.isFinite(volume) ? (volume > 1 ? volume / 100 : volume) : 0.7;
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = muted;
  }

  /**
   * gain: 0..1 (UI 볼륨에 곱한다), rate: 재생 속도(작으면 낮고 묵직한 소리),
   * limit: 이미 이만큼 겹쳐 있으면 건너뛴다 (중요하지 않은 소리는 작게 줘서 자리를 남긴다)
   */
  play(name: SfxName, gain = 1, rate = 1, limit = MAX_VOICES): void {
    if (this.muted || this.volume <= 0 || this.missing.has(name) || this.voices >= Math.min(limit, MAX_VOICES)) return;
    const src = this.base.get(name);
    if (!src) return;
    const a = src.cloneNode(true) as HTMLAudioElement;
    a.volume = Math.max(0, Math.min(1, this.volume * gain));
    if (rate !== 1) {
      a.preservesPitch = false;
      a.playbackRate = Math.max(0.5, Math.min(2, rate));
    }
    this.voices++;
    const done = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    a.play().catch(done);
  }

  // ── 합성음 (파일 없이 WebAudio로): 종소리·물소리 ──
  private ac: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  private audio(): AudioContext | null {
    if (this.muted || this.volume <= 0) return null;
    if (!this.ac) {
      const AC = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      if (!AC) return null;
      try {
        this.ac = new AC();
      } catch {
        return null;
      }
    }
    if (this.ac.state === "suspended") void this.ac.resume().catch(() => undefined);
    return this.ac;
  }

  /** 범종 한 번: 낮은 기음 + 비조화 배음, 길게 울린다. gain: 거리 감쇠 등 */
  bell(gain = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const out = ac.createGain();
    out.gain.value = Math.min(1, this.volume * gain) * 0.32;
    out.connect(ac.destination);
    const base = 196;
    const partials: [number, number, number][] = [
      [1, 1, 3.2],
      [2.0, 0.55, 2.2],
      [2.76, 0.4, 1.6],
      [5.4, 0.18, 0.8],
      [0.5, 0.35, 3.6],
    ];
    for (const [mul, amp, dur] of partials) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = base * mul;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** 물 튀기는 소리: 걸러낸 잡음 + 물방울 몇 개 */
  splash(gain = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    if (!this.noise) {
      const n = Math.floor(ac.sampleRate * 0.5);
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const v = Math.min(1, this.volume * gain) * 0.5;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    bp.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    src.connect(bp).connect(g).connect(ac.destination);
    src.start(t);
    src.stop(t + 0.45);
    for (let i = 0; i < 3; i++) {
      const at = t + 0.12 + i * 0.07 + Math.random() * 0.05;
      const o = ac.createOscillator();
      const og = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(700 + Math.random() * 500, at);
      o.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 700, at + 0.06);
      og.gain.setValueAtTime(0, at);
      og.gain.linearRampToValueAtTime(v * 0.25, at + 0.005);
      og.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
      o.connect(og).connect(ac.destination);
      o.start(at);
      o.stop(at + 0.1);
    }
  }

  destroy(): void {
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
    for (const a of this.base.values()) a.src = "";
    this.base.clear();
  }
}

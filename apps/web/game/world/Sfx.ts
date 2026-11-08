// 효과음 (폭죽). Phaser 오디오는 꺼 두었으므로 HTMLAudioElement를 직접 쓴다.
// 파일이 아직 없거나 재생이 막히면 조용히 넘어간다. 볼륨·음소거는 UI의 audio:settings(BGM과 같은 값)를 따른다.

export type SfxName = "launch" | "burst";

const FILES: Record<SfxName, string> = {
  launch: "/sfx/firework-launch.mp3",
  burst: "/sfx/firework-burst.mp3",
};

/** 같은 소리가 너무 많이 겹치지 않게 (삼연발·여러 사람이 동시에 쏠 때) */
const MAX_VOICES = 6;

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

  play(name: SfxName, gain = 1): void {
    if (this.muted || this.volume <= 0 || this.missing.has(name) || this.voices >= MAX_VOICES) return;
    const src = this.base.get(name);
    if (!src) return;
    const a = src.cloneNode(true) as HTMLAudioElement;
    a.volume = Math.max(0, Math.min(1, this.volume * gain));
    this.voices++;
    const done = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    a.play().catch(done);
  }

  destroy(): void {
    for (const a of this.base.values()) a.src = "";
    this.base.clear();
  }
}

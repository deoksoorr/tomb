import { AmbientLoop } from "./ambientLoop";
import { AudioHost } from "./audioHost";

// 50번 조각배·광장 놀거리 효과음 (scripts/gen-bgm.mjs가 굽는다: /sfx/row·boat-board·seesaw·boing·wish·carousel-loop).
// game/world/Sfx.ts와 같은 방식(HTMLAudio + 13번 효과음 갈래 sfx 버스). 파일이 없거나 재생이 막히면 조용히 넘어간다.

export type RideSoundName = "row" | "boat-board" | "seesaw" | "boing" | "wish";
const NAMES: readonly RideSoundName[] = ["row", "boat-board", "seesaw", "boing", "wish"];
const MAX_VOICES = 6;

export class RideSound extends AudioHost {
  private readonly base = new Map<RideSoundName, HTMLAudioElement>();
  private readonly missing = new Set<RideSoundName>();
  private voices = 0;
  /** 회전목마 오르골 (내가 목마에 탔을 때만 — PlazaRides가 rides.carouselOrganLevel로 정한다) */
  private readonly organ = new AmbientLoop(this, "/sfx/carousel-loop.mp3", { gain: 0.55 });
  constructor() {
    super("sfx");
    if (typeof Audio === "undefined") return;
    for (const name of NAMES) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("error", () => this.missing.add(name), { once: true });
      a.src = `/sfx/${name}.mp3`;
      this.base.set(name, a);
    }
  }

  protected override onMixChanged(): void {
    this.organ.refresh();
  }

  /** gain 0..1 (UI 볼륨에 곱한다), rate: 재생 속도 (살짝 바꿔 같은 소리가 덜 반복돼 들리게) */
  play(name: RideSoundName, gain = 1, rate = 1): void {
    if (this.muted || this.volume <= 0 || gain <= 0.01 || this.missing.has(name) || this.voices >= MAX_VOICES) return;
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

  /** 회전목마 음악 크기 0..1 (매 프레임 불러도 된다) */
  carousel(level: number): void {
    this.organ.set(level);
  }

  destroy(): void {
    this.organ.destroy();
    this.closeAudio();
    for (const a of this.base.values()) a.src = "";
    this.base.clear();
  }
}

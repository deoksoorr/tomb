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

  /** 회전목마 음악 크기 0..1 (매 프레임 불러도 된다) */
  carousel(level: number): void {
    this.organ.set(level);
  }

  destroy(): void {
    this.organ.destroy();
    this.closeAudio();
  }
}

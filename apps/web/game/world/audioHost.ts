import { audioLife } from "@/lib/audioLife";
import { busGain, loadSoundMix, type SoundBus, type SoundMix } from "@/lib/soundMix";
import { bridge } from "../bridge";

// 게임 소리의 바탕: WebAudio 컨텍스트 하나 + 소리 갈래(버스) 볼륨·끄기(13번 audio:mix) + 멈춘 컨텍스트 깨우기.
// 효과음(Sfx·RideSound·ForageSfx·HouseSfx)은 sfx 버스, 날씨 소리(WeatherSound)는 amb 버스가 기본이다.
// 한 호스트 안에서도 소리마다 다른 버스를 쓸 수 있다 (Sfx의 모닥불·물소리 루프는 환경음: AmbientLoop의 bus 옵션).
// 탭 숨김·복귀 때 멈추고 깨우는 것은 BGM·다른 소리와 함께 lib/audioLife가 한곳에서 한다 (컨텍스트를 거기 맡긴다).

export type { SoundBus };

export class AudioHost {
  protected ac: AudioContext | null = null;
  private mix: SoundMix;
  private kickAt = -Infinity;
  private readonly offMix: () => void;
  private offLife: (() => void) | null = null;

  constructor(protected readonly bus: SoundBus = "sfx") {
    this.mix = bridge.last("audio:mix") ?? loadSoundMix();
    this.offMix = bridge.on("audio:mix", (m) => {
      this.mix = m;
      this.onMixChanged();
    });
  }

  /** 소리 설정이 바뀌었다 (루프 소리를 가진 호스트가 다시 맞춘다) */
  protected onMixChanged(): void {}

  /** 기본 버스 볼륨 0..1 */
  get volume(): number {
    return this.mix[this.bus].volume;
  }

  /** 기본 버스를 껐는지 */
  get muted(): boolean {
    return this.mix[this.bus].muted;
  }

  /** 그 버스의 실제 크기 0..1 (끄면 0) */
  busGain(bus: SoundBus = this.bus): number {
    return busGain(this.mix, bus);
  }

  /** 탭이 숨어 있는지 (숨어 있으면 새 소리를 내지 않는다) */
  get hidden(): boolean {
    return audioLife.hidden;
  }

  /** 소리를 낼 수 있으면 (필요하면 만들어서) 컨텍스트를 돌려준다. 그 버스를 껐거나 볼륨 0이거나 탭이 숨었으면 null */
  audio(bus: SoundBus = this.bus): AudioContext | null {
    if (this.busGain(bus) <= 0 || audioLife.hidden) return null;
    if (!this.ac) {
      const AC =
        typeof window !== "undefined"
          ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      if (!AC) return null;
      try {
        this.ac = new AC();
        this.offLife = audioLife.registerContext(this.ac);
      } catch {
        return null;
      }
    }
    this.kick(true);
    return this.ac;
  }

  /** 이미 만든 컨텍스트 (없으면 null). 새로 만들지 않는다 */
  get context(): AudioContext | null {
    return this.ac;
  }

  /**
   * 멈춘 오디오 컨텍스트를 다시 깨운다. 창·탭을 바꾸면 브라우저가 컨텍스트를 suspended(크롬)·interrupted(사파리)로
   * 돌려 놓고, 사용자 입력 없이 부른 resume()은 거절되기도 한다 → 돌아온 뒤 입력이 들어올 때까지 1초마다 다시 시도한다.
   */
  kick(force = false): void {
    const ac = this.ac;
    if (!ac || ac.state === "running" || ac.state === "closed" || audioLife.hidden) return;
    const now = performance.now();
    if (!force && now - this.kickAt < 1000) return;
    this.kickAt = now;
    void ac.resume().catch(() => undefined);
  }

  protected closeAudio(): void {
    this.offMix();
    this.offLife?.();
    this.offLife = null;
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
  }
}

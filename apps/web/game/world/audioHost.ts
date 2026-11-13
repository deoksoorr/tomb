import { audioLife } from "@/lib/audioLife";
import { sharedAudioContext } from "@/lib/sharedAudio";
import { busGain, loadSoundMix, type SoundBus, type SoundMix } from "@/lib/soundMix";
import { bridge } from "../bridge";

// 게임 소리의 바탕: 앱 공용 WebAudio 컨텍스트(lib/sharedAudio) 위의 호스트 출력 노드 하나 + 소리 갈래(버스) 볼륨·끄기(13번 audio:mix) + 멈춘 컨텍스트 깨우기.
// 효과음(Sfx·RideSound·ForageSfx·HouseSfx)은 sfx 버스, 날씨 소리(WeatherSound)는 amb 버스가 기본이다.
// 한 호스트 안에서도 소리마다 다른 버스를 쓸 수 있다 (Sfx의 모닥불·물소리 루프는 환경음: AmbientLoop의 bus 옵션).
// 탭 숨김·복귀 때 멈추고 깨우는 것은 BGM·다른 소리와 함께 lib/audioLife가 한곳에서 한다 (컨텍스트를 거기 맡긴다).

export type { SoundBus };

export class AudioHost {
  protected ac: AudioContext | null = null;
  /** 이 호스트의 소리가 모두 지나가는 출력 (공용 컨텍스트는 닫지 않고, 호스트가 사라지면 이것만 뗀다) */
  private outNode: GainNode | null = null;
  private mix: SoundMix;
  private kickAt = -Infinity;
  private readonly offMix: () => void;

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
      const ac = sharedAudioContext();
      if (!ac) return null;
      try {
        const out = ac.createGain();
        out.connect(ac.destination);
        this.outNode = out;
      } catch {
        return null;
      }
      this.ac = ac;
    }
    this.kick(true);
    return this.ac;
  }

  /** 소리를 연결할 곳 (ac.destination 대신). audio()가 컨텍스트를 돌려준 뒤에만 쓴다 */
  get output(): AudioNode {
    return this.outNode ?? (this.ac as AudioContext).destination;
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
    // 이미 깨어 있으면 아무것도 안 한다 (아이폰은 불필요한 resume()도 오디오 세션을 건드린다)
    if (!ac || ac.state === "running" || ac.state === "closed" || audioLife.hidden) return;
    const now = performance.now();
    if (!force && now - this.kickAt < 1000) return;
    this.kickAt = now;
    void ac.resume().catch(() => undefined);
  }

  /** 호스트를 닫는다: 출력만 떼어 이 호스트의 소리를 끊는다 (공용 컨텍스트는 다른 소리가 쓰므로 닫지 않는다). 루프 소스는 각자 먼저 멈춘다 */
  protected closeAudio(): void {
    this.offMix();
    try {
      this.outNode?.disconnect();
    } catch {
      // 이미 뗐다
    }
    this.outNode = null;
    this.ac = null;
  }
}

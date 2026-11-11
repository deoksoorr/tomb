// 게임 소리의 바탕: WebAudio 컨텍스트 하나 + UI 볼륨·음소거(audio:settings, BGM과 같은 값) + 멈춘 컨텍스트 깨우기.
// 효과음(Sfx)·날씨 소리(WeatherSound)가 이 위에 올라간다. 루프 소리는 AmbientLoop가 이 호스트를 쓴다.

export class AudioHost {
  protected ac: AudioContext | null = null;
  private vol = 0.7;
  private mute = false;
  private kickAt = -Infinity;

  get volume(): number {
    return this.vol;
  }

  get muted(): boolean {
    return this.mute;
  }

  /** UI 볼륨: 0..1 (혹시 0..100이 오면 나눠서) */
  protected setVolume(volume: number, muted: boolean): void {
    const v = Number.isFinite(volume) ? (volume > 1 ? volume / 100 : volume) : 0.7;
    this.vol = Math.max(0, Math.min(1, v));
    this.mute = muted;
  }

  /** 소리를 낼 수 있으면 (필요하면 만들어서) 컨텍스트를 돌려준다. 음소거·볼륨 0이면 null */
  audio(): AudioContext | null {
    if (this.mute || this.vol <= 0) return null;
    if (!this.ac) {
      const AC =
        typeof window !== "undefined"
          ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      if (!AC) return null;
      try {
        this.ac = new AC();
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
    if (!ac || ac.state === "running" || ac.state === "closed") return;
    const now = performance.now();
    if (!force && now - this.kickAt < 1000) return;
    this.kickAt = now;
    void ac.resume().catch(() => undefined);
  }

  protected closeAudio(): void {
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
  }
}

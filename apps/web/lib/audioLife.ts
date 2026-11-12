// 모든 소리의 생명 주기를 한곳에서: 탭이 숨으면 함께 멈추고, 돌아오면 함께 재개한다.
//  - 오디오 컨텍스트(BGM·게임 소리 호스트·사냥 종소리)는 숨을 때 suspend(), 돌아오면 resume()
//  - 한 번 재생하는 <audio>(효과음)는 숨을 때 일시정지했다가 돌아오면 이어서 재생
//  - 루프 소리(AmbientLoop)·BGM 덱은 onAudioLife로 "hidden"/"visible"을 받아 스스로 멈추고 다시 튼다
// 크롬은 사용자 입력 없이 부른 resume()을 거절하기도 하고 사파리는 컨텍스트를 interrupted로 돌려 둔다
// → 돌아온 뒤 모든 컨텍스트가 running이 될 때까지 1초마다, 그리고 첫 입력(포인터·키·터치) 때 다시 깨운다.

export type AudioLifeState = "hidden" | "visible";
type Listener = (state: AudioLifeState) => void;

const RETRY_MS = 1000;
const RETRY_MAX = 15;

class AudioLife {
  private readonly contexts = new Set<AudioContext>();
  private readonly media = new Set<HTMLAudioElement>();
  /** 숨을 때 우리가 멈춘 <audio> (돌아오면 다시 튼다) */
  private readonly pausedMedia = new Set<HTMLAudioElement>();
  private readonly listeners = new Set<Listener>();
  private bound = false;
  private hiddenNow = false;
  /** 돌아온 뒤 아직 덜 깨어난 것이 있다 (다음 입력 때 다시 시도) */
  private needsWake = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;

  /** 탭이 숨어 있는지 (숨어 있으면 새 소리를 내지 않는다) */
  get hidden(): boolean {
    this.bind();
    return this.hiddenNow;
  }

  /** 오디오 컨텍스트를 맡긴다. 돌려준 함수로 뗀다 (close 전에) */
  registerContext(ac: AudioContext): () => void {
    this.bind();
    this.contexts.add(ac);
    if (this.hiddenNow) void ac.suspend?.().catch(() => undefined);
    return () => {
      this.contexts.delete(ac);
    };
  }

  /** 한 번 재생하는 <audio>: 끝나거나 오류가 나면 저절로 빠진다 */
  trackMedia(a: HTMLAudioElement): void {
    this.bind();
    this.media.add(a);
    const drop = () => {
      this.media.delete(a);
      this.pausedMedia.delete(a);
    };
    a.addEventListener("ended", drop, { once: true });
    a.addEventListener("error", drop, { once: true });
  }

  /** 숨김·복귀(그리고 복귀 뒤 입력으로 다시 깨울 때 "visible")를 듣는다. 여러 번 불려도 괜찮게 짜야 한다 */
  on(fn: Listener): () => void {
    this.bind();
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 멈춘(suspended·interrupted) 컨텍스트를 다시 깨운다. 숨어 있으면 아무것도 안 한다 */
  wake(): void {
    if (this.hiddenNow) return;
    for (const ac of this.contexts) {
      if (ac.state !== "running" && ac.state !== "closed") void ac.resume().catch(() => undefined);
    }
  }

  private bind(): void {
    if (this.bound || typeof document === "undefined" || typeof window === "undefined") return;
    this.bound = true;
    this.hiddenNow = document.hidden;
    document.addEventListener("visibilitychange", this.sync);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.sync);
    window.addEventListener("focus", this.sync);
    for (const ev of ["pointerdown", "keydown", "touchend", "mousedown"]) window.addEventListener(ev, this.onInput, true);
  }

  private readonly onPageHide = (): void => this.setHidden(true);

  private readonly sync = (): void => this.setHidden(document.hidden);

  private readonly onInput = (): void => {
    if (this.hiddenNow) return;
    if (!this.needsWake && this.allRunning()) return;
    this.wake();
    this.resumeMedia();
    this.emit("visible");
    this.needsWake = !this.allRunning();
  };

  private allRunning(): boolean {
    for (const ac of this.contexts) if (ac.state !== "running" && ac.state !== "closed") return false;
    return true;
  }

  private setHidden(hidden: boolean): void {
    if (hidden === this.hiddenNow) {
      // 창 전환(focus)·bfcache 복귀: 이미 보이는 상태여도 멈춘 게 있으면 깨운다
      if (!hidden && !this.allRunning()) this.show();
      return;
    }
    this.hiddenNow = hidden;
    if (hidden) this.hide();
    else this.show();
  }

  private hide(): void {
    this.stopRetry();
    this.needsWake = false;
    for (const a of this.media) {
      if (!a.paused && !a.ended) {
        a.pause();
        this.pausedMedia.add(a);
      }
    }
    this.emit("hidden");
    for (const ac of this.contexts) {
      if (ac.state === "running") void ac.suspend().catch(() => undefined);
    }
  }

  private show(): void {
    this.wake();
    this.resumeMedia();
    this.emit("visible");
    this.needsWake = true;
    this.retries = 0;
    this.scheduleRetry();
  }

  private resumeMedia(): void {
    for (const a of this.pausedMedia) {
      if (!a.ended) void a.play().catch(() => undefined);
    }
    this.pausedMedia.clear();
  }

  private scheduleRetry(): void {
    this.stopRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.hiddenNow) return;
      if (this.allRunning()) {
        // 컨텍스트가 늦게 깨어났다: 그 사이 못 튼 루프를 다시 튼다
        if (this.needsWake) this.emit("visible");
        this.needsWake = false;
        return;
      }
      this.wake();
      if (++this.retries < RETRY_MAX) this.scheduleRetry();
    }, RETRY_MS);
  }

  private stopRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private emit(state: AudioLifeState): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(state);
      } catch {
        // 한 소리의 실패가 다른 소리를 막지 않게
      }
    }
  }
}

/** 앱 전체에 하나 */
export const audioLife = new AudioLife();

import type { AudioHost } from "./audioHost";

// BGM 위에 은은하게 깔리는 루프 소리 하나 (모닥불·빗소리).
// MP3는 앞뒤에 인코더 무음이 몇 ms 붙는다 → <audio loop> 대신 AudioBufferSourceNode(loop)로, 앞뒤 20ms를 잘라 이음새가 안 들리게.
// 크기는 매 프레임 set()으로 줘도 된다 — 바뀔 때만 램프를 건다. 탭이 숨으면 멈추고, 돌아오면(창 전환·bfcache·다음 입력) 다시 깨운다.

export type LoopOptions = {
  /** UI 볼륨에 곱하는 크기 */
  gain: number;
  /** 로우패스 필터를 끼워 둔다 (실내에서 먹먹하게: setMuffled) */
  filter?: boolean;
};

/** 먹먹할 때 로우패스 주파수 (Hz) */
const MUFFLED_HZ = 650;
const OPEN_HZ = 18000;

export class AmbientLoop {
  private buf: AudioBuffer | null = null;
  private loading = false;
  private failed = false;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private level = 0;
  /** 소리가 0이 된 시각 (한동안 0이면 재생을 멈춘다) */
  private quietAt = 0;
  private hidden = false;
  private bound = false;
  private muffled = false;
  private dead = false;

  constructor(
    private readonly host: AudioHost,
    private readonly url: string,
    private readonly opts: LoopOptions,
  ) {}

  /** 크기 0..1 */
  set(level: number): void {
    if (this.dead) return;
    const lv = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    if (Math.abs(lv - this.level) < 0.01 && lv > 0 === this.level > 0) {
      this.maybeStop();
      // 들려야 하는데 멈춰 있다(창을 바꿨다 돌아옴 등): 컨텍스트를 깨우고, 숨을 때 멈춘 루프를 다시 튼다
      if (lv > 0 && !this.hidden && !this.host.muted) {
        this.host.kick();
        if (!this.src && this.buf) this.apply();
      }
      return;
    }
    this.level = lv;
    this.apply();
  }

  /** 실내: 고음을 깎아 벽 너머로 들리게 (filter 옵션이 있어야 한다) */
  setMuffled(muffled: boolean): void {
    if (muffled === this.muffled) return;
    this.muffled = muffled;
    const ac = this.host.context;
    if (this.lp && ac) this.lp.frequency.setTargetAtTime(muffled ? MUFFLED_HZ : OPEN_HZ, ac.currentTime, 0.25);
  }

  /** 볼륨·음소거가 바뀌었다 */
  refresh(): void {
    if (!this.dead) this.apply();
  }

  /** 지금 재생 중인지 (테스트·QA) */
  get playing(): boolean {
    return this.src !== null;
  }

  private apply(): void {
    const want = this.hidden || this.host.muted ? 0 : this.level * this.host.volume * this.opts.gain;
    if (want <= 0.001) {
      const ac = this.host.context;
      if (this.gain && ac) this.gain.gain.setTargetAtTime(0, ac.currentTime, 0.35);
      if (!this.quietAt) this.quietAt = performance.now();
      return;
    }
    this.quietAt = 0;
    const ac = this.host.audio();
    if (!ac) return;
    this.bindVisibility();
    if (!this.buf) {
      this.load(ac);
      return;
    }
    if (!this.gain) {
      this.gain = ac.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(ac.destination);
      if (this.opts.filter) {
        this.lp = ac.createBiquadFilter();
        this.lp.type = "lowpass";
        this.lp.frequency.value = this.muffled ? MUFFLED_HZ : OPEN_HZ;
        this.lp.connect(this.gain);
      }
    }
    if (!this.src) {
      const src = ac.createBufferSource();
      src.buffer = this.buf;
      src.loop = true;
      const d = this.buf.duration;
      if (d > 0.1) {
        src.loopStart = 0.02;
        src.loopEnd = d - 0.02;
      }
      src.connect(this.lp ?? this.gain);
      src.start(ac.currentTime + 0.01, 0.02 + Math.random() * Math.max(0, d - 0.1));
      this.src = src;
    }
    this.gain.gain.setTargetAtTime(want, ac.currentTime, 0.45);
  }

  /** 4초 넘게 조용하면 재생을 멈춘다 (다시 커지면 버퍼에서 새로 시작) */
  private maybeStop(): void {
    if (!this.src || !this.quietAt || performance.now() - this.quietAt < 4000) return;
    this.stopSource();
  }

  private stopSource(): void {
    if (!this.src) return;
    try {
      this.src.stop();
    } catch {
      // 이미 멈춤
    }
    this.src.disconnect();
    this.src = null;
  }

  private load(ac: AudioContext): void {
    if (this.loading || this.failed || typeof fetch === "undefined") return;
    this.loading = true;
    fetch(this.url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => {
        this.buf = buf;
        this.loading = false;
        if (!this.dead && this.host.context === ac) this.apply();
      })
      .catch(() => {
        this.loading = false;
        this.failed = true;
      });
  }

  private bindVisibility(): void {
    if (this.bound || typeof document === "undefined") return;
    this.bound = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    // 창 전환(탭은 그대로 보이는 경우 포함)·bfcache 복귀·다음 입력 때 컨텍스트를 다시 깨운다 (6번: 불멍 중 창을 바꾸면 소리가 사라짐)
    window.addEventListener("focus", this.onWake);
    window.addEventListener("pageshow", this.onWake);
    window.addEventListener("pointerdown", this.onWake, true);
    window.addEventListener("keydown", this.onWake, true);
  }

  private readonly onWake = (): void => {
    if (this.level <= 0 || this.host.muted) return;
    this.hidden = document.hidden;
    if (this.hidden) return;
    this.host.kick(true);
    this.apply();
  };

  private readonly onVisibility = (): void => {
    this.hidden = document.hidden;
    if (!this.hidden) this.host.kick(true);
    this.apply();
    if (this.hidden) this.quietAt = performance.now() - 4000;
    this.maybeStop();
  };

  destroy(): void {
    this.dead = true;
    if (this.bound) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("focus", this.onWake);
      window.removeEventListener("pageshow", this.onWake);
      window.removeEventListener("pointerdown", this.onWake, true);
      window.removeEventListener("keydown", this.onWake, true);
    }
    this.bound = false;
    this.stopSource();
    this.gain = null;
    this.lp = null;
  }
}

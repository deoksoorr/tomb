// 효과음 (폭죽). Phaser 오디오는 꺼 두었으므로 HTMLAudioElement를 직접 쓴다.
// 파일이 아직 없거나 재생이 막히면 조용히 넘어간다. 볼륨·음소거는 UI의 audio:settings(BGM과 같은 값)를 따른다.

export type SfxName = "launch" | "burst" | "say";

const FILES: Record<SfxName, string> = {
  launch: "/sfx/firework-launch.mp3",
  burst: "/sfx/firework-burst.mp3",
  say: "/sfx/say.mp3",
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
    this.applyCampfire();
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
    this.kick(true);
    return this.ac;
  }

  private kickAt = -Infinity;
  /**
   * 멈춘 오디오 컨텍스트를 다시 깨운다. 창·탭을 바꾸면 브라우저가 컨텍스트를 suspended(크롬)·interrupted(사파리)로
   * 돌려 놓고, 사용자 입력 없이 부른 resume()은 거절되기도 한다 → 돌아온 뒤 입력이 들어올 때까지 1초마다 다시 시도한다.
   */
  private kick(force = false): void {
    const ac = this.ac;
    if (!ac || ac.state === "running" || ac.state === "closed") return;
    const now = performance.now();
    if (!force && now - this.kickAt < 1000) return;
    this.kickAt = now;
    void ac.resume().catch(() => undefined);
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

  // ── 모닥불 타는 소리 (BGM 위에 은은한 루프) ──
  // MP3는 앞뒤에 인코더 무음이 몇 ms 붙는다 → <audio loop> 대신 AudioBufferSourceNode(loop)로, 앞뒤 20ms를 잘라 이음새가 안 들리게.
  private fireBuf: AudioBuffer | null = null;
  private fireLoading = false;
  private fireFailed = false;
  private fireSrc: AudioBufferSourceNode | null = null;
  private fireGain: GainNode | null = null;
  private fireLevel = 0;
  /** 소리가 0이 된 시각 (한동안 0이면 재생을 멈춘다) */
  private fireQuietAt = 0;
  private fireHidden = false;
  private fireVisBound = false;

  /**
   * 모닥불 소리 크기 0..1 (거리·앉음은 campfireLevel()로). 매 프레임 불러도 된다 — 바뀔 때만 램프를 건다.
   * audio:settings(볼륨·음소거)를 따르고, 탭이 숨으면 멈춘다.
   */
  campfire(level: number): void {
    const lv = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    if (Math.abs(lv - this.fireLevel) < 0.01 && (lv > 0) === (this.fireLevel > 0)) {
      this.maybeStopFire();
      // 들려야 하는데 멈춰 있다(창을 바꿨다 돌아옴 등): 컨텍스트를 깨우고, 숨을 때 멈춘 루프를 다시 튼다
      if (lv > 0 && !this.fireHidden && !this.muted) {
        this.kick();
        if (!this.fireSrc && this.fireBuf) this.applyCampfire();
      }
      return;
    }
    this.fireLevel = lv;
    this.applyCampfire();
  }

  private applyCampfire(): void {
    const want = this.fireHidden || this.muted ? 0 : this.fireLevel * this.volume * 0.75;
    if (want <= 0.001) {
      if (this.fireGain && this.ac) this.fireGain.gain.setTargetAtTime(0, this.ac.currentTime, 0.35);
      if (!this.fireQuietAt) this.fireQuietAt = performance.now();
      return;
    }
    this.fireQuietAt = 0;
    const ac = this.audio();
    if (!ac) return;
    this.bindFireVisibility();
    if (!this.fireBuf) {
      this.loadFire(ac);
      return;
    }
    if (!this.fireGain) {
      this.fireGain = ac.createGain();
      this.fireGain.gain.value = 0;
      this.fireGain.connect(ac.destination);
    }
    if (!this.fireSrc) {
      const src = ac.createBufferSource();
      src.buffer = this.fireBuf;
      src.loop = true;
      const d = this.fireBuf.duration;
      if (d > 0.1) {
        src.loopStart = 0.02;
        src.loopEnd = d - 0.02;
      }
      src.connect(this.fireGain);
      src.start(ac.currentTime + 0.01, 0.02 + Math.random() * Math.max(0, d - 0.1));
      this.fireSrc = src;
    }
    this.fireGain.gain.setTargetAtTime(want, ac.currentTime, 0.45);
  }

  /** 4초 넘게 조용하면 재생을 멈춘다 (다시 가까워지면 버퍼에서 새로 시작) */
  private maybeStopFire(): void {
    if (!this.fireSrc || !this.fireQuietAt || performance.now() - this.fireQuietAt < 4000) return;
    try {
      this.fireSrc.stop();
    } catch {
      // 이미 멈춤
    }
    this.fireSrc.disconnect();
    this.fireSrc = null;
  }

  private loadFire(ac: AudioContext): void {
    if (this.fireLoading || this.fireFailed || typeof fetch === "undefined") return;
    this.fireLoading = true;
    fetch("/sfx/campfire.mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => {
        this.fireBuf = buf;
        this.fireLoading = false;
        if (this.ac === ac) this.applyCampfire();
      })
      .catch(() => {
        this.fireLoading = false;
        this.fireFailed = true;
      });
  }

  private bindFireVisibility(): void {
    if (this.fireVisBound || typeof document === "undefined") return;
    this.fireVisBound = true;
    document.addEventListener("visibilitychange", this.onFireVisibility);
    // 창 전환(탭은 그대로 보이는 경우 포함)·bfcache 복귀·다음 입력 때 컨텍스트를 다시 깨운다 (6번: 불멍 중 창을 바꾸면 소리가 사라짐)
    window.addEventListener("focus", this.onFireWake);
    window.addEventListener("pageshow", this.onFireWake);
    window.addEventListener("pointerdown", this.onFireWake, true);
    window.addEventListener("keydown", this.onFireWake, true);
  }

  private readonly onFireWake = (): void => {
    if (this.fireLevel <= 0 || this.muted) return;
    this.fireHidden = document.hidden;
    if (this.fireHidden) return;
    this.kick(true);
    this.applyCampfire();
  };

  private readonly onFireVisibility = (): void => {
    this.fireHidden = document.hidden;
    if (!this.fireHidden) this.kick(true);
    this.applyCampfire();
    if (this.fireHidden) this.fireQuietAt = performance.now() - 4000;
    this.maybeStopFire();
  };

  destroy(): void {
    if (this.fireVisBound) {
      document.removeEventListener("visibilitychange", this.onFireVisibility);
      window.removeEventListener("focus", this.onFireWake);
      window.removeEventListener("pageshow", this.onFireWake);
      window.removeEventListener("pointerdown", this.onFireWake, true);
      window.removeEventListener("keydown", this.onFireWake, true);
    }
    this.fireVisBound = false;
    try {
      this.fireSrc?.stop();
    } catch {
      // 무시
    }
    this.fireSrc = null;
    this.fireGain = null;
    void this.ac?.close().catch(() => undefined);
    this.ac = null;
    for (const a of this.base.values()) a.src = "";
    this.base.clear();
  }
}

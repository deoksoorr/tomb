import { audioLife, type AudioLifeState } from "@/lib/audioLife";
import type { AudioHost, SoundBus } from "./audioHost";

// BGM 위에 은은하게 깔리는 루프 소리 하나 (모닥불·빗소리).
// MP3는 앞뒤에 인코더 무음이 몇 ms 붙는다 → <audio loop> 대신 AudioBufferSourceNode(loop)로, 앞뒤 20ms를 잘라 이음새가 안 들리게.
// 크기는 매 프레임 set()으로 줘도 된다 — 바뀔 때만 램프를 건다. 탭이 숨으면 멈추고, 돌아오면(창 전환·bfcache·다음 입력) 다시 튼다 — 숨김·복귀 신호는 lib/audioLife가 모든 소리에 함께 보낸다.

export type LoopOptions = {
  /** UI 볼륨에 곱하는 크기 */
  gain: number;
  /** 로우패스 필터를 끼워 둔다 (실내에서 먹먹하게: setMuffled) */
  filter?: boolean;
  /** 13번: 따를 소리 갈래 (없으면 호스트의 기본 버스) */
  bus?: SoundBus;
};

/** 크기가 이만큼 넘게 바뀔 때만 램프를 다시 건다 (걸어가며 매 프레임 조금씩 바뀌어도 초당 몇 번만) */
const LEVEL_STEP = 0.02;
/** 소리를 새로 시작하는 최소 크기. 멈추는 문턱(0.001)보다 높게 둬서, 들릴 듯 말 듯한 거리 문턱에서 켜졌다 꺼졌다 하지 않게 (히스테리시스) */
const START_MIN = 0.012;
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
  /** 마지막으로 건 게인 목표 (같은 목표를 다시 걸지 않는다) */
  private target = 0;
  /** 소리가 0이 된 시각 (한동안 0이면 재생을 멈춘다) */
  private quietAt = 0;
  private offLife: (() => void) | null = null;
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
    if (Math.abs(lv - this.level) < LEVEL_STEP && lv > 0 === this.level > 0) {
      this.maybeStop();
      // 들려야 하는데 멈춰 있다(창을 바꿨다 돌아옴 등): 컨텍스트를 깨우고, 숨을 때 멈춘 루프를 다시 튼다
      // (시작 문턱보다 작으면 건드리지 않는다 — 문턱 근처에 서 있을 때 매 프레임 apply()가 돌지 않게)
      if (lv > 0 && !this.hidden && this.busGain > 0) {
        this.host.kick();
        if (!this.src && this.buf && this.wanted() >= START_MIN) this.apply();
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

  /** 탭이 숨었는지 (lib/audioLife가 모든 소리에 같은 값을 준다) */
  private get hidden(): boolean {
    return audioLife.hidden;
  }

  /** 이 루프가 따르는 버스의 크기 (끄면 0) */
  private get busGain(): number {
    return this.host.busGain(this.opts.bus);
  }

  /** 지금 재생 중인지 (테스트·QA) */
  get playing(): boolean {
    return this.src !== null;
  }

  /** 지금 내야 할 크기 (버스 볼륨·옵션 반영) */
  private wanted(): number {
    return this.hidden ? 0 : this.level * this.busGain * this.opts.gain;
  }

  /** 게인 목표가 바뀔 때만 램프를 건다 */
  private ramp(ac: AudioContext, v: number, tc: number): void {
    if (!this.gain || Math.abs(v - this.target) < 0.0005) return;
    this.target = v;
    this.gain.gain.setTargetAtTime(v, ac.currentTime, tc);
  }

  private apply(): void {
    const want = this.wanted();
    // 멈춰 있으면 START_MIN부터, 울리는 중이면 0.001까지 (히스테리시스)
    if (want <= 0.001 || (!this.src && want < START_MIN)) {
      const ac = this.host.context;
      if (ac) this.ramp(ac, 0, 0.35);
      if (!this.quietAt) this.quietAt = performance.now();
      return;
    }
    this.quietAt = 0;
    const ac = this.host.audio(this.opts.bus);
    if (!ac) return;
    this.bindVisibility();
    if (!this.buf) {
      this.load(ac);
      return;
    }
    if (!this.gain) {
      this.gain = ac.createGain();
      this.gain.gain.value = 0;
      this.target = 0;
      this.gain.connect(this.host.output);
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
    this.ramp(ac, want, 0.45);
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
    this.offLife ??= audioLife.on(this.onLife);
  }

  /** 탭이 숨으면 바로 멈추고(소스를 내린다), 돌아오면(또는 복귀 뒤 첫 입력) 컨텍스트를 깨워 다시 튼다 */
  private readonly onLife = (state: AudioLifeState): void => {
    if (state === "hidden") {
      this.apply();
      this.quietAt = performance.now() - 4000;
      this.maybeStop();
      return;
    }
    if (this.level <= 0 || this.busGain <= 0) return;
    this.host.kick(true);
    this.apply();
  };

  destroy(): void {
    this.dead = true;
    this.offLife?.();
    this.offLife = null;
    this.stopSource();
    // 공용 컨텍스트는 닫히지 않으므로 게인·필터도 그래프에서 뗀다
    try {
      this.lp?.disconnect();
      this.gain?.disconnect();
    } catch {
      // 이미 뗐다
    }
    this.gain = null;
    this.lp = null;
  }
}

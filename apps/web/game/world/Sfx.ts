import { playBuffer, preloadSound, releaseOnEnd, soundMissing } from "@/lib/sharedAudio";
import { AmbientLoop } from "./ambientLoop";
import { AudioHost, type SoundBus } from "./audioHost";

// 월드 효과음 (폭죽·말풍선·종·물 튀기기·그네 삐걱). Phaser 오디오는 꺼 두었으므로 공용 WebAudio 컨텍스트에 미리 디코딩한 버퍼로 낸다
// (아이폰 홈 화면 앱에서 <audio>를 매번 재생하면 '지금 재생 중'이 켜졌다 꺼지며 버벅인다 — lib/sharedAudio).
// 파일이 아직 없거나 재생이 막히면 조용히 넘어간다. 13번: 효과음 갈래(sfx 버스)를 따르고,
// 모닥불 루프·물소리(수영 물장구 루프·잠수 물방울)는 환경음 갈래(amb 버스)를 따른다.
// WebAudio 컨텍스트·볼륨·깨우기는 AudioHost, 루프는 AmbientLoop (빗소리 WeatherSound와 같은 코드).

export type SfxName = "launch" | "burst" | "say" | "swing" | "bubble" | "thud" | "clack";

const FILES: Record<SfxName, string> = {
  launch: "/sfx/firework-launch.mp3",
  burst: "/sfx/firework-burst.mp3",
  say: "/sfx/say.mp3",
  // 14번: 그네 삐걱(앞으로·뒤로 한 번씩, 약 1.4초) · 잠수 물방울 (scripts/gen-bgm.mjs가 굽는다)
  swing: "/sfx/swing.mp3",
  bubble: "/sfx/bubble.mp3",
  // 11/15 캠핑장: 음료 자판기 덜컹(캔이 떨어지는 소리), 3배 통삼겹 쿵 (사냥터와 같은 파일)
  thud: "/sfx/thud.mp3",
  clack: "/sfx/clack.mp3",
};

/** 11/16 바닷가 갈매기 울음 셋 (scripts/gen-gull.mjs가 굽는다, 환경음 갈래) */
const GULLS = ["/sfx/gull-1.mp3", "/sfx/gull-2.mp3", "/sfx/gull-3.mp3"];

/** 파일마다 따르는 소리 갈래 (없으면 효과음) */
const FILE_BUS: Partial<Record<SfxName, SoundBus>> = { bubble: "amb" };

/** 같은 소리가 너무 많이 겹치지 않게 (피날레·여러 사람이 동시에 쏠 때도 이 이상은 안 겹친다) */
const MAX_VOICES = 12;

export class Sfx extends AudioHost {
  private voices = 0;
  /** 모닥불 타는 소리 (BGM 위에 은은한 루프, 환경음) */
  private readonly fire = new AmbientLoop(this, "/sfx/campfire.mp3", { gain: 0.75, bus: "amb" });
  /** 11/16 바닷가 파도·갈매기 루프 (바닷가 맵에 있는 동안만, 환경음 — scripts/gen-sea-loop.mjs가 굽는다) */
  private readonly sea = new AmbientLoop(this, "/sfx/sea-loop.mp3", { gain: 0.55, bus: "amb" });
  /** 14번 물소리: 수영하는 동안 물장구 루프 (잠수하면 먹먹하게, 환경음) */
  private readonly swim = new AmbientLoop(this, "/sfx/swim.mp3", { gain: 0.5, bus: "amb", filter: true });
  /** 잠수 중 다음 물방울 소리 시각 */
  private bubbleAt = 0;

  constructor() {
    super("sfx");
    for (const url of Object.values(FILES)) void preloadSound(url);
    for (const url of GULLS) void preloadSound(url);
    void preloadSound("/sfx/foghorn.mp3");
  }

  protected override onMixChanged(): void {
    this.fire.refresh();
    this.swim.refresh();
    this.sea.refresh();
  }

  /**
   * gain: 0..1 (UI 볼륨에 곱한다), rate: 재생 속도(작으면 낮고 묵직한 소리),
   * limit: 이미 이만큼 겹쳐 있으면 건너뛴다 (중요하지 않은 소리는 작게 줘서 자리를 남긴다)
   */
  play(name: SfxName, gain = 1, rate = 1, limit = MAX_VOICES): void {
    const bus = FILE_BUS[name] ?? "sfx";
    const vol = this.busGain(bus);
    const url = FILES[name];
    if (vol <= 0 || this.hidden || soundMissing(url) || this.voices >= Math.min(limit, MAX_VOICES)) return;
    const ac = this.audio(bus);
    if (!ac) return;
    const started = playBuffer(ac, this.output, url, {
      gain: Math.max(0, Math.min(1, vol * gain)),
      rate,
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
      },
    });
    if (started) this.voices++;
  }

  // ── 합성음 (파일 없이 WebAudio로): 종소리·물소리 ──
  private noise: AudioBuffer | null = null;

  /** 범종 한 번: 낮은 기음 + 비조화 배음, 길게 울린다. gain: 거리 감쇠 등 */
  bell(gain = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    const out = ac.createGain();
    out.gain.value = Math.min(1, this.busGain() * gain) * 0.32;
    out.connect(this.output);
    const base = 196;
    const partials: [number, number, number][] = [
      [1, 1, 3.2],
      [2.0, 0.55, 2.2],
      [2.76, 0.4, 1.6],
      [5.4, 0.18, 0.8],
      [0.5, 0.35, 3.6],
    ];
    let longest: OscillatorNode | null = null;
    let longestDur = 0;
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
      releaseOnEnd(o, g);
      if (dur > longestDur) {
        longestDur = dur;
        longest = o;
      }
    }
    // 가장 길게 울리는 배음이 끝나면 묶음 출력도 뗀다
    if (longest) releaseOnEnd(longest, out);
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
    const v = Math.min(1, this.busGain() * gain) * 0.5;
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
    src.connect(bp).connect(g).connect(this.output);
    src.start(t);
    src.stop(t + 0.45);
    releaseOnEnd(src, bp, g);
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
      o.connect(og).connect(this.output);
      o.start(at);
      o.stop(at + 0.1);
      releaseOnEnd(o, og);
    }
  }

  /**
   * 11/18 눈싸움 소리 (파일 없이 걸러낸 잡음): toss = 손을 떠나는 짧은 바람 소리, hit = 퍽 (낮고 둔한 터짐 + 사각 부서짐),
   * land = 바닥에 떨어지는 작은 사각 소리
   */
  snow(kind: "toss" | "hit" | "land", gain = 1): void {
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01;
    if (!this.noise) {
      const n = Math.floor(ac.sampleRate * 0.5);
      this.noise = ac.createBuffer(1, n, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const v = Math.min(1, this.busGain() * gain) * (kind === "hit" ? 0.7 : kind === "land" ? 0.3 : 0.22);
    const len = kind === "hit" ? 0.22 : kind === "land" ? 0.12 : 0.16;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    if (kind === "toss") {
      f.type = "bandpass";
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + len);
      f.Q.value = 1.4;
    } else {
      f.type = "lowpass";
      f.frequency.setValueAtTime(kind === "hit" ? 1400 : 2400, t);
      f.frequency.exponentialRampToValueAtTime(kind === "hit" ? 260 : 700, t + len);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + (kind === "toss" ? 0.05 : 0.004));
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.output);
    src.start(t, Math.random() * 0.2);
    src.stop(t + len + 0.02);
    releaseOnEnd(src, f, g);
    if (kind !== "hit") return;
    // 퍽 다음에 눈 부서지는 사각 소리 (높은 잡음 짧게)
    const crunch = ac.createBufferSource();
    crunch.buffer = this.noise;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    const cg = ac.createGain();
    const at = t + 0.03;
    cg.gain.setValueAtTime(0, at);
    cg.gain.linearRampToValueAtTime(v * 0.35, at + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
    crunch.connect(hp).connect(cg).connect(this.output);
    crunch.start(at, Math.random() * 0.3);
    crunch.stop(at + 0.12);
    releaseOnEnd(crunch, hp, cg);
  }

  /**
   * 모닥불 소리 크기 0..1 (거리·앉음은 campfireLevel()로). 매 프레임 불러도 된다 — 바뀔 때만 램프를 건다.
   * 13번 환경음 갈래(audio:mix amb)를 따르고, 탭이 숨으면 멈춘다.
   */
  campfire(level: number): void {
    this.fire.set(level);
  }

  /**
   * 14번 물소리 (내가 물에 있을 때, 매 프레임): moving = 헤엄치는 중, diving = 잠수.
   * 수영은 물장구 루프(가만히 떠 있으면 작게), 잠수는 루프를 먹먹하게 줄이고 가끔 물방울. 물 밖이면 끈다
   */
  water(state: "swim" | "dive" | null, moving: boolean, now: number): void {
    const level = state === "swim" ? (moving ? 1 : 0.35) : state === "dive" ? (moving ? 0.45 : 0.2) : 0;
    this.swim.setMuffled(state === "dive");
    this.swim.set(level);
    if (state !== "dive") {
      this.bubbleAt = 0;
      return;
    }
    if (now < this.bubbleAt) return;
    if (this.bubbleAt) this.play("bubble", 0.55, 0.9 + Math.random() * 0.25, 4);
    this.bubbleAt = now + 1500 + Math.random() * 1400;
  }

  /** 11/16 바닷가 파도 소리 크기 0..1 (바닷가 장면이 매 프레임 — 물가에 가까울수록 크게, 떠나면 0) */
  seaWaves(level: number): void {
    this.sea.set(level);
  }

  /**
   * 11/16 갈매기 울음 한 번 (바닷가). gain 0..1 (거리·상황), pan -1(왼쪽)..1(오른쪽). 셋 중 하나를 높낮이를 조금 바꿔 내요.
   * 환경음 갈래(볼륨·음소거)를 따라요
   */
  gull(gain = 0.6, pan = 0): void {
    const vol = this.busGain("amb");
    const url = GULLS[Math.floor(Math.random() * GULLS.length)];
    if (vol <= 0 || this.hidden || soundMissing(url) || this.voices >= MAX_VOICES) return;
    const ac = this.audio("amb");
    if (!ac) return;
    let out: AudioNode = this.output;
    let pn: StereoPannerNode | null = null;
    try {
      pn = ac.createStereoPanner();
      pn.pan.value = Math.max(-1, Math.min(1, pan)) * 0.8;
      pn.connect(this.output);
      out = pn;
    } catch {
      pn = null;
    }
    const started = playBuffer(ac, out, url, {
      gain: Math.max(0, Math.min(1, vol * gain * 0.55)),
      rate: 0.88 + Math.random() * 0.26,
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
        pn?.disconnect();
      },
    });
    if (started) this.voices++;
    else pn?.disconnect();
  }

  /** 11/16 안개 낀 날 등대 무적 한 번 (바닷가, 환경음 갈래 — scripts/gen-foghorn.mjs) */
  foghorn(gain = 0.6): void {
    const vol = this.busGain("amb");
    const url = "/sfx/foghorn.mp3";
    if (vol <= 0 || this.hidden || soundMissing(url) || this.voices >= MAX_VOICES) return;
    const ac = this.audio("amb");
    if (!ac) return;
    const started = playBuffer(ac, this.output, url, {
      gain: Math.max(0, Math.min(1, vol * gain * 0.6)),
      rate: 0.96 + Math.random() * 0.08,
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
      },
    });
    if (started) this.voices++;
  }

  /** 14번 그네 삐걱 한 번 (앞으로·뒤로). 그네 진자 한 주기마다 씬이 부른다 */
  swingCreak(gain = 0.6): void {
    this.play("swing", gain, 0.95 + Math.random() * 0.1, 6);
  }

  destroy(): void {
    this.fire.destroy();
    this.swim.destroy();
    this.sea.destroy();
    this.closeAudio();
  }
}

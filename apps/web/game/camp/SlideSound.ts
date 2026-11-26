import { audioLife } from "@/lib/audioLife";
import { AudioHost } from "../world/audioHost";
import { makeNoise, playSlideCue, startSlideRun, type SlideCue, type SlideKind, type SlideRunVoice } from "./slideSynth";

// 11/26 캠핑장 미끄럼(눈썰매·워터 슬라이드) 효과음 — 효과음 갈래(sfx 버스) 볼륨·끄기를 따르고, 탭이 숨으면 내지 않는다.
// 소리 모양은 slideSynth(합성), 언제·얼마나는 slideSoundPlan. 미끄럼은 한 사람만 타므로 내려가는 루프도 한 가닥이다.
// 루프는 아무도 안 타면 잦아들며 멈추고, 탭 숨김·효과음 끄기·장면 정리 때 바로 끊는다 (남는 소리 없음).

/** 같은 한 번 소리가 너무 붙어 나지 않게 (ms) */
const CUE_GAP_MS = 150;

type DevLog = { at: number; ev: string; kind: SlideKind; gain: number }[];

export class SlideSound extends AudioHost {
  private noise: AudioBuffer | null = null;
  private run: { voice: SlideRunVoice; kind: SlideKind } | null = null;
  private lastCue = new Map<SlideCue, number>();
  private readonly offLife: () => void;
  /** 탭이 뒤로 가면 게임 프레임이 멈춘다 → 루프를 바로 끊는다 (한 번 소리는 원래 규칙대로) */
  private readonly onVis = (): void => {
    if (document.hidden) this.stopRun(0.05);
  };

  constructor() {
    super("sfx");
    this.offLife = audioLife.on((s) => {
      if (s === "hidden") this.stopRun(0.03);
    });
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVis);
  }

  protected override onMixChanged(): void {
    if (this.muted || this.volume <= 0) this.stopRun(0.05);
  }

  private noiseOf(ac: BaseAudioContext): AudioBuffer {
    if (!this.noise || this.noise.sampleRate !== ac.sampleRate) this.noise = makeNoise(ac, 2);
    return this.noise;
  }

  /** 한 번 소리 (오르기·앉기·닿기). gain 0..1 (탄 사람 1, 구경꾼은 거리로 작게) */
  cue(kind: SlideKind, cue: SlideCue, gain = 1, bells = false): void {
    if (gain <= 0.01 || this.muted || this.volume <= 0 || this.hidden) return;
    const now = performance.now();
    if (now - (this.lastCue.get(cue) ?? -Infinity) < CUE_GAP_MS) return;
    const ac = this.audio();
    if (!ac) return;
    this.lastCue.set(cue, now);
    const v = Math.min(1, this.volume * gain);
    playSlideCue(ac, this.output, this.noiseOf(ac), kind, cue, ac.currentTime + 0.01, v, bells);
    devLog(cue, kind, v);
  }

  /** 내려가는 소리 (매 프레임): level 0..1, speed 0..1 (둘 중 하나가 0이면 — 오르는 중·멈춤 — 잦아들며 멈춘다) */
  runLevel(kind: SlideKind, level: number, speed: number): void {
    if (level <= 0.01 || speed <= 0 || this.muted || this.volume <= 0 || this.hidden) {
      this.stopRun(0.18);
      return;
    }
    if (this.run && this.run.kind !== kind) this.stopRun(0.05);
    const ac = this.audio();
    if (!ac) return;
    if (!this.run) {
      this.run = { voice: startSlideRun(ac, this.output, this.noiseOf(ac), kind, ac.currentTime), kind };
      devLog("run", kind, this.volume * level);
    }
    this.run.voice.set(Math.min(1, this.volume * level), speed, ac.currentTime);
  }

  /** 내려가는 소리를 끊는다 (fadeSec 동안 잦아든 뒤 노드를 뗀다) */
  stopRun(fadeSec = 0.12): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    const ac = this.context;
    r.voice.stop(ac ? ac.currentTime : 0, fadeSec);
    devLog("runStop", r.kind, 0);
  }

  /** 내려가는 소리가 나는 중인지 */
  get running(): boolean {
    return this.run !== null;
  }

  destroy(): void {
    this.stopRun(0.03);
    this.offLife();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVis);
    this.closeAudio();
  }
}

/** 개발 서버에서만: 소리가 난 때를 window.__tombSlideSfx에 남긴다 (브라우저 확인용, 실서버 빌드에서는 빠진다) */
function devLog(ev: string, kind: SlideKind, gain: number): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const w = window as unknown as { __tombSlideSfx?: DevLog };
  const log = (w.__tombSlideSfx ??= []);
  log.push({ at: Math.round(performance.now()), ev, kind, gain: Math.round(gain * 1000) / 1000 });
  if (log.length > 200) log.splice(0, log.length - 200);
}

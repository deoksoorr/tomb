import { audioLife } from "@/lib/audioLife";
import { playBuffer, preloadSound, sharedAudioContext, soundMissing } from "@/lib/sharedAudio";
import { busGain, loadSoundMix } from "@/lib/soundMix";
import { bridge } from "../bridge";
import { AudioHost } from "../world/audioHost";

// 사냥터 효과음. Phaser 오디오는 꺼 두었으므로 공용 WebAudio 컨텍스트에 미리 디코딩한 버퍼로 낸다 (game/world/Sfx.ts와 같은 방식,
// 아이폰 홈 화면 앱에서 <audio>를 매번 재생하면 '지금 재생 중'이 깜빡이며 버벅인다 — lib/sharedAudio).
// 파일이 아직 없거나 재생이 막히면 조용히 넘어가고, 13번: 볼륨·끄기는 효과음 갈래(audio:mix sfx 버스)를 따른다.

export type RpgSound =
  | "hit"
  | "crit"
  | "monster-die"
  | "levelup"
  | "potion"
  | "skill"
  | "coin-drop"
  | "defeat"
  | "victory"
  | "tick"
  | "miss"
  // 2·16·40번 사냥 손맛: 처치, 무기마다 공격 소리, 몬스터 경고·내려찍기, 우두머리 단계
  | "kill"
  | "swish"
  | "thud"
  | "stab"
  | "clack"
  | "twang"
  | "flick"
  | "ink"
  | "warn"
  | "slam"
  | "roar";

const NAMES: RpgSound[] = [
  "hit",
  "crit",
  "monster-die",
  "levelup",
  "potion",
  "skill",
  "coin-drop",
  "defeat",
  "victory",
  "tick",
  "miss",
  "kill",
  "swish",
  "thud",
  "stab",
  "clack",
  "twang",
  "flick",
  "ink",
  "warn",
  "slam",
  "roar",
];
const MAX_VOICES = 8;

const url = (name: RpgSound) => `/sfx/${name}.mp3`;

export class RpgSfx extends AudioHost {
  private voices = 0;

  constructor() {
    super("sfx");
    for (const name of NAMES) void preloadSound(url(name));
  }

  play(name: RpgSound, gain = 1): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden || soundMissing(url(name)) || this.voices >= MAX_VOICES) return;
    const ac = this.audio();
    if (!ac) return;
    const started = playBuffer(ac, this.output, url(name), {
      gain: Math.max(0, Math.min(1, vol * gain)),
      onEnded: () => {
        this.voices = Math.max(0, this.voices - 1);
      },
    });
    if (started) this.voices++;
  }

  /**
   * 은은한 종소리 (별자리 잇기). 파일 없이 WebAudio로 합성한다: 펜타토닉 음계의 사인파 + 한 옥타브 위 약한 배음, 천천히 사라진다.
   * degree: 음계 단계 (별 순서), bright: 완벽 판정이면 조금 더 밝게
   */
  chime(degree: number, bright = false): void {
    const vol = this.busGain();
    if (vol <= 0) return;
    try {
      const ctx = this.audio();
      if (!ctx) return;
      const scale = [0, 2, 4, 7, 9];
      const step = scale[((degree % 5) + 5) % 5] + 12 * Math.floor(degree / 5);
      const freq = 523.25 * 2 ** (step / 12);
      const t0 = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.16 * vol * (bright ? 1.2 : 0.9), t0 + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      out.connect(this.output);
      for (const [mul, g] of [
        [1, 1],
        [2, bright ? 0.28 : 0.15],
        [3, 0.05],
      ] as const) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq * mul;
        og.gain.value = g;
        o.connect(og).connect(out);
        o.start(t0);
        o.stop(t0 + 1.5);
      }
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  /**
   * 스킬 갈래별 합성 효과음 (공용 WebAudio 컨텍스트, 파일 없이): 효과음 파일(slam·ink 등)에 겹쳐 갈래 색을 입힌다.
   *  - 모닥불: 낮게 쿵 + 불길 쉬익 (저역 잡음)
   *  - 서리: 높은 유리 종소리 + 바삭한 고역 잡음
   *  - 넋: 두 음이 엇갈려 떨리며 올라가는 울림
   * power 1~3: 클수록 길고 크게
   */
  burst(branch: "ember" | "frost" | "soul", power = 1): void {
    const vol = this.busGain();
    if (vol <= 0 || this.hidden) return;
    try {
      const ctx = this.audio();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const len = 0.25 + power * 0.18;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(Math.min(0.5, 0.16 + power * 0.08) * vol, t0 + 0.015);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      out.connect(this.output);
      // 잡음 (불길·서리 바스락)
      const n = Math.floor(ctx.sampleRate * len);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = branch === "frost" ? "highpass" : branch === "ember" ? "lowpass" : "bandpass";
      f.frequency.setValueAtTime(branch === "frost" ? 3200 : branch === "ember" ? 900 : 1400, t0);
      if (branch === "ember") f.frequency.exponentialRampToValueAtTime(220, t0 + len);
      const ng = ctx.createGain();
      ng.gain.value = branch === "soul" ? 0.25 : 0.7;
      src.connect(f).connect(ng).connect(out);
      src.start(t0);
      src.stop(t0 + len);
      // 음 (쿵 · 종 · 울림)
      const tones: [number, number, OscillatorType][] =
        branch === "ember" ? [[90, 0.9, "sine"], [60, 0.6, "triangle"]] : branch === "frost" ? [[1568, 0.35, "sine"], [2349, 0.22, "sine"], [3136, 0.12, "sine"]] : [[392, 0.4, "sine"], [397, 0.4, "sine"], [587, 0.25, "triangle"]];
      for (const [hz, g, type] of tones) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(hz, t0);
        if (branch === "ember") o.frequency.exponentialRampToValueAtTime(hz * 0.5, t0 + len);
        if (branch === "soul") o.frequency.exponentialRampToValueAtTime(hz * 1.5, t0 + len);
        og.gain.value = g;
        o.connect(og).connect(out);
        o.start(t0);
        o.stop(t0 + len);
      }
    } catch {
      /* 오디오를 못 쓰면 조용히 */
    }
  }

  destroy(): void {
    this.closeAudio();
  }
}

/** 씬 밖(결과 화면 등)에서 효과음 한 번 (볼륨·음소거 설정을 따른다). 레벨 업 소리에 쓴다 */
export function playRpgSoundOnce(name: RpgSound, gain = 1): void {
  const raw = busGain(bridge.last("audio:mix") ?? loadSoundMix(), "sfx");
  if (raw <= 0 || audioLife.hidden) return;
  const ac = sharedAudioContext();
  if (!ac) return;
  const wake = ac.state === "running" ? null : ac.resume().catch(() => undefined);
  // 아직 안 받았으면 받는 대로 한 번 (레벨 업 화면은 사냥 중에 이미 받아 둔 경우가 많다)
  void Promise.all([preloadSound(url(name)), wake]).then(() =>
    playBuffer(ac, ac.destination, url(name), { gain: Math.max(0, Math.min(1, raw * gain)) }),
  );
}

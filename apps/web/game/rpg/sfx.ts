import { bridge } from "../bridge";

// 사냥터 효과음. Phaser 오디오는 꺼 두었으므로 HTMLAudioElement를 직접 쓴다 (game/world/Sfx.ts와 같은 방식).
// 파일이 아직 없거나 재생이 막히면 조용히 넘어가고, 볼륨·음소거는 audio:settings를 따른다.

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
  | "miss";

const NAMES: RpgSound[] = ["hit", "crit", "monster-die", "levelup", "potion", "skill", "coin-drop", "defeat", "victory", "tick", "miss"];
const MAX_VOICES = 8;

export class RpgSfx {
  private readonly base = new Map<RpgSound, HTMLAudioElement>();
  private readonly missing = new Set<RpgSound>();
  private voices = 0;
  private volume = 0.7;
  private muted = false;
  private readonly off: () => void;

  constructor() {
    const s = bridge.last("audio:settings");
    if (s) this.set(s.volume, s.muted);
    this.off = bridge.on("audio:settings", ({ volume, muted }) => this.set(volume, muted));
    if (typeof Audio === "undefined") return;
    for (const name of NAMES) {
      const a = new Audio();
      a.preload = "auto";
      a.addEventListener("error", () => this.missing.add(name), { once: true });
      a.src = `/sfx/${name}.mp3`;
      this.base.set(name, a);
    }
  }

  private set(volume: number, muted: boolean): void {
    const v = Number.isFinite(volume) ? (volume > 1 ? volume / 100 : volume) : 0.7;
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = muted;
  }

  play(name: RpgSound, gain = 1): void {
    if (this.muted || this.volume <= 0 || this.missing.has(name) || this.voices >= MAX_VOICES) return;
    const src = this.base.get(name);
    if (!src) return;
    const a = src.cloneNode(true) as HTMLAudioElement;
    a.volume = Math.max(0, Math.min(1, this.volume * gain));
    this.voices++;
    const done = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    a.play().catch(done);
  }

  private ctx: AudioContext | null = null;

  /**
   * 은은한 종소리 (별자리 잇기). 파일 없이 WebAudio로 합성한다: 펜타토닉 음계의 사인파 + 한 옥타브 위 약한 배음, 천천히 사라진다.
   * degree: 음계 단계 (별 순서), bright: 완벽 판정이면 조금 더 밝게
   */
  chime(degree: number, bright = false): void {
    if (this.muted || this.volume <= 0 || typeof window === "undefined") return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx ??= new Ctx();
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const scale = [0, 2, 4, 7, 9];
      const step = scale[((degree % 5) + 5) % 5] + 12 * Math.floor(degree / 5);
      const freq = 523.25 * 2 ** (step / 12);
      const t0 = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.16 * this.volume * (bright ? 1.2 : 0.9), t0 + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      out.connect(ctx.destination);
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

  destroy(): void {
    this.off();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

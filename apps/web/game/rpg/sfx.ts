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

  destroy(): void {
    this.off();
  }
}

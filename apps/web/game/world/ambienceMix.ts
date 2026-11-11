import type { Ambience, TimePhase } from "@/lib/ambience";

// 하늘 톤·날씨 값을 게임 연출 수치로 바꾸고, 바뀔 때 2~3초에 걸쳐 부드럽게 섞는다 (순수).

export type Levels = {
  /** 월드에 곱하는 색 0xRRGGBB */
  tint: number;
  darkness: number;
  glow: number;
  fireflies: number;
  fog: number;
  rain: number;
  snow: number;
  cloud: number;
  /** 떨어지는 낙엽 0..1 */
  leaves: number;
};

export const TRANSITION_MS = 2500;

const BASE_FOG: Record<TimePhase, number> = { night: 0.1, dawn: 0.16, day: 0.04, dusk: 0.08 };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function levelsFor(a: Ambience): Levels {
  const k = clamp01(a.intensity);
  const w = a.weather;
  return {
    tint: a.palette.worldTint >>> 0,
    darkness: clamp01(a.palette.darkness),
    glow: clamp01(a.palette.lightGlow),
    fireflies: clamp01(a.palette.fireflies),
    fog: clamp01(BASE_FOG[a.phase] + (w === "fog" ? 0.2 + 0.3 * k : w === "rain" ? 0.03 : 0)),
    rain: w === "rain" ? k : 0,
    snow: w === "snow" ? k : 0,
    cloud: w === "cloudy" ? 0.4 + 0.4 * k : w === "rain" ? 0.25 : 0,
    leaves: clamp01(a.leaves),
  };
}

export function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

export function mixLevels(a: Levels, b: Levels, t: number, out: Levels): Levels {
  const k = clamp01(t);
  const l = (x: number, y: number) => x + (y - x) * k;
  out.tint = mixColor(a.tint, b.tint, k);
  out.darkness = l(a.darkness, b.darkness);
  out.glow = l(a.glow, b.glow);
  out.fireflies = l(a.fireflies, b.fireflies);
  out.fog = l(a.fog, b.fog);
  out.rain = l(a.rain, b.rain);
  out.snow = l(a.snow, b.snow);
  out.cloud = l(a.cloud, b.cloud);
  out.leaves = l(a.leaves, b.leaves);
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 목표가 바뀌면 지금 보이는 값에서 새 목표로 duration 동안 섞는다 */
export class LevelBlender {
  private from: Levels;
  private to: Levels;
  private start = 0;
  readonly current: Levels;

  constructor(
    initial: Levels,
    private readonly duration = TRANSITION_MS,
  ) {
    this.from = { ...initial };
    this.to = { ...initial };
    this.current = { ...initial };
  }

  setTarget(target: Levels, now: number): void {
    if (sameLevels(target, this.to)) return;
    this.from = { ...this.current };
    this.to = { ...target };
    this.start = now;
  }

  update(now: number): Levels {
    const t = this.duration > 0 ? clamp01((now - this.start) / this.duration) : 1;
    return mixLevels(this.from, this.to, smooth(t), this.current);
  }
}

function sameLevels(a: Levels, b: Levels): boolean {
  return (
    a.tint === b.tint &&
    Math.abs(a.darkness - b.darkness) < 1e-3 &&
    Math.abs(a.glow - b.glow) < 1e-3 &&
    Math.abs(a.fireflies - b.fireflies) < 1e-3 &&
    Math.abs(a.fog - b.fog) < 1e-3 &&
    Math.abs(a.rain - b.rain) < 1e-3 &&
    Math.abs(a.snow - b.snow) < 1e-3 &&
    Math.abs(a.cloud - b.cloud) < 1e-3 &&
    Math.abs(a.leaves - b.leaves) < 1e-3
  );
}

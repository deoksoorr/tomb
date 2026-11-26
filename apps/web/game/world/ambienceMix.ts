import type { Ambience, TimePhase } from "@/lib/ambience";
import { gradeAt } from "./skyGrade";

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
  /** 어둠 덮개 색 0xRRGGBB (Lighting) */
  shade: number;
  /** 톤 아래 옅은 막 세기 0..1 (흐림·안개·눈) */
  haze: number;
  hazeColor: number;
};

/** 실내·입장 화면의 예전 어둠 색 */
export const INDOOR_SHADE = 0x070812;

export const TRANSITION_MS = 2500;

/**
 * 11/17 다음에 하늘·날씨를 다시 볼 때까지 (ms). 평소엔 every(1분)마다, 날씨가 바뀌는 경계(nextWeatherAt)가 그 안이면 경계 바로 뒤에.
 * 1분 주기만 쓰면 장면마다 30분 경계보다 최대 1분 늦게 바뀌었다
 */
export function recheckDelay(now: number, nextWeatherAt: number, every: number): number {
  return Math.min(every, Math.max(50, nextWeatherAt - now + 50));
}

/** 11/26 이 기기에서 그릴 하늘·날씨: 설정에서 날씨 효과를 끄면 맑은 날처럼 (시간대 색은 그대로 — 화면 위 날씨 글은 진짜 날씨에 가로줄) */
export function drawnAmbience(a: Ambience, weatherFx: boolean): Ambience {
  return weatherFx ? a : { ...a, weather: "clear", intensity: 0 };
}

/**
 * 11/26 반딧불 짙기: 겨울·크리스마스판(눈 덮인 맵)에는 반딧불이 없다 (오래 앉으면 모여드는 반딧불은 그대로 — Atmosphere.gather).
 * 밤 눈밭에서 제자리에 떠서 깜박이는 흰 점이 멈춘 눈송이로 보였다 — 날씨 효과를 꺼도 남아 「눈이 그대로 멈췄다」는 문의 (그때 날씨는 맑음)
 */
export function fireflyLevel(level: number, snowy: boolean): number {
  return snowy ? 0 : level;
}

const BASE_FOG: Record<TimePhase, number> = { night: 0.1, dawn: 0.16, day: 0.04, dusk: 0.08 };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * outdoor: 바깥(마을·묘지)은 skyGrade의 강한 색 보정(밤은 확실히 어둡게)을 쓴다.
 * 기본(false)은 실내·입장 화면용 부드러운 값 (lib/ambience 팔레트 그대로).
 */
export function levelsFor(a: Ambience, outdoor = false): Levels {
  const k = clamp01(a.intensity);
  const w = a.weather;
  const g = outdoor ? gradeAt(a.kstHour, w, k) : null;
  return {
    tint: g ? g.tint : a.palette.worldTint >>> 0,
    darkness: clamp01(g ? g.darkness : a.palette.darkness),
    glow: clamp01(g ? g.glow : a.palette.lightGlow),
    fireflies: clamp01(a.palette.fireflies),
    fog: clamp01(BASE_FOG[a.phase] + (w === "fog" ? 0.2 + 0.3 * k : w === "rain" ? 0.03 : 0)),
    rain: w === "rain" ? k : 0,
    snow: w === "snow" ? k : 0,
    cloud: w === "cloudy" ? 0.4 + 0.4 * k : w === "rain" ? 0.25 : 0,
    leaves: clamp01(a.leaves),
    shade: g ? g.shade : INDOOR_SHADE,
    haze: g ? clamp01(g.haze) : 0,
    hazeColor: g ? g.hazeColor : 0x808080,
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
  out.shade = mixColor(a.shade, b.shade, k);
  out.haze = l(a.haze, b.haze);
  out.hazeColor = mixColor(a.hazeColor, b.hazeColor, k);
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
    Math.abs(a.leaves - b.leaves) < 1e-3 &&
    a.shade === b.shade &&
    Math.abs(a.haze - b.haze) < 1e-3 &&
    a.hazeColor === b.hazeColor
  );
}

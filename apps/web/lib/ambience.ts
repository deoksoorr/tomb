// 한국 시간(KST) 기준 하늘 톤과 날씨. 서버 없이 시계만으로 계산하므로 같은 순간의 모든 방문자가 같은 하늘을 본다.
// 게임(Phaser 틴트·오버레이·파티클)과 입장 화면(CSS 배경)이 같은 값을 쓴다. 1분마다 다시 계산하면 된다.

const HOUR = 3_600_000;
const KST_OFFSET = 9 * HOUR;
/** 날씨가 바뀌는 단위 (KST 기준 2시간 블록) */
export const WEATHER_BLOCK_MS = 2 * HOUR;

export type TimePhase = "dawn" | "day" | "dusk" | "night";
export type Weather = "clear" | "cloudy" | "fog" | "rain" | "snow";
export const TIME_PHASES: readonly TimePhase[] = ["dawn", "day", "dusk", "night"];
export const WEATHERS: readonly Weather[] = ["clear", "cloudy", "fog", "rain", "snow"];

export const PHASE_LABELS: Record<TimePhase, string> = { dawn: "새벽", day: "낮", dusk: "해질녘", night: "밤" };
export const WEATHER_LABELS: Record<Weather, string> = { clear: "맑음", cloudy: "흐림", fog: "안개", rain: "비", snow: "눈" };

export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export type Palette = {
  /** CSS 배경 그라데이션 (위 → 아래) */
  skyTop: string;
  skyBottom: string;
  /** 월드 전체에 곱하는 색 (0xRRGGBB, Phaser 틴트/곱하기 오버레이) */
  worldTint: number;
  /** 어둠 오버레이 불투명도 0..1 */
  darkness: number;
  /** 석등·촛불 빛 세기 0..1 */
  lightGlow: number;
  /** 반딧불 밀도 0..1 */
  fireflies: number;
  /** 달/해 표시 (입장 화면) */
  celestial: "moon" | "sun" | "none";
};

export type Ambience = {
  phase: TimePhase;
  weather: Weather;
  /** 날씨 세기 0..1 (빗줄기·눈송이·안개 밀도) */
  intensity: number;
  season: Season;
  /** 떨어지는 낙엽 밀도 0..1 (가을에만) */
  leaves: number;
  /** KST 시각 (0~24 실수) */
  kstHour: number;
  palette: Palette;
  /** 다음 날씨 변경 시각 (epoch ms) */
  nextWeatherAt: number;
};

type Key = Omit<Palette, "skyTop" | "skyBottom" | "worldTint" | "celestial"> & {
  skyTop: number;
  skyBottom: number;
  worldTint: number;
};

// 밤도 지형·묘비·길이 또렷이 보일 만큼만 어둡게 (분위기는 푸른 틴트와 빛으로 낸다)
const NIGHT: Key = { skyTop: 0x14161a, skyBottom: 0x1e1f1b, worldTint: 0xa4aecb, darkness: 0.2, lightGlow: 1, fireflies: 1 };
const DAWN: Key = { skyTop: 0x2b2735, skyBottom: 0x4a3a3e, worldTint: 0xd9cad6, darkness: 0.08, lightGlow: 0.5, fireflies: 0.2 };
const DAY: Key = { skyTop: 0x39403a, skyBottom: 0x4a5146, worldTint: 0xe8ece0, darkness: 0, lightGlow: 0.1, fireflies: 0 };
const DUSK: Key = { skyTop: 0x2a1f24, skyBottom: 0x5a3a2c, worldTint: 0xeac0aa, darkness: 0.1, lightGlow: 0.7, fireflies: 0.5 };

/** 하루를 도는 키프레임 (KST 시각). 사이 구간은 선형 보간 */
const KEYFRAMES: readonly [number, Key][] = [
  [4.5, NIGHT],
  [6, DAWN],
  [7.5, DAY],
  [17, DAY],
  [18.5, DUSK],
  [20, NIGHT],
];

const WEATHER_TINT: Record<Weather, { tint: number; amount: number; dark: number }> = {
  clear: { tint: 0xffffff, amount: 0, dark: 0 },
  cloudy: { tint: 0xb4b8c0, amount: 0.2, dark: 0.02 },
  fog: { tint: 0xc0c4c8, amount: 0.25, dark: 0.02 },
  rain: { tint: 0xa8b2c2, amount: 0.25, dark: 0.04 },
  snow: { tint: 0xdce6f4, amount: 0.3, dark: -0.04 },
};

export function kstHour(now: number): number {
  const d = new Date(now + KST_OFFSET);
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/** KST 월 (1~12) */
export function kstMonth(now: number): number {
  return new Date(now + KST_OFFSET).getUTCMonth() + 1;
}

/** 계절 (KST 월 기준: 3~5 봄, 6~8 여름, 9~11 가을, 12~2 겨울) */
export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function timePhase(hour: number): TimePhase {
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17.5) return "day";
  if (hour >= 17.5 && hour < 19.5) return "dusk";
  return "night";
}

/** 32비트 정수 해시 → [0,1) */
function hash01(n: number, salt: number): number {
  let h = (n ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * 2시간 블록마다 바뀌는 결정적 랜덤 날씨.
 * 눈은 11~3월에만 온다 (그 밖의 달에는 흐림). 한겨울(12~2월)에는 비 오는 블록의 절반이 눈으로 바뀐다.
 * month: QA용 계절 덮어쓰기 (없으면 KST 달)
 */
export function weatherAt(now: number, month: number = kstMonth(now)): { weather: Weather; intensity: number; nextWeatherAt: number } {
  const block = Math.floor((now + KST_OFFSET) / WEATHER_BLOCK_MS);
  const u = hash01(block, 1);
  let weather: Weather = u < 0.38 ? "clear" : u < 0.58 ? "cloudy" : u < 0.72 ? "fog" : u < 0.92 ? "rain" : "snow";
  const deepWinter = month === 12 || month <= 2;
  const snowy = deepWinter || month === 11 || month === 3;
  if (weather === "snow" && !snowy) weather = "cloudy";
  if (weather === "rain" && deepWinter && hash01(block, 3) < 0.5) weather = "snow";
  return {
    weather,
    intensity: 0.4 + 0.6 * hash01(block, 2),
    nextWeatherAt: (block + 1) * WEATHER_BLOCK_MS - KST_OFFSET,
  };
}

/** 낙엽 밀도: 가을의 맑고 흐린 날에 가장 많고, 젖은 날·눈 오는 날은 드문드문 */
export function leavesFor(season: Season, weather: Weather, intensity: number): number {
  if (season !== "autumn") return 0;
  switch (weather) {
    case "clear":
    case "cloudy":
      return 0.55 + 0.35 * intensity;
    case "fog":
      return 0.35;
    case "rain":
      return 0.15;
    case "snow":
      return 0.12;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mixColor(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}
/** 두 색을 곱한다 (틴트 합성) */
function mulColor(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

function keyAt(hour: number): Key {
  const n = KEYFRAMES.length;
  for (let i = 0; i < n; i++) {
    const [h0, k0] = KEYFRAMES[i];
    const [h1raw, k1] = KEYFRAMES[(i + 1) % n];
    const h1 = h1raw <= h0 ? h1raw + 24 : h1raw;
    const h = hour < h0 ? hour + 24 : hour;
    if (h >= h0 && h < h1) {
      const t = (h - h0) / (h1 - h0);
      return {
        skyTop: mixColor(k0.skyTop, k1.skyTop, t),
        skyBottom: mixColor(k0.skyBottom, k1.skyBottom, t),
        worldTint: mixColor(k0.worldTint, k1.worldTint, t),
        darkness: lerp(k0.darkness, k1.darkness, t),
        lightGlow: lerp(k0.lightGlow, k1.lightGlow, t),
        fireflies: lerp(k0.fireflies, k1.fireflies, t),
      };
    }
  }
  return NIGHT;
}

export type AmbienceOverride = { hour?: number; weather?: Weather; season?: Season };

/** 계절 덮어쓰기를 그 계절의 대표 달로 */
const SEASON_MONTH: Record<Season, number> = { spring: 4, summer: 7, autumn: 10, winter: 1 };

/**
 * QA용 덮어쓰기: `?time=dawn|day|dusk|night|0~23` , `?weather=clear|cloudy|fog|rain|snow` , `?season=spring|summer|autumn|winter`
 */
export function parseAmbienceOverride(search: string): AmbienceOverride {
  const q = new URLSearchParams(search);
  const out: AmbienceOverride = {};
  const t = q.get("time");
  const presetHour: Record<TimePhase, number> = { dawn: 6, day: 12, dusk: 18.5, night: 23 };
  if (t && t in presetHour) out.hour = presetHour[t as TimePhase];
  else if (t && /^\d{1,2}(\.\d+)?$/.test(t) && +t < 24) out.hour = +t;
  const w = q.get("weather");
  if (w && (WEATHERS as readonly string[]).includes(w)) out.weather = w as Weather;
  const se = q.get("season");
  if (se && (SEASONS as readonly string[]).includes(se)) out.season = se as Season;
  return out;
}

export function ambienceAt(now: number = Date.now(), override: AmbienceOverride = {}): Ambience {
  const hour = override.hour ?? kstHour(now);
  const month = override.season ? SEASON_MONTH[override.season] : kstMonth(now);
  const season = seasonOf(month);
  const auto = weatherAt(now, month);
  const weather = override.weather ?? auto.weather;
  const intensity = override.weather ? 0.8 : auto.intensity;
  const k = keyAt(hour);
  const w = WEATHER_TINT[weather];
  const phase = timePhase(hour);
  return {
    phase,
    weather,
    intensity,
    season,
    leaves: leavesFor(season, weather, intensity),
    kstHour: hour,
    nextWeatherAt: auto.nextWeatherAt,
    palette: {
      skyTop: css(mixColor(k.skyTop, mulColor(k.skyTop, w.tint), w.amount)),
      skyBottom: css(mixColor(k.skyBottom, mulColor(k.skyBottom, w.tint), w.amount)),
      worldTint: mixColor(k.worldTint, mulColor(k.worldTint, w.tint), w.amount),
      darkness: Math.max(0, Math.min(0.3, k.darkness + w.dark * intensity)),
      // 비·눈 오는 날엔 반딧불이 숨는다
      fireflies: weather === "rain" || weather === "snow" ? k.fireflies * 0.2 : k.fireflies,
      lightGlow: k.lightGlow,
      celestial: weather === "clear" || weather === "fog" ? (phase === "night" ? "moon" : phase === "day" ? "sun" : "none") : "none",
    },
  };
}

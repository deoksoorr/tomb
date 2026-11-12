import type { Weather } from "@/lib/ambience";

// 바깥(마을·묘지) 화면의 색 보정 (순수). KST 시각 → 7구간 색 온도·어둠, 그 위에 날씨 보정을 곱한다.
//  - tint: 월드 전체에 곱하는 색 (색 온도)
//  - darkness/shade: 빛 구멍이 뚫리는 어둠 덮개의 불투명도·색 (Lighting)
//  - haze/hazeColor: 톤 아래에 일반 섞기로 덮는 옅은 막 (흐림·안개의 채도·대비 낮추기, 눈의 흰빛)
// 실내(집 안)와 입장 화면 배경은 쓰지 않는다 (lib/ambience의 부드러운 값을 그대로 쓴다).

export type Grade = {
  tint: number;
  darkness: number;
  shade: number;
  glow: number;
  haze: number;
  hazeColor: number;
};

type Key = Omit<Grade, "haze" | "hazeColor">;

// 깊은 밤: 화면 대부분이 짙은 남색 (빛 둘레만 보인다)
const DEEP: Key = { tint: 0x6672b0, darkness: 0.84, shade: 0x050a20, glow: 1 };
const NIGHT: Key = { tint: 0x7684c4, darkness: 0.75, shade: 0x070d28, glow: 1 };
const EVENING: Key = { tint: 0xa48cd0, darkness: 0.46, shade: 0x140c2c, glow: 0.9 };
const SUNSET: Key = { tint: 0xffbc9a, darkness: 0.1, shade: 0x2a1020, glow: 0.6 };
const DAY: Key = { tint: 0xffffff, darkness: 0, shade: 0x070d28, glow: 0.1 };
const MORNING: Key = { tint: 0xffe8bc, darkness: 0.03, shade: 0x1a1420, glow: 0.2 };
const DAWN: Key = { tint: 0x9cb0e0, darkness: 0.4, shade: 0x0a1430, glow: 0.7 };

/** 하루를 도는 키프레임 (KST 시각). 사이는 선형 보간 → 시간이 흐르며 저절로 부드럽게 바뀐다 */
const KEYS: readonly [number, Key][] = [
  [0, DEEP],
  [3.5, DEEP],
  [5.2, DAWN],
  [6.2, DAWN],
  [7.4, MORNING],
  [8.6, MORNING],
  [10, DAY],
  [16.3, DAY],
  [17.6, SUNSET],
  [18.6, SUNSET],
  [19.6, EVENING],
  [20.3, EVENING],
  [21.3, NIGHT],
  [23, NIGHT],
  [24, DEEP],
];

/** 날씨 보정: 곱할 색, 어둠 더하기, 막(haze) 색·세기 */
const WEATHER: Record<Weather, { tint: number; dark: number; haze: number; hazeColor: number }> = {
  clear: { tint: 0xffffff, dark: 0, haze: 0, hazeColor: 0x808080 },
  // 흐림: 회색빛, 채도·밝기 ↓
  cloudy: { tint: 0xc8cacf, dark: 0.05, haze: 0.2, hazeColor: 0x8c9096 },
  // 비: 더 어둡고 차가운 청회색
  rain: { tint: 0x9aa8bc, dark: 0.12, haze: 0.22, hazeColor: 0x4c5a6e },
  // 눈: 밝고 차가운 흰빛 (밤에도 눈빛에 조금 덜 어둡다)
  snow: { tint: 0xe6eeff, dark: -0.1, haze: 0.2, hazeColor: 0xeef3ff },
  // 안개: 흐릿하고 대비 ↓
  fog: { tint: 0xd6dade, dark: 0.03, haze: 0.32, hazeColor: 0xc2c8ce },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 비 오는 깊은 밤도 빛 둘레·글자는 보이게 어둠 상한 */
const DARK_MAX = 0.9;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mixRgb(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

export function mulRgb(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

/** 시간대만의 색 (날씨 전) */
export function todKey(hour: number): Key {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, k0] = KEYS[i];
    const [h1, k1] = KEYS[i + 1];
    if (h >= h0 && h < h1) {
      const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
      return {
        tint: mixRgb(k0.tint, k1.tint, t),
        darkness: lerp(k0.darkness, k1.darkness, t),
        shade: mixRgb(k0.shade, k1.shade, t),
        glow: lerp(k0.glow, k1.glow, t),
      };
    }
  }
  return DEEP;
}

/** 시간대 × 날씨 (intensity 0..1: 날씨 세기) */
export function gradeAt(hour: number, weather: Weather, intensity: number): Grade {
  const k = todKey(hour);
  const w = WEATHER[weather];
  const s = 0.6 + 0.4 * clamp01(intensity);
  // 막(haze)은 톤 아래에 그려서 시간대 색이 함께 곱해진다 (밤 안개가 혼자 하얗게 뜨지 않게)
  return {
    tint: mixRgb(k.tint, mulRgb(k.tint, w.tint), s),
    darkness: Math.min(DARK_MAX, clamp01(k.darkness + w.dark * s * (w.dark < 0 ? k.darkness : 1))),
    shade: k.shade,
    glow: k.glow,
    haze: w.haze * s,
    hazeColor: w.hazeColor,
  };
}

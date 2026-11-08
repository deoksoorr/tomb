import type { CSSProperties } from "react";
import { ambienceAt, type Ambience } from "@/lib/ambience";
import PixelArt, { type PixelRect } from "../ui/PixelArt";
import styles from "./NightSky.module.css";

// 서버 렌더·하이드레이션 중에 그리는 밤 기본값 (맑음). 마운트 후 실제 시간대·날씨로 바뀐다.
const NIGHT_DEFAULT = ambienceAt(0, { hour: 23, weather: "clear" });

const FIREFLY_COUNT = 18;
const FLAKE_COUNT = 36;

// 서버와 클라이언트가 같은 배치를 그리도록 고정 시드 난수
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(1027);
const pct = (v: number) => `${v.toFixed(2)}%`;

const FIREFLIES = Array.from({ length: FIREFLY_COUNT }, () => ({
  left: pct(4 + rand() * 92),
  top: pct(38 + rand() * 50),
  delay: `${(-rand() * 9).toFixed(2)}s`,
  duration: `${(6 + rand() * 6).toFixed(2)}s`,
  drift: `${((rand() - 0.5) * 48).toFixed(0)}px`,
}));

const FLAKES = Array.from({ length: FLAKE_COUNT }, () => ({
  left: pct(rand() * 100),
  y: pct(rand() * 90),
  size: rand() < 0.3 ? 3 : 2,
  delay: `${(-rand() * 16).toFixed(2)}s`,
  duration: `${(9 + rand() * 8).toFixed(2)}s`,
  sway: `${((rand() - 0.5) * 60).toFixed(0)}px`,
}));

/** 12×12 픽셀 원 (가로줄 단위 사각형) */
function disc(color: string): PixelRect[] {
  return Array.from({ length: 12 }, (_, y): PixelRect => {
    const dy = y + 0.5 - 6;
    const half = Math.floor(Math.sqrt(Math.max(0, 36 - dy * dy)) + 0.2);
    return [6 - half, y, half * 2, 1, color];
  });
}
const MOON: PixelRect[] = [
  ...disc("#ece0bd"),
  [3, 3, 2, 2, "#d3c59e"],
  [7, 6, 2, 1, "#d3c59e"],
  [4, 8, 1, 1, "#d3c59e"],
];
const SUN: PixelRect[] = disc("#e9cf9a");

const INK = "#0d0e0b";
const SILHOUETTE: PixelRect[] = [
  [0, 34, 160, 6, INK],
  [0, 31, 52, 3, INK],
  [108, 32, 52, 2, INK],
  // 고목
  [17, 12, 3, 22, INK],
  [11, 15, 6, 2, INK],
  [9, 12, 3, 3, INK],
  [20, 18, 7, 2, INK],
  [26, 15, 2, 3, INK],
  [15, 8, 2, 4, INK],
  [19, 6, 2, 6, INK],
  // 묘비들
  [41, 25, 4, 1, INK],
  [40, 26, 6, 8, INK],
  [57, 27, 3, 1, INK],
  [56, 28, 5, 6, INK],
  [72, 24, 10, 5, INK],
  [76, 29, 2, 5, INK],
  [97, 24, 5, 1, INK],
  [96, 25, 7, 9, INK],
  [118, 21, 2, 3, INK],
  [115, 24, 8, 2, INK],
  [117, 26, 4, 3, INK],
  [114, 29, 10, 5, INK],
  [137, 26, 3, 1, INK],
  [136, 27, 5, 7, INK],
  // 석등
  [148, 22, 7, 2, INK],
  [149, 24, 5, 3, INK],
  [151, 27, 2, 7, INK],
  [150, 25, 3, 1, "#5f512a"],
];

export default function NightSky({ ambience }: { ambience: Ambience | null }) {
  const { weather, intensity, palette } = ambience ?? NIGHT_DEFAULT;
  const lit = Math.round(FIREFLY_COUNT * palette.fireflies);
  const vars = {
    "--sky-top": palette.skyTop,
    "--sky-bottom": palette.skyBottom,
    "--rain": weather === "rain" ? 0.3 + 0.5 * intensity : 0,
    "--snow": weather === "snow" ? 0.55 + 0.45 * intensity : 0,
    "--clouds": weather === "cloudy" || weather === "rain" ? 0.35 + 0.45 * intensity : weather === "snow" ? 0.3 : 0,
    "--fog": weather === "fog" ? 0.55 + 0.45 * intensity : 0.2,
  } as CSSProperties;

  return (
    <div className={styles.sky} style={vars} aria-hidden="true">
      <div className={styles.moon} data-on={palette.celestial === "moon"}>
        <PixelArt width={12} height={12} scale={5} rects={MOON} />
      </div>
      <div className={styles.sun} data-on={palette.celestial === "sun"}>
        <PixelArt width={12} height={12} scale={5} rects={SUN} />
      </div>
      <div className={styles.clouds} data-on={weather === "cloudy" || weather === "rain" || weather === "snow"}>
        <span />
        <span />
        <span />
      </div>
      <div className={styles.fog}>
        <span />
        <span />
      </div>
      <div className={styles.fireflies}>
        {FIREFLIES.map((f, i) => (
          <span
            key={i}
            data-on={i < lit}
            style={
              {
                left: f.left,
                top: f.top,
                animationDelay: f.delay,
                animationDuration: f.duration,
                "--drift": f.drift,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <PixelArt
        className={styles.ground}
        width={160}
        height={40}
        scale={1}
        rects={SILHOUETTE}
        preserveAspectRatio="xMidYMax slice"
      />
      <div className={styles.rain} data-on={weather === "rain"} />
      <div className={styles.snow} data-on={weather === "snow"}>
        {FLAKES.map((f, i) => (
          <span
            key={i}
            style={
              {
                left: f.left,
                width: f.size,
                height: f.size,
                animationDelay: f.delay,
                animationDuration: f.duration,
                "--y": f.y,
                "--sway": f.sway,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

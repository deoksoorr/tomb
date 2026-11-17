import type { Weather } from "@/lib/ambience";

// 11/17 버스 창밖 날씨 (순수 계산): 마을과 같은 날씨(lib/ambience ambienceAt — QA ?weather 덮어쓰기 포함)를 창밖 세기로 바꾼다.
//  - 비: 창밖 빗줄기 + 창에 물방울이 맺혔다가 흘러내림 (버스가 빠를수록 뒤로 비스듬히)
//  - 눈: 창밖에 눈이 날림 (버스가 달리면 옆으로 휙휙)
//  - 안개: 먼 산·중간 집이 흐려짐 (가까운 층은 조금만)
// 세기 출렁임·바람은 마을 날씨와 같은 노이즈(game/world/weatherNoise)로 흔든다 — 장면(BusRideScene)이 쓴다.

export type RideWeather = {
  /** 빗줄기·창 물방울 0..1 */
  rain: number;
  /** 눈발 0..1 */
  snow: number;
  /** 먼 풍경 흐림 0..1 */
  fog: number;
};

export const NO_RIDE_WEATHER: RideWeather = { rain: 0, snow: 0, fog: 0 };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** 마을 날씨·세기(0..1) → 창밖 세기. 맑음·흐림은 아무것도 (흐림은 하늘 색만 — BusRideScene skyColors) */
export function rideWeather(weather: Weather, intensity: number): RideWeather {
  const k = clamp01(intensity);
  switch (weather) {
    case "rain":
      // 비 오는 날은 먼 산도 살짝 뿌옇게
      return { rain: 0.35 + 0.65 * k, snow: 0, fog: 0.15 };
    case "snow":
      return { rain: 0, snow: 0.35 + 0.65 * k, fog: 0.12 };
    case "fog":
      return { rain: 0, snow: 0, fog: 0.5 + 0.5 * k };
    default:
      return NO_RIDE_WEATHER;
  }
}

/** 창에 맺히는 물방울 수 (비 세기만큼, 움직임 줄이기면 적게) */
export function glassDropCount(rain: number, reduced: boolean): number {
  return Math.round(clamp01(rain) * (reduced ? 6 : 22));
}

/** 물방울 하나가 맺혀 있다가 흘러내리기 시작할 때까지 (ms). u: 0..1 무작위 — 비가 셀수록 빨리 */
export function dropHoldMs(rain: number, u: number): number {
  return Math.round((900 + 2600 * clamp01(u)) * (1.4 - 0.6 * clamp01(rain)));
}

/**
 * 흘러내리는 물방울 속도 (그림 px/s): 아래로 흐르고, 버스가 달리는 만큼 바람에 밀려 뒤로 (way 1 = 풍경이 왼쪽으로 흐르는 쪽).
 * v: 가까운 층이 흐르는 빠르기(그림 px/s), wobble: 물길이 갈지자로 흔들리는 값 [-1,1] (노이즈)
 */
export function dropVelocity(v: number, way: 1 | -1, wobble: number): { x: number; y: number } {
  const speed = Math.max(0, v);
  return { x: -way * (speed * 0.18 + 2 * wobble), y: 14 + 10 * Math.abs(wobble) + speed * 0.04 };
}

/**
 * 빗줄기·눈발 겹이 흐르는 빠르기 (그림 px/s): 아래로 떨어지고, 버스가 달리면 풍경 쪽으로 쓸려 간다.
 * near: 가까운 겹 (더 빠르게), wind: 돌풍 [-1,1]
 */
export function fallVelocity(kind: "rain" | "snow", near: boolean, v: number, way: 1 | -1, wind: number): { x: number; y: number } {
  const speed = Math.max(0, v);
  if (kind === "rain") {
    const y = near ? 260 : 190;
    // 빗줄기는 두 칸 내려갈 때 한 칸 옆으로 그려 두었다 → 그 기울기만큼은 늘 옆으로 + 버스 빠르기
    return { x: way * (y * 0.5 + speed * (near ? 0.5 : 0.25)) + 12 * wind, y };
  }
  return { x: way * speed * (near ? 1.1 : 0.55) + (near ? 14 : 8) * wind, y: near ? 34 : 22 };
}

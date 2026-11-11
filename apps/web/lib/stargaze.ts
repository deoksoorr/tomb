import { ambienceAt } from "./ambience";

// 22번 별 보기 언덕: 진짜 밤(KST)이고 맑은 날이면 별자리 잇기 보상이 늘어난다.
// 하늘은 서버 없이 시계만으로 정해지므로(lib/ambience) 서버(판 시작 시각)와 화면이 같은 답을 낸다.

/** 맑은 밤 보너스 배수 (포인트) */
export const STARRY_NIGHT_BONUS = 1.5;

/** 이 시각이 맑은 밤인지 (KST 밤 + 날씨 맑음) */
export function starryNight(now: number): boolean {
  const a = ambienceAt(now);
  return a.phase === "night" && a.weather === "clear";
}

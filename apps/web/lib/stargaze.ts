import { ambienceAt } from "./ambience";
import { conditionsAt } from "./forage/rules";
import type { StarSky } from "./rpg/plan";

// 22번 별 보기 언덕: 진짜 밤(KST)이고 맑은 날이면 별자리 잇기 보상이 늘어난다.
// 하늘은 서버 없이 시계만으로 정해지므로(lib/ambience) 서버(판 시작 시각)와 화면이 같은 답을 낸다.

/** 맑은 밤 보너스 배수 (포인트) */
export const STARRY_NIGHT_BONUS = 1.5;

/** 이 시각이 맑은 밤인지 (KST 밤 + 날씨 맑음) */
export function starryNight(now: number): boolean {
  const a = ambienceAt(now);
  return a.phase === "night" && a.weather === "clear";
}

/**
 * 별자리 잇기 판의 하늘 (판 시작 시각 기준): 맑은 밤(전설) · 계절(계절 별자리, 곤충 도감과 같은 계절 판정) · 새벽(새벽 별자리).
 * 서버가 판 시작 때 화면에 알려 주고, 끝낼 때 티켓 시각으로 다시 계산한다 → 같은 답
 */
export function starSkyAt(now: number): Required<StarSky> {
  const c = conditionsAt(now);
  return { starry: starryNight(now), season: c.season, dawn: c.phase === "dawn" };
}

import { testServerEnv } from "./rpg/superHunter";

/**
 * 11/15 언젠가 캠핑장을 여는 서버인가: 테스트 서버는 늘, 운영은 CAMP_ENABLED=1일 때만.
 * 열려 있으면 입장 토큰에 캠핑장 허락(camp)을 넣고 입장 응답에 campOpen을 실어 준다 → 마을 버스 정류장에서 버스가 온다.
 * 닫혀 있으면 정류장은 지금처럼 "준비 중" 안내만 (실시간 서버도 허락 없는 토큰은 캠핑장으로 보내지 않는다)
 */
export function campOpen(e: Partial<Record<"VERCEL_ENV" | "NODE_ENV" | "CAMP_ENABLED", string | undefined>> = process.env): boolean {
  return testServerEnv(e) || e.CAMP_ENABLED?.trim() === "1";
}

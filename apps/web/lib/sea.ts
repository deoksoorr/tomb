import { testServerEnv } from "./rpg/superHunter";

/**
 * 11/16 달물결 포구(바닷가)를 여는 서버인가: 테스트 서버는 늘, 운영은 SEA_ENABLED=1일 때만 (캠핑장 CAMP_ENABLED와 같은 방식).
 * 열려 있으면 입장 토큰에 바닷가 허락(sea)을 넣고 입장 응답에 seaOpen을 실어 줘요 → 옛 묘역 아래 바닷가행 정류장에 버스가 와요.
 * 닫혀 있으면 정류장은 "준비 중" 안내만 해요 (실시간 서버도 허락 없는 토큰은 바닷가로 보내지 않아요)
 * 운영은 11/16 밤 SEA_ENABLED=1로 열었어요 (환경 값은 빌드할 때가 아니라 배포마다 묶이니, 값을 바꾸면 웹을 다시 배포해야 해요).
 */
export function seaOpen(e: Partial<Record<"VERCEL_ENV" | "NODE_ENV" | "SEA_ENABLED", string | undefined>> = process.env): boolean {
  return testServerEnv(e) || e.SEA_ENABLED?.trim() === "1";
}

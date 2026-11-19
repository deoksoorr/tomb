import { GOBLIN_JACKPOT_POINTS, GOBLIN_POINTS_MAX, GOBLIN_POINTS_MIN } from "@tomb/protocol";

// 11/19 황금 고블린 알림 문구 (GoblinClaim 띠·채팅 소식 줄). 순수 함수라 테스트한다 (goblinText.test.ts)

/** 1,000 단위 쉼표 (기기 언어와 상관없이 같게) */
export const goblinPointsText = (n: number) => Math.round(n).toLocaleString("en-US");

/** 보통 보상 범위 (예: "300~1,000P") */
export const goblinRangeText = () => `${goblinPointsText(GOBLIN_POINTS_MIN)}~${goblinPointsText(GOBLIN_POINTS_MAX)}P`;

/** 나타남 띠 아랫줄: "모닥불 광장 쪽 · 먼저 잡으면 최대 2,000P" */
export const goblinSpawnSub = (zone: string) => `${zone} 쪽 · 가장 먼저 잡으면 최대 ${goblinPointsText(GOBLIN_JACKPOT_POINTS)}P`;

/** 잡은 사람 표시 (이름이 비었으면 "누군가") */
const who = (name: string, mine: boolean) => (mine ? "내가" : name.trim() ? `${name.trim()}님이` : "누군가가");

/** 잡힘 띠 윗줄: "진순님이 황금 고블린을 잡았어요!" */
export const goblinCaughtTitle = (name: string, mine: boolean) => `${who(name, mine)} 황금 고블린을 잡았어요!`;

/** 채팅 소식 줄: "진순님이 황금 고블린을 잡았어요! +800P" (대박이면 앞에 "대박!") */
export const goblinCaughtLine = (name: string, mine: boolean, points: number) =>
  `${points >= GOBLIN_JACKPOT_POINTS ? "대박! " : ""}${goblinCaughtTitle(name, mine)} +${goblinPointsText(points)}P`;

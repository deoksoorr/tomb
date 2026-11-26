import { GOBLIN_JACKPOT_POINTS, GOBLIN_POINTS_MAX, GOBLIN_POINTS_MIN, MAP_NAME, type MapId } from "@tomb/protocol";

// 11/19 황금 고블린 알림 문구 (GoblinClaim 띠·채팅 소식 줄). 순수 함수라 테스트한다 (goblinText.test.ts)

/** 1,000 단위 쉼표 (기기 언어와 상관없이 같게) */
export const goblinPointsText = (n: number) => Math.round(n).toLocaleString("en-US");

/** 보통 보상 범위 (예: "300~1,000P") */
export const goblinRangeText = () => `${goblinPointsText(GOBLIN_POINTS_MIN)}~${goblinPointsText(GOBLIN_POINTS_MAX)}P`;

/** 11/26 나타남 띠 윗줄: "황금 고블린이 바닷가에 나타났어요!" (들어와 보니 이미 있었으면 "지금 바닷가에 황금 고블린이 있어요!") */
export const goblinSpawnTitle = (map: MapId = "village", resumed = false) =>
  resumed ? `지금 ${MAP_NAME[map]}에 황금 고블린이 있어요!` : `황금 고블린이 ${MAP_NAME[map]}에 나타났어요!`;

/**
 * 나타남 띠 아랫줄. 같은 맵: "모닥불 광장 쪽 · 가장 먼저 잡으면 최대 2,000P".
 * 11/26 다른 맵: "캠핑장행 버스를 타요 · 최대 2,000P", 바닷가 ↔ 캠핑장은 "마을에서 캠핑장행으로 갈아타요 · 최대 2,000P"
 */
export const goblinSpawnSub = (zone: string, map: MapId = "village", here: MapId = map) => {
  const max = `최대 ${goblinPointsText(GOBLIN_JACKPOT_POINTS)}P`;
  if (map === here) return `${zone} 쪽 · 가장 먼저 잡으면 ${max}`;
  if (here === "village" || map === "village") return `${MAP_NAME[map]}행 버스를 타요 · ${max}`;
  return `마을에서 ${MAP_NAME[map]}행으로 갈아타요 · ${max}`;
};

/** 잡은 사람 표시 (이름이 비었으면 "누군가") */
const who = (name: string, mine: boolean) => (mine ? "내가" : name.trim() ? `${name.trim()}님이` : "누군가가");

/** 잡힘 띠 윗줄: "진순님이 황금 고블린을 잡았어요!" */
export const goblinCaughtTitle = (name: string, mine: boolean) => `${who(name, mine)} 황금 고블린을 잡았어요!`;

/** 채팅 소식 줄: "진순님이 황금 고블린을 잡았어요! +800P" (대박이면 앞에 "대박!") */
export const goblinCaughtLine = (name: string, mine: boolean, points: number) =>
  `${points >= GOBLIN_JACKPOT_POINTS ? "대박! " : ""}${goblinCaughtTitle(name, mine)} +${goblinPointsText(points)}P`;

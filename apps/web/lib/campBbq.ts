import type { BbqItemId } from "@tomb/protocol";
import type { Me } from "./types";

// 11/15 캠핑장 야외 바베큐 (/api/camp/bbq). 메뉴·값·효과는 protocol bbq.ts

/** GET: 오늘 먹은 접시 수 */
export type BbqStatusResponse = { eaten: number; daily: number };

/** POST { item }: 포인트를 쓰고 한 접시 증서를 준다 → 게임이 실시간 서버로 보내 같은 맵 사람들에게 커진 모습이 보인다 */
export type BbqResponse = { me: Me; grant: string; item: BbqItemId; until: number; eaten: number; daily: number };

/** 하루 횟수를 다 먹었을 때 */
export const BBQ_FULL_MESSAGE = "오늘은 배불러요. 내일 또 먹으러 와요.";

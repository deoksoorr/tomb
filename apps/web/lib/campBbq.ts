import type { BbqItemId } from "@tomb/protocol";
import type { Me } from "./types";

// 11/15 캠핑장 야외 바베큐 (/api/camp/bbq). 메뉴·값·효과는 protocol bbq.ts

/** GET: 지금 취기 단계 (0 = 말짱하다). 먹거리·마실 거리 모두 하루 한도는 없다 */
export type BbqStatusResponse = { drunk: number };

/**
 * POST { item }: 포인트를 쓰고 한 접시·한 잔 증서를 준다 → 게임이 실시간 서버로 보내 같은 맵 사람들에게 효과가 보인다.
 * 마실 거리면 lv·at = 마신 뒤 취기
 */
export type BbqResponse = { me: Me; grant: string; item: BbqItemId; until: number; lv?: number; at?: number };

/** 컨디숑: 취기가 없을 때 (포인트를 쓰지 않는다) */
export const BBQ_NOT_TIPSY_MESSAGE = "지금은 말짱해요. 취했을 때 마셔요.";
/** 그 메뉴를 파는 곳이 아니다 (먹거리는 그릴, 마실 거리는 자판기) */
export const BBQ_WRONG_STAND_MESSAGE = "여기서는 팔지 않는 메뉴예요.";

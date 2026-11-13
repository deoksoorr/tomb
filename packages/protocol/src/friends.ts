// 친구: 웹 API·실시간 서버·클라이언트가 함께 쓰는 규칙.
// 포인트·아이템 보상은 없다 (부계정으로 친구를 늘려 얻을 것이 없게).

/** 한 계정의 친구 수 상한 */
export const FRIEND_MAX = 50;
/** 보낸 신청·받은 신청 각각의 상한 (아직 답하지 않은 것) */
export const FRIEND_PENDING_MAX = 30;
/** 답하지 않은 신청은 이만큼 지나면 사라진다 */
export const FRIEND_REQUEST_KEEP_DAYS = 14;

/**
 * 월드 채널에서 실내(하위 장면)에 들어가 있을 때 어디인지 (away 이벤트의 p). 친구 창에 "집 안"·"사냥터"처럼 보여 준다.
 * 옛 클라이언트는 보내지 않는다 → 그냥 "실내"
 */
export const AWAY_PLACES = ["shop", "house", "village", "hunt", "game"] as const;
export type AwayPlace = (typeof AWAY_PLACES)[number];
export const isAwayPlace = (v: unknown): v is AwayPlace => typeof v === "string" && (AWAY_PLACES as readonly string[]).includes(v);
export const AWAY_PLACE_LABEL: Record<AwayPlace, string> = {
  shop: "잡화점",
  house: "집 안",
  village: "분양 마을",
  hunt: "사냥터",
  game: "놀이 중",
};

/** 실시간 서버가 아는 한 사람의 자리 (내부 요청 /internal/where 응답). 좌표는 서버 위치 */
export type PeerWhere = { ch: number; sid: number; x: number; y: number; away?: true; place?: AwayPlace };

/** 실시간 서버가 채널별 접속자 자리를 기억해 두는 시간 (위치 조회를 가볍게) */
export const WHERE_CACHE_MS = 10_000;
/** 위치 조회 한 번에 물을 수 있는 계정 수 (친구 상한 + 여유) */
export const WHERE_MAX_IDS = 60;

import type { AwayPlace } from "@tomb/protocol";

// 친구 API 응답 (브라우저와 서버가 함께 쓴다). 계정 id는 내보내지 않고 친구마다 key(계정 id의 HMAC)로 가리킨다.

/**
 * 친구가 지금 있는 곳. 좌표는 친구에게만 (그것도 같은 채널 마을에 서 있을 때만).
 *  - offline: 접속 안 함 · unknown: 실시간 서버에 닿지 못해 모름
 *  - world: 그 채널 마을 (sid = 그 채널에서의 번호, 미니맵·이름표 하트와 순간이동에 쓴다)
 *  - away: 그 채널에서 실내(집 안·사냥터 …)에 들어가 있다. place가 null이면 어딘지 모름(옛 화면)
 */
export type FriendWhere =
  | { at: "offline" }
  | { at: "unknown" }
  | { at: "world"; ch: number; sid: number; x: number; y: number }
  | { at: "away"; ch: number; sid: number; place: AwayPlace | null };

export type FriendEntry = {
  key: string;
  name: string;
  /** 친구가 된 시각 */
  since: number;
  where: FriendWhere;
  /** 친구 집 (분양받았고 숨겨지지 않았으면). 목록(GET /api/friends)에만 있다 */
  houseId?: string | null;
};

export type FriendRequestEntry = { key: string; name: string; at: number };

/** GET /api/friends (친구 창) */
export type FriendListResponse = {
  friends: FriendEntry[];
  incoming: FriendRequestEntry[];
  outgoing: FriendRequestEntry[];
  max: number;
};

/** GET /api/friends/presence (접속 알림·지도 하트·빨간 점, 주기적으로) */
export type FriendPresenceResponse = { friends: Pick<FriendEntry, "key" | "name" | "where">[]; incoming: number };

/** POST /api/friends/requests: sent = 보냄, accepted = 상대가 먼저 신청해 둬서 바로 친구 */
export type FriendRequestResponse = { result: "sent" | "accepted"; name: string };

/** GET /api/friends/[key] (친구한테 가기 직전, 지금 위치) */
export type FriendWhereResponse = Required<FriendEntry>;

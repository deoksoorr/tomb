import type { AvatarDye, AwayPlace } from "@tomb/protocol";

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
  | {
      at: "away";
      ch: number;
      sid: number;
      place: AwayPlace | null;
      /** 집 안이면 그 집 id (따라 들어가기). 옛 화면이면 없다 */
      houseId?: string;
      /** 그 집에 들어갈 수 없는 이유 (친구한테 가기 직전 조회에만) */
      houseBlocked?: string;
    };

/**
 * 친구 창 한 줄의 자랑거리 (친구에게만, 서버가 잠깐 기억해 둔다).
 * look = 지금 입은 모습(바탕색·몸·꾸미기·염색) — 화면이 avatarColorSpec으로 칠한다
 */
export type FriendCard = {
  look: { color: string; body: string; look: string[]; dye?: AvatarDye };
  /** 집 꾸밈 점수 (집 랭킹 점수). 집이 없거나 숨겨졌으면 null */
  house: { id: string; score: number } | null;
  /** 사냥 레벨 */
  hunt: number;
  /** 도감 채운 비율 (0~100, 모든 종류 합쳐) */
  dex: number;
  /** 가장 큰 물고기 (이름·크기 mm). 없으면 null */
  bigFish: { name: string; size: number } | null;
  /** 꾸미기 점수 (lib/lookScore — 만료 전 착용품·외형·염색) */
  fashion?: number;
};

export type FriendEntry = {
  key: string;
  name: string;
  /** 친구가 된 시각 */
  since: number;
  where: FriendWhere;
  /** 친구 집 (분양받았고 숨겨지지 않았으면). 목록(GET /api/friends)에만 있다 */
  houseId?: string | null;
  /** 마지막 접속 (마지막 머무르기 기록 시각, 없으면 null). 목록에만 있다 */
  lastSeen?: number | null;
  /** 자랑거리 한 줄. 목록에만 있다 */
  card?: FriendCard;
};

export type FriendRequestEntry = { key: string; name: string; at: number };

/** GET /api/friends (친구 창) */
export type FriendListResponse = {
  friends: FriendEntry[];
  incoming: FriendRequestEntry[];
  outgoing: FriendRequestEntry[];
  max: number;
  /** 창 맨 위 내 요약 (내 집 점수·사냥 레벨·도감·최대어) */
  me?: FriendCard;
  /** 내가 운영자 계정이라 친구 기능을 쓸 수 없다 (목록은 비어 온다) */
  staff?: true;
};

/** GET /api/friends/presence (접속 알림·지도 하트·빨간 점, 주기적으로) */
export type FriendPresenceResponse = { friends: Pick<FriendEntry, "key" | "name" | "where">[]; incoming: number };

/** POST /api/friends/requests: sent = 보냄, accepted = 상대가 먼저 신청해 둬서 바로 친구 */
export type FriendRequestResponse = { result: "sent" | "accepted"; name: string };

/** GET /api/friends/[key] (친구한테 가기 직전, 지금 위치) */
export type FriendWhereResponse = Required<Pick<FriendEntry, "key" | "name" | "since" | "where" | "houseId">>;

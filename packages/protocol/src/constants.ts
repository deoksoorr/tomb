// 서버·클라이언트가 공유하는 상수. 용량 관련 값은 실제로는 Worker 환경변수로 덮어쓴다(기본값만 여기 둔다).

export const DEFAULT_CHANNEL_CAPACITY = 40;
export const DEFAULT_MAX_CHANNELS = 10;
export const DEFAULT_AUTO_OPEN_THRESHOLD = 0.8;
export const DEFAULT_RECONNECT_GRACE_SEC = 20;

/** 서버 브로드캐스트 틱 (델타 SNAPSHOT 주기) */
export const TICK_MS = 100;
/** 클라이언트 MOVE 최대 전송 주기 (10Hz) */
export const SEND_INTERVAL_MS = 100;
/** 원격 아바타 보간 지연 버퍼 */
export const INTERP_DELAY_MS = 120;
/** 패킷이 끊겼을 때 외삽 최대 시간 */
export const EXTRAPOLATE_MAX_MS = 200;
/** 이 거리보다 멀리 이동하면 보간 없이 즉시 이동 */
export const TELEPORT_DIST = 96;

export const MAX_MESSAGE_BYTES = 512;
/** 연결당 초당 메시지 상한 */
export const RATE_LIMIT_PER_SEC = 20;
/** 상한 초과가 이 시간(초) 연속되면 4008로 끊는다 */
export const RATE_LIMIT_KICK_SEC = 10;

export const JOIN_TOKEN_TTL_SEC = 60;

export const LOBBY_POLL_MS = 5_000;
export const LOBBY_CACHE_SEC = 2;
export const SPECTATOR_POLL_MS = 30_000;
export const EMPTY_CHANNEL_HIDE_MS = 5 * 60_000;
export const LOBBY_DEBOUNCE_MS = 1_000;
export const LOBBY_SNAPSHOT_MS = 30_000;
export const MAX_JOIN_RETRIES = 3;

/** WebSocket close codes */
export const CLOSE = {
  CHANNEL_FULL: 4001,
  REPLACED: 4002, // 같은 visitorId가 다른 탭/기기에서 접속
  INVALID_TOKEN: 4003,
  BAD_REQUEST: 4004,
  RATE_LIMITED: 4008,
} as const;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

/** text 프레임 heartbeat. DO는 setWebSocketAutoResponse로 응답해서 깨어나지 않는다. */
export const PING = "ping";
export const PONG = "pong";

// ── 이동 (월드 좌표 = 스케일 전 픽셀, 16px 타일. 화면에는 3배 줌으로 그린다) ──
export const WALK_SPEED = 56; // px/s
export const RUN_MULTIPLIER = 1.8;
export const RUN_SPEED = WALK_SPEED * RUN_MULTIPLIER;
/** 서버 검증: 달리기 최대 속도 × 1.5를 넘는 이동은 무시 */
export const SPEED_TOLERANCE = 1.5;
export const MAX_VALID_SPEED = RUN_SPEED * SPEED_TOLERANCE;
/** 앉기 키를 눌렀을 때 의자를 찾는 반경 */
export const SEAT_SEARCH_RADIUS = 24;
/** 서버가 좌석 점유 요청을 받을 때 허용하는 플레이어-좌석 거리 (지연 여유 포함) */
export const SEAT_SERVER_RADIUS = 40;
/** 랭킹 클릭 순간이동(warp) 최소 간격 */
export const WARP_COOLDOWN_MS = 1_000;

/** 아바타 색 프리셋. 토큰에는 이 중 하나의 hex 문자열이 들어간다. */
export const AVATAR_COLORS = [
  "#e8d9b0", // 뼛빛
  "#9fc5a8", // 이끼
  "#8fb3d9", // 새벽안개
  "#d9a38f", // 황토
  "#c3a6d9", // 라벤더
  "#e0c36a", // 촛불
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];
export function isAvatarColor(c: unknown): c is AvatarColor {
  return typeof c === "string" && (AVATAR_COLORS as readonly string[]).includes(c);
}

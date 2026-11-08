// 서버·클라이언트가 공유하는 상수. 용량 관련 값은 실제로는 Worker 환경변수로 덮어쓴다(기본값만 여기 둔다).

export const DEFAULT_CHANNEL_CAPACITY = 40;
export const DEFAULT_MAX_CHANNELS = 10;
export const DEFAULT_AUTO_OPEN_THRESHOLD = 0.8;
export const DEFAULT_RECONNECT_GRACE_SEC = 20;

/**
 * 서버 브로드캐스트 틱 (델타 SNAPSHOT 주기).
 * 명세는 100ms였지만, 운영 실측(한국 → Cloudflare apac DO 왕복 약 76ms)에서 틱 대기(0~100ms)가 더해져
 * 이동→상대 수신 지연 p95가 193ms로 기준(150ms)을 넘었다. 명세 8절에 따라 틱을 50ms로 줄였다.
 * 클라이언트 전송(MOVE)은 그대로 최대 10Hz라 DO 요청 수(=요금)는 늘지 않는다. 송신은 무료.
 */
export const TICK_MS = 50;
/** 클라이언트 MOVE 최대 전송 주기 (10Hz) */
export const SEND_INTERVAL_MS = 100;
/**
 * 원격 아바타 보간 지연 버퍼. 명세는 120ms였지만 틱을 50ms로 줄인 뒤에는 한 사람의 샘플 간격이
 * 전송 간격(≥100ms, 프레임 단위로 ~117ms)+틱 대기(≤50ms) ≈ 최대 170ms가 되어, 120ms 버퍼가 자주 비고
 * 외삽 후 되돌림(뒤로 1~3px)이 생겼다. 걷는 중엔 외삽 없이 보간만 하도록 버퍼를 샘플 간격에 맞췄다.
 */
export const INTERP_DELAY_MS = 170;
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
/** 접속자 목록 자가 복구 주기 (C2S sync) */
export const PEER_SYNC_MS = 60_000;
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
/** 점프: 체공 시간과 최고 높이(화면 연출용, 월드 좌표는 바뀌지 않는다). 체공 중엔 묘비 충돌을 끈다 */
export const JUMP_MS = 450;
export const JUMP_HEIGHT = 10;
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

/** 아바타 몸 모양 (새로 시작할 때 고른다. 계정에 저장되어 코드·이어서 들어가기에선 그대로) */
export const AVATAR_BODIES = [
  { id: "hood", label: "후드 유령" },
  { id: "cat", label: "고양이 유령" },
  { id: "bun", label: "토끼 유령" },
  { id: "sheet", label: "이불 유령" },
  { id: "tall", label: "키다리 유령" },
  { id: "round", label: "동글 유령" },
] as const;
export type AvatarBody = (typeof AVATAR_BODIES)[number]["id"];
export function isAvatarBody(b: unknown): b is AvatarBody {
  return typeof b === "string" && AVATAR_BODIES.some((x) => x.id === b);
}

/** 한 번 하는 동작 (같은 채널에 보이고 들린다): 종 치기·물 튀기기·손 흔들기·환호 */
export const ACT_KINDS = ["bell", "splash", "wave", "cheer"] as const;
export type ActKind = (typeof ACT_KINDS)[number];
export function isAvatarColor(c: unknown): c is AvatarColor {
  return typeof c === "string" && (AVATAR_COLORS as readonly string[]).includes(c);
}

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
  OUTDATED: 4010, // 클라이언트가 MIN_CLIENT_VERSION보다 낮다 → 새로고침해야 한다 (자동 재접속하지 않음)
} as const;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

// ── 클라이언트 버전 (큰 패치 강제 새로고침) ──
/**
 * 이 빌드의 클라이언트 호환 버전. **맵·프로토콜이 바뀌는 큰 패치에서만 1 올린다 (이 한 줄).**
 * - 웹 클라이언트는 실시간 접속 URL에 `&v=CLIENT_VERSION`을 붙인다.
 * - 실시간 서버는 자기 빌드의 MIN_CLIENT_VERSION보다 낮은 클라이언트를 CLOSE.OUTDATED(4010)로 거절한다.
 * - /api/version이 minClient로 이 값을 알려 주므로, 옛 화면은 접속이 끊기기 전에도 업데이트 창을 띄운다.
 * 평소 패치(버전 그대로)는 배포 id만 바뀌어 아래쪽 배너로 안내된다.
 */
// 2 = 가을·겨울 마을 맵 개편(1·50번: 넓은 고정 맵·강·광장·주거 구역, 해먹 상태 STATE.hammock=10, 다시 피어날 자리 제거)
// 3 = 조각배·광장 놀거리(50번: STATE.boat~carousel=11~14 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다)
// 4 = 컴팩트한 묘지 마을 맵(F1: 1440×1024, 좌석·낚시 자리·배·필지 좌표가 바뀜 — 옛 화면은 없는 좌석 id를 보낸다)
// 5 = 집 안 개편(3번: STATE.lie~bath=15~17 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다, 방 좌석·use 이벤트)
// 6 = 낚시터(호수 북동쪽 데크·낚시 자리 재배치·벤치 lE 이동 — 옛 화면은 없어진 낚시 자리·옛 벤치 좌표로 앉기를 보낸다)
export const CLIENT_VERSION = 6;
/** 실시간 서버가 받는 최소 클라이언트 버전. 따로 올리지 않는다 — 언제나 이 빌드의 CLIENT_VERSION */
export const MIN_CLIENT_VERSION = CLIENT_VERSION;
/** v 파라미터가 없는 옛 클라이언트(버전을 보내기 전 빌드)는 1로 본다. 1과 프로토콜이 같다 */
export const LEGACY_CLIENT_VERSION = 1;

/** 접속 URL의 v 값 → 버전. 없거나 이상하면 LEGACY_CLIENT_VERSION */
export function parseClientVersion(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || !/^\d{1,6}$/.test(raw)) return LEGACY_CLIENT_VERSION;
  return Number(raw);
}

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

/**
 * 정해진 문장 말풍선 (채팅 대신). id만 주고받고 문장은 클라이언트가 이 표로 그린다 → 욕설·스팸이 원천적으로 없다.
 */
export const PHRASES = [
  { id: "hi", text: "반가워요" },
  { id: "bye", text: "잘 가요" },
  { id: "thanks", text: "고마워요" },
  { id: "sit", text: "같이 앉을래요?" },
  { id: "follow", text: "따라와요!" },
  { id: "nice", text: "멋져요" },
  { id: "rip", text: "편히 쉬길…" },
  { id: "same", text: "저도 그런 적 있어요" },
  { id: "cheer", text: "다음 건 꼭 끝내요" },
  { id: "hunt", text: "사냥 같이 가요" },
  { id: "house", text: "우리 집 놀러 와요" },
] as const;
export type PhraseId = (typeof PHRASES)[number]["id"];
export function isPhraseId(id: unknown): id is PhraseId {
  return typeof id === "string" && PHRASES.some((p) => p.id === id);
}

/**
 * 방(room): 채널 묘지 말고 따로 모이는 공간 — 분양 마을, 개인 집, 사냥터.
 * 같은 방에 들어온 사람끼리 서로 보인다(위치·상태·말풍선만, 좌석·묘비 이벤트 없음).
 * id 형식: "village" | "house:{houseId}" | "hunt:{zone}:{difficulty}". 토큰의 room 클레임과 같아야 들어갈 수 있다.
 */
export const ROOM_CAPACITY = 30;
export const ROOM_ID_RE = /^(village|house:[A-Za-z0-9_-]{4,24}|hunt:[a-z0-9_-]{1,24}:[a-z]{1,10})$/;
export function isAvatarColor(c: unknown): c is AvatarColor {
  return typeof c === "string" && (AVATAR_COLORS as readonly string[]).includes(c);
}

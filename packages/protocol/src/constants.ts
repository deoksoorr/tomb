// 서버·클라이언트가 공유하는 상수. 용량 관련 값은 실제로는 Worker 환경변수로 덮어쓴다(기본값만 여기 둔다).

export const DEFAULT_CHANNEL_CAPACITY = 40;
export const DEFAULT_MAX_CHANNELS = 10;
/**
 * 평소 열어 두는 채널 수 (1..BASE). 그 위 채널은 열린 채널이 모두 혼잡(AUTO_OPEN_THRESHOLD)하면 하나씩 열리고,
 * 사람이 있거나 최근(로비 재확인 간격 안)에 있었던 동안 열려 있다. 닫힌 채널도 직접 들어갈 수는 있다(채널별 주거 구역의 집 주인)
 */
export const DEFAULT_BASE_CHANNELS = 2;
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
  // 47번 운영: 옛 클라이언트는 모르는 코드라 평소처럼 재접속을 시도하고, 입장 토큰 거절(403)에서 멈춘다
  KICKED: 4011, // 운영자가 지금 내보냄 (정지는 아님) → 자동 재접속하지 않고 안내만
  BANNED: 4012, // 이용 제한(정지·IP 차단) → 자동 재접속하지 않고 제한 화면으로
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
// 7 = 동물원(버드나무 묘역 자리 — 울타리·우리 충돌, 묘비 자리 재배치, 벤치 bX 이동)·타는 펫(ride 이벤트) — 옛 화면은 우리 안을 걷고 묘비를 옛 자리에 그린다
// 8 = 관람차·열기구(STATE.ferris·balloon=18·19 — 옛 클라이언트는 모르는 상태 값이 든 SNAPSHOT을 통째로 버린다, 광장 남쪽 관람차 받침 충돌)
// 11 = 말풍선 자유 채팅(chat 이벤트, Enter 키가 상호작용 대신 채팅 입력칸 — 옛 화면은 남의 채팅을 못 본다)
// 12 = 저장소(Redis) 사용량 절감 — 예전 화면의 잦은 확인 호출을 끊으려고 모두 한 번 새로고침시킨다 (11/14)
export const CLIENT_VERSION = 12;
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

/** 처음 고르는 몸 모양 6종 (무료. 새로 시작할 때 고른다. 계정에 저장되어 코드·이어서 들어가기에선 그대로) */
export const STARTER_BODIES = [
  { id: "hood", label: "후드 유령" },
  { id: "cat", label: "고양이 유령" },
  { id: "bun", label: "토끼 유령" },
  { id: "sheet", label: "이불 유령" },
  { id: "tall", label: "키다리 유령" },
  { id: "round", label: "동글 유령" },
] as const;

/**
 * 프리미엄 외형 등급과 선택권 값 (포인트). 선택권 = 영구 해금 + 그 외형으로 바꾸기 한 번.
 * 해금한 외형끼리(처음 6종 포함)는 그 뒤로 무료로 바꾼다 (소장).
 * I0d 경제 기준(하루 약 200P): 일반 ≈ 1주, 고급 ≈ 작은 집값, 희귀 ≈ 2주 반, 전설 ≈ 한 달
 */
export const BODY_TIERS = ["common", "fine", "rare", "legend"] as const;
export type BodyTier = (typeof BODY_TIERS)[number];
export const BODY_TIER_INFO: Readonly<Record<BodyTier, { label: string; price: number }>> = {
  common: { label: "일반", price: 1200 },
  fine: { label: "고급", price: 2000 },
  rare: { label: "희귀", price: 3200 },
  legend: { label: "전설", price: 5000 },
};

/** 상점 「염색·외형」에서 선택권으로 해금하는 몸. 그림은 처음 6종 중 하나를 바탕(web sprites/avatar BODY_BASE)으로 덧그린다 */
export const PREMIUM_BODIES = [
  { id: "suit", label: "정장 유령", tier: "common", desc: "넥타이까지 맨 출근 완성형. 포인트 색은 넥타이예요." },
  { id: "box", label: "박스 유령", tier: "common", desc: "택배 상자에서 나오기 싫은 날. 포인트 색은 테이프예요." },
  { id: "umbrella", label: "우산 유령", tier: "fine", desc: "비 예보만 보면 노란 비옷에 장화, 큰 우산까지 펴 들고 출근하는 유령. 포인트 색은 우산과 장화예요." },
  { id: "catmask", label: "고양이 탈 직장인", tier: "fine", desc: "고양이 탈을 쓰면 아무도 일을 안 시킬 거라 믿는 직장인. 포인트 색은 사원증 줄이에요." },
  { id: "cup", label: "커피잔 유령", tier: "rare", desc: "커피잔에 몸을 담그고 하루를 버텨요. 포인트 색은 컵 띠예요." },
  { id: "tube", label: "오리 튜브 유령", tier: "rare", desc: "마음만은 이미 휴가지. 포인트 색은 오리 튜브예요." },
  { id: "king", label: "왕관 유령", tier: "legend", desc: "망토와 왕관을 두른 이 구역의 진짜 주인. 포인트 색은 왕관이에요." },
] as const;

/** 운영자(31번) 계정만 쓸 수 있는 몸. 서버(web 외형 바꾸기·입장 토큰, 실시간 서버)가 운영자가 아니면 막는다 */
export const STAFF_BODIES = [{ id: "reaper", label: "저승사자", desc: "갓과 검은 도포의 저승사자. 운영자 전용이에요. 포인트 색은 갓끈 구슬이에요." }] as const;

/** 아바타 몸 모양 전부 (검증·그리기용). 옛 클라이언트는 모르는 몸을 후드 유령으로 그린다 */
export const AVATAR_BODIES = [...STARTER_BODIES, ...PREMIUM_BODIES, ...STAFF_BODIES] as const;
export type AvatarBody = (typeof AVATAR_BODIES)[number]["id"];
export type PremiumBody = (typeof PREMIUM_BODIES)[number];
export function isAvatarBody(b: unknown): b is AvatarBody {
  return typeof b === "string" && AVATAR_BODIES.some((x) => x.id === b);
}
/** 처음 고를 수 있는(무료) 몸인지 */
export function isStarterBody(b: unknown): b is (typeof STARTER_BODIES)[number]["id"] {
  return typeof b === "string" && STARTER_BODIES.some((x) => x.id === b);
}
/** 프리미엄 외형이면 그 정의 */
export function premiumBody(b: unknown): PremiumBody | undefined {
  return PREMIUM_BODIES.find((x) => x.id === b);
}
/** 운영자 전용 몸인지 */
export function isStaffBody(b: unknown): boolean {
  return typeof b === "string" && STAFF_BODIES.some((x) => x.id === b);
}
/** 프리미엄 외형 선택권 값 (프리미엄이 아니면 null) */
export function bodyUnlockPrice(b: unknown): number | null {
  const p = premiumBody(b);
  return p ? BODY_TIER_INFO[p.tier].price : null;
}
/** 화면에 보일 몸 이름 */
export function bodyLabel(b: unknown): string {
  return AVATAR_BODIES.find((x) => x.id === b)?.label ?? String(b ?? "");
}
/** 운영자 계정이 다른 사람에게 보이는 이름 (닉네임 대신, 재미있게 "대장"). 관리자 페이지에서는 원래 닉네임.
 *  일반 닉네임으로는 못 쓴다 (names.ts 금칙어). 이미 "운영자"로 저장된 옛 기록은 그대로 둔다 */
export const STAFF_PUBLIC_NAME = "대장";
/** 운영자면 공개 이름("대장"), 아니면 원래 이름 */
export function staffPublicName(name: string, staff: boolean): string {
  return staff ? STAFF_PUBLIC_NAME : name;
}
/** 운영자가 아니면 운영자 전용 몸은 후드 유령으로 (입장 토큰·실시간 서버가 쓴다) */
export function staffGateBody<T extends string>(body: T, staff: boolean): T | "hood" {
  return !staff && isStaffBody(body) ? "hood" : body;
}

/** 한 번 하는 동작 (같은 채널에 보이고 들린다): 종 치기·물 튀기기·손 흔들기·환호 */
export const ACT_KINDS = ["bell", "splash", "wave", "cheer"] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/**
 * 5번 이모티콘: 머리 위에 3~4초 뜨는 그림 (말풍선과 같은 자리·쌓기 규칙). id만 주고받고 그림은 클라이언트가 그린다.
 * 옛 클라이언트는 모르는 이벤트(emo)라 그냥 버린다. 순서 = 이모티콘 판 순서 (손 흔들기·환호 다음 3번부터 단축키)
 */
export const EMOS = [
  { id: "heart", label: "하트" },
  { id: "laugh", label: "웃음" },
  { id: "cry", label: "눈물" },
  { id: "wow", label: "놀람" },
  { id: "what", label: "물음표" },
  { id: "bang", label: "느낌표" },
  { id: "clap", label: "박수" },
  { id: "angry", label: "화남" },
  { id: "zzz", label: "졸려요" },
  { id: "coffee", label: "커피" },
  { id: "fire", label: "불꽃" },
  { id: "note", label: "음표" },
  { id: "sweat", label: "진땀" },
  { id: "idea", label: "번뜩" },
] as const;
export type EmoId = (typeof EMOS)[number]["id"];
export function isEmoId(id: unknown): id is EmoId {
  return typeof id === "string" && EMOS.some((e) => e.id === id);
}

/**
 * 24번 벤치 상태: 의자·벤치에 앉아 있는 동안 고르는 지금 하는 일. 머리 위 작은 아이콘 + 손에 든 소품으로 보인다.
 * 서버가 앉은 사람만 받고, 자리에서 일어나면 저절로 풀린다(입장 정보 PeerInfo.mood로 늦게 온 사람에게도 보인다).
 */
export const SEAT_MOODS = [
  { id: "study", label: "공부 중" },
  { id: "work", label: "일하는 중" },
  { id: "meal", label: "밥 먹는 중" },
  { id: "rest", label: "쉬는 중" },
  { id: "music", label: "음악 듣는 중" },
  { id: "call", label: "통화 중" },
  { id: "coffee", label: "커피 마시는 중" },
] as const;
export type SeatMood = (typeof SEAT_MOODS)[number]["id"];
export function isSeatMood(id: unknown): id is SeatMood {
  return typeof id === "string" && SEAT_MOODS.some((m) => m.id === id);
}

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

/**
 * 도감 100% 배지: 종류별 비트 (입장 토큰·PeerInfo의 dex). 이름표 옆 작은 배지로 그린다.
 * 순서는 web lib/forage/catalog의 LIFE_CATS와 같다 (물고기·곤충·약초·광석·발굴품)
 */
export const DEX_BADGE_CATS = ["fish", "bug", "herb", "ore", "dig"] as const;
export type DexBadgeCat = (typeof DEX_BADGE_CATS)[number];
export const DEX_BADGE_ICON: Record<DexBadgeCat, string> = { fish: "🐟", bug: "🦋", herb: "🌿", ore: "💎", dig: "🏺" };
export const DEX_BADGE_ALL = (1 << DEX_BADGE_CATS.length) - 1;
export function isDexBadge(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= DEX_BADGE_ALL;
}
/** 비트 묶음 → 달성한 종류 (순서대로) */
export function dexBadgeCats(v: number | undefined): DexBadgeCat[] {
  return isDexBadge(v) ? DEX_BADGE_CATS.filter((_, i) => v & (1 << i)) : [];
}

/**
 * 주간 랭킹 1위(챔피언) 표시: 랭킹별 비트 (입장 토큰·PeerInfo의 champ). 지난주(월요일 새벽 5시 한국 시간 마감) 1위만 Vercel이 넣는다.
 * 이름표 위 작은 배지("이번 주 포인트왕")와 몸 둘레 1위 오라로 그린다. 옛 클라이언트는 모르는 필드라 무시한다
 */
export const CHAMP_BOARDS = ["points", "huntKills", "fish"] as const;
export type ChampBoard = (typeof CHAMP_BOARDS)[number];
/** 배지 글자 ("이번 주 " 뒤에 붙는다) */
export const CHAMP_TITLE: Record<ChampBoard, string> = { points: "포인트왕", huntKills: "사냥왕", fish: "낚시왕" };
/** 랭킹별 1위 전용 꾸미기 (상점에 없다. 1위가 되면 다음 1위가 정해질 때까지 빌려 입는다) */
export const CHAMP_HAT: Record<ChampBoard, string> = { points: "champ_crown", huntKills: "champ_plume", fish: "champ_fishhat" };
/**
 * 다관왕 전용 꾸미기 (2개 이상 1위면 랭킹 모자 여러 개 대신 이것 하나): 2관왕은 차지한 두 랭킹 조합마다 색이 다른 쌍둥이 왕관, 3관왕은 무지개 대관.
 * 키 = 1위 비트 묶음 (3 포인트+사냥 · 5 포인트+낚시 · 6 사냥+낚시 · 7 셋 다)
 */
export const CHAMP_MULTI_HAT: Readonly<Record<number, string>> = { 3: "champ_duo_ph", 5: "champ_duo_pf", 6: "champ_duo_hf", 7: "champ_triple" };
/** 1위 랭킹 → 받을 전용 모자 하나 (하나면 그 랭킹 모자, 둘·셋이면 다관왕 모자) */
export function champHatOf(boards: readonly ChampBoard[]): string {
  const set = CHAMP_BOARDS.filter((b) => boards.includes(b));
  if (set.length === 1) return CHAMP_HAT[set[0]];
  return CHAMP_MULTI_HAT[set.reduce((n, b) => n | (1 << CHAMP_BOARDS.indexOf(b)), 0)] ?? CHAMP_HAT[CHAMP_BOARDS[0]];
}
export const CHAMP_ALL = (1 << CHAMP_BOARDS.length) - 1;
/** 본인이 "1위 오라 보이기"를 끈 표시 (배지는 그대로, 오라만 숨긴다). 1위 비트와 같은 값에 함께 싣는다 */
export const CHAMP_AURA_OFF = 1 << CHAMP_BOARDS.length;
/** 1위 비트가 하나 이상 있는 값 (오라 끔 표시 포함 1~15) */
export function isChampBits(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= (CHAMP_ALL | CHAMP_AURA_OFF) && (v & CHAMP_ALL) > 0;
}
/**
 * 입장 토큰·착용 증서·접속자 정보에 실리는 champ 값 전체 (1~15): 1위 비트(+ 오라 끔) 또는 CHAMP_AURA_OFF 하나만
 * (31번 운영자가 "운영자 오라 보이기"를 껐을 때 — 1위가 아니어도 오라 끔을 전한다)
 */
export function isChampValue(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= (CHAMP_ALL | CHAMP_AURA_OFF);
}
/** 비트 묶음 → 1위 랭킹 (CHAMP_BOARDS 순서) */
export function champBoards(v: number | undefined): ChampBoard[] {
  return isChampBits(v) ? CHAMP_BOARDS.filter((_, i) => v & (1 << i)) : [];
}
/** 1위 오라를 그릴지 (1위이고 본인이 끄지 않았을 때) */
export function champAuraOn(v: number | undefined): boolean {
  return isChampBits(v) && (v & CHAMP_AURA_OFF) === 0;
}
/** 1위 랭킹 목록 → 비트 묶음 (없으면 0). auraOff면 오라 끔 표시도 */
export function champBitsOf(boards: readonly ChampBoard[], auraOff = false): number {
  const n = boards.reduce((v, b) => v | (1 << CHAMP_BOARDS.indexOf(b)), 0);
  return n && auraOff ? n | CHAMP_AURA_OFF : n;
}
/** 배지 글자: 하나면 "이번 주 포인트왕", 둘·셋이면 "이번 주 2관왕"·"이번 주 3관왕" (없으면 "") */
export function champBadgeText(v: number | undefined): string {
  const b = champBoards(v);
  if (!b.length) return "";
  return b.length === 1 ? `이번 주 ${CHAMP_TITLE[b[0]]}` : `이번 주 ${b.length}관왕`;
}

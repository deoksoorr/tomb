// web 안에서 공유하는 데이터 타입과 API 응답 형태 (계약). 바꿀 때는 모든 사용처를 같이 고친다.

export const CAUSE_TAGS = [
  "time",
  "interest",
  "better_idea",
  "already_exists",
  "technical",
  "server_cost",
  "team_split",
  "no_users",
  "other",
] as const;
export type CauseTag = (typeof CAUSE_TAGS)[number];

export const CAUSE_LABELS: Record<CauseTag, string> = {
  time: "시간 부족",
  interest: "흥미 상실",
  better_idea: "더 재밌는 아이디어 등장",
  already_exists: "이미 있는 서비스 발견",
  technical: "기술적 난관",
  server_cost: "서버비",
  team_split: "팀 해체",
  no_users: "출시했지만 아무도 안 씀",
  other: "기타",
};

/** Redis(graves:meta)에 저장되는 원본. ownerTokenHash는 절대 클라이언트로 내보내지 않는다. */
export type Grave = {
  id: string;
  name: string;
  epitaph: string;
  bornAt: string; // YYYY-MM-DD
  diedAt: string; // YYYY-MM-DD
  ageDays: number;
  lastTask?: string;
  causes: CauseTag[];
  causeDetail?: string;
  links?: string[];
  stack?: string[];
  imageUrl?: string;
  mourner: string;
  createdAt: number;
  hidden?: boolean;
  ownerTokenHash: string; // sha256(ownerToken). 원문은 저장하지 않음
  /** 세운 계정 (계정 개편 이후 묘비). 이 계정으로 들어오면 어느 기기에서든 수정·삭제할 수 있다 */
  ownerAccountId?: string;
  decor?: GraveDecor[];
  /** 묘비 디자인 (@tomb/protocol GRAVE_STYLES). 없으면 "auto"(생존 기간 규칙) */
  style?: string;
  /** 세운 채널 1..MAX_CHANNELS. 채널마다 묘지가 따로다. 예전 묘비(값 없음)는 1채널로 본다 */
  channel?: number;
};

/** 묘비 꾸미기 (상점 아이템, 7일 유지) */
export type GraveDecor = { itemId: string; until: number };

/** 클라이언트로 내보내는 묘비 */
export type PublicGrave = Omit<Grave, "ownerTokenHash" | "hidden" | "ownerAccountId" | "channel"> & {
  /** 이 묘비가 있는 채널 (채널마다 묘지가 따로다) */
  channel: number;
  flowers: number;
  revives: number;
  /** 만료되지 않은 꾸미기만 */
  decor?: GraveDecor[];
};

// ── API 응답 ──

/**
 * GET /api/graves?channel=N — 그 채널의 묘비만, 등록 순(오래된 것 먼저) = 그 채널 격자 배치 순서.
 * reviveTop(다시 피어날 자리)·랭킹도 채널별이다. channel이 없으면 1채널.
 */
export type GraveListResponse = {
  channel: number;
  graves: PublicGrave[];
  /** 살려주세요 상위 10개 id (1위부터, 점수 > 0만) */
  reviveTop: string[];
  generatedAt: number;
};

/** GET /api/graves/[id] */
export type GraveDetailResponse = {
  grave: PublicGrave;
  myRevive: boolean;
  /** 오늘 이미 헌화했는지 */
  myFlowerToday: boolean;
  /** 내 계정이 세운 묘비인지 (ownerToken이 없어도 수정·삭제·꾸미기 가능) */
  isMine: boolean;
};

/** POST /api/graves 와 PATCH /api/graves/[id] 의 입력 */
export type GraveInput = {
  name: string;
  epitaph: string;
  bornAt: string;
  diedAt: string;
  lastTask?: string;
  causes: CauseTag[];
  causeDetail?: string;
  links?: string[];
  stack?: string[];
  imageUrl?: string;
  /** 상주 = 등록한 유저이름 */
  mourner: string;
  /** 묘비 디자인 (생략하면 기존 디자인 유지, 유료 디자인으로 바꾸면 디자인권 1개 소모) */
  style?: string;
};

export type CreateGraveResponse = { grave: PublicGrave; ownerToken: string; earned: number };

/** 간단 묘비 세우기: "얼마나 살았나요" 선택지 (탄생일 = 오늘 - days + 1, 사망일 = 오늘) */
export const LIFESPAN_PRESETS = [
  { id: "day", label: "하루", days: 1 },
  { id: "week", label: "일주일", days: 7 },
  { id: "month", label: "한 달", days: 30 },
  { id: "season", label: "석 달", days: 90 },
  { id: "half", label: "반년", days: 180 },
  { id: "year", label: "1년", days: 365 },
  { id: "years", label: "몇 년", days: 730 },
] as const;
export type LifespanId = (typeof LIFESPAN_PRESETS)[number]["id"];

/**
 * POST /api/graves 의 간단 입력 (세우기 폼은 이것만 쓴다).
 * 묘비명이 비면 서버가 `향년 {N}일, 조용히 별세`를 넣는다. 사인을 안 고르면 "other". 상주는 세션 계정의 이름.
 * PATCH(수정)는 기존 GraveInput 전체 교체도 계속 받는다.
 */
export type QuickGraveInput = {
  name: string;
  lived: LifespanId;
  cause?: CauseTag;
  epitaph?: string;
  mourner: string;
  /** 묘비 디자인. 무료가 아니면 가방의 "gs_{style}" 디자인권 1개를 소모한다(없으면 409 NO_ITEM) */
  style?: string;
  /** 세울 채널 = 지금 들어가 있는 채널 (관람·오프라인이면 1) */
  channel: number;
};
export type UpdateGraveResponse = { grave: PublicGrave };
/** 반응 응답의 earned = 이번에 쌓인 포인트 (한도에 걸리면 0) */
export type FlowerResponse = { count: number; earned: number };
export type ReviveResponse = { revived: boolean; count: number; earned?: number };
export type ReportResponse = { ok: true };

/**
 * POST /api/session { fresh?: boolean } — fresh면 기존 쿠키를 버리고 새 계정으로 시작("새로 시작").
 * POST /api/me/logout — 세션 쿠키를 지운다(코드가 없으면 그 계정으로 다시 못 들어온다는 안내는 UI가).
 */
export type SessionResponse = { visitorId: string };

/** POST /api/join 입력 */
export type JoinRequest = {
  channel: number | "auto";
  name: string;
  color: string;
};

/**
 * POST /api/join 응답.
 * channel 모드: wsUrl은 `ws(s)://.../ch/{n}?t={token}` 형태. 클라이언트가 `&x=..&y=..`(스폰 위치)를 붙여 연결한다.
 * spectator 모드: 전체 상한 도달 → 관람 모드.
 */
export type JoinResponse =
  | { mode: "channel"; channel: number; token: string; wsUrl: string }
  /** 전체 400명이 차서 대기열. queueUrl을 QUEUE_POLL_MS마다 GET하면 QueueStatus가 온다(토큰 10분 유효) */
  | { mode: "queue"; queueUrl: string }
  | { mode: "spectator" };

// ── 계정·포인트·상점 ──
// 방문자 쿠키(vid) = 계정 id. 처음 오면 자동으로 익명 계정이 생긴다.
// "개인 코드"를 발급받아 두면 다른 기기에서 그 코드로 같은 계정에 들어올 수 있다.

/** GET /api/me (세션 필요) */
export type Me = {
  accountId: string;
  /** 마지막으로 쓴 유저이름 (코드 로그인한 기기의 입장 화면에 미리 채움) */
  name: string | null;
  points: number;
  /** 오늘 쌓은 포인트 (DAILY_EARN_CAP 대비) */
  todayEarned: number;
  attendance: { today: boolean; streak: number };
  /** 개인 코드를 발급받은 적이 있는지 (원문은 발급 때 한 번만 보여 준다) */
  hasCode: boolean;
  /** 가방: itemId → 개수 */
  inventory: Record<string, number>;
  /** 착용 중인 꾸미기 (만료 전) */
  equipped: { itemId: string; until: number }[];
  /** 내 계정이 세운 묘비 id */
  graves: string[];
};

/** POST /api/me/attend → 출석 처리 (입장할 때 호출, 하루 1번만 지급) */
export type AttendResponse = { me: Me; earned: number };
/** POST /api/me/code → 개인 코드 발급(재발급하면 이전 코드는 무효) */
export type CodeResponse = { code: string };
/** POST /api/me/login { code } → 이 기기를 그 계정으로 전환 (세션 쿠키 교체) */
export type CodeLoginResponse = { me: Me };
/** POST /api/shop/buy { itemId } */
export type BuyResponse = { me: Me };
/**
 * POST /api/shop/use { itemId, graveId? }
 *  - firework → grant(폭죽 증서, 60초) : 게임이 실시간 서버로 보낸다
 *  - cosmetic → lookGrant(착용 증서) : 게임이 실시간 서버로 보내 다른 사람에게도 보이게 한다
 *  - decor(graveId 필수, 내 묘비만) → grave(꾸미기가 반영된 묘비)
 */
export type UseItemResponse = { me: Me; grant?: string; lookGrant?: string; grave?: PublicGrave };
/** GET /api/me/look → 지금 착용 상태의 증서 (재접속 때) */
export type LookGrantResponse = { look: string[]; lookGrant: string };
/** GET /api/version → 배포 식별자. 다르면 새 버전 안내 */
export type VersionResponse = { version: string };

/**
 * GET /api/upload — 업로드 방식 안내 (Blob 토큰이 없으면 로컬 대체 경로).
 * prefix: 이 방문자 전용 업로드 경로 (`graves/{방문자 해시}/`). blob 모드에서는 반드시 `${prefix}${랜덤}.webp`로 올린다.
 * 서버는 묘비 생성/수정 때 imageUrl이 요청한 방문자의 prefix 아래에 있는지 확인한다(남의 이미지를 가져다 지우는 것 방지).
 */
export type UploadModeResponse = { mode: "blob" | "local"; prefix: string };
/** POST /api/upload/local (multipart, field "file") 응답 */
export type LocalUploadResponse = { url: string };

export type ApiError = { error: { code: string; message: string } };

// ── 클라이언트 localStorage 키 ──
export const LS = {
  name: "tomb.name",
  color: "tomb.color",
  volume: "tomb.volume",
  muted: "tomb.muted",
  playlist: "tomb.playlist",
  lastChannel: "tomb.lastChannel",
  /** { [graveId]: ownerToken } */
  ownerTokens: "tomb.ownerTokens",

} as const;

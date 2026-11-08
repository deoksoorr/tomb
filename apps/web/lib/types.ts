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
};

/** 클라이언트로 내보내는 묘비 */
export type PublicGrave = Omit<Grave, "ownerTokenHash" | "hidden"> & {
  flowers: number;
  revives: number;
};

// ── API 응답 ──

/** GET /api/graves — graves는 등록 순(오래된 것 먼저) = 격자 배치 순서 */
export type GraveListResponse = {
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
};

export type CreateGraveResponse = { grave: PublicGrave; ownerToken: string };
export type UpdateGraveResponse = { grave: PublicGrave };
export type FlowerResponse = { count: number };
export type ReviveResponse = { revived: boolean; count: number };
export type ReportResponse = { ok: true };

/** POST /api/session */
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
  | { mode: "spectator" };

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

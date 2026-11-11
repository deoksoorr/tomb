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
  better_idea: "더 재밌는 게 생김",
  already_exists: "누가 이미 하고 있었음",
  technical: "생각보다 어려움",
  server_cost: "돈이 너무 듦",
  team_split: "같이 하던 사람이 떠남",
  no_users: "보여 줬지만 아무도 관심 없음",
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
  /** 상주의 한마디 (한 줄, 100자) */
  comment?: string;
};

/** 묘비 꾸미기 (상점 아이템, 7일 유지) */
export type GraveDecor = { itemId: string; until: number };

/** 클라이언트로 내보내는 묘비 */
export type PublicGrave = Omit<Grave, "ownerTokenHash" | "hidden" | "ownerAccountId" | "channel"> & {
  /** 이 묘비가 있는 채널 (채널마다 묘지가 따로다) */
  channel: number;
  flowers: number;
  /**
   * @deprecated 살려주세요는 49번에서 없어졌다. 저장된 수는 보관만 하고 화면에는 내보내지 않는다 → 항상 0
   * (옛 클라이언트·맵 코드가 읽어도 깨지지 않게 필드만 남긴다)
   */
  revives: number;
  /** 만료되지 않은 꾸미기만 */
  decor?: GraveDecor[];
  /** 이 시각(epoch ms)이 지나면 성불한다 (묘역이 가득 차면 더 일찍 성불할 수 있다). 목록·상세에서 채운다 */
  passAt?: number;
};

// ── API 응답 ──

/**
 * GET /api/graves?channel=N — 그 채널의 묘비만, 등록 순(오래된 것 먼저) = 그 채널 격자 배치 순서. channel이 없으면 1채널.
 */
export type GraveListResponse = {
  channel: number;
  graves: PublicGrave[];
  /** @deprecated 살려주세요(다시 피어날 자리)는 49번에서 없어졌다 → 항상 빈 배열 */
  reviveTop: string[];
  /** 이 채널에서 최근(PASSED_RECENT_MS 안에) 성불한 묘비 id. 클라이언트가 아직 그 묘비를 그리고 있으면 빛 연출 뒤에 지운다 */
  passed?: string[];
  generatedAt: number;
};

/** GET /api/graves/[id] */
export type GraveDetailResponse = {
  grave: PublicGrave;
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
  /** 상주의 한마디 (선택, 100자) */
  comment?: string;
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
  /** 상주의 한마디 (선택, 100자) */
  comment?: string;
};
export type UpdateGraveResponse = { grave: PublicGrave };
/** 반응 응답의 earned = 이번에 쌓인 포인트 (한도에 걸리면 0) */
export type FlowerResponse = { count: number; earned: number };
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
  /** AVATAR_BODIES id */
  body?: string;
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
  /** 저장된 아바타 색·몸 모양 (코드로 시작·이어서 들어가기에선 그대로 쓰고 채널만 고른다) */
  color: string | null;
  body: string | null;
  /** 지금까지 모은 포인트 합계 (쓰더라도 줄지 않음, 포인트 랭킹 기준) */
  lifetimePoints: number;
  /** 안 읽은 내 소식 수 */
  activityUnread: number;
  /** 다음 닉네임 변경 가능 시각(0이면 지금 가능)과 다음 변경 비용 */
  nameChange: { nextAllowedAt: number; cost: number };
  /** 첫 방문 안내를 끝냈는지 (계정 기준 — 기기를 바꿔도 다시 안 뜬다) */
  tutorialDone: boolean;
  points: number;
  /** 오늘 쌓은 포인트 (DAILY_EARN_CAP 대비) */
  todayEarned: number;
  attendance: { today: boolean; streak: number };
  /** 개인 코드를 발급받은 적이 있는지 (원문은 발급 때 한 번만 보여 준다) */
  hasCode: boolean;
  /** 가방: itemId → 개수 */
  inventory: Record<string, number>;
  /** 착용 중인 꾸미기 (만료 전, 부위마다 하나) */
  equipped: { itemId: string; until: number }[];
  /** 벗어 둔 꾸미기 (만료 전). 남은 시간은 벗어 둔 동안에도 흐른다. POST /api/me/wear로 다시 입는다 */
  stash: { itemId: string; until: number }[];
  /** 내 계정이 세운 묘비 id */
  graves: string[];
};

/**
 * POST /api/me/wear `{ itemId }` → 벗어 둔 꾸미기를 다시 입기 (같은 부위에 입던 것은 벗어 둔 쪽으로)
 * POST /api/me/unequip `{ slot }` → 그 부위 벗기
 * 둘 다 바뀐 착용 상태의 증서를 같이 준다 (게임이 실시간 서버로 보낸다). 없으면 409 NO_ITEM
 */
export type WearResponse = { me: Me; lookGrant: string };

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
/** version = 배포 id (다르면 평소 패치 배너), minClient = 이 배포가 요구하는 최소 클라이언트 버전 (내 CLIENT_VERSION보다 크면 강제 업데이트 창) */
export type VersionResponse = { version: string; minClient: number };

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

// ── 공지사항·문의 ──

/** GET /api/notices → 활성 공지(고정 먼저, 최신 순, 최대 20). 관리자: GET/POST /api/admin/notices, PATCH/DELETE /api/admin/notices/[id] */
export type Notice = { id: string; title: string; body: string; createdAt: number; pinned: boolean };
export type NoticeListResponse = { notices: Notice[] };
export type NoticeInput = { title: string; body: string; pinned?: boolean };

export const INQUIRY_CATEGORIES = [
  { id: "bug", label: "버그 신고" },
  { id: "idea", label: "제안" },
  { id: "account", label: "계정·포인트" },
  { id: "grave", label: "부적절한 묘비" },
  { id: "other", label: "기타" },
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number]["id"];

/**
 * POST /api/inquiry (세션 필요) → 운영자의 GitHub 저장소(GITHUB_INQUIRY_REPO)에 이슈로 등록된다.
 * message 10~1000자, contact(답장 받을 이메일 등)는 선택 100자.
 * 저장소가 공개면 문의 내용이 공개되므로 UI는 `GET /api/inquiry` → { enabled, public }을 보고 안내한다.
 */
export type InquiryInput = { category: InquiryCategory; message: string; contact?: string; /** 문의 당시 채널 (이슈에 표시) */ channel?: number };
export type InquiryResponse = { ok: true };
export type InquiryInfoResponse = { enabled: boolean; public: boolean };

// ── v3: 성황당·포인트 랭킹·머무르기 ──

/**
 * 성황당: 내가 이장(삭제)한 묘비는 30일 동안 성황당에 모셔지고 다시 모실(복구) 수 있다.
 * GET /api/shrine → 내 계정이 이장한 묘비들, POST /api/shrine/{id}/restore → 원래 채널 맨 뒤 자리로 복구.
 */
export const SHRINE_KEEP_DAYS = 30;
export type ShrineEntry = { grave: PublicGrave; removedAt: number; expiresAt: number };
export type ShrineListResponse = { entries: ShrineEntry[] };
/** POST /api/shrine/{id}/restore → 복구된 묘비 (원래 채널 맨 뒤 자리) */
export type ShrineRestoreResponse = { grave: PublicGrave };

/** GET /api/rank/points → 모은 포인트(lifetimePoints) 상위 50명과 내 순위 */
export type PointRankRow = { rank: number; name: string; points: number; me: boolean };
export type PointRankResponse = { rows: PointRankRow[]; mine: PointRankRow | null };

/** POST /api/me/presence (화면이 켜져 있는 동안 10분마다) → 머무르기 포인트 */
export const PRESENCE_INTERVAL_MS = 10 * 60_000;
export type PresenceResponse = { earned: number; me: Me };

// ── v4: 방 입장·소식·닉네임·오류·경제 ──

/** POST /api/join/room { room } → 방(마을·집·사냥터) 입장 토큰. wsUrl = `${REALTIME_WS_URL}/room/${encodeURIComponent(room)}?t=...` */
export type RoomJoinRequest = { room: string };
export type RoomJoinResponse = { room: string; token: string; wsUrl: string };

/**
 * 내 소식 (자리를 비운 사이 내 묘비·집에 생긴 일). GET /api/me/activity?since=epochMs → 최신 순 50개.
 * POST /api/me/activity/seen { at } → 여기까지 읽음. me.activityUnread로 안 읽은 수를 HUD에 띄운다.
 */
/** revive는 49번 이전에 쌓인 소식 (API가 걸러 내고 보여 주지 않는다). passed = 내 묘비가 성불함 (who는 빈 문자열) */
export type ActivityKind = "flower" | "revive" | "houseLike" | "guestbook" | "restore" | "passed";
export type ActivityItem = { id: string; kind: ActivityKind; at: number; who: string; targetId: string; targetName: string };
export type ActivityResponse = { items: ActivityItem[]; unread: number; lastSeenAt: number };

/** POST /api/me/name { name } → 닉네임 변경. 첫 변경 무료, 이후 NAME_CHANGE_PRICE 포인트, NAME_CHANGE_COOLDOWN_DAYS일에 한 번 */
export const NAME_CHANGE_PRICE = 100;
export const NAME_CHANGE_COOLDOWN_DAYS = 7;
export type NameChangeResponse = { me: Me; cost: number; nextAllowedAt: number };

/** POST /api/errors (세션 없어도 됨, 레이트리밋) — 클라이언트 오류 보고. 관리자 화면 "오류" 탭에서 본다 */
export type ErrorReport = { message: string; stack?: string; url: string; kind: "error" | "unhandledrejection" | "react" | "api"; ua?: string };

/** 관리자: GET /api/admin/economy?days=14 → 날짜별 적립(항목별)·사용(사유별) 합계 */
export type EconomyDay = { date: string; earned: Record<string, number>; spent: Record<string, number> };
export type EconomyResponse = { days: EconomyDay[]; totals: { wallets: number; accounts: number } };

// ── 49번: 성불·1인 1묘비·랭킹 ──

/** 성불 기간 기본값 (관리자 설정으로 바꾼다) */
export const DEFAULT_PASS_DAYS = 14;
export const MIN_PASS_DAYS = 1;
export const MAX_PASS_DAYS = 365;
/** 목록 응답의 passed(빛 연출)에 넣는 최근 성불 기간 */
export const PASSED_RECENT_MS = 10 * 60_000;

/** 왜 성불했나: 기간이 다 됨 / 묘역이 가득 차 앞당겨짐 / 1인 1묘비 정리(새 묘비·옛 계정 정리) */
export type PassReason = "time" | "full" | "one";

/** 성불한 이야기 (성불 리스트 한 줄). 숨김 묘비는 공개 목록에 나오지 않는다 */
export type PassedEntry = {
  id: string;
  name: string;
  epitaph: string;
  mourner: string;
  bornAt: string;
  diedAt: string;
  ageDays: number;
  style?: string;
  comment?: string;
  channel: number;
  flowers: number;
  createdAt: number;
  passedAt: number;
};
/** GET /api/graves/passed?q=&offset= → 최신 성불 순 한 쪽. next가 있으면 offset=next로 다음 쪽 */
export type PassedListResponse = { entries: PassedEntry[]; next: number | null; total: number };

/**
 * GET /api/me/grave → 내 계정의 지금 묘비 (1인 1묘비). active가 있으면 새로 쓸 수 없고 active.passAt에 성불한다.
 * passDays = 지금 성불 기간 설정
 */
export type MyGraveStatusResponse = { active: PublicGrave | null; passDays: number };

/** 랭킹 (49번: 포인트·사냥 중심). huntKills = 사냥터 처치 수 합계, huntBest = 사냥터(zone)별 최단 클리어 시간(ms, 작을수록 위) */
export const RANK_BOARDS = ["points", "huntKills", "huntBest"] as const;
export type RankBoard = (typeof RANK_BOARDS)[number];
/** week = 이번 주(KST 월요일 0시부터), all = 전체 */
export type RankPeriod = "week" | "all";
export type RankRow = { rank: number; name: string; value: number; me: boolean };
/** GET /api/rank?board=&period=&zone=&me=1 */
export type RankResponse = {
  board: RankBoard;
  period: RankPeriod;
  /** huntBest의 사냥터 (난이도 id) */
  zone?: string;
  rows: RankRow[];
  mine: RankRow | null;
};

// 관리자 화면 왼쪽 메뉴: 묶음(운영·손님·신고·안전·경제·마을·기록)과 항목, 주소 해시(#members 등) ↔ 화면 변환 (순수 함수만 — 테스트에서 같이 쓴다)

export type PanelId =
  | "dashboard"
  | "online"
  | "maintenance"
  | "errors"
  | "system"
  | "members"
  | "inquiries"
  | "referrals"
  | "staff"
  | "reports"
  | "bans"
  | "codes"
  | "economy"
  | "gifts"
  | "dye"
  | "pointEvent"
  | "lottery"
  | "review"
  | "towerGrant"
  | "devnotes"
  | "housing"
  | "graves"
  | "passed"
  | "residents"
  | "urgent"
  | "analytics"
  | "activity";

export type NavItem = {
  id: PanelId;
  label: string;
  /** 본문 위에 한 줄로 보이는 설명 */
  desc: string;
};
export type NavGroup = { title: string; items: NavItem[] };

// 11/26 정리: 확성기 관리(신고에서 확성기 신고를 숨길 수 있다)·공지(개발자 노트가 글만 있는 공지까지 고치고 고정·삭제한다)를 뺐다.
// 맵 컨셉은 대시보드로, 매니저 임명은 운영자 지정 화면으로, 묘역 규칙은 성불한 묘비 화면으로 합쳤다
export const NAV: NavGroup[] = [
  {
    title: "운영",
    items: [
      { id: "dashboard", label: "대시보드", desc: "지금 접속·점검·맵 컨셉과 오늘 숫자, 처리할 일을 한눈에 봐요. 열 때와 [새로고침]을 누를 때만 불러와요." },
      { id: "online", label: "지금 접속자", desc: "접속 중인 계정과 포인트·유입·맵 통계예요. 열 때와 [새로고침]을 누를 때만 불러와요." },
      { id: "maintenance", label: "점검 모드", desc: "서버 점검을 시작하고 끝내요. 점검 중에는 운영자 빼고 모두 점검 화면을 봐요." },
      { id: "errors", label: "오류 기록", desc: "브라우저·서버에서 모인 오류를 같은 것끼리 묶어 보여 줘요." },
      { id: "system", label: "운영 점검", desc: "저장소 읽기·쓰기 점검과 닉네임 색인 채우기 같은 관리 작업이에요." },
    ],
  },
  {
    title: "손님",
    items: [
      { id: "members", label: "회원 목록", desc: "전체 회원을 최근 접속 순이나 접속 시간 순으로 보고 이름으로 찾아요. 줄마다 코드 재발급, 지금 내보내기, 정지도 바로 해요." },
      { id: "inquiries", label: "문의", desc: "유저가 [문의하기]로 보낸 문의를 읽고 처리했는지와 메모를 남겨요. 최근 500건만 보관해요." },
      { id: "referrals", label: "추천", desc: "추천 코드로 온 이웃과 조건 달성, 보상 지급을 보고 자동 보상을 켜고 꺼요." },
      { id: "staff", label: "운영자·매니저", desc: "게임 안 운영자 계정(저승사자 차림·운영자 배지) 한 명과 매니저(전용 칭호·채팅 딱지)를 정해요." },
    ],
  },
  {
    title: "신고·안전",
    items: [
      { id: "reports", label: "신고", desc: "묘비·방명록·유저·확성기 신고를 한 목록에서 보고 바로 처리해요. 확성기는 여기서 숨겨요." },
      { id: "bans", label: "정지·차단 기록", desc: "계정 정지·IP 차단 목록이에요. 기간 수정·조기 해제·IP로 바로 차단을 여기서 해요." },
      { id: "codes", label: "코드 재발급 기록", desc: "누가 언제 누구의 접속 코드를 다시 만들었는지 남겨 둔 기록이에요." },
    ],
  },
  {
    title: "경제",
    items: [
      { id: "economy", label: "경제", desc: "유저 포인트 잔액과 날짜별 적립, 사용 합계예요." },
      { id: "gifts", label: "선물", desc: "포인트·아이템을 쪽지와 함께 특정 계정이나 전체 선물함으로 보내요." },
      { id: "dye", label: "염색권", desc: "정한 색만 쓸 수 있는 고정 색 염색권을 만들어 선물함으로 보내요." },
      { id: "pointEvent", label: "포인트 2배 이벤트", desc: "고른 항목의 적립을 늘리는 이벤트를 켜고 꺼요. 끝나는 시각을 정하면 저절로 꺼져요." },
      { id: "lottery", label: "행운권 추첨", desc: "이번 주 행운권 판매와 상금을 보고 지원금을 더해요. 최근 추첨 결과도 여기 있어요." },
      { id: "review", label: "기록 확인", desc: "너무 빨리 깬 야근 빌딩 판, 서버 최초 칭호, 서버 최고 층 기록을 확인해요. 인정하면 붙잡아 둔 보상과 자리가 들어가요." },
      { id: "towerGrant", label: "야근 빌딩 대신 정산", desc: "서버가 잘못 거절한 야근 빌딩 판을 판 끝과 똑같이 정산해 넣어요. 상자는 새로 굴려요." },
    ],
  },
  {
    title: "마을",
    items: [
      { id: "devnotes", label: "개발자 노트", desc: "개발자 노트와 게임 공지를 쓰고 고치고 고정해요. 올리면 사이트(/news)와 게임 공지 알림에 같이 나와요." },
      { id: "housing", label: "하우징", desc: "집 목록과 신고된 방명록 글을 숨기거나 지워요." },
      { id: "graves", label: "묘역 묘비", desc: "묘역에 서 있는 묘비를 찾아 숨기기·신고 초기화·삭제해요." },
      { id: "passed", label: "성불·묘역 규칙", desc: "성불 기간과 채널마다 묘역 정원을 보고 바꿔요. 성불한 묘비(숨김 포함)를 찾아보고 완전히 지워요." },
      { id: "residents", label: "마을 주민", desc: "돌아다니는 마을 주민(NPC)을 켜고 끄고 수를 정해요." },
      { id: "urgent", label: "긴급 의뢰 결과", desc: "최근 끝난 긴급 의뢰 20개의 최종 %, 낸 사람과 순위, 받을 보상, 행운의 배달부, 누가 받아 갔는지를 봐요." },
    ],
  },
  {
    title: "기록",
    items: [
      { id: "analytics", label: "유입 분석", desc: "기간별 방문·가입·체류 추이와 유입 경로·기기·국가, 유입별 가입 수예요. 원본 IP 없이 90일만 보관해요." },
      { id: "activity", label: "유저 활동", desc: "계정 기준 DAU와 리텐션, 자주 오는 유저와 VIP, 휴면과 떠난 단골, 접속·사냥터 기록을 봐요." },
    ],
  },
];

const ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
/** 예전 탭 이름으로 들어와도 맞는 화면을 연다 */
const ALIASES: Record<string, PanelId> = {
  content: "graves",
  staffs: "staff",
  manager: "staff",
  managers: "staff",
  news: "devnotes",
  notices: "devnotes",
  megaphone: "reports",
  mapConcept: "dashboard",
  graveRules: "passed",
  "": "dashboard",
};

export const DEFAULT_PANEL: PanelId = "dashboard";

export function isPanelId(v: string): v is PanelId {
  return ITEMS.some((i) => i.id === v);
}

/** "#members" · "members" · "" → 화면 id (모르는 값은 대시보드) */
export function panelFromHash(hash: string): PanelId {
  const key = decodeURIComponent(hash.replace(/^#/, "")).trim();
  if (isPanelId(key)) return key;
  return ALIASES[key] ?? DEFAULT_PANEL;
}

export function navItem(id: PanelId): NavItem {
  return ITEMS.find((i) => i.id === id)!;
}

export function navGroupOf(id: PanelId): NavGroup {
  return NAV.find((g) => g.items.some((i) => i.id === id))!;
}

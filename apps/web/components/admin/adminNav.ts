// 관리자 화면 왼쪽 메뉴: 묶음(현황·회원·신고·안전…)과 항목, 주소 해시(#members 등) ↔ 화면 변환 (순수 함수만 — 테스트에서 같이 쓴다)

export type PanelId =
  | "dashboard"
  | "economy"
  | "analytics"
  | "members"
  | "codes"
  | "staff"
  | "reports"
  | "bans"
  | "megaphone"
  | "notices"
  | "gifts"
  | "dye"
  | "graves"
  | "passed"
  | "housing"
  | "residents"
  | "graveRules"
  | "errors"
  | "system";

export type NavItem = {
  id: PanelId;
  label: string;
  /** 본문 위에 한 줄로 보이는 설명 */
  desc: string;
};
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "현황",
    items: [
      { id: "dashboard", label: "대시보드", desc: "지금 접속·오늘 방문·처리할 일과 최근 기록을 한눈에 봐요." },
      { id: "economy", label: "경제", desc: "날짜별 포인트 적립·사용과 항목별 합계, 지갑 잔액이에요." },
      { id: "analytics", label: "유입 분석", desc: "기간별 방문·가입·체류 추이와 유입 경로·기기·국가예요. 원본 IP 없이 90일만 보관해요." },
    ],
  },
  {
    title: "회원",
    items: [
      { id: "members", label: "회원 제재", desc: "회원 목록에서 코드 재발급·지금 내보내기·정지를 바로 해요." },
      { id: "codes", label: "코드 재발급 기록", desc: "누가 언제 누구의 접속 코드를 다시 만들었는지 남겨 둔 기록이에요." },
      { id: "staff", label: "운영자 지정", desc: "게임 안 운영자 계정(저승사자 차림·운영자 배지)을 한 명 지정해요." },
    ],
  },
  {
    title: "신고·안전",
    items: [
      { id: "reports", label: "신고", desc: "묘비·방명록·유저·확성기 신고를 한 목록에서 보고 바로 처리해요." },
      { id: "bans", label: "정지·차단 기록", desc: "계정 정지·IP 차단 목록이에요. 기간 수정·조기 해제·IP로 바로 차단을 여기서 해요." },
      { id: "megaphone", label: "확성기 관리", desc: "최근 확성기 100개를 보고 숨기거나 다시 보이게 해요." },
    ],
  },
  {
    title: "소통",
    items: [
      { id: "notices", label: "공지", desc: "게임 공지를 쓰고 고치고 맨 위에 고정해요." },
      { id: "gifts", label: "선물", desc: "포인트·아이템을 쪽지와 함께 특정 계정이나 전체 선물함으로 보내요." },
      { id: "dye", label: "염색권", desc: "정한 색만 쓸 수 있는 고정 색 염색권을 만들어 선물함으로 보내요." },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { id: "graves", label: "묘역 묘비", desc: "묘역에 서 있는 묘비를 찾아 숨기기·신고 초기화·삭제해요." },
      { id: "passed", label: "성불한 묘비", desc: "성불한 묘비(숨김 포함)를 찾아보고 완전히 지워요." },
      { id: "housing", label: "하우징", desc: "집 목록과 신고된 방명록 글을 숨기거나 지워요." },
    ],
  },
  {
    title: "마을 설정",
    items: [
      { id: "residents", label: "마을 주민", desc: "돌아다니는 마을 주민(NPC)을 켜고 끄고 수를 정해요." },
      { id: "graveRules", label: "묘역 규칙", desc: "묘비가 성불하기까지의 기간과 채널마다 묘역 정원이에요." },
    ],
  },
  {
    title: "시스템",
    items: [
      { id: "errors", label: "오류 기록", desc: "브라우저·서버에서 모인 오류를 같은 것끼리 묶어 보여 줘요." },
      { id: "system", label: "운영 점검", desc: "저장소 읽기·쓰기 점검과 닉네임 색인 채우기 같은 관리 작업이에요." },
    ],
  },
];

const ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
/** 예전 탭 이름으로 들어와도 맞는 화면을 연다 */
const ALIASES: Record<string, PanelId> = { content: "graves", staffs: "staff", "": "dashboard" };

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

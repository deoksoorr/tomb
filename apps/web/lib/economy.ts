// 포인트 정책 (서버가 강제하고, UI의 ⓘ 가이드가 그대로 보여 준다). 바꾸면 가이드도 자동으로 바뀐다.
// 날짜 기준은 한국 시간(KST) 자정. 모든 아이템은 1회성(items.ts).

export type EarnSource =
  | "attend"
  | "streak"
  | "flower"
  | "bury"
  | "gotFlower"
  | "presence"
  | "hunt"
  | "houseLike"
  // ── 4·32·51번 낚시·채집·도감 (lib/forage) ──
  | "fish"
  | "gather"
  | "dex"
  // ── 22번 황금 고블린(보너스 요정) (/api/goblin) ──
  | "goblin"
  // ── 50번 소원 분수 (lib/wish.ts, /api/plaza/wish) ──
  | "wish"
  // ── 10번 출석 달력: 한 달 개근 보상 (lib/calendar.ts) ──
  | "monthly";

export type EarnRule = { source: EarnSource; label: string; points: number; dailyMax: number; note: string };

export const EARN_RULES: readonly EarnRule[] = [
  // 10번: 입장 때 자동으로 주지 않고, 그날 1시간 머문 뒤 출석 달력의 오늘 칸을 눌러 받는다 (lib/calendar.ts)
  { source: "attend", label: "출석 도장", points: 10, dailyMax: 10, note: "그날 1시간 머문 뒤 출석 달력에서 오늘 칸을 눌러 받기" },
  { source: "streak", label: "7일 연속 출석", points: 30, dailyMax: 30, note: "도장을 연속 7일째 찍을 때마다 보너스" },
  { source: "monthly", label: "한 달 개근", points: 200, dailyMax: 200, note: "그달 1일부터 마지막 날까지 하루도 빠짐없이 도장을 찍으면" },
  { source: "flower", label: "헌화하기", points: 2, dailyMax: 20, note: "묘비마다 하루 1번, 하루 10번까지" },
  { source: "bury", label: "묘비 세우기", points: 20, dailyMax: 20, note: "하루 1개분만 지급" },
  { source: "gotFlower", label: "내 묘비가 헌화 받음", points: 1, dailyMax: 20, note: "다른 사람이 헌화할 때" },
  { source: "presence", label: "묘지에 머무르기", points: 5, dailyMax: 60, note: "접속해 있는 10분마다 (다른 일을 해도 OK)" },
  { source: "hunt", label: "사냥터·미니게임", points: 0, dailyMax: 600, note: "난이도와 성적에 따라 (한 판 보상은 게임 결과로)" },
  { source: "houseLike", label: "내 집이 좋아요 받음", points: 2, dailyMax: 20, note: "다른 사람이 내 집에 좋아요를 누를 때" },
  // 낚시·채집은 잡을 때가 아니라 NPC에게 팔 때 들어온다 (값은 lib/forage/catalog.ts). 한도를 넘는 만큼은 가방에 남아 내일 팔 수 있다
  { source: "fish", label: "물고기 팔기", points: 0, dailyMax: 200, note: "낚시터 어부에게 (희귀할수록 비싸요)" },
  { source: "gather", label: "채집물 팔기", points: 0, dailyMax: 150, note: "숲 빈터의 수집가에게 (약초·광석·발굴품·곤충)" },
  { source: "dex", label: "도감 달성 보상", points: 0, dailyMax: 300, note: "종류별 도감을 25·50·75·100% 채울 때 한 번씩" },
  // 실시간 서버가 "가장 먼저 잡은 한 명"에게 서명한 증서로만 받는다 (고블린 한 마리당 한 번, lib/goblin.ts)
  { source: "goblin", label: "황금 고블린 잡기", points: 0, dailyMax: 150, note: "가끔 마을에 나타나는 황금 고블린(보너스 요정)을 가장 먼저 잡으면 20~100P" },
  // 광장 소원 분수에 동전(1~5P)을 던지면 가끔 튀어 돌아온다 (하루 3번)
  { source: "wish", label: "소원 분수", points: 0, dailyMax: 30, note: "광장 분수에 동전을 던지면 가끔 몇 포인트가 튀어 돌아와요 (하루 3번)" },
];

/**
 * 하루에 쌓을 수 있는 전체 포인트. 위 항목 한도의 합(1,430)보다 작게 잡아 하루 상한을 둔다 — 사냥만 해도(600) 닿기 쉽고,
 * 출석·머무르기(70) + 낚시(200) + 채집(150)처럼 골고루 하면 420쯤. 낚시·채집을 더해도 하루 최대는 그대로 800
 */
export const DAILY_EARN_CAP = 800;
/**
 * 지갑 상한 (I0b: 9,999 → 99,999). 관리자 지급·선물·운영자 채우기·검증 스키마·Redis Lua 인자가 모두 이 값을 쓴다.
 *
 * I0d 경제 기준 (가격을 바꿀 때 이 표를 함께 본다): 보통 유저 = 하루 한 번 20~30분 → 약 200P
 * (머무르기 10~15 · 헌화 10~20 · 쉬움 사냥 3~4판 60~80 · 낚시 10분 80~120 · 채집 몇 곳 20~40 · 초반 도감 보상).
 *  - 기본 코디(하루권 60~100P): 첫 플레이에 하나
 *  - 입문 펫(450P, 동물원 ZOO_PETS): 2~3번째 플레이
 *  - 프리미엄 외형 선택권(영구, protocol BODY_TIER_INFO): 일반 1,200 · 고급 2,000 · 희귀 3,200 · 전설 5,000P (약 6일 ~ 25일)
 *  - 작은 집(2,000P, housing PLOT_TIERS): 약 10일 (하루 상한 800P로 몰아쳐도 3일)
 *  - 대저택(누적 2,000 + 3,000 + 5,000 = 10,000P): 약 50일 — 가구·외관(4배)까지 더하면 그 이상
 */
export const BALANCE_CAP = 99_999;
/** 같은 IP에서 하루에 출석 포인트를 받을 수 있는 계정 수 (계정 여러 개로 출석 농사 방지) */
export const ATTEND_ACCOUNTS_PER_IP = 3;

export const earnRule = (s: EarnSource) => EARN_RULES.find((r) => r.source === s)!;

/** 개인 코드: 12자(헷갈리는 글자 0/O/1/I/L 제외), XXXX-XXXX-XXXX 형식. 이 코드를 아는 사람은 계정 주인으로 본다 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
export function normalizeCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : raw.trim().toUpperCase();
}

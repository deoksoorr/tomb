// 포인트 정책 (서버가 강제하고, UI의 ⓘ 가이드가 그대로 보여 준다). 바꾸면 가이드도 자동으로 바뀐다.
// 날짜 기준은 한국 시간 새벽 5시 (lib/gameDay — 횟수 규칙이 그때 다시 찬다). 모든 아이템은 1회성(items.ts).
// 11/19 「편하게 노는 게임」 개편: 놀아서 버는 포인트(사냥·별자리·곤충·낚시·채집·도감·고블린·머무르기·접속 보너스·소원)의 하루 한도,
// 하루 전체 한도, 지갑 상한(99,999)을 없앴다. 남은 건 행동 한 번에 붙은 횟수 규칙(출석·헌화·묘비·받은 헌화·좋아요 — 다른 계정으로
// 몰아주기·묘비 도배를 막는다)뿐이다. 봇 막이는 한도가 아니라 요청 속도 제한·판 결과 상한·티켓 검사가 한다 (각 API).

import { ATTEND_STAY_TEXT } from "./attendStay";
import { STAY_BONUS_EVERY_MINUTES } from "./stayBonus";

export type EarnSource =
  | "attend"
  | "streak"
  | "flower"
  | "bury"
  | "gotFlower"
  | "presence"
  | "hunt"
  // 11/15: 미니게임은 사냥 한도와 따로 — 사냥으로 600을 채우면 별자리가 늘 0P였다. 같은 날 벌레 잡기·별자리 잇기도 게임마다 따로
  | "bugs"
  | "stars"
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
  | "monthly"
  // ── 접속 시간 보너스: 30분 구간마다 구석 창에서 받기 (lib/stayBonus.ts, /api/me/stay-bonus) ──
  | "stayBonus";

/** dailyMax = 하루에 받을 수 있는 최대 (null = 한도 없음). 11/19부터 한도는 횟수 규칙이 있는 항목에만 남았다 */
export type EarnRule = { source: EarnSource; label: string; points: number; dailyMax: number | null; note: string };

export const EARN_RULES: readonly EarnRule[] = [
  // 10번: 입장 때 자동으로 주지 않고, 그날 정해진 시간(lib/attendStay.ts) 머문 뒤 출석 달력의 오늘 칸을 눌러 받는다 (lib/calendar.ts)
  { source: "attend", label: "출석 도장", points: 10, dailyMax: 10, note: `마을에 ${ATTEND_STAY_TEXT} 머문 뒤 출석 달력의 오늘 칸을 눌러요` },
  { source: "streak", label: "7일 연속 출석", points: 30, dailyMax: 30, note: "7일 연속 도장을 찍을 때마다 받아요" },
  { source: "monthly", label: "한 달 개근", points: 200, dailyMax: 200, note: "그달 하루도 빠짐없이 도장을 찍으면 받아요" },
  // 11/19 남긴 횟수 규칙: 헌화·묘비·받은 헌화·좋아요는 다른 계정으로 주고받거나 묘비를 도배해 벌 수 있어 그대로 둔다
  { source: "flower", label: "헌화하기", points: 2, dailyMax: 20, note: "묘비마다 하루 1번, 하루 10번까지" },
  { source: "bury", label: "묘비 세우기", points: 20, dailyMax: 20, note: "하루 1개만 받아요" },
  { source: "gotFlower", label: "내 묘비가 헌화 받음", points: 1, dailyMax: 20, note: "다른 사람이 헌화할 때, 하루 20번까지" },
  { source: "presence", label: "마을에 머무르기", points: 5, dailyMax: null, note: "접속해 있으면 10분마다 받아요. 다른 일을 해도 괜찮아요." },
  // 출석 도장과 같은 머문 시간(서버의 머무르기 기록)으로 판정. 10→15→20→25P, 그다음부터는 구간마다 25P (lib/stayBonus.ts)
  { source: "stayBonus", label: "접속 시간 보너스", points: 0, dailyMax: null, note: `${STAY_BONUS_EVERY_MINUTES}분 머물 때마다 10, 15, 20, 25P로 늘어요. 구석 창의 [받기]로 받아요.` },
  // 야근 빌딩 층 포인트·주운 장비와 물약 판 값도 이 항목
  { source: "hunt", label: "사냥터", points: 0, dailyMax: null, note: "난이도와 성적에 따라 달라요. 주운 장비나 물약을 판 값도 여기에 들어가요." },
  { source: "bugs", label: "곤충 채집", points: 0, dailyMax: null, note: "마을 곤충 자리에서 잡은 만큼 받아요. 잡은 곤충은 따로 팔 수도 있어요." },
  { source: "stars", label: "별자리 잇기", points: 0, dailyMax: null, note: "성적에 따라 달라요." },
  { source: "houseLike", label: "내 집이 좋아요 받음", points: 2, dailyMax: 20, note: "다른 사람이 내 집에 좋아요를 누를 때, 하루 10번까지" },
  // 낚시·채집은 잡을 때가 아니라 NPC에게 팔 때 들어온다 (값은 lib/forage/catalog.ts)
  { source: "fish", label: "물고기 팔기", points: 0, dailyMax: null, note: "호수 낚시 잔교의 어부 영감에게 팔아요. 희귀할수록 비싸요." },
  { source: "gather", label: "채집물 팔기", points: 0, dailyMax: null, note: "오리 연못 둑의 수집가에게 팔아요" },
  // 종마다 처음 등록 보상 (lib/forage/dexReward, 값은 catalog DEX_NEW_REWARD)
  { source: "dex", label: "도감 등록 보상", points: 0, dailyMax: null, note: "새 종을 처음 올릴 때마다 3~50P, 희귀할수록 많이 받아요" },
  // 실시간 서버가 "가장 먼저 잡은 한 명"에게 서명한 증서로만 받는다 (고블린 한 마리당 한 번, lib/goblin.ts)
  { source: "goblin", label: "황금 고블린 잡기", points: 0, dailyMax: null, note: "가끔 나타나는 황금 고블린을 가장 먼저 잡으면 20~100P" },
  // 광장 소원 분수에 동전(1~5P)을 던지면 가끔 튀어 돌아온다 (하루 한 번은 lib/wish WISH_DAILY가 센다)
  { source: "wish", label: "소원 분수", points: 0, dailyMax: null, note: "광장 분수에 하루 한 번 동전을 던질 수 있어요. 가끔 포인트가 튀어 돌아와요." },
];

/** 오늘 모은 포인트(`_total`)에 들어가지 않는 항목 (출석 달력 보상·접속 시간 보너스 — 각자 따로 센다) */
const OUTSIDE_TOTAL: ReadonlySet<EarnSource> = new Set<EarnSource>(["attend", "streak", "monthly", "stayBonus"]);
/** 오늘 모은 포인트(`_total`)에 드는 항목인지 */
export const inDailyTotal = (s: EarnSource) => !OUTSIDE_TOTAL.has(s);

/**
 * 저장소·사냥터 화면에 넘기는 "한도 없음" 값 (Lua·JSON이 숫자로만 다루는 자리 — Infinity는 JSON에서 null이 된다).
 * 11/19 놀아서 버는 항목은 한도가 없어 늘 이 값이다
 */
export const NO_LIMIT = 1_000_000_000;
/** 그 항목에 하루 한도(횟수 규칙)가 남아 있는지 */
export const hasDailyMax = (s: EarnSource) => earnRule(s).dailyMax !== null;

/**
 * 지갑 상한 = 사실상 없음 (11/19 99,999에서 올렸다). 적립·환불·선물 받기·1위 보상·관리자 조정이 모두 이 값에서 자른다
 * (숫자가 넘치지 않게만 둔 값이다 — Redis Lua는 소수점 수라 2^53 안이면 정확하다).
 */
export const WALLET_MAX = 999_999_999;
/**
 * 한 번에 주고받는 양의 상한: 관리자 지급·회수 한 번, 선물 포인트, 운영자 지갑 채우기 (예전 지갑 상한 값 그대로).
 * 11/19 지갑 상한은 WALLET_MAX로 따로 뺐다.
 *
 * I0d 경제 기준 (가격을 바꿀 때 이 표를 함께 본다): 보통 유저 = 하루 한 번 20~30분 → 약 200P
 * (머무르기 10~15 · 접속 보너스 10 (30분 머물면 첫 구간) · 헌화 10~20 · 쉬움 사냥 3~4판 60~80 · 낚시 10분 80~120 · 채집 몇 곳 20~40 · 초반 도감 보상).
 *  - 기본 코디(하루권 60~100P): 첫 플레이에 하나
 *  - 영구 소장 코디(상점 코디 전부, 하루권의 4배 — protocol PERMANENT_MULTIPLIER, 7배에서 내림): 기본 코디 240~400P(1~2일) · 가장 비싼 코디(하루권 480P) 1,920P(약 10일)
 *  - 입문 펫(450P, 동물원 ZOO_PETS): 2~3번째 플레이
 *  - 프리미엄 외형 선택권(영구, protocol BODY_TIER_INFO): 일반 1,200 · 고급 2,000 · 희귀 3,200 · 전설 5,000P (약 6일 ~ 25일)
 *  - 작은 집(2,000P, housing PLOT_TIERS): 약 10일
 *  - 대저택(누적 2,000 + 3,000 + 5,000 = 10,000P): 약 50일 — 가구·외관(4배)까지 더하면 그 이상
 */
export const BALANCE_CAP = 99_999;
// 11/18 같은 IP 계정 수 한도(ATTEND_ACCOUNTS_PER_IP 3)는 없앴다 — 회사 팀·가족이 한 IP로 한다 (NC소프트에서만 150명)

/**
 * 관리자 경제 통계에서 운영자 계정 활동을 빼기 시작한 날 (KST YYYYMMDD). 이전 날짜 통계는 계정별로 나눌 수 없어 그대로라
 * 운영자 활동이 섞여 있다 (관리자 경제 탭이 안내한다)
 */
export const ECON_STAFF_EXCLUDED_FROM = "20261113";

export const earnRule = (s: EarnSource) => EARN_RULES.find((r) => r.source === s)!;

/** 개인 코드: 12자(헷갈리는 글자 0/O/1/I/L 제외), XXXX-XXXX-XXXX 형식. 이 코드를 아는 사람은 계정 주인으로 본다 */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
export function normalizeCode(raw: string): string {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : raw.trim().toUpperCase();
}

// 포인트 정책 (서버가 강제하고, UI의 ⓘ 가이드가 그대로 보여 준다). 바꾸면 가이드도 자동으로 바뀐다.
// 날짜 기준은 한국 시간(KST) 자정. 모든 아이템은 1회성(items.ts).

export type EarnSource = "attend" | "streak" | "flower" | "revive" | "bury" | "gotFlower" | "gotRevive";

export type EarnRule = { source: EarnSource; label: string; points: number; dailyMax: number; note: string };

export const EARN_RULES: readonly EarnRule[] = [
  { source: "attend", label: "출석", points: 10, dailyMax: 10, note: "하루 첫 입장 때 1번" },
  { source: "streak", label: "7일 연속 출석", points: 30, dailyMax: 30, note: "연속 7일째마다 보너스" },
  { source: "flower", label: "헌화하기", points: 2, dailyMax: 20, note: "묘비마다 하루 1번, 하루 10번까지" },
  { source: "revive", label: "살려주세요", points: 1, dailyMax: 10, note: "묘비마다 처음 1번만, 취소해도 회수 안 함" },
  { source: "bury", label: "묘비 세우기", points: 20, dailyMax: 20, note: "하루 1개분만 지급" },
  { source: "gotFlower", label: "내 묘비가 헌화 받음", points: 1, dailyMax: 20, note: "다른 사람이 헌화할 때" },
  { source: "gotRevive", label: "내 묘비가 살려주세요 받음", points: 1, dailyMax: 20, note: "다른 사람이 처음 눌렀을 때" },
];

/** 하루에 쌓을 수 있는 전체 포인트 (위 항목 한도의 합보다 작게 잡아 하루 상한을 둔다) */
export const DAILY_EARN_CAP = 100;
/** 지갑 상한 */
export const BALANCE_CAP = 9_999;
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

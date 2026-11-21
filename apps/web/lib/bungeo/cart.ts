import { addDays, daysBetween, dayStartMs, gameDay } from "../gameDay";

// 11/22 「골목 붕어빵 수레」 (이스터에그 한정 상점) 순수 규칙 — 서버·화면 공용 (시험 cart.test).
//  - 언제: 한국 시각 밤 10시 ~ 새벽 2시, 사흘에 한 번. 게임 날짜(새벽 5시에 바뀌는 날짜 — lib/gameDay) 기준이라
//    밤 10시 ~ 새벽 2시는 같은 게임 날짜 안이다. 첫날 20261122, 그 뒤 3일 간격(20261125, 20261128 …), 마지막은 20270228 게임 날짜까지
//  - 어디서: 메인 마을 3번지 집 위쪽 골목 (BUNGEO_CART — 자리는 시안 작업에서 정하는 중이라 상수 하나로만 둔다)
//  - 지도·가이드·FAQ·개발자 노트·마을 소식에는 자리·일정을 적지 않는다. 실마리는 소원 분수 운세 한 줄뿐 (lib/wish — 여는 게임 날짜에만)
//  - 일정 목록(다음 출현)은 운영자 화면에만 (GET /api/bungeo/schedule — 운영자 계정만, 아니면 403)

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;

/** 처음 여는 게임 날짜 · 마지막으로 열 수 있는 게임 날짜 · 간격(일) */
export const BUNGEO_FIRST_DAY = "20261122";
export const BUNGEO_LAST_DAY = "20270228";
export const BUNGEO_EVERY_DAYS = 3;
/** 3일 간격과 따로 여는 게임 날짜 (11/22 운영자: 첫 출현 전날 밤 22:00~02:00에도 바로 열기 — 게임 날짜 20261121) */
export const BUNGEO_EXTRA_DAYS: readonly string[] = ["20261121"];
/** 여는 시각 · 닫는 시각: 게임 날짜 시작(새벽 5시)부터 몇 시간 뒤 (밤 10시 = +17시간, 새벽 2시 = +21시간) */
export const BUNGEO_OPEN_HOUR = 22;
export const BUNGEO_CLOSE_HOUR = 2;
const OPEN_AFTER_MS = 17 * HOUR_MS;
const CLOSE_AFTER_MS = 21 * HOUR_MS;

/**
 * 수레 자리 (메인 마을 월드 좌표 — 수레 바닥 가운데). 3번지 집 필지(protocol world houseLot(3): 좌상단 1272,216 · 128×104) 위쪽 골목.
 * 11/22 시안 추천 「단풍나무 뒤 담 밑」 (북쪽 흙길 y 176~208에서 단풍 사이로 몇 걸음, 동쪽 담 x 1408 바로 왼쪽). 자리를 옮기면 이 한 줄만 바꾼다
 */
export const BUNGEO_CART = { x: 1384, y: 122 } as const;
/** 수레 앞에서 말을 걸 수 있는 거리 (px) */
export const BUNGEO_TALK_RADIUS = 40;

/** 그 게임 날짜(YYYYMMDD)에 수레가 나오는지 */
export function isBungeoDay(day: string): boolean {
  if (BUNGEO_EXTRA_DAYS.includes(day)) return true;
  if (day < BUNGEO_FIRST_DAY || day > BUNGEO_LAST_DAY) return false;
  return daysBetween(BUNGEO_FIRST_DAY, day) % BUNGEO_EVERY_DAYS === 0;
}

/** 그 게임 날짜의 여는·닫는 시각 (ms) */
export function bungeoWindow(day: string): { opensAt: number; closesAt: number } {
  const start = dayStartMs(day);
  return { opensAt: start + OPEN_AFTER_MS, closesAt: start + CLOSE_AFTER_MS };
}

/** 지금 수레가 열려 있는지 (보이는지·살 수 있는지 — 서버 구매 검증도 이것) */
export function bungeoOpen(now: number): boolean {
  const day = gameDay(now);
  if (!isBungeoDay(day)) return false;
  const { opensAt, closesAt } = bungeoWindow(day);
  return now >= opensAt && now < closesAt;
}

export type BungeoSlot = { day: string; opensAt: number; closesAt: number };

/** now 다음(지금 열려 있으면 이번 것부터) 출현 n번 — 운영자 화면 전용 (일반 API 응답에는 싣지 않는다) */
export function bungeoUpcoming(now: number, n = 5): BungeoSlot[] {
  const out: BungeoSlot[] = [];
  for (const d of BUNGEO_EXTRA_DAYS) {
    const w = bungeoWindow(d);
    if (w.closesAt > now && d < BUNGEO_FIRST_DAY) out.push({ day: d, ...w });
  }
  let day = gameDay(now);
  if (day < BUNGEO_FIRST_DAY) day = BUNGEO_FIRST_DAY;
  else {
    const off = daysBetween(BUNGEO_FIRST_DAY, day) % BUNGEO_EVERY_DAYS;
    if (off) day = addDays(day, BUNGEO_EVERY_DAYS - off);
  }
  while (out.length < n && day <= BUNGEO_LAST_DAY) {
    const w = bungeoWindow(day);
    if (w.closesAt > now) out.push({ day, ...w });
    day = addDays(day, BUNGEO_EVERY_DAYS);
  }
  return out;
}

// ── 판매 목록 (값 고정 · 영구 소장만 · 할인 없음) ──

export type BungeoKind = "cosmetic" | "body";
export type BungeoGoods = { kind: BungeoKind; id: string; price: number; group: string };

/** 수레 판매 목록 (화면 순서) — 꾸미기는 protocol items alley (영구 값 = price × 4), 외형은 constants ALLEY_BODIES */
export const BUNGEO_GOODS: readonly BungeoGoods[] = [
  { kind: "body", id: "vendor", price: 15000, group: "외형" },
  { kind: "cosmetic", id: "kc_cap", price: 6000, group: "캠퍼스 후드핏" },
  { kind: "cosmetic", id: "kc_hoodie", price: 10000, group: "캠퍼스 후드핏" },
  { kind: "cosmetic", id: "kc_phones", price: 5000, group: "캠퍼스 후드핏" },
  { kind: "cosmetic", id: "kc_icecoffee", price: 8000, group: "캠퍼스 후드핏" },
  { kind: "cosmetic", id: "kc_sneaker", price: 5000, group: "캠퍼스 후드핏" },
  { kind: "cosmetic", id: "kd_beanie", price: 6000, group: "겨울 데이트룩" },
  { kind: "cosmetic", id: "kd_coat", price: 10000, group: "겨울 데이트룩" },
  { kind: "cosmetic", id: "kd_muffler", price: 5000, group: "겨울 데이트룩" },
  { kind: "cosmetic", id: "kd_bungeo", price: 8000, group: "겨울 데이트룩" },
  { kind: "cosmetic", id: "kd_lights", price: 8000, group: "겨울 데이트룩" },
  { kind: "cosmetic", id: "kn_cable", price: 10000, group: "낱개 겉옷" },
  { kind: "cosmetic", id: "kn_fleece", price: 10000, group: "낱개 겉옷" },
];
export const bungeoGoods = (id: string) => BUNGEO_GOODS.find((g) => g.id === id);

// ── 문구 (짧은 해요체 — 자리·일정은 쓰지 않는다) ──
export const BUNGEO_TITLE = "골목 붕어빵 수레";
export const BUNGEO_CLOSED_MSG = "붕어빵 수레가 떠났어요. 언젠가 밤에 또 올지도 몰라요.";

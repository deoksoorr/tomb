import type { MapId } from "@tomb/protocol";
import { addDays, daysBetween, dayStartMs, gameDay } from "../gameDay";

// 11/22 「골목 붕어빵 수레」 (이스터에그 한정 상점) 순수 규칙 — 서버·화면 공용 (시험 cart.test).
//  - 언제: 한국 시각 밤 10시 ~ 새벽 2시, 사흘에 한 번. 게임 날짜(새벽 5시에 바뀌는 날짜 — lib/gameDay) 기준이라
//    밤 10시 ~ 새벽 2시는 같은 게임 날짜 안이다. 첫날 20261122, 그 뒤 3일 간격(20261125, 20261128 …), 마지막은 20270228 게임 날짜까지
//  - 어디서: 회차마다 BUNGEO_SPOTS 중 한 곳 (11/23 — 게임 날짜를 씨앗으로 정해지고 바로 앞 회차와 같은 자리는 안 나온다. Redis 없음)
//    그 자리 맵(마을·바닷가·캠핑장)에서만 보이고, 서버 구매도 그 맵·그 자리 가까이(BUNGEO_BUY_RADIUS)에서만
//  - 지도·가이드·FAQ·개발자 노트·마을 소식·소원 분수 운세 어디에도 자리·일정·실마리를 적지 않는다 (11/23 운세 실마리도 없앰)
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
 * 수레 자리: 어느 맵 · 월드 좌표(수레 바닥 가운데) · 운영자 일정 카드에 보이는 자리 이름 (일반 화면·문서에는 안 쓴다).
 * from = 이 게임 날짜부터 뽑기에 넣는다 (자리를 새로 더해도 그 전 회차 자리는 그대로 — 캠핑장 자리는 from을 달아 더한다)
 */
export type BungeoSpot = {
  readonly id: string;
  readonly map: MapId;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly from?: string;
  /** 붕어빵 장수 자리 (수레 바닥 기준). 없으면 오른쪽 앞(BUNGEO_VENDOR_DX·DY) — 수레 앞이 좁은 자리는 수레 오른쪽 옆에 세운다 */
  readonly vendor?: { readonly dx: number; readonly dy: number };
};

/**
 * 11/23 수레 자리 (회차마다 무작위 — bungeoSpotOf). 자리를 더할 때는 { id, map, x, y, name, from } 한 줄만 (화면·서버는 그대로 따라간다).
 *  - 마을: 북동쪽 연못가 단풍나무 뒤 담 밑(옛 고정 자리) · 야근 빌딩과 등대 사이 뒷골목 · 옛 묘역 뒤 철책 밑
 *  - 바닷가(protocol sea 좌표): 1번 터 울타리 위 풀밭 · 7번 터 아래 서쪽 백사장 (야자수 앞, 물가 갯바위 위쪽)
 */
export const BUNGEO_SPOTS: readonly BungeoSpot[] = [
  { id: "maple", map: "village", x: 1384, y: 122, name: "북동쪽 연못가 단풍나무 뒤 담 밑" },
  { id: "alley", map: "village", x: 1032, y: 86, name: "야근 빌딩과 등대 사이 뒷골목" },
  // 11/23 (160,84)는 첫 줄 셋째 묘비(graveSlot 2 — 160,72)를 덮어서, 북쪽 철책 바로 밑 가운데 자갈 통로 머리로 (묘비 두 줄 사이 32px 통로)
  { id: "fence", map: "village", x: 128, y: 62, name: "옛 묘역 뒤 철책 밑" },
  { id: "seaLot1", map: "sea", x: 334, y: 116, name: "바닷가 1번 터 위" },
  { id: "seaRocks", map: "sea", x: 130, y: 452, name: "바닷가 7번 터 아래 해안가 갯바위 근처" },
  // 11/26 캠핑장 (폭포 계곡 개편 지도 좌표) — 저수지 둘레 길 남동쪽 모퉁이 밑 눈밭(장수는 수레 왼쪽 옆) · 놀이터 광장(트램펄린과 눈썰매 사이)
  { id: "campResSE", map: "camp", x: 1200, y: 530, name: "캠핑장 저수지 남동쪽 모퉁이", from: "20261127", vendor: { dx: -32, dy: 2 } },
  { id: "campPlaza", map: "camp", x: 224, y: 454, name: "캠핑장 놀이터 광장", from: "20261127" },
];
/** 옛 고정 자리 (자리 목록 맨 앞) */
export const BUNGEO_CART: BungeoSpot = BUNGEO_SPOTS[0];
/** 수레 앞에서 말을 걸 수 있는 거리 (px) */
export const BUNGEO_TALK_RADIUS = 40;
/** 서버 구매: 수레 바닥 가운데에서 이만큼 안에 서 있어야 산다 (말 걸기 자리 + 걸음 여유) */
export const BUNGEO_BUY_RADIUS = 64;
export const BUNGEO_FAR_MSG = "수레 가까이에서 살 수 있어요.";

/** 붕어빵 장수 자리 (수레 바닥 기준 — 수레 오른쪽 앞, 시안 그대로) */
export const BUNGEO_VENDOR_DX = 10;
export const BUNGEO_VENDOR_DY = 28;

/** 붕어빵 장수 발 자리 (월드 좌표) */
export function bungeoVendorAt(spot: { x: number; y: number; vendor?: { dx: number; dy: number } }): { x: number; y: number } {
  const v = spot.vendor ?? { dx: BUNGEO_VENDOR_DX, dy: BUNGEO_VENDOR_DY };
  return { x: spot.x + v.dx, y: spot.y + v.dy };
}

/** 말 걸기 자리 (장면마다 제 상호작용 모양으로 바꿔 넣는다 — game/world/BungeoCartView) */
export type BungeoTalk = { id: string; x: number; y: number; r: number; label: string };
/** 수레 말 걸기 자리 (붕어빵 장수 앞 · 수레 앞판 앞) */
export function bungeoTalks(spot: { x: number; y: number; vendor?: { dx: number; dy: number } }): BungeoTalk[] {
  const label = "붕어빵 장수에게 말 걸기";
  const v = bungeoVendorAt(spot);
  return [
    { id: "bungeo", x: v.x, y: v.y + 12, r: 18, label },
    { id: "bungeo2", x: spot.x - 6, y: spot.y + 12, r: BUNGEO_TALK_RADIUS / 2, label },
  ];
}
/** 몸 충돌 상자 (수레 몸통 · 붕어빵 장수 발치) — 열린 동안만 켠다 */
export function bungeoColliders(spot: { x: number; y: number; vendor?: { dx: number; dy: number } }): { x: number; y: number; w: number; h: number }[] {
  const { x, y } = spot;
  const v = bungeoVendorAt(spot);
  return [
    { x: x - 23, y: y - 12, w: 46, h: 12 },
    { x: v.x - 6, y: v.y - 6, w: 12, h: 6 },
  ];
}

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

/** 수레가 나오는 게임 날짜 전부 (오름차순 — 따로 여는 날 포함) */
let daysMemo: string[] | null = null;
export function bungeoDays(): readonly string[] {
  if (daysMemo) return daysMemo;
  const out = new Set<string>(BUNGEO_EXTRA_DAYS);
  for (let d = BUNGEO_FIRST_DAY; d <= BUNGEO_LAST_DAY; d = addDays(d, BUNGEO_EVERY_DAYS)) out.add(d);
  daysMemo = [...out].sort();
  return daysMemo;
}

/** FNV-1a 32비트 (씨앗 → 정수) */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 정해 둔 회차 (게임 날짜 → 자리 id). 뽑기 대신 이 자리 */
export const BUNGEO_FIXED_DAYS: Readonly<Record<string, string>> = { "20261128": "campPlaza" };
/** 이 게임 날짜 다음 회차부터는 맵을 먼저 고르고(마을·바닷가·캠핑장 고르게, 바로 앞 회차와 다른 맵) 그 맵 안에서 자리를 고른다. 이날까지는 예전 규칙 그대로 */
export const BUNGEO_MAP_RULE_AFTER = "20261125";
/** 맵 먼저 → 그 맵 자리 (바로 앞 회차와 같은 맵은 빼고, 그 맵에서 지난번에 쓴 자리도 빼고 — 자리가 고루 돈다) */
function pickByMap(day: string, pool: readonly BungeoSpot[], prev: BungeoSpot | null, lastInMap: ReadonlyMap<string, string>): BungeoSpot | undefined {
  const maps = [...new Set(pool.map((s) => s.map))];
  const mapCand = prev && maps.length > 1 ? maps.filter((m) => m !== prev.map) : maps;
  if (!mapCand.length) return undefined;
  const map = mapCand[mix32(fnv1a(`bungeo:${day}`)) % mapCand.length];
  const inMap = pool.filter((s) => s.map === map && s.id !== prev?.id);
  const fresh = inMap.filter((s) => s.id !== lastInMap.get(map));
  const spots = fresh.length ? fresh : inMap;
  return spots.length ? spots[mix32(fnv1a(`bungeo:${day}:spot`)) % spots.length] : undefined;
}
/** 32비트 섞기 (FNV 아래 비트가 고르지 않아 작은 수로 나눌 때 한쪽으로 쏠린다) */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
const spotMemo = new Map<string, BungeoSpot>();
/** 그날 뽑을 수 있는 자리 (from이 그날 이하) */
const spotPool = (day: string) => BUNGEO_SPOTS.filter((s) => !s.from || s.from <= day);
/**
 * 그 게임 날짜의 수레 자리 — 씨앗 = 게임 날짜 (서버·화면·운영자 일정이 모두 같은 값). 바로 앞 회차와 같은 자리는 빼고 뽑는다.
 * 정해 둔 회차(BUNGEO_FIXED_DAYS)는 그 자리. BUNGEO_MAP_RULE_AFTER 다음 회차부터는 맵을 먼저 고른다 (바로 앞 회차와 다른 맵 — pickByMap).
 * 수레가 안 나오는 날이면 씨앗만으로 뽑은 자리 (쓰지 않는다)
 */
export function bungeoSpotOf(day: string): BungeoSpot {
  const hit = spotMemo.get(day);
  if (hit) return hit;
  const days = bungeoDays();
  if (!days.includes(day)) {
    const pool = spotPool(day);
    return pool[fnv1a(`bungeo:${day}`) % pool.length];
  }
  let prev: BungeoSpot | null = null;
  const lastInMap = new Map<string, string>();
  for (const d of days) {
    let pick: BungeoSpot | undefined = spotMemo.get(d);
    if (!pick) {
      const fixed = BUNGEO_FIXED_DAYS[d];
      const pool = spotPool(d);
      const prevId: string | null = prev ? prev.id : null;
      if (fixed) pick = BUNGEO_SPOTS.find((s) => s.id === fixed);
      else if (d > BUNGEO_MAP_RULE_AFTER) pick = pickByMap(d, pool, prev, lastInMap);
      if (!pick) {
        const cand: BungeoSpot[] = prevId && pool.length > 1 ? pool.filter((s) => s.id !== prevId) : pool;
        pick = cand[fnv1a(`bungeo:${d}`) % cand.length];
      }
      spotMemo.set(d, pick);
    }
    if (d === day) return pick;
    prev = pick;
    lastInMap.set(pick.map, pick.id);
  }
  return BUNGEO_CART;
}

/** 지금 열려 있는 회차의 자리 (닫혀 있으면 null) */
export function bungeoOpenSpot(now: number): BungeoSpot | null {
  return bungeoOpen(now) ? bungeoSpotOf(gameDay(now)) : null;
}

/** 이미 연 적 있는 가장 최근 회차의 자리 (닫힌 동안 바닥에 바퀴 자국을 남길 곳 — 아직 한 번도 안 열었으면 null) */
export function bungeoLastSpot(now: number): BungeoSpot | null {
  const days = bungeoDays();
  for (let i = days.length - 1; i >= 0; i--) if (bungeoWindow(days[i]).opensAt <= now) return bungeoSpotOf(days[i]);
  return null;
}

/** 서버 구매 자리 확인: 지금 회차 자리와 같은 맵이고 수레에서 BUNGEO_BUY_RADIUS 안인지 */
export function bungeoNear(now: number, at: { map?: string; x?: number; y?: number } | null | undefined): boolean {
  const spot = bungeoOpenSpot(now);
  if (!spot || !at || at.map !== spot.map || typeof at.x !== "number" || typeof at.y !== "number") return false;
  return Math.hypot(at.x - spot.x, at.y - spot.y) <= BUNGEO_BUY_RADIUS;
}

/** 출현 한 회차: 게임 날짜 · 여는·닫는 시각 · 그 회차 자리 이름 (11/23 회차마다 무작위 — bungeoSpotOf) */
export type BungeoSlot = { day: string; opensAt: number; closesAt: number; spot: string; map: MapId };

/** 11/22 수레가 열린 밤, 채팅에 지나가는 사람처럼 외치는 이름 (진짜 계정이 아니다 — 각 화면이 정해진 시각에 스스로 띄운다).
 *  11/23 마을·바닷가·캠핑장 어느 맵에 있어도 들린다 (말에 자리를 담지 않는다) */
export const BUNGEO_CALLER = "붕세권주민";
/** 외치는 말: 여는 시각부터 2시간마다 차례로 (22:00 · 00:00) */
export const BUNGEO_CALLS: readonly string[] = ["붕어빵 사세요~ 팥붕 슈붕 다 있어요~", "오늘 밤만 장사해요~ 붕어빵 식기 전에 오세요~~"];
const CALL_EVERY_MS = 2 * HOUR_MS;

/** 그 게임 날짜에 외치는 시각과 말 (여는 날이 아니면 빈 목록) */
export function bungeoCalls(day: string): { at: number; text: string; key: string }[] {
  if (!isBungeoDay(day)) return [];
  const { opensAt, closesAt } = bungeoWindow(day);
  const out: { at: number; text: string; key: string }[] = [];
  for (let i = 0, at = opensAt; at < closesAt; i++, at += CALL_EVERY_MS) out.push({ at, text: BUNGEO_CALLS[i % BUNGEO_CALLS.length], key: `bungeo:${day}:${i}` });
  return out;
}

/** 정각이 지난 뒤 이만큼 안에 화면이 켜져 있으면 띄운다 (그 뒤에 들어온 사람에게는 지난 외침을 띄우지 않는다) */
export const BUNGEO_CALL_LATE_MS = 90_000;
/** 지금 띄울 외침 (맵과 상관없다 — 마을·바닷가·캠핑장 어디서든 같은 줄, 같은 key는 한 번만) */
export function bungeoCallsDue(now: number): { text: string; key: string }[] {
  return bungeoCalls(gameDay(now))
    .filter((c) => now >= c.at && now < c.at + BUNGEO_CALL_LATE_MS)
    .map(({ text, key }) => ({ text, key }));
}

/** now 다음(지금 열려 있으면 이번 것부터) 출현 n번 — 운영자 화면 전용 (일반 API 응답에는 싣지 않는다) */
export function bungeoUpcoming(now: number, n = 5): BungeoSlot[] {
  const out: BungeoSlot[] = [];
  for (const d of BUNGEO_EXTRA_DAYS) {
    const w = bungeoWindow(d);
    if (w.closesAt > now && d < BUNGEO_FIRST_DAY) out.push({ day: d, ...w, spot: bungeoSpotOf(d).name, map: bungeoSpotOf(d).map });
  }
  let day = gameDay(now);
  if (day < BUNGEO_FIRST_DAY) day = BUNGEO_FIRST_DAY;
  else {
    const off = daysBetween(BUNGEO_FIRST_DAY, day) % BUNGEO_EVERY_DAYS;
    if (off) day = addDays(day, BUNGEO_EVERY_DAYS - off);
  }
  while (out.length < n && day <= BUNGEO_LAST_DAY) {
    const w = bungeoWindow(day);
    if (w.closesAt > now) out.push({ day, ...w, spot: bungeoSpotOf(day).name, map: bungeoSpotOf(day).map });
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

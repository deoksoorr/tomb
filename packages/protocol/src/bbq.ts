// 11/15 언젠가 캠핑장 야외 바베큐장: 먹거리·마실 거리를 싸게 사 먹으면 재미 효과가 붙는다 (능력치 변화 없음).
// 웹(/api/camp/bbq)이 포인트를 쓰고 증서(grants "bbq")를 주면, 실시간 서버가 검증해 같은 맵 사람에게 알린다 (늦게 온 사람은 PeerInfo).
// 효과는 세 갈래로 따로 겹친다 (한 갈래 안에서만 새 것이 덮어쓴다):
//  - grow  (먹거리 고기·간식): 잠깐 캐릭터가 커진다 — PeerInfo.bbq
//  - speed (캠핑 커피·꿀호떡·번개 닭꼬치): 마을·캠핑장에서 걸음이 빨라진다 (사냥터 제외) — PeerInfo.spd. 번개 닭꼬치는 몸 뒤로 잔상이 따라온다
//  - drunk (맥주·소주·막걸리): 취기가 1씩 쌓이고 10분에 1씩 깬다 — PeerInfo.drunk (단계·시각)
//  - sober (컨디숑): 취기를 1 내린다 (깨는 시계는 지금부터 다시)
// 파는 곳은 둘: 먹거리는 바베큐 그릴, 마실 거리는 음료 자판기 (bbqStand).
// 커진 동안(커지기 배율 > 1)에는 타는 것을 모두 못 탄다 (bbqBig·RIDE_SPOT_KINDS — 서버 onSit·onRide도 같은 규칙).
// 하루 한도는 없다 (포인트로만 산다). 취기는 최대 DRUNK_MAX에서 멈추고 계속 마시면 깨는 시계만 다시 시작한다.
// 옛 클라이언트는 모르는 t·필드라 무시한다.

export type BbqKind = "grow" | "speed" | "drunk" | "sober";
export type BbqCat = "food" | "drink";
export type BbqItemId = "wholepork" | "tomahawk" | "pork" | "sausage" | "marsh" | "hotteok" | "zap" | "coffee" | "beer" | "soju" | "makgeolli" | "hangover";
export type BbqItem = {
  id: BbqItemId;
  name: string;
  /** 메뉴 창의 칸 (먹거리·마실 거리) */
  cat: BbqCat;
  kind: BbqKind;
  /** 값 (포인트) */
  price: number;
  /** grow: 커지는 배율 */
  scale: number;
  /** speed: 걸음 배율 (1 = 그대로) */
  speed: number;
  /** 둘레에 은은하게 빛나는 색 */
  tint: number;
  /** grow·speed 효과 시간 (ms). drunk는 단계로 정한다 (DRUNK_STEP_MS) */
  ms: number;
  /** speed: 걸을 때 몸 뒤로 잔상이 따라온다 */
  trail?: boolean;
  /** 먹을 때·마실 때 말풍선 */
  bite: string;
  /** 메뉴 창 한 줄 소개 (해요체, 맛 이야기만 — 효과·시간은 창이 덧붙인다) */
  note: string;
};

const MIN = 60_000;
export const BBQ_MENU: readonly BbqItem[] = [
  // ── 먹거리 ──
  { id: "wholepork", name: "통삼겹 바비큐", cat: "food", kind: "grow", price: 30, scale: 3, speed: 1, tint: 0xff6a3a, ms: 3 * MIN, bite: "와앙! 쿵!", note: "통째로 훈연한 어마어마한 고기예요." },
  { id: "tomahawk", name: "도끼 스테이크", cat: "food", kind: "grow", price: 22, scale: 2, speed: 1, tint: 0xe0485a, ms: 4 * MIN, bite: "한 입! 우적우적", note: "뼈째 구운 커다란 스테이크예요." },
  { id: "pork", name: "삼겹살", cat: "food", kind: "grow", price: 18, scale: 1.5, speed: 1, tint: 0xff9a7a, ms: 5 * MIN, bite: "한 입! 지글지글", note: "노릇하게 구운 삼겹살이에요." },
  { id: "sausage", name: "소시지", cat: "food", kind: "grow", price: 14, scale: 1.38, speed: 1, tint: 0xffc860, ms: 4 * MIN, bite: "한 입! 톡 터져요", note: "톡 터지는 소시지예요." },
  { id: "marsh", name: "마시멜로 꼬치", cat: "food", kind: "grow", price: 10, scale: 1.25, speed: 1, tint: 0xf4e8ff, ms: 3 * MIN, bite: "한 입! 말랑말랑", note: "달콤한 후식이에요." },
  { id: "hotteok", name: "꿀호떡", cat: "food", kind: "speed", price: 10, scale: 1, speed: 1.12, tint: 0xf0b050, ms: 7 * MIN, bite: "한 입! 꿀이 주르륵", note: "단 걸 먹으면 힘이 나요." },
  { id: "zap", name: "번개 닭꼬치", cat: "food", kind: "speed", price: 18, scale: 1, speed: 1.35, tint: 0x6ad8ff, ms: 4 * MIN, trail: true, bite: "한 입! 찌릿찌릿", note: "혀가 찌릿한 번개 양념 꼬치예요." },
  // ── 마실 거리 ──
  { id: "coffee", name: "캠핑 커피", cat: "drink", kind: "speed", price: 8, scale: 1, speed: 1.2, tint: 0xc89060, ms: 10 * MIN, bite: "후~ 정신이 번쩍", note: "버너로 내린 커피예요." },
  { id: "beer", name: "맥주", cat: "drink", kind: "drunk", price: 12, scale: 1, speed: 1, tint: 0xf0c040, ms: 0, bite: "캬~ 시원해요", note: "시원한 캔맥주예요." },
  { id: "soju", name: "소주", cat: "drink", kind: "drunk", price: 15, scale: 1, speed: 1, tint: 0x9ad8c0, ms: 0, bite: "캬~ 쓰다", note: "초록 병 한 잔이에요." },
  { id: "makgeolli", name: "막걸리", cat: "drink", kind: "drunk", price: 14, scale: 1, speed: 1, tint: 0xf0ead8, ms: 0, bite: "캬~ 걸쭉해요", note: "사발에 따른 막걸리예요." },
  { id: "hangover", name: "컨디숑", cat: "drink", kind: "sober", price: 10, scale: 1, speed: 1, tint: 0x8ac04a, ms: 0, bite: "크으~ 살 것 같아요", note: "술 깨는 작은 병 음료예요." },
];
/** 파는 곳: 바베큐 그릴(먹거리)·음료 자판기(마실 거리) */
export type BbqStand = "grill" | "vending";
export const BBQ_STANDS: readonly BbqStand[] = ["grill", "vending"];
export function bbqStand(m: BbqItem): BbqStand {
  return m.cat === "drink" ? "vending" : "grill";
}

/** 같은 사람이 연달아 먹는 최소 간격 (서버 중계) */
export const BBQ_INTERVAL_MS = 2_000;

const IDS: readonly string[] = BBQ_MENU.map((m) => m.id);
export const isBbqId = (v: unknown): v is BbqItemId => typeof v === "string" && IDS.includes(v);
export function bbqItem(id: unknown): BbqItem | undefined {
  return BBQ_MENU.find((m) => m.id === id);
}

/** 지금 커져 있는·빨라진 효과 (PeerInfo.bbq·spd). u = 끝나는 시각 (epoch ms) */
export type BbqEffect = { i: BbqItemId; u: number };
export const isBbqEffect = (v: unknown): v is BbqEffect =>
  !!v && typeof v === "object" && isBbqId((v as BbqEffect).i) && typeof (v as BbqEffect).u === "number" && Number.isFinite((v as BbqEffect).u);
/** 그 효과가 지금 켜져 있는지 */
export function bbqActive(e: BbqEffect | null | undefined, now: number): e is BbqEffect {
  return !!e && e.u > now;
}

// ── 취기 ──
/** 취기 최대 단계 */
export const DRUNK_MAX = 5;
/** 이만큼 지날 때마다 취기가 1씩 깬다 */
export const DRUNK_STEP_MS = 10 * MIN;
/** 취기: at(epoch ms) 무렵 lv단계였다 → 지금 단계는 drunkLevel */
export type DrunkState = { lv: number; at: number };
export const isDrunkState = (v: unknown): v is DrunkState =>
  !!v && typeof v === "object" && Number.isInteger((v as DrunkState).lv) && (v as DrunkState).lv >= 1 && (v as DrunkState).lv <= DRUNK_MAX && typeof (v as DrunkState).at === "number" && Number.isFinite((v as DrunkState).at);
/** 지금 취기 단계 (0 = 다 깼다) */
export function drunkLevel(s: DrunkState | null | undefined, now: number): number {
  if (!s) return 0;
  return Math.max(0, Math.min(DRUNK_MAX, s.lv - Math.floor(Math.max(0, now - s.at) / DRUNK_STEP_MS)));
}
/** 다 깨는 시각 */
export function drunkUntil(s: DrunkState): number {
  return s.at + s.lv * DRUNK_STEP_MS;
}
/** 한 잔 더 마셨다: 지금 단계 + 1 (최대 DRUNK_MAX), 깨는 시계는 지금부터 */
export function drinkOne(prev: DrunkState | null | undefined, now: number): DrunkState {
  return { lv: Math.min(DRUNK_MAX, drunkLevel(prev, now) + 1), at: now };
}

/** 지금 커진 배율 (커지기 효과가 없거나 끝났으면 1) */
export function bbqBig(e: BbqEffect | null | undefined, now: number): number {
  return bbqActive(e, now) ? (bbqItem(e.i)?.scale ?? 1) : 1;
}

/** 컨디숑 한 병: 지금 단계 - 1, 깨는 시계는 지금부터. 이미 다 깼으면 null (마실 필요가 없다) */
export function soberOne(prev: DrunkState | null | undefined, now: number): DrunkState | null {
  const lv = drunkLevel(prev, now);
  return lv > 0 ? { lv: lv - 1, at: now } : null;
}

/** 몸이 쿵 하고 커지는 큰 메뉴 (먹을 때 땅 울림·먼지) */
export const BBQ_THUD_SCALE = 2.5;

/** 걸음 배율 (빨라지는 효과가 켜져 있으면). 사냥터 밖(마을·캠핑장)에서만 쓴다 */
export function bbqSpeed(e: BbqEffect | null | undefined, now: number): number {
  return bbqActive(e, now) ? (bbqItem(e.i)?.speed ?? 1) : 1;
}

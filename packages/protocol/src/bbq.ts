// 11/15 언젠가 캠핑장 야외 바베큐장: 고기를 싸게 사 먹으면 잠깐 캐릭터가 커진다 (재미용, 능력치 변화 없음).
// 웹(/api/camp/bbq)이 포인트를 쓰고 증서(grants "bbq")를 주면, 실시간 서버가 검증해 같은 맵 사람에게 알린다 (늦게 온 사람은 PeerInfo.bbq).
// 옛 클라이언트는 모르는 t·필드라 무시한다 (그 화면에서는 보통 크기로 보인다).

export type BbqItemId = "pork" | "sausage" | "marsh";
export type BbqItem = {
  id: BbqItemId;
  name: string;
  /** 값 (포인트) */
  price: number;
  /** 커지는 배율 */
  scale: number;
  /** 둘레에 은은하게 빛나는 색 */
  tint: number;
  /** 커져 있는 시간 (ms) */
  ms: number;
  /** 먹을 때 말풍선 */
  bite: string;
  /** 메뉴 창 한 줄 소개 (해요체) */
  note: string;
};

export const BBQ_MENU: readonly BbqItem[] = [
  { id: "pork", name: "삼겹살", price: 18, scale: 1.5, tint: 0xff9a7a, ms: 90_000, bite: "한 입! 지글지글", note: "제일 든든해요. 가장 크게 오래 커져요." },
  { id: "sausage", name: "소시지", price: 14, scale: 1.38, tint: 0xffc860, ms: 75_000, bite: "한 입! 톡 터져요", note: "톡 터지는 소시지예요. 꽤 커져요." },
  { id: "marsh", name: "마시멜로 꼬치", price: 10, scale: 1.25, tint: 0xf4e8ff, ms: 60_000, bite: "한 입! 말랑말랑", note: "달콤한 후식이에요. 살짝 커져요." },
];
/** 하루(게임 날짜, 새벽 5시에 바뀐다) 사 먹을 수 있는 횟수 */
export const BBQ_DAILY = 5;
/** 같은 사람이 연달아 먹는 최소 간격 (서버 중계) */
export const BBQ_INTERVAL_MS = 2_000;

export const isBbqId = (v: unknown): v is BbqItemId => v === "pork" || v === "sausage" || v === "marsh";
export function bbqItem(id: unknown): BbqItem | undefined {
  return BBQ_MENU.find((m) => m.id === id);
}

/** 지금 커져 있는 효과 (PeerInfo.bbq). u = 끝나는 시각 (epoch ms) */
export type BbqEffect = { i: BbqItemId; u: number };
export const isBbqEffect = (v: unknown): v is BbqEffect =>
  !!v && typeof v === "object" && isBbqId((v as BbqEffect).i) && typeof (v as BbqEffect).u === "number" && Number.isFinite((v as BbqEffect).u);
/** 그 효과가 지금 켜져 있는지 */
export function bbqActive(e: BbqEffect | null | undefined, now: number): e is BbqEffect {
  return !!e && e.u > now;
}

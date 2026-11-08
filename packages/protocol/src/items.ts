// 상점 아이템 카탈로그 (web 구매·사용, game 렌더링, realtime 폭죽 검증이 함께 쓴다).
// 모든 아이템은 "1회성"이다: 사면 가방에 1개가 들어가고, 쓰면 사라진다.
//  - 폭죽: 쏘는 순간 소모. 같은 채널 모두에게 보이고 들린다.
//  - 캐릭터 꾸미기: 착용하는 순간 소모, 24시간 동안 유지된다(같은 부위는 마지막 것으로 교체).
//  - 묘비 꾸미기: 내 묘비 하나에 놓는 순간 소모, 7일 동안 유지된다(묘비당 최대 3개).
//  - 묘비 디자인권: 묘비를 세우거나 내 묘비의 디자인을 바꿀 때 소모, 그 묘비는 그 디자인으로 계속 남는다.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type ItemKind = "firework" | "cosmetic" | "decor" | "graveStyle";
export type CosmeticSlot = "head" | "hand" | "aura" | "neck" | "back" | "pet" | "feet";

export type ItemDef = {
  id: string;
  kind: ItemKind;
  name: string;
  desc: string;
  price: number;
  /** 캐릭터 꾸미기 부위 */
  slot?: CosmeticSlot;
  /** 효과 지속 시간 (꾸미기류) */
  durationMs?: number;
  /** 폭죽 세기 1~5: 비쌀수록 크게, 넓게, 오래 터진다 (게임이 반경·발수·지속을 이 값으로 정한다) */
  power?: number;
};

export const COSMETIC_DURATION_MS = DAY;
export const DECOR_DURATION_MS = 7 * DAY;
export const MAX_DECOR_PER_GRAVE = 3;

export const ITEMS: readonly ItemDef[] = [
  { id: "fw_small", kind: "firework", name: "작은 폭죽", desc: "밤하늘에 한 발. 채널 모두가 함께 봐요.", price: 30, power: 1 },
  { id: "fw_heart", kind: "firework", name: "하트 폭죽", desc: "하트 모양으로 퍼지는 분홍 불꽃.", price: 60, power: 2 },
  { id: "fw_triple", kind: "firework", name: "삼연발 폭죽", desc: "세 발이 연달아 터져요.", price: 90, power: 3 },
  { id: "fw_big", kind: "firework", name: "대형 폭죽", desc: "화면을 가득 채우는 커다란 불꽃.", price: 180, power: 4 },
  { id: "fw_meteor", kind: "firework", name: "별똥별", desc: "하늘을 가로지르는 별똥별 비가 쏟아져요.", price: 120, power: 3 },
  { id: "fw_letter", kind: "firework", name: "글자 폭죽", desc: "내 이름이 불꽃 글자로 떠올라요.", price: 150, power: 3 },
  { id: "fw_grand", kind: "firework", name: "밤하늘 피날레", desc: "채널 하늘 전체를 몇 초 동안 수놓아요.", price: 350, power: 5 },

  { id: "hat_straw", kind: "cosmetic", slot: "head", name: "밀짚모자", desc: "여름날 사이드프로젝트의 추억.", price: 40, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_cat", kind: "cosmetic", slot: "head", name: "고양이 귀", desc: "쫑긋.", price: 50, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_flower", kind: "cosmetic", slot: "head", name: "꽃 머리핀", desc: "헌화하다 하나 꽂았어요.", price: 40, durationMs: COSMETIC_DURATION_MS },
  { id: "hand_lantern", kind: "cosmetic", slot: "hand", name: "손등불", desc: "내 주변이 더 환해져요.", price: 60, durationMs: COSMETIC_DURATION_MS },
  { id: "aura_firefly", kind: "cosmetic", slot: "aura", name: "반딧불 오라", desc: "반딧불이 졸졸 따라와요.", price: 70, durationMs: COSMETIC_DURATION_MS },
  { id: "neck_scarf", kind: "cosmetic", slot: "neck", name: "빨간 목도리", desc: "밤바람이 차요.", price: 30, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_halo", kind: "cosmetic", slot: "head", name: "후광", desc: "머리 위에 은은한 빛의 고리.", price: 80, durationMs: COSMETIC_DURATION_MS },
  { id: "back_wings", kind: "cosmetic", slot: "back", name: "작은 날개", desc: "등에서 파닥이는 유령 날개.", price: 90, durationMs: COSMETIC_DURATION_MS },
  { id: "pet_ghost", kind: "cosmetic", slot: "pet", name: "그림자 유령 친구", desc: "작은 그림자 유령이 졸졸 따라와요.", price: 120, durationMs: COSMETIC_DURATION_MS },
  { id: "feet_flowers", kind: "cosmetic", slot: "feet", name: "발자국 꽃", desc: "걷는 자리마다 작은 꽃이 피어요.", price: 70, durationMs: COSMETIC_DURATION_MS },
  { id: "aura_fog", kind: "cosmetic", slot: "aura", name: "안개 망토", desc: "발밑에 푸른 안개가 일렁여요.", price: 60, durationMs: COSMETIC_DURATION_MS },

  { id: "decor_candles", kind: "decor", name: "촛불 한 쌍", desc: "묘비 양옆에 작은 촛불.", price: 30, durationMs: DECOR_DURATION_MS },
  { id: "decor_wreath", kind: "decor", name: "꽃 화환", desc: "묘비 앞에 둥근 화환.", price: 50, durationMs: DECOR_DURATION_MS },
  { id: "decor_ribbon", kind: "decor", name: "추모 리본", desc: "검은 리본 하나.", price: 30, durationMs: DECOR_DURATION_MS },
  { id: "decor_lantern", kind: "decor", name: "작은 석등", desc: "묘비 옆을 은은히 밝혀요.", price: 60, durationMs: DECOR_DURATION_MS },
  { id: "decor_ghostcat", kind: "decor", name: "유령 고양이", desc: "묘비 위에서 졸고 있어요.", price: 80, durationMs: DECOR_DURATION_MS },
  { id: "decor_stars", kind: "decor", name: "별빛", desc: "묘비 위로 별가루가 내려요.", price: 120, durationMs: DECOR_DURATION_MS },
  { id: "decor_rainbow", kind: "decor", name: "무지개", desc: "묘비 위에 작은 무지개가 걸려요.", price: 100, durationMs: DECOR_DURATION_MS },
  { id: "decor_butterfly", kind: "decor", name: "나비", desc: "나비 몇 마리가 묘비 둘레를 날아요.", price: 70, durationMs: DECOR_DURATION_MS },
  { id: "decor_snowman", kind: "decor", name: "눈사람", desc: "묘비 옆을 지키는 작은 눈사람.", price: 50, durationMs: DECOR_DURATION_MS },
  { id: "decor_flowerpot", kind: "decor", name: "화분", desc: "묘비 앞에 작은 화분 하나.", price: 30, durationMs: DECOR_DURATION_MS },

  // 묘비 디자인권 (포인트로 만드는 특별 묘비). id = "gs_" + 디자인 id
  { id: "gs_coffee", kind: "graveStyle", name: "식은 커피잔 묘비", desc: "마지막 한 모금은 끝내 마시지 못했다.", price: 100 },
  { id: "gs_duck", kind: "graveStyle", name: "고무오리 묘비", desc: "디버깅을 끝까지 들어 준 친구.", price: 120 },
  { id: "gs_404", kind: "graveStyle", name: "404 비석", desc: "찾을 수 없는 프로젝트.", price: 120 },
  { id: "gs_monitor", kind: "graveStyle", name: "모니터 묘비", desc: "꺼지지 않는 커서가 깜빡여요.", price: 150 },
  { id: "gs_sakura", kind: "graveStyle", name: "벚꽃 비석", desc: "꽃잎이 내려앉는 비석.", price: 150 },
  { id: "gs_server", kind: "graveStyle", name: "서버 랙 묘비", desc: "LED가 아직 깜빡여요. 요금은 끊겼지만.", price: 180 },
  { id: "gs_rocket", kind: "graveStyle", name: "못 쏜 로켓", desc: "출시 직전에 멈춘 로켓.", price: 200 },
  { id: "gs_angel", kind: "graveStyle", name: "대리석 천사상", desc: "날개를 접은 작은 천사.", price: 300 },
  { id: "gs_crystal", kind: "graveStyle", name: "수정 묘비", desc: "밤에 은은하게 빛나요.", price: 400 },
  { id: "gs_gold", kind: "graveStyle", name: "황금 비석", desc: "가장 빛나던 아이디어에게.", price: 500 },
];

/**
 * 묘비 디자인. 맵 분위기는 모두 같고, 묘비마다 디자인을 골라 세운다.
 * free = 누구나 고를 수 있음, 나머지는 같은 id의 "gs_" 디자인권이 있어야 한다(쓰면 소모).
 * "auto"는 명세의 생존 기간 규칙(나무 팻말 → 작은 비석 → 큰 비석 → 석탑)을 따른다.
 */
export const GRAVE_STYLES = [
  { id: "auto", name: "자동 (살아온 기간에 따라)", free: true },
  { id: "wood", name: "나무 팻말", free: true },
  { id: "stone", name: "둥근 비석", free: true },
  { id: "tall", name: "큰 비석", free: true },
  { id: "cross", name: "십자 묘비", free: true },
  { id: "pagoda", name: "석탑", free: true },
  { id: "coffee", name: "식은 커피잔 묘비", free: false },
  { id: "duck", name: "고무오리 묘비", free: false },
  { id: "404", name: "404 비석", free: false },
  { id: "monitor", name: "모니터 묘비", free: false },
  { id: "sakura", name: "벚꽃 비석", free: false },
  { id: "server", name: "서버 랙 묘비", free: false },
  { id: "rocket", name: "못 쏜 로켓", free: false },
  { id: "angel", name: "대리석 천사상", free: false },
  { id: "crystal", name: "수정 묘비", free: false },
  { id: "gold", name: "황금 비석", free: false },
] as const;
export type GraveStyleId = (typeof GRAVE_STYLES)[number]["id"];
const styleMap = new Map<string, (typeof GRAVE_STYLES)[number]>(GRAVE_STYLES.map((g) => [g.id, g]));
export function isGraveStyle(id: unknown): id is GraveStyleId {
  return typeof id === "string" && styleMap.has(id);
}
export function isFreeStyle(id: string): boolean {
  return styleMap.get(id)?.free === true;
}
/** 유료 디자인의 디자인권 아이템 id (무료면 null) */
export function styleItemId(id: string): string | null {
  return isGraveStyle(id) && !isFreeStyle(id) ? `gs_${id}` : null;
}

const byId = new Map(ITEMS.map((i) => [i.id, i]));
export function itemById(id: string): ItemDef | undefined {
  return byId.get(id);
}
export function isFireworkId(id: unknown): id is string {
  return typeof id === "string" && byId.get(id)?.kind === "firework";
}
/** 착용 중인 꾸미기 (부위별 최대 1개, 최대 7개). 서버 브로드캐스트·렌더링용 */
export type Look = string[];
export function sanitizeLook(raw: unknown): Look {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<CosmeticSlot>();
  const out: string[] = [];
  for (const id of raw) {
    const it = typeof id === "string" ? byId.get(id) : undefined;
    if (!it || it.kind !== "cosmetic" || !it.slot || seen.has(it.slot)) continue;
    seen.add(it.slot);
    out.push(it.id);
  }
  return out.slice(0, 7);
}

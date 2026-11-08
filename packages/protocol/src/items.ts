// 상점 아이템 카탈로그 (web 구매·사용, game 렌더링, realtime 폭죽 검증이 함께 쓴다).
// 모든 아이템은 "1회성"이다: 사면 가방에 1개가 들어가고, 쓰면 사라진다.
//  - 폭죽: 쏘는 순간 소모. 같은 채널 모두에게 보이고 들린다.
//  - 캐릭터 꾸미기: 착용하는 순간 소모, 24시간 동안 유지된다(같은 부위는 마지막 것으로 교체).
//  - 묘비 꾸미기: 내 묘비 하나에 놓는 순간 소모, 7일 동안 유지된다(묘비당 최대 3개).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type ItemKind = "firework" | "cosmetic" | "decor";
export type CosmeticSlot = "head" | "hand" | "aura" | "neck";

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
};

export const COSMETIC_DURATION_MS = DAY;
export const DECOR_DURATION_MS = 7 * DAY;
export const MAX_DECOR_PER_GRAVE = 3;

export const ITEMS: readonly ItemDef[] = [
  { id: "fw_small", kind: "firework", name: "작은 폭죽", desc: "밤하늘에 한 발. 채널 모두가 함께 봐요.", price: 30 },
  { id: "fw_heart", kind: "firework", name: "하트 폭죽", desc: "하트 모양으로 퍼지는 분홍 불꽃.", price: 60 },
  { id: "fw_triple", kind: "firework", name: "삼연발 폭죽", desc: "세 발이 연달아 터져요.", price: 90 },

  { id: "hat_straw", kind: "cosmetic", slot: "head", name: "밀짚모자", desc: "여름날 사이드프로젝트의 추억.", price: 40, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_cat", kind: "cosmetic", slot: "head", name: "고양이 귀", desc: "쫑긋.", price: 50, durationMs: COSMETIC_DURATION_MS },
  { id: "hat_flower", kind: "cosmetic", slot: "head", name: "꽃 머리핀", desc: "헌화하다 하나 꽂았어요.", price: 40, durationMs: COSMETIC_DURATION_MS },
  { id: "hand_lantern", kind: "cosmetic", slot: "hand", name: "손등불", desc: "내 주변이 더 환해져요.", price: 60, durationMs: COSMETIC_DURATION_MS },
  { id: "aura_firefly", kind: "cosmetic", slot: "aura", name: "반딧불 오라", desc: "반딧불이 졸졸 따라와요.", price: 70, durationMs: COSMETIC_DURATION_MS },
  { id: "neck_scarf", kind: "cosmetic", slot: "neck", name: "빨간 목도리", desc: "밤바람이 차요.", price: 30, durationMs: COSMETIC_DURATION_MS },

  { id: "decor_candles", kind: "decor", name: "촛불 한 쌍", desc: "묘비 양옆에 작은 촛불.", price: 30, durationMs: DECOR_DURATION_MS },
  { id: "decor_wreath", kind: "decor", name: "꽃 화환", desc: "묘비 앞에 둥근 화환.", price: 50, durationMs: DECOR_DURATION_MS },
  { id: "decor_ribbon", kind: "decor", name: "추모 리본", desc: "검은 리본 하나.", price: 30, durationMs: DECOR_DURATION_MS },
  { id: "decor_lantern", kind: "decor", name: "작은 석등", desc: "묘비 옆을 은은히 밝혀요.", price: 60, durationMs: DECOR_DURATION_MS },
  { id: "decor_ghostcat", kind: "decor", name: "유령 고양이", desc: "묘비 위에서 졸고 있어요.", price: 80, durationMs: DECOR_DURATION_MS },
  { id: "decor_stars", kind: "decor", name: "별빛", desc: "묘비 위로 별가루가 내려요.", price: 120, durationMs: DECOR_DURATION_MS },
];

const byId = new Map(ITEMS.map((i) => [i.id, i]));
export function itemById(id: string): ItemDef | undefined {
  return byId.get(id);
}
export function isFireworkId(id: unknown): id is string {
  return typeof id === "string" && byId.get(id)?.kind === "firework";
}
/** 착용 중인 꾸미기 (부위별 최대 1개, 최대 4개). 서버 브로드캐스트·렌더링용 */
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
  return out.slice(0, 4);
}

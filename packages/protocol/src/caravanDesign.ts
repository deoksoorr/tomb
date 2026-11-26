import { campLotByNo } from "./campHomes";

// 11/26 카라반 디자인 (분양 때 사는 사람이 고르고, 주인은 관리 창에서 무료로 바꾼다). 값은 자리 등급(폭포 앞·강가·숲 쪽)으로만 정해지고 디자인과 상관없다.
// 모델 3 × 몸통 색 4 × 차양 색 4. 서버(lib/housing — 집 기록 camp.design)와 그림(웹 game/camp/campHomeArt·campHousingPlan)이 같이 쓴다.
// 디자인 칸이 없는 옛 카라반은 자리마다 정해져 있던 모습(defaultCaravanDesign)으로 그린다 — 지금 주인 눈에는 아무것도 안 바뀐다.

export type CaravanModel = "airstream" | "teardrop" | "bus";
export const CARAVAN_MODELS: readonly CaravanModel[] = ["airstream", "teardrop", "bus"];
export const CARAVAN_MODEL_NAME: Record<CaravanModel, string> = { airstream: "에어스트림", teardrop: "티어드롭", bus: "버스 개조" };
/** 모델마다 몸통 색 이름 (번호 = 그림 팔레트 번호. 에어스트림은 은색 몸통의 색 띠) */
export const CARAVAN_COLOR_NAMES: Record<CaravanModel, readonly string[]> = {
  airstream: ["남색", "빨강", "청록", "겨자"],
  teardrop: ["민트", "산호", "겨자", "하늘"],
  bus: ["하늘", "세이지", "체리", "겨자"],
};
export const CARAVAN_AWNING_NAMES: readonly string[] = ["빨강", "파랑", "초록", "주황"];
export const CARAVAN_COLOR_COUNT = 4;
export const CARAVAN_AWNING_COUNT = CARAVAN_AWNING_NAMES.length;

/** model = 모델 · color = 몸통 색 0..3 · awning = 옆 차양 색 0..3 */
export type CaravanDesign = { model: CaravanModel; color: number; awning: number };

export const isCaravanModel = (v: unknown): v is CaravanModel => v === "airstream" || v === "teardrop" || v === "bus";
const inRange = (v: unknown, n: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n;
export function isCaravanDesign(v: unknown): v is CaravanDesign {
  const o = v as Partial<CaravanDesign> | null;
  return !!o && typeof o === "object" && isCaravanModel(o.model) && inRange(o.color, CARAVAN_COLOR_COUNT) && inRange(o.awning, CARAVAN_AWNING_COUNT);
}

/** 자리 등급마다 처음 정해져 있던 모델 (폭포 앞 = 에어스트림, 강가 = 티어드롭, 숲 쪽 = 버스 개조) */
export function caravanModelOfLot(lot: number): CaravanModel {
  const g = campLotByNo(lot)?.grade;
  return g === "falls" ? "airstream" : g === "river" ? "teardrop" : "bus";
}

/** 디자인을 고르기 전 카라반 모습 = 예전 자리 번호 규칙 그대로 (티어드롭 색 = 번호 % 4, 에어스트림·버스 = 번호 % 2, 차양 = 번호 % 4) */
export function defaultCaravanDesign(lot: number): CaravanDesign {
  const model = caravanModelOfLot(lot);
  const n = Math.max(0, Math.floor(lot) || 0);
  return { model, color: model === "teardrop" ? n % 4 : n % 2, awning: n % 4 };
}

/** 저장된 디자인(올바르면 그대로) 또는 그 자리 기본 모습 */
export const caravanDesignOf = (lot: number, raw?: unknown): CaravanDesign => (isCaravanDesign(raw) ? { model: raw.model, color: raw.color, awning: raw.awning } : defaultCaravanDesign(lot));

export const sameCaravanDesign = (a: CaravanDesign, b: CaravanDesign) => a.model === b.model && a.color === b.color && a.awning === b.awning;

/** 저장용 짧은 글자 "airstream.2.1" (Redis 집 기록 design 칸) */
export const caravanDesignKey = (d: CaravanDesign): string => `${d.model}.${d.color}.${d.awning}`;
export function parseCaravanDesign(s: string | null | undefined): CaravanDesign | null {
  if (!s) return null;
  const [model, c, a] = s.split(".");
  const d = { model, color: Number(c), awning: Number(a) };
  return isCaravanDesign(d) ? d : null;
}

/** 「에어스트림 · 청록 · 초록 차양」 */
export const caravanDesignName = (d: CaravanDesign): string =>
  `${CARAVAN_MODEL_NAME[d.model]} · ${CARAVAN_COLOR_NAMES[d.model][d.color] ?? ""} · ${CARAVAN_AWNING_NAMES[d.awning] ?? ""} 차양`;

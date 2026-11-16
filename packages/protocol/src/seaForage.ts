import { tideLevel, tideLineY, TIDE_OPEN_LEVEL, TIDE_PERIOD_MIN } from "./sea";

// 11/16 바닷가 2차: 갯벌 캐기 물때 규칙 (웹 서버 lib/forage가 막고, 화면 game/sea/seaDig가 같은 계산으로 안내해요).
// 갯벌 구멍(SEA_DIG_HOLES)은 갯벌이 열린 동안(물 높이 0.25 아래)이고, 그 구멍이 물가 선보다 뭍 쪽으로 드러나 있을 때만 캘 수 있어요.
// 바다 쪽 깊은 구멍일수록 열리는 시간이 같거나 짧아요 (물가 선은 sea.ts tideLineY 그대로라 물때 범위를 바꿔도 따라가요). 시각만으로 계산해서 Redis를 쓰지 않아요.

/** 구멍이 물가 선보다 이만큼은 뭍 쪽이어야 드러난 걸로 쳐요 (px, 물결에 깜빡이지 않게) */
export const SEA_DIG_MARGIN = 6;
export const SEA_DIG_CLOSED_MSG = "물이 들어와서 지금은 캘 수 없어요. 물이 빠지면 다시 와요.";

/** 물 높이 level(0..1)에서 이 구멍을 캘 수 있는지 (화면은 지금 화면 물때로) */
export function seaDigOpenAt(hole: { x: number; y: number }, level: number): boolean {
  return level < TIDE_OPEN_LEVEL && hole.y < tideLineY(level) - SEA_DIG_MARGIN;
}

/** 지금(nowMs) 이 구멍을 캘 수 있는지 (서버·화면 공통) */
export function seaDigOpen(hole: { x: number; y: number }, nowMs: number): boolean {
  return seaDigOpenAt(hole, tideLevel(nowMs));
}

/**
 * 이 구멍이 한 물때 안에서 열려 있는 분 (간조 한가운데 90분을 중심으로 앞뒤 같은 길이). 열리지 않는 구멍이면 0.
 * 등대지기·안내·시험용 (서버 판정은 seaDigOpen)
 */
export function seaDigOpenMinutes(hole: { x: number; y: number }): number {
  let n = 0;
  for (let t = 0; t < TIDE_PERIOD_MIN; t++) if (seaDigOpenAt(hole, 0.5 + 0.5 * Math.cos((2 * Math.PI * t) / TIDE_PERIOD_MIN))) n++;
  return n;
}


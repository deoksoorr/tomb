import { STAY_TICK_MINUTES } from "./attendStay";
import { PLAY_MIN_MS, type PlayKind } from "./retain";

/**
 * 11/24 시간 미션 실시간 게이지 (범퍼카 · 관람차·열기구 · 불멍).
 * 서버는 시작 표를 낸 때부터 시계로 PLAY_MIN_MS를 보니, 화면은 1.5초 여유를 두고 미션을 보낸다 (RetainHud).
 * 게이지는 그 보내는 순간에 꽉 차서 「1:00 / 1:00」이 되게 비율로 늘려 보인다
 */
export const PLAY_SEND_PAD_MS = 1_500;
export type GaugeKind = Exclude<PlayKind, "haunt">;
export const playSendMs = (kind: GaugeKind): number => PLAY_MIN_MS[kind] + PLAY_SEND_PAD_MS;

export type PlayGauge = { frac: number; text: string; done: boolean };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** 잰 시간 → 채움 비율(0~1)·「0:23 / 1:00」·다 찼는지. 다 차기 전에는 끝 시각(1:00)을 보이지 않는다 */
export function playGauge(kind: GaugeKind, ms: number): PlayGauge {
  const total = PLAY_MIN_MS[kind] / 1000;
  const frac = Math.min(1, Math.max(0, ms / playSendMs(kind)));
  const done = frac >= 1;
  const sec = done ? total : Math.min(total - 1, Math.floor(frac * total));
  return { frac, text: `${clock(sec)} / ${clock(total)}`, done };
}

/**
 * 머무르기 미션 줄: 서버가 아는 오늘 머문 분(10분 단위)에 마지막 머무르기 응답 뒤 지난 분을 더한다.
 * 다음 10분 칸은 서버 값이 와야 넘는다 (그 전에는 칸 1분 앞에서 멈춤). needMin = 미션 끝 분 (30)
 */
export function stayLive(stayMin: number, sinceMs: number, needMin: number): { min: number; frac: number; text: string } {
  const base = Math.max(0, Math.floor(stayMin));
  const nextSlot = (Math.floor(base / STAY_TICK_MINUTES) + 1) * STAY_TICK_MINUTES;
  const min = Math.min(needMin, base >= needMin ? base : Math.min(nextSlot - 1, needMin - 1, base + Math.floor(Math.max(0, sinceMs) / 60_000)));
  return { min, frac: needMin > 0 ? min / needMin : 1, text: `${min}/${needMin}분` };
}

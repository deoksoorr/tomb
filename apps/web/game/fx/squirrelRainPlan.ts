import { SQUIRREL_RAIN_MS } from "@tomb/protocol";
import { rng } from "../sprites/pixel";

// 11/16 「다람쥐를 뿌려라」 연출 계획 (순수 — Phaser 없이 시험한다). 다람쥐마다 떨어지기 시작·땅·도망 방향을 씨앗으로 정한다.
// 시간은 연출 시작부터 ms, 좌표는 월드 좌표 (시작할 때 카메라가 보던 범위 안).

export type ViewRect = { x: number; y: number; width: number; height: number };

export type SquirrelPlan = {
  /** 떨어지기 시작 */
  delay: number;
  /** 떨어지는 시간 */
  fall: number;
  x0: number;
  /** 화면 위 (보이는 범위보다 위) */
  y0: number;
  /** 내려앉는 땅 */
  yl: number;
  /** 떨어지며 좌우로 흔들리는 폭·횟수·위상 */
  swayAmp: number;
  swayFreq: number;
  swayPh: number;
  /** 떨어지는 동안 도는 바퀴 수 (부호 = 방향) */
  spin: number;
  /** 내려앉아 한 번 튀는 높이 */
  hop: number;
  /** 도망가는 방향 (-1 왼쪽, 1 오른쪽) */
  dir: -1 | 1;
  /** 도망 속도 (월드 px/s) */
  speed: number;
};

/** 내려앉아 한 번 튀는 시간 */
export const SQUIRREL_BOUNCE_MS = 260;
/** 떨어지기 시작하는 시각이 퍼지는 범위 (와다다다) */
export const SQUIRREL_SPREAD_MS = 2_000;
/** 끝나기 전 이만큼 동안 남은 다람쥐를 흐린다 */
export const SQUIRREL_FADE_MS = 300;
export const SQUIRREL_END_MS = SQUIRREL_RAIN_MS;

/** 마릿수: 보이는 넓이에 맞춰 60~110, 움직임 줄이기면 24 */
export function squirrelCount(view: ViewRect, reduced: boolean): number {
  if (reduced) return 24;
  return Math.round(Math.min(110, Math.max(60, (view.width * view.height) / 900)));
}

export function planSquirrels(seed: number, view: ViewRect, reduced: boolean): SquirrelPlan[] {
  const r = rng(seed);
  const n = squirrelCount(view, reduced);
  const out: SquirrelPlan[] = [];
  const margin = Math.min(12, view.width * 0.05);
  for (let i = 0; i < n; i++) {
    // 앞쪽이 촘촘하게 (처음에 우르르, 뒤로 갈수록 띄엄띄엄)
    const delay = Math.round(Math.pow(r(), 1.35) * SQUIRREL_SPREAD_MS);
    const x0 = view.x + margin + r() * (view.width - margin * 2);
    out.push({
      delay,
      fall: 550 + r() * 350,
      x0,
      y0: view.y - 14 - r() * 36,
      yl: view.y + view.height * (0.3 + r() * 0.62),
      swayAmp: reduced ? 0 : 3 + r() * 7,
      swayFreq: 4 + r() * 6,
      swayPh: r() * Math.PI * 2,
      spin: reduced ? 0 : (r() < 0.5 ? -1 : 1) * (0.5 + r() * 1.2),
      hop: 3 + r() * 4,
      // 가까운 가장자리 쪽으로 도망가는 편 (가끔은 반대로)
      dir: (x0 < view.x + view.width / 2) !== r() < 0.2 ? -1 : 1,
      speed: 150 + r() * 110,
    });
  }
  return out;
}

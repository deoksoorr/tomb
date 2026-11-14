// 뒤로 간 상태(다른 창을 보는 중)의 게임 루프 줄이기 계산 (Phaser 없이 — 시험한다). 설치는 game/backgroundLoop.ts

/** 뒤로 간 동안의 갱신·그리기 횟수 (초당) */
export const BACKGROUND_FPS = 5;
const FRAME_MS = 1000 / BACKGROUND_FPS;

/** 판 시계가 프레임마다 돌아야 하는 씬 키 (그리기만 줄인다) */
export const LIVE_SCENE_KEYS = ["rpg-hunt", "rpg-bugs", "rpg-stars", "haunt-maze"] as const;

export type StepPlan = { kind: "full" | "update" | "skip"; delta: number };

/**
 * 뒤로 간 동안 한 프레임을 어떻게 할지 (순수 계산 — 시험한다).
 *  - live(판 진행 중): 갱신은 매 프레임, 그리기는 FRAME_MS마다 (full = 갱신+그리기, update = 갱신만)
 *  - 그 밖: FRAME_MS마다 한 번만 갱신+그리기, 그사이 흐른 시간(delta)은 모아서 넘긴다
 */
export class BackgroundStepper {
  private acc = 0;
  private last = -Infinity;

  plan(time: number, delta: number, live: boolean): StepPlan {
    if (live) {
      this.acc = 0;
      if (time - this.last >= FRAME_MS) {
        this.last = time;
        return { kind: "full", delta };
      }
      return { kind: "update", delta };
    }
    this.acc += delta;
    if (time - this.last < FRAME_MS) return { kind: "skip", delta: 0 };
    this.last = time;
    const d = this.acc;
    this.acc = 0;
    return { kind: "full", delta: d };
  }
}

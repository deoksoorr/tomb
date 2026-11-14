// 뒤로 간 상태(다른 탭·다른 창을 보는 중)의 게임 루프 계산 (Phaser 없이 — 시험한다). 설치는 game/backgroundLoop.ts

/**
 * 루프 모드: normal = 평소, rest = 휴식(루프를 재우고 "휴식 중" 막), live = 판 진행 중(갱신은 그대로, 그리기만 줄인다).
 * 판(사냥·곤충·별자리·귀신의집)이 진행 중이면 판 규칙 때문에 재우지 않는다 — 판이 끝난 뒤에도 뒤에 있으면 그때 휴식
 */
export type LoopMode = "normal" | "rest" | "live";
export const loopMode = (background: boolean, live: boolean): LoopMode => (!background ? "normal" : live ? "live" : "rest");

/** 판 진행 중 뒤로 간 동안의 그리기 횟수 (초당) */
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

/** 루프 제어에 쓰는 바깥 장치 (Phaser 루프·판 진행 여부·UI 알림 — 시험에서 바꿔 끼운다) */
export type LoopHooks = {
  /** Phaser 루프가 시작됐는지 (부팅 중이면 아무것도 하지 않는다) */
  started(): boolean;
  background(): boolean;
  live(): boolean;
  /** 루프 재우기 / 깨우기 (깨울 때 쉬던 시간은 넘기지 않는다) */
  sleep(): void;
  wake(): void;
  /** 판 진행 중 모드 (갱신 그대로, 그리기만 줄인다) 켜기 / 끄기 */
  enterLive(): void;
  leaveLive(): void;
  /** UI에 휴식 중 알림 */
  rest(on: boolean): void;
};

/** 뒤로 감·돌아옴·판 시작/끝에 맞춰 루프 모드를 바꾼다 (apply를 상태가 바뀔 때마다 부른다) */
export class LoopController {
  mode: LoopMode = "normal";

  constructor(private readonly h: LoopHooks) {}

  apply(): void {
    if (!this.h.started()) return;
    const next = loopMode(this.h.background(), this.h.live());
    if (next === this.mode) return;
    if (this.mode === "live") this.h.leaveLive();
    if (this.mode === "rest") this.h.wake();
    this.mode = next;
    if (next === "rest") this.h.sleep();
    else if (next === "live") this.h.enterLive();
    this.h.rest(next === "rest");
  }

  /** 정리: 재운 루프는 깨워 둔다 (Phaser 정리는 다음 프레임에 일어난다) */
  dispose(): void {
    if (this.mode === "live") this.h.leaveLive();
    if (this.mode === "rest") {
      this.h.wake();
      this.h.rest(false);
    }
    this.mode = "normal";
  }
}

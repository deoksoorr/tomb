// 11/26 폰·패드 발열 줄이기: 게임 루프를 초당 몇 번 돌릴지 정하는 계산 (Phaser 없이 — 시험한다). 설치는 game/ecoLoop.ts
//
// 규칙 (일괄 30fps 아님 — 가만히 있을 때만 낮춘다):
//  - 판 진행 중(사냥·곤충·별자리·귀신의집)·버스 창밖 연출·관람차/열기구 하늘 시점: 손대지 않는다 (조작감·연출)
//  - 움직이는 중(입력 직후·키를 누르고 있음·카메라 이동·화면 안 다른 사람 움직임·카메라 연출): 터치 기기는 60 (120Hz 화면도 60), PC는 화면 그대로
//  - 가만히: 터치 기기 30 · 절전 모드 20 · PC(절전 끔)는 그대로
//  - 큰 창이 덮음(8)·탭 숨김(멈춤)은 game/backgroundLoop가 따로 한다
//
// 프레임을 건너뛸 때는 그 시간(delta)을 모아 다음 프레임에 한꺼번에 넘긴다 (시계·움직임 계산이 느려지지 않게).

/** 움직이는 중으로 보는 시간: 입력(키·터치·마우스·휠) 뒤 */
export const INPUT_HOLD_MS = 1500;
/** 카메라·다른 사람이 움직인 뒤 */
export const MOTION_HOLD_MS = 400;
/** 터치 기기·절전 모드에서 움직이는 중의 상한 */
export const ACTIVE_FPS = 60;
/** 터치 기기에서 가만히 있을 때 */
export const IDLE_FPS = 30;
/** 절전 모드에서 가만히 있을 때 */
export const IDLE_FPS_SAVE = 20;

export type FrameInputs = {
  /** 터치 기기 (폰·패드) */
  touch: boolean;
  /** 절전 모드 (설정) */
  powerSave: boolean;
  /** 판 진행 중·연출 중 — 손대지 않는다 */
  full: boolean;
  /** 움직이는 중 */
  active: boolean;
};

/** 목표 초당 프레임. null = 제한 없음 (화면 주사율 그대로) */
export function targetFps(i: FrameInputs): number | null {
  if (i.full) return null;
  if (i.active) return i.touch || i.powerSave ? ACTIVE_FPS : null;
  if (i.powerSave) return IDLE_FPS_SAVE;
  return i.touch ? IDLE_FPS : null;
}

/**
 * 프레임 문: 목표 fps에 맞춰 이번 rAF 프레임을 돌릴지 정한다.
 * 다음 차례(next)보다 조금(최대 4ms) 일찍 와도 돌린다 — rAF 시각이 1ms쯤 흔들려도 60Hz 화면에서 30이 20으로 떨어지지 않게.
 * 많이 늦었으면(멈췄다 깸) 따라잡기 몰아치기 없이 지금부터 다시 센다. 목표가 바뀌면 바로 한 번 돌린다 (움직이기 시작하면 즉시 60).
 */
export class FrameGate {
  private next = 0;
  private acc = 0;
  private fps: number | null = null;

  plan(time: number, delta: number, fps: number | null): { run: boolean; delta: number } {
    if (fps !== this.fps) {
      this.fps = fps;
      this.next = 0;
    }
    this.acc += delta;
    if (fps === null || fps <= 0) return this.take(time, 0);
    const frameMs = 1000 / fps;
    const slack = Math.min(4, frameMs * 0.25);
    if (time < this.next - slack) return { run: false, delta: 0 };
    return this.take(time, frameMs);
  }

  private take(time: number, frameMs: number): { run: boolean; delta: number } {
    // 많이 늦었으면 지금부터 (몰아서 따라잡지 않는다)
    this.next = frameMs === 0 || time - this.next > frameMs ? time + frameMs : this.next + frameMs;
    const d = this.acc;
    this.acc = 0;
    return { run: true, delta: d };
  }
}

/** 움직이는 중인지 기억한다 (입력·움직임이 올 때마다 poke) */
export class ActivityClock {
  private until = -Infinity;
  private readonly held = new Set<string>();
  /** 마지막으로 움직이는 중을 늘린 까닭 (디버그 — __tombFrames) */
  why = "";

  poke(now: number, holdMs: number, why = ""): void {
    if (now + holdMs > this.until) {
      this.until = now + holdMs;
      this.why = why;
    }
  }

  /** 키를 누르고 있는 동안은 계속 움직이는 중 */
  keyDown(code: string, now: number): void {
    this.held.add(code);
    this.poke(now, INPUT_HOLD_MS, "key");
  }

  keyUp(code: string, now: number): void {
    this.held.delete(code);
    this.poke(now, INPUT_HOLD_MS, "key");
  }

  /** 창이 포커스를 잃으면 keyup이 안 올 수 있다 */
  releaseKeys(): void {
    this.held.clear();
  }

  active(now: number): boolean {
    return this.held.size > 0 || now < this.until;
  }
}

/** 카메라 상태가 움직였는지 (스크롤·줌, 아주 작은 흔들림은 무시) */
export function cameraMoved(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
  return Math.abs(a[0] - b[0]) > 0.01 || Math.abs(a[1] - b[1]) > 0.01 || Math.abs(a[2] - b[2]) > 0.0001;
}

/** 버벅임을 재는 창 하나의 길이 */
export const STUTTER_WINDOW_MS = 5000;
/** 움직이는 중에 이보다 느리면 버벅이는 창 */
export const STUTTER_FPS = 40;
/** 버벅이는 창이 이만큼 이어지면 안내 (움직이는 중 20초) */
export const STUTTER_WINDOWS = 4;

/**
 * 폰에서 계속 버벅이는지 잰다: 움직이는 중(목표 60 이상)에 rAF가 실제로 온 간격만 모은다.
 * 5초 창마다 평균 fps를 내고, STUTTER_FPS 아래인 창이 STUTTER_WINDOWS번 이어지면 한 번 true. 빠른 창이 끼면 처음부터.
 * 한 번 0.25초 넘게 비면(탭 전환·멈춤) 그 간격은 세지 않는다.
 */
export class StutterWatch {
  private ms = 0;
  private frames = 0;
  private slow = 0;
  private fired = false;

  /** 움직이는 중 프레임 하나 (dt = 지난 rAF와의 간격). 안내할 때가 되면 true (한 번만) */
  sample(dt: number): boolean {
    if (this.fired || !(dt > 0) || dt > 250) return false;
    this.ms += dt;
    this.frames++;
    if (this.ms < STUTTER_WINDOW_MS) return false;
    const fps = (this.frames * 1000) / this.ms;
    this.ms = 0;
    this.frames = 0;
    this.slow = fps < STUTTER_FPS ? this.slow + 1 : 0;
    if (this.slow < STUTTER_WINDOWS) return false;
    this.fired = true;
    return true;
  }
}

// ── 게임 하나에 하나: 입력·움직임 알림 ──

const clock = new ActivityClock();

/** 화면 안 다른 사람이 움직였다·연출이 시작됐다 (RemoteAvatar 등) */
export function pokeFrame(holdMs = MOTION_HOLD_MS, why = "motion", now = performance.now()): void {
  clock.poke(now, holdMs, why);
}

export function activityClock(): ActivityClock {
  return clock;
}

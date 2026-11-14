import * as Phaser from "phaser";
import { isBackground, onBackgroundChange } from "@/lib/background";
import { BackgroundStepper, LIVE_SCENE_KEYS } from "./backgroundStepper";

// 뒤로 간 상태(다른 창을 보는 중 — lib/background)에서 게임이 자원을 거의 먹지 않게 루프를 줄인다.
//  - 마을·집 등: 갱신·그리기를 초당 BACKGROUND_FPS번으로 (그사이 흐른 시간은 모아서 넘긴다 → 게임 시계는 그대로)
//  - 판 시계가 프레임마다 돌아야 하는 씬(사냥·벌레·별·귀신의집)이 진행 중이면 갱신은 그대로, 그리기만 줄인다
//    (판 규칙·멈춤 제한과 부딪히지 않게 — 탭을 숨겼을 때는 지금처럼 Phaser가 루프를 멈춘다)
//  - 실시간 연결·소리(음악·효과음)는 게임 루프와 따로 돌아 그대로 나온다
//  - 앞으로 돌아오면 바로 원래 루프로
// Phaser 루프(TimeStep)가 부르는 콜백만 바꿔 끼운다 (Phaser 내부 다른 것은 건드리지 않는다).

type StepFn = (time: number, delta: number) => void;

/** 그리기 없이 한 번 갱신 (Phaser Game.step에서 그리기만 뺀 것) */
function updateOnly(game: Phaser.Game, time: number, delta: number): void {
  if (game.isPaused) return;
  const ev = game.events;
  ev.emit(Phaser.Core.Events.PRE_STEP, time, delta);
  ev.emit(Phaser.Core.Events.STEP, time, delta);
  game.scene.update(time, delta);
  ev.emit(Phaser.Core.Events.POST_STEP, time, delta);
}

/** 게임에 설치한다. 해제 함수를 돌려준다 */
export function installBackgroundLoop(game: Phaser.Game): () => void {
  let saved: StepFn | null = null;
  let wrapped: StepFn | null = null;

  const live = () => LIVE_SCENE_KEYS.some((k) => game.scene.getScene(k) !== null && game.scene.isActive(k));

  const enter = () => {
    if (wrapped) return;
    const loop = game.loop;
    const orig = loop.callback as StepFn;
    const stepper = new BackgroundStepper();
    const w: StepFn = (time, delta) => {
      // 정리 중이면 원래 콜백이 마무리한다
      if ((game as unknown as { pendingDestroy?: boolean }).pendingDestroy) return orig(time, delta);
      const p = stepper.plan(time, delta, live());
      if (p.kind === "full") orig(time, p.delta);
      else if (p.kind === "update") updateOnly(game, time, p.delta);
    };
    saved = orig;
    wrapped = w;
    loop.callback = w;
  };

  const leave = () => {
    if (!wrapped) return;
    // 그사이 Phaser가 콜백을 새로 넣었으면(루프 다시 시작) 그대로 둔다
    if (game.loop.callback === wrapped && saved) game.loop.callback = saved;
    wrapped = null;
    saved = null;
  };

  // 루프가 시작되기 전이면(부팅 중) 시작한 뒤에 건다 — 시작이 콜백을 덮어쓰므로
  const sync = (bg: boolean) => {
    if (!bg) return leave();
    if (!game.loop.started) return;
    enter();
  };
  const offBg = onBackgroundChange(sync);
  // READY는 루프 시작 전에 오므로 첫 프레임이 끝난 뒤에 본다
  const onFirstStep = () => sync(isBackground());
  if (game.loop.started) onFirstStep();
  else game.events.once(Phaser.Core.Events.POST_STEP, onFirstStep);

  return () => {
    offBg();
    game.events.off(Phaser.Core.Events.POST_STEP, onFirstStep);
    leave();
  };
}

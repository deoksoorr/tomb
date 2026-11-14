import * as Phaser from "phaser";
import { isTabHidden, onTabHiddenChange } from "@/lib/background";
import { bridge } from "./bridge";
import { BackgroundStepper, LIVE_SCENE_KEYS, LoopController } from "./backgroundStepper";

// 탭이 숨겨진 동안(다른 탭·창 최소화 — lib/background isTabHidden) 게임이 자원을 거의 먹지 않게 한다.
// 다른 창을 눌러 포커스만 잃은 경우(창을 옆에 띄워 두고 구경)는 그대로 움직인다 — Redis 주기 호출만 lib/background가 따로 줄인다.
//  - 휴식(rest): Phaser 루프를 재운다(갱신·그리기 0). game:rest로 실시간 연결에 숨김을 알린다 (화면을 덮는 막은 없다 — 숨긴 탭은 어차피 안 보인다).
//    실시간 연결·서버 정산·음악·효과음 장치는 게임 루프와 따로 돌아 그대로 (게임 안 연출 소리는 멈춰도 된다)
//  - 판 진행 중(live: 사냥·곤충·별자리·귀신의집): 판 규칙과 부딪히지 않게 재우지 않고 갱신은 매 프레임, 그리기만 초당 BACKGROUND_FPS번.
//    막도 띄우지 않는다. 판이 끝났는데 여전히 뒤에 있으면 그때 휴식
//  - 탭이 다시 보이면 바로 깨운다. 쉬던 시간은 넘기지 않는다(탭 숨김 복귀와 같다 → 순간이동·시계 튐 없음)
// Phaser 루프(TimeStep)의 sleep/wake와 콜백만 쓴다 (Phaser 내부 다른 것은 건드리지 않는다).

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

  const unwrap = () => {
    if (!wrapped) return;
    // 그사이 Phaser가 콜백을 새로 넣었으면(루프 다시 시작) 그대로 둔다
    if (game.loop.callback === wrapped && saved) game.loop.callback = saved;
    wrapped = null;
    saved = null;
  };

  /** 판 진행 중: 갱신은 매 프레임, 그리기만 줄인다. 판이 끝나면 휴식으로 */
  const wrapLive = () => {
    if (wrapped) return;
    const loop = game.loop;
    const orig = loop.callback as StepFn;
    const stepper = new BackgroundStepper();
    const w: StepFn = (time, delta) => {
      // 정리 중이면 원래 콜백이 마무리한다
      if ((game as unknown as { pendingDestroy?: boolean }).pendingDestroy) return orig(time, delta);
      if (!live()) {
        orig(time, delta);
        // 판이 끝났다 → 뒤에 있으면 휴식 (다음 프레임 전에)
        queueMicrotask(apply);
        return;
      }
      const p = stepper.plan(time, delta, true);
      if (p.kind === "full") orig(time, p.delta);
      else updateOnly(game, time, p.delta);
    };
    saved = orig;
    wrapped = w;
    loop.callback = w;
  };

  const ctl = new LoopController({
    started: () => game.loop.started,
    background: isTabHidden,
    live,
    sleep: () => game.loop.sleep(),
    wake: () => {
      // 쉬던 시간은 넘기지 않는다 (탭 숨김 복귀처럼) → 첫 프레임 delta가 튀지 않게
      game.loop.resetDelta();
      game.loop.wake();
    },
    enterLive: wrapLive,
    leaveLive: unwrap,
    rest: (on) => {
      if ((bridge.last("game:rest")?.on ?? false) !== on) bridge.emit("game:rest", { on });
    },
  });
  /** 지금 상태(뒤에 있는지·판 진행 중인지)에 맞춰 루프를 바꾼다 */
  const apply = () => ctl.apply();

  const offBg = onTabHiddenChange(apply);
  // 루프가 시작되기 전이면(부팅 중) 첫 프레임 뒤에 본다 (READY는 루프 시작 전에 온다)
  const onFirstStep = () => apply();
  if (game.loop.started) apply();
  else game.events.once(Phaser.Core.Events.POST_STEP, onFirstStep);

  return () => {
    offBg();
    game.events.off(Phaser.Core.Events.POST_STEP, onFirstStep);
    ctl.dispose();
  };
}

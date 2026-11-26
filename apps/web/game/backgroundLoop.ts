import * as Phaser from "phaser";
import { isTabHidden, onTabHiddenChange } from "@/lib/background";
import { isGameCovered, onGameCoverChange } from "@/lib/gameCover";
import { bridge } from "./bridge";
import { BACKGROUND_FPS, BackgroundStepper, COVERED_FPS, LIVE_SCENE_KEYS, LoopController } from "./backgroundStepper";

// 탭이 숨겨진 동안(다른 탭·창 최소화 — lib/background isTabHidden) 게임이 자원을 거의 먹지 않게 한다.
// 다른 창을 눌러 포커스만 잃은 경우(창을 옆에 띄워 두고 구경)는 그대로 움직인다 — Redis 주기 호출만 lib/background가 따로 줄인다.
//  - 휴식(rest): Phaser 루프를 재운다(갱신·그리기 0). game:rest로 실시간 연결에 숨김을 알린다 (화면을 덮는 막은 없다 — 숨긴 탭은 어차피 안 보인다).
//    실시간 연결·서버 정산·음악·효과음 장치는 게임 루프와 따로 돌아 그대로 (게임 안 연출 소리는 멈춰도 된다)
//  - 판 진행 중(live: 사냥·곤충·별자리·귀신의집): 판 규칙과 부딪히지 않게 재우지 않고 갱신은 매 프레임, 그리기만 초당 BACKGROUND_FPS번.
//    막도 띄우지 않는다. 판이 끝났는데 여전히 뒤에 있으면 그때 휴식
//  - 11/22 덮임(covered: 탭은 보이지만 염색 판처럼 화면 대부분을 덮는 창이 열림 — lib/gameCover): 갱신은 매 프레임 그대로
//    (네트워크·위치 동기화·시간), 그리기만 초당 COVERED_FPS번. 창이 닫히면 바로 평소로
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
  // 11/26 Phaser는 장면 처리 중 표시(isProcessing)를 그리기(render) 끝에서야 내린다. 그리기를 건너뛰면 표시가 켜진 채 남아,
  // 그 사이 들어온 장면 명령(사냥 시작의 launch·bringToTop 등)이 다음 프레임 처리 중에 자기 자신을 끝없이 다시 줄 세워 탭이 멈췄다(메모리 초과)
  (game.scene as unknown as { isProcessing: boolean }).isProcessing = false;
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

  /**
   * 갱신은 매 프레임, 그리기만 초당 fps번. still()이 거짓이 되면(판이 끝남·창이 닫힘) 그 프레임은 평소대로 하고 모드를 다시 정한다
   * (판 진행 중 뒤로 감 → 판이 끝나면 휴식 · 덮임 → 창이 닫히면 평소)
   */
  const wrapThrottled = (fps: number, still: () => boolean) => {
    if (wrapped) return;
    const loop = game.loop;
    const orig = loop.callback as StepFn;
    const stepper = new BackgroundStepper(fps);
    const w: StepFn = (time, delta) => {
      // 정리 중이면 원래 콜백이 마무리한다
      if ((game as unknown as { pendingDestroy?: boolean }).pendingDestroy) return orig(time, delta);
      if (!still()) {
        orig(time, delta);
        // 다음 프레임 전에 모드를 다시 정한다
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
    enterLive: () => wrapThrottled(BACKGROUND_FPS, live),
    leaveLive: unwrap,
    // 11/26 판 진행 중(사냥 등)에는 창이 덮어도 줄이지 않는다 (조작감)
    covered: () => isGameCovered() && !live(),
    enterCovered: () => wrapThrottled(COVERED_FPS, () => isGameCovered() && !isTabHidden() && !live()),
    leaveCovered: unwrap,
    rest: (on) => {
      if ((bridge.last("game:rest")?.on ?? false) !== on) bridge.emit("game:rest", { on });
    },
  });
  /** 지금 상태(뒤에 있는지·판 진행 중인지)에 맞춰 루프를 바꾼다 */
  const apply = () => ctl.apply();

  const offBg = onTabHiddenChange(apply);
  const offCover = onGameCoverChange(apply);
  // 루프가 시작되기 전이면(부팅 중) 첫 프레임 뒤에 본다 (READY는 루프 시작 전에 온다)
  const onFirstStep = () => apply();
  if (game.loop.started) apply();
  else game.events.once(Phaser.Core.Events.POST_STEP, onFirstStep);

  return () => {
    offBg();
    offCover();
    game.events.off(Phaser.Core.Events.POST_STEP, onFirstStep);
    ctl.dispose();
  };
}

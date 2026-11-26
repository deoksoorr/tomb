import * as Phaser from "phaser";
import { isTouchUi } from "./input/keyHint";
import { bridge } from "./bridge";
import { LIVE_SCENE_KEYS } from "./backgroundStepper";
import { BUS_RIDE_SCENE } from "./bus/busTypes";
import { activityClock, cameraMoved, FrameGate, INPUT_HOLD_MS, MOTION_HOLD_MS, StutterWatch, targetFps } from "./frameGovernor";
import { deviceSettings } from "@/lib/deviceSettings";
import { isGameCovered } from "@/lib/gameCover";

// 11/26 폰·패드 발열: 가만히 있을 때만 게임 루프를 줄인다 (규칙은 game/frameGovernor — 터치 30·절전 20, 움직이면 바로 60).
// Phaser 루프(TimeStep)의 콜백을 한 겹 감싼다. 건너뛴 프레임은 갱신도 그리기도 하지 않고, 흐른 시간은 다음 프레임에 모아서 넘긴다.
// 덮임(8fps)·탭 숨김(멈춤)·뒤로 간 판(5fps)은 game/backgroundLoop가 이 위에 따로 감싼다 (createGame에서 이것을 먼저 설치한다).
// 움직임 판단: 키·터치·마우스·휠 입력(창 전체에서 엿듣기만), 누르고 있는 키, 돌아간 프레임마다 장면 카메라의 스크롤·줌·연출,
// 화면 안 다른 사람의 움직임(RemoteAvatar가 pokeFrame). 사냥 같은 판·버스 창밖·하늘 시점에서는 아무것도 하지 않는다.
// ?debug=1이면 콘솔 __tombFrames()로 지금 목표·실제 그린 수를 본다.

type StepFn = (time: number, delta: number) => void;
type CamKey = [number, number, number];

/** 판이 아니어도 늘 그대로 두는 장면 (버스 창밖 연출) */
const FULL_SCENE_KEYS: readonly string[] = [...LIVE_SCENE_KEYS, BUS_RIDE_SCENE];

export type EcoHandle = {
  dispose(): void;
  /** 지금 목표 fps (null = 제한 없음) · 지난 1초 동안 실제로 돌린 프레임 수 */
  stats(): { target: number | null; drawn: number; active: boolean; why: string };
};

/** 게임에 설치한다 (루프가 시작된 뒤 첫 프레임에 감싼다). onStutter = 폰에서 계속 버벅일 때 한 번 */
export function installEcoLoop(game: Phaser.Game, onStutter: () => void): EcoHandle {
  const clock = activityClock();
  const gate = new FrameGate();
  const stutter = new StutterWatch();
  const cams = new Map<string, CamKey>();
  let disposed = false;
  let target: number | null = null;
  let active = false;
  let drawnThisSec = 0;
  let drawn = 0;
  let secAt = 0;
  let lastTime = -1;

  // ── 입력 엿듣기 (막지 않는다) ──
  const now = () => performance.now();
  const onKeyDown = (e: KeyboardEvent) => {
    if (!e.repeat) clock.keyDown(e.code, now());
  };
  const onKeyUp = (e: KeyboardEvent) => clock.keyUp(e.code, now());
  const onInput = (e: Event) => clock.poke(now(), INPUT_HOLD_MS, e.type);
  const onBlur = () => clock.releaseKeys();
  const opt: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener("keydown", onKeyDown, opt);
  window.addEventListener("keyup", onKeyUp, opt);
  for (const t of ["pointerdown", "pointermove", "pointerup", "wheel", "touchstart", "touchmove"] as const) window.addEventListener(t, onInput, opt);
  window.addEventListener("blur", onBlur);

  const full = (): boolean => {
    for (const k of FULL_SCENE_KEYS) if (game.scene.getScene(k) !== null && game.scene.isActive(k)) return true;
    // 관람차·열기구 하늘 시점: 칸이 돌아가는 연출이라 그대로
    return bridge.last("view:mode")?.mode === "sky";
  };

  /** 돌린 프레임 뒤: 카메라가 움직였거나 카메라 연출(흔들림·페이드·이동·줌) 중이면 움직이는 중 */
  const probeCameras = (t: number) => {
    const scenes = game.scene.getScenes(true);
    for (const s of scenes) {
      const cam = s.cameras?.main;
      if (!cam) continue;
      const key = s.sys.settings.key;
      const cur: CamKey = [cam.scrollX, cam.scrollY, cam.zoom];
      const prev = cams.get(key);
      if (!prev || cameraMoved(prev, cur)) {
        if (prev) clock.poke(t, MOTION_HOLD_MS, `cam:${key}`);
        cams.set(key, cur);
      }
      if (cam.shakeEffect?.isRunning || cam.fadeEffect?.isRunning || cam.flashEffect?.isRunning || cam.panEffect?.isRunning || cam.zoomEffect?.isRunning) {
        clock.poke(t, MOTION_HOLD_MS, `camfx:${key}`);
      }
    }
  };

  let orig: StepFn | null = null;
  const eco: StepFn = (time, delta) => {
    const step = orig!;
    // 정리 중이면 원래 콜백이 마무리한다
    if (disposed || (game as unknown as { pendingDestroy?: boolean }).pendingDestroy) return step(time, delta);
    const settings = deviceSettings.getSnapshot();
    const touch = isTouchUi();
    const isFull = full();
    active = clock.active(time);
    target = targetFps({ touch, powerSave: settings.powerSave, full: isFull, active });
    // 버벅임 재기: 폰에서 움직이는 중·덮이지 않았을 때 rAF 간격 (절전 모드를 이미 켰으면 안내하지 않는다)
    const dt = lastTime < 0 ? 0 : time - lastTime;
    lastTime = time;
    if (touch && !settings.powerSave && (active || isFull) && !isGameCovered() && stutter.sample(dt)) onStutter();
    const p = gate.plan(time, delta, target);
    if (!p.run) return;
    step(time, p.delta);
    drawnThisSec++;
    if (time - secAt >= 1000) {
      drawn = drawnThisSec;
      drawnThisSec = 0;
      secAt = time;
    }
    if (!isFull) probeCameras(time);
  };

  const wrap = () => {
    if (disposed || orig) return;
    orig = game.loop.callback as StepFn;
    game.loop.callback = eco;
  };
  // 루프가 시작되기 전이면(부팅 중) 첫 프레임 뒤에 감싼다 (backgroundLoop보다 먼저 설치해 그쪽이 이 콜백을 감싸게)
  const onFirstStep = () => wrap();
  if (game.loop.started) wrap();
  else game.events.once(Phaser.Core.Events.POST_STEP, onFirstStep);

  return {
    dispose() {
      disposed = true;
      game.events.off(Phaser.Core.Events.POST_STEP, onFirstStep);
      window.removeEventListener("keydown", onKeyDown, opt);
      window.removeEventListener("keyup", onKeyUp, opt);
      for (const t of ["pointerdown", "pointermove", "pointerup", "wheel", "touchstart", "touchmove"] as const) window.removeEventListener(t, onInput, opt);
      window.removeEventListener("blur", onBlur);
      // 콜백은 그대로 둔다 (disposed면 원래 콜백을 그대로 부른다 — 게임 정리가 다음 프레임에 일어난다)
    },
    stats: () => ({ target, drawn, active, why: clock.why }),
  };
}

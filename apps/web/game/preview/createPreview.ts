import * as Phaser from "phaser";
import { installRenderGuard } from "../renderGuard";
import { installViewportSync } from "../viewportSync";
import { PreviewScene, type PreviewSceneData } from "./PreviewScene";

// 입장 화면 배경용 가벼운 Phaser 게임 (월드 씬·네트워크·입력·소리 없음).
// 가볍게: 초당 프레임을 낮추고(휴대폰 20, 그 밖 30), 저전력 GPU를 고르고, 탭이 숨으면 브라우저가 rAF를 멈춘다.
// 움직임 줄이기면 첫 화면을 그린 뒤 루프를 재운다(정지 화면). 입장 중(게임 로딩)에는 pause(true)로 멈춘다.

export type PreviewHandle = {
  /** 멈춤/다시 움직임 (게임을 불러오는 동안 CPU를 양보) */
  pause(paused: boolean): void;
  destroy(): void;
};

export type PreviewOptions = {
  reduced: boolean;
  /** 휴대폰 등 거친 포인터 (프레임을 더 낮춘다) */
  mobile: boolean;
  onReady: () => void;
};

export function createPreview(parent: HTMLElement, opts: PreviewOptions): PreviewHandle {
  let destroyed = false;
  let paused = false;
  let frozen = false;
  const fps = opts.mobile ? 20 : 30;
  installRenderGuard();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#141519",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    autoFocus: false,
    fps: { target: fps, limit: fps },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
      // 부모 크기가 0이면 0×0 화면 버퍼를 만들다 예외가 난다 → 최소 1×1
      min: { width: 1, height: 1 },
      autoRound: true,
    },
    render: { powerPreference: "low-power", antialiasGL: false },
    // WorldMap이 충돌 상자를 만들므로 물리는 켜 둔다 (움직이는 몸은 없다)
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    scene: [],
  });

  const apply = () => {
    // 아직 부팅 전이면 첫 화면을 그린 뒤(onReady) 다시 맞춘다
    if (destroyed || !game.isRunning) return;
    if (paused || frozen) game.loop.sleep();
    else game.loop.wake();
  };

  const data: PreviewSceneData = {
    reduced: opts.reduced,
    onReady: () => {
      if (destroyed) return;
      opts.onReady();
      apply();
      // 정지 화면: 보인 뒤 조금 더 그리고(번개·전환 없이) 재운다
      if (opts.reduced)
        window.setTimeout(() => {
          frozen = true;
          apply();
        }, 400);
    },
  };
  game.scene.add("preview", PreviewScene, true, data);
  // 11/22 폰 회전 뒤 캔버스가 예전 크기에 멈추지 않게 (game/viewportSync)
  const offSync = installViewportSync(game);

  return {
    pause(p: boolean) {
      paused = p;
      apply();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      offSync();
      // 잠든 루프는 다음 프레임 정리(pendingDestroy)를 돌리지 못한다 → 깨워서 정리하게.
      // 먼저 destroy로 정리 표시를 한 뒤 깨운다: 깨우면 그 자리에서 한 프레임이 도는데, 표시가 없으면 이미 떼어진(크기 0) 캔버스로
      // 화면 크기를 다시 맞추다 예외가 나 React 정리 중에 오류 화면으로 튕긴다 (운영 오류 기록, 아이폰)
      game.destroy(true);
      try {
        if (game.isRunning) game.loop.wake();
      } catch (e) {
        console.error(e);
      }
    },
  };
}

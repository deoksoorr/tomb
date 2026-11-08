import * as Phaser from "phaser";
import type { GameStartOptions } from "./bridge";
import { BootScene } from "./scenes/BootScene";
import type { GameContext } from "./scenes/context";
import { ShopScene } from "./scenes/ShopScene";
import { WorldScene } from "./scenes/WorldScene";
import { bridge } from "./bridge";
import { isThemeId } from "./theme";

// Phaser 게임 생성. GameCanvas가 브라우저에서만 동적 import 한다 (Phaser는 이 경로로만 로드된다).

export type GameHandle = { destroy(): void };

export function createGame(parent: HTMLElement, opts: GameStartOptions): GameHandle {
  const t = bridge.last("theme:set")?.theme;
  const ctx: GameContext = { opts, disposers: [], disposed: false, theme: isThemeId(t) ? t : "temple" };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#141519",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    autoFocus: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
      autoRound: true,
    },
    render: { powerPreference: "high-performance", antialiasGL: false },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false, fixedStep: false },
    },
    // 입력은 직접 받는다 (키보드: window, 포인터: 캔버스 DOM). Phaser 입력을 켜면 오버레이 터치까지 포인터로 잡는다
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    scene: [BootScene, WorldScene, ShopScene],
  });
  game.registry.set("ctx", ctx);
  // ?debug=1: 콘솔에서 상태를 들여다볼 수 있게 (게임 화면에는 아무것도 그리지 않는다. 수치는 UI의 NetHud가 net:stats로 표시)
  if (opts.debug) (window as unknown as { __tombGame?: Phaser.Game }).__tombGame = game;

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ctx.disposed = true;
      // 탭이 숨겨져 게임 루프가 멈춰 있어도 연결·리스너는 지금 바로 정리한다
      for (const d of ctx.disposers.splice(0)) {
        try {
          d();
        } catch (e) {
          console.error(e);
        }
      }
      game.destroy(true);
    },
  };
}

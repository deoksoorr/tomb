import * as Phaser from "phaser";
import { installWorldTint } from "../../world/worldTint";
import { CampMockScene, type MockOpts } from "./CampMockScene";

// 11/21 시안 전용 (app/dev/camp-mock): 시안 장면 하나만 띄우는 작은 Phaser 게임 (게임 본체 createGame과 같은 화면 설정).

export function bootCampMock(parent: HTMLElement, opts: MockOpts): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#141519",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    banner: false,
    autoFocus: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || window.innerWidth, height: parent.clientHeight || window.innerHeight, min: { width: 1, height: 1 }, autoRound: true },
    render: { powerPreference: "high-performance", antialiasGL: false, preserveDrawingBuffer: true },
    callbacks: { postBoot: (g) => void installWorldTint(g) },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    scene: [],
  });
  game.scene.add("campMock", CampMockScene, true, opts);
  (window as unknown as { __campMock?: unknown }).__campMock = {
    game,
    scene: () => game.scene.getScene("campMock") as unknown as CampMockScene,
  };
  return game;
}

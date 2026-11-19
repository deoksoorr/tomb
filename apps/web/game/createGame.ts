import * as Phaser from "phaser";
import { installBackgroundLoop } from "./backgroundLoop";
import type { GameStartOptions } from "./bridge";
import { installHousing } from "./housing/install";
import { HauntHostScene } from "./haunt/HauntHostScene";
import { HauntScene } from "./haunt/HauntScene";
import { RPG_SCENES } from "./rpg";
import { BootScene } from "./scenes/BootScene";
import type { GameContext } from "./scenes/context";
import { ShopScene } from "./scenes/ShopScene";
import { installRenderGuard } from "./renderGuard";
import { WorldScene } from "./scenes/WorldScene";
import { BusRideScene } from "./bus/BusRideScene";
import { CampScene } from "./camp/CampScene";
import { SeaScene } from "./sea/SeaScene";
import { applyTideQuery, setTideMinute } from "./sea/tideClock";
import { installWorldTint } from "./world/worldTint";
import { installSquirrelRain } from "./fx/SquirrelRain";
import { installPhoto } from "./photo/install";
import { qaUrlAllowed } from "@/lib/qaUrl";

// Phaser 게임 생성. GameCanvas가 브라우저에서만 동적 import 한다 (Phaser는 이 경로로만 로드된다).

export type GameHandle = { destroy(): void };

export function createGame(parent: HTMLElement, opts: GameStartOptions): GameHandle {
  installRenderGuard();
  const ctx: GameContext = { opts, disposers: [], disposed: false };
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
      // 창을 숨기거나 접어 부모 크기가 0이 되면 0×0 화면 버퍼를 만들다 예외가 난다 (Framebuffer Incomplete Attachment) → 최소 1×1
      min: { width: 1, height: 1 },
      autoRound: true,
    },
    render: { powerPreference: "high-performance", antialiasGL: false },
    // 마을 색조를 화면 곱하기 판 대신 셰이더로 (맵은 그대로, 캐릭터는 절반만 — game/world/worldTint)
    callbacks: { postBoot: (g) => void installWorldTint(g) },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false, fixedStep: false },
    },
    // 입력은 직접 받는다 (키보드: window, 포인터: 캔버스 DOM). Phaser 입력을 켜면 오버레이 터치까지 포인터로 잡는다
    input: { keyboard: false, mouse: false, touch: false, gamepad: false, windowEvents: false },
    audio: { noAudio: true },
    // 11/15 캠핑장(CampScene)·버스 창밖 연출(BusRideScene)은 버스를 탈 때만 켜진다 (그림도 그때 굽는다). 11/16 바닷가(SeaScene)도 같다
    scene: [BootScene, WorldScene, ShopScene, ...RPG_SCENES, HauntHostScene, HauntScene, CampScene, SeaScene, BusRideScene],
  });
  game.registry.set("ctx", ctx);
  installHousing(game, ctx); // 하우징: 집 씬 등록 + 월드 ↔ 집 전환 (game/housing)
  // 다른 창을 보는 중(뒤로 간 상태)에는 갱신·그리기를 줄인다 (소리·실시간 연결은 그대로, game/backgroundLoop)
  ctx.disposers.push(installBackgroundLoop(game));
  // 11/16 이스터에그 「다람쥐를 뿌려라」: 실시간 서버가 보낸 squirrels → 지금 보이는 장면에 다람쥐 (game/fx/SquirrelRain)
  ctx.disposers.push(installSquirrelRain(game));
  // 11/19 촬영 모드: 들어갈 때만 game/photo/PhotoController를 불러온다 (평소엔 듣기만)
  ctx.disposers.push(installPhoto(game));
  // ?debug=1: 콘솔에서 상태를 들여다볼 수 있게 (게임 화면에는 아무것도 그리지 않는다. 수치는 UI의 NetHud가 net:stats로 표시)
  if (opts.debug) (window as unknown as { __tombGame?: Phaser.Game }).__tombGame = game;
  // 11/16 바닷가 물때 시험: 주소 ?tide=분 (한 바퀴 안의 분, 0 = 만조 · 90 = 간조), ?debug=1이면 콘솔에서 __tombTide.set(분)·__tombTide.set(null)
  applyTideQuery(window.location.search);
  if (opts.debug && qaUrlAllowed()) (window as unknown as { __tombTide?: { set(min: number | null): void } }).__tombTide = { set: (min) => setTideMinute(min) };

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

import * as Phaser from "phaser";
import { installProcedural, preloadFiles, TEX } from "../assets/manifest";
import { prefersReducedMotion } from "../config";
import type { GameContext } from "./context";

// 텍스처를 코드로 빠르게 생성하고, 라벨용 웹폰트(Galmuri11)가 준비되면 월드로 넘어간다.
// ("묘지 문을 여는 중…" 표시는 UI 몫. 게임은 월드가 보이기 시작할 때 ready를 보낸다)

const FONT_WAIT_MS = 2500;

async function fontsReady(): Promise<void> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts?.load) return;
  const timeout = new Promise<void>((r) => setTimeout(r, FONT_WAIT_MS));
  const load = Promise.all([fonts.load('11px "Galmuri11"'), fonts.load('12px "Galmuri11"')])
    .then(() => undefined)
    .catch(() => undefined);
  await Promise.race([load, timeout]);
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    preloadFiles(this);
  }

  create(): void {
    installProcedural(this);
    const slow = prefersReducedMotion();
    this.anims.create({
      key: "fx-candle-flicker",
      frames: [
        { key: TEX.candle, frame: 0 },
        { key: TEX.candle, frame: 1 },
      ],
      frameRate: slow ? 2 : 6,
      repeat: -1,
    });
    this.anims.create({
      key: "fx-wisp-float",
      frames: [
        { key: TEX.wisp, frame: 0 },
        { key: TEX.wisp, frame: 1 },
      ],
      frameRate: slow ? 1.5 : 4,
      repeat: -1,
    });
    const ctx = this.registry.get("ctx") as GameContext;
    void fontsReady().then(() => {
      // 기다리는 사이 게임이 정리됐으면 아무것도 하지 않는다
      if (!this.sys || !this.sys.game || ctx.disposed) return;
      this.scene.start("world", ctx);
    });
  }
}

import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { prefersReducedMotion } from "../config";
import type { GameContext } from "../scenes/context";
import { avatarColorSpec } from "../sprites/avatar";
import { HAUNT_SCENE_KEY, type HauntResult, type HauntSceneData } from "./HauntScene";

// 귀신의집 진입·복귀를 맡는 보이지 않는 씬 (RpgHostScene과 같은 방식, 게임이 뜰 때부터 켜져 있다).
// haunt:play → 월드 화면이 어두워진 뒤 숨기고(실시간 연결은 그대로, 내 아바타는 문 앞에 멈춘 채) 미로 씬을 띄운다.
// scene:changed "minigame" → 월드가 setAway(true)를 보내 다른 사람 화면에서는 내가 잠시 사라진다 (옛 클라이언트는 문 앞에 보인다).
// 끝나면 haunt:ended를 보내고 미로를 닫은 뒤 월드를 다시 밝힌다 → 귀신의집 문 앞으로 돌아온다.

const FADE_MS = 450;

export class HauntHostScene extends Phaser.Scene {
  private running = false;
  /** 어두워지는 중 (미로를 아직 띄우지 않았다) */
  private pending = false;

  constructor() {
    super({ key: "haunt-host", active: true });
  }

  create(): void {
    const offs = [
      bridge.on("haunt:play", ({ seed }) => this.start(seed)),
      // 어두워지는 사이에 나가기를 누르면 미로를 띄우지 않고 바로 돌아온다 (미로가 뜬 뒤에는 미로 씬이 받는다)
      bridge.on("haunt:quit", () => this.pending && this.end(this.scene.isActive("world") || this.scene.isVisible("world"), { escaped: false, ms: 0, scares: 0 })),
    ];
    const ctx = this.registry.get("ctx") as GameContext | undefined;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      for (const off of offs) off();
    };
    ctx?.disposers.push(cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private start(seed: number): void {
    if (this.running) return;
    const ctx = this.registry.get("ctx") as GameContext | undefined;
    if (!ctx || ctx.disposed) return;
    this.running = true;
    const worldOn = this.scene.isActive("world");
    const world = worldOn ? this.scene.get("world") : null;
    const reduced = prefersReducedMotion();
    const data: HauntSceneData = {
      seed,
      color: avatarColorSpec(ctx.opts.color, bridge.last("look:set")?.dye),
      body: (world as unknown as { player?: { view?: { bodyId?: string } } } | null)?.player?.view?.bodyId ?? ctx.opts.body ?? "hood",
      look: bridge.last("look:set")?.look ?? [],
      reduced,
      onEnd: (result) => this.end(worldOn, result),
    };
    bridge.emit("scene:changed", { scene: "minigame" });
    this.pending = true;
    const go = () => {
      if (!this.running) return;
      this.pending = false;
      if (worldOn) this.scene.setVisible(false, "world");
      this.scene.launch(HAUNT_SCENE_KEY, data);
      this.scene.bringToTop(HAUNT_SCENE_KEY);
    };
    // 화면이 어두워지며 들어간다
    const cam = world?.cameras?.main;
    if (cam) {
      cam.fadeOut(FADE_MS, 0, 0, 0);
      this.time.delayedCall(FADE_MS + 30, go);
    } else go();
  }

  private end(worldOn: boolean, result: HauntResult): void {
    if (!this.running) return;
    this.running = false;
    this.pending = false;
    if (this.scene.isActive(HAUNT_SCENE_KEY)) this.scene.stop(HAUNT_SCENE_KEY);
    const world = this.scene.get("world");
    if (worldOn && world) {
      this.scene.setVisible(true, "world");
      world.cameras.main.resetFX();
      world.cameras.main.fadeIn(700, 0, 0, 0);
    }
    bridge.emit("scene:changed", { scene: "world" });
    bridge.emit("haunt:ended", result);
  }
}

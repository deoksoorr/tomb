import * as Phaser from "phaser";
import type { RpgPlay, RunResult } from "@/lib/rpg/types";
import { bridge } from "../bridge";
import { prefersReducedMotion } from "../config";
import type { GameContext } from "../scenes/context";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { RpgSceneData } from "./base";

// 사냥터 진입·복귀를 맡는 보이지 않는 씬 (게임이 뜰 때부터 켜져 있다).
// rpg:play → 월드를 숨기고(실시간 연결·원격 아바타는 그대로, 내 아바타는 입구에 멈춘 채) 미니게임 씬을 띄운다.
// 판이 끝나면 rpg:ended를 보내고 씬을 닫은 뒤 월드를 다시 보인다 → 입구 앞으로 돌아온다.
// 월드 씬은 건드리지 않는다: 월드 키 입력은 사냥터 오버레이가 ui:blockKeys로 막는다.

export const RPG_SCENE_KEYS = { hunt: "rpg-hunt", bugs: "rpg-bugs", stars: "rpg-stars" } as const;

export class RpgHostScene extends Phaser.Scene {
  private running: string | null = null;

  constructor() {
    super({ key: "rpg-host", active: true });
  }

  create(): void {
    const off = bridge.on("rpg:play", (p) => this.start(p));
    const ctx = this.registry.get("ctx") as GameContext | undefined;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      off();
    };
    ctx?.disposers.push(cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private start(play: RpgPlay): void {
    if (this.running) return;
    const ctx = this.registry.get("ctx") as GameContext | undefined;
    if (!ctx || ctx.disposed) return;
    const key = RPG_SCENE_KEYS[play.game];
    this.running = key;
    const worldOn = this.scene.isActive("world");
    if (worldOn) this.scene.setVisible(false, "world");
    const data: RpgSceneData = {
      play,
      color: ctx.opts.color,
      name: ctx.opts.name,
      body: ctx.opts.body ?? "hood",
      atlas: (this.scene.get("world") as unknown as { atlas?: GlyphAtlas } | null)?.atlas ?? null,
      look: bridge.last("look:set")?.look ?? [],
      reduced: prefersReducedMotion(),
      onEnd: (result, aborted) => this.end(key, worldOn, result, aborted),
    };
    this.scene.launch(key, data);
    this.scene.bringToTop(key);
    bridge.emit("scene:changed", { scene: play.game === "hunt" ? "hunt" : "minigame" });
  }

  private end(key: string, worldOn: boolean, result: RunResult, aborted: boolean): void {
    if (this.running !== key) return;
    this.running = null;
    this.scene.stop(key);
    if (worldOn && this.scene.get("world")) this.scene.setVisible(true, "world");
    bridge.emit("scene:changed", { scene: "world" });
    bridge.emit("rpg:ended", { result, aborted });
  }
}

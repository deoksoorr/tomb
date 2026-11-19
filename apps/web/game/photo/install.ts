import type * as Phaser from "phaser";
import { bridge } from "../bridge";
import type { PhotoController } from "./PhotoController";

// 11/19 촬영 모드 게임 쪽 연결. 평소엔 브리지 이벤트 셋을 듣기만 하고, 처음 촬영 모드에 들어갈 때 PhotoController를 불러와요 (동적 import).

export function installPhoto(game: Phaser.Game): () => void {
  let ctl: PhotoController | null = null;
  let loading: Promise<PhotoController | null> | null = null;
  let dead = false;
  const load = () =>
    (loading ??= import("./PhotoController")
      .then((m) => (dead ? null : (ctl = new m.PhotoController(game))))
      .catch((e: unknown) => {
        console.error(e);
        loading = null;
        return null;
      }));
  const photoOn = () => bridge.last("photo:mode")?.on === true;
  const offs = [
    bridge.on("photo:mode", ({ on }) => {
      if (on) void load().then((c) => photoOn() && c?.enter());
      else ctl?.exit();
    }),
    bridge.on("photo:set", (f) => {
      if (photoOn()) void load().then((c) => photoOn() && c?.set(f));
    }),
    bridge.on("photo:shoot", () => {
      void load().then((c) => (c ? c.shoot() : bridge.emit("photo:shot", { blob: null, width: 0, height: 0 })));
    }),
  ];
  return () => {
    dead = true;
    for (const off of offs) off();
    ctl?.destroy();
    ctl = null;
  };
}

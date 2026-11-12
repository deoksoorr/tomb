import type * as Phaser from "phaser";
import { bridge } from "../bridge";

// 즐겨찾기 표현 원형 목록(U 키)이 열려 있는 동안 내 캐릭터의 화면 위치(CSS px)를 UI에 알린다 (me:screen).
// 월드(WorldScene)와 방(RoomPresence: 마을·집)이 같이 쓴다. 닫혀 있으면 아무것도 계산하지 않는다.

/** 발밑에서 몸 가운데까지 (월드 px) — 원형 목록이 몸을 감싸게 */
const BODY_LIFT = 12;

export class MeScreen {
  private open = bridge.last("ui:radial")?.open ?? false;
  private lastX = NaN;
  private lastY = NaN;
  private readonly off: () => void;

  constructor(private readonly scene: Phaser.Scene) {
    this.off = bridge.on("ui:radial", ({ open }) => {
      this.open = open;
      this.lastX = this.lastY = NaN;
    });
  }

  /** 매 프레임. (wx, wy) = 내 발밑 월드 좌표 */
  update(wx: number, wy: number): void {
    if (!this.open) return;
    const cam = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    const r = canvas.getBoundingClientRect();
    const k = r.width / Math.max(1, canvas.width);
    const x = r.left + ((wx - cam.worldView.x) * cam.zoom + cam.x) * k;
    const y = r.top + ((wy - BODY_LIFT - cam.worldView.y) * cam.zoom + cam.y) * k;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (Math.abs(x - this.lastX) < 0.5 && Math.abs(y - this.lastY) < 0.5) return;
    this.lastX = x;
    this.lastY = y;
    bridge.emit("me:screen", { x, y });
  }

  destroy(): void {
    this.off();
  }
}

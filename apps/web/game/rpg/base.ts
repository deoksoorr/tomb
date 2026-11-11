import * as Phaser from "phaser";
import type { RpgAction, RpgHud, RpgPlay, RunResult } from "@/lib/rpg/types";
import { bridge } from "../bridge";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { RpgSfx } from "./sfx";

// 사냥터·미니게임 씬의 공통 뼈대: 입력(키보드·조이스틱·탭·버튼), 멈춤, 경과 시간, HUD 보내기, 끝내기.
// 월드의 InputHub는 쓰지 않는다 (월드 키 입력은 오버레이가 ui:blockKeys로 막아 둔 상태).
// 시간은 멈춤을 뺀 게임 시간으로 잰다 → 결과의 durationMs는 늘 서버가 잰 시간보다 짧다.

export type RpgSceneData = {
  play: RpgPlay;
  color: string;
  name: string;
  body: string;
  look: readonly string[];
  /** 월드 씬의 이름표 글자 아틀라스 (같은 텍스처를 쓴다, 새로 만들면 월드 이름표가 깨진다). 없으면 이름표·함께 사냥 없이 */
  atlas: GlyphAtlas | null;
  reduced: boolean;
  onEnd(result: RunResult, aborted: boolean): void;
};

const HUD_MS = 125;
const FONT = '"Galmuri11", "Galmuri9", monospace';

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

export abstract class RpgScene extends Phaser.Scene {
  protected data0!: RpgSceneData;
  protected sfx!: RpgSfx;
  protected readonly keys = new Set<string>();
  protected joy = { x: 0, y: 0 };
  /** 멈춤을 뺀 경과 ms */
  protected elapsed = 0;
  protected paused = false;
  protected ended = false;
  private hudAt = 0;
  private offs: (() => void)[] = [];

  init(data: RpgSceneData): void {
    this.data0 = data;
    this.keys.clear();
    this.joy = { x: 0, y: 0 };
    this.elapsed = 0;
    this.paused = false;
    this.ended = false;
    this.hudAt = 0;
  }

  protected get play(): RpgPlay {
    return this.data0.play;
  }

  protected get limitMs(): number {
    return this.play.timeLimitSec * 1000;
  }

  /** 하위 씬의 create() 첫 줄에서 부른다 */
  protected setupCommon(): void {
    this.sfx = new RpgSfx();
    // 같은 씬 객체를 다시 쓰므로, 지난 판이 멈춤 상태로 끝났으면 시계·트윈이 멈춘 채 남는다
    this.time.paused = false;
    this.tweens.resumeAll();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.offs = [
      bridge.on("rpg:action", (a) => !this.paused && !this.ended && this.onAction(a)),
      bridge.on("rpg:joystick", ({ x, y }) => (this.joy = { x: clamp1(x), y: clamp1(y) })),
      bridge.on("rpg:tap", ({ x, y }) => this.handleTap(x, y)),
      bridge.on("rpg:pause", ({ paused }) => this.setPaused(paused)),
      bridge.on("rpg:quit", () => this.finish(true)),
    ];
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupCommon, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanupCommon, this);
  }

  private cleanupCommon(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    for (const off of this.offs.splice(0)) off();
    this.sfx?.destroy();
  }

  private readonly clearKeys = () => this.keys.clear();

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.ended || isEditable(e.target) || document.querySelector("dialog[open]")) return;
    if (e.code === "Escape") return; // 멈춤 메뉴는 오버레이가 연다
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    if (this.paused) return;
    if (!e.repeat) this.onKey(e.code);
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleTap(cx: number, cy: number): void {
    if (this.paused || this.ended) return;
    const p = this.toWorld(cx, cy);
    this.onTap(p.x, p.y);
  }

  /** 화면(client) 좌표 → 월드 좌표 (카메라가 움직이므로 쓸 때마다 다시 바꾼다) */
  protected toWorld(cx: number, cy: number): { x: number; y: number } {
    const r = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(((cx - r.left) * this.game.canvas.width) / Math.max(1, r.width), ((cy - r.top) * this.game.canvas.height) / Math.max(1, r.height));
    return { x: p.x, y: p.y };
  }

  protected setPaused(p: boolean): void {
    if (this.ended || this.paused === p) return;
    this.paused = p;
    this.keys.clear();
    if (p) {
      this.tweens.pauseAll();
      this.time.paused = true;
    } else {
      this.tweens.resumeAll();
      this.time.paused = false;
    }
  }

  /** 키보드 축 + 조이스틱 중 큰 쪽 (-1..1) */
  protected axis(): { x: number; y: number } {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    if (Math.hypot(this.joy.x, this.joy.y) > Math.hypot(x, y)) return { ...this.joy };
    return { x, y };
  }

  /** 매 프레임: 멈춤이 아니면 시간을 쌓고 HUD를 보낸다. false면 이번 프레임은 건너뛴다 */
  protected tickCommon(delta: number): boolean {
    if (this.ended || this.paused) return false;
    const dt = Math.min(delta, 100);
    this.elapsed += dt;
    if (this.elapsed - this.hudAt >= HUD_MS) {
      this.hudAt = this.elapsed;
      bridge.emit("rpg:hud", this.hud());
    }
    return true;
  }

  /** 끝내기 (한 번만). 결과를 넘기면 호스트가 이 씬을 닫고 월드를 다시 보인다 */
  protected finish(aborted = false): void {
    if (this.ended) return;
    this.ended = true;
    bridge.emit("rpg:hud", this.hud());
    const result = this.result();
    this.data0.onEnd(result, aborted);
  }

  /** 화면 1:1 크기 글자 (줌을 거꾸로 곱해 픽셀이 뭉개지지 않게) */
  protected label(x: number, y: number, text: string, color = "#f2ead3", px = 12): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${px}px`,
      color,
      stroke: "#0a0b10",
      strokeThickness: 3,
      resolution: 1,
    });
    t.setOrigin(0.5, 1).setScale(1 / this.cameras.main.zoom);
    return t;
  }

  /** 떠오르며 사라지는 숫자·글자 */
  protected floatText(x: number, y: number, text: string, color: string, px = 12): void {
    const t = this.label(x, y, text, color, px).setDepth(1e6);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  protected onResize(): void {}
  protected abstract onKey(code: string): void;
  protected abstract onAction(a: RpgAction): void;
  protected abstract onTap(x: number, y: number): void;
  protected abstract hud(): RpgHud;
  protected abstract result(): RunResult;
}

function clamp1(v: number): number {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}

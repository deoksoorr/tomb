import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { avFrame, makePlayer, RTEX } from "../rpg/sprites";
import { DARK_LIGHT_PX, DARK_SIZE, ensureHauntTextures, HTEX, setMazeTexture } from "./hauntArt";
import { HauntSound } from "./hauntSound";
import {
  clearLine,
  GHOST_REST_MS,
  HAUNT_TILE,
  heartbeatMs,
  isWall,
  makeMaze,
  SCARE_FACE_IN_MS,
  SCARE_FACE_OUT_MS,
  SCARE_GAP_MS,
  scareSchedule,
  type GhostPlan,
  type Maze,
} from "./maze";

// 귀신의집 미로 (혼자 하는 공포 미로). HauntHostScene이 월드를 숨기고 띄운다 — 서버로 위치를 보내지 않는다.
//  - 매우 어둡다: 내 둘레만 흔들리는 촛불 빛 원(어둠 가리개 + 바깥 네 면을 검게), 가끔 촛불이 꺼졌다 켜진다, 벽을 스치는 그림자
//  - 소리: 웅웅거리는 바탕·바닥 삐걱임·멀리서 속삭임·심장 박동(귀신·출구가 가까울수록 빨라진다) — hauntSound.ts
//  - 귀신: 정해진 길을 오가는 순찰 / 모퉁이·막다른 곳에 숨음. 가까이 가면 깜짝 놀래키기(maze.ts scareSchedule):
//    얼굴이 화면 가득 커졌다 사라지기 2~3번 + 흔들림 + 붉은 번쩍임(초당 3번 이하) + 비명·쿵, 잠깐 조작이 굳는다.
//    움직임 줄이기면 커지기·흔들림·번쩍임 없이 천천히 나타났다 사라지기만 (소리는 효과음 음량을 따른다).
//  - 출구(바깥 벽의 달빛 문)에 닿으면 밝아지며 끝 → 걸린 시간·놀란 횟수를 넘긴다. 나가기(haunt:quit)로 중간에 그만둘 수 있다.

export type HauntResult = { escaped: boolean; ms: number; scares: number };
export type HauntSceneData = {
  seed: number;
  color: string;
  body: string;
  look: readonly string[];
  reduced: boolean;
  onEnd(result: HauntResult): void;
};

export const HAUNT_SCENE_KEY = "haunt-maze";

const T = HAUNT_TILE;
const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
const WALK_SPEED = 56;
const RUN_SPEED = 80;
/** 발 상자 반폭·위로 높이 */
const FOOT_HX = 4;
const FOOT_UP = 4;
const LIGHT_R = 36;
const DEPTH_GLOW = 90_000;
const DEPTH_DARK = 100_000;
const DEPTH_OVER = 100_010;
const DEPTH_SCARE = 200_000;
const HUD_MS = 250;
const PATROL_SPEED = 20;
const CHASE_SPEED = 25;

type Ghost = {
  plan: GhostPlan;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  /** 순찰: 다음에 갈 길 칸 번호와 방향 */
  idx: number;
  step: 1 | -1;
  restUntil: number;
  /** 숨음: 다시 놀래킬 준비 (쉬는 시간이 지나고 내가 한 번 멀어져야) */
  armed: boolean;
  /** 지금 보이는 정도 0..1 (부드럽게 따라간다) */
  vis: number;
  phase: number;
};

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

const tileCenter = (p: { tx: number; ty: number }) => ({ x: p.tx * T + T / 2, y: p.ty * T + T / 2 + 3 });

export class HauntScene extends Phaser.Scene {
  private d!: HauntSceneData;
  private maze!: Maze;
  private sound2: HauntSound | null = null;
  private readonly keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private offs: (() => void)[] = [];

  private px = 0;
  private py = 0;
  private dirRow: number = DIR_ROW.up;
  private walkT = 0;
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private ghosts: Ghost[] = [];

  private dark!: Phaser.GameObjects.Image;
  private darkEdge!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private moon!: Phaser.GameObjects.Image;
  private flames: { flame: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; ph: number }[] = [];
  private veil!: Phaser.GameObjects.Rectangle;
  private red!: Phaser.GameObjects.Rectangle;
  private face!: Phaser.GameObjects.Image;
  private bright!: Phaser.GameObjects.Rectangle;

  private elapsed = 0;
  private hudAt = 0;
  private scares = 0;
  private ended = false;
  private leaving = false;
  private frozenUntil = 0;
  private lastScareAt = -Infinity;
  /** 촛불 세기 배수 (꺼짐 = 0에 가깝게) */
  private lightK = 1;
  private nextBeat = 0;
  private nextCreak = 0;
  private nextWhisper = 0;
  private nextBlackout = 0;
  private nextShade = 0;
  private stepDist = 0;
  private stepNext = 120;
  private nearGhostPx = Infinity;
  private faceJitter = 0;

  constructor() {
    super({ key: HAUNT_SCENE_KEY });
  }

  init(data: HauntSceneData): void {
    this.d = data;
    this.keys.clear();
    this.joy = { x: 0, y: 0 };
    this.elapsed = 0;
    this.hudAt = 0;
    this.scares = 0;
    this.ended = false;
    this.leaving = false;
    this.frozenUntil = 0;
    this.lastScareAt = -Infinity;
    this.lightK = 1;
    this.ghosts = [];
    this.flames = [];
    this.stepDist = 0;
  }

  create(): void {
    const d = this.d;
    this.time.paused = false;
    this.tweens.resumeAll();
    this.maze = makeMaze(d.seed);
    const m = this.maze;
    ensureHauntTextures(this);
    setMazeTexture(this, m);
    makePlayer(this, d.color, d.look, d.body);
    this.cameras.main.setBackgroundColor("#000000");
    this.add.image(0, 0, HTEX.maze).setOrigin(0, 0).setDepth(-100_000);

    const s = tileCenter(m.start);
    this.px = s.x;
    this.py = s.y;
    this.dirRow = DIR_ROW.up;
    this.shadow = this.add.ellipse(this.px, this.py, 10, 4, 0x000000, 0.45).setDepth(-50_000);
    this.player = this.add.sprite(this.px, this.py, RTEX.player, avFrame(this.dirRow, 0)).setOrigin(0.5, 19 / 20);

    // 귀신
    for (const plan of m.ghosts) {
      const p = tileCenter(plan.path[0]);
      const sprite = this.add.sprite(p.x, p.y, HTEX.ghost(plan.look), 0).setOrigin(0.5, 1).setAlpha(0);
      this.ghosts.push({ plan, sprite, x: p.x, y: p.y, idx: Math.min(1, plan.path.length - 1), step: 1, restUntil: 0, armed: true, vis: 0, phase: Math.random() * 6 });
    }

    // 촛불 (바닥 장식의 불꽃만 어둠 위로 — 어둠 속 작은 불빛들)
    for (const dc of m.decor) {
      if (dc.kind !== "candle") continue;
      const x = dc.tx * T + 7.5;
      const y = dc.ty * T + 8;
      const halo = this.add.image(x, y, HTEX.glow).setDisplaySize(30, 30).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.22).setDepth(DEPTH_OVER);
      const flame = this.add.image(x, y - 1, HTEX.flame).setOrigin(0.5, 1).setDepth(DEPTH_OVER + 1);
      this.flames.push({ flame, halo, ph: Math.random() * 10 });
    }

    // 빛과 어둠
    this.glow = this.add.image(this.px, this.py, HTEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_GLOW).setAlpha(0.2);
    this.dark = this.add.image(this.px, this.py, HTEX.dark).setDepth(DEPTH_DARK);
    this.darkEdge = this.add.graphics().setDepth(DEPTH_DARK);
    const ex = m.exit.tx * T + T / 2;
    const ey = m.exit.ty * T + T / 2;
    this.moon = this.add.image(ex, ey, HTEX.moon).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_OVER).setDisplaySize(70, 70).setAlpha(0);

    // 놀래키기·끝 연출용 (화면에 붙는다)
    // 1×1 사각형을 배율로 늘려 화면을 덮는다 (매 프레임 카메라가 보는 곳 가운데에 둔다 — pinOverlay)
    this.veil = this.add.rectangle(0, 0, 1, 1, 0x000000, 1).setDepth(DEPTH_SCARE).setAlpha(0);
    this.face = this.add.image(0, 0, HTEX.face).setDepth(DEPTH_SCARE + 1).setAlpha(0);
    this.red = this.add.rectangle(0, 0, 1, 1, 0x8a0000, 1).setDepth(DEPTH_SCARE + 2).setAlpha(0);
    this.bright = this.add.rectangle(0, 0, 1, 1, 0xe8eef8, 1).setDepth(DEPTH_SCARE + 3).setAlpha(0);

    const cam = this.cameras.main;
    cam.setBounds(-T * 2, -T * 2, m.cols * T + T * 4, m.rows * T + T * 4);
    this.fit();
    cam.centerOn(this.px, this.py);
    cam.fadeIn(900, 0, 0, 0);

    // 소리
    this.sound2 = new HauntSound();
    this.sound2.startBed();
    const now = this.time.now;
    this.nextBeat = now + 1500;
    this.nextCreak = now + 3000 + Math.random() * 4000;
    this.nextWhisper = now + 7000 + Math.random() * 6000;
    this.nextBlackout = now + 14_000 + Math.random() * 8000;
    this.nextShade = now + 10_000 + Math.random() * 8000;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearKeys);
    this.offs = [
      bridge.on("haunt:joystick", ({ x, y }) => (this.joy = { x: clamp1(x), y: clamp1(y) })),
      // 출구로 밝아지는 중이면 나가기를 무시한다 (빠져나온 기록이 사라지지 않게)
      bridge.on("haunt:quit", () => !this.leaving && this.finish(false)),
    ];
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
  }

  private cleanup(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearKeys);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.fit, this);
    for (const off of this.offs.splice(0)) off();
    this.sound2?.destroy();
    this.sound2 = null;
  }

  private readonly clearKeys = () => this.keys.clear();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.ended || isEditable(e.target) || document.querySelector("dialog[open]")) return;
    if (e.code === "Escape") return; // 나가기는 오버레이가 받는다
    if (/^(Arrow|Space)/.test(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  /** 화면 크기에 맞춰 줌 (작은 화면은 2배, 큰 화면은 최대 4.5배) — 화면에 붙는 덮개 크기도 다시 */
  private fit(): void {
    const cam = this.cameras.main;
    const z = Math.max(2, Math.min(4.5, Math.floor((Math.min(cam.width, cam.height) / 220) * 2) / 2));
    cam.setZoom(z);
    // 흔들림만큼 밀려도 가장자리가 비지 않게 넉넉히
    const w = (cam.width / z) * 1.4 + 8;
    const h = (cam.height / z) * 1.4 + 8;
    for (const r of [this.veil, this.red, this.bright]) r.setScale(w, h);
  }

  private axis(): { x: number; y: number; joy: boolean } {
    const k = this.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    const mg = Math.hypot(x, y);
    if (mg > 1) {
      x /= mg;
      y /= mg;
    }
    if (Math.hypot(this.joy.x, this.joy.y) > Math.hypot(x, y)) return { ...this.joy, joy: true };
    return { x, y, joy: false };
  }

  private blocked(x: number, y: number): boolean {
    const m = this.maze;
    const xs = [x - FOOT_HX, x + FOOT_HX];
    const ys = [y - FOOT_UP, y];
    for (const cx of xs) for (const cy of ys) if (isWall(m, Math.floor(cx / T), Math.floor(cy / T))) return true;
    return false;
  }

  update(_t: number, delta: number): void {
    if (this.ended) return;
    const dt = Math.min(delta, 100);
    const now = this.time.now;
    if (!this.leaving) this.elapsed += dt;
    if (this.elapsed - this.hudAt >= HUD_MS) {
      this.hudAt = this.elapsed;
      bridge.emit("haunt:hud", { ms: this.elapsed, scares: this.scares });
    }

    // ── 나 ──
    const a = this.leaving || now < this.frozenUntil ? { x: 0, y: 0, joy: false } : this.axis();
    const mag = Math.hypot(a.x, a.y);
    const moving = mag > 0.15;
    if (moving) {
      // 키보드는 Shift를 누르면, 조이스틱은 끝까지 밀면 뛴다
      const run = a.joy ? mag > 0.92 : this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      const sp = (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag);
      const step = (sp * dt) / 1000;
      const nx = this.px + (a.x / mag) * step;
      if (!this.blocked(nx, this.py)) this.px = nx;
      const ny = this.py + (a.y / mag) * step;
      if (!this.blocked(this.px, ny)) this.py = ny;
      this.dirRow = Math.abs(a.x) > Math.abs(a.y) ? (a.x < 0 ? DIR_ROW.left : DIR_ROW.right) : a.y < 0 ? DIR_ROW.up : DIR_ROW.down;
      this.walkT += dt;
      this.stepDist += (sp * dt) / 1000;
      if (this.stepDist >= this.stepNext) {
        this.stepDist = 0;
        this.stepNext = 90 + Math.random() * 90;
        if (Math.random() < 0.4) this.sound2?.creak((Math.random() - 0.5) * 0.4, 0.6);
      }
    }
    this.player.setFrame(avFrame(this.dirRow, moving ? 2 + (Math.floor(this.walkT / 120) % 4) : Math.floor(now / 500) % 2));
    this.player.setPosition(Math.round(this.px), Math.round(this.py)).setDepth(this.py);
    this.shadow.setPosition(this.px, this.py);
    this.cameras.main.centerOn(this.px, this.py - 6);

    // ── 출구 ──
    const m = this.maze;
    const ex = m.exit.tx * T + T / 2;
    const ey = m.exit.ty * T + T / 2;
    const exitPx = Math.hypot(ex - this.px, ey - this.py);
    this.moon.setAlpha(Math.max(0, 0.6 * (1 - exitPx / 210)) * (0.85 + 0.15 * Math.sin(now / 400)));
    if (!this.leaving && Math.floor(this.px / T) === m.exit.tx && Math.floor((this.py - 2) / T) === m.exit.ty) this.escape();

    // ── 귀신 ──
    this.updateGhosts(now, dt);

    // ── 분위기 ──
    this.updateAmbience(now, exitPx);
    this.updateLight(now);
    this.pinOverlay();
  }

  /** 화면 덮개(검은 막·얼굴·붉은 번쩍임·밝아짐)를 카메라가 보는 곳 가운데에 */
  private pinOverlay(): void {
    const v = this.cameras.main.worldView;
    for (const r of [this.veil, this.red, this.bright]) r.setPosition(v.centerX, v.centerY);
    this.face.setPosition(v.centerX + this.faceJitter, v.centerY + this.faceJitter);
  }

  private updateGhosts(now: number, dt: number): void {
    const m = this.maze;
    const me = { tx: Math.floor(this.px / T), ty: Math.floor((this.py - 2) / T) };
    let nearest = Infinity;
    for (const g of this.ghosts) {
      const resting = now < g.restUntil;
      const dist = Math.hypot(g.x - this.px, g.y - this.py);
      const gt = { tx: Math.floor(g.x / T), ty: Math.floor((g.y - 3) / T) };
      const sight = dist < 90 && clearLine(m, gt, me);
      if (g.plan.kind === "patrol") {
        let tx: number;
        let ty: number;
        let speed = PATROL_SPEED;
        if (sight && !resting && !this.leaving) {
          // 나를 보면 천천히 다가온다 (걷기보다 훨씬 느리다 — 돌아서 도망칠 수 있다)
          tx = this.px;
          ty = this.py;
          speed = CHASE_SPEED;
        } else {
          const p = tileCenter(g.plan.path[g.idx]);
          tx = p.x;
          ty = p.y;
          if (Math.hypot(tx - g.x, ty - g.y) < 1) {
            if (g.idx + g.step < 0 || g.idx + g.step >= g.plan.path.length) g.step = g.step === 1 ? -1 : 1;
            g.idx = Math.max(0, Math.min(g.plan.path.length - 1, g.idx + g.step));
          }
        }
        const dx = tx - g.x;
        const dy = ty - g.y;
        const dl = Math.hypot(dx, dy);
        if (dl > 0.01) {
          const k = Math.min(dl, (speed * dt) / 1000) / dl;
          g.x += dx * k;
          g.y += dy * k;
          g.sprite.setFlipX(dx < -0.01 ? true : dx > 0.01 ? false : g.sprite.flipX);
        }
        g.vis += ((resting ? 0 : 0.85) - g.vis) * Math.min(1, dt / 300);
        if (!resting && !this.leaving && dist < 15) this.scare(g, now);
      } else {
        // 숨음: 쉬는 시간이 끝나고 내가 한 번 멀어져야 다시 준비
        if (!g.armed && !resting && dist > 72) g.armed = true;
        g.vis += (0 - g.vis) * Math.min(1, dt / 250);
        if (g.armed && !this.leaving && (dist < 18 || (dist < 34 && sight))) this.scare(g, now);
      }
      if (!resting) nearest = Math.min(nearest, dist);
      // 둥실둥실 + 가끔 깜빡 (흐려졌다 돌아온다 — 번쩍임은 아니다)
      const bob = Math.sin(now / 420 + g.phase) * 1.5;
      const flick = Math.sin(now / 97 + g.phase * 3) > 0.93 ? 0.45 : 1;
      g.sprite
        .setPosition(Math.round(g.x), Math.round(g.y + bob))
        .setDepth(g.y)
        .setFrame(Math.floor(now / 320 + g.phase) % 2)
        .setAlpha(g.vis * flick);
    }
    this.nearGhostPx = nearest;
  }

  /** 깜짝 놀래키기 (같은 귀신은 쉬었다 다시, 어떤 귀신이든 연달아는 아니게) */
  private scare(g: Ghost, now: number): void {
    if (now - this.lastScareAt < SCARE_GAP_MS || now < g.restUntil) return;
    this.lastScareAt = now;
    g.restUntil = now + GHOST_REST_MS;
    g.armed = false;
    this.scares++;
    bridge.emit("haunt:hud", { ms: this.elapsed, scares: this.scares });
    const reduced = this.d.reduced;
    const steps = scareSchedule(reduced);
    const release = steps.find((s) => s.kind === "release")?.at ?? 1000;
    this.frozenUntil = now + release;
    // 귀신이 내 앞으로 확 다가선다 (그 뒤 사라진다)
    g.x = this.px + (g.x < this.px ? -9 : 9);
    g.y = this.py + 1;
    g.vis = 1;
    // 순찰 귀신은 쉬는 동안 길 저쪽 끝으로 옮겨 간다
    if (g.plan.kind === "patrol") {
      const far = g.plan.path[0];
      const near = g.plan.path[g.plan.path.length - 1];
      const a = tileCenter(far);
      const b = tileCenter(near);
      const pick = Math.hypot(a.x - this.px, a.y - this.py) > Math.hypot(b.x - this.px, b.y - this.py) ? 0 : g.plan.path.length - 1;
      this.time.delayedCall(release + 200, () => {
        const p = tileCenter(g.plan.path[pick]);
        g.x = p.x;
        g.y = p.y;
        g.idx = pick;
        g.step = pick === 0 ? 1 : -1;
      });
    }
    const cam = this.cameras.main;
    const base = Math.min(cam.width, cam.height) / 64 / cam.zoom;
    const tint = Phaser.Utils.Array.GetRandom([0xffffff, 0xd8f0e0, 0xe0e4ff]);
    this.tweens.killTweensOf([this.face, this.veil, this.red]);
    this.face.setTint(tint);
    this.tweens.add({ targets: this.veil, alpha: reduced ? 0.55 : 0.8, duration: reduced ? 300 : 60 });
    this.tweens.add({ targets: this.veil, alpha: 0, duration: 400, delay: release - 150 });
    for (const st of steps) {
      this.time.delayedCall(st.at, () => {
        if (this.ended) return;
        switch (st.kind) {
          case "scream":
            this.sound2?.scream();
            break;
          case "thud":
            this.sound2?.thud();
            break;
          case "shake":
            cam.shake(620, 0.016);
            break;
          case "red":
            this.red.setAlpha(0);
            this.tweens.add({ targets: this.red, alpha: 0.34, duration: 60, yoyo: true, hold: 40, ease: "Quad.easeOut" });
            break;
          case "faceIn":
            if (reduced) {
              this.face.setScale(base * 0.8).setAlpha(0);
              this.tweens.add({ targets: this.face, alpha: 0.92, duration: 300 });
            } else {
              this.faceJitter = ((Math.random() - 0.5) * 8) / cam.zoom;
              this.face.setScale(base * 0.6).setAlpha(0);
              this.tweens.add({ targets: this.face, alpha: 1, scale: base * 1.15, duration: SCARE_FACE_IN_MS, ease: "Quad.easeOut" });
            }
            break;
          case "faceOut":
            this.tweens.add({ targets: this.face, alpha: 0, duration: reduced ? 350 : SCARE_FACE_OUT_MS });
            break;
          case "release":
            this.faceJitter = 0;
            break;
        }
      });
    }
  }

  private updateAmbience(now: number, exitPx: number): void {
    const s = this.sound2;
    if (!s || this.leaving) return;
    if (now >= this.nextBeat) {
      const ms = heartbeatMs(this.nearGhostPx, exitPx);
      s.heartbeat(Math.max(0, Math.min(1, (1150 - ms) / 720)));
      this.nextBeat = now + ms;
    }
    if (now >= this.nextCreak) {
      s.creak((Math.random() - 0.5) * 1.6, 0.8);
      this.nextCreak = now + 5000 + Math.random() * 8000;
    }
    if (now >= this.nextWhisper) {
      s.whisper(Math.random() < 0.5 ? -0.8 : 0.8);
      this.nextWhisper = now + 9000 + Math.random() * 10_000;
    }
    const calm = now - this.lastScareAt > 3000;
    if (now >= this.nextBlackout && calm) {
      this.blackout();
      this.nextBlackout = now + 20_000 + Math.random() * 15_000;
    }
    if (now >= this.nextShade && calm) {
      this.shadePass();
      this.nextShade = now + 13_000 + Math.random() * 13_000;
    }
  }

  /** 촛불이 꺼졌다 켜진다. 움직임 줄이기면 천천히 어두워졌다 돌아오기만 */
  private blackout(): void {
    this.sound2?.puff();
    if (Math.random() < 0.5) this.time.delayedCall(500, () => this.sound2?.whisper((Math.random() - 0.5) * 0.6));
    this.tweens.killTweensOf(this);
    if (this.d.reduced) {
      this.tweens.chain({
        targets: this,
        tweens: [
          { lightK: 0.2, duration: 500 },
          { lightK: 0.2, duration: 800 },
          { lightK: 1, duration: 600 },
        ],
      });
      return;
    }
    // 꺼짐(0.05) → 잠깐 켜짐 → 다시 꺼짐 → 켜짐 : 바뀜이 1초에 3번을 넘지 않게
    const set = (k: number) => () => (this.lightK = k);
    set(0.05)();
    this.time.delayedCall(380, set(1));
    this.time.delayedCall(720, set(0.05));
    this.time.delayedCall(1700, set(1));
  }

  /** 벽 그림자가 빛 가장자리를 스쳐 지나간다 */
  private shadePass(): void {
    const left = Math.random() < 0.5;
    this.sound2?.swoosh(left ? 0.7 : -0.7);
    if (this.d.reduced) return;
    const y = this.py - 10 + (Math.random() - 0.5) * 16;
    const r = LIGHT_R * 0.9;
    const sh = this.add
      .image(this.px + (left ? r : -r), y, HTEX.shade)
      .setDepth(DEPTH_GLOW - 1)
      .setAlpha(0)
      .setScale(1.2, 1.4);
    this.tweens.add({ targets: sh, alpha: 0.55, duration: 160, yoyo: true, hold: 300 });
    this.tweens.add({ targets: sh, x: this.px + (left ? -r : r), duration: 640, ease: "Sine.easeInOut", onComplete: () => sh.destroy() });
  }

  private updateLight(now: number): void {
    const flick = 1 + 0.05 * Math.sin(now / 90) + 0.04 * Math.sin(now / 37 + 1.3) + (Math.random() - 0.5) * 0.03;
    const r = Math.max(4, LIGHT_R * flick * this.lightK);
    const cx = this.px + (Math.random() - 0.5) * 0.6;
    const cy = this.py - 9;
    const s = r / DARK_LIGHT_PX;
    const half = (DARK_SIZE * s) / 2;
    this.dark.setPosition(cx, cy).setScale(s);
    // 가리개 바깥은 통째로 검게
    const g = this.darkEdge;
    const BIG = 4000;
    g.clear();
    g.fillStyle(0x000000, 1);
    // 가리개 가장자리와 2px 겹쳐 이음매가 비치지 않게
    const e = half - 2;
    g.fillRect(cx - e - BIG, cy - e - BIG, BIG * 2 + e * 2, BIG);
    g.fillRect(cx - e - BIG, cy + e, BIG * 2 + e * 2, BIG);
    g.fillRect(cx - e - BIG, cy - e, BIG, e * 2);
    g.fillRect(cx + e, cy - e, BIG, e * 2);
    this.glow
      .setPosition(cx, cy)
      .setDisplaySize(r * 2.6, r * 2.6)
      .setAlpha(0.2 * Math.min(1, this.lightK) * flick);
    for (const f of this.flames) {
      const k = 0.85 + 0.15 * Math.sin(now / 70 + f.ph) + (Math.random() - 0.5) * 0.1;
      f.flame.setScale(1, k);
      f.halo.setAlpha(0.2 * k);
    }
  }

  /** 출구: 밝아지며 끝 */
  private escape(): void {
    this.leaving = true;
    this.sound2?.stopBed();
    this.sound2?.relief();
    this.tweens.add({ targets: this, lightK: 3, duration: 900 });
    this.tweens.add({ targets: this.bright, alpha: 1, duration: 1000, ease: "Sine.easeIn", onComplete: () => this.finish(true) });
  }

  private finish(escaped: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.keys.clear();
    bridge.emit("haunt:hud", { ms: this.elapsed, scares: this.scares });
    this.d.onEnd({ escaped, ms: Math.round(this.elapsed), scares: this.scares });
  }
}

function clamp1(v: number): number {
  return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}


import * as Phaser from "phaser";
import { bridge } from "../bridge";
import { avFrame, makePlayer, RTEX } from "../rpg/sprites";
import { shakeEnabled } from "@/lib/shakePref";
import { faceTex, ghostTex } from "./ghostArt";
import type { GhostLook } from "./ghostKinds";
import { DARK_LIGHT_PX, DARK_SIZE, ensureHauntTextures, HTEX, setMazeTexture } from "./hauntArt";
import { HauntSound, type ScreamVoice } from "./hauntSound";
import {
  clearLine,
  distances,
  GHOST_REST_MS,
  HAUNT_TILE,
  heartbeatMs,
  isWall,
  makeMaze,
  SCARE_FACE_IN_MS,
  SCARE_FACE_OUT_MS,
  SCARE_GAP_MS,
  scareSchedule,
  stepToward,
  type GhostPlan,
  type Maze,
} from "./maze";

// 귀신의집 미로 (혼자 하는 공포 미로). HauntHostScene이 월드를 숨기고 띄운다 — 서버로 위치를 보내지 않는다.
//  - 매우 어둡다: 내 둘레만 흔들리는 촛불 빛 원(어둠 가리개 + 바깥 네 면을 검게), 가끔 촛불이 꺼졌다 켜진다, 벽을 스치는 그림자
//  - 소리: 웅웅거리는 바탕·바닥 삐걱임·멀리서 속삭임·심장 박동(귀신·출구가 가까울수록 빨라진다) — hauntSound.ts
//  - 귀신 10종(ghostKinds.ts — 판마다 섞이고 안쪽일수록 무섭다). 종류마다 모습·움직임·나타나는 방식·소리가 다르다:
//      숨음: 천장의 여자(내 앞에 거꾸로 툭 떨어짐) · 벽 속의 손(둘레 벽에서 손들이 뻗어 나옴) · 거울(속의 그것이 따로 움직이다 금이 감)
//            · 문틈의 눈(나를 따라 눈알을 굴리다 문이 쾅) · 인형 머리(굴러와서 빈 눈으로 올려다봄)
//      순찰: 빛 밖의 그림자(촛불 빛 안에서는 얼어붙고 밖에서만 다가옴) · 흰 소복(사라졌다 몇 칸씩 가까이 나타남, 등 뒤로도)
//            · 마네킹(눈 깜빡이듯 캄캄해질 때마다 성큼 다가옴) · 기어 오는 아이(끊어 끊어 빠르게) · 목 꺾인 것(필름이 끊기듯 덜컥덜컥)
//    가까이 가면 깜짝 놀래키기(maze.ts scareSchedule): 그 귀신의 얼굴이 저마다의 방식(떨어짐·튀어오름·돌며 굴러옴·암전 뒤 등)으로
//    화면 가득 커졌다 사라지기 2~3번(많이 놀랄수록 세진다) + 흔들림 + 붉은 번쩍임(초당 3번 이하) + 귀신마다 다른 비명, 잠깐 조작이 굳는다.
//    같은 귀신이 연달아 놀래키지는 않는다(바로 앞과 같으면 스윽 사라지기만).
//    움직임 줄이기면 커지기·흔들림·번쩍임 없이 천천히 나타났다 사라지기만, 게임 안 '화면 흔들림 효과'를 끄면 흔들림만 뺀다
//    (소리는 효과음 음량을 따르고, 모든 소리는 리미터를 지난다 — hauntSound.ts).
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
/** 귀신마다 비명 목소리 */
const VOICE: Record<GhostLook, ScreamVoice> = {
  sobok: "wail",
  hanger: "stutter",
  crawler: "child",
  dollhead: "child",
  broken: "low",
  eye: "shriek",
  mirror: "shriek",
  hands: "choir",
  shadow: "growl",
  mannequin: "wail",
};

type GhostState = "idle" | "hunt" | "reveal" | "back";

type Ghost = {
  plan: GhostPlan;
  look: GhostLook;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  /** 순찰: 다음에 갈 길 칸 번호와 방향 */
  idx: number;
  step: 1 | -1;
  restUntil: number;
  /** 다시 놀래킬 준비 (쉬는 시간이 지나고 내가 한 번 멀어져야) */
  armed: boolean;
  /** 지금 보이는 정도 0..1 (want를 부드럽게 따라간다) */
  vis: number;
  want: number;
  phase: number;
  /** idle 평소 · hunt 나를 쫓음(구르는 인형 머리 포함) · reveal 나타나는 중(끝나면 놀래킴) · back 제 길로 돌아감 */
  state: GhostState;
  /** 상태가 바뀐 시각 */
  since: number;
  /** 다음 행동 시각 (끊어 걷기·순간이동·눈 깜빡임 등) */
  nextAt: number;
  /** 소리를 낸 시각 (너무 잦지 않게) */
  soundAt: number;
  /** 이때까지는 움직이지 않는다 (놀래키는 동안) */
  holdUntil: number;
  frame: number;
  /** 왼쪽을 보는지 */
  left: boolean;
  /** 순찰 첫 칸까지의 거리표 (쫓다 놓치면 따라 돌아간다) */
  home: Int32Array;
  /** 그림이 붙는 곳 (문틈의 눈·거울은 옆 벽, 천장의 여자는 내 앞) */
  ax: number;
  ay: number;
  /** 벽 속의 손이 띄운 손들 */
  extras: Phaser.GameObjects.Sprite[];
};

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

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
  /** 얼굴이 들어오는 연출용 어긋남 (월드 px) */
  private faceOX = 0;
  private faceOY = 0;
  /** 내 칸에서 각 칸까지의 걸음 수 (귀신이 미로 길로 다가오게) */
  private toMe: Int32Array = new Int32Array(0);
  private meKey = -1;
  /** 지금 촛불 빛 반지름 (빛 밖의 그림자가 쓴다) */
  private lightR = LIGHT_R;
  /** 바로 앞에 놀래킨 귀신 종류 (같은 귀신이 연달아 놀래키지 않게) */
  private lastLook: GhostLook | null = null;
  /** 마네킹이 다가오는 '눈 깜빡임' 다음 시각 */
  private nextBlink = 0;
  /** 촛불이 꺼진 동안 마네킹이 마지막으로 움직인 시각 */
  private darkStepAt = 0;

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
    this.faceOX = 0;
    this.faceOY = 0;
    this.meKey = -1;
    this.lightR = LIGHT_R;
    this.lastLook = null;
    this.nextBlink = 0;
    this.darkStepAt = 0;
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
    for (const plan of m.ghosts) this.ghosts.push(this.makeGhost(plan));

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
    this.face = this.add.image(0, 0, faceTex("sobok")).setDepth(DEPTH_SCARE + 1).setAlpha(0);
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
    this.face.setPosition(v.centerX + this.faceJitter + this.faceOX, v.centerY + this.faceJitter + this.faceOY);
  }

  /** 귀신 하나 만들기: 종류마다 그림·붙는 자리가 다르다 */
  private makeGhost(plan: GhostPlan): Ghost {
    const m = this.maze;
    const look = plan.look;
    const p = tileCenter(plan.path[0]);
    let ax = p.x;
    let ay = p.y;
    const t = plan.path[0];
    if (look === "eye") {
      // 문틈의 눈: 숨은 칸 옆 벽 (앞면이 보이는 위쪽 벽을 먼저)
      const wall = [
        { tx: t.tx, ty: t.ty - 1 },
        { tx: t.tx - 1, ty: t.ty },
        { tx: t.tx + 1, ty: t.ty },
        { tx: t.tx, ty: t.ty + 1 },
      ].find((w) => isWall(m, w.tx, w.ty));
      if (wall) {
        ax = wall.tx * T + T / 2;
        ay = wall.ty * T + T;
      }
    } else if (look === "mirror") {
      // 거울: 위쪽 벽이 있으면 그 벽에 기대 세운다 (없으면 바닥 가운데)
      ay = isWall(m, t.tx, t.ty - 1) ? t.ty * T + 6 : p.y + 2;
    }
    const sprite = this.add.sprite(ax, ay, ghostTex(look), 0).setOrigin(0.5, 1).setAlpha(0);
    const lurk = plan.kind === "lurk";
    return {
      plan,
      look,
      sprite,
      x: p.x,
      y: p.y,
      idx: Math.min(1, plan.path.length - 1),
      step: 1,
      restUntil: 0,
      armed: true,
      vis: 0,
      want: 0,
      phase: Math.random() * 6,
      state: "idle",
      since: 0,
      nextAt: 0,
      soundAt: -Infinity,
      holdUntil: 0,
      frame: look === "dollhead" ? 2 : 0,
      left: Math.random() < 0.5,
      home: lurk ? new Int32Array(0) : distances(m, plan.path[0]),
      ax,
      ay,
      extras: [],
    };
  }

  /** 귀신 칸 (발 기준) */
  private gTile(g: Ghost): { tx: number; ty: number } {
    return { tx: Math.floor(g.x / T), ty: Math.floor((g.y - 3) / T) };
  }

  /** 곧장 (tx,ty) 쪽으로 step px만큼. 다 가고 남은 걸음을 돌려준다 */
  private moveTo(g: Ghost, tx: number, ty: number, step: number): number {
    const dx = tx - g.x;
    const dy = ty - g.y;
    const dl = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) g.left = dx < 0;
    if (dl <= step) {
      g.x = tx;
      g.y = ty;
      return step - dl;
    }
    g.x += (dx / dl) * step;
    g.y += (dy / dl) * step;
    return 0;
  }

  /** 거리표를 따라 미로 길로 step px만큼 (벽을 뚫지 않는다). 목표 칸에 닿으면 end(없으면 칸 가운데)로 */
  private moveAlong(g: Ghost, field: Int32Array, step: number, end?: { x: number; y: number }): void {
    const m = this.maze;
    let left = step;
    for (let i = 0; i < 4 && left > 0.01; i++) {
      const t = this.gTile(g);
      if (isWall(m, t.tx, t.ty)) {
        // 벽 속에 잘못 들어갔으면 제 자리로 (그럴 일은 거의 없다)
        const h = tileCenter(g.plan.path[0]);
        g.x = h.x;
        g.y = h.y;
        return;
      }
      const c = tileCenter(t);
      const nx = stepToward(m, field, t);
      let tx: number;
      let ty: number;
      if (!nx) {
        tx = end?.x ?? c.x;
        ty = end?.y ?? c.y;
      } else if (nx.tx !== t.tx && Math.abs(g.y - c.y) > 0.5) {
        // 옆 칸으로 가기 전에 이 칸 가운데 줄에 먼저 맞춘다 (벽 모서리를 스치지 않게)
        tx = g.x;
        ty = c.y;
      } else if (nx.ty !== t.ty && Math.abs(g.x - c.x) > 0.5) {
        tx = c.x;
        ty = g.y;
      } else {
        const n = tileCenter(nx);
        tx = n.x;
        ty = n.y;
      }
      left = this.moveTo(g, tx, ty, left);
      if (!nx) break;
    }
  }

  /** 미로 길로 n칸 앞(나 쪽)으로 순간 이동. 내 바로 옆 칸에서 멈춘다. 옮긴 칸 수 */
  private jumpToward(g: Ghost, n: number): number {
    let t = this.gTile(g);
    let k = 0;
    for (; k < n; k++) {
      const d = this.toMe[t.ty * this.maze.cols + t.tx];
      if (d <= 1) break;
      const nx = stepToward(this.maze, this.toMe, t);
      if (!nx) break;
      t = nx;
    }
    if (k > 0) {
      const c = tileCenter(t);
      g.left = c.x > g.x ? false : c.x < g.x ? true : g.left;
      g.x = c.x;
      g.y = c.y;
    }
    return k;
  }

  /** 순찰: 정해진 길을 오간다 (쫓다 놓쳤으면 먼저 제 길 첫 칸으로 돌아간다) */
  private patrol(g: Ghost, step: number): void {
    const path = g.plan.path;
    if (g.state === "hunt") g.state = "back";
    if (g.state === "back") {
      const h = tileCenter(path[0]);
      if (Math.hypot(h.x - g.x, h.y - g.y) > 0.5) {
        this.moveAlong(g, g.home, step);
        return;
      }
      g.state = "idle";
      g.idx = Math.min(1, path.length - 1);
      g.step = 1;
    }
    const p = tileCenter(path[g.idx]);
    if (Math.hypot(p.x - g.x, p.y - g.y) < 0.5) {
      if (g.idx + g.step < 0 || g.idx + g.step >= path.length) g.step = g.step === 1 ? -1 : 1;
      g.idx = Math.max(0, Math.min(path.length - 1, g.idx + g.step));
    }
    const q = tileCenter(path[g.idx]);
    this.moveTo(g, q.x, q.y, step);
  }

  /** 지금 놀래킬 수 있는지 (다른 귀신이 막 놀래켰으면 잠깐 기다린다) */
  private canScare(g: Ghost, now: number): boolean {
    return !this.leaving && now >= g.restUntil && now - this.lastScareAt >= SCARE_GAP_MS;
  }

  private reveal(g: Ghost, now: number): void {
    g.state = "reveal";
    g.since = now;
  }

  private updateGhosts(now: number, dt: number): void {
    const m = this.maze;
    const me = { tx: Math.floor(this.px / T), ty: Math.floor((this.py - 2) / T) };
    const key = me.ty * m.cols + me.tx;
    if (key !== this.meKey && !isWall(m, me.tx, me.ty)) {
      this.meKey = key;
      this.toMe = distances(m, me);
    }
    const sec = dt / 1000;
    let nearest = Infinity;
    let mannequinHunting = false;
    for (const g of this.ghosts) {
      const resting = now < g.restUntil;
      const held = now < g.holdUntil;
      const dist = Math.hypot(g.x - this.px, g.y - this.py);
      const gt = this.gTile(g);
      const pdRaw = isWall(m, gt.tx, gt.ty) ? -1 : this.toMe[gt.ty * m.cols + gt.tx];
      const pd = pdRaw < 0 ? Infinity : pdRaw;
      const sight = dist < 110 && clearLine(m, gt, me);
      const pan = Math.max(-1, Math.min(1, (g.x - this.px) / 90));
      const active = !resting && !this.leaving;
      // 숨는 귀신: 쉬는 시간이 끝나고 내가 한 번 멀어져야 다시 준비
      if (!g.armed && !resting && dist > 72) {
        g.armed = true;
        if (g.look === "mirror" || g.look === "eye") g.frame = 0;
        if (g.look === "dollhead") g.frame = 2;
      }
      if (!held) {
        switch (g.look) {
          case "shadow":
            this.tickShadow(g, now, sec, dist, pd, pan, active);
            break;
          case "sobok":
            this.tickSobok(g, now, sec, dist, pd, active);
            break;
          case "mannequin":
            if (this.tickMannequin(g, now, dist, pd, active)) mannequinHunting = true;
            break;
          case "crawler":
            this.tickCrawler(g, now, sec, dist, pd, sight, pan, active);
            break;
          case "broken":
            this.tickBroken(g, now, dist, pd, sight, pan, active);
            break;
          case "hanger":
            this.tickHanger(g, now, dist, sight, pan, active);
            break;
          case "hands":
            this.tickHands(g, now, dist, pan, active);
            break;
          case "mirror":
            this.tickMirror(g, now, dist, pan, active);
            break;
          case "eye":
            this.tickEye(g, now, dist, pan, active);
            break;
          case "dollhead":
            this.tickDoll(g, now, sec, dist, pd, sight, pan, active);
            break;
        }
      }
      if (!resting) nearest = Math.min(nearest, dist);
      g.vis += (g.want - g.vis) * Math.min(1, dt / 220);
      this.drawGhost(g, now);
    }
    this.nearGhostPx = nearest;
    // 마네킹이 쫓는 동안 가끔 '눈을 깜빡인다' (잠깐 캄캄) — 그 사이 성큼 다가온다
    if (mannequinHunting && now >= this.nextBlink && now - this.lastScareAt > 2500 && this.lightK > 0.9) {
      this.nextBlink = now + 2400 + Math.random() * 1300;
      this.blink();
    }
  }

  /** 귀신 그림을 자리·프레임·투명도에 맞춘다 */
  private drawGhost(g: Ghost, now: number): void {
    const s = g.sprite;
    const floaty = g.look === "sobok" || g.look === "shadow";
    const bob = floaty ? Math.sin(now / 420 + g.phase) * 1.5 : 0;
    // 흐려졌다 돌아오는 깜빡임 (번쩍임은 아니다)
    const flick = floaty && Math.sin(now / 97 + g.phase * 3) > 0.93 ? 0.45 : 1;
    const fixed = g.look === "eye" || g.look === "mirror";
    const x = fixed ? g.ax : g.x;
    const y = fixed ? g.ay : g.y;
    s.setPosition(Math.round(x), Math.round(y + bob))
      // 천장의 여자는 내 앞에 걸린다
      .setDepth(g.look === "hanger" ? y + 20 : y)
      .setFrame(g.frame)
      .setFlipX(g.look === "crawler" ? g.left : g.look === "eye" || g.look === "mirror" || g.look === "hanger" ? false : g.left)
      .setAlpha(Math.max(0, Math.min(1, g.vis * flick)));
  }

  // ── 종류별 움직임 ──

  /** 빛 밖의 그림자: 촛불 빛 안에서는 얼어붙고, 빛 밖(어둠·촛불이 꺼진 사이)에서만 미끄러지듯 다가온다 */
  private tickShadow(g: Ghost, now: number, sec: number, dist: number, pd: number, pan: number, active: boolean): void {
    g.want = 0.95;
    if (active && pd <= 12) {
      if (g.state !== "hunt") {
        g.state = "hunt";
        g.nextAt = now;
      }
      const lit = dist < this.lightR * 1.3;
      if (lit) {
        // 빛에 닿으면 그 자리에 멈춰 선다 (보고 있는 동안은 움직이지 않는다)
        if (now - g.soundAt > 5000) {
          g.soundAt = now;
          this.sound2?.growl(pan);
        }
        if (dist < 22 && now - g.nextAt > 1600 && this.canScare(g, now)) this.scare(g, now);
      } else {
        g.nextAt = now;
        this.moveAlong(g, this.toMe, 46 * sec, { x: this.px, y: this.py });
        g.frame = Math.floor(now / 160) % 2;
      }
      if (dist < 13 && this.canScare(g, now)) this.scare(g, now);
      return;
    }
    this.patrol(g, 16 * sec);
    g.frame = Math.floor(now / 400) % 2;
  }

  /** 흰 소복: 쫓을 때는 모습을 감췄다가 몇 칸씩 가까이 순간이동해 나타난다 (가끔 등 뒤로) */
  private tickSobok(g: Ghost, now: number, sec: number, dist: number, pd: number, active: boolean): void {
    g.frame = Math.floor(now / 320 + g.phase) % 2;
    if (g.state === "reveal") {
      g.want = 1;
      if (now - g.since > 260) {
        if (this.canScare(g, now)) this.scare(g, now);
        else g.state = "hunt";
      }
      return;
    }
    if (active && pd <= 12) {
      if (g.state !== "hunt") {
        g.state = "hunt";
        g.nextAt = now + 600;
      }
      // 나타났다가 금세 흐려진다
      g.want = now - g.soundAt < 650 ? 1 : 0;
      if (now >= g.nextAt) {
        g.nextAt = now + 1500 + Math.random() * 900 - (12 - Math.min(12, pd)) * 40;
        let moved = 0;
        if (pd <= 4 && Math.random() < 0.35) moved = this.behindMe(g) ? 1 : 0;
        if (!moved) moved = this.jumpToward(g, pd > 5 ? 2 : 1);
        if (moved) {
          g.soundAt = now;
          g.vis = 1;
          g.want = 1;
          this.sound2?.sting(Math.max(-1, Math.min(1, (g.x - this.px) / 90)));
          if (Math.hypot(g.x - this.px, g.y - this.py) < 20 && this.canScare(g, now)) this.reveal(g, now);
        }
      }
      if (dist < 16 && this.canScare(g, now)) this.reveal(g, now);
      return;
    }
    g.want = 0.55;
    this.patrol(g, 14 * sec);
  }

  /** 내 등 뒤 칸으로 (바닥이면) */
  private behindMe(g: Ghost): boolean {
    const d = this.dirRow === DIR_ROW.left ? [1, 0] : this.dirRow === DIR_ROW.right ? [-1, 0] : this.dirRow === DIR_ROW.up ? [0, 1] : [0, -1];
    const tx = Math.floor(this.px / T) + d[0];
    const ty = Math.floor((this.py - 2) / T) + d[1];
    if (isWall(this.maze, tx, ty)) return false;
    const c = tileCenter({ tx, ty });
    g.left = c.x > this.px;
    g.x = c.x;
    g.y = c.y;
    return true;
  }

  /** 마네킹: 보고 있는 동안은 꼼짝 않는다. 눈을 깜빡이거나 촛불이 꺼지는 사이에만 성큼 다가온다. 쫓는 중이면 true */
  private tickMannequin(g: Ghost, now: number, dist: number, pd: number, active: boolean): boolean {
    g.want = 0.95;
    if (!active || pd > 10) {
      if (g.state === "hunt") g.state = "idle";
      return false;
    }
    g.state = "hunt";
    // 촛불이 꺼진 사이에도 움직인다
    if (this.lightK < 0.3 && now - this.darkStepAt > 450) {
      this.darkStepAt = now;
      this.mannequinStep();
    }
    if (dist < 18 && this.lightK > 0.6 && this.canScare(g, now)) this.scare(g, now);
    return true;
  }

  /** 깜빡임·어둠 사이에 쫓는 마네킹이 모두 한두 칸 다가온다 (자세도 바뀐다) */
  private mannequinStep(): void {
    for (const g of this.ghosts) {
      if (g.look !== "mannequin" || g.state !== "hunt") continue;
      const k = this.jumpToward(g, 2);
      if (!k) continue;
      const d = this.toMe[this.gTile(g).ty * this.maze.cols + this.gTile(g).tx];
      g.frame = d <= 2 ? 2 : pick([0, 1]);
      g.left = g.x > this.px;
      this.sound2?.clack(Math.max(-1, Math.min(1, (g.x - this.px) / 90)));
    }
  }

  /** 눈 깜빡임: 잠깐 캄캄해진다 (움직임 줄이기면 천천히 어두워졌다 돌아오기만) */
  private blink(): void {
    this.tweens.killTweensOf(this);
    if (this.d.reduced) {
      this.tweens.chain({
        targets: this,
        tweens: [
          { lightK: 0.15, duration: 220 },
          { lightK: 1, duration: 260 },
        ],
      });
      this.time.delayedCall(230, () => this.mannequinStep());
      return;
    }
    this.lightK = 0.03;
    this.time.delayedCall(120, () => this.mannequinStep());
    this.time.delayedCall(260, () => (this.lightK = 1));
  }

  /** 기어 오는 아이: 나를 보면 킥킥 웃고 네 발로 끊어 끊어 빠르게 다가온다 */
  private tickCrawler(g: Ghost, now: number, sec: number, dist: number, pd: number, sight: boolean, pan: number, active: boolean): void {
    g.want = 0.92;
    const notice = active && ((sight && dist < 110) || pd <= 4);
    if (notice && g.state !== "hunt") {
      g.state = "hunt";
      g.since = now;
      if (now - g.soundAt > 4000) {
        g.soundAt = now;
        this.sound2?.giggle(pan);
      }
    }
    if (g.state === "hunt" && active && pd <= 9) {
      const t = (now - g.since) % 720;
      if (t < 300) {
        // 돌진 (걸음마다 손바닥으로 바닥을 친다)
        if (g.nextAt <= now) {
          g.nextAt = now + 720 - t;
          this.sound2?.knock(pan, 2);
        }
        this.moveAlong(g, this.toMe, 80 * sec, { x: this.px, y: this.py });
        g.frame = Math.floor(now / 60) % 4;
      }
      if (dist < 14 && this.canScare(g, now)) this.scare(g, now);
      return;
    }
    this.patrol(g, 14 * sec);
    g.frame = Math.floor(now / 200) % 4;
  }

  /** 목 꺾인 것: 필름이 끊긴 듯 덜컥덜컥 움직이며 다가온다 (가끔 고개가 더 꺾이며 뼈 소리) */
  private tickBroken(g: Ghost, now: number, dist: number, pd: number, sight: boolean, pan: number, active: boolean): void {
    g.want = 0.92;
    const notice = active && ((sight && dist < 100) || pd <= 4);
    if (notice && g.state !== "hunt") {
      g.state = "hunt";
      if (now - g.soundAt > 3000) {
        g.soundAt = now;
        this.sound2?.bones(pan, 3);
      }
    }
    const hunting = g.state === "hunt" && active && pd <= 9;
    if (now < g.nextAt) return;
    g.nextAt = now + (hunting ? 240 : 320);
    if (hunting) this.moveAlong(g, this.toMe, 7, { x: this.px, y: this.py });
    else this.patrol(g, 5);
    const twitch = Math.random() < (hunting ? 0.25 : 0.1);
    g.frame = twitch ? 2 : g.frame === 0 ? 1 : 0;
    if (twitch && hunting && dist < 90 && now - g.soundAt > 900) {
      g.soundAt = now;
      this.sound2?.bones(pan, 1 + Math.floor(Math.random() * 2));
    }
    if (hunting && dist < 14 && this.canScare(g, now)) this.scare(g, now);
  }

  /** 천장의 여자: 숨어 있다가 가까이 오면 내 바로 앞에 거꾸로 툭 떨어진다 */
  private tickHanger(g: Ghost, now: number, dist: number, sight: boolean, pan: number, active: boolean): void {
    if (g.state === "reveal") {
      const t = Math.min(1, (now - g.since) / 420);
      const e = Phaser.Math.Easing.Back.Out(t);
      g.x = g.ax;
      g.y = g.ay - 46 * (1 - e);
      g.vis = 1;
      g.want = 1;
      g.frame = Math.floor(now / 180) % 2;
      if (now - g.since > 560) {
        if (this.canScare(g, now)) this.scare(g, now);
        else this.hideHanger(g);
      }
      return;
    }
    g.want = 0;
    if (g.armed && active && (dist < 26 || (dist < 40 && sight)) && this.canScare(g, now)) {
      // 내가 보는 쪽 바로 앞 (벽이면 내 자리)
      const off = this.dirRow === DIR_ROW.left ? [-10, 0] : this.dirRow === DIR_ROW.right ? [10, 0] : this.dirRow === DIR_ROW.up ? [0, -8] : [0, 6];
      const fx = this.px + off[0];
      const fy = this.py + off[1];
      const ok = !isWall(this.maze, Math.floor(fx / T), Math.floor((fy - 2) / T));
      g.ax = ok ? fx : this.px;
      g.ay = (ok ? fy : this.py) - 4;
      this.sound2?.rope(pan);
      this.reveal(g, now);
    }
  }

  private hideHanger(g: Ghost): void {
    g.state = "idle";
    g.want = 0;
    g.vis = 0;
    const p = tileCenter(g.plan.path[0]);
    g.x = p.x;
    g.y = p.y;
  }

  /** 벽 속의 손: 가까이 오면 내 둘레 벽에서 창백한 손들이 한꺼번에 뻗어 나와 움켜쥔다 */
  private tickHands(g: Ghost, now: number, dist: number, pan: number, active: boolean): void {
    g.want = 0;
    if (g.state === "reveal") {
      if (now - g.since > 380) for (const h of g.extras) h.setFrame(1);
      if (now - g.since > 620) {
        if (this.canScare(g, now)) this.scare(g, now);
        else this.retractHands(g, 0);
      }
      return;
    }
    if (g.armed && active && dist < 22 && this.canScare(g, now)) {
      this.spawnHands(g);
      this.sound2?.scratch(pan);
      this.reveal(g, now);
    }
  }

  private spawnHands(g: Ghost): void {
    const m = this.maze;
    const tx = Math.floor(this.px / T);
    const ty = Math.floor((this.py - 2) / T);
    const spots: { x: number; y: number; rot: number }[] = [];
    // 왼·오른·위·아래 벽의 경계에서 내 쪽으로 (손가락이 나를 향한다)
    if (isWall(m, tx - 1, ty)) for (const o of [-9, -2]) spots.push({ x: tx * T, y: this.py + o, rot: Math.PI / 2 });
    if (isWall(m, tx + 1, ty)) for (const o of [-8, -1]) spots.push({ x: (tx + 1) * T, y: this.py + o, rot: -Math.PI / 2 });
    if (isWall(m, tx, ty - 1)) for (const o of [-5, 5]) spots.push({ x: this.px + o, y: ty * T + 3, rot: Math.PI });
    if (isWall(m, tx, ty + 1)) for (const o of [-4, 6]) spots.push({ x: this.px + o, y: (ty + 1) * T + 3, rot: 0 });
    // 벽이 적은 갈림길이면 바닥에서도 솟는다
    while (spots.length < 4) {
      const a = Math.random() * Math.PI * 2;
      spots.push({ x: this.px + Math.cos(a) * 11, y: this.py + Math.sin(a) * 7, rot: 0 });
    }
    spots.forEach((s, i) => {
      const h = this.add
        .sprite(s.x, s.y, ghostTex("hands"), 0)
        .setOrigin(0.5, 1)
        .setRotation(s.rot)
        .setDepth(this.py + 4)
        .setScale(0);
      g.extras.push(h);
      this.tweens.add({ targets: h, scale: 1.1, duration: 180, delay: i * 55, ease: "Back.easeOut" });
    });
  }

  private retractHands(g: Ghost, delay: number): void {
    g.state = "idle";
    const hs = g.extras.splice(0);
    for (const h of hs) this.tweens.add({ targets: h, scale: 0, alpha: 0, duration: 260, delay, onComplete: () => h.destroy() });
  }

  /** 거울: 거울 속 그것이 나와 상관없이 고개를 갸웃·웃다가, 가까이 오면 금이 가며 튀어나온다 */
  private tickMirror(g: Ghost, now: number, dist: number, pan: number, active: boolean): void {
    g.want = 1;
    if (g.state === "reveal") {
      g.frame = 3;
      if (now - g.since > 260) {
        if (this.canScare(g, now)) this.scare(g, now);
        else g.state = "idle";
      }
      return;
    }
    if (!g.armed) {
      g.frame = 3;
      return;
    }
    if (now >= g.nextAt) {
      // 내가 가까울수록 자주, 더 섬뜩하게
      const near = dist < 44;
      g.frame = near ? (Math.random() < 0.4 ? 2 : 1) : Math.random() < 0.5 ? 1 : 0;
      g.nextAt = now + (g.frame === 2 ? 260 : near ? 700 + Math.random() * 700 : 1300 + Math.random() * 1700);
    }
    if (active && dist < 20 && this.canScare(g, now)) {
      this.sound2?.glass(pan);
      this.reveal(g, now);
    }
  }

  /** 문틈의 눈: 벽 틈에서 나를 따라 눈알을 굴리고 숨을 쉬다가, 가까이 오면 문이 쾅 */
  private tickEye(g: Ghost, now: number, dist: number, pan: number, active: boolean): void {
    g.want = 1;
    if (g.state === "reveal") {
      g.frame = 4;
      if (now - g.since > 220) {
        if (this.canScare(g, now)) this.scare(g, now);
        else g.state = "idle";
      }
      return;
    }
    if (!g.armed) {
      g.frame = 3;
      return;
    }
    const dx = this.px - g.ax;
    g.frame = dx < -10 ? 1 : dx > 10 ? 2 : 0;
    // 가끔 깜빡인다 (다음 깜빡임 직전 0.15초 동안 감는다)
    if (now >= g.nextAt) g.nextAt = now + 2500 + Math.random() * 2500;
    if (g.nextAt - now < 150) g.frame = 3;
    if (dist < 50 && now - g.soundAt > 6000) {
      g.soundAt = now;
      this.sound2?.breath(pan);
    }
    if (active && dist < 20 && this.canScare(g, now)) {
      this.sound2?.bang(pan);
      this.reveal(g, now);
    }
  }

  /** 인형 머리: 뒤통수를 보인 채 있다가 데굴데굴 굴러와 한쪽 눈이 빈 얼굴로 올려다본다 */
  private tickDoll(g: Ghost, now: number, sec: number, dist: number, pd: number, sight: boolean, pan: number, active: boolean): void {
    g.want = 1;
    if (g.state === "reveal") {
      g.frame = 4;
      if (now - g.since > 380) {
        if (this.canScare(g, now)) this.scare(g, now);
        else g.state = "idle";
      }
      return;
    }
    if (g.state === "hunt") {
      this.moveAlong(g, this.toMe, 62 * sec, { x: this.px + (g.x < this.px ? -7 : 7), y: this.py + 1 });
      g.frame = Math.floor(now / 70) % 4;
      if (dist < 11 && this.canScare(g, now)) this.reveal(g, now);
      else if (now - g.since > 3500 || pd > 8 || !active) {
        // 놓쳤다: 그 자리에 멈춰 빈 눈으로 노려본다
        g.state = "idle";
        g.frame = 4;
        g.armed = false;
        g.restUntil = now + 4000;
      }
      return;
    }
    if (g.armed && active && (dist < 26 || (dist < 60 && sight)) && this.canScare(g, now)) {
      g.state = "hunt";
      g.since = now;
      this.sound2?.roll(pan, 1.2);
      this.sound2?.musicBox(pan);
    }
  }

  /** 바로 앞과 같은 귀신이면 놀래키지 않고 스윽 사라지기만 (같은 귀신이 연달아 놀래키지 않게) */
  private fakeOut(g: Ghost, now: number): void {
    g.restUntil = now + GHOST_REST_MS;
    g.armed = false;
    this.sound2?.whisper(Math.max(-1, Math.min(1, (g.x - this.px) / 90)));
    this.resetAfterScare(g, 0);
  }

  /** 놀래킨 뒤 귀신을 제자리로 (release ms 뒤) */
  private resetAfterScare(g: Ghost, release: number): void {
    switch (g.look) {
      case "hanger":
        this.time.delayedCall(release + 150, () => {
          g.want = 0;
          this.time.delayedCall(400, () => this.hideHanger(g));
        });
        g.state = "idle";
        return;
      case "hands":
        this.retractHands(g, release);
        return;
      case "mirror":
      case "eye":
        g.state = "idle";
        return;
      case "dollhead":
        g.state = "idle";
        this.time.delayedCall(release + 200, () => {
          const p = tileCenter(g.plan.path[0]);
          g.x = p.x;
          g.y = p.y;
          g.frame = 2;
        });
        return;
    }
    // 돌아다니는 귀신은 쉬는 동안 길 저쪽 끝으로 옮겨 간다
    g.state = "idle";
    const path = g.plan.path;
    const a = tileCenter(path[0]);
    const b = tileCenter(path[path.length - 1]);
    const at = Math.hypot(a.x - this.px, a.y - this.py) > Math.hypot(b.x - this.px, b.y - this.py) ? 0 : path.length - 1;
    g.holdUntil = this.time.now + release + 200;
    this.time.delayedCall(release + 200, () => {
      const p = tileCenter(path[at]);
      g.x = p.x;
      g.y = p.y;
      g.idx = at;
      g.step = at === 0 ? 1 : -1;
      g.vis = 0;
    });
  }

  /** 깜짝 놀래키기 (같은 귀신은 쉬었다 다시, 어떤 귀신이든 연달아는 아니게, 바로 앞과 같은 종류는 건너뛴다) */
  private scare(g: Ghost, now: number): void {
    if (now - this.lastScareAt < SCARE_GAP_MS || now < g.restUntil) return;
    if (g.look === this.lastLook) {
      this.fakeOut(g, now);
      return;
    }
    this.lastLook = g.look;
    this.lastScareAt = now;
    g.restUntil = now + GHOST_REST_MS;
    g.armed = false;
    // 많이 놀랄수록 세진다 (얼굴 횟수·크기·번쩍임·흔들림)
    const level = Math.min(1, this.scares / 4);
    this.scares++;
    bridge.emit("haunt:hud", { ms: this.elapsed, scares: this.scares });
    const reduced = this.d.reduced;
    const shake = !reduced && shakeEnabled();
    const steps = scareSchedule(reduced, g.look, level);
    const release = steps.find((s) => s.kind === "release")?.at ?? 1000;
    this.frozenUntil = now + release;
    // 돌아다니는 귀신은 내 앞으로 확 다가선다 (그 뒤 사라진다)
    if (g.plan.kind === "patrol") {
      g.x = this.px + (g.x < this.px ? -9 : 9);
      g.y = this.py + 1;
      g.vis = 1;
    }
    // 놀래키는 동안은 그 자리 그대로
    g.holdUntil = now + release + 150;
    this.resetAfterScare(g, release);
    const cam = this.cameras.main;
    const base = (Math.min(cam.width, cam.height) / 64 / cam.zoom) * (1 + 0.18 * level);
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const look = g.look;
    const tint = look === "sobok" || look === "hanger" ? pick([0xffffff, 0xd8f0e0, 0xe0e4ff]) : 0xffffff;
    this.tweens.killTweensOf([this.face, this.veil, this.red]);
    this.face.setTexture(faceTex(look)).setTint(tint).setAngle(0).setAlpha(0);
    this.faceOX = 0;
    this.faceOY = 0;
    const hasDark = steps.some((s) => s.kind === "dark");
    if (!hasDark) this.tweens.add({ targets: this.veil, alpha: reduced ? 0.55 : 0.8, duration: reduced ? 300 : 60 });
    this.tweens.add({ targets: this.veil, alpha: 0, duration: 400, delay: release - 150 });
    let pulse = 0;
    for (const st of steps) {
      this.time.delayedCall(st.at, () => {
        if (this.ended) return;
        switch (st.kind) {
          case "dark":
            // 숨 멎는 틈: 화면이 새까매진다 (어두워지기만 — 번쩍임이 아니다)
            if (reduced) this.tweens.add({ targets: this.veil, alpha: 1, duration: 200 });
            else this.veil.setAlpha(1);
            break;
          case "scream":
            this.sound2?.scream(VOICE[look]);
            this.accent(look);
            if (hasDark) this.tweens.add({ targets: this.veil, alpha: reduced ? 0.55 : 0.82, duration: reduced ? 300 : 40 });
            break;
          case "thud":
            this.sound2?.thud();
            break;
          case "shake":
            if (shake) cam.shake(620, 0.014 + 0.008 * level);
            break;
          case "red":
            this.red.setAlpha(0);
            this.tweens.add({ targets: this.red, alpha: 0.3 + 0.1 * level, duration: 60, yoyo: true, hold: 40, ease: "Quad.easeOut" });
            break;
          case "faceIn":
            this.faceIn(look, pulse++, base, vw, vh, reduced, shake);
            break;
          case "faceOut":
            this.tweens.add({ targets: this.face, alpha: 0, duration: reduced ? 350 : SCARE_FACE_OUT_MS });
            break;
          case "release":
            this.faceJitter = 0;
            this.faceOX = 0;
            this.faceOY = 0;
            this.face.setAngle(0);
            break;
        }
      });
    }
  }

  /** 비명과 함께 나는 그 귀신만의 소리 */
  private accent(look: GhostLook): void {
    const s = this.sound2;
    if (!s) return;
    switch (look) {
      case "crawler":
        s.giggle(0);
        break;
      case "broken":
        s.bones(0, 4);
        break;
      case "hands":
        s.scratch(0);
        break;
      case "mannequin":
        s.clack(0);
        break;
      case "dollhead":
        s.musicBox(0);
        break;
      case "shadow":
        s.growl(0);
        break;
      case "mirror":
        s.glass(0);
        break;
    }
  }

  /**
   * 얼굴이 화면 가득 들어온다. 첫 번째는 귀신마다 다른 방식으로(떨어짐·튀어오름·돌며 굴러옴·암전 뒤 그대로 등),
   * 두 번째부터는 순간이동하듯 자리를 바꿔 다시 커진다. 움직임 줄이기면 천천히 나타나기만
   */
  private faceIn(look: GhostLook, pulse: number, base: number, vw: number, vh: number, reduced: boolean, shake: boolean): void {
    const f = this.face;
    const T_IN = SCARE_FACE_IN_MS;
    if (reduced) {
      f.setScale(base * 0.8).setAlpha(0);
      this.tweens.add({ targets: f, alpha: 0.92, duration: 300 });
      return;
    }
    this.faceJitter = shake ? ((Math.random() - 0.5) * 8) / this.cameras.main.zoom : 0;
    if (pulse > 0) {
      // 순간이동하듯 옆으로 비껴 다시 커진다 (점점 크게)
      this.faceOX = (Math.random() - 0.5) * vw * 0.18;
      this.faceOY = (Math.random() - 0.5) * vh * 0.1;
      f.setScale(base * (0.75 + 0.1 * pulse)).setAlpha(0);
      this.tweens.add({ targets: f, alpha: 1, scale: base * (1.2 + 0.1 * pulse), duration: T_IN, ease: "Quad.easeOut" });
      if (look === "eye") this.tweens.add({ targets: f, scale: base * 1.9, duration: 230, delay: T_IN });
      return;
    }
    switch (look) {
      case "hanger":
        // 위에서 거꾸로 툭 떨어진다
        this.faceOY = -vh * 0.7;
        f.setScale(base * 1.15).setAlpha(1);
        this.tweens.add({ targets: this, faceOY: 0, duration: 150, ease: "Back.easeOut" });
        break;
      case "crawler":
        // 아래에서 튀어오른다
        this.faceOY = vh * 0.6;
        f.setScale(base * 0.7).setAlpha(1);
        this.tweens.add({ targets: this, faceOY: 0, duration: 110, ease: "Quad.easeOut" });
        this.tweens.add({ targets: f, scale: base * 1.25, duration: 110, ease: "Quad.easeOut" });
        break;
      case "hands":
        // 손에 붙들려 얼굴 앞으로 끌려온다
        f.setScale(base * 1.9).setAlpha(0);
        this.tweens.add({ targets: f, alpha: 1, scale: base * 1.15, duration: 130, ease: "Quad.easeOut" });
        break;
      case "broken":
        // 꺾인 채 돌아오며 덜컥 선다
        f.setScale(base * 0.85).setAngle(-100).setAlpha(1);
        this.tweens.add({ targets: f, angle: 0, scale: base * 1.2, duration: 130, ease: "Back.easeOut" });
        break;
      case "eye":
        // 천천히 다가와 화면을 다 덮는다
        f.setScale(base * 1.0).setAlpha(0);
        this.tweens.add({ targets: f, alpha: 1, duration: 70 });
        this.tweens.add({ targets: f, scale: base * 1.75, duration: 300, ease: "Sine.easeIn" });
        break;
      case "dollhead":
        // 옆에서 데굴데굴 굴러 들어와 멈춘다
        this.faceOX = vw * 0.6;
        f.setScale(base * 1.15).setAngle(300).setAlpha(1);
        this.tweens.add({ targets: this, faceOX: 0, duration: 170, ease: "Quad.easeOut" });
        this.tweens.add({ targets: f, angle: 0, duration: 170, ease: "Quad.easeOut" });
        break;
      case "mirror":
      case "mannequin":
        // 눈을 떠 보니 이미 코앞에 있다 (커지지 않고 그대로)
        f.setScale(base * 1.2).setAlpha(1);
        break;
      case "shadow":
        // 어둠 속에서 불쑥 — 붉은 눈이 다가온다
        f.setScale(base * 1.05).setAlpha(1);
        this.tweens.add({ targets: f, scale: base * 1.4, duration: 240, ease: "Quad.easeIn" });
        break;
      default:
        f.setScale(base * 0.6).setAlpha(0);
        this.tweens.add({ targets: f, alpha: 1, scale: base * 1.15, duration: T_IN, ease: "Quad.easeOut" });
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
    this.lightR = r;
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


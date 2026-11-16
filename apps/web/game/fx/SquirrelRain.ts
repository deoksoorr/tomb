import type * as Phaser from "phaser";
import { SQUIRREL_RAIN_NOTICE } from "@tomb/protocol";
import { releaseOnEnd } from "@/lib/sharedAudio";
import { addCanvasTexture } from "../assets/manifest";
import { bridge } from "../bridge";
import { squirrelArt } from "../camp/campArt";
import { DEPTH, prefersReducedMotion } from "../config";
import { Grid } from "../sprites/pixel";
import { AudioHost } from "../world/audioHost";
import { planSquirrels, SQUIRREL_BOUNCE_MS, SQUIRREL_END_MS, SQUIRREL_FADE_MS, type SquirrelPlan } from "./squirrelRainPlan";

// 11/16 이스터에그 「다람쥐를 뿌려라」: 실시간 서버가 채널 전체에 squirrels를 보내면(WorldScene → bridge "fx:squirrels")
// 지금 보이는 장면(집·하우징 마을·바닷가·캠핑장·마을 순으로 찾는다) 하늘에서 다람쥐가 우르르 떨어져 흙먼지를 일으키며 한 번 튀고,
// 화면 밖으로 와다다다 도망간다. 순수 연출: 입력·충돌 없음. 장면마다 그림 풀 하나 (처음 쓸 때 만들고 장면이 닫히면 지운다).
// 매 프레임 할당 없음 (계획은 시작할 때 한 번), 텍스처 하나(+먼지 하나). 움직임 줄이기면 적게·돌지 않게.

const TEX = "fx-squirrel";
const PUFF_TEX = "fx-squirrel-puff";
/** 월드 위(어둠·날씨·안개 위), 말풍선·이름표 아래 */
const SQUIRREL_DEPTH = DEPTH.fog + 50;
/** 다람쥐를 띄울 장면 (앞일수록 먼저 — 월드는 실내·다른 맵에 있는 동안 숨어 있다) */
const SCENES = ["house", "village", "sea", "camp", "world"] as const;
/** 먼지가 퍼지는 시간 */
const PUFF_MS = 380;
/** 달리는 걸음 한 프레임 */
const STEP_MS = 70;
/** 한 프레임 시간 상한 (탭을 갔다 와도 한꺼번에 건너뛰지 않게) */
const MAX_DT = 50;

function puffArt(): Grid {
  const g = new Grid(10, 6);
  g.ellipse(5, 3.6, 4.4, 2.3, 0xcbb894, 200);
  g.ellipse(3.4, 2.8, 2.2, 1.7, 0xe2d4b4, 220);
  g.ellipse(6.8, 3, 2, 1.5, 0xddd0b0, 210);
  return g;
}

function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX)) {
    const a = squirrelArt();
    addCanvasTexture(scene, TEX, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH });
  }
  if (!scene.textures.exists(PUFF_TEX)) addCanvasTexture(scene, PUFF_TEX, { canvas: puffArt().toCanvas() });
}

/** 다람쥐가 내려앉는 소리: 짧게 거른 잡음 "타닥" 여러 번 (시작할 때 한꺼번에 예약 → 프레임마다 소리 일 없음) */
class PatterSound extends AudioHost {
  constructor() {
    super("sfx");
  }

  play(landAtMs: readonly number[]): void {
    const ac = this.audio();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * 0.05);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const base = ac.currentTime + 0.02;
    const vol = Math.min(1, this.busGain()) * 0.16;
    // 너무 촘촘하면 하나로 뭉개진다 → 최대 40번, 25ms 넘게 떨어진 것만
    let last = -Infinity;
    let n = 0;
    for (const ms of landAtMs) {
      if (n >= 40 || ms - last < 25) continue;
      last = ms;
      n++;
      const t = base + ms / 1000;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.8 + Math.random() * 0.5;
      const f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1400 + Math.random() * 1600;
      f.Q.value = 1.2;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol * (0.6 + Math.random() * 0.4), t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      src.connect(f).connect(g).connect(this.output);
      src.start(t);
      src.stop(t + 0.07);
      releaseOnEnd(src, f, g);
    }
  }

  close(): void {
    this.closeAudio();
  }
}

type Squirrel = SquirrelPlan & {
  img: Phaser.GameObjects.Image;
  puff: Phaser.GameObjects.Image;
  /** 내려앉은 x (흔들림 끝 자리) */
  xl: number;
  /** 지금 걸음 프레임 (바뀔 때만 setFrame) */
  fr: number;
  done: boolean;
};

/** 장면 하나의 다람쥐 풀과 연출 */
class Rain {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly puffs: Phaser.GameObjects.Image[] = [];
  private sq: Squirrel[] = [];
  private t = 0;
  private running = false;
  private dead = false;
  private sound: PatterSound | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once("shutdown", this.destroy);
    scene.events.once("destroy", this.destroy);
  }

  get busy(): boolean {
    return this.running;
  }

  start(seed: number): void {
    if (this.dead || this.running) return;
    const cam = this.scene.cameras?.main;
    if (!cam) return;
    ensureTextures(this.scene);
    const reduced = prefersReducedMotion();
    const v = cam.worldView;
    const view = v.width > 0 && v.height > 0 ? { x: v.x, y: v.y, width: v.width, height: v.height } : { x: cam.scrollX, y: cam.scrollY, width: cam.width / cam.zoom, height: cam.height / cam.zoom };
    const plan = planSquirrels(seed, view, reduced);
    while (this.imgs.length < plan.length) {
      this.imgs.push(this.scene.add.image(0, 0, TEX, 0).setOrigin(0.5, 0.75).setDepth(SQUIRREL_DEPTH).setVisible(false));
      this.puffs.push(this.scene.add.image(0, 0, PUFF_TEX).setOrigin(0.5, 0.8).setDepth(SQUIRREL_DEPTH - 1).setVisible(false));
    }
    this.sq = plan.map((p, i) => ({ ...p, img: this.imgs[i], puff: this.puffs[i], xl: p.x0, fr: 0, done: false }));
    for (const s of this.sq) s.img.setAlpha(1).setAngle(0).setFlipX(false).setFrame(0).setVisible(false);
    this.t = 0;
    this.running = true;
    this.scene.events.on("update", this.update);
    try {
      this.sound = new PatterSound();
      this.sound.play(plan.map((p) => p.delay + p.fall).sort((a, b) => a - b));
    } catch {
      this.sound = null;
    }
  }

  private readonly update = (_time: number, delta: number): void => {
    try {
      this.step(Math.min(MAX_DT, Math.max(0, delta || 0)));
    } catch (e) {
      // 연출이 게임 루프를 멈추게 하지 않는다
      console.error(e);
      this.stop();
    }
  };

  private step(dt: number): void {
    this.t += dt;
    const t = this.t;
    if (t >= SQUIRREL_END_MS) return this.stop();
    const v = this.scene.cameras.main.worldView;
    const left = v.x - 16;
    const right = v.x + v.width + 16;
    const fade = t > SQUIRREL_END_MS - SQUIRREL_FADE_MS ? (SQUIRREL_END_MS - t) / SQUIRREL_FADE_MS : 1;
    let live = 0;
    for (const s of this.sq) {
      if (s.done) continue;
      live++;
      const img = s.img;
      if (t < s.delay) continue;
      const land = s.delay + s.fall;
      if (t < land) {
        // 떨어진다: 점점 빨라지며 좌우로 흔들리고 빙글
        const u = (t - s.delay) / s.fall;
        s.xl = s.x0 + Math.sin(s.swayPh + u * s.swayFreq) * s.swayAmp * (1 - u * 0.6);
        img.setPosition(s.xl, s.y0 + (s.yl - s.y0) * u * u);
        img.setAngle(s.spin * 360 * u);
        if (!img.visible) img.setVisible(true);
        continue;
      }
      // 먼지
      const age = t - land;
      if (age < PUFF_MS) {
        const k = age / PUFF_MS;
        if (!s.puff.visible) s.puff.setPosition(s.xl, s.yl + 1).setVisible(true);
        s.puff.setScale(0.6 + k * 0.9).setAlpha(0.85 * (1 - k) * fade);
      } else if (s.puff.visible) s.puff.setVisible(false);
      if (age < SQUIRREL_BOUNCE_MS) {
        // 한 번 통 튄다
        img.setAngle(0);
        img.setPosition(s.xl, s.yl - Math.sin((age / SQUIRREL_BOUNCE_MS) * Math.PI) * s.hop);
        continue;
      }
      // 와다다다 도망
      const r = age - SQUIRREL_BOUNCE_MS;
      const x = s.xl + (s.dir * s.speed * r) / 1000;
      if (x < left || x > right) {
        s.done = true;
        img.setVisible(false);
        s.puff.setVisible(false);
        continue;
      }
      img.setFlipX(s.dir < 0);
      const fr = Math.floor(r / STEP_MS) % 2;
      if (fr !== s.fr) img.setFrame((s.fr = fr));
      img.setPosition(x, s.yl - Math.abs(Math.sin(r / 45)) * 1.5);
      if (fade < 1) img.setAlpha(fade);
    }
    if (live === 0 && t > 0) this.stop();
  }

  private stop(): void {
    this.running = false;
    try {
      this.scene.events?.off("update", this.update);
    } catch {
      // 장면이 이미 닫혔다
    }
    for (let i = 0; i < this.imgs.length; i++) {
      const a = this.imgs[i];
      const b = this.puffs[i];
      if (a?.scene) a.setVisible(false);
      if (b?.scene) b.setVisible(false);
    }
    this.sq = [];
    this.closeSound();
  }

  private closeSound(): void {
    const s = this.sound;
    this.sound = null;
    if (!s) return;
    // 예약된 "타닥"이 끝날 때까지 기다렸다 뗀다 (장면이 닫히면 바로)
    const close = () => {
      try {
        s.close();
      } catch {
        // 이미 닫혔다
      }
    };
    if (this.dead) close();
    else setTimeout(close, 1_500);
  }

  /** 장면이 닫힌다: 연출을 멈추고 그림을 지운다 (Phaser가 먼저 지웠을 수도 있다 — 무엇도 던지지 않는다) */
  readonly destroy = (): void => {
    if (this.dead) return;
    this.dead = true;
    rains.delete(this.scene);
    try {
      this.scene.events?.off("shutdown", this.destroy);
      this.scene.events?.off("destroy", this.destroy);
    } catch {
      // 무시
    }
    this.stop();
    for (const o of [...this.imgs, ...this.puffs]) {
      try {
        if (o.scene) o.destroy();
      } catch {
        // 이미 지워졌다
      }
    }
    this.imgs.length = 0;
    this.puffs.length = 0;
  };
}

const rains = new WeakMap<Phaser.Scene, Rain>();

/** 그 장면에 다람쥐를 뿌린다 (이미 쏟아지는 중이면 그대로 둔다) */
export function playSquirrelRain(scene: Phaser.Scene, seed: number): boolean {
  let r = rains.get(scene);
  if (!r) rains.set(scene, (r = new Rain(scene)));
  if (r.busy) return false;
  r.start(seed);
  return r.busy;
}

/** 지금 보이는 (다람쥐를 띄울) 장면 */
function visibleScene(game: Phaser.Game): Phaser.Scene | null {
  const keys = (game.scene as unknown as { keys?: Record<string, Phaser.Scene> }).keys ?? {};
  for (const k of SCENES) {
    const s = keys[k];
    if (s?.sys?.isActive() && s.sys.isVisible() && s.cameras?.main) return s;
  }
  return null;
}

/** createGame에서 한 번: bridge "fx:squirrels" → 안내 + 지금 보이는 장면에 다람쥐. 돌려준 함수로 뗀다 */
export function installSquirrelRain(game: Phaser.Game): () => void {
  return bridge.on("fx:squirrels", (m) => {
    try {
      bridge.emit("toast", { message: SQUIRREL_RAIN_NOTICE });
      const scene = visibleScene(game);
      if (scene) playSquirrelRain(scene, m.seed);
    } catch (e) {
      console.error(e);
    }
  });
}

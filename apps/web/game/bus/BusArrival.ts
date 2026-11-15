import * as Phaser from "phaser";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import { DEPTH } from "../config";
import { BUS_DOOR_DX, BUS_FOOT, BUS_FRAME, BUS_TEX, BUS_W, ensureBusTextures, removeBusTextures } from "./busArt";
import { lightsOn } from "./busRideMath";
import type { BusArrivalApi, BusArrivalFactory, BusArrivalOptions } from "./busTypes";

// 정류장에 들어오는 버스 (월드 좌표). 화면 밖에서 들어와 감속해 문이 정류장 앞에 오게 서고 문을 연다 → 타면 문 닫고 떠난다.
// 마을(납품 부두 위 마당 정차 칸)과 캠핑장(아래 왼쪽 길)이 같은 코드를 쓴다. 밤에는 창문 빛·전조등이 켜진다.
// 텍스처는 처음 부를 때 굽고, 마지막 버스가 destroy되면 지운다 (게임 하나에 참조 수를 센다).

const ARRIVE_MS = 1900;
const DEPART_MS = 1400;
const DOOR_STEP_MS = 140;
const FADE_MS = 420;
/** 바퀴 그림을 바꾸는 이동 거리 (px) */
const WHEEL_STEP = 5;
const DUST_POOL = 6;
const DUST_LIFE_MS = 520;

const users = new WeakMap<Phaser.Textures.TextureManager, number>();

type Phase =
  | { k: "idle" }
  | { k: "in"; t0: number; from: number; to: number; done: () => void }
  | { k: "door"; t0: number; open: boolean; then: () => void }
  | { k: "out"; t0: number; from: number; dist: number; done: () => void }
  | { k: "fade"; t0: number; to: 0 | 1; done: () => void };

type Dust = { img: Phaser.GameObjects.Image; born: number; vx: number };

class BusArrival implements BusArrivalApi {
  readonly door: { x: number; y: number };
  private readonly body: Phaser.GameObjects.Image;
  private readonly windows: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly dust: Dust[] = [];
  private readonly dir: 1 | -1;
  private readonly stopX: number;
  private readonly night: boolean;
  private phase: Phase = { k: "idle" };
  private wheelAcc = 0;
  private wheelFrame = 0;
  private lastX = 0;
  private dustAt = 0;
  private destroyed = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: BusArrivalOptions,
  ) {
    ensureBusTextures(scene);
    users.set(scene.textures, (users.get(scene.textures) ?? 0) + 1);
    this.dir = o.fromLeft ? 1 : -1;
    this.stopX = o.doorX - BUS_DOOR_DX * this.dir;
    // 열린 문 앞: 버스 옆면 위쪽 (캐릭터가 걸어 들어가면 버스 몸체 뒤로 가려진다)
    this.door = { x: o.doorX, y: o.laneY - BUS_FOOT - 8 };
    let hour = 12;
    try {
      hour = ambienceAt(Date.now(), parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search)).kstHour;
    } catch {
      // 시계를 못 읽으면 낮
    }
    this.night = lightsOn(hour);
    const depth = o.laneY - BUS_FOOT;
    this.body = scene.add
      .image(this.stopX, o.laneY, BUS_TEX.body, BUS_FRAME.closedA)
      .setOrigin(0.5, 1)
      .setFlipX(this.dir < 0)
      .setDepth(depth)
      .setVisible(false);
    this.windows = scene.add
      .image(this.stopX, o.laneY, BUS_TEX.windows)
      .setOrigin(0.5, 1)
      .setFlipX(this.dir < 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.55)
      .setDepth(DEPTH.lights)
      .setVisible(false);
    this.head = scene.add
      .image(this.stopX, o.laneY - 16, BUS_TEX.head)
      .setOrigin(this.dir > 0 ? 0 : 1, 0.5)
      .setFlipX(this.dir < 0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.6)
      .setDepth(DEPTH.lights)
      .setVisible(false);
    for (let i = 0; i < DUST_POOL; i++) {
      this.dust.push({ img: scene.add.image(0, 0, BUS_TEX.dust).setDepth(depth + 0.5).setVisible(false), born: -Infinity, vx: 0 });
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  arrive(onOpen: () => void): void {
    if (this.destroyed) return;
    const now = this.scene.time.now;
    this.show(true);
    this.body.setFrame(BUS_FRAME.closedA);
    const open = () => this.doorTo(true, onOpen);
    if (this.o.reduced) {
      this.placeAt(this.stopX);
      this.setAlpha(0);
      this.phase = { k: "fade", t0: now, to: 1, done: open };
      return;
    }
    const v = this.scene.cameras.main.worldView;
    const from = this.dir > 0 ? Math.min(v.x - BUS_W, this.stopX - 280) : Math.max(v.right + BUS_W, this.stopX + 280);
    this.placeAt(from);
    this.setAlpha(1);
    this.phase = { k: "in", t0: now, from, to: this.stopX, done: open };
  }

  depart(onGone: () => void): void {
    if (this.destroyed) return;
    const leave = () => {
      const now = this.scene.time.now;
      if (this.o.reduced) {
        this.phase = { k: "fade", t0: now, to: 0, done: onGone };
        return;
      }
      const v = this.scene.cameras.main.worldView;
      const edge = this.dir > 0 ? Math.max(v.right, this.body.x + 200) + BUS_W : Math.min(v.x, this.body.x - 200) - BUS_W;
      this.phase = { k: "out", t0: now, from: this.body.x, dist: Math.abs(edge - this.body.x), done: onGone };
    };
    this.doorTo(false, leave);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    for (const t of this.timers) t.remove(false);
    this.timers = [];
    this.body.destroy();
    this.windows.destroy();
    this.head.destroy();
    for (const d of this.dust) d.img.destroy();
    const left = (users.get(this.scene.textures) ?? 1) - 1;
    if (left <= 0) {
      users.delete(this.scene.textures);
      removeBusTextures(this.scene);
    } else users.set(this.scene.textures, left);
  }

  // ── 안쪽 ──

  private show(on: boolean): void {
    this.body.setVisible(on);
    this.windows.setVisible(on && this.night);
    this.head.setVisible(on && this.night);
  }

  private setAlpha(a: number): void {
    this.body.setAlpha(a);
    this.windows.setAlpha(0.55 * a);
    this.head.setAlpha(0.6 * a);
  }

  private placeAt(x: number): void {
    const rx = Math.round(x);
    this.body.x = rx;
    this.windows.x = rx;
    this.head.x = rx + this.dir * (BUS_W / 2 - 3);
    this.lastX = x;
  }

  /** 문을 반쯤 → 끝까지 (열기) 또는 반쯤 → 닫힘 */
  private doorTo(open: boolean, then: () => void): void {
    this.body.setFrame(BUS_FRAME.half);
    this.phase = { k: "door", t0: this.scene.time.now, open, then };
  }

  private puff(now: number, x: number): void {
    const d = this.dust.find((e) => now - e.born > DUST_LIFE_MS);
    if (!d) return;
    d.born = now;
    d.vx = -this.dir * (6 + Math.random() * 8);
    d.img.setPosition(x, this.o.laneY - BUS_FOOT - 1 - Math.random() * 2).setVisible(true).setAlpha(0.8).setScale(1);
  }

  private tick(_time: number, delta: number): void {
    if (this.destroyed) return;
    const now = this.scene.time.now;
    const p = this.phase;
    switch (p.k) {
      case "in": {
        const u = Math.min(1, (now - p.t0) / ARRIVE_MS);
        const e = 1 - Math.pow(1 - u, 3);
        this.move(p.from + (p.to - p.from) * e, now, 1 - e);
        if (u >= 1) {
          // 서는 순간 살짝 앞으로 쏠렸다 돌아온다
          this.body.y = this.o.laneY + 1;
          this.timers.push(this.scene.time.delayedCall(110, () => !this.destroyed && (this.body.y = this.o.laneY)));
          this.phase = { k: "idle" };
          const done = p.done;
          this.timers.push(this.scene.time.delayedCall(160, () => !this.destroyed && done()));
        }
        break;
      }
      case "out": {
        const u = Math.min(1, (now - p.t0) / DEPART_MS);
        const e = Math.pow(u, 2.4);
        this.move(p.from + this.dir * p.dist * e, now, e);
        if (u >= 1) {
          this.show(false);
          this.phase = { k: "idle" };
          p.done();
        }
        break;
      }
      case "door": {
        if (now - p.t0 < DOOR_STEP_MS) break;
        this.body.setFrame(p.open ? BUS_FRAME.open : BUS_FRAME.closedA);
        this.phase = { k: "idle" };
        p.then();
        break;
      }
      case "fade": {
        const u = Math.min(1, (now - p.t0) / FADE_MS);
        this.setAlpha(p.to === 1 ? u : 1 - u);
        if (u >= 1) {
          if (p.to === 0) this.show(false);
          this.phase = { k: "idle" };
          p.done();
        }
        break;
      }
      case "idle":
        break;
    }
    // 먼지: 위로 흩어지며 사라진다
    for (const d of this.dust) {
      if (!d.img.visible) continue;
      const age = now - d.born;
      if (age > DUST_LIFE_MS) {
        d.img.setVisible(false);
        continue;
      }
      const k = age / DUST_LIFE_MS;
      d.img.x += (d.vx * delta) / 1000;
      d.img.y -= (4 * delta) / 1000;
      d.img.setAlpha(0.8 * (1 - k)).setScale(1 + k * 0.8);
    }
  }

  /** 버스를 x로 옮기고 바퀴를 굴린다. speed = 0..1 (먼지 양) */
  private move(x: number, now: number, speed: number): void {
    this.wheelAcc += Math.abs(x - this.lastX);
    if (this.wheelAcc >= WHEEL_STEP) {
      this.wheelAcc %= WHEEL_STEP;
      this.wheelFrame ^= 1;
      this.body.setFrame(this.wheelFrame ? BUS_FRAME.closedB : BUS_FRAME.closedA);
    }
    this.placeAt(x);
    if (speed > 0.15 && now - this.dustAt > 90) {
      this.dustAt = now;
      // 뒷바퀴 뒤에서
      this.puff(now, Math.round(x) - this.dir * (BUS_W / 2 - 22));
    }
  }
}

export const createBusArrival: BusArrivalFactory = (scene, o) => new BusArrival(scene, o);

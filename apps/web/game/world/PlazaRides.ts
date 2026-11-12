import * as Phaser from "phaser";
import { DIR, spotSeatId, STATE, type Sid } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import type { Player, SeatRequester } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import {
  carouselFloor,
  carouselPole,
  carouselTop,
  FOUNTAIN_H,
  FOUNTAIN_W,
  fountainSheet,
  horse,
  HORSE_COLORS,
  RIDE_TEX,
  seesawBase,
  seesawPlank,
  TRAMP_H,
  TRAMP_W,
  trampolineSheet,
} from "../sprites/rideProps";
import type { Effects } from "./Effects";
import { inWater, standable, type Interactable } from "./layout";
import type { RideSound } from "./RideSound";
import {
  bystanderGain,
  CAROUSEL_HORSES,
  CAROUSELS,
  carouselOrganLevel,
  carouselPoleDepth,
  carouselSeats,
  horseAngle,
  horseBob,
  rideSpotIds,
  ringPoint,
  SEESAW_HALF,
  SEESAW_PIVOT,
  seesawEndHeight,
  seesawMotion,
  seesawSeats,
  seesawSeed,
  SEESAWS,
  TRAMPOLINE_MAT,
  TRAMPOLINE_PERIOD_MS,
  trampolineHeight,
  trampolineLandings,
  trampolineLaunch,
  TRAMPOLINES,
  type SeesawMotion,
  WISH_FOUNTAIN,
} from "./rides";

// 50번 광장 놀거리 (소원 분수·시소·트램펄린·회전목마)의 그림·연출·소리.
// 자리 점유는 다른 1인 자리(그네 등)와 똑같이 서버 좌석으로 판정하고(WorldScene.useSpot / useCarousel),
// 여기서는 매 프레임 탄 사람(나·원격)에게 그림 연출(AvatarView.ride)을 넣고 놀거리 그림을 움직인다.
// 회전·시소·트램펄린 위상은 서버 시계(host.clock — 없으면 벽시계)라 모두에게 같은 모습으로 보인다.
//  - 시소(F5 묶음): 마주 보는 옆모습, 불규칙한 박자·세기(rides.seesawMotion), 땅을 찰 때 무릎 굽힘, 위에서 살짝 튐,
//    착지하면 쿵 + 먼지. 한 명이면 그쪽이 땅에 앉아 톡톡. 타고 내릴 때 판이 튀지 않게 잠깐 섞는다
//  - 트램펄린(F14): 내리려 하면(Player.offWish) 튀던 한 번이 매트에 닿는 순간 옆 땅으로 폴짝 (Player.hopOff)
//  - 회전목마(F15): 가운데 기둥은 받침 가운데 y 깊이로 따로 그려 앞쪽으로 도는 목마·사람이 기둥 앞에 보인다. 지붕만 맨 앞

/** WorldScene이 놀거리·조각배에 넘겨주는 것 (씬 안쪽을 직접 만지지 않게) */
export type RideHost = {
  scene: Phaser.Scene;
  reduced: boolean;
  fx: Effects;
  sound: RideSound;
  player(): Player;
  remotes(): ReadonlyMap<Sid, RemoteAvatar>;
  /** 서버 좌석 점유표 (오프라인이면 빈 표) */
  seats(): ReadonlyMap<string, Sid>;
  /** 내 sid (오프라인이면 null) */
  mySid(): Sid | null;
  /** 서버가 1인 자리를 판정한다 (온라인 + welcome.spots) */
  judged(): boolean;
  sit(seatId: string): void;
  stand(): void;
  seatReq(): SeatRequester;
  toast(message: string): void;
  /** 서버 시계 (ms, 접속 전이면 벽시계). 없으면 Date.now — 놀거리 위상을 모두에게 같게 */
  clock?: () => number;
};

type SpotRef =
  | { kind: "seesaw"; ride: number; side: 0 | 1; ax: number; ay: number }
  | { kind: "trampoline"; ride: number; ax: number; ay: number }
  | { kind: "carousel"; ride: number; horse: number; ax: number; ay: number };

const RIDE_STATES = new Set<number>([STATE.seesaw, STATE.trampoline, STATE.carousel]);
const HORSE_LIFT = 7;
/** 시소: 타고 내릴 때 판 기울기를 이 시간에 걸쳐 섞는다 */
const SEESAW_BLEND_MS = 450;
/** 시소: 착지한 쪽이 꾹 눌리는 시간 */
const SEESAW_SQUASH_MS = 130;
/** 트램펄린: 내리려고 한 뒤 이만큼 지나도 순간이 안 오면(시계가 튀는 등) 그냥 뛰어내린다 */
const TRAMP_OFF_MAX_MS = 1_400;

type SeesawView = {
  seed: number;
  /** 지금 화면 기울기 (섞기 포함) */
  shown: number;
  mode: number;
  blendFrom: number;
  blendAt: number;
  landId: number;
  motion: SeesawMotion;
};

export class PlazaRides {
  private readonly spots = new Map<string, SpotRef>();
  private readonly fountain: Phaser.GameObjects.Sprite;
  private readonly planks: Phaser.GameObjects.Image[] = [];
  private readonly tramps: Phaser.GameObjects.Image[] = [];
  private readonly horses: Phaser.GameObjects.Image[][] = [];
  /** 이번 프레임 자리 → 탄 사람 (나는 -1) */
  private readonly riders = new Map<string, number>();
  private readonly seesaws: SeesawView[] = [];
  private trampLowPrev: boolean[] = [];

  constructor(private readonly host: RideHost) {
    const scene = host.scene;
    ensureRideTextures(scene);
    // 소원 분수
    const F = WISH_FOUNTAIN;
    if (!scene.anims.exists("ride-fountain-flow")) {
      scene.anims.create({ key: "ride-fountain-flow", frames: [0, 1].map((i) => ({ key: RIDE_TEX.fountain, frame: i })), frameRate: host.reduced ? 1 : 3, repeat: -1 });
    }
    this.fountain = scene.add.sprite(F.x, F.y + 3, RIDE_TEX.fountain, 0).setOrigin(0.5, (FOUNTAIN_H - 2) / FOUNTAIN_H).setDepth(F.y);
    this.fountain.play("ride-fountain-flow");

    // 시소
    SEESAWS.forEach((s, i) => {
      scene.add.image(s.x, s.y + 1, RIDE_TEX.seesawBase).setOrigin(0.5, 1).setDepth(s.y - 0.4);
      this.planks.push(scene.add.image(s.x, s.y - SEESAW_PIVOT, RIDE_TEX.seesawPlank).setOrigin(0.5, 0.5).setDepth(s.y - 0.2));
      seesawSeats(s).forEach((p, side) => this.spots.set(spotSeatId("seesaw", p.x, p.y), { kind: "seesaw", ride: i, side: side as 0 | 1, ax: p.x, ay: p.y }));
      const seed = seesawSeed(s);
      this.seesaws.push({ seed, shown: -1, mode: 0, blendFrom: -1, blendAt: -Infinity, landId: 0, motion: seesawMotion(seed, false, false, 0) });
    });

    // 트램펄린
    TRAMPOLINES.forEach((t, i) => {
      this.tramps.push(scene.add.image(t.x, t.y + 6, RIDE_TEX.trampoline, 0).setOrigin(0.5, 1).setDepth(t.y - 0.5));
      this.spots.set(spotSeatId("trampoline", t.x, t.y), { kind: "trampoline", ride: i, ax: t.x, ay: t.y });
    });
    this.trampLowPrev = TRAMPOLINES.map(() => false);

    // 회전목마: 바닥 원판(바닥 장식 높이) + 목마(돌며 y 정렬) + 가운데 기둥(받침 가운데 y — 앞쪽 목마·사람은 그 앞) + 지붕(맨 앞)
    CAROUSELS.forEach((c, i) => {
      scene.add.image(c.x, c.y, RIDE_TEX.carouselFloor).setOrigin(0.5, 0.45).setDepth(DEPTH.decal + 4);
      scene.add.image(c.x, c.y + 1, RIDE_TEX.carouselPole).setOrigin(0.5, 1).setDepth(carouselPoleDepth(c));
      scene.add.image(c.x, c.y + 1, RIDE_TEX.carouselTop).setOrigin(0.5, 1).setDepth(c.y + 40);
      const hs: Phaser.GameObjects.Image[] = [];
      for (let h = 0; h < CAROUSEL_HORSES; h++) hs.push(scene.add.image(c.x, c.y, RIDE_TEX.horse(h % HORSE_COLORS.length, false)).setOrigin(0.5, 1));
      this.horses.push(hs);
      carouselSeats(c).forEach((p, h) => this.spots.set(spotSeatId("carousel", p.x, p.y), { kind: "carousel", ride: i, horse: h, ax: p.x, ay: p.y }));
    });
  }

  /** 이 자리가 놀거리 자리면 그 정보 */
  spotRef(id: string | null): SpotRef | undefined {
    return id ? this.spots.get(id) : undefined;
  }

  /**
   * 회전목마 타기: 빈 목마 중 가장 가까운 것 (지금 앞으로 돌아온 것). 다 찼으면 안내.
   * 서버가 판정하면 비어 보이는 목마에 바로 타고(지연 숨김) 점유를 요청한다
   */
  useCarousel(o: Interactable): void {
    const h = this.host;
    const pl = h.player();
    const ids = rideSpotIds(o);
    const judged = h.judged();
    const occupied = h.seats();
    const me = h.mySid();
    const wall = this.clock();
    let best: string | null = null;
    let bd = Infinity;
    for (const id of ids) {
      const owner = occupied.get(id);
      if (judged && owner !== undefined && owner !== me) continue;
      const ref = this.spots.get(id);
      if (!ref || ref.kind !== "carousel") continue;
      const p = ringPoint(CAROUSELS[ref.ride], horseAngle(ref.horse, wall));
      const d = Math.hypot(p.x - pl.x, p.y - pl.y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    if (!best) {
      h.toast("목마가 모두 찼어요. 잠시 뒤에 다시 와 주세요");
      return;
    }
    const ref = this.spots.get(best)!;
    pl.attach("carousel", ref.ax, ref.ay, ref.ay + 0.6, h.scene.time.now, h.seatReq(), best);
    if (judged) h.sit(best);
  }

  /** 회전목마가 다 찼는지 (안내 문구 회색) */
  carouselFull(o: Interactable): boolean {
    const h = this.host;
    if (!h.judged()) return false;
    const me = h.mySid();
    return rideSpotIds(o).every((id) => {
      const owner = h.seats().get(id);
      return owner !== undefined && owner !== me;
    });
  }

  /** 새로고침 복원: 회전목마 목마 자리 (다른 놀거리는 상호작용 앵커와 같아 WorldScene이 처리) */
  resumeCarousel(x: number, y: number): SpotRef | null {
    for (const [, ref] of this.spots) if (ref.kind === "carousel" && Math.abs(ref.ax - x) <= 2 && Math.abs(ref.ay - y) <= 2) return ref;
    return null;
  }

  /**
   * 매 프레임 (아바타 sync 전에): 탄 사람에게 그림 연출을 넣는다. 내 캐릭터는 spotId, 원격은 서버 점유표의 seatId로 찾는다
   */
  prepare(): void {
    const h = this.host;
    const wall = this.clock();
    const pl = h.player();
    this.dismount(wall);
    this.riders.clear();
    const mine = RIDE_STATES.has(STATE[pl.state]) ? this.spotRef(pl.spotId) : undefined;
    if (mine && pl.spotId) this.riders.set(pl.spotId, -1);
    for (const r of h.remotes().values()) {
      const ref = RIDE_STATES.has(r.stateId) ? this.spotRef(r.seatId) : undefined;
      if (ref && r.seatId) this.riders.set(r.seatId, r.sid);
    }
    this.stepSeesaws(wall);
    pl.view.ride = mine ? this.offset(mine, wall) : pl.state === "boat" ? pl.view.ride : null;
    // 시소: 내 캐릭터도 마주 보는 옆모습으로 (방향은 MOVE로 다른 사람에게 간다)
    const face = pl.view.ride?.dir;
    if (face !== undefined && pl.dir !== face) pl.dir = face;
    for (const r of h.remotes().values()) {
      const ref = RIDE_STATES.has(r.stateId) ? this.spotRef(r.seatId) : undefined;
      if (ref) r.view.ride = this.offset(ref, wall);
      else if (r.stateId !== STATE.boat) r.view.ride = null;
    }
  }

  private clock(): number {
    return this.host.clock ? this.host.clock() : Date.now();
  }

  /**
   * 트램펄린에서 내리기 (F14): 내리려 한 뒤 튀던 한 번이 매트에 닿아 다시 차오르는 순간, 누른 쪽 옆 땅으로 뛰어내린다.
   * 설 수 없는 쪽이면 가까운 각도의 다른 쪽으로
   */
  private dismount(t: number): void {
    const h = this.host;
    const pl = h.player();
    const wish = pl.offWish;
    if (!wish || pl.state !== "trampoline") return;
    const ref = this.spotRef(pl.spotId);
    const now = h.scene.time.now;
    if (!ref || ref.kind !== "trampoline") {
      pl.leaveAnchor(now, true);
      return;
    }
    if (!trampolineLaunch(t) && now - wish.at < TRAMP_OFF_MAX_MS) return;
    const T = TRAMPOLINES[ref.ride];
    const to = trampolineLandings(T, wish.ax, wish.ay).find((p) => standable(p.x, p.y) && !inWater(p.x, p.y)) ?? { x: T.x, y: T.y + 10 };
    if (wish.ax !== 0 || wish.ay !== 0) pl.dir = Math.abs(wish.ax) >= Math.abs(wish.ay) ? (wish.ax < 0 ? DIR.left : DIR.right) : wish.ay < 0 ? DIR.up : DIR.down;
    pl.hopOff(to, TRAMPOLINE_MAT + trampolineHeight(t), now);
    h.sound.play("boing", 0.4, 1.15 + Math.random() * 0.1);
  }

  /** 시소마다: 이번 프레임 움직임 + 타고 내릴 때 섞기 */
  private stepSeesaws(t: number): void {
    this.seesaws.forEach((v, i) => {
      const left = this.occupiedSide(i, 0);
      const right = this.occupiedSide(i, 1);
      const mode = (left ? 1 : 0) + (right ? 2 : 0);
      v.motion = seesawMotion(v.seed, left, right, t);
      if (mode !== v.mode) {
        v.mode = mode;
        v.blendFrom = v.shown;
        v.blendAt = t;
      }
      const k = Math.min(1, Math.max(0, (t - v.blendAt) / SEESAW_BLEND_MS));
      const e = k * k * (3 - 2 * k);
      v.shown = v.blendFrom + (v.motion.tilt - v.blendFrom) * e;
    });
  }

  private occupiedSide(ride: number, side: 0 | 1): boolean {
    const p = seesawSeats(SEESAWS[ride])[side];
    return this.riders.has(spotSeatId("seesaw", p.x, p.y));
  }

  private offset(ref: SpotRef, wall: number): NonNullable<Player["view"]["ride"]> {
    if (ref.kind === "seesaw") {
      const v = this.seesaws[ref.ride];
      const m = v.motion;
      // 착지한 쪽은 잠깐 꾹 눌리고(−1px), 위로 올라간 쪽은 살짝 튄다(pop). 땅을 차는 동안 무릎 굽힘(바닥 앉기 프레임)
      const squash = m.landSide === ref.side && wall - m.landAt < SEESAW_SQUASH_MS && m.landStrength > 0 ? 1 : 0;
      const pushing = m.push === ref.side;
      return {
        ox: 0,
        lift: seesawEndHeight(ref.side, v.shown) - 2 + m.pop[ref.side] - squash,
        depth: ref.ay + 0.5,
        dir: ref.side === 0 ? DIR.right : DIR.left,
        alt: pushing ? "sitGround" : null,
      };
    }
    if (ref.kind === "trampoline") return { ox: 0, lift: TRAMPOLINE_MAT + trampolineHeight(wall), depth: ref.ay + 1 };
    const c = CAROUSELS[ref.ride];
    const p = ringPoint(c, horseAngle(ref.horse, wall));
    return { ox: p.x - ref.ax, lift: ref.ay - p.y + HORSE_LIFT + horseBob(ref.horse, wall), depth: p.y + 0.6 };
  }

  /** 매 프레임 (아바타 갱신 뒤): 놀거리 그림과 소리 */
  update(): void {
    const h = this.host;
    const wall = this.clock();
    const pl = h.player();
    // 내가 지금 탄 놀거리 (소리: 탄 사람은 그대로, 구경꾼은 바로 옆에서만 작게 — rides.bystanderGain)
    const mine = RIDE_STATES.has(STATE[pl.state]) ? this.spotRef(pl.spotId) : undefined;
    // 시소 판 기울기 + 땅에 닿으면 쿵 + 먼지
    SEESAWS.forEach((s, i) => {
      const v = this.seesaws[i];
      const tilt = v.shown;
      const rise = seesawEndHeight(0, tilt) - seesawEndHeight(1, tilt); // 왼쪽이 더 높으면 +
      this.planks[i].setRotation(Math.atan2(rise, SEESAW_HALF * 2)); // 화면 좌표: + = 시계 방향 = 왼쪽 끝이 올라감
      const m = v.motion;
      if (m.landId !== v.landId) {
        const fresh = v.landId !== 0 && v.mode === 3 && wall - m.landAt < 250;
        v.landId = m.landId;
        if (fresh) {
          const ex = s.x + (m.landSide === 0 ? -1 : 1) * (SEESAW_HALF + 2);
          const onIt = mine?.kind === "seesaw" && mine.ride === i;
          const g = onIt ? 1 : bystanderGain(Math.hypot(ex - pl.x, s.y - pl.y));
          if (g > 0) h.sound.play("seesaw", (0.35 + 0.35 * m.landStrength) * g, 0.82 + 0.16 * m.landStrength + Math.random() * 0.06);
          if (!h.reduced) for (let k = 0; k < (m.landStrength > 0.6 ? 3 : 2); k++) h.fx.dust(ex - 3 + k * 3, s.y + 2);
        }
      }
    });
    // 트램펄린: 착지하면 매트가 눌리고 "통"
    TRAMPOLINES.forEach((t, i) => {
      const id = spotSeatId("trampoline", t.x, t.y);
      const busy = this.riders.has(id);
      const ph = ((wall % TRAMPOLINE_PERIOD_MS) + TRAMPOLINE_PERIOD_MS) % TRAMPOLINE_PERIOD_MS;
      const low = busy && trampolineHeight(wall) < 1 && ph < TRAMPOLINE_PERIOD_MS * 0.2;
      this.tramps[i].setFrame(low ? 1 : 0);
      if (low && !this.trampLowPrev[i]) {
        const onIt = this.riders.get(id) === -1;
        const g = onIt ? 1 : bystanderGain(Math.hypot(t.x - pl.x, t.y - pl.y));
        if (g > 0) h.sound.play("boing", 0.6 * g, 0.92 + Math.random() * 0.16);
        if (!h.reduced && onIt) h.fx.dust(t.x, t.y + 2);
      }
      this.trampLowPrev[i] = low;
    });
    // 회전목마: 목마가 돈다 (뒤쪽 목마는 기둥 뒤, 앞쪽은 앞). 오르골은 내가 목마에 탔을 때만 (옆·모닥불에서는 0)
    CAROUSELS.forEach((c, i) => {
      const hs = this.horses[i];
      for (let k = 0; k < hs.length; k++) {
        const a = horseAngle(k, wall);
        const p = ringPoint(c, a);
        // 오른쪽으로 도는 쪽(앞)은 오른쪽을, 뒤쪽은 왼쪽을 본다
        const left = Math.cos(a) < 0;
        hs[k].setTexture(RIDE_TEX.horse(k % HORSE_COLORS.length, left));
        hs[k].setPosition(Math.round(p.x), Math.round(p.y - horseBob(k, wall))).setDepth(p.y);
      }
    });
    h.sound.carousel(carouselOrganLevel(mine?.kind === "carousel"));
  }

  /** 소원 분수에 동전 (내가 던짐: UI가 서버 결과를 받은 뒤). 동전이 날아가 퐁당 */
  coinToss(fromX: number, fromY: number): void {
    const h = this.host;
    const F = WISH_FOUNTAIN;
    const coin = h.scene.add.circle(fromX, fromY - 14, 1.6, 0xf0d060).setDepth(F.y + 30);
    const x0 = fromX;
    const y0 = fromY - 14;
    const x1 = F.x + (Math.random() * 10 - 5);
    const y1 = F.y - 6;
    const arc = { t: 0 };
    // 포물선: 위로 던져 올렸다가 분수 물에 퐁당
    h.scene.tweens.add({
      targets: arc,
      t: 1,
      duration: 560,
      onUpdate: () => coin.setPosition(x0 + (x1 - x0) * arc.t, y0 + (y1 - y0) * arc.t - Math.sin(arc.t * Math.PI) * 22),
      onComplete: () => {
        coin.destroy();
        h.fx.splash(F.x, F.y - 8);
      },
    });
    h.sound.play("wish", 0.7);
  }

  /** 다른 사람의 물 튀기기(act splash)가 분수 근처면 분수에서 튄다 */
  nearFountain(x: number, y: number): { x: number; y: number } | null {
    const F = WISH_FOUNTAIN;
    return Math.hypot(x - F.x, y - (F.y + 12)) <= 40 ? { x: F.x, y: F.y - 8 } : null;
  }

  destroy(): void {
    this.host.sound.carousel(0);
  }
}

/** 놀거리·조각배 텍스처 (처음 한 번) */
export function ensureRideTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(RIDE_TEX.fountain)) return;
  addCanvasTexture(scene, RIDE_TEX.fountain, { canvas: fountainSheet(), frameW: FOUNTAIN_W, frameH: FOUNTAIN_H });
  addCanvasTexture(scene, RIDE_TEX.seesawBase, { canvas: seesawBase() });
  addCanvasTexture(scene, RIDE_TEX.seesawPlank, { canvas: seesawPlank() });
  addCanvasTexture(scene, RIDE_TEX.trampoline, { canvas: trampolineSheet(), frameW: TRAMP_W, frameH: TRAMP_H });
  addCanvasTexture(scene, RIDE_TEX.carouselFloor, { canvas: carouselFloor() });
  addCanvasTexture(scene, RIDE_TEX.carouselTop, { canvas: carouselTop() });
  addCanvasTexture(scene, RIDE_TEX.carouselPole, { canvas: carouselPole() });
  HORSE_COLORS.forEach((c, v) => {
    addCanvasTexture(scene, RIDE_TEX.horse(v, false), { canvas: horse(c, false) });
    addCanvasTexture(scene, RIDE_TEX.horse(v, true), { canvas: horse(c, true) });
  });
}

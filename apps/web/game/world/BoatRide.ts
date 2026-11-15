import * as Phaser from "phaser";
import { BOATS, boatKind, DIR, DUCK_DOCK, DUCK_DOCK_DECK, DUCK_SIDE_SEAT, FERRY_DOCK, STATE, type Boat, type BoatKind, type BoatSeat, type DirId, type Sid, type WelcomeMsg } from "@tomb/protocol";
import type { ResumeState } from "@/lib/resume";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { MoveInput } from "../logic/movement";
import { DEADZONE_ENTER } from "../logic/movement";
import { boatOf, DOCKED_DIST, duckBump, joinSeat, pickBoatSeat, seatOffset, seatsOf, shorePoint, stepBoat, type BoatMotion, type BoatPresence } from "../logic/boat";
import { spotVerdict } from "../logic/restore";
import {
  BOAT_FEET_Y,
  BOAT_FRAMES,
  BOAT_H,
  BOAT_TINTS,
  boatRowerX,
  boatSheet,
  boatW,
  DUCK_FEET_Y,
  DUCK_FRAMES,
  DUCK_H,
  DUCK_SEAT_X,
  DUCK_STYLES,
  DUCK_W,
  duckSheet,
  duckSign,
  RIDE_TEX,
} from "../sprites/rideProps";
import { inWater, standable, waterCurrent } from "./layout";
import { ensureRideTextures, type RideHost } from "./PlazaRides";
import { bystanderGain } from "./rides";

// 조각배 (50번). 나루터(FERRY_DOCK)에서 E → 빈 배의 앞자리(노 젓기) 또는 2인승 뒷자리(같이 타기). 자리는 서버 좌석(1인 1자리).
//  - 노 젓기: 방향키·조이스틱, 물 위로만, 강에서는 물살(layout.waterCurrent)에 떠내려간다. 호수까지 갈 수 있다
//  - 내리기: 물가(둑·나루터·잔교) 가까이에서 E. 빈 배는 잠시 뒤 나루터로 돌아온다(모두의 화면에서 같은 규칙)
//  - 2인승: 뒷자리 사람은 노 젓는 사람을 따라간다. 노 젓던 사람이 내리면 뒷자리 사람이 앞자리로 옮겨 앉는다
//    → 먼저 탄 사람이 늘 앞자리에서 노를 젓는다 (F13). 한 명만 탄 2인승의 빈 뒷자리에는 나루터가 아니어도
//    물가에서 배가 가까이 오면 E로 같이 탄다 (서버는 같은 배의 다른 자리에 앉은 사람 곁이면 받아 준다)
//  - 다른 사람에게는 노 젓는 사람의 위치(보간)에 배를 그리고, 뒷자리 사람은 그 배에 붙여 그린다
//  - 새로고침(자리 복원)·실시간 서버 재배포: 서버가 배 자리를 기억하면 그대로, 놓쳤으면 가까운 뭍(없으면 나루터)에 내려 준다
//  - 배 위 낚시(4번): 물가가 아닌 물 위에서 E → fishingSpot()이 알려 준 물(강·호수)로 낚시 (world/forage Foraging.fishFromBoat)
//  - 11/15 오리배 (kind "duck"): 오리 연못 선착장(DUCK_DOCK)에서 같은 규칙으로 탄다. 두 자리가 나란히(왼쪽 = 먼저 탄 사람이 페달·조종),
//    연못 밖으로 못 나가고 물살이 없다. 움직이면 물레바퀴가 돌며 물이 튀고, 탄 사람들이 번갈아 페달을 밟는다(들썩).
//    Space = 꽥! (act "quack": 같은 채널에 소리·"꽥!" 말풍선), E는 물가에서 내리기만 (11/15). 오리배끼리 닿으면 살짝 튕겨 나간다 (logic/boat duckBump).
//    오리 연못은 낚시터가 아니라 배 위 낚시도 없다

/** 오리배 꽥 간격 (서버 act 간격과 같게 — 내 화면과 남의 화면이 같은 횟수) */
const QUACK_MS = 2000;
/** 오리배 물레바퀴 한 칸 도는 시간 · 물방울 간격 */
const WHEEL_MS = 110;
const DROP_MS = 170;
/** 부딪힘 소리 간격 */
const BUMP_MS = 650;

/** 오리배 탑승자를 위한 호스트: 꽥은 WorldScene의 동작(act) 경로로 보낸다 */
export type BoatHost = RideHost & { act(kind: "quack"): void };

/** 빈 배가 나루터로 돌아오기 시작하기까지 (내린 자리에서 잠시 떠 있다가) */
export const BOAT_RETURN_DELAY_MS = 3000;
/** 돌아올 때 사라졌다 나타나는 시간 */
const FADE_MS = 650;
/** 노 젓는 소리 간격 (한 번 저을 때마다) */
const STROKE_MS = 720;
/** 물결 자국 간격 */
const WAKE_MS = 260;

type BoatView = {
  def: Boat;
  duck: boolean;
  /** 그림 갈래 (조각배 = BOATS 순서, 오리배 = 오리배끼리 순서) */
  tex: number;
  back: Phaser.GameObjects.Sprite;
  front: Phaser.GameObjects.Sprite;
  /** 앞자리(노 젓는 자리) 위치 */
  x: number;
  y: number;
  left: boolean;
  /** docked: 나루터에 매여 있다, out: 누가 타고 있다, returning: 비었다 (returnAt에 사라졌다가 나루터에 나타난다) */
  mode: "docked" | "out" | "returning";
  returnAt: number;
  /** 움직임 판정 (노 그림·소리·물결) */
  px: number;
  py: number;
  speed: number;
  strokeAt: number;
  wakeAt: number;
  fade: Phaser.Tweens.Tween | null;
};

export class BoatRide {
  private readonly views: BoatView[] = [];
  private readonly motion: BoatMotion = { x: 0, y: 0, vx: 0, vy: 0 };
  /** 내가 탄 배에서 마지막으로 본 방향 (배는 좌우로만 그린다) */
  private left = false;
  private lastSeat: string | null = null;
  private quackAt = -Infinity;
  private bumpAt = -Infinity;
  /** 지금 오리배에 타 있는지 (UI 터치 버튼 "꽥!" — boat:duck) */
  private duckShown = false;
  private readonly drops: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sign: Phaser.GameObjects.Image;

  constructor(private readonly host: BoatHost) {
    const scene = host.scene;
    ensureRideTextures(scene);
    ensureBoatTextures(scene);
    let ducks = 0;
    BOATS.forEach((def, i) => {
      const left = def.facing === DIR.left;
      const duck = boatKind(def) === "duck";
      const tex = duck ? ducks++ : i;
      const back = scene.add.sprite(def.x, def.y, duck ? RIDE_TEX.duckBack(left, tex) : RIDE_TEX.boatBack(def.seats, left, tex), 0);
      const front = scene.add.sprite(def.x, def.y, duck ? RIDE_TEX.duckFront(left, tex) : RIDE_TEX.boatFront(def.seats, left, tex), 0);
      const v: BoatView = { def, duck, tex, back, front, x: def.x, y: def.y, left, mode: "docked", returnAt: 0, px: def.x, py: def.y, speed: 0, strokeAt: 0, wakeAt: 0, fade: null };
      this.place(v, 0);
      this.views.push(v);
    });
    // 오리배 선착장 팻말 (판자 왼쪽 둑) — 글씨 "오리배 · 2인승"은 WorldMap 이름표
    const sx = DUCK_DOCK_DECK.x - 12;
    const sy = DUCK_DOCK_DECK.y + 8;
    this.sign = scene.add.image(sx, sy + 1, RIDE_TEX.duckSign).setOrigin(0.5, 1).setDepth(sy);
    // 물레바퀴 물방울
    this.drops = scene.add.particles(0, 0, TEX.spark, {
      lifespan: { min: 280, max: 460 },
      speed: { min: 14, max: 34 },
      angle: { min: 230, max: 310 },
      gravityY: 150,
      scale: { start: 0.5, end: 0.2 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xbfe8ff, 0x8fd0ff, 0xffffff],
      emitting: false,
    });
  }

  // ── 상태 ──

  private occupant(seatId: string): Sid | -1 | null {
    const pl = this.host.player();
    if (pl.boatSeatId === seatId) return -1;
    const owner = this.host.seats().get(seatId);
    if (owner === undefined || owner === this.host.mySid()) return null;
    return owner;
  }

  /** 이 배의 지금 자리: 노 젓는 사람(없으면 뒷자리 사람)을 따라간다. 아무도 없으면 null */
  private riderPos(def: Boat): { x: number; y: number; left: boolean; rower: boolean } | null {
    const pl = this.host.player();
    const seats = seatsOf(def.id);
    for (let i = 0; i < seats.length; i++) {
      const who = this.occupant(seats[i].id);
      if (who === null) continue;
      let x: number;
      let y: number;
      let left: boolean;
      if (who === -1) {
        x = pl.x;
        y = pl.y;
        left = pl.dir === DIR.left;
      } else {
        const r = this.host.remotes().get(who);
        if (!r || r.stateId !== STATE.boat) continue;
        x = r.x;
        y = r.y;
        left = r.view.dir === DIR.left;
      }
      // 뒷자리(오리배는 옆자리) 사람이 기준이면 앞자리 자리로 옮겨 그린다
      if (i === 1) x -= seatOffset(def, left);
      return { x, y, left, rower: i === 0 };
    }
    return null;
  }

  private presence = (boatId: string): BoatPresence => {
    const v = this.views.find((w) => w.def.id === boatId)!;
    const rowerSeat = seatsOf(boatId)[0];
    const who = this.occupant(rowerSeat.id);
    return { docked: v.mode === "docked", rower: who === null || who === -1 ? null : who, at: v.mode === "out" ? { x: v.x, y: v.y } : null, left: v.left };
  };

  /** 물가에서 같이 탈 수 있는 2인승 뒷자리 (F13). 배에 탔거나·앉았거나·매달렸거나·물속·공중이면 null */
  private joinTarget() {
    const h = this.host;
    const pl = h.player();
    if (!h.judged() || pl.inBoat || pl.sitting || pl.anchored || pl.airborne || pl.inWater) return null;
    return joinSeat(pl.x, pl.y, h.seats(), this.presence);
  }

  // ── 입력 ──

  /** 나루터에서 E: 빈 배에 타거나, 2인승에서 기다리는 사람 뒷자리에 같이 탄다. dockId "dock:duck" = 오리배 선착장 */
  useDock(dockId = "dock:ferry"): void {
    const h = this.host;
    const pl = h.player();
    if (pl.inBoat) return;
    const kind = dockKind(dockId);
    const occupied = h.judged() ? h.seats() : new Map<string, Sid>();
    const seat = pickBoatSeat(pl.x, pl.y, occupied, this.presence, kind);
    if (!seat) {
      h.toast(kind === "duck" ? "오리배가 모두 나가 있어요. 빈 오리배는 곧 선착장으로 돌아와요" : "배가 모두 나가 있어요. 빈 배는 곧 나루터로 돌아와요");
      return;
    }
    this.boardSeat(seat);
  }

  /** 배 자리에 탄다 (나루터·물가 공통). 노 젓는 사람이 있는 배의 뒷자리면 지금 배 자리 뒤로 */
  private boardSeat(seat: BoatSeat): void {
    const h = this.host;
    const pl = h.player();
    const v = this.views.find((w) => w.def.id === seat.boatId)!;
    const now = h.scene.time.now;
    let x = seat.x;
    let y = seat.y;
    let dir: DirId = seat.facing;
    if (seat.index === 1 && v.mode === "out") {
      // 기다리는 배의 뒷자리 (배가 나루터에서 살짝 떠 있거나, 물가에 와 있다)
      x = v.x + seatOffset(v.def, v.left);
      y = v.y;
      dir = v.left ? DIR.left : DIR.right;
    }
    pl.board(seat.id, x, y, dir, now, h.seatReq());
    this.lastSeat = seat.id;
    this.motion.x = x;
    this.motion.y = y;
    this.motion.vx = this.motion.vy = 0;
    this.left = dir === DIR.left;
    if (h.judged()) h.sit(seat.id);
    h.sound.play("boat-board", 0.6);
    if (!h.reduced) h.fx.splash(x, y + 2);
  }

  /**
   * 배 위에서의 키 (E·X·스페이스). 배에 타고 있으면 여기서 다 처리하고 true.
   * E = 물가에서 내리기, X·스페이스 = 아무것도 하지 않는다 (배 위에서는 앉기·점프가 없다)
   */
  onAction(a: string): boolean {
    const pl = this.host.player();
    if (!pl.inBoat) {
      // 물가에 온 2인승의 빈 뒷자리에 같이 타기 (F13)
      const join = a === "interact" ? this.joinTarget() : null;
      if (!join) return false;
      this.boardSeat(join);
      return true;
    }
    if (a === "interact") this.disembark(false);
    else if (a === "jump") this.quack(); // 오리배: Space = 꽥 (조각배는 아무것도 하지 않는다)
    return a === "interact" || a === "sit" || a === "jump";
  }

  /** 지금 오리배에 타 있는지 */
  private inDuck(): boolean {
    const seat = this.host.player().boatSeatId;
    const ref = seat ? boatOf(seat) : null;
    return !!ref && boatKind(ref.boat) === "duck";
  }

  /** 오리배 꽥! (오리배에 타 있을 때만, QUACK_MS 간격). 소리·말풍선은 WorldScene의 act 경로 → quackFx */
  quack(): void {
    if (!this.inDuck()) return;
    const now = this.host.scene.time.now;
    if (now - this.quackAt < QUACK_MS) return;
    this.quackAt = now;
    this.host.act("quack");
  }

  /** 꽥 연출 (나·다른 사람 공통): 오리 머리 쪽에서 소리 + 물결 한 겹. d = 나와의 거리 */
  quackFx(x: number, y: number, mine: boolean, d: number): void {
    const h = this.host;
    const g = mine ? 0.8 : 0.8 * Math.max(0, 1 - d / 420);
    if (g > 0.02) h.sound.quack(g, 0.94 + Math.random() * 0.12);
    if (h.reduced) return;
    const v = this.views.find((w) => w.duck && w.mode === "out" && Math.hypot(w.x - x, w.y - y) < 20);
    const hx = v ? v.x + DUCK_SIDE_SEAT / 2 + (v.left ? -20 : 20) : x;
    const ring = h.scene.add.image(hx, y + 3, TEX.avRipple).setDepth(DEPTH.decal + 3).setAlpha(0.6).setScale(0.6);
    h.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 1.8, scaleY: 1.4, duration: 700, onComplete: () => ring.destroy() });
  }

  /** 물가에서 내리기. force면 뭍이 멀어도 (나루터로) 내린다 — 자동 걷기·복원 실패 등 */
  disembark(force: boolean, toast?: string): boolean {
    const h = this.host;
    const pl = h.player();
    if (!pl.inBoat) return false;
    const to = shorePoint(pl.x, pl.y, standable) ?? (force ? this.dockStand() : null);
    if (!to) {
      h.toast("둑, 나루터, 잔교 가까이 가면 내릴 수 있어요");
      return false;
    }
    this.leave(to, toast);
    return true;
  }

  /** 뭍이 멀 때 내려 줄 선착장 (내가 탄 배 종류의 선착장 판자 끝) */
  private dockStand(): { x: number; y: number } {
    return this.inDuck() ? { x: DUCK_DOCK.x, y: DUCK_DOCK.y - 6 } : { x: FERRY_DOCK.x, y: FERRY_DOCK.y };
  }

  private leave(to: { x: number; y: number }, toast?: string): void {
    const h = this.host;
    const pl = h.player();
    const seat = pl.boatSeatId;
    pl.leaveBoat(to.x, to.y, h.scene.time.now);
    pl.view.ride = null;
    // 서버도 곧 걷기 MOVE로 자리를 풀지만, 다른 사람이 바로 탈 수 있게 먼저 알린다
    if (seat && h.judged()) h.stand();
    if (toast) h.toast(toast);
    h.sound.play("boat-board", 0.45, 1.1);
  }

  // ── 서버 좌석 ──

  /** 다른 사람이 내 배 자리를 먼저 잡았다 (동시에 탐) → 뭍으로 */
  onSeat(seatId: string, sid: Sid | null): void {
    const pl = this.host.player();
    if (sid !== null && sid !== this.host.mySid() && pl.boatSeatId === seatId) {
      this.leave(this.nearestShore(), "누가 먼저 그 배에 탔어요");
    }
  }

  /** 서버가 배 자리를 거절했다. 내 배 자리였으면 true */
  onSeatDenied(seatId: string): boolean {
    const pl = this.host.player();
    if (pl.boatSeatId !== seatId) return false;
    const owner = this.host.seats().get(seatId);
    this.leave(this.nearestShore(), owner !== undefined ? "누가 먼저 그 배에 탔어요" : "배에 탈 수 없었어요. 나루터에서 다시 타 주세요");
    return true;
  }

  private nearestShore(): { x: number; y: number } {
    const pl = this.host.player();
    return shorePoint(pl.x, pl.y, standable, 60) ?? this.dockStand();
  }

  /**
   * (재)접속 welcome: 배 자리를 서버 점유표로 판정 (새로고침 복원·재연결·재배포 공통).
   * keep = 서버가 내 자리로 기억한다 / claim = 비었다 → 배가 나루터 가까이면 다시 요청, 멀면(그 사이 배가 돌아감) 뭍으로 / leave = 남이 탔다 → 뭍으로
   */
  onWelcome(m: WelcomeMsg): void {
    const pl = this.host.player();
    const seat = pl.boatSeatId;
    if (!seat || !m.spots) return;
    const v = spotVerdict(seat, m.seats, m.sid);
    if (v === "keep") return;
    const ref = boatOf(seat);
    if (v === "claim" && ref && Math.hypot(pl.x - ref.seat.x, pl.y - ref.seat.y) <= DOCKED_DIST) {
      this.host.sit(seat);
      return;
    }
    this.leave(this.nearestShore(), v === "leave" ? "그 사이 다른 사람이 그 배에 탔어요" : "배가 나루터로 돌아갔어요");
  }

  /** 새로고침 직전 배에 타고 있었으면 그 자리로 (판정은 welcome에서). 처리했으면 true */
  resumePose(r: ResumeState): boolean {
    if (r.pose !== "boat") return false;
    const pl = this.host.player();
    const ref = r.seatId ? boatOf(r.seatId) : null;
    if (!ref) return true; // 모르는 배: 서 있는 채로 (create가 이미 그 자리에 세웠다 — 물이면 헤엄)
    const left = r.dir === DIR.left;
    pl.board(ref.seat.id, r.x, r.y, left ? DIR.left : DIR.right, this.host.scene.time.now, null, false);
    this.motion.x = r.x;
    this.motion.y = r.y;
    this.left = left;
    return true;
  }

  // ── 매 프레임 ──

  /** 노 젓기 (Player.update 뒤에). 뒷자리면 노 젓는 사람을 따라간다 */
  steer(move: MoveInput, dtMs: number): void {
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const seat = pl.boatSeatId;
    if (seat !== this.lastSeat) {
      this.lastSeat = seat;
      if (seat) {
        this.motion.x = pl.x;
        this.motion.y = pl.y;
        this.motion.vx = this.motion.vy = 0;
      }
    }
    if (!seat) return;
    const ref = boatOf(seat);
    if (!ref) return;
    if (ref.seat.index === 1) {
      // 뒷자리: 노 젓는 사람이 있으면 그 배에 붙어 간다. 노 젓던 사람이 내렸으면 앞자리로 옮겨 앉는다
      const front = seatsOf(ref.boat.id)[0];
      const who = this.occupant(front.id);
      const r = typeof who === "number" && who >= 0 ? h.remotes().get(who) : undefined;
      if (r && r.stateId === STATE.boat) {
        const left = r.view.dir === DIR.left;
        this.left = left;
        pl.boatTo(r.x + seatOffset(ref.boat, left), r.y, left ? DIR.left : DIR.right, now);
        return;
      }
      if (who === null && h.judged()) {
        // 앞자리가 비었다 → 그 자리로 (서버는 같은 배 안 옮겨 앉기로 거리와 상관없이 받아 준다)
        const x = pl.x - seatOffset(ref.boat, this.left);
        pl.boardSlide(front.id, x, pl.y);
        this.motion.x = x;
        this.motion.y = pl.y;
        h.sit(front.id);
      }
      return;
    }
    const moving = Math.hypot(move.ax, move.ay) >= DEADZONE_ENTER;
    const kind = boatKind(ref.boat);
    const m = stepBoat(this.motion, moving ? move.ax : 0, moving ? move.ay : 0, dtMs, inWater(this.motion.x, this.motion.y) ? waterCurrent(this.motion.x, this.motion.y) : { vx: 0, vy: 0 }, kind);
    if (kind === "duck") this.bumpDucks(ref.boat.id, now);
    if (Math.abs(m.vx) > 4) this.left = m.vx < 0;
    pl.boatTo(Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, this.left ? DIR.left : DIR.right, now);
  }

  /** 오리배 범퍼카: 내 오리배가 다른 오리배(떠 있거나 매여 있는)에 닿으면 살짝 튕겨 나간다 */
  private bumpDucks(boatId: string, now: number): void {
    const others: { x: number; y: number }[] = [];
    for (const v of this.views) if (v.duck && v.def.id !== boatId && !v.fade) others.push({ x: v.x, y: v.y });
    if (!duckBump(this.motion, others) || now - this.bumpAt < BUMP_MS) return;
    this.bumpAt = now;
    const h = this.host;
    h.sound.play("boing", 0.32, 1.35);
    if (!h.reduced) this.drops.setDepth(this.motion.y + 2).explode(5, this.motion.x + DUCK_SIDE_SEAT / 2, this.motion.y + 2);
  }

  /** 탄 사람 들썩임: 물결 흔들림 + 오리배가 움직이는 동안 두 사람이 번갈아 페달을 밟는다 (1px) */
  private riderLift(ref: { boat: Boat; seat: BoatSeat }, wall: number): number {
    if (this.host.reduced) return 0;
    const bi = BOATS.indexOf(ref.boat);
    const bob = Math.sin(wall / 520 + bi * 1.3) * 0.9;
    if (boatKind(ref.boat) !== "duck") return bob;
    const v = this.views[bi];
    const pedal = v && v.mode === "out" && v.speed > 6 ? (Math.floor(wall / 150) + ref.seat.index) % 2 : 0;
    return bob * 0.7 + pedal;
  }

  /**
   * 원격 아바타 갱신 전에: 뒷자리 손님을 노 젓는 사람의 배에 붙이고, 탄 사람(나·원격)에게 물결 흔들림을 넣는다
   */
  prepare(): void {
    const h = this.host;
    const wall = Date.now();
    const pl = h.player();
    for (const r of h.remotes().values()) {
      r.posOverride = null;
      if (r.stateId !== STATE.boat) continue;
      const ref = r.seatId ? boatOf(r.seatId) : null;
      if (!ref) continue;
      r.view.ride = { ox: 0, lift: this.riderLift(ref, wall), depth: null };
      if (ref.seat.index !== 1) continue;
      const front = seatsOf(ref.boat.id)[0];
      const who = this.occupant(front.id);
      if (who === -1) r.posOverride = { x: pl.x + seatOffset(ref.boat, pl.dir === DIR.left), y: pl.y };
      else if (who !== null) {
        const f = h.remotes().get(who);
        if (f && f.stateId === STATE.boat) r.posOverride = { x: f.x + seatOffset(ref.boat, f.view.dir === DIR.left), y: f.y };
      }
    }
    if (pl.inBoat) {
      const ref = boatOf(pl.boatSeatId!);
      pl.view.ride = { ox: 0, lift: ref ? this.riderLift(ref, wall) : 0, depth: null };
    }
    const duck = pl.inBoat && this.inDuck();
    if (duck !== this.duckShown) {
      this.duckShown = duck;
      bridge.emit("boat:duck", { riding: duck });
    }
  }

  /** 배 그림 (아바타 갱신 뒤에): 탄 사람을 따라가고, 빈 배는 잠시 뒤 나루터로 돌아온다 */
  update(dtMs: number): void {
    const h = this.host;
    const now = h.scene.time.now;
    const wall = Date.now();
    const pl = h.player();
    this.views.forEach((v, i) => {
      const rider = this.riderPos(v.def);
      if (rider) {
        if (v.mode !== "out") {
          v.fade?.stop();
          v.fade = null;
          v.back.setAlpha(1);
          v.front.setAlpha(1);
        }
        v.mode = "out";
        v.x = rider.x;
        v.y = rider.y;
        v.left = rider.left;
      } else if (v.mode === "out") {
        v.mode = "returning";
        v.returnAt = now + BOAT_RETURN_DELAY_MS;
      } else if (v.mode === "returning" && now >= v.returnAt && !v.fade) {
        this.sendHome(v);
      }
      // 움직임 → 노 젓는 그림·소리·물결
      const d = Math.hypot(v.x - v.px, v.y - v.py);
      const inst = dtMs > 0 ? (d / dtMs) * 1000 : 0;
      v.speed += (inst - v.speed) * Math.min(1, dtMs / 200);
      v.px = v.x;
      v.py = v.y;
      const rowing = v.mode === "out" && v.speed > 6 && !!rider?.rower;
      let frame = 0;
      if (v.duck) {
        // 오리배: 움직이는 동안 물레바퀴가 돌고 고물에서 물이 튄다 (페달 소리는 없다 — 꽥이 주인공)
        if (v.mode === "out" && v.speed > 6) {
          frame = Math.floor(wall / WHEEL_MS) % DUCK_FRAMES;
          if (now - v.strokeAt >= DROP_MS && !h.reduced) {
            v.strokeAt = now;
            const sx = v.x + DUCK_SIDE_SEAT / 2 + (v.left ? 13 : -13);
            this.drops.setDepth(v.y + 2).explode(2, sx, v.y + 1);
          }
        }
      } else if (rowing) {
        const ph = (wall % STROKE_MS) / STROKE_MS;
        frame = ph < 0.5 ? 1 : 2;
        if (now - v.strokeAt >= STROKE_MS) {
          v.strokeAt = now;
          const mine = pl.boatSeatId !== null && seatsOf(v.def.id).some((s) => s.id === pl.boatSeatId);
          // 노 젓는 소리: 탄 사람은 그대로, 물가 구경꾼은 바로 옆에서만 작게
          const g = mine ? 0.55 : 0.55 * bystanderGain(Math.hypot(v.x - pl.x, v.y - pl.y));
          if (g > 0.01) h.sound.play("row", g, 0.9 + Math.random() * 0.2);
        }
      }
      if (v.mode === "out" && v.speed > 6 && now - v.wakeAt >= WAKE_MS && !h.reduced) {
        v.wakeAt = now;
        this.wake(v);
      }
      v.back.setTexture(v.duck ? RIDE_TEX.duckBack(v.left, v.tex) : RIDE_TEX.boatBack(v.def.seats, v.left, v.tex), frame);
      v.front.setTexture(v.duck ? RIDE_TEX.duckFront(v.left, v.tex) : RIDE_TEX.boatFront(v.def.seats, v.left, v.tex), frame);
      this.place(v, h.reduced ? 0 : Math.sin(wall / 520 + i * 1.3) * (v.duck ? 0.65 : 0.9));
    });
  }

  /** 앞자리 위치(v.x, v.y)에 배 그림을 놓는다. 뒤 판은 사람 뒤, 앞 판은 사람 앞. 오리배는 왼쪽 자리가 기준 (뱃머리와 상관없이) */
  private place(v: BoatView, bob: number): void {
    let ox: number;
    let oy: number;
    if (v.duck) {
      ox = (v.left ? DUCK_W - DUCK_SEAT_X - DUCK_SIDE_SEAT - 0.5 : DUCK_SEAT_X + 0.5) / DUCK_W;
      oy = DUCK_FEET_Y / DUCK_H;
    } else {
      const W = boatW(v.def.seats);
      const rx = boatRowerX(v.def.seats);
      ox = (v.left ? W - rx - 0.5 : rx + 0.5) / W;
      oy = BOAT_FEET_Y / BOAT_H;
    }
    const y = Math.round(v.y - bob);
    v.back.setOrigin(ox, oy).setPosition(Math.round(v.x), y).setDepth(v.y - 1);
    v.front.setOrigin(ox, oy).setPosition(Math.round(v.x), y).setDepth(v.y + 1.5);
  }

  /** 빈 배: 스르르 사라졌다가 나루터에 다시 나타난다 */
  private sendHome(v: BoatView): void {
    const scene = this.host.scene;
    v.fade = scene.tweens.add({
      targets: [v.back, v.front],
      alpha: 0,
      duration: FADE_MS,
      onComplete: () => {
        v.x = v.px = v.def.x;
        v.y = v.py = v.def.y;
        v.left = v.def.facing === DIR.left;
        v.speed = 0;
        v.fade = scene.tweens.add({
          targets: [v.back, v.front],
          alpha: 1,
          duration: FADE_MS,
          onComplete: () => {
            v.fade = null;
            if (v.mode === "returning") v.mode = "docked";
          },
        });
      },
    });
  }

  private wake(v: BoatView): void {
    const scene = this.host.scene;
    const sx = v.duck ? v.x + DUCK_SIDE_SEAT / 2 + (v.left ? 17 : -17) : v.x + (v.left ? 14 : -14);
    const img = scene.add.image(sx, v.y + 3, TEX.avRipple).setDepth(DEPTH.decal + 3).setAlpha(0.5).setScale(0.7);
    scene.tweens.add({ targets: img, alpha: 0, scaleX: 1.6, scaleY: 1.3, duration: 900, onComplete: () => img.destroy() });
  }

  // ── 안내 ──

  /** 배 위 안내 문구 (null = 배에 타고 있지 않다) */
  hint(prefix: string): string | null {
    const pl = this.host.player();
    if (!pl.inBoat) return this.joinTarget() ? `${prefix}뒷자리에 같이 타기` : null;
    const ref = boatOf(pl.boatSeatId!);
    const shore = shorePoint(pl.x, pl.y, standable) !== null;
    if (ref && boatKind(ref.boat) === "duck") {
      // 오리배: Space = 꽥, E = 물가에서 내리기 (11/15 — E로도 꽥이 나가 헷갈렸다). 낚시 없음
      if (ref.seat.index === 1) return shore ? `${prefix}내리기 · Space 꽥 · 같이 타는 중` : "Space 꽥 · 물가에서 E로 내리기 · 같이 타는 중";
      return shore ? `${prefix}내리기 · Space 꽥 · 방향키로 페달` : "Space 꽥 · 방향키로 페달 · 물가에서 E로 내리기";
    }
    if (ref?.seat.index === 1) return shore ? `${prefix}내리기 · 같이 타는 중` : `${prefix}낚시하기 · 같이 타는 중`;
    return shore ? `${prefix}내리기 · 방향키로 노 젓기` : `${prefix}낚시하기 · 방향키로 노 젓기`;
  }

  /** 나루터 안내: 탈 배가 없으면 회색, 2인승에서 기다리는 사람이 있으면 같이 타기 */
  dockHint(prefix: string, dockId = "dock:ferry"): { text: string; dim: boolean } {
    const h = this.host;
    const pl = h.player();
    const kind = dockKind(dockId);
    const occupied = h.judged() ? h.seats() : new Map<string, Sid>();
    const seat = pickBoatSeat(pl.x, pl.y, occupied, this.presence, kind);
    if (kind === "duck") {
      if (!seat) return { text: "오리배가 모두 나가 있어요", dim: true };
      return { text: seat.index === 1 ? `${prefix}오리배 옆자리에 같이 타기` : `${prefix}오리배 타기 (2인승)`, dim: false };
    }
    if (!seat) return { text: "배가 모두 나가 있어요", dim: true };
    return { text: seat.index === 1 ? `${prefix}뒷자리에 같이 타기` : `${prefix}조각배 타기`, dim: false };
  }

  /** 물가(둑·나루터·잔교) 가까이라 E로 내릴 수 있는지 (아니면 E = 배 위 낚시) */
  nearShore(): boolean {
    const pl = this.host.player();
    return pl.inBoat && shorePoint(pl.x, pl.y, standable) !== null;
  }

  /** 배 위 낚시: 지금 내 배가 떠 있는 물과 자리. 배에 타고 있지 않으면 null */
  fishingSpot(): { x: number; y: number; water: "river" | "lake" } | null {
    const pl = this.host.player();
    if (!pl.inBoat || this.inDuck()) return null; // 오리 연못은 낚시터가 아니다
    const lake = waterCurrent(pl.x, pl.y).vx === 0 && waterCurrent(pl.x, pl.y).vy === 0;
    return { x: pl.x, y: pl.y, water: lake ? "lake" : "river" };
  }

  destroy(): void {
    for (const v of this.views) {
      v.fade?.stop();
      v.back.destroy();
      v.front.destroy();
    }
    this.drops.destroy();
    this.sign.destroy();
    if (this.duckShown) bridge.emit("boat:duck", { riding: false });
  }
}

/** 선착장 상호작용 id → 배 종류 */
function dockKind(dockId: string): BoatKind {
  return dockId === "dock:duck" ? "duck" : "row";
}

function ensureBoatTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(RIDE_TEX.duckSign)) scene.textures.addCanvas(RIDE_TEX.duckSign, duckSign());
  let ducks = 0;
  BOATS.forEach((def, i) => {
    if (boatKind(def) === "duck") {
      const t = ducks++;
      const style = DUCK_STYLES[t % DUCK_STYLES.length];
      for (const left of [false, true]) {
        const bk = RIDE_TEX.duckBack(left, t);
        const fk = RIDE_TEX.duckFront(left, t);
        if (!scene.textures.exists(bk)) addSheet(scene, bk, duckSheet("back", left, style), DUCK_W, DUCK_FRAMES, DUCK_H);
        if (!scene.textures.exists(fk)) addSheet(scene, fk, duckSheet("front", left, style), DUCK_W, DUCK_FRAMES, DUCK_H);
      }
      return;
    }
    const tint = BOAT_TINTS[i % BOAT_TINTS.length];
    for (const left of [false, true]) {
      const bk = RIDE_TEX.boatBack(def.seats, left, i);
      const fk = RIDE_TEX.boatFront(def.seats, left, i);
      const W = boatW(def.seats);
      if (!scene.textures.exists(bk)) addSheet(scene, bk, boatSheet(def.seats, "back", left, tint), W);
      if (!scene.textures.exists(fk)) addSheet(scene, fk, boatSheet(def.seats, "front", left, tint), W);
    }
  });
}

function addSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frameW: number, frames = BOAT_FRAMES, frameH = BOAT_H): void {
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) return;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * frameW, 0, frameW, frameH);
}

import * as Phaser from "phaser";
import { BOATS, boatKind, DIR, DUCK_DOCK, DUCK_DOCK_DECK, DUCK_SIDE_SEAT, FERRY_DOCK, STATE, type Boat, type BoatKind, type BoatSeat, type DirId, type Sid, type WelcomeMsg, isDirId } from "@tomb/protocol";
import type { ResumeState } from "@/lib/resume";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { isTouchUi } from "../input/keyHint";
import type { MoveInput } from "../logic/movement";
import { DEADZONE_ENTER } from "../logic/movement";
import {
  boatOf,
  DOCKED_DIST,
  duckBump,
  duckLandNear,
  duckShoreRing,
  boatFacing,
  joinSeat,
  nearestDuckLanding,
  pickBoatSeat,
  seatDelta,
  seatsOf,
  shorePoint,
  steerToward,
  stepBoat,
  type BoatMotion,
  type BoatPresence,
  type DuckLanding,
} from "../logic/boat";
import { spotVerdict } from "../logic/restore";
import { BOAT_FRAMES, BOAT_TINTS, boatGeom, boatSheet, boatVSheet, DUCK_FRAMES, DUCK_STYLES, duckGeom, duckSheet, duckSign, duckVSheet, RIDE_TEX } from "../sprites/rideProps";
import { inWater, waterCurrent } from "./layout";
import { safeGround } from "./walkReach";
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
//  - 11/16 오리배는 아무 둑에서나 내린다: 둑 가까이면 E로 바로(「E 내리기」), 한가운데서 E면 가장 가까운 둑으로 저절로 저어 가서 내린다
//    (방향키를 잡으면 그만). 내려설 뭍은 충돌·물 밖이고 스폰에서 걸어서 이어지는 땅만 (world/walkReach — 링크 안 같은 주머니에 갇히지 않게)
//  - 11/16 앞·뒷모습: 위아래로 저으면 배를 앞(뱃머리가 나를 향해)·뒤(멀어지는)모습으로 그리고 탄 사람도 그 방향을 본다 (logic/boat boatFacing).
//    방향은 노 젓는 사람의 아바타 방향(4방향)이라 다른 사람 화면에도 그대로 간다. 조각배 2인승 뒷자리는 앞뒤모습에서 세로로 (seatDelta),
//    오리배는 어느 방향이든 나란히. 옛 화면은 위·아래를 오른쪽 옆모습으로 그린다 (사람만 위·아래를 본다)

/** 오리배 꽥 간격 (서버 act 간격과 같게 — 내 화면과 남의 화면이 같은 횟수) */
const QUACK_MS = 2000;
/** 오리배 물레바퀴 한 칸 도는 시간 · 물방울 간격 */
const WHEEL_MS = 110;
const DROP_MS = 170;
/** 부딪힘 소리 간격 */
const BUMP_MS = 650;
/** 오리배 저절로 둑으로: 이만큼 지나도 못 닿으면 (다른 배에 막힘 등) 둑이 가까우면 내려 주고, 멀면 그만둔다 */
const AUTO_SHORE_MS = 12_000;
const AUTO_SHORE_GIVE = 90;

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
  /** 뱃머리 방향 (4방향 — 위·아래면 앞·뒷모습) */
  dir: DirId;
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
  /** 내가 탄 배에서 마지막으로 본 방향 (11/16 앞·뒷모습까지 4방향) */
  private dir: DirId = DIR.right;
  private lastSeat: string | null = null;
  private quackAt = -Infinity;
  private bumpAt = -Infinity;
  /** 지금 오리배에 타 있는지 (UI 터치 버튼 "꽥!" — boat:duck) */
  private duckShown = false;
  /** 오리 연못 둘레 내려설 자리 (처음 쓸 때 한 번) */
  private duckRing: DuckLanding[] | null = null;
  /** 오리배 저절로 둑으로 가는 중 (한가운데서 E): 갈 물 위 자리 · 내려설 뭍 · 그만둘 시각 */
  private auto: (DuckLanding & { until: number }) | null = null;
  private readonly drops: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sign: Phaser.GameObjects.Image;

  constructor(private readonly host: BoatHost) {
    const scene = host.scene;
    ensureRideTextures(scene);
    ensureBoatTextures(scene);
    let ducks = 0;
    BOATS.forEach((def, i) => {
      const dir = def.facing;
      const duck = boatKind(def) === "duck";
      const tex = duck ? ducks++ : i;
      const back = scene.add.sprite(def.x, def.y, duck ? RIDE_TEX.duckBack(dir, tex) : RIDE_TEX.boatBack(def.seats, dir, tex), 0);
      const front = scene.add.sprite(def.x, def.y, duck ? RIDE_TEX.duckFront(dir, tex) : RIDE_TEX.boatFront(def.seats, dir, tex), 0);
      const v: BoatView = { def, duck, tex, back, front, x: def.x, y: def.y, dir, mode: "docked", returnAt: 0, px: def.x, py: def.y, speed: 0, strokeAt: 0, wakeAt: 0, fade: null };
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
  private riderPos(def: Boat): { x: number; y: number; dir: DirId; rower: boolean } | null {
    const pl = this.host.player();
    const seats = seatsOf(def.id);
    for (let i = 0; i < seats.length; i++) {
      const who = this.occupant(seats[i].id);
      if (who === null) continue;
      let x: number;
      let y: number;
      let dir: DirId;
      if (who === -1) {
        x = pl.x;
        y = pl.y;
        dir = pl.dir;
      } else {
        const r = this.host.remotes().get(who);
        if (!r || r.stateId !== STATE.boat) continue;
        x = r.x;
        y = r.y;
        dir = r.view.dir;
      }
      // 뒷자리(오리배는 옆자리) 사람이 기준이면 앞자리 자리로 옮겨 그린다
      if (i === 1) {
        const o = seatDelta(def, dir);
        x -= o.dx;
        y -= o.dy;
      }
      return { x, y, dir, rower: i === 0 };
    }
    return null;
  }

  private presence = (boatId: string): BoatPresence => {
    const v = this.views.find((w) => w.def.id === boatId)!;
    const rowerSeat = seatsOf(boatId)[0];
    const who = this.occupant(rowerSeat.id);
    return { docked: v.mode === "docked", rower: who === null || who === -1 ? null : who, at: v.mode === "out" ? { x: v.x, y: v.y } : null, dir: v.dir };
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
      const o = seatDelta(v.def, v.dir);
      x = v.x + o.dx;
      y = v.y + o.dy;
      dir = v.dir;
    }
    pl.board(seat.id, x, y, dir, now, h.seatReq());
    this.lastSeat = seat.id;
    this.motion.x = x;
    this.motion.y = y;
    this.motion.vx = this.motion.vy = 0;
    this.dir = dir;
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
    const head = v ? boatPart(v, "head") : { x, y: y + 3 };
    const ring = h.scene.add.image(head.x, head.y, TEX.avRipple).setDepth(DEPTH.decal + 3).setAlpha(0.6).setScale(0.6);
    h.scene.tweens.add({ targets: ring, alpha: 0, scaleX: 1.8, scaleY: 1.4, duration: 700, onComplete: () => ring.destroy() });
  }

  /** 오리 연못 둘레 내려설 자리 (맵이 고정이라 한 번) */
  private ring(): DuckLanding[] {
    this.duckRing ??= duckShoreRing(safeGround);
    return this.duckRing;
  }

  /** 지금 자리에서 바로 내려설 뭍 (없으면 null). 오리배는 연못 둘레 아무 둑, 조각배는 가까운 둑·나루터·잔교 */
  private landSpot(): { x: number; y: number } | null {
    const pl = this.host.player();
    if (this.inDuck()) return duckLandNear(pl.x, pl.y, this.ring()) ?? shorePoint(pl.x, pl.y, safeGround);
    return shorePoint(pl.x, pl.y, safeGround);
  }

  /** 물가에서 내리기. force면 뭍이 멀어도 (나루터로) 내린다 — 자동 걷기·복원 실패 등 */
  disembark(force: boolean, toast?: string): boolean {
    const h = this.host;
    const pl = h.player();
    if (!pl.inBoat) return false;
    const to = this.landSpot() ?? (force ? this.nearestShore() : null);
    if (!to) {
      h.toast(this.inDuck() ? "둑 가까이 가면 내릴 수 있어요" : "둑, 나루터, 잔교 가까이 가면 내릴 수 있어요");
      return false;
    }
    this.leave(to, toast);
    return true;
  }

  /**
   * 11/16 오리배 한가운데서 E: 가장 가까운 둑으로 저절로 저어 가서 내린다 (조종하는 사람만 — 옆자리는 배를 못 몬다).
   * 시작했으면 true (부르는 쪽은 false면 안내만)
   */
  goAshore(): boolean {
    const h = this.host;
    const pl = h.player();
    if (!pl.inBoat || !this.inDuck()) return false;
    const ref = boatOf(pl.boatSeatId!);
    if (!ref || ref.seat.index !== 0) return false;
    if (this.auto) return true;
    const to = nearestDuckLanding(this.motion.x, this.motion.y, this.ring());
    if (!to) return false;
    this.auto = { ...to, until: h.scene.time.now + AUTO_SHORE_MS };
    return true;
  }

  /** 뭍이 멀 때 내려 줄 선착장 (내가 탄 배 종류의 선착장 판자 끝) */
  private dockStand(): { x: number; y: number } {
    return this.inDuck() ? { x: DUCK_DOCK.x, y: DUCK_DOCK.y - 6 } : { x: FERRY_DOCK.x, y: FERRY_DOCK.y };
  }

  private leave(to: { x: number; y: number }, toast?: string): void {
    const h = this.host;
    const pl = h.player();
    this.auto = null;
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

  /** 뭍이 멀어도 내려야 할 때 (자리를 놓침·자동 걷기): 가까운 둑, 오리배면 연못 둘레 가장 가까운 둑, 없으면 선착장 */
  private nearestShore(): { x: number; y: number } {
    const pl = this.host.player();
    return shorePoint(pl.x, pl.y, safeGround, 60) ?? (this.inDuck() ? duckLandNear(pl.x, pl.y, this.ring(), 400) : null) ?? this.dockStand();
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
    // 11/16 앞·뒷모습으로 타고 있었으면 그 방향 그대로 (4방향)
    const dir: DirId = isDirId(r.dir) ? r.dir : DIR.right;
    pl.board(ref.seat.id, r.x, r.y, dir, this.host.scene.time.now, null, false);
    this.motion.x = r.x;
    this.motion.y = r.y;
    this.dir = dir;
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
      this.auto = null;
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
        const dir = r.view.dir;
        const o = seatDelta(ref.boat, dir);
        this.dir = dir;
        pl.boatTo(r.x + o.dx, r.y + o.dy, dir, now);
        return;
      }
      if (who === null && h.judged()) {
        // 앞자리가 비었다 → 그 자리로 (서버는 같은 배 안 옮겨 앉기로 거리와 상관없이 받아 준다)
        const o = seatDelta(ref.boat, this.dir);
        const x = pl.x - o.dx;
        const y = pl.y - o.dy;
        pl.boardSlide(front.id, x, y);
        this.motion.x = x;
        this.motion.y = y;
        h.sit(front.id);
      }
      return;
    }
    const moving = Math.hypot(move.ax, move.ay) >= DEADZONE_ENTER;
    const kind = boatKind(ref.boat);
    // 11/16 오리배 저절로 둑으로 (방향키를 잡으면 그만두고 직접 몬다)
    if (this.auto && (moving || kind !== "duck")) this.auto = null;
    const go = this.auto ? steerToward(this.motion.x, this.motion.y, this.auto.boat.x, this.auto.boat.y) : moving ? { ax: move.ax, ay: move.ay } : { ax: 0, ay: 0 };
    const m = stepBoat(this.motion, go.ax, go.ay, dtMs, inWater(this.motion.x, this.motion.y) ? waterCurrent(this.motion.x, this.motion.y) : { vx: 0, vy: 0 }, kind);
    if (kind === "duck") this.bumpDucks(ref.boat.id, now);
    this.dir = boatFacing(this.dir, m.vx, m.vy);
    pl.boatTo(Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, this.dir, now);
    if (this.auto) this.autoLand(now);
  }

  /** 저절로 둑으로 가는 중: 아무 둑이든 내릴 거리에 들면 내린다. 오래 막히면 둑이 가까울 때만 그 둑에 내려 주고, 아니면 그만둔다 */
  private autoLand(now: number): void {
    const t = this.auto!;
    const pl = this.host.player();
    const land = duckLandNear(pl.x, pl.y, this.ring());
    if (land) {
      this.leave(land);
      return;
    }
    if (now < t.until) return;
    this.auto = null;
    if (Math.hypot(t.land.x - pl.x, t.land.y - pl.y) <= AUTO_SHORE_GIVE && safeGround(t.land.x, t.land.y)) this.leave(t.land);
    else this.host.toast(isTouchUi() ? "둑에 닿지 못했어요. 조이스틱으로 저어 가 주세요" : "둑에 닿지 못했어요. 방향키로 저어 가 주세요");
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
      const rf = typeof who === "number" && who >= 0 ? h.remotes().get(who) : undefined;
      const f = who === -1 ? { x: pl.x, y: pl.y, dir: pl.dir } : rf && rf.stateId === STATE.boat ? { x: rf.x, y: rf.y, dir: rf.view.dir } : null;
      if (!f) continue;
      const o = seatDelta(ref.boat, f.dir);
      r.posOverride = { x: f.x + o.dx, y: f.y + o.dy };
      // 뒷자리 사람도 노 젓는 사람과 같은 쪽을 본다 (옛 화면의 뒷자리 손님은 좌우로만 보내 온다)
      r.view.ride.dir = f.dir;
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
        v.dir = rider.dir;
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
            const w = boatPart(v, "wheel");
            this.drops.setDepth(w.y + 1).explode(2, w.x, w.y);
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
      v.back.setTexture(v.duck ? RIDE_TEX.duckBack(v.dir, v.tex) : RIDE_TEX.boatBack(v.def.seats, v.dir, v.tex), frame);
      v.front.setTexture(v.duck ? RIDE_TEX.duckFront(v.dir, v.tex) : RIDE_TEX.boatFront(v.def.seats, v.dir, v.tex), frame);
      this.place(v, h.reduced ? 0 : Math.sin(wall / 520 + i * 1.3) * (v.duck ? 0.65 : 0.9));
    });
  }

  /**
   * 앞자리 위치(v.x, v.y)에 배 그림을 놓는다. 뒤 판은 사람 뒤, 앞 판은 사람 앞. 오리배는 왼쪽 자리가 기준 (뱃머리와 상관없이).
   * 11/16 조각배 2인승 앞·뒷모습은 두 자리가 위아래로 갈리므로 뒤 판은 먼(위) 자리보다 뒤, 앞 판은 가까운(아래) 자리보다 앞
   */
  private place(v: BoatView, bob: number): void {
    const g = v.duck ? duckGeom(v.dir) : boatGeom(v.def.seats, v.dir);
    const ox = (g.ax + 0.5) / g.w;
    const oy = g.ay / g.h;
    const dy = v.def.seats === 2 ? seatDelta(v.def, v.dir).dy : 0;
    const y = Math.round(v.y - bob);
    v.back.setOrigin(ox, oy).setPosition(Math.round(v.x), y).setDepth(v.y + Math.min(0, dy) - 1);
    v.front.setOrigin(ox, oy).setPosition(Math.round(v.x), y).setDepth(v.y + Math.max(0, dy) + 1.5);
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
        v.dir = v.def.facing;
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
    const w = boatPart(v, "wake");
    const img = scene.add.image(w.x, w.y, TEX.avRipple).setDepth(DEPTH.decal + 3).setAlpha(0.5).setScale(0.7);
    scene.tweens.add({ targets: img, alpha: 0, scaleX: 1.6, scaleY: 1.3, duration: 900, onComplete: () => img.destroy() });
  }

  // ── 안내 ──

  /** 배 위 안내 문구 (null = 배에 타고 있지 않다). prefix: 데스크톱 "E ", 터치 "" */
  hint(prefix: string): string | null {
    const pl = this.host.player();
    if (!pl.inBoat) return this.joinTarget() ? `${prefix}뒷자리에 같이 타기` : null;
    const ref = boatOf(pl.boatSeatId!);
    const shore = this.landSpot() !== null;
    // 터치: 키 대신 조이스틱, 꽥은 [점프] 자리가 [꽥!] 버튼으로 바뀌어 있어 따로 안내하지 않는다
    const touch = isTouchUi();
    const steer = touch ? "조이스틱으로" : "방향키로";
    if (ref && boatKind(ref.boat) === "duck") {
      // 오리배: Space = 꽥, E = 내리기 (11/15 — E로도 꽥이 나가 헷갈렸다). 낚시 없음.
      // 11/16 둑 가까이면 어디서든 「E 내리기」, 한가운데서는 E로 가장 가까운 둑까지 저절로 저어 간다 (조종하는 사람만)
      const quack = touch ? "" : "Space 꽥 · ";
      if (ref.seat.index === 1) return shore ? `${prefix}내리기 · ${quack}같이 타는 중` : touch ? "둑에 닿으면 내리기 · 같이 타는 중" : "Space 꽥 · 둑에 닿으면 E로 내리기 · 같이 타는 중";
      if (this.auto) return `둑으로 가는 중… · ${steer} 직접 몰기`;
      return shore ? `${prefix}내리기 · ${quack}${steer} 페달` : `${prefix}둑으로 가서 내리기 · ${quack}${steer} 페달`;
    }
    if (ref?.seat.index === 1) return shore ? `${prefix}내리기 · 같이 타는 중` : `${prefix}낚시하기 · 같이 타는 중`;
    return shore ? `${prefix}내리기 · ${steer} 노 젓기` : `${prefix}낚시하기 · ${steer} 노 젓기`;
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
    return pl.inBoat && this.landSpot() !== null;
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

const FACES: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.up];

/**
 * 배 그림 위 연출 자리 (앞자리 v.x, v.y 기준, 방향별): head = 오리 머리 앞 물(꽥 물결), wheel = 오리배 물레바퀴(물방울),
 * wake = 고물 뒤 물결 자국. 옆모습은 뱃머리 반대쪽, 앞모습(down)은 고물이 위, 뒷모습(up)은 고물이 아래
 */
function boatPart(v: BoatView, part: "head" | "wheel" | "wake"): { x: number; y: number } {
  const side = v.dir === DIR.left || v.dir === DIR.right;
  const s = v.dir === DIR.left ? -1 : 1;
  if (v.duck) {
    const cx = v.x + DUCK_SIDE_SEAT / 2;
    const fore = v.dir === DIR.down ? 1 : -1; // 뱃머리가 화면 아래면 +1
    if (part === "head") return side ? { x: cx + s * 20, y: v.y + 3 } : { x: cx, y: v.y + (fore > 0 ? 7 : -9) };
    if (part === "wheel") return side ? { x: cx - s * 13, y: v.y + 1 } : { x: cx, y: v.y + (fore > 0 ? -9 : 5) };
    return side ? { x: cx - s * 17, y: v.y + 3 } : { x: cx, y: v.y + (fore > 0 ? -12 : 10) };
  }
  if (part !== "wake") return { x: v.x, y: v.y };
  if (side) return { x: v.x - s * 14, y: v.y + 3 };
  // 조각배 앞·뒷모습: 2인승은 뒷자리만큼 고물이 더 멀다
  const dy = v.def.seats === 2 ? seatDelta(v.def, v.dir).dy : 0;
  return v.dir === DIR.down ? { x: v.x, y: v.y + dy - 14 } : { x: v.x, y: v.y + dy + 7 };
}

/** 선착장 상호작용 id → 배 종류 */
function dockKind(dockId: string): BoatKind {
  return dockId === "dock:duck" ? "duck" : "row";
}

function ensureBoatTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(RIDE_TEX.duckSign)) scene.textures.addCanvas(RIDE_TEX.duckSign, duckSign());
  let ducks = 0;
  BOATS.forEach((def, i) => {
    // 네 방향 (옆모습은 뱃머리 오른쪽 그림 + 뒤집기, 앞·뒷모습은 따로 그린다)
    if (boatKind(def) === "duck") {
      const t = ducks++;
      const style = DUCK_STYLES[t % DUCK_STYLES.length];
      for (const dir of FACES) {
        const g = duckGeom(dir);
        const side = dir === DIR.left || dir === DIR.right;
        for (const layer of ["back", "front"] as const) {
          const key = layer === "back" ? RIDE_TEX.duckBack(dir, t) : RIDE_TEX.duckFront(dir, t);
          if (!scene.textures.exists(key)) addSheet(scene, key, side ? duckSheet(layer, dir === DIR.left, style) : duckVSheet(layer, dir === DIR.down, style), g.w, DUCK_FRAMES, g.h);
        }
      }
      return;
    }
    const tint = BOAT_TINTS[i % BOAT_TINTS.length];
    for (const dir of FACES) {
      const g = boatGeom(def.seats, dir);
      const side = dir === DIR.left || dir === DIR.right;
      for (const layer of ["back", "front"] as const) {
        const key = layer === "back" ? RIDE_TEX.boatBack(def.seats, dir, i) : RIDE_TEX.boatFront(def.seats, dir, i);
        if (!scene.textures.exists(key)) addSheet(scene, key, side ? boatSheet(def.seats, layer, dir === DIR.left, tint) : boatVSheet(def.seats, layer, dir === DIR.down, tint), g.w, BOAT_FRAMES, g.h);
      }
    }
  });
}

function addSheet(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frameW: number, frames: number, frameH: number): void {
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) return;
  for (let f = 0; f < frames; f++) tex.add(f, 0, f * frameW, 0, frameW, frameH);
}

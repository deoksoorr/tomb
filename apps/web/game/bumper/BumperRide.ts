import * as Phaser from "phaser";
import { BUMPER_RINK, BUMPER_SEATS, BUMPER_YARD, DIR, STATE, bumperSeatById, type BumperSeat, type Sid, type WelcomeMsg } from "@tomb/protocol";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { bridge } from "../bridge";
import { seasonKey } from "../sprites/npcSeasonArt";
import { DEPTH } from "../config";
import { keyJosa } from "../input/keyHint";
import type { MoveInput } from "../logic/movement";
import { DEADZONE_ENTER } from "../logic/movement";
import { BUMP_BIG_POWER, BUMP_COUNT_POWER, CAR_BOUNDS, canExit, collideCar, dirAngle, exitSpot, headingDir, headingFrame, newMotion, pickCar, remoteBumpPower, stepCar, touching, wrapAngle, type Bump, type CarBody, type CarMotion, type ExitSpot } from "../logic/bumper";
import { spotVerdict } from "../logic/restore";
import { inWater, standable } from "../world/layout";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { RideHost } from "../world/PlazaRides";
import { bystanderGain } from "../world/rides";
import {
  ARCH_H,
  BTEX,
  BULB_COLORS,
  CAR_CX,
  CAR_CY,
  CAR_DIRS,
  CAR_H,
  CAR_SEAT_LIFT,
  CAR_W,
  ensureBumperSign,
  ensureBumperTextures,
  ensureCarTextures,
  PILLAR_H,
  POLE_H,
  STRING_BULBS,
  stringSag,
} from "./bumperArt";
import { BUMPER_ARCH, BUMPER_BOOTH, BUMPER_DOOR, BUMPER_POLES, BUMPER_POSTS, bumperColliders } from "./bumperLayout";

// 범퍼카장 (11/16, 예전 다리 건너 묘역 자리). 그림 + 타기·운전·부딪힘을 한곳에서 (조각배 BoatRide와 같은 흐름).
//  - 입구 앞에서 E → 세워 둔 빈 차 중 무작위 하나에 탄다 (차 색 = 차 번호, 서버 좌석으로 1인 1대).
//    테두리 어디든 차를 붙이고 E → 그 벽 바로 바깥에 내린다 (막혀 있으면 가까운 빈 곳, 입구 안쪽이면 입구 앞. logic/bumper exitSpot)
//  - 운전: 방향키·WASD·조이스틱 (logic/bumper stepCar — 관성 있는 미끄러짐). Space = 빵빵 (act "honk": 같은 채널에 소리·말풍선)
//  - 부딪힘: 테두리·기둥·타이어·다른 차 (logic/bumper collideCar). 내 화면은 내 차에만 반응을 준다 — 상대 차는 그 사람 화면이 움직인다.
//    「쿵」 소리·별·차 흔들림, 세게 부딪히면 화면이 살짝 흔들린다 (움직임 줄이기면 끈다). 차 위에 「쿵 ×12」
//  - 다른 사람 차: 보간 위치에 그리고, 차머리는 움직이는 방향으로 돌린다 (네트워크 추가 없음 — 탑승은 서버 좌석, 차 색은 자리로 안다).
//    그 차의 부딪힘은 보간 속도가 확 꺾이는 순간으로 알아채 같은 연출을 보여 준다 (logic/bumper remoteBumpPower)
//  - 밤: 조명 기둥·전구 줄·간판이 빛나고(정적 빛은 WorldMap이 BUMPER_LIGHTS로), 달리는 차는 헤드라이트를 켠다
//  - 가볍게: 링크 바닥·기둥·매표소는 처음부터 (가벼운 그림), 범퍼카 128칸·전구 줄은 화면이 범퍼카장 가까이 올 때 처음 굽고,
//    화면 밖이면 차·전구를 숨기고 매 프레임 일을 건너뛴다

/** 빈 차가 제자리로 돌아오기 시작하기까지 · 사라졌다 나타나는 시간 */
const RETURN_DELAY_MS = 2500;
const FADE_MS = 500;
/** 빵빵 간격 (서버 act 간격과 같게) */
const HONK_MS = 2000;
/** 같은 차의 「쿵」 사이 최소 간격 (붙어 비비면 연달아 세지 않게) */
const BUMP_GAP_MS = 380;
/** 차 흔들림 시간 */
const SHAKE_MS = 260;
/** 이만큼 가까이 와야 범퍼카장을 그린다 (화면 사각형 바깥 여유) */
const NEAR_PAD = 160;
/** 원격 차 속도 표본 간격 (부딪힘 알아채기) */
const SAMPLE_MS = 90;
/** 처음 타면 이 시간 동안 조작 안내 */
const INTRO_MS = 4500;
/**
 * 다른 사람 차는 보간 때문에 실제보다 조금 늦게 보인다 (보내는 간격 + 서버 틱 + 보간 버퍼).
 * 부딪힘 판정에는 지금 속도로 이만큼(초) 앞을 내다본 자리를 쓴다 — 마주 달리다 서로 뚫고 지나가지 않게
 */
const LEAD_S = 0.12;
/** 막 탄 차(입구에서 제자리로 미끄러져 오는 중)는 이 시간 동안 부딪힘을 알아채지 않는다 */
const OUT_GRACE_MS = 1200;

export type BumperHost = RideHost & {
  atlas: GlyphAtlas;
  colliders: Phaser.Physics.Arcade.StaticGroup;
  act(kind: "honk"): void;
  /** 밤 어둠 정도 0..1 (헤드라이트·전구 빛) */
  darkness(): number;
};

type CarView = {
  seat: BumperSeat;
  back: Phaser.GameObjects.Sprite | null;
  front: Phaser.GameObjects.Sprite | null;
  beam: Phaser.GameObjects.Image | null;
  x: number;
  y: number;
  h: number;
  mode: "parked" | "out" | "returning";
  returnAt: number;
  fade: Phaser.Tweens.Tween | null;
  alpha: number;
  /** 원격 운전자 속도 추정 · 표본 */
  px: number;
  py: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  sampleAt: number;
  outAt: number;
  driver: Sid | -1 | null;
  bumps: number;
  bumpAt: number;
  shakeUntil: number;
  flashUntil: number;
};

export class BumperRide {
  private readonly cars: CarView[];
  private readonly motion: CarMotion = newMotion(0, 0);
  private readonly others: CarBody[] = [];
  private readonly scenery: Phaser.GameObjects.GameObject[] = [];
  private readonly bulbs: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; i: number }[] = [];
  private readonly glows: { img: Phaser.GameObjects.Image; base: number }[] = [];
  /** 11/17 매표소 (창 안 유령 직원이 맵 컨셉 옷을 입는다 — 1초마다 확인) */
  private booth: Phaser.GameObjects.Image | null = null;
  private boothAt = 0;
  private lastSeat: string | null = null;
  private honkAt = -Infinity;
  private boardedAt = -Infinity;
  private built = false;
  private near = false;
  private ridingShown = false;
  /** 11/20 이번 탑승에서 방향을 넣고 몰고 다닌 시간 (오늘 미션은 가만히 앉아 있는 시간을 세지 않는다) */
  private driveMs = 0;
  private chaseAt = 0;
  private chaseStep = 0;

  constructor(private readonly host: BumperHost) {
    const scene = host.scene;
    ensureBumperTextures(scene);
    this.cars = BUMPER_SEATS.map((seat) => ({
      seat,
      back: null,
      front: null,
      beam: null,
      x: seat.x,
      y: seat.y,
      h: Math.PI / 2,
      mode: "parked",
      returnAt: 0,
      fade: null,
      alpha: 1,
      px: seat.x,
      py: seat.y,
      vx: 0,
      vy: 0,
      sx: 0,
      sy: 0,
      sampleAt: 0,
      outAt: 0,
      driver: null,
      bumps: 0,
      bumpAt: -Infinity,
      shakeUntil: 0,
      flashUntil: 0,
    }));
    this.addScenery();
    for (const r of bumperColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      host.colliders.add(z);
    }
    ensureBumperSign(scene);
    this.addSign();
    this.setSceneryVisible(false);
  }

  // ── 그림 ──

  /** 가벼운 그림: 링크 바닥, 기둥·타이어, 조명 기둥, 아치 기둥 (처음부터) */
  private addScenery(): void {
    const s = this.host.scene;
    const R = BUMPER_RINK;
    this.keep(s.add.image(R.x, R.y, BTEX.floor).setOrigin(0, 0).setDepth(DEPTH.decal + 1));
    for (const p of BUMPER_POSTS) {
      if (p.kind === "pillar") {
        this.keep(s.add.image(p.x, p.y + 6, BTEX.pillar).setOrigin(0.5, 1).setDepth(p.y));
        // 꼭대기 유령 등불 빛
        const g = s.add.image(p.x, p.y + 6 - PILLAR_H + 4, BTEX.bulbGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xb8ffe0).setDepth(DEPTH.lights).setAlpha(0);
        this.keep(g);
        this.glows.push({ img: g, base: 0.7 });
      } else this.keep(s.add.image(p.x, p.y + 4, BTEX.tyre).setOrigin(0.5, 1).setDepth(p.y));
    }
    for (const p of BUMPER_POLES) this.keep(s.add.image(p.x, p.y + 2, BTEX.pole).setOrigin(0.5, 1).setDepth(p.y + 0.5));
    // 아치 기둥 (간판판·매표소는 addSign)
    this.keep(s.add.image(BUMPER_ARCH.x, BUMPER_ARCH.y + 1, BTEX.arch).setOrigin(0.5, 1).setDepth(BUMPER_ARCH.y + 0.4));
  }

  /** 간판·매표소 (손으로 찍은 점 글씨가 들어간 그림) */
  private addSign(): void {
    const s = this.host.scene;
    const top = BUMPER_ARCH.y + 1 - ARCH_H + 2;
    this.keep(s.add.image(BUMPER_ARCH.x, top + 3, BTEX.sign).setOrigin(0.5, 1).setDepth(BUMPER_ARCH.y + 0.5));
    const sg = s.add.image(BUMPER_ARCH.x, top + 3, BTEX.signGlow).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setAlpha(0);
    this.keep(sg);
    this.glows.push({ img: sg, base: 0.85 });
    this.booth = this.keep(s.add.image(BUMPER_BOOTH.x, BUMPER_BOOTH.y + 1, seasonKey(BTEX.booth, currentMapConcept())).setOrigin(0.5, 1).setDepth(BUMPER_BOOTH.y));
    // 밤: 「무료」 글씨도 불이 켜진다
    const bg = s.add.image(BUMPER_BOOTH.x, BUMPER_BOOTH.y + 1, BTEX.boothGlow).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setAlpha(0);
    this.keep(bg);
    this.glows.push({ img: bg, base: 0.7 });
    this.setSceneryVisible(this.near);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.scenery.push(o);
    return o;
  }

  private setSceneryVisible(on: boolean): void {
    for (const o of this.scenery) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
  }

  /** 무거운 그림 (처음 가까이 왔을 때 한 번): 범퍼카 8색 × 16방향, 전구 줄 */
  private build(): void {
    if (this.built) return;
    this.built = true;
    const s = this.host.scene;
    ensureCarTextures(s);
    for (const c of this.cars) {
      c.back = s.add.sprite(c.x, c.y, BTEX.carBack(c.seat.car), 0).setOrigin(CAR_CX / CAR_W, CAR_CY / CAR_H);
      c.front = s.add.sprite(c.x, c.y, BTEX.carFront(c.seat.car), 0).setOrigin(CAR_CX / CAR_W, CAR_CY / CAR_H);
      c.beam = s.add.image(c.x, c.y, BTEX.beam).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.lights).setVisible(false);
    }
    // 위·아래 전구 줄 (조명 기둥 등 사이)
    const R = BUMPER_RINK;
    const rows = [
      { y: BUMPER_POLES[0].y + 2 - POLE_H, depth: R.y + 3.2 },
      { y: BUMPER_POLES[2].y + 2 - POLE_H, depth: R.y + R.h + 0.6 },
    ];
    let k = 0;
    for (const row of rows) {
      this.keep(s.add.image(R.x + 2, row.y, BTEX.string).setOrigin(0, 0).setDepth(row.depth));
      for (let i = 0; i < STRING_BULBS; i++) {
        const x = R.x + 2 + Math.round((i * (R.w - 5)) / (STRING_BULBS - 1));
        const y = row.y + 1 + stringSag(i, STRING_BULBS) + 1;
        const tint = BULB_COLORS[k % BULB_COLORS.length];
        const img = s.add.image(x, y, BTEX.bulbs).setOrigin(0.5, 0).setTint(tint).setDepth(row.depth + 0.1);
        const glow = s.add.image(x, y + 1, BTEX.bulbGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.55).setDepth(DEPTH.lights).setAlpha(0);
        this.keep(img);
        this.keep(glow);
        this.bulbs.push({ img, glow, i: k++ });
      }
    }
    this.setSceneryVisible(this.near);
  }

  // ── 상태 ──

  private parked(car: number): boolean {
    const c = this.cars[car];
    return c.mode === "parked" && !c.fade;
  }

  /** 입구 앞 안내: 탈 차가 없으면 회색 */
  gateHint(pre: string): { text: string; dim: boolean } {
    const h = this.host;
    const seat = pickCar(h.seats(), h.mySid(), (c) => this.parked(c), () => 0);
    if (!seat) return { text: "범퍼카가 모두 달리고 있어요", dim: true };
    return { text: `${pre}범퍼카 타기`, dim: false };
  }

  /** 범퍼카 위 안내 (타고 있지 않으면 null). keys = 키보드 안내 */
  hint(pre: string, keys: boolean): string | null {
    const pl = this.host.player();
    if (!pl.inCar) return null;
    if (canExit(pl.x, pl.y)) return `${pre}내리기`;
    if (this.host.scene.time.now - this.boardedAt < INTRO_MS) return keys ? "방향키로 달리고 Space로 빵빵 울려요" : "조이스틱으로 달려요";
    return null;
  }

  // ── 입력 ──

  /** 입구 앞 E: 빈 차 중 무작위 하나에 탄다 */
  use(): void {
    const h = this.host;
    const pl = h.player();
    if (pl.inCar || pl.inBoat) return;
    const seat = pickCar(h.seats(), h.mySid(), (c) => this.parked(c));
    if (!seat) {
      h.toast("범퍼카가 모두 달리고 있어요. 빈 차는 곧 제자리로 돌아와요");
      return;
    }
    this.build();
    const now = h.scene.time.now;
    pl.boardCar(seat.id, seat.x, seat.y, DIR.down, now, h.seatReq());
    Object.assign(this.motion, newMotion(seat.x, seat.y, Math.PI / 2));
    this.lastSeat = seat.id;
    this.boardedAt = now;
    const c = this.cars[seat.car];
    c.bumps = 0;
    if (h.judged()) h.sit(seat.id);
    h.sound.play("boing", 0.4, 1.25);
  }

  /**
   * 범퍼카 위에서의 키 (E·X·스페이스·타기). 타고 있으면 여기서 처리하고 true.
   * E = 테두리에 닿았거나 입구 안쪽이면 내리기, 스페이스 = 빵빵. 표현·채팅 키는 그대로 지나간다
   */
  onAction(a: string): boolean {
    const pl = this.host.player();
    if (!pl.inCar) return false;
    if (a === "interact") {
      if (canExit(pl.x, pl.y)) this.leave(undefined, exitSpot(pl.x, pl.y, (x, y) => standable(x, y) && !inWater(x, y)));
      else this.host.toast(`벽에 차를 붙이고 ${keyJosa("E", "를")} 누르면 내려요`);
      return true;
    }
    if (a === "jump") {
      this.honk();
      return true;
    }
    return a === "sit" || a === "ride";
  }

  honk(): void {
    if (!this.host.player().inCar) return;
    const now = this.host.scene.time.now;
    if (now - this.honkAt < HONK_MS) return;
    this.honkAt = now;
    this.host.act("honk");
  }

  /** 빵빵 연출 (나·다른 사람 공통): 경적 소리 + 헤드라이트 깜빡. d = 나와의 거리 */
  honkFx(x: number, y: number, mine: boolean, d: number): void {
    const g = mine ? 0.75 : 0.75 * Math.max(0, 1 - d / 460);
    if (g > 0.02) this.host.sound.honk(g, 0.97 + Math.random() * 0.06);
    const now = this.host.scene.time.now;
    let best: CarView | null = null;
    let bd = 26;
    for (const c of this.cars) {
      if (c.mode !== "out") continue;
      const dd = Math.hypot(c.x - x, c.y - y);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    if (best) best.flashUntil = now + 380;
  }

  /** 내리기. to = 내려설 자리 (E로 내릴 때 exitSpot). 없으면 입구 앞 (자동 걷기·자리 놓침·순간이동) */
  leave(toast?: string, to?: ExitSpot): void {
    const h = this.host;
    const pl = h.player();
    if (!pl.inCar) return;
    const seat = pl.carSeatId;
    pl.leaveCar(to ? to.x : BUMPER_DOOR.x, to ? to.y : BUMPER_DOOR.y, h.scene.time.now);
    pl.dir = to ? to.dir : DIR.down;
    pl.view.setDoing(null);
    // 서버도 곧 걷기 MOVE로 자리를 풀지만, 다른 사람이 바로 탈 수 있게 먼저 알린다
    if (seat && h.judged()) h.stand();
    if (toast) h.toast(toast);
    h.sound.play("boing", 0.3, 0.9);
  }

  // ── 서버 좌석 ──

  /** 다른 사람이 내 차 자리를 먼저 잡았다 (동시에 탐) → 입구 앞으로 */
  onSeat(seatId: string, sid: Sid | null): void {
    const pl = this.host.player();
    if (sid !== null && sid !== this.host.mySid() && pl.carSeatId === seatId) this.leave("누가 먼저 그 차에 탔어요");
  }

  /** 서버가 차 자리를 거절했다. 내 차 자리였으면 true */
  onSeatDenied(seatId: string): boolean {
    const pl = this.host.player();
    if (pl.carSeatId !== seatId) return false;
    const owner = this.host.seats().get(seatId);
    this.leave(owner !== undefined ? "누가 먼저 그 차에 탔어요" : "범퍼카에 탈 수 없었어요. 입구에서 다시 타 주세요");
    return true;
  }

  /** (재)접속 welcome: 차 자리를 서버 점유표로 판정 — keep 그대로, claim 다시 요청(멀면 서버가 거절 → 입구로), leave 입구로 */
  onWelcome(m: WelcomeMsg): void {
    const pl = this.host.player();
    const seat = pl.carSeatId;
    if (!seat || !m.spots) return;
    const v = spotVerdict(seat, m.seats, m.sid);
    if (v === "keep") return;
    if (v === "claim") this.host.sit(seat);
    else this.leave("그 사이 다른 사람이 그 차에 탔어요");
  }

  // ── 매 프레임 ──

  /** 운전 (Player.update 뒤에) */
  steer(move: MoveInput, dtMs: number): void {
    const h = this.host;
    const pl = h.player();
    const seat = pl.carSeatId;
    const now = h.scene.time.now;
    if (seat !== this.lastSeat) {
      // 순간이동 등으로 차에서 떨어졌다 (Player.warp) → 이름표 글자만 정리
      if (!seat) pl.view.setDoing(null);
      this.lastSeat = seat;
      if (seat) {
        const ref = bumperSeatById(seat);
        Object.assign(this.motion, newMotion(pl.x, pl.y, Math.PI / 2));
        if (ref) this.cars[ref.car].bumps = 0;
        this.driveMs = 0;
      }
    }
    if (!seat) return;
    const ref = bumperSeatById(seat);
    if (!ref) return;
    if (pl.snapping) {
      this.motion.x = ref.x;
      this.motion.y = ref.y;
      return;
    }
    const moving = Math.hypot(move.ax, move.ay) >= DEADZONE_ENTER;
    if (moving) {
      // 탭을 내렸다 올린 긴 프레임은 한 프레임 몫만 센다
      const sec = Math.floor(this.driveMs / 1000);
      this.driveMs += Math.min(dtMs, 250);
      if (Math.floor(this.driveMs / 1000) !== sec) bridge.emit("bumper:drive", { ms: this.driveMs });
    }
    stepCar(this.motion, moving ? move.ax : 0, moving ? move.ay : 0, dtMs);
    const others = this.others;
    others.length = 0;
    for (const c of this.cars) {
      if (c.seat.id === seat || c.fade || c.alpha < 1) continue;
      const out = c.mode === "out";
      const lead = out && c.driver !== -1 ? LEAD_S : 0;
      others.push({
        x: Math.max(CAR_BOUNDS.x0, Math.min(CAR_BOUNDS.x1, c.x + c.vx * lead)),
        y: Math.max(CAR_BOUNDS.y0, Math.min(CAR_BOUNDS.y1, c.y + c.vy * lead)),
        vx: out ? c.vx : 0,
        vy: out ? c.vy : 0,
      });
    }
    const bump = collideCar(this.motion, others);
    if (bump) this.myBump(this.cars[ref.car], bump, now);
    pl.carTo(Math.round(this.motion.x * 10) / 10, Math.round(this.motion.y * 10) / 10, headingDir(this.motion.h), now);
  }

  private myBump(c: CarView, b: Bump, now: number): void {
    if (b.power < BUMP_COUNT_POWER || now - c.bumpAt < BUMP_GAP_MS) return;
    c.bumpAt = now;
    c.bumps++;
    c.shakeUntil = now + SHAKE_MS;
    const h = this.host;
    const k = Math.min(1, b.power / 90);
    h.sound.thump(0.35 + 0.6 * k, 0.9 + Math.random() * 0.2);
    this.stars(b.x, b.y - 4, b.power);
    if (b.power >= BUMP_BIG_POWER) {
      this.pop(b.x, b.y - 10);
      if (!h.reduced) h.scene.cameras.main.shake(150, 0.0035 + 0.003 * k);
    }
  }

  /** 다른 사람 차의 부딪힘 (내 화면 연출) */
  private remoteBump(c: CarView, power: number, now: number): void {
    if (now - c.bumpAt < BUMP_GAP_MS) return;
    c.bumpAt = now;
    c.bumps++;
    c.shakeUntil = now + SHAKE_MS;
    const pl = this.host.player();
    const g = bystanderGain(Math.hypot(c.x - pl.x, c.y - pl.y)) * 1.6;
    if (g > 0.02) this.host.sound.thump(Math.min(0.6, g * (0.5 + power / 120)), 0.9 + Math.random() * 0.2);
    this.stars(c.x, c.y - 6, power);
    if (power >= BUMP_BIG_POWER) this.pop(c.x, c.y - 12);
  }

  /** 부딪힌 자리에서 튀는 별 */
  private stars(x: number, y: number, power: number): void {
    const s = this.host.scene;
    const n = this.host.reduced ? 2 : power >= BUMP_BIG_POWER ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * 1.3;
      const img = s.add.image(x, y, BTEX.star).setDepth(DEPTH.bubble - 2).setScale(0.8);
      const dist = this.host.reduced ? 0 : 10 + Math.random() * 8;
      s.tweens.add({
        targets: img,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist * 0.8,
        alpha: 0,
        angle: this.host.reduced ? 0 : 160,
        duration: 520,
        ease: "Quad.easeOut",
        onComplete: () => img.destroy(),
      });
    }
  }

  /** 세게 부딪히면 「쿵!」 글자가 떠올랐다 사라진다 */
  private pop(x: number, y: number): void {
    const s = this.host.scene;
    const text = "쿵!";
    this.host.atlas.ensure(text);
    const sc = 1 / (s.cameras.main.zoom || 3);
    const t = s.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(0xffe070).setDepth(DEPTH.bubble - 1).setScale(sc * 1.3);
    s.tweens.add({ targets: t, y: y - (this.host.reduced ? 2 : 10), alpha: 0, duration: 700, ease: "Quad.easeOut", onComplete: () => t.destroy() });
  }

  /** 원격 아바타 갱신 전에: 운전자에게 차 높이·흔들림·차머리 방향·「쿵 ×N」을 넣는다 */
  prepare(): void {
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    for (const r of h.remotes().values()) {
      if (r.stateId !== STATE.bumper) {
        if (r.tag) r.tag = null;
        continue;
      }
      const ref = r.seatId ? bumperSeatById(r.seatId) : undefined;
      const c = ref ? this.cars[ref.car] : undefined;
      r.tag = c && c.bumps > 0 ? `쿵 ×${c.bumps}` : null;
      const sh = c ? this.shake(c, now) : 0;
      r.view.ride = { ox: sh, lift: CAR_SEAT_LIFT, depth: r.y + 0.2, dir: headingDir(c ? c.h : 0) };
    }
    if (pl.inCar) {
      const ref = pl.carSeatId ? bumperSeatById(pl.carSeatId) : undefined;
      const c = ref ? this.cars[ref.car] : undefined;
      const sh = c ? this.shake(c, now) : 0;
      pl.view.ride = { ox: sh, lift: CAR_SEAT_LIFT, depth: pl.y + 0.2, dir: headingDir(this.motion.h) };
      pl.view.setDoing(c && c.bumps > 0 ? `쿵 ×${c.bumps}` : null);
    }
    if (pl.inCar !== this.ridingShown) {
      this.ridingShown = pl.inCar;
      bridge.emit("bumper:riding", { riding: pl.inCar });
    }
  }

  private shake(c: CarView, now: number): number {
    if (this.host.reduced || now >= c.shakeUntil) return 0;
    return Math.round(Math.sin(now / 22) * 1.2);
  }

  /** 차 그림 (아바타 갱신 뒤에): 운전자를 따라가고, 빈 차는 잠시 뒤 제자리로 */
  update(dtMs: number, view: Phaser.Geom.Rectangle): void {
    const h = this.host;
    const Y = BUMPER_YARD;
    const near = view.right > Y.x - NEAR_PAD && view.x < Y.x + Y.w + NEAR_PAD && view.bottom > Y.y - NEAR_PAD && view.y < Y.y + Y.h + NEAR_PAD;
    const pl = h.player();
    if (near !== this.near) {
      this.near = near;
      if (near) this.build();
      this.setSceneryVisible(near);
      for (const c of this.cars) {
        c.back?.setVisible(near);
        c.front?.setVisible(near);
        if (!near) c.beam?.setVisible(false);
      }
    }
    if (near && this.booth?.active && performance.now() >= this.boothAt) {
      this.boothAt = performance.now() + 1000;
      const key = seasonKey(BTEX.booth, currentMapConcept());
      if (this.booth.texture.key !== key) this.booth.setTexture(key);
    }
    if (!near && !pl.inCar) return;
    if (!this.built) this.build();
    const now = h.scene.time.now;
    const dark = h.darkness();
    const night = Math.max(0, Math.min(1, (dark - 0.08) * 2.2));
    // 운전자 찾기
    const drivers = new Map<number, { sid: Sid | -1; x: number; y: number; dir: number }>();
    if (pl.inCar && pl.carSeatId) {
      const ref = bumperSeatById(pl.carSeatId);
      if (ref) drivers.set(ref.car, { sid: -1, x: pl.x, y: pl.y, dir: pl.dir });
    }
    for (const r of h.remotes().values()) {
      if (r.stateId !== STATE.bumper || !r.seatId || r.away) continue;
      const ref = bumperSeatById(r.seatId);
      if (ref && !drivers.has(ref.car)) drivers.set(ref.car, { sid: r.sid, x: r.x, y: r.y, dir: r.netDir });
    }
    const dt = Math.max(1, dtMs) / 1000;
    for (const c of this.cars) {
      const d = drivers.get(c.seat.car);
      if (d) {
        if (c.mode !== "out") {
          c.fade?.stop();
          c.fade = null;
          c.alpha = 1;
          c.px = d.x;
          c.py = d.y;
          c.vx = c.vy = 0;
          c.sx = c.sy = 0;
          c.sampleAt = now;
          c.outAt = now;
          if (d.sid !== -1) c.bumps = 0;
        }
        c.mode = "out";
        c.driver = d.sid;
        c.x = d.x;
        c.y = d.y;
        if (d.sid === -1) {
          c.h = this.motion.h;
          c.vx = this.motion.vx;
          c.vy = this.motion.vy;
        } else {
          // 원격: 보간 위치로 속도를 재고, 차머리는 가는 쪽으로 (멈춰 있으면 보는 방향으로)
          const ivx = (c.x - c.px) / dt;
          const ivy = (c.y - c.py) / dt;
          const k = Math.min(1, dtMs / 70);
          c.vx += (ivx - c.vx) * k;
          c.vy += (ivy - c.vy) * k;
          const sp = Math.hypot(c.vx, c.vy);
          const want = sp > 14 ? Math.atan2(c.vy, c.vx) : headingDir(c.h) === d.dir ? c.h : dirAngle(d.dir as 0 | 1 | 2 | 3);
          const diff = wrapAngle(want - c.h);
          const turn = 9 * dt;
          c.h = wrapAngle(c.h + Math.max(-turn, Math.min(turn, diff)));
          if (now - c.sampleAt >= SAMPLE_MS) {
            const p = remoteBumpPower({ vx: c.sx, vy: c.sy }, { vx: c.vx, vy: c.vy });
            if (p >= BUMP_COUNT_POWER && now - c.outAt > OUT_GRACE_MS && touching(c.x, c.y, this.cars.filter((o) => o !== c && !o.fade))) this.remoteBump(c, p, now);
            c.sx = c.vx;
            c.sy = c.vy;
            c.sampleAt = now;
          }
        }
        c.px = c.x;
        c.py = c.y;
      } else {
        if (c.mode === "out") {
          c.mode = "returning";
          c.returnAt = now + RETURN_DELAY_MS;
          c.driver = null;
          c.vx = c.vy = 0;
        } else if (c.mode === "returning" && now >= c.returnAt && !c.fade) this.sendHome(c);
      }
      this.place(c, now, night);
    }
    // 전구: 밤에 빛나고, 가까이 있으면 한 칸씩 도는 불빛
    if (now >= this.chaseAt) {
      this.chaseAt = now + 170;
      this.chaseStep++;
    }
    for (const b of this.bulbs) {
      const on = h.reduced || (b.i + this.chaseStep) % 3 !== 0;
      b.img.setAlpha(on ? 1 : 0.55);
      b.glow.setAlpha(night * (on ? 0.85 : 0.25));
    }
    for (const g of this.glows) g.img.setAlpha(night * g.base * (h.reduced ? 1 : 0.88 + 0.12 * Math.sin(now / 240)));
  }

  /** 차 그림 자리·방향·깊이·헤드라이트 */
  private place(c: CarView, now: number, night: number): void {
    if (!c.back || !c.front || !c.beam) return;
    const f = headingFrame(c.h, CAR_DIRS);
    const sh = this.shake(c, now);
    const x = Math.round(c.x) + sh;
    const y = Math.round(c.y);
    c.back.setFrame(f).setPosition(x, y).setDepth(c.y - 2).setAlpha(c.alpha);
    c.front.setFrame(f).setPosition(x, y).setDepth(c.y + 1.5).setAlpha(c.alpha);
    // 헤드라이트: 달리는 차만, 밤에 (빵빵 하면 잠깐 깜빡 — 낮에도 살짝)
    const flash = now < c.flashUntil;
    const a = c.mode === "out" ? Math.max(night * 0.55, flash ? 0.6 : 0) : 0;
    if (a > 0.02 && this.near) {
      const fx = Math.cos(c.h);
      const fy = Math.sin(c.h) * 0.72;
      c.beam
        .setVisible(true)
        .setPosition(x + fx * 10, y - 3 + fy * 10)
        .setRotation(Math.atan2(fy, fx))
        .setScale(1, 0.8)
        .setAlpha(flash ? Math.min(1, a + 0.3) : a);
    } else if (c.beam.visible) c.beam.setVisible(false);
  }

  /** 빈 차: 스르르 사라졌다가 제자리에 다시 나타난다 */
  private sendHome(c: CarView): void {
    const scene = this.host.scene;
    const proxy = { a: 1 };
    c.fade = scene.tweens.add({
      targets: proxy,
      a: 0,
      duration: FADE_MS,
      onUpdate: () => {
        c.alpha = proxy.a;
      },
      onComplete: () => {
        c.x = c.px = c.seat.x;
        c.y = c.py = c.seat.y;
        c.h = Math.PI / 2;
        c.bumps = 0;
        c.fade = scene.tweens.add({
          targets: proxy,
          a: 1,
          duration: FADE_MS,
          onUpdate: () => {
            c.alpha = proxy.a;
          },
          onComplete: () => {
            c.fade = null;
            c.alpha = 1;
            if (c.mode === "returning") c.mode = "parked";
          },
        });
      },
    });
  }

  /** 어둠 구멍 (WorldScene.updateLighting): 달리는 차 헤드라이트 앞 */
  lights(lit: { add(x: number, y: number, r: number, a: number): void }): void {
    if (!this.near) return;
    for (const c of this.cars) {
      if (c.mode !== "out") continue;
      lit.add(c.x + Math.cos(c.h) * 16, c.y - 3 + Math.sin(c.h) * 11, 18, 0.5);
    }
  }

  destroy(): void {
    for (const c of this.cars) {
      c.fade?.stop();
      c.back?.destroy();
      c.front?.destroy();
      c.beam?.destroy();
    }
    if (this.ridingShown) bridge.emit("bumper:riding", { riding: false });
  }
}

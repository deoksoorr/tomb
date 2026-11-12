import * as Phaser from "phaser";
import { BALLOON_COUNT, BALLOON_FLIGHT_MS, balloonPhase, DIR, FERRIS, FERRIS_CARS, STATE, type BalloonSeat, type FerrisSeat } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import {
  BALLOON_COLORS,
  balloonPad,
  balloonSign,
  balloonTop,
  basket,
  CAR_COLORS,
  CAR_H,
  ferrisCar,
  ferrisFrame,
  ferrisWheelSheet,
  FLAME_H,
  FLAME_W,
  flameSheet,
  SKY_TEX,
  SPOKE_FRAMES,
  SPOKE_STEP,
  WHEEL_SIZE,
  skyShadow,
  BASKET_H,
} from "../sprites/skyProps";
import type { Atmosphere } from "./Atmosphere";
import type { CameraRig } from "./CameraRig";
import type { Interactable } from "./layout";
import type { Lighting } from "./Lighting";
import type { RideHost } from "./PlazaRides";
import {
  BALLOON_BASKET,
  balloonPose,
  balloonSeat,
  balloonSeatsOf,
  balloonState,
  basketSeatDx,
  boardingBalloon,
  carAngle,
  ferrisPose,
  ferrisRiderPoint,
  ferrisRideEnd,
  ferrisSeat,
  nextBoardingIn,
  pickFerrisSeat,
  placeName,
  rimPoint,
  skyFootprint,
  WHEEL_HUB,
  wheelSpin,
  type BalloonState,
  type SkyPose,
} from "./skyMath";
import { SkySound } from "./SkySound";
import { SkyView } from "./SkyView";

// 놀이기구 2: 관람차·열기구 (그림·탑승·하늘 시점·소리).
// 자리 점유는 다른 1인 자리처럼 서버 좌석(정해진 자리 FERRIS_SEATS·BALLOON_SEATS)으로 판정하고, 칸·기구 위치는 서버 시계로 계산해
// 누구 화면에서나 같은 모습이다 (주고받는 것은 앉기·일어서기뿐).
//  - 다른 사람 화면: 관람차 칸에 앉은 모습 / 하늘을 떠다니는 열기구 바구니에 선 모습(이름표가 따라간다) — AvatarView.ride로 앵커에서 옮겨 그린다
//  - 내 화면: 관람차는 타자마자, 열기구는 이륙할 때 하늘 시점(SkyView)으로. 월드 카메라를 보이는 땅 전체에 맞춰 그리고(CameraRig.aerial)
//    그 화면을 땅바닥 판으로 원근 투영한다. 움직임 줄이기 설정·WebGL이 없으면 부드러운 확대(CameraRig.cinematic)로 대신한다
//  - 관람차는 칸이 한 바퀴 돌아 내려오면, 열기구는 출발장에 내려앉으면 내린다. 도중에는 X·E·스페이스를 두 번 누르면 바로 내린다

export type SkyHost = RideHost & {
  rig: CameraRig;
  atmos: Atmosphere;
  /** 이번 프레임 이동 입력 (방향키·조이스틱) — 하늘 시점에서 고개 돌리기 */
  move(): { ax: number; ay: number };
  canvas: HTMLCanvasElement;
};

type MyRide = {
  kind: "ferris" | "balloon";
  seatId: string;
  /** 관람차 칸 번호 / 열기구 번호 */
  unit: number;
  index: number;
  /** 내리는 시각 (서버 시계) */
  end: number;
  /** 열기구 이륙 시각 (서버 시계, 관람차는 탄 시각) */
  departAt: number;
  /** 하늘 시점(또는 확대 연출) 중 */
  sky: boolean;
  /** 하늘 시점을 켠 때 (씬 시간) */
  skyAt: number;
  /** 내리기 시작한 때 (씬 시간, 0 = 아직) */
  leaveAt: number;
  /** 도중에 내리기: 한 번 누른 때 */
  armAt: number;
  /** GL 하늘 시점인지 (아니면 확대 연출) */
  gl: boolean;
};

/** 하늘 시점 들어갈 때 검은 화면에서 밝아지는 시간 · 나갈 때 어두워지는 시간 · 나온 뒤 검은 막이 걷히는 시간 */
const FADE_IN_MS = 900;
const LEAVE_MS = 650;
const COVER_MS = 450;
/** 하늘을 나는 열기구 depth (밤 어둠 아래, 모든 월드 그림 위) */
const SKY_DEPTH = 99_000;
const FERRIS_FAR = 820;
const BALLOON_FAR = 980;

type BalloonView = {
  top: Phaser.GameObjects.Image;
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  flame: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  state: BalloonState;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class SkyRides {
  private readonly view: SkyView;
  private readonly sound = new SkySound();
  private readonly wheel: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly carBacks: Phaser.GameObjects.Image[] = [];
  private readonly carFronts: Phaser.GameObjects.Image[] = [];
  private readonly balloons: BalloonView[] = [];
  private ride: MyRide | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookAt = -Infinity;
  private drag: { id: number; x: number; y: number } | null = null;
  private creakAt = 0;
  private hudKey = "";
  private burnShown = 0;
  private readonly off: (() => void)[] = [];

  constructor(private readonly host: SkyHost) {
    const scene = host.scene;
    ensureSkyTextures(scene);
    this.view = new SkyView(scene);
    // 관람차: 다리·발판 (바퀴 뒤) · 바퀴 테·살 (돌아간다) · 칸 (뒤 판·앞 판 사이에 탄 사람)
    this.legs = scene.add.image(FERRIS.x, FERRIS.y + 1, SKY_TEX.ferrisFrame).setOrigin(0.5, 1).setDepth(FERRIS.y + 0.3);
    this.wheel = scene.add.image(WHEEL_HUB.x, WHEEL_HUB.y, SKY_TEX.ferrisWheel, 0).setOrigin(0.5, 0.5).setDepth(FERRIS.y + 0.5);
    for (let c = 0; c < FERRIS_CARS; c++) {
      this.carBacks.push(scene.add.image(0, 0, SKY_TEX.carBack(c % CAR_COLORS.length)).setOrigin(0.5, 0).setDepth(FERRIS.y + 1));
      this.carFronts.push(scene.add.image(0, 0, SKY_TEX.carFront(c % CAR_COLORS.length)).setOrigin(0.5, 0).setDepth(FERRIS.y + 2));
    }
    // 열기구 출발장 바닥·팻말
    scene.add.image(BALLOON_BASKET.x, BALLOON_BASKET.y + 2, SKY_TEX.pad).setDepth(DEPTH.decal + 5);
    scene.add.image(BALLOON_BASKET.x + 24, BALLOON_BASKET.y + 1, SKY_TEX.sign).setOrigin(0.5, 1).setDepth(BALLOON_BASKET.y + 1);
    if (!scene.anims.exists("sky-flame")) {
      scene.anims.create({ key: "sky-flame", frames: [0, 1].map((i) => ({ key: SKY_TEX.flame, frame: i })), frameRate: host.reduced ? 3 : 10, repeat: -1 });
    }
    for (let b = 0; b < BALLOON_COUNT; b++) {
      const flame = scene.add.sprite(0, 0, SKY_TEX.flame, 0).setOrigin(0.5, 1).setVisible(false);
      flame.play("sky-flame");
      this.balloons.push({
        shadow: scene.add.image(0, 0, SKY_TEX.shadow).setDepth(DEPTH.decal + 6),
        top: scene.add.image(0, 0, SKY_TEX.balloonTop(b % BALLOON_COLORS.length)).setOrigin(0.5, 1),
        back: scene.add.image(0, 0, SKY_TEX.basketBack).setOrigin(0.5, 1),
        front: scene.add.image(0, 0, SKY_TEX.basketFront).setOrigin(0.5, 1),
        flame,
        state: balloonState(b, this.clock()),
      });
    }
    // 하늘 시점: 끌어서 고개 돌리기 (카메라 드래그는 하늘 시점 중 꺼져 있다)
    const c = host.canvas;
    const down = (e: PointerEvent) => {
      if (!this.ride?.sky || !this.ride.gl) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const k = 2.2 / Math.max(320, c.clientHeight || 600);
      this.lookYaw -= (e.clientX - d.x) * k;
      this.lookPitch += (e.clientY - d.y) * k;
      d.x = e.clientX;
      d.y = e.clientY;
      this.lookAt = performance.now();
    };
    const up = (e: PointerEvent) => {
      if (this.drag?.id === e.pointerId) this.drag = null;
    };
    c.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    this.off.push(() => {
      c.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    });
  }

  private clock(): number {
    return this.host.clock ? this.host.clock() : Date.now();
  }

  /** 하늘 시점(내 화면을 덮는 중)인지 — 씬은 이 동안 근처 안내·툴팁을 줄여도 된다 */
  get inSky(): boolean {
    return !!this.ride?.sky && this.ride.gl;
  }

  // ── 타기 ──

  /** E/탭: 관람차 타는 곳 · 열기구 출발장 */
  use(o: Interactable): void {
    if (o.kind === "ferris") this.boardFerris();
    else if (o.kind === "balloon") this.boardBalloon();
  }

  private taken(id: string): boolean {
    const h = this.host;
    if (!h.judged()) return false;
    const owner = h.seats().get(id);
    return owner !== undefined && owner !== h.mySid();
  }

  private boardFerris(): void {
    const h = this.host;
    const seat = pickFerrisSeat(this.clock(), (id) => this.taken(id));
    if (!seat) {
      h.toast("다음 칸이 내려오고 있어요. 잠깐 뒤에 다시 눌러 주세요");
      return;
    }
    const pl = h.player();
    pl.attach("ferris", seat.x, seat.y, FERRIS.y + 1.5, h.scene.time.now, h.seatReq(), seat.id);
    if (h.judged()) h.sit(seat.id);
    h.sound.play("boat-board", 0.5, 1.1);
  }

  private boardBalloon(): void {
    const h = this.host;
    const t = this.clock();
    const b = boardingBalloon(t);
    if (b < 0) {
      h.toast(`열기구가 하늘을 날고 있어요. ${Math.ceil(nextBoardingIn(t) / 1000)}초 뒤에 내려와요`);
      return;
    }
    const p = balloonPhase(b, t);
    if (p.departAt - t < 1_200) {
      h.toast("열기구가 막 떠나요. 다음 기구를 기다려 주세요");
      return;
    }
    const seat = BALLOON_SEATS_OF[b].find((s) => !this.taken(s.id));
    if (!seat) {
      h.toast("열기구 바구니가 꽉 찼어요. 다음 기구를 기다려 주세요");
      return;
    }
    const pl = h.player();
    pl.attach("balloon", seat.x, seat.y, BALLOON_BASKET.y + 0.5, h.scene.time.now, h.seatReq(), seat.id);
    if (h.judged()) h.sit(seat.id);
    h.sound.play("boat-board", 0.5, 0.9);
  }

  /** 상호작용 안내 문구 (pre = "E " 같은 키 안내). 탈 수 없으면 dim */
  hint(o: Interactable, pre: string): { text: string; dim: boolean } | null {
    const t = this.clock();
    if (o.kind === "ferris") {
      const seat = pickFerrisSeat(t, (id) => this.taken(id));
      return seat ? { text: `${pre}관람차 타기`, dim: false } : { text: "다음 칸이 내려오는 중이에요", dim: true };
    }
    if (o.kind === "balloon") {
      const b = boardingBalloon(t);
      if (b < 0) return { text: `열기구가 ${Math.ceil(nextBoardingIn(t) / 1000)}초 뒤에 내려와요`, dim: true };
      const left = Math.ceil((balloonPhase(b, t).departAt - t) / 1000);
      if (BALLOON_SEATS_OF[b].every((s) => this.taken(s.id))) return { text: "열기구 바구니가 꽉 찼어요", dim: true };
      return { text: `${pre}열기구 타기 · ${left}초 뒤 출발`, dim: false };
    }
    return null;
  }

  /** 하늘에 떠 있는 동안 X·E·스페이스: 두 번 누르면 바로 내린다. 처리했으면 true */
  onAction(a: string): boolean {
    const r = this.ride;
    const pl = this.host.player();
    if (!r || !pl.rideLock) return false;
    if (a !== "jump" && a !== "sit" && a !== "interact") return false;
    const now = this.host.scene.time.now;
    if (r.leaveAt) return true;
    if (now - r.armAt < 2_500) {
      this.startLeave(now);
      return true;
    }
    r.armAt = now;
    this.host.toast(r.kind === "ferris" ? "한 번 더 누르면 관람차에서 바로 내려요" : "한 번 더 누르면 바로 내려요 (출발장으로 돌아가요)");
    return true;
  }

  // ── 매 프레임 ──

  /** 카메라 갱신 전: 내 탑승 상태를 맞추고 하늘 시점 카메라·월드 카메라 사각형을 정한다 */
  preCamera(dt: number): void {
    const h = this.host;
    const pl = h.player();
    const t = this.clock();
    const now = h.scene.time.now;
    const kind = pl.state === "ferris" || pl.state === "balloon" ? pl.state : null;
    const seatId = kind ? pl.spotId : null;
    if (this.ride && this.ride.seatId !== seatId) this.endRide(false);
    if (!this.ride && kind && seatId) this.beginRide(kind, seatId, t);
    const r = this.ride;
    if (!r) {
      if (this.view.cover > 0) this.view.cover = Math.max(0, this.view.cover - dt / COVER_MS);
      return;
    }
    if (r.kind === "balloon" && t < r.departAt) {
      // 출발장에서 기다리는 중: 움직이면 내린다 (아직 땅 위)
      pl.rideLock = false;
    } else {
      pl.rideLock = true;
      if (!r.sky && !r.leaveAt) this.skyOn(r, now);
    }
    if (!r.leaveAt && t >= r.end) this.startLeave(now);
    if (r.leaveAt && (now - r.leaveAt >= LEAVE_MS || !r.gl)) {
      this.finish();
      return;
    }
    if (r.sky) this.drive(r, t, now, dt);
  }

  private beginRide(kind: "ferris" | "balloon", seatId: string, t: number): void {
    if (kind === "ferris") {
      const s = ferrisSeat(seatId);
      if (!s) return;
      this.ride = this.newRide(kind, s, s.car, ferrisRideEnd(s.car, t), t);
    } else {
      const s = balloonSeat(seatId);
      if (!s) return;
      const p = balloonPhase(s.balloon, t);
      this.ride = this.newRide(kind, s, s.balloon, p.departAt + BALLOON_FLIGHT_MS, p.departAt);
    }
    this.lookYaw = this.lookPitch = 0;
    this.burnShown = 0;
  }

  private newRide(kind: MyRide["kind"], s: FerrisSeat | BalloonSeat, unit: number, end: number, departAt: number): MyRide {
    return { kind, seatId: s.id, unit, index: s.index, end, departAt, sky: false, skyAt: 0, leaveAt: 0, armAt: -Infinity, gl: false };
  }

  private skyOn(r: MyRide, now: number): void {
    const h = this.host;
    r.sky = true;
    r.skyAt = now;
    r.gl = this.view.supported && !h.reduced;
    if (r.gl) {
      h.atmos.skyView = true;
      h.player().view.setVisible(false);
      bridge.emit("view:mode", { mode: "sky" });
    }
  }

  private startLeave(now: number): void {
    const r = this.ride;
    if (!r || r.leaveAt) return;
    r.leaveAt = now;
  }

  /** 다 내렸다: 타는 곳(앵커)에 내려선다 */
  private finish(): void {
    const h = this.host;
    const pl = h.player();
    const r = this.ride;
    if (r && pl.state === r.kind) pl.leaveAnchor(h.scene.time.now, true);
    this.endRide(true);
  }

  /** 하늘 시점·탑승 정리 (arrived = 정상으로 내림 → 검은 막이 천천히 걷힌다) */
  private endRide(arrived: boolean): void {
    const h = this.host;
    const r = this.ride;
    this.ride = null;
    const pl = h.player();
    pl.rideLock = false;
    this.drag = null;
    if (r?.sky) {
      if (r.gl) {
        h.rig.aerial(null);
        this.view.look = null;
        this.view.cover = arrived ? 1 : 0.6;
        h.atmos.skyView = false;
        pl.view.setVisible(true);
        bridge.emit("view:mode", { mode: "normal" });
      } else h.rig.cinematic(null, h.reduced);
    }
    this.sound.setWind(0);
    this.sound.setBurner(0);
    if (this.hudKey) {
      this.hudKey = "";
      bridge.emit("sky:hud", null);
    }
  }

  /** 하늘 시점 카메라: 칸·기구 시점 + 내가 돌린 고개, 보이는 땅에 월드 카메라를 맞춘다 */
  private drive(r: MyRide, t: number, now: number, dt: number): void {
    const h = this.host;
    let pose: SkyPose;
    let far: number;
    let burn = 0;
    let env = 0;
    let focus: { x: number; y: number };
    if (r.kind === "ferris") {
      pose = ferrisPose(r.unit, t);
      far = FERRIS_FAR;
      const p = rimPoint(carAngle(r.unit, t));
      focus = { x: p.x, y: p.y };
    } else {
      const st = balloonState(r.unit, t);
      const fm = Math.max(0, t - r.departAt);
      pose = balloonPose(st, fm);
      far = BALLOON_FAR;
      this.burnShown += ((st.burn ? 1 : 0) - this.burnShown) * Math.min(1, dt / 120);
      burn = this.burnShown;
      focus = { x: st.x, y: st.y - st.alt };
    }
    if (!r.gl) {
      // 움직임 줄이기·WebGL 없음: 칸·기구를 부드럽게 확대해 따라간다
      h.rig.cinematic({ x: focus.x, y: focus.y - 8, zoom: r.kind === "ferris" ? 3.5 : 2.5 }, false);
      return;
    }
    // 고개 돌리기: 방향키·조이스틱(천천히) + 끌기. 손을 떼고 조금 지나면 제자리로
    const mv = h.move();
    const k = dt / 1000;
    if (Math.abs(mv.ax) > 0.15 || Math.abs(mv.ay) > 0.15) {
      this.lookYaw += mv.ax * 0.9 * k;
      this.lookPitch -= mv.ay * 0.6 * k;
      this.lookAt = performance.now();
    } else if (!this.drag && performance.now() - this.lookAt > 2_500) {
      const d = Math.exp(-dt / 1_100);
      this.lookYaw *= d;
      this.lookPitch *= d;
    }
    this.lookYaw = Math.max(-0.75, Math.min(0.75, this.lookYaw));
    this.lookPitch = Math.max(-0.45, Math.min(0.35, this.lookPitch));
    pose = { ...pose, yaw: pose.yaw + this.lookYaw, pitch: Math.max(-1.35, Math.min(0.2, pose.pitch + this.lookPitch)) };
    if (r.kind === "balloon") env = clamp01((pose.pitch + 0.32) / 0.4);
    const cam = h.scene.cameras.main;
    h.rig.aerial(skyFootprint(pose, cam.width / Math.max(1, cam.height), far));
    const L = h.atmos.levels;
    const fadeIn = clamp01((now - r.skyAt) / FADE_IN_MS);
    const fadeOut = r.leaveAt ? 1 - clamp01((now - r.leaveAt) / LEAVE_MS) : 1;
    // 열기구: 착륙 직전 바구니가 땅에 닿을 때쯤 어두워진다
    this.view.look = {
      pose,
      far,
      frame: r.kind === "ferris" ? 1 : 2,
      fade: Math.min(fadeIn, fadeOut) ** 1.4,
      night: clamp01(L.darkness * 1.25),
      fog: L.fog,
      rain: L.rain,
      snow: L.snow,
      cloud: L.cloud,
      tint: L.tint,
      burn,
      envelope: env,
      envColors: BALLOON_COLORS[r.unit % BALLOON_COLORS.length],
      time: now / 1000,
    };
  }

  /** 아바타 갱신 전: 관람차·열기구에 탄 사람(나·원격)을 칸·바구니 자리로 옮겨 그린다 */
  prepare(): void {
    const h = this.host;
    const t = this.clock();
    const pl = h.player();
    if ((pl.state === "ferris" || pl.state === "balloon") && pl.spotId) {
      const off = this.offset(pl.spotId, t);
      if (off) pl.view.ride = off;
    }
    for (const r of h.remotes().values()) {
      if ((r.stateId !== STATE.ferris && r.stateId !== STATE.balloon) || !r.seatId) continue;
      const off = this.offset(r.seatId, t);
      if (off) r.view.ride = off;
    }
  }

  private offset(seatId: string, t: number): NonNullable<Player["view"]["ride"]> | null {
    const fs = ferrisSeat(seatId);
    if (fs) {
      const p = ferrisRiderPoint(fs, t);
      return { ox: p.x - fs.x, lift: fs.y - p.y, depth: FERRIS.y + 1.5, dir: DIR.down };
    }
    const bs = balloonSeat(seatId);
    if (!bs) return null;
    const st = this.balloons[bs.balloon]?.state ?? balloonState(bs.balloon, t);
    const fx = st.x + basketSeatDx(bs.index);
    const fy = st.y - st.alt - 2;
    return { ox: fx - bs.x, lift: bs.y - fy, depth: this.balloonDepth(bs.balloon, st) + 0.5, dir: DIR.down };
  }

  private balloonDepth(b: number, st: BalloonState): number {
    return st.alt < 1 ? st.y : SKY_DEPTH + b;
  }

  /** 아바타 갱신 뒤: 관람차·열기구 그림, 내가 탄 것은 하늘 시점 그림(땅바닥 판)에 찍히지 않게 숨긴다, 소리·안내 */
  update(dt: number): void {
    const h = this.host;
    const t = this.clock();
    const r = this.ride;
    const hideFerris = !!r?.sky && r.gl && r.kind === "ferris";
    // 관람차
    const spin = -wheelSpin(t);
    const step = SPOKE_STEP * SPOKE_FRAMES;
    const f = Math.floor((((spin % step) + step) % step) / SPOKE_STEP) % SPOKE_FRAMES;
    this.wheel.setFrame(f).setVisible(!hideFerris);
    this.legs.setVisible(!hideFerris);
    for (let c = 0; c < FERRIS_CARS; c++) {
      const p = rimPoint(carAngle(c, t));
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      this.carBacks[c].setPosition(x, y).setVisible(!hideFerris);
      this.carFronts[c].setPosition(x, y).setVisible(!hideFerris);
    }
    // 열기구
    const mineB = r?.sky && r.gl && r.kind === "balloon" ? r.unit : -1;
    for (let b = 0; b < this.balloons.length; b++) {
      const v = this.balloons[b];
      const st = balloonState(b, t);
      v.state = st;
      const bx = Math.round(st.x);
      const by = Math.round(st.y - st.alt);
      const d = this.balloonDepth(b, st);
      // 하늘 시점 중에는 떠 있는 기구를 숨긴다 (땅바닥 판 그림에 납작하게 찍히지 않게) — 그림자는 남긴다
      const hide = mineB >= 0 && (b === mineB || st.alt > 1);
      v.back.setPosition(bx, by).setDepth(d + 0.1).setVisible(!hide);
      v.front.setPosition(bx, by).setDepth(d + 0.9).setVisible(!hide);
      v.top.setPosition(bx, by - BASKET_H + 3).setDepth(d - 0.2).setVisible(!hide);
      v.flame.setPosition(bx, by - BASKET_H - 4).setDepth(d - 0.1).setVisible(!hide && st.burn);
      const k = clamp01(st.alt / 64);
      v.shadow
        .setPosition(Math.round(st.x), Math.round(st.y) + 1)
        .setScale(1 - 0.35 * k)
        .setAlpha(0.9 - 0.55 * k);
    }
    // 하늘 시점: 내가 탄 칸·바구니에 함께 탄 사람도 숨긴다
    if (r?.sky && r.gl) {
      for (const a of h.remotes().values()) {
        if (!a.seatId) continue;
        const fs = r.kind === "ferris" && a.stateId === STATE.ferris ? ferrisSeat(a.seatId) : undefined;
        const bs = r.kind === "balloon" && a.stateId === STATE.balloon ? balloonSeat(a.seatId) : undefined;
        if (fs || (bs && (bs.balloon === r.unit || (this.balloons[bs.balloon]?.state.alt ?? 0) > 1))) a.view.setVisible(false);
      }
    }
    this.updateSound(dt, t);
    this.updateHud(t);
  }

  private updateSound(dt: number, t: number): void {
    const r = this.ride;
    if (!r || !r.sky) {
      this.sound.setWind(0);
      this.sound.setBurner(0);
      return;
    }
    if (r.kind === "ferris") {
      const up = (1 - Math.cos(carAngle(r.unit, t))) / 2;
      this.sound.setWind(0.25 + 0.5 * up);
      this.sound.setBurner(0);
      this.creakAt -= dt;
      if (this.creakAt <= 0) {
        this.creakAt = 5_000 + Math.random() * 6_000;
        this.sound.creak(0.8);
      }
      return;
    }
    const st = this.balloons[r.unit]?.state;
    const lift = st ? clamp01(st.h / 280) : 0;
    this.sound.setWind(0.2 + 0.6 * lift);
    this.sound.setBurner(st?.burn ? 1 : 0);
  }

  private updateHud(t: number): void {
    const r = this.ride;
    if (!r) return;
    const left = Math.max(0, Math.ceil(((r.kind === "balloon" && t < r.departAt ? r.departAt : r.end) - t) / 1000));
    let hud: NonNullable<Parameters<typeof bridge.emit<"sky:hud">>[1]>;
    if (r.kind === "ferris") {
      hud = { kind: "ferris", title: "관람차", place: null, hint: r.gl ? "끌기·방향키: 둘러보기 · X 두 번: 내리기" : "X 두 번: 내리기", left, sky: r.sky && r.gl };
    } else if (t < r.departAt) {
      hud = { kind: "balloon", title: "열기구", place: null, hint: "곧 떠나요 · 움직이면 내려요", left, sky: false };
    } else {
      const st = this.balloons[r.unit]?.state;
      hud = {
        kind: "balloon",
        title: "열기구",
        place: st && st.alt > 8 ? placeName(st.x, st.y) : null,
        hint: r.gl ? "끌기·방향키: 고개 돌리기 · X 두 번: 내리기" : "X 두 번: 내리기",
        left,
        sky: r.sky && r.gl,
      };
    }
    const key = `${hud.kind}|${hud.place}|${hud.hint}|${hud.left}|${hud.sky}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    bridge.emit("sky:hud", hud);
  }

  /** 밤: 관람차 꼬마전구·칸 불빛, 열기구 버너 불빛 */
  addLights(lit: Lighting): void {
    const t = this.clock();
    lit.add(WHEEL_HUB.x, WHEEL_HUB.y, 54, 0.45);
    for (let c = 0; c < FERRIS_CARS; c++) {
      const p = rimPoint(carAngle(c, t));
      lit.add(p.x, p.y + CAR_H / 2, 16, 0.55);
    }
    for (const v of this.balloons) {
      const st = v.state;
      const y = st.y - st.alt;
      lit.add(st.x, y - 12, st.burn ? 44 : 22, st.burn ? 0.85 : 0.4);
    }
  }

  destroy(): void {
    if (this.ride) this.endRide(false);
    for (const f of this.off) f();
    this.off.length = 0;
    this.view.destroy();
    this.sound.destroy();
  }
}

/** 기구마다 자리 (index 순) */
const BALLOON_SEATS_OF: readonly BalloonSeat[][] = Array.from({ length: BALLOON_COUNT }, (_, b) => balloonSeatsOf(b));

/** 관람차·열기구 텍스처 (처음 한 번) */
export function ensureSkyTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SKY_TEX.ferrisWheel)) return;
  addCanvasTexture(scene, SKY_TEX.ferrisFrame, { canvas: ferrisFrame() });
  addCanvasTexture(scene, SKY_TEX.ferrisWheel, { canvas: ferrisWheelSheet(), frameW: WHEEL_SIZE, frameH: WHEEL_SIZE });
  CAR_COLORS.forEach((col, v) => {
    addCanvasTexture(scene, SKY_TEX.carBack(v), { canvas: ferrisCar(col, "back") });
    addCanvasTexture(scene, SKY_TEX.carFront(v), { canvas: ferrisCar(col, "front") });
  });
  BALLOON_COLORS.forEach((cols, v) => addCanvasTexture(scene, SKY_TEX.balloonTop(v), { canvas: balloonTop(cols) }));
  addCanvasTexture(scene, SKY_TEX.basketBack, { canvas: basket("back") });
  addCanvasTexture(scene, SKY_TEX.basketFront, { canvas: basket("front") });
  addCanvasTexture(scene, SKY_TEX.flame, { canvas: flameSheet(), frameW: FLAME_W, frameH: FLAME_H });
  addCanvasTexture(scene, SKY_TEX.shadow, { canvas: skyShadow() });
  addCanvasTexture(scene, SKY_TEX.pad, { canvas: balloonPad() });
  addCanvasTexture(scene, SKY_TEX.sign, { canvas: balloonSign() });
}


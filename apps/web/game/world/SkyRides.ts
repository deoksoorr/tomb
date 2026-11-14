import * as Phaser from "phaser";
import { BALLOON_COUNT, BALLOON_FLIGHT_MS, balloonPhase, DIR, FERRIS, FERRIS_CARS, STATE, type BalloonSeat, type FerrisSeat } from "@tomb/protocol";
import { addCanvasTexture, avatarFrame } from "../assets/manifest";
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
  balloonSeat,
  balloonSeatsOf,
  balloonState,
  basketSeatDx,
  boardingBalloon,
  carAngle,
  ferrisRiderPoint,
  ferrisRideEnd,
  ferrisSeat,
  nextBoardingIn,
  pickFerrisSeat,
  placeName,
  rimPoint,
  WHEEL_HUB,
  wheelSpin,
  type BalloonState,
} from "./skyMath";
import { SkySound } from "./SkySound";
import { SkyStage, type StageRider } from "./SkyStage";

// 놀이기구 2: 관람차·열기구 (그림·탑승·탑승 장면·소리).
// 자리 점유는 다른 1인 자리처럼 서버 좌석(정해진 자리 FERRIS_SEATS·BALLOON_SEATS)으로 판정하고, 칸·기구 위치는 서버 시계로 계산해
// 누구 화면에서나 같은 모습이다 (주고받는 것은 앉기·일어서기뿐).
//  - 다른 사람 화면: 관람차 칸에 앉은 모습 / 하늘을 떠다니는 열기구 바구니에 선 모습(이름표가 따라간다) — AvatarView.ride로 앵커에서 옮겨 그린다
//  - 내 화면: 관람차는 타자마자, 열기구는 이륙할 때 옆에서 본 2D 장면(SkyStage)으로 바뀐다. 장면이 화면을 다 덮는 동안 월드 카메라는 쉰다
//  - [시점 변경하기](SkyHud 버튼·V): 2D 장면 ↔ 장면 없이 칸·기구를 따라가며 확대해 마을 맵 위를 떠다니는 보기. 짧게 어두워졌다 밝아지며 바뀌고,
//    마지막 선택은 localStorage(tomb.skyView)에 남아 다음 탑승에 쓴다. 움직임 줄이기면 처음 기본은 맵 위 보기
//  - 관람차는 칸이 한 바퀴 돌아 내려오면, 열기구는 출발장에 내려앉으면 내린다. 도중에는 X·E·스페이스를 두 번 누르면 바로 내린다

export type SkyHost = RideHost & {
  atmos: Atmosphere;
  /** 맵 위 보기에서 칸·기구를 따라가는 월드 카메라 */
  rig: CameraRig;
};

/** 탑승 중 보기: scene = 옆에서 본 2D 장면, map = 마을 맵 위를 떠다니는 보기 */
export type SkyView = "scene" | "map";

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
  /** 탑승 장면 중 */
  sky: boolean;
  /** 탑승 장면을 켠 때 (씬 시간) */
  skyAt: number;
  /** 내리기 시작한 때 (씬 시간, 0 = 아직) */
  leaveAt: number;
  /** 도중에 내리기: 한 번 누른 때 */
  armAt: number;
  /** 지금 보이는 보기 (탑승 장면 중일 때) */
  mode: SkyView;
  /** 시점 바꾸기 시작한 때 (씬 시간, 0 = 아님) */
  swapAt: number;
};

/** 탑승 장면 들어갈 때 검은 화면에서 밝아지는 시간 · 나갈 때 어두워지는 시간 */
const FADE_IN_MS = 900;
const LEAVE_MS = 650;
/** 시점 바꾸기: 어두워지는 시간 = 밝아지는 시간 */
const SWAP_HALF_MS = 220;
/** 맵 위 보기 줌 */
const MAP_ZOOM = 3.5;
const LS_VIEW = "tomb.skyView";

function loadView(reduced: boolean): SkyView {
  try {
    const v = window.localStorage.getItem(LS_VIEW);
    if (v === "scene" || v === "map") return v;
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return reduced ? "map" : "scene";
}

function saveView(v: SkyView): void {
  try {
    window.localStorage.setItem(LS_VIEW, v);
  } catch {
    // 저장 못 해도 이번 탑승에는 적용된다
  }
}
/** 하늘을 나는 열기구 depth (밤 어둠 아래, 모든 월드 그림 위) */
const SKY_DEPTH = 99_000;

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
  private readonly stage: SkyStage;
  private readonly sound = new SkySound();
  private readonly wheel: Phaser.GameObjects.Image;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly carBacks: Phaser.GameObjects.Image[] = [];
  private readonly carFronts: Phaser.GameObjects.Image[] = [];
  private readonly balloons: BalloonView[] = [];
  private ride: MyRide | null = null;
  private creakAt = 0;
  private hudKey = "";
  private burnShown = 0;
  private readonly off: (() => void)[] = [];
  /** 고른 보기 (다음 탑승에도) */
  private view: SkyView;

  constructor(private readonly host: SkyHost) {
    const scene = host.scene;
    ensureSkyTextures(scene);
    this.stage = new SkyStage(scene.game, host.reduced);
    this.view = loadView(host.reduced);
    this.off.push(bridge.on("sky:view", () => this.toggleView()));
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
    // 월드 씬이 잠들면(집·상점) 탑승 장면을 숨긴다
    const sleep = () => {
      this.stage.hide();
      scene.cameras.main?.setVisible(true);
    };
    scene.events.on(Phaser.Scenes.Events.SLEEP, sleep);
    this.off.push(() => scene.events.off(Phaser.Scenes.Events.SLEEP, sleep));
  }

  private clock(): number {
    return this.host.clock ? this.host.clock() : Date.now();
  }

  /** 탑승 장면(내 화면을 덮는 중)인지 — 씬은 이 동안 근처 안내·툴팁을 줄여도 된다 */
  get inSky(): boolean {
    return !!this.ride?.sky;
  }

  /** 마을에서 폭죽이 터졌다 → 탑승 장면 하늘에도 */
  firework(): void {
    this.stage.firework();
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

  /** 카메라 갱신 전: 내 탑승 상태를 맞춘다 (탑승 장면 켜기·내리기) */
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
      this.stage.idle(dt);
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
    if (r.leaveAt && (now - r.leaveAt >= LEAVE_MS || !r.sky)) {
      this.finish();
      return;
    }
    if (!r.sky) return;
    // 시점 바꾸기 · 맵 위 보기 (rig.update 전에 카메라 목표를 맞춘다)
    const lit = this.stepSwap(r, now, t);
    if (r.mode === "map") {
      this.followUnit(r, t, true);
      const fadeIn = clamp01((now - r.skyAt) / FADE_IN_MS);
      const fadeOut = r.leaveAt ? 1 - clamp01((now - r.leaveAt) / LEAVE_MS) : 1;
      this.stage.veil(1 - Math.min(lit, fadeIn, fadeOut) ** 1.4);
    }
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
    this.burnShown = 0;
  }

  private newRide(kind: MyRide["kind"], s: FerrisSeat | BalloonSeat, unit: number, end: number, departAt: number): MyRide {
    return { kind, seatId: s.id, unit, index: s.index, end, departAt, sky: false, skyAt: 0, leaveAt: 0, armAt: -Infinity, mode: this.view, swapAt: 0 };
  }

  private skyOn(r: MyRide, now: number): void {
    r.sky = true;
    r.skyAt = now;
    r.mode = this.view;
    r.swapAt = 0;
    if (r.mode === "scene") this.stage.begin(r.kind, r.unit);
    else this.followUnit(r, this.clock(), true);
    bridge.emit("view:mode", { mode: "sky" });
  }

  /** [시점 변경하기]: 탑승 장면 중이면 짧게 어두워졌다 밝아지며 바꾼다 */
  private toggleView(): void {
    const r = this.ride;
    if (!r || !r.sky || r.leaveAt || r.swapAt) return;
    this.view = r.mode === "scene" ? "map" : "scene";
    saveView(this.view);
    r.swapAt = this.host.scene.time.now;
  }

  /** 시점 바꾸기 진행: 가운데(가장 어두울 때) 보기를 바꾼다. 반환 = 밝기 (1 = 막 없음) */
  private stepSwap(r: MyRide, now: number, t: number): number {
    if (!r.swapAt) return 1;
    const e = now - r.swapAt;
    if (e >= SWAP_HALF_MS && r.mode !== this.view) {
      r.mode = this.view;
      if (r.mode === "scene") {
        this.host.rig.cinematic(null, true);
        this.stage.begin(r.kind, r.unit);
      } else {
        this.stage.end(1);
        this.host.scene.cameras.main.setVisible(true);
        this.followUnit(r, t, true);
      }
    }
    if (e >= SWAP_HALF_MS * 2) {
      r.swapAt = 0;
      return 1;
    }
    return Math.abs(e / SWAP_HALF_MS - 1);
  }

  /** 맵 위 보기: 내 칸·바구니를 화면 가운데에 두고 확대 (cut = 미끄러지지 않고 바로) */
  private followUnit(r: MyRide, t: number, cut: boolean): void {
    let x: number;
    let y: number;
    if (r.kind === "ferris") {
      const fs = ferrisSeat(r.seatId);
      const p = fs ? ferrisRiderPoint(fs, t) : rimPoint(carAngle(r.unit, t));
      x = p.x;
      y = p.y - 8;
    } else {
      const st = balloonState(r.unit, t);
      x = st.x;
      y = st.y - st.alt - BASKET_H;
    }
    this.host.rig.cinematic({ x, y, zoom: MAP_ZOOM }, cut);
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

  /** 탑승 장면·탑승 정리 (arrived = 정상으로 내림 → 검은 막이 천천히 걷힌다) */
  private endRide(arrived: boolean): void {
    const h = this.host;
    const r = this.ride;
    this.ride = null;
    const pl = h.player();
    pl.rideLock = false;
    if (r?.sky) {
      this.stage.end(arrived ? 1 : 0.6);
      if (r.mode === "map" || r.swapAt) h.rig.cinematic(null, true);
      h.scene.cameras.main.setVisible(true);
      bridge.emit("view:mode", { mode: "normal" });
    }
    this.sound.setWind(0);
    this.sound.setBurner(0);
    if (this.hudKey) {
      this.hudKey = "";
      bridge.emit("sky:hud", null);
    }
  }

  /** 탑승 장면 한 프레임: 진행(서버 시계)·시간대·날씨·같이 탄 사람 */
  private drive(r: MyRide, t: number, now: number, dt: number): void {
    const h = this.host;
    let balloon: { st: BalloonState; burn: number } | undefined;
    if (r.kind === "balloon") {
      const st = this.balloons[r.unit]?.state ?? balloonState(r.unit, t);
      this.burnShown += ((st.burn ? 1 : 0) - this.burnShown) * Math.min(1, dt / 120);
      balloon = { st, burn: this.burnShown };
    }
    const fadeIn = clamp01((now - r.skyAt) / FADE_IN_MS);
    const fadeOut = r.leaveAt ? 1 - clamp01((now - r.leaveAt) / LEAVE_MS) : 1;
    const swap = r.swapAt ? Math.abs((now - r.swapAt) / SWAP_HALF_MS - 1) : 1;
    this.stage.frame({
      now,
      dt,
      t,
      levels: h.atmos.levels,
      fade: Math.min(fadeIn, fadeOut, swap) ** 1.4,
      riders: this.riders(r),
      balloon,
    });
    // 장면이 화면을 다 덮는 동안 월드 카메라는 그리지 않는다 (가볍게)
    h.scene.cameras.main.setVisible(!this.stage.opaque);
  }

  /** 같은 칸·바구니에 탄 사람 (나 포함, 자리 순) — 장면 안에 뒷모습으로 작게 */
  private riders(r: MyRide): StageRider[] {
    const h = this.host;
    const state = r.kind === "ferris" ? "ferris" : "balloon";
    const out: StageRider[] = [];
    // 착용 오라·전용 오라도 장면 안에 같이 그리게 꾸미기·몸·1위 값을 싣는다
    const push = (seatId: string | null, v: Player["view"]) => {
      const fs = r.kind === "ferris" ? ferrisSeat(seatId) : undefined;
      const bs = r.kind === "balloon" ? balloonSeat(seatId) : undefined;
      const seat = fs && fs.car === r.unit ? fs.index : bs && bs.balloon === r.unit ? bs.index : -1;
      if (seat >= 0) out.push({ key: v.sprite.texture.key, frame: avatarFrame(state, DIR.up), index: seat, look: v.lookIds, body: v.bodyId, champ: v.champBits, staff: v.staff });
    };
    push(r.seatId, h.player().view);
    const want = r.kind === "ferris" ? STATE.ferris : STATE.balloon;
    for (const a of h.remotes().values()) if (a.stateId === want && a.seatId) push(a.seatId, a.view);
    return out.sort((x, y) => x.index - y.index);
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

  /** 아바타 갱신 뒤: 관람차·열기구 그림, 탑승 장면, 소리·안내 */
  update(dt: number): void {
    const t = this.clock();
    const r = this.ride;
    // 관람차
    const spin = -wheelSpin(t);
    const step = SPOKE_STEP * SPOKE_FRAMES;
    const f = Math.floor((((spin % step) + step) % step) / SPOKE_STEP) % SPOKE_FRAMES;
    this.wheel.setFrame(f);
    for (let c = 0; c < FERRIS_CARS; c++) {
      const p = rimPoint(carAngle(c, t));
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      this.carBacks[c].setPosition(x, y);
      this.carFronts[c].setPosition(x, y);
    }
    // 열기구
    for (let b = 0; b < this.balloons.length; b++) {
      const v = this.balloons[b];
      const st = balloonState(b, t);
      v.state = st;
      const bx = Math.round(st.x);
      const by = Math.round(st.y - st.alt);
      const d = this.balloonDepth(b, st);
      v.back.setPosition(bx, by).setDepth(d + 0.1);
      v.front.setPosition(bx, by).setDepth(d + 0.9);
      v.top.setPosition(bx, by - BASKET_H + 3).setDepth(d - 0.2);
      v.flame.setPosition(bx, by - BASKET_H - 4).setDepth(d - 0.1).setVisible(st.burn);
      const k = clamp01(st.alt / 64);
      v.shadow
        .setPosition(Math.round(st.x), Math.round(st.y) + 1)
        .setScale(1 - 0.35 * k)
        .setAlpha(0.9 - 0.55 * k);
    }
    if (r?.sky && r.mode === "scene") this.drive(r, t, this.host.scene.time.now, dt);
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
      hud = { kind: "ferris", title: "관람차", place: null, hint: "X 두 번: 내리기", left, sky: r.sky, view: this.view };
    } else if (t < r.departAt) {
      hud = { kind: "balloon", title: "열기구", place: null, hint: "곧 떠나요 · 움직이면 내려요", left, sky: false, view: this.view };
    } else {
      const st = this.balloons[r.unit]?.state;
      hud = {
        kind: "balloon",
        title: "열기구",
        place: st && st.alt > 8 ? placeName(st.x, st.y) : null,
        hint: "X 두 번: 내리기",
        left,
        sky: r.sky,
        view: this.view,
      };
    }
    const key = `${hud.kind}|${hud.place}|${hud.hint}|${hud.left}|${hud.sky}|${hud.view}`;
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
    this.stage.destroy();
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


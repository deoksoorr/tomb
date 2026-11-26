import * as Phaser from "phaser";
import { CAMP_ARRIVE, DIR, MAP_NAME, SEA_ARRIVE, type AwayMapId } from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import type { ResumeState } from "@/lib/resume";
import { reportClientError } from "@/lib/hooks/errorReporting";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";
import type { InputHub } from "../input/InputHub";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Sfx } from "../world/Sfx";
import { BUS_BAY, BUS_DOOR_X, BUS_FROM_LEFT, BUS_LANE_Y, BUS_STOP } from "../world/fishZone";
import { SEA_STOP, SEA_STOP_DOOR, SEA_STOP_FROM_LEFT, SEA_STOP_LAND, SEA_STOP_LANE_Y } from "../world/seaStop";
import { createBusArrival } from "../bus/BusArrival";
import { BUS_TEX, ensureBusTextures } from "../bus/busArt";
import { rideBake, type RideBake } from "../bus/busRideBake";
import { campMinimapSteps } from "./campMinimap";
import { BUS_RIDE_MS, BUS_RIDE_SCENE, type BusArrivalApi, type BusLeg, type BusRideControl, type BusRideData, type BusRoute } from "../bus/busTypes";
import { CAMP_SCENE, type CampFriend, type CampHost, type CampSceneData } from "./campHost";
import { CampPrebake } from "./campPrebake";
import { SEA_SCENE } from "../sea/seaHost";
import { SeaPrebake } from "../sea/seaPrebake";
import { seaMinimapSteps } from "../sea/seaMinimap";
import type { RealtimeClient as Net } from "../net/RealtimeClient";

/** 캠핑장 그림 미리 굽기: 한 프레임에 쓰는 시간 (ms) — 느린 기기에서도 버스·창밖 연출이 멈추지 않게 */
const BAKE_BUDGET_MS = 4;
/** 11/15 정류장에 이만큼 가까이 오면 버스·창밖·캠핑장 그림을 미리 굽기 시작해요 (px) */
const WARM_RADIUS = 200;
/** 정류장 거리를 이 프레임마다 한 번 봐요 */
const WARM_CHECK_FRAMES = 12;
/** 새 텍스처를 한 프레임에 이만큼 그려 둬요 */
const PRIME_PER_FRAME = 6;
/** 창밖 연출이 시작하고 이만큼 프레임 뒤에 캠핑장 장면을 띄워요 */
const CAMP_LAUNCH_FRAMES = 4;
/** 장면이 바뀌는 프레임과 화면 UI가 숨거나 보이는 프레임을 이만큼 떼어요 */
const UI_DELAY_FRAMES = 3;
/** 마을로 돌아가는 창밖 연출이 시작하고 이만큼 프레임 뒤에 캠핑장 장면을 닫아요 */
const CAMP_CLOSE_FRAMES = 6;
/** 마을로 돌아오는 창밖 연출 끝나기 이만큼 전부터 마을 주민 길을 미리 찾아요 (ms) */
const LIFE_WARM_LEAD_MS = 3000;
/** 창밖 연출이 끝나고 마을이 깨어나기까지 (머무름 + 어두워지기, 대략 ms) */
const RIDE_TAIL_MS = 800;
/** 11/26 다른 맵에 내리기 전에 앞 맵 옮기기 답을 기다리는 최대 시간 (ms) */
const MAP_WAIT_MS = 6000;

// 11/15 마을 ↔ 캠핑장 버스 여행 (월드 장면이 하나 가지고 있다).
// 같은 채널 연결 그대로 맵만 옮긴다: 실시간 소식은 캠핑장에 있는 동안 캠핑장 장면이 받는다(net.divert).
//  마을 → 캠핑장: 정류장에 버스가 들어와 문이 열림 → 내가 타면(다른 사람 화면에서 "버스 안"으로 사라짐) → 8초 창밖 연출
//                 (그동안 월드는 재우고 캠핑장 장면을 미리 만든다) → 서버에 맵 옮기기 → 캠핑장 정류장에 버스가 서고 내린다
//  캠핑장 → 마을: 캠핑장 장면이 버스를 부르고 태운 뒤 goVillage → 창밖 연출 → 캠핑장 장면을 닫고(그림도 지운다) 월드를 깨움
//                 → 서버에 맵 옮기기 → 마을 정류장에 버스가 서고 내린다
//  새로고침(캠핑장 기록): 버스 없이 바로 캠핑장 장면. 서버가 캠핑장을 받지 않으면(허락 없음·옛 서버) 마을로 돌아온다(bail)
// 11/16 달물결 포구(바닷가)도 이 여행이 맡아요. 가는 곳(dest)마다 마을 정류장·장면·도착 자리·미리 굽기·창밖 노선이 달라요 (DEST).
//  바닷가행은 옛 묘역 아래 정류장(seaStop.ts — 버스가 왼쪽 끝에서 와요), 캠핑장행은 버스 정류장 마당 그대로예요.
//  한 번에 한 곳만 가 있어요 (캠핑장 ↔ 바닷가는 마을을 거쳐요 — 11/19 친구한테 가기는 마을 정류장에서 곧바로 이어 타요: CampFriend.next). 아래 이름(camp·toCamp…)은 "마을 밖 맵"이라는 뜻으로 그대로 둬요.

/** 월드 장면이 여행에 내주는 것 */
export type WorldSide = {
  readonly scene: Phaser.Scene;
  readonly net: RealtimeClient;
  readonly atlas: GlyphAtlas;
  readonly hub: InputHub;
  readonly sfx: Sfx;
  readonly reduced: boolean;
  readonly name: string;
  readonly color: string;
  player(): Player;
  myBody(): string;
  myLook(): readonly string[];
  /** 월드 입력·카메라를 멈추거나(true) 돌려준다(false) — 상점·집과 같은 길 */
  lock(on: boolean): void;
  /** 월드의 원격 아바타·좌석을 비운다 (캠핑장으로 떠날 때) */
  clearRemotes(): void;
  /** 마을 정류장에 내린 뒤 (친구 옆으로 가기 등) */
  arrived(friend: CampFriend | null): void;
  /** 11/15 aheadMs 뒤 마을 주민 길을 budgetMs 동안만 미리 찾아요 (다 됐으면 true) */
  warmLife(aheadMs: number, budgetMs: number): boolean;
  isFriend(sid: number, name: string): boolean;
  toast(message: string): void;
};

/** 마을 정류장: 버스 문 앞 (지붕 아래 벤치 앞 골목) */
export const VILLAGE_BUS_DOOR = { x: BUS_DOOR_X, y: BUS_BAY.y - 2 } as const;
/** 마을에 내려 준 버스가 서 있다가 흐려지기까지 (ms) — 캠핑장과 같다 */
const VILLAGE_BUS_WAIT_MS = 3000;
/** 마을 버스에서 내려 서는 자리 */
export const VILLAGE_BUS_LAND = { x: BUS_STOP.x, y: BUS_STOP.y + 16 } as const;

type Phase = "village" | "toCamp" | "camp" | "toVillage";
type Pt = { readonly x: number; readonly y: number };
/** 마을 밖 맵 그림 미리 굽기 (CampPrebake·SeaPrebake) */
type Prebake = { readonly done: boolean; step(budgetMs: number): boolean; finish(): void; takeFresh(): string[] };
/** 11/16 가는 곳마다 다른 것 */
type Dest = {
  map: AwayMapId;
  scene: string;
  arrive: Pt;
  route: BusRoute;
  open(net: Net): boolean;
  prebake(scene: Phaser.Scene, near: Pt): Prebake;
  minimap(): Generator<void, void>;
  /** 마을 정류장 (가까이 오면 미리 굽기) · 버스 문 · 바퀴 줄 · 들어오는 쪽 · 내려 서는 자리 */
  stop: Pt;
  door: Pt;
  laneY: number;
  fromLeft: boolean;
  land: Pt;
};
const DEST: Record<AwayMapId, Dest> = {
  camp: {
    map: "camp",
    scene: CAMP_SCENE,
    arrive: CAMP_ARRIVE,
    route: "camp",
    open: (net) => net.campOpen,
    prebake: (scene, near) => new CampPrebake(scene, near),
    minimap: campMinimapSteps,
    stop: BUS_STOP,
    door: VILLAGE_BUS_DOOR,
    laneY: BUS_LANE_Y,
    fromLeft: BUS_FROM_LEFT,
    land: VILLAGE_BUS_LAND,
  },
  sea: {
    map: "sea",
    scene: SEA_SCENE,
    arrive: SEA_ARRIVE,
    route: "sea",
    open: (net) => net.seaOpen,
    prebake: (scene, near) => new SeaPrebake(scene, near),
    minimap: seaMinimapSteps,
    stop: SEA_STOP,
    door: SEA_STOP_DOOR,
    laneY: SEA_STOP_LANE_Y,
    fromLeft: SEA_STOP_FROM_LEFT,
    land: SEA_STOP_LAND,
  },
};
/** 11/16 마을에 내려 주는 자리 (가는 곳의 정류장) — 월드가 새로고침 복원 자리로 써요 */
export function villageLandFor(map: AwayMapId): Pt {
  return DEST[map].land;
}

export class CampTrip {
  private phase: Phase = "village";
  /** 11/16 지금(또는 마지막으로) 가는 곳 */
  private dest: Dest = DEST.camp;
  private bus: BusArrivalApi | null = null;
  private campLaunched = false;
  /** 11/26 앞 맵 옮기기 답을 기다리는 끝 시각 (arriveCamp — 창밖 연출 없이 마을을 거쳐 곧바로 이어 갈 때) */
  private mapWaitUntil: number | null = null;
  /** 11/15 캠핑장 그림 미리 굽기 (정류장 근처·버스를 기다리는 동안·창밖 연출 동안 프레임마다 조금씩). 11/16 가는 곳마다 따로 */
  private readonly bakes = new Map<AwayMapId, { bake: Prebake; near: Pt }>();
  private bakeMap: AwayMapId = "camp";
  /** 11/15 창밖 연출 그림 미리 굽기 (busRideBake — 한 번 구우면 남아요) */
  private rideArt: RideBake | null = null;
  /** 11/15 미니맵 바탕 굽기 (캠핑장에 내리는 프레임을 가볍게). 11/16 가는 곳마다 (다 구웠으면 null) */
  private readonly minimaps = new Map<AwayMapId, Generator<void, void> | null>();
  private baking = false;
  private warmN = 0;
  /** 창밖 연출 아래에서 만들 캠핑장 장면 (그림이 다 구워지면 띄워요) */
  private campPending: CampSceneData | null = null;
  private readonly bakeTick = (): void => {
    const t0 = performance.now();
    const left = () => BAKE_BUDGET_MS - (performance.now() - t0);
    // 지난 프레임에 그려 둔 것은 치우고, 새로 올린 텍스처를 한 번 그려 둬요
    this.prime();
    // 버스 그림이 먼저예요 (E를 누르면 바로 버스가 와요)
    if (!this.game.textures.exists(BUS_TEX.body)) {
      ensureBusTextures(this.w.scene);
      this.fresh.push(...Object.values(BUS_TEX));
      return;
    }
    const rideDone = !this.rideArt || this.rideArt.step(BAKE_BUDGET_MS);
    if (this.rideArt) this.fresh.push(...this.rideArt.takeFresh());
    if (!rideDone || left() <= 0) return;
    const bake = this.bakes.get(this.bakeMap)?.bake;
    const campDone = !bake || bake.step(left());
    if (bake) this.fresh.push(...bake.takeFresh());
    if (!campDone) return;
    this.launchPendingCamp();
    let mm = this.minimapOf(this.bakeMap);
    while (mm && left() > 0)
      if (mm.next().done) {
        this.minimaps.set(this.bakeMap, null);
        mm = null;
      }
    if (!mm && !this.fresh.length) this.stopBaking();
  };
  /** 11/15 새로 올린 텍스처: 다음 프레임에 1px로 한 번 그려 둬요 (처음 그리는 프레임에 그래픽 카드로 올리느라 멈추지 않게) */
  private readonly fresh: string[] = [];
  private primeImgs: Phaser.GameObjects.Image[] = [];
  /** 11/15 정류장 근처에 오면 미리 굽기 시작 (E를 바로 눌러도 멈추지 않게). 11/16 정류장이 둘 — 가까운 쪽 맵을 구워요 */
  private readonly warmTick = (): void => {
    if (this.phase !== "village" || this.baking || ++this.warmN % WARM_CHECK_FRAMES !== 0) return;
    const pl = this.w.player();
    if (!pl) return;
    for (const d of Object.values(DEST)) {
      if (!d.open(this.w.net) || Math.hypot(pl.x - d.stop.x, pl.y - d.stop.y) > WARM_RADIUS || this.warm(d)) continue;
      this.startBaking(d, d.arrive);
      return;
    }
  };
  private readonly hour = () => ambienceAt(Date.now(), parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search)).kstHour;

  constructor(private readonly w: WorldSide) {
    this.game.events.on(Phaser.Core.Events.POST_STEP, this.warmTick);
  }

  /** 캠핑장에 있거나 오가는 중 (월드는 입력을 받지 않는다) */
  get away(): boolean {
    return this.phase !== "village";
  }

  /** 캠핑장 장면이 떠 있다 */
  get inCampScene(): boolean {
    return this.phase === "camp";
  }

  /** 11/16 지금 가 있거나 오가는 맵 (마을이면 null) */
  get awayMap(): AwayMapId | null {
    return this.phase === "village" ? null : this.dest.map;
  }

  private get game(): Phaser.Game {
    return this.w.scene.game;
  }

  private host(): CampHost {
    const w = this.w;
    return {
      net: w.net,
      atlas: w.atlas,
      hub: w.hub,
      sfx: w.sfx,
      reduced: w.reduced,
      name: w.name,
      color: w.color,
      body: w.myBody(),
      look: w.myLook(),
      goVillage: (friend) => this.goVillage(friend ?? null),
      bail: () => this.bail(),
      isFriend: (sid, name) => w.isFriend(sid, name),
    };
  }

  // ── 마을 → 캠핑장 ──

  /** 마을 정류장에서 E (friend면 버스 연출 없이 창밖만 보고 그 친구 옆으로). 11/16 map = 가는 곳 (캠핑장·바닷가) */
  board(friend: CampFriend | null = null, map: AwayMapId = "camp"): void {
    const w = this.w;
    if (this.phase !== "village") return;
    if (!w.net.online) {
      w.toast("연결된 뒤에 버스를 탈 수 있어요.");
      return;
    }
    const d = DEST[map];
    this.dest = d;
    this.phase = "toCamp";
    this.campPending = null;
    this.mapWaitUntil = null;
    w.lock(true);
    this.startBaking(d, friend ? { x: friend.x, y: friend.y } : d.arrive);
    const pl = w.player();
    const now = w.scene.time.now;
    if (pl.sitting) pl.stand(now, { sit: (id) => w.net.sit(id), stand: () => w.net.stand() });
    bridge.emit("bus:state", { riding: true });
    if (friend) {
      this.hideMe();
      this.ride("toCamp", friend);
      return;
    }
    pl.faceTo(d.door.x, d.door.y + 10, now);
    // 내려 준 버스가 아직 흐려지는 중이면 치운다 (곧바로 다시 타면 버스가 둘이 되지 않게)
    this.dropBus();
    // 11/16 바닷가행은 왼쪽 끝에서 들어와 서요. 앞으로 달려 나가면 강가 풀밭을 가로지르니 그 자리에서 흐려져요
    this.bus = createBusArrival(w.scene, { doorX: d.door.x, laneY: d.laneY, fromLeft: d.fromLeft, reduced: w.reduced, ...(d.map === "sea" ? { leave: "fade" as const, waitMs: VILLAGE_BUS_WAIT_MS } : {}) });
    this.bus.arrive(() => {
      if (this.phase !== "toCamp") return;
      this.walkIn(() => {
        this.hideMe();
        this.ride("toCamp", null);
        this.bus?.depart(() => this.dropBus());
      });
    });
  }

  /** 새로고침 복원: 캠핑장(11/16 바닷가) 기록이면 바로 그 장면 (월드 create 끝에서) */
  resumeInCamp(resume: ResumeState): void {
    if (this.phase !== "village") return;
    const d = DEST[resume.where === "sea" ? "sea" : "camp"];
    this.dest = d;
    this.phase = "camp";
    this.w.lock(true);
    this.w.net.map = d.map;
    this.launchCamp({ host: this.host(), arrive: "resume", resume });
    // 돌아가는 버스·창밖 그림을 미리 조금씩 구워 둬요
    this.startBaking(d, d.arrive);
    // 월드 create 안이라 아직 "켜진" 장면이 아니다 → 다음 틱에 재운다
    setTimeout(() => {
      if (this.phase === "camp") this.sleepWorld();
    }, 0);
  }

  /** 캠핑장에 들어가 있는 동안 버스로 가는 친구: 다른 채널이면 채널부터 (UI가 먼저 옮긴다) — 여기서는 같은 채널만 */
  private ride(leg: BusLeg, friend: CampFriend | null): void {
    const data: BusRideData = {
      leg,
      route: this.dest.route,
      reduced: this.w.reduced,
      hour: this.hour(),
      // 11/20 운영자 순간이동: 창밖 연출 없이 바로 (어두운 한 프레임 뒤 도착). 11/26 집에서 나와 그 집 맵으로 갈 때(door)도
      ...(friend?.tp || friend?.door !== undefined ? { instant: true } : {}),
      onDone: () => (leg === "toCamp" ? this.arriveCamp(friend) : this.arriveVillage(friend)),
    };
    const sm = this.game.scene;
    if (sm.isActive(BUS_RIDE_SCENE) || sm.isPaused(BUS_RIDE_SCENE)) sm.stop(BUS_RIDE_SCENE);
    sm.run(BUS_RIDE_SCENE, data);
    sm.bringToTop(BUS_RIDE_SCENE);
    // 창밖 연출은 E·Space로 건너뛴다 (게임 입력은 InputHub 하나 — 연출 동안만 빌린다)
    this.w.hub.setHandler((a) => {
      if (a !== "interact" && a !== "jump") return;
      if (sm.isActive(BUS_RIDE_SCENE)) (sm.getScene(BUS_RIDE_SCENE) as unknown as BusRideControl).skip();
    });
    if (leg === "toCamp") {
      // 11/15 창밖 연출이 시작하는 프레임에 월드를 재워요 (연출 첫 화면은 검은색이라 보이지 않아요 — 마을과 창밖을 한 프레임에 함께 그리면 멈췄어요)
      // 캠핑장 장면은 몇 프레임 뒤에, 그림이 다 구워졌으면(아니면 bakeTick이 다 구운 뒤) 띄우고 프레임마다 조금씩 만들어요 (CampScene parked)
      this.dropBus();
      this.sleepWorld();
      this.campPending = { host: this.host(), arrive: friend ? "friend" : "bus", friend, parked: true };
      this.afterFrames(CAMP_LAUNCH_FRAMES, () => {
        if (this.bakes.get(this.dest.map)?.bake.done !== false) this.launchPendingCamp();
      });
    }
  }

  private arriveCamp(friend: CampFriend | null): void {
    if (this.phase !== "toCamp") return;
    if (!this.campLaunched) {
      // 느린 기기: 연출이 먼저 끝났다 → 남은 그림을 지금(화면이 어두운 순간) 굽고 장면을 만든 뒤 이어서
      this.bakes.get(this.dest.map)?.bake.finish();
      this.campPending = null;
      this.launchCamp({ host: this.host(), arrive: friend ? "friend" : "bus", friend, parked: true });
      this.whenCampReady(() => this.arriveCamp(friend));
      return;
    }
    const camp0 = this.campScene();
    if (!camp0 || !camp0.sys.settings.isBooted || camp0.sys.settings.status < Phaser.Scenes.RUNNING) {
      this.whenCampReady(() => this.arriveCamp(friend));
      return;
    }
    // 11/26 앞 맵 옮기기(마을 정류장)의 답을 아직 기다리면 받은 뒤에 장면을 깨운다 (창밖 연출 없이 곧바로 이어 갈 때 —
    // 늦게 온 마을 답을 캠핑장 장면이 받아 거절로 알고 마을로 되돌아갔다). 답이 끝내 없어도 RealtimeClient가 12초 안에 정리한다
    const now = performance.now();
    this.mapWaitUntil ??= now + MAP_WAIT_MS;
    if (this.w.net.mapWaiting && now < this.mapWaitUntil) {
      this.afterFrames(1, () => this.arriveCamp(friend));
      return;
    }
    this.mapWaitUntil = null;
    this.phase = "camp";
    const w = this.w;
    w.clearRemotes();
    const camp = this.campScene();
    if (!camp) return this.bail();
    // 서버에 맵 옮기기: 소식은 이제 캠핑장 장면이 받는다 (mapped → 캠핑장 사람들)
    camp.unpark();
    const to = friend ? { x: friend.x, y: friend.y } : this.dest.arrive;
    const map = this.dest.map;
    // 11/15 맵 옮기기(화면 UI도 함께 바뀐다)는 다음 프레임에 (캠핑장을 처음 그리는 프레임을 가볍게)
    this.afterFrames(2, () => {
      if (this.phase !== "camp") return;
      // 11/20 운영자 순간이동이면 tp로 (그 사람 옆, 서버가 운영자 연결만 받는다)
      w.net.switchMap(map, to.x, to.y, friend?.tp ? friend.sid : undefined);
      w.net.setAway(false);
      // 11/26 집 문 앞으로 왔으면: 맵 옮기기를 보낸 뒤 그 집 문 바로 앞으로 맞춘다 (집 그림 기준 — 아직 못 그렸으면 그린 뒤에)
      if (friend?.door !== undefined) bridge.emit(map === "sea" ? "sea:lot" : "camp:lot", { lot: friend.door });
    });
    // 11/15 화면 UI는 몇 프레임 뒤에 다시 보여요 (캠핑장을 처음 그리는 프레임과 겹치면 한 번 멈췄어요)
    this.afterFrames(UI_DELAY_FRAMES, () => {
      if (this.phase === "camp") bridge.emit("bus:state", { riding: false });
    });
  }

  // ── 캠핑장 → 마을 ──

  /** 캠핑장 장면이 버스를 태운 뒤 부른다 */
  private goVillage(friend: CampFriend | null): void {
    if (this.phase !== "camp") return;
    this.phase = "toVillage";
    this.w.net.setAway(true, "bus");
    this.ride("toVillage", friend);
    // 11/15 화면 UI는 창밖 연출 첫 프레임 뒤에 숨겨요 (연출은 검은 화면에서 시작해요 — 같은 프레임에 겹치면 멈췄어요)
    this.afterFrames(UI_DELAY_FRAMES, () => {
      if (this.phase === "toVillage") bridge.emit("bus:state", { riding: true });
    });
    // 11/15 마을이 깨어나는 프레임이 가볍게: 끝나기 조금 전부터 주민 길을 프레임마다 조금씩 미리 찾아요
    const wakeAt = performance.now() + BUS_RIDE_MS + RIDE_TAIL_MS;
    const warmLife = (): void => {
      const now = performance.now();
      if (this.phase !== "toVillage" || this.w.warmLife(Math.max(0, wakeAt - now), BAKE_BUDGET_MS)) this.game.events.off(Phaser.Core.Events.POST_STEP, warmLife);
    };
    // (월드가 자고 있어 월드 시계 대신 setTimeout)
    setTimeout(() => {
      if (this.phase === "toVillage") this.game.events.on(Phaser.Core.Events.POST_STEP, warmLife);
    }, Math.max(0, BUS_RIDE_MS + RIDE_TAIL_MS - LIFE_WARM_LEAD_MS));
    // 연출이 화면을 덮은 뒤 캠핑장을 닫는다 — 마을 내 캐릭터는 정류장 버스 문 앞에 숨겨 둔다
    // 월드는 연출이 끝날 때 깨운다 (연출 아래에서 마을을 함께 그리면 내장 그래픽에서 창밖이 끊긴다)
    // 11/15 캠핑장은 연출이 시작하는 프레임에 바로 숨겨요 (연출 첫 화면은 검은색 — 함께 그리면 멈췄어요). 닫기는 몇 프레임 뒤에
    this.game.scene.getScene(this.dest.scene)?.scene.setVisible(false);
    this.afterFrames(CAMP_CLOSE_FRAMES, () => {
      if (this.phase !== "toVillage") return;
      this.stopCamp();
      this.w.net.divert(null);
    });
  }

  private arriveVillage(friend: CampFriend | null): void {
    if (this.phase !== "toVillage") return;
    const w = this.w;
    this.stopCamp();
    w.net.divert(null);
    this.wakeWorld();
    const pl = w.player();
    const d = this.dest;
    pl.warp(d.door.x, d.door.y, w.scene.time.now, null);
    pl.view.fade = 0;
    // 맵 옮기기: 마을 사람들 화면에는 정류장에 나타난다 (mapped → 월드가 마을 사람 목록을 맞춘다). 11/16 바닷가에서 오면 바닷가행 정류장에
    // 11/19 캠핑장 ↔ 바닷가 친구(friend.next)는 마을 정류장에 내려 버스 안에 숨은 채로 이어 탄다 (friend.x·y는 다음 맵 좌표)
    const land = friend && !friend.next ? { x: friend.x, y: friend.y } : d.land;
    w.net.switchMap("village", land.x, land.y, friend?.tp && !friend.next ? friend.sid : undefined);
    if (friend?.next) {
      pl.warp(land.x, land.y, w.scene.time.now, null);
      w.net.setAway(true, "bus");
      this.finishVillage(friend);
      return;
    }
    w.net.setAway(false);
    if (friend) {
      pl.view.fade = 1;
      this.finishVillage(friend);
      return;
    }
    // 손님을 내린 뒤 앞으로 지나가지 않고, 캠핑장처럼 잠깐 섰다가 부드럽게 흐려지며 사라진다 (11/15 사용자)
    this.bus = createBusArrival(w.scene, { doorX: d.door.x, laneY: d.laneY, fromLeft: d.fromLeft, reduced: w.reduced, leave: "fade", waitMs: VILLAGE_BUS_WAIT_MS });
    this.bus.arrive(() => {
      if (this.phase !== "toVillage") return;
      this.stepOut(d.land, () => {
        this.bus?.depart(() => this.dropBus());
        this.finishVillage(null);
      });
    });
  }

  private finishVillage(friend: CampFriend | null): void {
    this.phase = "village";
    this.w.lock(false);
    // 11/19 이어 탈 버스가 있으면 화면 UI를 숨긴 채로 두고(월드가 이어 타지 못하면 arrived 쪽에서 되돌린다) 두 프레임 뒤에 넘긴다:
    // 막 끝난 창밖 연출 장면의 멈추기는 다음 프레임 처음에 처리돼서, 같은 프레임에 연출을 다시 띄우면 그 멈추기가 새 연출을 꺼 버렸다
    if (friend?.next) {
      this.afterFrames(2, () => {
        if (this.phase === "village") this.w.arrived(friend);
      });
      return;
    }
    bridge.emit("bus:state", { riding: false });
    this.w.arrived(friend);
  }

  /** 캠핑장을 열 수 없다 (서버가 마을로 받았다 · 캠핑장 장면 오류): 연출 없이 마을 정류장으로 */
  private bail(): void {
    const w = this.w;
    const was = this.phase;
    this.campPending = null;
    this.stopCamp();
    w.net.divert(null);
    if (this.game.scene.isActive(BUS_RIDE_SCENE)) this.game.scene.stop(BUS_RIDE_SCENE);
    this.wakeWorld();
    this.phase = "village";
    const pl = w.player();
    const land = this.dest.land;
    pl.view.fade = 1;
    pl.warp(land.x, land.y, w.scene.time.now, null);
    pl.dir = DIR.down;
    w.net.switchMap("village", land.x, land.y);
    w.net.setAway(false);
    w.net.requestSync();
    w.lock(false);
    bridge.emit("bus:state", { riding: false });
    if (was !== "village") w.toast(`지금은 ${MAP_NAME[this.dest.map]}에 갈 수 없어요. 마을 정류장에 내렸어요.`);
  }

  // ── 도움 ──

  /** 그 맵 미니맵 바탕 굽기 (처음 부르면 만들어요, 다 구웠으면 null) */
  private minimapOf(map: AwayMapId): Generator<void, void> | null {
    if (!this.minimaps.has(map)) this.minimaps.set(map, DEST[map].minimap());
    return this.minimaps.get(map) ?? null;
  }

  /** 버스·창밖·그 맵 그림이 다 구워져 있어요 */
  private warm(d: Dest): boolean {
    this.rideArt = rideBake(this.game.textures, this.w.reduced, d.route);
    return this.rideArt.done && !!this.bakes.get(d.map)?.bake.done && !this.minimapOf(d.map) && this.game.textures.exists(BUS_TEX.body);
  }

  /** 미리 굽기를 시작하거나 이어 가요. 다 구운 것은 다시 굽지 않아요 (텍스처를 남겨 둬요) */
  private startBaking(d: Dest, near: Pt): void {
    // 그 맵 그림: 도착하는 곳이 바뀌었고 아직 덜 구웠으면 그 근처 바닥부터 다시 줄을 세워요 (이미 있는 그림은 건너뛰어요)
    const cur = this.bakes.get(d.map);
    const moved = !cur || cur.near.x !== near.x || cur.near.y !== near.y;
    if (!cur || (!cur.bake.done && moved)) this.bakes.set(d.map, { bake: d.prebake(this.w.scene, near), near: { x: near.x, y: near.y } });
    this.bakeMap = d.map;
    this.rideArt = rideBake(this.game.textures, this.w.reduced, d.route);
    if (this.baking) return;
    this.baking = true;
    this.game.events.on(Phaser.Core.Events.POST_STEP, this.bakeTick);
  }

  private stopBaking(): void {
    this.baking = false;
    this.game.events.off(Phaser.Core.Events.POST_STEP, this.bakeTick);
    this.prime();
  }

  /** 지난번에 그려 둔 1px 그림을 치우고, 새로 올린 텍스처를 몇 장씩 그려 둬요 (보이는 장면 맨 아래, 거의 투명) */
  private prime(): void {
    for (const img of this.primeImgs) img.destroy();
    this.primeImgs = [];
    if (!this.baking || !this.fresh.length) return;
    const s = this.primeScene();
    if (!s) return;
    for (const key of this.fresh.splice(0, PRIME_PER_FRAME)) {
      if (!s.textures.exists(key)) continue;
      this.primeImgs.push(s.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(0).setDisplaySize(1, 1).setAlpha(0.004).setDepth(-1e9));
    }
  }

  /** 지금 화면에 그려지는 장면 (창밖 연출 → 캠핑장 → 마을 순) */
  private primeScene(): Phaser.Scene | null {
    const sm = this.game.scene;
    for (const key of [BUS_RIDE_SCENE, CAMP_SCENE, SEA_SCENE, "world"]) {
      const s = sm.getScene(key);
      if (s && sm.isActive(key) && s.sys.settings.visible) return s;
    }
    return null;
  }

  /** 창밖 연출 아래에 캠핑장 장면을 띄워요 (월드가 잠든 뒤·그림이 다 구워진 뒤) */
  private launchPendingCamp(): void {
    const data = this.campPending;
    if (!data || this.phase !== "toCamp" || this.campLaunched) return;
    this.campPending = null;
    this.launchCamp(data);
  }

  /** n번째 POST_STEP에 한 번 (게임 시계 — 월드가 자고 있어도 돌아요). 장면 update 안에서 부르면 1 = 같은 프레임이에요 */
  private afterFrames(n: number, fn: () => void): void {
    let frames = 0;
    const tick = (): void => {
      if (++frames < n) return;
      this.game.events.off(Phaser.Core.Events.POST_STEP, tick);
      fn();
    };
    this.game.events.on(Phaser.Core.Events.POST_STEP, tick);
  }

  /** 캠핑장 장면 create가 끝나면 (다음 프레임들 중) */
  private whenCampReady(then: () => void): void {
    const check = (): void => {
      const s = this.campScene();
      if (this.phase !== "toCamp") return void this.game.events.off(Phaser.Core.Events.POST_STEP, check);
      if (!s || s.sys.settings.status < Phaser.Scenes.RUNNING) return;
      this.game.events.off(Phaser.Core.Events.POST_STEP, check);
      then();
    };
    this.game.events.on(Phaser.Core.Events.POST_STEP, check);
  }

  /** 버스 문으로 걸어 들어가며 흐려진다 */
  private walkIn(done: () => void): void {
    const w = this.w;
    const pl = w.player();
    w.net.setAway(true, "bus");
    if (w.reduced) {
      pl.view.fade = 0;
      done();
      return;
    }
    pl.faceTo(this.dest.door.x, this.dest.door.y, w.scene.time.now);
    w.scene.tweens.add({ targets: pl.view, fade: 0, duration: 420, ease: "Sine.easeIn", onComplete: done });
  }

  /** 버스 문에서 내려서며 나타난다 */
  private stepOut(to: { x: number; y: number }, done: () => void): void {
    const w = this.w;
    const pl = w.player();
    pl.warp(to.x, to.y, w.scene.time.now, null);
    w.net.warp(to.x, to.y);
    pl.dir = DIR.down;
    pl.view.apply(pl.state, DIR.down, w.scene.time.now);
    if (w.reduced) {
      pl.view.fade = 1;
      done();
      return;
    }
    w.scene.tweens.add({ targets: pl.view, fade: 1, duration: 380, ease: "Sine.easeOut", onComplete: done });
  }

  private hideMe(): void {
    const w = this.w;
    w.net.setAway(true, "bus");
    w.player().view.fade = 0;
  }

  private dropBus(): void {
    this.bus?.destroy();
    this.bus = null;
  }

  private sleepWorld(): void {
    const sm = this.game.scene;
    if (sm.isActive("world")) sm.sleep("world");
  }

  private wakeWorld(): void {
    const sm = this.game.scene;
    if (sm.isSleeping("world")) sm.wake("world");
    this.w.scene.scene.setVisible(true);
  }

  private launchCamp(data: CampSceneData): void {
    const sm = this.game.scene;
    const key = this.dest.scene;
    if (sm.isActive(key) || sm.isPaused(key) || sm.isSleeping(key)) sm.stop(key);
    sm.run(key, data);
    this.campLaunched = true;
    if (sm.isActive(BUS_RIDE_SCENE)) sm.bringToTop(BUS_RIDE_SCENE);
  }

  private stopCamp(): void {
    if (!this.campLaunched) return;
    this.campLaunched = false;
    const sm = this.game.scene;
    const key = this.dest.scene;
    if (!(sm.isActive(key) || sm.isPaused(key) || sm.isSleeping(key))) return;
    // 11/16 장면 정리 중 예외가 나도 게임 루프(다음 프레임 예약)가 죽지 않게 — 창밖 연출이 그대로 멈췄어요. 오류 기록만 남겨요
    try {
      sm.stop(key);
    } catch (e) {
      reportClientError("error", e);
    }
  }

  private campScene(): (Phaser.Scene & { unpark(): void }) | null {
    const s = this.game.scene.getScene(this.dest.scene) as (Phaser.Scene & { unpark?: () => void }) | null;
    return s && typeof s.unpark === "function" ? (s as Phaser.Scene & { unpark(): void }) : null;
  }

  /** 새로고침 직전: 캠핑장(11/16 바닷가) 장면이 떠 있으면 그 자리 (아니면 null → 월드가 마을 자리를 남긴다) */
  campResume(): Omit<ResumeState, "bgm" | "map" | "campMap" | "seaMap" | "name" | "color" | "body" | "savedAt" | "channel"> | null {
    if (this.phase !== "camp") return null;
    const s = this.game.scene.getScene(this.dest.scene) as (Phaser.Scene & { resumePose?: () => ReturnType<CampTrip["campResume"]> }) | null;
    return s?.resumePose?.() ?? null;
  }

  destroy(): void {
    this.stopBaking();
    this.game.events.off(Phaser.Core.Events.POST_STEP, this.warmTick);
    this.dropBus();
  }
}

import * as Phaser from "phaser";
import { CAMP_ARRIVE, DIR } from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import type { ResumeState } from "@/lib/resume";
import { bridge } from "../bridge";
import type { Player } from "../entities/Player";
import type { InputHub } from "../input/InputHub";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Sfx } from "../world/Sfx";
import { BUS_BAY, BUS_FROM_LEFT, BUS_LANE_Y, BUS_STOP } from "../world/fishZone";
import { createBusArrival } from "../bus/BusArrival";
import { BUS_RIDE_SCENE, type BusArrivalApi, type BusLeg, type BusRideControl, type BusRideData } from "../bus/busTypes";
import { CAMP_SCENE, type CampFriend, type CampHost, type CampSceneData } from "./campHost";

// 11/15 마을 ↔ 캠핑장 버스 여행 (월드 장면이 하나 가지고 있다).
// 같은 채널 연결 그대로 맵만 옮긴다: 실시간 소식은 캠핑장에 있는 동안 캠핑장 장면이 받는다(net.divert).
//  마을 → 캠핑장: 정류장에 버스가 들어와 문이 열림 → 내가 타면(다른 사람 화면에서 "버스 안"으로 사라짐) → 8초 창밖 연출
//                 (그동안 월드는 재우고 캠핑장 장면을 미리 만든다) → 서버에 맵 옮기기 → 캠핑장 정류장에 버스가 서고 내린다
//  캠핑장 → 마을: 캠핑장 장면이 버스를 부르고 태운 뒤 goVillage → 창밖 연출 → 캠핑장 장면을 닫고(그림도 지운다) 월드를 깨움
//                 → 서버에 맵 옮기기 → 마을 정류장에 버스가 서고 내린다
//  새로고침(캠핑장 기록): 버스 없이 바로 캠핑장 장면. 서버가 캠핑장을 받지 않으면(허락 없음·옛 서버) 마을로 돌아온다(bail)

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
  isFriend(sid: number, name: string): boolean;
  toast(message: string): void;
};

/** 마을 정류장: 버스 문 앞 (지붕 아래 벤치 앞 골목) */
export const VILLAGE_BUS_DOOR = { x: BUS_STOP.x, y: BUS_BAY.y - 2 } as const;
/** 마을 버스에서 내려 서는 자리 */
export const VILLAGE_BUS_LAND = { x: BUS_STOP.x, y: BUS_STOP.y + 16 } as const;

type Phase = "village" | "toCamp" | "camp" | "toVillage";

export class CampTrip {
  private phase: Phase = "village";
  private bus: BusArrivalApi | null = null;
  private campLaunched = false;
  private readonly hour = () => ambienceAt(Date.now(), parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search)).kstHour;

  constructor(private readonly w: WorldSide) {}

  /** 캠핑장에 있거나 오가는 중 (월드는 입력을 받지 않는다) */
  get away(): boolean {
    return this.phase !== "village";
  }

  /** 캠핑장 장면이 떠 있다 */
  get inCampScene(): boolean {
    return this.phase === "camp";
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

  /** 마을 정류장에서 E (friend면 버스 연출 없이 창밖만 보고 그 친구 옆으로) */
  board(friend: CampFriend | null = null): void {
    const w = this.w;
    if (this.phase !== "village") return;
    if (!w.net.online) {
      w.toast("연결된 뒤에 버스를 탈 수 있어요.");
      return;
    }
    this.phase = "toCamp";
    w.lock(true);
    const pl = w.player();
    const now = w.scene.time.now;
    if (pl.sitting) pl.stand(now, { sit: (id) => w.net.sit(id), stand: () => w.net.stand() });
    bridge.emit("bus:state", { riding: true });
    if (friend) {
      this.hideMe();
      this.ride("toCamp", friend);
      return;
    }
    pl.faceTo(VILLAGE_BUS_DOOR.x, VILLAGE_BUS_DOOR.y + 10, now);
    this.bus = createBusArrival(w.scene, { doorX: VILLAGE_BUS_DOOR.x, laneY: BUS_LANE_Y, fromLeft: BUS_FROM_LEFT, reduced: w.reduced });
    this.bus.arrive(() => {
      if (this.phase !== "toCamp") return;
      this.walkIn(() => {
        this.hideMe();
        this.ride("toCamp", null);
        this.bus?.depart(() => this.dropBus());
      });
    });
  }

  /** 새로고침 복원: 캠핑장 기록이면 바로 캠핑장 장면 (월드 create 끝에서) */
  resumeInCamp(resume: ResumeState): void {
    if (this.phase !== "village") return;
    this.phase = "camp";
    this.w.lock(true);
    this.w.net.map = "camp";
    this.launchCamp({ host: this.host(), arrive: "resume", resume });
    // 월드 create 안이라 아직 "켜진" 장면이 아니다 → 다음 틱에 재운다
    setTimeout(() => {
      if (this.phase === "camp") this.sleepWorld();
    }, 0);
  }

  /** 캠핑장에 들어가 있는 동안 버스로 가는 친구: 다른 채널이면 채널부터 (UI가 먼저 옮긴다) — 여기서는 같은 채널만 */
  private ride(leg: BusLeg, friend: CampFriend | null): void {
    const data: BusRideData = {
      leg,
      reduced: this.w.reduced,
      hour: this.hour(),
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
      // 창밖 연출이 화면을 덮은 다음 프레임에 월드를 재우고 캠핑장을 미리 만든다 (그림 굽는 시간을 연출 뒤에 숨긴다)
      this.w.scene.time.delayedCall(80, () => {
        if (this.phase !== "toCamp") return;
        this.dropBus();
        this.sleepWorld();
        this.launchCamp({ host: this.host(), arrive: friend ? "friend" : "bus", friend, parked: true });
      });
    }
  }

  private arriveCamp(friend: CampFriend | null): void {
    if (this.phase !== "toCamp") return;
    this.phase = "camp";
    const w = this.w;
    w.clearRemotes();
    const camp = this.campScene();
    if (!camp) return this.bail();
    // 서버에 맵 옮기기: 소식은 이제 캠핑장 장면이 받는다 (mapped → 캠핑장 사람들)
    camp.unpark();
    const to = friend ? { x: friend.x, y: friend.y } : CAMP_ARRIVE;
    w.net.switchMap("camp", to.x, to.y);
    w.net.setAway(false);
    bridge.emit("bus:state", { riding: false });
  }

  // ── 캠핑장 → 마을 ──

  /** 캠핑장 장면이 버스를 태운 뒤 부른다 */
  private goVillage(friend: CampFriend | null): void {
    if (this.phase !== "camp") return;
    this.phase = "toVillage";
    bridge.emit("bus:state", { riding: true });
    this.w.net.setAway(true, "bus");
    this.ride("toVillage", friend);
    // 연출이 화면을 덮은 뒤 캠핑장을 닫고(그림도 지운다) 월드를 깨운다 — 마을 내 캐릭터는 정류장 버스 문 앞에 숨겨 둔다
    // (월드가 자고 있어 월드 시계 대신 setTimeout)
    setTimeout(() => {
      if (this.phase !== "toVillage") return;
      this.stopCamp();
      this.w.net.divert(null);
      this.wakeWorld();
      const pl = this.w.player();
      pl.warp(VILLAGE_BUS_DOOR.x, VILLAGE_BUS_DOOR.y, this.w.scene.time.now, null);
      pl.view.fade = 0;
      this.game.scene.bringToTop(BUS_RIDE_SCENE);
    }, 120);
  }

  private arriveVillage(friend: CampFriend | null): void {
    if (this.phase !== "toVillage") return;
    const w = this.w;
    const pl = w.player();
    // 맵 옮기기: 마을 사람들 화면에는 정류장에 나타난다 (mapped → 월드가 마을 사람 목록을 맞춘다)
    const land = friend ? { x: friend.x, y: friend.y } : VILLAGE_BUS_LAND;
    w.net.switchMap("village", land.x, land.y);
    w.net.setAway(false);
    if (friend) {
      pl.view.fade = 1;
      this.finishVillage(friend);
      return;
    }
    this.bus = createBusArrival(w.scene, { doorX: VILLAGE_BUS_DOOR.x, laneY: BUS_LANE_Y, fromLeft: BUS_FROM_LEFT, reduced: w.reduced });
    this.bus.arrive(() => {
      if (this.phase !== "toVillage") return;
      this.stepOut(VILLAGE_BUS_LAND, () => {
        this.bus?.depart(() => this.dropBus());
        this.finishVillage(null);
      });
    });
  }

  private finishVillage(friend: CampFriend | null): void {
    this.phase = "village";
    this.w.lock(false);
    bridge.emit("bus:state", { riding: false });
    this.w.arrived(friend);
  }

  /** 캠핑장을 열 수 없다 (서버가 마을로 받았다 · 캠핑장 장면 오류): 연출 없이 마을 정류장으로 */
  private bail(): void {
    const w = this.w;
    const was = this.phase;
    this.stopCamp();
    w.net.divert(null);
    if (this.game.scene.isActive(BUS_RIDE_SCENE)) this.game.scene.stop(BUS_RIDE_SCENE);
    this.wakeWorld();
    this.phase = "village";
    const pl = w.player();
    pl.view.fade = 1;
    pl.warp(VILLAGE_BUS_LAND.x, VILLAGE_BUS_LAND.y, w.scene.time.now, null);
    pl.dir = DIR.down;
    w.net.switchMap("village", VILLAGE_BUS_LAND.x, VILLAGE_BUS_LAND.y);
    w.net.setAway(false);
    w.net.requestSync();
    w.lock(false);
    bridge.emit("bus:state", { riding: false });
    if (was !== "village") w.toast("지금은 캠핑장에 갈 수 없어요. 마을 정류장에 내렸어요.");
  }

  // ── 도움 ──

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
    pl.faceTo(VILLAGE_BUS_DOOR.x, VILLAGE_BUS_DOOR.y, w.scene.time.now);
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
    if (sm.isActive(CAMP_SCENE) || sm.isPaused(CAMP_SCENE) || sm.isSleeping(CAMP_SCENE)) sm.stop(CAMP_SCENE);
    sm.run(CAMP_SCENE, data);
    this.campLaunched = true;
    if (sm.isActive(BUS_RIDE_SCENE)) sm.bringToTop(BUS_RIDE_SCENE);
  }

  private stopCamp(): void {
    if (!this.campLaunched) return;
    this.campLaunched = false;
    const sm = this.game.scene;
    if (sm.isActive(CAMP_SCENE) || sm.isPaused(CAMP_SCENE) || sm.isSleeping(CAMP_SCENE)) sm.stop(CAMP_SCENE);
  }

  private campScene(): (Phaser.Scene & { unpark(): void }) | null {
    const s = this.game.scene.getScene(CAMP_SCENE) as (Phaser.Scene & { unpark?: () => void }) | null;
    return s && typeof s.unpark === "function" ? (s as Phaser.Scene & { unpark(): void }) : null;
  }

  /** 새로고침 직전: 캠핑장 장면이 떠 있으면 그 자리 (아니면 null → 월드가 마을 자리를 남긴다) */
  campResume(): Omit<ResumeState, "bgm" | "map" | "campMap" | "name" | "color" | "body" | "savedAt" | "channel"> | null {
    if (this.phase !== "camp") return null;
    const s = this.game.scene.getScene(CAMP_SCENE) as (Phaser.Scene & { resumePose?: () => ReturnType<CampTrip["campResume"]> }) | null;
    return s?.resumePose?.() ?? null;
  }

  destroy(): void {
    this.dropBus();
  }
}

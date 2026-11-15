import * as Phaser from "phaser";
import {
  CAMP_ARRIVE,
  CAMP_CAMPFIRE,
  campCampfireOfSeat,
  CAMP_BOUNDS,
  CAMP_BUS_STOP,
  CAMP_HEIGHT,
  CAMP_NPCS,
  CAMP_ROAD,
  CAMP_WIDTH,
  DIR,
  STATE,
  TELEPORT_DIST,
  campSeatById,
  dexBadgeCats,
  type BbqItemId,
  type BbqStand,
  isAvatarBody,
  isPhraseId,
  sanitizeDye,
  type ActKind,
  type CampNpcId,
  type PeerInfo,
  type Seat,
  type Sid,
  type WelcomeMsg,
} from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import type { ResumeState } from "@/lib/resume";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH, SIT_IDLE_MS } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import { RemoteAvatar } from "../entities/RemoteAvatar";
import { peerAt } from "../entities/peerHit";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf, type SpeechBubble } from "../entities/SpeechBubble";
import type { KeyAction } from "../input/Keyboard";
import { besideFriend, FRIEND_ARRIVED } from "../logic/friendSpot";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { sideIntent, standPoint } from "../logic/sit";
import type { NetCallbacks } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { avatarColorSpec } from "../sprites/avatar";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Expressions } from "../world/Expressions";
import { Fireworks } from "../world/Fireworks";
import { declutter, type LabelBox } from "../world/labels";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { MeScreen } from "../world/MeScreen";
import { addWorldTintBounds, worldTintOf } from "../world/worldTint";
import { Riding } from "../world/zoo/Riding";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, nearestCampfire } from "../world/campfireMath";
import { LookoutScope } from "./LookoutScope";
import { WeatherSound } from "../world/WeatherSound";
import { createBusArrival } from "../bus/BusArrival";
import type { BusArrivalApi } from "../bus/busTypes";
import { CampMap } from "./CampMap";
import { FoodFx } from "./foodFx";
import { BIG_RIDE_TOAST, foodOfPeer, myBig, RIDING_EAT_TOAST } from "./foodState";
import { CAMP_BBQ } from "./campLayout";
import { CampForage } from "./campForage";
import { CAMP_SCENE, type CampFriend, type CampHost, type CampSceneData } from "./campHost";
import { campLines, campNpcName, CAMP_WELCOME } from "./campTalk";
import { campNeighborSeat, campPickSeat, CAMP_MULTI_SEAT } from "./campSit";
import type { CampInteractable } from "./campTypes";

// 11/15 언젠가 캠핑장 장면. 월드(마을)와 같은 채널 연결을 빌려 쓴다 (CampTrip이 net.divert로 소식을 넘겨준다).
// 그리는 것: 캠핑장 맵(CampMap) · 내 캐릭터 · 같은 캠핑장에 있는 사람 · 분위기(한국 시간 색조·날씨) · 어둠과 빛.
// 하는 것: 걷기·뛰기·점프, 의자·벤치·통나무·바위·캠핑카 문간·전망대 벤치에 앉기(서버 좌석 판정), NPC 말 걸기, 버스 타기,
// 말풍선·이모티콘·채팅·몸짓(같은 맵 사람끼리), 친구 옆으로 가기. 텐트·요리·매점·의뢰는 다음 차수.

const NO_MOVE: MoveInput = { ax: 0, ay: 0, run: false };
const EMPTY_SEATS = new Map<string, Sid>();
const DUST_MS = 90;
const MINIMAP_MS = 250;
const PEER_CHECK_MS = 5000;
const ACT_COOLDOWN_MS = 700;
const SAY_COOLDOWN_MS = 1000;
/** NPC 말을 듣다가 이만큼 멀어지면 대화 창을 닫는다 */
const TALK_LEAVE_DIST = 56;
/** 캠핑장 버스: 손님을 내린 뒤 이만큼 서 있다가 흐려지며 사라진다 (11/15 사용자 — 돌지 않는다) */
const CAMP_BUS_WAIT_MS = 3000;
/** 처음 도착 안내를 이 브라우저에서 봤는지 */
const WELCOMED_KEY = "tomb.camp.welcomed";
/** 11/15 버스 연출 아래에서 장면을 만드는 한 프레임 예산 (ms) */
const BUILD_BUDGET_MS = 4;

export class CampScene extends Phaser.Scene {
  private host!: CampHost;
  private data0!: CampSceneData;
  private map!: CampMap;
  private player!: Player;
  private playerGlow!: Phaser.GameObjects.Image;
  private rig!: CameraRig;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private seatHint!: SeatHint;
  private expr!: Expressions;
  private riding!: Riding;
  /** A-6 계곡 낚시·숲 채집 (마을 Foraging을 캠핑장 맵으로 — game/camp/campForage) */
  private forage!: CampForage;
  /** 전망대 망원경 (망원 뷰) */
  private scope!: LookoutScope;
  private meScreen!: MeScreen;
  private fireworks: Fireworks | null = null;
  /** 11/15 큰 모닥불 불멍 (마을 모닥불과 같은 연출 — game/world/Campfire.ts) */
  private campfire!: CampfireView;
  private seatReq!: SeatRequester;
  private readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly seats = new Map<string, Sid>();
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly labelBoxes: (LabelBox & { t: Phaser.GameObjects.BitmapText | null })[] = [];
  private readonly labelOrder: LabelBox[] = [];
  private readonly bubbleBoxes: SpeechBubble[] = [];
  private readonly unsubs: (() => void)[] = [];
  private friends: { ch: number; bySid: Map<Sid, string> } = { ch: 0, bySid: new Map() };
  private parked = false;
  /** 11/15 조금씩 만드는 중인 장면 (다 만들면 null) */
  private building: Generator<void, void> | null = null;
  private begun = false;
  private cleaned = false;
  /** 버스 타고 내리는 동안·숨은 동안 (입력을 받지 않는다) */
  private locked = false;
  /** 사냥터·미니게임·집처럼 다른 장면이 위에 떠 있다 */
  private covered = false;
  private bus: BusArrivalApi | null = null;
  private spotsJudged = false;
  private lastSide: -1 | 0 | 1 = 0;
  private nearSeatId: string | null = null;
  private dustAt = 0;
  private minimapAt = 0;
  private peerCheckAt = 0;
  private actAt = -Infinity;
  private sayAt = -Infinity;
  /** 지금 말 거는 NPC (대화 창이 열려 있다) */
  private talking: { id: CampNpcId; lines: readonly string[]; at: number } | null = null;
  private readonly talkTurn = new Map<CampNpcId, number>();
  /** 11/15 바베큐로 커진 사람 (sid → 끝나는 시각 epoch ms). 나는 "me" */
  /** 11/15 바베큐장 먹거리·마실 거리 효과 (커지기·빨라지기·취기 — game/camp/foodFx) */
  private food!: FoodFx;
  /** 새로고침 복원 좌석: 첫 welcome에서 확인 */
  private resumeSeat: string | null = null;
  private readonly poseBuf: NetPose = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  private readonly hourOverride = parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search);
  private hourAt = 0;
  private hour = 12;

  constructor() {
    super(CAMP_SCENE);
  }

  init(data: CampSceneData): void {
    this.data0 = data;
    this.host = data.host;
    this.parked = data.parked === true;
    this.begun = false;
    this.cleaned = false;
    this.locked = false;
    this.covered = false;
    this.talking = null;
    this.remotes.clear();
    this.seats.clear();
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    // 11/15 버스 창밖 연출 아래에서 미리 만들 때(parked)는 프레임마다 조금씩 만들어요 (한 프레임에 몰면 100ms 가까이 멈췄어요)
    // 지난 여행에서 남은 것을 다시 지우지 않게 비워 두고 시작해요 (다 만들기 전에 닫힐 수 있어요)
    const self = this as unknown as Record<string, unknown>;
    for (const k of ["map", "player", "rig", "scope", "atmos", "lighting", "expr", "campfire", "forage", "meScreen"]) self[k] = undefined;
    this.building = this.build();
    if (this.parked) {
      this.scene.setVisible(false);
      this.pumpBuild(BUILD_BUDGET_MS);
    } else this.finishBuild();
  }

  /** 만들기를 budgetMs 동안만 이어 가요. 다 만들었으면 true */
  private pumpBuild(budgetMs: number): boolean {
    const it = this.building;
    if (!it) return true;
    const t0 = performance.now();
    do {
      if (it.next().done) {
        this.building = null;
        return true;
      }
    } while (performance.now() - t0 < budgetMs);
    return false;
  }

  /** 남은 만들기를 지금 다 해요 (어두운 화면에서 내릴 때) */
  private finishBuild(): void {
    while (!this.pumpBuild(1000));
  }

  private *build(): Generator<void, void> {
    const t0 = performance.now();
    const h = this.host;
    const canvas = this.game.canvas;
    this.map = new CampMap(this, h.atlas, h.reduced, true);
    yield* this.map.parts();
    this.physics.world.setBounds(CAMP_BOUNDS.minX, CAMP_BOUNDS.minY, CAMP_BOUNDS.maxX - CAMP_BOUNDS.minX, CAMP_BOUNDS.maxY - CAMP_BOUNDS.minY);

    const spawn = this.spawnPoint();
    this.player = new Player(this, h.atlas, spawn.x, spawn.y, h.color, h.name, isAvatarBody(h.body) ? h.body : "hood");
    this.player.titleSpeed = true;
    this.player.view.setLook([...h.look]);
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    const furniture = this.physics.add.collider(this.player.sprite, this.map.furnitureColliders);
    this.player.onLand = () => undefined;
    this.furnitureCollider = furniture;
    this.playerGlow = this.add.image(spawn.x, spawn.y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);
    this.seatReq = { sit: (id) => h.net.sit(id), stand: () => h.net.stand() };
    yield;

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y));
    this.rig.setMapSize(CAMP_WIDTH, CAMP_HEIGHT);
    this.scope = new LookoutScope(this, { rig: this.rig, atlas: h.atlas, reduced: h.reduced });
    yield;
    const tint = worldTintOf(this.game);
    if (tint) addWorldTintBounds(this, tint);
    this.atmos = new Atmosphere(this, h.reduced, window.location.search, { shaderTint: tint });
    this.atmos.setStaticLights(this.map.staticLights.map((l) => ({ ...l })));
    this.lighting = new Lighting(this);
    yield;
    this.seatHint = new SeatHint(this, h.atlas);
    this.meScreen = new MeScreen(this);
    this.expr = new Expressions({
      player: () => this.player,
      net: () => h.net,
      remotes: () => this.remotes,
      sfx: h.sfx,
      rig: this.rig,
      reduced: h.reduced,
      act: (kind) => this.doAct(kind),
    });
    yield;
    this.campfire = new CampfireView(this, this.rig, this.map, h.reduced);
    this.riding = new Riding({ player: () => this.player, net: () => h.net, remotes: () => this.remotes, toast: (m) => this.toast(m) });
    this.food = new FoodFx({ scene: this, reduced: h.reduced, sfx: h.sfx, player: () => this.player, remotes: () => this.remotes });
    yield;
    this.forage = new CampForage({ scene: this, atlas: h.atlas, reduced: h.reduced, colliders: this.map.colliders, player: () => this.player, net: () => h.net, seats: () => this.seats, remotes: () => this.remotes, toast: (m) => this.toast(m) });

    yield;

    this.applyArrivalPose();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (!this.parked) this.begin();
    this.debugMark("campCreateMs", performance.now() - t0);
  }

  private furnitureCollider: Phaser.Physics.Arcade.Collider | null = null;

  /** 버스 창밖 연출이 끝났다 → 보이고, 입력·실시간 소식을 받는다 */
  unpark(): void {
    if (!this.parked || this.cleaned) return;
    this.finishBuild();
    this.parked = false;
    this.scene.setVisible(true);
    this.begin();
  }

  private begin(): void {
    if (this.begun) return;
    this.begun = true;
    const h = this.host;
    h.net.divert(this.callbacks());
    h.hub.setHandler((a) => this.onAction(a));
    this.bindBridge();
    bridge.emit("map:changed", { map: "camp" });
    if (this.data0.arrive === "bus") this.arriveByBus();
    else if (this.data0.arrive === "friend") bridge.emit("friend:notice", { message: FRIEND_ARRIVED });
    this.maybeWelcome();
  }

  private debugMark(key: string, ms: number): void {
    const w = window as unknown as { __tombBoot?: Record<string, unknown> };
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    w.__tombBoot = { ...(w.__tombBoot ?? {}), [key]: Math.round(ms * 10) / 10 };
  }

  // ── 처음 자리 ──

  private spawnPoint(): { x: number; y: number } {
    const d = this.data0;
    if (d.arrive === "resume" && d.resume) {
      const r = d.resume;
      const seat = r.pose === "sitChair" && r.seatId ? campSeatById(r.seatId) : undefined;
      if (seat) return standPoint(seat);
      return this.map.standable(r.x, r.y) ? { x: r.x, y: r.y } : CAMP_ARRIVE;
    }
    if (d.arrive === "friend" && d.friend) return this.besideFriend(d.friend);
    // 버스: 문 앞에 숨겨 두었다가 버스가 서면 내려선다
    return { x: CAMP_BUS_STOP.x + 4, y: CAMP_ROAD.y + 8 };
  }

  private besideFriend(f: CampFriend): { x: number; y: number } {
    const others = [...this.remotes.values()].filter((o) => !o.away).map((o) => ({ x: o.x, y: o.y }));
    return besideFriend({ x: f.x, y: f.y }, others, (x, y) => !this.map.standable(x, y));
  }

  private applyArrivalPose(): void {
    const d = this.data0;
    const pl = this.player;
    const now = this.time.now;
    if (d.arrive === "bus") {
      pl.view.fade = 0;
      this.locked = true;
      return;
    }
    const r: ResumeState | null | undefined = d.resume;
    if (d.arrive === "resume" && r) {
      pl.dir = r.dir as typeof pl.dir;
      const seat = r.pose === "sitChair" && r.seatId ? campSeatById(r.seatId) : undefined;
      if (seat) {
        pl.sit(seat, now, null);
        this.resumeSeat = seat.id;
      } else if (r.pose === "sitGround") pl.sit(null, now, null);
      pl.view.apply(pl.state, pl.dir, now);
    }
  }

  /** 버스가 캠핑장 정류장에 서고 문이 열리면 내려선다 */
  private arriveByBus(): void {
    this.locked = true;
    this.bus = createBusArrival(this, { doorX: CAMP_BUS_STOP.x, laneY: CAMP_ROAD.y + CAMP_ROAD.h - 6, fromLeft: true, reduced: this.host.reduced, leave: "fade", waitMs: CAMP_BUS_WAIT_MS });
    this.bus.arrive(() => {
      if (this.cleaned) return;
      const pl = this.player;
      pl.warp(CAMP_ARRIVE.x, CAMP_ARRIVE.y, this.time.now, null);
      this.host.net.warp(CAMP_ARRIVE.x, CAMP_ARRIVE.y);
      pl.dir = DIR.up;
      pl.view.apply(pl.state, DIR.up, this.time.now);
      const done = () => {
        this.locked = false;
        this.bus?.depart(() => this.dropBus());
      };
      if (this.host.reduced) {
        pl.view.fade = 1;
        done();
      } else this.tweens.add({ targets: pl.view, fade: 1, duration: 380, ease: "Sine.easeOut", onComplete: done });
    });
  }

  /** 처음 도착하면 관리인이 안내 (이 브라우저에서 한 번) */
  private maybeWelcome(): void {
    // 친구 옆으로 바로 왔으면 관리인이 멀리 있다 → 다음에 버스로 올 때
    if (this.data0.arrive === "friend") return;
    let seen = false;
    try {
      seen = localStorage.getItem(WELCOMED_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    try {
      localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // 저장소를 못 쓰면 다음에도 안내한다
    }
    this.time.delayedCall(this.data0.arrive === "bus" ? 2600 : 900, () => {
      if (this.cleaned) return;
      this.openTalk("keeper", CAMP_WELCOME, false);
    });
  }

  // ── 실시간 (같은 채널, 캠핑장 사람만) ──

  private callbacks(): NetCallbacks {
    const base = this.host.net.base;
    return {
      ...base,
      getPose: (out) => this.player.netPose(out),
      getFps: () => this.game.loop.actualFps,
      onWelcome: (m) => this.onWelcome(m),
      onJoin: (p) => this.addRemote(p),
      onLeave: (sid) => {
        this.remotes.get(sid)?.destroy();
        this.remotes.delete(sid);
        for (const [seatId, owner] of this.seats) if (owner === sid) this.setSeat(seatId, null);
      },
      onSnapshot: (entries, t) => {
        const me = this.host.net.mySid;
        for (const e of entries) if (e.sid !== me) this.remotes.get(e.sid)?.push(t, e.x, e.y, e.state, e.dir);
      },
      onSeat: (seatId, sid) => {
        this.forage.f.seatChanged(seatId, sid);
        this.onSeat(seatId, sid);
      },
      onSeatDenied: (seatId) => {
        if (this.forage.f.seatDenied(seatId)) return;
        if (this.player.seat?.id === seatId) this.player.seatDenied(seatId, this.time.now);
      },
      onEmote: () => undefined,
      onGraveEvent: () => undefined,
      onReset: () => {
        this.clearRemotes();
        this.seats.clear();
        this.spotsJudged = false;
      },
      onPeers: (peers, seats) => this.reconcile(peers, seats),
      onLook: (sid, look, extra) => {
        const v = this.remotes.get(sid)?.view;
        v?.setLook(look ?? []);
        v?.applyAppearance(extra);
      },
      onFirework: (sid, item, x, y) => this.fw().launch(item, x, y, this.rig.frameView(this.view), false, this.remotes.get(sid)?.name ?? ""),
      onAct: (sid, kind) => {
        const r = this.remotes.get(sid);
        if (r?.visible) r.view.playAct(kind, performance.now());
      },
      onSay: (sid, id) => {
        const text = phraseOf(id);
        const r = this.remotes.get(sid);
        if (!text || !r) return;
        r.view.say(text, performance.now());
        if (r.visible) this.host.sfx.play("say", 0.3);
      },
      onEmo: (sid, id) => this.expr.onRemoteEmo(sid, id),
      onChat: (sid, text, id, meta) => this.expr.onRemoteChat(sid, text, id, meta),
      // 캠핑장 채팅 기록은 마을 기록과 따로 (채널 번호 뒤에 c)
      // 11/16 채팅 기록은 채널 하나 (마을·캠핑장 같이) — 맵을 오가도 비우지 않게 마을과 같은 채널 번호로
      onChatLog: (lines) => bridge.emit("chat:log", { lines, ...(this.host.net.channel !== null ? { ch: this.host.net.channel } : {}) }),
      onMood: (sid, mood) => this.expr.onRemoteMood(sid, mood),
      onRide: (sid, on) => this.riding.onRide(sid, on),
      onRod: (sid, on) => this.forage.f.onRod(sid, on),
      onAway: (sid, on) => this.remotes.get(sid)?.setAway(on, performance.now()),
      onGoblin: () => undefined,
      onGoblinGone: () => undefined,
      onGoblinCaught: () => undefined,
      onBbq: (sid, item, until, lv, at) => this.food.onBbq(sid, sid === this.host.net.mySid, item, until, lv, at),
      onMapped: (map, peers, seats) => {
        if (map !== "camp") return this.host.bail();
        this.clearRemotes();
        this.syncSeats(seats);
        for (const p of peers) this.addRemote(p);
        this.spotsJudged = true;
        // 낚시 자리 점유표를 캠핑장 것으로 (마을 입장 정보와 같은 모양으로 넘긴다)
        const net = this.host.net;
        this.forage.f.onWelcome({ t: "welcome", sid: net.mySid ?? 0, channel: net.channel ?? 0, cap: net.cap, peers, seats, resumed: false, spots: true });
        this.reclaimSeat();
      },
    };
  }

  private onWelcome(m: WelcomeMsg): void {
    // 서버가 캠핑장으로 받지 않았다 (허락 없음·옛 서버) → 마을로
    if (m.m !== "camp") {
      this.host.bail();
      this.host.net.base.onWelcome(m);
      return;
    }
    this.clearRemotes();
    this.spotsJudged = m.spots === true;
    this.syncSeats(m.seats);
    for (const p of m.peers) this.addRemote(p);
    this.riding.onWelcome();
    this.forage.f.onWelcome(m);
    this.reclaimSeat();
  }

  /** 앉아 있는 채로 (다시) 붙었다: 좌석을 다시 확인한다 */
  private reclaimSeat(): void {
    const net = this.host.net;
    const seat = this.player.state === "sitChair" ? this.player.seat : null;
    const id = seat?.id ?? this.resumeSeat;
    this.resumeSeat = null;
    if (!id) return;
    const owner = this.seats.get(id);
    if (owner === undefined) net.sit(id);
    else if (owner !== net.mySid) this.player.seatDenied(id, this.time.now);
  }

  private onSeat(seatId: string, sid: Sid | null): void {
    for (const r of this.remotes.values()) if (r.seatId === seatId) r.seatId = null;
    if (sid === null) {
      this.setSeat(seatId, null);
      return;
    }
    for (const [id, owner] of this.seats) if (owner === sid) this.setSeat(id, null);
    this.setSeat(seatId, sid);
    const net = this.host.net;
    if (sid === net.mySid) {
      this.expr.onMySeat();
      this.player.seatConfirmed(seatId);
    }
    const r = this.remotes.get(sid);
    if (r) r.seatId = seatId;
    if (sid !== net.mySid && this.player.seat?.id === seatId) this.player.seatDenied(seatId, this.time.now);
  }

  private setSeat(seatId: string, sid: Sid | null): void {
    if (sid === null) this.seats.delete(seatId);
    else this.seats.set(seatId, sid);
    this.map.setSeatTaken(seatId, sid !== null);
  }

  private syncSeats(seats: Record<string, Sid>): void {
    for (const id of [...this.seats.keys()]) this.setSeat(id, null);
    for (const [seatId, sid] of Object.entries(seats)) this.setSeat(seatId, sid);
    for (const r of this.remotes.values()) r.seatId = null;
    for (const [seatId, sid] of this.seats) {
      const r = this.remotes.get(sid);
      if (r) r.seatId = seatId;
    }
  }

  private addRemote(p: PeerInfo): void {
    if (p.sid === this.host.net.mySid) return;
    const prev = this.remotes.get(p.sid);
    prev?.destroy();
    const r = new RemoteAvatar(this, this.host.atlas, p.sid, p.name, avatarColorSpec(p.color, sanitizeDye(p.dye)), p, performance.now(), p.look ?? [], isAvatarBody(p.body) ? p.body : "hood");
    r.map = "camp"; // 11/16 좌석 id를 캠핑장 자리로 푼다 (앉은 사람을 의자 앞에 고정)
    r.view.setDexBadge(p.dex);
    r.view.setChamp(p.champ);
    r.view.setStaff(p.staff === true);
    r.view.setMgr(p.mgr === true);
    r.seatId = prev?.seatId ?? null;
    r.view.setMood(p.mood);
    this.riding.applyPeer(r, p);
    this.forage?.f.applyPeer(p);
    r.setAway(p.away === true, performance.now(), true);
    r.view.setFriend(this.isFriend(r));
    if (!r.seatId) for (const [seatId, owner] of this.seats) if (owner === p.sid) r.seatId = seatId;
    this.remotes.set(p.sid, r);
  }

  private reconcile(peers: PeerInfo[], seats: Record<string, Sid>): void {
    const keep = new Set<Sid>();
    const now = performance.now();
    for (const p of peers) {
      if (p.sid === this.host.net.mySid) {
        this.expr.syncMyMood(p.mood ?? null);
        continue;
      }
      keep.add(p.sid);
      const r = this.remotes.get(p.sid);
      if (!r || r.name !== p.name || r.view.colorSpec !== avatarColorSpec(p.color, sanitizeDye(p.dye)) || r.view.bodyId !== (isAvatarBody(p.body) ? p.body : "hood") || r.view.staff !== (p.staff === true) || r.view.dexBadgeCount !== dexBadgeCats(p.dex).length) {
        this.addRemote(p);
        continue;
      }
      r.view.setLook(p.look ?? []);
      r.view.setChamp(p.champ);
      r.view.setMgr(p.mgr === true);
      r.view.setMood(p.mood ?? null);
      this.riding.applyPeer(r, p);
      r.setAway(p.away === true, now);
      r.applyFood(foodOfPeer(p)); // 11/15 바베큐 효과 (커지기·빨라지기·취기)
      const last = r.interp.latest;
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > TELEPORT_DIST / 2) r.push(now, p.x, p.y, p.state, p.dir);
    }
    for (const [sid, r] of this.remotes) {
      if (keep.has(sid)) continue;
      r.destroy();
      this.remotes.delete(sid);
    }
    this.syncSeats(seats);
  }

  private clearRemotes(): void {
    for (const r of this.remotes.values()) r.destroy();
    this.remotes.clear();
  }

  private isFriend(r: RemoteAvatar): boolean {
    return this.host.net.channel === this.friends.ch && this.friends.bySid.get(r.sid) === r.name;
  }

  // ── bridge (UI → 캠핑장) ──

  private bindBridge(): void {
    const on = this.unsubs;
    on.push(bridge.on("input:say", ({ id }) => !this.covered && this.doSay(id)));
    on.push(bridge.on("input:emo", ({ id }) => !this.covered && !this.locked && this.expr.emo(id, this.time.now)));
    on.push(bridge.on("input:chat", ({ text }) => !this.covered && this.expr.chat(text, this.time.now)));
    on.push(bridge.on("input:mood", ({ mood }) => this.expr.setMood(mood)));
    on.push(bridge.on("input:ride", () => !this.locked && this.riding.toggle()));
    on.push(
      bridge.on("input:act", ({ kind }) => {
        if ((kind === "wave" || kind === "cheer") && !this.covered && !this.locked) this.doAct(kind);
      }),
    );
    on.push(bridge.on("camera:recenter", () => this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => this.rig.zoomBy(delta)));
    on.push(
      bridge.on("friends:here", ({ ch, list }) => {
        this.friends = { ch, bySid: new Map(list.map((f) => [f.sid, f.name])) };
        for (const r of this.remotes.values()) r.view.setFriend(this.isFriend(r));
      }),
    );
    this.friends = (() => {
      const last = bridge.last("friends:here");
      return last ? { ch: last.ch, bySid: new Map(last.list.map((f) => [f.sid, f.name])) } : this.friends;
    })();
    on.push(
      bridge.on("friend:goto", ({ sid, name, x, y, map }) => {
        if (map === "camp") this.goToFriend(sid, name, x, y);
        else {
          this.closeTalk();
          this.host.goVillage({ sid, name, x, y });
        }
      }),
    );
    // 캠핑장에서 채널을 옮기면 새 채널 캠핑장 정류장에서 (마을이 SPAWN에서 시작하는 것과 같은 규칙)
    on.push(
      bridge.on("channel:switch", () => {
        const pl = this.player;
        if (pl.sitting) pl.stand(this.time.now, this.seatReq);
        pl.warp(CAMP_ARRIVE.x, CAMP_ARRIVE.y, this.time.now, null);
        this.rig.recenter();
      }),
    );
    on.push(bridge.on("peers:ask", () => bridge.emit("peers:list", { names: [...this.remotes.values()].map((r) => r.name) })));
    on.push(
      bridge.on("firework:fire", ({ item }) => {
        // 증서는 월드가 서버로 보낸다 (net.firework) — 여기서는 내 자리에서 터뜨리기만
        this.fw().launch(item, this.player.x, this.player.y, this.rig.frameView(this.view), true, this.host.name);
      }),
    );
    // 사냥터·미니게임·집이 위에 뜨면 캠핑장은 숨고 입력을 멈춘다
    on.push(
      bridge.on("scene:changed", ({ scene }) => {
        this.covered = scene !== "world";
        this.scene.setVisible(!this.covered && !this.parked);
        this.rig.enabled = !this.covered;
        if (!this.covered) this.host.hub.setHandler((a) => this.onAction(a));
      }),
    );
    on.push(bridge.on("camp:talkClose", () => (this.talking = null)));
    on.push(bridge.on("camp:bbq:eat", ({ item, until, grant, lv, at, stand }) => this.eatBbq(item, until, grant, lv, at, stand)));
  }

  private fw(): Fireworks {
    this.fireworks ??= new Fireworks(this, this.host.reduced, this.host.sfx);
    return this.fireworks;
  }

  // ── 입력 ──

  private onAction(a: KeyAction): void {
    const h = this.host;
    if (h.hub.isBlocked || this.cleaned || this.locked || this.covered || this.parked) return;
    // 망원경을 보는 중: E·Space·X로 내려놓는다
    if (this.scope.isOpen) {
      if (a === "interact" || a === "jump" || a === "sit") this.scope.close();
      return;
    }
    const pl = this.player;
    const now = this.time.now;
    if (a === "jump") {
      pl.jump(now, this.seatReq);
      return;
    }
    if (a === "ride") {
      this.riding.toggle();
      return;
    }
    if (this.expr.key(a, now)) return;
    if (a === "wave" || a === "cheer") {
      this.doAct(a);
      return;
    }
    if (pl.airborne) return;
    const moving = Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER;
    const occupied = h.net.online ? this.seats : EMPTY_SEATS;
    const mySid = h.net.online ? h.net.mySid : null;
    if (a === "sit") {
      if (moving) return;
      if (pl.sitting) pl.stand(now, this.seatReq);
      else pl.sit(campPickSeat(pl.x, pl.y, occupied, mySid), now, this.seatReq);
      return;
    }
    if (a !== "interact") return;
    // 대화 중이면 E = 다음 말
    if (this.talking) {
      this.nextTalk();
      return;
    }
    if (pl.sitting) {
      pl.stand(now, this.seatReq);
      return;
    }
    const seat = moving ? null : campPickSeat(pl.x, pl.y, occupied, mySid);
    const obj = this.nearestObject(pl.x, pl.y);
    const sd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    const od = obj ? Math.hypot(obj.x - pl.x, obj.y - pl.y) : Infinity;
    // A-6 낚시 자리·채집 지점이 더 가까우면 그것부터 (마을 Foraging.use와 같다)
    const fo = this.forage.nearest(pl.x, pl.y);
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(sd, od)) {
      this.forage.f.use(fo);
      return;
    }
    if (obj && od <= sd) this.useObject(obj);
    else if (seat) pl.sit(seat, now, this.seatReq);
  }

  private nearestObject(x: number, y: number): CampInteractable | null {
    let best: CampInteractable | null = null;
    let bd = Infinity;
    for (const o of this.map.interactables) {
      if (o.kind === "npc" && o.npc && !this.map.npcVisible(o.npc)) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d <= o.r && d < bd) {
        best = o;
        bd = d;
      }
    }
    return best;
  }

  private useObject(o: CampInteractable): void {
    const pl = this.player;
    const now = this.time.now;
    switch (o.kind) {
      case "bus":
        pl.faceTo(o.x, o.y + 10, now);
        // 11/15 바베큐로 커진 동안에는 버스에도 못 탄다
        if (myBig() > 1) {
          this.toast(BIG_RIDE_TOAST);
          break;
        }
        this.boardBus();
        break;
      case "npc":
        if (!o.npc) return;
        pl.faceTo(o.x, o.y - 10, now);
        this.talkTo(o.npc);
        break;
      case "van": {
        const seat = o.seatId ? campSeatById(o.seatId) : undefined;
        if (!seat) return;
        const owner = this.seats.get(seat.id);
        if (owner !== undefined && owner !== this.host.net.mySid) {
          this.toast("다른 사람이 캠핑카에 앉아 있어요.");
          return;
        }
        pl.sit(seat, now, this.seatReq);
        break;
      }
      case "deck":
        this.toast(`${o.deck}번 데크예요. 텐트는 곧 칠 수 있어요.`);
        break;
      case "board":
        this.toast("의뢰판이 아직 비어 있어요. 곧 의뢰가 붙어요.");
        break;
      case "sign":
        this.toast("시간표에는 '다음 버스: 언젠가'라고 적혀 있어요. 그래도 E를 누르면 와요.");
        break;
      case "bbq":
      case "vending":
        // 11/15 야외 바베큐 그릴(먹거리)·음료 자판기(마실 거리): 메뉴 창 (사면 camp:bbq:eat으로 돌아온다)
        // 펫을 타고 있으면 먹지 못한다 (커진 채로 타는 일이 없게 — 내린 다음에 먹는다)
        if (this.riding.on) {
          this.toast(RIDING_EAT_TOAST);
          break;
        }
        if (pl.sitting) pl.stand(now, this.seatReq);
        pl.faceTo(o.x, o.y - 14, now);
        this.closeTalk();
        bridge.emit("camp:bbq:open", { stand: o.kind === "vending" ? "vending" : "grill" });
        break;
      case "lookout":
        // 전망대 망원경: 광장·데크를 내려다본다 (LookoutScope)
        this.closeTalk();
        this.scope.open();
        break;
    }
  }

  private onTap(wx: number, wy: number): void {
    const h = this.host;
    if (h.hub.isBlocked || this.cleaned || this.locked || this.covered || this.parked) return;
    if (this.scope.isOpen) return this.scope.close();
    const hit = peerAt(
      [...this.remotes.values()].map((r) => ({ sid: r.sid, name: r.name, x: r.x, y: r.y, visible: r.visible, label: r.view.label.getBounds() })),
      wx,
      wy,
    );
    if (hit && this.remotes.get(hit.sid)?.view.staff) return;
    if (hit && h.net.channel !== null) {
      const chat = this.remotes.get(hit.sid)?.view.chatText(performance.now());
      bridge.emit("peer:menu", { sid: hit.sid, name: hit.name, ch: h.net.channel, ...(chat ? { chat } : {}) });
      return;
    }
    // 오브젝트를 탭: 가까이 서 있으면 E와 같다
    const pl = this.player;
    let best: CampInteractable | null = null;
    let bd = 18;
    for (const o of this.map.interactables) {
      const d = Math.hypot(o.x - wx, o.y - (wy + 6));
      if (d < bd) {
        best = o;
        bd = d;
      }
    }
    if (best && Math.hypot(best.x - pl.x, best.y - pl.y) <= best.r * 1.5 && !pl.airborne) this.useObject(best);
  }

  private doSay(id: string): void {
    const text = phraseOf(id);
    const now = this.time.now;
    if (!text || !isPhraseId(id) || now - this.sayAt < SAY_COOLDOWN_MS || this.cleaned) return;
    this.sayAt = now;
    this.player.view.say(text, now);
    this.host.net.say(id);
    this.host.sfx.play("say", 0.5);
  }

  private doAct(kind: ActKind): void {
    const now = this.time.now;
    if (now - this.actAt < ACT_COOLDOWN_MS) return;
    this.actAt = now;
    this.host.net.act(kind);
    this.player.view.playAct(kind, now);
  }

  private toast(message: string): void {
    bridge.emit("toast", { message });
  }

  // ── NPC 말 걸기 ──

  private talkTo(id: CampNpcId): void {
    const turn = this.talkTurn.get(id) ?? 0;
    this.talkTurn.set(id, turn + 1);
    this.openTalk(id, campLines(id, turn), true);
  }

  private openTalk(id: CampNpcId, lines: readonly string[], near: boolean): void {
    this.talking = { id, lines, at: near ? this.time.now : -1 };
    bridge.emit("camp:talk", { npc: id, name: campNpcName(id), lines: [...lines] });
  }

  private nextTalk(): void {
    if (!this.talking) return;
    bridge.emit("camp:talkNext");
  }

  private closeTalk(): void {
    if (!this.talking) return;
    this.talking = null;
    bridge.emit("camp:talk", null);
  }

  // ── 버스 (캠핑장 → 마을) ──

  private boardBus(): void {
    if (this.locked) return;
    const net = this.host.net;
    if (!net.online) {
      this.toast("연결된 뒤에 버스를 탈 수 있어요.");
      return;
    }
    this.closeTalk();
    this.locked = true;
    const pl = this.player;
    if (pl.sitting) pl.stand(this.time.now, this.seatReq);
    this.leaveCampfire();
    this.riding.dismount(false);
    this.bus = createBusArrival(this, { doorX: CAMP_BUS_STOP.x, laneY: CAMP_ROAD.y + CAMP_ROAD.h - 6, fromLeft: true, reduced: this.host.reduced, leave: "fade", waitMs: CAMP_BUS_WAIT_MS });
    this.bus.arrive(() => {
      if (this.cleaned) return;
      const go = () => {
        this.bus?.depart(() => this.dropBus());
        this.host.goVillage(null);
      };
      net.setAway(true, "bus");
      if (this.host.reduced) {
        pl.view.fade = 0;
        go();
      } else this.tweens.add({ targets: pl.view, fade: 0, duration: 420, ease: "Sine.easeIn", onComplete: go });
    });
  }

  private dropBus(): void {
    this.bus?.destroy();
    this.bus = null;
  }

  /** 같은 채널 캠핑장의 친구 옆으로 (마을 goToFriend와 같은 규칙) */
  private goToFriend(sid: Sid, name: string, fx: number, fy: number): void {
    const net = this.host.net;
    if (this.cleaned || !net.online || this.locked) return;
    const notice = (message: string) => bridge.emit("friend:notice", { message });
    const r = this.remotes.get(sid);
    const live = r && r.name === name ? r : null;
    if (live?.away) return notice(`${name}님은 지금 실내에 있어요.`);
    const at = live ? { x: live.x, y: live.y } : { x: fx, y: fy };
    this.closeTalk();
    this.leaveCampfire();
    const pl = this.player;
    const now = this.time.now;
    if (pl.sitting) pl.stand(now, this.seatReq);
    const spot = this.besideFriend({ sid, name, x: at.x, y: at.y });
    pl.warp(spot.x, spot.y, now, this.seatReq);
    pl.faceTo(at.x, at.y, now);
    net.warp(spot.x, spot.y);
    this.rig.recenter();
    notice(FRIEND_ARRIVED);
  }

  /** 새로고침 직전 자리 (CampTrip.campResume) */
  resumePose(): { x: number; y: number; seatId: string | null; pose: ResumeState["pose"]; dir: number; where: "camp" } | null {
    if (this.cleaned || !this.player) return null;
    const pl = this.player;
    const p = pl.netPose(this.poseBuf);
    const pose = pl.state === "sitChair" && pl.seat ? "sitChair" : pl.state === "sitGround" ? "sitGround" : "idle";
    return { x: Math.round(p.x), y: Math.round(p.y), seatId: pose === "sitChair" ? (pl.seat?.id ?? null) : null, pose, dir: pl.dir, where: "camp" };
  }

  // ── 매 프레임 ──

  update(time: number, delta: number): void {
    if (this.cleaned) return;
    if (this.parked) {
      this.pumpBuild(BUILD_BUDGET_MS);
      return;
    }
    const dt = Math.min(delta, 100);
    const now = time;
    const pl = this.player;
    const pnow = performance.now();
    const net = this.host.net;
    if (pnow >= this.hourAt) {
      this.hourAt = pnow + 20_000;
      this.hour = ambienceAt(Date.now(), this.hourOverride).kstHour;
    }

    if (this.covered) {
      pl.update(NO_MOVE, now, this.seatReq);
      net.tick(pnow);
      return;
    }
    this.host.hub.read(this.move);
    if (this.host.hub.isBlocked || this.locked) this.move.ax = this.move.ay = 0;
    // 전망대 망원경: 방향키는 망원경을 겨누고 캐릭터는 그대로
    if (this.scope.isOpen) {
      this.scope.update(now, dt, this.move, this.atmos.levels.darkness);
      this.move.ax = this.move.ay = 0;
    }
    const started = pl.update(this.benchInput(now), now, this.seatReq);
    if (this.furnitureCollider) this.furnitureCollider.active = !pl.airborne;
    if (net.online && pnow >= this.peerCheckAt) {
      this.peerCheckAt = pnow + PEER_CHECK_MS;
      if (this.remotes.size !== net.peerCount) net.requestSync();
    }
    if (pnow >= this.minimapAt) {
      this.minimapAt = pnow + MINIMAP_MS;
      this.emitMinimap();
    }
    if (started && this.rig.detached) this.rig.recenter();
    this.rig.update(dt);
    // 통나무 의자(모닥불 둘레)에 앉으면 마을 모닥불과 같은 불멍 구도 (카메라·레터박스·온기·불티), 일어나면 원래대로. 불 소리는 거리에 따라
    const fire = pl.state === "sitChair" && pl.seat ? campCampfireOfSeat(pl.seat.id) : null;
    if (fire && this.campfire.active?.id !== fire.id) {
      this.campfire.enter(fire);
      bridge.emit("view:mode", { mode: "campfire" });
    } else if (!fire && this.campfire.active) this.leaveCampfire();
    this.campfire.update(now, dt);
    const nf = nearestCampfire(pl.x, pl.y, [CAMP_CAMPFIRE]);
    this.host.sfx.campfire(nf ? campfireLevel(nf.dist, !!fire) : 0);
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    this.expr.update(now);
    this.meScreen.update(pl.x, pl.y);
    pl.view.sync(now, s);
    const L = this.atmos.levels;
    this.map.update(now, dt, view, { hour: this.hour, darkness: L.darkness, rain: L.rain, fog: L.fog });
    this.riding.update();
    this.forage.f.update(dt, view, s);
    for (const r of this.remotes.values()) r.update(pnow, view, s);
    this.declutterLabels(now, pnow);
    this.updateSeatHint(now, s);
    this.updateTalk();
    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
    // 큰 타프 아래: 빗소리가 천막을 두드린다
    WeatherSound.of(this).setRoof(L.rain > 0.05 && this.map.underTarp(pl.x, pl.y));
    this.fireworks?.update(now, dt, view);
    this.updateLighting(view);
    if (pl.state === "run" && now - this.dustAt > DUST_MS) this.dustAt = now;
    net.tick(pnow);
  }

  // ── 11/15 야외 바베큐 (먹으면 잠깐 커진다 — 재미용) ──

  /** 메뉴 창에서 샀다: 증서는 실시간 서버로, 나는 바로 먹는·마시는 연출과 효과 */
  private eatBbq(item: BbqItemId, until: number, grant: string, lv?: number, at?: number, stand?: BbqStand): void {
    if (this.cleaned) return;
    this.host.net.bbq(grant);
    // 자판기: 캔·병이 덜컹 떨어지고 나서 마신다
    if (stand === "vending") this.food.vend(CAMP_BBQ.vending.x, CAMP_BBQ.vending.y, item, () => this.food.eat(item, until, lv, at));
    else this.food.eat(item, until, lv, at);
  }

  private benchInput(now: number): MoveInput {
    const pl = this.player;
    const seat = pl.state === "sitChair" ? pl.seat : null;
    if (!seat || !CAMP_MULTI_SEAT.has(seat.furnitureId)) {
      this.lastSide = 0;
      return this.move;
    }
    const side = sideIntent(this.move.ax, this.move.ay);
    if (side === 0) {
      this.lastSide = 0;
      return this.move;
    }
    if (side !== this.lastSide) {
      const net = this.host.net;
      const n = campNeighborSeat(seat, side, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null);
      if (n) pl.moveSeat(n, now, this.seatReq);
    }
    this.lastSide = side;
    return NO_MOVE;
  }

  private updateSeatHint(now: number, labelScale: number): void {
    const pl = this.player;
    const net = this.host.net;
    const seat: Seat | null = pl.sitting || this.locked ? null : campPickSeat(pl.x, pl.y, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null);
    const id = seat ? seat.id : null;
    if (id !== this.nearSeatId) {
      this.nearSeatId = id;
      bridge.emit("seat:near", seat ? { seatId: seat.id, kind: seat.id.includes("-") ? "bench" : "chair" } : null);
    }
    const sittingFor = pl.sitting && pl.view.sitSince > 0 ? now - pl.view.sitSince : -1;
    const obj = !pl.sitting && !this.locked ? this.nearestObject(pl.x, pl.y) : null;
    const objSd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    const objOd = obj ? Math.hypot(obj.x - pl.x, obj.y - pl.y) : Infinity;
    let other = obj && objOd <= objSd ? { x: obj.x, y: obj.y + 2, text: `${this.seatHint.prefix}${obj.label}` } : null;
    // A-6 낚시 자리·채집 지점 안내 ("E 낚시하기"·"E 약초 캐기")
    const fo = !pl.sitting && !this.locked ? this.forage.nearest(pl.x, pl.y) : null;
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(objSd, objOd)) other = { x: fo.x, y: fo.y + 2, text: `${this.seatHint.prefix}${fo.label}` };
    const bench = pl.state === "sitChair" && pl.seat && CAMP_MULTI_SEAT.has(pl.seat.furnitureId);
    const keys = this.seatHint.prefix === "E ";
    const standText = bench ? (keys ? "←→ 옆자리 · ↑↓ 일어나기 · T 벤치 상태" : "좌우로 옆자리 · 위아래로 일어나기") : pl.state === "sitChair" && keys ? "이동하면 일어나요 · T 상태 고르기" : null;
    // 불멍 구도에서는 화면을 가리지 않게 앉기 안내를 띄우지 않는다 (마을과 같다)
    this.seatHint.update(other ? null : seat, pl, sittingFor, this.talking !== null || this.campfire.active !== null, labelScale, other, standText);
  }

  /** 대화 창: NPC에게서 멀어지면 닫는다 */
  private updateTalk(): void {
    const t = this.talking;
    if (!t || t.at < 0) return;
    const npc = CAMP_NPCS.find((n) => n.id === t.id);
    if (!npc) return;
    if (Math.hypot(npc.x - this.player.x, npc.y - this.player.y) > TALK_LEAVE_DIST) this.closeTalk();
  }

  private declutterLabels(now: number, pnow: number): void {
    let n = this.pushLabel(this.player.view.label, 0);
    for (const r of this.remotes.values()) n = this.pushLabel(r.view.label, n);
    const boxes = this.labelBoxes;
    if (n >= 2) {
      declutter(boxes, this.labelOrder, n);
      for (let i = 0; i < n; i++) {
        const b = boxes[i];
        if (b.t && b.t.y !== b.y) b.t.setY(b.y);
      }
    }
    const bubbles = this.bubbleBoxes;
    let m = 0;
    const me = this.player.view.speechAt(now);
    if (me) bubbles[m++] = me;
    for (const r of this.remotes.values()) {
      const sb = r.view.speechAt(pnow);
      if (sb) bubbles[m++] = sb;
    }
    bubbles.length = m;
    if (!m) return;
    let k = n;
    for (let i = 0; i < m; i++) {
      let b = boxes[k];
      if (!b) boxes.push((b = { x: 0, y: 0, w: 0, h: 0, t: null }));
      b.t = null;
      b.x = bubbles[i].box.x;
      b.y = bubbles[i].box.y;
      b.w = bubbles[i].box.w;
      b.h = bubbles[i].box.h;
      k++;
    }
    declutter(boxes, this.labelOrder, k);
    for (let i = 0; i < m; i++) {
      const b = boxes[n + i];
      if (b.y !== bubbles[i].box.y) bubbles[i].setBottom(b.y);
    }
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      if (b.t && b.t.y !== b.y) b.t.setY(b.y);
    }
  }

  private pushLabel(t: Phaser.GameObjects.BitmapText, n: number): number {
    if (!t.visible) return n;
    let b = this.labelBoxes[n];
    if (!b) this.labelBoxes.push((b = { x: 0, y: 0, w: 0, h: 0, t: null }));
    b.t = t;
    b.x = t.x;
    b.y = t.y;
    b.w = t.width + 2 / this.cameras.main.zoom;
    b.h = t.height;
    return n + 1;
  }

  private updateLighting(view: Phaser.Geom.Rectangle): void {
    const L = this.atmos.levels;
    const lit = this.lighting;
    const pl = this.player;
    const lantern = pl.view.lantern;
    const r = playerLightRadius(L.glow, lantern);
    this.playerGlow
      .setPosition(pl.x, pl.y - 9)
      .setScale((r * 1.6) / 64)
      .setAlpha((0.05 + 0.13 * L.glow) * (lantern ? 1.5 : 1) * Math.min(1, L.darkness * 3) * pl.view.fade);
    // 캠핑장은 마을보다 밝게: 어둠을 조금 덜고 빛 구멍을 넉넉히
    lit.begin(view, L.darkness * 0.82 * (1 - 0.6 * (this.fireworks?.lift ?? 0)), L.shade);
    if (L.darkness > 0.004) {
      lit.add(pl.x, pl.y - 8, r, 0.92);
      for (const a of this.remotes.values()) {
        if (!a.visible) continue;
        if (a.view.lantern) lit.add(a.x, a.y - 8, 40, 0.7);
        else lit.add(a.x, a.y - 8, 26, 0.5);
      }
      const lr = 40 + 24 * L.glow;
      for (const sp of this.map.staticLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.4, 0.88);
      this.fireworks?.addLights(lit);
      this.forage.f.addLights(lit);
    }
    lit.end();
  }

  /** 미니맵: 내 위치와 같은 캠핑장 사람 (map 표시로 캠핑장 바탕을 그린다) */
  private emitMinimap(): void {
    const others: number[] = [];
    const friends: number[] = [];
    for (const r of this.remotes.values()) if (!r.away) (r.view.friend ? friends : others).push(Math.round(r.x), Math.round(r.y));
    bridge.emit("minimap:dots", { me: { x: Math.round(this.player.x), y: Math.round(this.player.y) }, others, friends, map: "camp" });
  }

  /** 불멍에서 나온다 (일어남·버스·친구한테 가기) */
  private leaveCampfire(): void {
    if (!this.campfire?.active) return;
    this.campfire.exit();
    bridge.emit("view:mode", { mode: "normal" });
  }

  private onResize(): void {
    this.rig?.applyBounds();
    this.campfire?.resize();
    this.atmos?.resize();
    this.lighting?.resize();
    this.scope?.resize();
  }

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    // 다 만들기 전에 닫혀도 남은 만들기는 버려요
    this.building = null;
    for (const off of this.unsubs.splice(0)) off();
    if (this.talking) bridge.emit("camp:talk", null);
    this.talking = null;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.dropBus();
    WeatherSound.of(this).setRoof(false);
    if (this.campfire?.active) bridge.emit("view:mode", { mode: "normal" });
    this.campfire?.destroy();
    this.host.sfx.campfire(0);
    this.clearRemotes();
    this.expr?.destroy();
    this.forage?.f.destroy();
    this.meScreen?.destroy();
    this.rig?.destroy();
    this.atmos?.destroy();
    this.lighting?.destroy();
    this.fireworks = null;
    this.player?.destroy();
    this.scope?.destroy();
    this.map?.destroy();
    // 소식은 월드로 돌려준다 (CampTrip이 먼저 했어도 한 번 더 — 남은 콜백이 지운 장면을 부르지 않게)
    if (this.begun) this.host.net.divert(null);
    bridge.emit("map:changed", { map: "village" });
  }
}

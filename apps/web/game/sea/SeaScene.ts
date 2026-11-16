import * as Phaser from "phaser";
import {
  DIR,
  SEA_ARRIVE,
  SEA_BOUNDS,
  SEA_BUS_FROM_LEFT,
  SEA_BUS_LANE_Y,
  SEA_BUS_STOP,
  SEA_HEIGHT,
  SEA_ROAD,
  SEA_ROAD_LOOP,
  SEA_WIDTH,
  STATE,
  TELEPORT_DIST,
  TIDE_PERIOD_MS,
  dexBadgeCats,
  isAvatarBody,
  isPhraseId,
  sanitizeDye,
  seaSeatById,
  SEA_REST_SEATS,
  SEA_SEATS,
  seaSeatGroup,
  seaViewOfSeat,
  seaWet,
  type SeaRestSeat,
  type SeaViewKind,
  tideLineY,
  type ActKind,
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
import { phraseOf } from "../entities/SpeechBubble";
import type { KeyAction } from "../input/Keyboard";
import { keyJosa } from "../input/keyHint";
import { besideFriend, FRIEND_ARRIVED } from "../logic/friendSpot";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { sideIntent, standPoint } from "../logic/sit";
import type { NetCallbacks } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { avatarColorSpec } from "../sprites/avatar";
import { Atmosphere } from "../world/Atmosphere";
import { Effects } from "../world/Effects";
import { CameraRig } from "../world/CameraRig";
import { Expressions } from "../world/Expressions";
import { Fireworks } from "../world/Fireworks";
import { LabelLayout } from "../world/LabelLayout";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { MeScreen } from "../world/MeScreen";
import { addWorldTintBounds, worldTintOf } from "../world/worldTint";
import { Riding } from "../world/zoo/Riding";
import { WeatherSound } from "../world/WeatherSound";
import { createBusArrival } from "../bus/BusArrival";
import type { BusArrivalApi } from "../bus/busTypes";
import { SeaMap } from "./SeaMap";
import { duskWeight, SeaToneTint } from "./seaTone";
import { SEA_SCENE, type SeaFriend, type SeaHost, type SeaSceneData } from "./seaHost";
import { seaNeighborSeat, seaPickSeat, SEA_MULTI_SEAT } from "./seaSit";
import { BIG_SEAT_MAX, BIG_SEAT_TOAST, myBig } from "../camp/foodState";
import { SeaForage } from "./seaForage";
import { SeaView, type SeaViewSitter } from "./seaView";
import { avatarFrame } from "../assets/manifest";
import type { SeaInteractable } from "./seaTypes";
import { tideNow, tideNowLevel, tideWarnNow } from "./tideClock";

// 11/16 달물결 포구 장면 (캠핑장 CampScene과 같은 틀). 월드(마을)와 같은 채널 연결을 빌려 써요 (CampTrip이 net.divert로 소식을 넘겨줘요).
// 그리는 것: 바닷가 맵(SeaMap — 물때 따라 오르내리는 물가·물거품·젖은 모래·배·부표·갈매기) · 내 캐릭터 · 같은 바닷가 사람 · 분위기(한국 시간 색조·날씨) · 어둠과 빛.
// 하는 것: 걷기·뛰기·점프, 정류장 벤치에 앉기(서버 좌석 판정), 버스 타기, 말풍선·이모티콘·채팅·몸짓(같은 맵 사람끼리), 친구 옆으로 가기.
// 물때: 물이 덮은 갯벌에 서 있으면 헤엄치는 모습(마을 강·호수와 같은 swim 상태)이 돼요. 갯벌 땅은 늘 걸을 수 있는 칸이에요.
// 쉴거리·갯벌 캐기·시장·오두막·등대·낚싯배는 다음 차수 (자리는 protocol SEA_SPOTS·SEA_LOTS 등에 있어요).

const NO_MOVE: MoveInput = { ax: 0, ay: 0, run: false };
const EMPTY_SEATS = new Map<string, Sid>();
const MINIMAP_MS = 250;
const PEER_CHECK_MS = 5000;
const ACT_COOLDOWN_MS = 700;
const SAY_COOLDOWN_MS = 1000;
/** 바닷가 버스: 손님을 내린 뒤 이만큼 서 있다가 흐려지며 사라져요 (캠핑장과 같아요) */
const SEA_BUS_WAIT_MS = 3000;
/** 처음 도착 안내를 이 브라우저에서 봤는지 */
const WELCOMED_KEY = "tomb.sea.welcomed";
/** 버스 연출 아래에서 장면을 만드는 한 프레임 예산 (ms) */
const BUILD_BUDGET_MS = 4;
/** 버스가 서는 x (문 가운데) — 정류장 지붕 가운데 */
const BUS_DOOR_X = SEA_BUS_STOP.x;
/** 파도 소리: 물가에서 이만큼 멀어지면 가장 작게 (px) */
const WAVE_FAR = 520;

export class SeaScene extends Phaser.Scene {
  private host!: SeaHost;
  private data0!: SeaSceneData;
  private map!: SeaMap;
  private player!: Player;
  private playerGlow!: Phaser.GameObjects.Image;
  private rig!: CameraRig;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private seatHint!: SeatHint;
  private expr!: Expressions;
  private riding!: Riding;
  /** 11/16 갯바위 낚시 (마을 낚시를 바닷가로) */
  private forage!: SeaForage;
  /** 11/16 쉴거리 자리 (선베드 눕기·돗자리 바닥 앉기 — 의자 좌석 체계 밖, 서버 좌석은 같아요) */
  private rest: SeaRestSeat | null = null;
  /** 11/16 바다 보기 장면 (앉아 있을 때 「바다 보기」·V로 켜고 끄기, 일어나면 꺼져요) */
  private seaView: SeaView | null = null;
  private viewOn = false;
  private viewAt = 0;
  private viewHud = "";
  private meScreen!: MeScreen;
  /** 11/16 잠수할 때 물 튀김 (마을 Effects 그대로) */
  private fx!: Effects;
  /** 11/16 바닷가 색조 (저녁 무게를 매 프레임 넣어요) */
  private tone: SeaToneTint | null = null;
  private fireworks: Fireworks | null = null;
  private seatReq!: SeatRequester;
  private furnitureCollider: Phaser.Physics.Arcade.Collider | null = null;
  private readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly seats = new Map<string, Sid>();
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly labelLayout = new LabelLayout();
  private readonly unsubs: (() => void)[] = [];
  private readonly actors: { x: number; y: number }[] = [];
  private friends: { ch: number; bySid: Map<Sid, string> } = { ch: 0, bySid: new Map() };
  private parked = false;
  private building: Generator<void, void> | null = null;
  private begun = false;
  private cleaned = false;
  /** 버스 타고 내리는 동안·숨은 동안 (입력을 받지 않아요) */
  private locked = false;
  /** 사냥터·미니게임·집처럼 다른 장면이 위에 떠 있어요 */
  private covered = false;
  private bus: BusArrivalApi | null = null;
  private lastSide: -1 | 0 | 1 = 0;
  private nearSeatId: string | null = null;
  private minimapAt = 0;
  private peerCheckAt = 0;
  private actAt = -Infinity;
  private sayAt = -Infinity;
  /** 새로고침 복원 좌석: 첫 welcome에서 확인 */
  private resumeSeat: string | null = null;
  private readonly poseBuf: NetPose = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  private readonly hourOverride = parseAmbienceOverride(typeof window === "undefined" ? "" : window.location.search);
  private hourAt = 0;
  private hour = 12;
  /** 지금 물 높이 (0 간조 ~ 1 만조)·오르내림 — 매 프레임 */
  private tide = 1;
  private trend: -1 | 1 = -1;
  /** 「곧 물이 빠져요」를 띄운 물때 바퀴 (한 바퀴에 한 번) */
  private warnedCycle = -1;

  constructor() {
    super(SEA_SCENE);
  }

  init(data: SeaSceneData): void {
    this.data0 = data;
    this.host = data.host;
    this.parked = data.parked === true;
    this.begun = false;
    this.cleaned = false;
    this.locked = false;
    this.covered = false;
    this.remotes.clear();
    this.seats.clear();
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    // 버스 창밖 연출 아래에서 미리 만들 때(parked)는 프레임마다 조금씩 만들어요 (캠핑장과 같아요)
    const self = this as unknown as Record<string, unknown>;
    for (const k of ["map", "player", "rig", "atmos", "lighting", "expr", "meScreen", "riding", "seatHint", "forage"]) self[k] = undefined;
    const t = tideNowLevel();
    this.tide = t.level;
    this.trend = t.trend;
    this.warnedCycle = tideWarnNow() ? Math.floor(tideNow() / TIDE_PERIOD_MS) : -1;
    this.building = this.build();
    if (this.parked) {
      this.scene.setVisible(false);
      this.pumpBuild(BUILD_BUDGET_MS);
    } else this.finishBuild();
  }

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

  private finishBuild(): void {
    while (!this.pumpBuild(1000));
  }

  private *build(): Generator<void, void> {
    const t0 = performance.now();
    const h = this.host;
    const canvas = this.game.canvas;
    this.map = new SeaMap(this, h.atlas, h.reduced, true);
    yield* this.map.parts();
    const b = SEA_BOUNDS;
    this.physics.world.setBounds(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    const spawn = this.spawnPoint();
    this.player = new Player(this, h.atlas, spawn.x, spawn.y, h.color, h.name, isAvatarBody(h.body) ? h.body : "hood");
    this.player.titleSpeed = true;
    this.player.view.setLook([...h.look]);
    // 물때: 물이 덮은 갯벌이면 헤엄 (선착장·방파제 위는 마른 땅)
    this.player.water = (x, y) => seaWet(x, y, this.tide);
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    this.furnitureCollider = this.physics.add.collider(this.player.sprite, this.map.furnitureColliders);
    this.player.onLand = () => undefined;
    this.playerGlow = this.add.image(spawn.x, spawn.y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);
    this.seatReq = { sit: (id) => h.net.sit(id), stand: () => h.net.stand() };
    yield;

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y));
    this.rig.setMapSize(SEA_WIDTH, SEA_HEIGHT);
    yield;
    const tint = worldTintOf(this.game);
    if (tint) addWorldTintBounds(this, tint);
    // 11/16 바닷가 색조 (노을은 라벤더, 밤은 깊은 파랑 — sea/seaTone)
    this.tone = tint ? new SeaToneTint(tint) : null;
    this.atmos = new Atmosphere(this, h.reduced, window.location.search, { shaderTint: this.tone });
    this.atmos.setStaticLights(this.map.staticLights.map((l) => ({ ...l })));
    this.lighting = new Lighting(this);
    yield;
    this.seatHint = new SeatHint(this, h.atlas);
    this.fx = new Effects(this, h.reduced);
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
    this.riding = new Riding({ player: () => this.player, net: () => h.net, remotes: () => this.remotes, toast: (m) => this.toast(m) });
    this.seaView = new SeaView(this.game, h.reduced);
    this.seaView.onGullCall = (vol, pan) => this.host.sfx.gull(vol, pan);
    // 지도의 갈매기가 날아오르며 울면: 가까울수록 크게, 내 쪽 좌우로
    this.map.onGullCall = (x, y, scared) => {
      const d = Math.hypot(x - this.player.x, y - this.player.y);
      if (d > 420 || this.viewOn) return;
      this.host.sfx.gull((scared ? 0.9 : 0.6) * Math.max(0.15, 1 - d / 420), Math.max(-1, Math.min(1, (x - this.player.x) / 260)));
    };
    this.forage = new SeaForage({ scene: this, atlas: h.atlas, reduced: h.reduced, colliders: this.map.colliders, player: () => this.player, net: () => h.net, seats: () => this.seats, remotes: () => this.remotes, toast: (m) => this.toast(m), tide: () => this.tide });
    yield;

    this.applyArrivalPose();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (!this.parked) this.begin();
    this.debugMark("seaCreateMs", performance.now() - t0);
  }

  /** 버스 창밖 연출이 끝났어요 → 보이고, 입력·실시간 소식을 받아요 */
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
    bridge.emit("map:changed", { map: "sea" });
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
      const seat = r.pose === "sitChair" && r.seatId ? seaSeatById(r.seatId) : undefined;
      if (seat) return standPoint(seat);
      return this.map.standable(r.x, r.y) ? { x: r.x, y: r.y } : SEA_ARRIVE;
    }
    if (d.arrive === "friend" && d.friend) return this.besideFriend(d.friend);
    // 버스: 문 앞에 숨겨 두었다가 버스가 서면 내려서요
    return { x: BUS_DOOR_X, y: SEA_ROAD.y + 8 };
  }

  private besideFriend(f: SeaFriend): { x: number; y: number } {
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
      const seat = r.pose === "sitChair" && r.seatId ? seaSeatById(r.seatId) : undefined;
      if (seat) {
        pl.sit(seat, now, null);
        this.resumeSeat = seat.id;
      } else if (r.pose === "sitGround") pl.sit(null, now, null);
      pl.view.apply(pl.state, pl.dir, now);
    }
  }

  private busOptions() {
    return { doorX: BUS_DOOR_X, laneY: SEA_BUS_LANE_Y, fromLeft: SEA_BUS_FROM_LEFT, reduced: this.host.reduced, leave: "loop" as const, waitMs: SEA_BUS_WAIT_MS, loopDist: BUS_DOOR_X - SEA_ROAD_LOOP.x };
  }

  /** 버스가 바닷가 정류장에 서고 문이 열리면 내려서요 (내려서면 오른쪽 아래 방파제 끝 등대가 먼저 보여요) */
  private arriveByBus(): void {
    this.locked = true;
    this.bus = createBusArrival(this, this.busOptions());
    this.bus.arrive(() => {
      if (this.cleaned) return;
      const pl = this.player;
      pl.warp(SEA_ARRIVE.x, SEA_ARRIVE.y, this.time.now, null);
      this.host.net.warp(SEA_ARRIVE.x, SEA_ARRIVE.y);
      pl.dir = DIR.down;
      pl.view.apply(pl.state, DIR.down, this.time.now);
      const done = () => {
        this.locked = false;
        this.departBus();
      };
      if (this.host.reduced) {
        pl.view.fade = 1;
        done();
      } else this.tweens.add({ targets: pl.view, fade: 1, duration: 380, ease: "Sine.easeOut", onComplete: done });
    });
  }

  /** 처음 도착하면 한 번 안내 (이 브라우저에서 한 번) */
  private maybeWelcome(): void {
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
      // 저장소를 못 쓰면 다음에도 안내해요
    }
    this.time.delayedCall(this.data0.arrive === "bus" ? 2600 : 900, () => {
      if (this.cleaned) return;
      this.toast("달물결 포구예요. 물때는 화면 위에 떠 있어요. 물이 빠지면 갯벌을 걸어 봐요.");
    });
  }

  // ── 실시간 (같은 채널, 바닷가 사람만) ──

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
        if (this.rest?.id === seatId) {
          this.leaveRest(this.time.now);
          this.toast("누가 먼저 앉았어요");
          return;
        }
        if (this.player.seat?.id === seatId) this.player.seatDenied(seatId, this.time.now);
      },
      onEmote: () => undefined,
      onGraveEvent: () => undefined,
      onReset: () => {
        this.clearRemotes();
        this.seats.clear();
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
      // 채팅 기록은 채널 하나 (마을·캠핑장·바닷가 같이) — 맵을 오가도 비우지 않게 마을과 같은 채널 번호로
      onChatLog: (lines) => bridge.emit("chat:log", { lines, ...(this.host.net.channel !== null ? { ch: this.host.net.channel } : {}) }),
      onMood: (sid, mood) => this.expr.onRemoteMood(sid, mood),
      onRide: (sid, on) => this.riding.onRide(sid, on),
      onRod: (sid, on) => this.forage.f.onRod(sid, on),
      onAway: (sid, on) => this.remotes.get(sid)?.setAway(on, performance.now()),
      onGoblin: () => undefined,
      onGoblinGone: () => undefined,
      onGoblinCaught: () => undefined,
      onBbq: () => undefined,
      onMapped: (map, peers, seats) => {
        if (map !== "sea") return this.host.bail();
        this.clearRemotes();
        this.syncSeats(seats);
        for (const p of peers) this.addRemote(p);
        // 낚시 자리 점유표를 바닷가 것으로 (마을 입장 정보와 같은 모양으로 넘겨요)
        const net = this.host.net;
        this.forage.f.onWelcome({ t: "welcome", sid: net.mySid ?? 0, channel: net.channel ?? 0, cap: net.cap, peers, seats, resumed: false, spots: true });
        this.reclaimSeat();
      },
    };
  }

  private onWelcome(m: WelcomeMsg): void {
    // 서버가 바닷가로 받지 않았어요 (허락 없음·옛 서버) → 마을로
    if (m.m !== "sea") {
      this.host.bail();
      this.host.net.base.onWelcome(m);
      return;
    }
    this.clearRemotes();
    this.syncSeats(m.seats);
    for (const p of m.peers) this.addRemote(p);
    this.riding.onWelcome();
    this.forage.f.onWelcome(m);
    this.reclaimSeat();
  }

  /** 앉아 있는 채로 (다시) 붙었어요: 좌석을 다시 확인해요 */
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
    r.map = "sea"; // 좌석 id를 바닷가 자리로 풀어요 (앉은 사람을 벤치 앞에 고정)
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

  // ── bridge (UI → 바닷가) ──

  private bindBridge(): void {
    const on = this.unsubs;
    on.push(bridge.on("input:say", ({ id }) => !this.covered && this.doSay(id)));
    on.push(bridge.on("input:emo", ({ id }) => !this.covered && !this.locked && this.expr.emo(id, this.time.now)));
    on.push(bridge.on("input:chat", ({ text }) => !this.covered && this.expr.chat(text, this.time.now)));
    on.push(bridge.on("input:mood", ({ mood }) => this.expr.setMood(mood)));
    on.push(bridge.on("input:ride", () => !this.locked && this.riding.toggle()));
    // 11/16 바다 보기 켜기·끄기 (「바다 보기」 버튼·V)
    on.push(bridge.on("sea:view", () => this.toggleView()));
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
        if (map === "sea") this.goToFriend(sid, name, x, y);
        // 캠핑장 친구는 마을을 거쳐 가요 (버스가 마을에만 서요)
        else if (map === "camp") bridge.emit("friend:notice", { message: "캠핑장은 마을에서 버스를 타고 가요. 먼저 마을행 버스를 타요." });
        else this.host.goVillage({ sid, name, x, y });
      }),
    );
    // 바닷가에서 채널을 옮기면 새 채널 바닷가 정류장에서 (캠핑장과 같은 규칙)
    let channelBack: { x: number; y: number } | null = null;
    on.push(
      bridge.on("channel:leave", () => {
        const pl = this.player;
        channelBack = { x: pl.x, y: pl.y };
        if (pl.sitting) pl.stand(this.time.now, this.seatReq);
        pl.warp(SEA_ARRIVE.x, SEA_ARRIVE.y, this.time.now, null);
        this.rig.recenter();
      }),
      bridge.on("channel:refused", ({ back }) => {
        const b = channelBack;
        channelBack = null;
        if (!back || !b) return;
        this.player.warp(b.x, b.y, this.time.now, null);
        this.rig.recenter();
      }),
    );
    on.push(bridge.on("peers:ask", () => bridge.emit("peers:list", { names: [...this.remotes.values()].map((r) => r.name) })));
    on.push(
      bridge.on("firework:fire", ({ item }) => {
        this.fw().launch(item, this.player.x, this.player.y, this.rig.frameView(this.view), true, this.host.name);
      }),
    );
    on.push(
      bridge.on("scene:changed", ({ scene }) => {
        this.covered = scene !== "world";
        if (this.covered) this.leaveView();
        this.scene.setVisible(!this.covered && !this.parked);
        this.rig.enabled = !this.covered;
        if (!this.covered) this.host.hub.setHandler((a) => this.onAction(a));
      }),
    );
  }

  private fw(): Fireworks {
    this.fireworks ??= new Fireworks(this, this.host.reduced, this.host.sfx);
    return this.fireworks;
  }

  // ── 입력 ──

  private onAction(a: KeyAction): void {
    const h = this.host;
    if (h.hub.isBlocked || this.cleaned || this.locked || this.covered || this.parked) return;
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
      if (moving || pl.inWater) return;
      if (this.rest) this.leaveRest(now);
      else if (pl.sitting) pl.stand(now, this.seatReq);
      else {
        const seat = seaPickSeat(pl.x, pl.y, occupied, mySid);
        const r = this.pickRest(pl.x, pl.y);
        if (r && (!seat || Math.hypot(r.x - pl.x, r.y - pl.y) < Math.hypot(seat.x - pl.x, seat.y - pl.y))) this.useRest(r, now);
        else this.sitOn(seat, now);
      }
      return;
    }
    if (a !== "interact") return;
    // 11/16 물속이면 E = 잠수·떠오르기 (마을 강·호수와 같은 규칙 — 물이 덮은 갯벌·먼바다 어디서든)
    if (pl.state === "swim" || pl.state === "dive") {
      const diving = pl.state === "swim";
      pl.toggleDive(now);
      if (diving) this.fx.splash(pl.x, pl.y);
      return;
    }
    if (this.rest) {
      this.leaveRest(now);
      return;
    }
    if (pl.sitting) {
      pl.stand(now, this.seatReq);
      return;
    }
    const seat = moving ? null : seaPickSeat(pl.x, pl.y, occupied, mySid);
    // 11/16 쉴거리 자리 (선베드·돗자리)가 좌석보다 가까우면 그것부터
    const rest = moving ? null : this.pickRest(pl.x, pl.y);
    if (rest && (!seat || Math.hypot(rest.x - pl.x, rest.y - pl.y) < Math.hypot(seat.x - pl.x, seat.y - pl.y))) {
      const ob = this.nearestObject(pl.x, pl.y);
      if (!ob || Math.hypot(ob.x - pl.x, ob.y - pl.y) > Math.hypot(rest.x - pl.x, rest.y - pl.y)) {
        this.useRest(rest, now);
        return;
      }
    }
    const obj = this.nearestObject(pl.x, pl.y);
    const sd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    const od = obj ? Math.hypot(obj.x - pl.x, obj.y - pl.y) : Infinity;
    // 11/16 갯바위 낚시 자리가 더 가까우면 그것부터 (캠핑장과 같아요)
    const fo = this.forage.nearest(pl.x, pl.y);
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(sd, od)) {
      this.forage.f.use(fo);
      return;
    }
    if (obj && od <= sd) this.useObject(obj);
    else if (seat) this.sitOn(seat, now);
  }

  /** 11/16 가까운 빈 쉴거리 자리 (반지름 18) */
  private pickRest(x: number, y: number): SeaRestSeat | null {
    const net = this.host.net;
    const mine = net.online ? net.mySid : null;
    let best: SeaRestSeat | null = null;
    let bd = 18;
    for (const r of SEA_REST_SEATS) {
      const d = Math.hypot(r.x - x, r.y - y);
      if (d >= bd) continue;
      const owner = net.online ? this.seats.get(r.id) : undefined;
      if (owner !== undefined && owner !== mine) continue;
      best = r;
      bd = d;
    }
    return best;
  }

  /** 11/16 쉴거리 자리에: 선베드는 누워요(lie), 돗자리는 바닥에 앉아요 (서버 좌석을 잡아요) */
  private useRest(r: SeaRestSeat, now: number): void {
    const pl = this.player;
    if (r.kind === "lounger") pl.attach("lie", r.x, r.y, r.y + 2, now, this.seatReq, r.id);
    else {
      pl.warp(r.x, r.y, now, this.seatReq);
      pl.dir = r.facing;
      pl.sit(null, now, null);
    }
    this.rest = r;
    const net = this.host.net;
    if (net.online) net.sit(r.id);
  }

  /** 쉴거리 자리에서 일어나기 (서버 좌석은 다음 MOVE가 놓아요) */
  private leaveRest(now: number): void {
    const r = this.rest;
    if (!r) return;
    this.rest = null;
    const pl = this.player;
    if (r.kind === "lounger") pl.leaveAnchor(now);
    else if (pl.sitting) pl.stand(now, null);
  }

  /** 지금 앉은 자리에서 볼 수 있는 바다 장면 (없으면 null) */
  private viewKindNow(): { kind: SeaViewKind; group: string; mat: number; variant: number } | null {
    const pl = this.player;
    const id = this.rest ? this.rest.id : pl.state === "sitChair" && pl.seat ? pl.seat.id : null;
    if (!id) return null;
    const kind = seaViewOfSeat(id);
    if (!kind) return null;
    const group = seaSeatGroup(id);
    // 돗자리 색 (SeaMap과 같게): 파라솔 1번 = 분홍 돗자리·산호 갓, 2번 = 하늘 돗자리·노랑 갓, 돗자리 n번 = n % 3
    const n = Number(group.slice(2)) - 1;
    const mat = kind === "parasol" ? (n === 0 ? 2 : 0) : kind === "mat" ? n % 3 : 0;
    return { kind, group, mat, variant: kind === "parasol" ? n : mat };
  }

  /** 11/16 바다 보기: 앉아 있는 동안 버튼·V를 띄우고, 켜져 있으면 장면을 그려요 (덮는 동안 월드 카메라는 쉬어요) */
  private updateSeaView(now: number, dt: number, dusk: number): void {
    const v = this.locked || this.covered ? null : this.viewKindNow();
    if (!v && this.viewOn) this.leaveView();
    const hud = v ? (this.viewOn ? "on" : "off") : "";
    if (hud !== this.viewHud) {
      this.viewHud = hud;
      bridge.emit("sea:hud", v ? { on: this.viewOn } : null);
    }
    const sv = this.seaView;
    if (!sv) return;
    if (this.viewOn && v) {
      const fade = this.host.reduced ? 1 : Math.min(1, (now - this.viewAt) / 600);
      sv.frame({ now, dt, levels: this.atmos.levels, hour: this.hour, dusk, tide: this.tide, fade, sitters: this.viewSitters(v.group) });
      this.cameras.main.setVisible(!(sv.opaque && fade >= 1));
    } else sv.idle(dt);
  }

  /**
   * 11/16 갈매기 울음 (지도 보기): 6~20초마다 가끔, 가끔 두세 번 이어서. 밤엔 거의 없고 비 오면 드물게.
   * 날아오르는 갈매기는 SeaMap.onGullCall이 따로 (가까우면 크게)
   */
  private gullAt = 0;
  private gullAmbience(now: number, far: number): void {
    if (this.gullAt === 0) this.gullAt = now + 4000 + Math.random() * 8000;
    if (now < this.gullAt) return;
    const L = this.atmos.levels;
    const night = L.darkness > 0.6;
    const quiet = night ? 0.1 : L.rain > 0.3 ? 0.45 : 1;
    this.gullAt = now + (6000 + Math.random() * 14000) / quiet;
    if (night && Math.random() < 0.7) return;
    // 물가에서 멀면 조금 작게 (마을 쪽 언덕에서도 들려요)
    const vol = (0.35 + Math.random() * 0.35) * (0.5 + 0.5 * Math.max(0, 1 - far / 400));
    const n = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 2) : 1;
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < n; i++) this.time.delayedCall(i * (260 + Math.random() * 380), () => !this.cleaned && this.host.sfx.gull(vol * (1 - i * 0.12), pan));
  }

  /** 「바다 보기」 켜기·끄기 (React 버튼·V) */
  private toggleView(): void {
    if (this.cleaned || this.covered || this.locked) return;
    const v = this.viewKindNow();
    if (!v || this.viewOn) return this.leaveView();
    this.viewOn = true;
    this.viewAt = this.time.now;
    this.seaView?.begin(v.kind, v.variant, v.mat);
    bridge.emit("view:mode", { mode: "sea" });
  }

  private leaveView(): void {
    if (!this.viewOn) return;
    this.viewOn = false;
    this.seaView?.end(this.host.reduced ? 0 : 1);
    this.cameras.main.setVisible(true);
    if (bridge.last("view:mode")?.mode === "sea") bridge.emit("view:mode", { mode: "normal" });
  }

  /** 바다 보기: 같은 자리 묶음에 앉은 사람 (나 포함) — 뒷모습 */
  private viewSitters(group: string): SeaViewSitter[] {
    const ids = [...SEA_SEATS.filter((s) => s.furnitureId === group).map((s) => s.id), ...SEA_REST_SEATS.filter((r) => r.group === group).map((r) => r.id)];
    const out: SeaViewSitter[] = [];
    const push = (seatId: string | null, key: string, state: "sitChair" | "sitGround") => {
      const slot = seatId ? ids.indexOf(seatId) : -1;
      if (slot >= 0) out.push({ key, frame: avatarFrame(state, DIR.up), slot: slot % 2 === 0 && ids.length === 4 ? slot : slot, of: ids.length });
    };
    const pl = this.player;
    const mine = this.rest ? this.rest.id : pl.seat?.id ?? null;
    push(mine, pl.view.sprite.texture.key, pl.state === "sitChair" ? "sitChair" : "sitGround");
    for (const r of this.remotes.values()) if (r.seatId && r.visible && !r.away) push(r.seatId, r.view.sprite.texture.key, r.stateId === STATE.sitChair ? "sitChair" : "sitGround");
    return out;
  }

  /** 앉기 (null = 땅바닥). 11/16 2배 넘게 커졌으면 정류장 지붕 밑 벤치(pB)에는 못 앉아요 — 지붕이 얼굴을 가려요 (캠핑장 정류장과 같은 규칙) */
  private sitOn(seat: Seat | null, now: number): void {
    if (seat && seat.id.startsWith("pB") && myBig() > BIG_SEAT_MAX) {
      this.toast(BIG_SEAT_TOAST);
      return;
    }
    this.player.sit(seat, now, this.seatReq);
  }

  private nearestObject(x: number, y: number): SeaInteractable | null {
    let best: SeaInteractable | null = null;
    let bd = Infinity;
    for (const o of this.map.interactables) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d <= o.r && d < bd) {
        best = o;
        bd = d;
      }
    }
    return best;
  }

  /** E로 쓰는 것. 지금은 버스만 움직이고, 나머지는 곧 열린다는 안내만 (다음 차수) */
  private useObject(o: SeaInteractable): void {
    const pl = this.player;
    const now = this.time.now;
    switch (o.kind) {
      case "bus":
        pl.faceTo(o.x, o.y - 10, now);
        this.boardBus();
        break;
      case "sign":
        this.toast(`「마을행」이라고 적혀 있어요. 버스는 ${keyJosa("E", "를")} 누르면 와요.`);
        break;
      case "lot":
        this.toast(`${o.lot}번 오두막 터예요. 분양은 포구 부동산에서 곧 시작해요.`);
        break;
      case "realty":
        this.toast("포구 부동산은 오두막 분양 준비로 바빠요. 곧 문을 열어요.");
        break;
      case "market":
        this.toast("포구 시장은 장 설 준비 중이에요. 갯벌에서 캔 것을 곧 여기서 팔 수 있어요.");
        break;
      case "kiosk":
        this.toast("매점 셔터가 내려가 있어요. 곧 문을 열어요.");
        break;
      case "lighthouse":
        this.toast("등대 문이 잠겨 있어요. 등대지기가 곧 돌아와요.");
        break;
      case "boat":
        this.toast("낚싯배가 묶여 있어요. 곧 타고 나갈 수 있어요.");
        break;
    }
  }

  private onTap(wx: number, wy: number): void {
    const h = this.host;
    if (h.hub.isBlocked || this.cleaned || this.locked || this.covered || this.parked) return;
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
    // 오브젝트를 탭: 가까이 서 있으면 E와 같아요
    const pl = this.player;
    let best: SeaInteractable | null = null;
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

  // ── 버스 (바닷가 → 마을) ──

  private boardBus(): void {
    if (this.locked) return;
    const net = this.host.net;
    if (!net.online) {
      this.toast("연결된 뒤에 버스를 탈 수 있어요.");
      return;
    }
    this.locked = true;
    const pl = this.player;
    if (pl.sitting) pl.stand(this.time.now, this.seatReq);
    this.riding.dismount(false);
    // 11/16 내려 준 버스가 아직 흐려지는 중이면 치워요 (그 버스가 사라질 때 새 버스까지 지워 버스가 오지 않던 문제)
    this.dropBus();
    this.bus = createBusArrival(this, this.busOptions());
    this.bus.arrive(() => {
      if (this.cleaned) return;
      const go = () => {
        this.departBus();
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

  /** 11/16 지금 버스를 떠나보내요. 사라지면 그 버스만 치워요 (그 사이 새로 부른 버스는 건드리지 않게) */
  private departBus(): void {
    const bus = this.bus;
    bus?.depart(() => {
      bus.destroy();
      if (this.bus === bus) this.bus = null;
    });
  }

  /** 같은 채널 바닷가의 친구 옆으로 (캠핑장 goToFriend와 같은 규칙) */
  private goToFriend(sid: Sid, name: string, fx: number, fy: number): void {
    const net = this.host.net;
    if (this.cleaned || !net.online || this.locked) return;
    const notice = (message: string) => bridge.emit("friend:notice", { message });
    const r = this.remotes.get(sid);
    const live = r && r.name === name ? r : null;
    if (live?.away) return notice(`${name}님은 지금 실내에 있어요.`);
    const at = live ? { x: live.x, y: live.y } : { x: fx, y: fy };
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
  resumePose(): { x: number; y: number; seatId: string | null; pose: ResumeState["pose"]; dir: number; where: "sea" } | null {
    if (this.cleaned || !this.player) return null;
    const pl = this.player;
    const p = pl.netPose(this.poseBuf);
    const pose = pl.state === "sitChair" && pl.seat ? "sitChair" : pl.state === "sitGround" ? "sitGround" : "idle";
    return { x: Math.round(p.x), y: Math.round(p.y), seatId: pose === "sitChair" ? (pl.seat?.id ?? null) : null, pose, dir: pl.dir, where: "sea" };
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
    this.updateTide();

    if (this.covered) {
      pl.update(NO_MOVE, now, this.seatReq);
      this.host.sfx.seaWaves(0);
      net.tick(pnow);
      return;
    }
    this.host.hub.read(this.move);
    if (this.host.hub.isBlocked || this.locked) this.move.ax = this.move.ay = 0;
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
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    this.expr.update(now);
    this.meScreen.update(pl.x, pl.y);
    pl.view.sync(now, s);
    const L = this.atmos.levels;
    this.actors.length = 0;
    this.actors.push({ x: pl.x, y: pl.y });
    for (const r of this.remotes.values()) if (r.visible && !r.away) this.actors.push({ x: r.x, y: r.y });
    const dusk = duskWeight(this.hour);
    if (this.tone) this.tone.dusk = dusk;
    this.map.update(now, dt, view, { hour: this.hour, darkness: L.darkness, rain: L.rain, fog: L.fog, tide: this.tide, trend: this.trend, actors: this.actors, dusk });
    this.riding.update();
    // 11/16 쉴거리 자리: 자세가 풀리면(움직임·일어남) 놓아요
    if (this.rest && (this.rest.kind === "lounger" ? pl.state !== "lie" : pl.state !== "sitGround" || Math.hypot(pl.x - this.rest.x, pl.y - this.rest.y) > 3)) this.rest = null;
    this.updateSeaView(now, dt, dusk);
    this.forage.f.update(dt, view, s);
    for (const r of this.remotes.values()) r.update(pnow, view, s);
    this.declutterLabels(now, pnow);
    this.updateSeatHint(now, s);
    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
    // 물소리: 헤엄치면 물장구, 늘 파도 소리 (물가에 가까울수록 크게)
    const wet = pl.state === "swim" || pl.state === "dive" ? pl.state : null;
    this.host.sfx.water(wet, wet !== null && Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER, pnow);
    const far = Math.max(0, tideLineY(this.tide) - pl.y);
    // 바다 보기 중엔 파도 소리를 크게 · 갈매기 울음 (바다 보기 장면은 지나가는 갈매기가 울어요)
    this.host.sfx.seaWaves(this.viewOn ? 1 : 0.35 + 0.65 * Math.max(0, 1 - far / WAVE_FAR));
    if (!this.viewOn) this.gullAmbience(now, far);
    this.fireworks?.update(now, dt, view);
    this.updateLighting(view);
    net.tick(pnow);
  }

  /** 물 높이 (시험용 물때 덮어쓰기 반영) · 갯벌이 열리기 5분 전 안내 (이 맵에서만, 한 바퀴에 한 번) */
  private updateTide(): void {
    const t = tideNowLevel();
    this.tide = t.level;
    this.trend = t.trend;
    if (!tideWarnNow()) return;
    const cycle = Math.floor(tideNow() / TIDE_PERIOD_MS);
    if (cycle === this.warnedCycle) return;
    this.warnedCycle = cycle;
    this.toast("곧 물이 빠져요");
  }

  private benchInput(now: number): MoveInput {
    const pl = this.player;
    const seat = pl.state === "sitChair" ? pl.seat : null;
    if (!seat || !SEA_MULTI_SEAT.has(seat.furnitureId)) {
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
      const n = seaNeighborSeat(seat, side, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null);
      if (n) pl.moveSeat(n, now, this.seatReq);
    }
    this.lastSide = side;
    return NO_MOVE;
  }

  private updateSeatHint(now: number, labelScale: number): void {
    const pl = this.player;
    const net = this.host.net;
    const seat: Seat | null = pl.sitting || this.locked ? null : seaPickSeat(pl.x, pl.y, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null);
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
    // 11/16 갯바위 낚시 자리 안내 ("E 낚시하기")
    const fo = !pl.sitting && !this.locked ? this.forage.nearest(pl.x, pl.y) : null;
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(objSd, objOd))
      other = { x: fo.x, y: fo.y + 2, text: this.forage.isDry(fo) ? "물이 빠져서 지금은 낚시할 수 없어요" : `${this.seatHint.prefix}${fo.label}` };
    // 11/16 물속: 잠수·떠오르기 안내 (마을과 같은 글)
    if (pl.state === "swim" || pl.state === "dive") other = { x: pl.x, y: pl.y + 2, text: `${this.seatHint.prefix}${pl.state === "swim" ? "잠수" : "떠오르기"}` };
    const bench = pl.state === "sitChair" && pl.seat && SEA_MULTI_SEAT.has(pl.seat.furnitureId);
    const keys = this.seatHint.prefix === "E ";
    const standText = bench ? (keys ? "←→ 옆자리 · ↑↓ 일어나기 · T 벤치 상태" : "좌우로 옆자리 · 위아래로 일어나기") : pl.state === "sitChair" && keys ? "이동하면 일어나요 · T 상태 고르기" : null;
    this.seatHint.update(other ? null : seat, pl, sittingFor, false, labelScale, other, standText);
  }

  private declutterLabels(now: number, pnow: number): void {
    const lay = this.labelLayout;
    lay.begin();
    lay.add(this.player.view, true, now);
    for (const r of this.remotes.values()) lay.add(r.view, false, pnow);
    lay.finish(1 / this.cameras.main.zoom);
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
    // 바닷가는 달빛이 물에 비쳐 마을보다 조금 밝게 (캠핑장과 비슷하게)
    lit.begin(view, L.darkness * 0.8 * (1 - 0.6 * (this.fireworks?.lift ?? 0)), L.shade);
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

  /** 미니맵: 내 위치와 같은 바닷가 사람 (map 표시로 바닷가 바탕을 그려요) */
  private emitMinimap(): void {
    const others: number[] = [];
    const friends: number[] = [];
    for (const r of this.remotes.values()) if (!r.away) (r.view.friend ? friends : others).push(Math.round(r.x), Math.round(r.y));
    bridge.emit("minimap:dots", { me: { x: Math.round(this.player.x), y: Math.round(this.player.y) }, others, friends, map: "sea" });
  }

  private onResize(): void {
    this.rig?.applyBounds();
    this.atmos?.resize();
    this.lighting?.resize();
  }

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.building = null;
    for (const off of this.unsubs.splice(0)) off();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.dropBus();
    WeatherSound.of(this).setRoof(false);
    this.host.sfx.seaWaves(0);
    this.host.sfx.water(null, false, performance.now());
    this.clearRemotes();
    this.expr?.destroy();
    this.leaveView();
    this.seaView?.destroy();
    this.seaView = null;
    bridge.emit("sea:hud", null);
    this.forage?.f.destroy();
    this.meScreen?.destroy();
    this.rig?.destroy();
    this.atmos?.destroy();
    this.lighting?.destroy();
    this.fireworks = null;
    this.player?.destroy();
    this.map?.destroy();
    // 소식은 월드로 돌려줘요 (CampTrip이 먼저 했어도 한 번 더)
    if (this.begun) this.host.net.divert(null);
    bridge.emit("map:changed", { map: "village" });
  }
}

import * as Phaser from "phaser";
import {
  CAMP_ARRIVE,
  CAMP_CAMPFIRES,
  CAMP_PLUNGE,
  campCampfireOfSeat,
  campFallsViewSeat,
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
  campRowboatDismount,
  dexBadgeCats,
  campWet,
  inCampPlunge,
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
  fireworkShowMs,
  CAMP_HAMMOCK_LIFT,
  campHammockById,
} from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import type { ResumeState } from "@/lib/resume";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH, SIT_IDLE_MS } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import { HAMMOCK_FRONT, RemoteAvatar } from "../entities/RemoteAvatar";
import { peerList } from "../logic/peerList";
import { peerAt } from "../entities/peerHit";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf } from "../entities/SpeechBubble";
import type { KeyAction } from "../input/Keyboard";
import { keyJosa } from "../input/keyHint";
import { besideFriend, FRIEND_ARRIVED } from "../logic/friendSpot";
import { playTeleportFx } from "../fx/teleportFx";
import { STAFF_TP_ARRIVED, STAFF_TP_INSIDE_MSG, WELCOME_POS_SNAP_PX } from "@tomb/protocol";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { sideIntent, standPoint } from "../logic/sit";
import { inReach, reachDist } from "../logic/reach";
import type { NetCallbacks } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { avatarColorSpec } from "../sprites/avatar";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Expressions } from "../world/Expressions";
import { Fireworks } from "../world/Fireworks";
import { LabelLayout } from "../world/LabelLayout";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { MeScreen } from "../world/MeScreen";
import { addWorldTintBounds, worldTintOf } from "../world/worldTint";
import { Riding } from "../world/zoo/Riding";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, nearestCampfire } from "../world/campfireMath";
import { FallsView } from "./fallsView";
import { Effects } from "../world/Effects";
import { campCurrent } from "./campWater";
import { WeatherSound } from "../world/WeatherSound";
import { SnowFight } from "../world/SnowFight";
import { SnowGrid, type SnowNpc } from "../world/snowNpc";
import { SnowOccluders } from "../world/snowMask";
import { createBusArrival } from "../bus/BusArrival";
import type { BusArrivalApi } from "../bus/busTypes";
import { CampMap } from "./CampMap";
import { FoodFx } from "./foodFx";
import { BIG_RIDE_TOAST, BIG_SEAT_TOAST, bigSeatBlocked, foodOfPeer, myBig, RIDING_EAT_TOAST } from "./foodState";
import { friendRoute, nextAfterVillage } from "@/lib/friendRoute";
import { CAMP_BBQ } from "./campLayout";
import { CampForage } from "./campForage";
import { BungeoCartView } from "../world/BungeoCartView";
import { CampLife } from "./campLife";
import { CampSnowmen } from "./CampSnowmen";
import { CAMP_SCENE, type CampFriend, type CampHost, type CampSceneData } from "./campHost";
import { campHousingHost, type CampHousingHost } from "./campHousingHost";
import { CampHousing } from "./campHousing";
import { campSaleKindOf } from "./campSaleApi";
import { setDoorHint } from "../logic/doorHint";
import { CampRowboats } from "./CampRowboats";
import { CampRafts } from "./CampRafts";
import { CampPlay } from "./CampPlay";
import { CampFootbath } from "./campFootbath";
import { RAFT_LADDERS, type RaftLadder } from "./campLayout";
import { campWalkGrid } from "./campLayout";
import { AwayRoute, gridOfCells } from "../world/AwayRoute";
import { campGoblin } from "./campGoblin";
import { campLines, campNpcName, CAMP_WELCOME } from "./campTalk";
import { campFootSeatReachable, campLadderAt, campNeighborSeat, campPickSeat, campZoneSeat, CAMP_MULTI_SEAT, isCampLadderSeat, isCampZoneSeat } from "./campSit";
import { publishRide, standForGate } from "@/lib/rideGate";
import type { CampInteractable } from "./campTypes";
import { qaUrlAllowed } from "@/lib/qaUrl";
import { isSnowy, parseConceptOverride, type MapConcept } from "@/lib/mapConcept";
import { startMapConceptSync } from "@/lib/mapConceptClient";
import { campConceptNow, type CampActor } from "./CampConceptDecor";

// 11/15 언젠가 캠핑장 장면. 월드(마을)와 같은 채널 연결을 빌려 쓴다 (CampTrip이 net.divert로 소식을 넘겨준다).
// 그리는 것: 캠핑장 맵(CampMap) · 내 캐릭터 · 같은 캠핑장에 있는 사람 · 분위기(한국 시간 색조·날씨) · 어둠과 빛.
// 하는 것: 걷기·뛰기·점프, 의자·벤치·통나무·바위·캠핑카 문간·전망대 벤치에 앉기(서버 좌석 판정), NPC 말 걸기, 버스 타기,
// 말풍선·이모티콘·채팅·몸짓(같은 맵 사람끼리), 친구 옆으로 가기. 텐트·요리·매점·의뢰는 다음 차수.

const NO_MOVE: MoveInput = { ax: 0, ay: 0, run: false };
/** 11/26 집 문·집터 (닿으면 앉을 자리보다 먼저) */
const isDoorItem = (o: CampInteractable): boolean => o.kind === "house" || o.kind === "lot";
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
  /** 11/23 골목 붕어빵 수레 (그 회차 자리가 이 맵일 때만 — world/BungeoCartView) */
  private bungeo: BungeoCartView | null = null;
  /** 11/26 황금 고블린 (캠핑장에 나오면 그리기·잡기 — game/camp/campGoblin, 장면이 꺼지면 스스로 치운다) */
  private goblin: ReturnType<typeof campGoblin> | null = null;
  /** 11/26 윤슬 낚시터 2인 나룻배 (game/camp/CampRowboats) */
  private rowboats: CampRowboats | null = null;
  /** 11/27 좌대 입장권 (매표소 직원·마루 막이·이름표·연장 칸) */
  private rafts: CampRafts | null = null;
  /** 11/26 오늘 미션 「팔기」 길 안내 → 낚시터 사장님 (game/world/AwayRoute) */
  private awayRoute: AwayRoute | null = null;
  /** 11/26 놀이터 대형 트램펄린·워터 슬라이드(눈썰매) (game/camp/CampPlay) */
  private play: CampPlay | null = null;
  /** 11/26 족욕탕 발 담그기 (game/camp/campFootbath) */
  private footbath: CampFootbath | null = null;
  /** 11/26 캠핑장 집 (카라반·펜션·촌캉스 겉모습·문·앞마당 자리 — game/camp/campHousing) */
  private homes: CampHousing | null = null;
  /** 11/16 캠핑장 주민 (돌아다니는 캠퍼 유령들 — game/camp/campLife) */
  private life: CampLife | null = null;
  /** 11/17 눈사람 만들기 (겨울·크리스마스 판 — game/camp/CampSnowmen) */
  private snow: CampSnowmen | null = null;
  /** 11/18 눈싸움 (겨울·크리스마스 판 — game/world/SnowFight) */
  private fight: SnowFight | null = null;
  /** 11/18 눈뭉치가 박히는 칸 (맵 충돌 — 계곡 물은 빼고 처음 쓸 때 굽는다) · 맞는 NPC 묶음 */
  private snowGrid: SnowGrid | null = null;
  /** 눈싸움 막힌 칸 (맵 충돌 — 계곡 물은 뺀다) */
  private campSolid(x: number, y: number): boolean {
    return (this.snowGrid ??= new SnowGrid(CAMP_WIDTH, CAMP_HEIGHT).fillGroups([this.map.colliders, this.map.furnitureColliders], (cx, cy) => campWet(cx, cy))).blocked(x, y);
  }
  private snowNpcs: { life: readonly SnowNpc[]; all: SnowNpc[] } | null = null;
  /** 11/26 폭포 멍 (폭포 다리 의자 — 시점 바꾸기) */
  private fallsView: FallsView | null = null;
  /** 11/26 폭포 밑 물살 안내 (한 번 들어갈 때마다 한 번) */
  private plungeWarned = false;
  private meScreen!: MeScreen;
  private fireworks: Fireworks | null = null;
  /** 11/15 큰 모닥불 불멍 (마을 모닥불과 같은 연출 — game/world/Campfire.ts) */
  private campfire!: CampfireView;
  private seatReq!: SeatRequester;
  private readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly seats = new Map<string, Sid>();
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly labelLayout = new LabelLayout();
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
    for (const k of ["map", "player", "rig", "fallsView", "atmos", "lighting", "expr", "campfire", "forage", "meScreen"]) self[k] = undefined;
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
    // 11/17 맵 컨셉 (겨울·크리스마스): 처음부터 그 판 그림으로 만든다 (바뀌면 bindBridge가 바로 바꿔 끼운다)
    const concept = campConceptNow();
    this.map = new CampMap(this, h.atlas, h.reduced, true, concept);
    yield* this.map.parts();
    const me: CampActor = { key: {}, x: 0, y: 0, dir: DIR.down };
    this.map.setActors(() => this.breathers(me));
    this.physics.world.setBounds(CAMP_BOUNDS.minX, CAMP_BOUNDS.minY, CAMP_BOUNDS.maxX - CAMP_BOUNDS.minX, CAMP_BOUNDS.maxY - CAMP_BOUNDS.minY);

    const spawn = this.spawnPoint();
    this.player = new Player(this, h.atlas, spawn.x, spawn.y, h.color, h.name, isAvatarBody(h.body) ? h.body : "hood");
    this.player.titleSpeed = true;
    // 11/26 소·계곡·저수지는 걸어 들어가면 헤엄쳐요 (마을 강·호수와 같은 규칙) — 계곡은 아래로 흐르고 폭포 밑은 바깥으로 밀어내요
    this.player.water = (x, y) => campWet(x, y);
    this.player.current = (x, y) => campCurrent(x, y);
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
    this.fallsView = new FallsView(this, this.rig, h.reduced);
    yield;
    const tint = worldTintOf(this.game);
    if (tint) addWorldTintBounds(this, tint);
    this.atmos = new Atmosphere(this, h.reduced, window.location.search, { shaderTint: tint });
    this.atmos.setStaticLights(this.map.staticLights.map((l) => ({ ...l })));
    this.atmos.setSnowy(isSnowy(concept));
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
    this.bungeo = new BungeoCartView({
      scene: this,
      map: "camp",
      reduced: h.reduced,
      colliders: this.map.colliders,
      clock: () => h.net.serverNow(),
      setItems: (items) => this.map.setCartItems(items.map((t): CampInteractable => ({ id: t.id, kind: "bungeo", x: t.x, y: t.y, r: t.r, label: t.label }))),
    });
    this.forage = new CampForage({ scene: this, atlas: h.atlas, reduced: h.reduced, colliders: this.map.colliders, player: () => this.player, net: () => h.net, seats: () => this.seats, remotes: () => this.remotes, toast: (m) => this.toast(m), blocked: (spot) => this.rafts?.spotBlocked(spot.id) ?? null, hideRod: (id) => this.rafts?.rigOn(id) ?? false });
    this.rafts = new CampRafts({
      scene: this,
      atlas: h.atlas,
      reduced: h.reduced,
      colliders: this.map.colliders,
      player: () => this.player,
      net: () => h.net,
      seats: () => this.seats,
      toast: (m) => this.toast(m),
      boothLit: () => this.forage.f.boothLit,
      dark: () => this.atmos.levels.darkness,
      warp: (x, y) => {
        const now = this.time.now;
        this.climb = null;
        if (this.player.sitting) this.player.stand(now, this.seatReq);
        this.player.warp(x, y, now, null);
        this.rig.recenter();
      },
    });
    this.life = new CampLife({ scene: this, atlas: h.atlas, sfx: h.sfx, reduced: h.reduced, player: () => this.player, net: () => h.net, override: this.hourOverride });
    this.goblin = campGoblin(this, h, () => this.player, () => this.rig.labelScale);
    this.rowboats = new CampRowboats({
      scene: this,
      reduced: h.reduced,
      player: () => this.player,
      remotes: () => this.remotes,
      seats: () => (h.net.online ? this.seats : EMPTY_SEATS),
      mySid: () => (h.net.online ? h.net.mySid : null),
      online: () => h.net.online,
      sit: (id) => h.net.sit(id),
      stand: () => h.net.stand(),
      toast: (m) => this.toast(m),
      splash: (x, y) => {
        // 장면 정리 중(배에서 내리기 등)에는 물보라를 만들지 않는다 (입자는 Phaser가 이미 지웠다)
        if (!this.cleaned) (this.fx ??= new Effects(this, h.reduced)).splash(x, y);
      },
      beforeBoard: () => {
        if (myBig() > 1) {
          this.toast(BIG_RIDE_TOAST);
          return false;
        }
        this.closeTalk();
        this.riding.dismount(false);
        return true;
      },
      // 배 위 낚시: 나룻배가 떠 있는 물 = boat:reservoir (protocol boatFishingSpotId "rowboat")
      fish: (at) => this.forage.f.fishFromBoat({ ...at, water: "rowboat" }),
      stopFishing: () => this.forage.f.stopBoatFishing(),
      fishing: () => this.forage.f.fishingFromBoat,
    });
    let routeGrids: ReturnType<typeof gridOfCells>[] | null = null;
    this.awayRoute = new AwayRoute({
      scene: this,
      atlas: h.atlas,
      reduced: h.reduced,
      map: "camp",
      player: () => this.player,
      grids: () => (routeGrids ??= [gridOfCells(campWalkGrid(8, false)), gridOfCells(campWalkGrid(8, true))]),
    });
    this.footbath = new CampFootbath(this, h.reduced);
    this.play = new CampPlay({
      scene: this,
      reduced: h.reduced,
      player: () => this.player,
      remotes: () => this.remotes,
      seats: () => (h.net.online ? this.seats : EMPTY_SEATS),
      mySid: () => (h.net.online ? h.net.mySid : null),
      online: () => h.net.online,
      sit: (id) => h.net.sit(id),
      seatReq: () => this.seatReq,
      clock: () => h.net.serverNow(),
      toast: (m) => this.toast(m),
      splash: (x, y) => {
        // 장면 정리 중(배에서 내리기 등)에는 물보라를 만들지 않는다 (입자는 Phaser가 이미 지웠다)
        if (!this.cleaned) (this.fx ??= new Effects(this, h.reduced)).splash(x, y);
      },
      snowy: () => isSnowy(campConceptNow()),
      concept: () => campConceptNow(),
      beforeRide: () => {
        if (myBig() > 1) {
          this.toast(BIG_RIDE_TOAST);
          return false;
        }
        this.closeTalk();
        this.riding.dismount(false);
        return true;
      },
    });
    this.homes = new CampHousing({
      scene: this,
      atlas: h.atlas,
      reduced: h.reduced,
      map: this.map,
      concept: () => campConceptNow(),
      channel: () => (h.net.online ? h.net.channel : null),
      warp: (x, y) => {
        const now = this.time.now;
        if (this.player.sitting) this.player.stand(now, this.seatReq);
        this.player.warp(x, y, now, null);
        h.net.warp(x, y);
        this.rig.recenter();
      },
      toast: (m) => this.toast(m),
      player: () => this.player,
      // 11/26 촌캉스 아궁이 불: 같은 채널에 알린다 (저장 없이 — 실시간 use 중계)
      sendUse: (u, a) => {
        if (h.net.online) h.net.use(u, a);
      },
    });
    this.snow = new CampSnowmen({ scene: this, atlas: h.atlas, sfx: h.sfx, reduced: h.reduced, player: () => this.player, net: () => h.net, remotes: () => this.remotes, myName: () => h.name, toast: (m) => this.toast(m), concept });
    this.fight = new SnowFight({
      scene: this,
      atlas: h.atlas,
      sfx: h.sfx,
      reduced: h.reduced,
      player: () => this.player,
      net: () => h.net,
      remotes: () => this.remotes,
      move: () => this.move,
      live: () => !!this.snow?.on && !this.covered && !this.locked && !this.parked,
      blocked: () => (this.snow?.holding ? "눈덩이를 내려놓고 던져요." : null),
      water: (x, y) => campWet(x, y),
      solid: (x, y) => this.campSolid(x, y),
      // 11/18 마을과 같은 규칙: 나무·소품 그림 앞면에 박히고, 자국은 그림의 불투명 픽셀 위에만
      occluders: new SnowOccluders({
        scene: this,
        solid: (x, y) => this.campSolid(x, y),
        skip: () => new Set<unknown>([...(this.snowNpcs?.all ?? [])].map((n) => n.img?.()).filter(Boolean)),
      }),
      npcs: () => {
        const life = this.life?.snowNpcs() ?? [];
        if (this.snowNpcs?.life !== life) this.snowNpcs = { life, all: [...life, ...this.map.snowNpcs()] };
        return this.snowNpcs.all;
      },
      targets: { hit: (ax, ay, bx, by) => this.snow?.snowballHit(ax, ay, bx, by) ?? null, surprise: (id) => this.snow?.surprise(id) },
      toast: (m) => this.toast(m),
    });

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
    // 11/26 집 문 앞으로 왔으면(door) 친구 도착 안내 없이 (문 앞 맞추기는 CampTrip이 맵을 옮긴 뒤에)
    else if (this.data0.arrive === "friend" && this.data0.friend?.door === undefined) {
      // 11/20 운영자 순간이동이면 도착 반짝임
      if (this.data0.friend?.tp) playTeleportFx(this, this.player.x, this.player.y, "in", this.host.reduced);
      bridge.emit("friend:notice", { message: this.data0.friend?.tp ? STAFF_TP_ARRIVED : FRIEND_ARRIVED });
    }
    this.maybeWelcome();
  }

  private debugMark(key: string, ms: number): void {
    const w = window as unknown as { __tombBoot?: Record<string, unknown> };
    if (!qaUrlAllowed() || !new URLSearchParams(window.location.search).has("debug")) return;
    w.__tombBoot = { ...(w.__tombBoot ?? {}), [key]: Math.round(ms * 10) / 10 };
  }

  // ── 처음 자리 ──

  private spawnPoint(): { x: number; y: number } {
    const d = this.data0;
    if (d.arrive === "resume" && d.resume) {
      const r = d.resume;
      const seat = r.pose === "sitChair" && r.seatId ? campSeatById(r.seatId) : undefined;
      if (seat) return standPoint(seat);
      // 11/26 나룻배에 타고 있었으면 선착장 위에 (다시 탈지는 applyArrivalPose → CampRowboats.resume)
      if (r.pose === "boat") return campRowboatDismount({ x: r.x, y: r.y });
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
      if (r.pose === "boat" && r.seatId) this.rowboats?.resume(r.seatId, r.x, r.y, pl.dir);
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
        this.departBus();
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
    // 11/26 첫 방문 안내(「걸어 보기」…)나 다른 창(안내 뒤에 뜨는 새 이웃 꾸러미 등)이 떠 있으면 인사 창이 겹친다 → 다 닫힌 뒤에 인사한다
    const busy = () => !!bridge.last("tutorial:on")?.on || !!bridge.last("ui:blockKeys")?.blocked;
    const greet = () => {
      if (this.cleaned) return;
      if (busy()) {
        const offs: (() => void)[] = [];
        const again = () => {
          if (busy()) return;
          for (const off of offs) off();
          // 안내가 끝나면 곧이어 새 이웃 꾸러미 창이 뜰 수 있다 — 조금 기다렸다가 다시 본다
          this.time.delayedCall(2000, greet);
        };
        offs.push(bridge.on("tutorial:on", again), bridge.on("ui:blockKeys", again));
        this.unsubs.push(...offs);
        return;
      }
      this.openTalk("keeper", CAMP_WELCOME, false);
    };
    this.time.delayedCall(this.data0.arrive === "bus" ? 2600 : 900, greet);
  }

  // ── 실시간 (같은 채널, 캠핑장 사람만) ──

  private callbacks(): NetCallbacks {
    const base = this.host.net.base;
    return {
      ...base,
      getPose: (out) => this.player.netPose(out),
      getFps: () => this.game.loop.actualFps,
      onWelcome: (m) => {
        this.onWelcome(m);
        void this.rafts?.refresh();
      },
      onRaftOut: (n, x, y, why) => this.rafts?.onOut(n, x, y, why),
      onRafts: (b) => this.rafts?.setBoard(b),
      onJoin: (p) => this.addRemote(p),
      onLeave: (sid) => {
        this.remotes.get(sid)?.destroy();
        this.remotes.delete(sid);
        this.snow?.onPeerLeave(sid);
        for (const [seatId, owner] of this.seats) if (owner === sid) this.setSeat(seatId, null);
      },
      onSnapshot: (entries, t) => {
        const me = this.host.net.mySid;
        for (const e of entries) if (e.sid !== me) this.remotes.get(e.sid)?.push(t, e.x, e.y, e.state, e.dir);
      },
      onSeat: (seatId, sid) => {
        this.forage.f.seatChanged(seatId, sid);
        this.rowboats?.onSeat(seatId, sid);
        this.play?.onSeat(seatId, sid);
        this.onSeat(seatId, sid);
      },
      onSeatDenied: (seatId) => {
        if (this.forage.f.seatDenied(seatId)) return;
        if (this.rowboats?.onSeatDenied(seatId)) return;
        if (this.play?.onSeatDenied(seatId)) return;
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
      onFirework: (sid, item, x, y, wait) => this.fw().launch(item, x, y, this.rig.frameView(this.view), false, this.remotes.get(sid)?.name ?? "", wait),
      onAct: (sid, kind) => {
        const r = this.remotes.get(sid);
        if (r?.visible) r.view.playAct(kind, performance.now());
      },
      onUse: (_sid, u, a) => {
        this.homes?.onUse(u, a);
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
      onBbq: (sid, item, until, lv, at) => this.food.onBbq(sid, sid === this.host.net.mySid, item, until, lv, at),
      onSnowmen: (list, stacks) => this.snow?.onSnowmen(list, stacks),
      onSnowman: (s, sid, st) => this.snow?.onSnowman(s, sid, st),
      onSnowmanGone: (id, brk) => this.snow?.onGone(id, brk),
      onSnowmanDenied: (why, a, id) => this.snow?.onDenied(why, a, id),
      onSnowHold: (sid, h) => this.snow?.setPeerHold(sid, h),
      onSnowStack: (st, h) => this.snow?.onStack(st, h),
      onSnowStackGone: (id, sid, took, brk) => this.snow?.onStackGone(id, sid, took, brk),
      onSnowball: (sid, n, x, y, tx, ty) => this.fight?.onThrow(sid, n, x, y, tx, ty),
      onSnowHit: (sid, by, n, h) => this.fight?.onHit(sid, by, n, h),
      onMapped: (map, peers, seats) => {
        if (map !== "camp") return this.host.bail();
        this.clearRemotes();
        this.snow?.onWelcome();
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
      this.host.bail(m.m);
      this.host.net.base.onWelcome(m);
      return;
    }
    // 11/27 서버가 아는 내 자리로 (다른 탭·기기에서 넘겨받으면 서버는 주소 자리를 받지 않는다)
    if (m.pos && this.player && Math.hypot(m.pos.x - this.player.x, m.pos.y - this.player.y) > WELCOME_POS_SNAP_PX) this.player.warp(m.pos.x, m.pos.y, this.time.now, null);
    this.clearRemotes();
    this.snow?.onWelcome();
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
    this.rowboats?.reclaim();
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
    r.view.setSprout(p.nb); // 11/22 새싹
    r.seatId = prev?.seatId ?? null;
    r.view.setMood(p.mood);
    this.riding.applyPeer(r, p);
    this.forage?.f.applyPeer(p);
    r.setAway(p.away === true, performance.now(), true);
    r.view.setFriend(this.isFriend(r));
    this.snow?.applyPeer(p);
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
      r.view.setSprout(p.nb);
      r.view.setMood(p.mood ?? null);
      this.riding.applyPeer(r, p);
      r.setAway(p.away === true, now);
      r.applyFood(foodOfPeer(p)); // 11/15 바베큐 효과 (커지기·빨라지기·취기)
      this.snow?.applyPeer(p); // 11/18 들고 있는 눈덩이
      const last = r.interp.latest;
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > TELEPORT_DIST / 2) r.push(now, p.x, p.y, p.state, p.dir);
    }
    for (const [sid, r] of this.remotes) {
      if (keep.has(sid)) continue;
      r.destroy();
      this.remotes.delete(sid);
      this.snow?.setPeerHold(sid, null);
    }
    this.syncSeats(seats);
  }

  private clearRemotes(): void {
    for (const r of this.remotes.values()) r.destroy();
    this.remotes.clear();
    this.snow?.clearPeers();
    this.fight?.clear();
  }

  private isFriend(r: RemoteAvatar): boolean {
    return this.host.net.channel === this.friends.ch && this.friends.bySid.get(r.sid) === r.name;
  }

  // ── bridge (UI → 캠핑장) ──

  /** 11/17 판을 바꾼다 (그림·장식·밤 빛·눈 날씨) */
  private applyConcept(c: MapConcept): void {
    if (this.cleaned || !this.map) return;
    this.map.setConcept(c);
    this.snow?.setConcept(c);
    this.atmos.setSnowy(isSnowy(c));
    this.atmos.setStaticLights(this.map.staticLights.map((l) => ({ ...l })));
  }

  /** 입김을 낼 사람 (내 캐릭터 + 같은 캠핑장 사람) */
  private *breathers(me: CampActor): Iterable<CampActor> {
    const pl = this.player;
    if (pl && !this.parked) {
      me.x = pl.x;
      me.y = pl.y;
      me.dir = pl.dir;
      yield me;
    }
    for (const r of this.remotes.values()) yield { key: r, x: r.x, y: r.y, dir: r.netDir };
  }

  private bindBridge(): void {
    const on = this.unsubs;
    // 11/24 [내 집 가기]로 캠핑장에서 바로 집에 들어갈 때 집 씬이 빌려 써요 (나오면 이 자리에서 이어져요)
    const housing: CampHousingHost = {
      atlas: this.host.atlas,
      hub: this.host.hub,
      reduced: this.host.reduced,
      active: () => !this.cleaned && !this.parked && !this.locked && !this.covered && this.building === null && !!this.player,
      look: () => this.player.view.wearing,
      body: () => this.player.view.bodyId,
    };
    campHousingHost.current = housing;
    on.push(() => {
      if (campHousingHost.current === housing) campHousingHost.current = null;
    });
    // 11/17 맵 컨셉: 주소 시험 값(?concept=, 실서버는 막힘)이 있으면 그것만, 없으면 관리자가 고른 값 (1분 확인·공지로 바로)
    this.applyConcept(campConceptNow());
    if (!parseConceptOverride(window.location.search)) {
      on.push(bridge.on("map:concept", ({ concept }) => this.applyConcept(concept)));
      on.push(startMapConceptSync());
    }
    on.push(bridge.on("input:say", ({ id }) => !this.covered && this.doSay(id)));
    on.push(bridge.on("input:emo", ({ id }) => !this.covered && !this.locked && this.expr.emo(id, this.time.now)));
    on.push(bridge.on("input:chat", ({ text }) => !this.covered && this.expr.chat(text, this.time.now)));
    on.push(bridge.on("input:mood", ({ mood }) => this.expr.setMood(mood)));
    on.push(bridge.on("input:ride", () => !this.locked && !this.snow?.blocks() && this.riding.toggle()));
    // 11/18 눈싸움: F(키보드)·[눈 던지기](터치)
    on.push(bridge.on("input:snowball", () => !this.host.hub.isBlocked && !this.covered && !this.locked && !this.parked && this.fight?.throwSnow()));
    // 11/16 사냥터·미니게임·집으로 가기 직전: 자리에서 일어난다 (lib/rideGate)
    on.push(bridge.on("player:stand", () => standForGate(this.player, this.time.now, this.seatReq)));
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
      bridge.on("friend:goto", ({ sid, name, x, y, map, tp, door }) => {
        // 11/19 마을·바닷가 친구 모두 버스로 (바닷가는 마을 정류장을 거쳐 이어 타요 — lib/friendRoute). 몸이 커져 있으면 버스를 못 타요
        // 11/26 door: 집에서 나와 그 집 문 앞으로 (창밖 연출 없는 워프라 몸 크기를 보지 않는다. 이 맵이면 그 터 앞으로)
        const route = friendRoute("camp", map ?? "village", door !== undefined ? 1 : myBig());
        if (route.do === "warp" && door !== undefined) bridge.emit("camp:lot", { lot: door });
        else if (route.do === "warp") this.goToFriend(sid, name, x, y, tp);
        else if (route.do === "block") bridge.emit("friend:notice", { message: route.message });
        else {
          this.closeTalk();
          const next = nextAfterVillage(route);
          this.host.goVillage({ sid, name, x, y, ...(next ? { next } : {}), ...(tp ? { tp } : {}), ...(door !== undefined ? { door } : {}) });
        }
      }),
    );
    // 11/20 운영자 순간이동 반짝임 (이 맵에 있을 때만)
    on.push(bridge.on("tp:fx", ({ x, y, k, map }) => map === "camp" && !this.cleaned && !this.parked && playTeleportFx(this, x, y, k, this.host.reduced)));
    // 캠핑장에서 채널을 옮기면 새 채널 캠핑장 정류장에서 (마을이 SPAWN에서 시작하는 것과 같은 규칙).
    // 꽉 찬 채널이면 실시간 클라이언트가 떠나기 전에 막아 channel:leave가 오지 않는다. 들어가는 순간 꽉 차 돌아오면 떠나기 전 자리로
    let channelBack: { x: number; y: number } | null = null;
    on.push(
      bridge.on("channel:leave", () => {
        this.snow?.dropHeld();
        const pl = this.player;
        channelBack = { x: pl.x, y: pl.y };
        if (pl.sitting) pl.stand(this.time.now, this.seatReq);
        pl.warp(CAMP_ARRIVE.x, CAMP_ARRIVE.y, this.time.now, null);
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
    on.push(bridge.on("peers:ask", () => bridge.emit("peers:list", peerList(this.remotes.values(), "camp"))));
    on.push(
      bridge.on("firework:fire", ({ item }) => {
        if (fireworkShowMs(item) > 0) return; // 광역 불꽃쇼는 서버가 돌려준 때에 (onFirework)
        // 증서는 월드가 서버로 보낸다 (net.firework) — 여기서는 내 자리에서 터뜨리기만
        this.fw().launch(item, this.player.x, this.player.y, this.rig.frameView(this.view), true, this.host.name);
      }),
    );
    // 사냥터·미니게임·집이 위에 뜨면 캠핑장은 숨고 입력을 멈춘다
    on.push(
      bridge.on("scene:changed", ({ scene }) => {
        this.covered = scene !== "world";
        // 11/26 집·사냥터로 들어가면 NPC 대화 창을 닫는다 (집 안까지 말풍선이 따라오지 않게)
        if (this.covered) this.closeTalk();
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
    const pl = this.player;
    const now = this.time.now;
    // 11/17 눈덩이를 들고 있는 동안: 앉기·탈것은 내려놓은 다음에 (E는 내려놓기).
    // 11/18 점프 키(Space·터치 [굴리기])는 굴리기라 점프하지 않는다 — 누르고 있는지는 update가 hub.rollHeld로 본다
    if (a === "jump" && this.snow?.holding) return;
    // 11/26 쌓다 만 내 눈덩이 바로 앞이면 X(터치 [허물기]) = 허물기 (들고 있어도 된다). 내 눈사람 앞이면 길게 눌러야 해서 누름만 받아 둔다
    if (a === "sit" && !pl.sitting && this.snow?.dismantle()) return;
    if ((a === "sit" || a === "ride") && this.snow?.blocks()) return;
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
      // 11/26 나룻배에 같이 탔으면 X·터치 [내리기] = 내리기 (E는 낚시)
      if (this.rowboats?.passengerOff()) return;
      // 11/26 트램펄린 위·미끄럼 중이면 X도 내리기 (트램펄린은 튀던 한 번 뒤에 뛰어내린다)
      if (this.play?.interact()) return;
      if (moving) return;
      if (pl.sitting) pl.stand(now, this.seatReq);
      else this.sitOn(this.pickSeat(pl.x, pl.y, occupied, mySid), now);
      return;
    }
    if (a !== "interact") return;
    // 대화 중이면 E = 다음 말
    if (this.talking) {
      this.nextTalk();
      return;
    }
    // 11/26 나룻배: 탔으면 내리기·배 위 낚시, 빈 배 곁이면 타기
    if (this.rowboats?.interact()) return;
    // 11/26 트램펄린에서 내리기 · 미끄럼 타는 동안은 E를 받지 않는다
    if (this.play?.interact()) return;
    // 11/26 헤엄치는 중: 잠수·떠오르기 (마을 강·호수와 같다)
    if (pl.inWater) {
      // 11/26 물 건너 좌대(4~6) 사다리 밑이면 사다리를 타고 올라간다 (짧게 오르는 연출 — stepClimb)
      const lad = this.ladderAt(pl.x, pl.y, true);
      if (lad) {
        this.startClimb(lad, true, now);
        return;
      }
      pl.toggleDive(now);
      if (pl.state === "dive") (this.fx ??= new Effects(this, h.reduced)).splash(pl.x, pl.y);
      return;
    }
    if (pl.sitting) {
      pl.stand(now, this.seatReq);
      return;
    }
    if (this.snow?.holding) {
      this.snow.interact();
      return;
    }
    if (this.life?.talk()) return;
    // 11/17 눈더미 앞이면 눈 뭉치기, 내려놓은 내 덩이 앞이면 다시 들기
    if (this.snow?.interact()) return;
    const seat = moving ? null : this.pickSeat(pl.x, pl.y, occupied, mySid);
    const obj = this.nearestObject(pl.x, pl.y);
    const sd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    // 11/26 집 문(펜션·촌캉스 테라스 식탁·평상 옆)은 닿으면 앉을 자리보다 먼저 (운영자 「입구가 어디인지」 — 문 앞에서 E가 의자로 갔다)
    const od = obj ? (isDoorItem(obj) ? 0 : reachDist(obj, pl.x, pl.y)) : Infinity;
    // A-6 낚시 자리·채집 지점이 더 가까우면 그것부터 (마을 Foraging.use와 같다)
    const fo = this.forage.nearest(pl.x, pl.y);
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(sd, od)) {
      this.forage.f.use(fo);
      return;
    }
    if (obj && od <= sd) this.useObject(obj);
    else if (seat) this.sitOn(seat, now);
  }

  /** 앉기 (null = 땅바닥). 11/16 2배 넘게 커졌으면 캠핑카 문간·정류장 녹슨 벤치에는 못 앉는다 (bigSeatBlocked) */
  private sitOn(seat: Seat | null, now: number): void {
    if (seat && bigSeatBlocked(seat.id, myBig())) {
      this.toast(BIG_SEAT_TOAST);
      return;
    }
    this.player.sit(seat, now, this.seatReq);
  }

  private nearestObject(x: number, y: number): CampInteractable | null {
    let best: CampInteractable | null = null;
    let bd = Infinity;
    for (const o of this.map.interactables) {
      if (o.kind === "npc" && o.npc && !this.map.npcVisible(o.npc)) continue;
      // 11/18 버스 정차 칸처럼 바닥 영역이 있으면 그 상자 안이 닿는 곳 (game/logic/reach)
      if (!inReach(o, x, y)) continue;
      const d = reachDist(o, x, y);
      if (d < bd) {
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
      case "board":
        this.toast("의뢰판이 아직 비어 있어요. 곧 의뢰가 붙어요.");
        break;
      case "sign":
        this.toast(`시간표에는 '다음 버스: 언젠가'라고 적혀 있어요. 그래도 ${keyJosa("E", "를")} 누르면 와요.`);
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
      case "raftBooth":
        // 11/27 좌대 매표소 창구 (매표소 직원) → 매표소 창
        this.closeTalk();
        if (pl.sitting) pl.stand(now, this.seatReq);
        pl.faceTo(o.x, o.y - 14, now);
        bridge.emit("camp:raft:open");
        break;
      case "bungeo":
        // 11/23 골목 붕어빵 수레 (캠핑장 자리가 생기면) — 말을 건 자리를 같이 (서버가 수레 가까이인지 본다)
        this.closeTalk();
        if (pl.sitting) pl.stand(now, this.seatReq);
        pl.faceTo(o.x, o.y - 10, now);
        bridge.emit("portal:open", { kind: "bungeo", at: { map: "camp", x: Math.round(pl.x), y: Math.round(pl.y) } });
        break;
      default:
        // 11/26 집터·집 문·나룻배 (집 화면 담당 campHousing · CampRowboats가 끼워 넣는 것)
        this.useExtra(o);
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
      bridge.emit("peer:menu", { sid: hit.sid, name: hit.name, ch: h.net.channel, ...(chat ? { chat } : {}), ...(this.remotes.get(hit.sid)?.view.sprout ? { sprout: true as const } : {}) });
      return;
    }
    // 오브젝트를 탭: 가까이 서 있으면 E와 같다 (눈덩이를 굴리는 동안은 E로 먼저 내려놓는다)
    if (this.snow?.holding) return;
    const pl = this.player;
    let best: CampInteractable | null = null;
    let bd = 18;
    for (const o of this.map.interactables) {
      const d = reachDist(o, wx, wy + 6);
      if (d < bd) {
        best = o;
        bd = d;
      }
    }
    if (best && inReach(best, pl.x, pl.y, 1.5) && !pl.airborne) this.useObject(best);
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
    // 11/26 분양 세 사람: 말을 걸면 그 사람이 파는 종류 하나만의 분양 창 (카라반 = 언젠가 씨, 펜션 = 소슬댁, 촌캉스 = 순이 할머니 — components/housing).
    // 캠핑장 분양 창은 여기서만 연다 (운영자 「카라반, 촌캉스도 NPC만으로 통일」 — 입간판·빈 터 팻말 없음, 빈 터 E는 안내만)
    const sale = campSaleKindOf(id);
    if (sale) {
      this.closeTalk();
      bridge.emit("portal:open", { kind: "housing", zone: "camp", camp: sale });
      return;
    }
    // 11/27 매점 알바: 말을 걸면 매점 메뉴 (그릴과 같은 먹거리 — 사면 camp:bbq:eat. 오늘 미션 「한 끼 사 먹기」도 여기서 된다)
    if (id === "clerk") {
      this.closeTalk();
      if (this.riding.on) return this.toast(RIDING_EAT_TOAST);
      const pl = this.player;
      if (pl.sitting) pl.stand(this.time.now, this.seatReq);
      bridge.emit("camp:bbq:open", { stand: "grill", shop: true });
      return;
    }
    const turn = this.talkTurn.get(id) ?? 0;
    this.talkTurn.set(id, turn + 1);
    this.openTalk(id, campLines(id, turn, campConceptNow()), true);
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
    this.snow?.dropHeld();
    const pl = this.player;
    if (pl.sitting) pl.stand(this.time.now, this.seatReq);
    this.leaveCampfire();
    this.riding.dismount(false);
    // 11/16 내려 준 버스가 아직 흐려지는 중이면 치워요 (그 버스가 사라질 때 새 버스까지 지워 버스가 오지 않던 문제)
    this.dropBus();
    this.bus = createBusArrival(this, { doorX: CAMP_BUS_STOP.x, laneY: CAMP_ROAD.y + CAMP_ROAD.h - 6, fromLeft: true, reduced: this.host.reduced, leave: "fade", waitMs: CAMP_BUS_WAIT_MS });
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

  /** 같은 채널 캠핑장의 친구 옆으로 (마을 goToFriend와 같은 규칙) */
  private goToFriend(sid: Sid, name: string, fx: number, fy: number, tp?: true): void {
    const net = this.host.net;
    if (this.cleaned || !net.online || this.locked) return;
    const notice = (message: string) => bridge.emit("friend:notice", { message });
    const r = this.remotes.get(sid);
    const live = r && r.name === name ? r : null;
    if (live?.away) return notice(tp ? STAFF_TP_INSIDE_MSG : `${name}님은 지금 실내에 있어요.`);
    const at = live ? { x: live.x, y: live.y } : { x: fx, y: fy };
    this.closeTalk();
    this.leaveCampfire();
    this.snow?.dropHeld();
    const pl = this.player;
    const now = this.time.now;
    if (pl.sitting) pl.stand(now, this.seatReq);
    const spot = this.besideFriend({ sid, name, x: at.x, y: at.y });
    if (tp) playTeleportFx(this, pl.x, pl.y, "out", this.host.reduced);
    pl.warp(spot.x, spot.y, now, this.seatReq);
    pl.faceTo(at.x, at.y, now);
    // 11/20 운영자는 서버에 tp로 (운영자 연결만 받는다)
    if (tp) {
      net.staffTp(sid, spot.x, spot.y);
      playTeleportFx(this, spot.x, spot.y, "in", this.host.reduced);
    } else net.warp(spot.x, spot.y);
    this.rig.recenter();
    notice(tp ? STAFF_TP_ARRIVED : FRIEND_ARRIVED);
  }

  /** 새로고침 직전 자리 (CampTrip.campResume) */
  resumePose(): { x: number; y: number; seatId: string | null; pose: ResumeState["pose"]; dir: number; where: "camp" } | null {
    if (this.cleaned || !this.player) return null;
    const pl = this.player;
    const p = pl.netPose(this.poseBuf);
    // 11/26 나룻배: 배 자리 id를 남긴다 (되살리기는 마을 조각배와 같은 규칙 — CampRowboats.resume)
    if (pl.boatSeatId && this.rowboats?.isRiding) return { x: Math.round(p.x), y: Math.round(p.y), seatId: pl.boatSeatId, pose: "boat", dir: pl.dir, where: "camp" };
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
    // 11/17 눈덩이를 굴리는 동안은 걷기만 (달리면 덩이가 앞질러 가 버린다). 11/18 품에 안고는 달려도 된다
    const rollHeld = this.host.hub.rollHeld && !this.locked;
    if (this.snow?.holding && rollHeld) this.move.run = false;
    // 11/18 눈을 뭉치는 잠깐은 그 자리에 선다
    if (this.fight?.gathering) this.move.ax = this.move.ay = 0;
    this.stepClimb(now);
    const started = pl.update(this.benchInput(now), now, this.seatReq);
    this.rowboats?.steer(this.move, dt);
    this.rowboats?.update(dt);
    this.updatePlunge(now);
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
    const nf = nearestCampfire(pl.x, pl.y, CAMP_CAMPFIRES);
    this.host.sfx.campfire(nf ? campfireLevel(nf.dist, !!fire) : 0);
    // 11/26 폭포 다리 의자에 앉으면 「폭포 멍」 (불멍·하늘 보기와 같은 시점 바꾸기), 물소리는 폭포에 가까울수록 크게
    const falls = pl.state === "sitChair" && !!pl.seat && campFallsViewSeat(pl.seat.id);
    if (falls && !this.fallsView?.active) {
      this.fallsView?.enter();
      this.map.setFallsFocus(true);
      bridge.emit("view:mode", { mode: "falls" });
    } else if (!falls && this.fallsView?.active) this.leaveFallsView();
    this.fallsView?.update(dt);
    const fd = Math.hypot(pl.x - CAMP_PLUNGE.x, (pl.y - CAMP_PLUNGE.y) * 1.3);
    this.host.sfx.fallsRush(falls ? 0.9 : Math.max(0, Math.min(0.5, 1 - fd / 320)) * 0.6);
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    this.expr.update(now);
    this.bungeo?.update(now);
    this.meScreen.update(pl.x, pl.y);
    this.play?.update(this.move, dt);
    pl.view.sync(now, s);
    const L = this.atmos.levels;
    this.map.update(now, dt, view, { hour: this.hour, darkness: L.darkness, rain: L.rain, fog: L.fog });
    this.riding.update();
    publishRide(pl, this.riding.on); // 11/16 탄 것·앉은 자리 → UI (lib/rideGate)
    this.forage.f.update(dt, view, s);
    this.rafts?.update(now, s);
    this.awayRoute?.update(now, view, s, this.locked);
    this.life?.update(dt, view, s);
    this.homes?.update(L.darkness, s, view);
    this.syncHammocks();
    // 11/26 X·[허물기]를 누르고 있으면 내 눈사람 길게 눌러 허물기
    this.snow?.update(s, rollHeld, this.host.hub.sitHeld && !this.locked && !this.covered);
    for (const r of this.remotes.values()) r.update(pnow, view, s);
    this.footbath?.update(now, pl, this.remotes);
    this.fight?.update(s);
    this.declutterLabels(now, pnow);
    this.updateSeatHint(now, s);
    this.updateTalk();
    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
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
    const seat: Seat | null = pl.sitting || this.locked ? null : this.pickSeat(pl.x, pl.y, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null);
    const id = seat ? seat.id : null;
    if (id !== this.nearSeatId) {
      this.nearSeatId = id;
      bridge.emit("seat:near", seat ? { seatId: seat.id, kind: seat.id.includes("-") ? "bench" : "chair" } : null);
    }
    const sittingFor = pl.sitting && pl.view.sitSince > 0 ? now - pl.view.sitSince : -1;
    // 11/26 해먹에 누워 있으면 물건 안내 대신 「이동하면 일어나요」 (seatHint standText)
    const obj = !pl.sitting && !this.locked && !pl.anchored ? this.nearestObject(pl.x, pl.y) : null;
    const objSd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    const objOd = obj ? (isDoorItem(obj) ? 0 : reachDist(obj, pl.x, pl.y)) : Infinity;
    // 바닥 영역(버스 정차 칸)은 넓어서 안내를 내 발밑에
    // 11/27 좌대 매표소처럼 안내 자리를 정해 둔 영역은 그 자리에 (promptAt)
    let other: { x: number; y: number; text: string; dim?: boolean } | null =
      obj && objOd <= objSd ? { x: obj.promptAt?.x ?? (obj.zone ? pl.x : obj.x), y: (obj.promptAt?.y ?? (obj.zone ? pl.y : obj.y)) + 2, text: `${this.seatHint.prefix}${obj.label}` } : null;
    // 11/26 누가 누운 해먹: 마을처럼 회색 「누가 누워 있어요」 (useHammock이 거절하는 것과 같은 판정)
    if (other && obj?.kind === "hammock" && net.online) {
      const owner = this.seats.get(obj.id.slice("hammock:".length));
      if (owner !== undefined && owner !== net.mySid) other = { ...other, text: "누가 누워 있어요", dim: true };
    }
    // 11/26 트램펄린·워터 슬라이드: 다 찼거나 누가 타고 있으면 그 안내, 겨울엔 눈썰매
    if (other && obj && (obj.kind === "tramp" || obj.kind === "slide")) other = this.play?.hint(this.seatHint.prefix, obj.kind) ?? other;
    // A-6 낚시 자리·채집 지점 안내 ("E 낚시하기"·"E 약초 캐기")
    const fo = !pl.sitting && !this.locked && !pl.anchored ? this.forage.nearest(pl.x, pl.y) : null;
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(objSd, objOd)) other = { x: fo.x, y: fo.y + 2, text: `${this.seatHint.prefix}${fo.label}` };
    const bench = pl.state === "sitChair" && pl.seat && CAMP_MULTI_SEAT.has(pl.seat.furnitureId);
    const keys = this.seatHint.prefix === "E ";
    const standText = bench
      ? keys
        ? "←→ 옆자리 · ↑↓ 일어나기 · T 벤치 상태"
        : "좌우로 옆자리 · 위아래로 일어나기"
      : pl.state === "sitChair" && keys
        ? "이동하면 일어나요 · T 상태 고르기"
        : null;
    // 불멍 구도에서는 화면을 가리지 않게 앉기 안내를 띄우지 않는다 (마을과 같다)
    const lifeHint = !pl.sitting && !this.locked ? this.life?.hint(this.seatHint.prefix) : null;
    if (lifeHint) other = lifeHint;
    // 11/17 눈사람 만들기: 굴리는 중이면 언제나 그 안내, 아니면 다른 안내가 없을 때 눈더미·내 덩이
    const snowHint = !pl.sitting && !this.locked ? (this.snow?.hint(this.seatHint.prefix) ?? null) : null;
    if (snowHint && (this.snow?.holding || !other)) other = snowHint;
    // 11/26 나룻배 타기·내리기·배 위 낚시
    const rowHint = !this.locked && !pl.sitting ? (this.rowboats?.hint(this.seatHint.prefix) ?? null) : null;
    if (rowHint) other = rowHint;
    if (this.play?.busy) other = this.play.rideHint(this.seatHint.prefix);
    // 11/26 좌대 사다리 (물속 밑: E 올라가기 · 마루 위 사다리 앞: 아래로 내려가기)
    if (!this.locked && !pl.sitting && !this.climb) {
      const up = pl.inWater ? this.ladderAt(pl.x, pl.y, true) : null;
      const down = !pl.inWater && !up ? this.ladderAt(pl.x, pl.y, false) : null;
      if (up) other = { x: up.foot.x, y: up.foot.y + 2, text: `${this.seatHint.prefix}사다리로 올라가기` };
      else if (down) other = { x: down.top.x, y: down.top.y + 4, text: "아래로 가면 사다리로 내려가요" };
    } else if (this.climb) other = null;
    // 11/26 원두막 사다리 밑: 「E 사다리로 올라가기」 (앉기 안내 대신 — 폰 [상호작용] 단추도 같은 이름). 오른 뒤엔 평소 앉은 안내
    const ladderFoot = !pl.sitting && !this.locked && seat && isCampLadderSeat(seat.id) ? campLadderAt(pl.x, pl.y) : null;
    if (ladderFoot) other = { x: ladderFoot.x, y: ladderFoot.y + 2, text: `${this.seatHint.prefix}사다리로 올라가기` };
    setDoorHint(ladderFoot ? "사다리로 올라가기" : null);
    // 11/26 해먹에 누워 있는 동안
    if (pl.state === "hammock") other = { x: pl.x, y: pl.y + 8, text: "이동하면 일어나요" };
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

  /**
   * 이름표·말풍선 겹침 풀기 (LabelLayout): 이름표는 이름·바탕판·칭호·1위 배지를 한 묶음으로 통째로 비키고(내 것은 제자리),
   * 말풍선은 자리 잡은 이름표들을 피해 위로만 비킨다
   */
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
      this.homes?.addLights(lit);
      this.bungeo?.addLights(lit);
      this.life?.addLights(lit);
      this.goblin?.addLights(lit);
      this.rafts?.addLights(lit);
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
    this.leaveFallsView();
    if (!this.campfire?.active) return;
    this.campfire.exit();
    bridge.emit("view:mode", { mode: "normal" });
  }

  /** 11/26 폭포 멍에서 나온다 */
  private leaveFallsView(): void {
    if (!this.fallsView?.active) return;
    this.fallsView.exit();
    this.map.setFallsFocus(false);
    bridge.emit("view:mode", { mode: "normal" });
  }

  /** 11/26 헤엄쳐 폭포 밑에 들어가면: 물살이 바깥으로 밀어내고(campCurrent) 물보라 + 한 번 안내 */
  private updatePlunge(now: number): void {
    const pl = this.player;
    const inside = (pl.state === "swim" || pl.state === "dive") && inCampPlunge(pl.x, pl.y, 4);
    if (!inside) {
      if (this.plungeWarned && !inCampPlunge(pl.x, pl.y, 28)) this.plungeWarned = false;
      return;
    }
    if (now - this.plungeFxAt > 260 && !this.host.reduced) {
      this.plungeFxAt = now;
      (this.fx ??= new Effects(this, this.host.reduced)).splash(pl.x, pl.y - 2);
    }
    if (this.plungeWarned) return;
    this.plungeWarned = true;
    this.host.sfx.splash(0.6);
    this.toast("물살이 세서 더 못 가요");
  }
  private plungeFxAt = 0;
  private fx: Effects | null = null;
  /** 11/26 집터·집 문(campHousing)·나룻배(CampRowboats)가 쓰는 E (lot·house·rowboat) */
  private useExtra(o: CampInteractable): void {
    if (o.kind === "hammock") {
      this.useHammock(o.id.slice("hammock:".length));
      return;
    }
    if (this.play?.use(o)) return;
    if (this.homes?.use(o)) return;
    this.rowboats?.use(o);
  }
  // ── 11/26 해먹에 눕기 (protocol CAMP_HAMMOCKS — 서버 좌석 qM1~4, 한 사람) ──
  // 마을 해먹과 같은 해먹 자세: 천에 휜 몸 · 앞 천이 하체를 덮는다 · 좌우로 천천히 흔들림 (AvatarView). 캠핑장 천 무늬로 (setHammockSkin)
  private useHammock(id: string): void {
    const h = campHammockById(id);
    if (!h) return;
    const pl = this.player;
    const net = this.host.net;
    const now = this.time.now;
    if (net.online) {
      const owner = this.seats.get(id);
      if (owner !== undefined && owner !== net.mySid) {
        this.toast("누가 누워 있어요");
        return;
      }
    }
    pl.faceTo(h.x, h.y, now);
    pl.view.setHammockSkin(h.skin);
    pl.attach("hammock", h.x, h.y - CAMP_HAMMOCK_LIFT, h.y - CAMP_HAMMOCK_LIFT + HAMMOCK_FRONT, now, this.seatReq, id);
    if (net.online) net.sit(id);
  }
  /** 누가 누워 있는 해먹은 기둥만 남기고 (맵·집 마당), 원격 누운 사람은 그 해먹 천 무늬로 */
  private syncHammocks(): void {
    const busy = new Set<string>();
    const pl = this.player;
    if (pl.state === "hammock" && pl.spotId) busy.add(pl.spotId);
    for (const r of this.remotes.values()) {
      if (r.stateId !== STATE.hammock || !r.seatId) continue;
      const h = campHammockById(r.seatId);
      if (!h) continue;
      busy.add(h.id);
      r.view.setHammockSkin(h.skin);
    }
    const key = [...busy].sort().join(",");
    if (key === this.hammockBusyKey) return;
    this.hammockBusyKey = key;
    this.map.setHammockBusy(busy);
    this.homes?.setHammockBusy(busy);
  }
  private hammockBusyKey = "";
  // ── 11/26 물 건너 좌대(4~6) 사다리 오르내리기 ──
  // 순간이동 대신 사다리 칸을 따라 위·아래로 0.5초쯤 걸어 오르내린다 (입력을 잠깐 대신 넣는다 — 위치·자세는 평소 MOVE 그대로라
  // 다른 사람 화면에서도 헤엄 → 사다리 → 마루로 같게 보인다). 물 ↔ 마루는 사다리 칸으로만 (둘레 막이 — campLayout raftRimColliders)
  private climb: { lad: RaftLadder; up: boolean; t0: number } | null = null;

  /** (x,y) 가까운 좌대 사다리 — water = 물속 사다리 밑, 아니면 마루 위 사다리 앞 */
  private ladderAt(x: number, y: number, water: boolean): RaftLadder | null {
    for (const l of RAFT_LADDERS) {
      if (water ? Math.hypot(l.foot.x - x, l.foot.y - y) <= 14 : Math.abs(x - l.x) <= 7 && y >= l.top.y - 6 && y <= l.gap.y + 3) return l;
    }
    return null;
  }

  private startClimb(lad: RaftLadder, up: boolean, now: number): void {
    this.climb = { lad, up, t0: now };
    (this.fx ??= new Effects(this, this.host.reduced)).splash(lad.foot.x, lad.foot.y - 2);
    this.host.sfx.splash(0.4);
  }

  /** 매 프레임 (플레이어 이동 전에): 사다리를 타는 동안 입력을 사다리 쪽으로 대신 넣고, 다 오르내리면 끝. 사다리로 헤엄쳐·걸어 들어가도 시작 */
  private stepClimb(now: number): void {
    const pl = this.player;
    const m = this.move;
    if (!this.climb) {
      if (this.locked || pl.sitting || pl.inBoat || pl.anchored || pl.airborne) return;
      if (pl.inWater && m.ay < -0.4) {
        const l = this.ladderAt(pl.x, pl.y, true);
        // 11/27 좌대 입장권: 내 좌대가 아니면 사다리로 못 오른다 (안내만)
        if (l && (this.rafts?.ladderOk(l.n) ?? true)) this.startClimb(l, true, now);
      } else if (!pl.inWater && m.ay > 0.4) {
        const l = this.ladderAt(pl.x, pl.y, false);
        if (l) this.startClimb(l, false, now);
      }
      if (!this.climb) return;
    }
    const c = this.climb;
    const done = c.up ? !pl.inWater && pl.y <= c.lad.top.y : pl.inWater && pl.y >= c.lad.foot.y - 2;
    if (done || now - c.t0 > 1600) {
      if (!c.up) (this.fx ??= new Effects(this, this.host.reduced)).splash(pl.x, pl.y);
      this.climb = null;
      return;
    }
    m.ax = Math.max(-1, Math.min(1, (c.lad.x - pl.x) / 3));
    m.ay = c.up ? -1 : 1;
    m.run = false;
  }
  /**
   * 지금 열린 좌석인지 (집 앞마당 자리는 그 단계 소품이 놓였을 때만). 11/26 원두막·평상·정자 방석은 오르는 자리에서만 (pickSeat — campZoneSeat).
   * 헤엄치는 중에는 어느 자리도 고르지 않는다 (물속에서 다리·데크 의자에 앉아 올라가지 않게)
   */
  private readonly seatOpen = (id: string): boolean =>
    !this.player.inWater && !isCampZoneSeat(id) && (this.homes?.seatOpen(id) ?? !id.startsWith("qH")) && campFootSeatReachable(id, this.player.x, this.player.y);
  private readonly ladderOpen = (id: string): boolean => !this.player.inWater && (this.homes?.seatOpen(id) ?? false);
  /** 앉을 자리 고르기: 원두막 사다리 밑이면 그 원두막 방석, 아니면 가까운 자리 */
  private pickSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): Seat | null {
    return campZoneSeat(x, y, occupied, mySid, this.ladderOpen) ?? campPickSeat(x, y, occupied, mySid, undefined, this.seatOpen);
  }
  // 11/26 원두막은 사다리 밑에서 E(폰 [상호작용])로만 오른다 (운영자 — 위로 걷기만 해도 오르던 것은 뺐다)

  private onResize(): void {
    this.rig?.applyBounds();
    this.campfire?.resize();
    this.fallsView?.resize();
    this.atmos?.resize();
    this.lighting?.resize();
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
    if (this.campfire?.active || this.fallsView?.active) bridge.emit("view:mode", { mode: "normal" });
    this.campfire?.destroy();
    this.fallsView?.destroy();
    this.fallsView = null;
    this.host.sfx.campfire(0);
    this.host.sfx.fallsRush(0);
    this.clearRemotes();
    this.expr?.destroy();
    this.forage?.f.destroy();
    this.bungeo?.destroy();
    this.bungeo = null;
    this.life?.destroy();
    this.life = null;
    // 게임째 닫힐 때(DESTROY)는 물리 세계가 충돌 묶음을 먼저 비워 집 충돌 정리가 실패할 수 있다 — 장면 정리는 끝까지 간다
    try {
      this.homes?.destroy();
    } catch {
      // 이미 치워진 충돌 묶음
    }
    this.homes = null;
    this.rowboats?.destroy();
    this.rowboats = null;
    try {
      this.rafts?.destroy();
    } catch {
      // 이미 치워진 충돌 묶음 (게임째 닫힘)
    }
    this.rafts = null;
    this.awayRoute?.destroy();
    this.awayRoute = null;
    this.play?.destroy();
    this.play = null;
    this.footbath?.destroy();
    this.footbath = null;
    this.goblin = null;
    this.snow?.destroy();
    this.snow = null;
    this.fight?.destroy();
    this.fight = null;
    this.meScreen?.destroy();
    this.rig?.destroy();
    this.atmos?.destroy();
    this.lighting?.destroy();
    this.fireworks = null;
    // 11/26 장면은 한 번 만들어 여행마다 다시 쓰므로 물보라 효과도 버린다 (남기면 다음 여행에서 지운 입자로 터진다 — 운영 오류 'fill' null)
    this.fx = null;
    this.snowGrid = null;
    this.player?.destroy();
    this.map?.destroy();
    // 소식은 월드로 돌려준다 (CampTrip이 먼저 했어도 한 번 더 — 남은 콜백이 지운 장면을 부르지 않게)
    if (this.begun) this.host.net.divert(null);
    bridge.emit("map:changed", { map: "village" });
  }
}

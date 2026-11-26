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
  SEA_SCOPES,
  SEA_SEATS,
  SEA_LOUNGER_LIE_DY,
  SEA_LIGHTHOUSE,
  SEA_FURNITURE,
  seaSeatGroup,
  seaViewOfSeat,
  seaCampfireOfSeat,
  SEA_CAMPFIRE,
  seaWet,
  onSeaDeck,
  SEA_DECKS,
  SEA_FLAT_Y0,
  type SeaRestSeat,
  tideLineY,
  type ActKind,
  type PeerInfo,
  type Seat,
  type Sid,
  type WelcomeMsg,
  fireworkShowMs,
} from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import type { ResumeState } from "@/lib/resume";
import { TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH, SIT_IDLE_MS } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import { RemoteAvatar } from "../entities/RemoteAvatar";
import { peerList } from "../logic/peerList";
import { peerAt } from "../entities/peerHit";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf } from "../entities/SpeechBubble";
import type { KeyAction } from "../input/Keyboard";
import { keyJosa } from "../input/keyHint";
import { besideFriend, FRIEND_ARRIVED } from "../logic/friendSpot";
import { playTeleportFx } from "../fx/teleportFx";
import { STAFF_TP_ARRIVED, STAFF_TP_INSIDE_MSG } from "@tomb/protocol";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { sideIntent, standPoint } from "../logic/sit";
import { inReach, reachDist } from "../logic/reach";
import type { NetCallbacks } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { avatarColorSpec } from "../sprites/avatar";
import { Atmosphere } from "../world/Atmosphere";
import { Effects } from "../world/Effects";
import { CameraRig } from "../world/CameraRig";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, nearestCampfire } from "../world/campfireMath";
import { HAMMOCK_LIFT } from "../world/layout";
import { HAMMOCK_FRONT } from "../entities/RemoteAvatar";
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
import { BIG_RIDE_TOAST, BIG_SEAT_MAX, BIG_SEAT_TOAST, foodOfPeer, myBig, myFood, RIDING_EAT_TOAST } from "../camp/foodState";
import { friendRoute, nextAfterVillage } from "@/lib/friendRoute";
import { SEA_DRUNK_MSG, seaDrunkBlocked, seaDrunkStep } from "./seaDrunk";
import { FoodFx } from "../camp/foodFx";
import { SeaForage } from "./seaForage";
import { BungeoCartView } from "../world/BungeoCartView";
import { SeaLife } from "./seaLife";
import { attachGoblin, type GoblinActor } from "../world/life/GoblinActor";
import { SeaRides } from "./SeaRides";
import { SeaKayaks } from "./SeaKayaks";
import { remoteTouch, type SeaHull } from "./SeaRides";
import { resolveHulls, SHIP_GAIN, strongerGain, type BounceKind } from "../logic/bounce";
import { seaSnackZone, seaStandable } from "./seaLayout";
import { seaWalkGrid } from "./seaLayout";
import { AwayRoute, gridOfCells } from "../world/AwayRoute";
import { shipHulls, shipWakeAt, type ShipHull } from "./seaShipsPlan";
import { StarScopes } from "../scopes/StarScopes";
import { SeaHornSound, SeaShips } from "./seaShips";
import { GhostShip } from "./GhostShip";
import { FEATHER_MSG, SNACK_NONE_MSG, type SnackKind } from "@/lib/sea/gull";
import { gullApi, publishSnacks } from "@/lib/sea/gullClient";
import { errorMessage } from "@/lib/api";

import { SeaView, seaViewFore, seaViewLandmarks, type SeaViewFore, type SeaViewSitter, type ViewKind } from "./seaView";
import { ghostShipNight, keeperTideText } from "./seaKeeper";
import { avatarFrame } from "../assets/manifest";
import type { SeaInteractable } from "./seaTypes";
import { tideNow, tideNowLevel, tideWarnNow } from "./tideClock";
import { SeaHousing } from "./seaHousing";
import { publishRide, standForGate } from "@/lib/rideGate";
import { qaUrlAllowed } from "@/lib/qaUrl";
import { isSnowy, parseConceptOverride, type MapConcept } from "@/lib/mapConcept";
import { startMapConceptSync } from "@/lib/mapConceptClient";
import { SeaConceptDecor, seaConceptNow, type SeaActor } from "./SeaConceptDecor";

/** 11/16 선베드에 누운 사람 depth (누운 자리 y + 이만큼 — 선베드 받침 − 4보다 앞) */
const LOUNGER_LIE_FRONT = 10;
/** 일어날 때 선베드 받침에서 이만큼 아래(발치 앞)로 */
const LOUNGER_STAND_DY = 8;

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
  /** 11/16 r13 튜브·제트스키 */
  private rides: SeaRides | null = null;
  /** 11/16 r18 2인승 카약 */
  private kayaks: SeaKayaks | null = null;
  /** 11/16 동전 망원경 (밤 별자리 잇기·낮 바다 보기 — game/scopes, 자리는 protocol SEA_SCOPES) */
  private stars: StarScopes | null = null;
  /** 11/16 r15 먼바다 배·뱃고동·오징어잡이배 */
  private ships: SeaShips | null = null;
  /** 11/17 토요일 밤 유령선 특가 장터 */
  private ghost: GhostShip | null = null;
  private horn: SeaHornSound | null = null;
  /** 11/16 갯바위 낚시 (마을 낚시를 바닷가로) */
  private forage!: SeaForage;
  /** 11/23 골목 붕어빵 수레 (그 회차 자리가 이 맵일 때만 — world/BungeoCartView) */
  private bungeo: BungeoCartView | null = null;
  /** 11/16 포구 주민 (돌아다니는 유령들 — game/sea/seaLife) */
  private life: SeaLife | null = null;
  /** 11/26 황금 고블린 (바닷가 고블린 그리기·잡기, 다른 맵이면 마을행 정류장 쪽 화살표) */
  private goblin: GoblinActor | null = null;
  /** 11/26 오늘 미션 「팔기」 길 안내 → 해녀 할망 (game/world/AwayRoute) */
  private awayRoute: AwayRoute | null = null;
  /** 11/16 포구 오두막·등대 등불 (game/sea/seaHousing) */
  private housing: SeaHousing | null = null;
  /** 11/17 맵 컨셉 (겨울·크리스마스판 — game/sea/SeaConceptDecor) · 입김 낼 사람 목록 (프레임마다 다시 채워요) */
  private concept: SeaConceptDecor | null = null;
  private readonly breathers: SeaActor[] = [];
  private readonly selfKey = {};
  private readonly breatherFn = (): SeaActor[] => this.breathersNow();
  /** 11/16 매점 먹거리·마실 거리 효과 (캠핑장 바베큐 효과 그대로 — game/camp/foodFx) */
  private food!: FoodFx;
  /** 11/16 쉴거리 자리 (선베드 눕기·돗자리 바닥 앉기 — 의자 좌석 체계 밖, 서버 좌석은 같아요) */
  private rest: SeaRestSeat | null = null;
  /** 11/16 등대 꼭대기에 올라가 있는지 · 오른 자리 (여기서 움직이면 내려와요) */
  private lookout = false;
  /** 11/16 r19 등대 꼭대기 대신 동전 망원경으로 보는 중 (어느 망원경인지 — 망원경마다 흔들림 결이 달라요) */
  private scopeLook: number | null = null;
  private lookoutAt = { x: 0, y: 0 };
  private foghornAt = 0;
  /** 거절된 쉴거리 자리를 한 번 더 청했는지 */
  private restRetry: string | null = null;
  /** 11/16 바다 보기 장면 (앉아 있을 때 「바다 보기」·V로 켜고 끄기, 일어나면 꺼져요) */
  private seaView: SeaView | null = null;
  /** 11/16 r12 해변 모닥불 불멍 (마을·캠핑장 모닥불과 같은 구도·소리) */
  private campfire: CampfireView | null = null;
  private viewOn = false;
  private viewAt = 0;
  private viewHud = "";
  /** 11/16 r19 바라보는 장면이 켜져 있거나 켜지고 꺼지는 중이라고 알렸는지 (view:busy — 단축키 막기) */
  private viewBusy = false;
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
    // 11/17 맵 컨셉: 바닥 덩어리를 처음부터 그 판 그림으로 (나머지 그림·장식은 장면을 다 만든 뒤에)
    const concept0 = seaConceptNow();
    this.map.setConcept(concept0);
    yield* this.map.parts();
    const b = SEA_BOUNDS;
    this.physics.world.setBounds(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);

    const spawn = this.spawnPoint();
    this.player = new Player(this, h.atlas, spawn.x, spawn.y, h.color, h.name, isAvatarBody(h.body) ? h.body : "hood");
    this.player.view.lieCover = "towel"; // 11/16 선베드에 누우면 하늘빛 수건
    this.player.titleSpeed = true;
    this.player.view.setLook([...h.look]);
    // 물때: 물이 덮은 갯벌이면 헤엄 (선착장·방파제 위는 마른 땅)
    // 11/17 유령선 널빤지·갑판 위는 마른 자리
    this.player.water = (x, y) => seaWet(x, y, this.tide) && !this.ghost?.walkable(x, y);
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    // 11/16 r17 사용자 "난간을 스치면 데크 안으로 튀어 들어가요" → 데크 밖(물·갯벌)에 있으면 데크 몸 전체와 부딪혀요 (데크 위면 난간만)
    this.physics.add.collider(this.player.sprite, this.map.deckBlocks, undefined, () => !this.player.inBoat && this.deckSide === false);
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
    this.food = new FoodFx({ scene: this, reduced: h.reduced, sfx: h.sfx, player: () => this.player, remotes: () => this.remotes });
    this.seaView = new SeaView(this.game, h.reduced);
    this.campfire = new CampfireView(this, this.rig, this.map, h.reduced);
    this.horn = new SeaHornSound();
    this.ships = new SeaShips(this, h.reduced, (g, pan) => this.horn?.horn(g, pan));
    this.rides = new SeaRides({
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
      tide: () => this.tide,
      splash: (x, y) => this.fx.splash(x, y),
      beforeBoard: () => {
        // 11/17 술에 취한 동안엔 튜브·제트스키·카약을 못 타요 (서버도 거절해요)
        if (seaDrunkBlocked(myFood().drunk, Date.now())) {
          this.drunkToast(this.time.now);
          return false;
        }
        this.riding.stepOff();
        if (this.rest) this.leaveRest(this.time.now);
        return true;
      },
      // 11/16 r19 놀거리끼리 부딪혀 튕기기 (튜브·제트스키·카약 모두)
      hulls: () => [
        ...(this.rides?.hullBoxes() ?? []),
        // 11/17 대 있는 유령선 몸 (단단해요)
        ...(this.ghostHull()),
        ...(this.kayaks?.hullBoxes() ?? []),
        // 11/16 r19 지나가는 배·오징어잡이배도 단단해요 (세게 밀어내요)
        ...this.shipHullsNow.map((s) => ({ id: s.id, box: s.box, empty: false, vx: s.vx, vy: s.vy, ship: { heavy: s.heavy } })),
        // 11/16 r19 물에 있는 다른 사람 (헤엄·잠수 — 탄 사람은 놀거리 몸으로 들어 있어요)
        ...this.swimmersNow,
      ],
      shipHit: (heavy, x, y) => this.shipHit(heavy, x, y),
      wake: (x, y) => shipWakeAt(x, y, this.shipHullsNow),
      nudge: (id, nx, ny, amp) => {
        this.rides?.nudge(id, nx, ny, amp);
        this.kayaks?.nudge(id, nx, ny, amp);
      },
    });
    // 11/16 r18 2인승 카약 (튜브·제트스키와 같은 바탕)
    this.kayaks = new SeaKayaks(this.rides.host);
    // 11/17 유령선 (토요일 밤 9~11시 · 운영자 시험 부르기)
    this.ghost = new GhostShip({
      scene: this,
      atlas: h.atlas,
      reduced: h.reduced,
      player: () => this.player,
      colliders: this.map.colliders,
      toast: (m) => this.toast(m),
      splash: (x, y) => this.fx.splash(x, y),
      warp: (x, y) => {
        const now = this.time.now;
        if (this.rest) this.leaveRest(now);
        this.player.warp(x, y, now, this.seatReq);
        h.net.warp(x, y);
      },
    });
    this.stars = new StarScopes(this, {
      spots: SEA_SCOPES,
      style: "coin",
      player: () => this.player,
      net: () => h.net,
      seats: () => this.seats,
      judged: () => h.net.online,
      toast: (m) => this.toast(m),
      sfx: h.sfx,
      colliders: this.map.colliders,
      // 11/16 r19 E는 언제나 별자리 잇기, 망원경 앞에서 V·「바다 보기」 버튼은 등대 꼭대기처럼 먼바다를 넓게 (움직이면 내려와요)
      seaView: true,
    });
    this.seaView.onGullCall = (vol, pan) => this.host.sfx.gull(vol, pan);
    // 지도의 갈매기가 날아오르며 울면: 가까울수록 크게, 내 쪽 좌우로
    this.map.onGullCall = (x, y, scared) => {
      const d = Math.hypot(x - this.player.x, y - this.player.y);
      if (d > 420 || this.viewOn) return;
      this.host.sfx.gull((scared ? 0.9 : 0.6) * Math.max(0.15, 1 - d / 420), Math.max(-1, Math.min(1, (x - this.player.x) / 260)));
    };
    this.bungeo = new BungeoCartView({
      scene: this,
      map: "sea",
      reduced: h.reduced,
      colliders: this.map.colliders,
      clock: () => h.net.serverNow(),
      setItems: (items) => this.map.setCartItems(items.map((t): SeaInteractable => ({ id: t.id, kind: "bungeo", x: t.x, y: t.y, r: t.r, label: t.label }))),
    });
    this.forage = new SeaForage({ scene: this, atlas: h.atlas, reduced: h.reduced, colliders: this.map.colliders, player: () => this.player, net: () => h.net, seats: () => this.seats, remotes: () => this.remotes, toast: (m) => this.toast(m), tide: () => this.tide });
    this.life = new SeaLife({ scene: this, atlas: h.atlas, sfx: h.sfx, reduced: h.reduced, player: () => this.player, net: () => h.net, water: () => this.map.waterState, override: this.hourOverride });
    this.goblin = attachGoblin({ scene: this, atlas: h.atlas, sfx: h.sfx, reduced: h.reduced, map: "sea", player: () => this.player, net: () => h.net, labelScale: () => this.rig.labelScale });
    let routeGrids: ReturnType<typeof gridOfCells>[] | null = null;
    this.awayRoute = new AwayRoute({ scene: this, atlas: h.atlas, reduced: h.reduced, map: "sea", player: () => this.player, grids: () => (routeGrids ??= [gridOfCells(seaWalkGrid(8))]) });
    this.housing = new SeaHousing({
      scene: this,
      atlas: h.atlas,
      hub: h.hub,
      reduced: h.reduced,
      map: this.map,
      atmos: () => this.atmos,
      channel: () => (h.net.online ? h.net.channel : null),
      hour: () => this.hour,
      hourForced: this.hourOverride.hour !== undefined,
      warp: (x, y) => {
        const now = this.time.now;
        if (this.rest) this.leaveRest(now);
        if (this.player.sitting) this.player.stand(now, this.seatReq);
        this.player.warp(x, y, now, null);
        h.net.warp(x, y);
        this.rig.recenter();
      },
      active: () => !this.cleaned && !this.parked && !this.locked && !this.covered,
      look: () => this.player.view.wearing,
      body: () => this.player.view.bodyId,
      toast: (m) => this.toast(m),
      act: (kind) => h.net.act(kind),
    });
    yield;
    // 11/17 맵 컨셉 (겨울·크리스마스판 그림·장식 — 조금씩)
    this.concept = new SeaConceptDecor(this, { reduced: h.reduced, map: this.map, ships: () => this.ships });
    this.atmos.setSnowy(isSnowy(concept0));
    yield* this.concept.apply(concept0);
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
    // 11/17 가진 갈매기 과자 (던지기 안내)
    void gullApi.get().then(publishSnacks, () => {});
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
        this.rides?.onSeat(seatId, sid);
        this.kayaks?.onSeat(seatId, sid);
        this.stars?.onSeat(seatId, sid);
        this.forage.f.seatChanged(seatId, sid);
        this.onSeat(seatId, sid);
      },
      onSeatDenied: (seatId) => {
        if (this.rides?.onSeatDenied(seatId)) return;
        if (this.kayaks?.onSeatDenied(seatId)) return;
        if (this.stars?.onSeatDenied(seatId)) return;
        if (this.forage.f.seatDenied(seatId)) return;
        if (this.rest?.id === seatId) {
          // 11/16 사용자 "빈 자리인데 누가 먼저 앉았다고 해요": 내 좌석표에 주인이 없으면(서버가 앞 자리를 늦게 놓은 경우 등) 한 번 더 청해 봐요.
          // 진짜 주인이 있을 때만 "누가 먼저"를 띄워요
          const owner = this.seats.get(seatId);
          if (owner === undefined && this.restRetry !== seatId) {
            this.restRetry = seatId;
            this.time.delayedCall(400, () => {
              if (!this.cleaned && this.rest?.id === seatId && this.host.net.online) this.host.net.sit(seatId);
            });
            return;
          }
          this.restRetry = null;
          this.leaveRest(this.time.now);
          this.toast(owner !== undefined ? "누가 먼저 앉았어요" : "자리를 잡지 못했어요. 다시 눌러 주세요");
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
      onFirework: (sid, item, x, y, wait) => this.fw().launch(item, x, y, this.rig.frameView(this.view), false, this.remotes.get(sid)?.name ?? "", wait),
      onAct: (sid, kind) => {
        if (kind === "lamp") this.housing?.onLampAct();
        // 11/17 같은 바닷가 사람이 갈매기에게 과자를 던졌어요 → 우리 화면 갈매기도 그 앞으로 몰려가요
        if (kind === "gull" || kind === "gullHot") {
          const r = this.remotes.get(sid);
          if (r?.visible) {
            // r3 우리 화면에서도 그 사람이 보고 있는 방향 앞으로 (갈매기 자리는 화면마다 달라요 — 같은 규칙으로 몰려와요)
            const t = this.snackTarget(r.x, r.y, r.view.dir);
            this.map.feedGulls(r.x, r.y, t.x, t.y, kind === "gullHot", this.time.now);
          }
        }
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
      // 11/16 바닷가 매점 술·음료·오징어구이 효과 (캠핑장 바베큐와 같은 효과 — 같은 바닷가 사람에게)
      onBbq: (sid, item, until, lv, at) => this.food.onBbq(sid, sid === this.host.net.mySid, item, until, lv, at),
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
    r.view.lieCover = "towel"; // 11/16 바닷가에서 눕는 곳은 선베드뿐 → 이불 대신 하늘빛 수건
    r.lieFront = LOUNGER_LIE_FRONT; // 선베드(받침 − 4 depth) 앞에 누워요
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
      r.applyFood(foodOfPeer(p)); // 11/16 매점 효과 (커지기·빨라지기·취기)
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
    // 11/16 사냥터·미니게임·집으로 가기 직전: 자리에서 일어난다 (lib/rideGate)
    on.push(bridge.on("player:stand", () => standForGate(this.player, this.time.now, this.seatReq)));
    // 11/16 바다 보기 켜기·끄기 (「바다 보기」 버튼·V)
    on.push(bridge.on("sea:view", () => this.toggleView()));
    // 11/17 r2 F 키·과자 칸의 [과자 던지기] 버튼 (E는 탈것·자리·자판기 같은 상호작용만 — 사용자: E가 겹쳐 카약을 못 탔어요)
    on.push(
      bridge.on("sea:snack:throw", () => {
        if (this.covered || this.locked || this.host.hub.isBlocked) return;
        // 11/17 과자가 없으면 조용히 아무 일 없어요 (「자판기에서 사 와요」 안내는 뺐어요 — 사용자 요청)
        this.throwSnack();
      }),
    );
    // 11/16 r19 바라보는 장면에서 Esc (lib/viewKeyGuard)
    on.push(bridge.on("view:exit", () => this.leaveView()));
    // 11/16 매점에서 샀어요: 증서를 실시간 서버로 보내고 먹어요
    on.push(
      bridge.on("camp:bbq:eat", ({ item, until, grant, lv, at, stand }) => {
        if (this.cleaned || (stand !== "kiosk" && stand !== "seaVend")) return;
        this.host.net.bbq(grant);
        this.food.eat(item, until, lv, at);
      }),
    );
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
        // 11/19 마을·캠핑장 친구 모두 버스로 (캠핑장은 마을 정류장을 거쳐 이어 타요 — lib/friendRoute). 몸이 커져 있으면 버스를 못 타요
        // 11/26 door: 집에서 나와 그 집 문 앞으로 (창밖 연출 없는 워프라 몸 크기를 보지 않는다. 이 맵이면 그 터 앞으로)
        const route = friendRoute("sea", map ?? "village", door !== undefined ? 1 : myBig());
        if (route.do === "warp" && door !== undefined) bridge.emit("sea:lot", { lot: door });
        else if (route.do === "warp") this.goToFriend(sid, name, x, y, tp);
        else if (route.do === "block") bridge.emit("friend:notice", { message: route.message });
        else {
          const next = nextAfterVillage(route);
          this.host.goVillage({ sid, name, x, y, ...(next ? { next } : {}), ...(tp ? { tp } : {}), ...(door !== undefined ? { door } : {}) });
        }
      }),
    );
    // 11/20 운영자 순간이동 반짝임 (이 맵에 있을 때만)
    on.push(bridge.on("tp:fx", ({ x, y, k, map }) => map === "sea" && !this.cleaned && !this.parked && playTeleportFx(this, x, y, k, this.host.reduced)));
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
    on.push(bridge.on("peers:ask", () => bridge.emit("peers:list", peerList(this.remotes.values(), "sea"))));
    // 11/17 맵 컨셉 (마을과 같은 방식): 주소 시험 값(?concept=, 실서버는 막힘)이 있으면 그것만, 없으면 관리자가 고른 값을 따라 바로 바꿔요
    const conceptQa = parseConceptOverride(window.location.search);
    if (!conceptQa) {
      on.push(bridge.on("map:concept", ({ concept }) => !this.cleaned && this.applyConcept(concept)));
      on.push(startMapConceptSync());
      const last = bridge.last("map:concept")?.concept;
      if (last && last !== this.concept?.current) this.applyConcept(last);
    }
    on.push(
      bridge.on("firework:fire", ({ item }) => {
        if (fireworkShowMs(item) > 0) return; // 광역 불꽃쇼는 서버가 돌려준 때에 (onFirework)
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

  /** 11/17 판이 바뀌었어요 → 그림·장식·눈 날씨를 바로 */
  private applyConcept(c: MapConcept): void {
    if (!this.concept || c === this.concept.current) return;
    this.concept.applyNow(c);
    this.atmos.setSnowy(isSnowy(c));
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
    // 11/16 r13 튜브·제트스키 위: E = 내리기만 (앉기·점프·펫은 없어요)
    if (pl.inBoat) {
      if (a === "interact") {
        if (this.kayaks?.isRiding) this.kayaks.interact();
        else this.rides?.interact();
      }
      // 11/26 카약에 같이 탔으면 X·터치 [내리기] = 내리기
      else if (a === "sit" && this.kayaks?.passengerOff()) return;
      else if (a === "wave" || a === "cheer") this.doAct(a);
      else this.expr.key(a, now);
      return;
    }
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
    // 11/17 유령선: 상인 앞이면 장터 창, 헤엄치다 사다리 앞이면 오르기
    if (this.ghost?.interact()) return;
    // 11/16 r13 가까운 빈 튜브·제트스키가 있으면 타기 (헤엄치는 중에도 — 잠수보다 먼저)
    if (!moving && (this.rides?.interact() || this.kayaks?.interact() || this.stars?.interact())) return;
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
    if (this.life?.talk()) return;
    const seat = moving ? null : seaPickSeat(pl.x, pl.y, occupied, mySid);
    // 11/16 쉴거리 자리 (선베드·돗자리)가 좌석보다 가까우면 그것부터
    const rest = moving ? null : this.pickRest(pl.x, pl.y);
    if (rest && (!seat || Math.hypot(rest.x - pl.x, rest.y - pl.y) < Math.hypot(seat.x - pl.x, seat.y - pl.y))) {
      const ob = this.nearestObject(pl.x, pl.y);
      if (!ob || reachDist(ob, pl.x, pl.y) > Math.hypot(rest.x - pl.x, rest.y - pl.y)) {
        this.useRest(rest, now);
        return;
      }
    }
    const obj = this.nearestObject(pl.x, pl.y);
    const sd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : Infinity;
    const od = obj ? reachDist(obj, pl.x, pl.y) : Infinity;
    // 11/16 갯바위 낚시 자리가 더 가까우면 그것부터 (캠핑장과 같아요)
    const fo = this.forage.nearest(pl.x, pl.y);
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(sd, od)) {
      this.forage.f.use(fo);
      return;
    }
    if (obj && od <= sd) this.useObject(obj);
    else if (seat) this.sitOn(seat, now);
  }

  /** 11/16 가까운 빈 쉴거리 자리 (반지름 22 — 선베드 발치·돗자리 가장자리에서도) */
  private pickRest(x: number, y: number): SeaRestSeat | null {
    const net = this.host.net;
    const mine = net.online ? net.mySid : null;
    let best: SeaRestSeat | null = null;
    let bd = 22;
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
    if (r.kind === "lounger") pl.attach("lie", r.x, r.y, r.y + LOUNGER_LIE_FRONT, now, this.seatReq, r.id);
    // 11/16 r12 해먹: 마을 해먹과 같은 자세 (천 안에 누워 흔들흔들)
    else if (r.kind === "hammock") pl.attach("hammock", r.x, r.y - HAMMOCK_LIFT, r.y - HAMMOCK_LIFT + HAMMOCK_FRONT, now, this.seatReq, r.id);
    else {
      pl.warp(r.x, r.y, now, this.seatReq);
      pl.dir = r.facing;
      pl.sit(null, now, null);
    }
    this.rest = r;
    this.restRetry = null;
    const net = this.host.net;
    if (net.online) net.sit(r.id);
  }

  /** 쉴거리 자리에서 일어나기 (서버 좌석은 다음 MOVE가 놓아요) */
  private leaveRest(now: number): void {
    const r = this.rest;
    if (!r) return;
    this.rest = null;
    const pl = this.player;
    if (r.kind === "lounger") {
      // 11/16 선베드는 막혀 있어요 → 일어나면 발치 앞으로 내려서요
      pl.leaveAnchor(now);
      pl.warp(r.x, r.y - SEA_LOUNGER_LIE_DY + LOUNGER_STAND_DY, now, null);
    } else if (r.kind === "hammock") {
      // 해먹 앞으로 내려서요
      pl.leaveAnchor(now);
      pl.warp(r.x, r.y + 8, now, null);
    } else if (pl.sitting) pl.stand(now, null);
  }

  /** 지금 앉은 자리에서 볼 수 있는 바다 장면 (없으면 null) */
  private viewKindNow(): { kind: ViewKind; group: string; mat: number; variant: number } | null {
    const pl = this.player;
    // 11/16 등대 꼭대기에 올라가 있는 동안 (움직이면 내려와요)
    if (this.lookout) return this.scopeLook !== null ? { kind: "binocular", group: "scope", mat: 0, variant: this.scopeLook } : { kind: "lighthouse", group: "lighthouse", mat: 0, variant: 0 };
    // 11/16 r19 동전 망원경 앞에 서 있으면 (낮·밤 모두) 바다 보기 버튼·V → 망원경 속 장면 (등대 장면이 아니에요)
    const spot = this.stars?.viewSpot();
    if (spot) return { kind: "binocular", group: "scope", mat: 0, variant: Math.max(0, SEA_SCOPES.indexOf(spot)) };
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
      const lying = this.viewFore?.ids.map((id) => this.seats.has(id));
      const L = this.atmos.levels;
      sv.frame({ now, dt, levels: L, hour: this.hour, dusk, tide: this.tide, fade, sitters: this.viewSitters(v.group), lying, ghost: ghostShipNight(Date.now()), fogLamp: Math.min(1, L.fog * 1.2) * 0.8 });
      this.cameras.main.setVisible(!(sv.opaque && fade >= 1));
    } else sv.idle(dt);
    // 11/16 r19 켜져 있는 동안 + 검은 막이 걷히는 동안까지 단축키를 막아요
    const busy = this.viewOn || sv.busy;
    if (busy !== this.viewBusy) {
      this.viewBusy = busy;
      bridge.emit("view:busy", { on: busy });
    }
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

  /**
   * 11/16 벤치 바다 보기: 벤치 바로 앞(남쪽) 선베드 줄과 파라솔 — 보이는 부채꼴 안만 (seaViewFore, 순수 계산 — seaView.test)
   */
  private viewFore: { spec: SeaViewFore; ids: string[] } | null = null;
  private benchFore(group: string): { spec: SeaViewFore; ids: string[] } | null {
    const f = SEA_FURNITURE.find((q) => q.id === group);
    return f ? seaViewFore(f.x, f.y) : null;
  }

  /** 11/16 안개 무적: 안개가 짙으면 30~50초마다 한 번 (등대에서 멀수록 작게) */
  private foghorn(now: number): void {
    const fog = this.atmos.levels.fog;
    if (fog < 0.3) {
      this.foghornAt = 0;
      return;
    }
    if (this.foghornAt === 0) this.foghornAt = now + 4000 + Math.random() * 8000;
    if (now < this.foghornAt) return;
    this.foghornAt = now + 30000 + Math.random() * 20000;
    const d = Math.hypot(this.player.x - SEA_LIGHTHOUSE.x, this.player.y - SEA_LIGHTHOUSE.y);
    this.host.sfx.foghorn((this.lookout ? 1 : Math.max(0.3, 1 - d / 1200)) * Math.min(1, fog * 1.4));
  }

  /** 「바다 보기」 켜기·끄기 (React 버튼·V) */
  private toggleView(): void {
    if (this.cleaned || this.covered || this.locked) return;
    const v = this.viewKindNow();
    if (!v || this.viewOn) return this.leaveView();
    if (v.group === "scope") {
      // 망원경으로 보는 바다: 움직이면 내려와요 (등대 꼭대기와 같아요)
      this.lookout = true;
      this.scopeLook = v.variant;
      this.lookoutAt = { x: this.player.x, y: this.player.y };
    }
    this.viewOn = true;
    this.viewAt = this.time.now;
    this.viewFore = v.kind === "beach" ? this.benchFore(v.group) : null;
    const at = this.rest ?? this.player.seat;
    this.seaView?.begin(v.kind, v.variant, v.mat, this.viewFore?.spec ?? null, at ? seaViewLandmarks(at.x, at.y) : null, at ? { x: at.x, y: at.y } : null);
    bridge.emit("view:mode", { mode: "sea" });
  }

  private leaveView(): void {
    this.lookout = false;
    this.scopeLook = null;
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

  /** E로 쓰는 것. 지금은 버스만 움직이고, 나머지는 곧 열린다는 안내만 (다음 차수) */
  private useObject(o: SeaInteractable): void {
    const pl = this.player;
    const now = this.time.now;
    switch (o.kind) {
      case "bus":
        pl.faceTo(o.x, o.y - 10, now);
        // 11/19 바베큐로 커진 동안에는 버스에도 못 타요 (마을·캠핑장 정류장과 같은 규칙)
        if (myBig() > 1) {
          this.toast(BIG_RIDE_TOAST);
          break;
        }
        this.boardBus();
        break;
      case "sign":
        this.toast(`「마을행」이라고 적혀 있어요. 버스는 ${keyJosa("E", "를")} 누르면 와요.`);
        break;
      case "lot":
      case "realty":
        // 11/16 포구 오두막: 빈 터·부동산 → 포구 부동산 창, 오두막 → 그 집 안으로 (seaHousing)
        this.housing?.use(o);
        break;
      case "snackVend":
        // 11/17 r2 과자 자판기 (갈매기 과자·매운 새우 과자) → UI 창
        if (this.rest) this.leaveRest(this.time.now);
        if (this.player.sitting) this.player.stand(this.time.now, this.seatReq);
        this.player.faceTo(o.x, o.y - 10, this.time.now);
        bridge.emit("sea:snack:vend");
        break;
      case "kiosk":
      case "vending":
        // 11/16 포구 매점(r12 먹거리만)·음료 자판기(술·음료) — 캠핑장 바베큐 창, 사면 camp:bbq:eat으로 돌아와요
        if (this.riding.on) {
          this.toast(RIDING_EAT_TOAST);
          break;
        }
        if (this.rest) this.leaveRest(this.time.now);
        if (this.player.sitting) this.player.stand(this.time.now, this.seatReq);
        this.player.faceTo(o.x, o.y - 10, this.time.now);
        bridge.emit("camp:bbq:open", { stand: o.kind === "kiosk" ? "kiosk" : "seaVend" });
        break;
      case "lighthouse":
        // 11/16 밤이면 꼭대기 등불도 켜요 (채널에서 그날 처음이면 「오늘의 등대지기」 — seaHousing)
        this.housing?.use(o);
        // 11/16 등대 오르기: 꼭대기에서 바다를 넓게 봐요 (움직이거나 돌아가기·V로 내려와요)
        if (this.rest) this.leaveRest(now);
        if (pl.sitting) pl.stand(now, this.seatReq);
        this.lookout = true;
        this.scopeLook = null;
        this.lookoutAt = { x: pl.x, y: pl.y };
        this.toggleView();
        break;
      case "bungeo":
        // 11/23 골목 붕어빵 수레 (회차마다 자리가 바뀌어 바닷가에 설 때도 있다) — 말을 건 자리를 같이 (서버가 수레 가까이인지 본다)
        if (this.rest) this.leaveRest(now);
        if (pl.sitting) pl.stand(now, this.seatReq);
        pl.faceTo(o.x, o.y - 10, now);
        bridge.emit("portal:open", { kind: "bungeo", at: { map: "sea", x: Math.round(pl.x), y: Math.round(pl.y) } });
        break;
      case "keeper":
        // 11/16 등대지기: 다음 갯벌 열리는 때 셋
        this.toast(keeperTideText(Date.now()));
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
    // 오브젝트를 탭: 가까이 서 있으면 E와 같아요
    const pl = this.player;
    let best: SeaInteractable | null = null;
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
    this.rides?.dismount();
    this.kayaks?.dismount();
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
  private goToFriend(sid: Sid, name: string, fx: number, fy: number, tp?: true): void {
    const net = this.host.net;
    if (this.cleaned || !net.online || this.locked) return;
    const notice = (message: string) => bridge.emit("friend:notice", { message });
    const r = this.remotes.get(sid);
    const live = r && r.name === name ? r : null;
    if (live?.away) return notice(tp ? STAFF_TP_INSIDE_MSG : `${name}님은 지금 실내에 있어요.`);
    const at = live ? { x: live.x, y: live.y } : { x: fx, y: fy };
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
    // 11/16 r19 움직이는 배 몸통 · 물에 있는 다른 사람 (이번 프레임 — 놀거리·헤엄이 같이 써요)
    this.shipHullsNow = shipHulls(Date.now(), this.atmos.levels.darkness > 0.3);
    this.updateSwimmers(dt);
    // 11/16 r13 튜브·제트스키 조종 (Player.update는 탄 동안 움직이지 않아요)
    this.rides?.steer(this.move, dt);
    this.kayaks?.steer(this.move, dt);
    this.ghost?.update(now, this.atmos.levels.darkness, this.rig.frameView(this.view), this.rig.labelScale);
    this.deckGuard();
    this.drunkGuard(now);
    this.shipPush(now);
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
    // 11/16 r12 해변 모닥불 통나무에 앉으면 (불이 켜진 해 질 녘·밤) 마을 모닥불과 같은 불멍 구도. 불 소리는 거리에 따라
    const fireLit = this.map.bonfireLit;
    const fire = fireLit && pl.state === "sitChair" && pl.seat ? seaCampfireOfSeat(pl.seat.id) : null;
    if (fire && this.campfire && this.campfire.active?.id !== fire.id) {
      this.campfire.enter(fire);
      bridge.emit("view:mode", { mode: "campfire" });
    } else if (!fire && this.campfire?.active) this.leaveCampfire();
    this.campfire?.update(now, dt);
    const nf = fireLit ? nearestCampfire(pl.x, pl.y, [SEA_CAMPFIRE]) : null;
    this.host.sfx.campfire(nf ? campfireLevel(nf.dist, !!fire) : 0);
    // 해먹에 누가 누웠으면 기둥만 (줄·천은 누운 사람 그림이)
    this.map.setHammockBusy(this.rest?.kind === "hammock" || this.seats.has("pH"));
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    this.expr.update(now);
    this.bungeo?.update(now);
    this.meScreen.update(pl.x, pl.y);
    pl.view.sync(now, s);
    const L = this.atmos.levels;
    this.actors.length = 0;
    this.actors.push({ x: pl.x, y: pl.y });
    for (const r of this.remotes.values()) if (r.visible && !r.away) this.actors.push({ x: r.x, y: r.y });
    this.life?.movers(this.actors);
    const dusk = duskWeight(this.hour);
    if (this.tone) this.tone.dusk = dusk;
    this.housing?.update(now, L.darkness, L.fog, s);
    this.map.update(now, dt, view, { hour: this.hour, darkness: L.darkness, rain: L.rain, fog: L.fog, tide: this.tide, trend: this.trend, actors: this.actors, dusk });
    this.concept?.update(view, this.breatherFn);
    this.awayRoute?.update(now, view, s, this.locked);
    this.riding.update();
    publishRide(pl, this.riding.on, this.rides?.kind ?? (this.kayaks?.isRiding ? "kayak" : null)); // 11/16 탄 것·앉은 자리 → UI (lib/rideGate). 튜브·제트스키 같은 새 자세도 저절로 막힌다
    // 11/16 쉴거리 자리: 자세가 풀리면(움직임·일어남) 놓아요
    // 11/16 등대 꼭대기에서 움직이면 내려와요
    if (this.lookout && Math.hypot(pl.x - this.lookoutAt.x, pl.y - this.lookoutAt.y) > 4) this.leaveView();
    if (this.rest && (this.rest.kind === "lounger" ? pl.state !== "lie" : this.rest.kind === "hammock" ? pl.state !== "hammock" : pl.state !== "sitGround" || Math.hypot(pl.x - this.rest.x, pl.y - this.rest.y) > 3)) {
      const r = this.rest;
      this.rest = null;
      // 움직여서 일어났으면(선베드 위 앵커에서 풀림) 막는 상자 밖 발치로
      if (r.kind === "lounger" && pl.state !== "lie") pl.warp(r.x, r.y - SEA_LOUNGER_LIE_DY + LOUNGER_STAND_DY, now, null);
    }
    this.updateSeaView(now, dt, dusk);
    this.forage.f.update(dt, view, s);
    this.life?.update(dt, view, s);
    this.rides?.update(dt);
    this.kayaks?.update(dt);
    this.stars?.update();
    this.ships?.update(now, L.darkness, dusk, pl.x);
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
    // 11/16 안개 낀 날엔 등대가 스스로 불을 켜고(SeaMap) 가끔 무적이 울려요
    this.foghorn(now);
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
    const free = !pl.sitting && !this.rest && !this.locked && pl.state !== "lie";
    let seat: Seat | null = free ? seaPickSeat(pl.x, pl.y, net.online ? this.seats : EMPTY_SEATS, net.online ? net.mySid : null) : null;
    // 11/16 쉴거리 자리(선베드·파라솔·돗자리)가 더 가까우면 그 자리 안내 (사용자: 파라솔 앞에서 앉기 안내가 안 떠요)
    const rest = free ? this.pickRest(pl.x, pl.y) : null;
    const restNear = !!rest && (!seat || Math.hypot(rest.x - pl.x, rest.y - pl.y) < Math.hypot(seat.x - pl.x, seat.y - pl.y));
    if (restNear) seat = null;
    const id = restNear ? rest!.id : seat ? seat.id : null;
    if (id !== this.nearSeatId) {
      this.nearSeatId = id;
      bridge.emit("seat:near", restNear ? { seatId: rest!.id, kind: "bench" } : seat ? { seatId: seat.id, kind: seat.id.includes("-") ? "bench" : "chair" } : null);
    }
    const sittingFor = pl.sitting && pl.view.sitSince > 0 ? now - pl.view.sitSince : -1;
    const obj = !pl.sitting && !this.locked ? this.nearestObject(pl.x, pl.y) : null;
    const objSd = seat ? Math.hypot(seat.x - pl.x, seat.y - pl.y) : restNear ? Math.hypot(rest!.x - pl.x, rest!.y - pl.y) : Infinity;
    const objOd = obj ? reachDist(obj, pl.x, pl.y) : Infinity;
    // 바닥 영역(버스 정차 칸)은 넓어서 안내를 내 발밑에
    let other = obj && objOd <= objSd ? { x: obj.zone ? pl.x : obj.x, y: (obj.zone ? pl.y : obj.y) + 2, text: `${this.seatHint.prefix}${obj.label}` } : null;
    // 쉴거리 자리 안내는 자리 위에 (라벨 depth라 파라솔 갓보다 위에 그려져요)
    if (!other && restNear) other = { x: rest!.x, y: rest!.y - 4, text: `${this.seatHint.prefix}${rest!.kind === "lounger" ? "눕기" : "앉기"}` };
    // 11/16 갯바위 낚시 자리·갯벌 구멍 안내 ("E 낚시하기" · "E 갯벌 캐기", 물때로 못 쓰면 그 까닭 — seaForage tideHint)
    const fo = !pl.sitting && !this.locked ? this.forage.nearest(pl.x, pl.y) : null;
    const foHint = fo ? this.forage.tideHint(fo) : null;
    if (fo && Math.hypot(fo.x - pl.x, fo.y - pl.y) <= Math.min(objSd, objOd)) other = { x: fo.x, y: fo.y + 2, text: foHint ?? `${this.seatHint.prefix}${fo.label}` };
    // 11/16 물속: 잠수·떠오르기 안내 (마을과 같은 글). 물에 잠긴 갯벌 구멍 위에선 그 안내를 먼저
    if ((pl.state === "swim" || pl.state === "dive") && !foHint) other = { x: pl.x, y: pl.y + 2, text: `${this.seatHint.prefix}${pl.state === "swim" ? "잠수" : "떠오르기"}` };
    // 11/16 r13 튜브·제트스키 타기·내리기 안내 (가까우면 잠수 안내보다 먼저)
    const lifeHint = !pl.sitting && !this.rest && !this.locked ? this.life?.hint(this.seatHint.prefix) : null;
    if (lifeHint) other = lifeHint;
    const rideHint = !this.locked ? (this.rides?.hint(this.seatHint.prefix) ?? this.kayaks?.hint(this.seatHint.prefix) ?? this.stars?.hint(this.seatHint.prefix) ?? null) : null;
    if (rideHint) other = rideHint;
    // 11/17 유령선 상인·밧줄 사다리 안내
    const ghostHint = !this.locked ? (this.ghost?.hint(this.seatHint.prefix) ?? null) : null;
    if (ghostHint) other = ghostHint;
    const bench = pl.state === "sitChair" && pl.seat && SEA_MULTI_SEAT.has(pl.seat.furnitureId);
    const keys = this.seatHint.prefix === "E ";
    const standText = bench ? (keys ? "←→ 옆자리 · ↑↓ 일어나기 · T 벤치 상태" : "좌우로 옆자리 · 위아래로 일어나기") : pl.state === "sitChair" && keys ? "이동하면 일어나요 · T 상태 고르기" : null;
    this.seatHint.update(other ? null : seat, pl, sittingFor, false, labelScale, other, standText);
    // 11/26 오두막 문 「E 들어가기」 안내가 떠 있으면 그 터의 앞마당 땅 문패를 흐린다 (9번 터 — 안내와 겹쳤다)
    this.housing?.focusDoor(obj?.kind === "lot" && obj.lot && other && other.x === obj.x && other.y === obj.y + 2 ? obj.lot : null);
    this.publishSnackCan();
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
      this.bungeo?.addLights(lit);
      this.life?.addLights(lit);
      this.goblin?.addLights(lit);
      // 11/16 r19 오징어잡이배 · 등대 빛줄기도 밤 어둠을 밝혀요
      this.ships?.addLights(lit, L.darkness);
      this.ghost?.addLights(lit, L.darkness);
      this.housing?.addLights(lit);
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

  /**
   * 11/16 r17 사용자 "난간을 스치면 데크 안으로 튀어 들어가요" — 데크 안/밖을 기억해 두고(순간이동은 새로 정해요),
   * 머리(백사장 쪽)가 아닌 곳으로 데크 안팎이 바뀌면 바로 앞 자리로 되돌려요. 데크 밖이면 데크 몸 전체와 부딪혀요(deckBlocks)
   */
  private deckSide: boolean | null = null;
  private deckLast = { x: 0, y: 0 };
  private deckGuard(): void {
    const pl = this.player;
    // 탄 동안·앉은 동안(끝 걸터앉기는 데크 가장자리 바깥에 앉아요)·11/17 유령선 위는 보지 않아요 — 일어서면·내리면 새로 정해요
    if (pl.inBoat || pl.sitting || this.ghost?.aboard) {
      this.deckSide = null;
      return;
    }
    const inDeck = (x: number, y: number) => y > SEA_FLAT_Y0 + 4 && SEA_DECKS.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
    const on = SEA_DECKS.some((r) => pl.x >= r.x && pl.x <= r.x + r.w && pl.y >= r.y && pl.y <= r.y + r.h);
    const jump = Math.hypot(pl.x - this.deckLast.x, pl.y - this.deckLast.y) > 24;
    if (this.deckSide === null || jump) this.deckSide = on;
    else if (this.deckSide !== on) {
      // 머리 쪽(백사장 줄)에서 오르내리는 건 괜찮아요. 그 밖은 난간을 스치다 튄 것 → 되돌려요
      const sideways = this.deckSide ? !inDeck(pl.x, pl.y) && pl.y > SEA_FLAT_Y0 + 4 : inDeck(pl.x, pl.y);
      if (sideways) {
        // r18 사용자 "가장자리를 비스듬히 가면 튀어요" → 통째로 되돌리지 않고, 넘어간 축만 되돌려요 (옆으로 미끄러지는 건 그대로)
        const sideOf = (x: number, y: number) => (this.deckSide ? inDeck(x, y) || y <= SEA_FLAT_Y0 + 4 : !inDeck(x, y));
        const fix = [
          { x: pl.x, y: this.deckLast.y },
          { x: this.deckLast.x, y: pl.y },
          { x: this.deckLast.x, y: this.deckLast.y },
        ].find((q) => sideOf(q.x, q.y));
        // 11/18 지난 자리도 이미 반대편이면(물때·밀려남으로 데크 모양 밖에서 시작) 되돌릴 곳이 없다 → 지금 편을 받아들인다 (운영 오류 deckGuard 'x')
        if (fix) {
          (pl.sprite.body as Phaser.Physics.Arcade.Body).reset(fix.x, fix.y);
          this.deckLast.x = fix.x;
          this.deckLast.y = fix.y;
          return;
        }
      }
      this.deckSide = on;
    }
    this.deckLast.x = pl.x;
    this.deckLast.y = pl.y;
  }

  /**
   * 11/17 사용자: 술에 취한 채로는 바다에 못 들어가요. 물가에서 들어서는 걸음은 되돌리고, 물에 있는 동안 취하면(물이 차오르거나 놀거리 위)
   * 놀거리에서 내리고 가까운 뭍으로 올려 보내요. 취기는 내 효과(foodState)로 봐요 — 다른 사람 화면은 그 사람 자리를 따라가요
   */
  private drunkDry: { x: number; y: number } | null = null;
  private drunkToastAt = -Infinity;
  private drunkGuard(now: number): void {
    const pl = this.player;
    if (!seaDrunkBlocked(myFood().drunk, Date.now()) || pl.sitting || pl.anchored) {
      this.drunkDry = null;
      return;
    }
    if (pl.inBoat) {
      this.rides?.dismount();
      this.kayaks?.dismount();
      this.drunkToast(now);
      return;
    }
    const step = seaDrunkStep(pl.x, pl.y, this.drunkDry, this.tide, seaStandable);
    if (step.kind === "ok") {
      this.drunkDry = { x: pl.x, y: pl.y };
      return;
    }
    if (step.kind === "stuck") return;
    if (step.kind === "back") (pl.sprite.body as Phaser.Physics.Arcade.Body).reset(step.x, step.y);
    else {
      pl.warp(step.x, step.y, now, this.seatReq);
      this.host.net.warp(step.x, step.y);
      this.rig.recenter();
      if (!this.host.reduced) this.fx.splash(step.x, step.y + 6);
    }
    this.drunkDry = { x: step.x, y: step.y };
    this.drunkToast(now);
  }
  private drunkToast(now: number): void {
    if (now - this.drunkToastAt < 3000) return;
    this.drunkToastAt = now;
    this.toast(SEA_DRUNK_MSG);
  }

  /**
   * 11/17 던질 과자 (손에 든 것, 없으면 다른 것) — 던질 수 있는 자세일 때만.
   * r2 사용자: 갈매기가 날아다니는 백사장·갯벌·선착장·방파제 어디서든 (예전엔 갈매기가 170px 안에 있을 때만 — 백사장·방파제에선 거의 못 던졌어요).
   * r2 E와 나눠 F 키·과자 칸 버튼으로만 던져요 (E 상호작용과 겹치지 않아 가까운 자리·탈것과 상관없어요)
   */
  private snackReady(): SnackKind | null {
    const s = bridge.last("sea:gull:snacks");
    const pl = this.player;
    if (!s || (s.plain <= 0 && s.spicy <= 0)) return null;
    if (pl.inBoat || pl.inWater || pl.sitting || pl.anchored || pl.airborne || this.rest) return null;
    if (!seaSnackZone(pl.x, pl.y) || !this.map.nearestGull(pl.x, pl.y)) return null;
    const hand = s.hand;
    return s[hand] > 0 ? hand : hand === "plain" ? "spicy" : "plain";
  }
  private snackAt = -Infinity;
  /** 과자가 떨어지는 자리: 11/17 r3 내가 보고 있는 방향으로 던져요 (사용자 요청 — 예전엔 가장 가까운 갈매기 쪽). 갈매기들이 그 자리로 몰려와요 */
  private snackTarget(x: number, y: number, dir: number): { x: number; y: number } {
    const d = dir === DIR.left ? [-1, 0] : dir === DIR.right ? [1, 0] : dir === DIR.up ? [0, -1] : [0, 1];
    return { x: x + d[0] * 48, y: y + d[1] * 36 + 6 };
  }
  /** 지금 던질 수 있는 과자를 UI(과자 칸 [과자 던지기])에 알려요 — 바뀔 때만 */
  private snackCan: SnackKind | null | undefined = undefined;
  private publishSnackCan(): void {
    const k = !this.locked && !this.covered ? this.snackReady() : null;
    if (k === this.snackCan) return;
    this.snackCan = k;
    bridge.emit("sea:snack:can", k ? { kind: k } : null);
  }
  /** 11/17 갈매기에게 과자 던지기 (서버가 과자를 쓰고 깃털을 굴려요) — 던졌으면 true (F 키·과자 칸 버튼) */
  private throwSnack(): boolean {
    const kind = this.snackReady();
    if (!kind) return false;
    const now = this.time.now;
    // 11/17 r3 실시간 서버가 동작(act)을 2초에 한 번만 다른 사람에게 넘겨요 — 던지는 간격도 2초로 맞춰 다른 화면에서 빠지는 던지기가 없게
    if (now - this.snackAt < 2000) return true;
    this.snackAt = now;
    const pl = this.player;
    // r2 던지자마자 숫자를 줄여요 (서버 답이 오면 그 값으로 맞춰요)
    const last = bridge.last("sea:gull:snacks");
    if (last) bridge.emit("sea:gull:snacks", { ...last, [kind]: Math.max(0, last[kind] - 1) });
    const t0 = this.snackTarget(pl.x, pl.y, pl.dir);
    pl.faceTo(t0.x, t0.y, now);
    void gullApi.throw(kind).then(
      (r) => {
        if (this.cleaned) return;
        publishSnacks(r);
        const t = this.snackTarget(pl.x, pl.y, pl.dir);
        this.map.feedGulls(pl.x, pl.y, t.x, t.y, kind === "spicy", this.time.now);
        this.doAct(kind === "spicy" ? "gullHot" : "gull");
        if (r.feather) {
          const id = r.feather;
          this.time.delayedCall(1700, () => {
            if (this.cleaned) return;
            bridge.emit("forage:pop", { itemId: id, sparkle: id === "d_redfeather" });
            this.toast(FEATHER_MSG[id] ?? "갈매기가 깃털을 떨어뜨렸어요.");
          });
        }
      },
      (e) => {
        this.toast(errorMessage(e) || SNACK_NONE_MSG);
        void gullApi.get().then(publishSnacks, () => {});
      },
    );
    return true;
  }

  /** 11/17 대 있는 유령선 몸 (놀거리가 부딪혀 튕겨요 — 큰 배처럼) */
  private ghostHull(): SeaHull[] {
    const b = this.ghost?.hullBox();
    return b ? [{ id: "ghost", box: b, empty: false, vx: 0, vy: 0, ship: { heavy: "big" } }] : [];
  }

  /** 11/16 r19 지금 지나가는 배 몸통 (프레임마다) */
  private shipHullsNow: ShipHull[] = [];

  /**
   * 11/16 r19 헤엄치다 움직이는 배에 닿으면: 겹친 만큼 물 쪽으로 밀려나고 (데크·땅으로는 안 밀어요) 세게 튕겨요.
   * 배가 나에게 다가와도 (가만히 있어도) 밀려나요 — 배 속도만큼 서로 다가간 것으로 쳐요
   */
  private shipPush(now: number): void {
    const pl = this.player;
    if (!pl.inWater || pl.inBoat) return;
    const body = pl.sprite.body as Phaser.Physics.Arcade.Body;
    const ox = body.x - pl.x;
    const oy = body.y - pl.y;
    const m = { x: pl.x, y: pl.y, vx: body.velocity.x, vy: body.velocity.y };
    const ok = (x: number, y: number) => (pl.water?.(x, y) ?? true) && seaStandable(x, y) && !onSeaDeck(x, y);
    // 배 (단단히 다 밀어내요) + 물에 있는 다른 사람 (서서 겹친 건 조금씩 — 덜컥 튀지 않게)
    const ships = this.shipHullsNow.length;
    const all = [
      ...this.shipHullsNow.map((s) => ({ box: s.box, vx: s.vx, vy: s.vy, kind: undefined as BounceKind | undefined })),
      ...this.swimmersNow.map((s) => ({ box: s.box, vx: s.vx ?? 0, vy: s.vy ?? 0, kind: s.kind })),
    ];
    const hit = resolveHulls(m, (x, y) => ({ x: x + ox, y: y + oy, w: body.width, h: body.height }), all.map((s) => s.box), ok, {
      gentle: (i) => i >= ships,
      vel: (i) => all[i],
    });
    if (!hit) {
      // 다른 사람(헤엄·그 사람이 탄 놀거리·카약)이 가까이 닿았어요 — 그쪽 화면에선 이미 튕겨 나가 겹치지 않아요 → 나도 튕겨요
      const ridden = [...(this.rides?.hullBoxes() ?? []), ...(this.kayaks?.hullBoxes() ?? [])].filter((h) => h.remote);
      const t = remoteTouch({ x: pl.x + ox, y: pl.y + oy, w: body.width, h: body.height }, m, [...this.swimmersNow, ...ridden]);
      if (t && pl.knock(t.contact, now, "swim", { rvx: t.o.vx ?? 0, rvy: t.o.vy ?? 0, gain: strongerGain("swim", t.o.kind) }) > 0 && !this.host.reduced) this.fx.splash(pl.x - t.contact.nx * 5, pl.y - t.contact.ny * 3);
      return;
    }
    if (m.x !== pl.x || m.y !== pl.y) body.reset(m.x, m.y);
    const o = all[hit.index];
    if (hit.index < ships) {
      const s = this.shipHullsNow[hit.index];
      const sp = pl.knock(hit.contact, now, "swim", { gain: SHIP_GAIN[s.heavy], minInto: 0, rvx: s.vx, rvy: s.vy });
      if (sp > 0) this.shipHit(s.heavy, pl.x - hit.contact.nx * 6, pl.y - hit.contact.ny * 4);
      return;
    }
    // 헤엄치는 사람끼리는 살살, 다른 사람이 탄 것이면 그것만큼 세게 (서로 다가간 만큼)
    const sp = pl.knock(hit.contact, now, "swim", { rvx: o.vx, rvy: o.vy, gain: strongerGain("swim", o.kind) });
    if (sp > 0 && !this.host.reduced) this.fx.splash(pl.x - hit.contact.nx * 5, pl.y - hit.contact.ny * 3);
  }

  /** 11/16 r19 물에 있는 다른 사람 (헤엄·잠수 중, 보이는 사람) — 작은 몸 상자 · 속도 (지난 자리에서) */
  private swimmersNow: SeaHull[] = [];
  private readonly swimPrev = new Map<Sid, { x: number; y: number; vx: number; vy: number }>();
  private updateSwimmers(dt: number): void {
    const out: SeaHull[] = [];
    const seen = new Set<Sid>();
    for (const r of this.remotes.values()) {
      if (!r.visible || r.away || (r.stateId !== STATE.swim && r.stateId !== STATE.dive)) continue;
      seen.add(r.sid);
      const p = this.swimPrev.get(r.sid);
      const k = Math.min(1, Math.max(1, dt) / 120);
      const vx = p && dt > 0 ? p.vx + (((r.x - p.x) / Math.max(1, dt)) * 1000 - p.vx) * k : 0;
      const vy = p && dt > 0 ? p.vy + (((r.y - p.y) / Math.max(1, dt)) * 1000 - p.vy) * k : 0;
      // 순간이동(300px/s 넘게)은 속도로 치지 않아요
      const sv = { vx: Math.abs(vx) > 300 ? 0 : vx, vy: Math.abs(vy) > 300 ? 0 : vy };
      this.swimPrev.set(r.sid, { x: r.x, y: r.y, ...sv });
      // 내 몸 상자와 같은 크기 (Player BODY 8×5, 발 위)
      out.push({ id: `p:${r.sid}`, box: { x: Math.round(r.x - 4), y: Math.round(r.y - 5), w: 8, h: 5 }, empty: false, ...sv, kind: "swim", remote: true });
    }
    for (const sid of this.swimPrev.keys()) if (!seen.has(sid)) this.swimPrev.delete(sid);
    this.swimmersNow = out;
  }

  /** 11/16 r19 배에 부딪혔어요: 큰 물보라 (큰 배는 더 크게) · 화물선·유조선은 뱃고동도 */
  private shipHit(heavy: "big" | "medium", x: number, y: number): void {
    const n = heavy === "big" ? 4 : 2;
    if (!this.host.reduced) for (let i = 0; i < n; i++) this.fx.splash(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 6);
    else this.fx.splash(x, y);
    if (heavy === "big") this.horn?.horn(0.9, Math.max(-1, Math.min(1, (x - this.player.x) / 200)));
  }

  /** 11/16 r13 튜브·제트스키를 타고 있는지 (장면을 바꾸는 입구를 막는 공용 "타는 중" 검사가 불러요) */
  isRiding(): boolean {
    return (this.rides?.isRiding ?? false) || (this.kayaks?.isRiding ?? false);
  }

  /** 불멍에서 나와요 (일어남·버스) */
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
  }

  /** 11/17 입김 낼 사람: 내 캐릭터 + 같은 바닷가 사람 (물속·탈것 위는 빼요) */
  private breathersNow(): SeaActor[] {
    const out = this.breathers;
    out.length = 0;
    const pl = this.player;
    if (!pl.inWater && !pl.inBoat) out.push({ key: this.selfKey, x: pl.x, y: pl.y, dir: pl.dir });
    for (const r of this.remotes.values()) if (r.visible && !r.away && !seaWet(r.x, r.y, this.tide)) out.push({ key: r, x: r.x, y: r.y, dir: r.netDir });
    return out;
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
    if (this.campfire?.active) bridge.emit("view:mode", { mode: "normal" });
    this.campfire?.destroy();
    this.campfire = null;
    this.rides?.destroy();
    this.rides = null;
    this.kayaks?.destroy();
    this.kayaks = null;
    this.awayRoute?.destroy();
    this.awayRoute = null;
    this.stars?.destroy();
    this.stars = null;
    this.ships?.destroy();
    this.ships = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.horn?.destroy();
    this.horn = null;
    this.host.sfx.campfire(0);
    this.seaView?.destroy();
    this.seaView = null;
    bridge.emit("sea:hud", null);
    bridge.emit("sea:snack:can", null);
    if (this.viewBusy) bridge.emit("view:busy", { on: false });
    this.viewBusy = false;
    this.forage?.f.destroy();
    this.bungeo?.destroy();
    this.bungeo = null;
    this.life?.destroy();
    this.life = null;
    this.housing?.destroy();
    this.housing = null;
    this.concept?.destroy();
    this.concept = null;
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

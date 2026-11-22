import * as Phaser from "phaser";
import { CAMPFIRES, fireworkShowMs, campfireOfSeat, dexBadgeCats, DIR, MAP_NAME, type AwayMapId, FURNITURE, LAKE_PIER, houseLot, MAP_HEIGHT, MAP_WIDTH, HOUSING_DOOR, HUNT_GATE, isAvatarBody, isPhraseId, sanitizeDye, seatById, seatSlot, SHOP, SHOP_DOOR, SPAWN, spotSeatId, squirrelWaitText, STATE, TELEPORT_DIST, type ActKind, type DirId, type EmoteKind, type PeerInfo, type Seat, type Sid, type SpotKind, type WelcomeMsg } from "@tomb/protocol";
import { avatarColorSpec, type AppearanceChange } from "../sprites/avatar";
import { saveResume, type ResumePose, type ResumeState } from "@/lib/resume";
import { nameStyleIds } from "@/lib/nameStyle";
import { setDoorHint } from "../logic/doorHint";
import type { IncomingChatLine } from "../logic/chatLog";
import type { PublicGrave } from "@/lib/types";
import { TEX } from "../assets/manifest";
import { bridge, type NetStatus, type UiEvents } from "../bridge";
import { isSnowy, parseConceptOverride, type MapConcept } from "@/lib/mapConcept";
import { SnowFight } from "../world/SnowFight";
import { SnowGrid, type SnowNpc } from "../world/snowNpc";
import { SnowOccluders } from "../world/snowMask";
import { startMapConceptSync } from "@/lib/mapConceptClient";
import { DEPTH, GRAVE_NEAR_RADIUS, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import type { AvatarView } from "../entities/AvatarView";
import { GraveTooltip } from "../entities/Grave";
import { isAttachKind, Player, type SeatRequester } from "../entities/Player";
import { HAMMOCK_FRONT, RemoteAvatar, SWING_FRONT } from "../entities/RemoteAvatar";
import { peerList } from "../logic/peerList";
import { peerAt } from "../entities/peerHit";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf } from "../entities/SpeechBubble";
import { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { keyJosa } from "../input/keyHint";
import { escape, overlaps, type Box } from "../logic/jump";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { nearestObject, pickInteraction } from "../logic/interact";
import { inReach } from "../logic/reach";
import { anchorAt, nudgeSpot, restoreAfterDenied, resumeSpot, spotVerdict, standBesideSpot } from "../logic/restore";
import { besideFriend, FRIEND_ARRIVED } from "../logic/friendSpot";
import { playTeleportFx } from "../fx/teleportFx";
import { STAFF_TP_ARRIVED, STAFF_TP_INSIDE_MSG } from "@tomb/protocol";
import { doorFront } from "../logic/doorSpot";
import { SPOT_TAKEN_HINT, SPOT_TAKEN_TOAST, spotOf, spotTaken } from "../logic/spots";
import { neighborSeat, pickSeat, sideIntent, standPoint } from "../logic/sit";
import { RealtimeClient } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { addWorldTintBounds, worldTintOf } from "../world/worldTint";
import { CameraRig } from "../world/CameraRig";
import { Effects } from "../world/Effects";
import { Fireworks } from "../world/Fireworks";
import { GraveWalker } from "../world/GraveWalker";
import { GraveField } from "../world/GraveField";
import { graveChannelFor } from "../world/graveChannel";
import { LabelLayout } from "../world/LabelLayout";
import { graveAt, nearestGrave, standSpot, type GravePlacement, type NearResult } from "../world/graveLayout";
import { inWater, nearShopDoor, nearWater, standable, waterCurrent, type Interactable } from "../world/layout";
import { nearestSafeGround, walkReachable } from "../world/walkReach";
import { WorldHouses } from "../world/WorldHouses";
import { NearTracker } from "../world/nearTracker";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { GraveMarkers } from "../world/Markers";
import { GuideArrow } from "../world/GuideArrow";
import { RouteGuide, type RouteTargetInfo } from "../world/RouteGuide";
import { PORTAL_WALK } from "../world/portalWalk";
import { WHARF_BOARD } from "../world/fishZone";
import type { FirstGuideTarget } from "@/lib/retain";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, LETTERBOX, nearestCampfire } from "../world/campfireMath";
import { Sfx } from "../world/Sfx";
import { WorldMap } from "../world/WorldMap";
import { BoatRide } from "../world/BoatRide";
import { BumperRide } from "../bumper/BumperRide";
import { BUMPER_DOOR } from "../bumper/bumperLayout";
import { PlazaRides, type RideHost } from "../world/PlazaRides";
import { SkyRides } from "../world/SkyRides";
import { RideSound } from "../world/RideSound";
import { VillageLife } from "../world/life/VillageLife";
import { HauntHouseView } from "../haunt/HauntHouseView";
import { TowerView } from "../tower/TowerView";
import { LighthouseView } from "../lighthouse/LighthouseView";
import { LIGHTHOUSE_LABEL } from "../lighthouse/lighthouseLayout";
import { Foraging } from "../world/forage/Foraging";
import { Riding } from "../world/zoo/Riding";
import { ZOO_ARCH_AT, ZooView } from "../world/zoo/ZooView";
import { SeasonStallView } from "../world/SeasonStallView";
import { BungeoCartView } from "../world/BungeoCartView";
import { MungnyangView } from "../world/MungnyangView";
import { OfficeStallView } from "../world/OfficeStallView";
import { Expressions } from "../world/Expressions";
import { MeScreen } from "../world/MeScreen";
import type { GameContext } from "./context";
import { FEST_FIREWORK_MS, FEST_MS } from "@/lib/forage/quests/urgent";
import type { ShopContext } from "./ShopScene";
import { CampTrip, villageLandFor } from "../camp/CampTrip";
import { BIG_RIDE_TOAST, myBig, RIDE_OBJECT_KINDS } from "../camp/foodState";
import { friendRoute } from "@/lib/friendRoute";
import type { CampFriend } from "../camp/campHost";
import { publishRide, rideBlocked, standForGate } from "@/lib/rideGate";

// 월드 씬: 맵·묘비·내 캐릭터·원격 아바타·분위기·조명·카메라·네트워크를 묶고 bridge 이벤트를 처리한다.
// 유령 잡화점에 들어가면 이 씬은 숨기만 하고(업데이트·연결은 유지) 상점 씬이 그 위에 그려진다.

const FOCUS_WAIT_MS = 4000;
/** 11/22 머리 위 새싹을 눌러 띄운 말풍선이 저절로 닫히는 시간 */
const SPROUT_TAP_TIP_MS = 2500;
const BURY_WAIT_MS = 15_000;
const REMOTE_BURY_TTL_MS = 30_000;
/** 묘비가 솟아오른 뒤 캐릭터를 그 앞으로 옮기는 시점 */
const BURY_WARP_DELAY_MS = 1700;
const OTHER_GRAVE_MARK_MS = 4000;
const DUST_MS = 90;
const EMPTY_SEATS = new Map<string, Sid>();
const NO_MOVE: MoveInput = { ax: 0, ay: 0, run: false };
const FURNITURE_KIND = new Map(FURNITURE.map((f) => [f.id, f.kind]));
/** 옆자리로 옮겨 앉을 수 있는 긴 벤치 */
const MULTI_SEAT = new Set(FURNITURE.filter((f) => f.seatOffsets.length > 1).map((f) => f.id));
/** 같은 동작을 연달아 보내지 않는 간격 */
const ACT_COOLDOWN_MS = 700;
/** 말풍선 연타 간격 */
const SAY_COOLDOWN_MS = 1000;
type GuideTarget = NonNullable<UiEvents["guide:point"]["target"]>;
/** 원격 아바타 수와 HUD 인원이 어긋났는지 보는 주기 (어긋나면 sync 1회) */
const PEER_CHECK_MS = 5000;
/** 복원한 좌석을 서버가 거절했을 때 대신 앉을 자리를 찾는 시한 (첫 welcome부터) */
const RESTORE_SEAT_WINDOW_MS = 8000;
/** 대신 앉을 좌석 앞으로 옮긴 뒤 앉기 요청까지 (옮긴 위치 MOVE가 서버에 먼저 닿게) */
const RESTORE_SIT_DELAY_MS = 300;
/** 번지 안내 화살표가 떠 있는 최대 시간 */
const LOT_GUIDE_MS = 45_000;
/** 같은 안내 토스트를 연달아 띄우지 않는 간격 */
const TOAST_REPEAT_MS = 1500;
/** F17 미니맵에 내 위치·다른 사람 위치를 알리는 간격 */
const MINIMAP_MS = 250;

/** 11/15 긴급 의뢰 축제 폭죽 (보통 크기만 — 화면을 덮는 대형·피날레는 빼고) */
const FEST_FIREWORKS = ["fw_small", "fw_ring", "fw_heart", "fw_star", "fw_spiral", "fw_willow", "fw_crossette", "fw_triple"] as const;

export class WorldScene extends Phaser.Scene {
  private ctx!: GameContext;
  private reduced = false;
  private atlas!: GlyphAtlas;
  private map!: WorldMap;
  private field!: GraveField;
  private fx!: Effects;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private fireworks!: Fireworks;
  private sfx!: Sfx;
  /** 5번 이모티콘·24번 벤치 상태·14번 물속·그네 연출 */
  private expr!: Expressions;
  /** 즐겨찾기 표현 원형 목록(U 키)이 열려 있으면 내 화면 위치를 UI에 */
  private meScreen!: MeScreen;
  /** 마을·집·사냥터 안 (말풍선·이모티콘은 그 방이 받는다) */
  private awayScene = false;
  /** 11/17 사냥터 장면에 들어가 있다 (사냥 중에도 채널 채팅을 쓴다 — 말풍선 없이 [사냥터] 줄) */
  private huntScene = false;
  private rig!: CameraRig;
  private player!: Player;
  private playerGlow!: Phaser.GameObjects.Image;
  private tooltip!: GraveTooltip;
  private markers!: GraveMarkers;
  private hub!: InputHub;
  private net!: RealtimeClient;
  private seatReq!: SeatRequester;
  /** 22번 마을 생물: 고양이·유령·황금 고블린·망원경·돗자리·별똥별 (world/life) */
  private life!: VillageLife;
  /** 4·32번 낚시·채집: 낚시 자리·NPC·채집 지점 (world/forage) */
  private forage!: Foraging;
  /** 동물원: 울타리·우리·동물·사육사 (world/zoo) */
  private zoo!: ZooView;
  /** 11/19 광장 계절 보따리상: 노점·보따리상·이름표·밤 불빛 (world/SeasonStallView) */
  private season!: SeasonStallView;
  /** 11/22 골목 붕어빵 수레 (밤에 가끔 — world/BungeoCartView) */
  private bungeo!: BungeoCartView;
  /** 11/19 동물원 정문 왼쪽 「분양사 보리」: 분양사·발치 펫·방석·간식 상자·이름표·밤 등불 (world/MungnyangView) */
  private mungnyang!: MungnyangView;
  /** 11/20 야근 빌딩 오른쪽 「총무팀 문대리」: 사무실 가구 카트·문대리·이름표·밤 불빛 (world/OfficeStallView) */
  private office!: OfficeStallView;
  /** 11/20 판교의 등대 (전광판 위 노멀·헬 현재 1위 이름표) */
  private lighthouse!: LighthouseView;
  /** 동물원 타는 펫 올라타기·내리기 (world/zoo/Riding) */
  private riding!: Riding;
  /** 11/18 눈싸움 (겨울·크리스마스 판 바깥 — world/SnowFight) */
  private fight: SnowFight | null = null;
  /** 11/17 지금 마을 맵 컨셉 (눈싸움은 눈 덮인 판에서만) */
  private concept: MapConcept = "default";
  /** 11/18 눈뭉치가 박히는 칸 (맵 충돌 — 처음 쓸 때·집이 바뀌면 다시 굽는다) */
  private snowGrid: SnowGrid | null = null;
  private snowGridDirty = true;
  /** 11/18 눈뭉치에 맞는 NPC (주민·강아지·고양이·사육사 — 무리 목록이 바뀔 때만 다시 묶는다) */
  private snowNpcs: { life: readonly SnowNpc[]; all: SnowNpc[] } | null = null;
  private readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly seats = new Map<string, Sid>();
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  private readonly nearT = new NearTracker();
  private get nearId(): string | null {
    return this.nearT.id;
  }
  private pendingFocus: string | null = null;
  private pendingBury: { id: string; at: number } | null = null;
  private readonly remoteBuried = new Map<string, number>();
  private recenterAt = 0;
  /** 채널을 옮기려고 떠나기 전 자리 (새 채널이 꽉 차 돌아오면 여기로) */
  private channelBack: { x: number; y: number; dir: DirId } | null = null;
  /** F17 미니맵 다음 알림 시각 (performance.now) */
  private minimapAt = 0;
  /** 친구: UI가 알려 준 이 채널의 친구 (sid → 이름). sid와 이름이 둘 다 맞는 사람만 친구로 그린다 */
  private friends: { ch: number; bySid: Map<Sid, string> } = { ch: 0, bySid: new Map() };
  private dustAt = 0;
  private netStarted = false;
  private cleaned = false;
  private inShop = false;
  /** 11/15 긴급 의뢰 마을 축제: 끝나는 시각(ms, Date.now 기준) · 다음 폭죽 시각(scene time) · 지금 켜짐 */
  private festUntil = 0;
  private festNext = 0;
  private festOn = false;
  private seatHint!: SeatHint;
  /** 41번: 내 묘비까지 걸어가기 */
  private walker!: GraveWalker;
  /** 주거 구역의 집 (분양 마을 정보) */
  private houses: WorldHouses | null = null;
  /** world:lot 안내 화살표 (문 앞에 닿으면 지운다) */
  private lotGuide: { x: number; y: number; until: number } | null = null;
  private graveCollider!: Phaser.Physics.Arcade.Collider;
  private furnitureCollider!: Phaser.Physics.Arcade.Collider;
  /** 벤치에서 좌우 입력 (한 번 누를 때 한 칸) */
  private lastSide: -1 | 0 | 1 = 0;
  private actAt = -Infinity;
  private peerCheckAt = 0;
  /** 착지했는데 묘비에 겹쳐 빠져나오지 못했으면, 겹침이 풀릴 때까지 묘비 충돌을 계속 끈다 */
  private graveLock = false;
  /** 지금 보여 주는 묘지의 채널 (채널마다 묘지가 따로) */
  private graveChannel = 1;
  private nearSeatId: string | null = null;
  private readonly unsubs: (() => void)[] = [];
  /** 이번 프레임 화면 (CameraRig.frameView가 채운다) */
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly fwView = new Phaser.Geom.Rectangle();
  private readonly near: NearResult = { p: null as unknown as GravePlacement, dist: 0 };
  private readonly resolveGrave = (id: string) => this.field.placement(id);
  private readonly labelLayout = new LabelLayout();
  private readonly hintBuf = { x: 0, y: 0, text: "", dim: false };
  private sayAt = -Infinity;
  private guide!: GuideArrow;
  /** 11/19 첫 걸음 길 안내 (route:guide) */
  private route!: RouteGuide;
  private routeTarget: FirstGuideTarget | null = null;
  private readonly swingRiders: number[] = [];
  private campfire!: CampfireView;
  /** 새로고침 전 자리 기록 (첫 welcome에서 서버 기준으로 마무리한다) */
  private resume: ResumeState | null = null;
  /** 복원한 좌석: 서버가 거절하면 가까운 빈자리로 (until까지) */
  private restoreSeat: { id: string; until: number } | null = null;
  /** 내 몸 모양 (입장 토큰 값이 오면 갱신). 새로고침 복원 기록에 싣는다 */
  private selfBody: string | undefined;
  private readonly poseBuf: NetPose = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  /** 접속한 서버가 나무·그네도 좌석처럼 판정한다 (welcome.spots). 아니면 예전처럼 혼자 붙는다 */
  private spotsJudged = false;
  private toastAt = -Infinity;
  private toastMsg = "";
  // 50번 조각배·광장 놀거리 (world/BoatRide.ts, world/PlazaRides.ts)
  private rideSound!: RideSound;
  private rides!: PlazaRides;
  private boats!: BoatRide;
  /** 11/16 범퍼카장 (bumper/BumperRide) */
  private bumper!: BumperRide;
  /** 놀이기구 2: 관람차·열기구 (하늘 시점 포함) */
  private sky!: SkyRides;
  /** 11/15 마을 ↔ 캠핑장 버스 여행 (game/camp/CampTrip). 캠핑장에 있는 동안 이 장면은 잔다 */
  private trip!: CampTrip;
  /** 버스를 기다리거나 타고 내리는 동안: 입력만 막고 장면은 그대로 움직인다 */
  private tripLock = false;

  constructor() {
    super("world");
  }

  init(data: GameContext): void {
    this.ctx = data;
  }

  create(): void {
    const t0 = performance.now();
    const { opts } = this.ctx;
    this.reduced = prefersReducedMotion();
    this.cleaned = false;
    this.inShop = false;
    const canvas = this.game.canvas;
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    canvas.setAttribute("aria-hidden", "true");

    this.atlas = new GlyphAtlas(this);
    this.map = new WorldMap(this, this.atlas);
    this.map.setRows(0, 0);
    this.field = new GraveField(this, this.reduced);
    this.fx = new Effects(this, this.reduced);
    this.walker = new GraveWalker({
      scene: this,
      player: () => this.player,
      seats: () => this.seatReq,
      groups: () => [this.map.colliders, this.map.gridColliders, this.map.furnitureColliders, this.field.colliders],
      layout: () => this.field.layout,
      placement: (id) => this.field.placement(id),
      water: inWater,
      beforeWalk: () => this.beforeAutoWalk(),
      // 11/19 외치기 창 [상점에서 사기]로 잡화점 문 앞에 닿으면 들어가서 상점 창까지 (주인장에게 말을 건 것과 같다)
      enterShop: () => {
        this.enterShop();
        if (this.inShop) bridge.emit("shop:open");
      },
    });

    // 묘비 목록이 이미 와 있으면(이 채널 것만) 먼저 깔고, 공유 링크 묘비가 있으면 그 앞에서 시작한다
    this.graveChannel = graveChannelFor(bridge.last("net:status"), opts.channel);
    const last = bridge.last("graves:set");
    const initial = last && last.channel === this.graveChannel ? last : undefined;
    if (initial) this.applyGraves(initial.graves, initial.reviveTop, false);
    let spawn: { x: number; y: number } = SPAWN;
    let openOnStart: string | null = null;
    if (opts.focusGraveId) {
      const p = this.field.placement(opts.focusGraveId);
      if (p) {
        spawn = standSpot(p);
        openOnStart = p.id;
      } else if (!initial) this.pendingFocus = opts.focusGraveId;
    }
    // 11/15 캠핑장에서 새로고침: 마을의 나는 버스 정류장에 세워 두고 캠핑장 장면이 그 자리를 잇는다 (create 끝에서)
    // 11/16 바닷가도 같다 (마을의 나는 바닷가행 정류장에)
    const campResume = opts.resume?.where === "camp" || opts.resume?.where === "sea" ? opts.resume : null;
    if (campResume?.where) spawn = villageLandFor(campResume.where);
    // 새로고침 직전 자리로 시작한다 (의자는 그 앞에 서서 앉는 동작으로 — 거절되면 바닥이 아니라 그 앞으로 돌아오게)
    this.resume = campResume ? null : (opts.resume ?? null);
    this.restoreSeat = null;
    this.selfBody = isAvatarBody(opts.body) ? opts.body : undefined;
    if (this.resume) {
      const r = this.resume;
      const seat = r.pose === "sitChair" && r.seatId ? seatById(r.seatId) : undefined;
      spawn = seat ? standPoint(seat) : { x: r.x, y: r.y };
      // 맵이 바뀌어 저장된 자리가 이제 막힌 곳(집·나무·절벽·담 밖)이면 입구에서 시작한다 (물속은 괜찮다).
      // 11/16 서 있던 자리가 갇힌 곳(넓어진 범퍼카 링크 안 등 — 걸어서 이어지지 않는 땅)이면 가까운 바깥 땅으로 (logic/restore resumeSpot)
      const at = seat ? spawn : resumeSpot(spawn, r.pose, { standable, inWater, reachable: walkReachable, nearest: nearestSafeGround });
      if (!at) {
        spawn = SPAWN;
        this.resume = { ...r, x: SPAWN.x, y: SPAWN.y, pose: "idle", seatId: null };
      } else if (at !== spawn) {
        spawn = at;
        this.resume = { ...r, x: at.x, y: at.y, pose: "idle", seatId: null };
      }
      openOnStart = null;
      this.pendingFocus = null;
    }

    this.player = new Player(this, this.atlas, spawn.x, spawn.y, opts.color, opts.name, this.myBody());
    // 단 칭호의 마을 이동 속도 (마을에서만)
    this.player.titleSpeed = true;
    this.player.water = inWater;
    this.player.current = waterCurrent;
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    this.physics.add.collider(this.player.sprite, this.map.gridColliders);
    // 묘비·의자·벤치 충돌은 점프 중에 끈다 (벽·나무·오두막은 그대로)
    this.graveCollider = this.physics.add.collider(this.player.sprite, this.field.colliders);
    this.furnitureCollider = this.physics.add.collider(this.player.sprite, this.map.furnitureColliders);
    this.player.onLand = () => this.onPlayerLand();
    this.initRides();
    if (this.resume) this.applyResumePose(this.resume);
    this.playerGlow = this.add.image(spawn.x, spawn.y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y), (w) => this.onHoverSprout(w));
    this.rig.setMapHeight(this.map.height);
    // 마을 색조: 셰이더가 그림마다 곱한다 (맵은 그대로, 캐릭터는 절반만). WebGL이 아니면 예전 곱하기 판
    const tint = worldTintOf(this.game);
    if (tint) addWorldTintBounds(this, tint);
    this.atmos = new Atmosphere(this, this.reduced, window.location.search, { shaderTint: tint });
    this.lighting = new Lighting(this);
    this.sfx = new Sfx();
    this.fireworks = new Fireworks(this, this.reduced, this.sfx);
    this.tooltip = new GraveTooltip(this, this.atlas);
    this.markers = new GraveMarkers(this, this.atlas, this.reduced);
    this.seatHint = new SeatHint(this, this.atlas);
    this.guide = new GuideArrow(this, this.atlas, this.reduced);
    this.route = new RouteGuide({ scene: this, atlas: this.atlas, reduced: this.reduced, player: () => this.player, route: (from, to) => this.walker.route(from, to) });
    this.routeTarget = null;
    this.campfire = new CampfireView(this, this.rig, this.map, this.reduced);
    this.expr = new Expressions({
      player: () => this.player,
      net: () => this.net,
      remotes: () => this.remotes,
      sfx: this.sfx,
      rig: this.rig,
      reduced: this.reduced,
      act: (kind) => this.doAct(kind),
    });

    this.atmos.setStaticLights(this.map.staticLights);
    this.atmos.setGridLights(this.map.gridLights);
    // 주거 구역의 집 (지금 채널의 마을 정보를 받으면 세운다 → 창문 빛도 다시. 채널마다 주거 구역이 따로)
    this.houses = new WorldHouses(
      this.map,
      () => {
        this.atmos.setGridLights(this.map.gridLights);
        this.snowGridDirty = true;
      },
      opts.channel,
    );
    this.field.setMine(bridge.last("graves:mine")?.ids ?? []);

    this.hub = new InputHub();
    this.hub.attach();
    this.hub.setHandler((a) => this.onAction(a));
    this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false);

    this.net = this.createNet();
    this.seatReq = { sit: (id) => this.net.sit(id), stand: () => this.net.stand() };
    this.trip = new CampTrip({
      scene: this,
      net: this.net,
      atlas: this.atlas,
      hub: this.hub,
      sfx: this.sfx,
      reduced: this.reduced,
      name: opts.name,
      color: opts.color,
      player: () => this.player,
      myBody: () => this.player.view.bodyId,
      myLook: () => this.player.view.wearing,
      lock: (on) => this.lockForTrip(on),
      clearRemotes: () => {
        this.clearRemotes();
        this.seats.clear();
      },
      arrived: (friend) => this.arrivedByBus(friend),
      warmLife: (aheadMs, budgetMs) => this.life?.warm(aheadMs, budgetMs) ?? true,
      isFriend: (sid, name) => this.net.channel === this.friends.ch && this.friends.bySid.get(sid) === name,
      toast: (m) => this.toast(m),
    });
    if (campResume?.where) this.net.map = campResume.where;
    new HauntHouseView(this, this.map.colliders, this.reduced, () => this.player); // 귀신의집 건물·간판·등불·안개·근처 소리 (game/haunt)
    new TowerView(this, this.map.colliders, this.reduced, () => this.atmos?.levels.darkness ?? 0); // 11/15 야근 빌딩 (game/tower)
    this.lighthouse = new LighthouseView(this, this.map.colliders, this.reduced, () => this.atmos?.levels.darkness ?? 0, this.atlas); // 11/20 판교의 등대 (game/lighthouse)
    this.life = new VillageLife({
      scene: this,
      atlas: this.atlas,
      sfx: this.sfx,
      reduced: this.reduced,
      colliders: this.map.colliders,
      player: () => this.player,
      net: () => this.net,
      seats: () => this.seats,
      channel: () => this.net.channel ?? (typeof opts.channel === "number" ? opts.channel : 1),
      toast: (m) => this.toast(m),
    });
    this.forage = new Foraging({
      scene: this,
      atlas: this.atlas,
      reduced: this.reduced,
      colliders: this.map.colliders,
      player: () => this.player,
      net: () => this.net,
      seats: () => this.seats,
      remotes: () => this.remotes,
      setItems: (items) => this.map.setExtraItems(items),
      toast: (m) => this.toast(m),
    });
    this.zoo = new ZooView({
      scene: this,
      atlas: this.atlas,
      reduced: this.reduced,
      colliders: this.map.colliders,
      serverNow: () => this.net.serverNow(),
      seed: () => this.net.channel ?? (typeof opts.channel === "number" ? opts.channel : 1),
    });
    this.season = new SeasonStallView({ scene: this, atlas: this.atlas, reduced: this.reduced, colliders: this.map.colliders });
    this.bungeo = new BungeoCartView({ scene: this, reduced: this.reduced, colliders: this.map.colliders, clock: () => this.net?.serverNow() ?? Date.now(), setItems: (items) => this.map.setCartItems(items) });
    this.mungnyang = new MungnyangView({ scene: this, atlas: this.atlas, reduced: this.reduced, colliders: this.map.colliders });
    this.office = new OfficeStallView({ scene: this, atlas: this.atlas, reduced: this.reduced, colliders: this.map.colliders });
    this.riding = new Riding({ player: () => this.player, net: () => this.net, remotes: () => this.remotes, toast: (m) => this.toast(m) });
    this.fight = new SnowFight({
      scene: this,
      atlas: this.atlas,
      sfx: this.sfx,
      reduced: this.reduced,
      player: () => this.player,
      net: () => this.net,
      remotes: () => this.remotes,
      move: () => this.move,
      // 실내(상점·집·사냥터 등)·버스 여행 중이면 쉰다
      live: () => isSnowy(this.concept) && !this.inShop && !this.awayScene && !this.trip.away && !this.tripLock,
      water: (x, y) => inWater(x, y),
      solid: (x, y) => this.snowSolid().blocked(x, y),
      // 11/18 건물·나무·벤치·묘비 그림 앞면에 박히게 (집 그림 뒤로 숨지 않게, 낮은 벤치는 위로 넘어가게)
      occluders: new SnowOccluders({ scene: this, solid: (x, y) => this.snowSolid().blocked(x, y), skip: () => this.snowNpcImgs() }),
      npcs: () => this.npcsForSnow(),
      toast: (m) => this.toast(m),
    });
    const look = bridge.last("look:set");
    if (look) this.applyLook(look.look, look.lookGrant, look);
    this.bindBridge();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    window.addEventListener("pagehide", this.onPageHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.ctx.disposers.push(() => this.cleanup());

    if (this.pendingFocus) {
      // 공유 링크: 묘비 목록을 조금 기다렸다가 그 앞에서 접속한다
      this.time.delayedCall(FOCUS_WAIT_MS, () => this.startNet());
    } else this.startNet();

    bridge.emit("scene:changed", { scene: "world" });
    bridge.emit("ready");
    if (campResume) this.trip.resumeInCamp(campResume);
    if (openOnStart) {
      const id = openOnStart;
      this.time.delayedCall(250, () => bridge.emit("grave:open", { graveId: id }));
    }
    this.debugMark("worldCreateMs", performance.now() - t0);
  }

  /** 11/18 눈뭉치가 박히는 칸: 맵 충돌(건물·벽·울타리·나무·바위·매대·가로등·벤치·놀이기구 받침 …)과 집 몸체 */
  private snowSolid(): SnowGrid {
    const g = (this.snowGrid ??= new SnowGrid(MAP_WIDTH, MAP_HEIGHT));
    if (this.snowGridDirty) {
      this.snowGridDirty = false;
      g.fillGroups([this.map.colliders, this.map.gridColliders, this.map.furnitureColliders]);
    }
    return g;
  }

  /** 공을 막는 그림에서 뺄 NPC 그림 (움직이는 것) */
  private snowNpcImgs(): ReadonlySet<unknown> {
    const set = new Set<unknown>();
    for (const n of this.npcsForSnow()) {
      const img = n.img?.();
      if (img) set.add(img);
    }
    return set;
  }

  private npcsForSnow(): readonly SnowNpc[] {
    const life = this.life.snowNpcs();
    if (this.snowNpcs?.life === life) return this.snowNpcs.all;
    this.snowNpcs = { life, all: [...life, ...this.zoo.snowNpcs(), ...this.season.snowNpcs(), ...this.mungnyang.snowNpcs(), ...this.office.snowNpcs()] };
    return this.snowNpcs.all;
  }

  /** 입장 화면에서 고른 몸 (GameStartOptions.body가 오면). 없으면 입장 토큰의 값이 오기 전까지 hood */
  private myBody(): string {
    const b = this.ctx.opts.body;
    return isAvatarBody(b) ? b : "hood";
  }

  private debugMark(key: string, ms: number): void {
    if (!this.ctx.opts.debug) return;
    const w = window as unknown as { __tombBoot?: Record<string, unknown> };
    w.__tombBoot = { ...(w.__tombBoot ?? {}), [key]: Math.round(ms * 10) / 10 };
  }

  private startNet(): void {
    if (this.netStarted || this.cleaned) return;
    this.netStarted = true;
    this.net.start();
  }

  // ── 네트워크 ──

  private createNet(): RealtimeClient {
    const { opts } = this.ctx;
    return new RealtimeClient(
      { name: opts.name, color: opts.color, channel: opts.channel, debug: opts.debug, body: isAvatarBody(opts.body) ? opts.body : undefined },
      {
        getPose: (out) => this.player.netPose(out),
        getFps: () => this.game.loop.actualFps,
        onWelcome: (m) => {
          this.clearRemotes();
          this.life.onWelcome(m);
          this.forage.onWelcome(m);
          this.riding.onWelcome();
          this.spotsJudged = m.spots === true;
          this.syncSeats(m.seats);
          for (const p of m.peers) this.addRemote(p);
          const r = this.resume;
          if (r) {
            this.resume = null;
            this.finishResume(r, m);
          }
          // 의자에 앉은 채로 다시 붙었으면 좌석을 다시 확인한다
          const seat = this.player.state === "sitChair" ? this.player.seat : null;
          if (seat) {
            const owner = this.seats.get(seat.id);
            if (owner === undefined) this.net.sit(seat.id);
            else if (owner !== m.sid) this.mySeatDenied(seat.id);
          }
          // 나무·그네에 붙은 채로 (다시) 붙었다: 서버 점유표로 판정 (새로고침 복원·재연결·재배포 공통)
          const spot = this.player.anchored ? this.player.spotId : null;
          if (spot && this.spotsJudged) {
            const v = spotVerdict(spot, m.seats, m.sid);
            if (v === "claim") this.net.sit(spot);
            else if (v === "leave") this.mySpotLost(spot);
          }
          // 조각배에 탄 채로 (다시) 붙었다: 배 자리도 서버 점유표로 (놓쳤으면 뭍으로)
          this.boats.onWelcome(m);
          // 범퍼카에 탄 채로 (다시) 붙었다: 차 자리도 서버 점유표로 (놓쳤으면 입구 앞으로)
          this.bumper.onWelcome(m);
        },
        onJoin: (p) => this.addRemote(p),
        onLeave: (sid) => {
          this.remotes.get(sid)?.destroy();
          this.remotes.delete(sid);
          for (const [seatId, owner] of this.seats) if (owner === sid) this.seats.delete(seatId);
        },
        onSnapshot: (entries, t) => {
          const me = this.net.mySid;
          for (const e of entries) {
            if (e.sid === me) continue;
            this.remotes.get(e.sid)?.push(t, e.x, e.y, e.state, e.dir);
          }
        },
        onSeat: (seatId, sid) => {
          this.life.seatChanged(seatId, sid);
          this.forage.seatChanged(seatId, sid);
          for (const r of this.remotes.values()) if (r.seatId === seatId) r.seatId = null;
          if (sid === null) {
            this.seats.delete(seatId);
            return;
          }
          for (const [id, owner] of this.seats) if (owner === sid) this.seats.delete(id);
          this.seats.set(seatId, sid);
          if (sid === this.net.mySid) {
            this.expr.onMySeat();
            this.player.seatConfirmed(seatId);
            if (this.restoreSeat?.id === seatId) this.restoreSeat = null; // 복원한 좌석을 서버가 확정
          }
          const r = this.remotes.get(sid);
          if (r) r.seatId = seatId;
          // 다른 사람이 먼저 앉았다 → 나는 바닥 앉기 (복원 중이면 가까운 빈자리로)
          if (sid !== this.net.mySid && this.player.seat?.id === seatId) this.mySeatDenied(seatId);
          // 나무·그네를 동시에 잡았는데 다른 사람이 먼저였다 → 내려온다
          if (sid !== this.net.mySid && this.player.spotId === seatId) this.mySpotLost(seatId);
          this.boats.onSeat(seatId, sid);
          this.bumper.onSeat(seatId, sid);
        },
        onSeatDenied: (seatId) => {
          if (this.bumper.onSeatDenied(seatId)) return;
          if (this.boats.onSeatDenied(seatId)) return;
          if (this.life.seatDenied(seatId)) return;
          if (this.forage.seatDenied(seatId)) return;
          if (this.player.spotId === seatId) this.mySpotLost(seatId);
          else this.mySeatDenied(seatId);
        },
        onEmote: (sid, kind, graveId) => this.playRemoteEmote(sid, kind, graveId),
        onGraveEvent: (_sid, kind, graveId) => {
          bridge.emit("net:graveEvent", { kind, graveId });
          if (kind === "buried") this.remoteBuried.set(graveId, this.time.now);
        },
        onReset: () => {
          this.life.onReset();
          this.fight?.clear();
          this.clearRemotes();
          this.seats.clear();
          this.spotsJudged = false;
        },
        onPeers: (peers, seats) => this.reconcilePeers(peers, seats),
        onLook: (sid, look, extra) => {
          this.remotes.get(sid)?.view.changeLook(look ?? [], extra);
        },
        onFirework: (sid, item, x, y, wait) => {
          this.fireworks.launch(item, x, y, this.fireworkView(), false, this.remotes.get(sid)?.name ?? "", wait);
          this.sky?.firework();
        },
        onAct: (sid, kind, x, y) => this.playAct(sid, kind, x, y),
        // 11/18 눈싸움 (마을 사람끼리)
        onSnowball: (sid, n, x, y, tx, ty) => this.fight?.onThrow(sid, n, x, y, tx, ty),
        onSnowHit: (sid, by, n, h) => this.fight?.onHit(sid, by, n, h),
        onEmo: (sid, id) => this.expr.onRemoteEmo(sid, id),
        onChat: (sid, text, id, meta) => this.expr.onRemoteChat(sid, text, id, meta),
        // 이 채널의 최근 1분 채팅 → 채팅창에 합친다 (채널 번호로 다른 채널 줄과 섞이지 않게)
        onChatLog: (lines) => bridge.emit("chat:log", { lines: this.withNameStyles(lines), ...(this.net.channel !== null ? { ch: this.net.channel } : {}) }),
        onMood: (sid, mood) => this.expr.onRemoteMood(sid, mood),
        onRide: (sid, on) => this.riding.onRide(sid, on),
        onRod: (sid, on) => this.forage.onRod(sid, on), // 4번 배 위 낚싯대
        // 실내(상점·집·사냥터 등)에 들어감·나옴: 문으로 들어가듯 흐려지며 사라지고, 나오면 문 앞에서 나타난다
        onAway: (sid, on) => this.remotes.get(sid)?.setAway(on, performance.now()),
        onSay: (sid, id) => {
          const text = phraseOf(id);
          const r = this.remotes.get(sid);
          if (!text || !r) return;
          r.view.say(text, performance.now());
          // 보이는 사람의 말풍선만 작게 소리
          if (r.visible) this.sfx.play("say", 0.3);
        },
        onGoblin: (g) => this.life.onGoblin(g),
        onGoblinGone: (id) => this.life.onGoblinGone(id),
        onGoblinCaught: (id, sid, name, points) => this.life.onGoblinCaught(id, sid, name, points),
        onGoblinGrant: (id, grant, points) => this.life.onGoblinGrant(id, grant, points),
        onMegaphone: (m) => bridge.emit("megaphone:heard", m),
        onMegaPin: (m) => bridge.emit("megaphone:pin", m),
        onMeStale: () => bridge.emit("me:stale"),
        onFriend: (m) => bridge.emit("friend:presence", m),
        onSquirrels: (m) => bridge.emit("fx:squirrels", m),
        onSquirrelsWait: (left) => bridge.emit("toast", { message: squirrelWaitText(left) }),
        onSelfBody: (body) => {
          if (!isAvatarBody(body)) return;
          this.selfBody = body;
          this.player.view.setBody(body);
        },
        // 11/15 캠핑장에서 돌아왔다 (또는 캠핑장 요청이 거절됐다): 마을 사람 목록으로 맞춘다
        onMapped: (_map, peers, seats) => this.reconcilePeers(peers, seats),
      },
    );
  }

  /**
   * 서버가 보낸 지난 채팅(이름만 있다)에 닉네임 꾸미기를 붙인다: 지금 이 채널에 있는 사람(나 포함)이면 그 사람 착용 목록에서.
   * 이미 나간 사람 줄은 그냥 이름 (실시간 서버의 채팅 기록은 그대로)
   */
  private withNameStyles(lines: IncomingChatLine[]): IncomingChatLine[] {
    const byName = new Map<string, readonly string[]>();
    for (const r of this.remotes.values()) byName.set(r.name, r.view.wearing);
    if (this.player) byName.set(this.player.view.label.text, this.player.view.wearing);
    return lines.map((l) => {
      // 11/20 서버가 실은 꾸미기(쓸 때 착용)가 있으면 그대로, 없으면(옛 줄) 지금 화면에 있는 사람의 착용에서
      if (l.ns) return l;
      const ns = l.staff ? undefined : nameStyleIds(byName.get(l.name));
      return ns ? { ...l, ns } : l;
    });
  }

  // ── 새로고침 뒤 자리 복원 (lib/resume.ts) ──

  /** 접속 전: 저장된 자세를 그대로 보여 준다 (서버 판정은 첫 welcome에서) */
  private applyResumePose(r: ResumeState): void {
    const pl = this.player;
    const now = this.time.now;
    pl.dir = r.dir as DirId;
    if (r.pose === "sitChair") {
      const seat = r.seatId ? seatById(r.seatId) : undefined;
      // 접속 전이라 좌석 요청은 보내지 않는다 (요청은 welcome에서). 의자 앞에서 앉는 동작으로 시작
      pl.sit(seat ?? null, now, null);
    } else if (r.pose === "sitGround") {
      pl.sit(null, now, null);
    } else if (r.pose === "swing" || r.pose === "hang" || r.pose === "hammock") {
      const o = anchorAt(this.map.interactables, r.pose === "hang" ? "tree" : r.pose, r.x, r.y);
      // 자리 요청은 접속 뒤 welcome에서 (onWelcome의 spotVerdict). 그 자리가 없어졌으면(맵 개편) 서 있기로
      if (o) pl.attach(r.pose, o.ax, o.ay, spotDepth(r.pose, o.ay), now, null, spotSeatId(r.pose, o.ax, o.ay));
    } else this.applyRideResume(r, now);
    pl.view.apply(pl.state, pl.dir, now);
  }

  /**
   * 첫 welcome: 서버 기준으로 복원을 마무리한다. 한 자리에는 한 명.
   * - 다른 채널로 들어왔으면(만석 안내 등) 좌석은 잇지 않는다
   * - 의자: 이어서 좌석 확인(onWelcome) → 거절되면 mySeatDenied가 가까운 빈자리로
   * - 그네·나무: 서버 좌석 점유표로 판정(onWelcome의 spotVerdict) — 남이 차지했으면 내려와 옆에 선다.
   *   소품 자리를 판정하지 않는 이전 서버면 그 자리에 매달린 사람이 보이는지로 판단한다
   * - 서 있기·바닥 앉기: 같은 자리에 다른 사람이 서 있으면 살짝 비켜 선다
   */
  private finishResume(r: ResumeState, m: WelcomeMsg): void {
    const pl = this.player;
    const now = this.time.now;
    if (m.channel !== r.channel) {
      if (pl.sitting) pl.stand(now, null);
      if (pl.anchored) pl.leaveAnchor(now);
      if (pl.inBoat) this.boats.disembark(true);
      if (pl.inCar) this.bumper.leave();
      return;
    }
    if (pl.inBoat) return; // 배 자리는 boats.onWelcome이 판정한다
    if (pl.state === "sitChair" && pl.seat) {
      this.restoreSeat = { id: pl.seat.id, until: now + RESTORE_SEAT_WINDOW_MS };
      return;
    }
    const others = m.peers.map((p) => ({ x: p.x, y: p.y, state: p.state }));
    if (pl.anchored) {
      if (m.spots) return;
      const taken = others.some((o) => (o.state === STATE.swing || o.state === STATE.hang) && Math.hypot(o.x - r.x, o.y - r.y) <= 3);
      if (!taken) return;
      pl.leaveAnchor(now);
    }
    const spot = nudgeSpot({ x: pl.x, y: pl.y }, others, inWater);
    if (spot.x === pl.x && spot.y === pl.y) return;
    const sat = pl.state === "sitGround";
    pl.warp(spot.x, spot.y, now, null);
    if (sat) pl.sit(null, now, null);
  }

  /** 서버가 내 좌석을 거절했다 / 남이 먼저 앉았다. 복원 직후면 바닥 대신 가까운 빈자리, 없으면 그 앞에 선다 */
  private mySeatDenied(seatId: string): void {
    const pl = this.player;
    const now = this.time.now;
    pl.seatDenied(seatId, now);
    const rs = this.restoreSeat;
    if (!rs || rs.id !== seatId) return;
    this.restoreSeat = null;
    const denied = seatById(seatId);
    if (!denied || now > rs.until) return;
    const others = [...this.remotes.values()].map((o) => ({ x: o.x, y: o.y }));
    const { seat, stand } = restoreAfterDenied(denied, this.seats, this.net.mySid, others);
    pl.warp(stand.x, stand.y, now, null);
    if (!seat) return;
    // 옮긴 위치(MOVE)가 먼저 닿은 뒤 앉기 요청 — 서버는 마지막으로 보고된 위치로 좌석 거리를 잰다
    this.time.delayedCall(RESTORE_SIT_DELAY_MS, () => {
      if (this.cleaned || pl.sitting || pl.anchored || Math.hypot(pl.x - stand.x, pl.y - stand.y) > 2) return;
      const owner = this.seats.get(seat.id);
      if (owner !== undefined && owner !== this.net.mySid) return;
      pl.sit(seat, this.time.now, this.seatReq);
    });
  }

  /** 페이지가 내려가기 직전(새로고침·업데이트): 채널·자리·자세를 남긴다. 다시 열리면 App이 읽자마자 지운다 */
  private readonly onPageHide = (): void => {
    if (this.cleaned) return;
    const ch = this.net.channel;
    if (typeof ch !== "number" || this.net.mode === "replaced") return;
    // 11/15 캠핑장에 있으면 캠핑장 자리를 남긴다 (다시 열리면 캠핑장으로 바로)
    const camp = this.trip?.campResume();
    if (camp) {
      saveResume({ channel: ch, ...camp, savedAt: Date.now(), name: this.ctx.opts.name, color: this.ctx.opts.color, body: this.selfBody });
      return;
    }
    const pl = this.player;
    const p = pl.netPose(this.poseBuf);
    // 11/16 범퍼카는 잇지 않는다: 다시 열면 입구 앞에 선다 (링크 안에 걸어서 서 있지 않게)
    if (pl.inCar) {
      p.x = BUMPER_DOOR.x;
      p.y = BUMPER_DOOR.y;
    }
    const st = pl.inCar ? "idle" : pl.state;
    const ride = st === "seesaw" || st === "trampoline" || st === "carousel" || (st === "boat" && pl.boatSeatId);
    const pose: ResumePose = st === "sitChair" && pl.seat ? "sitChair" : st === "sitGround" || st === "swing" || st === "hang" || st === "hammock" || ride ? st : "idle";
    saveResume({
      channel: ch,
      x: Math.round(p.x),
      y: Math.round(p.y),
      seatId: pose === "sitChair" ? (pl.seat?.id ?? null) : pose === "boat" ? pl.boatSeatId : null,
      pose,
      dir: pl.dir,
      savedAt: Date.now(),
      name: this.ctx.opts.name,
      color: this.ctx.opts.color,
      body: this.selfBody,
    });
  };

  private syncSeats(seats: Record<string, Sid>): void {
    this.seats.clear();
    for (const [seatId, sid] of Object.entries(seats)) this.seats.set(seatId, sid);
    for (const r of this.remotes.values()) r.seatId = null;
    for (const [seatId, sid] of this.seats) {
      const r = this.remotes.get(sid);
      if (r) r.seatId = seatId;
    }
  }

  private addRemote(p: PeerInfo): void {
    if (p.sid === this.net.mySid) return;
    const prev = this.remotes.get(p.sid);
    prev?.destroy();
    const r = new RemoteAvatar(this, this.atlas, p.sid, p.name, avatarColorSpec(p.color, sanitizeDye(p.dye)), p, performance.now(), p.look ?? [], isAvatarBody(p.body) ? p.body : "hood");
    r.view.setDexBadge(p.dex); // 도감 100% 배지 (입장 토큰에 서버가 넣은 것만 온다)
    r.view.setChamp(p.champ); // 주간 랭킹 1위 배지·오라 (입장 토큰·착용 증서에 서버가 넣은 것만 온다)
    r.view.setStaff(p.staff === true); // 31번 운영자: 저승사자 차림·"운영자" 배지 (서버가 넣은 표시만 온다)
    r.view.setMgr(p.mgr === true); // 11/16 매니저 칭호 (서버가 넣은 표시만 온다)
    r.view.setSprout(p.nb); // 11/22 새싹 (총 접속 3시간 미만 새 이웃 — 끝나는 시각까지)
    // 같은 sid가 다시 들어오면(이름·색 변경) 앉아 있던 좌석을 이어받는다
    r.seatId = prev?.seatId ?? null;
    r.view.setMood(p.mood); // 24번: 늦게 온 사람도 앉아 있는 사람의 상태를 본다
    this.riding?.applyPeer(r, p); // 동물원 타는 펫: 늦게 온 사람도 탄 모습을 본다
    this.forage?.applyPeer(p); // 4번 배 위 낚싯대: 늦게 온 사람도 본다
    r.setAway(p.away === true, performance.now(), true); // 이미 실내에 있는 사람은 연출 없이 숨긴다
    r.view.setFriend(this.isFriend(r)); // 친구: 이름표 옆 하트
    if (!r.seatId) for (const [seatId, owner] of this.seats) if (owner === p.sid) r.seatId = seatId;
    this.remotes.set(p.sid, r);
  }

  /** 자가 복구: 서버가 보낸 접속자 목록에 맞춘다 (없는 사람 추가, 사라진 사람 제거, 이름·색·꾸미기 갱신) */
  private reconcilePeers(peers: PeerInfo[], seats: Record<string, Sid>): void {
    const keep = new Set<Sid>();
    const now = performance.now();
    for (const p of peers) {
      if (p.sid === this.net.mySid) {
        // 내 벤치 상태는 서버 기억을 따른다 (새로고침·재접속 뒤 남들은 상태를 보는데 내 화면만 "…"이던 문제)
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
      this.forage.applyPeer(p);
      r.setAway(p.away === true, now);
      // 놓친 스냅샷 때문에 위치가 크게 어긋나 있으면 맞춘다
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

  // ── bridge (UI → 게임) ──

  private bindBridge(): void {
    const on = this.unsubs;
    this.meScreen = new MeScreen(this);
    on.push(() => this.meScreen.destroy());
    on.push(
      bridge.on("graves:set", ({ channel, graves, reviveTop, passed }) => {
        // 다른 채널 묘지 목록은 무시 (채널을 옮기는 사이에 늦게 온 응답 등)
        if (channel !== this.graveChannel) return;
        // 성불: 사라지기 전 자리에 작은 빛
        for (const id of passed ?? []) {
          const p = this.field.placement(id);
          if (p && !graves.some((g) => g.id === id)) this.fx.passGlow(p.x, p.y);
        }
        this.applyGraves(graves, reviveTop, true);
      }),
    );
    on.push(bridge.on("net:status", (st) => this.onNetStatus(st)));
    // 휴식 중(탭이 숨겨져 게임 루프를 재움)은 실시간 연결에서 탭 숨김과 같게
    on.push(bridge.on("game:rest", ({ on: resting }) => this.net.setResting(resting)));
    on.push(bridge.on("fx:squirrelsReset", () => this.net.squirrelsReset()));
    on.push(bridge.on("grave:focus", ({ graveId, walk }) => (this.trip.away ? this.toast("묘비는 마을에 있어요. 버스를 타고 마을로 돌아가요.") : this.focusGrave(graveId, walk))));
    // 11/16 [사냥] 버튼 → 사냥터 입구까지 걸어가기 (lib/huntWalk — 캠핑장·바닷가·탈것은 UI가 먼저 거른다). null = 그만 걷기
    on.push(bridge.on("portal:walkTo", ({ kind }) => this.walkToPortal(kind)));
    on.push(
      bridge.on("grave:buried", ({ graveId }) => {
        this.net.graveEvent("buried", graveId);
        this.pendingBury = { id: graveId, at: this.time.now };
        this.tryBury();
      }),
    );
    on.push(
      bridge.on("grave:changed", ({ graveId, kind }) => {
        // 내가 이장/삭제함: 목록 갱신을 기다리지 않고 그 묘비 툴팁·안내를 바로 지운다
        if (kind === "removed" && this.nearT.drop(graveId)) this.hideNear();
        this.net.graveEvent(kind, graveId);
      }),
    );
    on.push(bridge.on("grave:flowered", ({ graveId }) => this.playMyFlower(graveId)));
    on.push(bridge.on("channel:switch", ({ channel, fullMsg }) => this.switchChannel(channel, fullMsg)));
    on.push(bridge.on("channel:leave", () => this.leaveForChannel()));
    on.push(bridge.on("channel:refused", ({ back }) => back && this.backFromChannel()));
    // 실내(상점·집·분양 마을·사냥터·미니게임)에 들어가 있는 동안은 다른 사람 화면에서 숨긴다 (메인 맵의 나는 문 앞에 멈춰 있다)
    on.push(
      bridge.on("scene:changed", ({ scene, place, houseId, stay }) => {
        this.awayScene = scene !== "world" && scene !== "shop";
        this.huntScene = scene === "hunt";
        // 친구 위치용 장소 (친구 창에 "집 안"·"사냥터"처럼 보인다)
        const where = scene === "shop" ? "shop" : scene === "hunt" ? "hunt" : scene === "minigame" ? "game" : (place ?? "house");
        this.net.setAway(scene !== "world" && !stay, where, where === "house" ? houseId : undefined); // stay: 망원경 (RpgHostScene)
      }),
    );
    // 친구: 이 채널의 친구 표시 (이름표 하트·미니맵 하트)와 친구한테 가기
    on.push(
      bridge.on("friends:here", ({ ch, list }) => {
        this.friends = { ch, bySid: new Map(list.map((f) => [f.sid, f.name])) };
        for (const r of this.remotes.values()) r.view.setFriend(this.isFriend(r));
      }),
    );
    // 11/15 친구가 캠핑장에 있으면 버스를 거쳐 그 옆으로 (캠핑장에 있는 동안은 캠핑장 장면이 받는다). 11/16 바닷가도 같다
    on.push(
      bridge.on("friend:goto", ({ sid, name, x, y, map, tp }) => {
        if (this.trip.away) return;
        if (map) this.goToCampFriend({ sid, name, x, y, ...(tp ? { tp } : {}) }, map);
        else this.goToFriend(sid, name, x, y, tp);
      }),
    );
    // 11/20 운영자 순간이동 반짝임 (마을에 있을 때만 — 캠핑장·바닷가는 그 장면이)
    on.push(bridge.on("tp:fx", ({ x, y, k, map }) => map === "village" && !this.cleaned && !this.trip.away && !this.awayScene && !this.inShop && playTeleportFx(this, x, y, k, this.reduced)));
    on.push(bridge.on("input:joystick", ({ x, y }) => this.hub.setJoystick(x, y)));
    on.push(bridge.on("input:runToggle", ({ on: v }) => this.hub.setRunToggle(v)));
    on.push(bridge.on("input:sit", () => this.hub.dispatch("sit")));
    on.push(bridge.on("input:interact", () => this.hub.dispatch("interact")));
    on.push(bridge.on("input:jump", () => this.hub.dispatch("jump")));
    on.push(bridge.on("input:roll", ({ on: v }) => this.hub.setRollHold(v)));
    // 11/18 눈싸움: F(키보드)·[눈 던지기](터치). 캠핑장에 있으면 캠핑장 장면이 받는다
    on.push(
      bridge.on("input:snowball", () => {
        if (this.cleaned || this.hub.isBlocked || this.inShop || this.awayScene || this.trip.away || this.tripLock) return;
        this.walker.cancel();
        this.fight?.throwSnow();
      }),
    );
    // 마을·집 안이면 그 방(RoomPresence)이 받는다
    // 11/15 캠핑장에 있거나 버스를 타는 동안(trip.away)은 캠핑장 장면이 받는다
    on.push(bridge.on("input:say", ({ id }) => !this.awayScene && !this.trip.away && this.doSay(id)));
    on.push(bridge.on("input:emo", ({ id }) => !this.cleaned && !this.inShop && !this.awayScene && !this.trip.away && this.expr.emo(id, this.time.now)));
    on.push(
      bridge.on("input:chat", ({ text }) => {
        if (this.cleaned || this.inShop || this.trip.away) return;
        // 11/17 사냥 중: 월드 채널 연결(실내 장소 hunt)로 보낸다 — 마을의 나는 숨어 있으니 말풍선 없이
        if (this.huntScene) this.expr.chatHunting(text);
        else if (!this.awayScene) this.expr.chat(text, this.time.now);
      }),
    );
    // 11/16 귓속말은 월드 채널 연결로 (마을·캠핑장·실내 어디서든 — 받는 사람은 같은 채널 누구나)
    on.push(bridge.on("input:whisper", ({ to, text }) => !this.cleaned && this.net.whisper(to, text)));
    on.push(bridge.on("input:whoOn", ({ names }) => !this.cleaned && this.net.whoOn(names)));
    on.push(bridge.on("input:mood", ({ mood }) => !this.cleaned && !this.trip.away && this.expr.setMood(mood)));
    on.push(bridge.on("input:ride", () => !this.cleaned && !this.inShop && !this.trip.away && !this.tripLock && this.riding.toggle()));
    // 11/16 사냥터·미니게임·집으로 가기 직전 (lib/rideGate): 의자·그네 같은 자리에서 일어난다 (캠핑장·바닷가에 있으면 그 장면이 받는다)
    on.push(bridge.on("player:stand", () => !this.cleaned && !this.inShop && !this.trip.away && standForGate(this.player, this.time.now, this.seatReq)));
    on.push(bridge.on("route:guide", ({ target }) => this.setRoute(target)));
    // 채널을 옮겨 장면을 다시 만들었으면 켜 둔 안내를 잇는다
    const routeOn = bridge.last("route:guide")?.target;
    if (routeOn) this.setRoute(routeOn);
    on.push(bridge.on("guide:point", ({ target, label }) => !this.trip.away && this.guide.set(target ? this.resolveGuide(target, label) : null)));
    on.push(bridge.on("world:lot", ({ lot, label }) => (this.trip.away ? this.toast("마을로 돌아간 뒤에 볼 수 있어요.") : this.showLot(lot, label))));
    on.push(
      bridge.on("input:act", ({ kind }) => {
        // 표현 창 단추로 고른 몸짓: 창이 열려 키 입력이 막혀 있는 순간에 오므로 onAction(막혀 있으면 버린다)을 거치지 않고 바로 한다
        // (이모티콘 input:emo와 같은 조건 — 예전엔 폰에서 표현 창의 1·2번이 사라졌다)
        if ((kind === "wave" || kind === "cheer") && !this.cleaned && !this.inShop && !this.awayScene && !this.trip.away && !this.tripLock) {
          this.walker.cancel();
          this.doAct(kind);
        }
      }),
    );
    on.push(bridge.on("ui:blockKeys", ({ blocked }) => this.hub.setBlocked(blocked)));
    // 11/19 촬영 모드에 들어가면 묘비·입구로 걸어가던 것도 멈춘다 (촬영 중엔 내 캐릭터가 서 있다)
    on.push(bridge.on("photo:mode", ({ on: v }) => v && this.walker.cancel()));
    on.push(bridge.on("camera:recenter", () => !this.trip.away && this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => !this.trip.away && this.rig.zoomBy(delta)));
    on.push(bridge.on("net:reconnect", () => this.net.reconnect()));
    // 11/20 닉네임을 바꾸면 바로: 내 이름표를 바꾸고, 새 이름이 실린 입장 토큰으로 다시 접속 (같은 채널 유예 안이라 자리는 그대로)
    on.push(
      bridge.on("me:renamed", ({ name }) => {
        if (name === this.ctx.opts.name) return;
        // 시작 옵션은 화면 쪽에서 얼린 객체라 새로 만들어 바꾼다 (같은 ctx를 쓰는 곳 모두 새 이름을 본다)
        this.ctx.opts = { ...this.ctx.opts, name };
        this.player.view.setName(name);
        this.net.setName(name);
        this.net.reconnect();
      }),
    );
    on.push(bridge.on("look:set", (e) => this.applyLook(e.look, e.lookGrant, e)));
    this.festUntil = bridge.last("urgent:fest")?.until ?? 0;
    on.push(bridge.on("urgent:fest", ({ until }) => (this.festUntil = until)));
    // 11/17 마을 맵 컨셉 (lib/mapConcept): 주소 시험 값(?concept=, 실서버는 막힘)이 있으면 그것만, 없으면 관리자가 고른 값을 따른다
    const conceptQa = parseConceptOverride(window.location.search);
    const applyConcept = (c: MapConcept) => {
      this.concept = c;
      this.map.setConcept(c);
      this.atmos.setSnowy(isSnowy(c));
    };
    applyConcept(conceptQa ?? bridge.last("map:concept")?.concept ?? "default");
    if (!conceptQa) {
      on.push(bridge.on("map:concept", ({ concept }) => !this.cleaned && applyConcept(concept)));
      on.push(startMapConceptSync());
    }
    // 시험 값은 화면(미니맵)도 같이 보게 알린다 — 서버 값 확인은 돌리지 않으니 덮어쓰이지 않는다
    else if (bridge.last("map:concept")?.concept !== conceptQa) bridge.emit("map:concept", { concept: conceptQa });
    // 입김: 내 캐릭터 + 다른 사람 (WorldMap 장식이 화면 근처만 고른다)
    const self = { key: {} as object, x: 0, y: 0, dir: DIR.down as DirId };
    this.map.setActors(() => this.breathers(self));
    // 11/15 긴급 의뢰 100% 달성: 축하 폭죽 한 발
    on.push(
      bridge.on("urgent:goal", () => {
        if (this.awayScene || this.inShop || this.trip.away) return;
        // 가운데 한 발 + 양옆 한 발씩 (게시판 창이 가운데를 가려도 옆에서 보이게)
        const v = this.fireworkView();
        this.fireworks.launch("fw_triple", v.x + v.width / 2, v.y + v.height * 0.9, v, false);
        for (const [fx, delay] of [
          [0.13, 350],
          [0.87, 700],
        ] as const)
          this.time.delayedCall(delay, () => {
            if (this.cleaned || this.awayScene || this.inShop) return;
            const w = this.fireworkView();
            this.fireworks.launch("fw_star", w.x + w.width * fx, w.y + w.height * 0.9, w, false);
          });
        this.sky?.firework();
      }),
    );
    on.push(
      bridge.on("firework:fire", ({ item, grant }) => {
        // 누른 순간 내 자리에서 바로 터뜨리고, 서버에는 증서를 보낸다 (서버가 같은 채널에 알린다)
        // 11/15 캠핑장에 있으면 터뜨리는 그림은 캠핑장 장면이 (증서는 여기서 한 번만 보낸다)
        if (this.trip.away) {
          this.net.firework(grant);
          return;
        }
        // 11/20 광역 불꽃쇼는 서버가 돌려준 때에 모두 같이 터진다 (onFirework)
        if (fireworkShowMs(item) > 0) {
          this.net.firework(grant);
          return;
        }
        this.fireworks.launch(item, this.player.x, this.player.y, this.fireworkView(), true, this.ctx.opts.name);
        this.sky?.firework();
        this.net.firework(grant);
      }),
    );
    on.push(
      bridge.on("graves:mine", ({ ids }) => {
        this.field.setMine(Array.isArray(ids) ? ids : []);
        this.nearT.touch(); // 툴팁의 내 묘비 표시도 다시
      }),
    );
    on.push(bridge.on("megaphone:send", ({ grant }) => this.net.megaphone(grant)));
    on.push(bridge.on("shop:closed", () => this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false)));
    on.push(bridge.on("wish:thrown", () => this.onWishThrown()));
    // 채널 이동 창의 "지금 이 채널에 있는 사람" 미리보기
    on.push(bridge.on("peers:ask", () => !this.trip.away && bridge.emit("peers:list", peerList(this.remotes.values(), "village"))));
  }

  private applyLook(look: string[], grant: string, extra?: AppearanceChange): void {
    const clean = Array.isArray(look) ? look.filter((x): x is string => typeof x === "string") : [];
    this.player.view.setLook(clean);
    // 46·25번: 염색·외형 바꾸기 (상점·가방에서 바꾸면 바로 내 아바타에도)
    this.player.view.applyAppearance(extra);
    if (grant) this.net.look(grant);
  }

  /** 채널이 바뀌면 묘지를 비우고, 그 채널 목록이 이미 와 있으면 바로 깐다 */
  private onNetStatus(st: NetStatus): void {
    const ch = graveChannelFor(st, this.ctx.opts.channel);
    if (ch === this.graveChannel) return;
    this.graveChannel = ch;
    this.markers.clear();
    this.remoteBuried.clear();
    this.pendingBury = null;
    this.applyGraves([], [], true);
    const last = bridge.last("graves:set");
    if (last && last.channel === ch) this.applyGraves(last.graves, last.reviveTop, true);
  }

  private applyGraves(graves: PublicGrave[], reviveTop: string[], live: boolean): void {
    const t0 = performance.now();
    const res = this.field.setData(graves, reviveTop);
    if (res.rowsChanged || !live) {
      this.map.setRows(this.field.layout.rows, graves.length);
      if (live) {
        this.rig.setMapHeight(this.map.height);
        this.atmos.setGridLights(this.map.gridLights);
      }
    }
    const now = this.time.now;
    for (const [id, at] of this.remoteBuried) {
      if (this.field.placement(id)) {
        this.field.rise(id, now);
        const p = this.field.placement(id)!;
        this.fx.bury(p.x, p.y);
        this.markers.add(p, OTHER_GRAVE_MARK_MS, null, now);
        this.remoteBuried.delete(id);
      } else if (now - at > REMOTE_BURY_TTL_MS) this.remoteBuried.delete(id);
    }
    if (live) {
      this.tryBury();
      if (this.pendingFocus) this.resolveFocus();
      // 목록이 바뀌면 근접 툴팁 내용도 다시. 대상 묘비가 사라졌으면(이장·삭제) 툴팁·안내를 지금 바로 지운다
      if (this.nearT.invalidate((id) => !!this.field.grave(id))) this.hideNear();
    }
    this.debugMark("applyGravesMs", performance.now() - t0);
  }

  private resolveFocus(): void {
    const id = this.pendingFocus;
    if (!id) return;
    this.pendingFocus = null;
    const p = this.field.placement(id);
    if (p) {
      const s = standSpot(p);
      this.player.warp(s.x, s.y, this.time.now, this.seatReq);
      this.player.faceTo(p.x, p.y, this.time.now);
      if (this.netStarted) this.net.warp(s.x, s.y);
      bridge.emit("grave:open", { graveId: id });
    }
    this.startNet();
  }

  /** 11/16 입구까지 걷기 (null = 그만). 마을 밖(캠핑장·바닷가·버스)·실내에서는 걷지 않는다. 11/19 shop = 잡화점 문 (이미 안이면 상점 창만) */
  private walkToPortal(kind: "hunt" | "shop" | "housing" | null): void {
    if (this.cleaned) return;
    if (!kind) {
      if (this.walker.portal) this.walker.cancel();
      return;
    }
    if (this.trip.away || this.awayScene || this.tripLock) return;
    if (kind === "shop" && this.inShop) return void bridge.emit("shop:open");
    if (this.inShop) this.exitShop();
    this.walker.goPortal(kind, this.time.now);
  }

  /** walk=true: 길을 찾아 그 묘비 앞까지 걸어간다 (41번, 순간이동 없음). false: 카메라만 */
  private focusGrave(id: string, walk: boolean): void {
    const p = this.field.placement(id);
    if (!p) return;
    if (this.inShop) this.exitShop();
    if (walk) this.walker.go(id, this.time.now);
    else this.rig.focus(p.x, p.y - 10);
    this.fx.highlight(p.x, p.y);
  }

  /** 자동 걷기 직전: 앉았거나 매달려 있으면 일어나고(불멍 화면은 update가 푼다), 카메라는 다시 나를 따라온다 */
  private beforeAutoWalk(): void {
    const pl = this.player;
    const now = this.time.now;
    if (pl.anchored) pl.leaveAnchor(now);
    else if (pl.sitting) pl.stand(now, this.seatReq);
    if (pl.inBoat) this.boats.disembark(true);
    if (pl.inCar) this.bumper.leave();
    this.rig.recenter();
    this.recenterAt = 0;
  }

  private tryBury(): void {
    const b = this.pendingBury;
    if (!b) return;
    if (this.time.now - b.at > BURY_WAIT_MS) {
      this.pendingBury = null;
      return;
    }
    const p = this.field.placement(b.id);
    if (!p) return; // 목록 갱신을 기다린다
    this.pendingBury = null;
    if (this.inShop) this.exitShop();
    // 1) 카메라가 새 묘비로 가서 2) 흙이 덮이고 묘비가 솟은 뒤 3) 내 캐릭터가 그 앞으로 순간이동, 카메라는 다시 따라간다
    this.rig.focus(p.x, p.y - 10);
    this.field.rise(b.id, this.time.now + 450);
    this.time.delayedCall(450, () => this.fx.bury(p.x, p.y));
    const id = b.id;
    this.time.delayedCall(BURY_WARP_DELAY_MS, () => {
      if (this.cleaned) return;
      const q = this.field.placement(id) ?? p;
      const s = standSpot(q);
      const now = this.time.now;
      this.player.warp(s.x, s.y, now, this.seatReq);
      this.player.faceTo(q.x, q.y, now);
      this.net.warp(s.x, s.y);
      this.rig.recenter();
      this.recenterAt = 0;
      // 위치 표시는 내 묘비의 상시 빛(GraveView)이 맡는다 (세운 순간 잠깐 더 밝다)
    });
  }

  private playMyFlower(graveId: string): void {
    const p = this.field.placement(graveId);
    const now = this.time.now;
    const pl = this.player;
    if (p) {
      const near = Math.hypot(pl.x - p.x, pl.y - p.y) < 48;
      if (near && !pl.sitting) {
        pl.faceTo(p.x, p.y, now);
        pl.view.gesture(pl.dir, 520, now);
        this.fx.flowerToss(pl.x, pl.y, p.x, p.y);
      } else {
        this.fx.flowerBurst(p.x, p.y);
        pl.view.emote("flower", now);
      }
    }
    this.net.emote("flower", graveId);
  }

  private playRemoteEmote(sid: Sid, kind: EmoteKind, graveId: string): void {
    const r = this.remotes.get(sid);
    const p = this.field.placement(graveId);
    const now = performance.now();
    if (kind === "flower") {
      if (r?.visible && p && Math.hypot(r.x - p.x, r.y - p.y) < 48) {
        r.view.gesture(r.view.dir, 520, now);
        this.fx.flowerToss(r.x, r.y, p.x, p.y);
      } else {
        if (p) this.fx.flowerBurst(p.x, p.y);
        if (r?.visible) r.view.emote("flower", now);
      }
    }
  }

  // ── 유령 잡화점 ──

  private enterShop(): void {
    if (this.inShop || this.cleaned) return;
    // 11/19 [상점에서 사기]로 걷다가 문에 먼저 닿았으면 도착으로 치고 상점 창까지 연다
    const walkedHere = this.walker.portal === "shop";
    if (walkedHere) this.walker.reachPortal();
    else this.walker.cancel();
    this.inShop = true;
    const pl = this.player;
    if (pl.sitting) pl.stand(this.time.now, this.seatReq);
    this.leaveCampfire();
    this.sfx.campfire(0);
    this.tooltip.hide();
    if (this.nearId) bridge.emit("grave:near", null);
    if (this.nearSeatId) bridge.emit("seat:near", null);
    this.nearT.clear();
    this.nearSeatId = null;
    this.seatHint.update(null, this.player, -1, true, 1);
    this.rig.enabled = false;
    // 월드는 숨기기만 한다: 연결·원격 아바타 보간은 계속, 내 위치는 문 앞에 멈춰 있다
    this.scene.setVisible(false);
    const data: ShopContext = {
      atlas: this.atlas,
      input: this.hub,
      color: this.ctx.opts.color,
      name: this.ctx.opts.name,
      look: this.player.view.wearing,
      body: this.player.view.bodyId,
      reduced: this.reduced,
      onExit: () => this.exitShop(),
    };
    this.scene.launch("shop", data);
    bridge.emit("scene:changed", { scene: "shop" });
    if (walkedHere) bridge.emit("shop:open");
  }

  private exitShop(): void {
    if (!this.inShop) return;
    this.inShop = false;
    this.scene.stop("shop");
    this.scene.setVisible(true);
    this.rig.enabled = true;
    this.hub.setHandler((a) => this.onAction(a));
    const now = this.time.now;
    const pl = this.player;
    if (Math.hypot(pl.x - SHOP_DOOR.x, pl.y - SHOP_DOOR.y) > 4) {
      pl.warp(SHOP_DOOR.x, SHOP_DOOR.y, now, this.seatReq);
      this.net.warp(SHOP_DOOR.x, SHOP_DOOR.y);
    }
    pl.dir = DIR.down;
    pl.view.apply(pl.state, DIR.down, now);
    bridge.emit("scene:changed", { scene: "world" });
  }

  // ── 입력 ──

  private onAction(a: KeyAction): void {
    if (this.hub.isBlocked || this.cleaned || this.inShop || this.tripLock) return;
    this.walker.cancel();
    const pl = this.player;
    const now = this.time.now;
    const occupied = this.net.online ? this.seats : EMPTY_SEATS;
    const mySid = this.net.online ? this.net.mySid : null;
    // 놀이기구 2: 관람차가 돌거나 열기구가 떠 있는 동안 X·E·스페이스는 두 번 눌러 내리기 (SkyRides)
    if (this.sky.onAction(a)) return;
    // 11/16 범퍼카 위: E = 입구 안쪽에서 내리기, Space = 빵빵 (표현·채팅 키는 그대로 지나간다)
    if (this.bumper.onAction(a)) return;
    if (a === "jump" && pl.inBoat) {
      this.boats.quack(); // 11/15 오리배 위 Space = 꽥 (조각배에서는 아무 일 없다)
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
    // 4번 배 위 낚시: 물가가 아닌 물 위에서 E → 낚싯대를 드리운다 (물가에서는 그대로 내리기)
    if (a === "interact" && pl.inBoat && !this.boats.nearShore()) {
      const at = this.boats.fishingSpot();
      if (at) this.forage.fishFromBoat(at);
      // 11/15 오리배: E는 내리기 전용 (꽥은 Space만). 11/16 조종하는 사람은 가장 가까운 둑으로 저절로 저어 가서 내린다 (옆자리는 안내만)
      else if (!this.boats.goAshore()) this.toast(`둑 가까이 가면 ${keyJosa("E", "로")} 내릴 수 있어요`);
      return;
    }
    // 조각배 위: E = 물가에서 내리기, 앉기·점프 없음
    if (this.boats.onAction(a)) return;
    if (pl.airborne) return;
    // 이동 입력이 있는 동안에는 앉지 않는다 (걷다가 X를 같이 눌러도 상태가 튀지 않게)
    const moving = Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER;
    if (a === "sit") {
      if (moving || pl.inWater) return;
      if (pl.anchored) pl.leaveAnchor(now);
      else if (pl.sitting) pl.stand(now, this.seatReq);
      else pl.sit(pickSeat(pl.x, pl.y, occupied, mySid), now, this.seatReq);
      return;
    }
    if (nearShopDoor(pl.x, pl.y)) {
      this.enterShop();
      return;
    }
    if (pl.anchored) {
      pl.leaveAnchor(now);
      return;
    }
    // 22번: 바로 옆 고양이·유령 쓰다듬기
    if (!pl.sitting && !pl.inWater && this.life.pet()) return;
    const water = pl.state === "swim" ? "swim" : pl.state === "dive" ? "dive" : null;
    const near = water ? null : nearestGrave(this.field.layout, pl.x, pl.y, GRAVE_NEAR_RADIUS);
    const seat = pl.sitting || moving || water ? null : pickSeat(pl.x, pl.y, occupied, mySid);
    const t = pickInteraction({
      px: pl.x,
      py: pl.y,
      grave: near ? { id: near.p.id, dist: near.dist } : null,
      seat,
      objects: pl.sitting ? [] : this.map.interactables,
      water,
      nearWater: !pl.sitting && nearWater(pl.x, pl.y),
    });
    switch (t.kind) {
      case "grave":
        bridge.emit("grave:open", { graveId: t.graveId });
        break;
      case "seat":
        pl.sit(t.seat, now, this.seatReq);
        break;
      case "object":
        this.useObject(t.obj);
        break;
      case "dive":
      case "surface":
        pl.toggleDive(now);
        if (t.kind === "dive") this.fx.splash(pl.x, pl.y);
        break;
      case "splash":
        this.doAct("splash");
        break;
      default:
        if (pl.sitting) pl.stand(now, this.seatReq);
    }
  }

  /** 나무·그네·종·우물·특별한 장소 */
  private useObject(o: Interactable): void {
    const pl = this.player;
    const now = this.time.now;
    if (pl.inCar) return; // 범퍼카에 탄 채로는 다른 것과 상호작용하지 않는다 (내리기는 onAction)
    // 11/15 바베큐로 커진 동안에는 타는 것(그네·배·놀이기구·범퍼카·버스)을 못 탄다 (서버 onSit도 거절)
    if (RIDE_OBJECT_KINDS.has(o.kind) && myBig() > 1) {
      this.toast(BIG_RIDE_TOAST);
      return;
    }
    switch (o.kind) {
      case "tree":
      case "swing":
      case "hammock":
        this.useSpot(o);
        break;
      case "bell":
        pl.faceTo(o.x, o.y - 8, now);
        this.doAct("bell", o);
        break;
      case "well":
        pl.faceTo(o.x, o.y - 4, now);
        this.doAct("splash", o);
        break;
      case "water":
        this.doAct("splash");
        break;
      case "portal":
        // 11/20 판교의 등대: 회장님 독대 입장 창 (components/chairman)
        if (o.portal === "lighthouse") {
          pl.faceTo(o.x, o.y - 10, now);
          if (pl.sitting) pl.stand(now, this.seatReq);
          bridge.emit("chairman:door");
        } else if (o.portal) {
          if (pl.sitting) pl.stand(now, this.seatReq);
          bridge.emit("portal:open", { kind: o.portal });
        }
        break;
      case "door":
        // 주거 구역의 집 문 → UI(하우징)가 집 정보를 받아 house:enter. 나오면 이 문 앞으로 돌아온다
        pl.faceTo(o.x, o.y - 10, now);
        if (pl.sitting) pl.stand(now, this.seatReq);
        if (o.houseId) bridge.emit("portal:open", { kind: "housing", houseId: o.houseId });
        break;
      case "lot":
        // 빈 필지 팻말 → 그 번지로 분양 문의 (분양 사무소 창)
        pl.faceTo(o.x, o.y - 10, now);
        if (o.lot) bridge.emit("portal:open", { kind: "housing", lot: o.lot });
        break;
      case "forage":
        // 4·32번 낚시 자리·NPC·채집 지점 (world/forage)
        this.forage.use(o);
        break;
      case "zoo":
        // 동물원 사육사 → 펫 분양 창 (components/zoo)
        if (pl.sitting) pl.stand(now, this.seatReq);
        pl.faceTo(o.x, o.y - 18, now);
        bridge.emit("zoo:open");
        break;
      case "telescope":
      case "mat":
        // 22번 별 보기 언덕: 망원경(별자리 잇기)·돗자리 — 1인 자리
        this.life.useStarSpot(o);
        break;
      case "bumper":
        // 11/16 범퍼카장 입구: 빈 차 중 무작위 하나에 탄다 (BumperRide)
        pl.faceTo(o.x, o.y + 10, now);
        this.bumper.use();
        break;
      case "bus":
        // 11/15 주말 버스 정류장 (버스 정류장 마당): 캠핑장이 열린 서버면 버스가 온다 (CampTrip). 운영에서 닫혀 있으면 지금처럼 안내만
        // 11/16 옛 묘역 아래 바닷가행 정류장 (bus:sea): 바닷가가 열린 서버면 바닷가 버스
        pl.faceTo(o.x, o.y - 20, now);
        if (o.id === "bus:sea") {
          if (this.net.seaOpen) this.trip.board(null, "sea");
          else this.toast("바닷가 가는 버스는 준비 중이에요.");
        } else if (this.net.campOpen) this.trip.board();
        else this.toast("캠핑장 가는 버스는 준비 중이에요.");
        break;
      case "dock":
        // 조각배(50번): 빈 배 앞자리에 타거나 2인승 뒷자리에 같이 탄다 (BoatRide)
        pl.faceTo(o.x, o.y + 10, now);
        this.boats.useDock(o.id);
        break;
      // ── 50번 광장 놀거리 ── 시소·트램펄린은 그네처럼 1인 자리, 회전목마는 빈 목마를 골라 탄다, 소원 분수는 UI 창
      case "seesaw":
      case "trampoline":
        this.useSpot(o);
        break;
      case "carousel":
        this.rides.useCarousel(o);
        break;
      // 놀이기구 2: 관람차(맨 아래로 내려온 칸의 빈자리)·열기구(출발장에 내려와 있는 기구의 빈자리)
      case "ferris":
      case "balloon":
        this.sky.use(o);
        break;
      case "wish":
        pl.faceTo(o.x, o.y - 12, now);
        if (pl.sitting) pl.stand(now, this.seatReq);
        bridge.emit("portal:open", { kind: "wish" });
        break;
    }
  }

  /**
   * 1인 자리(나무 매달리기·그네): 한 자리에는 한 명. 서버가 판정하면 이미 누가 있을 때 붙지 않고 안내만,
   * 비어 보이면 바로 붙고(지연 숨김) 점유를 요청한다 — 동시에 잡아 거절되면 mySpotLost가 내려오게 한다.
   */
  private useSpot(o: Interactable): void {
    const spot = spotOf(o);
    if (!spot) return;
    if (spot.kind === "telescope" || spot.kind === "mat") return this.life.useStarSpot(o); // 22번 (world/life)
    if (!isAttachKind(spot.kind)) return;
    const pl = this.player;
    const judged = this.spotsJudged && this.net.online;
    if (judged && spotTaken(spot.id, this.seats, this.net.mySid)) {
      this.toast(SPOT_TAKEN_TOAST[spot.kind]);
      return;
    }
    // 그네 틀·해먹 천(받침 y)보다 앞에 그려야 아바타가 가려지지 않는다
    pl.attach(spot.kind, o.ax, o.ay, spotDepth(spot.kind, o.ay), this.time.now, this.seatReq, spot.id);
    // 의자에서 바로 옮겨 오면 attach가 일어서기(stand)를 먼저 보낸다 → 그다음 점유 요청
    if (judged) this.net.sit(spot.id);
  }

  /** 내 나무·그네 자리를 다른 사람이 먼저 차지했다 (동시 시도·복원 경쟁): 내려와 옆에 서고 안내한다 */
  private mySpotLost(spotId: string): void {
    const pl = this.player;
    if (pl.spotId !== spotId) return;
    const slot = seatSlot(spotId);
    const now = this.time.now;
    pl.leaveAnchor(now);
    if (!slot) return;
    const others = [...this.remotes.values()].map((r) => ({ x: r.x, y: r.y }));
    const to = standBesideSpot(slot, others, inWater);
    pl.warp(to.x, to.y, now, null);
    if (slot.kind !== "seat") this.toast(SPOT_TAKEN_TOAST[slot.kind as SpotKind]);
  }

  private toast(message: string): void {
    const now = this.time.now;
    if (message === this.toastMsg && now - this.toastAt < TOAST_REPEAT_MS) return;
    this.toastMsg = message;
    this.toastAt = now;
    bridge.emit("toast", { message });
  }

  /**
   * 게임 안 채널 이동 (19): 새 채널의 처음 자리(SPAWN)에서 시작한다. 앉은 자리·나무·그네는 놓고 간다.
   * 꽉 찬 채널로는 옮기지 않는다 — 실시간 클라이언트가 먼저 로비를 보고, 통과해야 channel:leave가 온다 (그 전엔 그대로).
   * 새로고침 복원(lib/resume.ts)은 이 길을 타지 않아 같은 채널의 같은 자리로 돌아온다.
   */
  private switchChannel(channel: number, fullMsg?: string): void {
    this.walker.cancel();
    if (this.net.online && this.net.channel === channel) return;
    void this.net.switchChannel(channel, fullMsg);
  }

  /** 채널을 실제로 떠난다: 지금 자리를 기억하고 처음 자리(SPAWN)로 */
  private leaveForChannel(): void {
    this.channelBack = null;
    if (this.inShop) return;
    const now = this.time.now;
    this.channelBack = { x: this.player.x, y: this.player.y, dir: this.player.dir };
    this.leaveCampfire();
    this.player.warp(SPAWN.x, SPAWN.y, now, this.seatReq);
    this.player.dir = DIR.down;
    this.player.view.apply(this.player.state, DIR.down, now);
    this.rig.recenter();
    this.recenterAt = 0;
  }

  /** 옮기려던 채널이 들어가는 순간 꽉 차 온 채널로 돌아간다: 떠나기 전 자리로 (다시 접속할 때 이 좌표로 들어간다) */
  private backFromChannel(): void {
    const b = this.channelBack;
    this.channelBack = null;
    if (!b || this.inShop) return;
    const now = this.time.now;
    this.walker.cancel();
    this.player.warp(b.x, b.y, now, this.seatReq);
    this.player.dir = b.dir;
    this.player.view.apply(this.player.state, b.dir, now);
    this.rig.recenter();
    this.recenterAt = 0;
  }

  /** 첫 방문 안내 대상 → 화살표를 띄울 월드 좌표 (대상 그림 위쪽) */
  /** F17 미니맵: 내 위치와 같은 채널 사람들 위치 (원격 아바타 보간 위치) */
  private emitMinimap(): void {
    const others: number[] = [];
    const friends: number[] = [];
    for (const r of this.remotes.values()) if (!r.away) (r.view.friend ? friends : others).push(Math.round(r.x), Math.round(r.y));
    // 마을 주민: 작은 회색 점 (서버에 없는 클라이언트 시뮬레이션)
    bridge.emit("minimap:dots", { me: { x: Math.round(this.player.x), y: Math.round(this.player.y) }, others, residents: this.life.residentDots(), friends });
  }

  /** 이 채널의 친구인지 (UI가 알려 준 sid와 이름이 둘 다 맞아야 — 나갔다가 다른 사람이 같은 sid를 받아도 하트가 옮겨 붙지 않게) */
  private isFriend(r: RemoteAvatar): boolean {
    return this.net.channel === this.friends.ch && this.friends.bySid.get(r.sid) === r.name;
  }

  /**
   * 친구한테 가기 (같은 채널 마을): 친구 둘레의 걸을 수 있는 칸(담·소품·묘비·물·다른 사람 피하기)으로 순간이동한다.
   * 이동은 기존 warp 그대로 — 서버가 범위·쿨다운을 보고 속도 검증은 건너뛴다(그 사이 MOVE는 보내지 않는다).
   * 화면에 친구가 보이면 지금 위치, 아니면 서버가 알려 준 위치(x, y) 둘레로
   */
  private goToFriend(sid: Sid, name: string, fx: number, fy: number, tp?: true, landed = false): void {
    if (this.cleaned || !this.net.online) return;
    const notice = (message: string) => bridge.emit("friend:notice", { message });
    if (this.awayScene) return notice(tp ? "마을로 나온 뒤에 순간이동할 수 있어요." : "마을로 나온 뒤에 친구한테 갈 수 있어요.");
    const r = this.remotes.get(sid);
    const live = r && r.name === name ? r : null;
    if (live?.away) return notice(tp ? STAFF_TP_INSIDE_MSG : `${name}님은 지금 실내에 있어요.`);
    const at = live ? { x: live.x, y: live.y } : { x: fx, y: fy };
    if (this.inShop) this.exitShop();
    this.walker.cancel();
    this.leaveCampfire();
    this.beforeAutoWalk();
    const feet = this.graveBoxes();
    const hitsLow = (x: number, y: number) => feet.some((b) => x - 4 < b.x + b.w && x + 4 > b.x && y - 5 < b.y + b.h && y > b.y);
    const others = [...this.remotes.values()].filter((o) => !o.away).map((o) => ({ x: o.x, y: o.y }));
    const spot = besideFriend(at, others, (x, y) => !standable(x, y) || inWater(x, y) || hitsLow(x, y));
    const now = this.time.now;
    // 11/20 운영자 순간이동: 떠난 자리 반짝임 (버스로 막 내렸으면 떠난 자리는 다른 맵이라 없다)
    if (tp && !landed) playTeleportFx(this, this.player.x, this.player.y, "out", this.reduced);
    this.player.warp(spot.x, spot.y, now, this.seatReq);
    this.player.faceTo(at.x, at.y, now);
    // 운영자는 서버에 tp로 (운영자 연결만 받는다). 맵을 옮기며 이미 tp로 왔으면 옆 칸으로 warp만
    if (tp && !landed) this.net.staffTp(sid, spot.x, spot.y);
    else this.net.warp(spot.x, spot.y);
    if (tp) playTeleportFx(this, spot.x, spot.y, "in", this.reduced);
    this.rig.recenter();
    this.recenterAt = 0;
    // 안내는 이동이 끝난 뒤 한 번만 (가는 중… 안내는 띄우지 않는다)
    notice(tp ? STAFF_TP_ARRIVED : FRIEND_ARRIVED);
  }

  /** 11/15 버스를 기다리거나 타는 동안 입력을 막는다 (장면은 그대로). 풀면 키 처리를 월드로 돌려받는다 */
  private lockForTrip(on: boolean): void {
    this.tripLock = on;
    this.walker.cancel();
    if (on) {
      this.leaveCampfire();
      this.sfx.campfire(0);
      this.tooltip.hide();
      if (this.nearId) bridge.emit("grave:near", null);
      if (this.nearSeatId) bridge.emit("seat:near", null);
      this.nearT.clear();
      this.nearSeatId = null;
      this.seatHint.update(null, this.player, -1, true, 1);
      return;
    }
    this.rig.enabled = true;
    this.hub.setHandler((a) => this.onAction(a));
    this.rig.recenter();
  }

  /**
   * 11/15 마을 정류장에 내렸다 (친구한테 가는 중이면 그 옆으로).
   * 11/19 캠핑장 ↔ 바닷가 친구(friend.next): 버스 안에 숨은 채로 그 맵 버스를 이어 탄다 (CampTrip이 막 끝난 창밖 연출 장면이 멈춘 뒤에 부른다).
   * 이어 타지 못하면 정류장에 나타나고 화면 UI를 되돌린다
   */
  private arrivedByBus(friend: CampFriend | null): void {
    if (!friend || this.cleaned) return;
    const next = friend.next;
    if (!next) return this.goToFriend(friend.sid, friend.name, friend.x, friend.y, friend.tp, true);
    if (this.goToCampFriend({ sid: friend.sid, name: friend.name, x: friend.x, y: friend.y, ...(friend.tp ? { tp: friend.tp } : {}) }, next, true)) return;
    this.player.view.fade = 1;
    this.net.setAway(false);
    bridge.emit("bus:state", { riding: false });
  }

  /**
   * 11/15 캠핑장에 있는 친구한테 가기: 같은 채널이면 버스 창밖 연출만 보고 친구 옆에 내린다. 11/16 바닷가 친구도 같다.
   * 11/19 바베큐로 몸이 커져 있으면 버스를 못 타니 막는다 (lib/friendRoute). 버스를 탔으면 true.
   * transfer = 캠핑장 ↔ 바닷가 친구한테 가다 마을 정류장에서 이어 타는 중 (방금 버스에서 내려 탈것 확인은 건너뛴다 — 화면은 아직 버스 탑승 중)
   */
  private goToCampFriend(f: CampFriend, map: AwayMapId = "camp", transfer = false): boolean {
    const notice = (message: string) => (bridge.emit("friend:notice", { message }), false);
    if (this.cleaned || !this.net.online) return false;
    if (!(map === "sea" ? this.net.seaOpen : this.net.campOpen)) return notice(`지금은 ${MAP_NAME[map]}에 갈 수 없어요.`);
    if (this.awayScene) return notice("마을로 나온 뒤에 친구한테 갈 수 있어요.");
    const route = friendRoute("village", map, myBig());
    if (route.do === "block") return notice(route.message);
    // 11/16 오리배·범퍼카 같은 탈것에 탄 채로는 버스를 타지 않는다 (lib/rideGate — 사냥터 입구와 같은 규칙)
    const why = transfer ? null : rideBlocked(`${MAP_NAME[map]}에 갈`);
    if (why) return notice(why);
    if (this.inShop) this.exitShop();
    this.leaveCampfire();
    this.trip.board({ sid: f.sid, name: f.name, x: f.x, y: f.y, ...(f.tp ? { tp: f.tp } : {}) }, map);
    return this.trip.away;
  }

  /**
   * 집에 들어갈 때·나올 때(game/housing/install.ts): 월드의 내 캐릭터를 그 번지 집 문 앞(걸을 수 있는 칸)으로 옮긴다.
   * 들어가기 전 자리(친구 따라가기·집 놀러 가기로 들어왔으면 엉뚱한 곳)로 돌아오지 않게, 새로고침 복원도 문 앞을 기억하게.
   * 서버에도 warp로 알린다 (집 안에 있는 동안은 다른 사람 화면에서 숨겨져 있다). 메인 맵에 없는 번지면 그대로
   */
  standAtHouseDoor(lot: number): void {
    if (this.cleaned) return;
    const feet = this.graveBoxes();
    const hitsLow = (x: number, y: number) => feet.some((b) => x - 4 < b.x + b.w && x + 4 > b.x && y - 5 < b.y + b.h && y > b.y);
    const others = [...this.remotes.values()].filter((o) => !o.away).map((o) => ({ x: o.x, y: o.y }));
    const spot = doorFront(lot, others, (x, y) => !standable(x, y) || inWater(x, y) || hitsLow(x, y));
    if (!spot) return;
    const pl = this.player;
    if (Math.hypot(pl.x - spot.x, pl.y - spot.y) < 2 && !pl.sitting && !pl.anchored) return;
    this.walker.cancel();
    this.leaveCampfire();
    this.beforeAutoWalk();
    const now = this.time.now;
    pl.warp(spot.x, spot.y, now, this.seatReq);
    pl.dir = DIR.down;
    pl.view.apply(pl.state, DIR.down, now);
    this.net.warp(spot.x, spot.y);
    this.rig.recenter();
    this.recenterAt = 0;
  }

  private resolveGuide(target: GuideTarget, label?: string): { x: number; y: number; text: string } | null {
    const pl = this.player;
    const near = <T extends { x: number; y: number }>(list: Iterable<T>): T | null => {
      let best: T | null = null;
      let bd = Infinity;
      for (const p of list) {
        const d = Math.hypot(p.x - pl.x, p.y - pl.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    };
    switch (target) {
      case "nearestGrave": {
        const l = this.field.layout;
        const p = near([...l.placements, ...l.revive.filter((r): r is GravePlacement => r !== null)]);
        return p ? { x: p.x, y: p.y - 26, text: label ?? "묘비" } : null;
      }
      case "shop":
        return { x: SHOP.x, y: SHOP.y - 34, text: label ?? "유령 잡화점" };
      case "hunt":
        return { x: HUNT_GATE.x, y: HUNT_GATE.y - 30, text: label ?? "사냥터" };
      case "housing":
        return { x: HOUSING_DOOR.x, y: HOUSING_DOOR.y - 40, text: label ?? "분양 사무소" };
      case "bench": {
        const f = near(FURNITURE.filter((x) => x.kind === "bench" && !x.campfire));
        return f ? { x: f.x, y: f.y - 12, text: label ?? "벤치" } : null;
      }
      case "campfire": {
        const c = near(CAMPFIRES);
        return c ? { x: c.x, y: c.y - 22, text: label ?? "모닥불" } : null;
      }
      case "fishing":
        // 11/15 납품 부두를 없앴다 → 호수 낚시 잔교 (어부 영감 노점이 잔교 서쪽 끝에 있다)
        return { x: LAKE_PIER.x + 24, y: LAKE_PIER.y - 26, text: label ?? "낚시 잔교" };
      case "zoo":
        // 동물원 정문 아치 (현판 위)
        return { x: ZOO_ARCH_AT.x, y: ZOO_ARCH_AT.y - 46, text: label ?? "동물원" };
      case "bumper":
        // 11/16 범퍼카장 입구 간판 위
        return { x: BUMPER_DOOR.x, y: BUMPER_DOOR.y - 44, text: label ?? "범퍼카장" };
      default:
        return null;
    }
  }

  /** 11/19 첫 걸음 길 안내 켜기·끄기 (목적지는 다시 찾을 때마다 지금 위치에서 가장 가까운 곳) */
  private setRoute(target: FirstGuideTarget | null): void {
    if (this.cleaned) return;
    this.routeTarget = target;
    this.route.set(target ? () => this.resolveRoute(target) : null);
  }

  /** 길 안내 한 프레임: 마을 밖(캠핑장·바닷가·버스)·실내에서는 숨기기만. 닿았거나 갈 곳이 없으면 끝내고 화면에 알린다 */
  private updateRoute(now: number, view: Phaser.Geom.Rectangle, s: number): void {
    const t = this.routeTarget;
    if (!t) return;
    const r = this.route.update(now, view, s, this.trip.away || this.awayScene || this.tripLock);
    if (!r) return;
    bridge.emit("route:state", { target: t, status: r });
    // 기억값(sticky)도 지운다 (장면을 다시 만들 때 끝난 안내가 살아나지 않게 — 이 장면의 setRoute(null)도 같이)
    bridge.emit("route:guide", { target: null });
  }

  /** 길 안내 목적지 후보 (마을). r = 이만큼 다가가면 닿은 것 (상호작용 반경에 맞춘다) */
  private resolveRoute(t: FirstGuideTarget): RouteTargetInfo | null {
    const items = this.map.interactables;
    const at = (list: readonly Interactable[], label: string): RouteTargetInfo => ({ goals: list.map((o) => ({ x: o.x, y: o.y, r: Math.min(26, Math.max(16, o.r)) })), label });
    switch (t) {
      case "bench":
        return { goals: FURNITURE.filter((f) => f.kind === "bench" && !f.campfire).map((f) => ({ x: f.x, y: f.y + (f.facing === DIR.up ? -10 : 10), r: 18 })), label: "벤치" };
      case "look":
        // E로 살펴볼 수 있는 것 (반짝이는 채집 지점·사람·종·우물·망원경 …). 입구·문·정류장은 뺀다
        return at(
          items.filter((o) => !["portal", "door", "lot", "bus", "dock", "water"].includes(o.kind) && !o.forage?.startsWith("fish:")),
          "살펴보기",
        );
      case "fish":
        return at(items.filter((o) => o.forage?.startsWith("fish:")), "낚시 자리");
      case "gather":
        return at(items.filter((o) => o.forage?.startsWith("node:")), "채집 지점");
      case "stars":
        return at(items.filter((o) => o.kind === "telescope"), "망원경");
      case "hunt":
        return { goals: [{ ...PORTAL_WALK.hunt.goal, r: 16 }], label: "사냥터 입구" };
      case "visit": {
        const mine = this.map.myHouseId;
        return at(items.filter((o) => o.kind === "door" && !!o.houseId && o.houseId !== mine), "이웃 집");
      }
      case "busCamp":
        return at(items.filter((o) => o.id === "bus:camp"), "캠핑장행 정류장");
      case "busSea":
        return at(items.filter((o) => o.id === "bus:sea"), "바닷가행 정류장");
      case "questBoard":
        // 버스 정류장 마당 의뢰 게시판 앞 (낚시·채집이 붙이는 forage:board 자리와 같다 — 그 목록이 아직 없어도 길이 나오게 고정 좌표)
        return { goals: [{ x: WHARF_BOARD.x, y: WHARF_BOARD.y + 12, r: 22 }], label: "의뢰 게시판" };
      // 11/19 오늘 미션 [안내] 목적지 (lib/retain TODO_POOL guide)
      case "grave":
        // 지금 마을에 놓인 묘비들 (묘비 앞 조금 아래 — 꽃을 놓는 자리)
        return { goals: this.field.layout.placements.map((p) => ({ x: p.x, y: p.y + 14, r: 22 })), label: "묘비" };
      case "seller":
        return at(items.filter((o) => o.forage?.startsWith("npc:")), "상인");
      case "wish":
        return at(items.filter((o) => o.kind === "wish"), "소원 분수");
      case "haunt":
        return at(items.filter((o) => o.id === "portal:haunt"), "귀신의 집");
      case "bumper":
        return at(items.filter((o) => o.kind === "bumper"), "범퍼카장");
      case "sky":
        return at(items.filter((o) => o.kind === "ferris" || o.kind === "balloon"), "관람차·열기구");
      case "campfire":
        return { goals: FURNITURE.filter((f) => !!f.campfire).map((f) => ({ x: f.x, y: f.y + (f.facing === DIR.up ? -10 : 10), r: 18 })), label: "모닥불" };
      default:
        return null;
    }
  }

  /** 주거 구역의 그 번지를 비추고 문 위에 화살표 (걸어가면 사라진다: 카메라는 캐릭터가 걷기 시작하면 돌아온다) */
  private showLot(lot: number, label?: string): void {
    const l = houseLot(lot);
    if (!l) return;
    if (this.inShop) this.exitShop();
    this.rig.focus(l.door.x, l.door.y - 40);
    this.guide.set({ x: l.door.x, y: l.door.y - 34, text: label ?? `${lot}번지` });
    this.lotGuide = { x: l.door.x, y: l.door.y, until: this.time.now + LOT_GUIDE_MS };
  }

  /** 번지 안내 화살표: 그 문 앞에 닿거나 시간이 지나면 지운다 */
  private updateLotGuide(now: number): void {
    const g = this.lotGuide;
    if (!g) return;
    if (now > g.until || Math.hypot(this.player.x - g.x, this.player.y - g.y) < 22) {
      this.lotGuide = null;
      this.guide.set(null);
    }
  }

  /** 말풍선: 내 머리 위에 바로 띄우고 같은 채널에 보낸다 */
  private doSay(id: string): void {
    const text = phraseOf(id);
    const now = this.time.now;
    if (!text || !isPhraseId(id) || now - this.sayAt < SAY_COOLDOWN_MS || this.cleaned) return;
    this.sayAt = now;
    this.player.view.say(text, now);
    this.net.say(id);
    this.sfx.play("say", 0.5);
  }

  /** 내 동작: 바로 보여 주고 같은 채널에 보낸다 (연타는 ACT_COOLDOWN_MS로 묶는다) */
  private doAct(kind: ActKind, at?: Interactable): void {
    const now = this.time.now;
    if (now - this.actAt < ACT_COOLDOWN_MS) return;
    this.actAt = now;
    const pl = this.player;
    this.net.act(kind);
    this.actFx(kind, pl.x, pl.y, at ?? null, true);
    pl.view.playAct(kind, now);
  }

  /** 다른 사람의 동작 (종소리는 맵 어디에 있든 들린다, 멀수록 작게) */
  private playAct(sid: Sid, kind: ActKind, x: number, y: number): void {
    const r = this.remotes.get(sid);
    if (r?.visible) r.view.playAct(kind, performance.now());
    this.actFx(kind, x, y, null, false);
  }

  private actFx(kind: ActKind, x: number, y: number, at: Interactable | null, mine: boolean): void {
    const pl = this.player;
    const d = Math.hypot(x - pl.x, y - pl.y);
    const gain = mine ? 1 : Math.max(0.3, 1 - d / 700);
    if (kind === "bell") {
      const bell = at ?? this.nearestOf("bell", x, y, 48);
      this.fx.bellWave(bell ? bell.x : x, bell ? bell.y - 18 : y - 20);
      this.sfx.bell(gain);
    } else if (kind === "splash") {
      const well = at ?? this.nearestOf("well", x, y, 32);
      const fountain = well ? null : this.rides.nearFountain(x, y);
      if (well) this.fx.splash(well.x, well.y - 6);
      else if (fountain) this.fx.splash(fountain.x, fountain.y);
      else this.fx.splash(x, y);
      if (d < 360 || mine) this.sfx.splash(gain);
    } else if (kind === "quack") {
      // 11/15 오리배 꽥 (소리·물결은 BoatRide, "꽥!" 말풍선은 AvatarView.playAct)
      this.boats.quackFx(x, y, mine, d);
    } else if (kind === "honk") {
      // 11/16 범퍼카 빵빵 (경적·헤드라이트 깜빡은 BumperRide, "빵빵!" 말풍선은 AvatarView.playAct)
      this.bumper.honkFx(x, y, mine, d);
    } else if (kind === "lamp" || kind === "gull" || kind === "gullHot") {
      // 11/16 바닷가 등대 등불 · 11/17 갈매기 과자 (바닷가 장면만 쓴다 — 마을에서는 아무것도 하지 않는다)
    } else if (d < 400 || mine) {
      // 손 흔들기·환호 이모티콘은 아바타가 이름표 위에 띄운다 (AvatarView.playAct). 여기는 환호 반짝임과 소리 (이모티콘과 같은 톡 — 환호는 높게)
      this.fx.actSparks(x, y, kind);
      const rate = kind === "cheer" ? 1.3 : 1;
      if (mine) this.sfx.play("say", 0.45, rate);
      else this.sfx.play("say", 0.2 * gain, rate * 1.05, 6);
    }
  }

  private nearestOf(kind: Interactable["kind"], x: number, y: number, r: number): Interactable | null {
    let best: Interactable | null = null;
    let bd = r;
    for (const o of this.map.interactables) {
      if (o.kind !== kind) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** 11/22 월드 좌표에 있는 새싹 그림의 주인 (나·다른 사람 머리 위, 보이는 것만) */
  private sproutViewAt(wx: number, wy: number): AvatarView | null {
    const views = [this.player.view, ...[...this.remotes.values()].filter((r) => r.visible).map((r) => r.view)];
    return views.find((v) => v.sproutAt(wx, wy)) ?? null;
  }

  /**
   * 11/22 떠 있는 새싹 말풍선: 누구 새싹인지·눌러서 띄웠으면 닫힐 시각·마지막으로 알린 화면 자리.
   * 매 프레임 그 사람 새싹 자리로 따라가고(followSproutTip), 새싹이 안 보이게 되면(숨음·끝남·나감) 닫는다
   */
  private sproutTip: { view: AvatarView; until: number; x: number; y: number } | null = null;
  private openSproutTip(view: AvatarView | null, tapUntil = 0): void {
    if (!view) {
      if (this.sproutTip) bridge.emit("sprout:tip", null);
      this.sproutTip = null;
      return;
    }
    if (this.sproutTip?.view === view && !tapUntil) return;
    this.sproutTip = { view, until: tapUntil, x: NaN, y: NaN };
    this.followSproutTip(performance.now());
  }
  private followSproutTip(now: number): void {
    const t = this.sproutTip;
    if (!t) return;
    const a = t.view.sproutAnchor;
    if (!a || (t.until && now >= t.until) || this.inShop || this.cleaned || this.hub.isBlocked) return this.openSproutTip(null);
    const c = this.rig.toClient(a.x, a.y);
    if (Math.abs(c.x - t.x) < 0.5 && Math.abs(c.y - t.y) < 0.5) return;
    t.x = c.x;
    t.y = c.y;
    bridge.emit("sprout:tip", { x: c.x, y: c.y, ...(t.until ? { tap: true as const } : {}) });
  }

  /** 11/22 마우스를 머리 위 새싹에 올리면 「마을에 온 지 얼마 안 된 이웃이에요」 (벗어나면 닫는다, 그 사람이 움직이면 따라간다) */
  private onHoverSprout(w: { x: number; y: number } | null): void {
    const view = w && !this.hub.isBlocked && !this.cleaned && !this.inShop ? this.sproutViewAt(w.x, w.y) : null;
    // 눌러서 띄운 말풍선은 마우스가 지나가도 그대로 (시간이 되면 닫힌다)
    if (!view && this.sproutTip?.until) return;
    this.openSproutTip(view);
  }

  private onTap(wx: number, wy: number): void {
    this.walker.cancel();
    if (this.hub.isBlocked || this.cleaned || this.inShop || this.tripLock) return;
    // 11/22 머리 위 새싹을 누르면 말풍선만 (폰 — 그 사람을 따라가다 잠깐 뒤 저절로 닫힌다)
    const sprout = this.sproutViewAt(wx, wy);
    if (sprout) {
      this.openSproutTip(sprout, performance.now() + SPROUT_TAP_TIP_MS);
      return;
    }
    // 47번: 다른 사람 캐릭터(몸·이름표)를 누르면 작은 메뉴(신고하기)
    const hit = peerAt(
      [...this.remotes.values()].map((r) => ({ sid: r.sid, name: r.name, x: r.x, y: r.y, visible: r.visible, label: r.view.label.getBounds() })),
      wx,
      wy,
    );
    // 운영자(서버가 준 staff 표시) 캐릭터는 눌러도 아무 메뉴·정보도 띄우지 않는다 (친구 신청·도감·신고 모두 없음)
    if (hit && this.remotes.get(hit.sid)?.view.staff) return;
    if (hit && this.net.channel !== null) {
      const chat = this.remotes.get(hit.sid)?.view.chatText(performance.now());
      // 11/22 새싹이면 메뉴 맨 위에 「마을에 온 지 얼마 안 된 이웃이에요」 (폰은 새싹이 작아 이름표를 누르는 일이 많다)
      bridge.emit("peer:menu", { sid: hit.sid, name: hit.name, ch: this.net.channel, ...(chat ? { chat } : {}), ...(this.remotes.get(hit.sid)?.view.sprout ? { sprout: true as const } : {}) });
      return;
    }
    const p = graveAt(this.field.layout, wx, wy);
    if (p) {
      bridge.emit("grave:open", { graveId: p.id });
      return;
    }
    // 오브젝트를 탭: 가까이 서 있으면 E와 같다
    const pl = this.player;
    const o = nearestObject(this.map.interactables, wx, wy + 6);
    if (o && o.dist < 16 && inReach(o.obj, pl.x, pl.y, 1.5) && !pl.airborne) this.useObject(o.obj);
  }

  /**
   * 11/15 긴급 의뢰 마을 축제 (150%): 모닥불이 금빛, 하늘에 폭죽이 저절로 오른다 (처음 30초만) (보는 화면 아래쪽에서 쏘아 화면 안에서 터지게).
   * 폭죽 아이템 없이 그림만 — 서버·다른 사람에게 보내지 않는다 (모두가 같은 축제 상태를 보고 저마다 쏜다). 움직임 줄이기면 드물게
   */
  /** 11/17 겨울 입김을 낼 사람들 (내 캐릭터 + 마을에 있는 다른 사람). self는 재사용하는 내 자리 */
  private *breathers(self: { key: object; x: number; y: number; dir: DirId }): Iterable<{ key: object; x: number; y: number; dir: DirId }> {
    const pl = this.player;
    if (pl && !this.trip.away && !this.inShop) {
      self.x = pl.x;
      self.y = pl.y;
      self.dir = pl.dir;
      yield self;
    }
    for (const r of this.remotes.values()) if (r.map === "village") yield { key: r, x: r.x, y: r.y, dir: r.netDir };
  }

  private updateFestival(now: number): void {
    const on = Date.now() < this.festUntil;
    if (on !== this.festOn) {
      this.festOn = on;
      this.map.setFestival(on);
      this.festNext = now + 800;
    }
    if (!on || this.awayScene || this.inShop || now < this.festNext) return;
    // 11/15 폭죽은 축제가 열린 처음 30초만 (1.6~4.2초마다 — 위쪽 「불꽃축제」 타이머와 같은 기준 festUntil − FEST_MS).
    // 그 뒤엔 금빛 모닥불·희귀 보너스만 남는다 — 1시간 내내 터지면 시끄럽고 산 폭죽이 묻힌다
    if (Date.now() >= this.festUntil - FEST_MS + FEST_FIREWORK_MS) return;
    this.festNext = now + (this.reduced ? 7_000 : 1_600 + Math.random() * 2_600);
    const v = this.fireworkView();
    const x = v.x + v.width * (0.12 + Math.random() * 0.76);
    const y = v.y + v.height * (0.82 + Math.random() * 0.15);
    this.fireworks.launch(FEST_FIREWORKS[Math.floor(Math.random() * FEST_FIREWORKS.length)], x, y, v, false);
    this.sky?.firework();
  }

  /** 폭죽을 맞출 보이는 영역: 이번 프레임 화면, 불멍 중이면 위아래 레터박스를 뺀다 (8번: 불멍 중 폭죽이 잘림) */
  private fireworkView(): Phaser.Geom.Rectangle {
    const v = this.rig.frameView(this.fwView);
    if (this.campfire.active) {
      const inset = v.height * LETTERBOX;
      v.setTo(v.x, v.y + inset, v.width, v.height - 2 * inset);
    }
    return v;
  }

  private leaveCampfire(): void {
    if (!this.campfire.active) return;
    this.campfire.exit();
    bridge.emit("view:mode", { mode: "normal" });
  }

  private onResize(): void {
    this.campfire.resize();
    this.rig.applyBounds();
    this.atmos.resize();
    this.lighting.resize();
  }

  // ── 매 프레임 ──

  update(time: number, delta: number): void {
    if (this.cleaned) return;
    const dt = Math.min(delta, 100);
    const now = time;
    const pl = this.player;
    const pnow = performance.now();

    if (this.inShop) {
      // 상점 안: 월드의 나는 문 앞에 멈춰 있고(멈춤을 한 번 보낸다), 원격 아바타 보간만 계속
      pl.update(NO_MOVE, now, this.seatReq);
      this.net.tick(pnow);
      return;
    }

    this.hub.read(this.move);
    if (this.hub.isBlocked || this.tripLock) this.move.ax = this.move.ay = 0;
    this.walker.steer(this.move, Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER, now);
    // 11/18 눈을 뭉치는 잠깐은 그 자리에 선다
    if (this.fight?.gathering) this.move.ax = this.move.ay = 0;
    const started = pl.update(this.benchInput(now), now, this.seatReq);
    this.boats.steer(this.move, dt);
    this.bumper.steer(this.move, dt);
    if (this.graveLock && !this.overlappingGrave()) this.graveLock = false;
    this.graveCollider.active = !pl.airborne && !this.graveLock;
    this.furnitureCollider.active = this.graveCollider.active;
    if (this.net.online && pnow >= this.peerCheckAt) {
      // 이상 징후만 확인 (서버는 깨우지 않는다): HUD 인원과 원격 아바타 수가 다르면 목록을 한 번 다시 받는다
      this.peerCheckAt = pnow + PEER_CHECK_MS;
      if (this.remotes.size !== this.net.peerCount) this.net.requestSync();
    }
    if (pnow >= this.minimapAt) {
      this.minimapAt = pnow + MINIMAP_MS;
      this.emitMinimap();
    }
    if (started && this.rig.detached) {
      this.rig.recenter();
      this.recenterAt = 0;
    }
    if (pl.state === "run" && now - this.dustAt > DUST_MS) {
      this.dustAt = now;
      this.fx.dust(pl.x, pl.y);
    }
    // (11/19 잡화점 문으로 걸어 들어가기는 없앴다 — 모든 문은 문 앞에서 E·[상호작용]으로 들어가고 나온다, logic/doorExit)

    // 놀이기구 2: 탑승 상태 맞추기 · 맵 위 보기면 칸·기구를 따라가는 카메라 목표 (rig.update 전에)
    this.sky.preCamera(dt);
    this.rig.update(dt);
    // 모닥불 좌석에 앉으면 불멍 구도 (카메라·레터박스), 일어나면 원래대로. 불 타는 소리는 거리에 따라
    const fire = pl.state === "sitChair" && pl.seat ? campfireOfSeat(pl.seat.id) : null;
    if (fire && this.campfire.active?.id !== fire.id) {
      this.campfire.enter(fire);
      bridge.emit("view:mode", { mode: "campfire" });
    } else if (!fire && this.campfire.active) this.leaveCampfire();
    this.campfire.update(now, dt);
    const nf = nearestCampfire(pl.x, pl.y);
    this.sfx.campfire(nf ? campfireLevel(nf.dist, !!fire) : 0);
    if (this.recenterAt && now >= this.recenterAt) {
      this.recenterAt = 0;
      this.rig.recenter();
    }
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    this.rides.prepare();
    this.boats.prepare();
    this.bumper.prepare();
    this.sky.prepare();
    this.expr.update(now);
    if (!this.awayScene) this.meScreen.update(pl.x, pl.y);
    pl.view.sync(now, s);

    this.map.update(view);
    // 그네 탄 사람이 있으면 가만히 있는 줄·판을 숨긴다 (아바타가 자기 줄·판과 함께 흔들린다)
    let rn = 0;
    const riders = this.swingRiders;
    if (pl.state === "swing") {
      riders[rn++] = pl.x;
      riders[rn++] = pl.y;
    }
    for (const r of this.remotes.values()) {
      if (r.stateId !== STATE.swing) continue;
      riders[rn++] = r.x;
      riders[rn++] = r.y;
    }
    this.map.updateSwings(riders, rn);
    // 해먹에 누운 사람이 있으면 기둥만 남긴다 (줄·천은 누운 사람 그림이 흔들리며 그린다)
    rn = 0;
    if (pl.state === "hammock") {
      riders[rn++] = pl.x;
      riders[rn++] = pl.y;
    }
    for (const r of this.remotes.values()) {
      if (r.stateId !== STATE.hammock) continue;
      riders[rn++] = r.x;
      riders[rn++] = r.y;
    }
    this.map.updateHammocks(riders, rn);
    this.map.scaleLabels(s);
    const L = this.atmos.levels;
    this.field.update(now, view, L.glow);
    this.life.update(dt, view, s);
    this.forage.update(dt, view, s);
    this.riding.update();
    // 11/16 탄 것·앉은 자리 → UI (사냥터·미니게임·집 입구가 본다, lib/rideGate)
    publishRide(pl, this.riding.on);
    this.zoo.update(now, view);
    this.zoo.scaleLabels(s);
    this.season.update(now);
    this.season.scaleLabels(s);
    this.bungeo.update(now);
    this.mungnyang.update(now);
    this.mungnyang.scaleLabels(s);
    this.office.update(now);
    this.office.scaleLabels(s);
    this.lighthouse.scaleLabels(s);

    for (const r of this.remotes.values()) {
      r.update(pnow, view, s);
      if (r.visible && r.stateId === STATE.run && pnow - r.dustAt > DUST_MS * 1.3) {
        r.dustAt = pnow;
        this.fx.dust(r.x, r.y);
      }
    }
    this.fight?.update(s);
    this.boats.update(dt);
    this.bumper.update(dt, view);
    this.rides.update();
    this.sky.update(dt);

    this.declutterLabels(now, pnow);
    this.updateNear();
    this.updateSeatHint(now, s);
    this.tooltip.layout(s, pl.y);
    this.markers.update(now, s, this.tooltip, this.resolveGrave);
    this.updateLotGuide(now);
    this.guide.update(now, view, s);
    this.updateRoute(now, view, s);

    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
    this.fireworks.update(now, dt, view);
    this.updateFestival(now);
    this.followSproutTip(pnow);
    this.updateLighting(view);

    this.net.tick(pnow);
  }

  /** 어둠 레이어에 빛 구멍: 내 둘레(가장 크게), 원격 아바타(약하게), 석등·촛불, 보이는 묘비 위 스폿, 폭죽 */
  private updateLighting(view: Phaser.Geom.Rectangle): void {
    const L = this.atmos.levels;
    const lit = this.lighting;
    const pl = this.player;
    const lantern = pl.view.lantern;
    const r = playerLightRadius(L.glow, lantern);
    // 내 둘레의 은은한 따뜻한 빛 (가산)
    this.playerGlow
      .setPosition(pl.x, pl.y - 9)
      .setScale((r * 1.6) / 64)
      .setAlpha((0.05 + 0.13 * L.glow) * (lantern ? 1.5 : 1) * Math.min(1, L.darkness * 3));
    // 큰 폭죽(대형·피날레)이 터지는 동안은 화면 전체 어둠이 걷힌다
    lit.begin(view, L.darkness * (1 - 0.6 * this.fireworks.lift), L.shade);
    if (L.darkness > 0.004) {
      lit.add(pl.x, pl.y - 8, r, 0.92);
      for (const a of this.remotes.values()) {
        if (!a.visible) continue;
        // 다른 사람도 어둠 속에서 알아볼 수 있게 작은 빛
        if (a.view.lantern) lit.add(a.x, a.y - 8, 40, 0.7);
        else lit.add(a.x, a.y - 8, 26, 0.5);
      }
      const lr = 38 + 22 * L.glow;
      // 가로등·모닥불·횃불·촛불: 깊은 밤에도 둘레가 또렷하게
      for (const sp of this.map.staticLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.4, 0.85);
      for (const sp of this.map.gridLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.4, 0.85);
      this.bumper.lights(lit); // 11/16 범퍼카 헤드라이트
      const vis = this.field.visibleViews;
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i];
        const p = v.p;
        if (!p) continue;
        const h = v.height;
        lit.add(p.x, p.y - h * 0.5, 16 + h * 0.6, v.spot);
        if (v.decorLit) lit.add(p.x, p.y - 2, 26, 0.45);
      }
      this.fireworks.addLights(lit);
      this.life.addLights(lit);
      this.forage.addLights(lit);
      this.sky.addLights(lit);
      this.season.addLights(lit);
      this.bungeo.addLights(lit);
      this.mungnyang.addLights(lit);
      this.office.addLights(lit);
      this.lighthouse.addLights(lit); // 11/20 등대 빛 웅덩이
    }
    lit.end();
  }

  /** 근접 묘비 툴팁·grave:near를 지금 바로 지운다 */
  private hideNear(): void {
    this.tooltip.hide();
    bridge.emit("grave:near", null);
  }

  private updateNear(): void {
    const pl = this.player;
    const near = pl.inWater || pl.anchored ? null : nearestGrave(this.field.layout, pl.x, pl.y, GRAVE_NEAR_RADIUS, this.near);
    const id = near ? near.p.id : null;
    const prev = this.nearId;
    if (this.nearT.next(id)) {
      if (id !== prev || id) bridge.emit("grave:near", id ? { graveId: id } : null);
      const g = id ? this.field.grave(id) : undefined;
      if (near && g) this.tooltip.show(near.p, g.name, g.epitaph, this.field.isMine(g.id));
      else this.tooltip.hide();
    }
  }

  /** 플레이어 발 상자 (물리 바디) */
  private feetBox(): Box {
    const b = this.player.body;
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** 점프로 넘을 수 있는 낮은 장애물: 묘비 + 의자·벤치 */
  private graveBoxes(): Box[] {
    const out: Box[] = [];
    for (const g of [this.field.colliders, this.map.furnitureColliders]) {
      for (const z of g.getChildren()) {
        const b = (z as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody | null;
        if (b) out.push({ x: b.x, y: b.y, w: b.width, h: b.height });
      }
    }
    return out;
  }

  /** 긴 벤치에 앉아 있으면 ←/→는 옆자리로 (한 번 누를 때 한 칸), ↑/↓는 그대로 일어나기 */
  private benchInput(now: number): MoveInput {
    const pl = this.player;
    const seat = pl.state === "sitChair" ? pl.seat : null;
    if (!seat || !MULTI_SEAT.has(seat.furnitureId)) {
      this.lastSide = 0;
      return this.move;
    }
    const side = sideIntent(this.move.ax, this.move.ay);
    if (side === 0) {
      this.lastSide = 0;
      return this.move;
    }
    if (side !== this.lastSide) {
      const occupied = this.net.online ? this.seats : EMPTY_SEATS;
      const n = neighborSeat(seat, side, occupied, this.net.online ? this.net.mySid : null);
      if (n) pl.moveSeat(n, now, this.seatReq);
    }
    this.lastSide = side;
    return NO_MOVE;
  }

  private overlappingGrave(): boolean {
    const f = this.feetBox();
    return this.graveBoxes().some((g) => overlaps(f, g));
  }

  /** 착지: 묘비 위(충돌체 안)에 내렸으면 가장 가까운 빈자리로 살짝 밀어낸다 */
  private onPlayerLand(): void {
    const pl = this.player;
    for (let i = 0; i < 2; i++) this.fx.dust(pl.x - 3 + i * 6, pl.y);
    const graves = this.graveBoxes();
    const f = this.feetBox();
    if (!graves.some((g) => overlaps(f, g))) return;
    const e = escape(f, graves);
    if (e) pl.body.reset(pl.x + e.dx, pl.y + e.dy);
    else this.graveLock = true;
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

  /** 근처 빈 좌석 안내 + seat:near (UI가 모바일 앉기 버튼을 강조) */
  private updateSeatHint(now: number, labelScale: number): void {
    const pl = this.player;
    const occupied = this.net.online ? this.seats : EMPTY_SEATS;
    const mySid = this.net.online ? this.net.mySid : null;
    const seat: Seat | null = pl.sitting || pl.inBoat || pl.inCar ? null : pickSeat(pl.x, pl.y, occupied, mySid);
    const id = seat ? seat.id : null;
    if (id !== this.nearSeatId) {
      this.nearSeatId = id;
      const f = seat ? FURNITURE_KIND.get(seat.furnitureId) : undefined;
      bridge.emit("seat:near", seat ? { seatId: seat.id, kind: f ?? "bench" } : null);
    }
    // 묘비 툴팁이 떠 있고 그 묘비가 좌석보다 가까우면 묘비 쪽이 우선
    let hidden = false;
    if (this.nearId && seat) {
      const g = this.field.placement(this.nearId);
      if (g && Math.hypot(g.x - pl.x, g.y + 6 - pl.y) <= Math.hypot(seat.x - pl.x, seat.y - pl.y)) hidden = true;
    }
    const sittingFor = pl.sitting && pl.view.sitSince > 0 ? now - pl.view.sitSince : -1;
    const bench = pl.state === "sitChair" && pl.seat && MULTI_SEAT.has(pl.seat.furnitureId);
    // 24번: 앉으면 벤치 상태를 고를 수 있다고 알려 준다 (키보드는 T, 터치는 메뉴 → 말풍선·이모티콘)
    const keys = this.seatHint.prefix === "E ";
    const chair = pl.state === "sitChair" && !!pl.seat;
    const standText = bench
      ? keys
        ? "←→ 옆자리 · ↑↓ 일어나기 · T 벤치 상태"
        : "좌우로 옆자리 · 위아래로 일어나기"
      : chair && keys
        ? "이동하면 일어나요 · T 상태 고르기"
        : null;
    // 불멍 구도에서는 화면을 가리지 않게 앉기 안내를 띄우지 않는다
    if (this.campfire.active) hidden = true;
    // 11/15 버스를 기다리거나 타고 내리는 동안은 정류장 안내("E 주말 버스 정류장")를 띄우지 않는다
    if (this.tripLock) hidden = true;
    const obj = seat || pl.sitting ? null : this.objectHint();
    this.seatHint.update(seat, pl, sittingFor, hidden, labelScale, obj, standText);
    // 11/19 폰 [상호작용] 단추: 잡화점 문 앞이면 「들어가기」 (logic/doorHint)
    setDoorHint(hidden || !obj ? null : obj.text.endsWith("유령 잡화점 들어가기") ? "들어가기" : obj.text.endsWith(LIGHTHOUSE_LABEL) ? LIGHTHOUSE_LABEL : null);
  }

  /** 좌석이 없을 때의 안내: 물속·매달리기·그네·근처 오브젝트·물가 */
  private objectHint(): { x: number; y: number; text: string; dim: boolean } | null {
    const pl = this.player;
    const pre = this.seatHint.prefix;
    const h = this.hintBuf;
    h.dim = false;
    if (pl.airborne) return null;
    const carText = this.bumper.hint(pre, pre === "E ");
    if (pl.inCar) {
      if (!carText) return null;
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = carText;
      return h;
    }
    const boatText = this.boats.hint(pre);
    if (boatText) {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = boatText;
      return h;
    }
    if (pl.state === "swim" || pl.state === "dive") {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = pl.state === "swim" ? `${pre}잠수` : `${pre}떠오르기`;
      return h;
    }
    // 관람차·열기구가 떠 있는 동안은 위 안내(sky:hud)가 대신한다
    if (pl.rideLock) return null;
    if (pl.anchored) {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = pl.state === "hang" ? "이동하면 내려와요" : pl.state === "hammock" ? "이동하면 일어나요" : "이동하면 내려요";
      return h;
    }
    const o = nearestObject(this.map.interactables, pl.x, pl.y);
    // 22번: 바로 옆 고양이·유령 ("E 치즈 쓰다듬기") — E도 이쪽이 먼저다
    const critter = pl.sitting ? null : this.life.hint(pre, pl.x, pl.y);
    if (critter) {
      h.x = critter.x;
      h.y = critter.y;
      h.text = critter.text;
      return h;
    }
    // 11/19 잡화점 문 앞: 걸어 들어가기를 없애고 E·[상호작용]으로 들어간다 (onAction의 nearShopDoor와 같은 반경)
    if (!pl.sitting && nearShopDoor(pl.x, pl.y)) {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = `${pre}유령 잡화점 들어가기`;
      return h;
    }
    if (o) {
      // 묘비 툴팁이 더 가까우면 겹치지 않게 숨긴다
      if (this.nearId) {
        const g = this.field.placement(this.nearId);
        if (g && Math.hypot(g.x - pl.x, g.y + 6 - pl.y) <= o.dist) return null;
      }
      // 오브젝트 그림을 가리지 않게 내 발밑에
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = pre + o.obj.label;
      // 1인 자리를 다른 사람이 차지했으면 회색으로 "누가 매달려 있어요"
      const spot = this.spotsJudged && this.net.online ? spotOf(o.obj) : null;
      if (spot && spotTaken(spot.id, this.seats, this.net.mySid)) {
        h.text = SPOT_TAKEN_HINT[spot.kind];
        h.dim = true;
      }
      if (o.obj.kind === "dock") {
        const d = this.boats.dockHint(pre, o.obj.id);
        h.text = d.text;
        h.dim = d.dim;
      } else if (o.obj.kind === "carousel" && this.rides.carouselFull(o.obj)) {
        h.text = "목마가 모두 찼어요";
        h.dim = true;
      } else if (o.obj.kind === "bumper") {
        const b = this.bumper.gateHint(pre);
        h.text = b.text;
        h.dim = b.dim;
      } else if (o.obj.kind === "ferris" || o.obj.kind === "balloon") {
        const s = this.sky.hint(o.obj, pre);
        if (s) {
          h.text = s.text;
          h.dim = s.dim;
        }
      }
      return h;
    }
    if (!this.nearId && nearWater(pl.x, pl.y)) {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = `${pre}물 튀기기`;
      return h;
    }
    return null;
  }

  // ── 50번 조각배·광장 놀거리 ──

  private initRides(): void {
    this.rideSound = new RideSound();
    const host: RideHost = {
      scene: this,
      reduced: this.reduced,
      fx: this.fx,
      sound: this.rideSound,
      player: () => this.player,
      remotes: () => this.remotes,
      seats: () => (this.net?.online ? this.seats : EMPTY_SEATS),
      mySid: () => (this.net?.online ? this.net.mySid : null),
      judged: () => this.spotsJudged && !!this.net?.online,
      sit: (id) => this.net.sit(id),
      stand: () => this.net.stand(),
      seatReq: () => this.seatReq,
      toast: (m) => this.toast(m),
      // 놀거리 위상(시소 박자·트램펄린·회전목마)을 모두에게 같게: 서버 시계
      clock: () => this.net?.serverNow() ?? Date.now(),
    };
    this.rides = new PlazaRides(host);
    this.boats = new BoatRide({ ...host, act: (k) => this.doAct(k) });
    this.bumper = new BumperRide({ ...host, atlas: this.atlas, colliders: this.map.colliders, act: (k) => this.doAct(k), darkness: () => this.atmos?.levels.darkness ?? 0 });
    // 놀이기구 2: 날씨는 이 뒤에 만들어지므로 그때그때 읽는다
    const atmos = () => this.atmos;
    const rig = () => this.rig;
    this.sky = new SkyRides({
      ...host,
      get atmos() {
        return atmos();
      },
      get rig() {
        return rig();
      },
    });
  }

  /** 새로고침 복원: 조각배·시소·트램펄린·회전목마 (자리 판정은 welcome에서) */
  private applyRideResume(r: ResumeState, now: number): void {
    const pl = this.player;
    if (r.pose === "boat") this.boats.resumePose(r);
    else if (r.pose === "seesaw" || r.pose === "trampoline") {
      const o = anchorAt(this.map.interactables, r.pose, r.x, r.y);
      if (o) pl.attach(r.pose, o.ax, o.ay, o.ay + 0.5, now, null, spotSeatId(r.pose, o.ax, o.ay));
    } else if (r.pose === "carousel") {
      const ref = this.rides.resumeCarousel(r.x, r.y);
      if (ref) pl.attach("carousel", ref.ax, ref.ay, ref.ay + 0.6, now, null, spotSeatId("carousel", ref.ax, ref.ay));
    }
  }

  /** 소원 분수에 동전을 던졌다 (UI가 서버 결과를 받은 뒤): 동전이 날아가 퐁당 + 같은 채널에 물 튀기기 */
  private onWishThrown(): void {
    if (this.cleaned || this.inShop) return;
    const pl = this.player;
    const now = this.time.now;
    this.rides.coinToss(pl.x, pl.y);
    pl.view.playAct("bell", now);
    if (now - this.actAt >= ACT_COOLDOWN_MS) {
      this.actAt = now;
      this.net.act("splash");
    }
  }

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.walker?.cancel();
    this.ctx.disposed = true;
    window.removeEventListener("pagehide", this.onPageHide);
    this.houses?.destroy();
    this.houses = null;
    this.boats?.destroy();
    this.bumper?.destroy();
    this.rides?.destroy();
    this.sky?.destroy();
    this.rideSound?.destroy();
    this.expr?.destroy();
    this.life?.destroy();
    this.forage?.destroy();
    this.riding?.destroy();
    this.fight?.destroy();
    this.fight = null;
    this.zoo?.destroy();
    this.season?.destroy();
    this.mungnyang?.destroy();
    this.office?.destroy();
    this.trip?.destroy();
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.net?.stop();
    this.hub?.detach();
    this.rig?.destroy();
    this.campfire?.destroy();
    if (bridge.last("view:mode")?.mode === "campfire") bridge.emit("view:mode", { mode: "normal" });
    this.sfx?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.nearId) bridge.emit("grave:near", null);
    if (this.nearSeatId) bridge.emit("seat:near", null);
    this.nearT.clear();
    this.nearSeatId = null;
  }
}

/** 1인 소품 자리에 붙은 내 캐릭터의 depth: 그네 틀·해먹 천보다 앞, 나무 줄기 바로 앞 (원격 아바타와 같은 기준) */
function spotDepth(kind: SpotKind, ay: number): number {
  return kind === "swing" ? ay + SWING_FRONT : kind === "hammock" ? ay + HAMMOCK_FRONT : ay + 0.5;
}

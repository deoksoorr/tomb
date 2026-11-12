import * as Phaser from "phaser";
import { CAMPFIRES, campfireOfSeat, DIR, FISH_ARCH, FURNITURE, houseLot, HOUSING_DOOR, HUNT_GATE, isAvatarBody, isPhraseId, sanitizeDye, seatById, seatSlot, SHOP, SHOP_DOOR, SPAWN, spotSeatId, STATE, TELEPORT_DIST, type ActKind, type DirId, type EmoteKind, type PeerInfo, type Seat, type Sid, type SpotKind, type WelcomeMsg } from "@tomb/protocol";
import { avatarColorSpec, type AppearanceChange } from "../sprites/avatar";
import { saveResume, type ResumePose, type ResumeState } from "@/lib/resume";
import type { PublicGrave } from "@/lib/types";
import { TEX } from "../assets/manifest";
import { bridge, type NetStatus, type UiEvents } from "../bridge";
import { DEPTH, GRAVE_NEAR_RADIUS, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { GraveTooltip } from "../entities/Grave";
import { isAttachKind, Player, type SeatRequester } from "../entities/Player";
import { HAMMOCK_FRONT, RemoteAvatar, SWING_FRONT } from "../entities/RemoteAvatar";
import { peerAt } from "../entities/peerHit";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf, type SpeechBubble } from "../entities/SpeechBubble";
import { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { escape, overlaps, type Box } from "../logic/jump";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { nearestObject, pickInteraction } from "../logic/interact";
import { anchorAt, nudgeSpot, restoreAfterDenied, spotVerdict, standBesideSpot } from "../logic/restore";
import { SPOT_TAKEN_HINT, SPOT_TAKEN_TOAST, spotOf, spotTaken } from "../logic/spots";
import { neighborSeat, pickSeat, sideIntent, standPoint } from "../logic/sit";
import { RealtimeClient } from "../net/RealtimeClient";
import type { NetPose } from "../net/sendThrottle";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Effects } from "../world/Effects";
import { Fireworks } from "../world/Fireworks";
import { GraveWalker } from "../world/GraveWalker";
import { GraveField } from "../world/GraveField";
import { graveChannelFor } from "../world/graveChannel";
import { declutter, type LabelBox } from "../world/labels";
import { graveAt, nearestGrave, standSpot, type GravePlacement, type NearResult } from "../world/graveLayout";
import { inWater, nearShopDoor, nearWater, standable, waterCurrent, type Interactable } from "../world/layout";
import { WorldHouses } from "../world/WorldHouses";
import { NearTracker } from "../world/nearTracker";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { GraveMarkers } from "../world/Markers";
import { GuideArrow } from "../world/GuideArrow";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, LETTERBOX, nearestCampfire } from "../world/campfireMath";
import { Sfx } from "../world/Sfx";
import { WorldMap } from "../world/WorldMap";
import { BoatRide } from "../world/BoatRide";
import { PlazaRides, type RideHost } from "../world/PlazaRides";
import { RideSound } from "../world/RideSound";
import { VillageLife } from "../world/life/VillageLife";
import { Foraging } from "../world/forage/Foraging";
import { Riding } from "../world/zoo/Riding";
import { ZOO_ARCH_AT, ZooView } from "../world/zoo/ZooView";
import { Expressions } from "../world/Expressions";
import type { GameContext } from "./context";
import type { ShopContext } from "./ShopScene";

// 월드 씬: 맵·묘비·내 캐릭터·원격 아바타·분위기·조명·카메라·네트워크를 묶고 bridge 이벤트를 처리한다.
// 유령 잡화점에 들어가면 이 씬은 숨기만 하고(업데이트·연결은 유지) 상점 씬이 그 위에 그려진다.

const FOCUS_WAIT_MS = 4000;
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
  /** 동물원 타는 펫 올라타기·내리기 (world/zoo/Riding) */
  private riding!: Riding;
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
  /** F17 미니맵 다음 알림 시각 (performance.now) */
  private minimapAt = 0;
  private dustAt = 0;
  private netStarted = false;
  private cleaned = false;
  private inShop = false;
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
  private readonly labelBoxes: (LabelBox & { t: Phaser.GameObjects.BitmapText | null })[] = [];
  private readonly labelOrder: LabelBox[] = [];
  private readonly hintBuf = { x: 0, y: 0, text: "", dim: false };
  private readonly bubbleBoxes: SpeechBubble[] = [];
  private sayAt = -Infinity;
  private guide!: GuideArrow;
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
    // 새로고침 직전 자리로 시작한다 (의자는 그 앞에 서서 앉는 동작으로 — 거절되면 바닥이 아니라 그 앞으로 돌아오게)
    this.resume = opts.resume ?? null;
    this.restoreSeat = null;
    this.selfBody = isAvatarBody(opts.body) ? opts.body : undefined;
    if (this.resume) {
      const r = this.resume;
      const seat = r.pose === "sitChair" && r.seatId ? seatById(r.seatId) : undefined;
      spawn = seat ? standPoint(seat) : { x: r.x, y: r.y };
      // 맵이 바뀌어 저장된 자리가 이제 막힌 곳(집·나무·절벽·담 밖)이면 입구에서 시작한다 (물속은 괜찮다)
      if (!seat && !standable(spawn.x, spawn.y)) {
        spawn = SPAWN;
        this.resume = { ...r, x: SPAWN.x, y: SPAWN.y, pose: "idle", seatId: null };
      }
      openOnStart = null;
      this.pendingFocus = null;
    }

    this.player = new Player(this, this.atlas, spawn.x, spawn.y, opts.color, opts.name, this.myBody());
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

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y));
    this.rig.setMapHeight(this.map.height);
    this.atmos = new Atmosphere(this, this.reduced, window.location.search);
    this.lighting = new Lighting(this);
    this.sfx = new Sfx();
    this.fireworks = new Fireworks(this, this.reduced, this.sfx);
    this.tooltip = new GraveTooltip(this, this.atlas);
    this.markers = new GraveMarkers(this, this.atlas, this.reduced);
    this.seatHint = new SeatHint(this, this.atlas);
    this.guide = new GuideArrow(this, this.atlas, this.reduced);
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
    this.houses = new WorldHouses(this.map, () => this.atmos.setGridLights(this.map.gridLights), opts.channel);
    this.field.setMine(bridge.last("graves:mine")?.ids ?? []);

    this.hub = new InputHub();
    this.hub.attach();
    this.hub.setHandler((a) => this.onAction(a));
    this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false);

    this.net = this.createNet();
    this.seatReq = { sit: (id) => this.net.sit(id), stand: () => this.net.stand() };
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
    this.riding = new Riding({ player: () => this.player, net: () => this.net, remotes: () => this.remotes, toast: (m) => this.toast(m) });
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
    if (openOnStart) {
      const id = openOnStart;
      this.time.delayedCall(250, () => bridge.emit("grave:open", { graveId: id }));
    }
    this.debugMark("worldCreateMs", performance.now() - t0);
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
        },
        onSeatDenied: (seatId) => {
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
          this.clearRemotes();
          this.seats.clear();
          this.spotsJudged = false;
        },
        onPeers: (peers, seats) => this.reconcilePeers(peers, seats),
        onLook: (sid, look, extra) => {
          const v = this.remotes.get(sid)?.view;
          v?.setLook(look ?? []);
          v?.applyAppearance(extra);
        },
        onFirework: (sid, item, x, y) => this.fireworks.launch(item, x, y, this.fireworkView(), false, this.remotes.get(sid)?.name ?? ""),
        onAct: (sid, kind, x, y) => this.playAct(sid, kind, x, y),
        onEmo: (sid, id) => this.expr.onRemoteEmo(sid, id),
        onMood: (sid, mood) => this.expr.onRemoteMood(sid, mood),
        onRide: (sid, on) => this.riding.onRide(sid, on),
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
        onSelfBody: (body) => {
          if (!isAvatarBody(body)) return;
          this.selfBody = body;
          this.player.view.setBody(body);
        },
      },
    );
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
    const pl = this.player;
    const p = pl.netPose(this.poseBuf);
    const st = pl.state;
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
    r.view.setStaff(p.staff === true); // 31번 운영자: 저승사자 차림·"운영자" 배지 (서버가 넣은 표시만 온다)
    // 같은 sid가 다시 들어오면(이름·색 변경) 앉아 있던 좌석을 이어받는다
    r.seatId = prev?.seatId ?? null;
    r.view.setMood(p.mood); // 24번: 늦게 온 사람도 앉아 있는 사람의 상태를 본다
    this.riding?.applyPeer(r, p); // 동물원 타는 펫: 늦게 온 사람도 탄 모습을 본다
    if (!r.seatId) for (const [seatId, owner] of this.seats) if (owner === p.sid) r.seatId = seatId;
    this.remotes.set(p.sid, r);
  }

  /** 자가 복구: 서버가 보낸 접속자 목록에 맞춘다 (없는 사람 추가, 사라진 사람 제거, 이름·색·꾸미기 갱신) */
  private reconcilePeers(peers: PeerInfo[], seats: Record<string, Sid>): void {
    const keep = new Set<Sid>();
    const now = performance.now();
    for (const p of peers) {
      if (p.sid === this.net.mySid) continue;
      keep.add(p.sid);
      const r = this.remotes.get(p.sid);
      if (!r || r.name !== p.name || r.view.colorSpec !== avatarColorSpec(p.color, sanitizeDye(p.dye)) || r.view.bodyId !== (isAvatarBody(p.body) ? p.body : "hood") || r.view.staff !== (p.staff === true)) {
        this.addRemote(p);
        continue;
      }
      r.view.setLook(p.look ?? []);
      r.view.setMood(p.mood ?? null);
      this.riding.applyPeer(r, p);
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
    on.push(bridge.on("grave:focus", ({ graveId, walk }) => this.focusGrave(graveId, walk)));
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
    on.push(bridge.on("channel:switch", ({ channel }) => this.switchChannel(channel)));
    on.push(bridge.on("input:joystick", ({ x, y }) => this.hub.setJoystick(x, y)));
    on.push(bridge.on("input:runToggle", ({ on: v }) => this.hub.setRunToggle(v)));
    on.push(bridge.on("input:sit", () => this.hub.dispatch("sit")));
    on.push(bridge.on("input:interact", () => this.hub.dispatch("interact")));
    on.push(bridge.on("input:jump", () => this.hub.dispatch("jump")));
    on.push(bridge.on("input:say", ({ id }) => this.doSay(id)));
    on.push(bridge.on("input:emo", ({ id }) => !this.cleaned && !this.inShop && this.expr.emo(id, this.time.now)));
    on.push(bridge.on("input:mood", ({ mood }) => !this.cleaned && this.expr.setMood(mood)));
    on.push(bridge.on("input:ride", () => !this.cleaned && !this.inShop && this.riding.toggle()));
    on.push(bridge.on("guide:point", ({ target, label }) => this.guide.set(target ? this.resolveGuide(target, label) : null)));
    on.push(bridge.on("world:lot", ({ lot, label }) => this.showLot(lot, label)));
    on.push(
      bridge.on("input:act", ({ kind }) => {
        if (kind === "wave" || kind === "cheer") this.hub.dispatch(kind);
      }),
    );
    on.push(bridge.on("ui:blockKeys", ({ blocked }) => this.hub.setBlocked(blocked)));
    on.push(bridge.on("camera:recenter", () => this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => this.rig.zoomBy(delta)));
    on.push(bridge.on("net:reconnect", () => this.net.reconnect()));
    on.push(bridge.on("look:set", (e) => this.applyLook(e.look, e.lookGrant, e)));
    on.push(
      bridge.on("firework:fire", ({ item, grant }) => {
        // 누른 순간 내 자리에서 바로 터뜨리고, 서버에는 증서를 보낸다 (서버가 같은 채널에 알린다)
        this.fireworks.launch(item, this.player.x, this.player.y, this.fireworkView(), true, this.ctx.opts.name);
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
    on.push(bridge.on("peers:ask", () => bridge.emit("peers:list", { names: [...this.remotes.values()].map((r) => r.name) })));
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
    this.walker.cancel();
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
    if (this.hub.isBlocked || this.cleaned || this.inShop) return;
    this.walker.cancel();
    const pl = this.player;
    const now = this.time.now;
    const occupied = this.net.online ? this.seats : EMPTY_SEATS;
    const mySid = this.net.online ? this.net.mySid : null;
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
        if (o.portal) {
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
      case "dock":
        // 조각배(50번): 빈 배 앞자리에 타거나 2인승 뒷자리에 같이 탄다 (BoatRide)
        pl.faceTo(o.x, o.y + 10, now);
        this.boats.useDock();
        break;
      // ── 50번 광장 놀거리 ── 시소·트램펄린은 그네처럼 1인 자리, 회전목마는 빈 목마를 골라 탄다, 소원 분수는 UI 창
      case "seesaw":
      case "trampoline":
        this.useSpot(o);
        break;
      case "carousel":
        this.rides.useCarousel(o);
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
   * 게임 안 채널 이동 (19): 새 채널의 처음 자리(SPAWN)에서 시작한다. 앉은 자리·나무·그네는 놓고 간다
   * (옛 채널은 1000으로 닫혀 바로 비워진다). 새로고침 복원(lib/resume.ts)은 이 길을 타지 않아 같은 채널의 같은 자리로 돌아온다.
   */
  private switchChannel(channel: number): void {
    this.walker.cancel();
    if (this.net.online && this.net.channel === channel) return;
    if (!this.inShop) {
      const now = this.time.now;
      this.leaveCampfire();
      this.player.warp(SPAWN.x, SPAWN.y, now, this.seatReq);
      this.player.dir = DIR.down;
      this.player.view.apply(this.player.state, DIR.down, now);
      this.rig.recenter();
      this.recenterAt = 0;
    }
    this.net.switchChannel(channel);
  }

  /** 첫 방문 안내 대상 → 화살표를 띄울 월드 좌표 (대상 그림 위쪽) */
  /** F17 미니맵: 내 위치와 같은 채널 사람들 위치 (원격 아바타 보간 위치) */
  private emitMinimap(): void {
    const others: number[] = [];
    for (const r of this.remotes.values()) others.push(Math.round(r.x), Math.round(r.y));
    bridge.emit("minimap:dots", { me: { x: Math.round(this.player.x), y: Math.round(this.player.y) }, others });
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
        // 낚시터 입구 아치 (현판 위)
        return { x: FISH_ARCH.x, y: FISH_ARCH.y - 46, text: label ?? "낚시터" };
      case "zoo":
        // 동물원 정문 아치 (현판 위)
        return { x: ZOO_ARCH_AT.x, y: ZOO_ARCH_AT.y - 46, text: label ?? "동물원" };
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
    } else if (d < 400 || mine) {
      // 손 흔들기·환호 이모티콘은 아바타가 이름표 위에 띄운다 (AvatarView.playAct). 여기는 환호 반짝임만
      this.fx.actSparks(x, y, kind);
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

  private onTap(wx: number, wy: number): void {
    this.walker.cancel();
    if (this.hub.isBlocked || this.cleaned || this.inShop) return;
    // 47번: 다른 사람 캐릭터(몸·이름표)를 누르면 작은 메뉴(신고하기)
    const hit = peerAt(
      [...this.remotes.values()].map((r) => ({ sid: r.sid, name: r.name, x: r.x, y: r.y, visible: r.visible, label: r.view.label.getBounds() })),
      wx,
      wy,
    );
    if (hit && this.net.channel !== null) {
      bridge.emit("peer:menu", { sid: hit.sid, name: hit.name, ch: this.net.channel });
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
    if (o && o.dist < 16 && Math.hypot(o.obj.x - pl.x, o.obj.y - pl.y) <= o.obj.r * 1.5 && !pl.airborne) this.useObject(o.obj);
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
    if (this.hub.isBlocked) this.move.ax = this.move.ay = 0;
    this.walker.steer(this.move, Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER, now);
    const started = pl.update(this.benchInput(now), now, this.seatReq);
    this.boats.steer(this.move, dt);
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
    // 잡화점 문으로 걸어 들어가면 상점으로
    if (this.move.ay < -0.5 && nearShopDoor(pl.x, pl.y, 9)) {
      this.enterShop();
      return;
    }

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
    this.expr.update(now);
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
    this.map.scaleLabels(s);
    const L = this.atmos.levels;
    this.field.update(now, view, L.glow);
    this.life.update(dt, view, s);
    this.forage.update(dt, view, s);
    this.riding.update();
    this.zoo.update(now, view);
    this.zoo.scaleLabels(s);

    for (const r of this.remotes.values()) {
      r.update(pnow, view, s);
      if (r.visible && r.stateId === STATE.run && pnow - r.dustAt > DUST_MS * 1.3) {
        r.dustAt = pnow;
        this.fx.dust(r.x, r.y);
      }
    }
    this.boats.update(dt);
    this.rides.update();

    this.declutterLabels(now, pnow);
    this.updateNear();
    this.updateSeatHint(now, s);
    this.tooltip.layout(s, pl.y);
    this.markers.update(now, s, this.tooltip, this.resolveGrave);
    this.updateLotGuide(now);
    this.guide.update(now, view, s);

    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
    this.fireworks.update(now, dt, view);
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
    lit.begin(view, L.darkness * (1 - 0.6 * this.fireworks.lift));
    if (L.darkness > 0.004) {
      lit.add(pl.x, pl.y - 8, r, 0.92);
      for (const a of this.remotes.values()) {
        if (!a.visible) continue;
        if (a.view.lantern) lit.add(a.x, a.y - 8, 40, 0.65);
        else lit.add(a.x, a.y - 8, 22, 0.35);
      }
      const lr = 38 + 22 * L.glow;
      for (const sp of this.map.staticLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
      for (const sp of this.map.gridLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
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

  /** 이름표가 겹치면 위쪽 사람 이름표를 살짝 올린다 (모든 사람 이름이 보이게) */
  /** 이름표·말풍선 겹침 풀기: 이름표를 먼저 풀고, 말풍선을 각자 이름표 위에 놓은 뒤 함께 한 번 더 (겹치면 위로) */
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
    // 말풍선
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

  /** 근처 빈 좌석 안내 + seat:near (UI가 모바일 앉기 버튼을 강조) */
  private updateSeatHint(now: number, labelScale: number): void {
    const pl = this.player;
    const occupied = this.net.online ? this.seats : EMPTY_SEATS;
    const mySid = this.net.online ? this.net.mySid : null;
    const seat: Seat | null = pl.sitting || pl.inBoat ? null : pickSeat(pl.x, pl.y, occupied, mySid);
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
    this.seatHint.update(seat, pl, sittingFor, hidden, labelScale, seat || pl.sitting ? null : this.objectHint(), standText);
  }

  /** 좌석이 없을 때의 안내: 물속·매달리기·그네·근처 오브젝트·물가 */
  private objectHint(): { x: number; y: number; text: string; dim: boolean } | null {
    const pl = this.player;
    const pre = this.seatHint.prefix;
    const h = this.hintBuf;
    h.dim = false;
    if (pl.airborne) return null;
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
        const d = this.boats.dockHint(pre);
        h.text = d.text;
        h.dim = d.dim;
      } else if (o.obj.kind === "carousel" && this.rides.carouselFull(o.obj)) {
        h.text = "목마가 모두 찼어요";
        h.dim = true;
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
    this.boats = new BoatRide(host);
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
    this.rides?.destroy();
    this.rideSound?.destroy();
    this.expr?.destroy();
    this.life?.destroy();
    this.forage?.destroy();
    this.riding?.destroy();
    this.zoo?.destroy();
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

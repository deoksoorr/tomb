import * as Phaser from "phaser";
import { CAMPFIRES, campfireOfSeat, DIR, FURNITURE, HOUSING_DOOR, HUNT_GATE, isAvatarBody, isPhraseId, SHOP, SHOP_DOOR, SPAWN, STATE, TELEPORT_DIST, type ActKind, type PeerInfo, type Seat, type Sid } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { TEX } from "../assets/manifest";
import { bridge, type NetStatus, type UiEvents } from "../bridge";
import { DEPTH, GRAVE_NEAR_RADIUS, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { GraveTooltip } from "../entities/Grave";
import { Player, type SeatRequester } from "../entities/Player";
import { RemoteAvatar, SWING_FRONT } from "../entities/RemoteAvatar";
import { SeatHint } from "../entities/SeatHint";
import { phraseOf, type SpeechBubble } from "../entities/SpeechBubble";
import { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { escape, overlaps, type Box } from "../logic/jump";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { nearestObject, pickInteraction } from "../logic/interact";
import { neighborSeat, pickSeat, sideIntent } from "../logic/sit";
import { RealtimeClient } from "../net/RealtimeClient";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Effects } from "../world/Effects";
import { Fireworks } from "../world/Fireworks";
import { GraveField } from "../world/GraveField";
import { graveChannelFor } from "../world/graveChannel";
import { declutter, type LabelBox } from "../world/labels";
import { graveAt, nearestGrave, standSpot, type GravePlacement, type NearResult } from "../world/graveLayout";
import { inWater, nearShopDoor, nearWater, type Interactable } from "../world/layout";
import { NearTracker } from "../world/nearTracker";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { GraveMarkers } from "../world/Markers";
import { GuideArrow } from "../world/GuideArrow";
import { CampfireView } from "../world/Campfire";
import { campfireLevel, nearestCampfire } from "../world/campfireMath";
import { Sfx } from "../world/Sfx";
import { WorldMap } from "../world/WorldMap";
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
  private rig!: CameraRig;
  private player!: Player;
  private playerGlow!: Phaser.GameObjects.Image;
  private tooltip!: GraveTooltip;
  private markers!: GraveMarkers;
  private hub!: InputHub;
  private net!: RealtimeClient;
  private seatReq!: SeatRequester;
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
  private dustAt = 0;
  private netStarted = false;
  private cleaned = false;
  private inShop = false;
  private seatHint!: SeatHint;
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
  private readonly near: NearResult = { p: null as unknown as GravePlacement, dist: 0 };
  private readonly resolveGrave = (id: string) => this.field.placement(id);
  private readonly labelBoxes: (LabelBox & { t: Phaser.GameObjects.BitmapText | null })[] = [];
  private readonly labelOrder: LabelBox[] = [];
  private readonly hintBuf = { x: 0, y: 0, text: "" };
  private readonly bubbleBoxes: SpeechBubble[] = [];
  private sayAt = -Infinity;
  private guide!: GuideArrow;
  private readonly swingRiders: number[] = [];
  private campfire!: CampfireView;

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

    this.player = new Player(this, this.atlas, spawn.x, spawn.y, opts.color, opts.name, this.myBody());
    this.player.water = inWater;
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    this.physics.add.collider(this.player.sprite, this.map.gridColliders);
    // 묘비·의자·벤치 충돌은 점프 중에 끈다 (벽·나무·오두막은 그대로)
    this.graveCollider = this.physics.add.collider(this.player.sprite, this.field.colliders);
    this.furnitureCollider = this.physics.add.collider(this.player.sprite, this.map.furnitureColliders);
    this.player.onLand = () => this.onPlayerLand();
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

    this.atmos.setStaticLights(this.map.staticLights);
    this.atmos.setGridLights(this.map.gridLights);
    this.field.setMine(bridge.last("graves:mine")?.ids ?? []);
    const audio = bridge.last("audio:settings");
    if (audio) this.sfx.setSettings(audio.volume, audio.muted);

    this.hub = new InputHub();
    this.hub.attach();
    this.hub.setHandler((a) => this.onAction(a));
    this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false);

    this.net = this.createNet();
    this.seatReq = { sit: (id) => this.net.sit(id), stand: () => this.net.stand() };
    const look = bridge.last("look:set");
    if (look) this.applyLook(look.look, look.lookGrant);
    this.bindBridge();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
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
          this.syncSeats(m.seats);
          for (const p of m.peers) this.addRemote(p);
          // 의자에 앉은 채로 다시 붙었으면 좌석을 다시 확인한다
          const seat = this.player.state === "sitChair" ? this.player.seat : null;
          if (seat) {
            const owner = this.seats.get(seat.id);
            if (owner === undefined) this.net.sit(seat.id);
            else if (owner !== m.sid) this.player.seatDenied(seat.id, this.time.now);
          }
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
          for (const r of this.remotes.values()) if (r.seatId === seatId) r.seatId = null;
          if (sid === null) {
            this.seats.delete(seatId);
            return;
          }
          for (const [id, owner] of this.seats) if (owner === sid) this.seats.delete(id);
          this.seats.set(seatId, sid);
          if (sid === this.net.mySid) this.player.seatConfirmed(seatId);
          const r = this.remotes.get(sid);
          if (r) r.seatId = seatId;
          // 다른 사람이 먼저 앉았다 → 나는 바닥 앉기
          if (sid !== this.net.mySid && this.player.seat?.id === seatId) this.player.seatDenied(seatId, this.time.now);
        },
        onSeatDenied: (seatId) => this.player.seatDenied(seatId, this.time.now),
        onEmote: (sid, kind, graveId) => this.playRemoteEmote(sid, kind, graveId),
        onGraveEvent: (_sid, kind, graveId) => {
          bridge.emit("net:graveEvent", { kind, graveId });
          if (kind === "buried") this.remoteBuried.set(graveId, this.time.now);
        },
        onReset: () => {
          this.clearRemotes();
          this.seats.clear();
        },
        onPeers: (peers, seats) => this.reconcilePeers(peers, seats),
        onLook: (sid, look) => this.remotes.get(sid)?.view.setLook(look ?? []),
        onFirework: (sid, item, x, y) => this.fireworks.launch(item, x, y, this.rig.frameView(this.view), false, this.remotes.get(sid)?.name ?? ""),
        onAct: (sid, kind, x, y) => this.playAct(sid, kind, x, y),
        onSay: (sid, id) => {
          const text = phraseOf(id);
          const r = this.remotes.get(sid);
          if (!text || !r) return;
          r.view.say(text, performance.now());
          // 보이는 사람의 말풍선만 작게 소리
          if (r.visible) this.sfx.play("say", 0.3);
        },
        onSelfBody: (body) => {
          if (isAvatarBody(body)) this.player.view.setBody(body);
        },
      },
    );
  }

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
    const r = new RemoteAvatar(this, this.atlas, p.sid, p.name, p.color, p, performance.now(), p.look ?? [], isAvatarBody(p.body) ? p.body : "hood");
    // 같은 sid가 다시 들어오면(이름·색 변경) 앉아 있던 좌석을 이어받는다
    r.seatId = prev?.seatId ?? null;
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
      if (!r || r.name !== p.name || r.color !== p.color || r.body !== (isAvatarBody(p.body) ? p.body : "hood")) {
        this.addRemote(p);
        continue;
      }
      r.view.setLook(p.look ?? []);
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
      bridge.on("graves:set", ({ channel, graves, reviveTop }) => {
        // 다른 채널 묘지 목록은 무시 (채널을 옮기는 사이에 늦게 온 응답 등)
        if (channel === this.graveChannel) this.applyGraves(graves, reviveTop, true);
      }),
    );
    on.push(bridge.on("net:status", (st) => this.onNetStatus(st)));
    on.push(bridge.on("grave:focus", ({ graveId, teleport }) => this.focusGrave(graveId, teleport)));
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
    on.push(
      bridge.on("grave:revived", ({ graveId, revived }) => {
        if (!revived) return;
        const p = this.field.placement(graveId);
        if (p) this.fx.reviveGlow(p.x, p.y);
        this.fx.emoteIcon(this.player.x, this.player.y, "revive");
        this.net.emote("revive", graveId);
      }),
    );
    on.push(bridge.on("channel:switch", ({ channel }) => this.net.switchChannel(channel)));
    on.push(bridge.on("input:joystick", ({ x, y }) => this.hub.setJoystick(x, y)));
    on.push(bridge.on("input:runToggle", ({ on: v }) => this.hub.setRunToggle(v)));
    on.push(bridge.on("input:sit", () => this.hub.dispatch("sit")));
    on.push(bridge.on("input:interact", () => this.hub.dispatch("interact")));
    on.push(bridge.on("input:jump", () => this.hub.dispatch("jump")));
    on.push(bridge.on("input:say", ({ id }) => this.doSay(id)));
    on.push(bridge.on("guide:point", ({ target, label }) => this.guide.set(target ? this.resolveGuide(target, label) : null)));
    on.push(
      bridge.on("input:act", ({ kind }) => {
        if (kind === "wave" || kind === "cheer") this.hub.dispatch(kind);
      }),
    );
    on.push(bridge.on("ui:blockKeys", ({ blocked }) => this.hub.setBlocked(blocked)));
    on.push(bridge.on("camera:recenter", () => this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => this.rig.zoomBy(delta)));
    on.push(bridge.on("net:reconnect", () => this.net.reconnect()));
    on.push(bridge.on("look:set", ({ look, lookGrant }) => this.applyLook(look, lookGrant)));
    on.push(
      bridge.on("firework:fire", ({ item, grant }) => {
        // 누른 순간 내 자리에서 바로 터뜨리고, 서버에는 증서를 보낸다 (서버가 같은 채널에 알린다)
        this.fireworks.launch(item, this.player.x, this.player.y, this.rig.frameView(this.view), true, this.ctx.opts.name);
        this.net.firework(grant);
      }),
    );
    on.push(
      bridge.on("graves:mine", ({ ids }) => {
        this.field.setMine(Array.isArray(ids) ? ids : []);
        this.nearT.touch(); // 툴팁의 내 묘비 표시도 다시
      }),
    );
    on.push(bridge.on("audio:settings", ({ volume, muted }) => this.sfx.setSettings(volume, muted)));
    on.push(bridge.on("shop:closed", () => this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false)));
  }

  private applyLook(look: string[], grant: string): void {
    const clean = Array.isArray(look) ? look.filter((x): x is string => typeof x === "string") : [];
    this.player.view.setLook(clean);
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

  private focusGrave(id: string, teleport: boolean): void {
    const p = this.field.placement(id);
    if (!p) return;
    if (this.inShop) this.exitShop();
    const now = this.time.now;
    if (teleport) {
      const s = standSpot(p);
      this.player.warp(s.x, s.y, now, this.seatReq);
      this.player.faceTo(p.x, p.y, now);
      this.net.warp(s.x, s.y);
      this.rig.recenter();
    } else {
      this.rig.focus(p.x, p.y - 10);
    }
    this.fx.highlight(p.x, p.y);
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
        this.fx.emoteIcon(pl.x, pl.y, "flower");
      }
    }
    this.net.emote("flower", graveId);
  }

  private playRemoteEmote(sid: Sid, kind: "flower" | "revive", graveId: string): void {
    const r = this.remotes.get(sid);
    const p = this.field.placement(graveId);
    const now = performance.now();
    if (kind === "flower") {
      if (r?.visible && p && Math.hypot(r.x - p.x, r.y - p.y) < 48) {
        r.view.gesture(r.view.dir, 520, now);
        this.fx.flowerToss(r.x, r.y, p.x, p.y);
      } else {
        if (p) this.fx.flowerBurst(p.x, p.y);
        if (r?.visible) this.fx.emoteIcon(r.x, r.y, "flower");
      }
    } else {
      if (p) this.fx.reviveGlow(p.x, p.y);
      if (r?.visible) this.fx.emoteIcon(r.x, r.y, "revive");
    }
  }

  // ── 유령 잡화점 ──

  private enterShop(): void {
    if (this.inShop || this.cleaned) return;
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
    const pl = this.player;
    const now = this.time.now;
    const occupied = this.net.online ? this.seats : EMPTY_SEATS;
    const mySid = this.net.online ? this.net.mySid : null;
    if (a === "jump") {
      pl.jump(now, this.seatReq);
      return;
    }
    if (a === "wave" || a === "cheer") {
      this.doAct(a);
      return;
    }
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
        pl.attach("hang", o.ax, o.ay, o.ay + 0.5, now, this.seatReq);
        break;
      case "swing":
        // 그네 틀(받침 y)보다 앞에 그려야 아바타가 가려지지 않는다
        pl.attach("swing", o.ax, o.ay, o.ay + SWING_FRONT, now, this.seatReq);
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
    }
  }

  /** 첫 방문 안내 대상 → 화살표를 띄울 월드 좌표 (대상 그림 위쪽) */
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
      default:
        return null;
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
      if (well) this.fx.splash(well.x, well.y - 6);
      else this.fx.splash(x, y);
      if (d < 360 || mine) this.sfx.splash(gain);
    } else if (d < 400 || mine) {
      this.fx.actIcon(x, y, kind);
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
    if (this.hub.isBlocked || this.cleaned || this.inShop) return;
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
    const started = pl.update(this.benchInput(now), now, this.seatReq);
    if (this.graveLock && !this.overlappingGrave()) this.graveLock = false;
    this.graveCollider.active = !pl.airborne && !this.graveLock;
    this.furnitureCollider.active = this.graveCollider.active;
    if (this.net.online && pnow >= this.peerCheckAt) {
      // 이상 징후만 확인 (서버는 깨우지 않는다): HUD 인원과 원격 아바타 수가 다르면 목록을 한 번 다시 받는다
      this.peerCheckAt = pnow + PEER_CHECK_MS;
      if (this.remotes.size !== this.net.peerCount) this.net.requestSync();
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

    for (const r of this.remotes.values()) {
      r.update(pnow, view, s);
      if (r.visible && r.stateId === STATE.run && pnow - r.dustAt > DUST_MS * 1.3) {
        r.dustAt = pnow;
        this.fx.dust(r.x, r.y);
      }
    }

    this.declutterLabels(now, pnow);
    this.updateNear();
    this.updateSeatHint(now, s);
    this.tooltip.layout(s, pl.y);
    this.markers.update(now, s, this.tooltip, this.resolveGrave);
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
    const seat: Seat | null = pl.sitting ? null : pickSeat(pl.x, pl.y, occupied, mySid);
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
    const standText = bench ? (this.seatHint.prefix === "E " ? "←→ 옆자리 · ↑↓ 일어나기" : "좌우로 옆자리 · 위아래로 일어나기") : null;
    // 불멍 구도에서는 화면을 가리지 않게 앉기 안내를 띄우지 않는다
    if (this.campfire.active) hidden = true;
    this.seatHint.update(seat, pl, sittingFor, hidden, labelScale, seat || pl.sitting ? null : this.objectHint(), standText);
  }

  /** 좌석이 없을 때의 안내: 물속·매달리기·그네·근처 오브젝트·물가 */
  private objectHint(): { x: number; y: number; text: string } | null {
    const pl = this.player;
    const pre = this.seatHint.prefix;
    const h = this.hintBuf;
    if (pl.airborne) return null;
    if (pl.state === "swim" || pl.state === "dive") {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = pl.state === "swim" ? `${pre}잠수` : `${pre}떠오르기`;
      return h;
    }
    if (pl.anchored) {
      h.x = pl.x;
      h.y = pl.y + 2;
      h.text = pl.state === "hang" ? "이동하면 내려와요" : "이동하면 내려요";
      return h;
    }
    const o = nearestObject(this.map.interactables, pl.x, pl.y);
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

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.ctx.disposed = true;
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

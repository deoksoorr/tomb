import * as Phaser from "phaser";
import { DIR, SHOP_DOOR, SPAWN, STATE, TELEPORT_DIST, type PeerInfo, type Sid } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { TEX } from "../assets/manifest";
import { bridge, type ThemeId } from "../bridge";
import { DEPTH, GRAVE_NEAR_RADIUS, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { GraveTooltip } from "../entities/Grave";
import { Player, type SeatRequester } from "../entities/Player";
import { RemoteAvatar } from "../entities/RemoteAvatar";
import { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { pickInteract, pickSeat } from "../logic/sit";
import { RealtimeClient } from "../net/RealtimeClient";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { isThemeId, THEME_DEFS } from "../theme";
import { Ambient } from "../world/Ambient";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Effects } from "../world/Effects";
import { Fireworks } from "../world/Fireworks";
import { GraveField } from "../world/GraveField";
import { graveAt, nearestGrave, standSpot, type GravePlacement, type NearResult } from "../world/graveLayout";
import { nearShopDoor } from "../world/layout";
import { Lighting, playerLightRadius } from "../world/Lighting";
import { GraveMarkers } from "../world/Markers";
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
const MY_GRAVE_MARK_MS = 8000;
const OTHER_GRAVE_MARK_MS = 4000;
const DUST_MS = 90;
const EMPTY_SEATS = new Map<string, Sid>();
const NO_MOVE: MoveInput = { ax: 0, ay: 0, run: false };

export class WorldScene extends Phaser.Scene {
  private ctx!: GameContext;
  private reduced = false;
  private atlas!: GlyphAtlas;
  private map!: WorldMap;
  private field!: GraveField;
  private fx!: Effects;
  private atmos!: Atmosphere;
  private ambient!: Ambient;
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
  private nearId: string | null = null;
  private pendingFocus: string | null = null;
  private pendingBury: { id: string; at: number } | null = null;
  private readonly remoteBuried = new Map<string, number>();
  private recenterAt = 0;
  private dustAt = 0;
  private netStarted = false;
  private cleaned = false;
  private inShop = false;
  private theme: ThemeId = "temple";
  private readonly unsubs: (() => void)[] = [];
  /** 이번 프레임 화면 (CameraRig.frameView가 채운다) */
  private readonly view = new Phaser.Geom.Rectangle();
  private readonly near: NearResult = { p: null as unknown as GravePlacement, dist: 0 };

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

    // 묘비 목록이 이미 와 있으면 먼저 깔고, 공유 링크 묘비가 있으면 그 앞에서 시작한다
    const initial = bridge.last("graves:set");
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

    this.player = new Player(this, this.atlas, spawn.x, spawn.y, opts.color, opts.name);
    this.physics.add.collider(this.player.sprite, this.map.colliders);
    this.physics.add.collider(this.player.sprite, this.map.gridColliders);
    this.physics.add.collider(this.player.sprite, this.field.colliders);
    this.playerGlow = this.add.image(spawn.x, spawn.y, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y));
    this.rig.setMapHeight(this.map.height);
    this.atmos = new Atmosphere(this, this.reduced, window.location.search);
    this.lighting = new Lighting(this);
    this.ambient = new Ambient(this, this.reduced);
    this.sfx = new Sfx();
    this.fireworks = new Fireworks(this, this.reduced, this.sfx);
    this.tooltip = new GraveTooltip(this, this.atlas);
    this.markers = new GraveMarkers(this, this.atlas, this.reduced);

    const startTheme = bridge.last("theme:set")?.theme;
    this.applyTheme(isThemeId(startTheme) ? startTheme : (this.ctx.theme ?? "temple"), true);
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
      { name: opts.name, color: opts.color, channel: opts.channel, debug: opts.debug },
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
        onFirework: (_sid, item, x, y) => this.fireworks.launch(item, x, y, this.rig.frameView(this.view), false),
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
    const r = new RemoteAvatar(this, this.atlas, p.sid, p.name, p.color, p, performance.now(), p.look ?? []);
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
      if (!r || r.name !== p.name || r.color !== p.color) {
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
    on.push(bridge.on("graves:set", ({ graves, reviveTop }) => this.applyGraves(graves, reviveTop, true)));
    on.push(bridge.on("grave:focus", ({ graveId, teleport }) => this.focusGrave(graveId, teleport)));
    on.push(
      bridge.on("grave:buried", ({ graveId }) => {
        this.net.graveEvent("buried", graveId);
        this.pendingBury = { id: graveId, at: this.time.now };
        this.tryBury();
      }),
    );
    on.push(bridge.on("grave:changed", ({ graveId, kind }) => this.net.graveEvent(kind, graveId)));
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
    on.push(bridge.on("ui:blockKeys", ({ blocked }) => this.hub.setBlocked(blocked)));
    on.push(bridge.on("camera:recenter", () => this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => this.rig.zoomBy(delta)));
    on.push(bridge.on("net:reconnect", () => this.net.reconnect()));
    on.push(bridge.on("look:set", ({ look, lookGrant }) => this.applyLook(look, lookGrant)));
    on.push(
      bridge.on("firework:fire", ({ item, grant }) => {
        // 누른 순간 내 자리에서 바로 터뜨리고, 서버에는 증서를 보낸다 (서버가 같은 채널에 알린다)
        this.fireworks.launch(item, this.player.x, this.player.y, this.rig.frameView(this.view), true);
        this.net.firework(grant);
      }),
    );
    on.push(bridge.on("theme:set", ({ theme }) => isThemeId(theme) && this.applyTheme(theme, false)));
    on.push(bridge.on("audio:settings", ({ volume, muted }) => this.sfx.setSettings(volume, muted)));
    on.push(bridge.on("shop:closed", () => this.hub.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false)));
  }

  private applyLook(look: string[], grant: string): void {
    const clean = Array.isArray(look) ? look.filter((x): x is string => typeof x === "string") : [];
    this.player.view.setLook(clean);
    if (grant) this.net.look(grant);
  }

  private applyTheme(theme: ThemeId, first: boolean): void {
    if (!first && theme === this.theme) return;
    const t0 = performance.now();
    this.theme = theme;
    const def = THEME_DEFS[theme];
    this.map.setTheme(theme);
    this.field.setStyle(def.graveStyle);
    this.atmos.setStaticLights(this.map.staticLights);
    this.atmos.setGridLights(this.map.gridLights);
    this.ambient.set(def.ambient, [...this.map.trees, ...this.map.gridTrees]);
    this.debugMark(`theme:${theme}Ms`, performance.now() - t0);
  }

  private applyGraves(graves: PublicGrave[], reviveTop: string[], live: boolean): void {
    const t0 = performance.now();
    const res = this.field.setData(graves, reviveTop);
    if (res.rowsChanged || !live) {
      this.map.setRows(this.field.layout.rows, graves.length);
      if (live) {
        this.rig.setMapHeight(this.map.height);
        this.atmos.setGridLights(this.map.gridLights);
        this.ambient.set(THEME_DEFS[this.theme].ambient, [...this.map.trees, ...this.map.gridTrees]);
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
      // 목록이 바뀌면 근접 툴팁 내용도 다시
      this.nearId = null;
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
      this.markers.add(q, MY_GRAVE_MARK_MS, "여기 잠들었어요", now);
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
    this.tooltip.hide();
    if (this.nearId) bridge.emit("grave:near", null);
    this.nearId = null;
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
    // 이동 입력이 있는 동안에는 앉지 않는다 (걷다가 X를 같이 눌러도 상태가 튀지 않게)
    const moving = Math.hypot(this.move.ax, this.move.ay) >= DEADZONE_ENTER;
    if (a === "sit") {
      if (moving) return;
      if (pl.sitting) pl.stand(now, this.seatReq);
      else pl.sit(pickSeat(pl.x, pl.y, occupied, mySid), now, this.seatReq);
      return;
    }
    if (nearShopDoor(pl.x, pl.y)) {
      this.enterShop();
      return;
    }
    const near = nearestGrave(this.field.layout, pl.x, pl.y, GRAVE_NEAR_RADIUS);
    const seat = pl.sitting || moving ? null : pickSeat(pl.x, pl.y, occupied, mySid);
    const t = pickInteract(near ? { id: near.p.id, dist: near.dist } : null, seat, pl.x, pl.y);
    if (t.kind === "grave") bridge.emit("grave:open", { graveId: t.graveId });
    else if (t.kind === "seat") pl.sit(t.seat, now, this.seatReq);
    else if (pl.sitting) pl.stand(now, this.seatReq);
  }

  private onTap(wx: number, wy: number): void {
    if (this.hub.isBlocked || this.cleaned || this.inShop) return;
    const p = graveAt(this.field.layout, wx, wy);
    if (p) bridge.emit("grave:open", { graveId: p.id });
  }

  private onResize(): void {
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
    const started = pl.update(this.move, now, this.seatReq);
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
    if (this.recenterAt && now >= this.recenterAt) {
      this.recenterAt = 0;
      this.rig.recenter();
    }
    const s = this.rig.labelScale;
    const view = this.rig.frameView(this.view);
    pl.view.sync(now, s);

    this.map.update(view);
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

    this.updateNear();
    this.tooltip.layout(s, pl.y);
    this.markers.update(now, s, this.tooltip);

    const longSit = pl.sitting && pl.view.sitSince > 0 && now - pl.view.sitSince > SIT_IDLE_MS;
    this.atmos.gather(longSit ? { x: pl.x, y: pl.y } : null);
    this.atmos.update(now, dt, view);
    this.ambient.update(now, dt, view);
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
    lit.begin(view, L.darkness);
    if (L.darkness > 0.004) {
      lit.add(pl.x, pl.y - 8, r, 0.92);
      for (const a of this.remotes.values()) {
        if (!a.visible) continue;
        if (a.view.lantern) lit.add(a.x, a.y - 8, 34, 0.6);
        else lit.add(a.x, a.y - 8, 18, 0.28);
      }
      const lr = 30 + 18 * L.glow;
      for (const sp of this.map.staticLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
      for (const sp of this.map.gridLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
      const vis = this.field.visibleViews;
      for (let i = 0; i < vis.length; i++) {
        const v = vis[i];
        const p = v.p;
        if (!p) continue;
        const h = v.height;
        lit.add(p.x, p.y - h * 0.5, 10 + h * 0.5, v.spot);
        if (v.decorLit) lit.add(p.x, p.y - 2, 26, 0.45);
      }
      this.fireworks.addLights(lit);
    }
    lit.end();
  }

  private updateNear(): void {
    const pl = this.player;
    const near = nearestGrave(this.field.layout, pl.x, pl.y, GRAVE_NEAR_RADIUS, this.near);
    const id = near ? near.p.id : null;
    if (id !== this.nearId) {
      this.nearId = id;
      bridge.emit("grave:near", id ? { graveId: id } : null);
      const g = id ? this.field.grave(id) : undefined;
      if (near && g) this.tooltip.show(near.p, g.name, g.epitaph);
      else this.tooltip.hide();
    }
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
    this.sfx?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.nearId) bridge.emit("grave:near", null);
    this.nearId = null;
  }
}

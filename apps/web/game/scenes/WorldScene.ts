import * as Phaser from "phaser";
import { SPAWN, STATE, type PeerInfo, type Sid } from "@tomb/protocol";
import type { PublicGrave } from "@/lib/types";
import { bridge } from "../bridge";
import { GRAVE_NEAR_RADIUS, prefersReducedMotion, SIT_IDLE_MS } from "../config";
import { GraveTooltip } from "../entities/Grave";
import { Player, type SeatRequester } from "../entities/Player";
import { RemoteAvatar } from "../entities/RemoteAvatar";
import { KeyboardInput, type KeyAction } from "../input/Keyboard";
import { DEADZONE_ENTER, type MoveInput } from "../logic/movement";
import { pickInteract, pickSeat } from "../logic/sit";
import { RealtimeClient } from "../net/RealtimeClient";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { CameraRig } from "../world/CameraRig";
import { Effects } from "../world/Effects";
import { GraveField } from "../world/GraveField";
import { GraveMarkers } from "../world/Markers";
import { graveAt, nearestGrave, standSpot, type GravePlacement, type NearResult } from "../world/graveLayout";
import { WorldMap } from "../world/WorldMap";
import type { GameContext } from "./context";

// 월드 씬: 맵·묘비·내 캐릭터·원격 아바타·분위기·카메라·네트워크를 묶고 bridge 이벤트를 처리한다.

const FOCUS_WAIT_MS = 4000;
const BURY_WAIT_MS = 15_000;
const REMOTE_BURY_TTL_MS = 30_000;
/** 묘비가 솟아오른 뒤 캐릭터를 그 앞으로 옮기는 시점 */
const BURY_WARP_DELAY_MS = 1700;
const MY_GRAVE_MARK_MS = 8000;
const OTHER_GRAVE_MARK_MS = 4000;
const DUST_MS = 90;
const EMPTY_SEATS = new Map<string, Sid>();

export class WorldScene extends Phaser.Scene {
  private ctx!: GameContext;
  private reduced = false;
  private atlas!: GlyphAtlas;
  private map!: WorldMap;
  private field!: GraveField;
  private fx!: Effects;
  private atmos!: Atmosphere;
  private rig!: CameraRig;
  private player!: Player;
  private tooltip!: GraveTooltip;
  private markers!: GraveMarkers;
  private keys!: KeyboardInput;
  private net!: RealtimeClient;
  private seatReq!: SeatRequester;
  private readonly remotes = new Map<Sid, RemoteAvatar>();
  private readonly seats = new Map<string, Sid>();
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  private joy = { x: 0, y: 0 };
  private runToggle = false;
  private blocked = false;
  private nearId: string | null = null;
  private pendingFocus: string | null = null;
  private pendingBury: { id: string; at: number } | null = null;
  private readonly remoteBuried = new Map<string, number>();
  private recenterAt = 0;
  private dustAt = 0;
  private netStarted = false;
  private cleaned = false;
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
    const { opts } = this.ctx;
    this.reduced = prefersReducedMotion();
    this.cleaned = false;
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

    this.rig = new CameraRig(this, this.player.sprite, canvas, (x, y) => this.onTap(x, y));
    this.rig.setMapHeight(this.map.height);
    this.atmos = new Atmosphere(this, this.reduced, window.location.search);
    this.atmos.setStaticLights(this.map.staticLights);
    this.atmos.setGridLights(this.map.gridLights);
    this.tooltip = new GraveTooltip(this, this.atlas);
    this.markers = new GraveMarkers(this, this.atlas, this.reduced);

    this.keys = new KeyboardInput((a) => this.onAction(a));
    this.keys.attach();
    this.setBlocked(bridge.last("ui:blockKeys")?.blocked ?? false);

    this.net = this.createNet();
    this.seatReq = { sit: (id) => this.net.sit(id), stand: () => this.net.stand() };
    this.bindBridge();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.ctx.disposers.push(() => this.cleanup());

    if (this.pendingFocus) {
      // 공유 링크: 묘비 목록을 조금 기다렸다가 그 앞에서 접속한다
      this.time.delayedCall(FOCUS_WAIT_MS, () => this.startNet());
    } else this.startNet();

    bridge.emit("ready");
    if (openOnStart) {
      const id = openOnStart;
      this.time.delayedCall(250, () => bridge.emit("grave:open", { graveId: id }));
    }
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
          this.seats.clear();
          for (const [seatId, sid] of Object.entries(m.seats)) this.seats.set(seatId, sid);
          for (const p of m.peers) this.addRemote(p);
          for (const [seatId, sid] of this.seats) {
            const r = this.remotes.get(sid);
            if (r) r.seatId = seatId;
          }
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
      },
    );
  }

  private addRemote(p: PeerInfo): void {
    if (p.sid === this.net.mySid) return;
    const prev = this.remotes.get(p.sid);
    prev?.destroy();
    const r = new RemoteAvatar(this, this.atlas, p.sid, p.name, p.color, p, performance.now());
    // 같은 sid가 다시 들어오면(이름·색 변경) 앉아 있던 좌석을 이어받는다
    r.seatId = prev?.seatId ?? null;
    if (!r.seatId) for (const [seatId, owner] of this.seats) if (owner === p.sid) r.seatId = seatId;
    this.remotes.set(p.sid, r);
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
    on.push(
      bridge.on("input:joystick", ({ x, y }) => {
        this.joy.x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
        this.joy.y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
      }),
    );
    on.push(bridge.on("input:runToggle", ({ on: v }) => (this.runToggle = v)));
    on.push(bridge.on("input:sit", () => this.onAction("sit")));
    on.push(bridge.on("input:interact", () => this.onAction("interact")));
    on.push(bridge.on("ui:blockKeys", ({ blocked }) => this.setBlocked(blocked)));
    on.push(bridge.on("camera:recenter", () => this.rig.recenter()));
    on.push(bridge.on("camera:zoom", ({ delta }) => this.rig.zoomBy(delta)));
  }

  private setBlocked(b: boolean): void {
    this.blocked = b;
    this.keys.setBlocked(b);
    if (b) this.joy = { x: 0, y: 0 };
  }

  private applyGraves(graves: PublicGrave[], reviveTop: string[], live: boolean): void {
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
      // 목록이 바뀌면 근접 툴팁 내용도 다시
      this.nearId = null;
    }
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

  // ── 입력 ──

  private onAction(a: KeyAction): void {
    if (this.blocked || this.cleaned) return;
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
    const near = nearestGrave(this.field.layout, pl.x, pl.y, GRAVE_NEAR_RADIUS);
    const seat = pl.sitting || moving ? null : pickSeat(pl.x, pl.y, occupied, mySid);
    const t = pickInteract(near ? { id: near.p.id, dist: near.dist } : null, seat, pl.x, pl.y);
    if (t.kind === "grave") bridge.emit("grave:open", { graveId: t.graveId });
    else if (t.kind === "seat") pl.sit(t.seat, now, this.seatReq);
    else if (pl.sitting) pl.stand(now, this.seatReq);
  }

  private onTap(wx: number, wy: number): void {
    if (this.blocked || this.cleaned) return;
    const p = graveAt(this.field.layout, wx, wy);
    if (p) bridge.emit("grave:open", { graveId: p.id });
  }

  private onResize(): void {
    this.rig.applyBounds();
    this.atmos.resize();
  }

  // ── 매 프레임 ──

  update(time: number, delta: number): void {
    if (this.cleaned) return;
    const dt = Math.min(delta, 100);
    const now = time;
    const pl = this.player;

    // 입력: 키보드 축과 조이스틱 중 큰 쪽
    this.keys.axis(this.move);
    const jm = Math.hypot(this.joy.x, this.joy.y);
    if (jm > Math.hypot(this.move.ax, this.move.ay) * 0.99 && jm > 0) {
      this.move.ax = this.joy.x;
      this.move.ay = this.joy.y;
    }
    this.move.run = this.keys.running || this.runToggle;
    const started = pl.update(this.move, now, this.seatReq);
    if (started && this.rig.detached) {
      this.rig.recenter();
      this.recenterAt = 0;
    }
    if (pl.state === "run" && now - this.dustAt > DUST_MS) {
      this.dustAt = now;
      this.fx.dust(pl.x, pl.y);
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
    this.field.update(now, view, this.atmos.levels.glow);

    const pnow = performance.now();
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

    this.net.tick(pnow);
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
    this.keys?.detach();
    this.rig?.destroy();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.nearId) bridge.emit("grave:near", null);
    this.nearId = null;
  }
}

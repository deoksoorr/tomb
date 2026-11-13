import * as Phaser from "phaser";
import { boatFishingSpotId, DIR, FISHING_SPOTS, fishingSpotById, STATE, type DirId, type FishingSpot, type PeerInfo, type Sid, type WelcomeMsg } from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride, type AmbienceOverride } from "@/lib/ambience";
import { gatherNodeById, NODE_LABEL, NPCS, type GatherNode, type Npc } from "@/lib/forage/catalog";
import { bridge, type ForageRodPhase } from "../../bridge";
import { DEPTH } from "../../config";
import type { Player } from "../../entities/Player";
import type { RemoteAvatar } from "../../entities/RemoteAvatar";
import type { RealtimeClient } from "../../net/RealtimeClient";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import type { Interactable } from "../layout";
import { ensureForageTextures, ensureIconTexture, FTEX } from "./art";
import { nodeWindow, windowEndsAt } from "@/lib/forage/rules";
import { FishZoneView } from "./FishZoneView";
import { destroyAura, ensureNodeFxTextures, gatheredFx, makeAura, spawnFx, updateAura, vanishFx, type NodeAura } from "./nodeFx";
import { ForageSfx } from "./sounds";
import { gearById } from "@/lib/rpg/catalog";
import { iconCanvas } from "../../rpg/icons";

// 4·32번 낚시·채집 (월드 쪽). WorldScene은 이 클래스 하나만 들고 몇 군데(접속·좌석·E·매 프레임)에서 부른다.
//
// - 낚시 자리(protocol FISHING_SPOTS): 1인 자리(서버 좌석, sitGround로 앉는다). 앉으면 UI(components/forage)가 낚시 창을 열고,
//   던지기·입질·줄다리기 단계를 forage:rod로 알려 주면 여기서 낚싯대·줄·찌를 그린다. 다른 사람의 낚싯대는 좌석 점유표로 그린다.
// - NPC 둘(어부 영감·수집가 유령): E → 판매 창. 발밑 충돌이 있다.
// - 채집 지점: 서버가 알려 준 "지금 나에게 피어 있는" 것만 그린다 (forage:nodes). E → UI가 게이지/곤충 미니게임을 돌린다.
//   게이지는 머리 위 막대로 그린다 (forage:gauge).
// - 배 위 낚시: 조각배에 탄 채 물 한가운데서 E → 배가 떠 있는 물(강·호수)의 가상 자리(boat:river·boat:lake)로 같은 낚시 창을 연다.
//   낚싯대는 배를 따라 움직이고, 다른 사람에게는 실시간 서버의 rod 표시(조각배 자리에 앉아 있을 때만)로 보인다.

export type ForageDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  colliders: Phaser.Physics.Arcade.StaticGroup;
  player: () => Player;
  net: () => RealtimeClient;
  seats: () => ReadonlyMap<string, Sid>;
  /** 다른 사람 아바타 (배 위 낚싯대를 그 사람 배에 붙여 그린다) */
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  /** 상호작용 대상 덧붙이기 (WorldMap.setExtraItems) */
  setItems: (items: Interactable[]) => void;
  toast: (message: string) => void;
};

/** 바라보는 방향 → 단위 벡터 */
const STEP: Record<number, [number, number]> = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] };
const NO_SEATS: ReadonlyMap<string, Sid> = new Map();
/** 찌가 떨어지는 거리 */
const CAST_DIST = 24;

/** follow = 배 위 낚싯대: 매 프레임 낚는 사람의 위치·방향으로 자리를 옮긴다 (null이면 숨긴다) */
type Rod = { g: Phaser.GameObjects.Graphics; bob: Phaser.GameObjects.Image; spot: FishingSpot; mine: boolean; follow?: () => { x: number; y: number; facing: DirId } | null };
/** 배 위 낚싯대 드리우기를 서버가 확인하지 않았으면 이만큼마다 다시 보낸다 (배 자리를 다시 잡는 중일 수 있다) */
const ROD_RETRY_MS = 1500;
/** 배에서는 좌우로만 앉는다 → 낚싯대도 좌우로 */
const sideOf = (dir: number): DirId => (dir === DIR.left ? DIR.left : DIR.right);
type NodeView = { node: GatherNode; img: Phaser.GameObjects.Image; aura: NodeAura };
/** 창(15분)이 끝나기 이만큼 전부터 지점이 깜빡인다 */
const NODE_BLINK_MS = 10_000;
/** "뿅" 소리가 들리는 거리 (새로 핀 지점이 이 안에 있을 때만) */
const NODE_HEAR = 260;

export class Foraging {
  private readonly scene: Phaser.Scene;
  private readonly sfx = new ForageSfx();
  private readonly override: AmbienceOverride;
  private night = false;
  private serverKnows = false;
  private readonly npcImgs: { npc: Npc; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; title: Phaser.GameObjects.BitmapText }[] = [];
  private readonly nodes = new Map<string, NodeView>();
  private nodeIds: string[] = [];
  /** 지금 지점 목록을 받은 창 번호 (창이 바뀌었는데 아직 새 목록이 안 왔으면 깜빡임을 이어 간다) */
  private nodesWindow = -1;
  /** 처음 목록을 받았는지 (첫 목록은 소리 없이 피어난다) */
  private nodesLoaded = false;
  /** 방금 캐러 간 지점 (목록에서 빠지면 "캐서 없어짐" 연출) */
  private usedNode: { id: string; at: number } | null = null;
  private readonly rods = new Map<string, Rod>();
  /** 내가 앉은 낚시 자리 */
  private fishing: FishingSpot | null = null;
  /** 지금 낚시가 배 위 낚시인지 (fishing은 매 프레임 배를 따라 옮기는 가상 자리) */
  private boatFish = false;
  /** 서버가 내 배 위 낚싯대(rod)를 받아들였는지, 다시 보낼 시각 */
  private rodConfirmed = false;
  private rodRetryAt = 0;
  /** 배 위에서 낚싯대를 드리운 다른 사람들 */
  private readonly boatRods = new Set<Sid>();
  private rodPhase: ForageRodPhase = "idle";
  private tension = 0;
  private phaseAt = 0;
  private reelTickAt = 0;
  private bang: Phaser.GameObjects.Image | null = null;
  private gauge: { g: Phaser.GameObjects.Graphics; start: number; ms: number; kind: string; node: string; tickAt: number } | null = null;
  private labelScale = 1;
  private frameAt = 0;
  private frame = 0;
  private checkAt = 0;
  private readonly offs: (() => void)[] = [];
  private destroyed = false;
  /** 낚시터 장식·낚시 자리 표시 (의자·꽂아 둔 낚싯대·찌·물결·말풍선) */
  private readonly zone: FishZoneView;

  constructor(private readonly d: ForageDeps) {
    const scene = (this.scene = d.scene);
    this.override = typeof window !== "undefined" ? parseAmbienceOverride(window.location.search) : {};
    this.night = this.isNight();
    ensureForageTextures(scene, this.night);
    ensureNodeFxTextures(scene);
    d.atlas.ensure(NPCS.map((n) => n.name + n.title).join("") + "낚시하기" + Object.values(NODE_LABEL).join("") + "에게 팔기");
    this.zone = new FishZoneView({ scene, atlas: d.atlas, reduced: d.reduced, addCollider: (x, y, w, h) => this.addCollider(x, y, w, h) });
    for (const npc of NPCS) {
      const img = scene.add.image(npc.x, npc.y + 1, FTEX.npc(npc.id, 0)).setOrigin(0.5, 1).setDepth(npc.y);
      const stall = npc.id === "fishmonger" ? { dx: -22, dy: 2 } : { dx: -20, dy: 6 }; // 어부 노점은 낚시터 마당 동쪽 끝 (catalog NPCS)
      scene.add.image(npc.x + stall.dx, npc.y + stall.dy, FTEX.stall(npc.id)).setOrigin(0.5, 1).setDepth(npc.y + stall.dy);
      const label = scene.add.bitmapText(npc.x, npc.y - 27, FONT_KEY, npc.name, FONT_PX).setOrigin(0.5, 1).setTint(0xffe8b0).setDepth(DEPTH.labels - 1);
      const title = scene.add.bitmapText(npc.x, npc.y - 35, FONT_KEY, npc.title, FONT_PX).setOrigin(0.5, 1).setTint(0xc8d8b0).setAlpha(0.85).setDepth(DEPTH.labels - 1);
      this.npcImgs.push({ npc, img, label, title });
      // 발밑 충돌 (노점까지)
      this.addCollider(npc.x - 6, npc.y - 5, 12, 5);
      this.addCollider(npc.x + stall.dx - 12, npc.y + stall.dy - 6, 24, 6);
    }
    this.offs.push(
      bridge.on("forage:nodes", ({ ids }) => this.setNodes(ids)),
      bridge.on("forage:rod", ({ phase, tension }) => this.setRod(phase, tension ?? 0)),
      bridge.on("forage:gauge", (e) => (e.phase === "start" ? this.startGauge(e.ms, e.kind, e.node) : this.endGauge(e.ok, e.node))),
      bridge.on("forage:pop", ({ itemId, sparkle }) => this.pop(itemId, sparkle)),
      bridge.on("forage:leave", () => this.leave()),
      bridge.on("forage:coin", () => this.sfx.play("coin", 0.8)),
    );
    const nodes = bridge.last("forage:nodes");
    if (nodes) this.setNodes(nodes.ids);
    else this.rebuildItems();
  }

  private addCollider(x: number, y: number, w: number, h: number): void {
    const z = this.scene.add.zone(x + w / 2, y + h / 2, w, h);
    this.scene.physics.add.existing(z, true);
    this.d.colliders.add(z);
  }

  private isNight(): boolean {
    const p = ambienceAt(Date.now(), this.override).phase;
    return p === "night" || p === "dusk";
  }

  // ── 상호작용 대상 ──

  private rebuildItems(): void {
    const items: Interactable[] = [];
    for (const s of FISHING_SPOTS) {
      // 앉아 있는 동안은 낚시 창이 조작을 맡는다 (E 안내를 띄우지 않는다). 누가 앉은 자리의 회색 안내는 WorldScene이 (spots.ts spotOf)
      if (this.fishing?.id === s.id) continue;
      items.push({ id: `forage:fish:${s.id}`, kind: "forage", forage: `fish:${s.id}`, x: s.x, y: s.y, r: 16, ax: s.x, ay: s.y, label: "낚시하기" });
    }
    for (const n of NPCS)
      items.push({ id: `forage:npc:${n.id}`, kind: "forage", forage: `npc:${n.id}`, x: n.x, y: n.y + 10, r: 20, ax: n.x, ay: n.y + 10, label: `${n.name}에게 팔기` });
    for (const id of this.nodeIds) {
      const n = gatherNodeById(id);
      // 캐는 중인 지점은 안내를 띄우지 않는다
      if (n && this.gauge?.node !== id) items.push({ id: `forage:node:${id}`, kind: "forage", forage: `node:${id}`, x: n.x, y: n.y + 6, r: 14, ax: n.x, ay: n.y, label: NODE_LABEL[n.kind] });
    }
    this.d.setItems(items);
  }

  private setNodes(ids: string[]): void {
    this.nodeIds = ids.filter((id) => gatherNodeById(id));
    this.nodesWindow = nodeWindow(Date.now());
    const keep = new Set(this.nodeIds);
    const pl = this.d.player();
    const now = this.scene.time.now;
    let vanished = false;
    for (const [id, v] of this.nodes) {
      if (keep.has(id)) continue;
      destroyAura(v.aura);
      this.nodes.delete(id);
      const used = this.usedNode && this.usedNode.id === id && now - this.usedNode.at < 60_000;
      if (used) {
        // 캐서(곤충을 잡아서) 없어짐: 반짝이가 터지고 오그라든다
        gatheredFx(this.scene, v.node.x, v.node.y, v.node.kind, this.d.reduced);
        this.shrink(v.img);
      } else {
        // 창이 바뀌어 없어짐: 연기처럼 흩어진다
        vanishFx(this.scene, v.img, this.d.reduced);
        if (Math.hypot(v.node.x - pl.x, v.node.y - pl.y) < NODE_HEAR) vanished = true;
      }
    }
    let heard = false;
    for (const id of this.nodeIds) {
      if (this.nodes.has(id)) continue;
      const node = gatherNodeById(id)!;
      const img = this.scene.add.image(node.x, node.y + 2, FTEX.node(node.kind, 0)).setOrigin(0.5, 1).setDepth(node.y);
      if (!this.d.reduced) {
        img.setScale(0.2);
        this.scene.tweens.add({ targets: img, scale: 1, duration: 260, delay: this.nodesLoaded ? 120 : 0, ease: "Back.easeOut" });
      }
      // 새로 필 때: 빛 기둥·반짝이·먼지 (첫 목록도 빛 기둥은 보여 준다 — "저기 뭔가 있다")
      spawnFx(this.scene, node.x, node.y, node.kind, this.d.reduced);
      if (Math.hypot(node.x - pl.x, node.y - pl.y) < NODE_HEAR) heard = true;
      this.nodes.set(id, { node, img, aura: makeAura(this.scene, node.x, node.y, node.kind) });
    }
    if (this.nodesLoaded && heard) this.sfx.play("spawn", 0.7);
    if (vanished) this.sfx.play("vanish", 0.6);
    this.nodesLoaded = true;
    this.rebuildItems();
  }

  private shrink(img: Phaser.GameObjects.Image): void {
    if (this.d.reduced) img.destroy();
    else this.scene.tweens.add({ targets: img, alpha: 0, scaleY: 0.2, duration: 220, onComplete: () => img.destroy() });
  }

  /** E/탭: 낚시 자리·NPC·채집 지점 */
  use(o: Interactable): void {
    const key = o.forage ?? "";
    const i = key.indexOf(":");
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    const pl = this.d.player();
    const now = this.scene.time.now;
    if (kind === "fish") return this.sitAt(id);
    if (kind === "npc") {
      const npc = NPCS.find((n) => n.id === id);
      if (!npc) return;
      if (pl.sitting) pl.stand(now, null);
      pl.faceTo(npc.x, npc.y - 8, now);
      bridge.emit("forage:use", { kind: "npc", npc: npc.id });
      return;
    }
    if (kind === "node") {
      const n = gatherNodeById(id);
      if (!n || this.gauge) return;
      this.usedNode = { id: n.id, at: now };
      if (pl.sitting) pl.stand(now, null);
      pl.faceTo(n.x, n.y - 4, now);
      bridge.emit("forage:use", { kind: "node", node: n.id });
    }
  }

  private sitAt(id: string): void {
    const spot = fishingSpotById(id);
    if (!spot) return;
    const net = this.d.net();
    const judged = net.online && this.serverKnows;
    const owner = this.d.seats().get(spot.id);
    if (judged && owner !== undefined && owner !== net.mySid) {
      this.d.toast("누가 먼저 낚시하고 있어요");
      return;
    }
    const pl = this.d.player();
    const now = this.scene.time.now;
    pl.warp(spot.x, spot.y, now, null);
    pl.dir = spot.facing as DirId;
    pl.sit(null, now, null);
    this.fishing = spot;
    this.rodPhase = "idle";
    this.phaseAt = now;
    if (judged) net.sit(spot.id);
    this.rebuildItems();
    this.syncRods();
    bridge.emit("forage:use", { kind: "fish", spot: spot.id, water: spot.water });
  }

  /** 낚시 그만: 일어난다 (서버 좌석은 다음 MOVE가 놓는다) */
  private leave(): void {
    if (!this.fishing) return;
    const pl = this.d.player();
    if (!this.boatFish && pl.sitting) pl.stand(this.scene.time.now, null);
    this.dropFishing();
  }

  /**
   * 배 위 낚시 시작 (WorldScene: 조각배에서 물가가 아닌 곳에서 E). at = BoatRide.fishingSpot().
   * 이미 낚시 중이면 아무것도 안 한다
   */
  fishFromBoat(at: { x: number; y: number; water: "river" | "lake" }): void {
    if (this.fishing) return;
    const pl = this.d.player();
    const now = this.scene.time.now;
    const id = boatFishingSpotId(at.water);
    this.fishing = { id, water: at.water, x: at.x, y: at.y, facing: sideOf(pl.dir) };
    this.boatFish = true;
    this.rodConfirmed = false;
    this.rodRetryAt = 0;
    this.rodPhase = "idle";
    this.phaseAt = now;
    this.syncRods();
    bridge.emit("forage:use", { kind: "fish", spot: id, water: at.water });
  }

  /** 배 위에서 낚시 중인지 (노를 저으면 WorldScene이 낚시를 그만두게 한다) */
  get fishingFromBoat(): boolean {
    return this.boatFish;
  }

  /** 배 위 낚시 그만 (노 젓기·배에서 내리기) */
  stopBoatFishing(): void {
    if (this.boatFish) this.dropFishing();
  }

  private dropFishing(): void {
    if (!this.fishing) return;
    if (this.boatFish) {
      this.boatFish = false;
      this.rodConfirmed = false;
      if (this.d.net().online) this.d.net().rod(false);
    }
    this.fishing = null;
    this.rodPhase = "idle";
    this.bang?.destroy();
    this.bang = null;
    this.rebuildItems();
    this.syncRods();
    bridge.emit("forage:left");
  }

  // ── 서버 좌석 ──

  onWelcome(m: WelcomeMsg): void {
    this.serverKnows = m.spots === true;
    // 배 위 낚싯대: 다시 붙었으면 다시 알리고(배 자리를 다시 잡은 뒤 서버가 받는다), 다른 사람 것은 입장 정보로 맞춘다
    this.rodConfirmed = false;
    this.rodRetryAt = 0;
    this.boatRods.clear();
    for (const p of m.peers) if (p.rod === true && p.sid !== m.sid) this.boatRods.add(p.sid);
    // 낚시 중에 다시 붙었다 (재연결·재배포): 자리가 비었으면 다시 잡고, 남이 앉았으면 일어난다
    const f = this.fishing;
    if (f && this.serverKnows) {
      const owner = m.seats[f.id];
      if (owner === undefined) this.d.net().sit(f.id);
      else if (owner !== m.sid) this.lost();
    }
    this.syncRods();
    this.rebuildItems();
  }

  seatChanged(seatId: string, sid: Sid | null): void {
    if (!seatId.startsWith("f_")) return;
    if (sid !== null && this.fishing?.id === seatId && sid !== this.d.net().mySid) this.lost();
    // 점유표(WorldScene.seats)는 이 호출 뒤에 바뀐다 → 다음 프레임에 다시 그린다
    this.checkAt = 0;
  }

  /** 서버 알림: 배 위 낚싯대를 드리움·거둠 (보낸 사람 포함 모두) */
  onRod(sid: Sid, on: boolean): void {
    const net = this.d.net();
    if (sid === net.mySid) {
      if (on && !this.boatFish) net.rod(false); // 이미 그만뒀다 (늦게 온 확인)
      // 서버가 거뒀다 (배 자리를 놓쳤다 등) → 확인을 기다리며 다시 보낸다. 진짜로 배에서 내렸으면 update가 낚시를 그만둔다
      this.rodConfirmed = on && this.boatFish;
      return;
    }
    if (on) this.boatRods.add(sid);
    else this.boatRods.delete(sid);
    this.checkAt = 0;
  }

  /** 늦게 들어왔거나 다시 맞출 때: 입장 정보의 rod */
  applyPeer(p: Pick<PeerInfo, "sid" | "rod">): void {
    if (p.rod === true) this.boatRods.add(p.sid);
    else this.boatRods.delete(p.sid);
    this.checkAt = 0;
  }

  /** 내 낚시 자리 요청이 거절됐으면 true (처리함) */
  seatDenied(seatId: string): boolean {
    if (this.fishing?.id !== seatId) return false;
    this.lost();
    return true;
  }

  private lost(): void {
    const pl = this.d.player();
    if (pl.sitting) pl.stand(this.scene.time.now, null);
    this.d.toast("누가 먼저 낚시하고 있어요");
    this.dropFishing();
  }

  // ── 낚싯대 ──

  private setRod(phase: ForageRodPhase, tension: number): void {
    const now = this.scene.time.now;
    if (phase !== this.rodPhase) {
      this.rodPhase = phase;
      this.phaseAt = now;
      const pl = this.d.player();
      switch (phase) {
        case "cast":
          this.sfx.play("cast", 0.8);
          this.scene.time.delayedCall(380, () => {
            if (this.rodPhase === "cast" || this.rodPhase === "wait") {
              this.sfx.play("plop", 0.7);
              this.splashAt(this.bobberHome());
            }
          });
          break;
        case "bite":
          this.sfx.play("bite", 0.9);
          this.bang?.destroy();
          this.bang = this.scene.add.image(pl.x, pl.y - 28, FTEX.bang).setOrigin(0.5, 1).setDepth(DEPTH.bubble);
          if (!this.d.reduced) this.scene.tweens.add({ targets: this.bang, y: pl.y - 31, duration: 120, yoyo: true, repeat: 2 });
          this.splashAt(this.bobberHome());
          break;
        case "reel":
          this.bang?.destroy();
          this.bang = null;
          break;
        case "catch":
          this.sfx.play("catch", 0.8);
          this.splashAt(this.bobberHome(0.3));
          break;
        case "snap":
          this.sfx.play("snap", 0.7);
          break;
        case "escape":
          this.sfx.play("miss", 0.7);
          this.splashAt(this.bobberHome());
          break;
        default:
          this.bang?.destroy();
          this.bang = null;
      }
    }
    this.tension = Math.max(0, Math.min(1, tension));
  }

  private bobberHome(pull = 0): { x: number; y: number } {
    const f = this.fishing;
    if (!f) return { x: 0, y: 0 };
    if (this.boatFish) {
      const pl = this.d.player();
      f.x = pl.x;
      f.y = pl.y;
    }
    const [dx, dy] = STEP[f.facing];
    const dist = CAST_DIST * (1 - pull);
    return { x: f.x + dx * dist, y: f.y + dy * dist - (dy === 0 ? 2 : 0) };
  }

  /** 물에 빠진 사냥 장비 아이콘 (사냥터 장비 그림을 그대로) */
  private gearIconTexture(id: string): string | null {
    const g = gearById(id);
    if (!g) return null;
    const key = `forage-gear-${id}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, iconCanvas(g.art));
    return key;
  }

  /** 반짝 (물에 빠진 장비를 건졌을 때) */
  private sparkleAt(x: number, y: number): void {
    this.sfx.play("catch", 0.9);
    if (this.d.reduced) return;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const dot = this.scene.add.rectangle(x, y, 2, 2, i % 2 ? 0xffe39a : 0xffffff).setDepth(DEPTH.bubble + 1);
      this.scene.tweens.add({ targets: dot, x: x + Math.cos(a) * 14, y: y + Math.sin(a) * 10, alpha: 0, duration: 700, ease: "Quad.easeOut", onComplete: () => dot.destroy() });
    }
  }

  private splashAt(p: { x: number; y: number }): void {
    if (this.d.reduced) return;
    for (let i = 0; i < 5; i++) {
      const dot = this.scene.add.rectangle(p.x, p.y, 1, 1, 0xd8f0ff).setDepth(p.y + 2);
      const a = (Math.PI * (i + 0.5)) / 5;
      this.scene.tweens.add({ targets: dot, x: p.x + Math.cos(a) * 6, y: p.y - Math.sin(a) * 5, alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => dot.destroy() });
    }
  }

  /** 점유표 → 낚싯대 목록 (내 것 + 다른 사람 것) */
  private syncRods(): void {
    const want = new Map<string, boolean>();
    if (this.fishing) want.set(this.fishing.id, true);
    if (this.d.net().online) {
      const me = this.d.net().mySid;
      for (const [id, sid] of this.d.seats()) if (id.startsWith("f_") && sid !== me && fishingSpotById(id)) want.set(id, false);
      // 배 위에서 낚는 다른 사람 (지금 배에 타 있고 보이는 사람만)
      const remotes = this.d.remotes();
      for (const sid of [...this.boatRods]) {
        const r = remotes.get(sid);
        if (!r) this.boatRods.delete(sid);
        else if (sid !== me && r.stateId === STATE.boat && !r.away) want.set(`boat@${sid}`, false);
      }
    }
    for (const [id, r] of this.rods) {
      if (want.get(id) === r.mine) continue;
      r.g.destroy();
      r.bob.destroy();
      this.rods.delete(id);
    }
    for (const [id, mine] of want) {
      if (this.rods.has(id)) continue;
      const bob = this.scene.add.image(0, 0, FTEX.bobber).setOrigin(0.5, 1).setVisible(false);
      if (mine && this.boatFish && this.fishing) {
        // 내 배 위 낚싯대: 낚시 자리(가상)를 매 프레임 내 위치로 옮긴다
        const g = this.scene.add.graphics();
        this.rods.set(id, { g, bob, spot: this.fishing, mine, follow: () => this.myBoatPose() });
        continue;
      }
      if (id.startsWith("boat@")) {
        const sid = Number(id.slice(5));
        const g = this.scene.add.graphics();
        const spot: FishingSpot = { id, water: "lake", x: 0, y: 0, facing: DIR.right };
        this.rods.set(id, { g, bob, spot, mine, follow: () => this.remoteBoatPose(sid) });
        continue;
      }
      const spot = fishingSpotById(id)!;
      const g = this.scene.add.graphics().setDepth(spot.y + (spot.facing === DIR.up ? -1 : 1));
      this.rods.set(id, { g, bob, spot, mine });
    }
  }

  private myBoatPose(): { x: number; y: number; facing: DirId } | null {
    const pl = this.d.player();
    return pl.inBoat ? { x: pl.x, y: pl.y, facing: sideOf(pl.dir) } : null;
  }

  private remoteBoatPose(sid: Sid): { x: number; y: number; facing: DirId } | null {
    const r = this.d.remotes().get(sid);
    if (!r || r.stateId !== STATE.boat || r.away) return null;
    const at = r.posOverride ?? r;
    return { x: at.x, y: at.y, facing: sideOf(r.view.dir) };
  }

  private drawRod(r: Rod, now: number): void {
    const { spot, g, bob } = r;
    if (r.follow) {
      const at = r.follow();
      if (!at) {
        g.clear();
        bob.setVisible(false);
        return;
      }
      spot.x = Math.round(at.x);
      spot.y = Math.round(at.y);
      spot.facing = at.facing;
      g.setDepth(spot.y + 2); // 배 앞 그림(y + 1.5) 위
    }
    const [dx, dy] = STEP[spot.facing];
    // 손 → 낚싯대 끝
    const hx = spot.x + dx * 3 + (dy !== 0 ? 4 : 0);
    const hy = spot.y - 7;
    const tipX = hx + dx * 9 + (dy !== 0 ? 2 : 0);
    const tipY = hy - 9 + dy * 4;
    const phase = r.mine ? this.rodPhase : "wait";
    const t = (now - (r.mine ? this.phaseAt : 0)) / 1000;
    g.clear();
    g.lineStyle(1, 0x6a4a2a, 1);
    g.lineBetween(hx, hy, tipX, tipY);
    g.lineStyle(1, 0x3a2a1a, 1);
    g.lineBetween(hx, hy, hx + dx * 2, hy - 2);
    if (phase === "idle" || phase === "snap") {
      bob.setVisible(false);
      if (phase === "idle") {
        g.lineStyle(1, 0xd8e0e8, 0.7);
        g.lineBetween(tipX, tipY, tipX + dx, tipY + 6);
      }
      return;
    }
    const home = { x: spot.x + dx * CAST_DIST, y: spot.y + dy * CAST_DIST - (dy === 0 ? 2 : 0) };
    let bx = home.x;
    let by = home.y;
    let sink = 0;
    if (phase === "cast") {
      const k = Math.min(1, t / 0.38);
      bx = tipX + (home.x - tipX) * k;
      by = tipY + (home.y - tipY) * k - Math.sin(k * Math.PI) * 14;
    } else if (phase === "wait") {
      by += Math.sin(now / 420 + spot.x) * 0.6;
    } else if (phase === "nibble") {
      sink = Math.sin(t * 18) > 0.6 ? 1 : 0;
    } else if (phase === "bite") {
      sink = 2;
      bx += Math.sin(t * 40) * 1.2;
    } else if (phase === "reel") {
      const pull = Math.min(0.85, this.tension * 0.3 + Math.min(1, t / 12) * 0.5);
      bx = home.x - dx * CAST_DIST * pull + Math.sin(t * 30) * this.tension * 1.5;
      by = home.y - dy * CAST_DIST * pull;
      sink = 1;
    } else if (phase === "catch" || phase === "escape") {
      const k = Math.min(1, t / 0.4);
      bx = home.x + (tipX - home.x) * k;
      by = home.y + (tipY - home.y) * k - Math.sin(k * Math.PI) * 10;
      if (k >= 1) bob.setVisible(false);
    }
    // 줄: 기다릴 땐 살짝 늘어지고, 감을 땐 팽팽
    const taut = phase === "reel" || phase === "bite";
    g.lineStyle(1, taut && this.tension > 0.75 ? 0xffb0a0 : 0xd8e0e8, 0.85);
    if (taut) g.lineBetween(tipX, tipY, bx, by - 3 + sink);
    else {
      const midX = (tipX + bx) / 2;
      const midY = Math.max(tipY, by) + 3;
      const c = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(tipX, tipY), new Phaser.Math.Vector2(midX, midY), new Phaser.Math.Vector2(bx, by - 3));
      c.draw(g, 8);
    }
    if (phase !== "catch" && phase !== "escape") bob.setVisible(true);
    bob.setPosition(Math.round(bx), Math.round(by) + sink).setDepth(by + 1).setCrop(0, 0, 5, 6 - sink * 2);
  }

  // ── 채집 게이지 ──

  private startGauge(ms: number, kind: string, node: string): void {
    this.gauge?.g.destroy();
    const g = this.scene.add.graphics().setDepth(DEPTH.bubble);
    this.gauge = { g, start: this.scene.time.now, ms, kind, node, tickAt: 0 };
    this.rebuildItems();
  }

  private endGauge(ok: boolean, node: string): void {
    const ga = this.gauge;
    if (ga) {
      ga.g.destroy();
      this.gauge = null;
    }
    if (!ok) return this.rebuildItems();
    const v = this.nodes.get(node);
    if (!v) return;
    this.nodes.delete(node);
    this.nodeIds = this.nodeIds.filter((x) => x !== node);
    this.rebuildItems();
    // 캐서 없어짐: 반짝이가 터지고 오그라든다
    destroyAura(v.aura);
    gatheredFx(this.scene, v.node.x, v.node.y, v.node.kind, this.d.reduced);
    this.sfx.play("gathered", 0.6);
    this.shrink(v.img);
  }

  private drawGauge(now: number): void {
    const ga = this.gauge;
    if (!ga) return;
    const pl = this.d.player();
    const k = Math.min(1, (now - ga.start) / ga.ms);
    const w = 22;
    const x = Math.round(pl.x - w / 2);
    const y = Math.round(pl.y - 30);
    ga.g.clear();
    ga.g.fillStyle(0x16121a, 0.85).fillRect(x - 1, y - 1, w + 2, 5);
    ga.g.fillStyle(0x3a3a46, 1).fillRect(x, y, w, 3);
    const c = ga.kind === "ore" ? 0x9ad0ff : ga.kind === "dig" ? 0xe8b06a : 0x8ae070;
    ga.g.fillStyle(c, 1).fillRect(x, y, Math.round(w * k), 3);
    // 일하는 소리와 흙·풀 조각
    if (now >= ga.tickAt && k < 1) {
      ga.tickAt = now + (ga.kind === "ore" ? 620 : ga.kind === "dig" ? 700 : 480);
      this.sfx.play(ga.kind === "ore" ? "ore" : ga.kind === "dig" ? "dig" : "herb", 0.55);
      const n = this.nodes.get(ga.node);
      if (n && !this.d.reduced) {
        const col = ga.kind === "ore" ? 0xb0b4bc : ga.kind === "dig" ? 0x8a5a32 : 0x6ab040;
        for (let i = 0; i < 3; i++) {
          const dot = this.scene.add.rectangle(n.node.x, n.node.y - 3, 1, 1, col).setDepth(n.node.y + 1);
          this.scene.tweens.add({ targets: dot, x: n.node.x + (i - 1) * 5, y: n.node.y - 8 - i * 2, alpha: 0, duration: 340, ease: "Quad.easeOut", onComplete: () => dot.destroy() });
        }
        if (!this.d.reduced) this.scene.tweens.add({ targets: n.img, scaleX: 1.12, duration: 70, yoyo: true });
      }
    }
  }

  /** 잡은 것을 머리 위로 띄운다 */
  private pop(itemId: string, sparkle = false): void {
    const key = ensureIconTexture(this.scene, itemId) ?? this.gearIconTexture(itemId);
    if (!key) return;
    const pl = this.d.player();
    if (sparkle) this.sparkleAt(pl.x, pl.y - 26);
    const img = this.scene.add.image(pl.x, pl.y - 18, key).setOrigin(0.5, 1).setDepth(DEPTH.bubble);
    if (this.d.reduced) {
      this.scene.time.delayedCall(1200, () => img.destroy());
      return;
    }
    img.setScale(0.4);
    this.scene.tweens.add({ targets: img, y: pl.y - 30, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: img, alpha: 0, y: pl.y - 38, delay: 1300, duration: 500, onComplete: () => img.destroy() });
  }

  // ── 매 프레임 ──

  update(_dt: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    if (this.destroyed) return;
    const now = this.scene.time.now;
    if (labelScale !== this.labelScale) {
      this.labelScale = labelScale;
      for (const n of this.npcImgs) {
        n.label.setScale(labelScale);
        n.title.setScale(labelScale);
      }
    }
    // 2프레임 흔들림 (덤불·NPC 자락)
    if (now >= this.frameAt) {
      this.frameAt = now + 520;
      this.frame ^= 1;
      if (!this.d.reduced) {
        for (const n of this.npcImgs) n.img.setTexture(FTEX.npc(n.npc.id, this.frame));
        for (const v of this.nodes.values()) v.img.setTexture(FTEX.node(v.node.kind, this.frame));
      }
    }
    // 가끔: 밤낮이 바뀌면 곤충 수풀 그림, 점유표가 바뀌면 낚싯대·안내
    if (now >= this.checkAt) {
      this.checkAt = now + 600;
      const night = this.isNight();
      if (night !== this.night) {
        this.night = night;
        ensureForageTextures(this.scene, night);
        for (const v of this.nodes.values()) v.img.setTexture(FTEX.node(v.node.kind, this.frame));
      }
      this.syncRods();
      this.rebuildItems();
    }
    // 낚시 자리에서 벗어났다 (순간이동·채널 이동·다른 자리) → 낚시 창을 닫는다
    const f = this.fishing;
    if (f) {
      const pl = this.d.player();
      if (this.boatFish) {
        // 배 위 낚시: 배에서 내렸으면 그만, 아니면 서버가 확인할 때까지 낚싯대 드리우기를 알린다
        if (!pl.inBoat) this.dropFishing();
        else {
          f.x = pl.x;
          f.y = pl.y;
          const net = this.d.net();
          if (!this.rodConfirmed && net.online && now >= this.rodRetryAt) {
            this.rodRetryAt = now + ROD_RETRY_MS;
            net.rod(true);
          }
        }
      } else if (pl.state !== "sitGround" || Math.hypot(pl.x - f.x, pl.y - f.y) > 6) this.dropFishing();
    }
    if (this.rodPhase === "reel" && now >= this.reelTickAt) {
      this.reelTickAt = now + 110 - this.tension * 40;
      this.sfx.play("reel", 0.5);
    }
    for (const r of this.rods.values()) this.drawRod(r, now);
    this.updateNodeAuras(now);
    const net = this.d.net();
    this.zone.update(now, view, labelScale, net.online ? this.d.seats() : NO_SEATS, net.online ? net.mySid : null, this.fishing?.id ?? null, this.d.player());
    if (this.bang && this.fishing) this.bang.setPosition(this.d.player().x, this.bang.y);
    this.drawGauge(now);
  }

  /** 피어 있는 지점의 은은한 빛·반짝 별 (가까우면 더 밝게), 창이 끝나 가면 깜빡임 */
  private updateNodeAuras(now: number): void {
    if (this.nodes.size === 0) return;
    const wall = Date.now();
    const w = nodeWindow(wall);
    // 창이 이미 바뀌었는데 새 목록이 아직이면 계속 깜빡인다 (곧 사라진다)
    const remain = w !== this.nodesWindow ? 0 : windowEndsAt(w) - wall;
    const blink = remain < NODE_BLINK_MS ? 1 - remain / NODE_BLINK_MS : 0;
    const pl = this.d.player();
    for (const v of this.nodes.values()) {
      if (this.gauge?.node === v.node.id) continue;
      const d = Math.hypot(v.node.x - pl.x, v.node.y - pl.y);
      const near = d < 64 ? 1 - d / 64 : 0;
      const a = updateAura(v.aura, now, near, blink, this.d.reduced);
      if (v.img.alpha !== a && !this.scene.tweens.isTweening(v.img)) v.img.setAlpha(a);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.offs.splice(0)) off();
    if (this.fishing) bridge.emit("forage:left");
    this.sfx.destroy();
  }
}

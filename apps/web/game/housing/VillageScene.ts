import * as Phaser from "phaser";
import { DIR } from "@tomb/protocol";
import { VILLAGE_COLS } from "@/lib/housing/catalog";
import type { VillageHouse, VillageResponse } from "@/lib/housing/types";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { Player, type SeatRequester } from "../entities/Player";
import type { InputHub } from "../input/InputHub";
import type { KeyAction } from "../input/Keyboard";
import { emoSlotOfKey } from "../logic/emoBoard";
import type { MoveInput } from "../logic/movement";
import { RoomPresence } from "../net/RoomPresence";
import type { NetPose } from "../net/sendThrottle";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { Lighting, playerLightRadius } from "../world/Lighting";
import type { LightSpot } from "../world/WorldMap";
import { FACADE_H, FACADE_W, yardGrid } from "./art";
import { drawEmptyLot, drawHouseLot } from "./worldLots";

// 분양 마을 씬. 분양 사무소에서 들어오는 밤 골목 마을이다.
//  - 번지(필지)마다 그 집의 외관이 서 있고, 지붕 위에 문패(집 이름 · 주인 · 호칭 · 꾸밈 점수)가 뜬다.
//  - 빈 필지에는 "분양 중" 팻말. 다가가 E → 그 번지로 분양 문의(village:lot).
//  - 집 문 앞에서 E(또는 집을 탭) → village:door → UI가 집 정보를 받아 house:enter로 들어간다.
//  - 아래 마을 입구로 걸어 나가면 월드(분양 사무소 앞)로 돌아간다.
// 필지는 한 줄에 VILLAGE_COLS개, 집이 늘면 아래로 한 줄씩 늘어난다 (서버가 lots로 알려 준다).

export type VillageSceneData = {
  village: VillageResponse;
  myHouseId: string | null;
  atlas: GlyphAtlas;
  input: InputHub;
  color: string;
  name: string;
  look: readonly string[];
  /** 내 몸 모양 (AVATAR_BODIES id). 없으면 hood */
  body?: string;
  reduced: boolean;
  /** 이 번지 문 앞에서 시작 (집에서 나왔을 때·"내 집으로") */
  spawnLot?: number | null;
  /** 이 자리에서 시작 (마을을 다시 그릴 때 제자리 유지) */
  spawnAt?: { x: number; y: number };
  onExit(): void;
};

const T = 16;
const LOT_W = FACADE_W;
const LOT_H = FACADE_H + 8;
const GAP = 16;
const MARGIN_X = 48;
const TOP = 64;
const STREET = 48;
const BOTTOM = 64;
const NO_SEATS: SeatRequester = { sit: () => undefined, stand: () => undefined };
const NEAR = 22;

type Spot = { kind: "door"; house: VillageHouse; x: number; y: number } | { kind: "lot"; lot: number; x: number; y: number };

export const lotOrigin = (lot: number) => {
  const i = lot - 1;
  const col = i % VILLAGE_COLS;
  const row = Math.floor(i / VILLAGE_COLS);
  return { x: MARGIN_X + col * (LOT_W + GAP), y: TOP + row * (LOT_H + STREET) };
};

export class VillageScene extends Phaser.Scene {
  private d!: VillageSceneData;
  private W = 0;
  private H = 0;
  private player!: Player;
  private atmos!: Atmosphere;
  private lighting!: Lighting;
  private playerGlow!: Phaser.GameObjects.Image;
  private bodies!: Phaser.Physics.Arcade.StaticGroup;
  private glow: { x: number; y: number; r: number }[] = [];
  private spots: Spot[] = [];
  private prompt!: Phaser.GameObjects.BitmapText;
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private near: Spot | null = null;
  private readonly move: MoveInput = { ax: 0, ay: 0, run: false };
  /** 같은 방(마을·이 집) 사람들 */
  private presence: RoomPresence | null = null;
  private readonly pose: NetPose = { x: 0, y: 0, state: 0, dir: 0 };
  private presenceAt = 0;
  private presenceKey = "";
  private readonly view = new Phaser.Geom.Rectangle();
  private exiting = false;
  private armed = false;
  private onTap = (e: PointerEvent) => this.handleTap(e);

  constructor() {
    super("village");
  }

  init(data: VillageSceneData): void {
    this.d = data;
    this.exiting = false;
    this.armed = false;
    this.glow = [];
    this.spots = [];
    this.labels = [];
    this.near = null;
  }

  create(): void {
    const { village, atlas } = this.d;
    const rows = Math.max(1, Math.ceil(village.lots / VILLAGE_COLS));
    this.W = MARGIN_X * 2 + VILLAGE_COLS * LOT_W + (VILLAGE_COLS - 1) * GAP;
    this.H = TOP + rows * (LOT_H + STREET) + BOTTOM;
    this.cameras.main.setBackgroundColor("#0e100c");
    this.bodies = this.physics.add.staticGroup();

    this.drawGround(rows);
    this.drawStreetProps(rows);
    const byLot = new Map(village.houses.map((h) => [h.lot, h]));
    const taken = new Set(village.taken);
    for (let lot = 1; lot <= village.lots; lot++) {
      const h = byLot.get(lot);
      if (h) this.drawHouse(h);
      else this.drawEmptyLot(lot, taken.has(lot));
    }
    // 마을 이름
    const title = "분양 마을";
    atlas.ensure(title);
    this.labels.push(this.add.bitmapText(this.W / 2, TOP - 30, FONT_KEY, title, FONT_PX).setOrigin(0.5, 1).setTint(0xe0c36a).setDepth(DEPTH.labels));

    atlas.ensure("E · 들어가기 분양 문의");
    this.prompt = this.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xffe39a).setDepth(DEPTH.labels + 2).setVisible(false);

    // 시작 위치: 지정 번지 문 앞 또는 마을 입구
    const spawnSpot = this.d.spawnLot ? this.spots.find((s) => (s.kind === "door" ? s.house.lot : s.lot) === this.d.spawnLot) : undefined;
    const sx = this.d.spawnAt?.x ?? spawnSpot?.x ?? this.W / 2;
    const sy = this.d.spawnAt?.y ?? (spawnSpot ? spawnSpot.y + 6 : this.H - 28);
    this.player = new Player(this, atlas, sx, sy, this.d.color, this.d.name, this.d.body);
    this.player.view.setLook(this.d.look);
    this.presenceKey = "";
    this.presence = new RoomPresence(this, {
      atlas: this.d.atlas,
      room: "village",
      me: this.player.view,
      expressions: true,
      getPose: () => this.player.netPose(this.pose),
    });
    this.player.dir = spawnSpot ? DIR.down : DIR.up;
    this.physics.add.collider(this.player.sprite, this.bodies);
    this.physics.world.setBounds(8, 8, this.W - 16, this.H - 8);

    this.atmos = new Atmosphere(this, this.d.reduced, window.location.search);
    this.lighting = new Lighting(this);
    this.playerGlow = this.add.image(sx, sy, "fx-glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a8).setDepth(DEPTH.lights);
    const spots: LightSpot[] = this.glow.map((l) => ({ x: l.x, y: l.y, scale: l.r / 40, tint: 0xffc070, base: 0.5 }));
    this.atmos.setStaticLights(spots);

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.fitCamera();
    cam.startFollow(this.player.sprite, true, 0.15, 0.15, 0, 10);
    cam.centerOn(sx, sy);

    this.d.input.setHandler((a) => this.onAction(a));
    this.game.canvas.addEventListener("pointerup", this.onTap);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener("pointerup", this.onTap);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.atmos.destroy();
      this.lighting.destroy();
      this.presence?.destroy();
      this.presence = null;
      this.player.destroy();
    });
  }

  // ── 그리기 ──

  private drawGround(rows: number): void {
    const key = `village-ground-${rows}`;
    if (!this.textures.exists(key)) {
      const c = document.createElement("canvas");
      c.width = this.W;
      c.height = this.H;
      const ctx = c.getContext("2d")!;
      const grass = [0, 1, 2, 3].map((v) => yardGrid(v).toCanvas());
      for (let y = 0; y * T < this.H; y++) for (let x = 0; x * T < this.W; x++) ctx.drawImage(grass[(x * 7 + y * 3) % 4], x * T, y * T);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, this.W, this.H);
      // 골목(가로) · 샛길(세로) · 입구
      const cobble = (x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = "#3a3630";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#46413a";
        for (let j = y + 2; j < y + h - 2; j += 6) for (let i = x + ((j / 6) % 2) * 5; i < x + w - 4; i += 10) ctx.fillRect(i, j, 7, 4);
      };
      for (let r = 0; r < rows; r++) cobble(16, TOP + r * (LOT_H + STREET) + LOT_H + 8, this.W - 32, STREET - 16);
      for (let c2 = 1; c2 < VILLAGE_COLS; c2++) {
        const x = MARGIN_X + c2 * (LOT_W + GAP) - GAP;
        cobble(x, TOP - 8, GAP, this.H - TOP);
      }
      cobble(this.W / 2 - 16, this.H - BOTTOM, 32, BOTTOM);
      // 필지 마당
      for (let r = 0; r < rows; r++)
        for (let c2 = 0; c2 < VILLAGE_COLS; c2++) {
          const o = lotOrigin(r * VILLAGE_COLS + c2 + 1);
          ctx.fillStyle = "rgba(120,150,100,0.10)";
          ctx.fillRect(o.x + 2, o.y + 2, LOT_W - 4, LOT_H - 4);
        }
      this.textures.addCanvas(key, c);
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.ground);
  }

  private drawStreetProps(rows: number): void {
    // 가로등: 골목마다 샛길 어귀에
    for (let r = 0; r < rows; r++) {
      const y = TOP + r * (LOT_H + STREET) + LOT_H + 10;
      for (let c2 = 0; c2 <= VILLAGE_COLS; c2++) {
        const x = c2 === 0 ? 24 : c2 === VILLAGE_COLS ? this.W - 24 : MARGIN_X + c2 * (LOT_W + GAP) - GAP / 2;
        this.lamp(x, y);
      }
    }
    this.lamp(this.W / 2 - 24, this.H - 20);
    this.lamp(this.W / 2 + 24, this.H - 20);
    // 양옆 나무
    for (let y = TOP; y < this.H - 32; y += 56) {
      this.tree(14, y + ((y / 56) % 2) * 20);
      this.tree(this.W - 14, y + 28 - ((y / 56) % 2) * 20);
    }
  }

  private lamp(x: number, y: number): void {
    this.add.rectangle(x, y, 2, 18, 0x2a2c30).setOrigin(0.5, 1).setDepth(y);
    this.add.rectangle(x, y - 19, 6, 5, 0xffd080).setOrigin(0.5, 1).setDepth(y + 0.1).setStrokeStyle(1, 0x1a1612);
    this.glow.push({ x, y: y - 22, r: 30 });
  }

  private tree(x: number, y: number): void {
    this.add.rectangle(x, y, 4, 10, 0x4a3424).setOrigin(0.5, 1).setDepth(y);
    this.add.ellipse(x, y - 14, 22, 20, 0x2e4a30).setDepth(y + 0.1);
    this.add.ellipse(x - 3, y - 17, 12, 10, 0x3c5e3a).setDepth(y + 0.2);
  }

  private drawHouse(h: VillageHouse): void {
    const o = lotOrigin(h.lot);
    const spot = { lot: h.lot, x: o.x, y: o.y + LOT_H - FACADE_H };
    const d = drawHouseLot(this, this.d.atlas, spot, { w: FACADE_W, h: FACADE_H }, h, h.id === this.d.myHouseId, { reduced: this.d.reduced, labelDepth: DEPTH.labels });
    // 충돌: 몸체 (문 앞은 막지 않게 아래 4px 남김)
    const b = d.body!;
    const z = this.add.zone(b.x + b.w / 2, b.y + b.h / 2 - 2, b.w, b.h - 4);
    z.removeFromDisplayList();
    this.bodies.add(z);
    for (const l of d.lights) this.glow.push({ x: l.x, y: l.y, r: l.scale * 40 });
    this.labels.push(...d.labels);
    this.spots.push({ kind: "door", house: h, x: d.door!.x, y: d.door!.y });
  }

  private drawEmptyLot(lot: number, taken: boolean): void {
    const o = lotOrigin(lot);
    const spot = { lot, x: o.x, y: o.y + LOT_H - FACADE_H };
    const d = drawEmptyLot(this, this.d.atlas, spot, { w: FACADE_W, h: FACADE_H }, taken, { reduced: this.d.reduced, labelDepth: DEPTH.labels });
    this.labels.push(...d.labels);
    if (!taken) this.spots.push({ kind: "lot", lot, x: spot.x + FACADE_W / 2, y: spot.y + FACADE_H - 16 });
  }

  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setZoom(cam.width < 700 ? 2 : 2.5);
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    cam.setBounds(vw > this.W ? (this.W - vw) / 2 : 0, vh > this.H ? (this.H - vh) / 2 : 0, Math.max(this.W, vw), Math.max(this.H, vh));
  }

  private onResize(): void {
    this.fitCamera();
    this.atmos.resize();
    this.lighting.resize();
  }

  // ── 플레이 ──

  private nearest(): Spot | null {
    let best: Spot | null = null;
    let bd = NEAR;
    for (const s of this.spots) {
      const d = Math.hypot(this.player.x - s.x, this.player.y - s.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private use(s: Spot): void {
    this.player.faceTo(s.x, s.y - 10, this.time.now);
    if (s.kind === "door") bridge.emit("village:door", { houseId: s.house.id });
    else bridge.emit("village:lot", { lot: s.lot });
  }

  private onAction(a: KeyAction): void {
    if (this.exiting) return;
    if (a === "interact") {
      const s = this.nearest();
      if (s) this.use(s);
      return;
    }
    // 1·2 손 흔들기·환호, 3~9 이모티콘 판 (월드와 같은 키)
    if (a === "wave" || a === "cheer") return this.presence?.act(a);
    if (a.startsWith("emo")) {
      const slot = emoSlotOfKey(Number(a.slice(3)));
      if (slot?.kind === "emo") this.presence?.emo(slot.id);
      return;
    }
    if (a === "jump") this.player.jump(this.time.now, NO_SEATS);
    else if (a === "sit") {
      if (this.player.sitting) this.player.stand(this.time.now, NO_SEATS);
      else this.player.sit(null, this.time.now, NO_SEATS);
    }
  }

  private handleTap(e: PointerEvent): void {
    if (this.exiting || this.d.input.isBlocked) return;
    const r = this.game.canvas.getBoundingClientRect();
    const p = this.cameras.main.getWorldPoint(
      ((e.clientX - r.left) * this.game.canvas.width) / Math.max(1, r.width),
      ((e.clientY - r.top) * this.game.canvas.height) / Math.max(1, r.height),
    );
    // 집(몸체·지붕)이나 팻말을 탭하면 그 집으로
    for (const s of this.spots) {
      const hit = s.kind === "door" ? Math.abs(p.x - s.x) < 34 && p.y < s.y && p.y > s.y - 70 : Math.abs(p.x - s.x) < 14 && p.y < s.y && p.y > s.y - 30;
      if (hit) return this.use(s);
    }
  }

  update(time: number, delta: number): void {
    if (this.exiting) return;
    const input = this.d.input;
    input.read(this.move);
    if (input.isBlocked) this.move.ax = this.move.ay = 0;
    this.player.update(this.move, time, NO_SEATS);
    const cam = this.cameras.main;
    const s = 1 / cam.zoom;
    this.player.view.sync(time, s);
    if (this.presence) {
      const now = performance.now();
      this.presence.update(now, cam.worldView, s);
      // 함께 있는 사람 수·집주인 여부를 UI에 (바뀔 때만, 1초마다 확인)
      if (now >= this.presenceAt) {
        this.presenceAt = now + 1000;
        const st = this.presence.status;
        const ownerHere = false;
        const key = `${st.count}|${this.presence.client.online}|${ownerHere}`;
        if (key !== this.presenceKey) {
          this.presenceKey = key;
          bridge.emit("house:presence", { where: "village", count: st.count, online: this.presence.client.online, ownerHere });
        }
      }
    }
    for (const l of this.labels) l.setScale(s);

    const n = this.nearest();
    if (n !== this.near) {
      this.near = n;
      if (n) {
        const text = n.kind === "door" ? `E · ${n.house.name} 들어가기` : `E · ${n.lot}번지 분양 문의`;
        this.d.atlas.ensure(text);
        this.prompt.setText(text).setPosition(n.x, n.y - 30);
      }
    }
    this.prompt.setScale(s).setVisible(!!n);

    const view = cam.worldView;
    this.view.setTo(view.x, view.y, view.width, view.height);
    this.atmos.update(time, Math.min(delta, 100), this.view);
    const L = this.atmos.levels;
    const r = playerLightRadius(L.glow, this.player.view.lantern);
    this.playerGlow
      .setPosition(this.player.x, this.player.y - 9)
      .setScale((r * 1.6) / 64)
      .setAlpha((0.05 + 0.13 * L.glow) * Math.min(1, L.darkness * 3));
    this.lighting.begin(this.view, L.darkness, L.shade);
    if (L.darkness > 0.004) {
      this.lighting.add(this.player.x, this.player.y - 8, r, 0.92);
      for (const l of this.glow) this.lighting.add(l.x, l.y, l.r * 1.8, 0.8);
    }
    this.lighting.end();

    // 마을 입구 아래 끝으로 걸어 나가면 월드로
    if (this.player.y < this.H - 22) this.armed = true;
    if (this.armed && this.player.y > this.H - 12 && Math.abs(this.player.x - this.W / 2) < 24 && this.move.ay > 0) this.leave();
  }

  leave(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.d.input.setHandler(null);
    this.d.onExit();
  }

  /** 테스트·디버그용 */
  get debugState() {
    return { W: this.W, H: this.H, player: { x: this.player.x, y: this.player.y }, near: this.near ? (this.near.kind === "door" ? this.near.house.id : `lot:${this.near.lot}`) : null };
  }
}

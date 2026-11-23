import * as Phaser from "phaser";
import type { MapId } from "@tomb/protocol";
import { BUNGEO_VENDOR_DX, BUNGEO_VENDOR_DY, bungeoColliders, bungeoLastSpot, bungeoOpenSpot, bungeoTalks, type BungeoSpot, type BungeoTalk } from "@/lib/bungeo/cart";
import { addCanvasTexture } from "../assets/manifest";
import { CART_CX, CART_FOOT, CART_H, CART_W, cartGrid, cartSteamGrid, EMPTY_CX, EMPTY_FOOT, EMPTY_H, EMPTY_W, emptySpotGrid, VENDOR_H, VENDOR_W, vendorSheet } from "../sprites/bungeoCart";
import { Grid, makeCanvas } from "../sprites/pixel";
import { addTwinkle } from "./conceptLights";
import type { Lighting } from "./Lighting";

// 11/22 골목 붕어빵 수레 (이스터에그 한정 상점). 11/23 자리는 회차마다 lib/bungeo/cart bungeoSpotOf (마을·바닷가 — 캠핑장은 자리 데이터만 더하면 된다).
//  - 열린 밤(밤 10시~새벽 2시, 사흘에 한 번)이고 그 회차 자리가 이 맵이면 그 자리에 수레·붕어빵 장수·김·불빛·몸 충돌·말 걸기가 생긴다
//  - 닫힌 동안은 아무것도 없고, 가장 최근 회차 자리가 이 맵이면 거기 바닥에 바퀴 자국·식은 숯만 (말 걸기·충돌 없음)
//  - 지도·미니맵·길 안내 목록에는 넣지 않는다 (말 걸기는 setItems로 열린 동안만 — 마을 WorldMap.setCartItems · 바닷가·캠핑장 map.setCartItems)
//  - 시계 = 실시간 서버 시각. 개발 서버에서만 localStorage "tomb:dev:bungeoOffset"(ms)만큼 앞당겨 본다 (화면 확인용 — 운영 빌드는 무시)

const TEX = { cart: "bungeo-cart-stall", steam: "bungeo-cart-steam", empty: "bungeo-cart-empty", vendor: "bungeo-vendor", glow: "bungeo-cart-glow" } as const;
const VENDOR_DX = BUNGEO_VENDOR_DX;
const VENDOR_DY = BUNGEO_VENDOR_DY;
const BREATH_MS = 700;
const STEAM_MS = 900;

export type BungeoCartDeps = {
  scene: Phaser.Scene;
  /** 이 장면의 맵 (그 회차 자리가 이 맵일 때만 수레가 선다) */
  map: MapId;
  reduced: boolean;
  colliders: Phaser.Physics.Arcade.StaticGroup;
  /** 실시간 서버 시각 */
  clock: () => number;
  /** 열린 동안만 말 걸기 자리 (닫히면 빈 목록) */
  setItems: (items: BungeoTalk[]) => void;
};

function devOffset(): number {
  if (process.env.NODE_ENV === "production") return 0;
  try {
    const v = Number(window.localStorage.getItem("tomb:dev:bungeoOffset") ?? 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export class BungeoCartView {
  private readonly cart: Phaser.GameObjects.Image;
  private readonly steam: Phaser.GameObjects.Image;
  private readonly empty: Phaser.GameObjects.Image;
  private readonly vendor: Phaser.GameObjects.Image;
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  /** 전구·틀 불빛 (가산 겹 — 낮엔 은은히·밤엔 환히, conceptLights) */
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly lights: [number, number, number][];
  private open: boolean | null = null;
  /** 지금 그림이 서 있는 자리 (열린 회차 자리 · 닫혔으면 최근 회차 자리 — 이 맵이 아니면 null) */
  private spot: BungeoSpot | null = null;
  private checkAt = 0;
  private frame = -1;

  constructor(private readonly d: BungeoCartDeps) {
    const s = d.scene;
    const art = cartGrid();
    this.lights = art.lights;
    if (!s.textures.exists(TEX.cart)) addCanvasTexture(s, TEX.cart, { canvas: art.g.toCanvas() });
    if (!s.textures.exists(TEX.steam)) {
      const sheet = new Grid(CART_W * 2, CART_H);
      sheet.draw(cartSteamGrid(0), 0, 0);
      sheet.draw(cartSteamGrid(1), CART_W, 0);
      addCanvasTexture(s, TEX.steam, { canvas: sheet.toCanvas(), frameW: CART_W, frameH: CART_H });
    }
    if (!s.textures.exists(TEX.empty)) addCanvasTexture(s, TEX.empty, { canvas: emptySpotGrid().toCanvas() });
    if (!s.textures.exists(TEX.vendor)) addCanvasTexture(s, TEX.vendor, { canvas: vendorSheet().toCanvas(), frameW: VENDOR_W, frameH: VENDOR_H });
    const x = 0;
    const y = 0;
    // 바닥 자국은 땅 바로 위 (모든 것 뒤) — 자리는 place()가 옮긴다

    this.empty = s.add.image(x, y, TEX.empty).setOrigin(EMPTY_CX / EMPTY_W, EMPTY_FOOT / EMPTY_H).setDepth(y - 40).setVisible(false);
    this.cart = s.add.image(x, y, TEX.cart).setOrigin(CART_CX / CART_W, CART_FOOT / CART_H).setDepth(y).setVisible(false);
    this.steam = s.add.image(x, y, TEX.steam, 0).setOrigin(CART_CX / CART_W, CART_FOOT / CART_H).setDepth(y + 0.5).setAlpha(0.85).setVisible(false);
    const vx = x + VENDOR_DX;
    const vy = y + VENDOR_DY;
    this.vendor = s.add.image(vx, vy, TEX.vendor, 0).setOrigin(0.5, (VENDOR_H - 1) / VENDOR_H).setDepth(vy).setVisible(false);
    ensureGlow(s);
    const left = x - CART_CX;
    const top = y - CART_FOOT;
    this.glows.push(addTwinkle(s, TEX.glow, left + this.lights[0][0], top + this.lights[0][1], 0.5, 0.5, { reduced: d.reduced, alpha: 0.55 }).setVisible(false));
    this.glows.push(addTwinkle(s, TEX.glow, left + this.lights[1][0], top + this.lights[1][1], 0.5, 0.5, { reduced: d.reduced, phase: 1, alpha: 0.35 }).setScale(0.7).setVisible(false));
    for (const c of bungeoColliders({ x, y })) {
      const z = s.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
      s.physics.add.existing(z, true);
      (z.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      d.colliders.add(z);
      this.zones.push(z);
    }
  }

  /** 이 맵에 수레가 열려 있는지 (마지막 확인 값) */
  get isOpen(): boolean {
    return this.open === true;
  }

  /** 그림·충돌을 그 자리로 옮긴다 */
  private place(spot: BungeoSpot): void {
    const { x, y } = spot;
    this.empty.setPosition(x, y).setDepth(y - 40);
    this.cart.setPosition(x, y).setDepth(y);
    this.steam.setPosition(x, y).setDepth(y + 0.5);
    const vx = x + VENDOR_DX;
    const vy = y + VENDOR_DY;
    this.vendor.setPosition(vx, vy).setDepth(vy);
    const left = x - CART_CX;
    const top = y - CART_FOOT;
    this.glows.forEach((g, i) => g.setPosition(left + this.lights[i][0], top + this.lights[i][1]));
    bungeoColliders(spot).forEach((c, i) => {
      const z = this.zones[i];
      z.setPosition(c.x + c.w / 2, c.y + c.h / 2);
      (z.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    });
  }

  /** 지금 시각으로: 열린 회차 자리가 이 맵이면 수레, 아니면 최근 회차 자리 바퀴 자국(이 맵일 때만) */
  private sync(now: number): void {
    const live = bungeoOpenSpot(now);
    const open = !!live && live.map === this.d.map;
    const last = live ? null : bungeoLastSpot(now);
    const spot = open ? live : last && last.map === this.d.map ? last : null;
    if (open === this.open && spot === this.spot) return;
    this.open = open;
    this.spot = spot;
    if (spot) this.place(spot);
    this.cart.setVisible(open);
    this.steam.setVisible(open);
    this.vendor.setVisible(open);
    this.empty.setVisible(!open && !!spot);
    for (const g of this.glows) g.setVisible(open);
    for (const z of this.zones) (z.body as Phaser.Physics.Arcade.StaticBody).enable = open;
    this.d.setItems(open && spot ? bungeoTalks(spot) : []);
  }

  /** 매 프레임: 1초마다 열림 확인, 숨쉬기·김 */
  update(now: number): void {
    if (now >= this.checkAt) {
      this.checkAt = now + 1000;
      this.sync(this.d.clock() + devOffset());
    }
    if (!this.open || this.d.reduced) return;
    const f = Math.floor(now / BREATH_MS) % 2;
    if (f !== this.frame) {
      this.frame = f;
      this.vendor.setFrame(f);
    }
    this.steam.setFrame(Math.floor(now / STEAM_MS) % 2);
  }

  /** 밤 어둠에 빛 구멍: 수레 전구 · 틀 불빛 (은은히) */
  addLights(lit: Lighting): void {
    const sp = this.spot;
    if (!this.open || !sp) return;
    const left = sp.x - CART_CX;
    const top = sp.y - CART_FOOT;
    lit.add(left + this.lights[0][0], top + this.lights[0][1], 30, 0.7);
    lit.add(left + this.lights[1][0], top + this.lights[1][1], 16, 0.4);
    lit.add(sp.x + VENDOR_DX, sp.y + VENDOR_DY - 10, 18, 0.35);
  }

  destroy(): void {
    for (const o of [this.cart, this.steam, this.empty, this.vendor, ...this.glows, ...this.zones]) o.destroy();
    this.d.setItems([]);
  }
}

/** 따뜻한 둥근 빛 두 장 (반짝임 — conceptLights addTwinkle이 번갈아 보인다) */
function ensureGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.glow)) return;
  const R = 22;
  const { canvas, ctx } = makeCanvas(R * 4, R * 2);
  for (let f = 0; f < 2; f++) {
    const cx = f * R * 2 + R;
    const g = ctx.createRadialGradient(cx, R, 0, cx, R, R);
    g.addColorStop(0, `rgba(255,214,130,${f ? 0.62 : 0.7})`);
    g.addColorStop(0.35, "rgba(255,180,90,0.28)");
    g.addColorStop(1, "rgba(255,160,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(f * R * 2, 0, R * 2, R * 2);
  }
  addCanvasTexture(scene, TEX.glow, { canvas, frameW: R * 2, frameH: R * 2 });
}

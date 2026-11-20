import * as Phaser from "phaser";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { SEASON_SHOP_SUB, SEASON_SHOP_TITLE, type SeasonKind } from "@/lib/seasonShop/schedule";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import {
  FURNITURE_CRAFTER_H,
  FURNITURE_CRAFTER_W,
  FURNITURE_STALL_H,
  FURNITURE_STALL_W,
  furnitureCrafterLight,
  furnitureCrafterSheet,
  furnitureStall,
  furnitureStallGlowSheet,
  furnitureStallLights,
} from "../sprites/furnitureStall";
import { makeCanvas } from "../sprites/pixel";
import {
  SEASON_PEDDLER_H,
  SEASON_PEDDLER_W,
  SEASON_STALL_H,
  SEASON_STALL_W,
  seasonPeddlerLight,
  seasonPeddlerSheet,
  seasonStall,
  seasonStallGlowSheet,
  seasonStallLights,
} from "../sprites/seasonStall";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { addTwinkle } from "./conceptLights";
import type { Lighting } from "./Lighting";
import { stallSite, type StallSite } from "./seasonStallLayout";
import type { SnowNpc } from "./snowNpc";
import type { SnowBody } from "./snowHit";

// 11/19 기간 한정 노점 그리기 (Phaser): 「계절 보따리상」(광장, 코디)·「가구 보따리상」(북쪽 길 위, 가구).
// 노점마다 맵 컨셉에 따라 다른 그림 + 주인 NPC(숨쉬기 두 장)·이름표·밤 불빛·몸 충돌.
// 배치·충돌 상자·E는 seasonStallLayout(순수) → layout.ts. 판매 창은 components/seasonShop (portal:open seasonCos · seasonFurn).
//  - 노점 그림 키에 "stall"이 들어 있어 눈싸움 공이 노점 그림(매대·천막·수레) 앞면에 박힌다 (world/snowMask PROP_KEY — 불투명 픽셀만, 허공은 지나간다)
//  - 주인 NPC는 맞는 NPC (몸통 상자 — 등 뒤 보따리·의자 위 허공·이름표 높이에서는 맞지 않는다)
//  - 불빛: 노점 빛 겹(가산, conceptLights가 낮엔 은은히·밤엔 환히) + 밤 어둠에 빛 구멍 (addLights)

type Light = { x: number; y: number; big: boolean };

/** 노점 그림 한 벌 (seasonStall · furnitureStall 같은 짜임) */
type StallArt = {
  key: string;
  stallW: number;
  stallH: number;
  npcW: number;
  npcH: number;
  stall: (c: MapConcept) => HTMLCanvasElement;
  glow: (c: MapConcept) => HTMLCanvasElement;
  lights: (c: MapConcept) => readonly Light[];
  npcSheet: (c: MapConcept) => HTMLCanvasElement;
  npcLight: (frame: number) => Light;
  /**
   * NPC 몸통 (그림 기준, 불투명 픽셀로 잼): 가운데 x, 반폭, 보이는 발 줄(바닥에서 위로), 발에서 머리 꼭대기까지.
   * 보따리상은 등 뒤로 솟은 보따리, 목수는 등에 진 의자 위쪽 허공을 뺀다
   */
  body: { cx: number; half: number; foot: number; top: number };
};

const ART: Record<SeasonKind, StallArt> = {
  cos: {
    key: "season",
    stallW: SEASON_STALL_W,
    stallH: SEASON_STALL_H,
    npcW: SEASON_PEDDLER_W,
    npcH: SEASON_PEDDLER_H,
    stall: seasonStall,
    glow: seasonStallGlowSheet,
    lights: seasonStallLights,
    npcSheet: seasonPeddlerSheet,
    npcLight: seasonPeddlerLight,
    body: { cx: 15, half: 8, foot: 3, top: 21 },
  },
  furn: {
    key: "season-furn",
    stallW: FURNITURE_STALL_W,
    stallH: FURNITURE_STALL_H,
    npcW: FURNITURE_CRAFTER_W,
    npcH: FURNITURE_CRAFTER_H,
    stall: furnitureStall,
    glow: furnitureStallGlowSheet,
    lights: furnitureStallLights,
    npcSheet: furnitureCrafterSheet,
    npcLight: furnitureCrafterLight,
    body: { cx: 14, half: 8, foot: 3, top: 21 },
  },
};

const tex = (a: StallArt) => ({
  stall: (c: MapConcept) => `${a.key}-stall-${c}`,
  // 빛 겹 키에는 "glow"를 넣는다 (snowMask SKIP_KEY — 공을 막지 않는다)
  stallGlow: (c: MapConcept) => `${a.key}-glow-${c}`,
  npc: (c: MapConcept) => `${a.key}-npc-${c}`,
});
const NPC_GLOW = "season-npc-glow";
const BREATH_MS = 650;

export type SeasonStallViewDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 정적 충돌 그룹 (WorldMap.colliders) — 노점·NPC 몸통 (seasonStallLayout, 걷기 격자와 같은 상자) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
};

/** 노점 하나 */
class Stall {
  private readonly art: StallArt;
  private readonly t: ReturnType<typeof tex>;
  private readonly site: StallSite;
  private readonly stall: Phaser.GameObjects.Image;
  readonly npc: Phaser.GameObjects.Image;
  private stallGlow: Phaser.GameObjects.Image | null = null;
  private readonly npcGlow: Phaser.GameObjects.Image;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private concept: MapConcept;
  frame = -1;

  constructor(
    private readonly d: SeasonStallViewDeps,
    kind: SeasonKind,
    concept: MapConcept,
  ) {
    const scene = d.scene;
    this.art = ART[kind];
    this.t = tex(this.art);
    this.site = stallSite(kind);
    this.concept = concept;
    this.ensure(concept);
    const { stall, npc } = this.site;
    this.stall = scene.add.image(stall.x, stall.y, this.t.stall(concept)).setOrigin(0.5, 1).setDepth(stall.y);
    this.npc = scene.add.image(npc.x, npc.y, this.t.npc(concept), 0).setOrigin(0.5, 1).setDepth(npc.y);
    const l = this.art.npcLight(0);
    this.npcGlow = addTwinkle(scene, NPC_GLOW, this.npcLeft + l.x + 0.5, this.npcTop + l.y + 0.5, 0.5, 0.5, { reduced: d.reduced, phase: 1 });
    this.placeStallGlow();
    for (const c of this.site.colliders) {
      const z = scene.add.zone(c.x + c.w / 2, c.y + c.h / 2, c.w, c.h);
      scene.physics.add.existing(z, true);
      d.colliders.add(z);
      this.zones.push(z);
    }
    // 이름표: 「계절 보따리상」 + 위에 옅은 색 「기간 한정 코디」 (사육사·어부 직함과 같은 자리·색 — 시안 그대로).
    // 비트맵 글씨를 줄이면 번져서 크기는 같게 두고 색·투명도로 한 단 낮춘다
    d.atlas.ensure(SEASON_SHOP_TITLE[kind] + SEASON_SHOP_SUB[kind]);
    this.label(npc.y - this.art.npcH - 1, SEASON_SHOP_TITLE[kind], 0xffe8b0, 0.95);
    this.label(npc.y - this.art.npcH - 9, SEASON_SHOP_SUB[kind], 0xc8d8b0, 0.85);
  }

  private get npcLeft() {
    return this.site.npc.x - this.art.npcW / 2;
  }
  private get npcTop() {
    return this.site.npc.y - this.art.npcH;
  }

  private ensure(c: MapConcept): void {
    const s = this.d.scene;
    const a = this.art;
    if (!s.textures.exists(this.t.stall(c))) addCanvasTexture(s, this.t.stall(c), { canvas: a.stall(c) });
    if (!s.textures.exists(this.t.stallGlow(c))) addCanvasTexture(s, this.t.stallGlow(c), { canvas: a.glow(c), frameW: a.stallW, frameH: a.stallH });
    if (!s.textures.exists(this.t.npc(c))) addCanvasTexture(s, this.t.npc(c), { canvas: a.npcSheet(c), frameW: a.npcW, frameH: a.npcH });
  }

  private placeStallGlow(): void {
    this.stallGlow?.destroy();
    this.stallGlow = addTwinkle(this.d.scene, this.t.stallGlow(this.concept), this.site.stall.x, this.site.stall.y, 0.5, 1, { reduced: this.d.reduced });
  }

  private label(y: number, text: string, tint: number, alpha: number): void {
    const t = this.d.scene.add.bitmapText(this.site.npc.x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
  }

  scaleLabels(s: number): void {
    for (const t of this.labels) if (t.scaleX !== s) t.setScale(s);
  }

  setConcept(c: MapConcept): void {
    if (c === this.concept) return;
    this.concept = c;
    this.ensure(c);
    this.stall.setTexture(this.t.stall(c));
    this.placeStallGlow();
    this.frame = -1;
  }

  /** 숨쉬기 (frame 0·1) */
  breathe(f: number): void {
    if (f === this.frame) return;
    this.frame = f;
    this.npc.setTexture(this.t.npc(this.concept), f);
    const l = this.art.npcLight(f);
    this.npcGlow.setPosition(this.npcLeft + l.x + 0.5, this.npcTop + l.y + 0.5);
  }

  addLights(lit: Lighting): void {
    const { stall } = this.site;
    const x0 = stall.x - this.art.stallW / 2;
    const y0 = stall.y - this.art.stallH;
    for (const l of this.art.lights(this.concept)) lit.add(x0 + l.x, y0 + l.y, l.big ? 30 : 12, l.big ? 0.85 : 0.45);
    lit.add(stall.x, stall.y - 16, 40, 0.55);
    const p = this.art.npcLight(Math.max(0, this.frame));
    lit.add(this.npcLeft + p.x, this.npcTop + p.y, 26, 0.8);
  }

  /** 눈싸움 몸통 상자 */
  box(out: SnowBody): boolean {
    const img = this.npc;
    if (!img.visible || !img.active) return false;
    const b = this.art.body;
    out.x = this.npcLeft + b.cx;
    out.y = this.site.npc.y - b.foot;
    out.lift = 0;
    out.top = b.top - (this.frame === 1 ? 1 : 0);
    out.half = b.half;
    return true;
  }

  destroy(): void {
    this.stall.destroy();
    this.npc.destroy();
    this.stallGlow?.destroy();
    this.npcGlow.destroy();
    for (const t of this.labels) t.destroy();
    for (const z of this.zones) z.destroy();
  }
}

export class SeasonStallView {
  private readonly stalls: Stall[];
  private conceptAt = 0;
  private snowList: SnowNpc[] | null = null;

  constructor(private readonly d: SeasonStallViewDeps) {
    ensureNpcGlow(d.scene);
    const c = currentMapConcept();
    this.stalls = (["cos", "furn"] as const).map((k) => new Stall(d, k, c));
  }

  /** 1/zoom 배율 글씨 */
  scaleLabels(s: number): void {
    for (const st of this.stalls) st.scaleLabels(s);
  }

  /** 매 프레임: 숨쉬기, 1초마다 맵 컨셉 확인 (바뀌면 그 판 그림으로) */
  update(now: number): void {
    if (now >= this.conceptAt) {
      this.conceptAt = now + 1000;
      const c = currentMapConcept();
      for (const st of this.stalls) st.setConcept(c);
    }
    const f = Math.floor(now / BREATH_MS) % 2;
    // 두 NPC는 숨쉬기를 반 박자 어긋나게 (움직임 줄이기면 한 장 그대로)
    this.stalls.forEach((st, i) => st.breathe(this.d.reduced ? 0 : (f + i) % 2));
  }

  /** 밤 어둠에 빛 구멍: 노점 등불·전구, 매대 둘레 은은히, 주인 등불 */
  addLights(lit: Lighting): void {
    for (const st of this.stalls) st.addLights(lit);
  }

  /** 눈싸움: 주인 NPC도 맞는다 (그림 한 장 NPC — 머리에 눈·움찔·가끔 한마디) */
  snowNpcs(): readonly SnowNpc[] {
    return (this.snowList ??= this.stalls.map((st): SnowNpc => ({ voice: "person", box: (out) => st.box(out), img: () => st.npc })));
  }

  destroy(): void {
    for (const st of this.stalls) st.destroy();
  }
}

/** 주인 NPC 등불의 둥근 빛 (두 장 — 숨쉬기에 맞춰 한 칸 내려앉는다) */
function ensureNpcGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(NPC_GLOW)) return;
  const R = 12;
  const { canvas, ctx } = makeCanvas(R * 4, R * 2);
  for (let f = 0; f < 2; f++) {
    const cx = f * R * 2 + R;
    const g = ctx.createRadialGradient(cx, R, 0, cx, R, R);
    g.addColorStop(0, `rgba(255,170,90,${f ? 0.72 : 0.8})`);
    g.addColorStop(0.4, "rgba(255,150,80,0.3)");
    g.addColorStop(1, "rgba(255,150,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(f * R * 2, 0, R * 2, R * 2);
  }
  addCanvasTexture(scene, NPC_GLOW, { canvas, frameW: R * 2, frameH: R * 2 });
}

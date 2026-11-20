import * as Phaser from "phaser";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { OFFICE_SHOP_SUB, OFFICE_SHOP_TITLE } from "@/lib/office/catalog";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { OFFICE_CLERK_H, OFFICE_CLERK_W, OFFICE_STALL_H, OFFICE_STALL_W, officeClerkSheet, officeStall, officeStallGlowSheet, officeStallLights } from "../sprites/officeSeller";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { addTwinkle } from "./conceptLights";
import type { Lighting } from "./Lighting";
import { OFFICE_CLERK, OFFICE_STALL, officeColliders } from "./officeStallLayout";
import type { SnowNpc } from "./snowNpc";
import type { SnowBody } from "./snowHit";

// 11/20 「총무팀 문대리」 그리기 (Phaser): 야근 빌딩 오른쪽 풀밭의 사무실 가구 카트 + 카트 뒤 총무팀 유령 문대리 (숨쉬기 두 장)·이름표·밤 불빛·몸 충돌.
// 맵 컨셉(기본·겨울·크리스마스)마다 그림이 바뀐다 (sprites/officeSeller.ts — 시안 그대로). 배치·충돌 상자·E는 officeStallLayout(순수) → layout.ts.
// 판매 창은 components/office (portal:open office).
//  - 문대리는 카트보다 12px 뒤(깊이도 뒤)에 서서 상판 너머로 윗몸만 보인다
//  - 카트 그림 키에 "stall"이 들어 있어 눈싸움 공이 카트 그림(차양·상판·앞판) 앞면에 박힌다 (snowMask PROP_KEY — 불투명 픽셀만, 허공은 지나간다)
//  - 문대리는 맞는 NPC: 상판 위로 보이는 윗몸만 (상판에 가려진 자락·이름표 높이에서는 맞지 않는다)
//  - 불빛: 노점 빛 겹(은행원 스탠드·형광등·난로·전구 — conceptLights가 낮엔 은은히·밤엔 환히) + 밤 어둠에 빛 구멍 (addLights)

const BREATH_MS = 650;
const tex = {
  stall: (c: MapConcept) => `office-stall-${c}`,
  // 빛 겹 키에는 "glow"를 넣는다 (snowMask SKIP_KEY — 공을 막지 않는다)
  glow: (c: MapConcept) => `office-glow-${c}`,
  npc: (c: MapConcept) => `office-npc-${c}`,
};
/** 문대리 몸통 (그림 기준): 가운데 x, 반폭, 머리 꼭대기 (그림 위에서) */
const BODY = { cx: 15, half: 7, headTop: 11 };
/** 카트 상판 윗면 (카트 그림 위에서 아래로 px — officeSeller TOP) */
const COUNTER_Y = 28;

export type OfficeStallViewDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 정적 충돌 그룹 (WorldMap.colliders) — 카트·문대리 몸통 (officeStallLayout, 걷기 격자와 같은 상자) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
};

export class OfficeStallView {
  private concept: MapConcept;
  private conceptAt = 0;
  private frame = -1;
  private readonly stall: Phaser.GameObjects.Image;
  private readonly npc: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image | null = null;
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private snowList: SnowNpc[] | null = null;

  constructor(private readonly d: OfficeStallViewDeps) {
    const scene = d.scene;
    const c = (this.concept = currentMapConcept());
    this.ensure(c);
    const S = OFFICE_STALL;
    const N = OFFICE_CLERK;
    this.stall = scene.add.image(S.x, S.y, tex.stall(c)).setOrigin(0.5, 1).setDepth(S.y);
    this.npc = scene.add.image(N.x, N.y, tex.npc(c), 0).setOrigin(0.5, 1).setDepth(N.y);
    this.placeGlow();
    for (const r of officeColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      scene.physics.add.existing(z, true);
      d.colliders.add(z);
      this.zones.push(z);
    }
    // 이름표: 「총무팀 문대리」 + 위에 옅은 청록 「사무실 가구」 (블라인드 차양 바로 위 — 시안 그대로)
    d.atlas.ensure(OFFICE_SHOP_TITLE + OFFICE_SHOP_SUB);
    const top = S.y - OFFICE_STALL_H - 1;
    this.label(top, OFFICE_SHOP_TITLE, 0xffe8b0, 0.95);
    this.label(top - 8, OFFICE_SHOP_SUB, 0xb8d8e0, 0.85);
  }

  private ensure(c: MapConcept): void {
    const s = this.d.scene;
    if (!s.textures.exists(tex.stall(c))) addCanvasTexture(s, tex.stall(c), { canvas: officeStall(c) });
    if (!s.textures.exists(tex.glow(c))) addCanvasTexture(s, tex.glow(c), { canvas: officeStallGlowSheet(c), frameW: OFFICE_STALL_W, frameH: OFFICE_STALL_H });
    if (!s.textures.exists(tex.npc(c))) addCanvasTexture(s, tex.npc(c), { canvas: officeClerkSheet(c), frameW: OFFICE_CLERK_W, frameH: OFFICE_CLERK_H });
  }

  private placeGlow(): void {
    this.glow?.destroy();
    this.glow = addTwinkle(this.d.scene, tex.glow(this.concept), OFFICE_STALL.x, OFFICE_STALL.y, 0.5, 1, { reduced: this.d.reduced });
  }

  private label(y: number, text: string, tint: number, alpha: number): void {
    const t = this.d.scene.add.bitmapText(OFFICE_STALL.x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
  }

  /** 1/zoom 배율 글씨 */
  scaleLabels(s: number): void {
    for (const t of this.labels) if (t.scaleX !== s) t.setScale(s);
  }

  private setConcept(c: MapConcept): void {
    if (c === this.concept) return;
    this.concept = c;
    this.ensure(c);
    this.stall.setTexture(tex.stall(c));
    this.placeGlow();
    this.frame = -1;
  }

  /** 매 프레임: 숨쉬기 (움직임 줄이기면 한 장), 1초마다 맵 컨셉 확인 */
  update(now: number): void {
    if (now >= this.conceptAt) {
      this.conceptAt = now + 1000;
      this.setConcept(currentMapConcept());
    }
    const f = this.d.reduced ? 0 : Math.floor(now / BREATH_MS) % 2;
    if (f === this.frame) return;
    this.frame = f;
    this.npc.setTexture(tex.npc(this.concept), f);
  }

  /** 밤 어둠에 빛 구멍: 스탠드·형광등·난로·전구, 카트 둘레 은은히 (시안 그대로) */
  addLights(lit: Lighting): void {
    const x0 = OFFICE_STALL.x - OFFICE_STALL_W / 2;
    const y0 = OFFICE_STALL.y - OFFICE_STALL_H;
    for (const l of officeStallLights(this.concept)) lit.add(x0 + l.x, y0 + l.y, l.big ? 32 : l.tube ? 22 : 12, l.big ? 0.9 : l.tube ? 0.7 : 0.45);
    lit.add(OFFICE_STALL.x, OFFICE_STALL.y - 20, 48, 0.65);
  }

  /** 눈싸움 몸통 상자: 상판 위로 보이는 윗몸만 */
  private box(out: SnowBody): boolean {
    const img = this.npc;
    if (!img.visible || !img.active) return false;
    const counter = OFFICE_STALL.y - OFFICE_STALL_H + COUNTER_Y;
    const head = OFFICE_CLERK.y - OFFICE_CLERK_H + BODY.headTop + (this.frame === 1 ? 1 : 0);
    // 발은 카트 뒤 (깊이 판정은 발 줄), 보이는 몸은 상판 위부터 — 상판까지를 띄운 높이(lift)로 둔다
    out.x = OFFICE_CLERK.x - OFFICE_CLERK_W / 2 + BODY.cx;
    out.y = OFFICE_CLERK.y;
    out.lift = OFFICE_CLERK.y - counter;
    out.top = counter - head;
    out.half = BODY.half;
    return true;
  }

  /** 눈싸움: 문대리도 맞는다 (그림 한 장 NPC — 머리에 눈·움찔·가끔 한마디) */
  snowNpcs(): readonly SnowNpc[] {
    return (this.snowList ??= [{ voice: "person", box: (out) => this.box(out), img: () => this.npc }]);
  }

  destroy(): void {
    this.stall.destroy();
    this.npc.destroy();
    this.glow?.destroy();
    for (const t of this.labels) t.destroy();
    for (const z of this.zones) z.destroy();
  }
}

import * as Phaser from "phaser";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { MUNGNYANG_SHOP_SUB, MUNGNYANG_SHOP_TITLE } from "@/lib/mungnyang/catalog";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import {
  MUNGNYANG_PET_PAD,
  MUNGNYANG_SELLER_ANIM,
  MUNGNYANG_SELLER_H,
  MUNGNYANG_SELLER_W,
  MUNGNYANG_STAND_H,
  MUNGNYANG_STAND_W,
  MUNGNYANG_YARD_PETS,
  mungnyangCushion,
  mungnyangPet,
  mungnyangSellerSheet,
  mungnyangStand,
  mungnyangStandGlowSheet,
  mungnyangStandLight,
  type MungnyangPetSpot,
} from "../sprites/mungnyangSeller";
import { BREED_ART } from "../sprites/petBreeds";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { addTwinkle } from "./conceptLights";
import type { Lighting } from "./Lighting";
import { MUNGNYANG_CUSHION, MUNGNYANG_SELLER, MUNGNYANG_STAND, mungnyangColliders } from "./mungnyangLayout";
import type { SnowNpc } from "./snowNpc";
import type { SnowBody } from "./snowHit";

// 11/19 「분양사 보리」 그리기 (Phaser): 동물원 정문 왼쪽 풀밭의 분양사 + 발치 펫 셋(시바·방석 치즈냥·오가는 코기) + 방석·간식 상자.
// 맵 컨셉(기본·겨울·크리스마스)마다 옷·소품·펫 옷이 바뀐다 (그림 sprites/mungnyangSeller.ts, 움직임 값 MUNGNYANG_YARD_PETS — 시안 그대로).
// 배치·충돌 상자·E는 mungnyangLayout(순수) → layout.ts. 판매 창은 components/mungnyang (portal:open mungnyang).
//  - 간식 상자 그림 키에 "stall"이 들어 있어 눈싸움 공이 상자 앞면에 박힌다 (snowMask PROP_KEY — 불투명 픽셀만)
//  - 분양사는 맞는 NPC (몸통 상자 — 모자 귀 위·이름표 높이에서는 맞지 않는다). 발치 펫은 맞지 않는다 (그림만)
//  - 불빛: 간식 상자 기둥의 등불 하나 (빛 겹은 conceptLights가 낮엔 은은히·밤엔 환히) + 밤 어둠에 빛 구멍 (addLights)

const SELLER_MS = 650;
const GLOW = "mungnyang-glow";
const tex = {
  seller: (c: MapConcept) => `mungnyang-npc-${c}`,
  cushion: (c: MapConcept) => `mungnyang-cushion-${c}`,
  stand: (c: MapConcept) => `mungnyang-stall-${c}`,
  pet: (art: string, c: MapConcept) => `mungnyang-pet-${art}-${c}`,
};
/** 분양사 몸통 (그림 기준): 가운데 x, 반폭, 보이는 발 줄(바닥에서 위로), 발에서 모자 꼭대기까지 (고양이 귀 끝은 뺀다) */
const BODY = { cx: 15, half: 8, foot: 2, top: 22 };

export type MungnyangViewDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 정적 충돌 그룹 (WorldMap.colliders) — 몸통·간식 상자·방석 (mungnyangLayout, 걷기 격자와 같은 상자) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
};

/** 펫 시트에 담을 프레임 수 (쓰는 프레임 중 가장 큰 번호 + 1) */
const petFrames = (p: MungnyangPetSpot) => Math.max(...p.idle, ...(p.act?.frames ?? []), ...(p.wander?.walk ?? [])) + 1;

/** 발치 펫 하나 */
type Pet = {
  spot: MungnyangPetSpot;
  img: Phaser.GameObjects.Image;
  frame: number;
  /** 오가는 펫(코기): 분양사 발 기준 x, 가는 쪽, 지금 하는 일, 쉬기 시작·끝, 쉰 횟수 */
  x: number;
  dir: 1 | -1;
  mode: "walk" | "rest";
  restAt: number;
  until: number;
  rests: number;
};

export class MungnyangView {
  private concept: MapConcept;
  private conceptAt = 0;
  private readonly seller: Phaser.GameObjects.Image;
  private readonly cushion: Phaser.GameObjects.Image;
  private readonly stand: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly pets: Pet[];
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private readonly zones: Phaser.GameObjects.Zone[] = [];
  private sellerFrame = 0;
  private lastNow = -1;
  private snowList: SnowNpc[] | null = null;

  constructor(private readonly d: MungnyangViewDeps) {
    const scene = d.scene;
    const c = (this.concept = currentMapConcept());
    this.ensure(c);
    ensureGlow(scene);
    const S = MUNGNYANG_SELLER;
    this.seller = scene.add.image(S.x, S.y, tex.seller(c), 0).setOrigin(0.5, 1).setDepth(S.y);
    // 방석은 납작해서 치즈냥(같은 줄)보다 한 겹 아래
    this.cushion = scene.add.image(MUNGNYANG_CUSHION.x, MUNGNYANG_CUSHION.y, tex.cushion(c)).setOrigin(0.5, 1).setDepth(MUNGNYANG_CUSHION.y - 3);
    this.stand = scene.add.image(MUNGNYANG_STAND.x, MUNGNYANG_STAND.y, tex.stand(c)).setOrigin(0.5, 1).setDepth(MUNGNYANG_STAND.y);
    this.glow = addTwinkle(scene, GLOW, MUNGNYANG_STAND.x, MUNGNYANG_STAND.y, 0.5, 1, { reduced: d.reduced });
    this.pets = MUNGNYANG_YARD_PETS.map((spot): Pet => {
      const x0 = spot.wander ? spot.wander.x0 + (spot.wander.x1 - spot.wander.x0) * 0.55 : spot.dx;
      const img = scene.add
        .image(S.x + x0, S.y + spot.dy, tex.pet(spot.art, c), spot.idle[0])
        .setOrigin(0.5, 1)
        .setDepth(S.y + spot.dy)
        .setFlipX(!!spot.flip);
      return { spot, img, frame: spot.idle[0], x: x0, dir: 1, mode: d.reduced ? "rest" : "walk", restAt: 0, until: 0, rests: 0 };
    });
    for (const r of mungnyangColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      scene.physics.add.existing(z, true);
      d.colliders.add(z);
      this.zones.push(z);
    }
    // 이름표: 「분양사 보리」 + 위에 옅은 색 「강아지·고양이 분양」 (사육사·보따리상 직함과 같은 자리 — 시안 그대로)
    d.atlas.ensure(MUNGNYANG_SHOP_TITLE + MUNGNYANG_SHOP_SUB);
    this.label(S.y - MUNGNYANG_SELLER_H - 1, MUNGNYANG_SHOP_TITLE, 0xffe8b0, 0.95);
    this.label(S.y - MUNGNYANG_SELLER_H - 9, MUNGNYANG_SHOP_SUB, 0xc8e8b0, 0.85);
  }

  private ensure(c: MapConcept): void {
    const s = this.d.scene;
    if (!s.textures.exists(tex.seller(c))) addCanvasTexture(s, tex.seller(c), { canvas: mungnyangSellerSheet(c), frameW: MUNGNYANG_SELLER_W, frameH: MUNGNYANG_SELLER_H });
    if (!s.textures.exists(tex.cushion(c))) addCanvasTexture(s, tex.cushion(c), { canvas: mungnyangCushion(c) });
    if (!s.textures.exists(tex.stand(c))) addCanvasTexture(s, tex.stand(c), { canvas: mungnyangStand(c) });
    for (const p of MUNGNYANG_YARD_PETS) {
      const key = tex.pet(p.art, c);
      if (s.textures.exists(key)) continue;
      const a = BREED_ART[p.art];
      const n = petFrames(p);
      const h = a.h + MUNGNYANG_PET_PAD;
      const canvas = document.createElement("canvas");
      canvas.width = a.w * n;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      for (let f = 0; f < n; f++) ctx.drawImage(mungnyangPet(p.art, f, c), f * a.w, 0);
      addCanvasTexture(s, key, { canvas, frameW: a.w, frameH: h });
    }
  }

  private label(y: number, text: string, tint: number, alpha: number): void {
    const t = this.d.scene.add.bitmapText(MUNGNYANG_SELLER.x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
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
    this.seller.setTexture(tex.seller(c), this.sellerFrame);
    this.cushion.setTexture(tex.cushion(c));
    this.stand.setTexture(tex.stand(c));
    for (const p of this.pets) p.img.setTexture(tex.pet(p.spot.art, c), p.frame);
  }

  /** 매 프레임: 분양사 숨쉬기(+품의 강아지 꼬리), 발치 펫 움직임, 1초마다 맵 컨셉 확인 */
  update(now: number): void {
    if (now >= this.conceptAt) {
      this.conceptAt = now + 1000;
      this.setConcept(currentMapConcept());
    }
    const dt = this.lastNow < 0 ? 0 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    const reduced = this.d.reduced;
    const sf = reduced ? 0 : MUNGNYANG_SELLER_ANIM[Math.floor(now / SELLER_MS) % MUNGNYANG_SELLER_ANIM.length];
    if (sf !== this.sellerFrame) {
      this.sellerFrame = sf;
      this.seller.setFrame(sf);
    }
    for (const p of this.pets) this.stepPet(p, now, dt, reduced);
  }

  private stepPet(p: Pet, now: number, dt: number, reduced: boolean): void {
    const s = p.spot;
    let f: number;
    if (reduced) f = s.idle[0];
    else if (!s.wander) {
      // 제자리 펫: every ms마다 동작 한 번, 그 밖엔 제자리 차례
      const act = s.act;
      const t = act ? now % act.every : 0;
      f = act && t < act.frames.length * act.ms ? act.frames[Math.floor(t / act.ms)] : s.idle[Math.floor(now / s.ms) % s.idle.length];
    } else {
      // 오가는 펫(코기): 걷기(x0 ↔ x1, 가는 쪽을 본다) → 끝에서 쉬기 (act.every번에 한 번은 동작) → 돌아서 걷기
      const W = s.wander;
      if (p.mode === "walk") {
        p.x += (p.dir * W.speed * dt) / 1000;
        f = W.walk[Math.floor(now / W.walkMs) % W.walk.length];
        p.img.setFlipX(p.dir < 0);
        if ((p.dir > 0 && p.x >= W.x1) || (p.dir < 0 && p.x <= W.x0)) {
          p.x = p.dir > 0 ? W.x1 : W.x0;
          p.mode = "rest";
          p.restAt = now;
          p.until = now + W.restMs;
          p.rests++;
        }
        p.img.x = Math.round(MUNGNYANG_SELLER.x + p.x);
      } else {
        const act = s.act && p.rests % s.act.every === 0 ? s.act : null;
        const seq = act ? act.frames : s.idle;
        const k = Math.floor((now - p.restAt) / (act ? act.ms : s.ms));
        f = act ? seq[Math.min(k, seq.length - 1)] : seq[k % seq.length];
        if (now >= p.until) {
          p.mode = "walk";
          p.dir = p.dir > 0 ? -1 : 1;
        }
      }
    }
    if (f !== p.frame) {
      p.frame = f;
      p.img.setFrame(f);
    }
  }

  /** 밤 어둠에 빛 구멍: 간식 상자 등불, 분양사 둘레 은은히 */
  addLights(lit: Lighting): void {
    const l = mungnyangStandLight();
    lit.add(MUNGNYANG_STAND.x - MUNGNYANG_STAND_W / 2 + l.x, MUNGNYANG_STAND.y - MUNGNYANG_STAND_H + l.y, 34, 0.95);
    lit.add(MUNGNYANG_SELLER.x - 12, MUNGNYANG_SELLER.y - 10, 52, 0.6);
  }

  /** 눈싸움 몸통 상자 */
  private box(out: SnowBody): boolean {
    const img = this.seller;
    if (!img.visible || !img.active) return false;
    out.x = MUNGNYANG_SELLER.x - MUNGNYANG_SELLER_W / 2 + BODY.cx;
    out.y = MUNGNYANG_SELLER.y - BODY.foot;
    out.lift = 0;
    out.top = BODY.top - (this.sellerFrame % 2 === 1 ? 1 : 0);
    out.half = BODY.half;
    return true;
  }

  /** 눈싸움: 분양사도 맞는다 (그림 한 장 NPC — 머리에 눈·움찔·가끔 한마디) */
  snowNpcs(): readonly SnowNpc[] {
    return (this.snowList ??= [{ voice: "person", box: (out) => this.box(out), img: () => this.seller }]);
  }

  destroy(): void {
    this.seller.destroy();
    this.cushion.destroy();
    this.stand.destroy();
    this.glow.destroy();
    for (const p of this.pets) p.img.destroy();
    for (const t of this.labels) t.destroy();
    for (const z of this.zones) z.destroy();
  }
}

/** 등불 빛무리 두 장 (mungnyangStandGlowSheet — 간식 상자와 같은 크기·원점) */
function ensureGlow(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW)) return;
  addCanvasTexture(scene, GLOW, { canvas: mungnyangStandGlowSheet(), frameW: MUNGNYANG_STAND_W, frameH: MUNGNYANG_STAND_H });
}

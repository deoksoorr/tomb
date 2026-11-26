import * as Phaser from "phaser";
import { CAMP_FIRE_USE_RE, CAMP_LOTS, campFireUseId, campLotByNo, campLotShort, type CampLot } from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture, TEX } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { bulbGlowSheet, lightString, lightStringOrigin, snowCap } from "../sprites/winterArt";
import { campHammockGrid } from "./campHammock";
import { clampChars, DOOR_NAME_MAX } from "../text/fitLabel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { addTwinkle } from "../world/conceptLights";
import { PLATE_LOT_FREE, PLATE_LOT_HOUSE, SignPlate } from "../world/SignPlate";
import { houseLotLabels, scaleLotLabel } from "../housing/worldLots";
import { isOlderHomes, onHomesChanged, staleHomesV } from "../housing/homesRefresh";
import * as Art from "./campArt";
import { campSkin } from "./CampConceptDecor";
import { campHousingHost } from "./campHousingHost";
import {
  campHomePlan,
  campHomeSeatsOf,
  FLAT_TAG,
  homeSeatOpen,
  planKey,
  plateHead,
  saleLabel,
  type HomePlan,
  type HomeSeat,
  type HomeState,
  type PlanFx,
  type PlanLight,
  type PlanRect,
} from "./campHousingPlan";
import { campHousingApi, campOf, emptyDoorAction, type CampVillageHouse } from "./campSaleApi";
import type { CampInteractable } from "./campTypes";

// 11/26 캠핑장 집 (카라반 12 · 소슬 펜션 2 · 촌캉스 2)을 캠핑장 장면에 붙여요 — 바닷가 오두막(game/sea/seaHousing)과 같은 흐름.
//  - 지금 채널의 캠핑장 집터 16 (/api/housing/village?zone=camp — CDN 15초). 터마다 그림(campHousingPlan)·막는 상자·문패(빈 터는 「분양 중」 글씨)
//  - E: 집 문 → 그 집 안으로 (내 집이면 주인, 남의 집이면 놀러 가기 — UI 하우징 창이 집 씬을 연다)
//    (11/26 운영자 「카라반, 촌캉스도 NPC만으로 통일」: 빈 터엔 분양 팻말이 없고, 빈 집 문 앞·빈 카라반 자리 가운데 E는 「분양 안내」 토스트만 —
//     분양 창은 언젠가 씨·소슬댁·순이 할머니에게 말을 걸어서만 (CampScene.talkTo · campSaleApi CAMP_SALE_NPC))
//  - 앞마당 앉을 자리(protocol CAMP_HOME_SEATS — id "qH{터}_{i}")는 앞마당 단계에 맞는 자리만 연다 (seatOpen — 장면의 좌석 고르기가 거른다)
//  - 밤: 창 불빛·화롯대·아궁이·등 빛 (addLights + ADD 빛), 겨울·크리스마스판: 지붕 눈·고드름·눈 마당·크리스마스 전구 (concept)
// CampScene은 만들기·매 프레임(update)·E(use)·빛(addLights)·좌석 거르기(seatOpen)·정리(destroy)만 넘겨요.

/** 집 목록을 다시 받는 간격 (다른 사람 분양·앞마당·넓히기) */
const REFRESH_MS = 5 * 60_000;
/** 밤 그림(창 불빛·스파 불빛)으로 바꾸는 어둠 */
const NIGHT_AT = 0.5;
/** 집에서 나오면 문 아래 이만큼에 선다 */
const DOOR_STAND = 10;
/** 11/26 집 목록을 받기 전에 문 앞으로 가라고 했으면 이 안에 받았을 때만 그 집 문 앞으로 다시 맞춘다 (ms) */
const STAND_LATER_MS = 4000;
/** 화면 밖 터는 숨긴다 (여유 px) */
const CULL_PAD = 120;
const ANIM_BRAZIER = "chome-brazier";
const ANIM_FLAMES = "chome-flames";


export type CampHousingDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** CampMap: 막는 상자(colliders·furnitureColliders)와 상호작용 목록(바꿔 끼운다) */
  map: { colliders: Phaser.Physics.Arcade.StaticGroup; furnitureColliders: Phaser.Physics.Arcade.StaticGroup; interactables: readonly CampInteractable[] };
  /** 지금 맵 컨셉 (겨울·크리스마스면 눈·전구) */
  concept: () => MapConcept;
  /** 지금 채널 (연결 전이면 null) */
  channel: () => number | null;
  /** 그 자리로 옮기고 카메라를 맞춘다 (서버에도 알린다) */
  warp: (x: number, y: number) => void;
  toast: (m: string) => void;
  /** 11/26 내 캐릭터 발 위치 (문 위 화살표는 가까이 왔을 때만). 없으면(개발 시트) 화살표를 늘 보여요 */
  player?: () => { x: number; y: number };
  /** 11/26 아궁이 불을 켜고 껐다 → 같은 채널에 알린다 (실시간 use 중계 — 저장 없이). 없으면(오프라인·시트) 내 화면만 */
  sendUse?: (u: string, a: number) => void;
};

/** 11/26 아궁이 불 알림 id (실시간 use u — protocol CAMP_FIRE_USE_RE, 서버가 월드 채널에서도 이 id만 같은 맵에 중계한다) */
const fireUseId = campFireUseId;
const FIRE_USE_RE = CAMP_FIRE_USE_RE;

type Built = {
  key: string;
  plan: HomePlan;
  objs: Phaser.GameObjects.GameObject[];
  emitters: Phaser.GameObjects.Particles.ParticleEmitter[];
  bodies: { group: Phaser.Physics.Arcade.StaticGroup; zone: Phaser.GameObjects.Zone }[];
  windows: Phaser.GameObjects.Image[];
  /** 11/26 문 위 화살표 (가까울 때만 보인다 — near = 지금 보이는 쪽) */
  lights: Phaser.GameObjects.Image[];
  /** 컬링용 상자 */
  box: { x0: number; y0: number; x1: number; y1: number };
  shown: boolean;
  /** 11/26 마당 해먹 그림 (누가 누우면 기둥만) */
  hammock?: { id: string; img: Phaser.GameObjects.Image; full: string };
};
/** short = 카라반 문패 두 줄 (호칭 줄을 빼고 한 줄 내려 지붕에 붙인다 — 자리가 촘촘해 뒷줄 카라반 마당을 덜 가린다) */
type LotPlate = { key: string; sign: SignPlate | null; labels: Phaser.GameObjects.BitmapText[]; short?: boolean };

/** 문패 크기 맞추기 (scaleLotLabel이 줄 자리를 다시 놓을 때만 두 줄 문패를 한 줄 내린다) */
function scalePlate(p: LotPlate, s: number): void {
  const moved = p.labels.some((t) => t.scaleX !== s);
  for (const t of p.labels) scaleLotLabel(t, s);
  if (!p.short || !moved || p.labels.length < 2) return;
  const d = p.labels[1].y - p.labels[0].y;
  for (const t of p.labels) t.y += d;
}

const SEAT_BY_ID = new Map<string, HomeSeat>(CAMP_LOTS.flatMap((l) => campHomeSeatsOf(l)).map((s) => [s.id, s]));

/**
 * 집 그림이 빌려 쓰는 캠핑장 소품 텍스처 (접이식 탁자·캠핑 의자·화롯대·통나무 의자·불꽃·전구·김·연기·자갈).
 * 캠핑장 맵(CampMap)이 보통 먼저 굽지만, 없으면 여기서 같은 키로 굽는다 (dev 시트·맵 개편 중 빠진 것)
 */
export function ensureCampHomeTextures(scene: Phaser.Scene): void {
  const T = Art.CAMP_TEX;
  const add = (key: string, build: () => Art.ArtOut | ReturnType<typeof Art.foldTableArt>, linear = false) => {
    if (scene.textures.exists(key)) return;
    const out = build();
    const a: Art.ArtOut = "grid" in out ? out : { grid: out };
    addCanvasTexture(scene, key, { canvas: a.grid.toCanvas(), frameW: a.frameW, frameH: a.frameH, linear });
  };
  for (let v = 0; v < 3; v++) add(T.pebbles(v), () => Art.pebblesArt(v));
  for (let i = 0; i < 3; i++) add(T.campChairSide(i), () => Art.campChairSideArt(i));
  // 11/26 카라반 탁자 뒤 캠핑 의자 (앞모습)
  for (let i = 0; i < 3; i++) add(T.campChairFront(i), () => Art.campChairFrontArt(i));
  add(T.logChair, Art.logChairArt);
  add(T.flames, Art.flamesArt);
  add(T.foldTable, Art.foldTableArt);
  add(T.picnicV, Art.picnicTableVArt);
  add(T.benchV, Art.picnicBenchVArt);
  add(T.brazier, Art.brazierArt);
  add(T.brazierFire, Art.brazierFireArt);
  add(T.lantern, Art.lanternArt);
  add(T.icebox, Art.iceboxArt);
  add(T.bbqSmoke, Art.bbqSmokeArt);
  add(T.pole, Art.poleArt);
  add(T.bulb, Art.bulbArt);
  add(T.bulbGlow, () => Art.glowArt(16, 0xffd890, 1.8), true);
  add(T.mist, Art.mistArt, true);
}

export class CampHousing {
  private houses = new Map<number, CampVillageHouse>();
  /** 숨긴(관리자) 집이 있는 터 */
  private taken = new Set<number>();
  private built = new Map<number, Built>();
  private plates = new Map<number, LotPlate>();
  private myId: string | null = null;
  private ch: number | null = null;
  /** 11/26 집 목록을 받기 전에 문 앞으로 가라고 했다 (다른 맵 집에서 나와 막 도착 — 빈 터 그림의 문 자리였다) → 받아 그리면 그 집 문 앞으로 한 번 더 */
  private standLater: { lot: number; at: number } | null = null;
  private fetchedAt = 0;
  private loading = false;
  /** 11/26 받는 중에 온 집 바뀜 알림 v (끝나면 한 번 더 받는다) */
  private pendingV = 0;
  /** 11/26 지금 그린 목록을 서버가 만든 시각 (generatedAt — 늦게 온 옛 응답을 거른다) */
  private shownAt = 0;
  private night = false;
  /** 11/26 밤낮을 한 번이라도 판정했는지 (처음 판정은 「바뀐 것」이 아니다 — 들어올 때 서버가 보내 준 아궁이 불을 지우지 않게) */
  private nightKnown = false;
  /** 11/26 아궁이 불 (터 → 켜짐). 없으면 밤에 켜짐·낮에 꺼짐 — 누가 E로 바꾸면 그다음 밤낮이 바뀔 때까지 (저장 없이, 같은 채널에 알림) */
  private fire = new Map<number, boolean>();
  private concept: MapConcept;
  private plateScale = 1;
  private darkness = 0;
  private readonly offs: (() => void)[] = [];
  private destroyed = false;

  constructor(private readonly d: CampHousingDeps) {
    this.concept = d.concept();
    ensureCampHomeTextures(d.scene);
    this.ensureAnims();
    for (const l of CAMP_LOTS) this.draw(l);
    this.syncInteractables();
    this.offs.push(
      bridge.on("camp:homes", ({ myHouseId }) => {
        this.myId = myHouseId;
        void this.refresh(true);
      }),
      bridge.on("camp:lot", ({ lot }) => this.standAtLot(lot)),
      // 11/26 같은 채널 누가 분양·디자인·앞마당·넓히기 → 몇 초 안에 다시 받는다 (5분 주기를 기다리지 않게 — 분양 끝난 터의 「분양 중」 팻말도 바로 빠진다)
      onHomesChanged("camp", (v) => void this.refresh({ v }), undefined, (v) => this.covers(v)),
    );
    // 집에서 나올 때·[내 집 앞으로] — 집 씬(install.ts)이 캠핑장 장면에서 들어온 캠핑장 집이면 이 자리로
    this.hostStand();
    campHousingApi
      .mine()
      .then((r) => {
        if (this.destroyed || (r.house?.id ?? null) === this.myId) return;
        this.myId = r.house?.id ?? null;
        for (const l of CAMP_LOTS) this.draw(l);
      })
      .catch(() => undefined);
  }

  // ── 받기 ──

  /** 11/26 지금 그린 목록이 이 채널에서 v 뒤에 만든 것이다 (입장 때 다시 온 마지막 v는 다시 받지 않는다) */
  private covers(v: number): boolean {
    return this.ch !== null && this.ch === this.d.channel() && this.shownAt >= v;
  }

  private async refresh(fresh: boolean | { v: number } = false): Promise<void> {
    const ch = this.d.channel();
    if (ch === null || this.destroyed) return;
    if (this.loading) {
      // 받는 중에 집 바뀜 알림이 오면 끝난 뒤 한 번 더 (받던 것이 바뀌기 전 목록일 수 있다)
      if (typeof fresh === "object") this.pendingV = fresh.v;
      return;
    }
    this.loading = true;
    this.fetchedAt = performance.now();
    try {
      const v = await campHousingApi.village(ch, fresh);
      if (this.destroyed || this.d.channel() !== ch) return;
      // 11/26 지금 그린 것보다 먼저 만든 목록(늦게 온 CDN 옛 응답)은 버린다 — 알림으로 받은 분양이 5분 주기 조회에 다시 사라지지 않게
      if (this.ch === ch && isOlderHomes(this.shownAt, v.generatedAt)) return;
      // 11/26 CDN 주소로 받은 목록이 이 채널에서 이미 들은 집 바뀜보다 먼저 만든 것이면 그 v로 한 번 더 (운영: 분양이 새로고침해야 보였다)
      const stale = typeof fresh === "object" ? null : staleHomesV("camp", v.generatedAt);
      if (stale !== null) this.pendingV = Math.max(this.pendingV, stale);
      this.ch = ch;
      this.shownAt = v.generatedAt;
      this.houses = new Map(v.houses.map((h) => [h.lot, h]));
      this.taken = new Set(v.taken);
      for (const l of CAMP_LOTS) this.draw(l);
      this.syncInteractables();
      const later = this.standLater;
      this.standLater = null;
      if (later && performance.now() - later.at < STAND_LATER_MS) this.standAtLot(later.lot);
    } catch {
      // 다음 주기에 다시
    } finally {
      this.loading = false;
      const v = this.pendingV;
      this.pendingV = 0;
      if (v && !this.destroyed) void this.refresh({ v });
    }
  }

  /** 시험·시트용: 받은 목록을 그대로 쓴다 (dev 페이지) */
  setHouses(houses: readonly CampVillageHouse[], taken: readonly number[] = [], myId: string | null = null): void {
    this.houses = new Map(houses.map((h) => [h.lot, h]));
    this.taken = new Set(taken);
    this.myId = myId;
    this.ch = this.d.channel() ?? 1;
    this.fetchedAt = performance.now();
    for (const l of CAMP_LOTS) this.draw(l);
    this.syncInteractables();
  }

  // ── 그리기 ──

  private stateOf(l: CampLot): HomeState {
    const h = this.houses.get(l.lot) ?? null;
    const c = h ? campOf(h) : null;
    return {
      owned: !!h,
      yard: c?.yard ?? 1,
      wide: !!h && l.kind !== "caravan" && h.tier !== "small",
      snowy: isSnowy(this.concept),
      xmas: this.concept === "christmas",
      night: this.night,
      ...(c?.design ? { design: c.design } : {}),
      ...(l.kind === "rural" ? { fire: this.fire.get(l.lot) ?? this.night } : {}),
    };
  }

  private draw(l: CampLot): void {
    const st = this.stateOf(l);
    const key = planKey(l, st);
    const cur = this.built.get(l.lot);
    if (cur?.key !== key) {
      if (cur) this.clear(cur);
      this.built.delete(l.lot);
      // 숨긴 집이 있는 카라반 자리는 비워 둔다 (펜션·촌캉스는 불 꺼진 집)
      const b = this.build(l, campHomePlan(l, st), key);
      this.built.set(l.lot, b);
    }
    this.setPlate(l);
  }

  private tex(key: string, make?: () => HTMLCanvasElement, camp?: boolean): string {
    const s = this.d.scene;
    if (camp) return campSkin(s, key, this.concept);
    if (make && !s.textures.exists(key)) addCanvasTexture(s, key, { canvas: make() });
    return key;
  }

  private ensureAnims(): void {
    const s = this.d.scene;
    const T = Art.CAMP_TEX;
    if (!s.anims.exists(ANIM_BRAZIER) && s.textures.exists(T.brazierFire))
      s.anims.create({ key: ANIM_BRAZIER, frames: Array.from({ length: 3 }, (_, i) => ({ key: T.brazierFire, frame: i })), frameRate: this.d.reduced ? 3 : 7, repeat: -1 });
    if (!s.anims.exists(ANIM_FLAMES) && s.textures.exists(T.flames))
      s.anims.create({ key: ANIM_FLAMES, frames: Array.from({ length: Art.FLAME_FRAMES }, (_, i) => ({ key: T.flames, frame: i })), frameRate: this.d.reduced ? 4 : 9, repeat: -1 });
  }

  private build(l: CampLot, plan: HomePlan, key: string): Built {
    const s = this.d.scene;
    const b: Built = { key, plan, objs: [], emitters: [], bodies: [], windows: [], lights: [], box: { x0: l.x - 40, y0: l.y - 80, x1: l.x + l.w + 40, y1: l.y + l.h + 30 }, shown: true };
    for (const p of plan.props) {
      const k = this.tex(p.key, p.make, p.camp);
      if (!s.textures.exists(k)) continue;
      const depth = p.depth < FLAT_TAG / 2 ? DEPTH.decal + (p.depth - FLAT_TAG) : p.depth;
      const img = s.add
        .image(p.x, p.y, k, p.frame)
        .setOrigin(p.ox ?? 0.5, p.oy ?? 1)
        .setDepth(depth)
        .setFlipX(!!p.flip);
      if (p.crop) img.setCrop(p.crop[0], p.crop[1], p.crop[2], p.crop[3]);
      b.objs.push(img);
    }
    for (const f of plan.fx) this.addFx(b, f);
    if (plan.hammock) {
      const img = b.objs.find((o): o is Phaser.GameObjects.Image => o instanceof Phaser.GameObjects.Image && o.texture.key.includes("campHammock-"));
      if (img) {
        b.hammock = { id: plan.hammock.id, img, full: img.texture.key };
        if (this.hammockBusy.has(plan.hammock.id)) img.setTexture(this.hammockPostsKey());
      }
    }
    const glow = (p: PlanLight, list: Phaser.GameObjects.Image[]) =>
      list.push(
        s.add
          .image(p.x, p.y, TEX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(p.tint)
          .setScale(p.scale * 0.7)
          .setAlpha(0)
          .setDepth(DEPTH.lights),
      );
    for (const p of plan.windows) glow(p, b.windows);
    for (const p of plan.lights) glow(p, b.lights);
    const body = (group: Phaser.Physics.Arcade.StaticGroup, r: PlanRect) => {
      const z = s.add.zone(r.x + r.w / 2, r.y + r.h / 2, Math.max(2, r.w), Math.max(2, r.h));
      z.removeFromDisplayList();
      group.add(z);
      b.bodies.push({ group, zone: z });
    };
    for (const r of plan.solid) body(this.d.map.colliders, r);
    for (const r of plan.furniture) body(this.d.map.furnitureColliders, r);
    this.applyGlow(b);
    return b;
  }

  private addFx(b: Built, f: PlanFx): void {
    const s = this.d.scene;
    const T = Art.CAMP_TEX;
    switch (f.k) {
      case "smoke": {
        if (this.d.reduced || !s.textures.exists(T.bbqSmoke)) return;
        const e = s.add
          .particles(f.x, f.y, T.bbqSmoke, {
            lifespan: { min: 2600, max: 3600 },
            speedX: { min: 1, max: 6 },
            speedY: { min: -12, max: -7 },
            scale: { start: 0.4 * (f.scale ?? 1), end: 1.5 * (f.scale ?? 1) },
            alpha: { start: f.alpha ?? 0.42, end: 0 },
            frequency: f.freq ?? 760,
          })
          .setDepth(f.depth);
        b.objs.push(e);
        b.emitters.push(e);
        return;
      }
      case "steam": {
        if (this.d.reduced || !s.textures.exists(T.mist)) return;
        const e = s.add
          .particles(
            f.x,
            f.y,
            T.mist,
            f.small
              ? {
                  lifespan: { min: 1800, max: 2600 },
                  speedX: { min: -3, max: 3 },
                  speedY: { min: -9, max: -5 },
                  scale: { start: 0.18, end: 0.5 },
                  alpha: { start: 0.55, end: 0 },
                  frequency: 260,
                  x: { min: -8, max: 8 },
                }
              : {
                  lifespan: { min: 1600, max: 2400 },
                  speedX: { min: -2, max: 3 },
                  speedY: { min: -8, max: -4 },
                  scale: { start: 0.14, end: 0.42 },
                  alpha: { start: 0.5, end: 0 },
                  frequency: 320,
                  x: { min: -4, max: 4 },
                },
          )
          .setDepth(f.depth);
        b.objs.push(e);
        b.emitters.push(e);
        return;
      }
      case "flame": {
        const anim = f.tex === "brazier" ? ANIM_BRAZIER : ANIM_FLAMES;
        const key = f.tex === "brazier" ? T.brazierFire : T.flames;
        if (!s.textures.exists(key)) return;
        const sp = s.add.sprite(f.x, f.y, key, f.frame).setOrigin(0.5, 1).setScale(f.sx, f.sy).setDepth(f.depth);
        if (s.anims.exists(anim) && !this.d.reduced) sp.play({ key: anim, startFrame: f.frame % (f.tex === "brazier" ? 3 : Art.FLAME_FRAMES) });
        b.objs.push(sp);
        return;
      }
      case "text": {
        if (!f.text) return;
        this.d.atlas.ensure(f.text);
        const t = s.add.bitmapText(f.x, f.y, FONT_KEY, f.text, FONT_PX).setOrigin(0.5, 0.5).setTint(f.tint).setDepth(f.depth);
        t.setScale(Math.min(f.maxScale, f.maxW / Math.max(1, t.width)));
        b.objs.push(t);
        return;
      }
      case "string":
        if (this.concept === "christmas") this.xmasString(b, f.a, f.b, f.i);
        else this.warmString(b, f.a, f.b, f.i);
        return;
    }
  }

  /** 크리스마스판 전구 줄 (CampConceptDecor와 같은 그림 — 반짝임은 conceptLights) */
  private xmasString(b: Built, a: readonly [number, number, number], c: readonly [number, number, number], i: number): void {
    const s = this.d.scene;
    const dx = Math.round(c[0] - a[0]);
    const dy = Math.round(c[1] - a[1]);
    const sag = Math.max(5, Math.round(Math.hypot(dx, dy) * 0.09));
    const key = `chome-string-${dx}-${dy}-${sag}`;
    if (!s.textures.exists(key)) {
      const st = lightString(dx, dy, sag);
      addCanvasTexture(s, key, { canvas: st.canvas });
      addCanvasTexture(s, `${key}~glow`, { canvas: bulbGlowSheet(st.canvas.width, st.canvas.height, st.bulbs), frameW: st.canvas.width, frameH: st.canvas.height });
    }
    const o = lightStringOrigin(dx, dy);
    const x = a[0] - o.ox;
    const y = a[1] - o.oy;
    b.objs.push(
      s.add
        .image(x, y, key)
        .setOrigin(0, 0)
        .setDepth(Math.max(a[2], c[2]) + 2),
    );
    b.objs.push(addTwinkle(s, `${key}~glow`, x, y, 0, 0, { reduced: this.d.reduced, phase: i % 2, alpha: 0.9 }));
  }

  /** 기본·겨울판 줄 조명: 전선 + 따뜻한 전구 (밤에 번진다) */
  private warmString(b: Built, a: readonly [number, number, number], c: readonly [number, number, number], i: number): void {
    const s = this.d.scene;
    const T = Art.CAMP_TEX;
    const depth = Math.max(a[2], c[2]);
    const g = s.add.graphics().setDepth(depth + 2);
    g.lineStyle(1, 0x2a2018, 0.9);
    g.beginPath();
    const sag = Math.max(5, Math.hypot(c[0] - a[0], c[1] - a[1]) * 0.09);
    const pt = (t: number) => ({ x: a[0] + (c[0] - a[0]) * t, y: a[1] + (c[1] - a[1]) * t + Math.sin(t * Math.PI) * sag });
    for (let k = 0; k <= 16; k++) {
      const p = pt(k / 16);
      if (k === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.strokePath();
    b.objs.push(g);
    if (!s.textures.exists(T.bulb)) return;
    for (let k = 1; k <= 6; k++) {
      const p = pt(k / 7);
      b.objs.push(
        s.add
          .image(p.x, p.y + 1, T.bulb)
          .setOrigin(0.5, 0)
          .setDepth(depth + 3)
          .setTint(this.night ? 0xfff4c8 : 0x8a7a60),
      );
      if (this.night && s.textures.exists(T.bulbGlow))
        b.objs.push(
          s.add
            .image(p.x, p.y + 3, T.bulbGlow)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(DEPTH.lights + 1)
            .setAlpha(0.75 + 0.1 * Math.sin(i + k)),
        );
    }
  }

  private clear(b: Built): void {
    for (const o of b.objs) o.destroy();
    for (const g of [...b.windows, ...b.lights]) g.destroy();
    // 게임째 닫힐 때는 physics 그룹이 먼저 비워져 있어요 (children 없음) — 그땐 몸통만 지워요
    for (const { group, zone } of b.bodies) {
      if (group.children) group.remove(zone, true, true);
      else zone.destroy();
    }
    b.objs.length = 0;
  }

  /** 밤 빛 세기 (창 = 밤에만 · 소품 불빛 = 어두울수록) */
  private applyGlow(b: Built): void {
    const on = Math.max(0, Math.min(1, (this.darkness - 0.18) / 0.4));
    const vis = b.shown;
    b.plan.windows.forEach((p, i) => b.windows[i]?.setAlpha(this.night ? p.base * on : 0).setVisible(vis));
    b.plan.lights.forEach((p, i) => b.lights[i]?.setAlpha(p.base * on).setVisible(vis));
  }

  // ── 문패·팻말 ──

  private setPlate(l: CampLot): void {
    const h = this.houses.get(l.lot) ?? null;
    const hidden = !h && this.taken.has(l.lot);
    const b = this.built.get(l.lot);
    const plan = b?.plan;
    const mine = !!h && h.id === this.myId;
    const key = h ? `h|${plan?.plate.bottom}|${h.name}|${h.ownerName}|${h.score}|${mine ? 1 : 0}` : hidden ? `hid|${l.lot}` : `sale|${l.lot}|${plan?.plate.bottom}`;
    const old = this.plates.get(l.lot);
    if (old?.key === key) return;
    if (old) destroyPlate(old);
    const s = this.plateScale;
    if (h && plan) {
      const labels = houseLotLabels(this.d.scene, this.d.atlas, { cx: plan.plate.cx, bottom: plan.plate.bottom, w: plan.plate.w }, h, plateHead(l, h.name), mine, DEPTH.labels - 1);
      const short = l.kind === "caravan";
      if (short) labels.pop()?.destroy();
      const plate: LotPlate = { key, sign: null, labels, short };
      for (const t of labels) t.setScale(-1);
      scalePlate(plate, s);
      this.plates.set(l.lot, plate);
      return;
    }
    const at = { x: plan?.plate.cx ?? l.x + l.w / 2, y: plan?.plate.bottom ?? l.y };
    const p = new SignPlate(this.d.scene, this.d.atlas, at.x, at.y, hidden ? campLotShort(l.lot) : saleLabel(l), hidden ? PLATE_LOT_HOUSE : PLATE_LOT_FREE);
    p.setScale(s);
    this.plates.set(l.lot, { key, sign: p, labels: [] });
  }

  // ── E ──

  /** 터 상호작용: 집이 있으면 문 앞 「내 집 들어가기」·「○○ 놀러 가기」, 빈 터면 문 앞(빈 카라반 자리는 가운데) 「분양 안내」 — 그 종류 분양 NPC에게 가라는 안내만 */
  private syncInteractables(): void {
    const map = this.d.map as { interactables: readonly CampInteractable[] };
    // 맵 고정 목록에 터·집 문이 있으면 빼고 분양 상태대로 다시 끼운다
    // (맵 해먹 qM1~3은 그대로 — 집 마당 해먹은 lot이 붙어 있다)
    const base = map.interactables.filter((o) => o.kind !== "lot" && o.kind !== "house" && o.kind !== "agungi" && !(o.kind === "hammock" && o.lot));
    const homes: CampInteractable[] = [];
    for (const l of CAMP_LOTS) {
      const b = this.built.get(l.lot);
      if (!b) continue;
      const h = this.houses.get(l.lot);
      const door = b.plan.door;
      if (h) {
        const label = h.id === this.myId ? "내 집 들어가기" : `${clampChars(h.name, DOOR_NAME_MAX)} 놀러 가기`;
        homes.push({ id: `house:${l.lot}`, kind: "house", lot: l.lot, x: door.x, y: door.y, r: 16, label });
        const f = b.plan.fire;
        if (f) homes.push({ id: `agungi:${l.lot}`, kind: "agungi", lot: l.lot, x: f.x, y: f.y, r: 18, label: f.on ? "아궁이 불 끄기" : "아궁이 불 피우기" });
        const hm = b.plan.hammock;
        if (hm) homes.push({ id: `hammock:${hm.id}`, kind: "hammock", lot: l.lot, x: hm.x, y: hm.y + 4, r: 18, label: "해먹에 눕기" });
        continue;
      }
      if (this.taken.has(l.lot)) {
        homes.push({ id: `lot:${l.lot}`, kind: "lot", lot: l.lot, x: door.x, y: door.y, r: 16, label: campLotShort(l.lot) });
        continue;
      }
      // 11/26 빈 터 E는 「분양 안내」 (분양 창 대신 그 종류 NPC 안내만 — 운영자 「카라반, 촌캉스도 NPC만으로 통일」)
      homes.push({ id: `lot:${l.lot}`, kind: "lot", lot: l.lot, x: door.x, y: door.y, r: 16, label: emptyDoorAction(l).label });
    }
    map.interactables = [...base, ...homes];
  }

  /** E: 처리했으면 true (집 문 "house"·빈 터 "lot") */
  use(o: { kind: string; lot?: number }): boolean {
    if (o.kind === "agungi" && o.lot) {
      const on = !(this.built.get(o.lot)?.plan.fire?.on ?? false);
      this.setFire(o.lot, on);
      this.d.sendUse?.(fireUseId(o.lot), on ? 1 : 0);
      return true;
    }
    if ((o.kind !== "lot" && o.kind !== "house") || !o.lot) return false;
    const h = this.houses.get(o.lot);
    const site = campLotByNo(o.lot);
    if (h) bridge.emit("portal:open", { kind: "housing", houseId: h.id });
    else if (this.taken.has(o.lot)) this.d.toast(`${campLotShort(o.lot)}은 지금 들어갈 수 없어요.`);
    else if (this.ch === null) this.d.toast("캠핑장 집을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.");
    else if (site) this.d.toast(emptyDoorAction(site).toast);
    return true;
  }

  /** 11/26 누가 누워 있는 마당 해먹 (CampScene이 알린다) → 그 해먹은 기둥만 */
  private hammockBusy: ReadonlySet<string> = new Set();
  setHammockBusy(busy: ReadonlySet<string>): void {
    this.hammockBusy = busy;
    for (const b of this.built.values()) {
      if (!b.hammock) continue;
      const key = busy.has(b.hammock.id) ? this.hammockPostsKey() : b.hammock.full;
      if (b.hammock.img.active && b.hammock.img.texture.key !== key) b.hammock.img.setTexture(key);
    }
  }
  private hammockPostsKey(): string {
    const snowy = isSnowy(this.concept);
    const key = `chome-campHammock-posts-${snowy ? "s" : "n"}`;
    return this.tex(key, () => {
      const c = campHammockGrid(null).toCanvas();
      return snowy ? snowCap(c, { depth: 1, maxY: 8 }) : c;
    });
  }

  /** 11/26 같은 채널 누가 아궁이 불을 켰다·껐다 (실시간 use). 아궁이 알림이면 true */
  onUse(u: string, a: number): boolean {
    const m = FIRE_USE_RE.exec(u);
    const l = m ? campLotByNo(Number(m[1])) : undefined;
    if (!l || l.kind !== "rural") return false;
    this.setFire(l.lot, a > 0);
    return true;
  }

  private setFire(lot: number, on: boolean): void {
    const l = campLotByNo(lot);
    if (!l || this.destroyed) return;
    this.fire.set(lot, on);
    this.draw(l);
    this.syncInteractables();
  }

  /** 앞마당 자리(qH…)가 지금 열려 있는지. 다른 좌석은 늘 true (장면의 좌석 고르기가 이걸로 거른다) */
  seatOpen(seatId: string): boolean {
    const seat = SEAT_BY_ID.get(seatId);
    if (!seat) return true;
    const h = this.houses.get(seat.lot);
    return homeSeatOpen(seat, h ? campOf(h) : null, !h && this.taken.has(seat.lot));
  }

  /** 그 집 문 앞으로 (집에서 나올 때·[내 집 앞으로]) */
  standAtLot(lot: number): void {
    if (this.destroyed) return;
    const b = this.built.get(lot);
    const l = campLotByNo(lot);
    if (!l) return;
    const f = b ? { x: b.plan.door.x, y: b.plan.door.y + DOOR_STAND } : l.door;
    this.d.warp(f.x, f.y);
    // 아직 집 목록을 못 받았다 (집이 있어도 빈 터 그림): 받아 그린 뒤 그 집 문 앞으로 (그새 걸어갔을 만큼 오래면 그대로)
    if (this.ch === null) this.standLater = { lot, at: performance.now() };
  }

  private hostStand(): void {
    const h = campHousingHost.current;
    if (h && h.standAtLot !== this.standFn) h.standAtLot = this.standFn;
  }
  private readonly standFn = (lot: number) => this.standAtLot(lot);

  // ── 매 프레임 ──

  /** darkness 0..1, s = 이름표 크기 (1/zoom), view = 카메라 월드 사각형 (컬링) */
  update(darkness: number, s: number, view?: { x: number; y: number; width: number; height: number }): void {
    if (this.destroyed) return;
    this.hostStand();
    const now = performance.now();
    const ch = this.d.channel();
    if (ch !== null && (ch !== this.ch || now - this.fetchedAt > REFRESH_MS) && !this.loading && now - this.fetchedAt > 3000) void this.refresh();
    const concept = this.d.concept();
    const night = darkness > NIGHT_AT;
    if (night !== this.night || concept !== this.concept) {
      // 11/26 밤낮이 바뀌면 아궁이 불은 다시 기본(밤 켜짐·낮 꺼짐)으로 (처음 판정 때는 그대로)
      if (night !== this.night && this.nightKnown) this.fire.clear();
      this.night = night;
      this.concept = concept;
      for (const l of CAMP_LOTS) this.draw(l);
      this.syncInteractables();
    }
    this.nightKnown = true;
    this.darkness = darkness;
    for (const b of this.built.values()) {
      if (view) {
        const shown = b.box.x1 > view.x - CULL_PAD && b.box.x0 < view.x + view.width + CULL_PAD && b.box.y1 > view.y - CULL_PAD && b.box.y0 < view.y + view.height + CULL_PAD;
        if (shown !== b.shown) {
          b.shown = shown;
          for (const o of b.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible?.(shown);
          for (const e of b.emitters) {
            if (shown) e.start();
            else e.stop();
          }
        }
      }
      this.applyGlow(b);
    }
    if (Math.abs(s - this.plateScale) > 1e-4) {
      this.plateScale = s;
      for (const p of this.plates.values()) {
        p.sign?.setScale(s);
        scalePlate(p, s);
      }
    }
  }

  /** 밤 어둠 구멍 (CampScene 빛 모으기) */
  addLights(lit: { add(x: number, y: number, r: number, a: number): void }): void {
    if (this.destroyed) return;
    const on = Math.max(0, Math.min(1, (this.darkness - 0.18) / 0.4));
    if (on <= 0) return;
    for (const b of this.built.values()) {
      if (!b.shown) continue;
      if (this.night) for (const w of b.plan.windows) lit.add(w.x, w.y + 4, 22 * w.scale * 1.6, 0.6 * on);
      for (const p of b.plan.lights) lit.add(p.x, p.y + 6, 30 * p.scale * 1.4, 0.85 * on);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const o of this.offs.splice(0)) o();
    for (const b of this.built.values()) this.clear(b);
    this.built.clear();
    for (const p of this.plates.values()) destroyPlate(p);
    this.plates.clear();
    const h = campHousingHost.current;
    if (h?.standAtLot === this.standFn) h.standAtLot = undefined;
  }
}

function destroyPlate(p: LotPlate): void {
  p.sign?.destroy();
  for (const t of p.labels) t.destroy();
}

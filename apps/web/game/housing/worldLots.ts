import * as Phaser from "phaser";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";
import { houseTitle } from "@/lib/housing/catalog";
import type { VillageHouse } from "@/lib/housing/types";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { WP } from "../sprites/worldProps";
import { fitFirst } from "../text/fitLabel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { emptyLotLayers, litAlpha, lotLayers, type LotSize } from "./exterior";
import { snowGrid, snowLawn } from "../sprites/winterArt";
import { addTwinkle } from "../world/conceptLights";
import { winterLotLayers } from "./winterLots";

// 필지 한 칸을 Phaser 오브젝트로 세운다 (메인 맵 주거 구역 WorldMap.setHouses · 분양 마을 VillageScene 공용).
//  마당(바닥 깊이) → 집(깊이 = 집 밑변) → 밤 창 불빛(집 바로 위, 시간대에 따라 알파) → 앞 울타리·우편함·간판·가로등(깊이 = 필지 아랫변)
//  + 굴뚝 연기 + 문패 3줄(지붕 위, 필지 폭에 맞춰 줄임 — houseLotLabels·scaleLotLabel). 필지 위치·크기는 호출자가 준다 (위치는 맵 레이아웃 담당).

export type LotSpot = { lot: number; x: number; y: number };
export type LotLight = { x: number; y: number; scale: number; tint: number; base: number };

export type LotGfx = {
  /** 지울 때 destroy할 것 전부 (문패 제외) */
  objs: Phaser.GameObjects.GameObject[];
  /** 화면 근처일 때만 보이게 할 그림 (컬링 기준점 = 필지 아래 가운데) */
  images: Phaser.GameObjects.Image[];
  labels: Phaser.GameObjects.BitmapText[];
  lights: LotLight[];
  /** 집 몸체 충돌 (월드 좌표). 빈 필지면 null */
  body: { x: number; y: number; w: number; h: number } | null;
  /** 문 앞 (월드 좌표) */
  door: { x: number; y: number } | null;
};

/** concept: 11/17 마을 맵 컨셉 (겨울·크리스마스면 눈 덮인 층 — game/housing/winterLots). 없으면 기본 */
export type LotOpts = { reduced: boolean; labelDepth?: number; concept?: MapConcept };

const texKey = (prefix: string, tier: string, size: LotSize, ext: object) => `lot-${prefix}-${tier}-${size.w}x${size.h}-${Object.values(ext).join("-")}`;

function canvasTex(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) addCanvasTexture(scene, key, { canvas: make() });
  return key;
}

export function drawHouseLot(scene: Phaser.Scene, atlas: GlyphAtlas, lot: LotSpot, size: LotSize, h: VillageHouse, mine: boolean, opts: LotOpts): LotGfx {
  const L = lotLayers(h.exterior, h.tier, size);
  const info = L.info;
  const base = lot.y + info.baseY;
  // 겨울·크리스마스: 같은 자리·크기의 눈 덮인 층 (텍스처 키 앞에 컨셉)
  const concept = opts.concept ?? "default";
  const W = isSnowy(concept) ? winterLotLayers(h.exterior, h.tier, size, concept) : null;
  const pre = W ? `${concept}-` : "";
  const ground = scene.add.image(lot.x, lot.y, canvasTex(scene, pre + texKey("ground", h.tier, size, h.exterior), () => (W ?? L).ground.toCanvas())).setOrigin(0, 0).setDepth(DEPTH.decal + 1);
  const back = scene.add.image(lot.x, lot.y, canvasTex(scene, pre + texKey("back", h.tier, size, {}), () => (W ?? L).back.toCanvas())).setOrigin(0, 0).setDepth(lot.y + L.backBase);
  const house = scene.add.image(lot.x, lot.y, canvasTex(scene, pre + texKey("house", h.tier, size, h.exterior), () => (W ?? L).house.toCanvas())).setOrigin(0, 0).setDepth(base);
  const lit = scene.add
    .image(lot.x, lot.y, canvasTex(scene, texKey("lit", h.tier, size, h.exterior), () => L.lit.toCanvas()))
    .setOrigin(0, 0)
    .setDepth(base + 0.01);
  trackLit(scene, lit);
  const front = scene.add.image(lot.x, lot.y, canvasTex(scene, pre + texKey("front", h.tier, size, h.exterior), () => (W ?? L).front.toCanvas())).setOrigin(0, 0).setDepth(lot.y + size.h - 2);
  const objs: Phaser.GameObjects.GameObject[] = [ground, back, house, lit, front];
  const images = [ground, back, house, lit, front];
  // 크리스마스: 처마 전구 빛 겹 (두 장 번갈아 반짝, 밤에 환하게)
  if (W?.glow) {
    const gk = pre + texKey("glow", h.tier, size, h.exterior);
    if (!scene.textures.exists(gk)) addCanvasTexture(scene, gk, { canvas: W.glow, frameW: size.w, frameH: size.h });
    const glow = addTwinkle(scene, gk, lot.x, lot.y, 0, 0, { reduced: opts.reduced, phase: lot.lot % 2 });
    objs.push(glow);
    images.push(glow);
  }
  // 굴뚝 연기 (움직임 줄이기면 끈다)
  if (!opts.reduced && scene.textures.exists(WP.smoke))
    for (const [i, c] of info.chimneys.entries()) {
      const smoke = scene.add
        .particles(lot.x + c.x, lot.y + c.y, WP.smoke, {
          lifespan: { min: 2600, max: 3600 },
          speedX: { min: 1, max: 6 },
          speedY: { min: -11, max: -6 },
          scale: { start: 0.22, end: 0.9 },
          alpha: { start: 0.3, end: 0 },
          frequency: 900 + ((lot.lot * 7 + i * 3) % 5) * 120,
        })
        .setDepth(base + 0.02);
      objs.push(smoke);
    }
  // 문패: 지붕 위 세 줄 (houseLotLabels — 포구 오두막과 같이 쓴다)
  const labels = houseLotLabels(scene, atlas, { cx: lot.x + size.w / 2, bottom: lot.y + info.roofTop - 2, w: size.w }, h, `${lot.lot}번지 · `, mine, opts.labelDepth ?? DEPTH.labels - 1);
  return {
    objs,
    images,
    labels,
    lights: info.lights.map((l) => ({ x: lot.x + l.x, y: lot.y + l.y, scale: l.r / 40, tint: l.color, base: 0.5 })),
    body: { x: lot.x + info.body.x, y: lot.y + info.body.y, w: info.body.w, h: info.body.h },
    door: { x: lot.x + info.door.x, y: lot.y + info.door.y },
  };
}

/**
 * 문패 자리: 가운데 x · 줄 길이를 맞출 폭 (월드 px) + 맨 아랫줄 바닥 y(지붕 위, 보통) 또는 맨 윗줄 위 y(top — 11/20 포구 맨 윗줄 오두막처럼
 * 집 아래 땅에 세울 때. 줌이 바뀌어도 윗줄 자리는 그대로이고 아래로 늘어나요)
 */
export type LotPlateSpot = { cx: number; w: number } & ({ bottom: number } | { top: number });

/**
 * 문패: 지붕 위 세 줄 (1줄 번지 · 집 이름, 2줄 주인 · 점수, 3줄 호칭 작게). 마을 집(drawHouseLot)·포구 오두막(game/sea/seaHousing) 공용.
 *  11/16 닉네임 12자·집 이름 20자면 이웃 필지 문패와 겹쳐서 한 줄이 필지 폭을 넘으면 집 이름·주인 이름만 "…"로 줄인다 (번지·점수는 그대로).
 *  줌이 바뀌면 scaleLotLabel로 다시 맞춘다 (글자는 GlyphAtlas가 measure 때 그려 넣으므로 호칭도 한 번 잰다)
 *  11/18 호칭이 폭 때문에 어떤 집은 빠지고 어떤 집은 붙어 들쭉날쭉했다 → 셋째 줄에 늘 작게 (사용자)
 *  head = 첫 줄 앞머리 ("3번지 · ", 오두막 "3번 터 · ")
 */
export function houseLotLabels(
  scene: Phaser.Scene,
  atlas: GlyphAtlas,
  at: LotPlateSpot,
  h: Pick<VillageHouse, "name" | "ownerName" | "score">,
  head: string,
  mine: boolean,
  depth: number,
): Phaser.GameObjects.BitmapText[] {
  const t = houseTitle(h.score);
  const line1 = (max: number) => fitFirst([{ head, body: h.name, tail: mine ? " (내 집)" : "" }], max, (s) => atlas.measure(s));
  const line2 = (max: number) =>
    fitFirst(
      [{ body: h.ownerName, tail: ` · ${h.score}점` }],
      max,
      (s) => atlas.measure(s),
    );
  const zoom = scene.cameras.main.zoom;
  // 11/18 줄 간격은 캐릭터 칭호 ↔ 이름처럼 화면에서 늘 같게 (보이는 글자 사이 LINE_GAP px, 줌이 바뀌면 scaleLotLabel이 다시 놓는다)
  const pitch = FONT_PX - atlas.inkPad.top - atlas.inkPad.bottom + LINE_GAP;
  const { cx, w } = at;
  // 줄 자리: 바닥 기준이면 아래부터 0·1·2, 윗줄 기준이면 위부터 -1·-2·-3 (y = 기준 - 줄 × 간격 — scaleLotLabel이 같은 식으로 다시 놓는다)
  const top = "top" in at;
  const base = top ? at.top : at.bottom;
  const [r1, r2, r3] = top ? [-1, -2, -3] : [2, 1, 0];
  return [
    plate(scene, cx, base, r1, pitch, w, zoom, line1).setTint(mine ? 0xffe39a : 0xf2ead3).setAlpha(0.92).setDepth(depth),
    plate(scene, cx, base, r2, pitch, w, zoom, line2).setTint(0xb9b4a4).setAlpha(0.85).setDepth(depth),
    plate(scene, cx, base, r3, pitch, w, zoom, () => (atlas.measure(`「${t.name}」`), `「${t.name}」`), TITLE_PX).setTint(0x9fb6a0).setAlpha(0.7).setDepth(depth),
  ];
}

// ── 문패 폭 맞추기 ── 문패는 1/zoom 배율(화면에서 1:1 글씨)이라 같은 글씨도 줌에 따라 필지 폭 대비 길이가 달라진다.
//  한 줄의 최대 폭 = (필지 폭 - 여백) × 줌 (화면 px). 이웃 필지(간격 4px 이상) 문패와 가장 작은 줌(1.5)에서도 15px 넘게 떨어진다.

/** 필지 폭에서 문패 양옆으로 비워 둘 여백 (월드 px, 합) */
const PLATE_PAD = 6;
/** 문패 줄 사이 보이는 간격 (화면 px) — 캐릭터 칭호 ↔ 이름 간격(AvatarView TITLE_GAP)과 같게 */
const LINE_GAP = 6;
const plateFits = new WeakMap<Phaser.GameObjects.BitmapText, (zoom: number) => string>();
/** 문패 줄 자리: 기준 y(월드 — 맨 아랫줄 바닥, 윗줄 기준이면 맨 윗줄 위)·몇째 줄(아래부터 0, 윗줄 기준이면 위부터 -1)·줄 간격(화면 px) */
const plateRows = new WeakMap<Phaser.GameObjects.BitmapText, { bottom: number; row: number; pitch: number }>();

/** 문패 셋째 줄(호칭) 글씨 크기. 픽셀 글꼴이라 12보다 작게 줄이면 뭉개져서 크기는 같게, 옅은 색·「」로 작아 보이게 */
const TITLE_PX = FONT_PX;

function plate(scene: Phaser.Scene, x: number, bottom: number, row: number, pitch: number, lotW: number, zoom: number, fit: (max: number) => string, px = FONT_PX): Phaser.GameObjects.BitmapText {
  const f = (z: number) => fit(Math.floor((lotW - PLATE_PAD) * z));
  const l = scene.add.bitmapText(x, bottom - (row * pitch) / zoom, FONT_KEY, f(zoom), px).setOrigin(0.5, 1);
  plateFits.set(l, f);
  plateRows.set(l, { bottom, row, pitch });
  return l;
}

/** 라벨 배율(1/zoom)을 바꿀 때 부른다: 문패면 새 줌에 맞춰 글씨를 다시 줄이거나 늘린다 (문패가 아니면 그대로) */
export function scaleLotLabel(l: Phaser.GameObjects.BitmapText, s: number): void {
  if (l.scaleX === s) return;
  l.setScale(s);
  const r = plateRows.get(l);
  if (r) l.setY(r.bottom - r.row * r.pitch * s);
  const f = plateFits.get(l);
  if (!f) return;
  const text = f(1 / s);
  if (text !== l.text) l.setText(text);
}

export function drawEmptyLot(scene: Phaser.Scene, atlas: GlyphAtlas, lot: LotSpot, size: LotSize, taken: boolean, opts: LotOpts): LotGfx {
  const L = emptyLotLayers(taken, size);
  const kind = taken ? "taken" : "free";
  // 겨울·크리스마스: 빈 집터도 눈밭 (팻말·말뚝 윗면에 눈)
  const snowy = isSnowy(opts.concept ?? "default");
  const pre = snowy ? "snow-" : "";
  const ground = scene.add
    .image(lot.x, lot.y, canvasTex(scene, `${pre}lot-empty-ground-${kind}-${size.w}x${size.h}`, () => (snowy ? snowLawn(L.ground) : L.ground).toCanvas()))
    .setOrigin(0, 0)
    .setDepth(DEPTH.decal + 1);
  const front = scene.add
    .image(lot.x, lot.y, canvasTex(scene, `${pre}lot-empty-front-${kind}-${size.w}x${size.h}`, () => (snowy ? snowGrid(L.front, 1) : L.front).toCanvas()))
    .setOrigin(0, 0)
    .setDepth(lot.y + L.signY);
  // 11/15 「분양 중」을 「누가 사는 중」으로 읽은 사람이 있어서 → 빈 집터 (E로 분양받기)
  const text = taken ? `${lot.lot}번지 · 공사 중` : `${lot.lot}번지 · 빈 집터`;
  atlas.ensure(text);
  const label = scene.add
    .bitmapText(lot.x + size.w / 2, lot.y + L.signY - 24, FONT_KEY, text, FONT_PX)
    .setOrigin(0.5, 1)
    .setTint(taken ? 0x908b7b : 0xd9d4c3)
    .setAlpha(0.8)
    .setDepth(opts.labelDepth ?? DEPTH.labels - 1);
  return { objs: [ground, front], images: [ground, front], labels: [label], lights: [], body: null, door: null };
}

// ── 밤 창 불빛: 씬마다 타이머 하나가 시간대(KST, ?time= 덮어쓰기 포함)를 보고 알파를 맞춘다 ──

const litSets = new WeakMap<Phaser.Scene, Set<Phaser.GameObjects.Image>>();

function currentLit(): number {
  const search = typeof location === "undefined" ? "" : location.search;
  return litAlpha(ambienceAt(Date.now(), parseAmbienceOverride(search)).palette.lightGlow);
}

function trackLit(scene: Phaser.Scene, img: Phaser.GameObjects.Image): void {
  let set = litSets.get(scene);
  if (!set) {
    const s = new Set<Phaser.GameObjects.Image>();
    litSets.set(scene, s);
    set = s;
    scene.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        const a = currentLit();
        for (const o of s) {
          if (!o.active) s.delete(o);
          else o.setAlpha(a);
        }
      },
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => litSets.delete(scene));
  }
  set.add(img);
  img.setAlpha(currentLit());
}

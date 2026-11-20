import * as Phaser from "phaser";
import { DIR, SEA_BOARDWALK, SEA_BUS_STOP, SEA_KIOSK, SEA_LIGHTHOUSE, SEA_LOTS, SEA_LOT_GATE_W, SEA_PIER_ARM, SEA_PONTOON_RAMP, SEA_REALTY, type DirId, type SeaLot } from "@tomb/protocol";
import { isCottageStyle, type PlotTierId } from "@/lib/housing/catalog";
import { isSnowy, parseConceptOverride, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import { breathPuff, bulbGlowSheet, doorWreath, giftPile, snowCap, snowGlint, snowman, snowRoof, type Bulb, type SnowCapOpts } from "../sprites/winterArt";
import { addTwinkle } from "../world/conceptLights";
import { GULL_TEX, GULL_VEND_W } from "./gullArt";
import * as Art from "./seaArt";
import { cottageRoofArea } from "./seaCottageArt";
import * as Lay from "./seaLayout";
import type { SeaMap } from "./SeaMap";
import type { SeaShips } from "./seaShips";
import { SEA_TEX_PREFIX } from "./seaTypes";
import { drawString, lighthouseRailBulbs, lighthouseSpiral, putPx, ribbonLamp, seaXmasSpots, SHIP_DRESS, snowDeck, stringLights, type Img, type Pt } from "./seaWinterArt";
import { seaSnowyGround } from "./seaWinterGround";

// 11/17 달물결 포구 맵 컨셉 (lib/mapConcept — 마을 ConceptDecor와 같은 틀). 배치·충돌·상호작용 자리·물때·SEA_MAP_VERSION은 그대로, 겉모습만 바꿔요.
//  - 바닥: SeaMap이 눈 덮인 덩어리 그림으로 (seaWinterGround) + 물가 살얼음 띠 + 차가운 물빛. 바다는 얼리지 않아요 (헤엄·카약·제트스키 그대로)
//  - 소품 그림: "sea-" 텍스처 자리에서 바로 눈을 얹어요 (원본은 따로 두었다가 기본으로 돌아가면 되돌려요). 나중에 생기는 그림(별장·배)도
//    텍스처가 생기는 순간 덮어요. 데크는 위에서 본 판자 위 눈 + 앞 테 고드름, 지붕은 통째로 눈, 나머지는 윗면에 소복이
//  - 겨울: 위 + 캐릭터 입김 (물속·탈것 위는 빼요)
//  - 크리스마스: 겨울 + 등대 나선 전구, 선착장 난간·산책로 가로등 사이 전구 줄, 정류장·부동산·매점 처마 전구, 별장 터·오두막 리스,
//    가로등 리본, 해변 눈사람·선물 더미, 지나가는 배 장식 줄·오징어잡이배 알록달록 전구, 가끔 반짝이는 눈
//  유령선(토요일 밤)은 그대로 두고, 그 자리(SEA_GHOST_BERTH·널빤지 쪽 선착장 끝)에는 장식을 두지 않아요.
//  움직이는 건 빛 겹 프레임 바꾸기(conceptLights 타이머 하나)와 작은 파티클 풀(입김 셋·반짝임 하나)뿐이에요.

const P = SEA_TEX_PREFIX;
const BREATH = "concept-breath";
const GLINT = "concept-glint";

/** 지금 판: 주소 시험 값(?concept=, 실서버는 막힘)이 먼저, 없으면 관리자가 고른 값 */
export function seaConceptNow(): MapConcept {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return parseConceptOverride(search) ?? bridge.last("map:concept")?.concept ?? "default";
}

// ── 그림 바꾸기 (텍스처 자리에서) ──

type Skin = {
  /** 위에서 본 데크 (앞 테 줄 수 · 일부만이면 사각형) */
  deck?: { lip: number; area?: { x0: number; y0: number; x1: number; y1: number } };
  /** 지붕으로 볼 픽셀 (통째로 눈 + 처마 고드름) */
  roof?: (x: number, y: number, c: number) => boolean;
  /** 윗면 눈 (maxY를 안 주면 그림 아래 2줄은 그림자라 빼요, 0이면 맨 아래 한 줄만 빼요) */
  cap?: SnowCapOpts;
  /** 크리스마스 장식 (캔버스에 바로 그려요). 전구 자리를 돌려주면 빛 겹(키~xglow)을 만들어요 */
  xmas?: (c: HTMLCanvasElement) => Bulb[];
};

const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

/** 캔버스 픽셀을 받아 고치고 다시 써요 */
function withImg<T>(c: HTMLCanvasElement, fn: (m: Img) => T): T {
  const ctx = c.getContext("2d")!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const out = fn({ w: img.width, h: img.height, d: img.data });
  ctx.putImageData(img, 0, 0);
  return out;
}

/** 리스 (11×12)를 (x, y) 왼쪽 위에 */
function wreath(c: HTMLCanvasElement, x: number, y: number): void {
  c.getContext("2d")!.drawImage(doorWreath(), Math.round(x), Math.round(y));
}

/** 처마 전구 줄 + (주면) 리스 */
function eaveDress(a: Pt, b: Pt, sag: number, door?: Pt): (c: HTMLCanvasElement) => Bulb[] {
  return (c) => {
    const bulbs = withImg(c, (m) => drawString(m, a, b, sag));
    if (door) wreath(c, door.x, door.y);
    return bulbs;
  };
}

/** 별장 터 (seaArt lotArt와 같은 좌표): 출입구 기둥·데크 */
function lotGeom(l: SeaLot) {
  const top = Art.LOT_RISE;
  const bot = Art.LOT_RISE + l.h - 2;
  const x0 = 2;
  const x1 = 2 + l.w - 1;
  const gx0 = 2 + l.w / 2 - SEA_LOT_GATE_W / 2;
  const gy0 = top + l.h / 2 - SEA_LOT_GATE_W / 2;
  return { top, bot, x0, x1, gx0, gx1: gx0 + SEA_LOT_GATE_W, gy0, gy1: gy0 + SEA_LOT_GATE_W };
}

const DECK_LIP: Readonly<Record<string, number>> = { pier: 0, pierEnd: 6, pierArm: 5, pontoon: 4, pontoonRamp: 3, kayakWalk: 0, kayakDock: 4, kayakHead: 2, breakwater: 0, tip: 6, ledge: 0 };

/** 텍스처 이름("sea-" 뺀 것) → 바꾸는 법. 목록에 없으면 그대로 (물·물거품·갈매기·유령선·빛 등) */
function skinOf(name: string): Skin | null {
  if (name in DECK_LIP) return { deck: { lip: DECK_LIP[name] } };
  if (/^pine\d$/.test(name)) return { cap: { depth: 3, maxY: 0 } };
  if (/^(bush\d|palm)$/.test(name)) return { cap: { depth: 2 } };
  if (/^(beachGrass\d|flower\d|stone\d|drift|shell\d)$/.test(name)) return { cap: { depth: 1, maxY: 0 } };
  if (/^(busSign|timetable|mailbox|lotSign|netRack|crates|post|tetra\d|footbath|ashLogs|driftLog|picnicTop|picnicPlank|bench|lounger|parasol\d|rock\d+)$/.test(name)) return { cap: { depth: 2 } };
  if (/^(squid|kayak-(side|vert)\d)$/.test(name)) return { cap: { depth: 1, maxY: 0 } };
  switch (name) {
    case "lamp":
      return { cap: { depth: 2 }, xmas: (c) => (withImg(c, ribbonLamp), []) };
    case "shelter":
      // 하늘빛 골함석 지붕 (4~13줄) · 크리스마스엔 처마 전구 + 뒷벽 리스
      return { roof: (_x, y) => y >= 4 && y <= 13, xmas: eaveDress({ x: 1, y: 14 }, { x: Art.SHELTER_ART_W - 2, y: 14 }, 2, { x: Art.SHELTER_ART_W / 2 - 5, y: 18 }) };
    case "realty":
      // 마을 분양 사무소와 같은 그림: 지붕 13~23줄 (간판·간판 다리는 빼요), 문 위 리스 + 처마 전구
      return { roof: (_x, y, c) => y >= 13 && y <= 23 && lum(c) > 60, xmas: eaveDress({ x: 3, y: 24 }, { x: 56, y: 24 }, 3, { x: 25, y: 34 }) };
    case "gullVend":
      // 11/17 r2 과자 자판기: 차양·위에 앉은 갈매기 머리에 소복이 · 크리스마스엔 차양 끝 전구 줄
      return { cap: { depth: 2 }, xmas: eaveDress({ x: 1, y: 10 }, { x: GULL_VEND_W - 2, y: 10 }, 1) };
    case "kiosk":
      // 차양 위에 소복이 · 크리스마스엔 차양 끝 전구 + 앞판 리스
      return { cap: { depth: 3 }, xmas: eaveDress({ x: 2, y: 23 }, { x: Art.KIOSK_ART_W - 3, y: 23 }, 2, { x: Art.KIOSK_ART_W / 2 - 5, y: 44 }) };
    case "lighthouse":
      return {
        // 등실 지붕 (1~8줄) 통째로 눈, 전망대·줄무늬 턱엔 윗면 눈
        roof: (_x, y) => y >= 1 && y <= 8,
        cap: { depth: 2, maxY: Art.LIGHTHOUSE_ART_H - 4 },
        xmas: (c) =>
          withImg(c, (m) => {
            const sp = lighthouseSpiral();
            for (const p of sp.wire) if (m.d[(p.y * m.w + p.x) * 4 + 3] > 200) putPx(m, p.x, p.y, 0x3a3430);
            for (const b of sp.bulbs) putPx(m, b.x, b.y, b.c);
            // 전망대 난간 솔잎 화환 + 전구
            for (let x = 9; x <= 35; x++) putPx(m, x, 20, (x & 1) === 0 ? 0x2b5a36 : 0x3e7a48);
            const rail = lighthouseRailBulbs();
            for (const b of rail) putPx(m, b.x, b.y, b.c);
            return [...sp.bulbs, ...rail];
          }),
      };
    case "boat":
    case "ship-tanker":
    case "ship-cargo": {
      const pts = SHIP_DRESS[name];
      return {
        cap: { depth: 2, maxY: 0 },
        xmas: (c) => withImg(c, (m) => pts.slice(1).flatMap((b, i) => drawString(m, pts[i], b, 2))),
      };
    }
  }
  const lot = /^lot(\d+)$/.exec(name);
  if (lot) {
    const l = SEA_LOTS.find((x) => x.n === +lot[1]);
    if (!l) return null;
    const g = lotGeom(l);
    return {
      deck: l.deck ? { lip: 0, area: { x0: g.x0 + 6, y0: g.bot - 24, x1: g.x1 - 6, y1: g.bot - 4 } } : undefined,
      cap: { depth: 2 },
      // 크리스마스: 출입구 기둥 사이 전구 줄 + 기둥에 리스
      xmas: (c) => {
        const vertical = l.gate !== "s";
        const bulbs = withImg(c, (m) =>
          vertical ? drawString(m, { x: g.x0, y: g.gy0 - 10 }, { x: g.x0, y: g.gy1 - 10 }, 0, 3) : drawString(m, { x: g.gx0, y: g.bot - 10 }, { x: g.gx1, y: g.bot - 10 }, 4),
        );
        if (vertical) wreath(c, g.x0 + 2, g.gy1 - 15);
        else wreath(c, g.gx0 - 5, g.bot - 15);
        return bulbs;
      },
    };
  }
  // 포구 오두막 (game/sea/seaHousing — 사면 생겨요): 지붕 통째로 눈 + 크리스마스엔 문에 리스
  const cot = /^cottage-([a-z]+)-([a-z]+)-(\d+)-[dn]$/.exec(name);
  if (cot) {
    const l = SEA_LOTS.find((x) => x.n === +cot[3]);
    if (!l || !isCottageStyle(cot[1])) return null;
    const r = cottageRoofArea(cot[1], cot[2] as PlotTierId, l);
    return {
      roof: (x, y) => {
        if (y < r.top || y > r.eave || x >= r.towerX0) return false;
        const t = (y - r.top) / Math.max(1, r.eave - r.top);
        return Math.abs(x + 0.5 - r.cx) <= r.halfTop + (r.halfEave - r.halfTop) * t + 0.5;
      },
      xmas: (c) => (wreath(c, r.door.x - 5, r.door.top + 1), []),
    };
  }
  return null;
}

type SkinState = { concept: MapConcept; src: HTMLCanvasElement; orig: HTMLCanvasElement };
/** 텍스처마다 지금 입힌 판·원본 (장면을 닫아도 텍스처는 남으니 모듈에 둬요) */
const states = new Map<string, SkinState>();

/** 바꿀 텍스처인지 ("sea-" + 목록) */
function skinnable(key: string): Skin | null {
  return key.startsWith(P) ? skinOf(key.slice(P.length)) : null;
}

/** 텍스처 하나를 그 판의 그림으로 (이미 그 판이면 그대로) */
function skinTexture(scene: Phaser.Scene, key: string, concept: MapConcept): void {
  const skin = skinnable(key);
  if (!skin || !scene.textures.exists(key)) return;
  const tex = scene.textures.get(key);
  const src = tex.getSourceImage();
  if (!(src instanceof HTMLCanvasElement)) return;
  const target: MapConcept = !isSnowy(concept) ? "default" : concept === "christmas" && skin.xmas ? "christmas" : "winter";
  let st = states.get(key);
  // 같은 키로 새 그림이 올라왔으면 처음부터
  if (st && st.src !== src) {
    states.delete(key);
    st = undefined;
  }
  if ((st?.concept ?? "default") === target) return;
  const orig = st?.orig ?? copyCanvas(src);
  let out = orig;
  let bulbs: Bulb[] = [];
  if (target !== "default") {
    let c = copyCanvas(orig);
    const h = c.height;
    if (skin.deck) withImg(c, (m) => snowDeck(m, skin.deck!.lip, key.length, skin.deck!.area));
    if (skin.roof) c = snowRoof(c, skin.roof, { seed: key.length });
    if (skin.cap) c = snowCap(c, { ...skin.cap, maxY: skin.cap.maxY === 0 ? h - 1 : (skin.cap.maxY ?? h - 2), seed: key.length });
    if (target === "christmas" && skin.xmas) bulbs = skin.xmas(c);
    out = c;
  }
  const ctx = src.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, src.width, src.height);
  ctx.drawImage(out, 0, 0);
  tex.source[0].update();
  if (target === "default") states.delete(key);
  else states.set(key, { concept: target, src, orig });
  if (bulbs.length && !scene.textures.exists(`${key}~xglow`))
    addCanvasTexture(scene, `${key}~xglow`, { canvas: bulbGlowSheet(src.width, src.height, bulbs), frameW: src.width, frameH: src.height });
}

// ── 장식 ──

/** 입김을 낼 사람 (내 캐릭터 + 같은 바닷가 사람, 물속·탈것 위는 장면이 빼고 넘겨요) */
export type SeaActor = { key: object; x: number; y: number; dir: DirId };

export class SeaConceptDecor {
  private concept: MapConcept = "default";
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private breath: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private glints: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private nextBreath = 0;
  private nextGlint = 0;
  private readonly breathAt = new WeakMap<object, number>();
  private destroyed = false;
  /** 새로 생긴 바닷가 그림(별장·늦게 구운 그림)도 생기자마자 덮어요 (프레임을 다 붙인 뒤에) */
  private readonly onAdd = (key: string): void => {
    if (!isSnowy(this.concept) || !skinnable(key)) return;
    queueMicrotask(() => {
      if (!this.destroyed) skinTexture(this.scene, key, this.concept);
    });
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly o: { reduced: boolean; map: SeaMap; ships: () => SeaShips | null },
  ) {
    scene.textures.on(Phaser.Textures.Events.ADD, this.onAdd);
  }

  get current(): MapConcept {
    return this.concept;
  }

  /** 판을 바꿔요 (조금씩 — 장면을 만드는 동안엔 프레임마다 나눠서). 같은 판이어도 처음엔 한 번 다 봐요 */
  *apply(concept: MapConcept): Generator<void, void> {
    this.clear();
    this.concept = concept;
    this.o.map.setConcept(concept);
    this.o.ships()?.setXmas(concept === "christmas");
    let n = 0;
    for (const key of this.scene.textures.getTextureKeys()) {
      if (!skinnable(key)) continue;
      skinTexture(this.scene, key, concept);
      if (++n % 6 === 0) yield;
      if (this.destroyed || this.concept !== concept) return;
    }
    if (!isSnowy(concept)) return;
    this.makeBreath();
    if (concept === "christmas") this.dressChristmas();
  }

  /** 다 돌려요 (바로 바꿀 때) */
  applyNow(concept: MapConcept): void {
    const it = this.apply(concept);
    while (!it.next().done);
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private dressChristmas(): void {
    const s = this.scene;
    const reduced = this.o.reduced;
    // 처마·등대·별장 터 전구 빛 겹 (그림은 skinTexture가 구운 크리스마스 그림 — 자리·원점은 SeaMap과 같게)
    const T = Art.SEA_TEX;
    const glows: [string, number, number, number, number][] = [
      [T.shelter, SEA_BUS_STOP.x, SEA_BUS_STOP.y + 2, 0.5, 1],
      [T.realty, SEA_REALTY.x, SEA_REALTY.y + 2, 0.5, 1],
      [T.kiosk, SEA_KIOSK.x, SEA_KIOSK.y + 3, 0.5, 1],
      [GULL_TEX.vend, Lay.SEA_SNACK_VEND.x, Lay.SEA_SNACK_VEND.y + 2, 0.5, 1],
      [T.lighthouse, SEA_LIGHTHOUSE.x, SEA_LIGHTHOUSE.y + 3, 0.5, 1],
      ...SEA_LOTS.map((l): [string, number, number, number, number] => [T.lot(l.n), l.x - 2, l.y - Art.LOT_RISE, 0, 0]),
    ];
    glows.forEach(([key, x, y, ox, oy], i) => {
      if (s.textures.exists(`${key}~xglow`)) this.add(addTwinkle(s, `${key}~xglow`, x, y, ox, oy, { reduced, phase: i % 2 }));
    });
    // 등대 꼭대기 별빛 (숨 쉬듯)
    if (s.textures.exists(T.lampGlow)) {
      const halo = this.add(
        s.add
          .image(SEA_LIGHTHOUSE.x, SEA_LIGHTHOUSE.y + 3 - Art.LIGHTHOUSE_ART_H + 2, T.lampGlow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xffe08a)
          .setScale(0.7)
          .setAlpha(0.5)
          .setDepth(DEPTH.lights + 3),
      );
      if (!reduced) this.tweens.push(s.tweens.add({ targets: halo, alpha: { from: 0.3, to: 0.75 }, scale: { from: 0.55, to: 0.85 }, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
    }
    // 선착장 난간 전구 줄 (같은 쪽 말뚝 머리끼리 — 낚시 가지·부잔교 다리 입구와 유령선 널빤지 쪽 끝은 비워요)
    const posts = [...Lay.SEA_PIER_POSTS].sort((a, b) => a.x - b.x || a.y - b.y);
    let n = 0;
    for (let i = 0; i + 1 < posts.length; i++) {
      const a = posts[i];
      const b = posts[i + 1];
      if (a.x !== b.x || b.y - a.y > 80) continue;
      const west = a.x < SEA_PIER_ARM.x + SEA_PIER_ARM.w + 10;
      const gap = west ? { y0: SEA_PIER_ARM.y - 6, y1: SEA_PIER_ARM.y + SEA_PIER_ARM.h + 6 } : { y0: SEA_PONTOON_RAMP.y - 6, y1: SEA_PONTOON_RAMP.y + SEA_PONTOON_RAMP.h + 6 };
      if (b.y > gap.y0 && a.y < gap.y1) continue;
      if (west && b.y > 690) continue;
      this.addString({ x: a.x, y: a.y - 9 }, { x: b.x, y: b.y - 9 }, 0, west ? -3 : 3, Math.max(a.y, b.y) - 1, n++);
    }
    // 산책로 가로등 사이 전구 줄 (가로등 머리 아래, 가까운 이웃끼리)
    // 11/20 해녀 할망 좌판 양옆 가로등 사이는 걸지 않아요 (줄이 좌판·할망 앞을 가로질러요 — 좌판 파라솔엔 제 꼬마전구가 있어요)
    const lamps = [...Lay.SEA_LAMPS].sort((a, b) => a.x - b.x);
    const stallX0 = Lay.SEA_BUYER_STALL.x - 22;
    for (let i = 0; i + 1 < lamps.length; i++) {
      const a = lamps[i];
      const b = lamps[i + 1];
      if (b.x - a.x > 330) continue;
      if (a.x < Lay.SEA_BUYER.x + 12 && b.x > stallX0) continue;
      this.addString({ x: a.x, y: a.y - 30 }, { x: b.x, y: b.y - 30 }, Math.max(6, Math.round((b.x - a.x) * 0.06)), 0, SEA_BOARDWALK.y + 1, n++);
    }
    // 해변·정류장 눈사람과 선물 더미 (빈 눈밭에만 — seaXmasSpots)
    const sp = seaXmasSpots();
    sp.snowmen.forEach((p, i) => {
      const k = `concept-snowman-${i % 3}`;
      if (!s.textures.exists(k)) addCanvasTexture(s, k, { canvas: snowman(i % 3) });
      this.add(s.add.image(p.x, p.y + 1, k).setOrigin(0.5, 1).setDepth(p.y));
    });
    sp.gifts.forEach((p, i) => {
      const k = `concept-gifts-${i % 2}`;
      if (!s.textures.exists(k)) addCanvasTexture(s, k, { canvas: giftPile(i % 2) });
      this.add(s.add.image(p.x, p.y + 1, k).setOrigin(0.5, 1).setDepth(p.y));
    });
    // 반짝이는 눈 (화면 안 눈밭 아무 데나 가끔 한 점)
    if (!s.textures.exists(GLINT)) addCanvasTexture(s, GLINT, { canvas: snowGlint() });
    this.glints = this.add(
      s.add
        .particles(0, 0, GLINT, {
          lifespan: { min: 500, max: 900 },
          scale: { start: 0.4, end: 1.1 },
          alpha: { start: 1, end: 0 },
          tint: [0xffffff, 0xe0f0ff, 0xfff4d0],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        })
        .setDepth(DEPTH.lights + 1),
    );
  }

  /** 전구 줄 하나 (a → b, 그림 + 빛 겹) */
  private addString(a: Pt, b: Pt, sag: number, bow: number, depth: number, i: number): void {
    const s = this.scene;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const key = `concept-seaStr-${dx}-${dy}-${sag}-${bow}`;
    const st = stringLights(dx, dy, sag, bow);
    if (!s.textures.exists(key)) {
      addCanvasTexture(s, key, { canvas: st.grid.toCanvas() });
      addCanvasTexture(s, `${key}~glow`, { canvas: bulbGlowSheet(st.grid.w, st.grid.h, st.bulbs), frameW: st.grid.w, frameH: st.grid.h });
    }
    const x = a.x - st.ox;
    const y = a.y - st.oy;
    this.add(s.add.image(x, y, key).setOrigin(0, 0).setDepth(depth));
    this.add(addTwinkle(s, `${key}~glow`, x, y, 0, 0, { reduced: this.o.reduced, phase: i % 2, alpha: 0.9 }));
  }

  private makeBreath(): void {
    if (this.o.reduced) return;
    const s = this.scene;
    if (!s.textures.exists(BREATH)) addCanvasTexture(s, BREATH, { canvas: breathPuff() });
    // 방향마다 하나 (아래·왼쪽·오른쪽): 입에서 앞으로 퍼지며 위로 흩어져요 (마을 입김과 같아요)
    const mk = (sx: [number, number], sy: [number, number]) =>
      this.add(
        s.add
          .particles(0, 0, BREATH, {
            lifespan: { min: 1100, max: 1500 },
            speedX: { min: sx[0], max: sx[1] },
            speedY: { min: sy[0], max: sy[1] },
            scale: { start: 0.6, end: 1.7 },
            alpha: { start: 0.8, end: 0 },
            emitting: false,
          })
          .setDepth(DEPTH.worldMax - 1),
      );
    this.breath = [mk([-4, 4], [2, 6]), mk([-12, -7], [-4, -1]), mk([7, 12], [-4, -1])];
  }

  /** 매 프레임: 입김·반짝임 */
  update(view: Phaser.Geom.Rectangle, actors: () => Iterable<SeaActor>): void {
    if (!isSnowy(this.concept)) return;
    const now = this.scene.time.now;
    if (this.breath.length && now >= this.nextBreath) {
      this.nextBreath = now + 150;
      for (const a of actors()) {
        if (a.x < view.x - 20 || a.x > view.right + 20 || a.y < view.y - 20 || a.y > view.bottom + 40) continue;
        const due = this.breathAt.get(a.key);
        if (due === undefined) {
          this.breathAt.set(a.key, now + Math.random() * 1500);
          continue;
        }
        if (now < due) continue;
        this.breathAt.set(a.key, now + 2200 + Math.random() * 900);
        if (a.dir === DIR.up) continue; // 등을 보이면 입김이 안 보여요
        const e = a.dir === DIR.left ? this.breath[1] : a.dir === DIR.right ? this.breath[2] : this.breath[0];
        e.explode(3, a.x + (a.dir === DIR.left ? -4 : a.dir === DIR.right ? 4 : 0), a.y - 15);
      }
    }
    if (this.glints && now >= this.nextGlint) {
      this.nextGlint = now + (this.o.reduced ? 900 : 140);
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      if (seaSnowyGround(x, y, Lay.seaGroundKind(x, y))) this.glints.explode(1, x, y);
    }
  }

  private clear(): void {
    for (const t of this.tweens) t.remove();
    for (const o of this.objs) o.destroy();
    this.tweens.length = 0;
    this.objs.length = 0;
    this.breath = [];
    this.glints = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.textures.off(Phaser.Textures.Events.ADD, this.onAdd);
    this.clear();
    // 텍스처에 입힌 눈은 남겨 둬요 (다음에 올 때 판이 다르면 apply가 바꿔요)
  }
}

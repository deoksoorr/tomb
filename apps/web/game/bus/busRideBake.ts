import type * as Phaser from "phaser";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { buildCaption, buildClouds, buildDropTrail, buildEndSign, buildFogBand, buildGlassDrop, buildGull, buildLeaf, buildRainTile, buildSnowTile, buildStars, buildStrap, buildSunbeam, LAYERS, panoramaSteps } from "./busRideArt";
import { bakeOrder, captionAt } from "./busRideMath";
import { BUS_RIDE_MS, BUS_TEX_PREFIX, type BusLeg, type BusRoute } from "./busTypes";

// 11/15 버스 창밖 연출 그림 미리 굽기예요.
// 예전엔 창밖 연출이 시작하는 프레임에 파노라마 네 장을 한꺼번에 구워서 한 번씩 멈췄어요(느린 기기 170ms 남짓).
// 이제 정류장 근처·버스가 오는 동안·연출 첫 어둠 동안 프레임마다 조금씩(예산 ms) 구워요.
// 구운 텍스처는 지우지 않아요. 두 번째 여행부터는 굽지 않고 바로 써요.
// 그림은 가는 길·오는 길이 같아요 (오는 길은 같은 그림을 거꾸로 훑어요).
// 11/16 노선마다 따로 구워요 (바닷가 노선 키에는 "sea-"가 붙어요. 캠핑장 키는 예전 그대로).
// 11/17 맵 컨셉(겨울·크리스마스)마다도 따로 구워요 (키에 "winter-"·"christmas-" — 기본판 키는 예전 그대로). 크리스마스판은 전구 빛 두 장(-x0·-x1)이 더 있어요.

/** 앞 차 거리 (가까운 층이 8초 동안 달리는 그림 픽셀). reduced면 짧게 = 천천히 */
export const RIDE_DIST = 1100;
export const RIDE_DIST_REDUCED = 440;
export const LEAF_COLORS = [0xc8482a, 0xe06a34, 0xe8a83a, 0xd8b040] as const;
/** 11/16 바닷가 노선 창밖 갈매기 날갯짓 그림 수 */
export const GULL_FRAMES = 2;
const LEGS: readonly BusLeg[] = ["toCamp", "toVillage"];

/** 11/17 창밖 날씨 그림 [이름, 굽기] — 빗줄기는 흐르는 쪽마다(l = 풍경이 왼쪽으로, r = 오른쪽으로), 눈발·안개 막·창 물방울·물 자국 */
const WEATHER_ART: readonly [string, (seed: number) => HTMLCanvasElement][] = [
  ["rain-far-l", (s) => buildRainTile(s + 11, false, 1)],
  ["rain-near-l", (s) => buildRainTile(s + 13, true, 1)],
  ["rain-far-r", (s) => buildRainTile(s + 11, false, -1)],
  ["rain-near-r", (s) => buildRainTile(s + 13, true, -1)],
  ["snow-far", (s) => buildSnowTile(s + 17, false)],
  ["snow-near", (s) => buildSnowTile(s + 19, true)],
  ["fog", () => buildFogBand()],
  ["drop-0", () => buildGlassDrop(0)],
  ["drop-1", () => buildGlassDrop(1)],
  ["drop-2", () => buildGlassDrop(2)],
  ["trail", () => buildDropTrail()],
];

/** 글꼴이 아직이면 글자 그림을 조금 기다려요 (프레임 수) */
const FONT_WAIT_FRAMES = 90;

function fontReady(): boolean {
  try {
    return typeof document === "undefined" || !document.fonts || document.fonts.check('12px "Galmuri11"');
  } catch {
    return true;
  }
}

export class RideBake {
  /** 그림 씨앗 (구울 때 한 번 정해요) */
  readonly seed = Math.floor(Date.now() / 60_000) % 997;
  private readonly it: Generator<void, void>;
  private finished = false;
  private readonly captions = new Map<string, string>();
  /** 새로 올린 텍스처 (한 번 그려 두기 — takeFresh) */
  private readonly fresh: string[] = [];

  constructor(
    private readonly textures: Phaser.Textures.TextureManager,
    readonly dist: number,
    /** 11/16 노선 (camp = 예전 그대로) */
    readonly route: BusRoute = "camp",
    /** 11/17 맵 컨셉 (창밖 풍경·끝 표지판) */
    readonly concept: MapConcept = "default",
  ) {
    this.it = this.steps();
  }

  get done(): boolean {
    return this.finished;
  }

  /** 이 그림의 텍스처 키예요 */
  key(name: string): string {
    const c = this.concept === "default" ? "" : `${this.concept}-`;
    return this.route === "sea" ? `${BUS_TEX_PREFIX}ride-sea-${c}${this.dist}-${name}` : `${BUS_TEX_PREFIX}ride-${c}${this.dist}-${name}`;
  }

  /** 자막 텍스처 키예요 (아직 안 구웠으면 null) */
  captionKey(text: string): string | null {
    const k = this.captions.get(text);
    return k && this.textures.exists(k) ? k : null;
  }

  /** 구운 텍스처가 아직 다 있는지 봐요 (누가 지웠으면 다시 구워야 해요) */
  intact(): boolean {
    return !this.finished || LAYERS.every((s) => this.textures.exists(this.key(`l-${s.id}`)));
  }

  /**
   * 11/17 날씨 그림이 빠졌으면 지금 구워요 (작은 그림 몇 장이라 한 프레임에 끝나요).
   * 날씨 그림이 생기기 전에 다 구운 굽기(같은 탭에서 이미 버스를 탔다)도 그대로 쓰게
   */
  ensureWeather(): void {
    for (const [name, build] of WEATHER_ART) if (!this.textures.exists(this.key(name))) this.add(name, build(this.seed));
  }

  /** budgetMs 동안만 구워요. 다 구웠으면 true */
  step(budgetMs: number): boolean {
    if (this.finished) return true;
    const t0 = performance.now();
    do {
      if (this.it.next().done) {
        this.finished = true;
        break;
      }
    } while (performance.now() - t0 < budgetMs);
    return this.finished;
  }

  /** 남은 것을 지금 다 구워요 */
  finish(): void {
    while (!this.finished) this.step(1000);
  }

  /** 새로 올린 텍스처 키를 꺼내요 (꺼내면 비어요) */
  takeFresh(): string[] {
    return this.fresh.splice(0);
  }

  private add(name: string, canvas: HTMLCanvasElement): string {
    const k = this.key(name);
    if (!this.textures.exists(k)) {
      this.textures.addCanvas(k, canvas);
      this.fresh.push(k);
    }
    return k;
  }

  private *steps(): Generator<void, void> {
    // 파노라마 (층마다 열 묶음으로 쉬고, 텍스처 올리기도 한 장씩 따로)
    for (let i = 0; i < LAYERS.length; i++) {
      const spec = LAYERS[i];
      if (this.textures.exists(this.key(`l-${spec.id}`))) continue;
      const g = panoramaSteps(spec, bakeOrder(this.route), this.dist, this.seed * 7 + i * 131, this.concept);
      let r = g.next();
      while (!r.done) {
        yield;
        r = g.next();
      }
      yield;
      this.add(`l-${spec.id}`, r.value.canvas);
      if (r.value.lights) {
        yield;
        this.add(`l-${spec.id}-lit`, r.value.lights);
      }
      if (r.value.xmas) {
        yield;
        this.add(`l-${spec.id}-x0`, r.value.xmas[0]);
        this.add(`l-${spec.id}-x1`, r.value.xmas[1]);
      }
      yield;
    }
    // 작은 그림
    const small: [string, () => HTMLCanvasElement][] = [
      ["stars", () => buildStars(this.seed)],
      ["clouds", () => buildClouds(this.seed + 1)],
      ["beam", () => buildSunbeam()],
      ["strap", () => buildStrap()],
      // 11/16 캠핑장 노선은 낙엽, 바닷가 노선은 갈매기
      ...(this.route === "sea"
        ? [0, 1].map((f): [string, () => HTMLCanvasElement] => [`gull-${f}`, () => buildGull(f as 0 | 1)])
        : LEAF_COLORS.map((c, i): [string, () => HTMLCanvasElement] => [`leaf-${i}`, () => buildLeaf(c)])),
    ];
    for (const [name, build] of small) {
      if (!this.textures.exists(this.key(name))) this.add(name, build());
      yield;
    }
    // 11/17 창밖 날씨 (맑은 날에도 미리 — 여행 중에 날씨가 바뀌어도 바로 쓰게)
    for (const [name, build] of WEATHER_ART) {
      if (!this.textures.exists(this.key(name))) this.add(name, build(this.seed));
      yield;
    }
    // 글자 그림 (끝 표지판·자막): 글꼴이 늦으면 조금 기다려요
    for (let i = 0; i < FONT_WAIT_FRAMES && !fontReady(); i++) yield;
    for (const leg of LEGS) {
      if (!this.textures.exists(this.key(`sign-${leg}`))) this.add(`sign-${leg}`, buildEndSign(leg, this.route, this.concept));
      yield;
      const texts = [captionAt(0, BUS_RIDE_MS, leg, this.route), captionAt(BUS_RIDE_MS, BUS_RIDE_MS, leg, this.route)];
      for (const [j, text] of texts.entries()) {
        if (!text) continue;
        const name = `cap-${leg}-${j}`;
        this.captions.set(text, this.textures.exists(this.key(name)) ? this.key(name) : this.add(name, buildCaption(text)));
        yield;
      }
    }
  }
}

const bakes = new WeakMap<Phaser.Textures.TextureManager, Map<string, RideBake>>();

/** 이 게임의 창밖 그림 굽기 (노선·reduced·11/17 맵 컨셉마다 하나, 여행이 끝나도 남겨요). 컨셉을 안 주면 지금 판 */
export function rideBake(textures: Phaser.Textures.TextureManager, reduced: boolean, route: BusRoute = "camp", concept: MapConcept = currentMapConcept()): RideBake {
  const dist = reduced ? RIDE_DIST_REDUCED : RIDE_DIST;
  let byKey = bakes.get(textures);
  if (!byKey) bakes.set(textures, (byKey = new Map()));
  const k = `${route}:${dist}:${concept}`;
  let b = byKey.get(k);
  if (!b || !b.intact()) byKey.set(k, (b = new RideBake(textures, dist, route, concept)));
  return b;
}

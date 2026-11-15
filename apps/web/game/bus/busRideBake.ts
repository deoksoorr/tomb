import type * as Phaser from "phaser";
import { buildCaption, buildClouds, buildEndSign, buildLeaf, buildStars, buildStrap, buildSunbeam, LAYERS, panoramaSteps } from "./busRideArt";
import { captionAt, RIDE_ORDER } from "./busRideMath";
import { BUS_RIDE_MS, BUS_TEX_PREFIX, type BusLeg } from "./busTypes";

// 11/15 버스 창밖 연출 그림 미리 굽기예요.
// 예전엔 창밖 연출이 시작하는 프레임에 파노라마 네 장을 한꺼번에 구워서 한 번씩 멈췄어요(느린 기기 170ms 남짓).
// 이제 정류장 근처·버스가 오는 동안·연출 첫 어둠 동안 프레임마다 조금씩(예산 ms) 구워요.
// 구운 텍스처는 지우지 않아요. 두 번째 여행부터는 굽지 않고 바로 써요.
// 그림은 가는 길·오는 길이 같아요 (오는 길은 같은 그림을 거꾸로 훑어요).

/** 앞 차 거리 (가까운 층이 8초 동안 달리는 그림 픽셀). reduced면 짧게 = 천천히 */
export const RIDE_DIST = 1100;
export const RIDE_DIST_REDUCED = 440;
export const LEAF_COLORS = [0xc8482a, 0xe06a34, 0xe8a83a, 0xd8b040] as const;
const LEGS: readonly BusLeg[] = ["toCamp", "toVillage"];

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
  ) {
    this.it = this.steps();
  }

  get done(): boolean {
    return this.finished;
  }

  /** 이 그림의 텍스처 키예요 */
  key(name: string): string {
    return `${BUS_TEX_PREFIX}ride-${this.dist}-${name}`;
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
      const g = panoramaSteps(spec, RIDE_ORDER, this.dist, this.seed * 7 + i * 131);
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
      yield;
    }
    // 작은 그림
    const small: [string, () => HTMLCanvasElement][] = [
      ["stars", () => buildStars(this.seed)],
      ["clouds", () => buildClouds(this.seed + 1)],
      ["beam", () => buildSunbeam()],
      ["strap", () => buildStrap()],
      ...LEAF_COLORS.map((c, i): [string, () => HTMLCanvasElement] => [`leaf-${i}`, () => buildLeaf(c)]),
    ];
    for (const [name, build] of small) {
      if (!this.textures.exists(this.key(name))) this.add(name, build());
      yield;
    }
    // 글자 그림 (끝 표지판·자막): 글꼴이 늦으면 조금 기다려요
    for (let i = 0; i < FONT_WAIT_FRAMES && !fontReady(); i++) yield;
    for (const leg of LEGS) {
      if (!this.textures.exists(this.key(`sign-${leg}`))) this.add(`sign-${leg}`, buildEndSign(leg));
      yield;
      const texts = [captionAt(0, BUS_RIDE_MS, leg), captionAt(BUS_RIDE_MS, BUS_RIDE_MS, leg)];
      for (const [j, text] of texts.entries()) {
        if (!text) continue;
        const name = `cap-${leg}-${j}`;
        this.captions.set(text, this.textures.exists(this.key(name)) ? this.key(name) : this.add(name, buildCaption(text)));
        yield;
      }
    }
  }
}

const bakes = new WeakMap<Phaser.Textures.TextureManager, Map<number, RideBake>>();

/** 이 게임의 창밖 그림 굽기 (reduced마다 하나, 여행이 끝나도 남겨요) */
export function rideBake(textures: Phaser.Textures.TextureManager, reduced: boolean): RideBake {
  const dist = reduced ? RIDE_DIST_REDUCED : RIDE_DIST;
  let byDist = bakes.get(textures);
  if (!byDist) bakes.set(textures, (byDist = new Map()));
  let b = byDist.get(dist);
  if (!b || !b.intact()) byDist.set(dist, (b = new RideBake(textures, dist)));
  return b;
}

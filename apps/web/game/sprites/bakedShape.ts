import * as Phaser from "phaser";

// 11/16 정적인 Graphics 장식(이름표 바탕판·칭호 장식)을 텍스처로 한 번만 굽는다.
// Phaser Graphics는 fillPoints·fillRoundedRect·fillCircle 같은 다각형을 렌더할 때마다(매 프레임) earcut으로 다시 쪼갠다 —
// 한 번 그려 둔 도형이어도 마찬가지라, 사람이 많은 채널에서는 이 계산이 프레임 시간의 30~40%를 차지했다 (LOADTEST 정원 실험).
// 그래서 같은 Graphics 그리기 함수를 화면 1px = 텍스처 1px 단위(sc = 1)로 DynamicTexture에 한 번 그리고, Image로 보여 준다.
//  - 키(모양 종류·크기)가 같으면 아바타끼리 텍스처를 나눠 쓴다 (참조 수를 세어 아무도 안 쓰면 지운다)
//  - 텍스처는 화면 px 단위라 줌이 바뀌어도 다시 굽지 않는다 (Image 배율 = 이름표 배율 sc)
//  - WebGL로 같은 파이프라인에서 그리므로 그림이 그대로다 (안티에일리어싱 없음 · 미리 곱한 알파 그대로 섞인다)

/** 굽는 영역 (화면 px, 원점 = 장식의 기준점). 정수로 준다 */
export type BakeBounds = { x: number; y: number; w: number; h: number };

type Entry = { refs: number; key: string; ox: number; oy: number; w: number; h: number };

/** 게임(TextureManager)마다 구운 텍스처 표 */
const CACHE = new WeakMap<Phaser.Textures.TextureManager, Map<string, Entry>>();

function tableOf(scene: Phaser.Scene): Map<string, Entry> {
  let t = CACHE.get(scene.textures);
  if (!t) CACHE.set(scene.textures, (t = new Map()));
  return t;
}

/** key로 구운 텍스처를 빌린다 (없으면 draw로 굽는다). 다 쓰면 releaseBaked */
export function acquireBaked(scene: Phaser.Scene, key: string, b: BakeBounds, draw: (g: Phaser.GameObjects.Graphics) => void): Entry {
  const table = tableOf(scene);
  let e = table.get(key);
  if (e) {
    e.refs++;
    return e;
  }
  const texKey = `bk:${key}`;
  const w = Math.max(1, Math.ceil(b.w));
  const h = Math.max(1, Math.ceil(b.h));
  // 예전 게임이 남긴 같은 이름 텍스처(핫 리로드 등)는 지우고 새로
  if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  const tex = scene.textures.addDynamicTexture(texKey, w, h);
  if (tex) {
    const g = scene.make.graphics(undefined, false);
    draw(g);
    // 기준점이 텍스처 안 (-b.x, -b.y) 자리에 오게
    tex.draw(g, -b.x, -b.y);
    g.destroy();
  }
  e = { refs: 1, key: texKey, ox: -b.x, oy: -b.y, w, h };
  table.set(key, e);
  return e;
}

export function releaseBaked(scene: Phaser.Scene, key: string): void {
  const table = tableOf(scene);
  const e = table.get(key);
  if (!e) return;
  if (--e.refs > 0) return;
  table.delete(key);
  if (scene.textures.exists(e.key)) scene.textures.remove(e.key);
}

/** 지금 쌓여 있는 구운 텍스처 수 (테스트·디버그) */
export function bakedCount(scene: Phaser.Scene): number {
  return tableOf(scene).size;
}

/**
 * 구운 장식 한 장 (Image). show(key, bounds, draw)로 모양을 정하고(키가 같으면 그대로), place로 기준점·배율을 맞춘다.
 * Graphics 대신 쓰면 그리기 함수는 그대로 두고 sc = 1(화면 px)로 부르면 된다.
 */
export class BakedShape {
  readonly img: Phaser.GameObjects.Image;
  private key = "";

  constructor(
    private readonly scene: Phaser.Scene,
    depth: number,
  ) {
    this.img = scene.add.image(0, 0, "__WHITE").setDepth(depth).setVisible(false);
  }

  /** 모양 키가 바뀌었을 때만 굽거나 빌린다 */
  show(key: string, b: BakeBounds, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (key === this.key) return;
    const e = acquireBaked(this.scene, key, b, draw);
    const old = this.key;
    this.key = key;
    this.img.setTexture(e.key).setOrigin(e.ox / e.w, e.oy / e.h);
    if (old) releaseBaked(this.scene, old);
  }

  /** 기준점 (월드), 배율 = 화면 1px의 월드 길이 */
  place(x: number, y: number, sc: number, alpha: number): void {
    if (this.img.scaleX !== sc) this.img.setScale(sc);
    this.img.setPosition(x, y).setAlpha(alpha);
  }

  setVisible(v: boolean): void {
    if (this.img.visible !== v) this.img.setVisible(v && this.key !== "");
  }

  destroy(): void {
    this.img.destroy();
    if (this.key) releaseBaked(this.scene, this.key);
    this.key = "";
  }
}

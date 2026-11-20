import * as Phaser from "phaser";

// 11/15 야근 빌딩: 테마 분위기 층(depth 9000~9010의 곱하기 사각형)이 내 캐릭터까지 어둡게 칠해서 캐릭터가 잘 안 보였다.
// 분위기 층에서 "내 캐릭터 둘레만 부드럽게 덜 칠한다" → 맵 분위기는 그대로, 캐릭터와 발밑만 또렷하다.
// 그리는 순서(몬스터·벽 가림)는 건드리지 않는다. 테마가 층마다 분위기 층을 새로 만들 수 있어 0.4초마다 다시 찾는다.
//
// 11/20 고침: 예전에는 분위기 층에 반전 BitmapMask를 씌웠는데, Phaser의 BitmapMask는 가려진 그림을 따로 빈 판(framebuffer)에 그린 뒤
// 보통 섞기로 얹는다 → 곱하기 섞기가 빈 판에 곱해져 0이 되고, 분위기 층이 화면 전체에서 통째로 사라졌다
// (옥상 비 오는 밤·정전·번개 번쩍임·주차장 어둠·서버실 푸른빛 … 전부 안 보임. 크리스마스판 옥상은 눈밭이 하얗게 날아가 보였다).
// 이제는 마스크 대신: 원래 사각형은 화면 카메라에서만 빼고(cameraFilter — 보임·색·투명도는 그대로라 테마가 계속 찾아서 색을 바꾼다),
// 같은 깊이에 곱하기 조각 다섯 개(가운데 부드러운 구멍 그림 + 둘레 사각형 넷)를 매 프레임 그 색으로 다시 깐다. 곱하기가 화면에 바로 곱해진다.

const DEPTH_MIN = 9000;
const DEPTH_MAX = 9010;
/** 구멍 반지름 (px) · 세기 (1 = 가운데는 분위기 층이 하나도 안 칠해진다) */
const RADIUS = 42;
const STRENGTH = 0.75;
const RESCAN_MS = 400;
const TEX = "rpg-selflight-hole";

export type Box = { x: number; y: number; w: number; h: number };

/**
 * 영역(분위기 사각형)에서 구멍 칸을 뺀 나머지를 사각형 넷으로 (위·아래는 영역 너비 전체, 왼쪽·오른쪽은 구멍 높이만큼).
 * 구멍은 영역 안으로 잘라 넣는다. 넷과 구멍은 겹치지도 틈이 나지도 않는다 (곱하기가 두 번 칠해지거나 빠지는 줄이 안 생긴다)
 */
export function holeStrips(area: Box, hole: Box): { hole: Box; strips: [Box, Box, Box, Box] } {
  const x0 = Math.min(Math.max(hole.x, area.x), area.x + area.w);
  const y0 = Math.min(Math.max(hole.y, area.y), area.y + area.h);
  const x1 = Math.max(x0, Math.min(hole.x + hole.w, area.x + area.w));
  const y1 = Math.max(y0, Math.min(hole.y + hole.h, area.y + area.h));
  return {
    hole: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    strips: [
      { x: area.x, y: area.y, w: area.w, h: y0 - area.y },
      { x: area.x, y: y1, w: area.w, h: area.y + area.h - y1 },
      { x: area.x, y: y0, w: x0 - area.x, h: y1 - y0 },
      { x: x1, y: y0, w: area.x + area.w - x1, h: y1 - y0 },
    ],
  };
}

/**
 * 구멍 그림: 흰색에 알파만 (곱하기 결과 = 바탕 × (1 − a + a·색) — 가장자리 a=1이면 둘레 사각형과 똑같이 칠해진다).
 * 예전 마스크 세기 그대로: 가운데 1−0.75, 0.45 지점 1−0.75·0.75, 가장자리·모서리 1
 */
function holeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(255,255,255,${1 - STRENGTH})`);
  gr.addColorStop(0.45, `rgba(255,255,255,${1 - STRENGTH * 0.75})`);
  gr.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}

type Layer = { src: Phaser.GameObjects.Rectangle; hole: Phaser.GameObjects.Image; strips: Phaser.GameObjects.Rectangle[] };

export class SelfLight {
  private readonly on: boolean;
  private readonly layers: Layer[] = [];
  private readonly seen = new WeakSet<Phaser.GameObjects.GameObject>();
  private scanAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.on = scene.sys.game.renderer.type === Phaser.WEBGL;
    if (this.on && !scene.textures.exists(TEX)) scene.textures.addCanvas(TEX, holeCanvas());
  }

  /** 매 프레임: 캐릭터 몸 가운데 (월드 좌표) */
  update(x: number, y: number, now: number): void {
    if (!this.on) return;
    if (now >= this.scanAt) {
      this.scanAt = now + RESCAN_MS;
      this.scan();
    }
    const cam = this.scene.cameras.main;
    const hx = Math.round(x) - RADIUS;
    const hy = Math.round(y) - RADIUS;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const L = this.layers[i];
      const r = L.src;
      // 지도가 바뀌어 원래 사각형이 지워졌으면 조각도 지운다
      if (!r.active) {
        this.drop(L);
        this.layers.splice(i, 1);
        continue;
      }
      r.cameraFilter |= cam.id;
      const show = r.visible && r.alpha > 0 && r.isFilled;
      const area = { x: Math.round(r.x - r.displayOriginX), y: Math.round(r.y - r.displayOriginY), w: Math.round(r.width), h: Math.round(r.height) };
      const cut = holeStrips(area, { x: hx, y: hy, w: RADIUS * 2, h: RADIUS * 2 });
      const color = r.fillColor;
      const a = r.alpha * r.fillAlpha;
      // 구멍 그림은 늘 제자리(hx, hy)에 두고, 영역 밖으로 나간 몫만 잘라 낸다 (보통은 통째로)
      const whole = cut.hole.w === RADIUS * 2 && cut.hole.h === RADIUS * 2;
      const k = 128 / (RADIUS * 2);
      L.hole.setVisible(show && cut.hole.w > 0 && cut.hole.h > 0).setPosition(hx, hy).setTint(color).setAlpha(a);
      if (L.hole.depth !== r.depth) L.hole.setDepth(r.depth);
      if (whole) {
        if (L.hole.isCropped) L.hole.setCrop();
      } else L.hole.setCrop((cut.hole.x - hx) * k, (cut.hole.y - hy) * k, cut.hole.w * k, cut.hole.h * k);
      for (let j = 0; j < 4; j++) {
        const b = cut.strips[j];
        const s = L.strips[j];
        const w = Math.max(1, b.w);
        const h = Math.max(1, b.h);
        if (s.width !== w || s.height !== h) s.setSize(w, h);
        if (s.fillColor !== color) s.setFillStyle(color, 1);
        s.setVisible(show && b.w > 0 && b.h > 0).setPosition(b.x, b.y).setAlpha(a);
        if (s.depth !== r.depth) s.setDepth(r.depth);
      }
    }
  }

  /** 새로 생긴 분위기 사각형을 찾아 조각을 붙인다 */
  private scan(): void {
    const sc = this.scene;
    // 11/20 배열을 복사하지 않고 처음 길이까지만 돈다 (아래에서 붙이는 조각은 목록 끝에 붙어 이번 찾기에서 빠진다 — 예전 복사와 같다)
    const list = sc.children.list;
    for (let i = 0, n = list.length; i < n; i++) {
      const o = list[i];
      if (this.seen.has(o) || !(o instanceof Phaser.GameObjects.Rectangle)) continue;
      if (o.blendMode !== Phaser.BlendModes.MULTIPLY || o.depth < DEPTH_MIN || o.depth > DEPTH_MAX) continue;
      this.seen.add(o);
      const mk = () => sc.add.rectangle(0, 0, 1, 1, 0xffffff).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY).setVisible(false);
      const hole = sc.add
        .image(0, 0, TEX)
        .setOrigin(0, 0)
        .setDisplaySize(RADIUS * 2, RADIUS * 2)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setVisible(false);
      const strips = [mk(), mk(), mk(), mk()];
      // 조각도 같은 깊이의 곱하기 사각형이라, 다음 찾기에서 조각을 또 원본으로 잡지 않게 표시해 둔다
      for (const s of strips) this.seen.add(s);
      this.layers.push({ src: o, hole, strips });
    }
  }

  private drop(L: Layer): void {
    L.hole.destroy();
    for (const s of L.strips) s.destroy();
    if (L.src.active) L.src.cameraFilter &= ~this.scene.cameras.main.id;
  }

  destroy(): void {
    for (const L of this.layers) this.drop(L);
    this.layers.length = 0;
  }
}

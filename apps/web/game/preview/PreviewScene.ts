import * as Phaser from "phaser";
import { MAP_WIDTH, SPAWN } from "@tomb/protocol";
import { installProcedural, preloadFiles } from "../assets/manifest";
import { fontsReady, installSharedAnims } from "../scenes/BootScene";
import { GlyphAtlas } from "../text/GlyphAtlas";
import { Atmosphere } from "../world/Atmosphere";
import { Lighting } from "../world/Lighting";
import { WorldMap } from "../world/WorldMap";

// 입장 화면 배경: 진짜 월드 맵(WorldMap — 맵이 바뀌면 배경도 그대로 따라 바뀐다)을 천천히 둘러보는 카메라.
// 시간대·날씨(Atmosphere, 소리 없음)·밤 조명(Lighting)은 게임과 같고, 내 캐릭터·다른 사람·실시간 연결·묘비 목록은 없다.
// 움직임 줄이기 설정이면 첫 화면 한 장만 그리고 멈춘다(createPreview가 루프를 재운다).

export type PreviewSceneData = {
  reduced: boolean;
  /** 첫 화면을 그렸다 (React가 캔버스를 서서히 보인다) */
  onReady: () => void;
};

/** 가로 한 번 왕복(초) — 아주 느리게 */
const PERIOD_X = 170;
const PERIOD_Y = 300;
/** 이 높이까지만 둘러본다 (맵이 아래로 길어져도 마을 쪽 위주로) */
const VIEW_MAX_H = 1400;

export class PreviewScene extends Phaser.Scene {
  private data0!: PreviewSceneData;
  private map: WorldMap | null = null;
  private atmos: Atmosphere | null = null;
  private lighting: Lighting | null = null;
  private readonly view = new Phaser.Geom.Rectangle();
  private elapsed = 0;
  private readyFrames = -1;

  constructor() {
    super("preview");
  }

  init(data: PreviewSceneData): void {
    this.data0 = data;
  }

  preload(): void {
    preloadFiles(this);
  }

  create(): void {
    installProcedural(this);
    installSharedAnims(this);
    this.game.canvas.setAttribute("aria-hidden", "true");
    void fontsReady().then(() => {
      if (!this.sys || !this.sys.game || this.map) return;
      this.build();
    });
  }

  private build(): void {
    const atlas = new GlyphAtlas(this);
    this.map = new WorldMap(this, atlas);
    this.map.setRows(0, 0);
    // 소리는 내지 않는다 (입장 화면 음악은 BGM만)
    this.atmos = new Atmosphere(this, this.data0.reduced, window.location.search, { sound: false });
    this.atmos.setStaticLights(this.map.staticLights);
    this.atmos.setGridLights(this.map.gridLights);
    this.lighting = new Lighting(this);
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this));
    this.readyFrames = 0;
  }

  private applyZoom(): void {
    const cam = this.cameras.main;
    // 휴대폰은 조금 넓게(2배), 큰 화면은 게임 기본(3배)
    cam.setZoom(cam.width < 700 ? 2 : 3);
  }

  private onResize(): void {
    this.applyZoom();
    this.atmos?.resize();
    this.lighting?.resize();
  }

  /** 지금 카메라 중심 (월드 좌표): 정문 앞(스폰)에서 시작해 맵을 천천히 8자로 둘러본다 */
  private center(t: number, dw: number, dh: number): { x: number; y: number } {
    const H = Math.min(this.map?.height ?? VIEW_MAX_H, VIEW_MAX_H);
    const minX = dw / 2;
    const maxX = Math.max(minX, MAP_WIDTH - dw / 2);
    const minY = dh / 2;
    const maxY = Math.max(minY, H - dh / 2);
    const midX = (minX + maxX) / 2;
    const x = midX + ((maxX - minX) / 2) * Math.sin((2 * Math.PI * t) / PERIOD_X);
    const y0 = Math.max(minY, Math.min(maxY, SPAWN.y + dh * 0.25));
    const y = y0 + (maxY - y0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / PERIOD_Y));
    return { x, y };
  }

  update(time: number, delta: number): void {
    const map = this.map;
    const atmos = this.atmos;
    const lit = this.lighting;
    if (!map || !atmos || !lit) return;
    const dt = Math.min(delta, 100);
    if (!this.data0.reduced) this.elapsed += dt / 1000;
    const cam = this.cameras.main;
    const dw = Math.floor(cam.width / cam.zoom + 0.5);
    const dh = Math.floor(cam.height / cam.zoom + 0.5);
    const c = this.center(this.elapsed, dw, dh);
    cam.centerOn(c.x, c.y);
    const view = this.view.setTo(Math.floor(c.x - dw / 2), Math.floor(c.y - dh / 2), dw, dh);

    map.update(view);
    map.scaleLabels(1 / cam.zoom);
    atmos.update(time, dt, view);
    const L = atmos.levels;
    lit.begin(view, L.darkness);
    if (L.darkness > 0.004) {
      const lr = 38 + 22 * L.glow;
      for (const sp of map.staticLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
      for (const sp of map.gridLights) lit.add(sp.x, sp.y + 6, lr * sp.scale * 1.3, 0.55);
    }
    lit.end();

    // 몇 프레임 그린 뒤(바닥 덩어리·조명이 다 깔린 뒤) 보이게 한다
    if (this.readyFrames >= 0 && ++this.readyFrames === 3) this.data0.onReady();
  }
}

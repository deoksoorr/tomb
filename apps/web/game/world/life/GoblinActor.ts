import * as Phaser from "phaser";
import { GOBLIN_TOUCH_RADIUS, MAP_NAME, goblinMapOf, goblinPos, type GoblinInfo, type GoblinPose, type MapId } from "@tomb/protocol";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { DEPTH } from "../../config";
import type { RealtimeClient } from "../../net/RealtimeClient";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import { edgePoint } from "../guideMath";
import type { Lighting } from "../Lighting";
import type { Sfx } from "../Sfx";
import { goblinStopFor, type GoblinStop } from "./goblinStops";
import { playLife } from "./sounds";
import { ensureLifeTextures, LTEX } from "./sprites";

// 22번 황금 고블린(보너스 요정) 그리기·잡기 — 11/26 마을·바닷가·캠핑장 장면이 같이 쓴다 (예전엔 VillageLife 안에 있었다).
// 나타남·사라짐·잡힘은 채널 전체 소식이라 RealtimeClient가 들고 있고(goblinNow·goblinEnd), 여기서는 매 프레임 그걸 읽는다.
// - 이 맵 고블린: 서버와 같은 계산(goblinPos)으로 그리고, 내 발이 닿으면 잡기 요청만 보낸다 (판정은 서버 — 그 맵에 있는 사람만).
//   화면 밖이면 가장자리에 금빛 화살표 + 「황금 고블린」.
// - 다른 맵 고블린: 그 맵으로 가는 정류장 쪽 화살표 (goblinStops). 정류장이 화면 안이면 정류장 위에 아래를 가리키는 화살표.

export type GoblinActorDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  /** 이 장면의 맵 */
  map: MapId;
  player: () => { x: number; y: number };
  net: () => RealtimeClient;
};

/**
 * 11/19 고블린 가장자리 화살표가 머무는 안쪽 상자의 여백 (화면 px — 위쪽 바·아래 버튼 줄·폰 조이스틱에 가리지 않게).
 * 아래쪽은 채팅 기록·버튼 줄·첫 방문 안내 말(데스크톱), 채팅 기록·조이스틱(폰)보다 위에 (HTML 칸 밑에 깔려 가리거나 흐려지지 않게)
 */
const GOBLIN_EDGE_BOX = { wide: { l: 56, r: 56, t: 84, b: 224 }, narrow: { l: 34, r: 34, t: 128, b: 272 } } as const;
/** 가장자리 화살표 한 픽셀 = 화면 몇 px (줌과 상관없이 같은 크기, 정수라 또렷하게) */
const GOBLIN_EDGE_PX = 3;
/** 정류장 위 화살표가 정류장 칸 가운데보다 이만큼 위 (월드 px) */
const STOP_MARK_DY = 34;

type View = {
  info: GoblinInfo;
  /** 나타난 맵 */
  map: MapId;
  /** 다른 맵이면 가리킬 정류장 */
  stop: GoblinStop | null;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText;
  /** 11/19 둘레 금빛 후광 (숨 쉬듯 커졌다 작아진다) */
  halo: Phaser.GameObjects.Image;
  /** 화면 밖이면 가장자리 방향 화살표 + 이름 */
  edge: Phaser.GameObjects.Image;
  edgeLabel: Phaser.GameObjects.BitmapText;
  /** 11/26 다른 맵: 정류장 위 화살표 + 「캠핑장행 버스」 */
  stopMark: Phaser.GameObjects.Image | null;
  stopLabel: Phaser.GameObjects.BitmapText | null;
  pose: GoblinPose;
  claimAt: number;
  sparkAt: number;
};

export class GoblinActor {
  private readonly scene: Phaser.Scene;
  private view: View | null = null;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 11/19 내가 잡으면 튀어 오르는 금화 */
  private readonly coins: Phaser.GameObjects.Particles.ParticleEmitter;
  private concept: MapConcept = "default";
  private conceptAt = 0;
  private labelScale = 1 / 3;
  private destroyed = false;

  constructor(private readonly d: GoblinActorDeps) {
    const scene = (this.scene = d.scene);
    ensureLifeTextures(scene);
    d.atlas.ensure("황금 고블린 ·" + Object.values(MAP_NAME).join("") + "행버스");
    this.sparks = scene.add.particles(0, 0, LTEX.sparkle, {
      lifespan: { min: 450, max: 900 },
      speed: { min: 8, max: 30 },
      scale: { start: 1, end: 0.2 },
      alpha: { start: 1, end: 0 },
      gravityY: -10,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.sparks.setDepth(DEPTH.fireflies + 2);
    this.coins = scene.add.particles(0, 0, LTEX.coin, {
      lifespan: { min: 900, max: 1300 },
      speedX: { min: -90, max: 90 },
      speedY: { min: -190, max: -110 },
      gravityY: 330,
      rotate: { min: -360, max: 360 },
      scale: { start: 1, end: 0.7 },
      alpha: { start: 1, end: 0, ease: "Quart.easeIn" },
      emitting: false,
    });
    this.coins.setDepth(DEPTH.bubble - 1);
  }

  /** 매 프레임 (장면 update). labelScale = 이름표 배율 (줌과 상관없이 같은 크기) */
  update(pnow: number, labelScale: number): void {
    if (this.destroyed) return;
    if (pnow >= this.conceptAt) {
      this.conceptAt = pnow + 1000;
      this.concept = currentMapConcept();
    }
    this.labelScale = labelScale;
    const net = this.d.net();
    const g = net.goblinNow();
    if ((g?.id ?? null) !== (this.view?.info.id ?? null)) {
      if (this.view) this.finish(net.goblinEnd?.id === this.view.info.id ? net.goblinEnd : null);
      if (g) this.begin(g);
    }
    const v = this.view;
    if (!v) return;
    const t = net.serverNow();
    if (t < v.info.at) return this.hide(v);
    if (v.stop) return this.updateAway(v, pnow);
    this.updateHere(v, t, pnow);
  }

  /** 어둠 레이어 빛 구멍: 고블린은 밤에도 멀리서 보이게 넓고 밝게 */
  addLights(lit: Lighting): void {
    const v = this.view;
    if (v && !v.stop && v.img.visible) lit.add(v.img.x, v.img.y - 8, 46, 0.95);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear(false);
    this.sparks.destroy();
    this.coins.destroy();
  }

  // ── 안쪽 ──

  private begin(info: GoblinInfo): void {
    const map = goblinMapOf(info);
    const stop = goblinStopFor(this.d.map, map);
    const scene = this.scene;
    const img = scene.add.image(0, 0, LTEX.goblin(0)).setOrigin(0.5, 1).setVisible(false);
    const label = scene.add.bitmapText(0, 0, FONT_KEY, "황금 고블린", FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 1).setTint(0xffe27a).setVisible(false);
    // 11/19 강조: 둘레 금빛 후광(ADD) + 화면 밖이면 가장자리 화살표 (어둠·눈·안개 위, 화면 가장자리 그늘 아래)
    const halo = scene.add.image(0, 0, LTEX.goblinHalo).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const edge = scene.add.image(0, 0, LTEX.goblinEdge).setScrollFactor(0).setDepth(DEPTH.tooltip + 1).setVisible(false);
    const edgeText = stop ? `황금 고블린 · ${MAP_NAME[map]}` : "황금 고블린";
    this.d.atlas.ensure(edgeText);
    const edgeLabel = scene.add.bitmapText(0, 0, FONT_KEY, edgeText, FONT_PX).setOrigin(0.5, 1).setScrollFactor(0).setDepth(DEPTH.tooltip + 1).setTint(0xffe27a).setVisible(false);
    let stopMark: Phaser.GameObjects.Image | null = null;
    let stopLabel: Phaser.GameObjects.BitmapText | null = null;
    if (stop) {
      this.d.atlas.ensure(stop.label);
      stopMark = scene.add.image(stop.x, stop.y - STOP_MARK_DY, LTEX.goblinEdge).setRotation(Math.PI / 2).setDepth(DEPTH.labels).setVisible(false);
      stopLabel = scene.add.bitmapText(stop.x, stop.y - STOP_MARK_DY - 10, FONT_KEY, stop.label, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels).setTint(0xffe27a).setVisible(false);
    }
    this.view = { info, map, stop, img, label, halo, edge, edgeLabel, stopMark, stopLabel, pose: { x: 0, y: 0, dash: false, face: 1 }, claimAt: -Infinity, sparkAt: 0 };
    if (!stop) playLife(this.d.sfx, "sparkle", 0.5);
  }

  /** 끝났다: 잡혔으면 그 자리 반짝·누가 얼마 (내가 잡았으면 금화), 사라졌으면 펑 */
  private finish(end: { caught: boolean; name?: string; points?: number; mine?: boolean } | null): void {
    const v = this.view;
    if (!v) return;
    const shown = !v.stop && v.img.visible;
    if (end?.caught) {
      const points = end.points ?? 0;
      let x = v.img.x;
      let y = v.img.y;
      if (shown) {
        this.sparks.explode(this.d.reduced ? 10 : 28, x, y - 8);
        if (points > 0) this.floatText(x, y - 20, end.mine ? `+${points}P` : `${end.name || "누군가"} +${points}P`);
      }
      // 11/19 내가 잡았다: 그 자리에서 금화가 튀어 오른다 (고블린이 화면에 없었으면 내 발밑에서)
      if (end.mine) {
        if (!shown) {
          const pl = this.d.player();
          x = pl.x;
          y = pl.y;
        }
        this.coins.explode(this.d.reduced ? 8 : 26, x, y - 10);
        this.sparks.explode(this.d.reduced ? 6 : 16, x, y - 14);
      }
      if (!v.stop || end.mine) playLife(this.d.sfx, "fanfare", end.mine ? 0.7 : 0.35);
      this.clear(false);
      return;
    }
    this.clear(shown);
  }

  private clear(poof: boolean): void {
    const v = this.view;
    if (!v) return;
    this.view = null;
    if (poof) this.sparks.explode(10, v.img.x, v.img.y - 8);
    v.img.destroy();
    v.label.destroy();
    v.halo.destroy();
    v.edge.destroy();
    v.edgeLabel.destroy();
    v.stopMark?.destroy();
    v.stopLabel?.destroy();
  }

  private hide(v: View): void {
    v.img.setVisible(false);
    v.label.setVisible(false);
    v.halo.setVisible(false);
    v.edge.setVisible(false);
    v.edgeLabel.setVisible(false);
    v.stopMark?.setVisible(false);
    v.stopLabel?.setVisible(false);
  }

  private floatText(x: number, y: number, text: string): void {
    this.d.atlas.ensure(text);
    const t = this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setTint(0xfff2d8).setScale(this.labelScale);
    this.scene.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1500, ease: "Sine.easeOut", onComplete: () => t.destroy() });
  }

  /** 이 맵 고블린: 그리고, 닿으면 잡기 요청 */
  private updateHere(v: View, t: number, pnow: number): void {
    const labelScale = this.labelScale;
    const p = goblinPos(v.info, t, v.pose);
    const pl = this.d.player();
    const dist = Math.hypot(pl.x - p.x, pl.y - p.y);
    // 달릴 땐 다리를 번갈아, 서 있을 땐 콩콩 (가까이 오면 더 높이)
    const frame = p.dash ? 1 + (Math.floor(pnow / 90) % 2) : 0;
    const bounce = p.dash ? Math.abs(Math.sin(pnow / 70)) * 2 : Math.abs(Math.sin(pnow / (dist < 60 ? 110 : 260))) * (dist < 60 ? 5 : 2);
    v.img.setVisible(true).setTexture(LTEX.goblin(frame, this.concept)).setFlipX(p.face < 0).setPosition(Math.round(p.x), Math.round(p.y - bounce)).setDepth(p.y);
    v.label.setVisible(true).setPosition(p.x, p.y - bounce - 18).setScale(labelScale);
    // 11/19 금빛 후광 (숨 쉬듯) + 반짝이를 더 자주·넓게
    const breathe = this.d.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(pnow / 260);
    v.halo
      .setVisible(true)
      .setPosition(Math.round(p.x), Math.round(p.y - bounce - 7))
      .setScale(0.9 + 0.25 * breathe)
      .setAlpha(0.55 + 0.35 * breathe)
      .setDepth(p.y - 0.5);
    if (pnow - v.sparkAt > (this.d.reduced ? 400 : 70)) {
      v.sparkAt = pnow;
      this.sparks.emitParticleAt(p.x + (Math.random() - 0.5) * 18, p.y - 4 - Math.random() * 16, this.d.reduced ? 1 : 2);
    }
    this.edgeArrow(v, p.x, p.y - bounce - 10, pnow);
    // 내 발이 닿았다 → 서버에 잡기 요청 (판정은 서버: 그 맵에서 먼저 온 한 명). 응답이 없으면 0.2초마다 다시
    const net = this.d.net();
    if (net.online && net.map === v.map && dist <= GOBLIN_TOUCH_RADIUS && pnow - v.claimAt > 200) {
      v.claimAt = pnow;
      net.claimGoblin(v.info.id);
    }
  }

  /** 11/26 다른 맵 고블린: 정류장 쪽 화살표 (화면 밖이면 가장자리, 안이면 정류장 위) */
  private updateAway(v: View, pnow: number): void {
    const s = v.stop!;
    v.img.setVisible(false);
    v.label.setVisible(false);
    v.halo.setVisible(false);
    const off = this.edgeArrow(v, s.x, s.y - STOP_MARK_DY, pnow);
    const bob = this.d.reduced ? 0 : Math.abs(Math.sin(pnow / 220)) * 4;
    v.stopMark?.setVisible(!off).setPosition(s.x, Math.round(s.y - STOP_MARK_DY - bob));
    v.stopLabel
      ?.setVisible(!off)
      .setPosition(s.x, s.y - STOP_MARK_DY - 10 - bob)
      .setScale(this.labelScale);
  }

  /** 11/19 (x,y)가 화면 밖이면 화면 가장자리에 그쪽을 가리키는 금빛 화살표 + 이름 (RouteGuide와 같은 계산). 화살표를 띄웠으면 true */
  private edgeArrow(v: View, x: number, y: number, pnow: number): boolean {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const sx = ((x - view.x) / view.width) * cam.width;
    const sy = ((y - view.y) / view.height) * cam.height;
    const box = cam.width <= 560 ? GOBLIN_EDGE_BOX.narrow : GOBLIN_EDGE_BOX.wide;
    const bw = cam.width - box.l - box.r;
    const bh = cam.height - box.t - box.b;
    // 화면 안에 보이면 화살표 없이 (가장자리 24px 안쪽까지), 밖이면 안쪽 상자 둘레에 그쪽을 가리키게
    const off = view.width > 0 && view.height > 0 && edgePoint(sx, sy, cam.width, cam.height, 24) !== null;
    const inner = off && bw > 0 && bh > 0 ? edgePoint(sx - box.l, sy - box.t, bw, bh, 0) : null;
    const e = inner && { x: inner.x + box.l, y: inner.y + box.t, angle: inner.angle };
    if (!e) {
      v.edge.setVisible(false);
      v.edgeLabel.setVisible(false);
      return false;
    }
    this.dodgeMinimap(e, cam);
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    const z = cam.zoom;
    const px = ox + (e.x - ox) / z;
    const py = oy + (e.y - oy) / z;
    const red = this.d.reduced;
    const push = red ? 0 : (Math.sin(pnow / 160) * 3) / z;
    const tw = red ? 1 : 0.8 + 0.2 * Math.abs(Math.sin(pnow / 200));
    v.edge
      .setPosition(px + Math.cos(e.angle) * push, py + Math.sin(e.angle) * push)
      .setRotation(e.angle)
      .setScale((GOBLIN_EDGE_PX / z) * (red ? 1 : 1 + 0.12 * Math.abs(Math.sin(pnow / 200))))
      .setAlpha(tw)
      .setVisible(true);
    v.edgeLabel
      .setScale(this.labelScale)
      .setPosition(px - Math.cos(e.angle) * (56 / z), py - Math.sin(e.angle) * (36 / z) - 6 / z)
      .setAlpha(0.95)
      .setVisible(true);
    return true;
  }

  private mini: { at: number; r: { x: number; y: number; w: number; h: number } | null } = { at: -Infinity, r: null };

  /**
   * 11/26 화살표가 오른쪽 위 미니맵(HTML) 밑에 깔리지 않게 (바닷가 마을행 정류장이 바로 그쪽이다).
   * 미니맵 상자(카메라 px, 0.5초마다 다시 잼)에 들어가면 위쪽 가장자리면 미니맵 왼쪽으로, 오른쪽 가장자리면 미니맵 아래로 옮긴다
   */
  private dodgeMinimap(e: { x: number; y: number }, cam: Phaser.Cameras.Scene2D.Camera): void {
    const now = performance.now();
    if (now - this.mini.at > 500) {
      this.mini.at = now;
      this.mini.r = null;
      const el = typeof document !== "undefined" ? document.querySelector("[data-minimap]") : null;
      const canvas = this.scene.game.canvas;
      if (el && canvas) {
        const m = el.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        if (m.width > 0 && c.width > 0) {
          const k = cam.width / c.width;
          // 미니맵 위 이름 줄(맵 이름·크게)까지 덮으려고 위로 28px 더
          this.mini.r = { x: (m.left - c.left) * k, y: (m.top - 28 - c.top) * k, w: m.width * k, h: (m.height + 28) * k };
        }
      }
    }
    const r = this.mini.r;
    const pad = 22;
    if (!r || e.x < r.x - pad || e.x > r.x + r.w + pad || e.y < r.y - pad || e.y > r.y + r.h + pad) return;
    const left = e.x - (r.x - pad);
    const down = r.y + r.h + pad - e.y;
    if (left < down) e.x = r.x - pad;
    else e.y = r.y + r.h + pad;
  }
}

/**
 * 11/26 캠핑장·바닷가 장면에 붙이기 (한 줄): 장면 update마다 그리고, 장면이 꺼지면 치운다.
 * 밤 빛은 장면 updateLighting에서 actor.addLights(lit) 한 줄을 더 부른다.
 */
export function attachGoblin(deps: GoblinActorDeps & { labelScale: () => number }): GoblinActor {
  const actor = new GoblinActor(deps);
  const ev = deps.scene.events;
  const tick = () => actor.update(performance.now(), deps.labelScale());
  ev.on(Phaser.Scenes.Events.UPDATE, tick);
  const off = () => {
    ev.off(Phaser.Scenes.Events.UPDATE, tick);
    ev.off(Phaser.Scenes.Events.SHUTDOWN, off);
    ev.off(Phaser.Scenes.Events.DESTROY, off);
    actor.destroy();
  };
  ev.once(Phaser.Scenes.Events.SHUTDOWN, off);
  ev.once(Phaser.Scenes.Events.DESTROY, off);
  return actor;
}

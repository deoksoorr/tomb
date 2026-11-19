import * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { Grid } from "../sprites/pixel";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { edgePoint } from "./guideMath";
import { needRepath, nearestGoals, reached, routeMarks, ROUTE_ARROW_EVERY, ROUTE_FLOW, ROUTE_SPACING, type Pt, type RouteGoal } from "./routeGuideMath";

// 11/19 첫 걸음 길 안내 (bridge route:guide): 내 캐릭터에서 목적지까지 걷는 길(충돌을 피한 격자 길찾기 — GraveWalker.route)을 따라
// 촛불빛 점·작은 화살표가 앞으로 흐르고, 끝에 깃발과 반짝임. 목적지가 화면 밖이면 화면 가장자리에 방향 화살표.
//  - 길은 0.5초마다·칸이 바뀔 때만 다시 찾는다 (routeGuideMath.needRepath). 그림은 미리 만든 이미지 풀을 옮기기만 한다 (매 프레임 새로 만들지 않는다)
//  - 동작 줄이기면 흐름·깜빡임 없이 멈춘 무늬

const TEX_DOT = "fx-route-dot";
const TEX_CHEV = "fx-route-chev";
const TEX_FLAG = "fx-route-flag";
const TEX_SPARK = "fx-route-spark";
const TEX_EDGE = "fx-route-edge";

const GOLD = 0xffd76a;
const HI = 0xfff2b8;
const INK = 0x3a2a10;

function dotCanvas(): HTMLCanvasElement {
  const g = new Grid(4, 4);
  g.rect(1, 1, 2, 2, GOLD);
  g.set(1, 1, HI);
  g.outline(INK);
  return g.toCanvas();
}
/** 오른쪽을 가리키는 작은 화살촉 「>」 (7×7, 두 칸 굵기) */
function chevCanvas(): HTMLCanvasElement {
  const g = new Grid(7, 7);
  g.hline(1, 2, 1, GOLD);
  g.hline(2, 4, 2, GOLD);
  g.hline(3, 5, 3, GOLD);
  g.hline(2, 4, 4, GOLD);
  g.hline(1, 2, 5, GOLD);
  g.set(5, 3, HI);
  g.set(4, 3, HI);
  g.outline(INK);
  return g.toCanvas();
}
/** 깃대 + 촛불빛 깃발 (9×14, 원점 = 깃대 발) */
function flagCanvas(): HTMLCanvasElement {
  const g = new Grid(9, 14);
  g.vline(1, 1, 12, 0xcfc3a0);
  g.rect(2, 1, 6, 4, GOLD);
  g.hline(2, 7, 1, HI);
  g.set(7, 4, 0xe0a840);
  g.rect(0, 12, 3, 1, 0x8a7a58);
  g.outline(INK);
  return g.toCanvas();
}
function sparkCanvas(): HTMLCanvasElement {
  const g = new Grid(7, 7);
  g.vline(3, 0, 6, GOLD);
  g.hline(0, 6, 3, GOLD);
  g.set(3, 3, 0xffffff);
  g.set(2, 3, HI);
  g.set(4, 3, HI);
  return g.toCanvas();
}
/** 화면 가장자리 화살표 (오른쪽을 가리킨다, 11×11) */
function edgeCanvas(): HTMLCanvasElement {
  const g = new Grid(11, 11);
  g.rect(1, 4, 5, 3, GOLD);
  for (let i = 0; i < 5; i++) g.vline(5 + i, 1 + i, 9 - i, GOLD);
  g.hline(1, 5, 4, HI);
  g.outline(INK);
  return g.toCanvas();
}

export type RouteDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  /** 내 발 위치 */
  player: () => Pt;
  /** 걷는 길 (충돌·물을 피한 격자 A* — 시작점은 빼고 끝은 목적지). 없으면 null */
  route: (from: Pt, to: Pt) => Pt[] | null;
};

/** 목적지 찾기 결과: 후보들(가까운 것부터 몇 개를 이어 본다) + 이름표 */
export type RouteTargetInfo = { goals: readonly RouteGoal[]; label: string };

/** 표시 풀 크기 (화면 안만 놓으니 넉넉하다) */
const POOL = 160;

export class RouteGuide {
  private readonly marks: Phaser.GameObjects.Image[] = [];
  private readonly flag: Phaser.GameObjects.Image;
  private readonly spark: Phaser.GameObjects.Image;
  private readonly edge: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.BitmapText;
  private resolve: (() => RouteTargetInfo | null) | null = null;
  private goal: RouteGoal | null = null;
  private path: Pt[] = [];
  private last: { cell: string; at: number } | null = null;
  private hidden = false;

  constructor(private readonly d: RouteDeps) {
    const s = d.scene;
    addCanvasTexture(s, TEX_DOT, { canvas: dotCanvas() });
    addCanvasTexture(s, TEX_CHEV, { canvas: chevCanvas() });
    addCanvasTexture(s, TEX_FLAG, { canvas: flagCanvas() });
    addCanvasTexture(s, TEX_SPARK, { canvas: sparkCanvas() });
    addCanvasTexture(s, TEX_EDGE, { canvas: edgeCanvas() });
    // 어둠(밤)·눈·안개 위, 화면 가장자리 그늘 아래: 밤에도 눈 오는 날에도 또렷하게
    const depth = DEPTH.fog + 2;
    for (let i = 0; i < POOL; i++) this.marks.push(s.add.image(0, 0, TEX_DOT).setDepth(depth).setVisible(false));
    this.flag = s.add.image(0, 0, TEX_FLAG).setOrigin(0.15, 1).setDepth(depth + 1).setVisible(false);
    this.spark = s.add.image(0, 0, TEX_SPARK).setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.edge = s.add.image(0, 0, TEX_EDGE).setScrollFactor(0).setDepth(DEPTH.tooltip + 1).setVisible(false);
    this.label = s.add.bitmapText(0, 0, FONT_KEY, "", FONT_PX).setOrigin(0.5, 1).setTint(0xffe9a8).setDepth(DEPTH.tooltip + 1).setVisible(false);
  }

  get active(): boolean {
    return this.resolve !== null;
  }

  /** 안내 시작 (resolve = 목적지 후보를 지금 위치 기준으로 다시 묻는 함수 — 가장 가까운 벤치 등). null이면 지운다 */
  set(resolve: (() => RouteTargetInfo | null) | null): void {
    this.resolve = resolve;
    this.goal = null;
    this.path = [];
    this.last = null;
    if (!resolve) this.hideAll();
  }

  /**
   * 길을 다시 잇는다 (칸이 바뀌었거나 force). 목적지 후보가 없으면 "missing", 어느 후보로도 길이 없으면 "unreachable"
   */
  private repath(from: Pt, now: number, force: boolean): "ok" | "missing" | "unreachable" | "skip" {
    const cell = needRepath(this.last, from, now, force);
    if (cell === null) return "skip";
    this.last = { cell, at: now };
    const info = this.resolve?.();
    if (!info || !info.goals.length) return "missing";
    if (this.label.text !== info.label) {
      this.d.atlas.ensure(info.label);
      this.label.setText(info.label);
    }
    for (const g of nearestGoals(info.goals, from)) {
      if (reached(from, g)) {
        this.goal = g;
        this.path = [];
        return "ok";
      }
      const p = this.d.route(from, g);
      if (p?.length) {
        this.goal = g;
        this.path = p;
        return "ok";
      }
    }
    return this.goal ? "ok" : "unreachable";
  }

  /**
   * 매 프레임. hidden = 지금 이 맵에 안 보일 때 (캠핑장·바닷가·실내 — 안내는 유지하고 그림만 숨긴다).
   * 닿았거나 길을 못 이으면 그 결과를 돌려준다 (부른 쪽이 안내를 끝내고 화면에 알린다)
   */
  update(now: number, view: Phaser.Geom.Rectangle, labelScale: number, hidden: boolean): "arrived" | "missing" | "unreachable" | null {
    if (!this.resolve) return null;
    if (hidden) {
      if (!this.hidden) this.hideAll();
      this.hidden = true;
      this.last = null;
      return null;
    }
    const from = this.d.player();
    const r = this.repath(from, now, this.hidden || !this.goal);
    this.hidden = false;
    if (r === "missing" || r === "unreachable") return r;
    const goal = this.goal;
    if (!goal) return null;
    if (reached(from, goal)) return "arrived";
    this.draw(now, from, goal, view, labelScale);
    return null;
  }

  private draw(now: number, from: Pt, goal: RouteGoal, view: Phaser.Geom.Rectangle, labelScale: number): void {
    const red = this.d.reduced;
    // 이미 닿은 웨이포인트는 버린다 (다시 찾기 전 0.5초 동안 길이 뒤로 꺾이지 않게)
    while (this.path.length > 1 && Math.hypot(this.path[0].x - from.x, this.path[0].y - from.y) < 6) this.path.shift();
    const phase = red ? 0 : (now / 1000) * ROUTE_FLOW;
    const period = ROUTE_SPACING * ROUTE_ARROW_EVERY;
    let i = 0;
    const marks = this.marks;
    routeMarks(
      from,
      this.path,
      phase,
      (x, y, angle, arrow) => {
        const m = marks[i++];
        // 화살촉은 8방향으로 맞춘다 (도트가 비스듬히 뭉개지지 않게)
        if (arrow) m.setTexture(TEX_CHEV).setRotation(Math.round(angle / (Math.PI / 4)) * (Math.PI / 4));
        else m.setTexture(TEX_DOT).setRotation(0);
        // 흐름: 앞쪽(목적지 쪽)으로 갈수록 살짝 밝아졌다 사라지는 물결
        const wave = red ? 0.95 : 0.8 + 0.2 * Math.sin(((x + y) / period) * 0.9 - now / 260);
        m.setPosition(Math.round(x), Math.round(y)).setAlpha(wave).setVisible(true);
      },
      { view, max: marks.length },
    );
    for (let k = i; k < marks.length; k++) {
      if (!marks[k].visible) break;
      marks[k].setVisible(false);
    }
    // 끝: 깃발(살짝 흔들림) + 반짝임
    const bob = red ? 0 : Math.round(Math.sin(now / 320) * 1.5);
    this.flag.setPosition(goal.x, goal.y + bob).setVisible(true);
    const tw = red ? 1 : 0.5 + 0.5 * Math.abs(Math.sin(now / 380));
    this.spark
      .setPosition(goal.x + 7, goal.y - 12 + bob)
      .setScale(red ? 1 : 0.7 + 0.5 * tw)
      .setAlpha(tw)
      .setVisible(true);
    // 화면 밖이면 가장자리 화살표 (+ 이름표), 안이면 깃발 위 이름표
    const cam = this.d.scene.cameras.main;
    const sx = ((goal.x - view.x) / view.width) * cam.width;
    const sy = ((goal.y - 14 - view.y) / view.height) * cam.height;
    const e = edgePoint(sx, sy, cam.width, cam.height);
    const l = this.label;
    if (!e) {
      this.edge.setVisible(false);
      l.setScrollFactor(1).setScale(labelScale).setPosition(goal.x, goal.y - 16 + bob).setAlpha(1).setVisible(true);
      return;
    }
    const ox = cam.width / 2;
    const oy = cam.height / 2;
    const z = cam.zoom;
    const px = ox + (e.x - ox) / z;
    const py = oy + (e.y - oy) / z;
    const push = red ? 0 : (Math.sin(now / 220) * 2) / z;
    this.edge
      .setPosition(px + Math.cos(e.angle) * push, py + Math.sin(e.angle) * push)
      .setRotation(e.angle)
      .setAlpha(red ? 1 : 0.75 + 0.25 * tw)
      .setVisible(true);
    l.setScrollFactor(0)
      .setScale(labelScale)
      .setPosition(px - Math.cos(e.angle) * (18 / z), py - Math.sin(e.angle) * (14 / z) + 4 / z)
      .setAlpha(0.95)
      .setVisible(true);
  }

  private hideAll(): void {
    for (const m of this.marks) m.setVisible(false);
    this.flag.setVisible(false);
    this.spark.setVisible(false);
    this.edge.setVisible(false);
    this.label.setVisible(false);
  }

  destroy(): void {
    for (const m of this.marks) m.destroy();
    this.flag.destroy();
    this.spark.destroy();
    this.edge.destroy();
    this.label.destroy();
  }
}

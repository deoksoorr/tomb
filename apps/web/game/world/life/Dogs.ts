import type * as Phaser from "phaser";
import { DEPTH } from "../../config";
import type { Player } from "../../entities/Player";
import { SpeechBubble } from "../../entities/SpeechBubble";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import type { Sfx } from "../Sfx";
import { critterGrid } from "./critterSim";
import { blankDogPose, DOGS, DOGS_ENABLED, DogSim, type DogPose } from "./dogSim";
import { playLife } from "./sounds";
import { LTEX, type DogFrame } from "./sprites";

// 마을 강아지 그리기·쓰다듬기. VillageLife가 들고 있다 (WorldScene은 따로 부르지 않는다).
// - 위치: dogSim (채널 시드 + 서버 시계) → 같은 채널 모두가 같은 자리. 네트워크·서버 비용 0.
// - 내 화면에서만: 가끔 내 캐릭터 곁으로 와서 몇 초 따라오다 공유 자리로 돌아간다(화면 오프셋), E = "멍!" 말풍선 + 꼬리 흔들기.
// - 짖는 소리: 효과음 갈래 음량을 따르고, 가까울 때만 아주 작게.

const PET_RADIUS = 18;
const LABEL_RADIUS = 46;
const CULL = 40;
/** 이 거리 안에 들어오면 가끔 다가와 따라온다 */
const FOLLOW_NOTICE = 80;
/** 따라오는 화면 오프셋 한도 (공유 자리에서 이만큼까지만 벗어난다) */
const FOLLOW_MAX = 70;
const FOLLOW_MS = 5200;
/** 짖는 소리가 들리는 거리 */
const BARK_RADIUS = 110;
const BARK_GAIN = 0.22;

type DogView = {
  sim: DogSim;
  pose: DogPose;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText;
  bubble: SpeechBubble | null;
  /** 화면 연출 오프셋 (따라오기) */
  ox: number;
  oy: number;
  followUntil: number;
  nextFollowAt: number;
  wagUntil: number;
  x: number;
  y: number;
  visible: boolean;
};

export class Dogs {
  private list: DogView[] = [];
  private seed = -1;
  private petAt = -Infinity;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    private readonly sfx: Sfx,
    private readonly reduced: boolean,
  ) {
    atlas.ensure(DOGS.map((d) => d.name + (d.special?.petLines.join("") ?? "")).join("") + "멍!쓰다듬기");
  }

  setSeed(seed: number): void {
    if (!DOGS_ENABLED || seed === this.seed) return;
    this.seed = seed;
    this.clear();
    DOGS.forEach((def, i) => {
      const sim = new DogSim(def, i, seed);
      if (sim.spots.length === 0) return;
      const img = this.scene.add.image(0, 0, LTEX.dog(def.variant, "sit0")).setOrigin(0.5, 1).setVisible(false);
      const label = this.scene.add
        .bitmapText(0, 0, FONT_KEY, def.name, FONT_PX)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.labels - 2)
        .setTint(def.special?.labelTint ?? 0xf2e8d0)
        .setVisible(false);
      // 첫 따라오기는 들어온 뒤 조금 지나서 (강아지마다 다르게)
      this.list.push({ sim, pose: blankDogPose(), img, label, bubble: null, ox: 0, oy: 0, followUntil: 0, nextFollowAt: performance.now() + 8000 + i * 6000, wagUntil: 0, x: 0, y: 0, visible: false });
    });
  }

  update(t: number, dt: number, view: Phaser.Geom.Rectangle, labelScale: number, pl: Player): void {
    if (this.destroyed) return;
    const pnow = performance.now();
    const now = this.scene.time.now;
    const g = critterGrid();
    for (const d of this.list) {
      const p = d.sim.at(t, d.pose);
      const following = pnow < d.followUntil;
      const px = p.x + d.ox;
      const py = p.y + d.oy;
      const dist = Math.hypot(pl.x - px, pl.y - py);
      // 따라오기 (내 화면에서만): 가까이 오면 가끔 곁으로 와서 몇 초 따라오다 돌아간다
      if (!following && pnow > d.nextFollowAt && dist < FOLLOW_NOTICE && !pl.sitting && p.act !== "sleep") {
        d.followUntil = pnow + FOLLOW_MS;
        d.nextFollowAt = pnow + FOLLOW_MS + 30_000 + Math.random() * 30_000;
        d.wagUntil = pnow + FOLLOW_MS;
        this.bark(dist, !!d.sim.def.special);
      }
      let tx = 0;
      let ty = 0;
      if (pnow < d.followUntil) {
        // 내 뒤쪽 옆자리(14px)로 — 공유 자리에서 FOLLOW_MAX까지만, 막힌 칸이면 그 자리에 멈춘다
        const side = p.x + d.ox <= pl.x ? -14 : 14;
        tx = pl.x + side - p.x;
        ty = pl.y + 2 - p.y;
        const n = Math.hypot(tx, ty);
        if (n > FOLLOW_MAX) {
          tx = (tx / n) * FOLLOW_MAX;
          ty = (ty / n) * FOLLOW_MAX;
        }
        const cx = Math.floor((p.x + tx) / g.cell);
        const cy = Math.floor((p.y + ty) / g.cell);
        if (g.blocked(cx, cy)) {
          tx = d.ox;
          ty = d.oy;
        }
      }
      const k = Math.min(1, (dt / 1000) * (pnow < d.followUntil ? 3.5 : 1.6));
      const mx = (tx - d.ox) * k;
      const my = (ty - d.oy) * k;
      d.ox += mx;
      d.oy += my;
      d.x = p.x + d.ox;
      d.y = p.y + d.oy;
      const inView = d.x > view.x - CULL && d.x < view.right + CULL && d.y > view.y - CULL && d.y < view.bottom + 60;
      d.visible = inView;
      d.img.setVisible(inView);
      if (!inView) {
        d.label.setVisible(false);
        d.bubble?.place(d.x, d.y, labelScale, now, false);
        continue;
      }
      // 그리기: 화면 오프셋이 움직이는 중이면(따라오기·돌아가기) 걷는 모습
      const trotting = Math.hypot(mx, my) > (dt / 1000) * 6;
      const wag = pnow < d.wagUntil;
      const near = Math.hypot(pl.x - d.x, pl.y - d.y);
      const special = d.sim.def.special;
      let face = p.face;
      let frame: DogFrame;
      let bounce = 0;
      if (trotting || p.walking) {
        frame = Math.floor(pnow / 130) % 2 ? "walk1" : "walk0";
        if (trotting) face = mx >= 0 ? 1 : -1;
        // 우유는 통통 튀듯 걷는다
        if (special && !this.reduced) bounce = Math.abs(Math.sin(pnow / 85)) * 2;
      } else if (p.act === "spin" && !wag) {
        // 제자리 빙글: 좌우로 빠르게 돌며 콩콩
        frame = "walk0";
        face = Math.floor(pnow / 140) % 2 ? 1 : -1;
        bounce = this.reduced ? 0 : Math.abs(Math.sin(pnow / 70)) * 1.5;
      } else if (wag) {
        frame = Math.floor(pnow / (this.reduced ? 300 : 120)) % 2 ? "sit1" : "sit0";
        face = pl.x >= d.x ? 1 : -1;
      } else if (p.act === "sniff") frame = Math.floor(pnow / 260) % 2 ? "sniff1" : "sniff0";
      else if (p.act === "sit") frame = Math.floor(pnow / 700) % 3 === 0 ? "sit1" : "sit0";
      else frame = p.act === "walk" || p.act === "spin" ? "walk0" : p.act;
      d.img
        .setTexture(LTEX.dog(d.sim.def.variant, frame))
        .setFlipX(face < 0)
        .setPosition(Math.round(d.x), Math.round(d.y - bounce))
        .setDepth(d.y);
      // 우유는 이름표가 늘 머리 위에 (다른 강아지는 가까이 갈 때만)
      const showLabel = !!special || near < LABEL_RADIUS;
      d.label.setVisible(showLabel);
      if (showLabel) d.label.setPosition(d.x, d.y - 14 - bounce).setScale(labelScale);
      d.bubble?.place(d.x, d.y - (showLabel ? 22 : 15), labelScale, now, true);
    }
  }

  /** 짖기 (small = 우유: 작은 강아지답게 높은 소리) */
  private bark(dist: number, small = false): void {
    if (dist > BARK_RADIUS) return;
    playLife(this.sfx, small ? "yip" : "bark", BARK_GAIN * (1 - dist / BARK_RADIUS));
  }

  private nearest(px: number, py: number, r: number): DogView | null {
    let best: DogView | null = null;
    let bd = r;
    for (const d of this.list) {
      if (!d.visible) continue;
      const dd = Math.hypot(d.x - px, d.y - py);
      if (dd <= bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** E: 가까운 강아지를 쓰다듬는다 ("멍!" + 꼬리 흔들기, 내 화면에서만). 했으면 true */
  pet(pl: Player): boolean {
    const d = this.nearest(pl.x, pl.y, PET_RADIUS);
    if (!d) return false;
    const pnow = performance.now();
    if (pnow - this.petAt < 900) return true;
    this.petAt = pnow;
    d.wagUntil = pnow + 2600;
    pl.faceTo(d.x, d.y, this.scene.time.now);
    d.bubble ??= new SpeechBubble(this.scene, this.atlas);
    const lines = d.sim.def.special?.petLines;
    d.bubble.show(lines ? lines[Math.floor(Math.random() * lines.length)] : "멍!", this.scene.time.now);
    this.bark(Math.hypot(d.x - pl.x, d.y - pl.y), !!d.sim.def.special);
    return true;
  }

  /** 발밑 안내 ("E 백구 쓰다듬기"). 가까운 강아지가 없으면 null */
  hint(prefix: string, px: number, py: number): { text: string; dist: number } | null {
    const d = this.nearest(px, py, PET_RADIUS);
    return d ? { text: `${prefix}${d.sim.def.name} 쓰다듬기`, dist: Math.hypot(d.x - px, d.y - py) } : null;
  }

  /** 미니맵용 강아지 자리 [x, y, …]를 out 뒤에 덧붙인다 */
  dots(out: number[]): number[] {
    for (const d of this.list) out.push(Math.round(d.x || d.pose.x), Math.round(d.y || d.pose.y));
    return out;
  }

  private clear(): void {
    for (const d of this.list) {
      d.img.destroy();
      d.label.destroy();
      d.bubble?.destroy();
    }
    this.list = [];
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
  }
}

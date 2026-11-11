import * as Phaser from "phaser";
import {
  DIR,
  GOBLIN_NAME,
  GOBLIN_TOUCH_RADIUS,
  TELESCOPE,
  goblinPos,
  goblinRoute,
  spotSeatId,
  type GoblinInfo,
  type GoblinPose,
  type Sid,
  type SpotKind,
} from "@tomb/protocol";
import { ambienceAt, parseAmbienceOverride, type AmbienceOverride } from "@/lib/ambience";
import { bridge } from "../../bridge";
import { DEPTH } from "../../config";
import type { Player } from "../../entities/Player";
import { SPOT_TAKEN_TOAST } from "../../logic/spots";
import type { RealtimeClient } from "../../net/RealtimeClient";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import type { Interactable } from "../layout";
import type { Lighting } from "../Lighting";
import type { Sfx } from "../Sfx";
import { stargazeColliders } from "./stargazeLayout";
import { CRITTERS, CritterSim, PERCH_FRONT_DY, type CritterPose } from "./critterSim";
import { playLife } from "./sounds";
import { ensureLifeTextures, LTEX, type CatFrame } from "./sprites";

// 22번 마을 생물: 돌아다니는 고양이·꼬마 유령, 황금 고블린(보너스 요정), 별 보기 언덕의 망원경·돗자리·별똥별.
// WorldScene은 이 클래스 하나만 들고 몇 군데(접속·좌석·E·안내·매 프레임·빛)에서 부른다.
//
// - 고양이·유령: critterSim(채널 번호 시드 + 서버 시계)으로 모두가 같은 자리. 다가가면 놀라 폴짝 비키거나(뛰어오면)
//   슬금슬금 다가오는(가만히 있으면) 연출은 내 화면에서만 잠깐 어긋나 그린다. E = 쓰다듬기(골골·하트), 유령은 "우우~".
// - 황금 고블린: 서버가 등장·주인을 정한다. 위치는 protocol goblinPos(서버와 같은 계산). 내 발이 닿으면 잡기 요청만 보낸다.
// - 망원경·돗자리: 1인 자리(서버 좌석). 망원경은 자리를 얻으면 별자리 잇기 창(Telescope.tsx)을 연다.
//   진짜 밤(KST)·맑은 날이면 월드 하늘에 가끔 별똥별.

export type LifeDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  /** 맵 충돌 그룹 (망원경 받침을 더한다) */
  colliders: Phaser.Physics.Arcade.StaticGroup;
  player: () => Player;
  net: () => RealtimeClient;
  /** 서버 좌석 점유표 (seatId → sid) */
  seats: () => ReadonlyMap<string, Sid>;
  /** 지금 채널 (오프라인이면 고른 채널) */
  channel: () => number;
  toast: (message: string) => void;
};

type CritterView = {
  sim: CritterSim;
  pose: CritterPose;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText;
  zzz: Phaser.GameObjects.Image | null;
  /** 화면 연출 오프셋 (공유 위치에서 잠깐 비켜 그린다) */
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  hop: number;
  startledUntil: number;
  petUntil: number;
  /** 화면에 그려진 자리 */
  x: number;
  y: number;
  visible: boolean;
};

type GoblinView = {
  info: GoblinInfo;
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.BitmapText;
  pose: GoblinPose;
  claimAt: number;
  sparkAt: number;
};

const PET_RADIUS = 18;
const LABEL_RADIUS = 46;
const STARTLE_RADIUS = 26;
const CURIOUS_RADIUS = 36;
const PET_TEXT_CAT = ["골골골…", "냐옹~", "그르릉…", "야옹!"];
const PET_TEXT_GHOST = ["우우~", "히히", "부끄…", "둥실~"];

export class VillageLife {
  private readonly scene: Phaser.Scene;
  private readonly critters: CritterView[] = [];
  private seed = -1;
  private goblin: GoblinView | null = null;
  private readonly telescope: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly hearts: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly override: AmbienceOverride;
  private ambAt = -Infinity;
  private starry = false;
  private ghostAlpha = 0.6;
  private nextStarAt = 0;
  /** 내가 잡은(또는 잡으려는) 망원경·돗자리 자리 */
  private held: { id: string; kind: SpotKind; x: number; y: number } | null = null;
  /** 망원경 자리를 요청하고 확정을 기다리는 중 (확정되면 창을 연다) */
  private pendingScope: { id: string; until: number } | null = null;
  /** 서버가 22번을 안다 (welcome.now) — 망원경·돗자리를 서버 좌석으로 판정 */
  private serverKnows = false;
  private petAt = -Infinity;
  private labelScale = 1 / 3;
  private destroyed = false;

  constructor(private readonly d: LifeDeps) {
    const scene = (this.scene = d.scene);
    ensureLifeTextures(scene);
    d.atlas.ensure(CRITTERS.map((c) => c.name).join("") + "황금 고블린" + PET_TEXT_CAT.join("") + PET_TEXT_GHOST.join(""));
    this.override = typeof window !== "undefined" ? parseAmbienceOverride(window.location.search) : {};
    // 망원경 (그림 + 받침 충돌)
    this.telescope = scene.add.image(TELESCOPE.x, TELESCOPE.y + 1, LTEX.telescope).setOrigin(0.5, 1).setDepth(TELESCOPE.y);
    for (const r of stargazeColliders()) {
      const z = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      z.removeFromDisplayList();
      d.colliders.add(z);
    }
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
    this.hearts = scene.add.particles(0, 0, LTEX.heart, {
      lifespan: 1100,
      speedY: { min: -26, max: -16 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.9, end: 0.5 },
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.hearts.setDepth(DEPTH.bubble - 1);
    this.setSeed(d.channel());
  }

  // ── 접속·시계 ──

  private serverNow(): number {
    return this.d.net().serverNow();
  }

  /** welcome: 채널(= 고양이 시드)·서버 시계·지금 나와 있는 고블린 */
  onWelcome(m: { channel: number; now?: number; goblin?: GoblinInfo }): void {
    this.serverKnows = typeof m.now === "number";
    this.setSeed(m.channel);
    if (m.goblin) this.onGoblin(m.goblin, true);
    else this.clearGoblin(false);
  }

  /** 연결이 끊김·채널 이동 */
  onReset(): void {
    this.clearGoblin(false);
    this.pendingScope = null;
  }

  private setSeed(channel: number): void {
    const seed = Number.isFinite(channel) && channel > 0 ? channel : 1;
    if (seed === this.seed) return;
    this.seed = seed;
    for (const c of this.critters) {
      c.img.destroy();
      c.label.destroy();
      c.zzz?.destroy();
    }
    this.critters.length = 0;
    CRITTERS.forEach((def, i) => {
      const sim = new CritterSim(def, i, seed);
      if (sim.spots.length === 0) return;
      const img = this.scene.add.image(0, 0, def.kind === "cat" ? LTEX.cat(def.variant, "sit") : LTEX.ghost(def.variant, 0)).setOrigin(0.5, 1);
      const label = this.scene.add.bitmapText(0, 0, FONT_KEY, def.name, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 2).setTint(0xf2e8d0).setVisible(false);
      this.critters.push({ sim, pose: sim.at(this.serverNow()), img, label, zzz: null, ox: 0, oy: 0, tx: 0, ty: 0, hop: 0, startledUntil: 0, petUntil: 0, x: 0, y: 0, visible: false });
    });
  }

  // ── 매 프레임 ──

  update(dt: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    if (this.destroyed) return;
    const pnow = performance.now();
    const t = this.serverNow();
    this.labelScale = labelScale;
    this.updateAmbience(t);
    this.updateCritters(t, pnow, dt, view, labelScale);
    this.updateGoblin(t, pnow, labelScale);
    this.updateStars(pnow, view);
    this.updateHeld();
  }

  private updateAmbience(t: number): void {
    if (t - this.ambAt < 30_000) return;
    this.ambAt = t;
    const a = ambienceAt(Date.now(), this.override);
    this.starry = a.phase === "night" && a.weather === "clear";
    this.ghostAlpha = a.phase === "night" ? 0.85 : a.phase === "day" ? 0.45 : 0.65;
  }

  private updateCritters(t: number, pnow: number, dt: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    const pl = this.d.player();
    const seats = this.d.seats();
    const k = Math.min(1, (dt / 1000) * 6);
    for (const c of this.critters) {
      const p = c.sim.at(t, c.pose);
      const cat = c.sim.def.kind === "cat";
      let x = p.x;
      let y = p.y;
      let depth = y;
      let hopY = 0;
      // 벤치·의자 위로 폴짝 (그 좌석이 비어 있을 때만 — 사람이 앉아 있으면 그 앞에서 쉰다)
      if (cat && p.perch && !p.walking && !seats.has(p.perch.id)) {
        const f = Math.min(1, p.restMs / 380);
        x = p.perch.x;
        y = p.perch.y + PERCH_FRONT_DY * (1 - f) - 2 * f;
        hopY = Math.sin(f * Math.PI) * 7;
        depth = p.perch.y + 2;
      }
      const inView = x > view.x - 40 && x < view.right + 40 && y > view.y - 40 && y < view.bottom + 60;
      c.visible = inView;
      c.img.setVisible(inView);
      if (!inView) {
        c.label.setVisible(false);
        c.zzz?.setVisible(false);
        continue;
      }
      // 반응 (내 화면에서만): 뛰어오면 놀라 비키고, 가만히 곁에 있으면 슬금슬금 다가온다
      const dx = pl.x - (x + c.ox);
      const dy = pl.y - (y + c.oy);
      const dist = Math.hypot(dx, dy);
      const rushing = pl.state === "run" || pl.state === "jump";
      if (dist < STARTLE_RADIUS && rushing && pnow > c.startledUntil) {
        c.startledUntil = pnow + 1600;
        const n = dist || 1;
        c.tx = (-dx / n) * 18;
        c.ty = (-dy / n) * 10;
        c.hop = 1;
        if (cat) playLife(this.d.sfx, "meow", 0.35);
      } else if (pnow > c.startledUntil) {
        const curious = cat && !p.walking && dist < CURIOUS_RADIUS && dist > 12 && (pl.state === "idle" || pl.sitting);
        if (curious) {
          const n = dist || 1;
          c.tx = (dx / n) * Math.min(8, dist - 12);
          c.ty = (dy / n) * Math.min(5, dist - 12);
        } else {
          c.tx = 0;
          c.ty = 0;
        }
      }
      c.ox += (c.tx - c.ox) * k;
      c.oy += (c.ty - c.oy) * k;
      c.hop = Math.max(0, c.hop - dt / 450);
      const startleHop = Math.sin(c.hop * Math.PI) * 6;
      // 그리기
      let face = p.face;
      if (pnow < c.petUntil || (Math.abs(c.tx) > 1 && pnow > c.startledUntil)) face = dx >= 0 ? 1 : -1;
      if (pnow < c.startledUntil) face = dx >= 0 ? -1 : 1;
      if (cat) {
        let frame: CatFrame;
        if (p.walking || pnow < c.startledUntil) frame = Math.floor(pnow / 170) % 2 ? "walk1" : "walk0";
        else if (pnow < c.petUntil) frame = "sit";
        else if (p.pose === "groom") frame = Math.floor(pnow / 420) % 3 === 0 ? "loaf" : "groom";
        else if (p.pose === "float") frame = "sit";
        else frame = p.pose;
        c.img.setTexture(LTEX.cat(c.sim.def.variant, frame));
        c.img.setFlipX(face < 0);
        c.img.setAlpha(1);
      } else {
        // 유령: 둥실 떠 있고, 다가가면 수줍게 흐려지며 살짝 떠오른다
        hopY += 5 + Math.sin(pnow / 520 + c.sim.index) * 2;
        const shy = dist < 30 && pnow > c.petUntil;
        c.img.setTexture(LTEX.ghost(c.sim.def.variant, Math.floor(pnow / 320) % 2));
        c.img.setFlipX(face < 0);
        c.img.setAlpha(shy ? this.ghostAlpha * 0.45 : this.ghostAlpha);
        if (shy) hopY += 4;
      }
      c.x = x + c.ox;
      c.y = y + c.oy;
      c.img.setPosition(Math.round(c.x), Math.round(c.y - hopY - startleHop)).setDepth(depth + c.oy);
      // 이름표 (가까이 가면)
      const showLabel = dist < LABEL_RADIUS;
      c.label.setVisible(showLabel);
      if (showLabel) c.label.setPosition(c.x, c.y - hopY - startleHop - 13).setScale(labelScale);
      // 낮잠 z
      const sleeping = cat && !p.walking && p.pose === "sleep" && pnow > c.petUntil && pnow > c.startledUntil;
      if (sleeping) {
        c.zzz ??= this.scene.add.image(0, 0, LTEX.zzz).setDepth(DEPTH.bubble - 2);
        const ph = (pnow / 1400 + c.sim.index * 0.3) % 1;
        c.zzz.setVisible(true).setPosition(c.x + 5 + ph * 4, c.y - 12 - ph * 8).setAlpha(1 - ph);
      } else c.zzz?.setVisible(false);
    }
  }

  /** E: 가까운 고양이·유령을 쓰다듬는다. 했으면 true (다른 상호작용보다 먼저) */
  pet(): boolean {
    const pl = this.d.player();
    const c = this.nearestCritter(pl.x, pl.y, PET_RADIUS);
    if (!c) return false;
    const pnow = performance.now();
    if (pnow - this.petAt < 900) return true;
    this.petAt = pnow;
    c.petUntil = pnow + 2600;
    c.startledUntil = 0;
    c.tx = c.ty = 0;
    pl.faceTo(c.x, c.y, this.scene.time.now);
    const cat = c.sim.def.kind === "cat";
    const list = cat ? PET_TEXT_CAT : PET_TEXT_GHOST;
    this.floatText(c.x, c.y - 16, list[Math.floor(Math.random() * list.length)]);
    if (cat) {
      this.hearts.explode(3, c.x, c.y - 10);
      playLife(this.d.sfx, "purr", 0.9);
      if (Math.random() < 0.5) this.scene.time.delayedCall(700, () => playLife(this.d.sfx, "meow", 0.5));
    } else {
      this.sparks.explode(6, c.x, c.y - 10);
      playLife(this.d.sfx, "coo", 0.7);
    }
    return true;
  }

  /** 발밑 안내 ("E 쓰다듬기"). 가까운 고양이·유령이 없으면 null */
  hint(prefix: string, px: number, py: number): { x: number; y: number; text: string; dim: boolean; dist: number } | null {
    const c = this.nearestCritter(px, py, PET_RADIUS);
    if (!c) return null;
    const dist = Math.hypot(c.x - px, c.y - py);
    return { x: px, y: py + 2, text: `${prefix}${c.sim.def.name} ${c.sim.def.kind === "cat" ? "쓰다듬기" : "놀아 주기"}`, dim: false, dist };
  }

  private nearestCritter(px: number, py: number, r: number): CritterView | null {
    let best: CritterView | null = null;
    let bd = r;
    for (const c of this.critters) {
      if (!c.visible) continue;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d <= bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private floatText(x: number, y: number, text: string): void {
    this.d.atlas.ensure(text);
    const t = this.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setTint(0xfff2d8).setScale(this.labelScale);
    this.scene.tweens.add({ targets: t, y: y - 10, alpha: 0, duration: 1500, ease: "Sine.easeOut", onComplete: () => t.destroy() });
  }

  // ── 황금 고블린 ──

  /** 나타났다 (서버 알림 또는 welcome) */
  onGoblin(info: GoblinInfo, fromWelcome = false): void {
    if (this.goblin?.info.id === info.id) return;
    this.clearGoblin(false);
    const img = this.scene.add.image(0, 0, LTEX.goblin(0)).setOrigin(0.5, 1);
    this.d.atlas.ensure("황금 고블린");
    const label = this.scene.add.bitmapText(0, 0, FONT_KEY, "황금 고블린", FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 1).setTint(0xffe27a);
    this.goblin = { info, img, label, pose: { x: 0, y: 0, dash: false, face: 1 }, claimAt: -Infinity, sparkAt: 0 };
    const zone = goblinRoute(info.seed).zone;
    this.d.toast(fromWelcome ? `지금 ${zone} 쪽에 ${GOBLIN_NAME}이 있어요! 먼저 잡으면 보너스` : `${zone} 쪽에 ${GOBLIN_NAME}이 나타났어요! 가장 먼저 잡으면 보너스`);
    playLife(this.d.sfx, "sparkle", 0.5);
  }

  onGoblinGone(id: string): void {
    if (this.goblin?.info.id === id) this.clearGoblin(true);
  }

  onGoblinCaught(id: string, sid: Sid, name: string, points: number): void {
    const g = this.goblin;
    const mine = sid === this.d.net().mySid;
    if (g && g.info.id === id) {
      this.sparks.explode(this.d.reduced ? 10 : 28, g.img.x, g.img.y - 8);
      this.clearGoblin(false);
    }
    playLife(this.d.sfx, "fanfare", mine ? 0.7 : 0.35);
    this.d.toast(`${mine ? "내가" : `${name || "누군가"}님이`} ${GOBLIN_NAME}을 잡았어요! +${points}P`);
  }

  /** 내가 잡았다: 증서를 UI로 (GoblinClaim이 /api/goblin에 낸다) */
  onGoblinGrant(id: string, grant: string, points: number): void {
    bridge.emit("goblin:grant", { id, grant, points });
  }

  private clearGoblin(poof: boolean): void {
    const g = this.goblin;
    if (!g) return;
    this.goblin = null;
    if (poof) this.sparks.explode(10, g.img.x, g.img.y - 8);
    g.img.destroy();
    g.label.destroy();
  }

  private updateGoblin(t: number, pnow: number, labelScale: number): void {
    const g = this.goblin;
    if (!g) return;
    if (t >= g.info.until) {
      this.clearGoblin(true);
      return;
    }
    if (t < g.info.at) {
      g.img.setVisible(false);
      g.label.setVisible(false);
      return;
    }
    const p = goblinPos(g.info, t, g.pose);
    const pl = this.d.player();
    const dist = Math.hypot(pl.x - p.x, pl.y - p.y);
    // 달릴 땐 다리를 번갈아, 서 있을 땐 콩콩 (가까이 오면 더 높이)
    const frame = p.dash ? 1 + (Math.floor(pnow / 90) % 2) : 0;
    const bounce = p.dash ? Math.abs(Math.sin(pnow / 70)) * 2 : Math.abs(Math.sin(pnow / (dist < 60 ? 110 : 260))) * (dist < 60 ? 5 : 2);
    g.img.setVisible(true).setTexture(LTEX.goblin(frame)).setFlipX(p.face < 0).setPosition(Math.round(p.x), Math.round(p.y - bounce)).setDepth(p.y);
    g.label.setVisible(true).setPosition(p.x, p.y - bounce - 18).setScale(labelScale);
    if (pnow - g.sparkAt > (this.d.reduced ? 400 : 130)) {
      g.sparkAt = pnow;
      this.sparks.emitParticleAt(p.x + (Math.random() - 0.5) * 10, p.y - 6 - Math.random() * 8, 1);
    }
    // 내 발이 닿았다 → 서버에 잡기 요청 (판정은 서버: 먼저 온 한 명). 응답이 없으면 0.2초마다 다시
    const net = this.d.net();
    if (net.online && dist <= GOBLIN_TOUCH_RADIUS && pnow - g.claimAt > 200) {
      g.claimAt = pnow;
      net.claimGoblin(g.info.id);
    }
  }

  // ── 망원경·돗자리 (1인 자리) ──

  /** E로 망원경·돗자리를 썼다 */
  useStarSpot(o: Interactable): void {
    const kind: SpotKind = o.kind === "telescope" ? "telescope" : "mat";
    const id = spotSeatId(kind, o.ax, o.ay);
    const net = this.d.net();
    const judged = net.online && this.serverKnows;
    const owner = this.d.seats().get(id);
    if (judged && owner !== undefined && owner !== net.mySid) {
      this.d.toast(SPOT_TAKEN_TOAST[kind]);
      return;
    }
    const pl = this.d.player();
    const now = this.scene.time.now;
    pl.warp(o.ax, o.ay, now, null);
    this.held = { id, kind, x: o.ax, y: o.ay };
    if (kind === "mat") {
      pl.sit(null, now, null);
      if (judged) net.sit(id);
      return;
    }
    pl.faceTo(TELESCOPE.x, TELESCOPE.y - 12, now);
    pl.dir = DIR.up;
    pl.view.apply(pl.state, DIR.up, now);
    if (!judged || owner === net.mySid) {
      this.openTelescope();
      return;
    }
    this.pendingScope = { id, until: performance.now() + 1500 };
    net.sit(id);
  }

  private openTelescope(): void {
    this.pendingScope = null;
    playLife(this.d.sfx, "sparkle", 0.3);
    bridge.emit("portal:open", { kind: "telescope" });
  }

  /** 좌석 알림 (서버). 내 망원경 자리가 확정되면 창을 연다, 남이 먼저 잡았으면 비켜선다 */
  seatChanged(seatId: string, sid: Sid | null): void {
    const me = this.d.net().mySid;
    if (this.pendingScope?.id === seatId && sid === me) this.openTelescope();
    else if (sid !== null && sid !== me && this.held?.id === seatId) this.lost(seatId);
  }

  /** 서버가 내 자리 요청을 거절했다. 내 망원경·돗자리 요청이었으면 처리하고 true */
  seatDenied(seatId: string): boolean {
    if (this.held?.id !== seatId && this.pendingScope?.id !== seatId) return false;
    this.lost(seatId);
    return true;
  }

  private lost(seatId: string): void {
    const h = this.held;
    this.held = null;
    this.pendingScope = null;
    const pl = this.d.player();
    const now = this.scene.time.now;
    if (h && h.kind === "mat" && pl.sitting) pl.stand(now, null);
    if (h) pl.warp(h.x + 14, h.y + 6, now, null);
    this.d.toast(SPOT_TAKEN_TOAST[h?.kind ?? (seatId.startsWith("t_") ? "telescope" : "mat")]);
  }

  /** 자리를 떠났는지 (움직이면 서버가 알아서 놓는다 — 여기서는 기록만 지운다) */
  private updateHeld(): void {
    const h = this.held;
    if (h) {
      const pl = this.d.player();
      const moved = Math.hypot(pl.x - h.x, pl.y - h.y) > 4;
      if (moved || (h.kind === "mat" && pl.state !== "sitGround")) this.held = null;
    }
    // 서버가 답이 없다(이전 서버·끊김) → 그냥 연다
    if (this.pendingScope && performance.now() > this.pendingScope.until) this.openTelescope();
  }

  // ── 별똥별 (진짜 밤 · 맑은 날) ──

  private updateStars(pnow: number, view: Phaser.Geom.Rectangle): void {
    if (!this.starry || this.d.reduced) return;
    if (pnow < this.nextStarAt) return;
    const pl = this.d.player();
    const onHill = pl.x < 460 && pl.y < 320;
    this.nextStarAt = pnow + (onHill ? 3000 + Math.random() * 5000 : 7000 + Math.random() * 12000);
    if (this.nextStarAt - pnow < 0) return;
    const x = view.x + view.width * (0.1 + Math.random() * 0.7);
    const y = view.y + view.height * (0.05 + Math.random() * 0.3);
    const ang = (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? 1 : -1);
    const len = 70 + Math.random() * 60;
    const dir = ang > 0 ? 1 : -1;
    const s = this.scene.add
      .image(x, y, LTEX.streak)
      .setOrigin(1, 0.5)
      .setDepth(DEPTH.fireflies + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(dir > 0 ? Math.abs(ang) : Math.PI - Math.abs(ang))
      .setFlipY(dir < 0)
      .setAlpha(0);
    this.scene.tweens.add({
      targets: s,
      x: x + Math.cos(Math.abs(ang)) * len * dir,
      y: y + Math.sin(Math.abs(ang)) * len,
      alpha: { from: 0.95, to: 0 },
      duration: 650 + Math.random() * 300,
      ease: "Quad.easeIn",
      onComplete: () => s.destroy(),
    });
  }

  /** 지금 맑은 밤인지 (QA·HUD) */
  get starryNight(): boolean {
    return this.starry;
  }

  /** 어둠 레이어 빛 구멍: 유령·고블린은 은은하게 빛난다 */
  addLights(lit: Lighting): void {
    for (const c of this.critters) if (c.visible && c.sim.def.kind === "ghost") lit.add(c.x, c.y - 10, 18, 0.35);
    const g = this.goblin;
    if (g && g.img.visible) lit.add(g.img.x, g.img.y - 8, 30, 0.7);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearGoblin(false);
    for (const c of this.critters) {
      c.img.destroy();
      c.label.destroy();
      c.zzz?.destroy();
    }
    this.critters.length = 0;
    this.telescope.destroy();
    this.sparks.destroy();
    this.hearts.destroy();
  }
}

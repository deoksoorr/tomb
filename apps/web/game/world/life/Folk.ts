import type * as Phaser from "phaser";
import { DIR, WALK_SPEED, type DirId } from "@tomb/protocol";
import type { MapConcept } from "@/lib/mapConcept";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { DEPTH } from "../../config";
import { AvatarView } from "../../entities/AvatarView";
import type { Player } from "../../entities/Player";
import { SAY_MS, SpeechBubble } from "../../entities/SpeechBubble";
import { faceToward } from "../../logic/movement";
import type { EmoteIcon } from "../../sprites/emotes";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import { markCharTint } from "../charTint";
import type { Lighting } from "../Lighting";
import type { Sfx } from "../Sfx";
import { imageBox, type SnowNpc } from "../snowNpc";
import { ensureFolkTextures, FTEX } from "./folkArt";
import { blankFolkPose, FolkSim, pickFolkLine, type FolkAct, type FolkDef, type FolkLineCtx, type FolkPose, type FolkState, type FolkWorld } from "./folkSim";
import { conceptLook, pickConceptLine } from "./npcOutfits";
import { playLife } from "./sounds";
import { ensureLifeTextures, LTEX, type CatFrame, type DogFrame } from "./sprites";

// 11/16 바닷가·캠핑장 주민 그리기·말 걸기 (마을 Residents·Dogs와 같은 틀). 맵 장면은 이 클래스를 감싼 seaLife·campLife만 부른다.
// - 위치: folkSim (채널 시드 + 서버 시계) → 같은 채널 모두가 같은 자리. 네트워크·서버 비용 0.
// - 유령은 사람 아바타 그림(AvatarView) + 손 소품(folkArt), 동물은 마을 강아지·고양이 그림. 이름표는 마을 주민처럼 연한 초록.
// - 말 걸기(E): 말풍선은 내 화면에만. 말하는 동안 멈춰 나를 보고, 끝나면 공유 자리로 슬며시 돌아간다.
// - 길 막지 않기: 몸 충돌이 없고, 쉬는 자리에 내가 바짝 서면 옆으로 한 걸음 비켜 선다 (내 화면에서만).
// - 11/17 맵 컨셉(겨울·크리스마스판)이면 유령 주민은 계절 옷을 입고(npcOutfits) 가끔 계절 한마디. 판이 바뀌면 1초 안에 갈아입는다.
// - 집에 들어가면(away) 흐려지며 사라지고, 나올 땐 문 앞에서 흐려지며 나타난다.

const LABEL = 0xa8e6a0;
const TALK_RADIUS = 18;
const CULL = 48;
const FADE_MS = 900;
/** 쉬는 주민 곁 이만큼 안에 서면 비켜 선다 */
const MAKE_ROOM = 11;
const ROOM_STEP = 14;
const LABEL_RADIUS = 46;

export type FolkDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  defs: readonly FolkDef[];
  /** 짝 (뒤 사람 id → 앞 사람 id·옆 거리) */
  pairs?: Readonly<Record<string, { lead: string; dx: number }>>;
  world: () => FolkWorld;
  /** 말 걸 때 대사 고르기 상황 */
  lineCtx: () => FolkLineCtx;
};

export type FolkView = {
  sim: FolkSim;
  pose: FolkPose;
  av: AvatarView | null;
  img: Phaser.GameObjects.Image | null;
  label: Phaser.GameObjects.BitmapText | null;
  bubble: SpeechBubble | null;
  prop: Phaser.GameObjects.Image | null;
  aux: Phaser.GameObjects.Image | null;
  alpha: number;
  talkUntil: number;
  holdX: number;
  holdY: number;
  holdState: FolkState;
  holdDir: DirId;
  /** 공유 자리에서 비켜 그린 만큼 (말 끝난 뒤 돌아가기·비켜 서기·놀라 달아나기) */
  ox: number;
  oy: number;
  tx: number;
  ty: number;
  /** 놀라 달아나는 중 (내 화면 시계) */
  shoveUntil: number;
  wagUntil: number;
  face: -1 | 1;
  lastLine: string | null;
  flashAt: number;
  x: number;
  y: number;
  state: FolkState;
  dir: DirId;
  visible: boolean;
};

export class Folk {
  private list: FolkView[] = [];
  private seed = -1;
  private talkAt = -Infinity;
  private destroyed = false;
  /** 11/17 지금 입은 판 (1초마다 확인) */
  private concept: MapConcept = currentMapConcept();
  private conceptAt = 0;

  constructor(private readonly d: FolkDeps) {
    ensureLifeTextures(d.scene);
    ensureFolkTextures(d.scene);
    d.atlas.ensure(d.defs.map((f) => f.name).join("") + "말 걸기쓰다듬기");
  }

  get views(): readonly FolkView[] {
    return this.list;
  }

  setSeed(seed: number): void {
    if (seed === this.seed || this.destroyed) return;
    this.seed = seed;
    this.clear();
    const world = this.d.world();
    const pairs = this.d.pairs ?? {};
    this.list = this.d.defs.map((def, i) => {
      const pair = pairs[def.id];
      const lead = pair ? this.d.defs.findIndex((o) => o.id === pair.lead) : -1;
      const sim = new FolkSim(def, i, seed, world, pair && lead >= 0 ? { index: lead, dx: pair.dx } : null);
      return {
        sim,
        pose: blankFolkPose(),
        av: null,
        img: null,
        label: null,
        bubble: null,
        prop: null,
        aux: null,
        alpha: -1,
        talkUntil: 0,
        holdX: 0,
        holdY: 0,
        holdState: "idle",
        holdDir: DIR.down,
        ox: 0,
        oy: 0,
        tx: 0,
        ty: 0,
        shoveUntil: 0,
        wagUntil: 0,
        face: 1,
        lastLine: null,
        flashAt: 0,
        x: 0,
        y: 0,
        state: "idle",
        dir: DIR.down,
        visible: false,
      };
    });
  }

  update(t: number, dt: number, view: Phaser.Geom.Rectangle, labelScale: number, pl: Player): void {
    if (this.destroyed) return;
    const now = this.d.scene.time.now;
    const pnow = performance.now();
    const k = Math.min(1, (dt / 1000) * 3);
    if (pnow - this.conceptAt > 1000) {
      this.conceptAt = pnow;
      const c = currentMapConcept();
      if (c !== this.concept) {
        this.concept = c;
        for (const r of this.list) r.av?.setLook(conceptLook(r.sim.def.id, r.sim.def.look ?? [], c));
      }
    }
    for (const r of this.list) {
      const p = r.sim.at(t, r.pose);
      const target = p.hidden ? 0 : 1;
      // 처음 들어왔을 땐 흐려지지 않고 바로 (맵에 내리자마자 사람이 하나씩 나타나지 않게)
      if (r.alpha < 0) r.alpha = target;
      else if (r.alpha !== target) r.alpha = this.d.reduced ? target : target > r.alpha ? Math.min(1, r.alpha + dt / FADE_MS) : Math.max(0, r.alpha - dt / FADE_MS);
      let x = p.x;
      let y = p.y;
      let state = p.state;
      let dir = p.dir;
      const talking = pnow < r.talkUntil;
      if (talking) {
        x = r.holdX;
        y = r.holdY;
        state = r.holdState;
        dir = r.holdDir;
        r.ox = r.holdX - p.x;
        r.oy = r.holdY - p.y;
        r.tx = r.ty = 0;
      } else {
        // 비켜 서기: 쉬는 중에 내가 바짝 서 있으면 나와 반대쪽 옆으로 한 걸음 (앉은 사람·헤엄은 그대로)
        if (pnow >= r.shoveUntil) {
          const dx = x + r.ox - pl.x;
          const dy = y + r.oy - pl.y;
          const crowd = !p.moving && !p.hidden && state === "idle" && Math.hypot(dx, dy) < MAKE_ROOM && !pl.sitting;
          if (crowd) {
            r.tx = dx >= 0 ? ROOM_STEP : -ROOM_STEP;
            r.ty = 0;
          } else if (Math.hypot(pl.x - (x + r.tx), pl.y - (y + r.ty)) > MAKE_ROOM + 10 || p.moving) {
            r.tx = 0;
            r.ty = 0;
          }
        }
        const kk = pnow < r.shoveUntil ? Math.min(1, (dt / 1000) * 6) : k;
        r.ox += (r.tx - r.ox) * kk;
        r.oy += (r.ty - r.oy) * kk;
        if (Math.abs(r.ox) < 0.3 && Math.abs(r.oy) < 0.3 && !r.tx && !r.ty) r.ox = r.oy = 0;
        x += r.ox;
        y += r.oy;
        const sliding = Math.hypot(r.tx - r.ox, r.ty - r.oy) > 1.5;
        if (sliding && (state === "idle" || state === "sitGround")) {
          state = pnow < r.shoveUntil ? "run" : "walk";
          dir = Math.abs(r.tx - r.ox) > Math.abs(r.ty - r.oy) ? (r.tx > r.ox ? DIR.right : DIR.left) : r.ty > r.oy ? DIR.down : DIR.up;
        }
      }
      r.x = x;
      r.y = y;
      r.state = state;
      r.dir = dir;
      const inView = r.alpha > 0 && x > view.x - CULL && x < view.right + CULL && y > view.y - CULL && y < view.bottom + CULL * 1.5;
      r.visible = inView;
      if (!inView) {
        this.hide(r);
        continue;
      }
      if (r.sim.def.kind === "ghost") this.drawGhost(r, p.act, p.moving, now, pnow, labelScale);
      else this.drawAnimal(r, p.act, p.moving || state === "run" || state === "walk", now, pnow, labelScale, pl);
    }
  }

  private hide(r: FolkView): void {
    r.av?.setVisible(false);
    r.img?.setVisible(false);
    r.label?.setVisible(false);
    r.prop?.setVisible(false);
    r.aux?.setVisible(false);
    if (r.bubble) r.bubble.place(r.x, r.y, 1, this.d.scene.time.now, false);
  }

  private drawGhost(r: FolkView, act: FolkAct, moving: boolean, now: number, pnow: number, labelScale: number): void {
    const def = r.sim.def;
    let v = r.av;
    if (!v) {
      v = r.av = new AvatarView(this.d.scene, this.d.atlas, r.x, r.y, def.color ?? "#e8d9b0", def.name, false, conceptLook(def.id, def.look ?? [], this.concept), def.body ?? "hood");
      v.label.setTint(LABEL);
      v.sprite.anims.timeScale = Math.max(0.5, Math.min(1, def.speed / WALK_SPEED + 0.15));
    }
    v.fade = r.alpha;
    v.apply(r.state, r.dir, now);
    v.place(r.x, r.y);
    v.setVisible(true);
    v.sync(now, labelScale);
    this.drawProp(r, act, moving, pnow);
  }

  /** 손 소품 (소품마다 자리·움직임). 오른쪽 그림 → 왼쪽을 보면 뒤집는다 */
  private drawProp(r: FolkView, act: FolkAct, moving: boolean, pnow: number): void {
    const kind = r.sim.def.prop;
    if (!kind) return;
    const sc = this.d.scene;
    const { x, y, dir, state } = r;
    const s = dir === DIR.left ? -1 : 1;
    const back = dir === DIR.up;
    const hand = { x: x + (dir === DIR.left ? -6 : dir === DIR.right ? 6 : 7), y: y - 5 };
    const front = y + (back ? -0.6 : 0.6);
    const still = this.d.reduced;
    const talking = pnow < r.talkUntil;
    const working = !moving && !talking;
    const prop = (r.prop ??= markCharTint(sc.add.image(0, 0, FTEX.ball).setOrigin(0.5, 1)));
    let usedAux = false;
    const takeAux = (): Phaser.GameObjects.Image => {
      usedAux = true;
      return (r.aux ??= markCharTint(sc.add.image(0, 0, FTEX.ball).setOrigin(0.5, 1))).setAngle(0).setOrigin(0.5, 1).setAlpha(r.alpha);
    };
    prop.setAngle(0).setFlipX(s < 0).setOrigin(0.5, 1).setVisible(true);
    switch (kind) {
      case "tewak": {
        prop.setTexture(FTEX.tewak);
        if (state === "swim" || state === "dive") prop.setPosition(x + 10, y + 1 + (still ? 0 : Math.sin(pnow / 520) * 1)).setDepth(y + 0.6).setFlipX(false);
        else if (state === "sitGround") prop.setPosition(x + 11, y + 1).setDepth(y + 0.4).setFlipX(false);
        else prop.setPosition(hand.x, hand.y + 4).setDepth(front);
        break;
      }
      case "hoe": {
        if (act === "dig" && working && state === "sitGround") {
          takeAux().setTexture(FTEX.basket).setPosition(x + 11, y + 1).setDepth(y + 0.4).setFlipX(false).setVisible(true);
          const swing = still ? 0 : Math.sin(pnow / 170) * 28;
          prop.setTexture(FTEX.hoe).setOrigin(0.3, 0.8).setPosition(x - 6, y - 3).setAngle(-20 + swing).setFlipX(true).setDepth(y + 0.6);
        } else prop.setTexture(FTEX.basket).setPosition(hand.x, hand.y + 3).setDepth(front);
        break;
      }
      case "icebox":
        prop.setTexture(FTEX.icebox).setPosition(x + (dir === DIR.left ? 5 : dir === DIR.right ? -5 : 6), y - 3).setDepth(back ? y + 0.6 : y + (dir === DIR.down ? 0.6 : -0.6));
        if (dir === DIR.left || dir === DIR.right) prop.setDepth(y - 0.6);
        break;
      case "rescue":
        if (act === "watch" && working) prop.setTexture(FTEX.rescue).setPosition(x, y - 4).setDepth(front).setFlipX(false);
        else prop.setTexture(FTEX.rescue).setOrigin(0.5, 0.5).setPosition(hand.x, hand.y - 1).setAngle(80 * s).setDepth(front);
        break;
      case "camera": {
        if (act !== "photo" || !working) {
          prop.setVisible(false);
          break;
        }
        prop.setTexture(FTEX.camera).setPosition(x + (back ? 0 : s * 3), y - 11).setDepth(front);
        // 5.5초마다 찰칵 (짝과 박자가 어긋나게 주민 번호로 민다)
        const ph = (pnow + r.sim.index * 1700) % 5500;
        const a = takeAux().setTexture(FTEX.flash).setOrigin(0.5, 0.5).setPosition(prop.x + s * 2, prop.y - 3).setDepth(DEPTH.fireflies);
        a.setVisible(ph < 180 && !still).setAlpha((1 - ph / 180) * r.alpha);
        break;
      }
      case "axe": {
        if (act === "chop" && working) {
          takeAux().setTexture(FTEX.stump).setPosition(x + s * 12, y + 2).setFlipX(false).setDepth(y + 0.4).setVisible(true);
          // 들어 올렸다 내려찍기 (1.1초)
          const ph = (pnow % 1100) / 1100;
          const ang = still ? 0 : ph < 0.7 ? -80 + ph * 40 : -52 + ((ph - 0.7) / 0.3) * 132;
          prop.setTexture(FTEX.axe).setOrigin(0.4, 0.9).setPosition(x + s * 5, y - 6).setAngle(ang * s).setDepth(front);
        } else prop.setTexture(FTEX.axe).setOrigin(0.4, 0.9).setPosition(hand.x, hand.y + 3).setAngle(160 * s).setDepth(front);
        break;
      }
      case "tongs":
        prop.setTexture(FTEX.tongs).setOrigin(0.1, 0.5).setPosition(hand.x, hand.y - 2).setAngle((act === "grill" && working && !still ? Math.sin(pnow / 160) * 12 : 30) * s).setDepth(front);
        break;
      case "poles": {
        const a = takeAux().setTexture(FTEX.pole).setOrigin(0.5, 1).setFlipX(false).setVisible(true);
        const step = moving && !still ? Math.sin(pnow / 160) * 14 : 6;
        prop.setTexture(FTEX.pole).setPosition(x - 6, y + 1).setAngle(-8 - step).setDepth(y + (back ? -0.6 : 0.6)).setFlipX(false);
        a.setPosition(x + 6, y + 1).setAngle(8 + step).setDepth(y + (back ? -0.6 : 0.6));
        break;
      }
      case "rod":
        if (act === "fish" && working) prop.setTexture(FTEX.rod).setOrigin(0, 1).setPosition(x + s * 3, y - 2).setAngle(still ? 0 : Math.sin(pnow / 900) * 3).setDepth(front);
        else prop.setTexture(FTEX.rod).setOrigin(0, 1).setPosition(hand.x, hand.y + 3).setAngle(-30 * s).setDepth(front);
        break;
      case "scope":
        if (act === "gaze" && working) prop.setTexture(FTEX.scope).setPosition(x + 11, y + 1).setDepth(y + 0.4).setFlipX(false);
        else prop.setVisible(false);
        break;
      case "ball": {
        const b = act === "play" && !still ? Math.abs(Math.sin(pnow / 220)) * 7 : 0;
        prop.setTexture(FTEX.ball).setPosition(x + s * 9, y + 1 - b).setDepth(y + 0.4).setFlipX(false);
        break;
      }
    }
    // 뒤집은 그림은 손잡이 기준점도 거울로 (낚싯대·집게·도끼가 보는 쪽으로 뻗게)
    if (prop.flipX) prop.setOrigin(1 - prop.originX, prop.originY);
    prop.setAlpha(r.alpha);
    if (!usedAux) r.aux?.setVisible(false);
  }

  private drawAnimal(r: FolkView, act: FolkAct, moving: boolean, now: number, pnow: number, labelScale: number, pl: Player): void {
    const def = r.sim.def;
    const cat = def.kind === "cat";
    const sc = this.d.scene;
    const variant = def.variant ?? 0;
    const img = (r.img ??= sc.add.image(r.x, r.y, cat ? LTEX.cat(variant, "sit") : LTEX.dog(variant, "sit0")).setOrigin(0.5, 1));
    if (!r.label) r.label = sc.add.bitmapText(0, 0, FONT_KEY, def.name, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 2).setTint(LABEL);
    if (r.dir === DIR.left) r.face = -1;
    else if (r.dir === DIR.right) r.face = 1;
    const wag = pnow < r.wagUntil;
    if (wag) r.face = pl.x >= r.x ? 1 : -1;
    const run = r.state === "run";
    let bounce = 0;
    if (cat) {
      let f: CatFrame;
      if (moving && !wag) f = Math.floor(pnow / (run ? 110 : 170)) % 2 ? "walk1" : "walk0";
      else if (act === "nap") f = "sleep";
      else if (act === "sit" || wag) f = "sit";
      else f = Math.floor(pnow / 2400) % 3 === 0 ? "groom" : "loaf";
      img.setTexture(LTEX.cat(variant, f));
    } else {
      let f: DogFrame;
      if (moving && !wag) {
        f = Math.floor(pnow / (run ? 95 : 130)) % 2 ? "walk1" : "walk0";
        if (run && !this.d.reduced) bounce = Math.abs(Math.sin(pnow / 70)) * 1.5;
      } else if (wag) f = Math.floor(pnow / (this.d.reduced ? 300 : 120)) % 2 ? "sit1" : "sit0";
      else if (act === "nap") f = r.pose.restMs > 6000 ? "sleep" : "lie";
      else if (act === "look") f = Math.floor(pnow / 260) % 2 ? "sniff1" : "sniff0";
      else f = Math.floor(pnow / 700) % 3 === 0 ? "sit1" : "sit0";
      img.setTexture(LTEX.dog(variant, f));
    }
    img.setFlipX(r.face < 0).setPosition(Math.round(r.x), Math.round(r.y - bounce)).setDepth(r.y).setAlpha(r.alpha).setVisible(true);
    const near = Math.hypot(pl.x - r.x, pl.y - r.y) < LABEL_RADIUS;
    r.label.setVisible(near);
    if (near) r.label.setPosition(r.x, r.y - 14 - bounce).setScale(labelScale).setAlpha(r.alpha);
    r.bubble?.place(r.x, r.y - (near ? 22 : 15), labelScale, now, true);
  }

  private nearest(px: number, py: number, radius: number): FolkView | null {
    let best: FolkView | null = null;
    let bd = radius;
    for (const r of this.list) {
      if (!r.visible || r.alpha < 0.6) continue;
      const d = Math.hypot(r.x - px, r.y - py);
      if (d <= bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** E: 가까운 주민에게 말 걸기 (동물은 쓰다듬기). 했으면 true */
  talk(pl: Player): boolean {
    const r = this.nearest(pl.x, pl.y, TALK_RADIUS);
    if (!r) return false;
    const pnow = performance.now();
    if (pnow - this.talkAt < 700) return true;
    this.talkAt = pnow;
    const now = this.d.scene.time.now;
    const line = (r.sim.def.kind === "ghost" ? pickConceptLine(r.sim.def.id, this.concept, Math.random, r.lastLine) : null) ?? pickFolkLine(r.sim.def, this.d.lineCtx(), Math.random, Date.now(), r.lastLine);
    r.lastLine = line;
    pl.faceTo(r.x, r.y, now);
    if (r.sim.def.kind !== "ghost") {
      r.wagUntil = pnow + 2600;
      r.talkUntil = pnow + 2600;
      r.holdX = r.x;
      r.holdY = r.y;
      r.holdState = "idle";
      r.holdDir = r.dir;
      r.bubble ??= new SpeechBubble(this.d.scene, this.d.atlas);
      r.bubble.show(line, now);
      if (r.sim.def.kind === "dog") playLife(this.d.sfx, "bark", 0.2);
      else playLife(this.d.sfx, "meow", 0.35);
      return true;
    }
    if (!r.av) return false;
    if (pnow >= r.talkUntil) {
      const sitting = r.state === "sitGround";
      r.holdX = r.x;
      r.holdY = r.y;
      r.holdState = sitting || r.state === "swim" ? r.state : r.state === "dive" ? "swim" : "idle";
      r.holdDir = faceToward(r.x, r.y, pl.x, pl.y, r.dir);
    }
    r.talkUntil = pnow + SAY_MS + 600;
    r.av.say(line, now);
    return true;
  }

  /** 발밑 안내 ("E 숨비 할망 말 걸기") */
  hint(prefix: string, px: number, py: number): { text: string; dist: number } | null {
    const r = this.nearest(px, py, TALK_RADIUS);
    if (!r) return null;
    const verb = r.sim.def.kind === "ghost" ? "말 걸기" : "쓰다듬기";
    return { text: `${prefix}${r.sim.def.name} ${verb}`, dist: Math.hypot(r.x - px, r.y - py) };
  }

  /** 이 주민 머리 위에 짧은 말 (맵이 정한 반응 — 호루라기 등) */
  say(r: FolkView, text: string): void {
    const now = this.d.scene.time.now;
    if (r.av) r.av.say(text, now);
    else {
      r.bubble ??= new SpeechBubble(this.d.scene, this.d.atlas);
      r.bubble.show(text, now, 1600);
    }
  }

  emote(r: FolkView, icon: EmoteIcon): void {
    r.av?.emote(icon, this.d.scene.time.now);
  }

  /** 놀라 (dx, dy)만큼 달아났다가 ms 뒤 공유 자리로 돌아온다 (내 화면에서만) */
  shove(r: FolkView, dx: number, dy: number, ms: number): void {
    r.tx = dx;
    r.ty = dy;
    r.shoveUntil = performance.now() + ms;
  }

  /** 걷거나 뛰는 주민 자리 (갈매기가 놀라 날아오르게 — 맵에 넘긴다) */
  movers(out: { x: number; y: number }[]): void {
    for (const r of this.list) if (r.visible && (r.state === "walk" || r.state === "run")) out.push({ x: r.x, y: r.y });
  }

  /** 어둠 속 빛: 손등불을 든 주민은 환하게, 나머지 유령은 은은하게 */
  addLights(lit: Lighting): void {
    for (const r of this.list) {
      if (!r.visible || r.alpha < 0.3) continue;
      if (r.sim.def.look?.includes("hand_lantern")) lit.add(r.x, r.y - 8, 40, 0.75 * r.alpha);
      else if (r.sim.def.kind === "ghost") lit.add(r.x, r.y - 8, 20, 0.35 * r.alpha);
    }
  }

  /** 미니맵용 자리 [x, y, …] (나와 있는 주민만) */
  dots(out: number[] = []): number[] {
    for (const r of this.list) if (r.alpha > 0.5 && !r.pose.hidden) out.push(Math.round(r.pose.x), Math.round(r.pose.y));
    return out;
  }

  /** 시각 t의 구간을 budgetMs 동안만 미리 계산. 다 됐으면 true */
  warm(t: number, budgetMs: number): boolean {
    const t0 = performance.now();
    for (const r of this.list) {
      if (!r.sim.warmLeg(t)) continue;
      if (performance.now() - t0 >= budgetMs) return false;
    }
    return true;
  }

  private clear(): void {
    for (const r of this.list) {
      r.av?.destroy();
      r.img?.destroy();
      r.label?.destroy();
      r.bubble?.destroy();
      r.prop?.destroy();
      r.aux?.destroy();
    }
    this.list = [];
  }

  /**
   * 11/18 눈싸움: 맞을 수 있는 주민·동물 (보이는 것만 상자를 낸다). 유령 주민은 AvatarView 그대로(눈 묻은 얼굴·말풍선),
   * 강아지·고양이는 그림 한 장. 맞으면 말할 때처럼 그 자리에 붙들었다가(멈칫) 공유 자리로 슬며시
   */
  snowNpcs(): readonly SnowNpc[] {
    if (this.snowList && this.snowFor === this.list) return this.snowList;
    this.snowFor = this.list;
    return (this.snowList = this.list.map(
      (r): SnowNpc => ({
        voice: r.sim.def.kind === "ghost" ? "person" : r.sim.def.kind,
        box: (out) => {
          if (!r.visible || r.alpha < 0.5) return false;
          if (r.av) return r.av.visible && !!r.av.snowBody(out);
          return imageBox(r.img, out);
        },
        av: () => r.av,
        img: () => r.img,
        say: (text) => this.say(r, text),
        hold: (ms) => {
          const pnow = performance.now();
          if (pnow < r.talkUntil) return;
          r.holdX = r.x;
          r.holdY = r.y;
          r.holdState = r.state === "walk" || r.state === "run" ? "idle" : r.state;
          r.holdDir = r.dir;
          r.talkUntil = pnow + ms;
        },
      }),
    ));
  }
  private snowList: SnowNpc[] | null = null;
  private snowFor: FolkView[] | null = null;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clear();
  }
}

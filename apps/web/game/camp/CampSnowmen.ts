import * as Phaser from "phaser";
import { snowmanAlive, snowmanMelt, type SnowmanDenyWhy, type SnowmanInfo } from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import { isTouchUi, keyJosa } from "../input/keyHint";
import type { RealtimeClient } from "../net/RealtimeClient";
import { handAnchor } from "../sprites/avatar";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { Sfx } from "../world/Sfx";
import { CAMP_TEX_PREFIX } from "./campTypes";
import * as Art from "./snowmanArt";
import type { BallSize } from "./snowmanArt";
import { ballFront, campSnowPiles, carryAt, heldStep, LOCAL_STACKS_MAX, meltStage, PUDDLE_MS, SNOWBALL_GROW_AT, snowPlaceOk, snowRollGrows, SNOW_REACH, stackCheck, stackDone, type LocalStack } from "./snowmanLogic";

// 11/17 캠핑장 「눈사람 만들기」 (겨울·크리스마스 판에서만).
//  - 눈더미 앞에서 E → 작은 눈덩이(머리 크기)를 집어 품에 안는다. 안고 걸으면 그대로라 먼 곳까지 가져갈 수 있다
//  - 11/18 굴리기: Space(터치는 [점프] 자리의 [굴리기])를 누른 채 걸으면 발 앞에서 굴러가며 굴린 거리만큼 커진다 (배 → 몸통). 떼면 그 크기로 다시 안는다
//  - E로 발 앞에 내려놓는다. 내려놓은 덩이 위에 더 작은 덩이를 올리고, 몸통·배·머리 세 단이 되면 서버에 세우기를 보낸다
//  - 굴리기·내려놓은 덩이는 내 화면에만 (다른 맵에 가면 사라진다). 세운 눈사람만 같은 채널 캠핑장 모두에게 (서버 씨앗 → 같은 모습, 만든 사람 이름표)
//  - 1시간 뒤 녹는다: 마지막 10분은 단계마다 작아지고, 다 녹으면 물웅덩이가 잠깐 남는다
// 들고 있는 동안 앉기·탈것은 막는다 (CampScene이 blocks로 묻는다). 점프 키는 굴리기가 되고, 굴리는 동안은 달리지 않는다.

const P = `${CAMP_TEX_PREFIX}snow-`;
const TEX = {
  pile: (v: number) => `${P}pile${v}`,
  roll: (s: BallSize) => `${P}roll${s}`,
  carry: (s: BallSize) => `${P}carry${s}`,
  track: (s: BallSize) => `${P}track${s}`,
  stack: (sizes: readonly BallSize[]) => `${P}stack${sizes.join("")}`,
  man: (seed: number, xm: boolean, m: number) => `${P}man${seed}-${xm ? 1 : 0}-${m}`,
  puddle: (seed: number, xm: boolean) => `${P}puddle${seed}-${xm ? 1 : 0}`,
};
/** 그림 바닥 줄 아래 그림자 몫 (원점 0.5,1 — 발 위치보다 이만큼 아래가 그림 바닥) */
const FOOT = 3;
/** 굴린 자국 간격 (px)·최대 수·사라지는 시간 */
const TRACK_EVERY = 5;
const TRACK_MAX = 70;
const TRACK_MS = 9_000;
/** 서버 답을 기다리는 시간 */
const PENDING_MS = 6_000;
const LABEL_TINT = 0xf2f6ff;
/** 막힌 동작 안내 간격 */
const BLOCK_TOAST_MS = 2_500;
/** 처음 집을 때 굴리기 안내를 이 기기에서 한 번 */
const ROLL_TIP_KEY = "tomb.camp.snowRollTip";

/** rolling = 지금 굴리는 중 (아니면 품에 안고 있다), walked = 안고 걸은 거리 (걸음마다 덩이가 살짝 들썩인다) */
type Held = { size: BallSize; dist: number; roll: number; lastX: number; lastY: number; trackAt: number; rolling: boolean; walked: number; img: Phaser.GameObjects.Sprite };
type ManView = { s: SnowmanInfo; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; stage: number; puddleUntil: number };

export type CampSnowmenDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  player: () => Player;
  net: () => RealtimeClient;
  toast: (m: string) => void;
  concept: MapConcept;
};

export class CampSnowmen {
  private concept: MapConcept;
  private readonly piles: { x: number; y: number; img: Phaser.GameObjects.Image }[] = [];
  private held: Held | null = null;
  private readonly stacks: (LocalStack & { img: Phaser.GameObjects.Image })[] = [];
  private readonly men = new Map<string, ManView>();
  private readonly tracks: Phaser.GameObjects.Image[] = [];
  private stackSeq = 0;
  private meltAt = 0;
  private blockToastAt = -Infinity;

  constructor(private readonly d: CampSnowmenDeps) {
    this.concept = d.concept;
    const scene = d.scene;
    campSnowPiles().forEach((p, i) => {
      const v = i % Art.SNOW_PILE_VARIANTS;
      addCanvasTexture(scene, TEX.pile(v), { canvas: Art.snowPileArt(v).toCanvas() });
      this.piles.push({ ...p, img: scene.add.image(p.x, p.y + FOOT + 1, TEX.pile(v)).setOrigin(0.5, 1).setDepth(p.y) });
    });
    this.applyVisible();
  }

  get on(): boolean {
    return isSnowy(this.concept);
  }

  get holding(): boolean {
    return this.held !== null;
  }

  setConcept(c: MapConcept): void {
    this.concept = c;
    if (!this.on) {
      this.dropHeld();
      for (const st of this.stacks.splice(0)) st.img.destroy();
    }
    // 크리스마스 ↔ 겨울: 모자 비중이 달라 모습을 다시 고른다
    const sn = this.d.net().serverNow();
    for (const v of this.men.values()) {
      v.stage = -1;
      this.restage(v, sn);
    }
    this.applyVisible();
  }

  private applyVisible(): void {
    const on = this.on;
    for (const p of this.piles) p.img.setVisible(on);
    for (const v of this.men.values()) {
      v.img.setVisible(on);
      v.label.setVisible(on && v.puddleUntil === 0);
    }
    for (const t of this.tracks) t.setVisible(on);
  }

  // ── 실시간 ──

  onSnowmen(list: SnowmanInfo[]): void {
    const keep = new Set(list.map((s) => s.id));
    for (const [id, v] of this.men) if (!keep.has(id) && v.puddleUntil === 0) this.removeMan(id);
    for (const s of list) if (!this.men.has(s.id)) this.addMan(s, false);
  }

  onSnowman(s: SnowmanInfo, mine: boolean): void {
    if (mine) {
      // 기다리던 내 덩이를 서버 눈사람으로 바꿔 끼운다
      const i = this.stacks.findIndex((st) => st.pending && Math.hypot(st.x - s.x, st.y - s.y) < 24);
      if (i >= 0) this.stacks.splice(i, 1)[0].img.destroy();
    }
    if (this.men.has(s.id)) return;
    this.addMan(s, true);
    if (mine && this.on) {
      this.d.sfx.play("bubble", 0.5);
      this.d.toast("눈사람을 세웠어요! 같은 채널 캠핑장 모두에게 보여요. 1시간 뒤에 녹아요.");
    }
  }

  onGone(id: string): void {
    const v = this.men.get(id);
    if (v && v.puddleUntil === 0) this.toPuddle(v);
  }

  onDenied(why: SnowmanDenyWhy): void {
    const st = this.stacks.find((s) => s.pending);
    if (st) this.undoPending(st);
    this.d.toast(why === "wait" ? "조금 있다가 다시 올려 주세요." : "여기에는 눈사람을 세울 수 없어요. 다른 눈밭에서 쌓아요.");
  }

  /** 기다리던 세 단을 두 단으로 되돌리고 머리를 다시 손에 */
  private undoPending(st: LocalStack & { img: Phaser.GameObjects.Image }): void {
    st.pending = undefined;
    const top = st.sizes.pop();
    this.redrawStack(st);
    if (top !== undefined && !this.held) this.pickUp(top, 0);
  }

  // ── E ──

  /** E (또는 [상호작용]): 들고 있으면 내려놓기·올리기, 아니면 눈더미에서 집기·내 덩이 다시 들기. 처리했으면 true */
  interact(): boolean {
    if (!this.on) return false;
    const pl = this.d.player();
    if (this.held) {
      this.place();
      return true;
    }
    const pile = this.nearPile(pl.x, pl.y);
    const st = this.nearStack(pl.x, pl.y);
    if (st && (!pile || Math.hypot(st.x - pl.x, st.y - pl.y) < Math.hypot(pile.x - pl.x, pile.y - pl.y))) {
      const top = st.sizes.pop()!;
      if (st.sizes.length) this.redrawStack(st);
      else this.removeStack(st);
      this.pickUp(top, top === 0 ? 0 : SNOWBALL_GROW_AT[top - 1]);
      pl.faceTo(st.x, st.y, this.d.scene.time.now);
      return true;
    }
    if (pile) {
      pl.faceTo(pile.x, pile.y, this.d.scene.time.now);
      this.pickUp(0, 0);
      this.rollTip();
      return true;
    }
    return false;
  }

  /** 처음 눈더미에서 집으면 굴리는 법을 한 번 알린다 (이 기기에서 한 번 — 저장소를 못 쓰면 다음에도) */
  private rollTip(): void {
    try {
      if (localStorage.getItem(ROLL_TIP_KEY) === "1") return;
      localStorage.setItem(ROLL_TIP_KEY, "1");
    } catch {
      // 저장소를 못 쓰면 이번에 알리고 다음에도 알린다
    }
    this.d.toast(isTouchUi() ? "[굴리기]를 누른 채 걸으면 커져요." : "Space를 누른 채 걸으면 커져요.");
  }

  /** 들고 있는 동안 막는 동작이면 true (안내는 가끔) */
  blocks(): boolean {
    if (!this.held) return false;
    const now = this.d.scene.time.now;
    if (now - this.blockToastAt > BLOCK_TOAST_MS) {
      this.blockToastAt = now;
      this.d.toast(`눈덩이를 안고 있어요. ${keyJosa("E", "로")} 내려놓은 다음에 할 수 있어요.`);
    }
    return true;
  }

  /** 굴리는 중인지 (CampScene이 달리기를 막는다) */
  get rolling(): boolean {
    return this.held?.rolling === true;
  }

  /**
   * 화면 안내 ("E 눈 뭉치기"). 들고 있으면 언제나:
   * 안고 있으면 발밑에 「E 머리 내려놓기」와 굴리는 법 한 줄, 굴리는 중이면 덩이 앞에 「손을 떼면 다시 안아요」, 앞에 내 덩이가 있으면 올리기
   */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    if (!this.on) return null;
    const pl = this.d.player();
    const h = this.held;
    if (h) {
      const at = ballFront(pl.x, pl.y, pl.dir, Art.BALL_R[h.size]);
      const st = this.stackAt(at.x, at.y);
      const name = Art.BALL_NAME[h.size];
      if (st) {
        const c = stackCheck(st, h.size);
        if (c === "ok") return { x: at.x, y: at.y + 4, text: st.sizes.length === 2 && h.size === 0 ? `${prefix}머리 올려 눈사람 완성` : `${prefix}${name} 올리기` };
        return { x: at.x, y: at.y + 4, text: c === "full" ? "다 쌓은 덩이예요" : "더 작은 덩이만 올릴 수 있어요" };
      }
      if (h.rolling) {
        const text = !snowRollGrows(at.x, at.y) ? "여기는 눈이 안 묻어요" : h.size === 2 ? "가장 큰 몸통이에요\n손을 떼면 다시 안아요" : "손을 떼면 다시 안아요";
        return { x: at.x, y: at.y + 4, text };
      }
      const how = h.size === 2 ? "" : isTouchUi() ? "\n[굴리기]를 누른 채 걸으면 굴러요" : "\nSpace를 누른 채 걸으면 굴러요";
      return { x: pl.x, y: pl.y + 3, text: `${prefix}${name} 내려놓기${how}` };
    }
    const pile = this.nearPile(pl.x, pl.y);
    const st = this.nearStack(pl.x, pl.y);
    if (st && (!pile || Math.hypot(st.x - pl.x, st.y - pl.y) < Math.hypot(pile.x - pl.x, pile.y - pl.y))) return { x: st.x, y: st.y + 4, text: `${prefix}다시 들기` };
    if (pile) return { x: pile.x, y: pile.y + 4, text: `${prefix}눈 뭉치기` };
    return null;
  }

  /** 들고 있던 덩이를 버린다 (버스·친구한테 가기·판이 바뀜) */
  dropHeld(): void {
    if (!this.held) return;
    this.held.img.destroy();
    this.held = null;
    bridge.emit("camp:snowball", { held: false });
  }

  private nearPile(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = SNOW_REACH + 6;
    for (const p of this.piles) {
      const d = Math.hypot(p.x - x, (p.y - y) * 1.3);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private nearStack(x: number, y: number): (LocalStack & { img: Phaser.GameObjects.Image }) | null {
    let best: (LocalStack & { img: Phaser.GameObjects.Image }) | null = null;
    let bd = SNOW_REACH;
    for (const st of this.stacks) {
      if (st.pending) continue;
      const d = Math.hypot(st.x - x, st.y - y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** 굴리는 눈덩이 자리(발 앞)에 있는 내 덩이 */
  private stackAt(x: number, y: number): (LocalStack & { img: Phaser.GameObjects.Image }) | null {
    let best: (LocalStack & { img: Phaser.GameObjects.Image }) | null = null;
    let bd = 13;
    for (const st of this.stacks) {
      if (st.pending) continue;
      const d = Math.hypot(st.x - x, (st.y - y) * 1.3);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** 덩이를 품에 안는다 (굴리기는 update가 누르고 있는지 보고 바꾼다) */
  private pickUp(size: BallSize, dist: number): void {
    const scene = this.d.scene;
    const pl = this.d.player();
    this.ensureCarry(size);
    const img = scene.add.sprite(pl.x, pl.y, TEX.carry(size), 0);
    this.held = { size, dist, roll: 0, lastX: pl.x, lastY: pl.y, trackAt: 0, rolling: false, walked: 0, img };
    this.d.sfx.play("thud", 0.25, 1.4);
    bridge.emit("camp:snowball", { held: true });
    this.syncHeld(false);
  }

  /** 들고 있는 덩이를 발 앞에 내려놓거나 그 자리 덩이 위에 올린다 */
  private place(): void {
    const h = this.held!;
    const pl = this.d.player();
    const at = ballFront(pl.x, pl.y, pl.dir, Art.BALL_R[h.size]);
    const st = this.stackAt(at.x, at.y);
    if (st) {
      const c = stackCheck(st, h.size);
      if (c !== "ok") {
        this.d.toast(c === "full" ? "이미 세 단을 다 쌓았어요." : "위에는 더 작은 덩이만 올릴 수 있어요. 몸통 → 배 → 머리 순서예요.");
        return;
      }
      st.sizes.push(h.size);
      this.dropHeld();
      this.redrawStack(st);
      this.d.sfx.play("thud", 0.35, 1.1);
      if (stackDone(st)) this.build(st);
      return;
    }
    const others = [...this.men.values()].filter((v) => v.puddleUntil === 0).map((v) => v.s);
    const nearPile = this.piles.some((p) => Math.abs(p.x - at.x) < 24 && Math.abs(p.y - at.y) < 14);
    if (nearPile || !snowPlaceOk(Math.round(at.x), Math.round(at.y), [...others, ...this.stacks])) {
      this.d.toast(`여기에는 내려놓을 수 없어요. 눈밭 빈자리에서 ${keyJosa("E", "를")} 눌러요.`);
      return;
    }
    if (this.stacks.length >= LOCAL_STACKS_MAX) {
      const old = this.stacks.find((s) => !s.pending);
      if (old) this.removeStack(old);
    }
    const ns = { id: ++this.stackSeq, x: Math.round(at.x), y: Math.round(at.y), sizes: [h.size], img: this.d.scene.add.image(0, 0, "__DEFAULT") };
    this.stacks.push(ns);
    this.dropHeld();
    this.redrawStack(ns);
    this.d.sfx.play("thud", 0.3, 1.2);
    if (h.size !== 2 && !this.stacks.some((s) => s !== ns && s.sizes.length > 0)) this.d.toast("몸통이 될 큰 덩이부터 내려놓고, 그 위에 배·머리를 올려요.");
  }

  /** 세 단이 다 쌓였다 → 서버에 세우기 (답이 오면 서버 눈사람으로 바꿔 끼운다) */
  private build(st: LocalStack & { img: Phaser.GameObjects.Image }): void {
    if (!this.d.net().snowman(st.x, st.y)) {
      this.d.toast("연결된 뒤에 눈사람을 세울 수 있어요.");
      this.undoPending(st);
      return;
    }
    st.pending = this.d.scene.time.now;
  }

  private redrawStack(st: LocalStack & { img: Phaser.GameObjects.Image }): void {
    const key = TEX.stack(st.sizes);
    addCanvasTexture(this.d.scene, key, { canvas: Art.stackArt(st.sizes).toCanvas() });
    st.img.setTexture(key).setOrigin(0.5, 1).setPosition(st.x, st.y + FOOT).setDepth(st.y).setVisible(this.on);
  }

  private removeStack(st: LocalStack & { img: Phaser.GameObjects.Image }): void {
    const i = this.stacks.indexOf(st);
    if (i >= 0) this.stacks.splice(i, 1);
    st.img.destroy();
  }

  private ensureRoll(s: BallSize): void {
    const sh = Art.rollingBallSheet(s);
    addCanvasTexture(this.d.scene, TEX.roll(s), { canvas: sh.grid.toCanvas(), frameW: sh.frameW, frameH: sh.frameH });
  }

  private ensureCarry(s: BallSize): void {
    const sh = Art.carriedBallSheet(s);
    addCanvasTexture(this.d.scene, TEX.carry(s), { canvas: sh.grid.toCanvas(), frameW: sh.frameW, frameH: sh.frameH });
  }

  // ── 서버 눈사람 ──

  private addMan(s: SnowmanInfo, fresh: boolean): void {
    const scene = this.d.scene;
    const img = scene.add.image(s.x, s.y + FOOT, "__DEFAULT").setOrigin(0.5, 1).setDepth(s.y);
    this.d.atlas.ensure(s.by);
    const label = scene.add.bitmapText(s.x, s.y, FONT_KEY, s.by, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.labels - 2).setTint(LABEL_TINT);
    const v: ManView = { s, img, label, stage: -1, puddleUntil: 0 };
    this.men.set(s.id, v);
    this.restage(v, this.d.net().serverNow());
    if (fresh && !this.d.reduced && this.on) {
      img.setScale(0.6, 0.2);
      scene.tweens.add({ targets: img, scaleX: 1, scaleY: 1, duration: 420, ease: "Back.easeOut" });
    }
    this.applyVisible();
  }

  private removeMan(id: string): void {
    const v = this.men.get(id);
    if (!v) return;
    v.img.destroy();
    v.label.destroy();
    this.men.delete(id);
  }

  /** 녹는 단계를 맞춘다 (다 녹았으면 물웅덩이로) */
  private restage(v: ManView, now: number): void {
    if (v.puddleUntil) return;
    if (!snowmanAlive(v.s.at, now)) return this.toPuddle(v);
    const m = meltStage(snowmanMelt(v.s.at, now));
    if (m === v.stage) return;
    v.stage = m;
    const xm = this.concept === "christmas";
    const key = TEX.man(v.s.seed, xm, m);
    addCanvasTexture(this.d.scene, key, { canvas: Art.snowmanArt(Art.snowmanLook(v.s.seed, xm), m).toCanvas() });
    v.img.setTexture(key);
  }

  private toPuddle(v: ManView): void {
    const xm = this.concept === "christmas";
    const key = TEX.puddle(v.s.seed, xm);
    addCanvasTexture(this.d.scene, key, { canvas: Art.puddleArt(Art.snowmanLook(v.s.seed, xm)).toCanvas() });
    v.img.setTexture(key).setDepth(DEPTH.decal + v.s.y);
    v.label.setVisible(false);
    v.puddleUntil = this.d.scene.time.now + PUDDLE_MS;
    if (!this.d.reduced) this.d.scene.tweens.add({ targets: v.img, alpha: 0, delay: PUDDLE_MS - 3000, duration: 3000 });
  }

  // ── 매 프레임 ──

  /** rolling = 굴리기(Space·[굴리기])를 누르고 있다 */
  update(labelScale: number, rolling = false): void {
    const now = this.d.scene.time.now;
    if (now >= this.meltAt) {
      this.meltAt = now + 1000;
      const sn = this.d.net().serverNow();
      for (const v of [...this.men.values()]) {
        if (v.puddleUntil && now >= v.puddleUntil) this.removeMan(v.s.id);
        else this.restage(v, sn);
      }
      for (const st of this.stacks) if (st.pending && now - st.pending > PENDING_MS) this.onDenied("spot");
    }
    for (const v of this.men.values()) {
      if (v.puddleUntil || !this.on) continue;
      // 11/18 사용자 「이름이 작아서 안 보여요」: 0.84배 → 사람 이름표보다 조금 크게(1.25배), 흐리게 하지 않고 밝게
      if (v.label.scaleX !== labelScale * 1.25) v.label.setScale(labelScale * 1.25);
      v.label.setPosition(Math.round(v.s.x), Math.round(v.s.y - Art.snowmanTop(v.stage) - 1));
    }
    if (this.held) this.syncHeld(rolling && this.on);
  }

  /** 들고 있는 덩이: 굴리면 발 앞에서 굴러가며 굴린 거리만큼 커지고, 아니면 품에 안고 걷는다 (안 커진다) */
  private syncHeld(rolling: boolean): void {
    const h = this.held!;
    const pl = this.d.player();
    const moved = Math.hypot(pl.x - h.lastX, pl.y - h.lastY);
    h.lastX = pl.x;
    h.lastY = pl.y;
    if (rolling !== h.rolling) this.setRolling(rolling);
    const r = Art.BALL_R[h.size];
    // 순간이동(친구 옆·버스)은 굴린·걸은 것으로 치지 않는다
    const step = moved > 0 && moved < 24 && !pl.airborne ? moved : 0;
    if (!h.rolling) {
      h.walked += step;
      this.syncCarry(r);
      return;
    }
    const at = ballFront(pl.x, pl.y, pl.dir, r);
    if (step > 0) {
      h.roll += step;
      const grows = snowRollGrows(at.x, at.y);
      const next = heldStep(h, step, true, grows);
      h.dist = next.dist;
      if (grows) {
        h.trackAt += step;
        if (h.trackAt >= TRACK_EVERY) {
          h.trackAt = 0;
          this.addTrack(h.size, at.x, at.y);
        }
      }
      if (next.size > h.size) this.grow(next.size);
    }
    const horiz = pl.dir === 1 || pl.dir === 2;
    const f0 = Math.floor(h.roll / 3) % Art.BALL_ROLL_FRAMES;
    const f = horiz ? f0 : pl.dir === 3 ? (Art.BALL_ROLL_FRAMES - f0) % Art.BALL_ROLL_FRAMES : f0;
    h.img
      .setFrame(horiz ? f : Art.BALL_ROLL_FRAMES + f)
      .setFlipX(pl.dir === 1)
      .setPosition(Math.round(at.x), Math.round(at.y) + FOOT)
      .setDepth(at.y)
      .setVisible(this.on);
  }

  /** 품에 안은 덩이: 몸 앞(아래를 보면 배꼽 앞, 옆이면 몸 앞쪽, 위를 보면 몸 뒤에 가려 가장자리만). 걸으면 한 걸음마다 1px 들썩인다 */
  private syncCarry(r: number): void {
    const h = this.held!;
    const pl = this.d.player();
    const dir = pl.dir;
    const hand = handAnchor(pl.view.bodyId, dir === 1 ? "left" : dir === 2 ? "right" : dir === 3 ? "up" : "down");
    const fr = Art.carryFrameSize(h.size);
    const c = carryAt(pl.x, pl.y, dir, r, r * 0.9, hand.up, pl.view.scaleNow);
    const bob = Math.floor(h.walked / 6) % 2;
    h.img
      .setFrame(dir === 1 || dir === 2 ? 1 : dir === 3 ? 2 : 0)
      .setFlipX(dir === 1)
      .setOrigin(0.5, fr.cy / fr.h)
      .setPosition(Math.round(c.x), Math.round(c.y) - bob)
      .setDepth(c.depth)
      .setVisible(this.on);
  }

  /** 굴리기 시작(발 앞 바닥에 내려 굴린다)·멈춤(그 크기로 다시 안는다) */
  private setRolling(on: boolean): void {
    const h = this.held!;
    h.rolling = on;
    if (on) {
      this.ensureRoll(h.size);
      h.img.setTexture(TEX.roll(h.size), 0).setOrigin(0.5, 1);
      this.d.sfx.play("thud", 0.18, 1.2);
    } else {
      this.ensureCarry(h.size);
      h.img.setTexture(TEX.carry(h.size), 0);
    }
  }

  /** 굴리다 크기 단계를 넘었다: 덩이가 톡 부풀고 짧은 알림 */
  private grow(size: BallSize): void {
    const h = this.held!;
    h.size = size;
    this.ensureRoll(size);
    h.img.setTexture(TEX.roll(size), 0);
    this.d.sfx.play("thud", 0.3, 0.9);
    if (!this.d.reduced) {
      h.img.setScale(0.8);
      this.d.scene.tweens.add({ targets: h.img, scale: 1, duration: 220, ease: "Back.easeOut" });
    }
    this.d.toast(size === 2 ? "몸통 크기가 됐어요. 가장 큰 크기예요." : "배 크기가 됐어요. 더 굴리면 몸통이 돼요.");
  }

  private addTrack(s: BallSize, x: number, y: number): void {
    const scene = this.d.scene;
    const key = TEX.track(s);
    addCanvasTexture(scene, key, { canvas: Art.rollTrackArt(s).toCanvas() });
    const t = scene.add.image(Math.round(x), Math.round(y) + 1, key).setOrigin(0.5, 1).setDepth(DEPTH.decal + 1).setVisible(this.on);
    this.tracks.push(t);
    if (this.tracks.length > TRACK_MAX) this.tracks.shift()?.destroy();
    scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: TRACK_MS * 0.5,
      duration: TRACK_MS * 0.5,
      onComplete: () => {
        const i = this.tracks.indexOf(t);
        if (i >= 0) this.tracks.splice(i, 1);
        t.destroy();
      },
    });
  }

  destroy(): void {
    this.dropHeld();
    for (const p of this.piles.splice(0)) p.img.destroy();
    for (const st of this.stacks.splice(0)) st.img.destroy();
    for (const id of [...this.men.keys()]) this.removeMan(id);
    for (const t of this.tracks.splice(0)) t.destroy();
  }
}

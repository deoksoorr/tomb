import * as Phaser from "phaser";
import {
  DIR,
  STATE,
  SNOW_HOLD_SEND_MS,
  SNOWMAN_PER_PERSON,
  SNOW_STACKS_PER_PERSON,
  parseSnowHold,
  snowGapWhy,
  snowmanAlive,
  snowmanMelt,
  snowStackAlive,
  snowSegDist,
  type DirId,
  type Sid,
  type SnowAct,
  type SnowBall,
  type SnowHold,
  type SnowmanDenyWhy,
  type SnowmanInfo,
  type SnowStackInfo,
} from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { addCanvasTexture } from "../assets/manifest";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { isTouchUi, keyJosa } from "../input/keyHint";
import type { RealtimeClient } from "../net/RealtimeClient";
import { handAnchor } from "../sprites/avatar";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import type { Sfx } from "../world/Sfx";
import { CAMP_TEX_PREFIX } from "./campTypes";
import * as Art from "./snowmanArt";
import type { BallSize } from "./snowmanArt";
import {
  ballFront,
  campSnowPiles,
  carryAt,
  heldStep,
  MELT_PASS_STAGE,
  meltStage,
  PUDDLE_MS,
  rectsOverlap,
  SNOWBALL_GROW_AT,
  snowmanBlockRect,
  snowPlaceOk,
  snowRollGrows,
  SNOW_REACH,
  stackBlockRect,
  stackCheck,
  stackDone,
  type Rect,
} from "./snowmanLogic";

// 11/17 캠핑장 「눈사람 만들기」 (겨울·크리스마스 판에서만).
//  - 눈더미 앞에서 E → 작은 눈덩이(머리 크기)를 집어 품에 안는다. 안고 걸으면 그대로라 먼 곳까지 가져갈 수 있다
//  - 11/18 굴리기: Space(터치는 [점프] 자리의 [굴리기])를 누른 채 걸으면 발 앞에서 굴러가며 굴린 거리만큼 커진다 (배 → 몸통). 떼면 그 크기로 다시 안는다
//  - E로 발 앞에 내려놓는다. 내려놓은 덩이 위에 더 작은 덩이를 올리고, 세 단째(머리)를 올리면 서버가 그 자리에 눈사람을 세운다
//  - 11/18 만드는 과정도 같은 채널 캠핑장 모두에게: 안고 다니기·굴리기(바뀔 때만 snowHold), 내려놓은 덩이(서버 목록 — 내려놓기·올리기·다시 들기)
//    내 동작은 화면에 먼저 그리고 서버 확인(snowStack)으로 맞춘다. 거절되면 되돌리고 덩이를 다시 든다. 다른 사람 덩이·눈사람 곁에는 못 놓는다
//  - 11/18 다 세운 눈사람·내려놓은 덩이는 밑동에 작은 충돌 상자 — 내 캐릭터가 지나가지 못한다 (생길 때 겹쳐 서 있었으면 빠져나갈 때까지 비켜 준다)
//  - 1시간 뒤 녹는다: 마지막 10분은 단계마다 작아지고, 다 녹으면 물웅덩이가 잠깐 남는다
// 들고 있는 동안 앉기·탈것은 막는다 (CampScene이 blocks로 묻는다). 점프 키는 굴리기가 되고, 굴리는 동안은 달리지 않는다.

const P = `${CAMP_TEX_PREFIX}snow-`;
const TEX = {
  pile: (v: number) => `${P}pile${v}`,
  roll: (s: BallSize) => `${P}roll${s}`,
  carry: (s: BallSize) => `${P}carry${s}`,
  track: (s: BallSize) => `${P}track${s}`,
  stack: (sizes: readonly BallSize[]) => `${P}stack${sizes.join("")}`,
  man: (seed: number, xm: boolean, m: number, oh = false) => `${P}man${seed}-${xm ? 1 : 0}-${m}${oh ? "o" : ""}`,
  puddle: (seed: number, xm: boolean) => `${P}puddle${seed}-${xm ? 1 : 0}`,
};
/** 그림 바닥 줄 아래 그림자 몫 (원점 0.5,1 — 발 위치보다 이만큼 아래가 그림 바닥) */
const FOOT = 3;
/** 굴린 자국 간격 (px)·최대 수·사라지는 시간 */
const TRACK_EVERY = 5;
const TRACK_MAX = 70;
const TRACK_MS = 9_000;
/** 서버 답을 기다리는 시간 (넘으면 거절된 것으로 본다) */
const PENDING_MS = 6_000;
const LABEL_TINT = 0xf2f6ff;
/** 막힌 동작 안내 간격 */
const BLOCK_TOAST_MS = 2_500;
/** 처음 집을 때 굴리기 안내를 이 기기에서 한 번 */
const ROLL_TIP_KEY = "tomb.camp.snowRollTip";
/** 다른 사람 자리라 못 놓을 때 안내 */
const NEAR_TOAST = "다른 사람이 만들고 있는 자리예요.";
/** 11/18 눈싸움: 눈뭉치에 맞은 눈사람이 놀란 얼굴로 있는 시간 · 맞는 밑동 둘레 (발 위치, 세로는 1.6배로 잰다) */
const OH_MS = 1_200;
const HIT_R = 10;

/** rolling = 지금 굴리는 중 (아니면 품에 안고 있다), walked = 안고 걸은 거리 (걸음마다 덩이가 살짝 들썩인다) */
type Held = { size: BallSize; dist: number; roll: number; lastX: number; lastY: number; trackAt: number; rolling: boolean; walked: number; img: Phaser.GameObjects.Sprite };
/** 밑동 충돌 상자. solid = 막는다 (생길 때 내 발과 겹쳤으면 빠져나갈 때까지 false) */
type Wall = { zone: Phaser.GameObjects.Zone; rect: Rect; solid: boolean };
/** oh = 11/18 눈뭉치에 맞아 놀란 얼굴이 끝나는 시각 (0 = 원래 얼굴) */
type ManView = { s: SnowmanInfo; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.BitmapText; stage: number; puddleUntil: number; wall: Wall | null; oh: number };
/**
 * 내려놓은 덩이 (내 것·다른 사람 것). id = null이면 내가 막 내려놓아 서버 확인을 기다린다.
 * wait = 확인을 기다리는 내 동작 수 (0이 되면 서버 모양으로 맞춘다), sentAt = 마지막으로 보낸 시각
 */
type StackView = { id: string | null; sid: Sid; x: number; y: number; sizes: BallSize[]; at: number; wait: number; sentAt: number; img: Phaser.GameObjects.Image; wall: Wall | null };
/** 다른 사람이 들고 있는 눈덩이 (roll·walked = 굴린·걸은 거리 — 굴러가는 그림·들썩임) */
type PeerBall = { h: SnowHold; img: Phaser.GameObjects.Sprite; roll: number; walked: number; lastX: number; lastY: number; trackAt: number };

export type CampSnowmenDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  player: () => Player;
  net: () => RealtimeClient;
  /** 같은 캠핑장 사람 (들고 있는 눈덩이를 그 사람 품·발 앞에 그린다) */
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  /** 내 이름 (내가 세운 눈사람인지 — 내 것 곁에는 붙여 놓아도 된다) */
  myName: () => string;
  toast: (m: string) => void;
  concept: MapConcept;
};

/** 11/18 한 사람 몫(SNOWMAN_PER_PERSON)이 다 찼을 때 */
const MANY_TOAST = `눈사람은 한 사람이 ${SNOWMAN_PER_PERSON}개까지 만들 수 있어요. 하나가 녹으면 다시 만들어요.`;
const holdKey = (h: SnowHold | null): string => (h ? `${h.s}${h.r ? "r" : ""}` : "");
const dirName = (d: number): "down" | "left" | "right" | "up" => (d === DIR.left ? "left" : d === DIR.right ? "right" : d === DIR.up ? "up" : "down");

export class CampSnowmen {
  private concept: MapConcept;
  private readonly piles: { x: number; y: number; img: Phaser.GameObjects.Image }[] = [];
  private held: Held | null = null;
  private readonly stacks: StackView[] = [];
  private readonly men = new Map<string, ManView>();
  private readonly peerBalls = new Map<Sid, PeerBall>();
  private readonly tracks: Phaser.GameObjects.Image[] = [];
  private readonly walls = new Map<Phaser.GameObjects.GameObject, Wall>();
  private readonly wallGroup: Phaser.Physics.Arcade.StaticGroup;
  private readonly footRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private meltAt = 0;
  private blockToastAt = -Infinity;
  /** 서버가 아는 내 손 (holdKey). undefined = 모른다 → 다음 프레임에 지금 상태를 보낸다 */
  private sentHold: string | undefined = "";
  private holdSentAt = -Infinity;

  constructor(private readonly d: CampSnowmenDeps) {
    this.concept = d.concept;
    const scene = d.scene;
    campSnowPiles().forEach((p, i) => {
      const v = i % Art.SNOW_PILE_VARIANTS;
      addCanvasTexture(scene, TEX.pile(v), { canvas: Art.snowPileArt(v).toCanvas() });
      this.piles.push({ ...p, img: scene.add.image(p.x, p.y + FOOT + 1, TEX.pile(v)).setOrigin(0.5, 1).setDepth(p.y) });
    });
    // 11/18 눈사람·덩이 밑동 (캠핑장 나무·바위와 같은 정적 몸 — 판이 겨울이 아니거나 비켜 주는 중이면 통과)
    this.wallGroup = scene.physics.add.staticGroup();
    scene.physics.add.collider(d.player().sprite, this.wallGroup, undefined, (_a, b) => this.on && this.walls.get(b as Phaser.GameObjects.GameObject)?.solid === true);
    this.applyVisible();
  }

  get on(): boolean {
    return isSnowy(this.concept);
  }

  get holding(): boolean {
    return this.held !== null;
  }

  private get mySid(): Sid | null {
    return this.d.net().mySid;
  }

  private mine(st: { sid: Sid }): boolean {
    return st.sid === this.mySid;
  }

  /** 11/18 서 있는 내 눈사람 수 (다 녹아 웅덩이가 된 것은 빼요). 서버 목록엔 방문자 id가 없어 이름으로 본다 (닉네임은 겹치지 않는다) */
  private myMenCount(): number {
    const me = this.d.myName();
    let n = 0;
    for (const v of this.men.values()) if (v.puddleUntil === 0 && v.s.by === me) n++;
    return n;
  }

  /** 11/18 서 있는 내 눈사람 + 쌓는 중인 내 덩이 (SNOWMAN_PER_PERSON까지 — 서버와 같은 규칙) */
  private myProjects(): number {
    return this.myMenCount() + this.stacks.filter((v) => this.mine(v)).length;
  }

  setConcept(c: MapConcept): void {
    this.concept = c;
    if (!this.on) this.dropHeld();
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
    for (const st of this.stacks) st.img.setVisible(on);
    for (const t of this.tracks) t.setVisible(on);
    for (const b of this.peerBalls.values()) b.img.setVisible(false);
  }

  // ── 밑동 충돌 상자 ──

  /** 지금 내 발 상자 (arcade 몸) */
  private foot(): Rect {
    const b = this.d.player().body;
    const r = this.footRect;
    r.x = b.x;
    r.y = b.y;
    r.w = b.width;
    r.h = b.height;
    return r;
  }

  private addWall(rect: Rect): Wall {
    const zone = this.d.scene.add.zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h);
    zone.removeFromDisplayList();
    this.wallGroup.add(zone);
    // 생기는 자리에 서 있으면 끼이지 않게 빠져나갈 때까지 비켜 준다 (update가 다시 본다)
    const w: Wall = { zone, rect, solid: !rectsOverlap(this.foot(), rect) };
    this.walls.set(zone, w);
    return w;
  }

  private removeWall(w: Wall | null): void {
    if (!w) return;
    this.walls.delete(w.zone);
    this.wallGroup.remove(w.zone, true, true);
  }

  // ── 실시간 ──

  /** 캠핑장에 들어왔다·다시 붙었다: 서버는 내 손을 빈손으로 안다 → 들고 있으면 다시 알린다 */
  onWelcome(): void {
    this.sentHold = "";
    this.holdSentAt = -Infinity;
  }

  onSnowmen(list: SnowmanInfo[], stacks: SnowStackInfo[]): void {
    const keep = new Set(list.map((s) => s.id));
    for (const [id, v] of this.men) if (!keep.has(id) && v.puddleUntil === 0) this.removeMan(id);
    for (const s of list) if (!this.men.has(s.id)) this.addMan(s, false);
    // 덩이는 서버 목록으로 다시 맞춘다. 확인을 기다리던 내 내려놓기가 목록에 없으면 덩이를 다시 든다
    const me = this.mySid;
    for (const v of [...this.stacks]) {
      if (v.id === null && !this.held && !stacks.some((s) => s.sid === me && s.x === v.x && s.y === v.y)) this.pickUp(v.sizes[0], 0, true);
      this.removeStack(v);
    }
    for (const s of stacks) this.upsertStack(s);
  }

  onSnowman(s: SnowmanInfo, sid: Sid, stId?: string): void {
    const mine = sid === this.mySid;
    // 눈사람으로 바뀐 덩이를 지운다 (세운 사람은 빈손)
    const st = stId ? this.stacks.find((v) => v.id === stId) : undefined;
    if (st) this.removeStack(st);
    if (!mine) this.setPeerHold(sid, null);
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

  /** 내 내려놓기·올리기·다시 들기를 서버가 받지 않았다: 화면을 되돌린다 (덩이 모양은 뒤따라 오는 snowStack이 맞춘다) */
  onDenied(why: SnowmanDenyWhy, a?: SnowAct, id?: string): void {
    this.sentHold = undefined;
    if (a === "put") {
      const st = this.stacks.find((v) => v.id === null);
      if (st) this.undoPut(st);
    } else if (a === "add") {
      const st = id ? this.stacks.find((v) => v.id === id) : undefined;
      const top = st && st.sizes.length > 1 ? st.sizes.pop() : undefined;
      if (st) this.redrawStack(st);
      if (top !== undefined && !this.held) this.pickUp(top, 0, true);
    } else if (a === "take") {
      this.dropHeld();
    }
    if (!this.on) return;
    if (why === "wait") this.d.toast(a === "add" ? "조금 있다가 다시 올려 주세요." : "조금 있다가 다시 해 주세요.");
    else if (why === "near") this.d.toast(NEAR_TOAST);
    else if (why === "full") this.d.toast("캠핑장에 덩이가 너무 많아요. 조금 있다가 해 주세요.");
    else if (why === "lost") this.d.toast("덩이가 녹아 없어졌어요.");
    else if (why === "many") this.d.toast(MANY_TOAST);
    else this.d.toast(a === "add" ? "여기에는 눈사람을 세울 수 없어요. 다른 눈밭에서 쌓아요." : "여기에는 내려놓을 수 없어요.");
  }

  /** 덩이가 놓였다·바뀌었다 (내 것이면 확인). h = 주인이 이제 든 크기 */
  onStack(s: SnowStackInfo, h?: SnowBall): void {
    if (!this.mine(s)) this.setPeerHold(s.sid, h === undefined ? null : { s: h });
    this.upsertStack(s);
  }

  /** 덩이가 사라졌다. took = 주인이 마지막 덩이를 다시 들었다 */
  onStackGone(id: string, sid: Sid, took?: SnowBall): void {
    const st = this.stacks.find((v) => v.id === id);
    if (st) this.removeStack(st);
    if (took !== undefined && sid !== this.mySid) this.setPeerHold(sid, { s: took });
  }

  /** 다른 사람이 들고 있는 눈덩이 (null = 빈손) */
  setPeerHold(sid: Sid, h: SnowHold | null): void {
    if (sid === this.mySid) return;
    const cur = this.peerBalls.get(sid);
    if (!h) {
      cur?.img.destroy();
      this.peerBalls.delete(sid);
      return;
    }
    if (cur && holdKey(cur.h) === holdKey(h)) return;
    const s = h.s as BallSize;
    if (h.r) this.ensureRoll(s);
    else this.ensureCarry(s);
    const tex = h.r ? TEX.roll(s) : TEX.carry(s);
    const r = this.d.remotes().get(sid);
    if (cur) {
      cur.img.setTexture(tex, 0).setOrigin(0.5, h.r ? 1 : 0.5);
      cur.h = h;
      return;
    }
    const img = this.d.scene.add.sprite(r?.x ?? 0, r?.y ?? 0, tex, 0).setOrigin(0.5, h.r ? 1 : 0.5).setVisible(false);
    this.peerBalls.set(sid, { h, img, roll: 0, walked: 0, lastX: r?.x ?? 0, lastY: r?.y ?? 0, trackAt: 0 });
  }

  /** PeerInfo.snow (입장·접속자 다시 맞추기) */
  applyPeer(p: { sid: Sid; snow?: unknown }): void {
    this.setPeerHold(p.sid, parseSnowHold(p.snow));
  }

  /** 그 사람이 캠핑장을 떠났다 */
  onPeerLeave(sid: Sid): void {
    this.setPeerHold(sid, null);
    for (const st of this.stacks.filter((v) => v.sid === sid && v.id !== null)) this.removeStack(st);
  }

  /** 같은 캠핑장 사람을 다시 받는다 (다시 붙음·맵 옮김) */
  clearPeers(): void {
    for (const b of this.peerBalls.values()) b.img.destroy();
    this.peerBalls.clear();
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
      if (!this.d.net().snowTake(st.id!)) {
        this.d.toast("연결된 뒤에 다시 들 수 있어요.");
        return true;
      }
      const top = st.sizes.pop()!;
      this.sent(st);
      if (st.sizes.length) this.redrawStack(st);
      else this.removeStack(st);
      this.pickUp(top, top === 0 ? 0 : SNOWBALL_GROW_AT[top - 1]);
      this.sentHold = holdKey({ s: top });
      pl.faceTo(st.x, st.y, this.d.scene.time.now);
      return true;
    }
    if (pile) {
      // 11/18 내 눈사람 2개가 서 있으면 녹을 때까지 새로 못 만든다 (쌓는 중인 내 덩이가 있으면 거기 올릴 덩이는 집을 수 있어요)
      if (this.myMenCount() >= SNOWMAN_PER_PERSON) {
        this.d.toast(MANY_TOAST);
        return true;
      }
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
      if (this.gapWhy(Math.round(at.x), Math.round(at.y)) === "near") return { x: at.x, y: at.y + 4, text: "다른 사람이 만들고 있어요" };
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
    if (pile) return { x: pile.x, y: pile.y + 4, text: this.myMenCount() >= SNOWMAN_PER_PERSON ? "내 눈사람이 녹으면 다시 만들어요" : `${prefix}눈 뭉치기` };
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

  /** 다시 들 수 있는 내 덩이 (서버 확인을 받은 것) */
  private nearStack(x: number, y: number): StackView | null {
    let best: StackView | null = null;
    let bd = SNOW_REACH;
    for (const st of this.stacks) {
      if (st.id === null || !this.mine(st) || stackDone(st)) continue;
      const d = Math.hypot(st.x - x, st.y - y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** 굴리는 눈덩이 자리(발 앞)에 있는 내 덩이 (서버 확인을 받은 것) */
  private stackAt(x: number, y: number): StackView | null {
    let best: StackView | null = null;
    let bd = 13;
    for (const st of this.stacks) {
      if (st.id === null || !this.mine(st)) continue;
      const d = Math.hypot(st.x - x, (st.y - y) * 1.3);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** (x,y)에 새 덩이를 놓을 때 간격 (서버와 같은 snowGapWhy — 내 덩이·내 눈사람 / 다른 사람 것) */
  private gapWhy(x: number, y: number): "near" | "spot" | null {
    const me = this.d.myName();
    const mine: { x: number; y: number }[] = [];
    const theirs: { x: number; y: number }[] = [];
    for (const v of this.men.values()) if (v.puddleUntil === 0) (v.s.by === me ? mine : theirs).push(v.s);
    for (const st of this.stacks) (this.mine(st) ? mine : theirs).push(st);
    return snowGapWhy(x, y, mine, theirs);
  }

  /** 덩이를 품에 안는다 (굴리기는 update가 누르고 있는지 보고 바꾼다). quiet = 되돌리기 (소리 없이) */
  private pickUp(size: BallSize, dist: number, quiet = false): void {
    const scene = this.d.scene;
    const pl = this.d.player();
    this.ensureCarry(size);
    const img = scene.add.sprite(pl.x, pl.y, TEX.carry(size), 0);
    this.held = { size, dist, roll: 0, lastX: pl.x, lastY: pl.y, trackAt: 0, rolling: false, walked: 0, img };
    if (!quiet) this.d.sfx.play("thud", 0.25, 1.4);
    bridge.emit("camp:snowball", { held: true });
    this.syncHeld(false);
  }

  /** 내 덩이에 동작을 하나 보냈다 (확인을 기다린다) */
  private sent(st: StackView): void {
    st.wait++;
    st.sentAt = this.d.scene.time.now;
  }

  /** 들고 있는 덩이를 발 앞에 내려놓거나 그 자리 내 덩이 위에 올린다 */
  private place(): void {
    const h = this.held!;
    const pl = this.d.player();
    const net = this.d.net();
    const at = ballFront(pl.x, pl.y, pl.dir, Art.BALL_R[h.size]);
    const st = this.stackAt(at.x, at.y);
    if (st) {
      const c = stackCheck(st, h.size);
      if (c !== "ok") {
        this.d.toast(c === "full" ? "이미 세 단을 다 쌓았어요." : "위에는 더 작은 덩이만 올릴 수 있어요. 몸통 → 배 → 머리 순서예요.");
        return;
      }
      if (!net.snowAdd(st.id!, h.size)) {
        this.d.toast("연결된 뒤에 올릴 수 있어요.");
        return;
      }
      st.sizes.push(h.size);
      this.sent(st);
      this.sentHold = "";
      this.dropHeld();
      this.redrawStack(st);
      this.d.sfx.play("thud", 0.35, 1.1);
      return;
    }
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    const nearPile = this.piles.some((p) => Math.abs(p.x - x) < 24 && Math.abs(p.y - y) < 14);
    const gap = this.gapWhy(x, y);
    if (gap === "near") {
      this.d.toast(NEAR_TOAST);
      return;
    }
    if (nearPile || gap || !snowPlaceOk(x, y)) {
      this.d.toast(`여기에는 내려놓을 수 없어요. 눈밭 빈자리에서 ${keyJosa("E", "를")} 눌러요.`);
      return;
    }
    // 11/18 서 있는 내 눈사람 + 쌓는 중인 내 덩이가 이미 2개면 새로 못 놓는다 (서버도 many로 막는다)
    if (this.myProjects() >= SNOWMAN_PER_PERSON || this.stacks.filter((v) => this.mine(v)).length >= SNOW_STACKS_PER_PERSON) {
      this.d.toast(MANY_TOAST);
      return;
    }
    const me = this.mySid;
    if (me === null || !net.snowPut(x, y, h.size as SnowBall)) {
      this.d.toast("연결된 뒤에 내려놓을 수 있어요.");
      return;
    }
    const ns: StackView = { id: null, sid: me, x, y, sizes: [h.size], at: net.serverNow(), wait: 0, sentAt: 0, img: this.d.scene.add.image(0, 0, "__DEFAULT"), wall: null };
    this.sent(ns);
    this.stacks.push(ns);
    this.sentHold = "";
    this.dropHeld();
    this.redrawStack(ns);
    this.d.sfx.play("thud", 0.3, 1.2);
    if (h.size !== 2 && !this.stacks.some((s) => s !== ns && this.mine(s) && s.sizes.length > 0)) this.d.toast("몸통이 될 큰 덩이부터 내려놓고, 그 위에 배·머리를 올려요.");
  }

  /** 내려놓기가 거절됐다·답이 없다: 덩이를 지우고 다시 든다 */
  private undoPut(st: StackView): void {
    this.removeStack(st);
    if (!this.held) this.pickUp(st.sizes[0], st.sizes[0] === 0 ? 0 : SNOWBALL_GROW_AT[st.sizes[0] - 1], true);
    this.sentHold = undefined;
  }

  /** 서버가 알려 준 덩이를 그리거나 맞춘다 (내 덩이는 기다리던 동작이 다 확인됐을 때만 모양을 맞춘다) */
  private upsertStack(s: SnowStackInfo): void {
    let v = this.stacks.find((o) => o.id === s.id);
    if (!v && this.mine(s)) {
      v = this.stacks.find((o) => o.id === null && o.x === s.x && o.y === s.y);
      if (v) v.id = s.id;
    }
    if (!v) {
      v = { id: s.id, sid: s.sid, x: s.x, y: s.y, sizes: [...s.sizes], at: s.at, wait: 0, sentAt: 0, img: this.d.scene.add.image(0, 0, "__DEFAULT"), wall: null };
      this.stacks.push(v);
      this.redrawStack(v);
      return;
    }
    v.at = s.at;
    if (this.mine(s)) {
      v.wait = Math.max(0, v.wait - 1);
      if (v.wait > 0) return;
    }
    v.sizes = [...s.sizes];
    this.redrawStack(v);
  }

  private redrawStack(st: StackView): void {
    if (!st.sizes.length) return this.removeStack(st);
    const key = TEX.stack(st.sizes);
    addCanvasTexture(this.d.scene, key, { canvas: Art.stackArt(st.sizes).toCanvas() });
    st.img.setTexture(key).setOrigin(0.5, 1).setPosition(st.x, st.y + FOOT).setDepth(st.y).setVisible(this.on);
    st.wall ??= this.addWall(stackBlockRect(st.x, st.y));
  }

  private removeStack(st: StackView): void {
    const i = this.stacks.indexOf(st);
    if (i >= 0) this.stacks.splice(i, 1);
    st.img.destroy();
    this.removeWall(st.wall);
    st.wall = null;
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
    const v: ManView = { s, img, label, stage: -1, puddleUntil: 0, wall: null, oh: 0 };
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
    this.removeWall(v.wall);
    this.men.delete(id);
  }

  // ── 11/18 눈싸움: 눈뭉치에 맞은 눈사람 (모두의 화면이 같은 길로 각자 본다) ──

  /** 바닥 길 (ax,ay)→(bx,by)가 서 있는 눈사람 밑동에 닿았나 (다 녹아 내려앉은 단계·웅덩이는 빼고) */
  snowballHit(ax: number, ay: number, bx: number, by: number): { id: string; x: number; y: number } | null {
    if (!this.on) return null;
    for (const v of this.men.values()) {
      if (v.puddleUntil || v.stage >= MELT_PASS_STAGE) continue;
      if (snowSegDist(v.s.x, v.s.y, ax, ay, bx, by, 1.6) < HIT_R) return { id: v.s.id, x: v.s.x, y: v.s.y };
    }
    return null;
  }

  /** 잠깐 놀란 얼굴로 바꾸고 몸을 움찔 (OH_MS 뒤 원래 얼굴) */
  surprise(id: string): void {
    const v = this.men.get(id);
    if (!v || v.puddleUntil || !this.on) return;
    const scene = this.d.scene;
    v.oh = scene.time.now + OH_MS;
    v.stage = -1;
    this.restage(v, this.d.net().serverNow());
    if (this.d.reduced) return;
    scene.tweens.killTweensOf(v.img);
    v.img.setScale(1.08, 0.9);
    scene.tweens.add({ targets: v.img, scaleX: 1, scaleY: 1, duration: 260, ease: "Back.easeOut" });
  }

  /** 녹는 단계를 맞춘다 (다 녹았으면 물웅덩이로). 마지막 단계부터는 지나갈 수 있다 */
  private restage(v: ManView, now: number): void {
    if (v.puddleUntil) return;
    if (!snowmanAlive(v.s.at, now)) return this.toPuddle(v);
    const m = meltStage(snowmanMelt(v.s.at, now));
    if (m === v.stage) return;
    v.stage = m;
    const xm = this.concept === "christmas";
    // 11/18 눈뭉치에 맞은 동안은 놀란 얼굴 (많이 녹아 졸린 얼굴이 된 뒤에는 그대로)
    const oh = v.oh > 0 && m < 2;
    const key = TEX.man(v.s.seed, xm, m, oh);
    const look = Art.snowmanLook(v.s.seed, xm);
    addCanvasTexture(this.d.scene, key, { canvas: Art.snowmanArt(oh ? { ...look, face: "surprise" } : look, m).toCanvas() });
    v.img.setTexture(key);
    if (m < MELT_PASS_STAGE) v.wall ??= this.addWall(snowmanBlockRect(v.s.x, v.s.y));
    else {
      this.removeWall(v.wall);
      v.wall = null;
    }
  }

  private toPuddle(v: ManView): void {
    const xm = this.concept === "christmas";
    const key = TEX.puddle(v.s.seed, xm);
    addCanvasTexture(this.d.scene, key, { canvas: Art.puddleArt(Art.snowmanLook(v.s.seed, xm)).toCanvas() });
    v.img.setTexture(key).setDepth(DEPTH.decal + v.s.y);
    v.label.setVisible(false);
    v.puddleUntil = this.d.scene.time.now + PUDDLE_MS;
    this.removeWall(v.wall);
    v.wall = null;
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
      for (const st of [...this.stacks]) {
        // 답이 없는 내 동작: 내려놓기는 되돌리고, 나머지는 기다림만 푼다
        if (st.wait > 0 && now - st.sentAt > PENDING_MS) {
          if (st.id === null) {
            this.undoPut(st);
            continue;
          }
          st.wait = 0;
        }
        // 오래 손대지 않은 덩이는 서버에서도 사라진다
        if (st.id !== null && st.wait === 0 && !snowStackAlive(st.at, sn)) this.removeStack(st);
      }
    }
    // 생길 때 겹쳐 서 있던 충돌 상자: 빠져나가면 막기 시작한다
    let foot: Rect | null = null;
    for (const w of this.walls.values()) if (!w.solid && !rectsOverlap((foot ??= this.foot()), w.rect)) w.solid = true;
    for (const v of this.men.values()) {
      if (v.oh && now >= v.oh) {
        v.oh = 0;
        v.stage = -1;
        this.restage(v, this.d.net().serverNow());
      }
      if (v.puddleUntil || !this.on) continue;
      // 11/18 사용자 「이름이 작아서 안 보여요」: 0.84배 → 사람 이름표보다 조금 크게(1.25배), 흐리게 하지 않고 밝게
      if (v.label.scaleX !== labelScale * 1.25) v.label.setScale(labelScale * 1.25);
      v.label.setPosition(Math.round(v.s.x), Math.round(v.s.y - Art.snowmanTop(v.stage) - 1));
    }
    if (this.held) this.syncHeld(rolling && this.on);
    this.syncPeerBalls();
    this.syncHoldNet(now);
  }

  /** 내 손이 서버가 아는 것과 다르면 알린다 (바뀔 때만, SNOW_HOLD_SEND_MS 넘게 띄워 — 마지막 상태는 꼭) */
  private syncHoldNet(now: number): void {
    const h = this.held;
    const cur: SnowHold | null = h && this.on ? (h.rolling ? { s: h.size as SnowBall, r: true } : { s: h.size as SnowBall }) : null;
    const key = holdKey(cur);
    if (key === this.sentHold || now - this.holdSentAt < SNOW_HOLD_SEND_MS) return;
    if (!this.d.net().snowHold(cur)) return;
    this.sentHold = key;
    this.holdSentAt = now;
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
      this.placeCarry(h.img, pl.x, pl.y, pl.dir, h.size, pl.view.bodyId, pl.view.scaleNow, h.walked);
      h.img.setVisible(this.on);
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
    this.placeRoll(h.img, at.x, at.y, pl.dir, h.roll);
    h.img.setVisible(this.on);
  }

  /** 굴러가는 덩이 그림 (발 앞 at, 굴린 거리 roll로 구르는 칸) */
  private placeRoll(img: Phaser.GameObjects.Sprite, x: number, y: number, dir: DirId, roll: number): void {
    const horiz = dir === DIR.left || dir === DIR.right;
    const f0 = Math.floor(roll / 3) % Art.BALL_ROLL_FRAMES;
    const f = horiz ? f0 : dir === DIR.up ? (Art.BALL_ROLL_FRAMES - f0) % Art.BALL_ROLL_FRAMES : f0;
    img
      .setFrame(horiz ? f : Art.BALL_ROLL_FRAMES + f)
      .setFlipX(dir === DIR.left)
      .setPosition(Math.round(x), Math.round(y) + FOOT)
      .setDepth(y);
  }

  /** 품에 안은 덩이: 몸 앞(아래를 보면 배꼽 앞, 옆이면 몸 앞쪽, 위를 보면 몸 뒤에 가려 가장자리만). 걸으면 한 걸음마다 1px 들썩인다 */
  private placeCarry(img: Phaser.GameObjects.Sprite, x: number, y: number, dir: DirId, size: BallSize, bodyId: string, scale: number, walked: number): void {
    const r = Art.BALL_R[size];
    const hand = handAnchor(bodyId, dirName(dir));
    const fr = Art.carryFrameSize(size);
    const c = carryAt(x, y, dir, r, r * 0.9, hand.up, scale);
    const bob = Math.floor(walked / 6) % 2;
    img
      .setFrame(dir === DIR.left || dir === DIR.right ? 1 : dir === DIR.up ? 2 : 0)
      .setFlipX(dir === DIR.left)
      .setOrigin(0.5, fr.cy / fr.h)
      .setPosition(Math.round(c.x), Math.round(c.y) - bob)
      .setDepth(c.depth);
  }

  /** 다른 사람이 들고 있는 눈덩이를 그 사람 품·발 앞에 (보이는 사람만) */
  private syncPeerBalls(): void {
    if (!this.peerBalls.size) return;
    const remotes = this.d.remotes();
    for (const [sid, b] of this.peerBalls) {
      const r = remotes.get(sid);
      if (!r || !r.visible || !this.on || r.stateId === STATE.sitChair) {
        b.img.setVisible(false);
        continue;
      }
      const moved = Math.hypot(r.x - b.lastX, r.y - b.lastY);
      b.lastX = r.x;
      b.lastY = r.y;
      const step = moved > 0 && moved < 24 ? moved : 0;
      const s = b.h.s as BallSize;
      if (b.h.r) {
        const at = ballFront(r.x, r.y, r.netDir, Art.BALL_R[s]);
        b.roll += step;
        if (step > 0 && snowRollGrows(at.x, at.y)) {
          b.trackAt += step;
          if (b.trackAt >= TRACK_EVERY) {
            b.trackAt = 0;
            this.addTrack(s, at.x, at.y);
          }
        }
        this.placeRoll(b.img, at.x, at.y, r.netDir, b.roll);
      } else {
        b.walked += step;
        this.placeCarry(b.img, r.x, r.y, r.netDir, s, r.view.bodyId, r.view.scaleNow, b.walked);
      }
      b.img.setVisible(true);
    }
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
    for (const st of [...this.stacks]) this.removeStack(st);
    for (const id of [...this.men.keys()]) this.removeMan(id);
    for (const t of this.tracks.splice(0)) t.destroy();
    this.clearPeers();
    this.wallGroup.destroy(true);
  }
}

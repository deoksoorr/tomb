import type * as Phaser from "phaser";
import {
  DIR,
  SNOWBALL_GATHER_MS,
  SNOWBALL_INTERVAL_MS,
  SNOWBALL_RANGE,
  SNOWBALL_RANGE_MAX,
  STATE,
  snowballAt,
  snowFightState,
  type DirId,
  type Sid,
  type SnowballPos,
} from "@tomb/protocol";
import { addSnowFight, type SnowFightTally } from "@/lib/snowFight";
import { bridge } from "../bridge";
import { DEPTH } from "../config";
import type { Player } from "../entities/Player";
import { SpeechBubble } from "../entities/SpeechBubble";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { faceToward } from "../logic/movement";
import type { RealtimeClient } from "../net/RealtimeClient";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";
import { markCharTint } from "./charTint";
import type { Sfx } from "./Sfx";
import { snowBodyHit, type SnowBody } from "./snowHit";
import { SNOW_NPC_LINES, type SnowNpc } from "./snowNpc";
import { BALL_FRAME, ensureSnowFightTextures, MARK_VARIANTS, PUFF_FRAMES, SNOWFIGHT_TEX } from "./snowFightArt";

// 11/18 마을·캠핑장 「눈싸움」 (겨울·크리스마스 판의 바깥에서만 — 장면이 live로 알려 준다).
//  - F(터치는 [눈 던지기])를 누르면 그 자리에서 잠깐 쪼그려 눈을 뭉쳐(SNOWBALL_GATHER_MS) 보는 쪽으로 포물선을 그리며 던진다
//    (11/18 사용자 「쿨타임을 잡아서 막 못 던지게」 — 3초에 한 번. 쿨타임 중 F는 남은 시간 안내, 터치 단추는 남은 시간을 시계처럼)
//    걷는 중이면 걷는 쪽으로, 그쪽 가까이 사람이 있으면 그 사람 쪽으로 살짝 맞춰 준다
//  - 던질 때 서버에 한 번(snowball). 날아가는 건 모두의 화면이 같은 식(snowballAt)으로 그린다
//  - 맞았는지는 맞은 사람 화면이 판정한다: 화면에 보이는 공이 내 머리·몸 그림에 닿으면(game/world/snowHit — 이름표 높이는 아니다)
//    바로 그 자리에 퍽·눈을 그리고 서버에 한 번(snowHit, 맞은 높이 h) → 서버가 같은 맵 모두에게 알려 다른 화면에도 같은 높이에 퍽
//    (던진 사람 화면엔 「명중!」)
//  - 사용자 「모든 사람이 다 맞아야 함, NPC도」: 앉은 사람·탄 사람·놀이기구·해먹·그네도 맞는다 (보이는 그림 자리로 — 의자 높이·관람차 띄운 높이를 따른다).
//    안 맞는 건 화면에 안 보이는 사람뿐 (잠수, 실내 — 장면이 live를 끈다). 앉거나 탄 사람은 휘청 없이 퍽·눈만 (자리에서 떨어뜨리지 않는다)
//  - NPC(주민·강아지·고양이·사육사·관리소 사람)도 맞는다: 퍽 + 얼굴(머리)에 눈 + 놀람(「!」·가끔 한마디) + 걷던 NPC는 잠깐 멈칫.
//    NPC 위치는 각 화면이 계산하니 맞음도 각 화면이 판정한다 (서버에 보내지 않는다)
//  - 사용자 「건물에도 박게」: 길을 막는 것(맵 충돌 — solid)에 닿으면 거기서 멈춰 퍽 + 벽면에 납작한 눈 자국 WALL_MS.
//    높이(포물선)는 따지지 않고 평면 길만 본다. 던지기 신호 하나로 모두의 화면이 같은 길을 계산하니 결과도 같다
//  - 바닥에 떨어지면 작은 눈 자국이 남았다 사라진다 (물이면 물방울만). 캠핑장 눈사람에 맞으면 퍽 + 잠깐 놀란 얼굴 (targets)
//  - 동시에 나는 공(MAX_BALLS)·자국(MARK_MAX)·조각(MAX_BITS)은 상한 — 넘으면 오래된 것부터 지운다
//  - 오늘 맞힌 수·맞은 수는 이 기기에만 세고, 맞힐 때·맞을 때 내 이름 옆에 잠깐 보여 준다

/** 공이 지나가는 곳에 맞을 수 있는 것 (캠핑장 눈사람). hit = 바닥 길 (ax,ay)→(bx,by)가 닿은 것, surprise = 놀란 얼굴 */
export type SnowTargets = {
  hit(ax: number, ay: number, bx: number, by: number): { id: string; x: number; y: number } | null;
  surprise(id: string): void;
};

export type SnowFightDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  player: () => Player;
  net: () => RealtimeClient;
  remotes: () => ReadonlyMap<Sid, RemoteAvatar>;
  /** 지금 이 장면에서 눈싸움을 하는지 (겨울판이고 장면이 바깥에 떠 있다 — 실내·버스·바라보는 장면이면 false) */
  live: () => boolean;
  /** 이번 프레임 이동 입력 (걷는 쪽으로 던진다) */
  move: () => { ax: number; ay: number };
  /** 장면 사정으로 못 던질 때 그 안내 (예: 눈덩이를 안고 있음). 던질 수 있으면 null */
  blocked?: () => string | null;
  /** 떨어진 자리가 물인지 (물이면 눈 자국 대신 물방울) */
  water?: (x: number, y: number) => boolean;
  targets?: SnowTargets;
  /** 길을 막는 자리인지 (맵 충돌 칸 — snowNpc SnowGrid). 없으면 아무것도 안 막는다 */
  solid?: (x: number, y: number) => boolean;
  /** 맞을 수 있는 NPC (각 무리가 들고 있는 목록 — 매 프레임 새로 만들지 않는다) */
  npcs?: () => Iterable<SnowNpc>;
  toast: (m: string) => void;
};

type Ball = {
  sid: Sid;
  /** 서버 번호 (내 공은 모른다 — 0) */
  n: number;
  mine: boolean;
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  /** 뭉치기 시작한 장면 시각 */
  at: number;
  img: Phaser.GameObjects.Sprite | null;
  shadow: Phaser.GameObjects.Image | null;
  /** 지난 프레임 바닥 자리 (눈사람은 지나간 길로 본다) */
  px: number;
  /** 지난 프레임까지 본 날기 시각 (사람은 그 사이를 잘게 나눠 본다 — 빠른 공이 몸을 건너뛰지 않게) */
  pt: number;
  py: number;
};
/** 그림 한 장 NPC에 얹힌 눈 (머리 위) + 움찔·멈칫 (freeze 동안 그 자리에 붙든다) */
type Stuck = { img: Phaser.GameObjects.Image; cap: Phaser.GameObjects.Image; at: number; until: number; fx: number; fy: number; sx: number; sy: number };
/** 스스로 말할 줄 모르는 NPC의 말풍선 */
type NpcBubble = { npc: SnowNpc; bubble: SpeechBubble; until: number };
/** 흩어지는 눈 조각 (z = 땅에서 높이) */
type Bit = { img: Phaser.GameObjects.Image; x: number; y: number; z: number; vx: number; vy: number; vz: number; until: number };

/** 퍽 그림 한 장 보이는 시간 */
const PUFF_STEP_MS = 75;
/** 바닥 눈 자국이 남는 시간 (마지막 MARK_FADE_MS는 흐려진다) · 벽에 박힌 자국 · 한꺼번에 남는 수 (바닥·벽 합쳐서) */
const MARK_MS = 6_000;
const WALL_MS = 8_000;
const MARK_FADE_MS = 1_500;
const MARK_MAX = 24;
/** 한꺼번에 나는 공 · 흩어지는 조각 상한 (넘으면 오래된 것부터) */
const MAX_BALLS = 16;
const MAX_BITS = 60;
/** NPC 반응: 멈칫하는 시간 · 한마디 간격(NPC마다) · 한마디 할 확률 · 머리에 얹힌 눈이 남는 시간 */
const NPC_HOLD_MS = 700;
const NPC_SAY_GAP_MS = 8_000;
const NPC_SAY_CHANCE = 0.6;
const NPC_SNOW_MS = 3_000;
/** NPC 말풍선(스스로 말할 줄 모르는 NPC) 보이는 시간 */
const NPC_BUBBLE_MS = 1_600;
/** 내 이름 옆 오늘 기록이 떠 있는 시간 */
const TALLY_MS = 2_600;
/** 막힌 안내 간격 */
const TIP_MS = 2_500;
/** 맞힌 사람 쪽으로 맞춰 주는 각도 (보는 쪽에서 양옆으로) */
const AIM_COS = Math.cos((35 * Math.PI) / 180);
const HIT_TINT = 0xffe27a;
const TALLY_TINT = 0xe6f0ff;
/** 맞음을 볼 때 날아간 길을 나누는 간격 (ms — 공이 한 번에 2px 남짓) */
const SUB_MS = 8;
/** 공 조각 중력 (px/s²) */
const GRAVITY = 260;

const DIR_VEC: Readonly<Record<number, readonly [number, number]>> = {
  [DIR.down]: [0, 1],
  [DIR.up]: [0, -1],
  [DIR.left]: [-1, 0],
  [DIR.right]: [1, 0],
};

export class SnowFight {
  private readonly balls: Ball[] = [];
  private readonly bits: Bit[] = [];
  private readonly marks: { img: Phaser.GameObjects.Image; until: number }[] = [];
  private readonly pos: SnowballPos = { x: 0, y: 0, z: 0, done: false };
  private readonly pt = { x: 0, y: 0 };
  private readonly sub: SnowballPos = { x: 0, y: 0, z: 0, done: false };
  private readonly body2: SnowBody = { x: 0, y: 0, lift: 0, top: 0, half: 0 };
  private readonly body: SnowBody = { x: 0, y: 0, lift: 0, top: 0, half: 0 };
  /** 이번 프레임 화면 안 NPC와 그 몸 상자 (풀을 다시 쓴다 — 매 프레임 할당 없음) */
  private readonly npcList: SnowNpc[] = [];
  private readonly npcBoxes: SnowBody[] = [];
  private npcN = 0;
  private readonly stuck: Stuck[] = [];
  private readonly bubbles: NpcBubble[] = [];
  private readonly saidAt = new WeakMap<SnowNpc, number>();
  /** 내 화면에서 이미 맞은 눈 (던진 사람:번호 → 시각) — 서버 알림이 와도 두 번 그리지 않는다 */
  private readonly seen = new Map<string, number>();
  private lastThrowAt = -Infinity;
  private gatherUntil = -Infinity;
  private tipAt = -Infinity;
  private tally: { text: Phaser.GameObjects.BitmapText; icon: Phaser.GameObjects.Image; until: number } | null = null;

  constructor(private readonly d: SnowFightDeps) {
    ensureSnowFightTextures(d.scene);
  }

  /** 눈을 뭉치는 중 (장면이 이동 입력을 멈춘다) */
  get gathering(): boolean {
    return this.d.scene.time.now < this.gatherUntil;
  }

  private get mySid(): Sid | null {
    return this.d.net().mySid;
  }

  /** 던지고 맞을 수 있는 자세 (서기·걷기·뛰기·점프, 타는 펫·배·범퍼카·자리에 붙은 채는 아니다) */
  private poseOk(pl: Player): boolean {
    return snowFightState(STATE[pl.state]) && !pl.view.ridingOn && !pl.inBoat && !pl.inCar && !pl.anchored;
  }

  /** 내가 지금 맞을 수 있나: 화면에 보이면 다 (잠수만 아니다 — 앉음·탄 것·놀이기구·해먹·그네도) */
  private hittable(): boolean {
    const pl = this.d.player();
    return this.d.live() && pl.state !== "dive" && pl.view.visible;
  }

  private tip(m: string): void {
    const now = this.d.scene.time.now;
    if (now - this.tipAt < TIP_MS) return;
    this.tipAt = now;
    this.d.toast(m);
  }

  // ── 던지기 ──

  /** F·[눈 던지기] */
  throwSnow(): void {
    if (!this.d.live()) return;
    const pl = this.d.player();
    const why = this.d.blocked?.() ?? null;
    if (why) return this.tip(why);
    if (!this.poseOk(pl)) return this.tip(pl.inWater ? "물속에서는 던질 수 없어요." : "일어서서 던질 수 있어요.");
    const now = this.d.scene.time.now;
    if (now < this.gatherUntil) return;
    const left = SNOWBALL_INTERVAL_MS - (now - this.lastThrowAt);
    if (left > 0) return this.tip(`${Math.ceil(left / 1000)}초 뒤에 다시 던질 수 있어요.`);
    const aim = this.aim(pl);
    this.lastThrowAt = now;
    this.gatherUntil = now + SNOWBALL_GATHER_MS;
    bridge.emit("snow:cool", { until: Date.now() + SNOWBALL_INTERVAL_MS });
    // 접속 중이 아니면 내 화면에서만 던진다 (혼자 걷기)
    this.d.net().snowball(pl.x, pl.y, aim.x, aim.y);
    pl.dir = faceToward(pl.x, pl.y, aim.x, aim.y, pl.dir);
    pl.view.gesture(pl.dir, SNOWBALL_GATHER_MS, now);
    this.scoop(pl.x, pl.y, pl.dir);
    this.addBall(this.mySid ?? -1, 0, true, pl.x, pl.y, aim.x, aim.y, now);
  }

  /** 떨어질 곳: 걷는 쪽(아니면 보는 쪽)으로 SNOWBALL_RANGE. 그쪽 가까이 사람이 있으면(없으면 NPC) 그쪽을 지나가게 */
  private aim(pl: Player): { x: number; y: number } {
    const mv = this.d.move();
    let dx: number;
    let dy: number;
    if (Math.hypot(mv.ax, mv.ay) > 0.3) {
      const m = Math.hypot(mv.ax, mv.ay);
      dx = mv.ax / m;
      dy = mv.ay / m;
    } else [dx, dy] = DIR_VEC[pl.dir] ?? [0, 1];
    let bd = Infinity;
    let bx = 0;
    let by = 0;
    const consider = (x: number, y: number) => {
      const vx = x - pl.x;
      const vy = y - pl.y;
      const dist = Math.hypot(vx, vy);
      if (dist < 10 || dist > SNOWBALL_RANGE_MAX - 16) return;
      if ((vx * dx + vy * dy) / dist < AIM_COS || dist >= bd) return;
      bd = dist;
      bx = x;
      by = y;
    };
    for (const r of this.d.remotes().values()) if (r.visible && !r.away && r.stateId !== STATE.dive) consider(r.x, r.y);
    // 그쪽에 사람이 없으면 화면 안 NPC 쪽으로 (지난 프레임에 모아 둔 상자)
    if (bd === Infinity) for (let k = 0; k < this.npcN; k++) consider(this.npcBoxes[k].x, this.npcBoxes[k].y);
    let reach = SNOWBALL_RANGE;
    if (bd < Infinity) {
      dx = (bx - pl.x) / bd;
      dy = (by - pl.y) / bd;
      reach = Math.min(SNOWBALL_RANGE_MAX - 4, Math.max(SNOWBALL_RANGE, bd + 24));
    }
    return { x: Math.round(pl.x + dx * reach), y: Math.round(pl.y + dy * reach) };
  }

  /** 다른 사람이 던졌다 (서버 중계) */
  onThrow(sid: Sid, n: number, x: number, y: number, tx: number, ty: number): void {
    if (!this.d.live()) return;
    const r = this.d.remotes().get(sid);
    if (r?.visible) r.view.gesture(faceToward(x, y, tx, ty, r.netDir), SNOWBALL_GATHER_MS, performance.now());
    if (r?.visible) this.scoop(r.x, r.y, faceToward(x, y, tx, ty, r.netDir));
    this.addBall(sid, n, false, x, y, tx, ty, this.d.scene.time.now);
  }

  private addBall(sid: Sid, n: number, mine: boolean, x: number, y: number, tx: number, ty: number, at: number): void {
    if (this.balls.length >= MAX_BALLS) this.dropBall(0);
    this.balls.push({ sid, n, mine, x0: x, y0: y, tx, ty, at, img: null, shadow: null, px: x, py: y, pt: 0 });
  }

  private dropBall(i: number): void {
    const b = this.balls[i];
    b.img?.destroy();
    b.shadow?.destroy();
    this.balls.splice(i, 1);
  }

  // ── 맞음 ──

  /** 서버 알림: sid가 by의 n번 눈에 맞았다 (나 포함 같은 맵 모두). h = 맞은 높이 (없으면 얼굴) */
  onHit(sid: Sid, by: Sid, n: number, h?: number): void {
    if (!this.d.live()) return;
    const me = this.mySid;
    // 아직 날아가는 그 공을 지운다 (내 공은 번호를 몰라 가장 먼저 던진 것)
    const i = this.balls.findIndex((b) => b.sid === by && (b.n === n || (b.mine && by === me)));
    const ball = i >= 0 ? this.balls[i] : null;
    const side = ball ? (ball.tx >= ball.x0 ? 1 : -1) : 1;
    if (i >= 0) this.dropBall(i);
    if (sid === me) {
      if (!this.seen.has(`${by}:${n}`)) this.struckMe(side, h);
    } else {
      const r = this.d.remotes().get(sid);
      if (r) {
        r.view.snowHit(performance.now(), side, h);
        if (r.visible) this.puffOn(r.view, r.y, h);
      }
    }
    if (by !== me) return;
    // 내가 맞혔다: 맞은 사람 이름표 위에 「명중!」, 오늘 기록
    const r = this.d.remotes().get(sid);
    if (r?.visible) this.floatText(r.view.label.x, r.view.label.y - r.view.label.height - 1, "명중!");
    this.showTally(addSnowFight("hit"));
  }

  /** 내 화면에서 날아온 공이 내 머리·몸에 닿았다 (h = 맞은 높이) */
  private hitMe(b: Ball, i: number, h: number): void {
    const now = this.d.scene.time.now;
    this.seen.set(`${b.sid}:${b.n}`, now);
    this.dropBall(i);
    this.d.net().snowHit(b.sid, b.n, Math.round(h));
    this.struckMe(b.tx >= b.x0 ? 1 : -1, h);
    // 「맞으면 살짝 밀리는 것만」: 날아온 쪽으로 몇 px (서 있거나 걸을 때만 — Player.snowPush)
    this.d.player().snowPush(b.tx - b.x0, b.ty - b.y0, now);
  }

  private struckMe(side: number, h?: number): void {
    const pl = this.d.player();
    pl.view.snowHit(this.d.scene.time.now, side, h);
    this.puffOn(pl.view, pl.y, h);
    this.showTally(addSnowFight("got"));
  }

  /** 맞은 자리에 퍽: 몸 가운데 줄, 보이는 발에서 h 위 (없으면 얼굴) */
  private puffOn(v: Player["view"], footY: number, h?: number): void {
    if (h === undefined) {
      v.faceAt(this.pt);
      return this.puffAt(this.pt.x, this.pt.y, footY + 1, true);
    }
    const b = v.snowBody(this.body);
    this.puffAt(b.x, b.y - b.lift - Math.min(h, b.top), footY + 1, true);
  }

  // ── 매 프레임 ──

  update(labelScale: number): void {
    const now = this.d.scene.time.now;
    const live = this.d.live();
    const pl = this.d.player();
    const can = live && this.poseOk(pl) && !this.d.blocked?.();
    // 마을·캠핑장 장면이 번갈아 알리므로 마지막으로 알린 값과 견준다
    if (can !== (bridge.last("snow:can")?.on ?? false)) bridge.emit("snow:can", { on: can });
    if (!live && this.balls.length) this.clear();
    const me = this.hittable();
    if (me) pl.view.snowBody(this.body);
    this.collectNpcs(live);
    const p = this.pos;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      const t = now - b.at - SNOWBALL_GATHER_MS;
      if (t < 0) continue;
      if (!b.img) this.launch(b);
      if (this.step(b, i, t, me)) continue;
      b.pt = t;
      snowballAt(b.x0, b.y0, b.tx, b.ty, t, p);
      if (p.done) {
        this.land(b);
        this.dropBall(i);
        continue;
      }
      b.img!.setPosition(Math.round(p.x), Math.round(p.y - p.z)).setDepth(p.y + 0.5).setFrame(this.d.reduced ? 0 : Math.floor(t / 70) % 2);
      b.shadow!.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(0.35 + 0.4 * (1 - Math.min(1, p.z / 22)));
    }
    this.updateStuck(now);
    this.updateBubbles(now, labelScale);
    this.updateBits(now);
    this.updateMarks(now);
    this.updateTally(now, labelScale);
    if (this.seen.size > 16) for (const [k, at] of this.seen) if (now - at > 10_000) this.seen.delete(k);
  }

  /** 화면 안 NPC와 몸 상자를 모은다 (맞음 판정·겨누기 — 상자 풀은 다시 쓴다) */
  private collectNpcs(on: boolean): void {
    this.npcN = 0;
    if (!on || !this.d.npcs) return;
    for (const n of this.d.npcs()) {
      const k = this.npcN;
      const box = (this.npcBoxes[k] ??= { x: 0, y: 0, lift: 0, top: 0, half: 0 });
      if (!n.box(box)) continue;
      this.npcList[k] = n;
      this.npcN++;
    }
  }

  /**
   * 지난 프레임부터 지금(t)까지 날아간 길을 잘게(SUB_MS) 나눠 본다: 내 머리·몸(서버에 알림) → NPC(내 화면만) → 눈사람 → 막힌 것(벽 자국).
   * 무엇엔가 닿아 공이 끝났으면 true
   */
  private step(b: Ball, i: number, t: number, me: boolean): boolean {
    const p = this.sub;
    const steps = Math.max(1, Math.ceil((t - b.pt) / SUB_MS));
    const side = b.tx >= b.x0 ? 1 : -1;
    for (let k = 1; k <= steps; k++) {
      snowballAt(b.x0, b.y0, b.tx, b.ty, b.pt + ((t - b.pt) * k) / steps, p);
      if (!b.mine && me) {
        const h = snowBodyHit(p.x, p.y, p.z, this.body);
        if (h !== null) {
          this.hitMe(b, i, h);
          return true;
        }
      }
      for (let n = 0; n < this.npcN; n++) {
        const h = snowBodyHit(p.x, p.y, p.z, this.npcBoxes[n]);
        if (h === null) continue;
        this.dropBall(i);
        this.hitNpc(this.npcList[n], this.npcBoxes[n], h, side);
        return true;
      }
      const hit = this.d.targets?.hit(b.px, b.py, p.x, p.y) ?? null;
      if (hit) {
        this.dropBall(i);
        this.puffAt(hit.x, hit.y - 26, hit.y + 1, true);
        this.d.targets?.surprise(hit.id);
        return true;
      }
      if (this.d.solid?.(p.x, p.y)) {
        this.dropBall(i);
        this.splatWall(b.px, b.py, p.x, p.y, p.z);
        return true;
      }
      b.px = p.x;
      b.py = p.y;
    }
    return false;
  }

  /**
   * 막힌 것에 박혔다: 그 자리에 퍽 + 벽면에 납작한 눈 자국 WALL_MS. 남쪽(앞)이나 옆에서 맞았으면 그 물체 그림 앞에 보이게
   * (막힌 칸이 끝나는 아래 줄 = 물체 밑동 깊이), 북쪽(뒤)에서 맞았으면 물체 뒤에 (가려진다)
   */
  private splatWall(px: number, py: number, x: number, y: number, z: number): void {
    const s = this.d.scene;
    // 자국 높이는 낮게 잡는다 (평면 길만 보니 낮은 물체 위 허공에 뜨지 않게 — 높은 벽이면 밑동 근처에 붙는다)
    const vy = Math.round(y - Math.min(z, 8)) - 1;
    const back = y - py > 0.5;
    let base = Math.floor(y);
    if (!back) for (let k = 0; k < 24 && this.d.solid?.(x, base + 1); k++) base++;
    const depth = back ? Math.floor(py) - 1 : base + 1;
    this.puffAt(px, vy, depth - 0.6, false);
    if (this.onScreen(x, y)) this.d.sfx.snow("hit", 0.45);
    const v = (Math.abs(Math.round(x * 5 + y * 11)) % MARK_VARIANTS) | 0;
    const img = markCharTint(s.add.image(Math.round(px), vy, SNOWFIGHT_TEX.wall(v)).setOrigin(0.5, 0.45).setDepth(depth));
    this.pushMark(img, s.time.now + WALL_MS);
  }

  /** NPC가 맞았다 (내 화면만): 퍽 + 머리에 눈 + 놀람(「!」·가끔 한마디) + 멈칫 */
  private hitNpc(npc: SnowNpc, box: SnowBody, h: number, side: number): void {
    const now = this.d.scene.time.now;
    this.puffAt(box.x, box.y - box.lift - h, box.y + 1, true);
    const av = npc.av?.() ?? null;
    const img = av ? null : (npc.img?.() ?? null);
    if (av) av.snowHit(now, side, h);
    else if (img) this.stickOn(img, box, now);
    npc.hold?.(NPC_HOLD_MS);
    const last = this.saidAt.get(npc) ?? -Infinity;
    if (now - last >= NPC_SAY_GAP_MS && Math.random() < NPC_SAY_CHANCE) {
      this.saidAt.set(npc, now);
      const lines = SNOW_NPC_LINES[npc.voice];
      const line = lines[Math.floor(Math.random() * lines.length)];
      if (av) av.say(line, now);
      else if (npc.say) npc.say(line);
      else this.npcBubble(npc, line, now);
    } else this.floatText(box.x, box.y - box.lift - box.top - 3, "!");
  }

  /** 그림 한 장 NPC: 머리 위에 눈을 얹고, 잠깐 움찔(눌렸다 펴짐)하며 그 자리에 멈칫 */
  private stickOn(img: Phaser.GameObjects.Image, box: SnowBody, now: number): void {
    const old = this.stuck.find((o) => o.img === img);
    if (old) {
      old.at = now;
      old.until = now + NPC_SNOW_MS;
      old.fx = img.x;
      old.fy = img.y;
      return;
    }
    if (this.stuck.length >= 12) this.unstick(0);
    const cap = markCharTint(this.d.scene.add.image(box.x, box.y - box.top, SNOWFIGHT_TEX.cap).setOrigin(0.5, 0.75));
    this.stuck.push({ img, cap, at: now, until: now + NPC_SNOW_MS, fx: img.x, fy: img.y, sx: img.scaleX, sy: img.scaleY });
  }

  private unstick(i: number): void {
    const o = this.stuck[i];
    o.cap.destroy();
    if (o.img.active) o.img.setScale(o.sx, o.sy);
    this.stuck.splice(i, 1);
  }

  /** 얹힌 눈을 그림 머리에 맞추고, 처음 잠깐은 그 자리에 붙들고(멈칫) 눌렸다 펴지게 (각 무리가 그림을 놓은 뒤에 부른다) */
  private updateStuck(now: number): void {
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const o = this.stuck[i];
      if (now >= o.until || !o.img.active) {
        this.unstick(i);
        continue;
      }
      const t = now - o.at;
      const img = o.img;
      if (t < NPC_HOLD_MS) img.setPosition(o.fx, o.fy);
      if (!this.d.reduced && t < 260) {
        const k = Math.sin((t / 260) * Math.PI) * (1 - t / 260);
        img.setScale(o.sx * (1 + 0.18 * k), o.sy * (1 - 0.16 * k));
      } else if (img.scaleX !== o.sx || img.scaleY !== o.sy) img.setScale(o.sx, o.sy);
      const tail = Math.max(0, t - (NPC_SNOW_MS - 500)) / 500;
      o.cap
        .setPosition(Math.round(img.x + (0.5 - img.originX) * img.displayWidth), Math.round(img.y - img.originY * img.displayHeight + 2))
        .setDepth(img.depth + 0.3)
        .setVisible(img.visible)
        .setAlpha(img.alpha * (1 - tail));
    }
  }

  private npcBubble(npc: SnowNpc, text: string, now: number): void {
    let b = this.bubbles.find((o) => o.npc === npc);
    if (!b) {
      if (this.bubbles.length >= 6) this.bubbles.shift()?.bubble.destroy();
      b = { npc, bubble: new SpeechBubble(this.d.scene, this.d.atlas), until: 0 };
      this.bubbles.push(b);
    }
    b.bubble.show(text, now, NPC_BUBBLE_MS);
    b.until = now + NPC_BUBBLE_MS + 300;
  }

  private updateBubbles(now: number, labelScale: number): void {
    const box = this.body2;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const o = this.bubbles[i];
      const on = o.npc.box(box);
      if (now >= o.until) {
        o.bubble.destroy();
        this.bubbles.splice(i, 1);
        continue;
      }
      // 이름표(그림 위 한 줄) 위에 띄운다
      o.bubble.place(box.x, box.y - box.top - 3 - 12 * labelScale, labelScale, now, on);
    }
  }

  /** 손을 떠난다 */
  private launch(b: Ball): void {
    const s = this.d.scene;
    b.shadow = markCharTint(s.add.image(b.x0, b.y0, SNOWFIGHT_TEX.shadow).setDepth(DEPTH.decal + b.y0));
    b.img = markCharTint(s.add.sprite(b.x0, b.y0, SNOWFIGHT_TEX.ball, 0).setOrigin(0.5, 0.5));
    if (this.onScreen(b.x0, b.y0)) this.d.sfx.snow("toss", b.mine ? 0.8 : 0.45);
  }

  /** 땅에 닿았다: 작은 눈 자국 (물이면 물방울) */
  private land(b: Ball): void {
    const s = this.d.scene;
    const wet = this.d.water?.(b.tx, b.ty) ?? false;
    if (this.onScreen(b.tx, b.ty)) this.d.sfx.snow("land", 0.6);
    if (wet) {
      this.d.sfx.splash(0.15);
      this.puffAt(b.tx, b.ty - 1, b.ty + 1, false, 0xbfdcf0);
      return;
    }
    this.puffAt(b.tx, b.ty - 2, b.ty + 1, false);
    const v = (Math.abs(Math.round(b.tx * 7 + b.ty * 3)) % MARK_VARIANTS) | 0;
    const img = markCharTint(s.add.image(b.tx, b.ty + 1, SNOWFIGHT_TEX.mark(v)).setDepth(DEPTH.decal + b.ty));
    this.pushMark(img, s.time.now + MARK_MS);
  }

  /** 자국을 남긴다 (바닥·벽 합쳐 MARK_MAX — 넘으면 오래된 것부터) */
  private pushMark(img: Phaser.GameObjects.Image, until: number): void {
    this.marks.push({ img, until });
    if (this.marks.length > MARK_MAX) this.marks.shift()?.img.destroy();
  }

  /** 쪼그려 눈을 긁어모으는 발치에 눈가루 몇 알 */
  private scoop(x: number, y: number, dir: DirId): void {
    if (!this.onScreen(x, y)) return;
    const [dx, dy] = DIR_VEC[dir] ?? [0, 1];
    const n = this.d.reduced ? 1 : 3;
    for (let k = 0; k < n; k++) this.addBit(x + dx * 5 + (k - 1) * 2, y + dy * 3 + 1, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 6, 40 + Math.random() * 25, 1);
  }

  /** 퍽: 네 장짜리 터짐 + 튀는 조각 (big = 사람·눈사람에 맞음 — 조각이 더 많고 멀리) */
  private puffAt(x: number, y: number, depthY: number, big: boolean, tint?: number): void {
    if (!this.onScreen(x, y)) return;
    const s = this.d.scene;
    const img = markCharTint(s.add.sprite(Math.round(x), Math.round(y), SNOWFIGHT_TEX.puff, 0).setDepth(depthY + 0.6));
    img.setScale(big ? 0.85 : 0.55);
    if (tint !== undefined) img.setTint(tint);
    let f = 0;
    const step = () => {
      f++;
      if (f >= PUFF_FRAMES || !img.scene) {
        img.destroy();
        return;
      }
      img.setFrame(f);
      s.time.delayedCall(PUFF_STEP_MS, step);
    };
    s.time.delayedCall(PUFF_STEP_MS, step);
    if (big) this.d.sfx.snow("hit", 0.9);
    const n = this.d.reduced ? 2 : big ? 7 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = (big ? 40 : 22) + Math.random() * (big ? 34 : 14);
      // 조각은 맞은 높이에서 출발해 땅(depthY)까지 떨어진다
      this.addBit(x, depthY - 1, Math.cos(a) * sp, Math.sin(a) * sp * 0.45, (big ? 30 : 18) + Math.random() * 30, k % 2, depthY - 1 - y);
    }
  }

  private addBit(x: number, y: number, vx: number, vy: number, vz: number, frame: number, z = 2): void {
    if (this.bits.length >= MAX_BITS) {
      this.bits[0].img.destroy();
      this.bits.shift();
    }
    const img = markCharTint(this.d.scene.add.image(x, y - z, SNOWFIGHT_TEX.bit, frame));
    this.bits.push({ img, x, y, z, vx, vy, vz, until: this.d.scene.time.now + 900 });
  }

  private updateBits(now: number): void {
    const dt = Math.min(0.05, this.d.scene.game.loop.delta / 1000);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.vz -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.z <= 0 || now >= b.until) {
        b.img.destroy();
        this.bits.splice(i, 1);
        continue;
      }
      b.img.setPosition(Math.round(b.x), Math.round(b.y - b.z)).setDepth(b.y + 0.6);
    }
  }

  private updateMarks(now: number): void {
    for (let i = this.marks.length - 1; i >= 0; i--)
      if (now >= this.marks[i].until) {
        this.marks[i].img.destroy();
        this.marks.splice(i, 1);
      }
    for (const m of this.marks) {
      const left = m.until - now;
      if (left < MARK_FADE_MS) m.img.setAlpha(left / MARK_FADE_MS);
    }
  }

  // ── 글자 ──

  /** 「명중!」 (맞은 사람 머리 위에서 살짝 떠올랐다 사라진다) */
  private floatText(x: number, y: number, text: string): void {
    const s = this.d.scene;
    this.d.atlas.ensure(text);
    const sc = this.labelScale();
    const t = s.add.bitmapText(Math.round(x), Math.round(y), FONT_KEY, text, FONT_PX).setOrigin(0.5, 1).setDepth(DEPTH.bubble + 1).setTint(HIT_TINT).setScale(sc);
    s.tweens.add({ targets: t, y: y - 10, alpha: 0, delay: 350, duration: 650, ease: "Sine.easeIn", onComplete: () => t.destroy() });
  }

  private labelScale(): number {
    return this.d.player().view.label.scaleX || 1;
  }

  /** 오늘 맞힌 수·맞은 수를 내 이름 옆에 잠깐 */
  private showTally(t: SnowFightTally): void {
    const s = this.d.scene;
    const text = `맞힘 ${t.hit} 맞음 ${t.got}`;
    this.d.atlas.ensure(text);
    if (!this.tally) {
      const label = s.add.bitmapText(0, 0, FONT_KEY, text, FONT_PX).setOrigin(0, 1).setDepth(DEPTH.labels + 2).setTint(TALLY_TINT);
      const icon = s.add.image(0, 0, SNOWFIGHT_TEX.ball, 0).setOrigin(0, 1).setDepth(DEPTH.labels + 2);
      this.tally = { text: label, icon, until: 0 };
    } else this.tally.text.setText(text);
    this.tally.until = s.time.now + TALLY_MS;
    this.tally.text.setAlpha(1).setVisible(true);
    this.tally.icon.setAlpha(1).setVisible(true);
  }

  private updateTally(now: number, labelScale: number): void {
    const t = this.tally;
    if (!t || !t.text.visible) return;
    if (now >= t.until) {
      t.text.setVisible(false);
      t.icon.setVisible(false);
      return;
    }
    const v = this.d.player().view;
    const l = v.label;
    const a = Math.min(1, (t.until - now) / 400) * (v.visible ? 1 : 0);
    // 이름표 오른쪽 (도감 배지가 있으면 그 너머). 글자·아이콘은 이름표처럼 화면 크기로
    const gap = 3 * labelScale + (v.dexBadgeCount > 0 ? 10 * labelScale : 0);
    const x = l.x + l.width / 2 + gap;
    const y = l.y;
    const isc = labelScale * 2.4;
    t.icon.setScale(isc).setPosition(x, y - 2 * labelScale).setAlpha(a);
    t.text
      .setScale(labelScale * 0.85)
      .setPosition(x + (BALL_FRAME + 2) * isc, y)
      .setAlpha(a);
  }

  // ── 그 밖 ──

  private onScreen(x: number, y: number): boolean {
    const v = this.d.scene.cameras.main.worldView;
    return x > v.x - 40 && x < v.right + 40 && y > v.y - 40 && y < v.bottom + 60;
  }

  /** 날아가는 공을 모두 지운다 (맵을 옮기거나 판이 바뀌었다). 바닥 자국·조각은 저절로 사라진다 */
  clear(): void {
    for (let i = this.balls.length - 1; i >= 0; i--) this.dropBall(i);
    this.gatherUntil = -Infinity;
  }

  destroy(): void {
    this.clear();
    for (const b of this.bits) b.img.destroy();
    this.bits.length = 0;
    for (const m of this.marks) m.img.destroy();
    this.marks.length = 0;
    while (this.stuck.length) this.unstick(0);
    for (const b of this.bubbles) b.bubble.destroy();
    this.bubbles.length = 0;
    this.tally?.text.destroy();
    this.tally?.icon.destroy();
    this.tally = null;
    if (bridge.last("snow:can")?.on) bridge.emit("snow:can", { on: false });
  }
}

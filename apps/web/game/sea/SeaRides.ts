import * as Phaser from "phaser";
import { DIR, SEA_JET_SHALLOW_MSG, SEA_JETSKI_SPEED, SEA_RIDES, seaJetDismount, seaJetWater, SEA_TUBE_SPEED, onSeaDeck, seaTubeDriftAt, seaTubeWater, seaWet, type DirId, type SeaRide, type Sid } from "@tomb/protocol";
import { BIG_RIDE_TOAST, myBig } from "../camp/foodState";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { hullBlocks } from "../logic/boat";
import { Bounce, knockMove, nudgeAmp, nudgeOffset, resolveHulls, SHIP_GAIN, strongerGain, touchContact, touchHit, type BounceKind, type Box } from "../logic/bounce";
import type { MoveInput } from "../logic/movement";
import { RideSound } from "../world/RideSound";
import { bystanderGain } from "../world/rides";
import * as Art from "./seaArt";
import { rideBox, stepJet, stepTube, tubeReturnK, type RideMotion } from "./seaRideLogic";
import { SeaEngineSound } from "./seaRideSound";

// 11/16 r13 바다 놀거리 (사용자): 튜브 다섯 · 제트스키 둘. 그림·타기·움직임·소리를 한곳에서 (마을 조각배 BoatRide와 같은 흐름).
//  - 자리는 서버 좌석 (protocol SEA_RIDES — 조각배처럼 mobile, 상태 boat). 한 놀거리에 한 명
//  - 튜브: 헤엄치다(또는 물가에서) 가까이 가면 「E 튜브 타기」 → 방향키로 천천히 노 젓기, 물결이 살짝 밀어요.
//    E 또는 모래에 닿으면 내려요 (물이 빠져 튜브 아래가 마르면 그 자리에 내려요). 빈 튜브는 모두의 화면에서 같은 길을 떠다녀요
//    (탄 사람이 내린 자리에서 그 길로 천천히 돌아가요)
//  - 제트스키: 선착장 끝 데크에서 「E 제트스키 타기」 → 빠르게(조각배의 두 배) 달리며 물살 자국·물보라·엔진 소리.
//    깊은 물만 (간조 물가보다 바깥) — 얕은 쪽으로 가면 멈추고 「여기는 너무 얕아요」. 내리기는 매어 두는 자리에서만 (E)
//  - 다른 사람이 탄 놀거리는 그 사람 아바타(보간 위치·방향)에 붙여 그려요 (네트워크 추가 없음)
//  - isRiding: 타는 동안엔 장면을 바꾸는 입구(사냥·빌딩·미니게임·채널 옮기기)를 막을 수 있게 (공용 "타는 중" 검사에 걸어요)

export type SeaRideHost = {
  scene: Phaser.Scene;
  reduced: boolean;
  player(): Player;
  remotes(): ReadonlyMap<Sid, RemoteAvatar>;
  /** 서버 좌석 점유표 (오프라인이면 빈 표) */
  seats(): ReadonlyMap<string, Sid>;
  mySid(): Sid | null;
  online(): boolean;
  sit(seatId: string): void;
  stand(): void;
  toast(message: string): void;
  /** 지금 물 높이 0..1 */
  tide(): number;
  splash(x: number, y: number): void;
  /** 타기 전에 (펫에서 내리기·쉴거리에서 일어나기). false면 타지 않아요 */
  beforeBoard(): boolean;
  /** 11/16 r19 바다의 모든 놀거리 몸 (튜브·제트스키·카약 — 부딪혀 튕기기) · 빈 놀거리를 살짝 밀기 */
  hulls(): readonly SeaHull[];
  nudge(id: string, nx: number, ny: number, amp: number): void;
  /** 11/16 r19 움직이는 배에 부딪혔어요 (큰 물보라 · 큰 배는 뱃고동) · 그 자리 배 물결 세기 0..1 (튜브·카약이 흔들려요) */
  shipHit(heavy: "big" | "medium", x: number, y: number): void;
  wake(x: number, y: number): number;
};

/** 11/16 r19 놀거리 하나의 몸 상자 (id = 놀거리 id · 카약은 pK1 같은 카약 id, empty = 아무도 안 탐) */
/**
 * 11/16 r19 사용자 "바다에서는 오브젝트가 서로 다 튕겨야 해": 놀거리·카약·배·물에 있는 다른 사람 모두.
 * vx·vy = 그것의 속도 (다른 사람이 탄 것·헤엄치는 사람·배 — 서로 다가간 만큼 세게), kind = 그것의 종류 (더 센 쪽 세기로)
 */
/** remote = 다른 사람 (헤엄·그 사람이 탄 것) — 가까이 닿기만 해도 튕겨요 (logic/bounce touchHit) */
export type SeaHull = { id: string; box: Box; empty: boolean; vx?: number; vy?: number; kind?: BounceKind; ship?: { heavy: "big" | "medium" }; remote?: boolean };

/**
 * 11/16 r19 겹치지 않았어도 다른 사람과 가까이 닿았고 서로 다가가는 중이면 튕기기 (상대는 자기 화면에서 이미 튕겨 나가 겹치지 않아요).
 * 튕겼으면 그 상대 (밀어내지는 않아요)
 */
export function remoteTouch(me: Box, mv: { vx: number; vy: number }, others: readonly SeaHull[]): { contact: { nx: number; ny: number; depth: number }; o: SeaHull; rvx: number; rvy: number } | null {
  const rs = others.filter((o) => o.remote);
  const t = touchHit(me, rs.map((o) => o.box));
  if (!t) return null;
  const o = rs[t.index];
  return { contact: t.contact, o, rvx: mv.vx - (o.vx ?? 0), rvy: mv.vy - (o.vy ?? 0) };
}

type View = {
  def: SeaRide;
  body: Phaser.GameObjects.Image;
  /** 튜브 앞쪽 반 (탄 사람 다리를 가려요) */
  front: Phaser.GameObjects.Image | null;
  x: number;
  y: number;
  dir: DirId;
  /** 지금 탄 사람 (-1 = 나, null = 없음) */
  owner: Sid | -1 | null;
  /** 탄 사람이 내린 자리 · 때 (빈 튜브가 길로 돌아가요, 제트스키는 매어 둔 자리로) */
  leftFrom: { x: number; y: number } | null;
  leftAt: number;
  speed: number;
  lastX: number;
  lastY: number;
  wakeAt: number;
  sprayAt: number;
  /** 11/16 r19 지금 속도 (px/s — 다른 사람이 탄 것을 받을 때 서로 다가간 만큼) */
  vx: number;
  vy: number;
  /** 11/16 r19 받혀 살짝 밀린 쪽 · 세기 · 때 (빈 놀거리 그림만) */
  nudge: { nx: number; ny: number; amp: number; at: number } | null;
  /** 11/16 r14 헤엄치는 사람이 부딪히는 몸 (탄 사람 자신은 빼요) */
  block: Phaser.GameObjects.Zone;
  blockKey: string;
  /** 내가 막 내린 놀거리는 잠깐 통과 (내린 자리에서 밀려나지 않게) */
  passUntil: number;
};

/** 튜브에 탄 사람이 물에 잠기는 깊이 · 제트스키 안장 높이 (px) */
// r18 사용자: 튜브는 몸통이 구멍 안에 (머리·어깨만 앞 고리 위로), 제트스키는 앉은 자세로 안장에 (다리는 앞 덮개에 가려요)
const TUBE_SINK = -11;
const JET_LIFT = 1;
/** 올라타는 거리 (튜브 가운데·매어 둔 자리에서) */
const TUBE_REACH = 22;
const JET_REACH = 40;
/** 제트스키 내리기: 매어 두는 자리에서 이만큼 */
const JET_DOCK_REACH = 30;
/** 「너무 얕아요」 안내 간격 */
const SHALLOW_TOAST_MS = 2500;
/** 부딪힘 소리 간격 */
const BUMP_MS = 600;
/** 빈 제트스키가 매어 둔 자리로 돌아가기 전 기다림 · 사라졌다 나타나는 시간 */
const JET_RETURN_MS = 2500;
const JET_FADE_MS = 500;
/** 노 젓는 소리 간격 */
const PADDLE_MS = 900;
/** 내린 뒤 그 놀거리를 통과하는 시간 */
const PASS_AFTER_LEAVE_MS = 2000;

export class SeaRides {
  private readonly views: View[] = [];
  private readonly wakes: Phaser.GameObjects.Image[] = [];
  private wakeNext = 0;
  private readonly sound = new RideSound();
  private readonly engine = new SeaEngineSound();
  private motion: RideMotion = { x: 0, y: 0, vx: 0, vy: 0, dir: DIR.down };
  private shallowAt = -Infinity;
  private bumpAt = -Infinity;
  /** 11/16 r19 내 놀거리가 부딪혀 튕기는 중 */
  private readonly bounce = new Bounce();
  private paddleAt = 0;
  /** 이번 프레임에 탄 모습을 넣어 준 원격 아바타 (내리면 되돌려요) */
  private riders = new Set<RemoteAvatar>();
  private readonly blocks: Phaser.Physics.Arcade.StaticGroup;
  private readonly blockCollider: Phaser.Physics.Arcade.Collider;

  constructor(readonly host: SeaRideHost) {
    const s = host.scene;
    const T = Art.SEA_TEX;
    for (const def of SEA_RIDES) {
      const tube = def.kind === "tube";
      const key = tube ? T.tube(def.n) : T.jetski("side", def.n);
      const body = s.add.image(def.x, def.y, key).setOrigin(0.5, tube ? Art.TUBE_CY / Art.TUBE_H : 1);
      // 앞 덮개: 튜브는 앞 고리, 제트스키는 몸통 아래쪽 (탄 사람 다리를 가려요)
      const front = tube
        ? s.add.image(def.x, def.y, key).setOrigin(0.5, Art.TUBE_CY / Art.TUBE_H).setCrop(0, Art.TUBE_CY, Art.TUBE_W, Art.TUBE_H - Art.TUBE_CY).setVisible(false)
        : s.add.image(def.x, def.y, key).setOrigin(0.5, 1).setVisible(false);
      const block = s.add.zone(def.x, def.y, 1, 1).setOrigin(0, 0);
      block.removeFromDisplayList();
      this.views.push({ def, body, front, x: def.x, y: def.y, dir: DIR.down, owner: null, leftFrom: null, leftAt: 0, speed: 0, lastX: def.x, lastY: def.y, wakeAt: 0, sprayAt: 0, vx: 0, vy: 0, nudge: null, block, blockKey: "", passUntil: 0 });
    }
    // 11/16 r14 사용자: 헤엄치다 제트스키·튜브를 그냥 지나가요 → 부딪혀요 (내가 탄 것·막 내린 것은 빼요)
    // 마을 배(BoatRide hullBlocks)와 같은 규칙: 헤엄·잠수 중이고 아무것도 안 탔을 때만, 보이는 놀거리만, 막 내린 것은 잠깐 통과.
    // 떠다니는 빈 튜브가 가만히 있는 사람 쪽으로 밀려오면 밀어내지 않아요 (그 사람이 튜브 쪽으로 헤엄칠 때만 막아요)
    this.blocks = s.physics.add.staticGroup();
    for (const v of this.views) this.blocks.add(v.block);
    this.blockCollider = s.physics.add.collider(host.player().sprite, this.blocks, (_a, b) => this.swimBump(b as Phaser.GameObjects.Zone), (_a, b) => {
      const v = this.views.find((w) => w.block === b);
      const pl = host.player();
      if (!v || v.owner === -1 || s.time.now < v.passUntil || v.body.alpha < 0.5 || !hullBlocks(pl, true)) return false;
      if (v.def.kind === "tube" && v.owner === null) {
        const bd = pl.sprite.body as Phaser.Physics.Arcade.Body | null;
        const vx = bd?.velocity.x ?? 0;
        const vy = bd?.velocity.y ?? 0;
        return vx * (v.x - pl.x) + vy * (v.y - pl.y) > 0;
      }
      return true;
    });
    for (let i = 0; i < (host.reduced ? 16 : 48); i++) this.wakes.push(s.add.image(0, 0, T.wake).setVisible(false).setDepth(0));
  }

  /** 지금 튜브·제트스키를 타고 있는지 (공용 "타는 중" 검사가 불러요) */
  get isRiding(): boolean {
    return this.mine() !== null;
  }

  /** 지금 탄 놀거리 종류 (없으면 null) — 공용 "타는 중" 검사(lib/rideGate publishRide)에 이름으로 알려요 */
  get kind(): "tube" | "jetski" | null {
    return this.mine()?.def.kind ?? null;
  }

  private mine(): View | null {
    const id = this.host.player().boatSeatId;
    return id ? (this.views.find((v) => v.def.id === id) ?? null) : null;
  }

  private ownerOf(v: View): Sid | -1 | null {
    if (this.host.player().boatSeatId === v.def.id) return -1;
    const sid = this.host.seats().get(v.def.id);
    if (sid === undefined) return null;
    return sid === this.host.mySid() ? -1 : sid;
  }

  // ── 타기·내리기 ──

  /** 올라탈 수 있는 가장 가까운 빈 놀거리 */
  private candidate(): View | null {
    const pl = this.host.player();
    if (pl.inBoat || pl.sitting || pl.anchored || pl.airborne) return null;
    let best: View | null = null;
    let bd = Infinity;
    for (const v of this.views) {
      if (v.owner !== null) continue;
      const tube = v.def.kind === "tube";
      if (!tube && (v.leftFrom || !onSeaDeck(pl.x, pl.y))) continue;
      const d = Math.hypot(v.x - pl.x, v.y - pl.y);
      if (d > (tube ? TUBE_REACH : JET_REACH) || d >= bd) continue;
      best = v;
      bd = d;
    }
    return best;
  }

  /** 안내 (「E 튜브 타기」 · 타는 중 조작) — 없으면 null */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    const v = this.mine();
    if (v) {
      if (v.def.kind === "tube") return { x: v.x, y: v.y + 10, text: `${prefix}내리기` };
      const d = Math.hypot(v.x - v.def.x, v.y - v.def.y);
      return d <= JET_DOCK_REACH ? { x: v.x, y: v.y + 8, text: `${prefix}내리기` } : null;
    }
    const c = this.candidate();
    if (!c) return null;
    return { x: c.x, y: c.y + 10, text: `${prefix}${c.def.kind === "tube" ? "튜브 타기" : "제트스키 타기"}` };
  }

  /** E: 타고 있으면 내리기, 아니면 가까운 빈 놀거리에 타기. 처리했으면 true */
  interact(): boolean {
    const v = this.mine();
    if (v) {
      if (v.def.kind === "tube") this.leave(v, { x: this.motion.x, y: this.motion.y });
      else if (Math.hypot(v.x - v.def.x, v.y - v.def.y) <= JET_DOCK_REACH) this.leave(v, this.jetDeckSpot(v));
      else this.host.toast("제트스키는 선착장 끝 매어 두는 자리에서 내려요");
      return true;
    }
    const c = this.candidate();
    if (!c) return false;
    this.board(c);
    return true;
  }

  private board(v: View): void {
    const h = this.host;
    if (myBig() > 1) {
      h.toast(BIG_RIDE_TOAST);
      return;
    }
    if (!h.beforeBoard()) return;
    const pl = h.player();
    const now = h.scene.time.now;
    const dir: DirId = v.def.kind === "jetski" ? DIR.right : DIR.down;
    pl.board(v.def.id, v.x, v.y, dir, now, null);
    this.motion = { x: v.x, y: v.y, vx: 0, vy: 0, dir };
    this.bounce.reset();
    v.owner = -1;
    v.leftFrom = null;
    if (h.online()) h.sit(v.def.id);
    this.sound.play("boat-board", 0.6, v.def.kind === "tube" ? 1.15 : 0.9);
    if (!h.reduced) h.splash(v.x, v.y + 2);
  }

  /** 제트스키에서 내려설 자리 (r14 매어 둔 자리 바로 옆 부잔교 위 — 다리로 선착장과 이어져요) */
  private jetDeckSpot(v: View): { x: number; y: number } {
    return seaJetDismount(v.def);
  }

  private leave(v: View, to: { x: number; y: number }, toast?: string): void {
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    if (v.def.kind === "jetski" && Math.hypot(v.x - v.def.x, v.y - v.def.y) <= JET_DOCK_REACH) {
      // 매어 두는 자리에 딱 붙여 놓아요
      v.x = v.def.x;
      v.y = v.def.y;
      v.leftFrom = null;
    } else {
      v.leftFrom = { x: v.x, y: v.y };
      v.leftAt = now;
    }
    v.owner = null;
    v.passUntil = now + PASS_AFTER_LEAVE_MS;
    pl.leaveBoat(Math.round(to.x), Math.round(to.y), now);
    pl.view.ride = null;
    if (h.online()) h.stand();
    if (toast) h.toast(toast);
    this.sound.play("boat-board", 0.45, 1.1);
    if (!h.reduced && v.def.kind === "tube") h.splash(to.x, to.y + 2);
  }

  /** 다른 사람이 내 놀거리를 먼저 잡았어요 (동시에 탐) */
  onSeat(seatId: string, sid: Sid | null): void {
    const v = this.mine();
    if (!v || v.def.id !== seatId || sid === null || sid === this.host.mySid()) return;
    this.leave(v, this.safeSpot(v), "누가 먼저 탔어요");
  }

  /** 서버가 놀거리 자리를 거절했어요. 내 놀거리였으면 true */
  onSeatDenied(seatId: string): boolean {
    const v = this.mine();
    if (!v || v.def.id !== seatId) return false;
    const owner = this.host.seats().get(seatId);
    this.leave(v, this.safeSpot(v), owner !== undefined ? "누가 먼저 탔어요" : "탈 수 없었어요. 다시 눌러 주세요");
    return true;
  }

  /** 자리를 놓쳤을 때 내려설 곳: 튜브는 그 자리(물이면 헤엄), 제트스키는 매어 둔 자리 위 데크 */
  private safeSpot(v: View): { x: number; y: number } {
    return v.def.kind === "tube" ? { x: v.x, y: v.y } : this.jetDeckSpot(v);
  }

  /** 장면을 떠나요 (버스·새로고침 전) — 타고 있으면 그 자리에서 내려요 */
  dismount(): void {
    const v = this.mine();
    if (v) this.leave(v, this.safeSpot(v));
  }

  // ── 매 프레임 ──

  /** 타고 있으면 방향키로 움직여요 (Player.update 다음에) */
  steer(move: MoveInput, dtMs: number): void {
    const v = this.mine();
    if (!v) return;
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const m = this.motion;
    const level = h.tide();
    // 11/16 r19 부딪혀 튕긴 직후엔 방향키가 잠깐 덜 먹어요
    const ctrl = this.bounce.control(now);
    const input = { ax: move.ax * ctrl, ay: move.ay * ctrl };
    const tube = v.def.kind === "tube";
    if (tube) {
      // 물이 빠져 튜브 아래가 말랐어요 → 그 자리에 내려서요
      if (!seaWet(m.x, m.y, level, 4)) {
        this.leave(v, { x: m.x, y: m.y });
        return;
      }
      const r = stepTube(m, input, dtMs, level, Date.now(), v.def.n * 1.7);
      if (r.land) {
        this.leave(v, r.land);
        return;
      }
      if (r.bumped) this.bump(now, 0.35);
      if (Math.hypot(move.ax, move.ay) > 0.2 && now >= this.paddleAt) {
        this.paddleAt = now + PADDLE_MS;
        this.sound.play("row", 0.35, 1.2 + Math.random() * 0.1);
      }
    } else {
      const r = stepJet(m, input, dtMs);
      if (r.shallow && now - this.shallowAt > SHALLOW_TOAST_MS) {
        this.shallowAt = now;
        h.toast(SEA_JET_SHALLOW_MSG);
      }
      if (r.bumped) this.bump(now, 0.7);
    }
    // 11/16 r19 다른 놀거리(튜브·제트스키·카약)에 닿으면 튕겨 나가요 — 밀려나는 길은 물만 (데크·바위로는 안 밀어요)
    const ok = tube ? (x: number, y: number) => seaTubeWater(x, y, level) : (x: number, y: number) => seaJetWater(x, y);
    knockMove(m, this.bounce.take(dtMs), ok, this.bounce);
    const others = h.hulls().filter((o) => o.id !== v.def.id);
    const hit = resolveHulls(m, (x, y) => rideBox(v.def.kind, m.dir, x, y), others.map((o) => o.box), ok, {
      gentle: (i) => !others[i].ship,
      vel: (i) => ({ vx: others[i].vx ?? 0, vy: others[i].vy ?? 0 }),
    });
    if (hit) {
      const o = others[hit.index];
      // 서로 다가간 만큼 (움직이는 배·다른 사람이 탄 것·헤엄치는 사람 — 가만히 있다 받혀도 튕겨요), 더 센 쪽 세기로
      const rvx = hit.vx - (o.vx ?? 0);
      const rvy = hit.vy - (o.vy ?? 0);
      const sp = o.ship
        ? this.bounce.hit(now, hit.contact, v.def.kind, rvx, rvy, { gain: SHIP_GAIN[o.ship.heavy], minInto: 0 })
        : this.bounce.hit(now, hit.contact, v.def.kind, rvx, rvy, { gain: strongerGain(v.def.kind, o.kind) });
      if (sp > 0) {
        this.sound.thump(tube ? 0.3 : 0.55, tube ? 1.3 : 1.05);
        if (o.ship) h.shipHit(o.ship.heavy, m.x - hit.contact.nx * 8, m.y - hit.contact.ny * 4);
        else if (!h.reduced) h.splash(m.x - hit.contact.nx * 8, m.y - hit.contact.ny * 4);
        if (o.empty) h.nudge(o.id, -hit.contact.nx, -hit.contact.ny, nudgeAmp(sp));
      }
    } else {
      // 다른 사람이 가까이 닿았어요 (그쪽 화면에선 이미 튕겨 나갔어요) → 나도 튕겨요
      const t = remoteTouch(rideBox(v.def.kind, m.dir, m.x, m.y), m, others);
      if (t && this.bounce.hit(now, t.contact, v.def.kind, t.rvx, t.rvy, { gain: strongerGain(v.def.kind, t.o.kind) }) > 0) {
        this.sound.thump(tube ? 0.3 : 0.55, tube ? 1.3 : 1.05);
        if (!h.reduced) h.splash(m.x - t.contact.nx * 8, m.y - t.contact.ny * 4);
      }
    }
    v.x = m.x;
    v.y = m.y;
    v.dir = m.dir;
    pl.boatTo(Math.round(m.x * 10) / 10, Math.round(m.y * 10) / 10, m.dir, now);
  }

  /** 11/16 r19 헤엄치다 튜브·제트스키에 부딪혔어요 (물리 충돌 콜백): 살짝 튕겨 나가고, 빈 놀거리는 살짝 밀려요 */
  private swimBump(zone: Phaser.GameObjects.Zone): void {
    const v = this.views.find((w) => w.block === zone);
    const pl = this.host.player();
    const zb = zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!v || !zb) return;
    const now = this.host.scene.time.now;
    const c = touchContact({ x: pl.body.x, y: pl.body.y, w: pl.body.width, h: pl.body.height }, { x: zb.x, y: zb.y, w: zb.width, h: zb.height });
    if (!c) return;
    // 11/16 r19 다른 사람이 탄 제트스키·튜브가 나를 받아도 튕겨요 (그것의 속도만큼, 더 센 쪽 세기로)
    const sp = pl.knock(c, now, "swim", { rvx: v.vx, rvy: v.vy, gain: strongerGain("swim", v.def.kind) });
    if (sp <= 0) return;
    this.sound.thump(0.22, 1.4);
    if (!this.host.reduced) this.host.splash(pl.x - c.nx * 5, pl.y - c.ny * 3);
    if (v.owner === null) this.nudge(v.def.id, -c.nx, -c.ny, nudgeAmp(sp));
  }

  /** 11/16 r19 놀거리 몸 상자들 (부딪혀 튕기기 — 사라지는 중인 제트스키는 빼요) */
  hullBoxes(): SeaHull[] {
    return this.views
      .filter((v) => v.body.alpha >= 0.5)
      .map((v) => ({
        id: v.def.id,
        box: rideBox(v.def.kind, v.dir, Math.round(v.x), Math.round(v.y)),
        empty: v.owner === null,
        vx: v.vx,
        vy: v.vy,
        kind: v.def.kind,
        // 다른 사람이 탄 것
        ...(v.owner !== null && v.owner !== -1 ? { remote: true } : {}),
      }));
  }

  /** 받힌 빈 놀거리를 살짝 밀어요 (그림만 — 곧 제자리) */
  nudge(id: string, nx: number, ny: number, amp: number): void {
    const v = this.views.find((w) => w.def.id === id);
    if (v && v.owner === null) v.nudge = { nx, ny, amp, at: this.host.scene.time.now };
  }

  private bump(now: number, gain: number): void {
    if (now - this.bumpAt < BUMP_MS) return;
    this.bumpAt = now;
    this.sound.thump(gain, 1.2);
  }

  /** 그림·빈 놀거리 떠다니기·다른 사람 놀거리·물살 자국·엔진 소리 (원격 아바타 update 전에) */
  update(dtMs: number): void {
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const wall = Date.now();
    const level = h.tide();
    const remotes = h.remotes();
    const seen = new Set<RemoteAvatar>();
    let engineLevel = 0;
    let engineRpm = 0;
    for (const v of this.views) {
      const prev = v.owner;
      const owner = this.ownerOf(v);
      // 다른 사람이 내렸어요 (그 사람이 떠났거나 자리를 놓음) → 그 자리에서 길로 돌아가요
      if (prev !== null && prev !== -1 && owner === null) {
        v.leftFrom = { x: v.x, y: v.y };
        v.leftAt = now;
      }
      v.owner = owner;
      let rider: RemoteAvatar | null = null;
      if (owner === -1) {
        // 나: steer가 옮겼어요
      } else if (owner !== null) {
        const r = remotes.get(owner);
        if (r) {
          rider = r;
          v.x = r.x;
          v.y = r.y;
          v.dir = r.view.dir;
        }
      } else if (v.def.kind === "tube") {
        const d = seaTubeDriftAt(v.def.n, wall, level);
        if (v.leftFrom) {
          const k = tubeReturnK(Math.hypot(d.x - v.leftFrom.x, d.y - v.leftFrom.y), now - v.leftAt);
          v.x = v.leftFrom.x + (d.x - v.leftFrom.x) * k;
          v.y = v.leftFrom.y + (d.y - v.leftFrom.y) * k;
          if (k >= 1) v.leftFrom = null;
        } else {
          v.x = d.x;
          v.y = d.y;
        }
      } else if (v.leftFrom) {
        // 빈 제트스키가 바다 한가운데 (탄 사람이 접속을 끊음): 잠시 뒤 사라졌다가 매어 둔 자리에 나타나요
        const t = now - v.leftAt;
        if (t >= JET_RETURN_MS + JET_FADE_MS) {
          v.x = v.def.x;
          v.y = v.def.y;
          v.dir = DIR.right;
          if (t >= JET_RETURN_MS + JET_FADE_MS * 2) v.leftFrom = null;
        }
      } else {
        // 매어 둔 제트스키는 옆모습 (데크와 나란히)
        v.x = v.def.x;
        v.y = v.def.y;
        v.dir = DIR.right;
      }
      const dt = Math.max(1, dtMs);
      const inst = (Math.hypot(v.x - v.lastX, v.y - v.lastY) / dt) * 1000;
      v.speed = inst > 400 ? v.speed : v.speed + (inst - v.speed) * Math.min(1, dt / 160);
      if (inst <= 400) {
        const kk = Math.min(1, dt / 120);
        v.vx += (((v.x - v.lastX) / dt) * 1000 - v.vx) * kk;
        v.vy += (((v.y - v.lastY) / dt) * 1000 - v.vy) * kk;
      }
      v.lastX = v.x;
      v.lastY = v.y;
      this.draw(v, now, wall, rider);
      if (rider) seen.add(rider);
      if (owner !== null) this.trail(v, now);
      if (v.def.kind === "jetski" && owner !== null) {
        const near = owner === -1 ? 1 : bystanderGain(Math.hypot(v.x - pl.x, v.y - pl.y)) * 1.6;
        const rpm = Math.min(1, v.speed / SEA_JETSKI_SPEED);
        const lvl = near * (0.35 + 0.65 * rpm);
        if (lvl > engineLevel) {
          engineLevel = lvl;
          engineRpm = rpm;
        }
      }
    }
    for (const r of this.riders) if (!seen.has(r)) r.view.ride = null;
    this.riders = seen;
    this.engine.set(engineLevel, engineRpm, performance.now());
  }

  private draw(v: View, now: number, wall: number, rider: RemoteAvatar | null): void {
    const T = Art.SEA_TEX;
    const ridden = v.owner !== null;
    // 11/16 r19 배가 가까이 지나가면 물결에 더 흔들려요
    const wk = this.host.reduced ? 0 : this.host.wake(v.x, v.y);
    const bob = this.host.reduced ? 0 : Math.sin(wall / 620 + v.def.n * 1.9) * (v.def.kind === "tube" ? 0.9 : 0.6) + wk * 2.2 * Math.sin(wall / 170 + v.def.n);
    // 11/16 r19 받힌 빈 놀거리는 살짝 밀렸다 돌아와요
    const nd = v.nudge && !ridden ? nudgeOffset(v.nudge.amp, now - v.nudge.at) : 0;
    if (v.nudge && now - v.nudge.at > 1000) v.nudge = null;
    const x = Math.round(v.x + (v.nudge?.nx ?? 0) * nd);
    const y = Math.round(v.y + bob + (v.nudge?.ny ?? 0) * nd);
    let alpha = 1;
    if (!ridden && v.def.kind === "jetski" && v.leftFrom) {
      const t = now - v.leftAt - JET_RETURN_MS;
      alpha = t <= 0 ? 1 : t < JET_FADE_MS ? 1 - t / JET_FADE_MS : t < JET_FADE_MS * 2 ? (t - JET_FADE_MS) / JET_FADE_MS : 1;
    }
    let lift = 0;
    if (v.def.kind === "tube") {
      // 탄 사람 크기(바베큐로 커진 것 포함)에 맞춰 고리도 커져요
      const big = ridden ? this.riderBig(v, rider) : 1;
      v.body.setPosition(x, y).setDepth(ridden ? v.y - 1 : v.y).setAlpha(alpha).setScale(big);
      if (ridden) v.body.setCrop(0, 0, Art.TUBE_W, Art.TUBE_CY);
      else v.body.setCrop();
      v.front?.setVisible(ridden).setPosition(x, y).setDepth(v.y + 3).setScale(big);
      lift = TUBE_SINK * big + bob;
    } else {
      const side = v.dir === DIR.left || v.dir === DIR.right;
      const key = T.jetski(side ? "side" : v.dir === DIR.up ? "back" : "front", v.def.n);
      if (v.body.texture.key !== key) v.body.setTexture(key);
      v.body.setFlipX(v.dir === DIR.left).setPosition(x, y + 5).setDepth(v.y).setAlpha(alpha);
      // 앞 덮개: 몸통 아래쪽 줄(옆 8줄 · 앞뒤 8줄)만 탄 사람 앞에 한 번 더 — 앉은 사람 다리가 가려요
      if (v.front) {
        const fw = side ? Art.JET_SIDE_W : Art.JET_FB_W;
        const fh = side ? Art.JET_SIDE_H : Art.JET_FB_H;
        if (v.front.texture.key !== key) v.front.setTexture(key);
        v.front.setVisible(ridden).setFlipX(v.dir === DIR.left).setPosition(x, y + 5).setCrop(0, fh - 8, fw, 8).setDepth(v.y + 3).setAlpha(alpha);
      }
      // 달릴 때 살짝 앞으로 (들썩)
      lift = JET_LIFT + bob + (v.speed > 30 && !this.host.reduced ? Math.sin(wall / 70) * 0.6 : 0);
    }
    this.syncBlock(v, x, y);
    // 11/16 r14 사용자: 튜브에선 머리(와 어깨)만 고리 위로 — 헤엄 자세 그림으로 몸을 물에 담가요 (뒤 고리 < 사람 < 앞 고리)
    const ride = { ox: 0, lift: Math.round(lift), depth: v.y + 1, alt: v.def.kind === "tube" ? ("swim" as const) : ("sitChair" as const) };
    if (v.owner === -1) this.host.player().view.ride = ride;
    else if (rider) rider.view.ride = ride;
  }

  /** 탄 사람 몸 크기 배율 (바베큐로 커진 것) */
  private riderBig(v: View, rider: RemoteAvatar | null): number {
    const view = v.owner === -1 ? this.host.player().view : rider?.view;
    return view ? Math.max(1, view.bigScale) : 1;
  }

  /** 부딪히는 몸을 그림 자리·방향에 맞춰요 (바뀔 때만 — 마을 배 hull과 같은 방식) */
  private syncBlock(v: View, x: number, y: number): void {
    const b = rideBox(v.def.kind, v.dir, x, y);
    const key = `${b.x},${b.y},${b.w},${b.h}`;
    if (key === v.blockKey) return;
    v.blockKey = key;
    v.block.setPosition(b.x, b.y).setSize(b.w, b.h);
    (v.block.body as Phaser.Physics.Arcade.StaticBody | null)?.updateFromGameObject();
  }

  /** 움직이는 놀거리 뒤 물살 자국 (제트스키는 촘촘히 + 물보라) */
  private trail(v: View, now: number): void {
    const jet = v.def.kind === "jetski";
    const fast = v.speed > (jet ? 14 : 6);
    if (!fast || now < v.wakeAt) return;
    v.wakeAt = now + (jet ? (this.host.reduced ? 160 : 70) : 300);
    const back = v.dir === DIR.left ? { dx: 14, dy: 0 } : v.dir === DIR.right ? { dx: -14, dy: 0 } : v.dir === DIR.up ? { dx: 0, dy: 8 } : { dx: 0, dy: -4 };
    const w = this.wakes[this.wakeNext];
    this.wakeNext = (this.wakeNext + 1) % this.wakes.length;
    const s = this.host.scene;
    s.tweens.killTweensOf(w);
    const k = jet ? Math.min(1, v.speed / SEA_JETSKI_SPEED) : Math.min(1, v.speed / SEA_TUBE_SPEED) * 0.5;
    w.setPosition(v.x + (jet ? back.dx : 0), v.y + (jet ? back.dy : 3))
      .setDepth(v.y - 2)
      .setVisible(true)
      .setAlpha(0.55 + 0.35 * k)
      .setScale(jet ? 1 : 0.8, jet ? 1 : 0.7);
    s.tweens.add({ targets: w, alpha: 0, scaleX: jet ? 2.6 : 1.8, scaleY: jet ? 1.6 : 1.2, duration: jet ? 1100 : 900, onComplete: () => w.setVisible(false) });
    // 제트스키 물보라 (빠를 때 뒤로 튀어요)
    if (jet && !this.host.reduced && v.speed > 50 && now >= v.sprayAt) {
      v.sprayAt = now + 220;
      this.host.splash(v.x + back.dx * 1.2, v.y + back.dy);
    }
  }

  destroy(): void {
    this.dismount();
    for (const r of this.riders) r.view.ride = null;
    this.riders.clear();
    for (const v of this.views) {
      v.body.destroy();
      v.front?.destroy();
    }
    this.views.length = 0;
    for (const w of this.wakes) w.destroy();
    this.blockCollider.destroy();
    this.blocks.destroy(true);
    this.wakes.length = 0;
    this.sound.destroy();
    this.engine.destroy();
  }
}

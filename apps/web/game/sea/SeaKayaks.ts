import * as Phaser from "phaser";
import { DIR, SEA_HEIGHT, SEA_KAYAK_DOCK, SEA_KAYAKS, SEA_WIDTH, seaKayakDismount, seaKayakSeatById, seaKayakWater, tideLineY, type DirId, type Sid } from "@tomb/protocol";
import { BIG_RIDE_TOAST, myBig } from "../camp/foodState";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { hullBlocks } from "../logic/boat";
import { Bounce, knockMove, nudgeAmp, nudgeOffset, resolveHulls, SHIP_GAIN, strongerGain, touchContact } from "../logic/bounce";
import type { MoveInput } from "../logic/movement";
import { RideSound } from "../world/RideSound";
import * as Art from "./seaArt";
import { kayakBox, kayakSeatOffset, stepKayak, type RideMotion } from "./seaRideLogic";
import { kayakReturnWater, planRideReturn, returnPoseAt, type ReturnPlan } from "./seaRideReturn";
import { remoteTouch, type SeaHull, type SeaRideHost } from "./SeaRides";

// 11/16 r18 사용자: 카약 선착장 2인승 카약 셋. 마을 2인승 조각배와 같은 흐름 (서버 좌석 두 자리 — 같은 카약 = 같은 가구).
//  - 앞 자리(0) = 먼저 탄 사람이 조종 (방향키), 뒤 자리(1) = 같이 탄 사람 (조종은 못 하고 같이 저어요).
//    조종하던 사람이 내리면 같이 탄 사람이 앞으로 옮겨 앉아 이어 저어요 (물가에 닿아 있으면 같이 내려요)
//  - 같이 타기: 선착장·옆에서 E. 서버는 노 젓는 사람 곁이면 바다 위에서도 받아요 (protocol 2인승 규칙)
//  - 속도 36px/s (튜브와 조각배 사이). 얕은 물도 다니지만 마른 갯벌·모래는 못 가요 — 모래에 대면 둘 다 내려요.
//    데크·바위·매어 둔 제트스키에 부딪혀요. 아무도 안 저으면 튜브처럼 물결 따라 떠다녀요
//  - 내리기: 카약 선착장 가까이에서 E (데크 위에 서요), 또는 모래에 대기. 빈 카약은 천천히 매어 둔 자리로 돌아가요
//  - 다른 사람 카약은 그 사람 아바타(보간 위치·방향)로 그려요. 노 젓는 모습은 둘 다 같은 시계로 저어요

type View = {
  n: number;
  moor: { x: number; y: number };
  body: Phaser.GameObjects.Image;
  paddles: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  /** 자리마다 앞 덮개 (카약 몸통 일부를 탄 사람 앞에 한 번 더 — 앉은 다리가 몸통 안에 가려요) */
  covers: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  x: number;
  y: number;
  dir: DirId;
  /** 자리 0·1에 탄 사람 (-1 = 나, null = 비었음) */
  seat: [Sid | -1 | null, Sid | -1 | null];
  leftFrom: { x: number; y: number } | null;
  leftAt: number;
  /** 11/17 빈 카약이 물 위로만 돌아가는 길 (for = 이 길을 만든 leftFrom) · 물결에 사라지는 정도 */
  ret: { plan: ReturnPlan; for: { x: number; y: number }; fx: number } | null;
  fade: number;
  speed: number;
  lastX: number;
  lastY: number;
  wakeAt: number;
  block: Phaser.GameObjects.Zone;
  blockKey: string;
  passUntil: number;
  /** 11/16 r19 지금 속도 (px/s — 다른 사람이 젓는 카약을 받을 때 서로 다가간 만큼) */
  vx: number;
  vy: number;
  /** 11/16 r19 받혀 살짝 밀린 쪽 · 세기 · 때 (빈 카약 그림만) */
  nudge: { nx: number; ny: number; amp: number; at: number } | null;
};

/** 타는 거리 (선착장 위에서 · 옆에서) · 선착장에서 내리는 거리 */
const BOARD_REACH = 30;
const DOCK_REACH = 34;
/** 노 젓는 모습 (한 번 젓는 시간) */
const STROKE_MS = 560;
/** 탄 사람이 앉는 깊이 (카약 안에 낮게) */
const SIT_LIFT = -1;

export class SeaKayaks {
  private readonly views: View[] = [];
  private readonly wakes: Phaser.GameObjects.Image[] = [];
  private wakeNext = 0;
  private readonly sound = new RideSound();
  private motion: RideMotion = { x: 0, y: 0, vx: 0, vy: 0, dir: DIR.right };
  private bumpAt = -Infinity;
  /** 11/16 r19 내가 노 젓는 카약이 부딪혀 튕기는 중 */
  private readonly bounce = new Bounce();
  private strokeAt = 0;
  private riders = new Set<RemoteAvatar>();
  private readonly blocks: Phaser.Physics.Arcade.StaticGroup;
  private readonly blockCollider: Phaser.Physics.Arcade.Collider;

  constructor(private readonly host: SeaRideHost) {
    const s = host.scene;
    const T = Art.SEA_TEX;
    this.blocks = s.physics.add.staticGroup();
    SEA_KAYAKS.forEach((p, n) => {
      const body = s.add.image(p.x, p.y, T.kayak("side", n)).setOrigin(0.5, 0.5);
      const paddles: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] = [s.add.image(0, 0, T.paddle).setVisible(false), s.add.image(0, 0, T.paddle).setVisible(false)];
      const covers: [Phaser.GameObjects.Image, Phaser.GameObjects.Image] = [s.add.image(0, 0, T.kayak("side", n)).setVisible(false), s.add.image(0, 0, T.kayak("side", n)).setVisible(false)];
      const block = s.add.zone(p.x, p.y, 1, 1).setOrigin(0, 0);
      block.removeFromDisplayList();
      this.blocks.add(block);
      this.views.push({ n, moor: p, body, paddles, covers, x: p.x, y: p.y, dir: DIR.right, seat: [null, null], leftFrom: null, leftAt: 0, ret: null, fade: 1, speed: 0, lastX: p.x, lastY: p.y, wakeAt: 0, block, blockKey: "", passUntil: 0, vx: 0, vy: 0, nudge: null });
    });
    for (let i = 0; i < (host.reduced ? 8 : 24); i++) this.wakes.push(s.add.image(0, 0, T.wake).setVisible(false));
    // 헤엄치는 사람은 카약에 부딪혀요 (마을 배 hullBlocks와 같은 규칙 — 내 카약·막 내린 카약은 빼요)
    this.blockCollider = s.physics.add.collider(host.player().sprite, this.blocks, (_a, b) => this.swimBump(b as Phaser.GameObjects.Zone), (_a, b) => {
      const v = this.views.find((w) => w.block === b);
      return !!v && v.seat[0] !== -1 && v.seat[1] !== -1 && s.time.now >= v.passUntil && v.fade >= 0.5 && hullBlocks(host.player(), true);
    });
  }

  /** 지금 카약을 타고 있는지 (공용 "타는 중" 검사) */
  get isRiding(): boolean {
    return this.mine() !== null;
  }

  private mine(): { v: View; k: 0 | 1 } | null {
    const id = this.host.player().boatSeatId;
    const q = id ? seaKayakSeatById(id) : undefined;
    return q ? { v: this.views[q.n], k: q.k } : null;
  }

  private seatOwner(n: number, k: 0 | 1): Sid | -1 | null {
    const id = `pK${n + 1}-${k}`;
    if (this.host.player().boatSeatId === id) return -1;
    const sid = this.host.seats().get(id);
    if (sid === undefined) return null;
    // 11/17 방금 내렸는데 서버 좌석표가 아직 나로 남아 있으면 빈 자리로 (SeaRides.ownerOf와 같은 까닭)
    return sid === this.host.mySid() ? null : sid;
  }

  // ── 타기·내리기 ──

  private candidate(): { v: View; k: 0 | 1 } | null {
    const pl = this.host.player();
    if (pl.inBoat || pl.sitting || pl.anchored || pl.airborne) return null;
    let best: { v: View; k: 0 | 1 } | null = null;
    let bd = Infinity;
    for (const v of this.views) {
      const d = Math.hypot(v.x - pl.x, v.y - pl.y);
      // 11/17 물결에 사라진 동안엔 못 타요
      if (d > BOARD_REACH + 8 || d >= bd || v.fade < 0.5) continue;
      const k: 0 | 1 | null = v.seat[0] === null && v.seat[1] === null ? 0 : v.seat[1] === null && v.seat[0] !== null ? 1 : null;
      if (k === null) continue;
      best = { v, k };
      bd = d;
    }
    return best;
  }

  hint(prefix: string): { x: number; y: number; text: string } | null {
    const m = this.mine();
    if (m) return this.nearDock(m.v) ? { x: m.v.x, y: m.v.y + 12, text: `${prefix}내리기` } : null;
    const c = this.candidate();
    if (!c) return null;
    return { x: c.v.x, y: c.v.y + 12, text: `${prefix}${c.k === 0 ? "카약 타기" : "카약 같이 타기"}` };
  }

  private nearDock(v: View): boolean {
    const D = SEA_KAYAK_DOCK;
    return v.x > D.x - DOCK_REACH && v.x < D.x + D.w + DOCK_REACH && v.y > D.y && v.y < D.y + D.h + DOCK_REACH + 12;
  }

  interact(): boolean {
    const m = this.mine();
    if (m) {
      if (this.nearDock(m.v)) this.leave(m.v, seaKayakDismount({ x: m.v.x, y: m.v.y }));
      else this.host.toast("카약은 카약 선착장이나 모래에 대면 내려요");
      return true;
    }
    const c = this.candidate();
    if (!c) return false;
    this.board(c.v, c.k);
    return true;
  }

  private seatPos(v: View, k: 0 | 1): { x: number; y: number } {
    const o = kayakSeatOffset(v.dir, k);
    return { x: v.x + o.dx, y: v.y + o.dy };
  }

  private board(v: View, k: 0 | 1): void {
    const h = this.host;
    if (myBig() > 1) {
      h.toast(BIG_RIDE_TOAST);
      return;
    }
    if (!h.beforeBoard()) return;
    const pl = h.player();
    const now = h.scene.time.now;
    const at = this.seatPos(v, k);
    pl.board(`pK${v.n + 1}-${k}`, at.x, at.y, v.dir, now, null);
    v.seat[k] = -1;
    v.leftFrom = null;
    v.ret = null;
    v.fade = 1;
    if (k === 0) {
      this.motion = { x: v.x, y: v.y, vx: 0, vy: 0, dir: v.dir };
      this.bounce.reset();
    }
    if (h.online()) h.sit(`pK${v.n + 1}-${k}`);
    this.sound.play("boat-board", 0.55, 1.05);
    if (!h.reduced) h.splash(v.x, v.y + 2);
  }

  private leave(v: View, to: { x: number; y: number }, toast?: string): void {
    const h = this.host;
    const pl = h.player();
    const m = this.mine();
    if (m) v.seat[m.k] = null;
    if (v.seat[0] === null && v.seat[1] === null) {
      v.leftFrom = { x: v.x, y: v.y };
      v.leftAt = h.scene.time.now;
    }
    v.passUntil = h.scene.time.now + 2000;
    pl.leaveBoat(Math.round(to.x), Math.round(to.y), h.scene.time.now);
    pl.view.ride = null;
    if (h.online()) h.stand();
    if (toast) h.toast(toast);
    this.sound.play("boat-board", 0.4, 1.1);
  }

  onSeat(seatId: string, sid: Sid | null): void {
    const m = this.mine();
    if (!m || sid === null || sid === this.host.mySid()) return;
    if (seatId === `pK${m.v.n + 1}-${m.k}`) this.leave(m.v, this.safeSpot(m.v), "누가 먼저 탔어요");
  }

  onSeatDenied(seatId: string): boolean {
    const m = this.mine();
    if (!m || seatId !== `pK${m.v.n + 1}-${m.k}`) return false;
    this.leave(m.v, this.safeSpot(m.v), "카약에 탈 수 없었어요. 다시 눌러 주세요");
    return true;
  }

  /** 자리를 놓쳤을 때: 선착장 가까우면 데크, 아니면 그 자리 (물이면 헤엄) */
  private safeSpot(v: View): { x: number; y: number } {
    return this.nearDock(v) ? seaKayakDismount({ x: v.x, y: v.y }) : { x: v.x, y: v.y };
  }

  dismount(): void {
    const m = this.mine();
    if (m) this.leave(m.v, this.safeSpot(m.v));
  }

  // ── 매 프레임 ──

  /** 노 젓는 사람이면 방향키로, 같이 탄 사람이면 노 젓는 사람을 따라가요 */
  steer(move: MoveInput, dtMs: number): void {
    const m = this.mine();
    if (!m) return;
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const v = m.v;
    const level = h.tide();
    if (m.k === 0) {
      // 11/16 r19 부딪혀 튕긴 직후엔 노가 잠깐 덜 먹어요
      const ctrl = this.bounce.control(now);
      const r = stepKayak(this.motion, { ax: move.ax * ctrl, ay: move.ay * ctrl }, dtMs, level, Date.now(), v.n * 2.3);
      if (r.land) {
        // 모래에 댔어요 → 내려요 (같이 탄 사람도 자기 화면에서 따라 내려요)
        this.leave(v, r.land);
        return;
      }
      if (r.bumped && now - this.bumpAt > 600) {
        this.bumpAt = now;
        this.sound.thump(0.4, 1.1);
      }
      if (Math.hypot(move.ax, move.ay) > 0.2 && now >= this.strokeAt) {
        this.strokeAt = now + STROKE_MS;
        this.sound.play("row", 0.4, 1.05 + Math.random() * 0.1);
      }
      this.collide(v, now, dtMs, level);
      v.x = this.motion.x;
      v.y = this.motion.y;
      v.dir = this.motion.dir;
    } else {
      // 같이 탄 사람: 노 젓는 사람이 내렸으면 — 물가면 같이 내리고, 아니면 뒤 자리로 옮겨 앉아 이어 저어요
      const drv = this.seatOwner(v.n, 0);
      if (drv === null) {
        const dry = !seaKayakWater(v.x, v.y - 8, level) || v.y < tideLineY(level) + 18;
        if (dry || this.nearDock(v)) {
          this.leave(v, this.nearDock(v) ? seaKayakDismount({ x: v.x, y: v.y }) : { x: v.x, y: Math.round(Math.min(v.y, tideLineY(level)) - 6) });
          return;
        }
        pl.boardSlide(`pK${v.n + 1}-0`, this.seatPos(v, 0).x, this.seatPos(v, 0).y);
        v.seat[0] = -1;
        v.seat[1] = null;
        this.motion = { x: v.x, y: v.y, vx: 0, vy: 0, dir: v.dir };
        if (h.online()) h.sit(`pK${v.n + 1}-0`);
        return;
      }
    }
    const at = this.seatPos(v, m.k);
    pl.boatTo(Math.round(at.x * 10) / 10, Math.round(at.y * 10) / 10, v.dir, now);
  }

  /** 11/16 r19 다른 카약·튜브·제트스키에 닿으면 튕겨 나가요 (밀려나는 길은 카약이 뜨는 물만 — 데크·바위·모래로는 안 밀어요) */
  private collide(v: View, now: number, dtMs: number, level: number): void {
    const h = this.host;
    const m = this.motion;
    const ok = (x: number, y: number) => seaKayakWater(x, y, level);
    knockMove(m, this.bounce.take(dtMs), ok, this.bounce);
    const others = h.hulls().filter((o) => o.id !== `pK${v.n + 1}`);
    const hit = resolveHulls(m, (x, y) => kayakBox(m.dir, x, y), others.map((o) => o.box), ok, {
      gentle: (i) => !others[i].ship,
      vel: (i) => ({ vx: others[i].vx ?? 0, vy: others[i].vy ?? 0 }),
    });
    if (!hit) {
      // 다른 사람이 가까이 닿았어요 (그쪽 화면에선 이미 튕겨 나갔어요) → 나도 튕겨요
      const t = remoteTouch(kayakBox(m.dir, m.x, m.y), m, others);
      if (t && this.bounce.hit(now, t.contact, "kayak", t.rvx, t.rvy, { gain: strongerGain("kayak", t.o.kind) }) > 0) {
        this.sound.thump(0.45, 1.1);
        if (!h.reduced) h.splash(m.x - t.contact.nx * 14, m.y - t.contact.ny * 4);
      }
      return;
    }
    const o = others[hit.index];
    // 서로 다가간 만큼 (움직이는 배·다른 사람이 탄 것·헤엄치는 사람), 더 센 쪽 세기로
    const rvx = hit.vx - (o.vx ?? 0);
    const rvy = hit.vy - (o.vy ?? 0);
    const sp = o.ship
      ? this.bounce.hit(now, hit.contact, "kayak", rvx, rvy, { gain: SHIP_GAIN[o.ship.heavy], minInto: 0 })
      : this.bounce.hit(now, hit.contact, "kayak", rvx, rvy, { gain: strongerGain("kayak", o.kind) });
    if (sp <= 0) return;
    this.sound.thump(0.45, 1.1);
    if (o.ship) h.shipHit(o.ship.heavy, m.x - hit.contact.nx * 14, m.y - hit.contact.ny * 4);
    else if (!h.reduced) h.splash(m.x - hit.contact.nx * 14, m.y - hit.contact.ny * 4);
    if (o.empty) h.nudge(o.id, -hit.contact.nx, -hit.contact.ny, nudgeAmp(sp));
  }

  /** 11/16 r19 헤엄치다 카약에 부딪혔어요 (물리 충돌 콜백): 살짝 튕겨 나가고, 빈 카약은 살짝 밀려요 */
  private swimBump(zone: Phaser.GameObjects.Zone): void {
    const v = this.views.find((w) => w.block === zone);
    const pl = this.host.player();
    const zb = zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!v || !zb) return;
    const now = this.host.scene.time.now;
    const c = touchContact({ x: pl.body.x, y: pl.body.y, w: pl.body.width, h: pl.body.height }, { x: zb.x, y: zb.y, w: zb.width, h: zb.height });
    if (!c) return;
    // 11/16 r19 다른 사람이 젓는 카약이 나를 받아도 튕겨요 (카약 속도만큼)
    const sp = pl.knock(c, now, "swim", { rvx: v.vx, rvy: v.vy, gain: strongerGain("swim", "kayak") });
    if (sp <= 0) return;
    this.sound.thump(0.22, 1.3);
    if (!this.host.reduced) this.host.splash(pl.x - c.nx * 5, pl.y - c.ny * 3);
    if (v.seat[0] === null && v.seat[1] === null) this.nudge(`pK${v.n + 1}`, -c.nx, -c.ny, nudgeAmp(sp));
  }

  /** 11/16 r19 카약 몸 상자들 (부딪혀 튕기기) */
  hullBoxes(): SeaHull[] {
    // 11/17 물결에 사라진 동안엔 부딪히지 않아요
    return this.views.filter((v) => v.fade >= 0.5).map((v) => {
      const remote = (v.seat[0] !== null && v.seat[0] !== -1) || (v.seat[1] !== null && v.seat[1] !== -1);
      return { id: `pK${v.n + 1}`, box: kayakBox(v.dir, Math.round(v.x), Math.round(v.y)), empty: v.seat[0] === null && v.seat[1] === null, vx: v.vx, vy: v.vy, kind: "kayak" as const, ...(remote ? { remote: true } : {}) };
    });
  }

  /** 받힌 빈 카약을 살짝 밀어요 (그림만 — 곧 제자리) */
  nudge(id: string, nx: number, ny: number, amp: number): void {
    const v = this.views.find((w) => `pK${w.n + 1}` === id);
    if (v && v.seat[0] === null && v.seat[1] === null) v.nudge = { nx, ny, amp, at: this.host.scene.time.now };
  }

  update(dtMs: number): void {
    const h = this.host;
    const now = h.scene.time.now;
    const wall = Date.now();
    const remotes = h.remotes();
    const seen = new Set<RemoteAvatar>();
    for (const v of this.views) {
      const before: [Sid | -1 | null, Sid | -1 | null] = [v.seat[0], v.seat[1]];
      v.seat = [this.seatOwner(v.n, 0), this.seatOwner(v.n, 1)];
      const empty = v.seat[0] === null && v.seat[1] === null;
      if (empty && (before[0] !== null || before[1] !== null) && !v.leftFrom) {
        v.leftFrom = { x: v.x, y: v.y };
        v.leftAt = now;
      }
      // 카약 가운데: 노 젓는 사람(뒤)에게서, 없으면 같이 탄 사람(앞)에게서 거꾸로
      const drv = v.seat[0];
      const pas = v.seat[1];
      const ref = drv !== null ? { who: drv, k: 0 as const } : pas !== null ? { who: pas, k: 1 as const } : null;
      if (ref && ref.who !== -1) {
        const r = remotes.get(ref.who);
        if (r) {
          v.dir = r.view.dir;
          const o = kayakSeatOffset(v.dir, ref.k);
          v.x = r.x - o.dx;
          v.y = r.y - o.dy;
        }
      } else if (ref && ref.who === -1 && ref.k === 1 && drv === null) {
        // 나 혼자 앞자리 (곧 뒤로 옮겨요) — 그대로
      } else if (!ref) {
        // 빈 카약: 내린 자리에서 매어 둔 자리로 천천히. 11/17 사용자 버그 "다리 위를 지나 돌아가요" → 물 위로만 찾은 길로 (seaRideReturn),
        // 길이 없거나 너무 멀면 물결과 함께 사라졌다 선착장 앞에 나타나요
        if (v.leftFrom) this.returnHome(v, now);
        else {
          v.x = v.moor.x;
          v.y = v.moor.y;
          v.dir = DIR.right;
          v.fade = 1;
        }
      }
      const dt = Math.max(1, dtMs);
      const inst = (Math.hypot(v.x - v.lastX, v.y - v.lastY) / dt) * 1000;
      v.speed = inst > 300 ? v.speed : v.speed + (inst - v.speed) * Math.min(1, dt / 160);
      if (inst <= 300) {
        const kk = Math.min(1, dt / 120);
        v.vx += (((v.x - v.lastX) / dt) * 1000 - v.vx) * kk;
        v.vy += (((v.y - v.lastY) / dt) * 1000 - v.vy) * kk;
      }
      v.lastX = v.x;
      v.lastY = v.y;
      this.draw(v, now, wall, seen, remotes);
      if (!empty) this.trail(v, now);
    }
    for (const r of this.riders) if (!seen.has(r)) r.view.ride = null;
    this.riders = seen;
  }

  private returnHome(v: View, now: number): void {
    const from = v.leftFrom!;
    if (v.ret?.for !== from) v.ret = { plan: planRideReturn(from, v.moor, kayakReturnWater(this.host.tide()), SEA_WIDTH, SEA_HEIGHT), for: from, fx: 0 };
    const p = returnPoseAt(v.ret.plan, from, v.moor, now - v.leftAt, v.dir);
    v.x = p.x;
    v.y = p.y;
    if (p.dir !== null) v.dir = p.dir;
    v.fade = p.alpha;
    // 사라지기 시작할 때 · 다시 나타날 때 물결 한 번씩
    if (v.ret.plan.kind === "fade" && !this.host.reduced) {
      if (p.at === "from" && v.ret.fx === 0) {
        v.ret.fx = 1;
        this.host.splash(v.x, v.y + 2);
      } else if (p.at === "to" && v.ret.fx < 2 && p.alpha > 0) {
        v.ret.fx = 2;
        this.host.splash(v.x, v.y + 2);
      }
    }
    if (p.done) {
      v.leftFrom = null;
      v.ret = null;
      v.dir = DIR.right;
      v.fade = 1;
    }
  }

  private draw(v: View, now: number, wall: number, seen: Set<RemoteAvatar>, remotes: ReadonlyMap<Sid, RemoteAvatar>): void {
    const T = Art.SEA_TEX;
    const side = v.dir === DIR.left || v.dir === DIR.right;
    const key = T.kayak(side ? "side" : "vert", v.n);
    if (v.body.texture.key !== key) v.body.setTexture(key);
    // 11/16 r19 배가 가까이 지나가면 물결에 더 흔들려요
    const wk = this.host.reduced ? 0 : this.host.wake(v.x, v.y);
    const bob = this.host.reduced ? 0 : Math.sin(wall / 700 + v.n * 1.7) * 0.7 + wk * 2 * Math.sin(wall / 190 + v.n);
    // 11/16 r19 받힌 빈 카약은 살짝 밀렸다 돌아와요
    const empty = v.seat[0] === null && v.seat[1] === null;
    const nd = v.nudge && empty ? nudgeOffset(v.nudge.amp, now - v.nudge.at) : 0;
    if (v.nudge && now - v.nudge.at > 1000) v.nudge = null;
    const x = Math.round(v.x + (v.nudge?.nx ?? 0) * nd);
    const y = Math.round(v.y + bob + (v.nudge?.ny ?? 0) * nd);
    v.body.setPosition(x, y).setFlipX(v.dir === DIR.left).setFlipY(v.dir === DIR.up).setDepth(v.y - 2).setAlpha(empty ? v.fade : 1);
    this.syncBlock(v, x, y, side);
    // 탄 사람 · 노 (둘 다 같은 시계로 저어요 — 움직일 때만)
    const rowing = v.speed > 6 && !this.host.reduced;
    const ph = Math.sin((wall / STROKE_MS) * Math.PI);
    ([0, 1] as const).forEach((k) => {
      const who = v.seat[k];
      const p = v.paddles[k];
      if (who === null) {
        p.setVisible(false);
        v.covers[k].setVisible(false);
        return;
      }
      const at = this.seatPos(v, k);
      // r18 사용자: 앉은 자세(다리는 몸통 안), 덮개가 다리를 가려요
      const ride = { ox: 0, lift: SIT_LIFT, depth: v.y + 1 + k, alt: "sitGround" as const };
      const cv = v.covers[k];
      if (cv.texture.key !== key) cv.setTexture(key);
      if (side) cv.setCrop(0, 6, Art.KAYAK_SIDE_W, Art.KAYAK_SIDE_H - 6).setPosition(x, y).setFlipX(v.dir === DIR.left).setFlipY(false);
      else {
        // 세로 카약: 그 자리 구멍 바로 앞(가는 쪽) 몸통 한 토막
        // 그림의 아래 구멍(29)이 뱃머리 쪽 — 위로 갈 땐 뒤집어 그려서 자리 0(앞)은 늘 29번 줄
        const cy = k === 0 ? 29 : 13;
        cv.setCrop(0, cy + 1, Art.KAYAK_VERT_W, 8).setPosition(x, y).setFlipX(false).setFlipY(v.dir === DIR.up);
      }
      cv.setVisible(true).setDepth(v.y + 2.5 + k);
      if (who === -1) this.host.player().view.ride = ride;
      else {
        const r = remotes.get(who);
        if (r) {
          r.view.ride = ride;
          seen.add(r);
        }
      }
      const tilt = rowing ? ph * 0.55 : 0.15;
      p.setVisible(true)
        .setPosition(Math.round(at.x), Math.round(at.y - 4))
        .setRotation(side ? tilt : Math.PI / 2 + tilt)
        .setDepth(v.y + 3 + k);
    });
  }

  private syncBlock(v: View, x: number, y: number, side: boolean): void {
    const b = kayakBox(side ? DIR.right : DIR.down, x, y);
    const key = `${b.x},${b.y},${b.w}`;
    if (key === v.blockKey) return;
    v.blockKey = key;
    v.block.setPosition(b.x, b.y).setSize(b.w, b.h);
    (v.block.body as Phaser.Physics.Arcade.StaticBody | null)?.updateFromGameObject();
  }

  private trail(v: View, now: number): void {
    if (v.speed < 8 || now < v.wakeAt) return;
    v.wakeAt = now + 240;
    const w = this.wakes[this.wakeNext];
    this.wakeNext = (this.wakeNext + 1) % this.wakes.length;
    const back = kayakSeatOffset(v.dir, 0);
    const s = this.host.scene;
    s.tweens.killTweensOf(w);
    w.setPosition(v.x + back.dx * 2.2, v.y + back.dy * 2.2 + 2).setDepth(v.y - 3).setVisible(true).setAlpha(0.5).setScale(0.9, 0.7);
    s.tweens.add({ targets: w, alpha: 0, scaleX: 1.8, scaleY: 1.1, duration: 900, onComplete: () => w.setVisible(false) });
  }

  destroy(): void {
    this.dismount();
    for (const r of this.riders) r.view.ride = null;
    this.riders.clear();
    for (const v of this.views) {
      v.body.destroy();
      for (const p of v.paddles) p.destroy();
      for (const c of v.covers) c.destroy();
    }
    this.views.length = 0;
    for (const w of this.wakes) w.destroy();
    this.blockCollider.destroy();
    this.blocks.destroy(true);
    this.sound.destroy();
  }
}

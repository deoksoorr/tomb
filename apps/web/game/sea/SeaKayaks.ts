import * as Phaser from "phaser";
import { DIR, SEA_KAYAK_DOCK, SEA_KAYAKS, seaKayakDismount, seaKayakSeatById, seaKayakWater, tideLineY, type DirId, type Sid } from "@tomb/protocol";
import { BIG_RIDE_TOAST, myBig } from "../camp/foodState";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { hullBlocks } from "../logic/boat";
import type { MoveInput } from "../logic/movement";
import { RideSound } from "../world/RideSound";
import * as Art from "./seaArt";
import { kayakSeatOffset, stepKayak, tubeReturnK, type RideMotion } from "./seaRideLogic";
import type { SeaRideHost } from "./SeaRides";

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
  speed: number;
  lastX: number;
  lastY: number;
  wakeAt: number;
  block: Phaser.GameObjects.Zone;
  blockKey: string;
  passUntil: number;
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
      this.views.push({ n, moor: p, body, paddles, covers, x: p.x, y: p.y, dir: DIR.right, seat: [null, null], leftFrom: null, leftAt: 0, speed: 0, lastX: p.x, lastY: p.y, wakeAt: 0, block, blockKey: "", passUntil: 0 });
    });
    for (let i = 0; i < (host.reduced ? 8 : 24); i++) this.wakes.push(s.add.image(0, 0, T.wake).setVisible(false));
    // 헤엄치는 사람은 카약에 부딪혀요 (마을 배 hullBlocks와 같은 규칙 — 내 카약·막 내린 카약은 빼요)
    this.blockCollider = s.physics.add.collider(host.player().sprite, this.blocks, undefined, (_a, b) => {
      const v = this.views.find((w) => w.block === b);
      return !!v && v.seat[0] !== -1 && v.seat[1] !== -1 && s.time.now >= v.passUntil && hullBlocks(host.player(), true);
    });
  }

  /** 11/16 r18 「같이 탈 사람 부르기」를 할 수 있는 카약 (내가 앞자리·뒷자리 빔·선착장 가까이) — 없으면 null */
  shoutable(): string | null {
    const m = this.mine();
    if (!m || m.k !== 0 || m.v.seat[1] !== null || !this.nearDock(m.v)) return null;
    return `pK${m.v.n + 1}`;
  }

  /** 그 카약 옆 선착장 자리 ([같이 타기]로 걸어갈 곳) */
  joinSpot(kayak: string): { x: number; y: number } | null {
    const n = Number(kayak.slice(2)) - 1;
    const v = this.views[n];
    if (!v) return null;
    return seaKayakDismount({ x: v.x, y: v.y });
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
    return sid === this.host.mySid() ? -1 : sid;
  }

  // ── 타기·내리기 ──

  private candidate(): { v: View; k: 0 | 1 } | null {
    const pl = this.host.player();
    if (pl.inBoat || pl.sitting || pl.anchored || pl.airborne) return null;
    let best: { v: View; k: 0 | 1 } | null = null;
    let bd = Infinity;
    for (const v of this.views) {
      const d = Math.hypot(v.x - pl.x, v.y - pl.y);
      if (d > BOARD_REACH + 8 || d >= bd) continue;
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
    if (k === 0) this.motion = { x: v.x, y: v.y, vx: 0, vy: 0, dir: v.dir };
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
      const r = stepKayak(this.motion, move, dtMs, level, Date.now(), v.n * 2.3);
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
        // 빈 카약: 내린 자리에서 매어 둔 자리로 천천히 (튜브처럼)
        if (v.leftFrom) {
          const k = tubeReturnK(Math.hypot(v.moor.x - v.leftFrom.x, v.moor.y - v.leftFrom.y), now - v.leftAt);
          v.x = v.leftFrom.x + (v.moor.x - v.leftFrom.x) * k;
          v.y = v.leftFrom.y + (v.moor.y - v.leftFrom.y) * k;
          if (k >= 1) {
            v.leftFrom = null;
            v.dir = DIR.right;
          }
        } else {
          v.x = v.moor.x;
          v.y = v.moor.y;
          v.dir = DIR.right;
        }
      }
      const dt = Math.max(1, dtMs);
      const inst = (Math.hypot(v.x - v.lastX, v.y - v.lastY) / dt) * 1000;
      v.speed = inst > 300 ? v.speed : v.speed + (inst - v.speed) * Math.min(1, dt / 160);
      v.lastX = v.x;
      v.lastY = v.y;
      this.draw(v, now, wall, seen, remotes);
      if (!empty) this.trail(v, now);
    }
    for (const r of this.riders) if (!seen.has(r)) r.view.ride = null;
    this.riders = seen;
  }

  private draw(v: View, now: number, wall: number, seen: Set<RemoteAvatar>, remotes: ReadonlyMap<Sid, RemoteAvatar>): void {
    const T = Art.SEA_TEX;
    const side = v.dir === DIR.left || v.dir === DIR.right;
    const key = T.kayak(side ? "side" : "vert", v.n);
    if (v.body.texture.key !== key) v.body.setTexture(key);
    const bob = this.host.reduced ? 0 : Math.sin(wall / 700 + v.n * 1.7) * 0.7;
    const x = Math.round(v.x);
    const y = Math.round(v.y + bob);
    v.body.setPosition(x, y).setFlipX(v.dir === DIR.left).setFlipY(v.dir === DIR.up).setDepth(v.y - 2);
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
    const w = side ? 36 : 10;
    const h = side ? 8 : 32;
    const rx = Math.round(x - w / 2);
    const ry = Math.round(y - h / 2);
    const key = `${rx},${ry},${w}`;
    if (key === v.blockKey) return;
    v.blockKey = key;
    v.block.setPosition(rx, ry).setSize(w, h);
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


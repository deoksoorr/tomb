import type * as Phaser from "phaser";
import {
  CAMP_ROWBOAT_SPEED,
  CAMP_ROWBOATS,
  campRowboatDismount,
  campRowboatSeatById,
  campWet,
  DIR,
  type DirId,
  type Sid,
} from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { bridge } from "../bridge";
import { BoatSfx } from "../world/boatSfx";
import { boatFacing, PASSENGER_GRACE_MS, passengerDrop, passengerMoves } from "../logic/boat";
import type { MoveInput } from "../logic/movement";
import { BOAT_FRAMES, BOAT_H, BOAT_TINTS, BOAT_VW, boatGeom, boatSheet, boatVH, boatVSheet, boatW } from "../sprites/rideProps";
import { CAMP_TEX_PREFIX } from "./campTypes";
import { nearRowDock, rowSeatDelta, stepRow } from "./campWater";

// 11/26 윤슬 낚시터 2인 나룻배 셋 (선착장에 매어 둠). 바닷가 카약·마을 2인 조각배와 같은 흐름 (서버 좌석 두 자리 — 같은 배 = 같은 가구, protocol CAMP_ROWBOAT_SEATS):
//  - 앞 자리(0) = 먼저 탄 사람이 노를 젓고(방향키), 뒤 자리(1) = 같이 탄 사람. 노 젓던 사람이 내리면 같이 탄 사람이 옮겨 앉아 이어 저어요 (선착장 가까우면 같이 내려요)
//  - 배는 부표 줄 아래 저수지에서만 다녀요 (좌대 구역 위로는 못 가요). 선착장 가까이에서 E = 내리기, 물 한가운데서 E = 배 위 낚시 (boat:reservoir → 나룻배 전용 물고기)
//  - 11/26 같이 탄 사람은 E = 낚시, 움직이면(방향키·조이스틱·X·터치 [내리기]) 어디서든 내려요 (선착장 가까우면 선착장, 물 한가운데면 배 옆 물로 — 헤엄).
//    노 젓는 사람은 그대로 저어 가요
//  - 빈 배는 천천히 매어 둔 자리로 돌아가요. 다른 사람 배는 그 사람 아바타(보간 위치·방향)로 그려요

export type CampRowHost = {
  scene: Phaser.Scene;
  reduced: boolean;
  player(): Player;
  remotes(): ReadonlyMap<Sid, RemoteAvatar>;
  seats(): ReadonlyMap<string, Sid>;
  mySid(): Sid | null;
  online(): boolean;
  sit(seatId: string): void;
  stand(): void;
  toast(message: string): void;
  splash(x: number, y: number): void;
  /** 타기 전에 (펫에서 내리기·커졌으면 막기). false면 타지 않아요 */
  beforeBoard(): boolean;
  /** 배 위 낚시 시작·그만 (CampForage) */
  fish(at: { x: number; y: number }): void;
  stopFishing(): void;
  fishing(): boolean;
};

type View = {
  n: number;
  moor: { x: number; y: number };
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  x: number;
  y: number;
  dir: DirId;
  seat: [Sid | -1 | null, Sid | -1 | null];
  /** 빈 배가 돌아가기 시작한 자리·때 */
  home: { x: number; y: number; at: number } | null;
  lastX: number;
  lastY: number;
  speed: number;
};

/** 타는 거리 · 선착장에서 내리는 거리 */
const BOARD_REACH = 32;
/** 노 한 번 젓는 시간 (그림 프레임) */
const STROKE_MS = 520;
/** 빈 배가 매어 둔 자리로 돌아가는 속도 (px/s) */
const HOME_SPEED = 18;

const texKey = (n: number, dir: DirId, layer: "back" | "front") => `${CAMP_TEX_PREFIX}row-${n}-${dir}-${layer}`;

export class CampRowboats {
  private readonly views: View[] = [];
  private motion = { x: 0, y: 0, vx: 0, vy: 0 };
  /** 11/26 배 공용 소리 (탈 때·내릴 때·노 — 마을 조각배·카약과 같은 소리, 구경꾼은 놀거리 거리 규칙) */
  private readonly sfx = new BoatSfx();
  /** 지난 프레임에 접속해 있었는지 (접속 직후 자리 목록이 한꺼번에 들어올 때 탈 때 소리를 몰아 내지 않게) */
  private wasOnline = false;
  /** 장면 정리 중 (맵 옮길 때 내리기 소리를 내지 않게) */
  private closing = false;
  private pinned = new Set<RemoteAvatar>();
  /** 터치 [내리기] 버튼 (boat:passenger)에 알린 값 */
  private passengerShown = false;
  /** 마지막으로 탄 때 (scene time) */
  private boardAt = 0;

  /** 11/26 낚시 창이 방향키로 낚시를 거두면 같이 탄 사람은 바로 내린다 */
  private readonly offMoveOff = bridge.on("boat:moveOff", () => void this.passengerOff());

  constructor(private readonly host: CampRowHost) {
    const s = host.scene;
    CAMP_ROWBOATS.forEach((p, n) => {
      this.ensureTextures(n);
      const back = s.add.image(p.x, p.y, texKey(n, DIR.right, "back"), 0);
      const front = s.add.image(p.x, p.y, texKey(n, DIR.right, "front"), 0);
      this.views.push({ n, moor: p, back, front, x: p.x, y: p.y, dir: DIR.right, seat: [null, null], home: null, lastX: p.x, lastY: p.y, speed: 0 });
    });
  }

  private ensureTextures(n: number): void {
    const s = this.host.scene;
    const tint = BOAT_TINTS[n % BOAT_TINTS.length];
    for (const dir of [DIR.down, DIR.left, DIR.right, DIR.up] as DirId[])
      for (const layer of ["back", "front"] as const) {
        const key = texKey(n, dir, layer);
        if (s.textures.exists(key)) continue;
        const side = dir === DIR.left || dir === DIR.right;
        const canvas = side ? boatSheet(2, layer, dir === DIR.left, tint) : boatVSheet(2, layer, dir === DIR.down, tint);
        addCanvasTexture(s, key, { canvas, frameW: side ? boatW(2) : BOAT_VW, frameH: side ? BOAT_H : boatVH(2) });
      }
  }

  /** 지금 나룻배를 타고 있는지 */
  get isRiding(): boolean {
    return this.mine() !== null;
  }

  private mine(): { v: View; k: 0 | 1 } | null {
    const id = this.host.player().boatSeatId;
    const q = id ? campRowboatSeatById(id) : undefined;
    return q ? { v: this.views[q.n], k: q.k } : null;
  }

  private seatOwner(n: number, k: 0 | 1): Sid | -1 | null {
    const id = `qN${n + 1}-${k}`;
    if (this.host.player().boatSeatId === id) return -1;
    const sid = this.host.seats().get(id);
    if (sid === undefined) return null;
    return sid === this.host.mySid() ? null : sid;
  }

  private seatPos(v: View, k: 0 | 1): { x: number; y: number } {
    if (k === 0) return { x: v.x, y: v.y };
    const d = rowSeatDelta(v.dir);
    return { x: v.x + d.dx, y: v.y + d.dy };
  }

  private candidate(): { v: View; k: 0 | 1 } | null {
    const pl = this.host.player();
    if (pl.inBoat || pl.sitting || pl.anchored || pl.airborne) return null;
    let best: { v: View; k: 0 | 1 } | null = null;
    let bd = Infinity;
    for (const v of this.views) {
      const d = Math.hypot(v.x - pl.x, v.y - pl.y);
      if (d > BOARD_REACH || d >= bd) continue;
      const k: 0 | 1 | null = v.seat[0] === null && v.seat[1] === null ? 0 : v.seat[1] === null && v.seat[0] !== null ? 1 : null;
      if (k === null) continue;
      best = { v, k };
      bd = d;
    }
    return best;
  }

  /** E 안내 (타기·같이 타기·내리기·낚시) */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    const m = this.mine();
    if (m) {
      if (nearRowDock(m.v.x, m.v.y)) return { x: m.v.x, y: m.v.y + 14, text: `${prefix}내리기` };
      // 11/26 같이 탄 사람은 E = 낚시, 움직이면(방향키·조이스틱·X) 어디서든 내린다 (운영자 「얻어 타면 납치된다」)
      if (m.k === 1) return { x: m.v.x, y: m.v.y + 14, text: this.host.fishing() ? "이동하면 내려요" : `${prefix}낚시 · 이동하면 내려요` };
      return this.host.fishing() ? null : { x: m.v.x, y: m.v.y + 14, text: `${prefix}배 위에서 낚시하기` };
    }
    const c = this.candidate();
    return c ? { x: c.v.x, y: c.v.y + 14, text: `${prefix}${c.k === 0 ? "나룻배 타기" : "나룻배 같이 타기"}` } : null;
  }

  /** E: 탔으면 내리기·낚시, 아니면 가까운 배에 타기. 한 일이 있으면 true */
  interact(): boolean {
    const m = this.mine();
    if (m) {
      if (nearRowDock(m.v.x, m.v.y)) this.leave(m.v, campRowboatDismount({ x: m.v.x, y: m.v.y }));
      else if (!this.host.fishing()) this.host.fish({ x: Math.round(m.v.x), y: Math.round(m.v.y) });
      return true;
    }
    const c = this.candidate();
    if (!c) return false;
    this.board(c.v, c.k);
    return true;
  }

  /** 맵 상호작용(나룻배 선착장)에서 */
  use(o: { kind: string }): boolean {
    if (o.kind !== "rowboat") return false;
    if (!this.interact()) this.host.toast("빈 나룻배 가까이 가서 타요");
    return true;
  }

  private board(v: View, k: 0 | 1): void {
    const h = this.host;
    if (!h.beforeBoard()) return;
    const pl = h.player();
    const now = h.scene.time.now;
    const at = this.seatPos(v, k);
    pl.board(`qN${v.n + 1}-${k}`, at.x, at.y, v.dir, now, null);
    this.boardAt = now;
    v.seat[k] = -1;
    v.home = null;
    if (k === 0) this.motion = { x: v.x, y: v.y, vx: 0, vy: 0 };
    if (h.online()) h.sit(`qN${v.n + 1}-${k}`);
    this.sfx.board(`row${v.n}`, true, 0, now);
    if (!h.reduced) h.splash(v.x, v.y + 2);
  }

  private leave(v: View, to: { x: number; y: number }, toast?: string): void {
    const h = this.host;
    const pl = h.player();
    const m = this.mine();
    h.stopFishing();
    if (m) v.seat[m.k] = null;
    if (v.seat[0] === null && v.seat[1] === null) v.home = { x: v.x, y: v.y, at: h.scene.time.now };
    pl.leaveBoat(Math.round(to.x), Math.round(to.y), h.scene.time.now);
    if (h.online()) h.stand();
    if (toast) h.toast(toast);
    if (!this.closing) this.sfx.leave(`row${v.n}`, true, 0);
  }

  onSeat(seatId: string, sid: Sid | null): void {
    const m = this.mine();
    if (!m || sid === null || sid === this.host.mySid()) return;
    if (seatId === `qN${m.v.n + 1}-${m.k}`) this.leave(m.v, this.safeSpot(m.v), "누가 먼저 탔어요");
  }

  onSeatDenied(seatId: string): boolean {
    const m = this.mine();
    if (!m || seatId !== `qN${m.v.n + 1}-${m.k}`) return false;
    this.leave(m.v, this.safeSpot(m.v), "나룻배에 탈 수 없었어요. 다시 눌러 주세요");
    return true;
  }

  /** 11/26 같이 탄 사람 내리기 (방향키·조이스틱·X·터치 [내리기]): 선착장 가까우면 선착장, 아니면 배 옆 물로. 같이 탄 사람이 아니면 false */
  passengerOff(): boolean {
    const m = this.mine();
    if (!m || m.k !== 1) return false;
    this.leave(m.v, nearRowDock(m.v.x, m.v.y) ? campRowboatDismount({ x: m.v.x, y: m.v.y }) : this.dropSpot(m.v));
    return true;
  }

  /** 같이 탄 사람이 물 한가운데서 내릴 자리: 배 옆 헤엄칠 물 (저수지는 어디든 헤엄칠 수 있다). 없으면 선착장 */
  private dropSpot(v: View): { x: number; y: number } {
    const me = this.host.player();
    return passengerDrop(me.x, me.y, v.dir, campWet) ?? campRowboatDismount({ x: v.x, y: v.y });
  }

  private safeSpot(v: View): { x: number; y: number } {
    return nearRowDock(v.x, v.y) ? campRowboatDismount({ x: v.x, y: v.y }) : { x: v.x, y: v.y };
  }

  dismount(): void {
    const m = this.mine();
    if (m) this.leave(m.v, this.safeSpot(m.v));
  }

  /**
   * 11/26 새로고침 직전 나룻배에 타고 있었다 (마을 조각배와 같은 규칙 — 씬은 이미 선착장 위에 세웠다):
   *  - 노 젓던 사람이 선착장 가까이 있었으면 그 배에 다시 타요 (자리 판정은 접속 뒤 reclaim)
   *  - 물 한가운데였거나 같이 탄 사람이면 선착장에 선 채로 (배는 매어 둔 자리로 돌아가요)
   */
  resume(seatId: string, x: number, y: number, dir: DirId): void {
    const q = campRowboatSeatById(seatId);
    if (!q) return;
    if (q.k !== 0 || !nearRowDock(x, y)) {
      if (!nearRowDock(x, y)) this.host.toast("나룻배가 선착장으로 돌아갔어요");
      return;
    }
    const v = this.views[q.n];
    v.x = x;
    v.y = y;
    v.dir = dir;
    v.seat[0] = -1;
    v.home = null;
    this.motion = { x, y, vx: 0, vy: 0 };
    this.boardAt = this.host.scene.time.now;
    this.host.player().board(seatId, x, y, dir, this.boardAt, null, false);
  }

  /** 접속(welcome·맵 옮김) 뒤: 타고 있는 나룻배 자리를 서버에 다시 확인해요. 그 사이 남이 탔으면 선착장에 내려요 */
  reclaim(): void {
    const m = this.mine();
    if (!m) return;
    const id = `qN${m.v.n + 1}-${m.k}`;
    const owner = this.host.seats().get(id);
    if (owner === undefined) this.host.sit(id);
    else if (owner !== this.host.mySid()) this.leave(m.v, campRowboatDismount({ x: m.v.x, y: m.v.y }), "그 사이 다른 사람이 그 배에 탔어요");
  }

  /** 노 젓는 사람이면 방향키로, 같이 탄 사람이면 노 젓는 사람을 따라가요 */
  steer(move: MoveInput, dtMs: number): void {
    const m = this.mine();
    if (!m) return;
    const h = this.host;
    const pl = h.player();
    const now = h.scene.time.now;
    const v = m.v;
    if (m.k === 0) {
      const rowing = Math.hypot(move.ax, move.ay) > 0.2;
      // 노를 저으면 낚싯대를 거둬요 (마을 조각배와 같다)
      if (rowing && h.fishing()) h.stopFishing();
      stepRow(this.motion, rowing ? move.ax : 0, rowing ? move.ay : 0, dtMs);
      v.x = this.motion.x;
      v.y = this.motion.y;
      v.dir = boatFacing(v.dir, this.motion.vx, this.motion.vy);
    } else {
      if (passengerMoves(move) && now - this.boardAt >= PASSENGER_GRACE_MS) {
        this.passengerOff();
        return;
      }
      const drv = this.seatOwner(v.n, 0);
      if (drv === null) {
        if (nearRowDock(v.x, v.y)) {
          this.leave(v, campRowboatDismount({ x: v.x, y: v.y }));
          return;
        }
        const at = this.seatPos(v, 0);
        pl.boardSlide(`qN${v.n + 1}-0`, at.x, at.y);
        v.seat[0] = -1;
        v.seat[1] = null;
        this.motion = { x: v.x, y: v.y, vx: 0, vy: 0 };
        if (h.online()) h.sit(`qN${v.n + 1}-0`);
        return;
      }
    }
    const at = this.seatPos(v, m.k);
    pl.boatTo(Math.round(at.x * 10) / 10, Math.round(at.y * 10) / 10, v.dir, now);
  }

  update(dtMs: number): void {
    const h = this.host;
    const passenger = this.mine()?.k === 1;
    if (passenger !== this.passengerShown) {
      this.passengerShown = passenger;
      bridge.emit("boat:passenger", { on: passenger });
    }
    const now = h.scene.time.now;
    const wall = Date.now();
    const remotes = h.remotes();
    const pinned = new Set<RemoteAvatar>();
    const pl = h.player();
    const online = h.online();
    for (const v of this.views) {
      const before = [v.seat[0], v.seat[1]];
      v.seat = [this.seatOwner(v.n, 0), this.seatOwner(v.n, 1)];
      const onBoat = v.seat[0] === -1 || v.seat[1] === -1;
      const ear = Math.hypot(v.x - pl.x, v.y - pl.y);
      // 다른 사람이 타고 내리는 소리 (내 것은 board·leave가 낸다. 자리만 바꿔 앉는 건 소리 없음)
      if (online && this.wasOnline) {
        const was = before.filter((s): s is Sid => s !== null && s !== -1);
        const cur = v.seat.filter((s): s is Sid => s !== null && s !== -1);
        if (cur.some((s) => !was.includes(s))) this.sfx.board(`row${v.n}`, onBoat, ear, now);
        if (was.some((s) => !cur.includes(s))) this.sfx.leave(`row${v.n}`, onBoat, ear);
      }
      const empty = v.seat[0] === null && v.seat[1] === null;
      if (empty && (before[0] !== null || before[1] !== null) && !v.home) v.home = { x: v.x, y: v.y, at: now };
      const ref = v.seat[0] !== null ? { who: v.seat[0], k: 0 as const } : v.seat[1] !== null ? { who: v.seat[1], k: 1 as const } : null;
      if (ref && ref.who !== -1) {
        const r = remotes.get(ref.who);
        if (r) {
          v.dir = r.view.dir as DirId;
          const d = ref.k === 1 ? rowSeatDelta(v.dir) : { dx: 0, dy: 0 };
          v.x = r.x - d.dx;
          v.y = r.y - d.dy;
        }
      } else if (!ref) this.drift(v, now, dtMs);
      // 원격 동승자는 노 젓는 사람 배 자리에 붙여 그려요 (카약과 같다 — 지연된 위치로 배 밖에 처지지 않게)
      if (v.seat[0] !== null && v.seat[1] !== null && v.seat[1] !== -1) {
        const rp = remotes.get(v.seat[1]);
        if (rp) {
          rp.posOverride = this.seatPos(v, 1);
          pinned.add(rp);
        }
      }
      const inst = (Math.hypot(v.x - v.lastX, v.y - v.lastY) / Math.max(1, dtMs)) * 1000;
      v.speed = inst > 300 ? v.speed : v.speed + (inst - v.speed) * Math.min(1, dtMs / 160);
      v.lastX = v.x;
      v.lastY = v.y;
      // 노 젓는 소리: 노 젓는 사람이 있는 배만 (빈 배가 매어 둔 자리로 떠가는 건 조용히), 박자는 배 속도를 따라
      this.sfx.row(`row${v.n}`, now, v.seat[0] !== null ? v.speed : 0, CAMP_ROWBOAT_SPEED, onBoat, ear);
      this.draw(v, wall);
    }
    this.wasOnline = online;
    for (const r of this.pinned) if (!pinned.has(r)) r.posOverride = null;
    this.pinned = pinned;
  }

  /** 빈 배: 내린 자리에서 매어 둔 자리로 천천히 (저수지는 트인 네모라 곧장) */
  private drift(v: View, now: number, dtMs: number): void {
    if (!v.home) {
      v.x = v.moor.x;
      v.y = v.moor.y;
      v.dir = DIR.right;
      return;
    }
    const dx = v.moor.x - v.x;
    const dy = v.moor.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || now - v.home.at > 60_000) {
      v.x = v.moor.x;
      v.y = v.moor.y;
      v.dir = DIR.right;
      v.home = null;
      return;
    }
    const step = Math.min(d, (HOME_SPEED * dtMs) / 1000);
    v.x += (dx / d) * step;
    v.y += (dy / d) * step;
    v.dir = boatFacing(v.dir, (dx / d) * HOME_SPEED, (dy / d) * HOME_SPEED);
  }

  private draw(v: View, wall: number): void {
    const rowing = v.speed > 6 && !this.host.reduced;
    const frame = rowing ? 1 + (Math.floor(wall / (STROKE_MS / 2)) % 2) : 0;
    const geo = boatGeom(2, v.dir);
    const bob = this.host.reduced ? 0 : Math.round(Math.sin(wall / 800 + v.n * 1.9) * 0.6);
    const x = Math.round(v.x);
    const y = Math.round(v.y) + bob;
    for (const [img, layer, depth] of [
      [v.back, "back", v.y - 1],
      [v.front, "front", v.y + 1.5],
    ] as const) {
      const key = texKey(v.n, v.dir, layer);
      if (img.texture.key !== key) img.setTexture(key, Math.min(frame, BOAT_FRAMES - 1));
      else if (img.frame.name !== String(frame)) img.setFrame(Math.min(frame, BOAT_FRAMES - 1));
      img.setOrigin(geo.ax / geo.w, geo.ay / geo.h).setPosition(x, y).setDepth(depth);
    }
  }

  destroy(): void {
    this.offMoveOff();
    this.closing = true;
    this.dismount();
    this.sfx.destroy();
    if (this.passengerShown) bridge.emit("boat:passenger", { on: false });
    for (const r of this.pinned) r.posOverride = null;
    this.pinned.clear();
    for (const v of this.views) {
      v.back.destroy();
      v.front.destroy();
    }
    this.views.length = 0;
  }
}

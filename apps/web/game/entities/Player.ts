import * as Phaser from "phaser";
import { DIR, JUMP_MS, STATE, type DirId, type Seat, type StateName } from "@tomb/protocol";
import { canJump, jumpHeight, shadowScale } from "../logic/jump";
import { emptyMove, faceToward, resolveMove, type MoveInput } from "../logic/movement";
import { standPoint } from "../logic/sit";
import type { NetPose } from "../net/sendThrottle";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { AvatarView, SIT_CHAIR_LIFT } from "./AvatarView";

// 내 캐릭터. 입력은 즉시 로컬에서 반영한다 (서버를 기다리지 않음, 서버 보정도 없음).
// 상태 머신: idle | walk | run | sitGround | sitChair | jump | hang | swing | swim | dive
//  - 앉기: 빈 좌석이 24px 안이면 서버에 점유 요청과 "동시에" 좌석으로 부드럽게 스냅 (지연 숨김),
//          거절되면 원래 자리로 돌아가 바닥 앉기. 좌석이 없으면 그 자리에서 바닥 앉기.
//  - 앉은 채 이동 입력 → 일어선 뒤 이동.
//  - 점프(Space): JUMP_MS 동안 그림만 포물선으로 띄우고(발 위치·물리 바디는 그대로) 뛰기 직전 속도로 계속 간다.
//    공중에 있는 동안 묘비·의자 충돌은 씬이 끄고, 착지하면 onLand로 알린다.
//  - 긴 벤치에 앉은 채 ←/→: 옆 좌석으로 옮겨 앉기 (moveSeat, 서버가 같은 가구 안 이동을 원자적으로 처리)
//  - 매달리기(나무)·그네: 그 자리에 붙어 있고(물리 바디 끔) 이동 입력이 들어오면 내려온다
//  - 해먹: 매달리기·그네처럼 그 자리에 붙어 누워 흔들흔들 (1인 자리)
//  - 물(강·호수) 안: 자동으로 수영, E로 잠수 토글. 물속에서는 느리고 점프·앉기가 안 된다. 강에서는 물살(current)에 살짝 떠내려간다

const BODY_W = 8;
const BODY_H = 5;
const SNAP_MS = 160;
/** 물속 이동 속도 배율 */
export const SWIM_SPEED = 0.6;
export const DIVE_SPEED = 0.45;

export type SeatRequester = {
  sit(seatId: string): void;
  stand(): void;
};

export class Player {
  readonly view: AvatarView;
  readonly body: Phaser.Physics.Arcade.Body;
  state: StateName = "idle";
  dir: DirId = DIR.down;
  /** 앉아 있거나 스냅 중인 좌석 */
  seat: Seat | null = null;
  private preSit: { x: number; y: number } | null = null;
  private snap: Phaser.Tweens.Tween | null = null;
  private readonly move = emptyMove();
  airborne = false;
  private jumpStart = 0;
  private landedAt = -Infinity;
  private jumpVx = 0;
  private jumpVy = 0;
  /** 착지 직후 (묘비에 겹쳐 내렸으면 씬이 밀어낸다) */
  onLand: (() => void) | null = null;
  /** 매달리기·그네·해먹: 붙어 있는 자리 (발 위치) */
  private anchor: { x: number; y: number } | null = null;
  /** 매달리기·그네: 차지한 1인 자리 id (world.ts spotSeatId — 서버가 점유를 판정한다) */
  spotId: string | null = null;
  private diving = false;
  /** 발밑이 물인지 (씬이 넣어 준다) */
  water: ((x: number, y: number) => boolean) | null = null;
  /** 물살 (px/초, 씬이 넣어 준다). 물속에 있는 동안 이동 속도에 더한다 */
  current: ((x: number, y: number) => { vx: number; vy: number }) | null = null;
  /** 옆자리로 옮겨 앉는 중이면 원래 좌석 (서버가 거절하면 되돌아간다) */
  private moveFrom: Seat | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    atlas: GlyphAtlas,
    x: number,
    y: number,
    color: string,
    name: string,
    body = "hood",
  ) {
    this.view = new AvatarView(scene, atlas, x, y, color, name, true, [], body);
    scene.physics.add.existing(this.view.sprite);
    this.body = this.view.sprite.body as Phaser.Physics.Arcade.Body;
    const s = this.view.sprite;
    this.body.setSize(BODY_W, BODY_H, false);
    // 발밑 박스: 원점(발바닥) 기준으로 가운데 정렬
    this.body.setOffset(s.width * s.originX - BODY_W / 2, s.height * s.originY - BODY_H);
    this.body.setCollideWorldBounds(true);
  }

  get sprite(): Phaser.GameObjects.Sprite {
    return this.view.sprite;
  }
  get x(): number {
    return this.view.sprite.x;
  }
  /** 발밑 y (의자에 올려 그린 만큼은 빼고) */
  get y(): number {
    return this.view.sprite.y + (this.state === "sitChair" ? SIT_CHAIR_LIFT : 0);
  }
  get sitting(): boolean {
    return this.state === "sitGround" || this.state === "sitChair";
  }
  /** 나무에 매달리거나 그네를 타거나 해먹에 누운 중 */
  get anchored(): boolean {
    return this.anchor !== null;
  }
  /** 물속 (수영/잠수) */
  get inWater(): boolean {
    return this.state === "swim" || this.state === "dive";
  }

  /** 네트워크로 보낼 논리 상태. 의자에 앉으면 스냅 도중에도 좌석 앵커를 보낸다 */
  netPose(out: NetPose): NetPose {
    if (this.state === "sitChair" && this.seat) {
      out.x = this.seat.x;
      out.y = this.seat.y;
    } else if (this.anchor) {
      out.x = this.anchor.x;
      out.y = this.anchor.y;
    } else {
      out.x = this.x;
      out.y = this.y;
    }
    out.state = STATE[this.state];
    out.dir = this.dir;
    return out;
  }

  /** 점프 시작. 앉아 있으면 점프 대신 일어난다. 뛰었으면 true */
  jump(now: number, seats: SeatRequester | null): boolean {
    if (this.sitting) {
      this.stand(now, seats);
      return false;
    }
    if (this.anchor) {
      this.leaveAnchor(now);
      return false;
    }
    if (this.inWater) return false;
    if (!canJump(now, this.airborne, this.landedAt) || !this.body.enable) return false;
    this.airborne = true;
    this.jumpStart = now;
    // 뛰기 직전의 이동 방향·속도를 그대로 유지한다 (달리기 점프 가능)
    this.jumpVx = this.body.velocity.x;
    this.jumpVy = this.body.velocity.y;
    this.state = "jump";
    this.view.apply(this.state, this.dir, now);
    return true;
  }

  private readonly poseDelta = { x: 0, y: 0 };
  /** 매달리기·그네·수영 연출로 표시 원점이 움직인 만큼 바디 오프셋도 옮겨 발 위치(충돌)는 그대로 둔다 */
  private syncPose(): void {
    const d = this.view.consumeOriginDelta(this.poseDelta);
    if (d.x || d.y) this.body.setOffset(this.body.offset.x + d.x, this.body.offset.y + d.y);
  }

  private setHop(h: number): void {
    const d = this.view.setHop(h, shadowScale(h));
    // 표시 원점이 올라간 만큼 바디 오프셋도 올려 발 위치(충돌)는 그대로 둔다
    if (d) this.body.setOffset(this.body.offset.x, this.body.offset.y + d);
  }

  /** 점프를 바로 끝낸다 (순간이동·일어서기 등) */
  private endJump(now: number): void {
    if (!this.airborne) return;
    this.airborne = false;
    this.landedAt = now;
    this.setHop(0);
  }

  /** 매 프레임. 이번 프레임에 걷기 시작했으면 true (카메라 복귀 신호) */
  update(input: MoveInput, now: number, seats: SeatRequester): boolean {
    const moved = this.step(input, now, seats);
    this.syncPose();
    return moved;
  }

  private step(input: MoveInput, now: number, seats: SeatRequester): boolean {
    if (this.airborne) {
      const t = now - this.jumpStart;
      if (t < JUMP_MS) {
        this.setHop(jumpHeight(t));
        this.body.setVelocity(this.jumpVx, this.jumpVy);
        return false;
      }
      this.endJump(now);
      this.state = "idle";
      this.onLand?.();
    }
    resolveMove(input, this.dir, this.move);
    if (this.anchor) {
      if (!this.move.moving) {
        this.view.apply(this.state, this.dir, now);
        return false;
      }
      this.leaveAnchor(now);
    }
    const wasMoving = this.state === "walk" || this.state === "run" || this.state === "swim" || this.state === "dive";
    if (this.sitting) {
      if (!this.move.moving) {
        this.body.setVelocity(0, 0);
        this.view.apply(this.state, this.dir, now);
        return false;
      }
      this.stand(now, seats);
    }
    const wet = this.water?.(this.x, this.y) ?? false;
    if (!wet) this.diving = false;
    const mul = wet ? (this.diving ? DIVE_SPEED : SWIM_SPEED) : 1;
    // 강물에 떠내려가는 만큼 (가만히 있어도 흘러간다)
    const cur = wet && this.current ? this.current(this.x, this.y) : null;
    const cvx = cur ? cur.vx : 0;
    const cvy = cur ? cur.vy : 0;
    if (this.move.moving) {
      this.body.setVelocity(this.move.vx * mul + cvx, this.move.vy * mul + cvy);
      this.dir = this.move.dir;
      this.state = wet ? (this.diving ? "dive" : "swim") : this.move.running ? "run" : "walk";
    } else {
      this.body.setVelocity(cvx, cvy);
      this.state = wet ? (this.diving ? "dive" : "swim") : "idle";
    }
    this.view.apply(this.state, this.dir, now);
    return this.move.moving && !wasMoving;
  }

  /** 좌석에 앉기 (요청과 동시에 스냅 시작) — seat가 null이면 바닥 앉기 */
  sit(seat: Seat | null, now: number, seats: SeatRequester | null): void {
    this.body.setVelocity(0, 0);
    if (!seat) {
      this.state = "sitGround";
      this.view.apply(this.state, this.dir, now);
      return;
    }
    this.seat = seat;
    this.preSit = { x: this.x, y: this.y };
    seats?.sit(seat.id);
    this.state = "sitChair";
    this.dir = seat.facing;
    this.body.enable = false;
    this.view.depthOverride = seat.y + 1;
    this.view.apply(this.state, this.dir, now);
    this.snap?.stop();
    this.snap = this.scene.tweens.add({
      targets: this.view.sprite,
      x: seat.x,
      y: seat.y - SIT_CHAIR_LIFT,
      duration: SNAP_MS,
      ease: "Sine.easeOut",
    });
  }

  /** 긴 벤치에서 옆 좌석으로 옮겨 앉기 (앉은 상태 그대로 미끄러지듯) */
  moveSeat(seat: Seat, now: number, seats: SeatRequester | null): void {
    if (this.state !== "sitChair" || !this.seat || this.seat.id === seat.id) return;
    this.moveFrom = this.seat;
    this.seat = seat;
    seats?.sit(seat.id);
    this.dir = seat.facing;
    this.view.depthOverride = seat.y + 1;
    this.view.apply(this.state, this.dir, now);
    this.snap?.stop();
    this.snap = this.scene.tweens.add({ targets: this.view.sprite, x: seat.x, y: seat.y - SIT_CHAIR_LIFT, duration: SNAP_MS, ease: "Sine.easeInOut" });
  }

  /** 서버가 내 좌석을 확정함 (옮겨 앉기 끝) */
  seatConfirmed(seatId: string): void {
    if (this.seat?.id === seatId) this.moveFrom = null;
  }

  /**
   * 나무에 매달리기 / 그네 타기: (ax, ay)에 붙는다. depth: 그 오브젝트 앞에 그리도록.
   * spotId: 이 자리의 1인 자리 id (점유 요청은 씬이 보낸다 — 일어서기(stand)가 먼저 나가야 해서)
   */
  attach(kind: "hang" | "swing" | "hammock", ax: number, ay: number, depth: number, now: number, seats: SeatRequester | null, spotId: string | null = null): void {
    if (this.airborne) this.endJump(now);
    if (this.sitting) this.stand(now, seats);
    if (this.anchor) this.leaveAnchor(now);
    this.cancelSnap();
    this.anchor = { x: ax, y: ay };
    this.spotId = spotId;
    this.state = kind;
    this.dir = DIR.down;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.view.depthOverride = depth;
    this.view.apply(this.state, this.dir, now);
    this.snap = this.scene.tweens.add({ targets: this.view.sprite, x: ax, y: ay, duration: 140, ease: "Sine.easeOut" });
  }

  /** 나무·그네에서 내려온다 */
  leaveAnchor(now: number): void {
    const a = this.anchor;
    if (!a) return;
    this.anchor = null;
    this.spotId = null;
    this.snap?.stop();
    this.snap = null;
    this.view.depthOverride = null;
    this.state = "idle";
    this.view.apply(this.state, this.dir, now);
    this.syncPose();
    this.body.enable = true;
    this.body.reset(a.x, a.y);
  }

  /** 물속에서 E: 잠수 ↔ 떠오르기 */
  toggleDive(now: number): void {
    if (!this.inWater) return;
    this.diving = !this.diving;
    this.state = this.diving ? "dive" : "swim";
    this.view.apply(this.state, this.dir, now);
  }

  /** 서버가 좌석을 거절함 → 원래 자리로 돌아가 바닥 앉기 (옆자리로 옮기던 중이면 원래 좌석으로) */
  seatDenied(seatId: string, now: number): void {
    if (this.state !== "sitChair" || this.seat?.id !== seatId) return;
    if (this.moveFrom) {
      const back = this.moveFrom;
      this.moveFrom = null;
      this.seat = back;
      this.view.depthOverride = back.y + 1;
      this.snap?.stop();
      this.snap = this.scene.tweens.add({ targets: this.view.sprite, x: back.x, y: back.y - SIT_CHAIR_LIFT, duration: 120, ease: "Sine.easeOut" });
      return;
    }
    const back = this.preSit ?? standPoint(this.seat);
    this.seat = null;
    this.view.depthOverride = null;
    this.snap?.stop();
    this.state = "sitGround";
    this.view.apply(this.state, this.dir, now);
    this.snap = this.scene.tweens.add({
      targets: this.view.sprite,
      x: back.x,
      y: back.y,
      duration: 120,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.snap = null;
        this.body.enable = true;
        this.body.reset(back.x, back.y);
      },
    });
  }

  /**
   * 진행 중인 스냅 tween(좌석으로/좌석 거절 후 되돌아가기)을 멈추고 충돌을 복구한다.
   * 거절 tween이 끝나기 전에 일어서거나 순간이동하면, 늦게 끝난 tween이 캐릭터를 끌고 가지 않게 한다.
   */
  private cancelSnap(): void {
    if (this.snap) {
      this.snap.stop();
      this.snap = null;
    }
    if (!this.body.enable && this.state !== "sitChair") {
      this.body.enable = true;
      this.body.reset(this.view.sprite.x, this.view.sprite.y);
    }
  }

  stand(now: number, seats: SeatRequester | null): void {
    if (!this.sitting) return;
    if (this.state === "sitChair") {
      const p = this.seat ? standPoint(this.seat) : { x: this.x, y: this.y };
      this.snap?.stop();
      this.snap = null;
      this.seat = null;
      this.moveFrom = null;
      this.preSit = null;
      this.view.depthOverride = null;
      this.body.enable = true;
      this.state = "idle";
      this.body.reset(p.x, p.y);
      seats?.stand();
    } else {
      this.state = "idle";
      this.cancelSnap();
    }
    this.view.apply(this.state, this.dir, now);
  }

  /** 순간이동 (랭킹 클릭 등) */
  warp(x: number, y: number, now: number, seats: SeatRequester | null): void {
    this.endJump(now);
    if (this.anchor) {
      this.anchor = null;
      this.spotId = null;
      this.view.depthOverride = null;
    }
    this.diving = false;
    if (this.sitting) this.stand(now, seats);
    this.cancelSnap();
    this.body.enable = true;
    this.body.reset(x, y);
    this.state = "idle";
    this.view.apply(this.state, this.dir, now);
  }

  /** 대상 쪽으로 몸을 돌린다 (꽃 놓기 등) */
  faceTo(x: number, y: number, now: number): void {
    if (this.sitting) return;
    this.dir = faceToward(this.x, this.y, x, y, this.dir);
    this.view.apply(this.state, this.dir, now);
  }

  destroy(): void {
    this.snap?.stop();
    this.view.destroy();
  }
}

import * as Phaser from "phaser";
import { DIR, JUMP_MS, STATE, type DirId, type Seat, type StateName } from "@tomb/protocol";
import { canJump, jumpHeight, shadowScale } from "../logic/jump";
import { emptyMove, faceToward, resolveMove, type MoveInput } from "../logic/movement";
import { standPoint } from "../logic/sit";
import type { NetPose } from "../net/sendThrottle";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { AvatarView, SIT_CHAIR_LIFT } from "./AvatarView";

// 내 캐릭터. 입력은 즉시 로컬에서 반영한다 (서버를 기다리지 않음, 서버 보정도 없음).
// 상태 머신: idle | walk | run | sitGround | sitChair
//  - 앉기: 빈 좌석이 24px 안이면 서버에 점유 요청과 "동시에" 좌석으로 부드럽게 스냅 (지연 숨김),
//          거절되면 원래 자리로 돌아가 바닥 앉기. 좌석이 없으면 그 자리에서 바닥 앉기.
//  - 앉은 채 이동 입력 → 일어선 뒤 이동.
//  - 점프(Space): JUMP_MS 동안 그림만 포물선으로 띄우고(발 위치·물리 바디는 그대로) 뛰기 직전 속도로 계속 간다.
//    공중에 있는 동안 묘비 충돌은 씬이 끄고, 착지하면 onLand로 알린다.

const BODY_W = 8;
const BODY_H = 5;
const SNAP_MS = 160;

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

  constructor(
    private readonly scene: Phaser.Scene,
    atlas: GlyphAtlas,
    x: number,
    y: number,
    color: string,
    name: string,
  ) {
    this.view = new AvatarView(scene, atlas, x, y, color, name, true);
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

  /** 네트워크로 보낼 논리 상태. 의자에 앉으면 스냅 도중에도 좌석 앵커를 보낸다 */
  netPose(out: NetPose): NetPose {
    if (this.state === "sitChair" && this.seat) {
      out.x = this.seat.x;
      out.y = this.seat.y;
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
    const wasMoving = this.state === "walk" || this.state === "run";
    if (this.sitting) {
      if (!this.move.moving) {
        this.body.setVelocity(0, 0);
        this.view.apply(this.state, this.dir, now);
        return false;
      }
      this.stand(now, seats);
    }
    if (this.move.moving) {
      this.body.setVelocity(this.move.vx, this.move.vy);
      this.dir = this.move.dir;
      this.state = this.move.running ? "run" : "walk";
    } else {
      this.body.setVelocity(0, 0);
      this.state = "idle";
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

  /** 서버가 좌석을 거절함 → 원래 자리로 돌아가 바닥 앉기 */
  seatDenied(seatId: string, now: number): void {
    if (this.state !== "sitChair" || this.seat?.id !== seatId) return;
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

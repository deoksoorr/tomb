import * as Phaser from "phaser";
import { DIR, STATE, type DirId, type Seat, type StateName } from "@tomb/protocol";
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

  /** 매 프레임. 이번 프레임에 걷기 시작했으면 true (카메라 복귀 신호) */
  update(input: MoveInput, now: number, seats: SeatRequester): boolean {
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
        this.body.enable = true;
        this.body.reset(back.x, back.y);
      },
    });
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
    }
    this.view.apply(this.state, this.dir, now);
  }

  /** 순간이동 (랭킹 클릭 등) */
  warp(x: number, y: number, now: number, seats: SeatRequester | null): void {
    if (this.sitting) this.stand(now, seats);
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

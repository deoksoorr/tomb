import type * as Phaser from "phaser";
import { DIR, JUMP_MS, STATE, STATE_NAMES, seatSlot, type DirId, type PeerInfo, type Sid, type StateId } from "@tomb/protocol";
import { jumpHeight, shadowScale } from "../logic/jump";
import { Interpolator, type InterpOut } from "../net/Interpolator";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { AvatarView } from "./AvatarView";
import { awayFade } from "./awayFade";

// 원격 아바타: 받은 상태 값만으로 같은 상태 머신·애니메이션을 재생한다.
// 위치는 Interpolator(경로 따라가기 + 적응형 버퍼, 짧은 외삽, 96px 스냅)가 정한다.
// 화면 밖이면 위치 갱신은 계속하되 그리지 않는다.

const CULL_MARGIN = 16;
/** 그네 좌석 y → 그네 틀보다 앞에 그릴 depth 오프셋 */
export const SWING_FRONT = 7;
/** 해먹에 누운 사람 자리(천 가운데) → 해먹 그림(받침 − 2)보다 앞에 그릴 depth 오프셋 */
export const HAMMOCK_FRONT = 6;
/** 3번 집 안 자세(눕기·읽기·욕조): 자리 앵커 → 그 가구(앵커 + 1에 그린다)보다 앞에 그릴 depth 오프셋 */
export const INDOOR_FRONT = 2;
/** 발밑에서 이름표 위까지 (말풍선 포함) */
const LABEL_TOP = 34;
export class RemoteAvatar {
  readonly view: AvatarView;
  readonly interp = new Interpolator();
  private readonly out: InterpOut = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  /** 서버 좌석 점유표에서 이 사람이 차지한 1인 자리 (의자·벤치 좌석 또는 나무·그네·해먹) */
  seatId: string | null = null;
  /** 조각배 뒷자리처럼 다른 사람(노 젓는 사람)에 붙어 그려야 할 때의 자리 (BoatRide가 넣는다). null이면 보간 위치 */
  posOverride: { x: number; y: number } | null = null;
  x = 0;
  y = 0;
  stateId: StateId = STATE.idle;
  /** 달리는 중 먼지 타이머 */
  dustAt = 0;
  /** 점프를 시작한 (내 시계) 시각. 보간과 따로, 상태가 jump로 바뀐 순간부터 같은 포물선을 그린다 */
  private jumpAt = -1;
  /**
   * 트램펄린에서 뛰어내리는 점프(F14)면 그 순간 보이던 높이(트램펄린 연출 높이)에서 시작해 땅까지 섞어 내린다
   * (내 화면의 Player.hopOff와 같은 모양. 보간 지연 때문에 원격 화면의 튀는 위상이 조금 다를 수 있어 지금 높이에서 잇는다)
   */
  private jumpBase = 0;
  private prevState: StateId = STATE.idle;
  /** 실내(상점·집·사냥터 등)에 들어가 있다 → 메인 맵에서 숨긴다 */
  private awayOn = false;
  /** 실내 표시가 바뀐 (내 시계) 시각. -Infinity면 연출 없이 바로 */
  private awayAt = -Infinity;

  constructor(
    scene: Phaser.Scene,
    atlas: GlyphAtlas,
    readonly sid: Sid,
    public name: string,
    readonly color: string,
    init: Pick<PeerInfo, "x" | "y" | "state" | "dir">,
    now: number,
    look: readonly string[] = [],
    readonly body = "hood",
  ) {
    this.view = new AvatarView(scene, atlas, init.x, init.y, color, name, false, look, body);
    this.push(now, init.x, init.y, init.state, init.dir);
    this.update(now, null, 1);
  }

  /** 실내에 들어감(on)·나옴. instant면 연출 없이 (늦게 들어와서 이미 안에 있는 사람) */
  setAway(on: boolean, now: number, instant = false): void {
    if (on === this.awayOn) return;
    this.awayOn = on;
    this.awayAt = instant ? -Infinity : now;
  }

  /** 실내에 들어가 있다 (미니맵·누르기에서 뺀다) */
  get away(): boolean {
    return this.awayOn;
  }

  push(t: number, x: number, y: number, state: StateId, dir: DirId): void {
    this.interp.push(t, x, y, state, dir);
  }

  /** view가 null이면 컬링 없이 갱신 */
  update(now: number, view: Phaser.Geom.Rectangle | null, labelScale: number): void {
    if (!this.interp.sample(now, this.out)) return;
    const o = this.out;
    this.stateId = o.state;
    let x = o.x;
    let y = o.y;
    this.view.depthOverride = null;
    // 차지한 자리(의자·나무·그네)에 있는 동안은 그 앵커에 고정한다 (보간이 늦어도 자리 위에 정확히)
    const slot = this.seatId ? seatSlot(this.seatId) : undefined;
    // 움직이는 자리(조각배)는 앵커(나루터)에 묶지 않는다 — 배를 따라 보간 위치 그대로
    if (slot && slot.state === o.state && !slot.mobile) {
      x = slot.x;
      y = slot.y;
    }
    if (this.posOverride && o.state === STATE.boat) {
      x = this.posOverride.x;
      y = this.posOverride.y;
    }
    if (o.state === STATE.sitChair && slot) this.view.depthOverride = y + 1;
    // 그네 탄 사람은 그네 틀(받침 y = 좌석 + 5) 앞에, 매달린 사람은 나무 줄기 앞에 그린다 (내 캐릭터와 같은 기준)
    else if (o.state === STATE.swing) this.view.depthOverride = y + SWING_FRONT;
    else if (o.state === STATE.hang) this.view.depthOverride = y + 0.5;
    else if (o.state === STATE.hammock) this.view.depthOverride = y + HAMMOCK_FRONT;
    else if (o.state === STATE.lie || o.state === STATE.read || o.state === STATE.bath) this.view.depthOverride = y + INDOOR_FRONT;
    this.x = x;
    this.y = y;
    // 실내: 다 들어갔으면 그리지 않는다 (위치 갱신은 계속 — 나오면 문 앞에서 나타난다)
    const fade = awayFade(this.awayOn, this.awayAt, now);
    if (fade.hidden) {
      this.view.setVisible(false);
      this.prevState = o.state;
      return;
    }
    this.view.fade = fade.alpha;
    this.view.apply(STATE_NAMES[o.state], o.dir, now);
    this.view.place(x, y - fade.dy);
    if (o.state === STATE.jump) {
      if (this.jumpAt < 0) {
        this.jumpAt = now;
        this.jumpBase = this.prevState === STATE.trampoline ? Math.max(0, this.view.poseLift) : 0;
      }
      const t = now - this.jumpAt;
      const h = jumpHeight(t) + this.jumpBase * Math.max(0, 1 - t / JUMP_MS);
      this.view.setHop(h, shadowScale(h));
    } else if (this.jumpAt >= 0) {
      this.jumpAt = -1;
      this.view.setHop(0, 1);
    }
    this.prevState = o.state;

    // 여유 = 이름표 폭/높이 (이름표는 화면 픽셀 크기라 줌아웃하면 월드에서 넓어진다)
    const label = this.view.label;
    const mx = Math.max(CULL_MARGIN, label.width / 2 + 4);
    const my = label.height + LABEL_TOP;
    // 놀이기구(관람차 칸·하늘을 나는 열기구)에 탄 사람은 앵커에서 옮겨 그린 자리로 잰다
    const ride = this.view.ride;
    const cx = ride ? x + ride.ox : x;
    const cy = ride ? y - ride.lift : y;
    const visible = !view || (cx > view.x - mx && cx < view.right + mx && cy > view.y - my && cy < view.bottom + CULL_MARGIN);
    this.view.setVisible(visible);
    if (visible) this.view.sync(now, labelScale);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  destroy(): void {
    this.view.destroy();
  }
}

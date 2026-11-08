import type * as Phaser from "phaser";
import { DIR, STATE, STATE_NAMES, seatById, type DirId, type PeerInfo, type Sid, type StateId } from "@tomb/protocol";
import { Interpolator, type InterpOut } from "../net/Interpolator";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import { AvatarView } from "./AvatarView";

// 원격 아바타: 받은 상태 값만으로 같은 상태 머신·애니메이션을 재생한다.
// 위치는 Interpolator(120ms 지연 버퍼, 200ms 외삽, 96px 스냅)가 정한다.
// 화면 밖이면 위치 갱신은 계속하되 그리지 않는다.

const CULL_MARGIN = 16;
/** 발밑에서 이름표 위까지 (말풍선 포함) */
const LABEL_TOP = 34;

export class RemoteAvatar {
  readonly view: AvatarView;
  readonly interp = new Interpolator();
  private readonly out: InterpOut = { x: 0, y: 0, state: STATE.idle, dir: DIR.down };
  /** 서버 좌석 점유표에서 이 사람이 앉은 좌석 */
  seatId: string | null = null;
  x = 0;
  y = 0;
  stateId: StateId = STATE.idle;
  /** 달리는 중 먼지 타이머 */
  dustAt = 0;

  constructor(
    scene: Phaser.Scene,
    atlas: GlyphAtlas,
    readonly sid: Sid,
    public name: string,
    color: string,
    init: Pick<PeerInfo, "x" | "y" | "state" | "dir">,
    now: number,
  ) {
    this.view = new AvatarView(scene, atlas, init.x, init.y, color, name, false);
    this.push(now, init.x, init.y, init.state, init.dir);
    this.update(now, null, 1);
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
    if (o.state === STATE.sitChair && this.seatId) {
      const seat = seatById(this.seatId);
      if (seat) {
        x = seat.x;
        y = seat.y;
        this.view.depthOverride = seat.y + 1;
      }
    }
    this.x = x;
    this.y = y;
    this.view.apply(STATE_NAMES[o.state], o.dir, now);
    this.view.place(x, y);

    // 여유 = 이름표 폭/높이 (이름표는 화면 픽셀 크기라 줌아웃하면 월드에서 넓어진다)
    const label = this.view.label;
    const mx = Math.max(CULL_MARGIN, label.width / 2 + 4);
    const my = label.height + LABEL_TOP;
    const visible = !view || (x > view.x - mx && x < view.right + mx && y > view.y - my && y < view.bottom + CULL_MARGIN);
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

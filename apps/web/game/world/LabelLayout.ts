import type { AvatarView } from "../entities/AvatarView";
import type { SpeechBubble } from "../entities/SpeechBubble";
import { declutter, stackLabels, unitBoxes, type LabelBox, type LabelUnit } from "./labels";

/**
 * 씬마다 매 프레임 이름표·말풍선 겹침을 푼다 (아바타 sync 뒤에, 할당 없음).
 * 1) 이름표 묶음(이름 + 바탕판 + 칭호·1위 배지): 내 것은 제자리, 다른 사람 것을 통째로 위로 (목표만 적고 실제 이동은 다음 sync가 부드럽게)
 * 2) 말풍선: 자리 잡은 이름표 묶음은 장애물로 두고 말풍선만 위로 비킨다 (말풍선 때문에 남의 이름이 밀려나지 않는다)
 */
export class LabelLayout {
  private readonly units: LabelUnit[] = [];
  private readonly lifts: number[] = [];
  private readonly order: LabelUnit[] = [];
  private readonly bubbles: SpeechBubble[] = [];
  private readonly boxes: LabelBox[] = [];
  private readonly fixed: LabelBox[] = [];
  private readonly boxOrder: LabelBox[] = [];
  private n = 0;
  private m = 0;

  begin(): void {
    this.n = 0;
    this.m = 0;
  }

  /** me = 내 아바타 (이름표가 움직이지 않는다), now = 그 아바타의 말풍선 시계 */
  add(v: AvatarView, me: boolean, now: number): void {
    const u = v.unit;
    if (!v.labelShown) {
      u.lift = 0;
      return;
    }
    u.pin = me;
    this.lifts[this.n] = v.labelLiftNow;
    this.units[this.n++] = u;
    const sp = v.speechAt(now);
    if (sp) this.bubbles[this.m++] = sp;
  }

  /** px = 화면 1px의 월드 길이 (이름표 배율) */
  finish(px: number): void {
    const n = this.n;
    const m = this.m;
    if (n >= 2) stackLabels(this.units, this.order, n, px);
    else if (n === 1) this.units[0].lift = 0;
    if (!m) return;
    let k = 0;
    for (let i = 0; i < n; i++) k = unitBoxes(this.units[i], this.lifts[i], this.fixed, k);
    for (let i = 0; i < m; i++) {
      let b = this.boxes[i];
      if (!b) this.boxes.push((b = { x: 0, y: 0, w: 0, h: 0 }));
      const sb = this.bubbles[i].box;
      b.x = sb.x;
      b.y = sb.y;
      b.w = sb.w;
      b.h = sb.h;
    }
    declutter(this.boxes, this.boxOrder, m, this.fixed, k);
    for (let i = 0; i < m; i++) {
      const sp = this.bubbles[i];
      if (this.boxes[i].y !== sp.box.y) sp.setBottom(this.boxes[i].y);
    }
  }
}

import type * as Phaser from "phaser";
import { DIR, isSeatMood, type DirId, type SeatMood, type StateName } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import { DEPTH } from "../config";
import { seatedAnchors } from "../sprites/avatar";
import { MOOD_ICON, MOOD_PROP_PLACE, moodIconGrid, moodIconKey, moodPropGrid, moodPropKey } from "../sprites/moodArt";

// 24번 벤치 상태: 의자·벤치에 앉아 있는 동안 머리 위 작은 아이콘 + 손에 든 소품 (AvatarView가 하나씩 가진다).
// 아이콘은 머리와 이름표 사이에 놓고(이름표를 아이콘 높이만큼 올린다 → 머리 꾸미기 → 아이콘 → 이름표 → 말풍선 순),
// 소품은 앉은 자세 기준점(seatedAnchors)에: 무릎(책·노트북·도시락·담요·머그잔)·머리(헤드폰)·귀(휴대폰).
// 뒷모습이면 무릎 소품은 몸 뒤로 숨는다. 앉아 있지 않으면(일어나는 순간) 바로 감춘다 — 서버도 자리 해제와 함께 푼다.

/** 이름표를 올리는 높이 = 아이콘 + 1px 틈 */
export const MOOD_LIFT = MOOD_ICON + 1;
const BOB_MS = 900;

export class MoodView {
  private mood: SeatMood | null = null;
  private icon: Phaser.GameObjects.Image | null = null;
  private prop: Phaser.GameObjects.Image | null = null;
  private propKey = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {}

  get current(): SeatMood | null {
    return this.mood;
  }

  /** 모르는 값·빈 문자열이면 푼다 */
  set(m: string | null | undefined): void {
    const next = isSeatMood(m) ? m : null;
    if (next === this.mood) return;
    this.mood = next;
    this.icon?.destroy();
    this.icon = null;
    this.prop?.destroy();
    this.prop = null;
    this.propKey = "";
  }

  /** 지금 이름표를 올릴 높이 (앉아 있고 상태가 있을 때만) */
  lift(state: StateName): number {
    return this.mood && state === "sitChair" ? MOOD_LIFT : 0;
  }

  /**
   * 프레임마다. x = 몸 가운데, footY = 스프라이트 발바닥(원점) y, iconBottom = 아이콘 아래쪽 y(올리기 전 이름표 자리),
   * depth = 아바타 depth
   */
  sync(now: number, x: number, footY: number, iconBottom: number, dir: DirId, body: string, depth: number, state: StateName, vis: boolean): void {
    const m = this.mood;
    const on = !!m && state === "sitChair" && vis;
    if (!on || !m) {
      this.icon?.setVisible(false);
      this.prop?.setVisible(false);
      return;
    }
    // ── 머리 위 아이콘 (천천히 1px 오르내림) ──
    const ik = moodIconKey(m);
    if (!this.scene.textures.exists(ik)) addCanvasTexture(this.scene, ik, { canvas: moodIconGrid(m).toCanvas() });
    this.icon ??= this.scene.add.image(0, 0, ik).setOrigin(0.5, 1);
    const bob = this.reduced ? 0 : Math.sin(now / BOB_MS) > 0.4 ? 1 : 0;
    this.icon.setPosition(Math.round(x), Math.round(iconBottom) - bob).setDepth(DEPTH.labels - 0.5).setVisible(true);

    // ── 손에 든 소품 ──
    const a = seatedAnchors(body);
    const side = dir === DIR.left || dir === DIR.right;
    const sign = dir === DIR.left ? -1 : 1;
    const headW = Math.round(a.headRx * 2);
    const view = side ? "side" : "down";
    const key = moodPropKey(m, view, headW);
    if (key !== this.propKey) {
      if (!this.scene.textures.exists(key)) addCanvasTexture(this.scene, key, { canvas: moodPropGrid(m, view, headW).toCanvas() });
      if (this.prop) this.prop.setTexture(key);
      else this.prop = this.scene.add.image(0, 0, key);
      this.propKey = key;
    }
    const p = this.prop!;
    const place = MOOD_PROP_PLACE[m];
    if (place === "head") {
      // 헤드폰: 띠가 머리 윗면 1px 위 (옆모습은 귀 덮개가 얼굴을 가리지 않게 머리 뒤쪽으로 2px)
      p.setOrigin(0.5, 0)
        .setFlipX(dir === DIR.left)
        .setPosition(Math.round(x + (side ? -2 * sign : 0)), Math.round(footY - a.headTop - 1))
        .setDepth(depth + 0.06);
    } else if (place === "ear") {
      // 휴대폰: 앞모습은 오른쪽 귀, 뒷모습은 (보는 사람 기준) 왼쪽 귀, 옆모습은 머리 가운데 뒤쪽
      const dx = side ? -sign : dir === DIR.up ? -(a.headRx + 1) : a.headRx + 1;
      p.setOrigin(0.5, 0.5)
        .setFlipX(false)
        .setPosition(Math.round(x + dx), Math.round(footY - a.headUp + 1))
        .setDepth(depth + (side && dir === DIR.left ? -0.04 : 0.06));
    } else {
      // 무릎 소품: 뒷모습이면 몸 뒤 (가려진다)
      p.setOrigin(0.5, 1)
        .setFlipX(dir === DIR.left)
        .setPosition(Math.round(x + (side ? sign * 3 : 0)), Math.round(footY - a.lapUp + 2))
        .setDepth(depth + (dir === DIR.up ? -0.05 : 0.05));
    }
    p.setVisible(true);
  }

  setVisible(v: boolean): void {
    if (!v) {
      this.icon?.setVisible(false);
      this.prop?.setVisible(false);
    }
  }

  destroy(): void {
    this.icon?.destroy();
    this.prop?.destroy();
    this.icon = null;
    this.prop = null;
  }
}

import * as Phaser from "phaser";
import { DIR, type DirId, type StateName } from "@tomb/protocol";
import { avatarAnimKey, avatarFrame, ensureAvatarTexture, TEX } from "../assets/manifest";
import { DEPTH, LABEL_ME, LABEL_OTHER, SIT_IDLE_MS } from "../config";
import { AV_ORIGIN_Y } from "../sprites/avatar";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 아바타 한 명의 화면 표현 (스프라이트 + 이름 라벨 + "…" 말풍선). 내 캐릭터와 원격 아바타가 같이 쓴다.
// 상태 값(idle|walk|run|sitGround|sitChair)과 방향만 받아서 애니메이션을 고른다.

/** 의자에 앉으면 좌석 위로 살짝 올려 그린다 */
export const SIT_CHAIR_LIFT = 3;
const LABEL_GAP = 20;

export class AvatarView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.BitmapText;
  private bubble: Phaser.GameObjects.Image | null = null;
  private readonly texKey: string;
  private anim = "";
  private gestureUntil = 0;
  state: StateName = "idle";
  dir: DirId = DIR.down;
  /** 앉기 시작한 시각 (앉아 있지 않으면 0) */
  sitSince = 0;
  /** 의자 위처럼 y 정렬을 덮어써야 할 때 */
  depthOverride: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly atlas: GlyphAtlas,
    x: number,
    y: number,
    color: string,
    name: string,
    isMe: boolean,
  ) {
    this.texKey = ensureAvatarTexture(scene, color);
    this.sprite = scene.add.sprite(x, y, this.texKey, avatarFrame("idle", DIR.down)).setOrigin(0.5, AV_ORIGIN_Y);
    atlas.ensure(name);
    this.label = scene.add
      .bitmapText(x, y - LABEL_GAP, FONT_KEY, name, FONT_PX)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.labels + (isMe ? 1 : 0))
      .setTint(isMe ? LABEL_ME : LABEL_OTHER);
    this.apply("idle", DIR.down, 0);
  }

  setName(name: string): void {
    this.atlas.ensure(name);
    this.label.setText(name);
  }

  /** 상태·방향 반영. 바뀔 때만 애니메이션을 바꾼다 */
  apply(state: StateName, dir: DirId, now: number): void {
    const sitting = state === "sitGround" || state === "sitChair";
    if (sitting && !(this.state === "sitGround" || this.state === "sitChair")) this.sitSince = now || 1;
    if (!sitting) this.sitSince = 0;
    this.state = state;
    this.dir = dir;
    if (now < this.gestureUntil) return;
    const key = avatarAnimKey(this.texKey, state, dir);
    if (key !== this.anim) {
      this.anim = key;
      this.sprite.play(key, true);
    }
  }

  /** 잠깐의 몸짓 (꽃 놓기: 쪼그려 앉기 프레임) */
  gesture(dir: DirId, ms: number, now: number): void {
    this.gestureUntil = now + ms;
    this.anim = "";
    this.sprite.stop();
    this.sprite.setFrame(avatarFrame("sitGround", dir));
  }

  /** 논리 위치(발밑/좌석 앵커)에 놓는다 */
  place(x: number, y: number): void {
    const lift = this.state === "sitChair" ? SIT_CHAIR_LIFT : 0;
    this.sprite.setPosition(x, y - lift);
  }

  /** 라벨·말풍선·depth를 스프라이트에 맞춘다 (보이는 아바타만 매 프레임) */
  sync(now: number, labelScale: number): void {
    const s = this.sprite;
    if (now >= this.gestureUntil && this.gestureUntil) {
      this.gestureUntil = 0;
      this.anim = "";
      this.apply(this.state, this.dir, now);
    }
    s.setDepth(this.depthOverride ?? s.y);
    const lift = this.state === "sitGround" ? 3 : this.state === "sitChair" ? 1 : 0;
    this.label.setPosition(Math.round(s.x), s.y - LABEL_GAP + lift);
    if (this.label.scaleX !== labelScale) this.label.setScale(labelScale);

    const longSit = this.sitSince > 0 && now - this.sitSince > SIT_IDLE_MS;
    if (longSit) {
      if (!this.bubble) {
        this.bubble = this.scene.add.image(0, 0, TEX.bubble).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setAlpha(0);
        this.scene.tweens.add({ targets: this.bubble, alpha: 1, duration: 600 });
      }
      // 이름표 바로 위에 띄운다 (이름표는 화면 픽셀 크기라 줌에 따라 월드 높이가 바뀐다)
      const bob = Math.sin(now / 600) > 0.5 ? 1 : 0;
      this.bubble.setPosition(s.x, this.label.y - this.label.displayHeight - bob);
      this.bubble.setVisible(s.visible);
    } else if (this.bubble) {
      this.bubble.destroy();
      this.bubble = null;
    }
  }

  setVisible(v: boolean): void {
    if (this.sprite.visible === v) return;
    this.sprite.setVisible(v);
    this.label.setVisible(v);
    this.bubble?.setVisible(v);
  }

  get visible(): boolean {
    return this.sprite.visible;
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.bubble?.destroy();
    this.bubble = null;
  }
}

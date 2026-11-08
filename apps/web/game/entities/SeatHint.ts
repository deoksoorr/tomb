import type * as Phaser from "phaser";
import type { Seat } from "@tomb/protocol";
import { DEPTH } from "../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../text/GlyphAtlas";

// 앉기 안내: 근처(SEAT_SEARCH_RADIUS)에 빈 좌석이 있으면 좌석 바로 아래에 "X 앉기"(터치 기기는 "앉기 버튼"),
// 앉은 직후에는 발밑에 "이동하면 일어나요"를 잠깐. 묘비 툴팁이 떠 있고 그 묘비가 더 가까우면 숨겨서 겹치지 않게 한다.
// 좌석이 없으면 근처 오브젝트 안내("E 매달리기", "E 종 치기", 물속 "E 잠수" …)를 같은 자리에 띄운다.

const SITTING_HINT_MS = 4000;

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
}

export class SeatHint {
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly sitLabel: string;
  private readonly standLabel = "이동하면 일어나요";
  /** 상호작용 키 안내 앞머리: 데스크톱 "E ", 터치 "버튼: " */
  readonly prefix: string;
  private readonly atlas: GlyphAtlas;

  constructor(scene: Phaser.Scene, atlas: GlyphAtlas) {
    const touch = isTouchDevice();
    this.sitLabel = touch ? "앉기 버튼으로 앉기" : "X 앉기";
    this.prefix = touch ? "버튼: " : "E ";
    this.atlas = atlas;
    atlas.ensure(this.sitLabel + this.standLabel);
    this.text = scene.add
      .bitmapText(0, 0, FONT_KEY, this.sitLabel, FONT_PX)
      .setOrigin(0.5, 0)
      .setTint(0xf2e6c4)
      .setDepth(DEPTH.labels - 2)
      .setVisible(false);
  }

  /**
   * seat: 근처 빈 좌석 (없으면 null). sittingFor: 앉은 지 몇 ms (앉아 있지 않으면 -1).
   * hidden: 묘비 툴팁이 우선이라 숨겨야 할 때.
   */
  update(
    seat: Seat | null,
    player: { x: number; y: number },
    sittingFor: number,
    hidden: boolean,
    labelScale: number,
    other: { x: number; y: number; text: string } | null = null,
    standText: string | null = null,
  ): void {
    const t = this.text;
    if (t.scaleX !== labelScale) t.setScale(labelScale);
    if (sittingFor >= 0) {
      if (sittingFor > SITTING_HINT_MS || hidden) {
        t.setVisible(false);
        return;
      }
      const label = standText ?? this.standLabel;
      if (t.text !== label) this.set(label);
      t.setPosition(Math.round(player.x), player.y + 3).setAlpha(Math.min(1, (SITTING_HINT_MS - sittingFor) / 600)).setVisible(true);
      return;
    }
    if (!seat && other && !hidden) {
      if (t.text !== other.text) this.set(other.text);
      t.setPosition(Math.round(other.x), other.y + 4).setAlpha(1).setVisible(true);
      return;
    }
    if (!seat || hidden) {
      t.setVisible(false);
      return;
    }
    if (t.text !== this.sitLabel) t.setText(this.sitLabel);
    t.setPosition(seat.x, seat.y + 4).setAlpha(1).setVisible(true);
  }

  private set(text: string): void {
    this.atlas.ensure(text);
    this.text.setText(text);
  }

  destroy(): void {
    this.text.destroy();
  }
}

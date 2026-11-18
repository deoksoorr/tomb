import type * as Phaser from "phaser";
import { ambienceAt, type AmbienceOverride } from "@/lib/ambience";
import type { Player } from "../entities/Player";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Lighting } from "../world/Lighting";
import type { Sfx } from "../world/Sfx";
import { Folk } from "../world/life/Folk";
import type { SnowNpc } from "../world/snowNpc";
import { CAMP_FOLK, campFolkWorld } from "./campLifeData";

// 11/16 언젠가 캠핑장 주민 (장작 아재·캠핑카 아빠·콩이·산악회 대장·강태공 할배·별바라기·고양이 도토리).
// CampScene은 이 클래스 하나만 들고 몇 군데(만들기·매 프레임·E·발밑 안내·빛·정리)에서 부른다.
// 위치는 folkSim(채널 시드 + 서버 시계)이라 같은 채널 모두가 같은 자리. 관리소 NPC(언젠가 씨 등)는 그대로 campTalk가 맡는다.

export type CampLifeDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  player: () => Player;
  net: () => RealtimeClient;
  override: AmbienceOverride;
};

export class CampLife {
  private readonly folk: Folk;
  private destroyed = false;

  constructor(private readonly d: CampLifeDeps) {
    this.folk = new Folk({
      scene: d.scene,
      atlas: d.atlas,
      sfx: d.sfx,
      reduced: d.reduced,
      defs: CAMP_FOLK,
      world: () => campFolkWorld(d.override),
      lineCtx: () => {
        const a = ambienceAt(Date.now(), d.override);
        return { phase: a.phase, weather: a.weather };
      },
    });
  }

  update(dt: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    if (this.destroyed) return;
    const net = this.d.net();
    const ch = net.online ? net.channel : null;
    this.folk.setSeed(ch !== null && Number.isFinite(ch) && ch > 0 ? ch : 1);
    this.folk.update(net.serverNow(), dt, view, labelScale, this.d.player());
  }

  /** E: 바로 옆 주민에게 말 걸기 (고양이는 쓰다듬기). 했으면 true */
  talk(): boolean {
    return !this.destroyed && this.folk.talk(this.d.player());
  }

  /** 발밑 안내 (CampScene seatHint "other" 모양) */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    if (this.destroyed) return null;
    const pl = this.d.player();
    const h = this.folk.hint(prefix, pl.x, pl.y);
    return h ? { x: pl.x, y: pl.y + 2, text: h.text } : null;
  }

  /** 11/18 눈싸움: 맞을 수 있는 캠핑장 주민·동물 */
  snowNpcs(): readonly SnowNpc[] {
    return this.destroyed ? [] : this.folk.snowNpcs();
  }

  addLights(lit: Lighting): void {
    if (!this.destroyed) this.folk.addLights(lit);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.folk.destroy();
  }
}

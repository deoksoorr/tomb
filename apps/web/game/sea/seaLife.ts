import type * as Phaser from "phaser";
import { tideLevel, tideOpen } from "@tomb/protocol";
import { ambienceAt, type AmbienceOverride } from "@/lib/ambience";
import type { Player } from "../entities/Player";
import type { RealtimeClient } from "../net/RealtimeClient";
import type { GlyphAtlas } from "../text/GlyphAtlas";
import type { Lighting } from "../world/Lighting";
import type { Sfx } from "../world/Sfx";
import { Folk } from "../world/life/Folk";
import { playLife } from "../world/life/sounds";
import { SEA_FOLK, SEA_FOLK_PAIRS, seaFolkWorld } from "./seaLifeData";
import { tideNow } from "./tideClock";

// 11/16 달물결 포구 주민 (해녀 할망·조개 할매·얼음 총각·구조요원·여행 온 둘·해변 강아지·밤 산책 유령).
// SeaScene은 이 클래스 하나만 들고 몇 군데(만들기·매 프레임·E·발밑 안내·빛·정리)에서 부른다.
// 위치는 folkSim(채널 시드 + 서버 시계)이라 같은 채널 모두가 같은 자리. 아래 반응은 내 화면에서만:
//  - 큰 파도가 밀려오면 망보던 구조요원이 호루라기를 불고, 물가에서 놀던 강아지가 깜짝 놀라 뭍으로 달아난다.

export type SeaLifeDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  sfx: Sfx;
  reduced: boolean;
  player: () => Player;
  net: () => RealtimeClient;
  /** 지금 물가 (SeaMap.waterState — 파도가 밀려온 맨 위 edgeY와 물가 선 lineY) */
  water: () => { lineY: number; edgeY: number };
  /** 주소 ?time·?weather 시험 값 */
  override: AmbienceOverride;
};

/** 이만큼(px) 넘게 밀려오면 큰 파도 */
const BIG_SURGE = 38;
const CALM_SURGE = 26;
const WHISTLE_RADIUS = 420;

export class SeaLife {
  private readonly folk: Folk;
  private surgeArmed = true;
  private whistleAt = 0;
  private destroyed = false;

  constructor(private readonly d: SeaLifeDeps) {
    this.folk = new Folk({
      scene: d.scene,
      atlas: d.atlas,
      sfx: d.sfx,
      reduced: d.reduced,
      defs: SEA_FOLK,
      pairs: SEA_FOLK_PAIRS,
      world: () => seaFolkWorld(d.override),
      lineCtx: () => {
        const a = ambienceAt(Date.now(), d.override);
        const t = tideNow();
        return { phase: a.phase, weather: a.weather, tide: tideOpen(t) ? "low" : tideLevel(t) > 0.75 ? "high" : null };
      },
    });
    d.atlas.ensure("삐익!");
  }

  private seed(): number {
    const net = this.d.net();
    const ch = net.online ? net.channel : null;
    return ch !== null && Number.isFinite(ch) && ch > 0 ? ch : 1;
  }

  update(dt: number, view: Phaser.Geom.Rectangle, labelScale: number): void {
    if (this.destroyed) return;
    this.folk.setSeed(this.seed());
    this.folk.update(this.d.net().serverNow(), dt, view, labelScale, this.d.player());
    this.waves();
  }

  /** 큰 파도: 구조요원 호루라기 · 강아지 달아나기 (파도 하나에 한 번) */
  private waves(): void {
    const w = this.d.water();
    const surge = w.lineY - w.edgeY;
    if (surge < CALM_SURGE) this.surgeArmed = true;
    if (!this.surgeArmed || surge < BIG_SURGE) return;
    this.surgeArmed = false;
    const pl = this.d.player();
    const pnow = performance.now();
    for (const r of this.folk.views) {
      if (!r.visible || r.pose.hidden) continue;
      if (r.sim.def.id === "lifeguard" && r.pose.act === "watch" && !r.pose.moving && pnow > this.whistleAt) {
        this.whistleAt = pnow + 6000;
        this.folk.say(r, "삐익!");
        const dist = Math.hypot(r.x - pl.x, r.y - pl.y);
        if (dist < WHISTLE_RADIUS) whistle(this.d.sfx, 0.5 * (1 - dist / WHISTLE_RADIUS), Math.max(-1, Math.min(1, (r.x - pl.x) / 260)));
      }
      // 물가 가까이 있던 강아지는 뭍으로 후다닥 (1.6초 뒤 제자리로)
      if (r.sim.def.kind === "dog" && r.y > w.edgeY - 30) {
        this.folk.shove(r, 0, -Math.min(34, r.y - w.edgeY + 34), 1600);
        const dist = Math.hypot(r.x - pl.x, r.y - pl.y);
        if (dist < 160) playLife(this.d.sfx, "yip", 0.2 * (1 - dist / 160));
      }
    }
  }

  /** E: 바로 옆 주민에게 말 걸기 (강아지는 쓰다듬기). 했으면 true */
  talk(): boolean {
    return !this.destroyed && this.folk.talk(this.d.player());
  }

  /** 발밑 안내 (SeaScene seatHint "other" 모양) */
  hint(prefix: string): { x: number; y: number; text: string } | null {
    if (this.destroyed) return null;
    const pl = this.d.player();
    const h = this.folk.hint(prefix, pl.x, pl.y);
    return h ? { x: pl.x, y: pl.y + 2, text: h.text } : null;
  }

  /** 걷거나 뛰는 주민 (갈매기가 놀라 날아오르게 actors에 더한다) */
  movers(out: { x: number; y: number }[]): void {
    if (!this.destroyed) this.folk.movers(out);
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

/** 구조요원 호루라기 "삐익" (높은 사인파 두 번 + 떨림). 효과음 갈래 음량을 따른다 */
function whistle(sfx: Sfx, gain: number, pan: number): void {
  const ac = sfx.audio();
  if (!ac || gain <= 0.01) return;
  const t = ac.currentTime + 0.01;
  const out = ac.createGain();
  out.gain.value = Math.min(1, sfx.volume * gain);
  let tail: AudioNode = out;
  if (typeof ac.createStereoPanner === "function") {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    out.connect(p);
    tail = p;
  }
  tail.connect(sfx.output);
  for (const [at, dur] of [
    [0, 0.16],
    [0.22, 0.42],
  ] as const) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    o.type = "sine";
    o.frequency.value = 2900;
    lfo.frequency.value = 38;
    lg.gain.value = 90;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
    g.gain.setValueAtTime(0.12, t + at + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    o.connect(g).connect(out);
    o.start(t + at);
    lfo.start(t + at);
    o.stop(t + at + dur + 0.05);
    lfo.stop(t + at + dur + 0.05);
  }
}

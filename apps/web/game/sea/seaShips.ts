import * as Phaser from "phaser";
import { SEA_WIDTH } from "@tomb/protocol";
import { DEPTH } from "../config";
import { AudioHost } from "../world/audioHost";
import * as Art from "./seaArt";
import { SEA_DEPTH } from "./SeaMap";
import { shipsAt, squidBoatsAt, type ShipPass } from "./seaShipsPlan";

// 11/16 r15 먼바다 풍경 (그림·소리만): 먼 배가 가끔 지나가며 뱃고동을 울리고, 밤엔 오징어잡이배 등불이 먼바다에 떠요.
// 모두 물 층 바로 위(SEA_DEPTH — 바닥 장식 쪽)라 놀거리·사람·물건보다 늘 뒤에 그려져요.
// 11/16 r19 배 몸통은 단단해요 (seaShipsPlan.shipHulls — 헤엄·놀거리가 부딪혀 튕겨요), 오징어잡이배 불빛은 밤 어둠 위(빛 층)에.
// 그림은 처음 한 번 구운 것만 쓰고(풀), 매 프레임은 자리·색만 바꿔요.

const SHIP_DEPTH = SEA_DEPTH.shimmer + 6;
const MAX_SHIPS = 2;
const MAX_SQUID = 4;

type ShipView = { body: Phaser.GameObjects.Image; wake: Phaser.GameObjects.Image; bow: Phaser.GameObjects.Image; light: Phaser.GameObjects.Image; refl: Phaser.GameObjects.Image; slot: number };
type SquidView = {
  hull: Phaser.GameObjects.Image;
  lamps: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  cols: Phaser.GameObjects.Image[];
  /** 11/16 r19 줄줄이 매단 전구마다 작은 빛 · 배 아래 물에 고인 빛 */
  bulbs: Phaser.GameObjects.Image[];
  pool: Phaser.GameObjects.Image;
};
/** 11/16 r19 사용자 "오징어잡이배 불빛이 너무 약해요" → 등불·빛무리·물빛은 밤 어둠 막 위(빛 층)에 그려요 (어둠에 묻히지 않게) */
const LIGHT_DEPTH = DEPTH.lights + 2;
/** 전구 빛을 따로 얹을 자리 (등 줄에서 몇 개 골라요) */
const BULB_PICK = [0, 3, 6, 9, 11, 14];

/** 뱃고동 (파일 없이 합성 — 낮게 깔리는 두 음 + 멀리서 들리듯 낮은 통과 필터. 환경음 갈래 볼륨을 따라요) */
export class SeaHornSound extends AudioHost {
  constructor() {
    super("amb");
  }
  horn(gain: number, pan: number): void {
    if (this.muted || this.volume <= 0 || this.hidden || gain <= 0.01) return;
    const ac = this.audio();
    if (!ac) return;
    const t = ac.currentTime + 0.02;
    const dur = 2.6;
    const v = Math.max(0.001, Math.min(1, this.volume * gain) * 0.35);
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(v, t + 0.35);
    out.gain.setValueAtTime(v, t + dur - 0.9);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 340;
    lp.Q.value = 0.9;
    lp.connect(out).connect(p).connect(this.output);
    const oscs = [
      { f: 69, type: "sawtooth" as const, g: 0.6 },
      { f: 103.5, type: "sawtooth" as const, g: 0.4 },
      { f: 138.6, type: "square" as const, g: 0.12 },
    ].map(({ f, type, g }) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.3);
      const gg = ac.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    });
    oscs[0].onended = () => out.disconnect();
  }
  destroy(): void {
    this.closeAudio();
  }
}

export class SeaShips {
  private readonly ships: ShipView[] = [];
  private readonly squids: SquidView[] = [];
  private readonly horned = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    /** 뱃고동 (크기 0..1, 좌우 -1..1) */
    private readonly onHorn: (gain: number, pan: number) => void,
  ) {
    const s = scene;
    const T = Art.SEA_TEX;
    for (let i = 0; i < MAX_SHIPS; i++) {
      const wake = s.add.image(0, 0, T.wake).setDepth(SHIP_DEPTH - 1).setVisible(false);
      const body = s.add.image(0, 0, T.ship("tanker")).setOrigin(0.5, 1).setDepth(SHIP_DEPTH).setVisible(false);
      const light = s.add.image(0, 0, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setDepth(SHIP_DEPTH + 1).setVisible(false);
      // r15 물빛 반사 (물높이 아래로 깨진 짙은 줄 — 배가 물에 잠겨 보여요)
      const refl = s.add.image(0, 0, T.shipReflect("tanker")).setOrigin(0.5, 0).setDepth(SHIP_DEPTH - 1).setVisible(false);
      // r19 뱃머리 물결 (배가 단단해지며 — 가까운 튜브·카약이 이 물결에 흔들려요)
      const bow = s.add.image(0, 0, T.wake).setDepth(SHIP_DEPTH - 1).setVisible(false);
      this.ships.push({ body, wake, bow, light, refl, slot: -1 });
    }
    for (let i = 0; i < MAX_SQUID; i++) {
      const cols = [0, 1, 2, 3, 4].map(() => s.add.image(0, 0, T.lightColumn).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(LIGHT_DEPTH - 1).setVisible(false));
      const hull = s.add.image(0, 0, T.squid).setOrigin(0.5, 1).setDepth(SHIP_DEPTH).setVisible(false);
      const pool = s.add.image(0, 0, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xd8ffe0).setDepth(LIGHT_DEPTH - 1).setVisible(false);
      const lamps = s.add.image(0, 0, T.squidLamps).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(LIGHT_DEPTH + 1).setVisible(false);
      const glow = s.add.image(0, 0, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xe8ffd8).setDepth(LIGHT_DEPTH).setVisible(false);
      const bulbs = BULB_PICK.map((_, j) => s.add.image(0, 0, T.lampGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(j % 2 ? 0xd8ffd0 : 0xffffff).setDepth(LIGHT_DEPTH + 2).setVisible(false));
      this.squids.push({ hull, lamps, glow, cols, bulbs, pool });
    }
  }

  /** darkness 0 낮 ~ 1 밤, dusk 0..1 (노을), px = 내 캐릭터 x (뱃고동 좌우) */
  update(now: number, darkness: number, dusk: number, px: number): void {
    const wall = Date.now();
    // 먼 배: 안개 낀 듯 바다 빛으로 흐리게 (밤엔 더 어둡게, 노을엔 분홍빛)
    const haze = darkness > 0.5 ? 0x5a6a90 : dusk > 0.3 ? 0xe8b8c8 : 0xc0d4e8;
    const live = shipsAt(wall).slice(0, MAX_SHIPS);
    this.ships.forEach((v, i) => {
      const s = live[i];
      if (!s) {
        v.body.setVisible(false);
        v.wake.setVisible(false);
        v.bow.setVisible(false);
        v.light.setVisible(false);
        v.refl.setVisible(false);
        return;
      }
      this.drawShip(v, s.pass, s.x, now, haze, darkness);
      this.maybeHorn(s.pass, wall, s.x, px, darkness);
    });
    // 오징어잡이배: 해 진 뒤에만 (노을 끝 무렵부터 서서히)
    const on = Math.max(0, Math.min(1, (darkness - 0.25) / 0.35));
    const boats = on > 0.01 ? squidBoatsAt(wall) : [];
    this.squids.forEach((v, i) => {
      const b = boats[i];
      const vis = !!b;
      v.hull.setVisible(vis);
      v.lamps.setVisible(vis);
      v.glow.setVisible(vis);
      v.pool.setVisible(vis);
      for (const c of v.cols) c.setVisible(vis);
      for (const g of v.bulbs) g.setVisible(vis);
      if (!b) return;
      const k = this.reduced ? 0 : 1;
      const bob = Math.sin(now / 1300 + b.i * 2.1) * 0.8 * k;
      const x = Math.round(b.x);
      const y = Math.round(b.y + bob);
      v.hull.setPosition(x, y).setTint(0x6a7894).setAlpha(on * 0.9);
      const flick = 0.85 + (this.reduced ? 0 : 0.15 * Math.sin(now / 90 + b.i * 3));
      // r19 아주 밝게: 등 줄 (두 번 겹쳐 더 하얗게) · 큰 빛무리 · 전구마다 작은 빛 · 물에 고인 빛 · 길게 일렁이는 빛 기둥
      v.lamps.setPosition(x, y).setScale(1).setAlpha(Math.min(1, on * 1.2 * flick));
      v.glow.setPosition(x, y - 14).setScale(6, 3.4).setAlpha(on * 0.95 * flick);
      v.bulbs.forEach((g, j) => {
        const [bx, by] = Art.SQUID_BULBS[BULB_PICK[j]] ?? [Art.SQUID_W / 2, 10];
        const tw = this.reduced ? 1 : 0.8 + 0.2 * Math.sin(now / (70 + j * 13) + j * 1.7 + b.i);
        g.setPosition(x - Art.SQUID_W / 2 + bx, y - Art.SQUID_H + by).setScale(0.7).setAlpha(on * tw);
      });
      v.pool.setPosition(x, y + 6).setScale(7.5, 1.6).setAlpha(on * 0.7 * flick);
      v.cols.forEach((c, j) => {
        const sway = this.reduced ? 1 : 0.85 + 0.25 * Math.sin(now / (380 + j * 110) + b.i + j);
        c.setPosition(x - 20 + j * 10, y + 1).setScale(1.3, 1.8 * sway).setAlpha(on * (0.85 + 0.15 * Math.sin(now / 260 + j * 2 + b.i)));
      });
    });
  }

  /** 11/16 r19 밤 어둠 막에 오징어잡이배 불빛 구멍 (배 위 · 물에 고인 빛) */
  addLights(lit: { add(x: number, y: number, r: number, a: number): void }, darkness: number): void {
    const on = Math.max(0, Math.min(1, (darkness - 0.25) / 0.35));
    if (on <= 0.01) return;
    for (const b of squidBoatsAt(Date.now())) {
      lit.add(b.x, b.y - 14, 120, on * 0.95);
      lit.add(b.x, b.y + 20, 110, on * 0.75);
    }
  }

  private drawShip(v: ShipView, p: ShipPass, x: number, now: number, haze: number, darkness: number): void {
    const T = Art.SEA_TEX;
    const key = p.kind === "fishing" ? T.boat : T.ship(p.kind);
    if (v.body.texture.key !== key) v.body.setTexture(key);
    const bob = this.reduced ? 0 : Math.sin(now / 1500 + p.slot) * 0.6;
    // r15 사용자: 지도와 같은 도트 크기 (늘이지 않아요)
    const scale = 1;
    const bodyAlpha = darkness > 0.5 ? 0.55 : 0.78;
    v.body
      .setVisible(true)
      .setPosition(Math.round(x), Math.round(p.y + bob))
      .setScale(scale)
      // 그림은 뱃머리가 오른쪽 (고깃배 그림은 왼쪽) → 가는 쪽을 보게
      .setFlipX(p.kind === "fishing" ? p.dir > 0 : p.dir < 0)
      .setTint(haze)
      .setAlpha(bodyAlpha);
    if (v.slot !== p.slot) v.slot = p.slot;
    const rk = T.shipReflect(p.kind);
    if (v.refl.texture.key !== rk) v.refl.setTexture(rk);
    v.refl
      .setVisible(true)
      .setPosition(Math.round(x), Math.round(p.y + bob))
      .setFlipX(p.dir < 0)
      .setScale(1, this.reduced ? 1 : 1 + 0.15 * Math.sin(now / 700 + p.slot))
      .setTint(haze)
      .setAlpha(bodyAlpha);
    // 고물 뒤로 옅은 물살 자국
    const w = (p.kind === "fishing" ? 34 : Art.SHIP_W[p.kind]) * scale;
    v.wake
      .setVisible(true)
      .setPosition(Math.round(x - p.dir * (w / 2 + 10)), p.y - 1)
      .setScale(4.5, 0.9)
      .setAlpha(0.28 * bodyAlpha);
    const surge = this.reduced ? 1 : 1 + 0.12 * Math.sin(now / 260 + p.slot);
    v.bow
      .setVisible(true)
      .setPosition(Math.round(x + p.dir * (w / 2 - 2)), p.y - 2)
      .setScale(1.6 * surge, 1.1)
      .setAlpha(0.45 * bodyAlpha);
    // 밤: 선교 불빛 하나
    const lit = Math.max(0, Math.min(1, (darkness - 0.3) * 2));
    v.light
      .setVisible(lit > 0.02 && p.kind !== "fishing")
      .setPosition(Math.round(x - p.dir * (w / 2 - 16)), p.y - 18)
      .setTint(0xffe2a8)
      .setScale(0.5)
      .setAlpha(lit * 0.8);
  }

  private maybeHorn(p: ShipPass, wall: number, x: number, px: number, darkness: number): void {
    if (p.horn < 0 || this.horned.has(p.slot) || wall < p.t0 + p.horn) return;
    this.horned.add(p.slot);
    if (this.horned.size > 32) this.horned.delete(this.horned.values().next().value as number);
    // 밤엔 드물게 (조용한 밤바다)
    if (darkness > 0.5 && (p.slot * 7919) % 10 >= 4) return;
    // 늦게 들어와 이미 한참 지난 고동은 울리지 않아요
    if (wall - (p.t0 + p.horn) > 8_000) return;
    const d = Math.abs(x - px);
    this.onHorn(0.35 + 0.65 * Math.max(0, 1 - d / SEA_WIDTH), (x - px) / (SEA_WIDTH / 2));
  }

  destroy(): void {
    for (const v of this.ships) {
      v.body.destroy();
      v.wake.destroy();
      v.bow.destroy();
      v.light.destroy();
      v.refl.destroy();
    }
    for (const v of this.squids) {
      v.hull.destroy();
      v.lamps.destroy();
      v.glow.destroy();
      v.pool.destroy();
      for (const g of v.bulbs) g.destroy();
      for (const c of v.cols) c.destroy();
    }
    this.ships.length = 0;
    this.squids.length = 0;
  }
}

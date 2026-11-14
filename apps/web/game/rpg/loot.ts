import * as Phaser from "phaser";
import type { Drop } from "@/lib/rpg/types";
import { iconCanvas } from "./icons";
import { LOOT_MAX, lootLook, scatter, stackLabels, type LootLook } from "./lootLook";
import { lootSound, type LootSoundEv } from "./lootSound";
import { DEPTH_GROUND, SKT, type SkillFx } from "./skillFx";
import type { Layer } from "./skillSound";
import { RTEX } from "./sprites";

// 사냥터 바닥 드롭 연출 (보여 주기만 — 보상은 언제나 서버가 정하고 결과 화면도 그대로).
// 판이 끝나는 순간 서버와 같은 식으로 굴린 드롭(lib/rpg/rewards huntDropsFor)을 마지막으로 잡은 몬스터 자리에서 튀어 올려
// 바닥에 떨군다. 아이콘은 가방·상점과 같은 그림(icons.ts), 등급별 모양은 lootLook.ts, 소리는 lootSound.ts.
//  - 흐름: 튀어 오름(포물선) → 바닥에 닿음(등급별 섬광·소리, 빛기둥이 솟음) → 놓여 있음(맥동·빛 알갱이·이름표)
//          → 밟거나 가까이 가면 빨려 들어옴. 놓쳐도 일정 시간 뒤 스스로 날아온다 (잃지 않음)
//  - 층: 바닥 고리·바닥빛은 바닥 효과 바로 위, 아이콘·기둥은 캐릭터와 y 정렬, 이름표는 연출 위·피해 숫자(1e6) 아래
//  - 성능: 한 화면 LOOT_MAX개, 칸(이미지·글자·그래픽 묶음)은 풀에서 재사용, 입자는 SkillFx 풀(상한 있음)
//  - 동작 줄이기: 기둥 맥동·빛 알갱이·화면 섬광·흔들림 없이, 가장자리 빛은 옅게 한 번

const FONT = '"Galmuri11", "Galmuri9", monospace';
const TEX_BEAM = "rpg-loot-beam";
const TEX_EDGE = "rpg-loot-edge";
/** 튀어 오르는 시간 · 여러 개일 때 사이 간격 (ms, 게임 시간) */
const FLY_MS = 560;
const STAGGER_MS = 260;
/** 바닥에 닿은 뒤 이만큼 지나면 스스로 날아온다 (쓰러졌거나 시간이 끝나 움직일 수 없으면 짧게) */
const AUTO_MS = 3000;
const AUTO_FROZEN_MS = 900;
/** 이 거리 안이면 빨려 들어온다 (월드 px) */
const PICK_R = 18;
/** 바닥에 닿고 이만큼은 가까이 있어도 빨려 들지 않는다 (섬광·기둥이 보이게): 기본 + 단계마다 */
const SHOW_MS = 350;
const SHOW_PER_TIER_MS = 250;
/** 이름표 깊이: 연출(1e5대)·화면 연출 그림(5e5) 위, 피해 숫자(1e6) 아래 */
const DEPTH_LABEL = 9e5;
const DEPTH_EDGE = 9.5e5;
const DEPTH_NOTICE = 1.5e6;

export type LootHost = {
  /** 게임 시간 ms (멈춤을 뺀 경과) */
  now(): number;
  /** 빨려 들어갈 곳 (캐릭터 몸 가운데) */
  target(): { x: number; y: number };
  /** 장애물을 피한 빈자리 */
  place(x: number, y: number): { x: number; y: number };
  /** 효과음 한 묶음 */
  synth(key: string, layers: Layer[]): void;
  /** 화면 흔들림 (흔들림 끄기·동작 줄이기를 따른다) */
  shake(ms: number, k: number): void;
  /** 주웠을 때 떠오르는 글자 */
  float(x: number, y: number, text: string, color: string): void;
};

type Slot = {
  shadow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  beam: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  /** 기둥 둘레 번짐 (가산) */
  halo: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

type Item = {
  look: LootLook;
  slot: Slot;
  /** 튀어 오른 자리 → 떨어질 자리 */
  sx: number;
  sy: number;
  x: number;
  y: number;
  /** 지금 아이콘 자리 (빨려 들어갈 때 움직인다) */
  cx: number;
  cy: number;
  state: "wait" | "fly" | "ground" | "pull";
  /** 튀어 오르기 시작 (게임 시간) */
  t0: number;
  arc: number;
  landedAt: number;
  pullAt: number;
  speed: number;
  nextMote: number;
  lift: number;
  seed: number;
};

/** 빛기둥 그림: 가운데가 밝고 가장자리·위로 갈수록 계단처럼 옅어진다 (도트 느낌을 살리려고 최근접 필터) */
function beamCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const w = 12;
  const h = 64;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return null;
  const col = [0.12, 0.3, 0.5, 0.72, 0.9, 1, 1, 0.9, 0.72, 0.5, 0.3, 0.12];
  for (let y = 0; y < h; y++) {
    // 위 끝은 투명, 아래 1/4은 가득. 8단 계단
    const v = Math.min(1, (y / h) * 1.35);
    const row = Math.round(Math.pow(v, 0.85) * 8) / 8;
    for (let x = 0; x < w; x++) {
      const a = Math.round(col[x] * row * 6) / 6;
      if (a <= 0) continue;
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/** 화면 가장자리 빛 (가운데는 비고 테두리로 갈수록 밝다) */
function edgeCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d");
  if (!c) return null;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.68, "rgba(255,255,255,0)");
  g.addColorStop(0.88, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0.9)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  return cv;
}

export class LootLayer {
  private items: Item[] = [];
  private pool: Slot[] = [];
  private edge: { img: Phaser.GameObjects.Image; t0: number; color: number } | null = null;
  private notice: { text: Phaser.GameObjects.Text; t0: number; tier: number } | null = null;
  /** 움직일 수 없는 끝(쓰러짐·시간 끝)이면 빨리 날아온다 */
  private frozen = false;
  /** 남은 것을 모두 지금 끌어온다 */
  private rushing = false;
  private readonly mobile: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: LootHost,
    private readonly fx: SkillFx,
    private readonly reduced: boolean,
  ) {
    this.mobile = fx.mobile;
    const tx = scene.textures;
    if (!tx.exists(TEX_BEAM)) {
      const cv = beamCanvas();
      if (cv) tx.addCanvas(TEX_BEAM, cv);
    }
    if (!tx.exists(TEX_EDGE)) {
      const cv = edgeCanvas();
      if (cv) tx.addCanvas(TEX_EDGE, cv)?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  /** 바닥에 남은(아직 안 들어온) 드롭 수 */
  get count(): number {
    return this.items.length;
  }

  /**
   * 드롭을 (sx,sy)에서 튀어 올린다. 낮은 등급부터 차례로 → 가장 좋은 것이 마지막에 떨어진다.
   * frozen: 캐릭터가 움직일 수 없으니 바닥에 닿고 잠깐 뒤 날아오게. delay: 첫 드롭까지 (ms)
   */
  drop(drops: readonly Drop[], sx: number, sy: number, frozen: boolean, delay = 0): void {
    this.frozen = frozen;
    const looks = drops
      .flatMap((d) => Array.from({ length: Math.max(1, Math.min(4, d.qty)) }, () => lootLook(d)))
      .filter((l): l is LootLook => !!l)
      .sort((a, b) => a.tier - b.tier);
    // 한 화면 상한: 넘치면 낮은 등급부터 바로 들어온 것으로 (연출 없이)
    const room = Math.max(0, LOOT_MAX - this.items.length);
    const keep = looks.slice(Math.max(0, looks.length - room));
    // 캐릭터 반대편으로 흩뿌린다 (캐릭터가 출처 위에 서 있으면 아무 쪽으로)
    const me = this.host.target();
    const away = Math.hypot(sx - me.x, sy - me.y - 8) > 2 ? Math.atan2(sy - me.y - 8, sx - me.x) : undefined;
    const spots = scatter(keep.length, sx, sy, Math.random, 16, away);
    const now = this.host.now();
    keep.forEach((look, i) => {
      const p = this.host.place(spots[i].x, spots[i].y);
      this.ensureIcon(look);
      const slot = this.takeSlot(look);
      this.items.push({
        look,
        slot,
        sx,
        sy,
        x: p.x,
        y: p.y,
        cx: sx,
        cy: sy,
        state: "wait",
        t0: now + delay + i * STAGGER_MS,
        arc: 20 + look.tier * 5,
        landedAt: 0,
        pullAt: 0,
        speed: 0,
        nextMote: 0,
        lift: 0,
        seed: Math.random() * 100,
      });
    });
  }

  /** 남은 것을 모두 지금 캐릭터에게 끌어온다 (판을 끝내기 직전) */
  rush(): void {
    this.rushing = true;
  }

  /** 매 프레임 (게임 시간). 멈춤·히트스톱 동안은 부르지 않는다 */
  update(now: number, dtMs: number): void {
    const tgt = this.host.target();
    let relayout = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.state === "wait") {
        if (now < it.t0) continue;
        it.state = "fly";
        this.showFlying(it);
        this.sound("pop", it.look);
      }
      if (it.state === "fly") {
        const k = Math.min(1, (now - it.t0) / FLY_MS);
        it.cx = it.sx + (it.x - it.sx) * k;
        it.cy = it.sy + (it.y - it.sy) * k;
        const z = 4 * it.arc * k * (1 - k);
        const s = it.slot;
        s.icon.setPosition(Math.round(it.cx), Math.round(it.cy - z)).setDepth(it.cy + 0.2);
        s.shadow.setPosition(it.cx, it.cy).setScale(0.45 + 0.3 * (1 - z / it.arc), 0.8).setAlpha(0.5 + 0.5 * (1 - z / it.arc));
        if (k >= 1) {
          this.land(it, now);
          relayout = true;
        }
        continue;
      }
      if (it.state === "ground") {
        this.idle(it, now);
        const shown = now - it.landedAt >= SHOW_MS + it.look.tier * SHOW_PER_TIER_MS;
        const near = shown && Math.hypot(tgt.x - it.x, tgt.y + 6 - it.y) < PICK_R;
        const wait = this.rushing ? 0 : this.frozen ? AUTO_FROZEN_MS : AUTO_MS;
        if (near || now - it.landedAt >= wait) {
          it.state = "pull";
          it.pullAt = now;
          it.speed = near ? 120 : 70;
          it.slot.label.setVisible(false);
          relayout = true;
        }
        continue;
      }
      // 빨려 들어옴: 점점 빨라지며 캐릭터 몸 가운데로, 기둥·고리는 빨리 걷힌다
      const dt = dtMs / 1000;
      it.speed += (this.rushing ? 1800 : 900) * dt;
      const dx = tgt.x - it.cx;
      const dy = tgt.y - it.cy;
      const d = Math.hypot(dx, dy);
      const stepLen = it.speed * dt;
      const s = it.slot;
      const fade = Math.max(0, 1 - (now - it.pullAt) / 180);
      s.beam.setAlpha(s.beam.alpha * fade);
      s.core.setAlpha(s.core.alpha * fade);
      s.halo.setAlpha(s.halo.alpha * fade);
      s.glow.setAlpha(s.glow.alpha * fade);
      s.ring.setAlpha(fade);
      s.shadow.setAlpha(0.6 * fade);
      if (d <= Math.max(4, stepLen)) {
        this.collect(it, tgt);
        this.items.splice(i, 1);
        this.release(it.slot);
        continue;
      }
      it.cx += (dx / d) * stepLen;
      it.cy += (dy / d) * stepLen;
      const sc = Math.max(0.45, Math.min(1, d / 30));
      s.icon.setPosition(Math.round(it.cx), Math.round(it.cy)).setScale(sc).setDepth(tgt.y + 1);
    }
    if (relayout) this.layoutLabels();
    this.updateEdge(now);
    this.updateNotice(now);
  }

  /** 씬이 끝날 때 (씬이 객체를 함께 지운다 — 장부만 비운다) */
  destroy(): void {
    for (const it of this.items) this.kill(it.slot);
    for (const s of this.pool) this.kill(s);
    this.items = [];
    this.pool = [];
    this.edge?.img.destroy();
    this.notice?.text.destroy();
    this.edge = null;
    this.notice = null;
  }

  // ── 칸 (재사용) ──

  private takeSlot(look: LootLook): Slot {
    const sc = this.scene;
    const s =
      this.pool.pop() ??
      ({
        shadow: sc.add.image(0, 0, RTEX.shadow).setDepth(-499),
        icon: sc.add.image(0, 0, look.tex).setOrigin(0.5, 1),
        glow: sc.add.image(0, 0, SKT.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_GROUND + 8),
        beam: sc.add.image(0, 0, TEX_BEAM).setOrigin(0.5, 1),
        core: sc.add.image(0, 0, TEX_BEAM).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD),
        halo: sc.add.image(0, 0, SKT.glow).setBlendMode(Phaser.BlendModes.ADD),
        ring: sc.add.graphics().setDepth(DEPTH_GROUND + 9),
        label: sc.add
          .text(0, 0, "", { fontFamily: FONT, fontSize: "11px", color: "#ffffff", stroke: "#0a0b10", strokeThickness: 3, resolution: 1 })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH_LABEL),
      } satisfies Slot);
    s.icon.setTexture(look.tex).setScale(1).setAlpha(1).clearTint();
    s.label.setText(look.name).setColor(look.text).setScale(1 / (sc.cameras.main.zoom || 1));
    for (const o of [s.shadow, s.icon, s.glow, s.beam, s.core, s.halo, s.ring, s.label]) o.setVisible(false).setActive(true);
    return s;
  }

  private release(s: Slot): void {
    s.ring.clear();
    for (const o of [s.shadow, s.icon, s.glow, s.beam, s.core, s.halo, s.ring, s.label]) o.setVisible(false).setActive(false);
    this.pool.push(s);
  }

  private kill(s: Slot): void {
    for (const o of [s.shadow, s.icon, s.glow, s.beam, s.core, s.halo, s.ring, s.label]) if (o.scene) o.destroy();
  }

  private ensureIcon(look: LootLook): void {
    if (this.scene.textures.exists(look.tex)) return;
    try {
      this.scene.textures.addCanvas(look.tex, iconCanvas(look.art));
    } catch {
      // 캔버스를 못 만들면 아이콘 없이 (빛만)
    }
  }

  // ── 단계 ──

  private showFlying(it: Item): void {
    const s = it.slot;
    s.icon.setVisible(true).setPosition(it.sx, it.sy).setDepth(it.sy);
    s.shadow.setVisible(true).setPosition(it.sx, it.sy).setScale(0.45, 0.8).setAlpha(0.6);
    // 튀어 오르는 자리에 작은 빛
    this.fx.glow(it.sx, it.sy - 6, 10 + it.look.tier * 3, it.look.light, 260, 0.3, 0.7, it.sy + 1);
  }

  private land(it: Item, now: number): void {
    const { look, slot: s } = it;
    it.state = "ground";
    it.landedAt = now;
    it.cx = it.x;
    it.cy = it.y;
    it.nextMote = now + 200;
    s.icon.setPosition(Math.round(it.x), Math.round(it.y)).setDepth(it.y);
    s.shadow.setPosition(it.x, it.y).setScale(0.75, 0.8).setAlpha(0.6);
    s.label.setVisible(true).setAlpha(0);
    const t = look.tier;
    const lite = this.reduced ? 0.4 : this.mobile ? 0.7 : 1;
    // 모든 등급: 닿는 순간 반짝 + 먼지
    this.fx.twinkle(it.x, it.y - 6, Math.max(1, Math.round((2 + t * 2) * lite)), 8 + t * 2, look.light, 480, 0.4 + t * 0.06);
    this.fx.emit({ x: it.x, y: it.y, tex: SKT.glow, tint: 0xfff3dc, life: 260, s0: 0.12, s1: 0.32, sy: 0.4, alpha: 0.5, depth: DEPTH_GROUND + 7 });
    if (t >= 1) {
      // 바닥 고리가 퍼지며 자리를 잡고, 빛기둥이 솟는다
      this.fx.ring(it.x, it.y, look.ringR * 1.8, look.beam, 420, 2, 0, DEPTH_GROUND + 9);
      s.glow.setVisible(true).setTint(look.beam).setPosition(it.x, it.y).setScale((look.ringR * 1.6) / 32, (look.ringR * 0.7) / 32);
      s.beam.setVisible(true).setTint(look.beam).setPosition(it.x, it.y + 1).setDepth(it.y - 0.3);
      s.core.setVisible(true).setTint(look.light).setPosition(it.x, it.y + 1).setDepth(it.y - 0.2);
      s.halo.setVisible(true).setTint(look.beam).setDepth(it.y - 0.4);
      s.ring.setVisible(true).setAlpha(1);
    }
    if (t >= 2) {
      // 섬광: 바닥빛이 크게 번지고 불티가 위로
      this.fx.glow(it.x, it.y - 8, 22 + t * 6, look.light, 300, 0.2, 0.9, it.y + 2);
      this.fx.sparks(it.x, it.y - 4, Math.round((5 + t * 3) * lite), [look.light, look.beam, 0xffffff], 90 + t * 20, { ang: -Math.PI / 2, spread: 1.6, ay: 120, life: 460 });
    }
    if (t >= 3) {
      this.fx.ring(it.x, it.y, 46, look.light, 620, 3, 60, DEPTH_GROUND + 9);
      this.fx.screenFlash(look.light, 0.2, 220);
      this.host.shake(160, 0.0035);
    }
    if (look.edge) this.showEdge(now, look.beam);
    if (look.notice) this.showNotice(now, look.notice, look.text, t);
    this.sound("land", look);
  }

  /** 놓여 있는 동안: 아이콘 까딱, 기둥 맥동·솟음, 고리 돌기, 빛 알갱이 */
  private idle(it: Item, now: number): void {
    const { look, slot: s } = it;
    const age = now - it.landedAt;
    // 닿은 뒤 짧게 한 번 통 튄다
    const hop = age < 180 ? Math.sin((age / 180) * Math.PI) * 3 : 0;
    const bob = this.reduced ? 0 : Math.round(Math.sin(now / 320 + it.seed));
    s.icon.setPosition(Math.round(it.x), Math.round(it.y - hop - Math.max(0, bob)));
    // 이름표는 화면 1:1 크기 (줌을 거꾸로 곱한다 — 창 크기가 바뀌면 줌도 바뀐다)
    s.label
      .setPosition(it.x, it.y - 17 - it.lift)
      .setScale(1 / (this.scene.cameras.main.zoom || 1))
      .setAlpha(Math.min(1, age / 220));
    if (look.tier === 0) {
      // 일반·물약: 가끔 작은 별 하나
      if (now >= it.nextMote) {
        it.nextMote = now + (this.reduced ? 1800 : 900) + Math.random() * 400;
        this.fx.twinkle(it.x + (Math.random() - 0.5) * 8, it.y - 8 - Math.random() * 6, 1, 0, look.light, 520, 0.35);
      }
      return;
    }
    // 기둥: 닿은 뒤 220ms 동안 아래에서 위로 솟고, 그다음 맥동 (동작 줄이기면 멈춘 채)
    const grow = Math.min(1, age / 220);
    const wave = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now / 240 + it.seed);
    const p = look.pulse;
    const h = (look.beamH / 64) * grow * (1 + (this.reduced ? 0 : 0.06 * p * Math.sin(now / 380 + it.seed)));
    s.beam.setScale(look.beamW / 12, h).setAlpha(look.beamA * (1 - p * 0.25 * wave));
    s.core.setScale((look.beamW * 0.45) / 12, h * 0.94).setAlpha(look.beamA * (0.75 + 0.25 * wave));
    // 둘레 번짐: 기둥 아래쪽이 더 넓게 빛난다
    const hh = look.beamH * grow;
    s.halo.setPosition(it.x, it.y - hh * 0.38).setDisplaySize(look.beamW * 3.2, Math.max(1, hh * 1.05)).setAlpha(look.beamA * (0.22 + 0.18 * wave));
    s.glow.setAlpha(0.35 + 0.35 * look.beamA * (0.6 + 0.4 * wave));
    this.drawRing(it, now, wave);
    // 빛 알갱이: 기둥 안을 타고 오른다
    if (!this.reduced && now >= it.nextMote && look.motes > 0) {
      const rate = look.motes * (this.mobile ? 0.6 : 1);
      it.nextMote = now + 1000 / rate;
      const vy = -(28 + look.tier * 10) * (0.8 + Math.random() * 0.4);
      const life = Math.min(1400, ((look.beamH * 0.8) / -vy) * 1000);
      this.fx.emit({
        x: it.x + (Math.random() - 0.5) * look.beamW * 0.8,
        y: it.y - 2 - Math.random() * 6,
        tex: SKT.ember,
        tint: Math.random() < 0.5 ? look.light : 0xffffff,
        vy,
        life,
        s0: 0.6 + look.tier * 0.08,
        s1: 0.2,
        alpha: 0.95,
        depth: it.y + 0.4,
        fade: 1.6,
      });
    }
  }

  /** 바닥 고리: 안쪽은 맥동하는 실선, 바깥은 천천히 도는 점선 (단계만큼 겹) */
  private drawRing(it: Item, now: number, wave: number): void {
    const { look, slot: s } = it;
    const g = s.ring;
    g.clear();
    const flat = 0.42;
    for (let k = 0; k < look.rings; k++) {
      const r = look.ringR + k * 4 + (this.reduced ? 0 : wave * look.pulse * 1.5);
      const a = (0.85 - k * 0.22) * (0.75 + 0.25 * wave);
      if (k === 0) {
        g.lineStyle(1, look.beam, a).strokeEllipse(it.x, it.y, r * 2, r * 2 * flat);
        g.lineStyle(1, look.light, a * 0.6).strokeEllipse(it.x, it.y, r * 2 - 3, (r * 2 - 3) * flat);
        continue;
      }
      // 점선: 조각 8개가 돈다 (홀수 겹은 반대로)
      const n = 8;
      const spin = this.reduced ? 0 : ((now / 1000) * (0.9 - k * 0.2) * (k % 2 ? 1 : -1)) % (Math.PI * 2);
      g.lineStyle(1, k === 1 ? look.beam : look.light, a);
      for (let j = 0; j < n; j++) {
        const a0 = spin + (j / n) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2) / n / 2;
        g.beginPath();
        for (let q = 0; q <= 4; q++) {
          const aa = a0 + ((a1 - a0) * q) / 4;
          const x = it.x + Math.cos(aa) * r;
          const y = it.y + Math.sin(aa) * r * flat;
          if (q === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    }
  }

  /** 빨려 들어와 가방에 들어감: 캐릭터에 작은 빛 고리 + 이름 */
  private collect(it: Item, tgt: { x: number; y: number }): void {
    const { look } = it;
    this.fx.ring(tgt.x, tgt.y + 6, 10 + look.tier * 3, look.tier ? look.beam : look.light, 300, 2, 0, DEPTH_GROUND + 9);
    this.fx.twinkle(tgt.x, tgt.y - 4, Math.max(1, look.tier + 1), 6, look.light, 380, 0.4);
    this.host.float(tgt.x, tgt.y - 16, `+${look.name}`, look.text);
    this.sound("pick", look);
  }

  /** 바닥 이름표: 겹치면 위로 한 줄씩 */
  private layoutLabels(): void {
    const z = this.scene.cameras.main.zoom || 1;
    const shown = this.items.filter((it) => it.state === "ground");
    const lift = stackLabels(shown.map((it) => ({ x: it.x, y: it.y - 17, w: it.slot.label.width / z + 2, h: it.slot.label.height / z })));
    shown.forEach((it, i) => (it.lift = lift[i]));
  }

  // ── 전설: 화면 가장자리 빛 · 알림 글자 ──

  private showEdge(now: number, color: number): void {
    if (!this.scene.textures.exists(TEX_EDGE)) return;
    this.edge?.img.destroy();
    const img = this.scene.add.image(0, 0, TEX_EDGE).setScrollFactor(0).setDepth(DEPTH_EDGE).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(0);
    this.edge = { img, t0: now, color };
    this.updateEdge(now);
  }

  private updateEdge(now: number): void {
    const e = this.edge;
    if (!e) return;
    const T = this.reduced ? 1600 : 2600;
    const t = (now - e.t0) / T;
    if (t >= 1 || !e.img.scene) {
      e.img.destroy();
      this.edge = null;
      return;
    }
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    // 확대된 카메라에서 화면에 고정: 가운데에 두고 화면 크기 / 확대
    e.img.setPosition(cam.width / 2, cam.height / 2).setDisplaySize(cam.width / z, cam.height / z);
    const env = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    const beat = this.reduced ? 1 : 0.7 + 0.3 * Math.cos(t * Math.PI * 6);
    e.img.setAlpha((this.reduced ? 0.35 : 0.65) * env * beat);
  }

  private showNotice(now: number, msg: string, color: string, tier: number): void {
    // 더 높은 등급 알림이 떠 있으면 덮지 않는다 (전설 > 꾸미기 선물)
    if (this.notice && this.notice.tier > tier) return;
    this.notice?.text.destroy();
    const text = this.scene.add
      .text(0, 0, msg, { fontFamily: FONT, fontSize: "18px", color, stroke: "#0a0b10", strokeThickness: 4, resolution: 1 })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH_NOTICE)
      .setAlpha(0);
    this.notice = { text, t0: now, tier };
    this.updateNotice(now);
  }

  private updateNotice(now: number): void {
    const n = this.notice;
    if (!n) return;
    const age = now - n.t0;
    const T = 2000;
    if (age >= T || !n.text.scene) {
      n.text.destroy();
      this.notice = null;
      return;
    }
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    // 화면 위쪽 1/4: 확대를 되돌린 화면 좌표
    const sy = cam.height * 0.24;
    const pop = this.reduced ? 1 : age < 160 ? 1.35 - 0.35 * (age / 160) : 1;
    const rise = this.reduced ? 0 : Math.min(1, age / 160) * -4;
    n.text.setPosition(cam.width / 2, cam.height / 2 + (sy - cam.height / 2) / z + rise / z).setScale(pop / z);
    n.text.setAlpha(age < 120 ? age / 120 : age > T - 400 ? (T - age) / 400 : 1);
  }

  private sound(ev: LootSoundEv, look: LootLook): void {
    this.host.synth(`loot:${ev}:${look.sound}`, lootSound(ev, look.sound));
  }
}

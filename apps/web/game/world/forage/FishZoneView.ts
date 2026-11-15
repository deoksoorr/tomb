import type * as Phaser from "phaser";
import { DIR, FISH_ARCH, FISHING_SPOTS, type FishingSpot, type Sid } from "@tomb/protocol";
import { DEPTH } from "../../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import type { AquariumResponse } from "@/app/api/forage/aquarium/route";
import { FISH_ARCH_H, FISH_DECOR, fishZoneColliders, TANK_H, TANK_W, TANK_WATER, WHARF_BOARD, WHARF_BOARD_H, WHARF_PLACARD, WHARF_TANKS } from "../fishZone";
import { ensureIconTexture, FTEX } from "./art";
import { ensureZoneTextures, ZTEX } from "./zoneArt";

// 낚시터·낚시 자리 표시 (사용자 요청: "낚시를 어디서 해야 하는지 한눈에").
// - 낚시터 장식: 입구 아치("낚시터" 현판)·그물 말리는 대·통발·물고기 상자·물통·등불 기둥·팻말 (배치 = game/world/fishZone.ts)
// - 낚시 자리마다: 낚시 의자 + 꽂아 둔 낚싯대 + 물 위에 떠 있는 찌(살짝 흔들림) + 찌 둘레 물결 고리.
//   누가 앉으면 꽂아 둔 낚싯대·찌는 치우고(그 사람의 낚싯대를 Foraging이 그린다) 의자만 남긴다.
// - 가까이 오면 의자 위에 낚싯바늘 말풍선이 떠오른다 (남이 쓰는 자리는 회색). "E 낚시하기" 안내는 WorldScene의 상호작용 안내.
// - 11/15 납품 부두: 의뢰 게시판·빈 긴급 의뢰 현판 이름표, 기록 수족관 (이번 주 최대어 1~3위가 수조 안을 헤엄치고 아래 명패 "이름 · 크기cm").
//   수족관 기록은 부두 가까이 왔을 때 처음 한 번, 그 뒤 5분마다 /api/forage/aquarium (서버·CDN 5분 캐시)에서 읽는다

/** 수족관 기록을 처음 읽는 거리 (위 마당에서) */
const AQUA_NEAR = 420;
/** 수족관 기록 다시 읽는 간격 */
const AQUA_REFRESH_MS = 5 * 60_000;

type Tank = {
  x: number;
  y: number;
  fish: Phaser.GameObjects.Image | null;
  bubbles: Phaser.GameObjects.Image[];
  plaque: Phaser.GameObjects.BitmapText;
  who: Phaser.GameObjects.BitmapText;
  sp: string | null;
  phase: number;
};

/** 바라보는 방향 → 단위 벡터 */
const STEP: Record<number, [number, number]> = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] };
/** 꽂아 둔 낚싯대의 찌 거리 (Foraging의 던지는 거리와 같게) */
const CAST = 24;
/** 낚싯바늘 말풍선이 뜨는 거리 (가장 가까운 자리 하나만) */
const HOOK_RADIUS = 40;

type Marker = {
  spot: FishingSpot;
  stool: Phaser.GameObjects.Image;
  rod: Phaser.GameObjects.Graphics;
  bob: Phaser.GameObjects.Image;
  ripple: Phaser.GameObjects.Image;
  hook: Phaser.GameObjects.Image;
  bx: number;
  by: number;
  phase: number;
  busy: boolean;
};

export type FishZoneDeps = {
  scene: Phaser.Scene;
  atlas: GlyphAtlas;
  reduced: boolean;
  addCollider: (x: number, y: number, w: number, h: number) => void;
};

export class FishZoneView {
  private readonly markers: Marker[] = [];
  private readonly labels: Phaser.GameObjects.BitmapText[] = [];
  private labelScale = 1;
  private readonly tanks: Tank[] = [];
  private aquaAt = -Infinity;
  private aquaBusy = false;

  constructor(private readonly d: FishZoneDeps) {
    const scene = d.scene;
    ensureZoneTextures(scene);
    for (const t of ["납품 부두", "의뢰 게시판", "긴급 의뢰", "기록 수족관", "이번 주", "기록 없음", "1위", "2위", "3위"]) d.atlas.ensure(t);
    for (const o of FISH_DECOR) {
      scene.add.image(o.x, o.y + 1, ZTEX.decor(o.kind)).setOrigin(0.5, 1).setDepth(o.y);
    }
    for (const r of fishZoneColliders()) d.addCollider(r.x, r.y, r.w, r.h);
    // 현판 글씨 (아치) · 게시판 · 빈 현판 · 수족관
    this.label(FISH_ARCH.x, FISH_ARCH.y - FISH_ARCH_H + 4, "납품 부두", 0xfff0b8, 0.5);
    this.label(WHARF_BOARD.x, WHARF_BOARD.y - WHARF_BOARD_H - 1, "의뢰 게시판", 0xffe0a8, 1);
    this.label(WHARF_PLACARD.x, WHARF_PLACARD.y - 31, "긴급 의뢰", 0xd8c8b0, 1, 0.7);
    this.label(WHARF_TANKS[1].x, WHARF_TANKS[1].y - TANK_H - 10, "기록 수족관", 0xb8e4ff, 1);
    WHARF_TANKS.forEach((t, i) => {
      this.label(t.x, t.y - TANK_H - 1, `${i + 1}위`, 0xffe39a, 1, 0.9);
      const plaque = this.label(t.x, t.y + 2, "이번 주", 0x9a948a, 0);
      const who = this.label(t.x, t.y + 9, "기록 없음", 0x9a948a, 0, 0.85);
      this.tanks.push({ x: t.x, y: t.y, fish: null, bubbles: [], plaque, who, sp: null, phase: i * 1300 });
    });
    for (const s of FISHING_SPOTS) this.markers.push(this.makeMarker(s));
  }

  private label(x: number, y: number, text: string, tint: number, originY: number, alpha = 1): Phaser.GameObjects.BitmapText {
    const t = this.d.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
    return t;
  }

  // ── 기록 수족관 ──

  /** 수족관 기록 읽기 (가까이 왔을 때 처음, 그 뒤 5분마다). 실패하면 다음 간격에 다시 */
  private pollAquarium(now: number, me: { x: number; y: number }): void {
    if (this.aquaBusy || now - this.aquaAt < AQUA_REFRESH_MS) return;
    if (Math.hypot(me.x - WHARF_TANKS[1].x, me.y - WHARF_TANKS[1].y) > AQUA_NEAR) return;
    this.aquaBusy = true;
    this.aquaAt = now;
    fetch("/api/forage/aquarium")
      .then((r) => (r.ok ? (r.json() as Promise<AquariumResponse>) : null))
      .then((r) => {
        if (r && this.d.scene.sys?.isActive()) this.fillTanks(r);
      })
      .catch(() => {})
      .finally(() => (this.aquaBusy = false));
  }

  private fillTanks(r: AquariumResponse): void {
    const scene = this.d.scene;
    this.tanks.forEach((t, i) => {
      const f = r.top[i];
      const sp = f?.sp ?? null;
      if (sp !== t.sp) {
        t.fish?.destroy();
        t.fish = null;
        for (const b of t.bubbles) b.destroy();
        t.bubbles = [];
        t.sp = sp;
        const key = sp ? ensureIconTexture(scene, sp) : null;
        if (key) {
          t.fish = scene.add.image(t.x, t.y - TANK_H + TANK_WATER.y + TANK_WATER.h / 2, key).setOrigin(0.5, 0.5).setDepth(t.y + 0.5);
          // 수조 칸에 맞게 줄인다 (아이콘 16px → 물 높이의 70% 안)
          const s = Math.min(1, (TANK_WATER.h * 0.75) / Math.max(1, t.fish.height));
          t.fish.setScale(s);
          for (let k = 0; k < 2; k++) t.bubbles.push(scene.add.image(t.x, t.y, ZTEX.bubble).setDepth(t.y + 0.6).setAlpha(0.8));
        }
      }
      // 명패: "이름 · 크기cm" + 낚은 사람 (기록이 없으면 "이번 주 / 기록 없음" 두 줄 — 수조 사이가 좁아 짧게)
      const plaque = f ? `${f.fish} · ${(f.size / 10).toFixed(1)}cm` : "이번 주";
      const who = f ? f.name : "기록 없음";
      this.d.atlas.ensure(plaque);
      if (who) this.d.atlas.ensure(who);
      t.plaque.setText(plaque).setTint(f ? 0xf0e6d0 : 0x9a948a);
      t.who.setText(who).setTint(f ? 0xb0c4d0 : 0x9a948a);
    });
  }

  /** 수조 물고기: 물 칸 안을 좌우로 천천히 오가며 방향을 바꾸고, 공기 방울이 올라간다 */
  private swim(now: number): void {
    for (const t of this.tanks) {
      if (!t.fish) continue;
      const wx0 = t.x - TANK_W / 2 + TANK_WATER.x;
      const wy0 = t.y - TANK_H + TANK_WATER.y;
      const half = (t.fish.displayWidth / 2) | 0;
      const span = Math.max(0, TANK_WATER.w - half * 2 - 2);
      const p = ((now + t.phase) % 9000) / 9000; // 한 바퀴 9초 (가서 돌아온다)
      const u = p < 0.5 ? p * 2 : 2 - p * 2;
      const ease = u * u * (3 - 2 * u);
      const x = Math.round(wx0 + 1 + half + ease * span);
      const y = Math.round(wy0 + TANK_WATER.h / 2 + (this.d.reduced ? 0 : Math.sin((now + t.phase) / 700) * 2));
      t.fish.setPosition(x, y).setFlipX(p >= 0.5);
      t.bubbles.forEach((b, k) => {
        const q = ((now + t.phase + k * 1700) % 3400) / 3400;
        b.setPosition(Math.round(wx0 + 4 + k * 17 + Math.sin(q * 6) * 1), Math.round(wy0 + TANK_WATER.h - 2 - q * (TANK_WATER.h - 3))).setAlpha(this.d.reduced ? 0 : 0.8 * (1 - q));
      });
    }
  }

  private makeMarker(s: FishingSpot): Marker {
    const scene = this.d.scene;
    const [dx, dy] = STEP[s.facing];
    // 의자: 앉은 사람 뒤 (발 위치보다 살짝 위)
    const stool = scene.add.image(s.x, s.y + 2, ZTEX.stool).setOrigin(0.5, 1).setDepth(s.y - 1);
    // 꽂아 둔 낚싯대 (의자 옆 받침대 → 물 쪽으로 기운 대 → 늘어진 줄)
    const hx = s.x + (dy !== 0 ? 7 : -dx * 2);
    const hy = s.y + (dy !== 0 ? 0 : 3);
    // 대 끝: 옆을 보면 물 쪽으로 비스듬히, 위(먼 쪽)를 보면 높이, 아래(화면 앞쪽)를 보면 짧게 앞으로 숙인다
    const tipX = hx + dx * 12 + (dy < 0 ? -2 : dy > 0 ? 2 : 0);
    const tipY = dy < 0 ? hy - 15 : dy > 0 ? hy + 5 : hy - 9;
    const bx = s.x + dx * CAST;
    const by = s.y + dy * CAST - (dy === 0 ? 2 : 0);
    const rod = scene.add.graphics().setDepth(dy < 0 ? s.y - 2 : s.y + 1);
    rod.lineStyle(1, 0x3a2a1a, 1).lineBetween(hx - 1, hy, hx - 1, hy - 4).lineBetween(hx + 1, hy, hx + 1, hy - 4); // 받침대 (Y자)
    rod.lineStyle(1, 0x7a5432, 1).lineBetween(hx, hy - 3, tipX, tipY);
    rod.fillStyle(0xe8d8a8, 1).fillRect(Math.round(hx + (tipX - hx) * 0.3), Math.round(hy - 3 + (tipY - hy + 3) * 0.3) - 1, 2, 2); // 릴
    // 줄: 살짝 늘어지게 (가운데가 처진다)
    const midX = (tipX + bx) / 2;
    const midY = Math.max(tipY, by - 3) + 2;
    rod.lineStyle(1, 0xd8e0e8, 0.45).lineBetween(tipX, tipY, midX, midY).lineBetween(midX, midY, bx, by - 3);
    const ripple = scene.add.image(bx, by, ZTEX.ripple(0)).setOrigin(0.5, 0.5).setDepth(DEPTH.decal + 4).setAlpha(0.55);
    const bob = scene.add.image(bx, by, FTEX.bobber).setOrigin(0.5, 1).setDepth(by + 1);
    const hook = scene.add.image(s.x, s.y - 26, ZTEX.hook).setOrigin(0.5, 1).setDepth(DEPTH.bubble - 3).setVisible(false);
    return { spot: s, stool, rod, bob, ripple, hook, bx, by, phase: (s.x * 7 + s.y * 3) % 1000, busy: false };
  }

  /**
   * 매 프레임. seats = 서버 좌석 점유표, mine = 내가 앉은 낚시 자리 id, me = 내 발 위치 (낚시 중이면 말풍선을 띄우지 않는다)
   */
  update(now: number, view: Phaser.Geom.Rectangle, labelScale: number, seats: ReadonlyMap<string, Sid>, mySid: Sid | null, mine: string | null, me: { x: number; y: number }): void {
    if (labelScale !== this.labelScale) {
      this.labelScale = labelScale;
      for (const l of this.labels) l.setScale(labelScale);
    }
    this.pollAquarium(now, me);
    if (view.right > WHARF_TANKS[0].x - 40 && view.x < WHARF_TANKS[2].x + 40 && view.bottom > WHARF_TANKS[0].y - 40 && view.y < WHARF_TANKS[0].y + 20) this.swim(now);
    // 말풍선: 가장 가까운 자리 하나만 (낚시 중이면 없음)
    let hookAt: Marker | null = null;
    let best = HOOK_RADIUS;
    if (!mine)
      for (const m of this.markers) {
        const dist = Math.hypot(me.x - m.spot.x, me.y - m.spot.y);
        if (dist < best) {
          best = dist;
          hookAt = m;
        }
      }
    for (const m of this.markers) {
      const s = m.spot;
      const owner = seats.get(s.id);
      const busy = mine === s.id || owner !== undefined;
      if (busy !== m.busy) {
        m.busy = busy;
        m.rod.setVisible(!busy);
        m.bob.setVisible(!busy);
        m.ripple.setVisible(!busy);
      }
      const inView = s.x > view.x - 40 && s.x < view.right + 40 && s.y > view.y - 40 && s.y < view.bottom + 40;
      const showHook = m === hookAt && !(owner !== undefined && owner === mySid);
      if (m.hook.visible !== showHook) m.hook.setVisible(showHook);
      if (showHook) {
        // 남이 쓰는 자리는 회색 말풍선 (안내 문구도 회색 "누가 낚시하고 있어요" — WorldScene)
        const taken = owner !== undefined;
        const lift = this.d.reduced || taken ? 0 : Math.sin((now + m.phase) / 260) * 1.5;
        m.hook.setTint(taken ? 0x8a8a8a : 0xffffff).setAlpha(taken ? 0.6 : 1);
        m.hook.setPosition(s.x, Math.round(s.y - 24 - lift));
      }
      if (busy || !inView || this.d.reduced) continue;
      // 찌는 살짝 오르내리고, 물결 고리는 천천히 퍼졌다 사라진다
      const t = (now + m.phase * 3) / 1000;
      m.bob.setY(Math.round(m.by + Math.sin(t * 2.2) * 0.7));
      const k = (t / 1.8) % 1;
      m.ripple.setTexture(ZTEX.ripple(k < 0.5 ? 0 : 1)).setAlpha(0.6 * (1 - k)).setScale(1 + k * 0.5, 1 + k * 0.3);
    }
  }
}

import type * as Phaser from "phaser";
import { DIR, FISH_ARCH, FISHING_SPOTS, type FishingSpot, type Sid } from "@tomb/protocol";
import { bridge } from "../../bridge";
import { DEPTH } from "../../config";
import { FONT_KEY, FONT_PX, type GlyphAtlas } from "../../text/GlyphAtlas";
import { BUS_BAY, BUS_PLATFORM, BUS_SHELTER_H, BUS_STOP, BUS_TIMETABLE, BUS_TIMETABLE_H, FISH_ARCH_H, FISH_DECOR, fishZoneColliders, WHARF_BOARD, WHARF_BOARD_H, WHARF_CURB, WHARF_PLACARD } from "../fishZone";
import { FTEX } from "./art";
import { ensureZoneTextures, ZTEX } from "./zoneArt";

// 낚시터·낚시 자리 표시 (사용자 요청: "낚시를 어디서 해야 하는지 한눈에").
// - 낚시터 장식: 입구 아치("낚시터" 현판)·그물 말리는 대·통발·물고기 상자·물통·등불 기둥·팻말 (배치 = game/world/fishZone.ts)
// - 낚시 자리마다: 낚시 의자 + 꽂아 둔 낚싯대 + 물 위에 떠 있는 찌(살짝 흔들림) + 찌 둘레 물결 고리.
//   누가 앉으면 꽂아 둔 낚싯대·찌는 치우고(그 사람의 낚싯대를 Foraging이 그린다) 의자만 남긴다.
// - 가까이 오면 의자 위에 낚싯바늘 말풍선이 떠오른다 (남이 쓰는 자리는 회색). "E 낚시하기" 안내는 WorldScene의 상호작용 안내.
// - 11/15 납품 부두: 의뢰 게시판·빈 긴급 의뢰 현판 이름표, 주말 버스 정류장 (정류장 지붕·노선 팻말·시간표 글씨, 골목 바닥의 버스 정차 칸)

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
  /** 11/15 긴급 의뢰 현판: 위 띠·서버 전체 막대 (bridge urgent:board) */
  private placardFx!: Phaser.GameObjects.Graphics;
  private placardLabel!: Phaser.GameObjects.BitmapText;
  private placardKey = "";

  constructor(private readonly d: FishZoneDeps) {
    const scene = d.scene;
    ensureZoneTextures(scene);
    for (const t of ["납품 부두", "의뢰 게시판", "긴급 의뢰", "주말 버스 정류장", "언젠가 캠핑장행 · Someday Camp", "다음 버스: 언젠가"]) d.atlas.ensure(t);
    // 바닥 장식 층 (11/15 정류장 다듬기): 위 마당 테두리 연석 → 정류장 승강장(판석·점자 블록·연석) → 골목의 버스 정차 칸
    scene.add.image(WHARF_CURB.x, WHARF_CURB.y, ZTEX.wharfCurb).setOrigin(0, 0).setDepth(DEPTH.decal + 1);
    scene.add.image(BUS_PLATFORM.x, BUS_PLATFORM.y, ZTEX.busPlatform).setOrigin(0, 0).setDepth(DEPTH.decal + 2);
    scene.add.image(BUS_BAY.x + BUS_BAY.w / 2, BUS_BAY.y + BUS_BAY.h / 2, ZTEX.busBay).setDepth(DEPTH.decal + 2);
    for (const o of FISH_DECOR) {
      // 정류장 지붕·뒷벽은 그 아래 벤치(bE)·앉은 사람보다 뒤에 그린다
      scene.add.image(o.x, o.y + 1, ZTEX.decor(o.kind)).setOrigin(0.5, 1).setDepth(o.kind === "busShelter" ? o.y - 14 : o.y);
    }
    for (const r of fishZoneColliders()) d.addCollider(r.x, r.y, r.w, r.h);
    // 현판 글씨 (아치) · 게시판 · 빈 현판 · 버스 정류장
    this.label(FISH_ARCH.x, FISH_ARCH.y - FISH_ARCH_H + 4, "납품 부두", 0xfff0b8, 0.5);
    this.label(WHARF_BOARD.x, WHARF_BOARD.y - WHARF_BOARD_H - 1, "의뢰 게시판", 0xffe0a8, 1);
    this.placardLabel = this.label(WHARF_PLACARD.x, WHARF_PLACARD.y - 31, "긴급 의뢰", 0xd8c8b0, 1, 0.7);
    this.placardFx = scene.add.graphics().setDepth(WHARF_PLACARD.y + 2);
    // 정류장 이름과 노선은 지붕 위에 두 줄로 (예전엔 팻말 위 노선 글씨가 지붕 이름표와 겹쳤다)
    this.label(BUS_STOP.x, BUS_STOP.y - BUS_SHELTER_H - 1, "주말 버스 정류장\n언젠가 캠핑장행 · Someday Camp", 0xc8f0d8, 1).setCenterAlign();
    this.label(BUS_TIMETABLE.x, BUS_TIMETABLE.y - BUS_TIMETABLE_H - 1, "다음 버스: 언젠가", 0xe8e0d0, 1, 0.85);
    for (const s of FISHING_SPOTS) this.markers.push(this.makeMarker(s));
  }

  private label(x: number, y: number, text: string, tint: number, originY: number, alpha = 1): Phaser.GameObjects.BitmapText {
    const t = this.d.scene.add.bitmapText(x, y, FONT_KEY, text, FONT_PX).setOrigin(0.5, originY).setTint(tint).setAlpha(alpha).setDepth(DEPTH.labels - 1);
    this.labels.push(t);
    return t;
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
   * 11/15 긴급 의뢰 현판: 진행 중이면 위 띠가 빨갛게 깜빡이고 종이에 서버 전체 막대(50%·100% 눈금)를 그린다.
   * 끝나면 막대가 멈춘 채 띠가 회색, 축제 중이면 금빛. 의뢰가 없으면 빈 종이 그대로 (그림은 zoneArt placard — 24×30, 바닥 가운데 기준)
   */
  private updatePlacard(now: number): void {
    const st = bridge.last("urgent:board") ?? null;
    const blink = !!st?.live && !this.d.reduced && Math.floor(now / 500) % 2 === 0;
    const key = st ? `${st.live}|${st.fest}|${st.stage}|${Math.round(st.frac * 16)}|${blink}` : "";
    if (key === this.placardKey) return;
    this.placardKey = key;
    const g = this.placardFx.clear();
    this.placardLabel.setTint(st ? (st.fest ? 0xffe08a : st.live ? 0xff9a80 : 0xe8dcc0) : 0xd8c8b0).setAlpha(st ? 1 : 0.7);
    if (!st) return;
    // 종이 왼쪽 위 (그림 3,4 — 18×13)
    const x0 = WHARF_PLACARD.x - 12 + 3;
    const y0 = WHARF_PLACARD.y + 1 - 30 + 4;
    g.fillStyle(st.fest ? 0xf2c43a : st.live ? (blink ? 0xff5a40 : 0xc8392a) : 0x9a8a80, 1).fillRect(x0, y0, 18, 2);
    // 막대 칸 (16×4)
    const bx = x0 + 1;
    const by = y0 + 6;
    g.fillStyle(0x2a1a14, 1).fillRect(bx, by, 16, 4);
    const w = Math.round(16 * st.frac);
    if (w > 0) g.fillStyle(st.fest ? 0xffd44a : st.live ? 0xff7a4a : 0xb8a080, 1).fillRect(bx, by, w, 4);
    // 50% · 100% 눈금 (150%가 끝)
    for (const [i, x] of [bx + 5, bx + 11].entries()) g.fillStyle(st.stage >= (i ? 100 : 50) ? 0xfff0b0 : 0x6b4a3a, 1).fillRect(x, by - 1, 1, 6);
  }

  /**
   * 매 프레임. seats = 서버 좌석 점유표, mine = 내가 앉은 낚시 자리 id, me = 내 발 위치 (낚시 중이면 말풍선을 띄우지 않는다)
   */
  update(now: number, view: Phaser.Geom.Rectangle, labelScale: number, seats: ReadonlyMap<string, Sid>, mySid: Sid | null, mine: string | null, me: { x: number; y: number }): void {
    if (labelScale !== this.labelScale) {
      this.labelScale = labelScale;
      for (const l of this.labels) l.setScale(labelScale);
    }
    this.updatePlacard(now);
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

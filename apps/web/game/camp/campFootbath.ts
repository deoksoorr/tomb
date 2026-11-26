import type * as Phaser from "phaser";
import { CAMP_FOOTBATH, campSeatById, DIR, STATE, type Sid } from "@tomb/protocol";
import { addCanvasTexture } from "../assets/manifest";
import type { Player } from "../entities/Player";
import type { RemoteAvatar } from "../entities/RemoteAvatar";
import { Grid } from "../sprites/pixel";
import { CAMP_TEX_PREFIX } from "./campTypes";
import { FOOT_WATER } from "./valleyExtraArt";

// 11/26 족욕탕 발 담그기 (운영자 「족욕탕도 발 담그는 모션이 필요함」 — 탕 돌 테에 걸터앉아 다리를 물에 담근다).
// 마을·바닷가 헤엄의 수면선 방법(AvatarView swim: 물 아래는 감추고 수면에 물결 고리)을 다리에만:
//  1) 물 조각: 탕 쪽으로 나온 다리 위를 탕 물빛이 반쯤 덮는다 (물속이라 흐리게)
//  2) 물속 다리: 그 위에 물빛으로 흐려진 정강이·발을 옅게 그린다 (둘이 번갈아 천천히 발장구 — 1px 오르내림)
//  3) 수면 물결 고리: 정강이가 물에 들어가는 자리에 2~3px 고리가 천천히 번진다
// 앞 짧은 벤치(qT9·10 — 탕 아래 돌 테, 위를 봄)는 다리가 몸 뒤라 엉덩이 아래를 물 조각이 덮고 양옆에 물결 고리.
// 자리 차지(qT1~10)는 서버 좌석표 그대로라 다른 사람 화면에서도 같은 모습이에요.

const SEATS = ["qT1", "qT2", "qT3", "qT4", "qT5", "qT6", "qT7", "qT8", "qT9", "qT10"] as const;
const WATER_TEX = `${CAMP_TEX_PREFIX}foot-water`;
const LEGS_TEX = `${CAMP_TEX_PREFIX}foot-legs`;
const RING_TEX = `${CAMP_TEX_PREFIX}foot-ring`;
/** 물 조각 (옆 자리: 앉은 자리 x에서 탕 쪽으로 · 발 y에서 위로) */
const SIDE_PATCH = { w: 12, h: 9, dx: 2, up: 8 } as const;
/** 앞 자리 물 조각 (몸 아래쪽 폭) */
const FRONT_PATCH = { w: 14, h: 5 } as const;
/** 물속 다리 그림 (두 프레임 — 발장구) */
const LEGS = { w: 10, h: 9 } as const;
/** 탕 물가 (데크 왼쪽 위 기준 — 그림 valleyExtraArt footBathArt P0 18·32 ~ P1 61·92) */
const WATER = { x0: 18, x1: 61, y0: 32, y1: 92 } as const;

type Spot = { id: string; side: -1 | 0 | 1; patch: Phaser.GameObjects.Image; legs: Phaser.GameObjects.Image | null; rings: Phaser.GameObjects.Image[]; phase: number };

export class CampFootbath {
  private readonly spots: Spot[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    if (!scene.textures.exists(WATER_TEX)) addCanvasTexture(scene, WATER_TEX, { canvas: waterSheet() });
    if (!scene.textures.exists(LEGS_TEX)) addCanvasTexture(scene, LEGS_TEX, { canvas: legsSheet(), frameW: LEGS.w, frameH: LEGS.h });
    if (!scene.textures.exists(RING_TEX)) addCanvasTexture(scene, RING_TEX, { canvas: ringArt() });
    const x0 = CAMP_FOOTBATH.x - CAMP_FOOTBATH.w / 2;
    const y0 = CAMP_FOOTBATH.y - CAMP_FOOTBATH.h;
    SEATS.forEach((id, i) => {
      const s = campSeatById(id);
      if (!s) return;
      const side: -1 | 0 | 1 = s.facing === DIR.right ? 1 : s.facing === DIR.left ? -1 : 0;
      const hide = (o: Phaser.GameObjects.Image) => o.setVisible(false);
      if (side !== 0) {
        // 물가에서 탕 안쪽으로 (왼쪽 자리는 오른쪽, 오른쪽 자리는 왼쪽)
        const wx = side > 0 ? Math.max(x0 + WATER.x0, s.x + SIDE_PATCH.dx) : Math.min(x0 + WATER.x1 + 1, s.x - SIDE_PATCH.dx) - SIDE_PATCH.w;
        const patch = hide(scene.add.image(wx, s.y - SIDE_PATCH.up, WATER_TEX).setOrigin(0, 0).setDisplaySize(SIDE_PATCH.w, SIDE_PATCH.h));
        const legs = hide(scene.add.image(s.x + side * 2, s.y - 7, LEGS_TEX, 0).setOrigin(side > 0 ? 0 : 1, 0).setFlipX(side < 0));
        const ring = hide(scene.add.image(s.x + side * 7, s.y - 6, RING_TEX));
        this.spots.push({ id, side, patch, legs, rings: [ring], phase: i * 0.9 });
      } else {
        const top = Math.min(y0 + WATER.y1 - 1, s.y - 5);
        const patch = hide(scene.add.image(s.x - FRONT_PATCH.w / 2, top, WATER_TEX).setOrigin(0, 0).setDisplaySize(FRONT_PATCH.w, FRONT_PATCH.h));
        const rings = [-1, 1].map((k) => hide(scene.add.image(s.x + k * 9, top + 1, RING_TEX)));
        this.spots.push({ id, side, patch, legs: null, rings, phase: i * 0.9 });
      }
    });
  }

  /** 매 프레임 (아바타 그린 뒤): 지금 족욕탕에 앉은 사람(나·같은 맵 사람)의 발을 물에 담근다 */
  update(now: number, me: Player, remotes: ReadonlyMap<Sid, RemoteAvatar>): void {
    for (const sp of this.spots) {
      let depth = -1;
      if (me.state === "sitChair" && me.seat?.id === sp.id) depth = me.view.sprite.depth;
      else
        for (const r of remotes.values())
          if (r.seatId === sp.id && r.stateId === STATE.sitChair && r.visible) {
            depth = r.view.sprite.depth;
            break;
          }
      const on = depth >= 0;
      if (sp.patch.visible !== on) {
        sp.patch.setVisible(on);
        sp.legs?.setVisible(on);
        for (const r of sp.rings) r.setVisible(on);
      }
      if (!on) continue;
      // 느린 발장구 (두 다리가 번갈아 1px) · 물결 고리가 번졌다 잦아든다
      const t = this.reduced ? 0 : now / 650 + sp.phase;
      const kick = Math.sin(t);
      sp.patch.setDepth(depth + 0.2).setAlpha(0.62 + 0.05 * kick);
      sp.legs?.setFrame(kick > 0 ? 1 : 0).setDepth(depth + 0.25);
      sp.rings.forEach((r, k) => {
        const u = this.reduced ? 0.5 : (((t * 0.5 + k * 0.5) % 1) + 1) % 1;
        r.setScale(0.8 + 0.7 * u, 0.6 + 0.4 * u)
          .setAlpha(0.95 * (1 - u) + 0.15)
          .setDepth(depth + 0.3);
      });
    }
  }

  destroy(): void {
    for (const sp of this.spots) {
      sp.patch.destroy();
      sp.legs?.destroy();
      for (const r of sp.rings) r.destroy();
    }
    this.spots.length = 0;
  }
}

/** 물 조각 (탕 물빛 + 수면선 밝은 줄) — 크기는 setDisplaySize로 */
function waterSheet(): HTMLCanvasElement {
  const g = new Grid(12, 9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) g.set(x, y, y === 0 ? FOOT_WATER.foam : y === 1 ? FOOT_WATER.hi : (x + y) % 5 === 0 ? FOOT_WATER.hi : FOOT_WATER.mid);
  return g.toCanvas();
}

/** 물속 다리 두 프레임: 허벅지 → 무릎에서 꺾여 물속으로 내려간 정강이 → 발 (물빛에 흐려진 색 + 아래 그늘선). 원점 = 엉덩이 쪽 위, 오른쪽으로 뻗는다 */
function legsSheet(): HTMLCanvasElement {
  const g = new Grid(LEGS.w * 2, LEGS.h);
  const thigh = 0xd6d2b6;
  const shin = 0xbcd8c2;
  const foot = 0xe6f2e2;
  const shade = 0x4f8a78;
  const leg = (ox: number, oy: number) => {
    // 허벅지 (수면 바로 아래 — 가로)
    g.hline(ox, ox + 3, oy, thigh);
    g.hline(ox, ox + 3, oy + 1, thigh);
    // 정강이 (무릎에서 아래로 비스듬히)
    for (let k = 0; k < 3; k++) {
      g.set(ox + 4 + k, oy + 1 + k, shin);
      g.set(ox + 4 + k, oy + 2 + k, shin);
      g.set(ox + 4 + k, oy + 3 + k, shade);
    }
    // 발
    g.set(ox + 7, oy + 4, foot);
    g.set(ox + 8, oy + 4, foot);
    g.set(ox + 8, oy + 5, shade);
  };
  for (let f = 0; f < 2; f++) {
    const ox = f * LEGS.w;
    // 두 다리가 번갈아 1px 오르내린다 (느린 발장구)
    leg(ox, f === 0 ? 0 : 1);
    leg(ox + 1, f === 0 ? 2 : 1);
  }
  return g.toCanvas();
}

/** 수면 물결 고리 (타원 테두리 — 2~3px) */
function ringArt(): HTMLCanvasElement {
  const g = new Grid(9, 5);
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    g.set(Math.round(4 + Math.cos(t) * 4), Math.round(2 + Math.sin(t) * 2), 0xf4fffa);
  }
  return g.toCanvas();
}

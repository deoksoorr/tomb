import { bodyTier, champAuraOn, CHAMP_AURA_OFF, champBoards, CHAMP_BOARDS, DIR, itemById, type DirId } from "@tomb/protocol";
import { foxSheet, MOUNT_FRAMES, MOUNT_GLIDE, MOUNT_H, MOUNT_SIDE_SHIFT, MOUNT_W, mountLift, mountSheet, mountSideOver, type MountKind } from "./mountArt";
import { kstHour, parseAmbienceOverride, timePhase } from "@/lib/ambience";
import { CUTE_FX, CUTE_FX_ART, cuteIconGrid } from "./cuteFx";
import { THEME_FX, THEME_FX_ART, themeIconGrid } from "./themeFx";
import { XMAS_FX, XMAS_FX_ART, XMAS_GEAR_FX, xmasAura, xmasIconGrid, type XmasMotion } from "./xmasFx";
import { PET_PACK_ART, PET_PACK_FX, petPackIconGrid } from "./petPack";
import { Grid, type Color } from "./pixel";

// F8 캐릭터 꾸미기 추가분 중 "아바타 시트 밖에 따로 그리는 연출" (날개 2종·우산·풍선·발자국 5종·오라 6종·펫 6종).
// 그림(FX_ART)과 움직임(CosmeticFxSim)을 한곳에 두고, 게임(entities/CosmeticFxView, Phaser)과
// 상점 입어 보기(components/shop/outfitStage, 캔버스 2D)가 같은 명령(FxCmd) 목록을 받아 그린다 → 두 화면이 똑같이 움직인다.
// 원래 있던 날개·그림자 유령·발자국 꽃·안개·반딧불은 예전 코드(AvatarView·outfitStage) 그대로다.

// ── 그림 ──

type ArtDef = { w: number; h: number; frames: number; build: () => Grid };

function frames(w: number, h: number, n: number, draw: (g: Grid, f: number, ox: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f, 0);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

/** 문자 그림 → 그리드 ('.' 투명) */
function rows(g: Grid, art: readonly string[], pal: Record<string, Color>, ox = 0, oy = 0): void {
  art.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && pal[ch] !== undefined && g.set(ox + x, oy + y, pal[ch])));
}

/** 26×12 날개 2프레임 (0 = 앞·뒷모습 양쪽, 1 = 옆모습 한쪽). shape(i,len) = [윗줄, 아랫줄] */
function wings(fill: Color, lo: Color, edge: Color, line: Color, shape: (i: number, len: number) => [number, number], paint?: (g: Grid, x: number, y: number, i: number) => Color | null) {
  return () => {
    const g = new Grid(52, 12);
    const wing = (ox: number, dir: 1 | -1, len: number) => {
      for (let i = 0; i < len; i++) {
        const x = ox + dir * i;
        const [y0, y1] = shape(i, len);
        for (let y = y0; y <= y1; y++) g.set(x, y, paint?.(g, x, y, i) ?? (y === y0 ? edge : y === y1 ? lo : fill), 240);
      }
    };
    wing(11, -1, 10);
    wing(14, 1, 10);
    wing(26 + 15, 1, 10);
    g.outline(line, false, 220);
    return g;
  };
}

// ── 주간 랭킹 1위 오라 그림 도우미 ──

/** 테마 수 (금·빨강·파랑, 둘씩 섞은 셋, 무지개, 운영자) */
const CHAMP_THEMES = 8;
/** 3관왕 무지개 테마 */
const RAINBOW_THEME = 6;
/** 31번 운영자 오라 테마: 푸른 저승 등불빛 + 금빛 테두리 문양 (도깨비불·검은 연기 띠는 입자로) */
export const STAFF_THEME = 7;
const RING_W = 36;
const RING_H = 12;
const RING_PHASES = 8;
/** 후광 고리 구멍 반지름 (몸 반너비 7·머리 위까지 반높이보다 크게) */
export const HALO_HOLE_RX = 11;
export const HALO_HOLE_RY = 16;
type ChampCol = { c: Color; hi: Color };
/** 랭킹 색: 포인트 = 금, 사냥 처치 = 빨강, 낚시 = 파랑 */
const CHAMP_BASE: readonly ChampCol[] = [
  { c: 0xffc83a, hi: 0xfff4b0 },
  { c: 0xff4a2a, hi: 0xffc070 },
  { c: 0x3ab8ff, hi: 0xc8f4ff },
];
/** 테마 → 섞을 랭킹 색 (마지막은 무지개) */
const THEME_MIX: readonly (readonly number[])[] = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];

function hsv(h: number, s: number, v: number): Color {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** 테마의 u(0..1) 자리 색: 한 랭킹이면 그 색, 둘이면 반씩 번갈아, 무지개면 색상환, 운영자면 저승 등불빛에 금빛 문양 마디 */
function champColor(theme: number, u: number): ChampCol {
  if (theme === STAFF_THEME) {
    const k = (((u * 8) % 1) + 1) % 1;
    // 금빛 문양 마디 · 저승 보랏빛 · 등불 푸른빛 (낚시왕의 맑은 파랑과 결이 다르게 보랏빛·금빛을 넉넉히)
    return k < 0.28 ? { c: 0xffc23a, hi: 0xfff0b0 } : k < 0.68 ? { c: 0x7a4aff, hi: 0xd2b8ff } : { c: 0x48c8ff, hi: 0xd8faff };
  }
  if (theme === RAINBOW_THEME) {
    const h = ((u % 1) + 1) % 1;
    return { c: hsv(h, 0.85, 1), hi: hsv(h, 0.35, 1) };
  }
  const mix = THEME_MIX[theme] ?? [0];
  return CHAMP_BASE[mix[Math.floor((((u % 1) + 1) % 1) * mix.length * 2) % mix.length]];
}

/** 발밑 빛 고리 반쪽 (back = 위쪽 반원 → 몸 뒤, front = 아래쪽 반원 → 발 앞). 프레임 = 테마 × 회전 단계: 밝은 마디 6개가 돈다 */
function champRing(half: "back" | "front"): Grid {
  const hh = RING_H / 2;
  const out = new Grid(RING_W * CHAMP_THEMES * RING_PHASES, hh);
  const cx = RING_W / 2;
  const cy = RING_H / 2;
  for (let th = 0; th < CHAMP_THEMES; th++)
    for (let ph = 0; ph < RING_PHASES; ph++) {
      const ox = (th * RING_PHASES + ph) * RING_W;
      for (let y = 0; y < RING_H; y++) {
        if ((half === "back") !== y < hh) continue;
        for (let x = 0; x < RING_W; x++) {
          const dx = (x + 0.5 - cx) / (cx - 0.5);
          const dy = (y + 0.5 - cy) / (cy - 0.5);
          const d = Math.hypot(dx, dy);
          if (d > 1.02) continue;
          const ang = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
          const col = champColor(th, ang + ph / RING_PHASES / 2);
          const dash = (ang * 6 + ph / RING_PHASES) % 1 < 0.42;
          const oy = half === "back" ? y : y - hh;
          if (d > 0.76) out.set(ox + x, oy, dash ? col.hi : col.c, dash ? 250 : 165);
          else if (d > 0.55) out.set(ox + x, oy, col.c, dash ? 110 : 60);
        }
      }
    }
  return out;
}

export const FX_ART = {
  wingsBat: {
    w: 26,
    h: 12,
    frames: 2,
    build: wings(0x4a3a62, 0x2e2440, 0x7a6a98, 0x1a1426, (i, len) => [
      4 - Math.round(Math.sin((i / len) * Math.PI * 0.9) * 3.5),
      8 - Math.floor(i / 3) - (i % 3 === 2 ? 2 : 0),
    ]),
  },
  wingsButterfly: {
    w: 26,
    h: 12,
    frames: 2,
    build: wings(
      0xffa8d0,
      0x7ab8f0,
      0xffd0e6,
      0x5a3a6a,
      // 윗날개는 바깥으로 갈수록 솟고 끝이 둥글게, 아랫날개는 몸 가까이 작게
      (i, len) => [
        Math.max(0, Math.round(4 - 4.5 * Math.sin((Math.PI * 0.5 * (i + 1)) / len)) + (i >= len - 2 ? i - len + 3 : 0)),
        i < len * 0.6 ? 6 + Math.round(Math.sin((Math.PI * (i + 0.5)) / (len * 0.6)) * 4) : 5,
      ],
      (_g, _x, y, i) => (y >= 6 ? (i % 4 === 2 && y === 8 ? 0xffffff : 0x9ad0ff) : i % 4 === 1 && y === 3 ? 0xffffff : null),
    ),
  },
  umbrella: {
    w: 17,
    h: 7,
    frames: 1,
    build: () => {
      const g = new Grid(17, 7);
      for (let x = 0; x < 17; x++) {
        const d = (x - 8) / 8.6;
        const top = 6 - Math.round(Math.sqrt(Math.max(0, 1 - d * d)) * 5.4);
        for (let y = top; y <= 5; y++) g.set(x, y, x % 4 === 0 ? 0xffffff : 0xdceaf2, x % 4 === 0 ? 235 : 150);
        if (x % 4 === 0) g.set(x, 6, 0xffffff, 235);
      }
      g.set(8, 0, 0x3a3a44);
      g.outline(0x7a8a9a, false, 170);
      return g;
    },
  },
  /** 우산대 (세로로 늘려 쓴다) */
  stick: { w: 1, h: 8, frames: 1, build: () => fill(1, 8, 0x3a3a48, 255) },
  /** 풍선 끈 */
  string: { w: 1, h: 8, frames: 1, build: () => fill(1, 8, 0xeae6dc, 210) },
  balloon: {
    w: 7,
    h: 9,
    frames: 1,
    build: () => {
      const g = new Grid(7, 9);
      g.ellipse(3.5, 3.8, 3.4, 3.8, 0xe84a5a);
      g.set(2, 2, 0xffd0d4);
      g.set(2, 3, 0xff9aa4);
      g.set(3, 8, 0xa82a3a);
      g.outline(0x7a1a2a, false, 200);
      return g;
    },
  },
  petCat: {
    w: 12,
    h: 10,
    frames: 2,
    build: frames(12, 10, 2, (g, f) => {
      const c = 0xe8a050;
      const lo = 0xc0782a;
      g.ellipse(5.5, 6.2, 3.8, 2.2, c);
      g.ellipse(9, 4, 2.3, 2.1, c);
      g.set(7, 1, c);
      g.set(7, 2, c);
      g.set(10, 1, c);
      g.set(10, 2, c);
      g.set(4, 5, lo);
      g.set(6, 5, lo);
      g.set(5, 7, 0xf8e0c0);
      g.set(9, 4, 0x2a2018);
      g.set(11, 5, 0xe68a9a);
      // 꼬리: 위로 살랑
      if (f === 0) {
        g.set(1, 5, c);
        g.set(1, 4, c);
        g.set(0, 3, lo);
      } else {
        g.set(1, 5, c);
        g.set(0, 4, c);
        g.set(0, 5, lo);
      }
      const legs = f === 0 ? [3, 7] : [4, 6];
      for (const x of legs) g.set(x, 8, lo);
      g.outline(0x4a2a12, false, 220);
    }),
  },
  petDog: {
    w: 12,
    h: 10,
    frames: 2,
    build: frames(12, 10, 2, (g, f) => {
      const c = 0xf2e6cc;
      const patch = 0xc08a5a;
      g.ellipse(5.5, 6, 4, 2.3, c);
      g.ellipse(9, 3.8, 2.4, 2.2, c);
      g.set(4, 5, patch);
      g.set(5, 5, patch);
      g.set(5, 6, patch);
      g.vline(7, 3, 5, patch);
      g.set(8, 3, patch);
      g.set(9, 3, 0x2a2018);
      g.set(11, 4, 0x2a2018);
      g.set(10, 6, 0xe68a9a);
      // 꼬리 흔들기
      if (f === 0) {
        g.set(1, 4, c);
        g.set(0, 3, c);
      } else {
        g.set(1, 5, c);
        g.set(0, 5, c);
      }
      const legs = f === 0 ? [3, 8] : [4, 7];
      for (const x of legs) g.vline(x, 8, 9, c);
      g.outline(0x5a4030, false, 220);
    }),
  },
  petDuck: {
    w: 10,
    h: 9,
    frames: 2,
    build: frames(10, 9, 2, (g, f) => {
      const c = 0xffd84a;
      const lo = 0xe0b02a;
      const dy = f;
      g.ellipse(4.5, 6, 4, 2.3, c);
      g.recolor((x, y) => y >= 7, lo);
      g.ellipse(6.5, 2.8 + dy * 0.5, 2, 2, c);
      g.set(8 + 0, 3 + dy, 0xff8a2a);
      g.set(9, 3 + dy, 0xff8a2a);
      g.set(7, 2 + dy, 0x2a2018);
      g.set(1, 5, lo);
      g.set(0, 4, c);
      g.outline(0x8a5a10, false, 220);
    }),
  },
  petSlime: {
    w: 11,
    h: 8,
    frames: 2,
    build: frames(11, 8, 2, (g, f) => {
      const c = 0x7ad86a;
      const rx = f ? 5 : 4.4;
      const ry = f ? 2.6 : 3.2;
      g.ellipse(5.5, 7.5 - ry, rx, ry, c, 235);
      g.recolor((x, y) => y >= 6, 0x58b04a);
      g.set(3, Math.round(7.5 - ry * 1.4), 0xe0ffd8);
      g.set(4, Math.round(7.5 - ry * 1.2), 0xc0f0b0);
      g.set(4, 5, 0x1e3a1a);
      g.set(7, 5, 0x1e3a1a);
      g.outline(0x2a5a22, false, 200);
    }),
  },
  petBird: {
    w: 9,
    h: 8,
    frames: 2,
    build: frames(9, 8, 2, (g, f) => {
      const c = 0xb07a4a;
      g.ellipse(4, 4.5, 2.8, 2.1, c);
      g.ellipse(4.5, 5.2, 1.8, 1.1, 0xf2e2c8);
      g.ellipse(6, 2.8, 1.7, 1.6, c);
      g.set(8, 3, 0xf2c43a);
      g.set(6, 2, 0x1a1410);
      g.set(1, 4, 0x8a5a32);
      g.set(0, 3, 0x8a5a32);
      if (f === 0) {
        g.set(3, 1, 0x8a5a32);
        g.set(2, 2, 0x8a5a32);
        g.set(3, 2, 0x8a5a32);
      } else {
        g.set(3, 6, 0x8a5a32);
        g.set(2, 6, 0x8a5a32);
      }
      g.outline(0x3a2414, false, 210);
    }),
  },
  petWisp: {
    w: 8,
    h: 11,
    frames: 2,
    build: frames(8, 11, 2, (g, f) => {
      g.ellipse(4, 7, 3.2, 3.2, 0x6ac8f8);
      for (let y = 1; y < 7; y++) {
        const half = (y - 1) * 0.45 + (f && y < 3 ? 0.3 : 0);
        const sx = f ? 0.6 : -0.4;
        for (let x = 0; x < 8; x++) if (Math.abs(x + 0.5 - 4 - sx * (1 - y / 7)) <= half) g.set(x, y, 0x6ac8f8);
      }
      g.ellipse(4, 7.4, 1.8, 2, 0xd8f8ff);
      g.set(3, 7, 0x1a3a5a);
      g.set(5, 7, 0x1a3a5a);
      g.outline(0x2a6a9a, false, 160);
    }),
  },
  // ── 동물원 펫 (sprites/mountArt.ts) ── 달빛 여우 + 타는 펫 3종 (옆·앞·뒤 + 탄 사람 앞에 그리는 덧그림)
  petFox: { w: 12, h: 10, frames: 2, build: foxSheet },
  mountHound: { w: MOUNT_W, h: MOUNT_H, frames: MOUNT_FRAMES, build: () => mountSheet("hound") },
  mountGoose: { w: MOUNT_W, h: MOUNT_H, frames: MOUNT_FRAMES, build: () => mountSheet("goose") },
  mountDeer: { w: MOUNT_W, h: MOUNT_H, frames: MOUNT_FRAMES, build: () => mountSheet("deer") },
  /** 물에 들어간 펫 둘레 물결 고리 (아바타 물결보다 작게) */
  petRipple: {
    w: 12,
    h: 4,
    frames: 1,
    build: () => {
      const g = new Grid(12, 4);
      g.ellipse(6, 2, 6, 2, 0xd8f0fa, 170);
      g.ellipse(6, 2, 4.5, 1.1, 0x000000, 0);
      for (let i = 0; i < g.px.length; i++) if ((g.px[i] & 255) === 0) g.px[i] = 0;
      return g;
    },
  },
  /** 잠수한 펫 자리에서 올라오는 물방울 */
  petBubble: {
    w: 3,
    h: 3,
    frames: 1,
    build: () => {
      const g = new Grid(3, 3);
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, 0xd8f0fa, 220);
      g.set(1, 1, 0xffffff, 90);
      return g;
    },
  },
  /** 도깨비불 친구 둘레 빛 (더하기) */
  wispGlow: {
    w: 15,
    h: 15,
    frames: 1,
    build: () => {
      const g = new Grid(15, 15);
      g.ellipse(7.5, 7.5, 7.5, 7.5, 0x4aa8e8, 50);
      g.ellipse(7.5, 7.5, 4.5, 4.5, 0x6ac8f8, 90);
      return g;
    },
  },
  print: {
    w: 3,
    h: 4,
    frames: 2,
    build: frames(3, 4, 2, (g, f) => {
      // 밤 풀밭에서도 보이게 진한 흙색 + 발가락 자리는 조금 밝게
      const c = 0x1a120c;
      g.rect(f ? 1 : 0, 1, 2, 3, c, 215);
      g.set(f ? 0 : 2, 0, 0x2e2218, 200);
      g.set(1, 0, 0x2e2218, 170);
    }),
  },
  puddle: {
    w: 11,
    h: 6,
    frames: 2,
    build: frames(11, 6, 2, (g, f) => {
      const ring = (rx: number, ry: number, a: number) => {
        const tmp = new Grid(11, 6);
        tmp.ellipse(5.5, 3.5, rx, ry, 0xffffff);
        tmp.ellipse(5.5, 3.5, rx - 1.4, ry - 0.9, 0x000000, 0);
        for (let i = 0; i < tmp.px.length; i++) if ((tmp.px[i] & 255) === 255) g.px[i] = Grid.rgba(0xc8ecfa, a);
      };
      if (f === 0) ring(5.4, 2.4, 200);
      else {
        ring(3.4, 1.6, 220);
        for (const [x, y] of [[2, 0], [5, 0], [8, 1], [1, 1]]) g.set(x, y, 0xe8f8ff, 230);
      }
    }),
  },
  sparkStar: {
    w: 5,
    h: 5,
    frames: 3,
    build: frames(5, 5, 3, (g, f) => {
      const c = [0xfff09a, 0xffb8e8, 0xa8ecff][f];
      g.set(2, 2, 0xffffff);
      for (const [x, y] of [[2, 1], [2, 3], [1, 2], [3, 2]]) g.set(x, y, c);
      for (const [x, y] of [[2, 0], [2, 4], [0, 2], [4, 2]]) g.set(x, y, c, 120);
    }),
  },
  leaf: {
    w: 5,
    h: 3,
    frames: 3,
    build: frames(5, 3, 3, (g, f) => {
      const c = [0xe8823a, 0xd84a3a, 0xf2c43a][f];
      rows(g, [".cc..", "cccc.", ".ccd."], { c, d: 0x6a4a2a });
      g.set(4, 2, 0x6a4a2a);
    }),
  },
  heart: {
    w: 5,
    h: 4,
    frames: 2,
    build: frames(5, 4, 2, (g, f) => {
      const c = f ? 0xe84a6a : 0xff8ab8;
      rows(g, [".c.c.", "chccc", ".ccc.", "..c.."], { c, h: 0xffe0ee });
    }),
  },
  snowflake: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      if (f === 0) rows(g, [".w.", "www", ".w."], { w: 0xffffff });
      else rows(g, ["w.w", ".w.", "w.w"], { w: 0xeaf4ff });
    }),
  },
  petal: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      if (f === 0) rows(g, ["pp.", "ppd", "..."], { p: 0xffc0d4, d: 0xe88aa8 });
      else rows(g, [".p.", "pp.", ".d."], { p: 0xffd0e0, d: 0xe88aa8 });
    }),
  },
  cloud: {
    w: 16,
    h: 7,
    frames: 1,
    build: () => {
      const g = new Grid(16, 7);
      g.ellipse(5, 4, 4, 2.6, 0x8a92a4);
      g.ellipse(10, 3.4, 4.6, 3.2, 0x8a92a4);
      g.ellipse(13, 4.6, 2.6, 2, 0x8a92a4);
      g.recolor((x, y) => y <= 2, 0xb0b8c8);
      g.recolor((x, y) => y >= 6, 0x6a7286);
      g.outline(0x4a5266, false, 200);
      return g;
    },
  },
  raindrop: { w: 1, h: 3, frames: 1, build: () => fill(1, 3, 0x9ad0f0, 220) },
  note: {
    w: 6,
    h: 7,
    frames: 2,
    build: frames(6, 7, 2, (g, f) => {
      if (f === 0) rows(g, ["...n..", "...nn.", "...n.n", "...n..", ".nnn..", "nnnn..", ".nn..."], { n: 0xffe07a });
      else rows(g, [".nnnnn", ".n...n", ".n...n", ".n...n", "nn..nn", "nn.nnn", "......"], { n: 0x9ae8ff });
      g.outline(0x2a2a3a, false, 160);
    }),
  },
  zee: {
    w: 5,
    h: 5,
    frames: 3,
    build: frames(5, 5, 3, (g, f) => {
      const n = 5 - f;
      const c = 0xdce6ff;
      const o = Math.floor((5 - n) / 2);
      g.hline(o, o + n - 1, o, c);
      g.hline(o, o + n - 1, o + n - 1, c);
      for (let i = 1; i < n - 1; i++) g.set(o + n - 1 - i, o + i, c);
    }),
  },
  // ── 추가분 2 (11/12): 날개 2종·발자국 6종·오라 6종 + 31번 운영자(저승길 발자국·혼불) ──
  wingsAngel: {
    w: 26,
    h: 12,
    frames: 2,
    build: wings(
      0xf8f8ff,
      0xc8d0e8,
      0xffffff,
      0x7a80a0,
      (i, len) => [Math.max(0, 4 - Math.round(Math.sin((i / len) * Math.PI * 0.85) * 4)), Math.max(2, 9 - Math.floor(i / 2) + (i % 2))],
      (_g, _x, y, i) => (i % 3 === 2 && y >= 5 ? 0xdde2f2 : null),
    ),
  },
  wingsDragon: {
    w: 26,
    h: 12,
    frames: 2,
    build: wings(
      0x3a8a5a,
      0x2a5a3a,
      0x8ad08a,
      0x14241a,
      (i, len) => [3 - Math.round(Math.sin((i / len) * Math.PI * 0.9) * 3), Math.max(3, 9 - Math.floor(i / 2.5) - (i % 3 === 2 ? 2 : 0))],
      (_g, _x, y, i) => (i % 3 === 0 && y > 3 ? 0x2a6a44 : null),
    ),
  },
  snowPrint: {
    w: 3,
    h: 4,
    frames: 2,
    build: frames(3, 4, 2, (g, f) => {
      g.rect(f ? 1 : 0, 1, 2, 3, 0xeaf4ff, 225);
      g.set(f ? 0 : 2, 0, 0xffffff, 210);
      g.set(1, 0, 0xffffff, 180);
    }),
  },
  paw: {
    w: 4,
    h: 4,
    frames: 2,
    build: frames(4, 4, 2, (g, f) => {
      rows(g, f ? [".t.t", "t...", ".pp.", ".pp."] : ["t.t.", "...t", ".pp.", ".pp."], { t: 0xffb8cc, p: 0xff8aa8 });
    }),
  },
  bubble: {
    w: 5,
    h: 5,
    frames: 2,
    build: frames(5, 5, 2, (g, f) => {
      const r = f ? 1.8 : 2.4;
      const tmp = new Grid(5, 5);
      tmp.ellipse(2.5, 2.5, r, r, 0xffffff);
      tmp.ellipse(2.5, 2.5, r - 1, r - 1, 0x000000, 0);
      for (let i = 0; i < tmp.px.length; i++) if ((tmp.px[i] & 255) === 255) g.px[i] = Grid.rgba(0xbfe8ff, 210);
      g.set(f ? 2 : 1, 1, 0xffffff, 240);
    }),
  },
  confetti: {
    w: 2,
    h: 2,
    frames: 3,
    build: frames(2, 2, 3, (g, f) => {
      const c = [0xff6a8a, 0x5ab8e8, 0xffd04a][f];
      if (f === 1) g.rect(0, 0, 2, 1, c);
      else if (f === 2) g.rect(0, 0, 1, 2, c);
      else g.rect(0, 0, 2, 2, c);
    }),
  },
  coin: {
    w: 4,
    h: 4,
    frames: 2,
    build: frames(4, 4, 2, (g, f) => {
      if (f === 0) {
        g.ellipse(2, 2, 2, 2, 0xf2c43a);
        g.set(1, 1, 0xfff0a0);
        g.set(2, 2, 0xb88a1a);
      } else {
        g.rect(1, 0, 2, 4, 0xe0b030);
        g.set(1, 0, 0xfff0a0);
      }
      g.outline(0x6a4a10, false, 150);
    }),
  },
  steam: {
    w: 3,
    h: 5,
    frames: 2,
    build: frames(3, 5, 2, (g, f) => {
      rows(g, f ? [".w.", "w..", ".w.", "..w", ".w."] : [".w.", "..w", ".w.", "w..", ".w."], { w: 0xf4f4f4 });
    }),
  },
  bill: {
    w: 6,
    h: 3,
    frames: 2,
    build: frames(6, 3, 2, (g, f) => {
      g.rect(0, 0, 6, 3, f ? 0x7ac87a : 0x8ad88a);
      g.set(f ? 3 : 2, 1, 0x3a7a3a);
      g.set(0, 0, 0xc8f0c8);
      g.outline(0x2a5a2a, false, 140);
    }),
  },
  miniGhost: {
    w: 5,
    h: 6,
    frames: 2,
    build: frames(5, 6, 2, (g, f) => {
      rows(g, [".www.", "wwwww", "wewew", "wwwww", "wwwww", f ? "w.w.w" : ".w.w."], { w: 0xf4f6ff, e: 0x2a2a3a });
      g.outline(0x6a7090, false, 150);
    }),
  },
  soulFlame: {
    w: 4,
    h: 6,
    frames: 2,
    build: frames(4, 6, 2, (g, f) => {
      rows(g, f ? ["..b.", ".bb.", ".bwb", "bwwb", "bwwb", ".bb."] : [".b..", ".bb.", "bwb.", "bwwb", "bwwb", ".bb."], { b: 0x5ad8ff, w: 0xd8faff });
    }),
  },
  // 11/17 유령선 한정 「안개 오라」: 발치에 낮게 깔리는 바다 안개 한 뭉치 (가장자리로 갈수록 옅게) · 녹색 도깨비불 불씨
  ghMist: {
    w: 18,
    h: 6,
    frames: 2,
    build: frames(18, 6, 2, (g, f, ox) => {
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 18; x++) {
          const dx = (x + 0.5 - 9) / 9;
          const dy = (y + 0.5 - 3.2) / 3;
          // 두 겹 타원 + 프레임마다 다른 결 (일렁여요)
          const wob = Math.sin(x * 0.9 + f * 2.1) * 0.12;
          const d = dx * dx + (dy + wob) * (dy + wob);
          if (d >= 1) continue;
          const core = 1 - d;
          const c = y < 2 ? 0xeafff4 : y < 4 ? 0xcdeee4 : 0xa8d8d0;
          g.set(ox + x, y, c, Math.round(40 + core * 120));
        }
    }),
  },
  ghEmber: {
    w: 3,
    h: 4,
    frames: 2,
    build: frames(3, 4, 2, (g, f) => {
      rows(g, f ? [".w.", "wgw", ".g.", ".d."] : [".g.", "gwg", ".g.", "..d"], { w: 0xe8fff0, g: 0x7dffb0, d: 0x3ac888 });
    }),
  },
  soulMist: {
    w: 5,
    h: 3,
    frames: 2,
    build: frames(5, 3, 2, (g, f) => {
      rows(g, f ? [".mm..", "mmmm.", ".mmmm"] : ["..mm.", ".mmmm", "mmmm."], { m: 0x7ad8ff });
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) g.px[i] = (g.px[i] & ~255) | 150;
    }),
  },
  // 25번 프리미엄 외형 등급 연출: 몸 뒤 은은한 빛 (0 희귀 보라·1 전설 금), 반짝이 알갱이 (0 금·1 분홍·2 하늘·3 흰)
  tierGlow: {
    w: 26,
    h: 32,
    frames: 2,
    build: frames(26, 32, 2, (g, f) => {
      const c = f ? [0xffc84a, 0xffe08a, 0xfff4c8] : [0x9a6ae8, 0xc49af8, 0xeedcff];
      g.ellipse(13, 16, 13, 16, c[0], 34);
      g.ellipse(13, 16, 10, 13, c[1], 40);
      g.ellipse(13, 16, 6.5, 9, c[2], 46);
    }),
  },
  tierMote: {
    w: 3,
    h: 3,
    frames: 4,
    build: frames(3, 3, 4, (g, f) => {
      const c = [0xffd65a, 0xffa8e0, 0x9ae4ff, 0xffffff][f];
      g.set(1, 1, 0xffffff);
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) g.set(x, y, c, 200);
    }),
  },
  // ── 주간 랭킹 1위 오라 (테마 7가지: 0 금 · 1 빨강 · 2 파랑 · 3 금+빨강 · 4 금+파랑 · 5 빨강+파랑 · 6 무지개 — champTheme) ──
  /** 발밑 빛 고리 뒤쪽 반(몸 뒤)·앞쪽 반(발 앞). 테마 × 회전 8단계 */
  champRingBack: { w: RING_W, h: RING_H / 2, frames: CHAMP_THEMES * RING_PHASES, build: () => champRing("back") },
  champRingFront: { w: RING_W, h: RING_H / 2, frames: CHAMP_THEMES * RING_PHASES, build: () => champRing("front") },
  /** 발밑 바닥 빛 */
  champGlow: {
    w: 40,
    h: 14,
    frames: CHAMP_THEMES,
    build: frames(40, 14, CHAMP_THEMES, (g, f) => {
      const [a, b] = [champColor(f, 0), champColor(f, 0.5)];
      g.ellipse(20, 7, 20, 7, a.c, 40);
      g.ellipse(20, 7, 14, 5, b.c, 60);
      g.ellipse(20, 7, 8, 3, a.hi, 80);
    }),
  },
  /**
   * 후광 고리 (가운데가 뚫린 타원 빛): 구멍(가로 반지름 HALO_HOLE_RX · 세로 HALO_HOLE_RY)이 몸 그림보다 커서
   * 맨 위 빛 층에 그려도 몸을 덮지 않는다 → 밤에도 1위 둘레가 환하다
   */
  champHalo: {
    w: 36,
    h: 46,
    frames: CHAMP_THEMES,
    build: frames(36, 46, CHAMP_THEMES, (g, f) => {
      for (let y = 0; y < 46; y++)
        for (let x = 0; x < 36; x++) {
          const dx = x + 0.5 - 18;
          const dy = y + 0.5 - 23;
          const out = Math.hypot(dx / 18, dy / 23);
          const hole = Math.hypot(dx / HALO_HOLE_RX, dy / HALO_HOLE_RY);
          if (out > 1 || hole < 1) continue;
          const k = Math.min(1, (hole - 1) * 2.2) * Math.min(1, (1 - out) * 3.5);
          const col = champColor(f, Math.atan2(dy, dx) / (Math.PI * 2) + 0.5);
          g.set(x, y, k > 0.6 ? col.hi : col.c, Math.round(150 * k));
        }
    }),
  },
  /** 위로 솟는 빛줄기 (가는 세로 빛) */
  champStreak: {
    w: 1,
    h: 7,
    frames: CHAMP_THEMES,
    build: frames(1, 7, CHAMP_THEMES, (g, f) => {
      for (let y = 0; y < 7; y++) g.set(0, y, y < 2 ? 0xffffff : champColor(f, y / 7).hi, Math.round(240 * (1 - y / 7)));
    }),
  },
  /** 빛기둥 (아래·위로 갈수록 흐려지는 세로 빛) */
  champPillar: {
    w: 5,
    h: 34,
    frames: CHAMP_THEMES,
    build: frames(5, 34, CHAMP_THEMES, (g, f) => {
      for (let y = 0; y < 34; y++) {
        const k = Math.pow(Math.sin((Math.PI * (y + 0.5)) / 34), 0.8) * (0.35 + 0.65 * (y / 33));
        const col = champColor(f, y / 34);
        g.set(2, y, col.hi, Math.round(235 * k));
        g.set(1, y, col.c, Math.round(150 * k));
        g.set(3, y, col.c, Math.round(150 * k));
        g.set(0, y, col.c, Math.round(55 * k));
        g.set(4, y, col.c, Math.round(55 * k));
      }
    }),
  },
  /** 섬광 (여덟 갈래 빛살) */
  champBurst: {
    w: 21,
    h: 21,
    frames: CHAMP_THEMES,
    build: frames(21, 21, CHAMP_THEMES, (g, f) => {
      for (let r = 0; r < 8; r++) {
        const a = (r * Math.PI) / 4;
        const len = r % 2 ? 7 : 10;
        const col = champColor(f, r / 8);
        for (let d = 1; d <= len; d++) g.set(Math.round(10 + Math.cos(a) * d), Math.round(10 + Math.sin(a) * d), d < 3 ? 0xffffff : col.hi, Math.round(250 * (1 - d / (len + 1))));
      }
      g.ellipse(10.5, 10.5, 3, 3, champColor(f, 0).c, 120);
      g.set(10, 10, 0xffffff);
    }),
  },
  /** 불티 (흰·노랑·주황·빨강) */
  champEmber: {
    w: 3,
    h: 3,
    frames: 3,
    build: frames(3, 3, 3, (g, f) => {
      const c = [0xfff2a0, 0xffa030, 0xff4a2a][f];
      g.set(1, 1, f === 0 ? 0xffffff : c);
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) g.set(x, y, c, f === 0 ? 200 : 150);
    }),
  },
  /** 불꽃 혀 (발밑 고리 둘레에서 날름) */
  champFlame: {
    w: 5,
    h: 8,
    frames: 2,
    build: frames(5, 8, 2, (g, f) => {
      rows(g, f ? ["..y..", ".yy..", ".yoy.", "yoooy", "yorry", "orrro", ".rrr.", "..r.."] : ["...y.", "..yy.", ".yoy.", "yooy.", "yorry", "orrro", ".rrr.", "..r.."], { y: 0xfff0a0, o: 0xffa030, r: 0xe8381e });
    }),
  },
  /** 운영자 오라 검은 비단 연기 (보랏빛 도는 검정, 반투명) */
  staffSmoke: {
    w: 7,
    h: 4,
    frames: 2,
    build: frames(7, 4, 2, (g, f) => {
      rows(g, f ? ["..dd...", ".dDDdd.", "dDDDDdd", ".ddDd.."] : ["...dd..", ".ddDDd.", "ddDDDDd", "..dDdd."], { d: 0x1a1426, D: 0x3a2a52 });
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) g.px[i] = (g.px[i] & ~255) | 190;
    }),
  },
  /** 물방울 */
  champDrop: {
    w: 3,
    h: 4,
    frames: 1,
    build: () => {
      const g = new Grid(3, 4);
      rows(g, [".w.", "wbw", "bbb", ".b."], { w: 0xe8fbff, b: 0x4ac0ff });
      return g;
    },
  },
  // ── 11/15 수집 의뢰 보상 ──
  /** 반딧불 수집가 오라: 노란 연둣빛 반딧불 (0 = 켜짐, 1 = 희미) */
  qFirefly: {
    w: 5,
    h: 5,
    frames: 2,
    build: frames(5, 5, 2, (g, f) => {
      if (f === 0) {
        g.ellipse(2.5, 2.5, 2.5, 2.5, 0xc8ff5a, 70);
        for (const [x, y] of [[2, 1], [1, 2], [3, 2], [2, 3]]) g.set(x, y, 0xe4ff8a, 220);
        g.set(2, 2, 0xfdffd8);
      } else {
        for (const [x, y] of [[2, 1], [1, 2], [3, 2], [2, 3]]) g.set(x, y, 0xb8f04a, 90);
        g.set(2, 2, 0xe4ff8a, 230);
      }
    }),
  },
  /** 금붕어 펫: 둥근 물방울 어항 속 금붕어 (꼬리 살랑 2프레임) */
  qGoldfish: {
    w: 13,
    h: 13,
    frames: 2,
    build: frames(13, 13, 2, (g, f) => {
      // 물방울 (안쪽은 옅은 물빛, 테두리는 밝게, 왼쪽 위 반사광)
      g.ellipse(6.5, 6.5, 6.4, 6.4, 0xbfe8ff, 150);
      g.ellipse(6.5, 6.5, 5.3, 5.3, 0x8ad0f4, 70);
      g.ellipse(6.5, 7.8, 4.6, 3.4, 0x6ab8e8, 60);
      // 금붕어 (오른쪽을 본다)
      g.ellipse(7, 6.5, 2.7, 1.9, 0xff8a2a);
      g.set(8, 5, 0xffc04a);
      g.set(7, 5, 0xffb03a);
      g.set(5, 7, 0xe8601a);
      g.set(9, 6, 0x1a1210);
      g.set(10, 7, 0xffd8a0);
      // 꼬리 (나풀)
      const ty = f ? 1 : 0;
      g.set(4, 5 + ty, 0xffa040);
      g.set(3, 5 + ty, 0xffc070);
      g.set(3, 7 + ty, 0xffc070);
      g.set(4, 7, 0xffa040);
      g.set(2, 6 + ty, 0xffe0b0, 220);
      // 지느러미 · 반사광 · 작은 공기 방울
      g.set(7, 8, 0xffc070);
      g.set(3, 3, 0xffffff, 230);
      g.set(4, 2, 0xffffff, 200);
      g.set(2, 4, 0xffffff, 160);
      g.set(9, 3 - (f ? 1 : 0), 0xffffff, 200);
    }),
  },
  mountCarp: { w: MOUNT_W, h: MOUNT_H, frames: MOUNT_FRAMES, build: () => mountSheet("carp") },
  /** 밤낚시 오라: 발밑에서 퍼지는 물결 고리 */
  qRipple: {
    w: 26,
    h: 8,
    frames: 1,
    build: () => {
      const g = new Grid(26, 8);
      g.ellipse(13, 4, 13, 4, 0xbfe6ff, 210);
      g.ellipse(13, 4, 11.4, 3, 0x000000, 0);
      for (let i = 0; i < g.px.length; i++) if ((g.px[i] & 255) === 0) g.px[i] = 0;
      for (const x of [3, 9, 17, 23]) g.set(x, x < 13 ? 1 : 6, 0xffffff, 240);
      return g;
    },
  },
  /** 밤낚시 오라: 달빛 윤슬 (은빛·연보랏빛 반짝) */
  qGlint: {
    w: 5,
    h: 5,
    frames: 2,
    build: frames(5, 5, 2, (g, f) => {
      const c = f ? 0xd8c8ff : 0xe8f4ff;
      g.set(2, 2, 0xffffff);
      for (const [x, y] of [[2, 1], [2, 3], [1, 2], [3, 2]]) g.set(x, y, c, 230);
      for (const [x, y] of [[0, 2], [4, 2]]) g.set(x, y, c, 110);
    }),
  },
  /** 밤낚시 오라: 몸 뒤 달빛 (희귀 등급 보랏빛에 푸른 달빛) */
  qMoonGlow: {
    w: 28,
    h: 30,
    frames: 1,
    build: () => {
      const g = new Grid(28, 30);
      g.ellipse(14, 15, 14, 15, 0x7a8af0, 30);
      g.ellipse(14, 15, 10, 11, 0xa8b8ff, 38);
      g.ellipse(14, 15, 6, 7, 0xe0e8ff, 44);
      return g;
    },
  },
  /** 밤낚시 오라: 물결에서 뛰어오르는 은빛 물고기 */
  qJumpFish: {
    w: 6,
    h: 3,
    frames: 1,
    build: () => {
      const g = new Grid(6, 3);
      g.hline(1, 4, 1, 0xd8e4f0);
      g.set(2, 0, 0xf4f8ff);
      g.set(3, 0, 0xf4f8ff);
      g.set(2, 2, 0xa8b8cc);
      g.set(3, 2, 0xa8b8cc);
      g.set(0, 0, 0xc8d4e4);
      g.set(0, 2, 0xc8d4e4);
      g.set(4, 1, 0x1a2a3a);
      g.set(5, 1, 0xe8f0ff);
      return g;
    },
  },
  /** 채집왕 망토: 끝자락에서 흩날리는 금가루 */
  qGoldDust: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      g.set(1, 1, f ? 0xfff0b0 : 0xffffff);
      if (!f) for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) g.set(x, y, 0xffd25a, 170);
    }),
  },
  /** 광부 헬멧: 옆을 볼 때 앞으로 뻗는 이마 등불 빛 (꼭짓점 = 왼쪽 가운데, 더해 그린다) */
  qLampBeam: {
    w: 18,
    h: 11,
    frames: 1,
    build: () => {
      const g = new Grid(18, 11);
      for (let x = 0; x < 18; x++) {
        const half = 0.6 + x * 0.27;
        for (let y = 0; y < 11; y++) {
          const d = Math.abs(y + 0.5 - 5.5);
          if (d > half) continue;
          const a = Math.round(120 * (1 - x / 18) * (1 - (d / half) * 0.6));
          if (a > 4) g.set(x, y, 0xfff0b0, a);
        }
      }
      return g;
    },
  },
  /** 스노볼 오라: 유리 돔 테두리 (안은 비고, 왼쪽 위에 반사광) */
  qGlobe: {
    w: 34,
    h: 40,
    frames: 1,
    build: () => {
      const g = new Grid(34, 40);
      const cx = 17;
      const cy = 21;
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 34; x++) {
          const d = Math.hypot((x + 0.5 - cx) / 16.5, (y + 0.5 - cy) / 19.5);
          if (y > 36) continue;
          if (d <= 1 && d > 0.93) g.set(x, y, 0xd8f4ff, 120);
          else if (d <= 0.93 && d > 0.86) g.set(x, y, 0xb8e4ff, 34);
        }
      // 반사광 (왼쪽 위 호 + 작은 점)
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.1 + i * 0.06);
        g.set(Math.round(cx + Math.cos(a) * 13), Math.round(cy + Math.sin(a) * 15.5), 0xffffff, 210 - i * 10);
      }
      g.set(cx + 9, cy - 13, 0xffffff, 180);
      return g;
    },
  },
  /** 스노볼 오라: 발밑 눈 둔덕 + 붉은 받침 테 */
  qSnowMound: {
    w: 30,
    h: 7,
    frames: 1,
    build: () => {
      const g = new Grid(30, 7);
      g.ellipse(15, 4, 15, 3, 0xb8323a, 200);
      g.ellipse(15, 3.2, 13.5, 2.4, 0xf2f6ff, 230);
      g.ellipse(15, 2.6, 9, 1.4, 0xffffff, 240);
      for (const x of [4, 11, 19, 25]) g.set(x, 4, 0xc8d8f0, 230);
      for (let x = 2; x < 28; x += 3) g.set(x, 6, 0xf2c43a, 230);
      return g;
    },
  },
  /** 꼬마 펭귄 펫: 0·1 뒤뚱 걷기 (번갈아 기울기) · 2 배로 미끄러지기. 빨간 목도리 */
  qPenguin: {
    w: 11,
    h: 11,
    frames: 3,
    build: frames(11, 11, 3, (g, f) => {
      const ink = 0x22263a;
      const belly = 0xf6f4ee;
      const beak = 0xf2a03a;
      const scarf = 0xe0404a;
      if (f === 2) {
        // 배를 깔고 앞으로 쭉 (머리는 오른쪽)
        g.ellipse(5, 7.5, 4.8, 2.4, ink);
        g.ellipse(5.4, 8.6, 3.6, 1.3, belly);
        g.ellipse(8.6, 6.4, 2, 1.8, ink);
        g.set(9, 6, 0xffffff);
        g.set(9, 5, 0xffffff);
        g.set(10, 7, beak);
        g.set(8, 7, 0xff9ab0);
        g.vline(7, 6, 8, scarf);
        g.set(6, 5, scarf);
        g.set(1, 6, ink);
        g.set(0, 8, beak);
        g.set(0, 9, beak);
        return;
      }
      const lean = f ? 1 : 0;
      g.ellipse(5 + lean * 0.4, 6.4, 3.6, 4.3, ink);
      g.ellipse(5.8 + lean * 0.4, 7.2, 2.4, 3.1, belly);
      g.ellipse(5.6 + lean * 0.4, 3, 2.6, 2.3, ink);
      // 얼굴: 흰 눈 테 + 눈 + 볼터치 + 부리
      g.set(6 + lean, 3, 0xffffff);
      g.set(7 + lean, 3, 0x0a0b10);
      g.set(7 + lean, 4, 0xff9ab0);
      g.set(8 + lean, 4, beak);
      g.set(9 + lean, 4, beak);
      // 목도리 (끝자락이 뒤로 펄럭)
      g.hline(3 + lean, 7 + lean, 5, scarf);
      g.set(2 + lean, 5 + lean, scarf);
      g.set(1 + lean, 6, 0xb82a34);
      // 날개 · 발 (번갈아)
      g.set(2 + lean, f ? 7 : 8, ink);
      g.set(1 + lean, f ? 8 : 9, ink);
      g.hline(f ? 3 : 4, f ? 4 : 5, 10, beak);
      g.hline(f ? 6 : 7, f ? 7 : 8, f ? 10 : 9, beak);
      g.outline(0x101420, false, 150);
    }),
  },
  /** 연 날리는 등: 방패연 (흰 한지 · 붉은 꼭지 · 가운데 방구멍 · 대살) + 꼬리 두 줄 펄럭 2프레임 */
  qKite: {
    w: 11,
    h: 15,
    frames: 2,
    build: frames(11, 15, 2, (g, f) => {
      const paper = 0xf8f4e8;
      const stick = 0xc8a060;
      g.rect(1, 0, 9, 11, paper);
      // 꼭지 (위 가운데 붉은 반달) · 아래 귀퉁이 파랑·노랑
      g.ellipse(5.5, 0.5, 2.6, 2.4, 0xd8302a);
      g.set(1, 10, 0x3a6ad8);
      g.set(2, 10, 0x3a6ad8);
      g.set(9, 10, 0xf2c43a);
      g.set(8, 10, 0xf2c43a);
      // 대살 (대각선 둘 + 가로 하나)
      for (let i = 0; i < 9; i++) {
        g.set(1 + i, Math.round(1 + i * 1.1), stick);
        g.set(9 - i, Math.round(1 + i * 1.1), stick);
      }
      g.hline(1, 9, 3, stick);
      // 방구멍 (가운데 동그란 구멍)
      g.ellipse(5.5, 5.5, 1.7, 1.7, 0x000000, 0);
      for (let i = 0; i < g.px.length; i++) if ((g.px[i] & 255) === 0) g.px[i] = 0;
      g.set(4, 4, stick);
      g.set(6, 4, stick);
      // 꼬리 두 줄 (펄럭)
      const sw = f ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        g.set(2 + (i % 2 ? sw : 0), 11 + i, i % 2 ? 0x3a6ad8 : 0xd8302a, 230);
        g.set(8 + (i % 2 ? -sw : 0), 11 + i, i % 2 ? 0xd8302a : 0xf2c43a, 230);
      }
      g.outline(0x3a2a1a, false, 200);
    }),
  },
  /** 연 날리는 등: 등에 멘 작은 얼레 */
  qReel: {
    w: 5,
    h: 5,
    frames: 1,
    build: () => {
      const g = new Grid(5, 5);
      g.rect(1, 0, 3, 5, 0x8a5a2a);
      g.vline(2, 0, 4, 0xe8d8b0);
      g.hline(0, 4, 0, 0x5a3a1a);
      g.hline(0, 4, 4, 0x5a3a1a);
      g.outline(0x2a1a0e, false, 200);
      return g;
    },
  },
  /** 광부 헬멧: 앞을 볼 때 이마 등불의 번짐 */
  qLampFlare: {
    w: 11,
    h: 11,
    frames: 1,
    build: () => {
      const g = new Grid(11, 11);
      g.ellipse(5.5, 5.5, 5.5, 5.5, 0xffe08a, 50);
      g.ellipse(5.5, 5.5, 3, 3, 0xfff0b8, 90);
      for (const [x, y] of [[5, 0], [5, 10], [0, 5], [10, 5]]) g.set(x, y, 0xfff4c8, 70);
      return g;
    },
  },
  /** 11/15 사이렌 모자: 경광등에서 뻗는 빛줄기 (꼭짓점 = 왼쪽 가운데, 0 빨강 · 1 파랑, 더해 그린다) */
  uSirenBeam: {
    w: 22,
    h: 9,
    frames: 2,
    build: frames(22, 9, 2, (g, f) => {
      const c = f ? 0x5aa8ff : 0xff5a40;
      for (let x = 0; x < 22; x++) {
        const half = 0.5 + x * 0.19;
        for (let y = 0; y < 9; y++) {
          const d = Math.abs(y + 0.5 - 4.5);
          if (d > half) continue;
          const a = Math.round(150 * (1 - x / 22) * (1 - (d / half) * 0.55));
          if (a > 4) g.set(x, y, c, a);
        }
      }
    }),
  },
  /** 사이렌 모자: 경광등 둘레의 번쩍임 (0 빨강 · 1 파랑) */
  uSirenFlare: {
    w: 9,
    h: 9,
    frames: 2,
    build: frames(9, 9, 2, (g, f) => {
      const c = f ? 0x7ab8ff : 0xff6a50;
      g.ellipse(4.5, 4.5, 4.5, 4.5, c, 70);
      g.ellipse(4.5, 4.5, 2.2, 2.2, f ? 0xd8ecff : 0xffd8c8, 150);
    }),
  },
  // 11/15: 말랑 꾸미기 묶음 (cuteFx.ts)
  ...CUTE_FX_ART,
  // 12월 크리스마스 이벤트 한정 (xmasFx.ts)
  ...XMAS_FX_ART,
  // 11/17 테마 꾸미기 묶음 (themeFx.ts)
  ...THEME_FX_ART,
  // 11/17: 동물원 새 펫 묶음 (petPack.ts)
  ...PET_PACK_ART,
} satisfies Record<string, ArtDef>;

export type FxArtId = keyof typeof FX_ART;

function fill(w: number, h: number, c: Color, a: number): Grid {
  const g = new Grid(w, h);
  g.rect(0, 0, w, h, c, a);
  return g;
}

// ── 아이템 → 연출 규칙 ──

/** mount = 타는 펫 (그림은 mountArt 시트, 따라올 때는 몸집만큼 far배 떨어져 걷는다) */
/** slide = 걷는 동안 가끔 배로 미끄러진다 (그림 프레임 2, 꼬마 펭귄) */
/**
 * pose = 11/17 새 펫: 멈췄을 때 idle 프레임을 idleFps로 돌고, 오래 서 있으면 every마다 act 프레임을 actMs씩 한 번 보여 준다 (귀여운 동작).
 * lift = 동작 프레임마다 들어 올리는 높이 (폴짝). 없으면 걷기 두 장을 천천히 (예전 펫)
 */
type PetPose = { idle: readonly number[]; act: readonly number[]; actMs: number; every: number; lift?: readonly number[] };
/** glowArt·glowFrame·glowAt = 번짐 그림을 바꿔 그 자리에 (펫 그림 아래 가운데 기준 [오른쪽을 볼 때 dx, 위로 up] — 꼬마 루돌프 코). 없으면 도깨비불 번짐을 몸 가운데에 */
type PetSpec = { kind: "pet"; art: FxArtId; hover: number; fps: number; idleFps: number; alpha?: number; squash?: boolean; glow?: boolean; glowArt?: FxArtId; glowFrame?: number; glowAt?: readonly [number, number]; mount?: MountKind; far?: number; slide?: boolean; pose?: PetPose; /** 12월 루돌프 썰매: 타고 멈춰 있어도 옆모습이면 pose(멈춤·동작)를 쓴다 */ rideRest?: boolean };
type TrailSpec = { kind: "trail"; art: FxArtId; step: number; life: number; motion: "prints" | "splash" | "rise" | "scatter" | "pop"; light?: boolean };
/** 추가분 2: fall = 머리 위에서 떨어짐, float = 옆에서 떠오름, steam = 머리 위로 김, ring = 몸 둘레를 돈다 (art로 그림을 고른다) */
type AuraSpec = {
  kind: "aura";
  /** tier* = 25번 프리미엄 외형 등급 연출 (꾸미기가 아니라 몸에 딸린다) */
  motion: "orbit" | "snow" | "petals" | "cloud" | "notes" | "zzz" | "fall" | "float" | "steam" | "ring" | "tierFine" | "tierRare" | "tierLegend" | "champ" | "qFireflies" | "qNightfish" | "qCapeDust" | "qLamp" | "qSnowGlobe" | "qSnowPuff" | "qWishGlow" | "uSiren" | "gMist" | XmasMotion;
  art?: FxArtId;
  light?: boolean;
  /** champ = 주간 랭킹 1위 오라 테마 (champTheme) */
  theme?: number;
};
type WingSpec = { kind: "wings"; art: FxArtId; flapMs: number; amp: number };
type HeldSpec = { kind: "held"; item: "umbrella" | "balloon" | "kite" };
export type FxSpec = PetSpec | TrailSpec | AuraSpec | WingSpec | HeldSpec;

export const COSMETIC_FX: Readonly<Record<string, FxSpec>> = {
  hand_umbrella: { kind: "held", item: "umbrella" },
  hand_balloon: { kind: "held", item: "balloon" },
  back_wings_bat: { kind: "wings", art: "wingsBat", flapMs: 95, amp: 0.2 },
  back_wings_butterfly: { kind: "wings", art: "wingsButterfly", flapMs: 230, amp: 0.3 },
  feet_prints: { kind: "trail", art: "print", step: 7, life: 2600, motion: "prints" },
  feet_puddle: { kind: "trail", art: "puddle", step: 9, life: 700, motion: "splash" },
  feet_sparkle: { kind: "trail", art: "sparkStar", step: 6, life: 650, motion: "rise", light: true },
  feet_leaves: { kind: "trail", art: "leaf", step: 7, life: 1900, motion: "scatter" },
  feet_hearts: { kind: "trail", art: "heart", step: 11, life: 1500, motion: "pop" },
  aura_sparkle: { kind: "aura", motion: "orbit" },
  aura_snow: { kind: "aura", motion: "snow" },
  aura_petals: { kind: "aura", motion: "petals" },
  aura_raincloud: { kind: "aura", motion: "cloud" },
  aura_notes: { kind: "aura", motion: "notes" },
  aura_zzz: { kind: "aura", motion: "zzz" },
  // 추가분 2
  back_wings_angel: { kind: "wings", art: "wingsAngel", flapMs: 260, amp: 0.22 },
  back_wings_dragon: { kind: "wings", art: "wingsDragon", flapMs: 140, amp: 0.25 },
  feet_snowprints: { kind: "trail", art: "snowPrint", step: 7, life: 3000, motion: "prints" },
  feet_paws: { kind: "trail", art: "paw", step: 8, life: 2400, motion: "prints" },
  feet_bubbles: { kind: "trail", art: "bubble", step: 9, life: 1100, motion: "rise" },
  feet_confetti: { kind: "trail", art: "confetti", step: 5, life: 1400, motion: "scatter" },
  feet_coins: { kind: "trail", art: "coin", step: 10, life: 1300, motion: "pop" },
  feet_stars: { kind: "trail", art: "sparkStar", step: 8, life: 1200, motion: "pop", light: true },
  aura_steam: { kind: "aura", motion: "steam", art: "steam" },
  aura_bubbles: { kind: "aura", motion: "float", art: "bubble" },
  aura_leaves: { kind: "aura", motion: "fall", art: "leaf" },
  aura_hearts: { kind: "aura", motion: "float", art: "heart" },
  aura_ghosts: { kind: "aura", motion: "ring", art: "miniGhost" },
  aura_money: { kind: "aura", motion: "fall", art: "bill" },
  // 31번 운영자 전용
  staff_steps: { kind: "trail", art: "soulMist", step: 8, life: 1600, motion: "rise", light: true },
  staff_souls: { kind: "aura", motion: "ring", art: "soulFlame", light: true },
  // 11/17 유령선 한정
  gh_mist: { kind: "aura", motion: "gMist", light: true },
  pet_cat: { kind: "pet", art: "petCat", hover: 0, fps: 7, idleFps: 1.5 },
  pet_dog: { kind: "pet", art: "petDog", hover: 0, fps: 8, idleFps: 3 },
  pet_duck: { kind: "pet", art: "petDuck", hover: 0, fps: 5, idleFps: 1 },
  pet_slime: { kind: "pet", art: "petSlime", hover: 0, fps: 5, idleFps: 1.6, squash: true },
  pet_bird: { kind: "pet", art: "petBird", hover: 10, fps: 10, idleFps: 4 },
  pet_wisp: { kind: "pet", art: "petWisp", hover: 7, fps: 6, idleFps: 3, alpha: 0.92, glow: true },
  pet_fox: { kind: "pet", art: "petFox", hover: 0, fps: 8, idleFps: 2 },
  pet_hound: { kind: "pet", art: "mountHound", hover: 0, fps: 7, idleFps: 2, mount: "hound", far: 1.7 },
  pet_goose: { kind: "pet", art: "mountGoose", hover: 0, fps: 6, idleFps: 1.5, mount: "goose", far: 1.6 },
  pet_deer: { kind: "pet", art: "mountDeer", hover: 0, fps: 7, idleFps: 1.5, mount: "deer", far: 1.7 },
  // 11/15 수집 의뢰 보상 (머리·손 그림은 avatarGear 시트, 여기는 따로 붙는 연출)
  q_aura_firefly: { kind: "aura", motion: "qFireflies", light: true },
  q_aura_nightfish: { kind: "aura", motion: "qNightfish", light: true },
  q_pet_goldfish: { kind: "pet", art: "qGoldfish", hover: 9, fps: 5, idleFps: 2.5 },
  q_aura_snowglobe: { kind: "aura", motion: "qSnowGlobe", light: true },
  q_pet_penguin: { kind: "pet", art: "qPenguin", hover: 0, fps: 7, idleFps: 1.5, slide: true },
  q_back_kite: { kind: "held", item: "kite" },
  q_ride_carp: { kind: "pet", art: "mountCarp", hover: 0, fps: 4, idleFps: 1.5, mount: "carp", far: 1.7 },
  // 11/15: 말랑 꾸미기 묶음 (cuteFx.ts)
  ...CUTE_FX,
  // 12월 크리스마스 이벤트 한정 (xmasFx.ts)
  ...XMAS_FX,
  // 11/17 테마 꾸미기 묶음 (themeFx.ts)
  ...THEME_FX,
  // 11/17: 동물원 새 펫 묶음 (petPack.ts)
  ...PET_PACK_FX,
};

/** 이 펫이 타는 펫이면 그 그림 종류 (아니면 null) */
export function mountOf(petId: string | null | undefined): MountKind | null {
  const s = petId ? COSMETIC_FX[petId] : undefined;
  return s?.kind === "pet" && s.mount ? s.mount : null;
}
/** 타는 펫에 올라탄 사람을 들어 올리는 높이 (px, 타는 펫이 아니면 0) */
export function riderLift(petId: string | null | undefined): number {
  const m = mountOf(petId);
  return m ? mountLift(m) : 0;
}
/** 11/19 걸을 때 탄 사람을 발걸음에 맞춰 1px 출렁일지 (미끄러지는 잉어는 몸이 그대로라 출렁이지 않는다 — MOUNT_GLIDE) */
export function riderBobs(petId: string | null | undefined): boolean {
  const m = mountOf(petId);
  return !!m && !MOUNT_GLIDE[m];
}

/** 따로 그리는 F8 꾸미기 id 전부 (SPRITE_COSMETICS에 들어간다) */
export const COSMETIC_FX_IDS: readonly string[] = Object.keys(COSMETIC_FX);

/** 11/15: 시트에 그려지는 꾸미기(avatarGear)에 덧붙는 연출 — 채집왕 망토 금가루 · 광부 헬멧 이마 등불 빛 (아이콘·목록은 시트 쪽) */
export const GEAR_EXTRA_FX: Readonly<Record<string, FxSpec>> = {
  q_back_cape: { kind: "aura", motion: "qCapeDust", light: true },
  q_hat_miner: { kind: "aura", motion: "qLamp", light: true },
  q_hat_snow: { kind: "aura", motion: "qSnowPuff" },
  q_hand_wishlamp: { kind: "aura", motion: "qWishGlow", light: true },
  // 11/19 친구 초대 한정 마중 등불: 소원 등불과 같은 따뜻한 빛
  inv_hand_lantern: { kind: "aura", motion: "qWishGlow", light: true },
  // 11/15 긴급 의뢰: 사이렌 모자 경광등이 빙글빙글 (빨강·파랑 빛줄기)
  u_hat_siren: { kind: "aura", motion: "uSiren", light: true },
  // 12월 크리스마스: 눈꽃 왕관 결정 반짝 · 지팡이 사탕 별빛 (xmasFx.ts)
  ...XMAS_GEAR_FX,
};

/**
 * 25번 프리미엄 외형 등급 연출 (몸 id만 알면 되므로 내 화면·다른 사람 화면·상점 미리보기가 똑같다).
 * 고급 = 가끔 반짝, 희귀 = 보랏빛 + 금 반짝이가 몸 둘레를 돈다, 전설 = 금빛 + 무지개 반짝이가 나선으로 피어오른다. 일반은 없음
 */
const TIER_FX: Readonly<Record<string, AuraSpec>> = {
  fine: { kind: "aura", motion: "tierFine", light: true },
  rare: { kind: "aura", motion: "tierRare", light: true },
  legend: { kind: "aura", motion: "tierLegend", light: true },
};

/** 몸에 딸린 등급 연출 (없으면 null) */
export function bodyFx(body: string | null | undefined): FxSpec | null {
  const tier = bodyTier(body);
  return (tier && TIER_FX[tier]) || null;
}

/**
 * 주간 랭킹 1위 값 → 오라 테마 (오라를 그리지 않으면 -1): 한 랭킹이면 그 색(0 금 포인트 · 1 빨강 사냥 · 2 파랑 낚시),
 * 2관왕은 두 색을 섞은 테마(3 금+빨강 · 4 금+파랑 · 5 빨강+파랑), 3관왕은 무지개(6). 본인이 끈 오라(CHAMP_AURA_OFF)는 -1
 */
export function champTheme(bits: number | undefined): number {
  if (!champAuraOn(bits)) return -1;
  const b = champBoards(bits).map((x) => CHAMP_BOARDS.indexOf(x));
  if (b.length === 3) return 6;
  if (b.length === 2) return b[0] === 0 ? (b[1] === 1 ? 3 : 4) : 5;
  return b[0] ?? -1;
}

// ── 그리기 명령 ──

/**
 * 한 장면의 그림 한 장. layer: ground = 바닥 장식(아바타 밑), body = 아바타와 y 정렬(depth 사용), light = 빛(더하기, 맨 위).
 * (x, y) = 월드 좌표의 원점 자리, (ox, oy) = 원점 비율. rot = 라디안 (원점 기준)
 */
export type FxCmd = {
  art: FxArtId;
  frame: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  alpha: number;
  sx: number;
  sy: number;
  rot: number;
  flip: boolean;
  layer: "ground" | "body" | "light";
  depth: number;
  /** body 층이지만 빛처럼 더해 그린다 (몸 둘레를 도는 빛 입자: 뒤쪽 반원은 몸 뒤에 가려진다) */
  add?: boolean;
  /** 밝기 (1 = 그대로). 몸 뒤쪽으로 돈 입자는 조금 어둡게 → 입체감 */
  dim?: number;
  /** 아래쪽에서 잘라 낼 줄 수 (물에 잠긴 펫). 없으면 0 — 캔버스 미리보기는 물이 없어 쓰지 않는다 */
  crop?: number;
};

export type FxInput = {
  now: number;
  /** 지난 프레임부터 ms */
  dt: number;
  /** 발밑 (논리 위치) */
  x: number;
  y: number;
  /** 그림의 발바닥 높이 (점프·매달리기로 들어 올린 만큼 위) */
  headY: number;
  dir: DirId;
  /** 걷거나 달리는 중 (발자국) */
  moving: boolean;
  /** 잠수·해먹·매달리기처럼 몸에 붙은 연출을 숨길 때 */
  hidden: boolean;
  /** 발바닥에서 그림 맨 위 (머리 꾸미기 포함), 어깨 높이 */
  artTop: number;
  shoulder: number;
  /** 손 자리 (avatar.handAnchor) */
  hand: { dx: number; up: number };
  /** 움직임 줄이기: 둥실·반짝임을 멈춘다 */
  reduced: boolean;
  /** 멈춘 그림 (입어 보기 미리보기의 움직임 줄이기): 시각 0의 모습 + 걷기면 발자국을 미리 깔아 둔다 */
  still?: boolean;
  /** 타는 펫에 올라타 있다 (펫이 타는 펫일 때만 뜻이 있다): 펫을 발밑에 그리고 탄 사람 앞에 머리·엉덩이를 덧그린다 */
  riding?: boolean;
  /** 점프 높이 (타고 있을 때 펫도 같이 뛴다) */
  hop?: number;
  /** 11/17 배·카약·제트스키·놀이기구 같은 탈것에 타 있다: 펫을 아예 그리지 않고, 내리면 바로 옆에서 다시 나타난다 (사용자 요청) */
  petOff?: boolean;
  /** 주인이 물에서 수영(swim)·잠수(dive) 중: 걷는 펫도 따라 들어가 헤엄치거나 수면 아래로 (나는 펫은 물 위를 그대로 난다) */
  water?: "swim" | "dive" | null;
  /** 아바타 그림의 실제 depth (앉기·집 안 자세·놀거리는 발 y와 다르게 덮어쓴다). 없으면 y */
  depth?: number;
  /** 화면 밖 (주간 1위 오라처럼 무거운 연출은 그리지 않는다) */
  offscreen?: boolean;
  /**
   * 오라(착용 오라·전용 오라)를 그릴 몸 자리. 주면 hidden 자세(수영·잠수·매달리기·해먹·눕기·욕조)에서도 오라를 그린다:
   * base = 발밑 줄(물이면 수면, 공중이면 몸 아래), top = 보이는 몸 꼭대기, dim = 밝기 배율(잠수 중엔 은은하게)
   */
  aura?: { base: number; top: number; dim: number; wide?: number };
  /**
   * 운영자 오라를 은은하게 (사냥 화면 — 사냥 장비가 가리지 않게): 몸 앞에 그리던 빛까지 모두 몸 뒤로 보내고 투명도에 이 값을 곱한다.
   * 없으면 그대로 (마을·집은 화려하게)
   */
  staffSoft?: number;
  /**
   * 11/16 바베큐로 커진 배율 (없으면 1). artTop·shoulder는 이미 이 배율이 들어간 값이고,
   * 몸에 붙은 그림(날개·우산·풍선·연)은 원래 크기로 계산한 뒤 발밑(x, headY) 기준으로 이만큼 키운다 (몸 그림이 발밑 기준으로 커지는 것과 같게)
   */
  scale?: number;
};

/** 11/16 out[from..]을 (ax, ay) 기준으로 k배 (위치·크기) */
export function scaleCmds(out: FxCmd[], from: number, ax: number, ay: number, k: number): void {
  for (let i = from; i < out.length; i++) {
    const c = out[i];
    c.x = ax + (c.x - ax) * k;
    c.y = ay + (c.y - ay) * k;
    c.sx *= k;
    c.sy *= k;
  }
}

/** 몸에 붙은 연출의 기준 depth: 아바타 그림 depth (덮어쓴 값이 있으면 그것) */
const bodyDepth = (f: Pick<FxInput, "y" | "depth">) => f.depth ?? f.y;

type Part = { x: number; y: number; born: number; frame: number; flip: boolean; vx: number };

const TRAIL_POOL = 14;
/** 새 흔적을 발에서 진행 방향 반대쪽으로 이만큼 (지나온 자리) */
const TRAIL_BEHIND = 2;
/** 몸 그림 반너비 (빛 흔적이 몸과 겹치는지 볼 때) */
const BODY_HALF_W = 7;

/** 흔적 그림이 몸 그림(발바닥 줄 위, 머리 꼭대기 아래, 몸 너비 안)과 겹치는지. 발바닥 줄 아래는 바닥이라 겹침이 아니다 */
function overBody(c: FxCmd, a: { w: number; h: number }, f: Pick<FxInput, "x" | "headY" | "artTop" | "aura">): boolean {
  const hw = (a.w * Math.abs(c.sx)) / 2;
  const top = c.y - a.h * Math.abs(c.sy) * c.oy;
  const bottom = top + a.h * Math.abs(c.sy);
  return Math.abs(c.x - f.x) < BODY_HALF_W * (f.aura?.wide ?? 1) + hw && top < f.headY - 1 && bottom > f.headY - f.artTop;
}
const PET_LAG_MS = 240;
/** 펫이 물에 들어가거나 나오는 데 걸리는 시간 (뒤따라오느라 주인보다 조금 늦게 잠긴다) */
const PET_WADE_MS = 260;
/** 헤엄칠 때 몸이 잠기는 비율 (머리·등만 보인다) */
const PET_SWIM_SINK = 0.55;
/** 잠수한 펫 물방울 하나가 올라오는 시간 */
const PET_BUBBLE_MS = 900;

/** 펫이 물에 잠기는 줄 수 (그림 높이 h). 나는 펫(hover)은 잠기지 않는다. dive = 그림 전체 + 1 → 수면 아래 */
export function petSinkTarget(water: FxInput["water"], hover: number, h: number): number {
  if (!water || hover > 0) return 0;
  return water === "dive" ? h + 1 : Math.round(h * PET_SWIM_SINK);
}

/** 11/17 이 빌드가 모르는 펫 id를 받았을 때 대신 보여 줄 펫 (새 실시간 서버 + 옛 화면) */
export const UNKNOWN_PET_STANDIN = "pet_slime";
/** 이 빌드가 모르는 펫 id인지 (꾸미기 목록에 없는 pet_·q_pet_·q_ride_) */
export function isUnknownPetId(id: unknown): boolean {
  return typeof id === "string" && /^(pet_|q_pet_|q_ride_)/.test(id) && !itemById(id);
}

/** 몸 뒤쪽으로 조금 떨어진 펫 자리 (그림자 유령 친구와 같은 값) */
export function petBack(dir: DirId): [number, number] {
  return dir === DIR.left ? [12, -1] : dir === DIR.right ? [-12, -1] : dir === DIR.up ? [7, 5] : [-9, -5];
}

function heading(dir: DirId): [number, number] {
  return dir === DIR.left ? [-1, 0] : dir === DIR.right ? [1, 0] : dir === DIR.up ? [0, -1] : [0, 1];
}

/**
 * 11/17 멈춘 펫의 프레임·들어 올림: rest = 멈춘 뒤 ms (-1 = 멈춘 그림·움직임 줄이기 → 첫 멈춤 프레임).
 * every마다 끝 무렵 act를 actMs씩 한 번 (멈추자마자는 하지 않는다 — 처음은 every - 동작 길이 뒤)
 */
export function petPoseFrame(p: PetPose, idleFps: number, rest: number): [number, number] {
  if (rest < 0) return [p.idle[0], 0];
  const len = p.act.length * p.actMs;
  const cyc = rest % p.every;
  if (cyc >= p.every - len) {
    const i = Math.min(p.act.length - 1, Math.floor((cyc - (p.every - len)) / p.actMs));
    return [p.act[i], p.lift?.[i] ?? 0];
  }
  return [p.idle[Math.floor((rest / 1000) * idleFps) % p.idle.length], 0];
}

/** 0..1 결정적 난수 (입자마다 고정된 흩어짐) */
function h01(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * 한 아바타의 F8 연출 상태 (펫 따라오기, 발자국, 풍선 흔들림). 화면과 무관한 순수 계산이라 테스트할 수 있다.
 *   sim.setLook(look); 매 프레임 sim.step(input, out) → out의 FxCmd를 그린다.
 */
export class CosmeticFxSim {
  private specs: [string, FxSpec][] = [];
  private petX = 0;
  private petY = 0;
  private petOn = false;
  /** 펫이 물에 잠긴 줄 수 (부드럽게 따라간다) */
  private petSink = 0;
  private parts: Part[] = [];
  private partNext = 0;
  private walked = 0;
  private lastX = NaN;
  private lastY = NaN;
  private stepAlt = 0;
  private balX = 0;
  private balY = 0;
  private balOn = false;
  private kiteX = 0;
  private kiteY = 0;
  private kiteOn = false;
  /** 11/17 펫이 멈춰 선 시각 (걷는 중이면 NaN) — 오래 서 있으면 귀여운 동작 */
  private petRestAt = NaN;

  /** body = 몸 id (프리미엄 외형 등급 연출을 함께 건다), champ = 주간 랭킹 1위 값 (1위 오라를 함께 건다 — 착용 오라와 자리를 나눠 둘 다 보인다) */
  setLook(look: readonly string[], body?: string | null, champ?: number, staff?: boolean): void {
    // 11/17 펫은 앞의 한 마리만 (실시간 서버가 옛 화면용으로 끝에 덧붙인 비슷한 펫은 그리지 않는다 — protocol PET_FALLBACK)
    let pets = 0;
    const next = look
      .filter((id) => id in COSMETIC_FX || id in GEAR_EXTRA_FX)
      .map((id) => [id, COSMETIC_FX[id] ?? GEAR_EXTRA_FX[id]] as [string, FxSpec])
      .filter(([, s]) => s.kind !== "pet" || pets++ === 0);
    // 이 빌드가 모르는 새 펫만 왔으면 기본 펫으로 (아무것도 안 따라오는 것보다 낫다)
    if (!pets && look.some(isUnknownPetId)) next.push(["@pet", COSMETIC_FX[UNKNOWN_PET_STANDIN]]);
    const tier = bodyFx(body);
    if (tier) next.push(["@body", tier]);
    // 31번 운영자 오라가 우선 (본인이 끄면 champ에 CHAMP_AURA_OFF) — 아니면 주간 1위 오라
    const theme = staff && !((champ ?? 0) & CHAMP_AURA_OFF) ? STAFF_THEME : champTheme(champ);
    if (theme >= 0) next.push(["@champ", { kind: "aura", motion: "champ", theme, light: true }]);
    const had = new Set(this.specs.map(([id]) => id));
    if (!next.some(([, s]) => s.kind === "pet")) {
      this.petOn = false;
      this.petSink = 0;
    }
    if (!next.some(([, s]) => s.kind === "trail") || next.some(([id, s]) => s.kind === "trail" && !had.has(id))) {
      this.parts = [];
      this.partNext = 0;
    }
    if (!next.some(([, s]) => s.kind === "held" && s.item === "balloon")) this.balOn = false;
    if (!next.some(([, s]) => s.kind === "held" && s.item === "kite")) this.kiteOn = false;
    this.specs = next;
  }

  /** 좌표계를 옮긴다 (입어 보기 무대가 가끔 원점으로 되돌릴 때) */
  shift(dx: number, dy: number): void {
    this.petX += dx;
    this.petY += dy;
    this.balX += dx;
    this.balY += dy;
    this.lastX += dx;
    this.lastY += dy;
    for (const p of this.parts) {
      p.x += dx;
      p.y += dy;
    }
  }

  get empty(): boolean {
    return this.specs.length === 0;
  }

  /** 발바닥에서 연출 맨 위까지 (이름표를 그 위로 올린다). 없으면 0 */
  labelTop(artTop: number, shoulder: number): number {
    let top = 0;
    for (const [, s] of this.specs) {
      if (s.kind === "wings") top = Math.max(top, shoulder + 9);
      else if (s.kind === "held" && s.item === "kite") continue; // 연은 머리 옆 위 — 이름표 자리를 비켜 난다
      else if (s.kind === "held") top = Math.max(top, s.item === "umbrella" ? artTop + 8 : artTop + 6);
      else if (s.kind === "aura" && s.motion === "cloud") top = Math.max(top, artTop + 10);
    }
    return top;
  }

  step(f: FxInput, out: FxCmd[]): void {
    const t = f.still || f.reduced ? 0 : f.now;
    // 11/16 커진 몸: 몸에 붙은 그림은 원래 크기 입력(g)으로 계산해 발밑 기준으로 키운다
    const k = f.scale ?? 1;
    const g = k === 1 ? f : { ...f, artTop: f.artTop / k, shoulder: f.shoulder / k };
    for (const [, s] of this.specs) {
      const n0 = out.length;
      switch (s.kind) {
        case "wings":
          this.wings(s, g, t, out);
          if (k !== 1) scaleCmds(out, n0, f.x, f.headY, k);
          break;
        case "held":
          if (s.item === "umbrella") this.umbrella(g, out);
          else if (s.item === "kite") this.kite(g, t, out);
          else this.balloon(g, t, out);
          if (k !== 1) scaleCmds(out, n0, f.x, f.headY, k);
          break;
        case "pet":
          this.pet(s, f, t, out);
          break;
        case "trail":
          this.trail(s, f, out);
          break;
        case "aura":
          if (f.aura) {
            // 모든 자세에서: 보이는 몸 자리에 맞춰 그린다 (물이면 수면 위, 공중이면 몸 아래로 따라간다, 타는 펫이면 펫까지 감싸게)
            const n = out.length;
            this.aura(s, { ...f, headY: f.aura.base, artTop: Math.max(6, f.aura.base - f.aura.top) }, t, out);
            const wide = f.aura.wide ?? 1;
            for (let i = n; i < out.length; i++) {
              if (f.aura.dim < 1) out[i].alpha *= f.aura.dim;
              // 착용 오라는 몸 둘레 거리를 넓힌다 (전용 오라는 champAura가 크기까지 맞춘다)
              if (wide !== 1 && s.motion !== "champ") out[i].x = Math.round(f.x + (out[i].x - f.x) * wide);
            }
          } else if (!f.hidden) this.aura(s, f, t, out);
          break;
      }
    }
  }

  private wings(s: WingSpec, f: FxInput, t: number, out: FxCmd[]): void {
    if (f.hidden) return;
    const side = f.dir === DIR.left || f.dir === DIR.right;
    const flap = 1 + s.amp * Math.sin(t / s.flapMs);
    out.push(
      cmd(s.art, side ? 1 : 0, f.x + (f.dir === DIR.right ? 2 : f.dir === DIR.left ? -2 : 0), f.headY - f.shoulder - 3, {
        sx: flap,
        flip: f.dir === DIR.right,
        layer: "body",
        depth: bodyDepth(f) + (f.dir === DIR.up ? 0.05 : -0.05),
      }),
    );
  }

  private umbrella(f: FxInput, out: FxCmd[]): void {
    if (f.hidden) return;
    const hx = Math.round(f.x + f.hand.dx);
    const hy = f.headY - f.hand.up;
    const canopyY = f.headY - f.artTop - 1;
    // 우산은 머리 쪽으로 조금 당겨 씌운다 (대는 손에)
    const cx = Math.round(hx - Math.sign(f.hand.dx || 1) * 2.5);
    const front = f.dir === DIR.up ? -0.06 : 0.06;
    const len = Math.max(2, hy - canopyY);
    out.push(cmd("stick", 0, hx, hy, { oy: 1, sy: len / 8, layer: "body", depth: bodyDepth(f) + front }));
    out.push(cmd("umbrella", 0, cx, canopyY + 1, { oy: 1, layer: "body", depth: bodyDepth(f) + front + 0.01 }));
  }

  private balloon(f: FxInput, t: number, out: FxCmd[]): void {
    const side = Math.sign(f.hand.dx || 1);
    const hx = f.x + f.hand.dx;
    const hy = f.headY - f.hand.up;
    const tx = hx + side * 3 + (f.reduced ? 0 : Math.sin(t / 700) * 1.5);
    const ty = f.headY - f.artTop + 4;
    if (!this.balOn || f.still) {
      this.balOn = true;
      this.balX = tx;
      this.balY = ty;
    } else {
      const k = 1 - Math.exp(-f.dt / 320);
      this.balX += (tx - this.balX) * k;
      this.balY += (ty - this.balY) * k;
    }
    if (f.hidden) return;
    const bx = Math.round(this.balX);
    const by = Math.round(this.balY);
    const dx = bx - hx;
    const dy = by - hy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const depth = bodyDepth(f) + (f.dir === DIR.up ? -0.06 : 0.06);
    out.push(cmd("string", 0, Math.round(hx), Math.round(hy), { oy: 1, sy: len / 8, rot: Math.atan2(dx, -dy), layer: "body", depth }));
    out.push(cmd("balloon", 0, bx, by + 1, { oy: 1, layer: "body", depth: depth + 0.01 }));
  }

  /**
   * 11/15 연 날리는 등: 등에 멘 얼레에서 줄이 풀려 방패연이 머리 옆 위에서 펄럭인다.
   * 옆으로 걸으면 지나온 쪽으로, 위아래로 걸으면 오른쪽 위에. 걸을수록 높이 뜨고 빨리 흔들린다 (풍선처럼 늦게 따라온다)
   */
  private kite(f: FxInput, t: number, out: FxCmd[]): void {
    const [hx] = heading(f.dir);
    const side = hx !== 0 ? -hx : 1;
    const run = f.moving && !f.reduced ? 1 : 0;
    const sway = f.reduced ? 0 : Math.sin(t / (run ? 260 : 620)) * (run ? 2.5 : 1.5);
    const tx = f.x + side * (13 + run * 4) + sway;
    const ty = f.headY - f.artTop - 9 - run * 3 + (f.reduced ? 0 : Math.sin(t / 470) * 1.5);
    if (!this.kiteOn || f.still) {
      this.kiteOn = true;
      this.kiteX = tx;
      this.kiteY = ty;
    } else {
      const k = 1 - Math.exp(-f.dt / 380);
      this.kiteX += (tx - this.kiteX) * k;
      this.kiteY += (ty - this.kiteY) * k;
    }
    if (f.hidden) return;
    const up = f.dir === DIR.up;
    const depth = bodyDepth(f) + (up ? 0.06 : -0.06);
    // 얼레: 등 (뒷모습이면 등 가운데, 옆모습이면 등 쪽, 앞모습이면 어깨 너머로 살짝)
    const ax = Math.round(f.x + (hx !== 0 ? -hx * 4 : up ? 0 : 4));
    const ay = Math.round(f.headY - f.shoulder - (up ? 0 : 3));
    out.push(cmd("qReel", 0, ax, ay, { layer: "body", depth: up ? bodyDepth(f) + 0.05 : bodyDepth(f) - 0.05 }));
    const kx = Math.round(this.kiteX);
    const ky = Math.round(this.kiteY);
    const dx = kx - ax;
    const dy = ky + 5 - ay;
    const len = Math.max(1, Math.hypot(dx, dy));
    out.push(cmd("string", 0, ax, ay, { oy: 1, sy: len / 8, rot: Math.atan2(dx, -dy), alpha: 0.8, layer: "body", depth }));
    const fr = f.reduced ? 0 : Math.floor(t / (run ? 120 : 260)) % 2;
    out.push(cmd("qKite", fr, kx, ky, { rot: f.reduced ? 0 : (Math.sin(t / 380) * 0.12 + side * 0.08), layer: "body", depth: depth + 0.01 }));
  }

  private pet(s: PetSpec, f: FxInput, t: number, out: FxCmd[]): void {
    if (f.petOff) {
      this.petOn = false;
      return;
    }
    if (s.mount && f.riding) return this.mounted(s, f, t, out);
    const back = petBack(f.dir);
    const far = s.far ?? 1;
    const tx = f.x + back[0] * far;
    const ty = f.y + back[1] * far;
    if (f.still) {
      const [hx, hy] = heading(f.dir);
      const lag = f.moving ? 12 : 0;
      this.petX = tx - hx * lag;
      this.petY = ty - hy * lag;
      this.petOn = true;
    } else if (!this.petOn) {
      this.petX = tx;
      this.petY = ty;
      this.petOn = true;
    } else {
      const k = 1 - Math.exp(-f.dt / PET_LAG_MS);
      this.petX += (tx - this.petX) * k;
      this.petY += (ty - this.petY) * k;
    }
    const gap = Math.hypot(tx - this.petX, ty - this.petY);
    const walking = f.moving || gap > 2;
    // 물: 주인을 따라 들어가 잠긴다 (뒤따라오는 만큼 조금 늦게). 미리보기·움직임 줄이기는 바로
    const h = FX_ART[s.art].h;
    const sinkTo = petSinkTarget(f.water, s.hover, h);
    if (f.still || f.reduced) this.petSink = sinkTo;
    else this.petSink += (sinkTo - this.petSink) * (1 - Math.exp(-f.dt / PET_WADE_MS));
    const sink = Math.round(this.petSink);
    const wet = sink > 0;
    const fps = walking ? s.fps : s.idleFps;
    // 꼬마 펭귄: 걷는 동안 4.2초에 한 번 1.1초쯤 배로 미끄러진다 (뒤뚱 흔들림 없이 바닥에 붙어)
    const sliding = !!s.slide && walking && !wet && !f.reduced && !f.still && t % 4200 > 3100;
    let frame = sliding ? 2 : Math.floor((t / 1000) * (wet ? fps * 0.6 : fps)) % 2;
    // 11/17 새 펫: 멈추면 앉아 눈을 깜빡이고, 오래 서 있으면 가끔 귀여운 동작 (물에서는 헤엄치는 걷기 그대로)
    let poseLift = 0;
    if (walking || wet) this.petRestAt = NaN;
    else if (s.pose) {
      if (Number.isNaN(this.petRestAt)) this.petRestAt = t;
      [frame, poseLift] = petPoseFrame(s.pose, s.idleFps, f.still || f.reduced ? -1 : t - this.petRestAt);
    }
    let lift = s.hover + poseLift;
    let sx = 1;
    let sy = 1;
    if (s.hover) lift += f.reduced ? 0 : Math.sin(t / 420) * 1.5;
    else if (wet) lift += f.reduced ? 0 : Math.round(Math.sin(t / 380) * 0.6); // 물에 떠서 천천히 출렁
    else if (walking && !f.reduced && !sliding) lift += Math.abs(Math.sin(t / 110)) * (s.squash ? 2 : 1.2);
    if (s.squash && !f.reduced && !wet) {
      const q = Math.sin(t / (walking ? 110 : 260));
      sx = 1 + 0.1 * q;
      sy = 1 - 0.1 * q;
    }
    const px = Math.round(this.petX);
    const py = Math.round(this.petY - lift);
    const flip = this.petX > f.x;
    if (wet) {
      // 수면(발밑 1px 위) 물결 고리. 잠수면 물방울이 올라온다
      const k = f.reduced ? 0 : (Math.sin(t / 420) + 1) / 2;
      out.push(cmd("petRipple", 0, px, py - 1, { sx: 1 + 0.15 * k, sy: 1 + 0.1 * k, alpha: 0.85 - 0.3 * k, layer: "body", depth: this.petY + 0.1 }));
      if (sink > h) {
        for (let i = 0; i < 2; i++) {
          const u = (((t + i * PET_BUBBLE_MS * 0.5) % PET_BUBBLE_MS) + PET_BUBBLE_MS) % PET_BUBBLE_MS / PET_BUBBLE_MS;
          const bx = px + (i ? 2 : -1) + Math.round(Math.sin(u * 9) * 0.6);
          out.push(cmd("petBubble", 0, bx, Math.round(py - 2 - u * 9), { alpha: 1 - u, layer: "body", depth: this.petY + 0.2 }));
        }
        return; // 수면 아래: 몸·빛은 그리지 않는다
      }
    }
    if (s.glow && s.glowAt) {
      // 그림 속 한 점(루돌프 코)에서 번진다 — 보는 쪽에 따라 좌우가 바뀌고, 천천히 깜빡인다
      const pulse = f.reduced ? 0.85 : 0.7 + 0.3 * Math.sin(t / 380);
      out.push(cmd(s.glowArt ?? "wispGlow", s.glowFrame ?? 0, px + (flip ? -1 : 1) * s.glowAt[0], py + sink - s.glowAt[1], { alpha: pulse * (sink ? 0.5 : 1), layer: "light", depth: 0 }));
    } else if (s.glow) out.push(cmd("wispGlow", 0, px, py - 5, { oy: 0.5, alpha: 0.8, layer: "light", depth: 0 }));
    // 잠긴 만큼 내려 그리고 그 줄 수만큼 아래를 잘라 낸다 → 수면(py) 위로 머리·등만
    // 11/17 타는 펫(옆·앞·뒤 그림이 다 있는 것)은 주인을 따라 위아래로 걸을 때 앞·뒷모습으로 (몸 + 머리·엉덩이 덧그림 — 탈 때와 같은 두 장).
    // 다른 펫은 옆모습 그림만 있어 그대로 옆으로 걷는다
    if (s.mount && walking && !wet && (f.dir === DIR.down || f.dir === DIR.up)) {
      const base = (f.dir === DIR.down ? 2 : 4) + (frame % 2);
      const over = (f.dir === DIR.down ? 6 : 8) + (frame % 2);
      out.push(cmd(s.art, base, px, py, { oy: 1, alpha: s.alpha ?? 1, layer: "body", depth: this.petY }));
      out.push(cmd(s.art, over, px, py, { oy: 1, alpha: s.alpha ?? 1, layer: "body", depth: this.petY + 0.01 }));
      return;
    }
    out.push(cmd(s.art, frame, px, py + sink, { oy: 1, sx, sy, flip, alpha: s.alpha ?? 1, layer: "body", depth: this.petY, ...(sink ? { crop: sink } : {}) }));
  }

  /**
   * 타는 펫에 올라탄 모습: 펫을 발밑(점프하면 같이 뜬다)에 탄 사람 뒤로 그리고, 앞·뒷모습이면 머리·엉덩이를 탄 사람 앞에 덧그린다.
   * 내리면 펫은 이 자리에서부터 다시 따라온다 (petX/petY를 발밑에 맞춰 둔다)
   */
  private mounted(s: PetSpec, f: FxInput, t: number, out: FxCmd[]): void {
    this.petX = f.x;
    this.petY = f.y;
    this.petOn = true;
    this.petSink = 0;
    if (f.hidden) return;
    const walking = f.moving;
    const fr = walking ? Math.floor((t / 1000) * s.fps) % 2 : 0;
    const x = Math.round(f.x);
    const y = Math.round(f.y - (f.hop ?? 0));
    const view = f.dir === DIR.down ? 2 : f.dir === DIR.up ? 4 : 0;
    let frame = view + fr;
    // 12월 루돌프 썰매: 탄 채로 옆을 보고 멈춰 있으면 루돌프가 쉬다가 앞발로 눈을 긁는다
    if (walking || !s.rideRest || !s.pose) this.petRestAt = NaN;
    else if (!view) {
      if (Number.isNaN(this.petRestAt)) this.petRestAt = t;
      frame = petPoseFrame(s.pose, s.idleFps, f.still || f.reduced ? -1 : t - this.petRestAt)[0];
    }
    // 11/17 옆모습이면 탈것을 앞으로 조금 밀어 탄 사람이 뒤쪽에 앉아 보이게 (MOUNT_SIDE_SHIFT — 루돌프 썰매)
    const sx = !view && s.mount ? x + (MOUNT_SIDE_SHIFT[s.mount] ?? 0) * (f.dir === DIR.left ? -1 : 1) : x;
    out.push(cmd(s.art, frame, sx, y, { oy: 1, flip: f.dir === DIR.left, layer: "body", depth: f.y - 0.2 }));
    if (view) out.push(cmd(s.art, (f.dir === DIR.down ? 6 : 8) + fr, x, y, { oy: 1, layer: "body", depth: f.y + 0.2 }));
    else {
      // 옆모습 덧그림 (썰매 옆판 — 탄 사람 다리가 썰매 안에 들어간다)
      const over = s.mount ? mountSideOver(s.mount) : null;
      if (over !== null) out.push(cmd(s.art, over, sx, y, { oy: 1, flip: f.dir === DIR.left, layer: "body", depth: f.y + 0.2 }));
    }
  }

  private trail(s: TrailSpec, f: FxInput, out: FxCmd[]): void {
    const art = FX_ART[s.art];
    const [hx, hy] = heading(f.dir);
    if (f.still) {
      this.parts = f.moving
        ? [1, 2, 3].map((k) => ({
            x: f.x - hx * k * s.step + (k % 2 ? 2 : -2) * Math.abs(hy),
            y: f.y - hy * k * s.step - 1 + (k % 2 ? 1 : -1) * Math.abs(hx),
            born: f.now - (k * s.life) / 5,
            frame: k % art.frames,
            flip: k % 2 === 0,
            vx: k % 2 ? 1 : -1,
          }))
        : [];
    } else {
      if (f.moving && !Number.isNaN(this.lastX)) {
        this.walked += Math.hypot(f.x - this.lastX, f.y - this.lastY);
        if (this.walked >= s.step) {
          this.walked = 0;
          this.stepAlt ^= 1;
          const side = this.stepAlt ? 1 : -1;
          const prints = s.motion === "prints";
          const p: Part = {
            // 발자국은 좌우 발을 번갈아, 나머지는 살짝 흩어서. 새 흔적은 발 앞이 아닌 지나온 자리(진행 방향 반대쪽)에 찍는다
            x: Math.round(f.x - hx * TRAIL_BEHIND + (prints ? side * 2 * Math.abs(hy) : (Math.random() - 0.5) * 6)),
            y: Math.round(f.y - 1 - hy * TRAIL_BEHIND + (prints ? side * Math.abs(hx) : (Math.random() - 0.5) * 2)),
            born: f.now,
            frame: prints ? this.stepAlt : Math.floor(Math.random() * art.frames),
            flip: Math.random() < 0.5,
            vx: Math.random() - 0.5 + (s.motion === "scatter" ? -hx * 0.6 : 0),
          };
          if (this.parts.length < TRAIL_POOL) this.parts.push(p);
          else this.parts[this.partNext] = p;
          this.partNext = (this.partNext + 1) % TRAIL_POOL;
        }
      } else if (!f.moving) this.walked = 0;
      this.lastX = f.x;
      this.lastY = f.y;
    }
    for (const p of this.parts) {
      const u = f.still ? 0.25 : (f.now - p.born) / s.life;
      if (u < 0 || u >= 1) continue;
      const fade = u < 0.65 ? 1 : (1 - u) / 0.35;
      const base = { layer: (s.light ? "light" : "ground") as FxCmd["layer"], depth: 0 };
      const n = out.length;
      switch (s.motion) {
        case "prints":
          out.push(cmd(s.art, p.frame, p.x, p.y, { ...base, alpha: fade }));
          break;
        case "splash": {
          const sc = 0.6 + u * 0.8;
          out.push(cmd(s.art, u < 0.35 ? 1 : 0, p.x, p.y, { ...base, sx: sc, sy: sc, alpha: 1 - u * 0.9 }));
          break;
        }
        case "rise": {
          const k = Math.sin(u * Math.PI);
          out.push(cmd(s.art, p.frame, p.x, p.y - 2 - u * 7, { ...base, sx: 0.6 + 0.6 * k, sy: 0.6 + 0.6 * k, alpha: k }));
          break;
        }
        case "scatter": {
          const hop = u < 0.3 ? Math.sin((u / 0.3) * Math.PI) * 2.5 : 0;
          out.push(cmd(s.art, p.frame, p.x + p.vx * Math.min(u, 0.3) * 14, p.y - hop, { ...base, flip: p.flip, alpha: fade }));
          break;
        }
        case "pop": {
          const sc = u < 0.12 ? 0.4 + (u / 0.12) * 0.6 : 1;
          out.push(cmd(s.art, p.frame, p.x, p.y - 1 - u * 3, { ...base, sx: sc, sy: sc, alpha: fade }));
          break;
        }
      }
      // 빛 흔적(반짝·별·저승길 안개)은 맨 위 빛 층이라 아래로 걸으면 지나온 자리(몸 위쪽)의 입자가 몸을 덮는다 →
      // 몸 그림과 겹치는 동안만 몸 뒤(body 층, 더해 그리기)로 내려 몸에 가려지게 한다. 발밑·몸 바깥은 그대로 빛 층.
      if (s.light) for (let j = n; j < out.length; j++) if (overBody(out[j], art, f)) Object.assign(out[j], { layer: "body", add: true, depth: bodyDepth(f) - 0.3 });
    }
  }

  private aura(s: AuraSpec, f: FxInput, t: number, out: FxCmd[]): void {
    const bx = f.x;
    const top = f.headY - f.artTop;
    const front = bodyDepth(f) + 0.2;
    switch (s.motion) {
      case "champ":
        if (!f.offscreen) {
          const n = out.length;
          champAura(s.theme ?? 0, f, t, out);
          if (s.theme === STAFF_THEME && f.staffSoft !== undefined) softenBehind(out, n, bodyDepth(f), f.staffSoft);
        }
        break;
      case "orbit":
        // 기울어진 고리를 따라 돈다: 위아래로 출렁이며 뒤쪽 반원은 몸 뒤로
        for (let i = 0; i < 4; i++) {
          const a = t / 1100 + (i * Math.PI) / 2;
          const tw = f.reduced ? 0.85 : 0.3 + 0.7 * Math.max(0, Math.sin(t / 260 + i * 1.7));
          const z = Math.sin(a);
          const y = f.headY - f.artTop * 0.5 + z * 3 + Math.sin(a * 2 + i) * 3;
          out.push(cmd("sparkStar", i % 3, Math.round(bx + Math.cos(a) * 11), Math.round(y), around(f, z, { oy: 0.5, sx: 0.7 + 0.4 * tw, sy: 0.7 + 0.4 * tw, alpha: tw }, true)));
        }
        break;
      case "tierFine": {
        // 고급: 몸 가장자리 어딘가에서 1.6초마다 한 번 반짝
        const n = Math.floor(t / 1600);
        const ph = (t % 1600) / 1600;
        const tw = f.reduced ? 0.7 : Math.max(0, Math.sin(Math.min(1, ph * 3) * Math.PI));
        if (tw > 0.02) {
          const z = h01(n, 6) * 2 - 1;
          const x = bx + (h01(n, 7) < 0.5 ? -1 : 1) * (5 + h01(n, 8) * 4);
          const y = f.headY - f.artTop * (0.25 + h01(n, 9) * 0.65);
          out.push(cmd("sparkStar", 0, Math.round(x), Math.round(y), around(f, z, { sx: 0.5 + 0.6 * tw, sy: 0.5 + 0.6 * tw, alpha: tw }, true)));
        }
        break;
      }
      case "tierRare":
      case "tierLegend": {
        const legend = s.motion === "tierLegend";
        // 몸 뒤 은은한 빛 (숨 쉬듯)
        const breathe = f.reduced ? 0.8 : 0.7 + 0.3 * Math.sin(t / 900);
        out.push(cmd("tierGlow", legend ? 1 : 0, bx, Math.round(f.headY - f.artTop * 0.45), { alpha: breathe, sx: 1 + 0.04 * breathe, sy: 1 + 0.04 * breathe, layer: "body", depth: bodyDepth(f) - 0.3, add: true }));
        if (legend) {
          // 전설: 무지개 반짝이가 몸 둘레를 나선으로 돌며 피어오른다
          const n = 7;
          for (let i = 0; i < n; i++) {
            const ph = (t / 2600 + i / n) % 1;
            const a = t / 700 + (i * Math.PI * 2) / n + ph * 2;
            const z = Math.sin(a);
            const r = 9 + 2 * Math.sin(ph * Math.PI);
            const y = f.headY - 2 - ph * (f.artTop + 6) + z * 2;
            const al = Math.sin(ph * Math.PI);
            out.push(cmd("tierMote", i % 4, Math.round(bx + Math.cos(a) * r), Math.round(y), around(f, z, { alpha: al }, true)));
          }
          // 왕관 높이에서 큰 별 둘이 반짝
          for (let i = 0; i < 2; i++) {
            const tw = f.reduced ? 0.8 : Math.max(0, Math.sin(t / 340 + i * 2.4));
            const a = t / 1500 + i * Math.PI;
            const z = Math.sin(a);
            out.push(cmd("sparkStar", 0, Math.round(bx + Math.cos(a) * 12), Math.round(f.headY - f.artTop + 2 + z * 2), around(f, z, { sx: 0.8 + 0.5 * tw, sy: 0.8 + 0.5 * tw, alpha: tw }, true)));
          }
        } else {
          // 희귀: 금 반짝이 셋이 기울어진 고리를 따라 돈다
          for (let i = 0; i < 3; i++) {
            const a = t / 1300 + (i * Math.PI * 2) / 3;
            const z = Math.sin(a);
            const tw = f.reduced ? 0.85 : 0.45 + 0.55 * Math.max(0, Math.sin(t / 300 + i * 2.1));
            const y = f.headY - f.artTop * 0.5 + z * 3 + Math.cos(a) * 3;
            out.push(cmd(i === 1 ? "tierMote" : "sparkStar", 0, Math.round(bx + Math.cos(a) * 11), Math.round(y), around(f, z, { sx: 0.7 + 0.4 * tw, sy: 0.7 + 0.4 * tw, alpha: tw }, true)));
          }
        }
        break;
      }
      case "qFireflies":
      case "qNightfish":
      case "qCapeDust":
      case "qLamp":
      case "qSnowGlobe":
      case "qSnowPuff":
      case "qWishGlow":
        questAura(s.motion, f, t, out);
        break;
      case "uSiren":
        sirenFx(f, t, out);
        break;
      case "xSnow":
      case "xCrown":
      case "xCane":
        // 12월 크리스마스 (xmasFx.ts): 그리기 도우미를 넘겨 그 파일이 그린다
        xmasAura(s.motion, f, t, {
          push: (art, frame, x, y, o) => out.push(cmd(art, frame, x, y, o)),
          around: (z, o, light) => around(f, z, o, light),
          night: !!f.still || isNight(f.now),
          depth: bodyDepth(f),
        });
        break;
      case "gMist": {
        // 11/17 안개 오라: 발치에 안개 뭉치 다섯이 천천히 옆으로 흘러가며 일렁이고 (뒤쪽 뭉치는 몸 뒤로),
        // 녹색 도깨비불 불씨 넷이 안개에서 피어올라 머리 높이에서 사라져요
        const calm = f.reduced || !!f.still;
        for (let i = 0; i < 5; i++) {
          const ph = calm ? i / 5 : (t / 5200 + i / 5 + h01(i, 31) * 0.1) % 1;
          const a = h01(i, 32) * Math.PI * 2 + ph * Math.PI * 2;
          const z = Math.sin(a);
          const x = bx + Math.cos(a) * (9 + h01(i, 33) * 4);
          const y = f.headY + 1 + z * 2.5;
          const al = (0.55 + 0.35 * Math.sin(ph * Math.PI)) * (z < 0 ? 0.75 : 1);
          out.push(cmd("ghMist", Math.floor(t / 700 + i) % 2, Math.round(x), Math.round(y), { alpha: al, sx: 0.8 + 0.3 * h01(i, 34), layer: z < 0 ? "body" : "ground", depth: z < 0 ? bodyDepth(f) - 0.25 : 0, flip: i % 2 === 0 }));
        }
        for (let i = 0; i < 4; i++) {
          const ph = calm ? (i + 0.5) / 4 : (t / 2400 + i / 4 + h01(i, 35) * 0.2) % 1;
          const a = h01(i, 36) * Math.PI * 2 + t / 1800;
          const z = Math.sin(a);
          const x = bx + Math.cos(a) * (6 + h01(i, 37) * 5) + Math.sin(t / 300 + i) * 1.2;
          const y = f.headY - ph * (f.artTop + 4);
          const al = Math.sin(ph * Math.PI);
          out.push(cmd("ghEmber", Math.floor(t / 180 + i) % 2, Math.round(x), Math.round(y), around(f, z, { alpha: al }, true)));
        }
        break;
      }
      case "snow":
      case "petals": {
        const petals = s.motion === "petals";
        const n = petals ? 6 : 8;
        const period = petals ? 2600 : 2200;
        const fallH = f.artTop + 10;
        for (let i = 0; i < n; i++) {
          const ph = (t / period + i / n + h01(i) * 0.13) % 1;
          // 몸 둘레를 천천히 돌며 내려온다 (꽃잎은 빙글빙글, 눈은 느리게) — 뒤쪽은 몸 뒤로
          const ang = h01(i, 1) * Math.PI * 2 + t / (petals ? 1500 : 4000) + ph * (petals ? 3 : 1);
          const z = Math.sin(ang);
          const x = bx + Math.cos(ang) * (8 + h01(i, 10) * 4);
          const y = top - 10 + ph * fallH + z * 2;
          const a = ph < 0.12 ? ph / 0.12 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
          const frame = petals ? Math.floor(t / 260 + i) % 2 : i % 2;
          out.push(cmd(petals ? "petal" : "snowflake", frame, Math.round(x), Math.round(y), around(f, z, { oy: 0.5, alpha: a * 0.95, flip: petals && i % 2 === 0 })));
        }
        break;
      }
      case "cloud": {
        const cy = top - 3 + (f.reduced ? 0 : Math.round(Math.sin(t / 900)));
        for (let i = 0; i < 5; i++) {
          const ph = (t / 650 + i / 5 + h01(i, 2) * 0.3) % 1;
          const x = bx - 6 + i * 3 + Math.round(h01(i, 3) * 2);
          const y = cy + ph * 8;
          out.push(cmd("raindrop", 0, x, Math.round(y), { oy: 0, alpha: ph > 0.8 ? (1 - ph) / 0.2 : 0.9, layer: "body", depth: front }));
        }
        out.push(cmd("cloud", 0, bx, cy, { oy: 1, alpha: 0.95, layer: "body", depth: front + 0.01 }));
        break;
      }
      case "notes":
        // 몸 둘레를 나선으로 돌며 떠오른다
        for (let i = 0; i < 3; i++) {
          const ph = (t / 2000 + i / 3) % 1;
          const ang = (i * Math.PI * 2) / 3 + ph * Math.PI * 1.5 + t / 3000;
          const z = Math.sin(ang);
          const x = bx + Math.cos(ang) * (8 + ph * 3);
          const y = f.headY - f.artTop * 0.6 - ph * 14 + z * 2;
          out.push(cmd("note", i % 2, Math.round(x), Math.round(y), around(f, z, { oy: 1, alpha: Math.sin(ph * Math.PI) })));
        }
        break;
      case "zzz":
        for (let i = 0; i < 3; i++) {
          const ph = (t / 2400 + i / 3) % 1;
          const x = bx + 4 + ph * 8;
          const y = top + 2 - ph * 12;
          out.push(cmd("zee", 2 - Math.min(2, Math.floor(ph * 3)), Math.round(x), Math.round(y), { oy: 1, alpha: Math.sin(ph * Math.PI), layer: "body", depth: front }));
        }
        break;
      case "fall": {
        // 머리 위에서 흔들리며 떨어진다 (낙엽·지폐)
        const art = s.art ?? "leaf";
        const frames = FX_ART[art].frames;
        const n = 7;
        const fallH = f.artTop + 10;
        for (let i = 0; i < n; i++) {
          const ph = (t / 2500 + i / n + h01(i, 4) * 0.13) % 1;
          // 흔들리며 몸 둘레를 반 바퀴쯤 돌아 내려온다 — 뒤쪽은 몸 뒤로
          const ang = h01(i, 5) * Math.PI * 2 + ph * 2.5 + Math.sin(t / 480 + i * 1.7) * 0.3;
          const z = Math.sin(ang);
          const x = bx + Math.cos(ang) * (9 + h01(i, 11) * 3);
          const y = top - 10 + ph * fallH + z * 2;
          const a = ph < 0.12 ? ph / 0.12 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
          out.push(cmd(art, (i + Math.floor(t / 300)) % frames, Math.round(x), Math.round(y), around(f, z, { oy: 0.5, alpha: a, flip: i % 2 === 0 })));
        }
        break;
      }
      case "float": {
        // 몸 양옆에서 둥실 떠오른다 (하트·비눗방울)
        const art = s.art ?? "heart";
        const frames = FX_ART[art].frames;
        for (let i = 0; i < 4; i++) {
          const ph = (t / 2200 + i / 4) % 1;
          // 몸 둘레를 느린 나선으로 돌며 떠오른다 — 뒤쪽은 몸 뒤로
          const ang = (i * Math.PI) / 2 + ph * Math.PI + t / 4000;
          const z = Math.sin(ang);
          const x = bx + Math.cos(ang) * (7 + ph * 4);
          const y = f.headY - f.artTop * 0.4 - ph * 16 + z * 2;
          out.push(cmd(art, i % frames, Math.round(x), Math.round(y), around(f, z, { oy: 1, alpha: Math.sin(ph * Math.PI) }, s.light)));
        }
        break;
      }
      case "steam": {
        // 머리 위로 김이 모락모락
        const art = s.art ?? "steam";
        for (let i = 0; i < 3; i++) {
          const ph = (t / 1800 + i / 3) % 1;
          const x = bx - 3 + i * 3 + Math.sin(t / 400 + i) * 1;
          const y = top - 1 - ph * 9;
          out.push(cmd(art, Math.floor(t / 350 + i) % 2, Math.round(x), Math.round(y), { oy: 1, alpha: 0.85 * Math.sin(ph * Math.PI), layer: "body", depth: front }));
        }
        break;
      }
      case "ring": {
        // 몸 둘레를 빙글빙글 (앞쪽은 몸 앞, 뒤쪽은 몸 뒤)
        const art = s.art ?? "miniGhost";
        const frames = FX_ART[art].frames;
        for (let i = 0; i < 3; i++) {
          const a = t / 1400 + (i * Math.PI * 2) / 3;
          const x = bx + Math.cos(a) * 12;
          const y = f.headY - f.artTop * 0.55 + Math.sin(a) * 3 + Math.sin(t / 300 + i) * 1;
          out.push(cmd(art, Math.floor(t / 280 + i) % frames, Math.round(x), Math.round(y), around(f, Math.sin(a), { oy: 0.5, flip: Math.cos(a) < 0, alpha: s.light ? 0.9 : 1 }, s.light)));
        }
        break;
      }
    }
  }
}

/**
 * 몸 둘레를 도는 입자의 앞뒤 처리. z = 앞뒤 (-1 바로 뒤 … 1 바로 앞, 보통 sin(각도)).
 * 앞쪽 반원은 몸 앞(depth 위), 뒤쪽 반원은 몸 뒤(depth 아래)에 그리고, 뒤로 갈수록 조금 작고 어둡게 → 입체감.
 * light = 빛 입자 (더해 그린다: 앞쪽은 light 층, 뒤쪽은 몸에 가려지게 body 층 + add)
 */
export function around(f: Pick<FxInput, "y" | "depth">, z: number, o: Partial<FxCmd>, light = false): Partial<FxCmd> {
  const back = z < 0;
  const k = back ? 1 + 0.22 * z : 1;
  const dim = back ? 1 + 0.4 * z : 1;
  return {
    ...o,
    sx: (o.sx ?? 1) * k,
    sy: (o.sy ?? 1) * k,
    alpha: (o.alpha ?? 1) * (light && back ? 0.55 + 0.45 * (1 + z) : 1),
    dim,
    // 앞쪽 빛은 맨 위 빛 층 (밤 어둠에 묻히지 않게), 뒤쪽 빛은 몸 뒤에서 더해 그린다
    layer: light && !back ? "light" : "body",
    add: (light && back) || undefined,
    depth: back ? bodyDepth(f) - 0.2 : bodyDepth(f) + 0.2,
  };
}

/** 주간 1위 오라 한 장면에 쓰는 입자 수 상한 (사람마다) */
export const CHAMP_FX_MAX = 36;
/** 섬광 주기 */
const CHAMP_FLASH_MS = 2_600;
const CHAMP_FLASH_LEN = 0.2;

/** out[from..]의 연출을 몸 뒤로 보내고(빛 층은 몸 바로 뒤에서 더해 그리기) 투명도에 alpha를 곱한다 — 몸·장비를 덮지 않는다 */
export function softenBehind(out: FxCmd[], from: number, body: number, alpha: number): void {
  for (let i = from; i < out.length; i++) {
    const c = out[i];
    c.alpha *= alpha;
    if (c.layer === "light") {
      c.layer = "body";
      c.add = true;
      c.depth = body - 0.39;
    } else if (c.layer === "body" && c.depth > body - 0.39) c.depth = body - 0.39;
  }
}

/**
 * 주간 랭킹 1위 오라 (착용 오라와 자리를 나눈다: 착용 오라는 머리 위·몸 둘레, 1위 오라는 발밑과 몸 뒤).
 * 몸을 덮지 않는다 — 몸과 겹치는 것은 모두 몸 뒤(body 층 depth 아래, 더해 그리기)로, 몸 바깥의 빛만 맨 위 빛 층(밤에도 보이게):
 *  ① 바닥 빛 + 회전·맥동하는 빛 고리 두 겹 (뒤쪽 반원은 몸 뒤, 앞쪽 반원은 발 앞 빛 층) + 가운데가 뚫린 후광 고리(구멍이 몸보다 크다)
 *  ② 빛기둥: 몸 뒤 가운데 큰 기둥 + 몸 둘레를 도는 기둥 넷 (앞을 지날 때는 사라진다)
 *  ③ 솟구치는 입자: 포인트 = 금화·반짝이, 사냥 = 불티·불꽃 혀, 낚시 = 물방울 분수·거품, 섞인 테마는 번갈아, 무지개는 셋 다 + 무지개 알갱이
 *  ④ 섬광: 2.6초마다 몸 뒤 빛살이 터지고 고리가 퍼진다
 * 움직임 줄이기면 시각 0의 모습 그대로(고리·기둥·바닥 빛만 은은하게)
 */
function champAura(theme: number, f: FxInput, t: number, out: FxCmd[]): void {
  const start = out.length;
  const bx = Math.round(f.x);
  // 발밑 줄 = 보이는 몸의 발 (점프·매달리기·놀이기구로 뜨면 몸 아래로 따라가고, 물이면 수면)
  const fy = Math.round(f.headY);
  const back = bodyDepth(f) - 0.4;
  const rainbow = theme === RAINBOW_THEME;
  const staff = theme === STAFF_THEME;
  const calm = f.reduced || !!f.still;
  const pulse = calm ? 0.85 : 0.75 + 0.25 * Math.sin(t / 260);
  // 타는 펫이면 펫과 사람 전체를 감싸게 가로로 넓힌다 (W), 세로는 조금만 (고리가 납작한 타원이라)
  const W = f.aura?.wide ?? 1;
  const WY = 1 + (W - 1) * 0.5;
  // ① 바닥 빛 · 빛 고리
  // 땅에 서 있으면 바닥 층, 놀이기구·나무·점프로 몸이 떠 있으면 몸 바로 뒤 층 (바닥 층은 관람차·열기구 그림 아래에 깔려 안 보인다)
  const lifted = f.y - f.headY > 3;
  out.push(
    cmd("champGlow", theme, bx, fy, { alpha: 0.7 + 0.3 * pulse, sx: (1 + 0.08 * pulse) * W, sy: (1 + 0.08 * pulse) * WY, layer: lifted ? "body" : "ground", add: true, depth: lifted ? back - 0.04 : 0 }),
  );
  const phase = calm ? 0 : Math.floor(t / 70) % RING_PHASES;
  const ring = theme * RING_PHASES + phase;
  const rs = 1 + 0.05 * Math.sin(t / 180);
  out.push(cmd("champRingBack", ring, bx, fy, { oy: 1, sx: rs * W, sy: rs * WY, alpha: 0.95, layer: "body", add: true, depth: back }));
  out.push(cmd("champRingFront", ring, bx, fy, { oy: 0, sx: rs * W, sy: rs * WY, alpha: 0.95, layer: "light", depth: 0 }));
  // 바깥 고리: 거꾸로 돌며 크게 숨 쉰다
  const ring2 = theme * RING_PHASES + (RING_PHASES - 1 - phase);
  const rs2 = 1.32 + 0.1 * (calm ? 0.5 : (Math.sin(t / 420) + 1) / 2);
  out.push(cmd("champRingBack", ring2, bx, fy, { oy: 1, sx: rs2 * W, sy: rs2 * WY, alpha: 0.5, layer: "body", add: true, depth: back - 0.005 }));
  out.push(cmd("champRingFront", ring2, bx, fy, { oy: 0, sx: rs2 * W, sy: rs2 * WY, alpha: 0.5, layer: "light", depth: 0 }));
  // 후광 고리 (구멍이 몸보다 커서 빛 층에 그려도 몸을 덮지 않는다)
  const midY = Math.round(f.headY - f.artTop * 0.5);
  const hk = Math.max(1, (f.artTop / 2 + 2) / HALO_HOLE_RY);
  out.push(cmd("champHalo", theme, bx, midY, { sx: hk * W * (1 + 0.04 * pulse), sy: hk * (1 + 0.04 * pulse), alpha: 0.55 + 0.35 * pulse, layer: "light", depth: 0 }));
  // ④ 섬광: 고리가 크게 퍼지고 몸 뒤에서 빛살이 터진다
  const fp = calm ? 1 : ((t + (bx % 97) * 13) % CHAMP_FLASH_MS) / CHAMP_FLASH_MS;
  if (fp < CHAMP_FLASH_LEN) {
    const k = fp / CHAMP_FLASH_LEN;
    const grow = 1 + k * 1.3;
    out.push(cmd("champRingBack", ring, bx, fy, { oy: 1, sx: grow * W, sy: grow * WY, alpha: (1 - k) * 0.9, layer: "body", add: true, depth: back - 0.01 }));
    out.push(cmd("champRingFront", ring, bx, fy, { oy: 0, sx: grow * W, sy: grow * WY, alpha: (1 - k) * 0.9, layer: "light", depth: 0 }));
    out.push(cmd("champHalo", theme, bx, midY, { sx: hk * W * (1 + k * 0.9), sy: hk * (1 + k * 0.9), alpha: (1 - k) * 0.9, layer: "light", depth: 0 }));
    const bs = (0.6 + k * 1.4) * WY;
    out.push(cmd("champBurst", theme, bx, Math.round(f.headY - f.artTop * 0.5), { sx: bs, sy: bs, rot: k * 0.6, alpha: 1 - k, layer: "body", add: true, depth: back - 0.02 }));
  }
  // ② 빛기둥: 가운데(몸 뒤) 하나 + 둘레를 도는 넷
  const ph = calm ? 1 : 0.8 + 0.2 * Math.sin(t / 400);
  out.push(cmd("champPillar", theme, bx, fy + 1, { oy: 1, sx: 2.2 * W, sy: ph * (f.artTop + 12) / 34, alpha: 0.75, layer: "body", add: true, depth: back - 0.03 }));
  for (let i = 0; i < 4; i++) {
    const a = (calm ? 0 : t / 1700) + (i * Math.PI) / 2 + Math.PI / 4;
    const c = Math.cos(a);
    const z = Math.sin(a);
    // 앞쪽 반원에서는 몸 옆으로 비켜 있을 때만 (몸 반너비 + 기둥 반너비 밖, |cos| ≥ 0.68) 보이고 가운데로 올수록 사라진다.
    // 뒤쪽 반원은 몸 뒤라 그대로 보인다
    const side = Math.min(1, Math.max(0, (Math.abs(c) - 0.68) / 0.22));
    const vis = z < 0 ? 0.55 + 0.45 * Math.min(1, Math.abs(c) + 0.3) : side;
    if (vis < 0.05) continue;
    const h = (0.55 + 0.35 * (calm ? 0.5 : (Math.sin(t / 300 + i * 1.9) + 1) / 2)) * (f.artTop + 16);
    const x = bx + c * 15 * W;
    out.push(cmd("champPillar", theme, Math.round(x), fy + Math.round(z * 3), { oy: 1, sy: h / 34, alpha: 0.85 * vis, layer: z < 0 ? "body" : "light", add: z < 0 || undefined, depth: z < 0 ? back - 0.02 : 0 }));
  }
  // 몸 양옆에서 빠르게 솟는 빛줄기
  if (!calm)
    for (let i = 0; i < 4; i++) {
      const u = (t / 700 + i / 4 + h01(i, 41) * 0.3) % 1;
      const sx = (i % 2 ? 1 : -1) * (10 + h01(i, 42) * 6) * W;
      out.push(cmd("champStreak", theme, Math.round(bx + sx), Math.round(fy - 2 - u * (f.artTop + 20)), { oy: 0, alpha: Math.sin(Math.PI * u), layer: "light", depth: 0 }));
    }
  // ③ 솟구치는 입자
  // 운영자: 떠도는 넋 불빛(도깨비불)과 몸 뒤 검은 비단 연기 띠
  const kinds = staff ? ["soul", "smoke", "soul", "smoke"] : rainbow ? ["coin", "ember", "drop", "mote"] : THEME_MIX[theme].map((m) => (["coin", "ember", "drop"] as const)[m]);
  const n = calm ? 4 : rainbow ? 16 : 13;
  for (let i = 0; i < n && out.length - start < CHAMP_FX_MAX - 2; i++) {
    const kind = kinds[i % kinds.length];
    const speed = kind === "ember" ? 1300 : kind === "drop" ? 1600 : 2000;
    const u = calm ? (i + 0.5) / n : (t / speed + i / n + h01(i, 31) * 0.4) % 1;
    const ang = h01(i, 32) * Math.PI * 2 + (calm ? 0 : t / 2400);
    const r = (7 + h01(i, 33) * 9) * W;
    let x = bx + Math.cos(ang) * r;
    let y = fy + Math.sin(ang) * 2.5;
    const rise = f.artTop + 18;
    let art: FxArtId;
    let frame = 0;
    if (kind === "smoke") {
      // 검은 비단 같은 연기 띠: 몸 뒤에서 천천히 돌며 피어오른다 (보통 섞기, 늘 몸 뒤)
      const sa = ang + u * 1.8;
      const sx = bx + Math.cos(sa) * r * 1.1;
      const sy = fy - 3 - u * rise * 0.7 + Math.sin(sa) * 2;
      out.push(cmd("staffSmoke", i % 2, Math.round(sx), Math.round(sy), { alpha: 0.9 * Math.sin(Math.PI * u), sx: 1.4 + u * 1.2, sy: 1.2 + u * 0.5, flip: i % 2 === 0, layer: "body", depth: back - 0.015 }));
      continue;
    }
    if (kind === "soul") {
      // 떠도는 넋 불빛: 천천히 흔들리며 몸 둘레를 돌아 오른다
      x = bx + Math.cos(ang + u * 2.4) * r + Math.sin(t / 260 + i) * 1.2;
      y = fy - 2 - u * rise * 0.85 + Math.sin(ang + u * 2.4) * 2;
      art = "soulFlame";
      frame = Math.floor(t / 180 + i) % 2;
    } else if (kind === "drop") {
      // 분수처럼 솟았다가 바깥으로 떨어진다
      x += Math.cos(ang) * u * 6;
      y -= 4 * (rise * 0.75) * u * (1 - u);
      art = i % 3 === 0 ? "bubble" : "champDrop";
      frame = art === "bubble" ? i % 2 : 0;
    } else {
      y -= u * rise;
      if (kind === "ember") {
        x += Math.sin(t / 90 + i * 2.3) * 1.5;
        art = i % 4 === 0 && u < 0.3 ? "champFlame" : "champEmber";
        frame = art === "champFlame" ? Math.floor(t / 110 + i) % 2 : Math.min(2, Math.floor(u * 3));
      } else if (kind === "coin") {
        art = i % 3 === 2 ? "sparkStar" : "coin";
        frame = art === "coin" ? Math.floor(t / 120 + i) % 2 : 0;
      } else {
        art = "tierMote";
        frame = i % 4;
      }
    }
    const alpha = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
    const big = art === "champEmber" || art === "sparkStar" || art === "tierMote" ? 1.3 : 1;
    const c = cmd(art, frame, Math.round(x), Math.round(y), { alpha, sx: big, sy: big, layer: "light", depth: 0 });
    // 몸 그림과 겹치면 몸 뒤로 (몸을 덮지 않는다)
    if (overBody(c, FX_ART[art], f)) Object.assign(c, { layer: "body", add: true, depth: back - 0.01 });
    out.push(c);
  }
}

// ── 11/15 수집 의뢰 보상 연출 ──

/** 반딧불 수집가 오라의 반딧불 수 (도감 곤충 종 수는 다른 사람 화면에서 알 수 없어 고정) */
export const QUEST_FIREFLY_COUNT = 8;

let nightAt = -Infinity;
let nightNow = false;
/** 지금이 밤(해질녘·밤)인지 — 1초에 한 번만 (dyeFx glowTime과 같은 규칙, 주소 ?time= 시험 값도 따른다) */
function isNight(now: number): boolean {
  if (Math.abs(now - nightAt) < 1000) return nightNow;
  nightAt = now;
  const hour = typeof location !== "undefined" ? parseAmbienceOverride(location.search).hour : undefined;
  const p = timePhase(hour ?? kstHour(Date.now()));
  nightNow = p === "night" || p === "dusk";
  return nightNow;
}

/** 수집 의뢰 오라·망토 금가루·이마 등불 (밤이면 더 밝게, 미리보기(still)는 늘 밤처럼) */
function questAura(motion: "qFireflies" | "qNightfish" | "qCapeDust" | "qLamp" | "qSnowGlobe" | "qSnowPuff" | "qWishGlow", f: FxInput, t: number, out: FxCmd[]): void {
  const night = f.still || isNight(f.now);
  const bx = f.x;
  const calm = f.reduced || !!f.still;
  switch (motion) {
    case "qFireflies": {
      // 8마리가 기울어진 고리 셋을 따라 제각각 돌며 깜빡인다 (밤엔 더 크고 환하게)
      const n = QUEST_FIREFLY_COUNT;
      for (let i = 0; i < n; i++) {
        // 같은 빠르기로 줄지어 돈다 (고리마다 방향·속도만 조금 다르게)
        const ring = i % 2;
        const a = (calm ? 0 : (ring ? -t : t) / (ring ? 1900 : 1500)) + (i * Math.PI * 2) / n;
        const r = 9 + ring * 3 + Math.sin(t / 700 + i) * 1.2;
        const z = Math.sin(a);
        const y = f.headY - f.artTop * (ring ? 0.7 : 0.35) + z * 2.5 + Math.sin(t / 430 + i * 1.3) * 1.5;
        const blink = calm ? 0.9 : Math.max(0, Math.sin(t / (380 + i * 37) + i * 2.1));
        const on = blink > 0.35;
        const al = (night ? 0.55 + 0.45 * blink : 0.35 + 0.4 * blink) * (on ? 1 : 0.7);
        const sc = night ? 1.1 : 0.85;
        out.push(cmd("qFirefly", on ? 0 : 1, Math.round(bx + Math.cos(a) * r), Math.round(y), around(f, z, { sx: sc, sy: sc, alpha: al }, true)));
      }
      break;
    }
    case "qNightfish": {
      // 몸 뒤 달빛 (숨 쉬듯)
      const breathe = calm ? 0.85 : 0.75 + 0.25 * Math.sin(t / 1100);
      out.push(cmd("qMoonGlow", 0, bx, Math.round(f.headY - f.artTop * 0.5), { alpha: (night ? 0.95 : 0.55) * breathe, layer: "body", depth: bodyDepth(f) - 0.3, add: true }));
      // 발밑에서 퍼지는 물결 고리 셋
      for (let i = 0; i < 3; i++) {
        const u = calm ? (i + 0.5) / 3 : (t / 2600 + i / 3) % 1;
        const k = 0.35 + u * 1.1;
        out.push(cmd("qRipple", 0, Math.round(bx), Math.round(f.headY), { sx: k, sy: k, alpha: (1 - u) * (night ? 0.9 : 0.65), layer: "ground", depth: 0 }));
      }
      // 달빛 윤슬: 몸 둘레 여기저기서 반짝
      for (let i = 0; i < 6; i++) {
        const cyc = 1700 + i * 230;
        const k = Math.floor(t / cyc);
        const ph = (t % cyc) / cyc;
        const tw = calm ? 0.8 : Math.max(0, Math.sin(Math.min(1, ph * 2) * Math.PI));
        if (tw < 0.05) continue;
        const a = h01(k * 7 + i, 61) * Math.PI * 2;
        const z = Math.sin(a);
        const x = bx + Math.cos(a) * (8 + h01(k + i, 62) * 6);
        const y = f.headY - 2 - h01(k * 3 + i, 63) * (f.artTop + 4);
        out.push(cmd("qGlint", i % 2, Math.round(x), Math.round(y), around(f, z, { sx: 0.6 + 0.6 * tw, sy: 0.6 + 0.6 * tw, alpha: tw * (night ? 1 : 0.8) }, true)));
      }
      // 가끔 물결에서 은빛 물고기가 뛰어오른다 (3.6초마다, 몸 옆으로 포물선)
      if (!calm) {
        const cyc = 3600;
        const k = Math.floor(t / cyc);
        const u = (t % cyc) / 900;
        if (u < 1) {
          const d = h01(k, 64) < 0.5 ? -1 : 1;
          const x0 = bx + d * 7;
          const x = x0 + d * u * 9;
          const y = f.headY - Math.sin(u * Math.PI) * 9;
          out.push(cmd("qJumpFish", 0, Math.round(x), Math.round(y), { rot: d * (u - 0.5) * 1.6, flip: d < 0, alpha: Math.min(1, Math.sin(u * Math.PI) * 2), layer: "body", depth: bodyDepth(f) + (h01(k, 65) < 0.5 ? 0.2 : -0.2) }));
        }
      }
      break;
    }
    case "qCapeDust": {
      if (f.hidden) return;
      // 망토 끝자락 (몸 뒤 양옆 아래)에서 금가루가 흩날려 내려앉는다 + 가끔 금테가 반짝
      const n = calm ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const u = calm ? (i + 0.5) / n : (t / 1900 + i / n + h01(i, 71) * 0.3) % 1;
        const d = i % 2 ? 1 : -1;
        const x = bx + d * (5 + h01(i, 72) * 3 + u * 4) + Math.sin(t / 300 + i) * 0.8;
        const y = f.headY - f.shoulder + 2 + u * (f.shoulder + 1);
        out.push(cmd("qGoldDust", Math.floor(t / 160 + i) % 2, Math.round(x), Math.round(y), { alpha: Math.sin(u * Math.PI) * (night ? 1 : 0.85), layer: "body", add: true, depth: bodyDepth(f) - 0.1 }));
      }
      const cyc = 2300;
      const ph = (t % cyc) / cyc;
      const tw = calm ? 0.7 : Math.max(0, Math.sin(Math.min(1, ph * 3) * Math.PI));
      if (tw > 0.05) {
        const k = Math.floor(t / cyc);
        const d = h01(k, 73) < 0.5 ? -1 : 1;
        out.push(cmd("sparkStar", 0, Math.round(bx + d * (5 + h01(k, 74) * 2)), Math.round(f.headY - 2), { sx: 0.6 + 0.5 * tw, sy: 0.6 + 0.5 * tw, alpha: tw, layer: "body", add: true, depth: bodyDepth(f) - 0.1 }));
      }
      break;
    }
    case "qSnowGlobe": {
      // 유리 돔 (몸보다 넓어 몸을 덮지 않는다) + 발밑 눈 둔덕 + 돔 안을 천천히 도는 눈송이. 테두리 반사광이 은은히 숨 쉰다
      const k = Math.max(1, (f.artTop + 6) / 34);
      const shimmer = calm ? 0.8 : 0.7 + 0.3 * Math.sin(t / 900);
      out.push(cmd("qSnowMound", 0, Math.round(bx), Math.round(f.headY + 1), { alpha: night ? 0.95 : 0.85, layer: "ground", depth: 0 }));
      out.push(cmd("qGlobe", 0, Math.round(bx), Math.round(f.headY + 2), { oy: 37 / 40, sx: k, sy: k, alpha: (night ? 0.95 : 0.45) * shimmer, layer: "light", depth: 0 }));
      // 테두리를 따라 미끄러지는 반짝
      if (!calm) {
        const a = -Math.PI / 2 + Math.sin(t / 1600) * 1.3;
        out.push(cmd("qGlint", 0, Math.round(bx + Math.cos(a) * 16 * k), Math.round(f.headY - 15 * k + Math.sin(a) * 19 * k), { sx: 0.8, sy: 0.8, alpha: 0.5 + 0.4 * shimmer, layer: "light", depth: 0 }));
      }
      const n = 9;
      for (let i = 0; i < n; i++) {
        // 눈송이: 돔 안에서 소용돌이 (천천히 돌며 오르내린다)
        const a = (calm ? 0 : t / 2600) + (i * Math.PI * 2) / n + h01(i, 81);
        const r = (5 + h01(i, 82) * 8) * k;
        const z = Math.sin(a);
        const u = calm ? h01(i, 83) : (t / (3200 + i * 170) + h01(i, 84)) % 1;
        const y = f.headY - 3 - (1 - Math.abs(u * 2 - 1)) * (f.artTop + 2);
        out.push(cmd("snowflake", i % 2, Math.round(bx + Math.cos(a) * r), Math.round(y + z * 2), around(f, z, { oy: 0.5, alpha: night ? 1 : 0.9 }, night)));
      }
      break;
    }
    case "qSnowPuff": {
      // 눈 털모자 방울에서 3초에 한 번 눈송이가 톡 떨어진다 (움직임 줄이기·미리보기면 없음)
      if (calm || f.hidden) return;
      const cyc = 3000;
      const u = (t % cyc) / 1300;
      if (u >= 1) return;
      const k = Math.floor(t / cyc);
      const d = h01(k, 91) < 0.5 ? -1 : 1;
      const x = bx + (f.dir === DIR.right ? -2 : f.dir === DIR.left ? 2 : -1) + d * u * 4 + Math.sin(u * 9) * 0.8;
      const y = f.headY - f.artTop + 1 + u * 11;
      out.push(cmd("snowflake", k % 2, Math.round(x), Math.round(y), { oy: 0.5, alpha: Math.min(1, (1 - u) * 2), layer: "body", depth: bodyDepth(f) + 0.15 }));
      break;
    }
    case "qWishGlow": {
      // 새해 소원 등불: 손에 든 풍등 둘레의 따뜻한 번짐 (밤에 밝게, 뒷모습은 몸에 가려 없음)
      if (f.hidden || f.dir === DIR.up) return;
      const flick = calm ? 1 : 0.85 + 0.15 * Math.sin(t / 110) * Math.sin(t / 47);
      out.push(cmd("qLampFlare", 0, Math.round(f.x + f.hand.dx), Math.round(f.headY - f.hand.up - 5), { alpha: (night ? 0.9 : 0.25) * flick, sx: 1.1, sy: 1.1, layer: "light", depth: 0 }));
      break;
    }
    case "qLamp": {
      if (f.hidden || f.dir === DIR.up) return;
      // 이마 등불: 옆을 보면 앞으로 뻗는 빛줄기, 앞을 보면 번짐 (밤엔 환하게, 낮엔 은은하게)
      const flick = calm ? 1 : 0.9 + 0.1 * Math.sin(t / 90) * Math.sin(t / 37);
      const al = (night ? 1 : 0.35) * flick;
      const ly = Math.round(f.headY - f.artTop + 3);
      if (f.dir === DIR.down) out.push(cmd("qLampFlare", 0, Math.round(bx - 0.5), ly - 1, { alpha: al * 0.8, sx: 0.75, sy: 0.75, layer: "light", depth: 0 }));
      else {
        const d = f.dir === DIR.right ? 1 : -1;
        out.push(cmd("qLampBeam", 0, Math.round(bx + d * 5), ly, { ox: d > 0 ? 0 : 1, flip: d < 0, alpha: al, layer: "light", depth: 0 }));
      }
      break;
    }
  }
}

/**
 * 11/15 사이렌 모자: 정수리 경광등에서 빨강·파랑 빛줄기 두 개가 마주 보고 빙글빙글 돈다 (앞으로 올 때 밝게, 뒤로 갈 때 흐리게).
 * 돌 때마다 돔이 번쩍인다. 움직임 줄이기·미리보기는 멈춘 빛 한 쌍
 */
function sirenFx(f: FxInput, t: number, out: FxCmd[]): void {
  if (f.hidden) return;
  const calm = f.reduced || !!f.still;
  const night = f.still || isNight(f.now);
  const bx = Math.round(f.x - (f.dir === DIR.right ? 0 : f.dir === DIR.left ? 1 : 1));
  const by = Math.round(f.headY - f.artTop + 1);
  const a0 = calm ? 0.6 : t / 240;
  for (let k = 0; k < 2; k++) {
    const a = a0 + k * Math.PI;
    // 옆에서 본 원 (위아래로 납작하게): 앞쪽(sin > 0)일수록 밝다
    const z = Math.sin(a);
    const al = (night ? 0.95 : 0.6) * (0.45 + 0.55 * Math.max(0, z * 0.5 + 0.5));
    out.push(cmd("uSirenBeam", k, bx, by, { ox: 0, oy: 0.5, rot: Math.atan2(Math.sin(a) * 0.35, Math.cos(a)), sx: 0.55 + 0.45 * Math.abs(Math.cos(a)), alpha: al, layer: "light", depth: 0 }));
  }
  const flash = calm ? 0.7 : Math.max(0, Math.cos(a0 * 2));
  out.push(cmd("uSirenFlare", Math.floor(((a0 / Math.PI) % 2 + 2) % 2), bx, by, { alpha: (night ? 0.9 : 0.55) * (0.35 + 0.65 * flash), layer: "light", depth: 0 }));
}

function cmd(art: FxArtId, frame: number, x: number, y: number, o: Partial<FxCmd> = {}): FxCmd {
  return { art, frame, x, y, ox: 0.5, oy: 0.5, alpha: 1, sx: 1, sy: 1, rot: 0, flip: false, layer: "body", depth: y, ...o };
}

// ── 상점·가방 아이콘 (16×16, itemIcons.ts가 쓴다) ──

function blit(dst: Grid, art: FxArtId, frame: number, x: number, y: number, flip = false): void {
  const a = FX_ART[art];
  const src = a.build();
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = src.px[j * src.w + frame * a.w + i];
      if ((v & 255) === 0) continue;
      const tx = x + (flip ? a.w - 1 - i : i);
      const ty = y + j;
      if (tx >= 0 && ty >= 0 && tx < dst.w && ty < dst.h) dst.px[ty * dst.w + tx] = v;
    }
}

/** 따로 그리는 F8 꾸미기의 16×16 아이콘 (해당 없으면 null) */
export function fxIconGrid(id: string): Grid | null {
  const g = new Grid(16, 16);
  switch (id) {
    case "hand_umbrella":
      blit(g, "umbrella", 0, 0, 2);
      g.vline(8, 8, 14, 0x3a3a48);
      g.set(7, 15, 0x3a3a48);
      g.set(6, 14, 0x3a3a48);
      return g;
    case "hand_balloon":
      blit(g, "balloon", 0, 5, 0);
      g.vline(8, 9, 11, 0xeae6dc);
      g.set(7, 12, 0xeae6dc);
      g.vline(7, 13, 15, 0xeae6dc);
      return g;
    case "back_wings_bat":
    case "back_wings_butterfly":
    case "back_wings_angel":
    case "back_wings_dragon": {
      // 앞모습 날개 한 쌍을 가운데에 (26칸 중 가운데 16칸)
      const a = FX_ART[(COSMETIC_FX[id] as WingSpec).art].build();
      for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) g.px[(y + 2) * 16 + x] = a.px[y * a.w + x + 5];
      g.rect(7, 6, 2, 6, 0x6a6a7a);
      return g;
    }
    case "feet_prints":
      for (const [x, y, f] of [[3, 12, 0], [9, 9, 1], [4, 5, 0], [10, 1, 1]] as const) blit(g, "print", f, x, y);
      g.recolor(() => true, 0x5a4636);
      return g;
    case "feet_puddle":
      blit(g, "puddle", 0, 3, 9);
      blit(g, "puddle", 1, 1, 2);
      g.rect(9, 3, 4, 4, 0x3a5a8a);
      g.rect(9, 7, 5, 2, 0x2a4a7a);
      return g;
    case "feet_sparkle":
      g.rect(3, 9, 9, 3, 0xf4f4f4);
      g.rect(9, 7, 3, 2, 0xf4f4f4);
      g.hline(3, 12, 12, 0xe84a5a);
      g.set(5, 10, 0x4a8ae8);
      g.set(7, 10, 0x4a8ae8);
      blit(g, "sparkStar", 0, 11, 1);
      blit(g, "sparkStar", 1, 1, 3);
      blit(g, "sparkStar", 2, 7, 0);
      return g;
    case "feet_leaves":
      blit(g, "leaf", 0, 1, 10);
      blit(g, "leaf", 1, 9, 12, true);
      blit(g, "leaf", 2, 6, 5);
      blit(g, "leaf", 0, 11, 2, true);
      return g;
    case "feet_hearts":
      blit(g, "heart", 0, 2, 10);
      blit(g, "heart", 1, 8, 5);
      blit(g, "heart", 0, 10, 12);
      blit(g, "heart", 1, 4, 1);
      return g;
    case "aura_sparkle":
      blit(g, "sparkStar", 0, 1, 2);
      blit(g, "sparkStar", 1, 10, 4);
      blit(g, "sparkStar", 2, 5, 9);
      blit(g, "sparkStar", 0, 11, 11);
      return g;
    case "aura_snow":
      for (const [x, y, f] of [[2, 1, 0], [9, 3, 1], [5, 7, 0], [12, 9, 0], [1, 12, 1], [8, 13, 0]] as const) blit(g, "snowflake", f, x, y);
      return g;
    case "aura_petals":
      for (const [x, y, f] of [[2, 2, 0], [10, 1, 1], [6, 7, 0], [12, 9, 1], [2, 12, 1], [8, 13, 0]] as const) blit(g, "petal", f, x, y);
      return g;
    case "aura_raincloud":
      blit(g, "cloud", 0, 0, 1);
      for (const [x, y] of [[3, 10], [7, 12], [11, 10], [5, 14]]) g.vline(x, y, y + 1, 0x9ad0f0);
      return g;
    case "aura_notes":
      blit(g, "note", 0, 1, 7);
      blit(g, "note", 1, 9, 2);
      return g;
    case "aura_zzz":
      blit(g, "zee", 0, 1, 10);
      blit(g, "zee", 1, 7, 5);
      blit(g, "zee", 2, 11, 1);
      g.outline(0x3a4466, false, 200);
      return g;
    case "feet_snowprints":
      for (const [x, y, f] of [[3, 12, 0], [9, 9, 1], [4, 5, 0], [10, 1, 1]] as const) blit(g, "snowPrint", f, x, y);
      g.outline(0x6a7a9a, false, 200);
      return g;
    case "feet_paws":
      for (const [x, y, f] of [[2, 11, 0], [9, 8, 1], [3, 4, 0], [10, 1, 1]] as const) blit(g, "paw", f, x, y);
      return g;
    case "feet_bubbles":
      for (const [x, y, f] of [[1, 9, 0], [8, 10, 1], [5, 4, 0], [11, 2, 1], [11, 6, 1]] as const) blit(g, "bubble", f, x, y);
      return g;
    case "feet_confetti":
      for (const [x, y, f] of [[2, 3, 0], [7, 1, 1], [12, 4, 2], [4, 8, 1], [10, 9, 0], [1, 13, 2], [7, 12, 0], [13, 13, 1]] as const) blit(g, "confetti", f, x, y);
      return g;
    case "feet_coins":
      for (const [x, y, f] of [[2, 10, 0], [8, 11, 0], [5, 5, 1], [11, 3, 0]] as const) blit(g, "coin", f, x, y);
      return g;
    case "feet_stars":
      g.hline(2, 13, 14, 0x5a5a7a);
      for (const [x, y, f] of [[1, 8, 0], [6, 4, 1], [10, 9, 2], [11, 1, 0]] as const) blit(g, "sparkStar", f, x, y);
      return g;
    case "staff_steps":
      for (const [x, y, f] of [[1, 11, 0], [8, 8, 1], [3, 4, 0], [10, 1, 1]] as const) blit(g, "soulMist", f, x, y);
      g.recolor(() => true, 0x5ad8ff);
      return g;
    case "aura_steam":
      g.rect(4, 11, 8, 4, 0xf0ebe2);
      g.hline(4, 11, 11, 0x8a5a3a);
      g.vline(12, 12, 13, 0xf0ebe2);
      blit(g, "steam", 0, 4, 4);
      blit(g, "steam", 1, 8, 2);
      g.outline(0x4a4a5a, false, 170);
      return g;
    case "aura_bubbles":
      for (const [x, y, f] of [[1, 2, 0], [9, 1, 1], [5, 7, 0], [11, 9, 0], [2, 11, 1]] as const) blit(g, "bubble", f, x, y);
      return g;
    case "aura_leaves":
      for (const [x, y, f] of [[1, 1, 0], [9, 3, 1], [4, 7, 2], [11, 10, 0], [2, 12, 1]] as const) blit(g, "leaf", f, x, y);
      return g;
    case "aura_hearts":
      blit(g, "heart", 0, 1, 8);
      blit(g, "heart", 1, 9, 3);
      blit(g, "heart", 0, 6, 12);
      return g;
    case "aura_ghosts":
      blit(g, "miniGhost", 0, 1, 6);
      blit(g, "miniGhost", 1, 10, 2);
      blit(g, "miniGhost", 0, 7, 10);
      return g;
    case "aura_money":
      for (const [x, y, f] of [[1, 2, 0], [9, 1, 1], [4, 7, 1], [10, 9, 0], [2, 12, 0]] as const) blit(g, "bill", f, x, y);
      return g;
    case "gh_mist":
      // 11/17 안개 오라 아이콘: 안개 두 겹 + 불씨 셋
      blit(g, "ghMist", 0, -1, 10);
      blit(g, "ghMist", 1, 2, 7);
      blit(g, "ghEmber", 0, 4, 2);
      blit(g, "ghEmber", 1, 10, 0);
      blit(g, "ghEmber", 0, 12, 5);
      return g;
    case "staff_souls":
      blit(g, "soulFlame", 0, 2, 8);
      blit(g, "soulFlame", 1, 10, 2);
      blit(g, "soulFlame", 0, 7, 10);
      return g;
    case "pet_cat":
    case "pet_dog":
    case "pet_duck":
    case "pet_slime":
    case "pet_bird":
    case "pet_wisp":
    case "pet_fox": {
      const art = (COSMETIC_FX[id] as PetSpec).art;
      const a = FX_ART[art];
      blit(g, art, 0, Math.floor((16 - a.w) / 2), 15 - a.h);
      return g;
    }
    case "q_pet_goldfish":
      blit(g, "qGoldfish", 0, 1, 2);
      return g;
    case "q_pet_penguin":
      blit(g, "qPenguin", 0, 2, 4);
      return g;
    case "q_back_kite":
      blit(g, "qKite", 0, 4, 0);
      for (let i = 0; i < 5; i++) g.set(3 - Math.floor(i / 2), 11 + i, 0xeae6dc);
      blit(g, "qReel", 0, 0, 11);
      return g;
    case "q_aura_snowglobe": {
      // 붉은 받침 위 유리 구슬 + 눈송이
      g.ellipse(8, 7, 6.5, 6.5, 0xd8f4ff, 90);
      g.ellipse(8, 7, 5.5, 5.5, 0x7ab8e8, 60);
      g.ellipse(8, 10.5, 4.5, 1.5, 0xffffff);
      g.rect(3, 13, 10, 3, 0xb8323a);
      g.hline(3, 12, 13, 0xf2c43a);
      blit(g, "snowflake", 0, 5, 3);
      blit(g, "snowflake", 1, 9, 6);
      g.set(5, 3, 0xffffff);
      g.set(4, 4, 0xffffff);
      g.outline(0x2a3a5a, false, 170);
      return g;
    }
    case "q_aura_firefly":
      for (const [x, y, fr] of [[1, 2, 0], [9, 1, 0], [5, 6, 1], [11, 8, 0], [2, 11, 0], [8, 12, 1]] as const) blit(g, "qFirefly", fr, x, y);
      return g;
    case "q_aura_nightfish": {
      // 달 + 물결 고리 + 뛰어오르는 물고기
      g.ellipse(11.5, 3.5, 3, 3, 0xf4f0d8);
      g.ellipse(13, 2.6, 2.2, 2.2, 0x000000, 0);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((g.px[y * 16 + x] & 255) === 0) g.px[y * 16 + x] = 0;
      g.ellipse(8, 12.5, 7.5, 2.6, 0x8ac8f0, 200);
      g.ellipse(8, 12.5, 6, 1.6, 0x2a3a6a, 255);
      g.ellipse(8, 12.5, 3.6, 0.9, 0x8ac8f0, 200);
      blit(g, "qJumpFish", 0, 3, 6);
      blit(g, "qGlint", 0, 0, 1);
      blit(g, "qGlint", 1, 5, 2);
      return g;
    }
    case "q_ride_carp":
    case "pet_hound":
    case "pet_goose":
    case "pet_deer":
    case "pet_paca":
    case "pet_polar":
    case "xm_sleigh": {
      // 24×22 옆모습을 16×16에 줄여 담는다 (칸마다 가장 가까운 픽셀)
      const a = FX_ART[(COSMETIC_FX[id] as PetSpec).art];
      const src = a.build();
      const k = Math.max(a.w / 16, a.h / 15);
      const ox = Math.floor((16 - a.w / k) / 2);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const sx = Math.floor((x - ox + 0.5) * k);
          const sy = Math.floor((y - (16 - a.h / k) + 0.5) * k);
          if (sx < 0 || sy < 0 || sx >= a.w || sy >= a.h) continue;
          const v = src.px[sy * src.w + sx];
          if ((v & 255) > 0) g.px[y * 16 + x] = v;
        }
      return g;
    }
    default:
      // 11/15: 말랑 꾸미기 묶음 (시트 그림·따로 그리는 연출 둘 다) · 11/17 동물원 새 펫
      return cuteIconGrid(id) ?? petPackIconGrid(id) ?? xmasIconGrid(id) ?? themeIconGrid(id);
  }
}

import { DIR, type DirId } from "@tomb/protocol";
import { foxSheet, MOUNT_FRAMES, MOUNT_H, MOUNT_W, mountLift, mountSheet, type MountKind } from "./mountArt";
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
} satisfies Record<string, ArtDef>;

export type FxArtId = keyof typeof FX_ART;

function fill(w: number, h: number, c: Color, a: number): Grid {
  const g = new Grid(w, h);
  g.rect(0, 0, w, h, c, a);
  return g;
}

// ── 아이템 → 연출 규칙 ──

/** mount = 타는 펫 (그림은 mountArt 시트, 따라올 때는 몸집만큼 far배 떨어져 걷는다) */
type PetSpec = { kind: "pet"; art: FxArtId; hover: number; fps: number; idleFps: number; alpha?: number; squash?: boolean; glow?: boolean; mount?: MountKind; far?: number };
type TrailSpec = { kind: "trail"; art: FxArtId; step: number; life: number; motion: "prints" | "splash" | "rise" | "scatter" | "pop"; light?: boolean };
type AuraSpec = { kind: "aura"; motion: "orbit" | "snow" | "petals" | "cloud" | "notes" | "zzz" };
type WingSpec = { kind: "wings"; art: FxArtId; flapMs: number; amp: number };
type HeldSpec = { kind: "held"; item: "umbrella" | "balloon" };
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

/** 따로 그리는 F8 꾸미기 id 전부 (SPRITE_COSMETICS에 들어간다) */
export const COSMETIC_FX_IDS: readonly string[] = Object.keys(COSMETIC_FX);

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
};

type Part = { x: number; y: number; born: number; frame: number; flip: boolean; vx: number };

const TRAIL_POOL = 14;
const PET_LAG_MS = 240;

/** 몸 뒤쪽으로 조금 떨어진 펫 자리 (그림자 유령 친구와 같은 값) */
export function petBack(dir: DirId): [number, number] {
  return dir === DIR.left ? [12, -1] : dir === DIR.right ? [-12, -1] : dir === DIR.up ? [7, 5] : [-9, -5];
}

function heading(dir: DirId): [number, number] {
  return dir === DIR.left ? [-1, 0] : dir === DIR.right ? [1, 0] : dir === DIR.up ? [0, -1] : [0, 1];
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
  private parts: Part[] = [];
  private partNext = 0;
  private walked = 0;
  private lastX = NaN;
  private lastY = NaN;
  private stepAlt = 0;
  private balX = 0;
  private balY = 0;
  private balOn = false;

  setLook(look: readonly string[]): void {
    const next = look.filter((id) => id in COSMETIC_FX).map((id) => [id, COSMETIC_FX[id]] as [string, FxSpec]);
    const had = new Set(this.specs.map(([id]) => id));
    if (!next.some(([, s]) => s.kind === "pet")) this.petOn = false;
    if (!next.some(([, s]) => s.kind === "trail") || next.some(([id, s]) => s.kind === "trail" && !had.has(id))) {
      this.parts = [];
      this.partNext = 0;
    }
    if (!next.some(([, s]) => s.kind === "held" && s.item === "balloon")) this.balOn = false;
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
      else if (s.kind === "held") top = Math.max(top, s.item === "umbrella" ? artTop + 8 : artTop + 6);
      else if (s.kind === "aura" && s.motion === "cloud") top = Math.max(top, artTop + 10);
    }
    return top;
  }

  step(f: FxInput, out: FxCmd[]): void {
    const t = f.still || f.reduced ? 0 : f.now;
    for (const [, s] of this.specs) {
      switch (s.kind) {
        case "wings":
          this.wings(s, f, t, out);
          break;
        case "held":
          if (s.item === "umbrella") this.umbrella(f, out);
          else this.balloon(f, t, out);
          break;
        case "pet":
          this.pet(s, f, t, out);
          break;
        case "trail":
          this.trail(s, f, out);
          break;
        case "aura":
          if (!f.hidden) this.aura(s, f, t, out);
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
        depth: f.y + (f.dir === DIR.up ? 0.05 : -0.05),
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
    out.push(cmd("stick", 0, hx, hy, { oy: 1, sy: len / 8, layer: "body", depth: f.y + front }));
    out.push(cmd("umbrella", 0, cx, canopyY + 1, { oy: 1, layer: "body", depth: f.y + front + 0.01 }));
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
    const depth = f.y + (f.dir === DIR.up ? -0.06 : 0.06);
    out.push(cmd("string", 0, Math.round(hx), Math.round(hy), { oy: 1, sy: len / 8, rot: Math.atan2(dx, -dy), layer: "body", depth }));
    out.push(cmd("balloon", 0, bx, by + 1, { oy: 1, layer: "body", depth: depth + 0.01 }));
  }

  private pet(s: PetSpec, f: FxInput, t: number, out: FxCmd[]): void {
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
    const fps = walking ? s.fps : s.idleFps;
    const frame = Math.floor((t / 1000) * fps) % 2;
    let lift = s.hover;
    let sx = 1;
    let sy = 1;
    if (s.hover) lift += f.reduced ? 0 : Math.sin(t / 420) * 1.5;
    else if (walking && !f.reduced) lift += Math.abs(Math.sin(t / 110)) * (s.squash ? 2 : 1.2);
    if (s.squash && !f.reduced) {
      const q = Math.sin(t / (walking ? 110 : 260));
      sx = 1 + 0.1 * q;
      sy = 1 - 0.1 * q;
    }
    const px = Math.round(this.petX);
    const py = Math.round(this.petY - lift);
    const flip = this.petX > f.x;
    if (s.glow) out.push(cmd("wispGlow", 0, px, py - 5, { oy: 0.5, alpha: 0.8, layer: "light", depth: 0 }));
    out.push(cmd(s.art, frame, px, py, { oy: 1, sx, sy, flip, alpha: s.alpha ?? 1, layer: "body", depth: this.petY }));
  }

  /**
   * 타는 펫에 올라탄 모습: 펫을 발밑(점프하면 같이 뜬다)에 탄 사람 뒤로 그리고, 앞·뒷모습이면 머리·엉덩이를 탄 사람 앞에 덧그린다.
   * 내리면 펫은 이 자리에서부터 다시 따라온다 (petX/petY를 발밑에 맞춰 둔다)
   */
  private mounted(s: PetSpec, f: FxInput, t: number, out: FxCmd[]): void {
    this.petX = f.x;
    this.petY = f.y;
    this.petOn = true;
    if (f.hidden) return;
    const walking = f.moving;
    const fr = walking ? Math.floor((t / 1000) * s.fps) % 2 : 0;
    const x = Math.round(f.x);
    const y = Math.round(f.y - (f.hop ?? 0));
    const view = f.dir === DIR.down ? 2 : f.dir === DIR.up ? 4 : 0;
    out.push(cmd(s.art, view + fr, x, y, { oy: 1, flip: f.dir === DIR.left, layer: "body", depth: f.y - 0.2 }));
    if (view) out.push(cmd(s.art, (f.dir === DIR.down ? 6 : 8) + fr, x, y, { oy: 1, layer: "body", depth: f.y + 0.2 }));
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
            // 발자국은 좌우 발을 번갈아, 나머지는 살짝 흩어서
            x: Math.round(f.x + (prints ? side * 2 * Math.abs(hy) : (Math.random() - 0.5) * 6)),
            y: Math.round(f.y - 1 + (prints ? side * Math.abs(hx) : (Math.random() - 0.5) * 2)),
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
    }
  }

  private aura(s: AuraSpec, f: FxInput, t: number, out: FxCmd[]): void {
    const bx = f.x;
    const top = f.headY - f.artTop;
    const front = f.y + 0.2;
    switch (s.motion) {
      case "orbit":
        for (let i = 0; i < 4; i++) {
          const a = t / 1100 + (i * Math.PI) / 2;
          const tw = f.reduced ? 0.85 : 0.3 + 0.7 * Math.max(0, Math.sin(t / 260 + i * 1.7));
          out.push(
            cmd("sparkStar", i % 3, Math.round(bx + Math.cos(a) * 11), Math.round(f.headY - f.artTop * 0.5 + Math.sin(a * 1.3) * 6), {
              oy: 0.5,
              sx: 0.7 + 0.4 * tw,
              sy: 0.7 + 0.4 * tw,
              alpha: tw,
              layer: "light",
              depth: 0,
            }),
          );
        }
        break;
      case "snow":
      case "petals": {
        const petals = s.motion === "petals";
        const n = petals ? 6 : 8;
        const period = petals ? 2600 : 2200;
        const fallH = f.artTop + 10;
        for (let i = 0; i < n; i++) {
          const ph = (t / period + i / n + h01(i) * 0.13) % 1;
          const sway = Math.sin(t / (petals ? 420 : 650) + i * 1.9) * (petals ? 3 : 1.5);
          const x = bx + (h01(i, 1) * 2 - 1) * 12 + sway;
          const y = top - 10 + ph * fallH;
          const a = ph < 0.12 ? ph / 0.12 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
          const frame = petals ? Math.floor(t / 260 + i) % 2 : i % 2;
          out.push(cmd(petals ? "petal" : "snowflake", frame, Math.round(x), Math.round(y), { oy: 0.5, alpha: a * 0.95, flip: petals && i % 2 === 0, layer: "body", depth: i % 3 === 0 ? f.y - 0.2 : front }));
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
        for (let i = 0; i < 3; i++) {
          const ph = (t / 2000 + i / 3) % 1;
          const side = i % 2 ? 1 : -1;
          const x = bx + side * (7 + ph * 4) + Math.sin(ph * 6 + i) * 1.5;
          const y = f.headY - f.artTop * 0.6 - ph * 14;
          out.push(cmd("note", i % 2, Math.round(x), Math.round(y), { oy: 1, alpha: Math.sin(ph * Math.PI), layer: "body", depth: front }));
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
    }
  }
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
    case "back_wings_butterfly": {
      // 앞모습 날개 한 쌍을 가운데에 (26칸 중 가운데 16칸)
      const a = FX_ART[id === "back_wings_bat" ? "wingsBat" : "wingsButterfly"].build();
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
    case "pet_hound":
    case "pet_goose":
    case "pet_deer": {
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
      return null;
  }
}

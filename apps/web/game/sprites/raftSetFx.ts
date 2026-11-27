import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { Grid } from "./pixel";

// 11/27 좌대 영구 한 벌 세트 연출 「금빛 월척」 (protocol raft.ts RAFT_SET_IDS 넷을 함께 입으면 — 내 화면·남 화면 같은 길, CosmeticFxView).
// 시안 코드(scratchpad jwadaemock/art/setfx.ts — ~/Desktop/목요일작업/좌대시안 22~28번)를 그대로 옮겼다. 그림(RAFT_FX_ART)은 cosmeticFx FX_ART에,
// 움직임(raftSetAura)은 cosmeticFx aura()가 그리기 도우미(push·night·depth)를 넘겨 그린다 (이 파일은 cosmeticFx를 타입으로만 읽는다).
//  ① 발밑에 은은한 금빛 윤슬 (짧은 금 줄 셋이 번갈아 반짝) ② 작은 금 잉어가 발 둘레를 한 바퀴 헤엄친다 (4.8초마다 3.6초 — 뒤쪽 반원은 몸 뒤로)
//  ③ 몸 앞을 지날 때 꼬리를 쳐 물방울 셋이 튄다 ④ 금빛 알갱이 둘이 발에서 어깨까지 천천히 올라가 사라진다. 밤엔 발밑 금빛 웅덩이 + 잉어가 은은히 빛난다
// 기존 「밤낚시 오라」(q_aura_nightfish: 물결 고리·달빛·은빛 물고기 점프)와 겹치지 않게 고리 물결은 없고 물고기는 뛰지 않고 바닥을 돈다.
// 움직임 줄이기·멈춘 미리보기: 잉어는 발 왼쪽 앞에 멈춰 있고 윤슬 두 줄만 (알갱이·물방울 없음).

const GOLD = 0xf6c83c;
const GOLD_HI = 0xfff2a8;
const GOLD_LO = 0xb88418;

/** cosmeticFx가 넘겨주는 그리기 도우미 (meteorFx MeteorDraw와 같은 모양) */
export type RaftSetDraw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  night: boolean;
  /** 몸 그림 depth */
  depth: number;
};

function frames(w: number, h: number, n: number, draw: (g: Grid, f: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

/** 금 잉어 9×5 (오른쪽을 본다) 꼬리 두 프레임 — 문자열은 왼쪽을 보는 잉어라 좌우를 뒤집어 칠한다 */
const CARP_ROWS = [
  ["..GGGg...", ".GgGGGGt.", "GeGGGGGtt", ".GGGGGGt.", "..GGG...."],
  ["..GGGg..t", ".GgGGGGt.", "GeGGGGGt.", ".GGGGGGt.", "..GGG...t"],
] as const;

export const RAFT_FX_ART = {
  /** 금 잉어 9×5 + 짙은 금 테 (11×7, 꼬리 두 장) */
  jwCarp: {
    w: 11,
    h: 7,
    frames: 2,
    build: frames(11, 7, 2, (g, f) => {
      const one = new Grid(9, 5);
      CARP_ROWS[f].forEach((s, y) => {
        for (let x = 0; x < 9; x++) {
          const ch = s[x];
          if (ch === ".") continue;
          one.set(8 - x, y, ch === "g" ? GOLD_HI : ch === "e" ? 0x3a2408 : ch === "t" ? GOLD_LO : GOLD);
        }
      });
      g.draw(one, 1, 1);
      g.outline(0x5a3a10, false, 200);
    }),
  },
  /** 물방울 2×2 */
  jwDrop: {
    w: 2,
    h: 2,
    frames: 1,
    build: frames(2, 2, 1, (g) => {
      g.set(0, 0, 0xffffff);
      g.set(1, 0, 0xcfeefa);
      g.set(0, 1, 0x8ad0f0);
      g.set(1, 1, 0x6ab8e0);
    }),
  },
  /** 금 윤슬 줄 (가로 5 · 2단계) */
  jwDash: {
    w: 5,
    h: 1,
    frames: 2,
    build: frames(5, 1, 2, (g, f) => {
      for (let x = 0; x < 5; x++) if (f || (x > 0 && x < 4)) g.set(x, 0, x === 2 ? GOLD_HI : GOLD, x === 0 || x === 4 ? 150 : 255);
    }),
  },
  /** 금 알갱이 (+ 모양 3×3 — 가운데만 / 십자) */
  jwMote: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      g.set(1, 1, GOLD_HI);
      if (f) for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]] as const) g.set(x, y, GOLD, 170);
    }),
  },
  /** 발밑 금빛 웅덩이 (밤 빛, 22×7 타원 — 더하기) */
  jwPool: {
    w: 22,
    h: 7,
    frames: 1,
    build: frames(22, 7, 1, (g) => {
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 22; x++) {
          const d = ((x + 0.5 - 11) / 11) ** 2 + ((y + 0.5 - 3.5) / 3.5) ** 2;
          if (d < 1) g.set(x, y, 0xffd070, Math.round(110 * (1 - d)));
        }
    }),
  },
} as const;

/** 착용 규칙 (cosmeticFx setLook이 영구 한 벌을 다 입었을 때 「@set:raft」로 붙인다) */
export const RAFT_SET_FX: FxSpec = { kind: "aura", motion: "jwGold", light: true };

/** 잉어 한 바퀴 주기 · 그중 헤엄치는 시간 (ms) */
export const RAFT_CARP_CYCLE = 4800;
const LAP = 3600;
const h01 = (k: number, s: number) => {
  const v = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * 「금빛 월척」 한 프레임. 원점: 시안 그림은 가운데 아래 — 잉어·물방울·알갱이는 그림 가운데로 맞춰 넘긴다.
 * f.x·f.headY = 발밑 (점프하면 같이 뜬다), 잉어는 발 둘레 타원(가로 13 · 세로 5)을 돈다
 */
export function raftSetAura(f: Pick<FxInput, "x" | "headY" | "artTop" | "reduced" | "still" | "hidden">, t: number, d: RaftSetDraw): void {
  if (f.hidden) return;
  const calm = f.reduced || !!f.still;
  const night = d.night;
  const fx = f.x;
  const fy = f.headY;
  const o = { x: fx, y: fy + 1, rx: 13, ry: 5 };
  const front = d.depth + 0.2;
  const back = d.depth - 0.2;
  // 시안 Cmd(원점 = 가운데 아래) → FxCmd
  const at = (art: FxArtId, frame: number, x: number, y: number, p: Partial<FxCmd>) => d.push(art, frame, x, y, { ox: 0.5, oy: 1, ...p });
  // ① 밤: 발밑 금빛 웅덩이
  if (night) at("jwPool", 0, o.x, o.y + 4, { alpha: 0.8, layer: "light", depth: 0 });
  // ① 윤슬 줄 셋 (번갈아 반짝)
  const dashes: readonly (readonly [number, number])[] = [
    [-7, 1],
    [5, 2],
    [-1, 3],
  ];
  dashes.forEach(([dx, dy], i) => {
    if (calm && i === 2) return;
    const ph = calm ? 0.7 : 0.5 + 0.5 * Math.sin(t / 520 + i * 2.1);
    if (ph < 0.25) return;
    at("jwDash", ph > 0.75 ? 1 : 0, o.x + dx, o.y + dy, { alpha: (night ? 0.9 : 0.6) * ph, layer: night ? "light" : "ground", depth: 0 });
  });
  // ② 금 잉어 (그림 11×7 — 시안 9×5 + 테 한 칸)
  if (calm) {
    at("jwCarp", 0, o.x - o.rx + 2, o.y + 4, { alpha: 1, layer: "body", depth: front });
    if (night) at("jwCarp", 0, o.x - o.rx + 2, o.y + 4, { alpha: 0.5, layer: "light", depth: 0 });
  } else {
    const u = (t % RAFT_CARP_CYCLE) / LAP;
    if (u < 1) {
      const a = Math.PI / 2 + u * Math.PI * 2; // 앞(아래)에서 시작해 시계 반대로
      const x = Math.round(o.x + Math.cos(a) * o.rx);
      const y = Math.round(o.y + Math.sin(a) * o.ry + 1);
      const vx = -Math.sin(a);
      const fade = Math.min(1, u * 6, (1 - u) * 6);
      const behind = Math.sin(a) < -0.15;
      const frame = Math.floor(t / 160) % 2;
      at("jwCarp", frame, x, y + 1, { alpha: fade * (behind ? 0.75 : 1), layer: "body", depth: behind ? back : front, flip: vx < 0 });
      // 밤: 잉어가 스스로 은은히 빛난다 (어둠 층 위에 더하기로 한 번 더)
      if (night && !behind) at("jwCarp", frame, x, y + 1, { alpha: fade * 0.5, layer: "light", depth: 0, flip: vx < 0 });
      // ③ 몸 앞 한가운데를 지날 때 꼬리 치며 물방울 셋
      const k = (u - 0.86) / 0.12;
      if (k > 0 && k < 1)
        for (let i = 0; i < 3; i++) {
          const dx = (i - 1) * 3 + (vx < 0 ? 2 : -2);
          const hgt = Math.sin(k * Math.PI) * (5 + i);
          at("jwDrop", 0, Math.round(x + dx * (0.4 + k)), Math.round(y - 2 - hgt), { alpha: 1 - k * 0.6, layer: "body", depth: front });
        }
    }
  }
  // ④ 금 알갱이 둘 (발 → 어깨, 2.4초)
  if (!calm)
    for (let i = 0; i < 2; i++) {
      const p = 2400;
      const tt = t + i * 1200;
      const k = (tt % p) / p;
      const n = Math.floor(tt / p);
      const sx = fx + (h01(n, i + 1) - 0.5) * 16;
      const y = fy - 2 - k * (f.artTop * 0.75);
      const al = Math.sin(k * Math.PI) * (night ? 1 : 0.8);
      at("jwMote", k > 0.3 && k < 0.7 ? 1 : 0, Math.round(sx + Math.sin(tt / 300) * 1.2), Math.round(y), { alpha: al, layer: night ? "light" : "body", depth: h01(n, i + 9) < 0.4 ? back : front });
    }
}

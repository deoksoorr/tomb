import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";

// 11/17 유령선 한정 꾸미기 중 "아바타 시트에 같이 그려지는 것" (avatarGear.ts 머리 그리기가 여기로 넘긴다).
//  유령 선장 모자: 바닷물에 바랜 먹빛 삼각 모자 · 빛바랜 금테 · 앞에 작은 해골 · 녹색 도깨비불 깃털.
//  그림 규칙은 avatarGear와 같다 (몸 기준점 GearM에 맞춰 여섯 몸 모두에, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).

export const GHOST_HEAD = ["gh_capt"] as const;

const FELT = 0x2e3346;
const FELT_HI = 0x4a5270;
const FELT_LO = 0x1e2232;
const TRIM = 0xb89a52;
const TRIM_LO = 0x8a7038;
const BONE = 0xf0ead8;
const BONE_LO = 0xc8c0a8;
const EYE = 0x1a1420;
const WISP = 0x7dffb0;
const WISP_HI = 0xd8ffe6;
const WISP_LO = 0x3ac888;

/** 프레임 맨 위 두 줄은 비워 둬요 — 외곽선 한 줄 자리 (키다리 몸에서 깃털 끝이 잘리지 않게 — 그 위는 그리지 않아요) */
function safe(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, { set: (x: number, y: number, c: Color, a?: number) => (y >= 2 ? set(x, y, c, a) : undefined) });
}

export function drawGhostHead(g0: Grid, view: GearView, id: string, m: GearM, top: number): void {
  if (id !== "gh_capt") return;
  const g = safe(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  if (view === "side") {
    // 옆모습: 앞뒤로 뾰족한 삼각 모자 (앞 = +x). 둥근 꼭대기 + 앞뒤 끝이 들린 챙
    for (const [y, h] of [
      [top - 3, Math.max(2, rx - 3)],
      [top - 2, rx - 1],
      [top - 1, rx],
    ] as [number, number][])
      for (let x = cx - h; x < cx + h; x++) g.set(x, y, x < cx - h + 2 ? FELT_HI : y === top - 1 ? FELT_LO : FELT);
    // 챙: 뒤(-x)는 길게 들려 올라가고, 앞(+x)은 짧고 뾰족해요
    g.hline(cx - rx - 2, cx + rx + 1, top, FELT);
    g.set(cx - rx - 3, top - 1, FELT);
    g.set(cx - rx - 3, top - 2, FELT_HI);
    g.set(cx + rx + 2, top - 1, FELT);
    g.hline(cx - rx - 2, cx + rx + 1, top + 1, TRIM_LO);
    g.set(cx - rx - 3, top, TRIM);
    // 옆 도깨비불 깃털 (뒤쪽으로 휘어요)
    g.set(cx - 2, top - 4, WISP);
    g.set(cx - 3, top - 5, WISP_HI);
    g.set(cx - 4, top - 5, WISP);
    g.set(cx - 5, top - 4, WISP_LO);
    return;
  }
  const front = view === "down";
  // 둥근 몸 (가운데가 솟은 머리 덮개)
  for (const [y, h] of [
    [top - 3, Math.max(2, rx - 3)],
    [top - 2, rx - 1],
    [top - 1, rx],
  ] as [number, number][])
    for (let x = cx - h; x < cx + h; x++) g.set(x, y, x < cx - h + 2 ? FELT_HI : x >= cx + h - 2 ? FELT_LO : FELT);
  // 넓은 챙: 양끝이 위로 접혀 올라간 삼각 모자 (앞모습에선 가운데가 앞으로 살짝 내려와요)
  const w = rx + 3;
  g.hline(cx - w, cx + w - 1, top, FELT);
  g.hline(cx - w, cx - w + 1, top - 1, FELT_HI);
  g.hline(cx + w - 2, cx + w - 1, top - 1, FELT_LO);
  g.set(cx - w - 1, top - 2, FELT_HI);
  g.set(cx + w, top - 2, FELT_LO);
  g.set(cx - w, top - 2, FELT);
  g.set(cx + w - 1, top - 2, FELT);
  // 금테 (빛바랜 — 군데군데 끊겨요)
  for (let x = cx - w; x < cx + w; x++) g.set(x, top + 1, (x + top) % 5 === 0 ? TRIM_LO : TRIM);
  g.set(cx - w - 1, top - 1, TRIM);
  g.set(cx + w, top - 1, TRIM);
  if (front) {
    // 앞 해골 (뼈 둘 엇갈림은 너무 작아 해골만): 3×3 + 눈 둘
    g.hline(cx - 2, cx, top - 2, BONE);
    g.hline(cx - 2, cx, top - 1, BONE);
    g.set(cx - 2, top - 1, EYE);
    g.set(cx, top - 1, EYE);
    g.set(cx - 1, top, BONE_LO);
    g.set(cx + 1, top - 2, BONE_LO);
  }
  // 도깨비불 깃털 (모자 왼쪽 위로 솟아 흔들려요)
  const fx = cx - rx + 1;
  g.set(fx, top - 4, WISP_LO);
  g.set(fx - 1, top - 5, WISP);
  g.set(fx, top - 6, WISP_HI);
  g.set(fx - 1, top - 6, WISP);
  g.set(fx - 2, top - 4, WISP);
}

/** 외곽선 뒤에도 밝게 남는 점 (도깨비불 깃털 끝 · 해골 눈빛) */
export function drawGhostHeadGlow(g0: Grid, view: GearView, id: string, m: GearM, top: number): void {
  if (id !== "gh_capt") return;
  const g = safe(g0);
  const rx = Math.round(m.rx);
  if (view === "side") {
    g.set(m.cx - 3, top - 5, WISP_HI);
    return;
  }
  g.set(m.cx - rx, top - 6, WISP_HI);
  if (view === "down") {
    g.set(m.cx - 2, top - 1, WISP);
    g.set(m.cx, top - 1, WISP);
  }
}

// ── 아이콘 (16×16) ──
type Ascii = { rows: readonly string[]; pal: Record<string, Color> };
const ICONS: Record<string, Ascii> = {
  gh_capt: {
    rows: [
      "..g.............",
      ".hgw............",
      "..g.............",
      "..d...ffff......",
      "..d.fffffffh....",
      "t..ffffbbbffh..t",
      "tf.fffbkbkbfh.ft",
      "tfffffbbbbbffhft",
      ".tfffffbcbfffft.",
      "..tttttttttttt..",
      "...yyyyyyyyyy...",
    ],
    pal: { f: FELT, h: FELT_HI, d: FELT_LO, t: TRIM, y: TRIM_LO, b: BONE, c: BONE_LO, k: EYE, g: WISP, w: WISP_HI },
  },
};

export function ghostGearIcon(id: string): Grid | null {
  const a = ICONS[id];
  if (!a) return null;
  const g = new Grid(16, 16);
  const oy = Math.max(0, Math.floor((16 - a.rows.length) / 2) + 1);
  a.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && a.pal[ch] !== undefined && g.set(x, y + oy, a.pal[ch])));
  g.outline(0x1e1c1a, false, 170);
  // 도깨비불은 외곽선 위에서도 밝게
  g.set(2, oy + 1, WISP_HI);
  return g;
}

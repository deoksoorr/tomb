// 11/20 광역 불꽃쇼 (한강 불꽃쇼·동네 불꽃 한마당)의 순서표. 순수 계산 (Phaser 없이).
// 자리는 화면 비율 (fx: 0..1 가로, fy: 0..1 세로), 반경 h는 화면 짧은 변 비율 — 보는 사람 화면(폰·PC)마다 하늘 전체를 덮는다.
// rw가 있으면 반경을 화면 너비 비율로 (나이아가라 커튼이 화면 끝에서 끝까지). lx: 로켓이 솟는 가로 자리 (비스듬히 오르는 일제 발사)

import { FINALE_COLORS, FW_COLORS, type FwPattern } from "./fwShapes";

export type ShowShot = {
  fx: number;
  fy: number;
  delay: number;
  h: number;
  colors: readonly number[];
  pattern: FwPattern;
  /** 크게 (소리·흔들림·밝아짐) */
  big?: boolean;
  lx?: number;
  rw?: number;
};
export type ShowProgram = { shots: ShowShot[]; auroras: { at: number; dur: number }[]; ms: number };

/** 쇼가 시작하기 전 기다림 (신호탄이 오를 시간) */
export const SHOW_LEAD = 700;

/** 쇼 순서표. reduced면 차분한 판 (발 수 절반쯤, 타닥·휘슬·꿈틀 없이) */
export function showProgram(item: string, reduced = false, rnd: () => number = Math.random): ShowProgram {
  const rand = (a: number, b: number) => a + rnd() * (b - a);
  const shots: ShowShot[] = [];
  const auroras: { at: number; dur: number }[] = [];
  const C = FW_COLORS;
  let ci = 0;
  const pal = () => FINALE_COLORS[ci++ % FINALE_COLORS.length];
  const calm = (p: FwPattern): FwPattern => (!reduced ? p : p === "crackle" || p === "whistle" || p === "fish" || p === "pinwheel" ? "peony" : p);
  // 반경은 한 발짜리 피날레보다 조금 크게 (하늘 전체가 겹겹이 차도록)
  const add = (s: ShowShot) => shots.push({ ...s, h: s.h * 1.3, pattern: calm(s.pattern), delay: SHOW_LEAD + s.delay });
  /** 일제 발사: 왼쪽 → 오른쪽 (dir = -1이면 반대로) */
  const volley = (t0: number, n: number, gap: number, dir: 1 | -1, pattern: FwPattern, h: number, fy: [number, number], colors?: readonly number[]) => {
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      const fx = 0.07 + 0.86 * (dir > 0 ? u : 1 - u);
      add({ fx, fy: rand(fy[0], fy[1]), delay: t0 + i * gap, h: h * rand(0.9, 1.1), colors: colors ?? pal(), pattern, lx: fx + (fx - 0.5) * -0.12 });
    }
  };
  /** 물결: 화면 전체에 흩어 n발 (황금비로 겹치지 않게) */
  const wave = (t0: number, n: number, span: number, patterns: readonly FwPattern[], h: [number, number], fy: [number, number] = [0.14, 0.4]) => {
    const ph = rnd();
    for (let i = 0; i < n; i++) {
      const fx = 0.08 + 0.84 * ((ph + i * 0.618) % 1);
      const pattern = patterns[i % patterns.length];
      add({ fx, fy: rand(fy[0], fy[1]), delay: t0 + (n > 1 ? (i / (n - 1)) * span : 0) + rand(-40, 40), h: rand(h[0], h[1]), colors: pattern === "willow" || pattern === "kamuro" ? C.gold : pattern === "heart" ? C.pink : pattern === "rainbow" ? C.red : pal(), pattern });
    }
  };
  /** 좌우 짝 (같은 모양이 양쪽에서 동시에) */
  const pair = (t: number, fx: number, fy: number, pattern: FwPattern, h: number, colors: readonly number[]) => {
    add({ fx, fy, delay: t, h, colors, pattern });
    add({ fx: 1 - fx, fy, delay: t + 60, h, colors, pattern });
  };
  /** 피날레 몰아치기: n발을 span 동안 */
  const barrage = (t0: number, n: number, span: number) => {
    const pats: FwPattern[] = ["kiku", "peony", "double", "crackle", "kiku", "ring", "peony", "chameleon", "crackle", "brocade"];
    const ph = rnd();
    for (let i = 0; i < n; i++) {
      const fx = 0.06 + 0.88 * ((ph + i * 0.618) % 1);
      const p = pats[i % pats.length];
      add({ fx, fy: rand(0.12, 0.42), delay: t0 + (i / n) * span + rand(-30, 30), h: rand(0.15, 0.24), colors: p === "chameleon" ? C.red : pal(), pattern: p, big: i % 6 === 0 });
    }
  };
  /** 금빛 왕관 (가장 크게) */
  const crowns = (t0: number, xs: readonly number[], h: number) => xs.forEach((fx, i) => add({ fx, fy: rand(0.2, 0.28), delay: t0 + i * 160, h, colors: C.gold, pattern: "kamuro", big: true }));

  if (item === "fw_town") {
    // 동네 불꽃 한마당 (~15초): 일제 발사 → 국화 물결 → 짧은 나이아가라 + 모양 → 금빛 마무리
    volley(0, 7, 220, 1, "peony", 0.11, [0.18, 0.3], C.silver);
    wave(1900, 6, 1900, ["kiku", "double", "kiku", "ring", "chameleon", "kiku"], [0.16, 0.23]);
    auroras.push({ at: SHOW_LEAD + 3600, dur: 7600 });
    add({ fx: 0.5, fy: 0.16, delay: 4600, h: 0.3, rw: 0.31, colors: C.gold, pattern: "niagara" });
    pair(5600, 0.2, 0.3, "heart", 0.14, C.pink);
    add({ fx: 0.5, fy: 0.36, delay: 6300, h: 0.2, colors: C.yellow, pattern: "smile" });
    pair(7100, 0.28, 0.26, "fish", 0.16, C.cyan);
    add({ fx: 0.5, fy: 0.28, delay: 7900, h: 0.2, colors: C.red, pattern: "rainbow" });
    pair(8700, 0.16, 0.22, "pinwheel", 0.12, C.gold);
    wave(9300, 5, 900, ["crackle", "whistle", "crackle", "cascade", "crackle"], [0.14, 0.2]);
    barrage(10600, reduced ? 6 : 14, 2200);
    crowns(12800, [0.3, 0.7, 0.5], 0.32);
    return { shots: thin(shots, reduced), auroras, ms: SHOW_LEAD + 16_400 };
  }

  // 한강 불꽃쇼 (~36초)
  // 1) 막 열기: 은빛 일제 발사 왼쪽 → 오른쪽, 이어서 국화가 오른쪽 → 왼쪽
  volley(0, 9, 230, 1, "peony", 0.1, [0.16, 0.26], C.silver);
  volley(2300, 9, 210, -1, "kiku", 0.15, [0.24, 0.36]);
  // 2) 국화·겹꽃 물결 세 번 (점점 크게)
  wave(4600, 5, 900, ["kiku", "double", "kiku", "chameleon", "kiku"], [0.15, 0.2]);
  wave(6300, 6, 1000, ["peony", "kiku", "ring", "kiku", "double", "kiku"], [0.17, 0.23]);
  wave(8100, 6, 1100, ["kiku", "cascade", "kiku", "brocade", "kiku", "cascade"], [0.19, 0.26]);
  // 3) 오로라가 하늘 위쪽에 걸린다 (나이아가라 앞은 비워 둔다)
  auroras.push({ at: SHOW_LEAD + 9600, dur: 15_500 });
  // 4) 나이아가라: 화면 끝에서 끝까지 금빛 커튼 (앞뒤로 조용히 비워 둔다), 그 위로 버드나무·야자수·팝콘
  add({ fx: 0.5, fy: 0.13, delay: 11_600, h: 0.3, rw: 0.32, colors: C.gold, pattern: "niagara", big: true });
  add({ fx: 0.25, fy: 0.3, delay: 13_600, h: 0.2, colors: C.gold, pattern: "willow" });
  add({ fx: 0.75, fy: 0.3, delay: 13_900, h: 0.2, colors: C.green, pattern: "palm" });
  wave(14_700, 4, 900, ["crackle"], [0.12, 0.16], [0.26, 0.38]);
  add({ fx: 0.5, fy: 0.34, delay: 16_000, h: 0.22, colors: C.gold, pattern: "glitter" });
  // 은하 점멸·낙하산 별·물고기 떼가 조용히
  add({ fx: 0.2, fy: 0.2, delay: 15_400, h: 0.2, colors: C.silver, pattern: "strobe" });
  add({ fx: 0.8, fy: 0.22, delay: 15_700, h: 0.2, colors: C.silver, pattern: "strobe" });
  add({ fx: 0.5, fy: 0.18, delay: 16_300, h: 0.2, colors: C.silver, pattern: "parachute" });
  pair(16_900, 0.3, 0.3, "fish", 0.17, C.cyan);
  // 5) 모양 잔치: 고리·하트·스마일·이모티콘·나비·별·무지개·바람개비·연쇄 국화
  pair(17_800, 0.2, 0.26, "ring", 0.15, C.cyan);
  add({ fx: 0.5, fy: 0.3, delay: 18_300, h: 0.22, colors: C.red, pattern: "rainbow" });
  pair(19_100, 0.27, 0.3, "heart", 0.15, C.pink);
  add({ fx: 0.5, fy: 0.24, delay: 19_800, h: 0.2, colors: C.yellow, pattern: "smile" });
  pair(20_500, 0.14, 0.24, "pinwheel", 0.13, C.gold);
  add({ fx: 0.36, fy: 0.22, delay: 21_100, h: 0.16, colors: C.pink, pattern: "emoji" });
  add({ fx: 0.64, fy: 0.3, delay: 21_400, h: 0.16, colors: C.violet, pattern: "butterfly" });
  pair(22_000, 0.22, 0.2, "star", 0.14, C.yellow);
  add({ fx: 0.5, fy: 0.28, delay: 22_600, h: 0.2, colors: C.violet, pattern: "twinring" });
  add({ fx: 0.5, fy: 0.2, delay: 23_300, h: 0.22, colors: C.gold, pattern: "cascade" });
  pair(23_800, 0.1, 0.32, "snow", 0.14, C.silver);
  // 6) 휘슬 일제 발사 + 타닥 팝콘
  volley(24_600, 6, 260, 1, "whistle", 0.15, [0.16, 0.3], C.silver);
  wave(26_000, 6, 1300, ["crackle", "crossette", "crackle", "spiral", "crackle", "crossette"], [0.13, 0.18]);
  // 7) 숨 고르기 → 금빛 왕관 셋
  crowns(28_000, [0.5, 0.2, 0.8], 0.3);
  // 8) 피날레: 30발 몰아치기 + 타닥, 마지막에 큰 왕관과 무지개
  barrage(30_000, reduced ? 12 : 30, 3600);
  add({ fx: 0.5, fy: 0.3, delay: 33_200, h: 0.24, colors: C.red, pattern: "rainbow", big: true });
  crowns(33_900, [0.5, 0.18, 0.82, 0.35, 0.65], 0.36);
  return { shots: thin(shots, reduced), auroras, ms: SHOW_LEAD + 38_000 };
}

/** reduced: 큰 것(big)은 남기고 나머지는 두 발 중 한 발 */
function thin(shots: ShowShot[], reduced: boolean): ShowShot[] {
  const sorted = shots.sort((a, b) => a.delay - b.delay);
  if (!reduced) return sorted;
  return sorted.filter((s, i) => s.big || s.pattern === "niagara" || i % 2 === 0);
}

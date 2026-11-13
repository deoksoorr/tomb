// 앱 아이콘 생성 스크립트 — 32×32 도트 그림을 코드로 찍어 PNG/SVG로 내보낸다 (외부 패키지 없이 node:zlib만 사용).
// 실행 (apps/web 폴더에서):
//   node scripts/gen-icons.mjs            → 후보 ①로 실제 아이콘 파일을 만든다
//   node scripts/gen-icons.mjs 3          → 후보 ③으로 만든다 (번호만 바꾸면 됨)
//   node scripts/gen-icons.mjs 7a         → 후보 ⑦a(두건 캐릭터 + 모닥불)로 만든다 (7b도 있음)
//   node scripts/gen-icons.mjs --sheet 폴더 → 후보 전부의 512px PNG + 비교 시트(sheet.png)를 그 폴더에 만든다
//   node scripts/gen-icons.mjs --sheet 폴더 7a,7b sheet-7.png → 고른 후보만 비교 시트로
// 실제 아이콘 파일: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png, app/apple-icon.png, app/icon.svg
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const N = 32; // 도트 그림 한 변 칸 수

// 팔레트 (글자 하나 = 색 하나, "_"는 투명)
const PAL = {
  _: null,
  n: "#161c30", // 밤하늘 남색
  v: "#1f2742", // 달빛 번짐
  h: "#2a2a30", // 불빛 번짐 (하늘)
  k: "#0a0d17", // 실루엣 검정
  R: "#4a5680", // 달빛이 닿은 실루엣 테두리
  "*": "#c9d1e8", // 별
  ".": "#6a7392", // 흐린 별
  S: "#a9ab9f", // 묘비 밝은 면
  L: "#c4b88e", // 불빛이 비친 묘비 면
  D: "#7d8077", // 묘비 그림자
  E: "#5d6058", // 새김 글
  g: "#3b4a36", // 땅
  G: "#4d6145", // 땅 윗줄 풀·줄기
  d: "#2b3628", // 땅 어두운 곳
  w: "#5a5236", // 불빛 비친 땅
  W: "#ece0bd", // 초·달·글자 크림색
  y: "#f4c04a", // 불꽃 노랑
  o: "#e07a2e", // 불꽃 주황
  r: "#c2453f", // 불꽃 바깥 빨강
  c: "#fff4c2", // 불꽃 가장 밝은 곳
  b: "#6b4a32", // 장작
  B: "#4a3222", // 장작 어두운 면
  H: "#9fc5a8", // 두건 (게임 기본 캐릭터 색)
  I: "#c3dcc9", // 두건 밝은 면
  J: "#7c9a83", // 두건 그림자
  F: "#17161d", // 두건 속 얼굴 구멍
  e: "#f6efd4", // 눈
  p: "#e6a3b0", // 꽃잎
  P: "#c27a8a", // 꽃잎 그림자
  O: "#e3b27c", // 모닥불 빛이 비친 두건·몸
};

// ---- 그림 도우미 ----
const blank = (ch = "n") => Array.from({ length: N }, () => Array(N).fill(ch));
const set = (g, x, y, ch) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = ch; };
const rect = (g, x, y, w, h, ch) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, ch); };
const ellipse = (g, cx, cy, rx, ry, ch, test = () => true) => {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1 && test(x, y)) g[y][x] = ch;
  }
};
const stars = (g, list) => list.forEach(([x, y, ch = "*"]) => set(g, x, y, ch));
// 땅: top 줄부터 아래 끝까지, 윗줄은 풀색
const ground = (g, top) => { rect(g, 0, top, N, N - top, "g"); rect(g, 0, top, N, 1, "G"); };
// 묘비: 왼쪽 x0, 윗줄 top, 땅 윗줄 base 바로 위까지. 폭 14 (오른쪽 3칸 그림자, 윗모서리 둥글게)
const tomb = (g, x0, top, base, { lines = true } = {}) => {
  rect(g, x0 + 2, top, 10, 1, "S");
  rect(g, x0 + 1, top + 1, 12, 1, "S");
  rect(g, x0, top + 2, 14, base - top - 2, "S");
  rect(g, x0 + 10, top + 1, 2, 1, "D");
  rect(g, x0 + 11, top + 2, 3, base - top - 2, "D");
  if (lines) { rect(g, x0 + 3, top + 5, 7, 1, "E"); rect(g, x0 + 3, top + 7, 7, 1, "E"); rect(g, x0 + 3, top + 9, 4, 1, "E"); }
};
const toStrings = (g) => g.map((r) => r.join(""));
// 작은 모닥불: 가운데 cx, 불꽃 꼭대기 top~장작 위 base, 가장 넓은 반폭 hw. 번짐→빨강→주황→노랑→흰빛 겹겹이
const smallFire = (g, cx, top, base, hw) => {
  const layer = (grow, ch) => {
    for (let y = top - 1; y <= base; y++) {
      const t = (y - top) / (base - top);
      const w = (t < 0 ? 0 : hw * t ** 0.7 * (t > 0.8 ? 1 - (t - 0.8) * 0.9 : 1)) + grow;
      const sway = t < 0.45 ? Math.round((0.45 - t) * 4) : 0; // 꼭대기가 살짝 오른쪽으로 휨
      for (let x = 0; x < N; x++) if (Math.abs(x + 0.5 - cx - sway) <= w && w > 0.4) set(g, x, y, ch);
    }
  };
  layer(1, "h"); layer(0, "r"); layer(-0.9, "o"); layer(-1.8, "y"); layer(-2.8, "c");
  // 통나무 두 개 X자 (불꽃 폭보다 조금만 넓게, 두 줄 두께)
  const x0 = Math.round(cx - hw - 1), len = Math.round(hw * 2 + 2);
  for (let i = 0; i < len; i++) { set(g, x0 + i, base + 1 - Math.floor(i / 5), "b"); set(g, x0 + i, base + 2 - Math.floor(i / 5), "B"); }
  for (let i = 0; i < len; i++) { set(g, x0 + len - 1 - i, base + 1 - Math.floor(i / 5), "b"); set(g, x0 + len - 1 - i, base + 2 - Math.floor(i / 5), "B"); }
};
// 오른쪽(불 쪽)을 향한 두건·몸 가장자리 칸을 불빛 색으로
const warmRim = (g, depth = 1, minY = 0) => {
  const body = (ch) => ch === "H" || ch === "I" || ch === "J";
  const hits = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (y < minY || !body(g[y][x])) continue;
    for (let d = 1; d <= depth; d++) if (x + d >= N || (!body(g[y][x + d]) && g[y][x + d] !== "F" && g[y][x + d] !== "e")) { hits.push([x, y]); break; }
  }
  hits.forEach(([x, y]) => (g[y][x] = "O"));
};

// ---- 후보들 (모두 남색 밤 배경 + 도트) ----
const CANDIDATES = {
  // ① 묘비 + 앞 왼쪽 촛불
  1: () => {
    const g = blank();
    stars(g, [[26, 3], [4, 4], [23, 6, "."], [29, 11], [3, 14, "."]]);
    ground(g, 25);
    tomb(g, 9, 8, 25);
    rect(g, 9, 16, 1, 9, "L"); // 촛불이 비친 묘비 왼쪽 면
    // 불빛 번짐
    for (const [x, y] of [[6, 16], [5, 17], [6, 17], [4, 18], [4, 19], [4, 20], [8, 18], [8, 19], [8, 20], [5, 21], [7, 21]]) set(g, x, y, "h");
    // 불꽃
    set(g, 7, 17, "y"); rect(g, 6, 18, 2, 1, "y"); set(g, 5, 19, "y"); set(g, 6, 19, "c"); set(g, 7, 19, "y");
    set(g, 5, 20, "o"); set(g, 6, 20, "y"); set(g, 7, 20, "o"); set(g, 6, 21, "o");
    rect(g, 5, 22, 2, 4, "W"); // 초
    rect(g, 3, 25, 6, 2, "w"); rect(g, 4, 27, 4, 1, "w"); rect(g, 5, 25, 2, 1, "W"); // 불빛 비친 땅
    rect(g, 14, 27, 10, 1, "d"); set(g, 26, 29, "d"); set(g, 5, 30, "d");
    return g;
  },
  // ② 모닥불만 크게
  2: () => {
    const g = blank();
    stars(g, [[4, 3], [27, 4], [24, 9, "."], [6, 11, "."], [29, 15]]);
    ground(g, 26);
    // 불빛 번짐 → 빨강 → 주황 → 노랑 → 흰빛 순으로 겹겹이 (아래가 넓은 물방울 모양)
    const flame = (grow, ch) => {
      for (let y = 4; y <= 24; y++) {
        const t = (y - 5) / 19; // 0(꼭대기)~1(바닥)
        const hw = (t < 0 ? 0 : 7.5 * Math.sqrt(t) * (t > 0.8 ? 1 - (t - 0.8) * 0.9 : 1)) + grow;
        const sway = y < 13 ? Math.round((13 - y) / 4) : 0; // 꼭대기가 살짝 오른쪽으로 휨
        for (let x = 0; x < N; x++) if (Math.abs(x + 0.5 - 16 - sway) <= hw && hw > 0.4) set(g, x, y, ch);
      }
    };
    flame(2, "h"); flame(0, "r"); flame(-1.3, "o"); flame(-2.8, "y"); flame(-4.6, "c");
    set(g, 10, 9, "o"); set(g, 22, 12, "y"); set(g, 9, 13, "r"); // 튀는 불티
    // 장작 두 개를 X자로
    for (let i = 0; i < 16; i++) { set(g, 8 + i, 26 - Math.floor(i / 4), "b"); set(g, 8 + i, 27 - Math.floor(i / 4), "B"); }
    for (let i = 0; i < 16; i++) { set(g, 23 - i, 26 - Math.floor(i / 4), "b"); set(g, 23 - i, 27 - Math.floor(i / 4), "B"); }
    rect(g, 5, 28, 22, 1, "w"); rect(g, 8, 29, 16, 1, "w");
    return g;
  },
  // ③ 게임 기본 캐릭터(두건 쓴 작은 순례자) 얼굴
  3: () => {
    const g = blank();
    stars(g, [[4, 4], [27, 3], [26, 10, "."], [3, 12, "."]]);
    rect(g, 4, 27, 24, 5, "H"); rect(g, 6, 26, 20, 1, "H"); // 어깨
    rect(g, 22, 26, 6, 6, "J");
    ellipse(g, 16, 17, 11, 10.5, "H");
    ellipse(g, 16, 17, 11, 10.5, "I", (x, y) => x - 16 + (y - 17) < -10); // 왼쪽 위 밝은 면
    ellipse(g, 16, 17, 11, 10.5, "J", (x, y) => x - 16 - (y - 17) > 6); // 오른쪽 그림자
    // 새싹처럼 접힌 두건 끝
    rect(g, 15, 5, 2, 2, "H"); rect(g, 17, 4, 2, 1, "H"); set(g, 19, 3, "H"); set(g, 15, 5, "I");
    ellipse(g, 16, 19, 7.5, 5.5, "F"); // 얼굴 구멍
    rect(g, 12, 18, 2, 3, "e"); rect(g, 19, 18, 2, 3, "e"); // 눈 두 점
    return g;
  },
  // ④ 초승달 + 묘비 실루엣
  4: () => {
    const g = blank();
    ellipse(g, 22, 10, 9, 9, "v"); // 달빛 번짐
    stars(g, [[4, 4], [9, 9, "."], [3, 16], [12, 3, "."], [28, 22, "."]]);
    ellipse(g, 22, 10, 6.5, 6.5, "W");
    ellipse(g, 19, 7.5, 5.5, 5.5, "v", (x, y) => g[y][x] === "W"); // 안쪽을 덜어 초승달로
    ellipse(g, 16, 36, 22, 11, "k"); // 언덕
    tomb(g, 6, 13, 27, { lines: false });
    for (let y = 13; y < 27; y++) for (let x = 6; x < 20; x++) if (g[y][x] !== "n" && g[y][x] !== "v") g[y][x] = "k";
    rect(g, 23, 19, 2, 8, "k"); rect(g, 21, 21, 6, 2, "k"); // 작은 십자 비석
    // 달 쪽(오른쪽 위)을 향한 테두리에 달빛: 바로 위나 오른쪽이 하늘인 실루엣 칸
    const sky = (x, y) => x >= N || y < 0 || g[y][x] === "n" || g[y][x] === "v" || g[y][x] === "*" || g[y][x] === ".";
    const rim = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] === "k" && (sky(x, y - 1) || sky(x + 1, y))) rim.push([x, y]);
    rim.forEach(([x, y]) => (g[y][x] = "R"));
    return g;
  },
  // ⑤ "한" 글자 도트 로고
  5: () => {
    const g = blank();
    stars(g, [[3, 3], [28, 4, "."], [28, 29], [2, 22, "."]]);
    const glyph = blank("_");
    rect(glyph, 10, 3, 4, 3, "W"); // ㅎ 꼭지
    rect(glyph, 5, 7, 14, 3, "W"); // ㅎ 가로획
    ellipse(glyph, 12, 15, 6, 4.6, "W"); ellipse(glyph, 12, 15, 2.6, 1.5, "_"); // ㅎ 동그라미
    rect(glyph, 21, 3, 3, 18, "W"); rect(glyph, 24, 10, 4, 3, "W"); // ㅏ
    rect(glyph, 7, 22, 3, 7, "W"); rect(glyph, 7, 26, 20, 3, "W"); // ㄴ
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (glyph[y][x] === "W") { set(g, x + 1, y + 1, "k"); } // 그림자
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (glyph[y][x] === "W") g[y][x] = "W";
    return g;
  },
  // ⑥ 비석 앞에 꽃 한 송이
  6: () => {
    const g = blank();
    stars(g, [[4, 4], [27, 3], [24, 7, "."], [29, 13], [3, 12, "."]]);
    ground(g, 25);
    tomb(g, 12, 8, 25);
    rect(g, 7, 20, 1, 6, "G"); rect(g, 8, 22, 2, 1, "G"); rect(g, 5, 23, 2, 1, "G"); // 줄기·잎
    rect(g, 6, 13, 3, 2, "p"); rect(g, 6, 18, 3, 2, "p"); rect(g, 4, 15, 2, 3, "p"); rect(g, 9, 15, 2, 3, "p"); // 꽃잎
    set(g, 8, 19, "P"); set(g, 10, 17, "P"); set(g, 5, 17, "P");
    rect(g, 6, 15, 3, 3, "y"); set(g, 8, 17, "o"); // 꽃술
    rect(g, 15, 27, 10, 1, "d"); set(g, 27, 29, "d"); set(g, 3, 30, "d");
    return g;
  },
  // ⑦a 두건 캐릭터 정면 + 오른쪽 아래 작은 모닥불
  "7a": () => {
    const g = blank();
    stars(g, [[3, 3], [27, 4], [22, 8, "."], [29, 12, "."], [2, 13, "."]]);
    ground(g, 28);
    rect(g, 4, 23, 16, 5, "H"); rect(g, 15, 23, 5, 5, "J"); // 어깨·몸
    ellipse(g, 12, 16.5, 8.5, 8, "H");
    ellipse(g, 12, 16.5, 8.5, 8, "I", (x, y) => x - 12 + (y - 16.5) < -8); // 왼쪽 위 밝은 면
    ellipse(g, 12, 16.5, 8.5, 8, "J", (x, y) => x - 12 - (y - 16.5) > 5); // 오른쪽 그림자
    rect(g, 11, 8, 2, 1, "H"); rect(g, 13, 7, 2, 1, "H"); set(g, 15, 6, "H"); set(g, 11, 8, "I"); // 새싹 두건 끝
    ellipse(g, 12, 18, 5.5, 4, "F"); // 얼굴 구멍
    rect(g, 9, 17, 2, 3, "e"); rect(g, 14, 17, 2, 3, "e"); // 눈
    warmRim(g, 1, 11);
    smallFire(g, 25, 14, 25, 3.6);
    set(g, 21, 14, "o"); set(g, 28, 12, "y"); // 불티
    rect(g, 20, 28, 11, 1, "w"); rect(g, 22, 29, 7, 1, "w"); // 불빛 비친 땅
    set(g, 6, 30, "d"); rect(g, 10, 29, 5, 1, "d");
    return g;
  },
  // ⑦b 두건 캐릭터가 오른쪽 모닥불을 보며 앉음
  "7b": () => {
    const g = blank();
    stars(g, [[3, 4], [27, 3], [22, 8, "."], [29, 13, "."], [5, 25, "."]]);
    ground(g, 28);
    // 앉은 몸 (아래로 넓어지는 망토) + 앞으로 뻗은 무릎
    for (let y = 19; y < 28; y++) { const w = Math.min(7, 3 + Math.floor((y - 19) / 2)); rect(g, 11 - w, y, w * 2 + 1, 1, "H"); }
    rect(g, 12, 24, 7, 4, "H"); rect(g, 16, 24, 3, 4, "J");
    for (let y = 19; y < 28; y++) set(g, 11 - Math.min(7, 3 + Math.floor((y - 19) / 2)), y, "J"); // 등 쪽 그림자
    ellipse(g, 11.5, 14, 7.5, 7, "H");
    ellipse(g, 11.5, 14, 7.5, 7, "I", (x, y) => x - 11.5 + (y - 14) < -6); // 위쪽 밝은 면
    ellipse(g, 11.5, 14, 7.5, 7, "J", (x, y) => x < 7 && y > 14); // 뒤통수 그림자
    rect(g, 9, 6, 2, 1, "H"); rect(g, 7, 5, 2, 1, "H"); set(g, 6, 4, "H"); // 뒤로 접힌 두건 끝
    ellipse(g, 14.5, 15, 4.5, 4, "F"); // 불 쪽으로 돌린 얼굴 구멍
    rect(g, 12, 14, 2, 2, "e"); rect(g, 15, 14, 2, 2, "e"); // 눈
    warmRim(g, 1, 9);
    smallFire(g, 25, 13, 25, 3.8);
    set(g, 21, 12, "o"); set(g, 28, 10, "y"); // 불티
    rect(g, 18, 28, 13, 1, "w"); rect(g, 21, 29, 8, 1, "w");
    set(g, 4, 30, "d"); rect(g, 8, 29, 4, 1, "d");
    return g;
  },
};

function hex(c) {
  const v = parseInt(c.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
}

// 그림을 정수 배율로 키워 size×size 캔버스 가운데에 놓는다 (RGBA 버퍼 반환).
// 남는 테두리는 그림 가장자리 색을 그대로 늘려 채운다 (하늘은 하늘, 땅은 땅으로 이어짐).
// roundCorners: 모서리를 한 칸씩 계단처럼 잘라 투명하게 (일반 아이콘만)
function render(grid, size, scale, { roundCorners = false } = {}) {
  const off = Math.floor((size - N * scale) / 2);
  const px = Buffer.alloc(size * size * 4);
  const L = N - 1;
  const cut = new Set(roundCorners ? ["0,0", "1,0", "0,1", `${L},0`, `${L - 1},0`, `${L},1`, `0,${L}`, `1,${L}`, `0,${L - 1}`, `${L},${L}`, `${L - 1},${L}`, `${L},${L - 1}`] : []);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = Math.min(L, Math.max(0, Math.floor((x - off) / scale)));
    const gy = Math.min(L, Math.max(0, Math.floor((y - off) / scale)));
    const ch = cut.has(`${gx},${gy}`) ? "_" : grid[gy][gx];
    (PAL[ch] ? hex(PAL[ch]) : [0, 0, 0, 0]).forEach((v, i) => (px[(y * size + x) * 4 + i] = v));
  }
  return px;
}

// 브라우저·OS가 큰 아이콘을 줄여 보여 주는 모습을 흉내: 칸마다 여러 점을 찍어 평균
function downscale(src, srcSize, size) {
  const out = Buffer.alloc(size * size * 4);
  const k = 6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0, 0];
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const sx = Math.floor(((x + (i + 0.5) / k) * srcSize) / size);
      const sy = Math.floor(((y + (j + 0.5) / k) * srcSize) / size);
      const o = (sy * srcSize + sx) * 4;
      const a = src[o + 3];
      acc[0] += src[o] * a; acc[1] += src[o + 1] * a; acc[2] += src[o + 2] * a; acc[3] += a;
    }
    const o = (y * size + x) * 4;
    if (acc[3]) { out[o] = acc[0] / acc[3]; out[o + 1] = acc[1] / acc[3]; out[o + 2] = acc[2] / acc[3]; }
    out[o + 3] = acc[3] / (k * k);
  }
  return out;
}

// ---- 최소 PNG 인코더 (RGBA 8비트, 필터 없음) ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 파비콘용 SVG (같은 색 가로 연속 칸은 rect 하나로 합침)
function toSvg(grid) {
  const rects = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const ch = grid[y][x];
      let end = x + 1;
      while (end < N && grid[y][end] === ch) end++;
      if (PAL[ch]) rects.push(`  <rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PAL[ch]}"/>`);
      x = end;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">\n${rects.join("\n")}\n</svg>\n`;
}

function grid(no) {
  const make = CANDIDATES[no];
  if (!make) throw new Error(`후보 번호는 ${Object.keys(CANDIDATES).join(", ")} 중 하나: ${no}`);
  const g = toStrings(make());
  for (const r of g) for (const ch of r) if (!(ch in PAL)) throw new Error(`팔레트에 없는 글자: ${ch}`);
  return g;
}

// ---- 비교 시트: 후보마다 한 줄 [번호 | 256 | 어두운 바탕 180·64·32·16 | 밝은 바탕 64·32·16] ----
const DIGITS = { 1: ["010", "110", "010", "010", "111"], 2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"], 4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"], 6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"], a: ["000", "110", "011", "101", "111"], b: ["100", "100", "111", "101", "111"] };
function makeSheet(nos) {
  const PAD = 24, ROW = 256 + PAD, W = 960, H = PAD + nos.length * ROW;
  const sheet = Buffer.alloc(W * H * 4);
  const fill = (x, y, w, h, [r, g, b]) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const o = (j * W + i) * 4; sheet[o] = r; sheet[o + 1] = g; sheet[o + 2] = b; sheet[o + 3] = 255; } };
  const blit = (src, size, x, y) => { for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const s = (j * size + i) * 4, a = src[s + 3] / 255, o = ((y + j) * W + x + i) * 4; for (let c = 0; c < 3; c++) sheet[o + c] = src[s + c] * a + sheet[o + c] * (1 - a); } };
  fill(0, 0, W, H, [52, 52, 56]);
  nos.forEach((no, idx) => {
    const top = PAD + idx * ROW;
    const label = String(no), u = label.length > 1 ? 8 : 12; // 두 글자(7a)면 글자를 작게
    [...label].forEach((chr, ci) => DIGITS[chr].forEach((row, j) => [...row].forEach((bit, i) => bit === "1" && fill(PAD - 8 + ci * 4 * u + i * u, top + 98 + j * u, u, u, [236, 224, 189]))));
    const big = render(grid(no), 512, 16, { roundCorners: true });
    let x = 90;
    blit(downscale(big, 512, 256), 256, x, top); x += 256 + PAD;
    fill(x - 8, top, 180 + 64 + 32 + 16 + 3 * PAD + 16, 256, [24, 24, 26]); // 어두운 작업 표시줄 느낌
    for (const s of [180, 64, 32, 16]) { blit(downscale(big, 512, s), s, x, top + 128 - s / 2); x += s + PAD; }
    x += 16;
    fill(x - 8, top, 64 + 32 + 16 + 2 * PAD + 16, 256, [236, 236, 238]); // 밝은 바탕
    for (const s of [64, 32, 16]) { blit(downscale(big, 512, s), s, x, top + 128 - s / 2); x += s + PAD; }
  });
  return encodePng(W, H, sheet);
}

const args = process.argv.slice(2);
if (args[0] === "--sheet") {
  const dir = resolve(args[1] ?? ".");
  mkdirSync(dir, { recursive: true });
  const nos = args[2] ? args[2].split(",") : Object.keys(CANDIDATES); // 예: 7a,7b
  for (const no of nos) writeFileSync(join(dir, `candidate-${no}-512.png`), encodePng(512, 512, render(grid(no), 512, 16, { roundCorners: true })));
  writeFileSync(join(dir, args[3] ?? "sheet.png"), makeSheet(nos));
  console.log("후보·비교 시트 만듦:", dir);
} else {
  const no = args[0] ?? "1";
  const g = grid(no);
  const out = [
    // 일반 아이콘: 그림이 꽉 차게, 모서리만 계단식으로 깎음
    ["public/icons/icon-192.png", encodePng(192, 192, render(g, 192, 6, { roundCorners: true }))],
    ["public/icons/icon-512.png", encodePng(512, 512, render(g, 512, 16, { roundCorners: true }))],
    // maskable: 안드로이드가 원·둥근 사각형으로 잘라도 그림이 남도록 가운데 75%(384px)에 그림, 바깥은 가장자리 색을 늘려 채움
    ["public/icons/icon-maskable-512.png", encodePng(512, 512, render(g, 512, 12))],
    // iOS 홈 화면: 투명 불가 → 꽉 채움 (5배 = 160px, 남는 10px은 가장자리 색으로)
    ["app/apple-icon.png", encodePng(180, 180, render(g, 180, 5))],
    ["app/icon.svg", Buffer.from(toSvg(g))],
  ];
  for (const [rel, data] of out) {
    writeFileSync(join(ROOT, rel), data);
    console.log(`후보 ${no} →`, rel, `${data.length} bytes`);
  }
}

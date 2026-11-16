// 11/16 미니맵 장소 그림 (사용자: "미니맵에 글씨는 빼고 작은 도트 그림으로만"). 마을·바닷가 미니맵이 함께 써요.
// 그림은 문자 격자로 적어요: "#" = 장소 색, "o" = 덧칠 색, "." = 빈칸. 가운데가 장소 좌표예요 (미니맵 1칸 = 1px).
// UI(components/overlay/Minimap)가 칸마다 검은 테(3×3) → 색(1×1) 순서로 찍어서 어두운 바탕에서도 또렷해요.

export type MapIcon = {
  /** 장소 색 · 덧칠 색 */
  color: string;
  accent: string;
  /** [dx, dy, 덧칠이면 true] */
  px: readonly (readonly [number, number, boolean])[];
};

function icon(color: string, accent: string, rows: readonly string[]): MapIcon {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const ox = Math.floor(w / 2);
  const oy = Math.floor(h / 2);
  const px: [number, number, boolean][] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => (c === "#" || c === "o") && px.push([x - ox, y - oy, c === "o"])));
  return { color, accent, px };
}

/** 장소 종류 → 그림 */
export const MAP_ICONS: Readonly<Record<string, MapIcon>> = {
  // ── 마을 ──
  /** 유령 잡화점: 줄무늬 차양 + 진열창 */
  shop: icon("#c8a0ff", "#fff4d8", ["#o#o#", "#####", "#o#o#", "#####"]),
  /** 분양 사무소: 세모 지붕 집 + 문 */
  housing: icon("#9ad0ff", "#ffe08a", ["..#..", ".###.", "#####", ".#o#.", ".#o#."]),
  /** 사냥터: 엇갈린 칼 */
  hunt: icon("#ff6a5a", "#ffe0d0", ["o...o", ".#.#.", "..#..", ".#.#.", "#...#"]),
  /** 야근 빌딩: 키 큰 건물 + 불 켜진 창 */
  tower: icon("#ffb43c", "#fff6a0", [".###.", ".#o#.", ".###.", ".#o#.", ".###.", ".#o#."]),
  /** 캠핑장행 정류장: 버스 위에 뾰족한 나무 */
  busCamp: icon("#8ee0a0", "#3e9a5a", ["..o..", ".ooo.", "#####", "#.#.#", "#####", ".#.#."]),
  /** 바닷가행 정류장: 버스 아래 물결 */
  busSea: icon("#6fd0ff", "#e8fbff", ["#####", "#.#.#", "#####", ".#.#.", "o.o.o", ".o.o."]),
  /** 나루터 조각배: 노 둘 + 배 */
  dock: icon("#e0b07a", "#fff0d0", ["o...o", ".o.o.", "#####", ".###."]),
  /** 오리배 선착장: 왼쪽을 보는 노란 오리 */
  duck: icon("#ffe060", "#ff9a3a", [".##..", "o##..", ".####", "#####", ".###."]),
  /** 11/16 망원경 (마을 곳곳·캠핑장·바닷가 — 별자리 잇기): 하늘을 보는 경통 + 삼각대 */
  telescope: icon("#fff2a0", "#9ad0f0", ["...#o", "..##.", ".##..", ".#.#.", "#...#"]),
  // ── 바닷가 ──
  /** 바닷가 정류장: 버스 */
  bus: icon("#ffe07a", "#fffbe8", ["#####", "#o#o#", "#####", ".#.#."]),
  /** 포구 부동산: 복숭아 지붕 집 */
  // 11/16 r16 바닷가 부동산 = 마을 분양 사무소와 같은 그림
  realty: icon("#9ad0ff", "#ffe08a", ["..#..", ".###.", "#####", ".#o#.", ".#o#."]),
  /** 매점: 아이스크림 */
  kiosk: icon("#f8a8c8", "#f0c88a", [".#.", "###", ".o.", ".o."]),
  /** 선착장: 물로 뻗은 판자 길 */
  pier: icon("#f0d0a0", "#a07a58", ["o#o", ".#.", ".#.", ".#.", "###"]),
  /** 방파제 등대: 빨간 띠 등대 + 불빛 */
  lighthouse: icon("#ffffff", "#ff6a6a", [".o.", "###", ".#.", ".o.", ".#.", "###"]),
  /** 11/16 r12 걸터앉는 자리 (선착장 끝·방파제 끝): 등받이 없는 의자 + 방석 */
  seat: icon("#f8c8a0", "#ff8a7a", ["ooo", "###", "#.#"]),
  /** 11/16 r12 해변 모닥불: 불꽃 + 장작 */
  bonfire: icon("#ffb050", "#fff0a0", [".#.", "#o#", "###", "o.o"]),
};

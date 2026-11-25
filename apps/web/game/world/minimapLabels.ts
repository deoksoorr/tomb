import type { MapId } from "@tomb/protocol";

// 11/25 운영자 「길치 이슈」: 지도에 장소 이름표 (순수 계산 — DOM 없이 테스트해요).
// 어떤 장소에 무슨 이름을 붙일지(MAP_LABELS)와, 지도 크기에 맞춰 이름표끼리 겹치지 않게 자리를 고르는 일(placeLabels).
// 그림·사람 점은 components/overlay/Minimap이 캔버스에 그리고, 이름표는 그 위에 글자로 얹어요.
// 골목 붕어빵 수레는 비밀이라 여기에 넣지 않아요 (장소 목록에도 없어요).

/** 이름표 갈래: 다른 맵으로 가는 정류장 · 상점·상인 · 가 볼 곳 */
export type LabelGroup = "bus" | "shop" | "place";
/** 이름표 하나: 글자 · 갈래 · 앞 순위(작을수록 먼저 자리를 잡아요) */
export type MapLabel = { text: string; group: LabelGroup; pri: number };

export const LABEL_GROUP_NAME: Record<LabelGroup, string> = { bus: "다른 맵으로", shop: "상점·상인", place: "가 볼 곳" };

/** 맵마다 이름표를 붙이는 장소 (키 = 그 맵 미니맵 주요 장소 id). 없는 장소는 그림만 */
export const MAP_LABELS: Record<MapId, Readonly<Record<string, MapLabel>>> = {
  village: {
    busCamp: { text: "캠핑장행", group: "bus", pri: 0 },
    busSea: { text: "바닷가행", group: "bus", pri: 0 },
    shop: { text: "유령 잡화점", group: "shop", pri: 1 },
    board: { text: "의뢰 게시판", group: "place", pri: 1 },
    hunt: { text: "사냥터", group: "place", pri: 1 },
    housing: { text: "분양 사무소", group: "place", pri: 1 },
    tower: { text: "야근 빌딩", group: "place", pri: 2 },
    fishmonger: { text: "어부 영감", group: "shop", pri: 2 },
    collector: { text: "수집가 유령", group: "shop", pri: 2 },
    season: { text: "계절 보따리상", group: "shop", pri: 2 },
    furnStall: { text: "가구 보따리상", group: "shop", pri: 2 },
    mungnyang: { text: "분양사 보리", group: "shop", pri: 2 },
    office: { text: "총무팀 문대리", group: "shop", pri: 3 },
    zoo: { text: "동물원", group: "place", pri: 3 },
    fire: { text: "큰 모닥불", group: "place", pri: 3 },
    fish: { text: "낚시 잔교", group: "place", pri: 4 },
    dock: { text: "나루터", group: "place", pri: 4 },
    duck: { text: "오리배", group: "place", pri: 4 },
    ferris: { text: "관람차", group: "place", pri: 4 },
    haunt: { text: "귀신의집", group: "place", pri: 4 },
    wish: { text: "소원 분수", group: "place", pri: 4 },
    lighthouse: { text: "판교의 등대", group: "place", pri: 4 },
    balloon: { text: "열기구", group: "place", pri: 5 },
    bumper: { text: "범퍼카장", group: "place", pri: 5 },
    shrine: { text: "옛 묘역 입구", group: "place", pri: 5 },
  },
  camp: {
    bus: { text: "마을행", group: "bus", pri: 0 },
    office: { text: "관리소·매점", group: "shop", pri: 1 },
    bbq: { text: "바베큐장", group: "shop", pri: 1 },
    board: { text: "의뢰판", group: "place", pri: 1 },
    vending: { text: "음료 자판기", group: "shop", pri: 2 },
    fire: { text: "캠프파이어", group: "place", pri: 2 },
    lookout: { text: "전망대", group: "place", pri: 3 },
    vans: { text: "캠핑카", group: "place", pri: 3 },
    stream: { text: "계곡", group: "place", pri: 3 },
    tarp: { text: "큰 타프", group: "place", pri: 4 },
  },
  sea: {
    bus: { text: "마을행", group: "bus", pri: 0 },
    seaBuyer: { text: "해녀 할망", group: "shop", pri: 1 },
    realty: { text: "포구 부동산", group: "shop", pri: 1 },
    // 음료 자판기는 매점 바로 옆이라 이름표 하나로 (따로 달면 서로 바뀌어 보여요)
    kiosk: { text: "매점·자판기", group: "shop", pri: 1 },
    snackVend: { text: "과자 자판기", group: "shop", pri: 3 },
    cottages: { text: "별장", group: "place", pri: 2 },
    pier: { text: "선착장", group: "place", pri: 2 },
    lighthouse: { text: "방파제 등대", group: "place", pri: 2 },
    bonfire: { text: "모닥불", group: "place", pri: 3 },
    rocks: { text: "갯바위", group: "place", pri: 4 },
  },
};

export type Rect = { x: number; y: number; w: number; h: number };
/** 자리를 고를 이름표: 장소 점(x, y — 화면 px) · 이름표 크기 · 장소 그림 반폭(g) · 앞 순위 */
/** hard = 그 그림은 어떤 이름표도 덮지 않는다 (다른 맵으로 가는 정류장) */
export type LabelItem = { id: string; x: number; y: number; w: number; h: number; g: number; pri: number; hard?: boolean };
/** 고른 자리 (이름표 왼쪽 위, 화면 px) */
export type PlacedLabel = { id: string; left: number; top: number };

const hit = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** 대충 글자 폭 (픽셀 글꼴 갈무리: 한글 1em, 나머지 0.6em) — 캔버스로 잴 수 없을 때 */
export function estimateTextWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[ㄱ-힣]/.test(ch) ? size : ch === " " ? size * 0.5 : size * 0.6;
  return Math.ceil(w);
}

/**
 * 이름표 자리 고르기: 앞 순위부터 장소 점의 위·아래·오른쪽·왼쪽·대각선 가운데 지도 안이고 먼저 놓인 이름표·막힌 칸(obstacles)·
 * 다른 장소 그림(이름표 없는 그림 softIcons 포함)과 안 겹치는 첫 자리. 그런 자리가 없으면 이름표 없는 그림(망원경 등)부터,
 * 그래도 없으면 다른 장소 그림까지 덮는 자리 (정류장 그림은 끝까지 안 덮어요). 이름표끼리 겹치면 그 이름표는 빼요.
 */
export function placeLabels(items: readonly LabelItem[], W: number, H: number, obstacles: readonly Rect[] = [], pad = 2, softIcons: readonly Rect[] = []): PlacedLabel[] {
  const sorted = [...items].sort((a, b) => a.pri - b.pri);
  const icons = [...items.map((it) => ({ id: it.id, hard: !!it.hard, r: { x: it.x - it.g, y: it.y - it.g, w: it.g * 2, h: it.g * 2 } })), ...softIcons.map((r) => ({ id: "", hard: false, r }))];
  const placed: Rect[] = [...obstacles];
  const out: PlacedLabel[] = [];
  for (const it of sorted) {
    const { x, y, w, h, g } = it;
    const clampX = (l: number) => Math.max(1, Math.min(W - w - 1, l));
    const cands: [number, number][] = [
      [clampX(x - w / 2), y - g - h - 1],
      [clampX(x - w / 2), y + g + 1],
      [x + g + 2, y - h / 2],
      [x - g - 2 - w, y - h / 2],
      [x + g, y - g - h],
      [x - g - w, y - g - h],
      [x + g, y + g],
      [x - g - w, y + g],
      // 붐비는 곳: 한 칸 더 떨어진 자리 (그림을 덮느니 조금 멀리)
      [x + g + 2, y - h * 1.5 - 1],
      [x + g + 2, y + h * 0.5 + 1],
      [x - g - 2 - w, y - h * 1.5 - 1],
      [x - g - 2 - w, y + h * 0.5 + 1],
    ];
    // 피하는 그림: 2 = 모든 그림, 1 = 이름표 있는 장소 그림만 (망원경 같은 건 덮어도), 0 = 정류장만
    const avoids = (ic: (typeof icons)[number], level: number) => ic.hard || (level === 2 ? true : level === 1 ? ic.id !== "" : false);
    const fits = (r: Rect, level: number) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H && !placed.some((p) => hit(p, r, pad)) && !icons.some((ic) => ic.id !== it.id && avoids(ic, level) && hit(ic.r, r, 0));
    let got: Rect | null = null;
    for (const level of [2, 1, 0]) {
      for (const [l, t] of cands) {
        const r = { x: Math.round(l), y: Math.round(t), w, h };
        if (fits(r, level)) {
          got = r;
          break;
        }
      }
      if (got) break;
    }
    if (!got) continue;
    placed.push(got);
    out.push({ id: it.id, left: got.x, top: got.y });
  }
  return out;
}

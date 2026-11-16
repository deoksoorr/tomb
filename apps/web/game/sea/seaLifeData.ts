import {
  AVATAR_COLORS,
  DIR,
  onSeaDeck,
  SEA_DECKS,
  SEA_FLAT_Y0,
  seaWet,
  tideLevel,
  nextTideOpenAt,
  SEA_BONFIRE,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_GULL_PERCHES,
  SEA_KAYAK_DOCK,
  SEA_KIOSK,
  SEA_PIER,
  SEA_PIER_END,
  tideLineY,
  tideOpen,
  type DirId,
} from "@tomb/protocol";
import { ambienceAt, type AmbienceOverride } from "@/lib/ambience";
import { folkGrid, type FolkCtx, type FolkDef, type FolkPlan, type FolkSpot, type FolkWorld } from "../world/life/folkSim";
import { seaStandable, seaWalkGrid } from "./seaLayout";
import { tideNow } from "./tideClock";

// 11/16 달물결 포구 주민 (돌아다니는 유령들) — 순수 데이터 (Phaser 없음 → seaLife.test). 움직임은 world/life/folkSim, 그리기·말 걸기는 seaLife.
// 사람마다 하루 일과가 있다: 물때(갯벌이 열렸나·물이 얼마나 찼나)·한국 시각·날씨(비 오면 사람이 줄어든다)를 보고 할 일을 고른다.
// 대사는 짧게, 사람마다 말투가 다르다 (해녀 할망·조개 할매는 반말, 장수·구조요원은 해요체 섞어서). 안내는 진짜 있는 기능만.

const [BONE, MOSS, MIST, OCHRE, LAVENDER, CANDLE] = AVATAR_COLORS;
const KST = 9 * 3_600_000;

/** 몇 시 몇 분 (말로 하듯이: "3시 반", "11시 10분") */
export function sayClock(ms: number): string {
  const d = new Date(ms + KST);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 5 ? "새벽 " : h < 12 ? "오전 " : "오후 ";
  return `${ap}${hh}시${m === 0 ? "" : m === 30 ? " 반" : ` ${m}분`}`;
}

/** 다음 갯벌 열리는 때까지 남은 말 ("40분 뒤", "1시간 10분 뒤") */
function untilText(now: number): string {
  const min = Math.max(1, Math.round((nextTideOpenAt(now) - now) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ""} 뒤` : `${m}분 뒤`;
}

const sp = (x: number, y: number, face?: DirId): FolkSpot => (face === undefined ? { x, y } : { x, y, face });
const many = (pts: readonly [number, number][], face?: DirId) => pts.map(([x, y]) => sp(x, y, face));

/** 물이 아무리 차도 마른 백사장 끝 (만조 물가보다 위) */
const BEACH_EDGE_Y = 500;
/** 사람이 떠나는 곳 (산책로 양 끝 · 정류장) */
const EXIT_W = sp(30, 330);
const EXIT_E = sp(1730, 330);
const EXIT_BUS = sp(1560, 124);

/** (x, y)가 그 물 높이에서 물에서 margin 넘게 떨어진 마른 땅인지 */
export function dryAt(y: number, tide: number, margin = 14): boolean {
  return y < tideLineY(tide) - margin;
}

/** 물가 따라 뛰어노는 자리 (지금 물 높이의 물가 조금 위 — 강아지). 막힌 곳·좁은 곳은 뺀다 */
export function shoreSpots(tide: number): FolkSpot[] {
  const y = Math.round(tideLineY(tide) - 22);
  const out: FolkSpot[] = [];
  for (let x = 500; x <= 1320; x += 52) {
    if (x > SEA_PIER.x - 40 && x < SEA_PIER.x + SEA_PIER.w + 40) continue;
    if (x > SEA_KAYAK_DOCK.x - 30 && x < SEA_KAYAK_DOCK.x + SEA_KAYAK_DOCK.w + 30) continue; // 카약 선착장 다리
    if (roomy(x, y, 20, 8)) out.push(sp(x, y));
  }
  return out;
}

/** 둘레 rx·ry 안이 모두 설 수 있는 땅인지 (뛰어노는 자리) */
export function roomy(x: number, y: number, rx: number, ry: number): boolean {
  for (const [dx, dy] of [[0, 0], [-rx, 0], [rx, 0], [0, -ry], [0, ry], [-rx, -ry], [rx, -ry], [-rx, ry], [rx, ry]]) if (!seaStandable(x + dx, y + dy)) return false;
  return true;
}

const rainy = (c: FolkCtx) => c.weather === "rain" || c.weather === "snow";
const night = (c: FolkCtx) => c.phase === "night";
const keep = (plans: FolkPlan[]) => plans.filter((p) => p.w > 0 && p.spots.length > 0);

// ── 자리 ──
/** 해녀 물질 자리 (간조에도 늘 물 — 선착장·카약 선착장·방파제에서 떨어진 바다) */
const DIVE = many([
  [500, 690],
  [1000, 700],
  [1180, 684],
  [1292, 690],
  [430, 716],
  [1240, 720],
]);
/** 바위 곁·백사장 끝에 앉아 쉬는 자리 (바다를 본다) */
const ROCK_REST = many(
  [
    [236, 492],
    [124, 486],
    [1500, 494],
    [1700, 492],
  ],
  DIR.down,
);
/** 갯벌 캐는 자리 (사람 갯벌 구멍 옆, 간조에만 — 물가보다 훨씬 위) */
const DIG = many([
  [524, 548],
  [598, 560],
  [712, 540],
  [944, 532],
  [1138, 548],
  [1240, 560],
  [760, 556],
]);
/** 물 빠지기 기다리며 서 있는 백사장 끝 */
const WAIT_EDGE = many(
  [
    [600, BEACH_EDGE_Y],
    [740, BEACH_EDGE_Y],
    [1180, BEACH_EDGE_Y],
  ],
  DIR.down,
);
/** 산책로 (걷다 서서 두리번) */
const BOARDWALK = many([
  [140, 330],
  [380, 330],
  [560, 330],
  [720, 330],
  [1000, 330],
  [1200, 330],
  [1380, 330],
  [1580, 330],
]);
/** 매점 둘레 (장수가 서 있는 곳) */
const KIOSK = [sp(SEA_KIOSK.x - 44, SEA_KIOSK.y + 26, DIR.down), sp(SEA_KIOSK.x + 66, SEA_KIOSK.y + 22, DIR.down), sp(SEA_KIOSK.x - 70, SEA_KIOSK.y - 4, DIR.right)];
/** 백사장 사잇길 (선베드 줄 앞뒤) */
const BEACH_WALK = many([
  [700, 470],
  [760, 500],
  [904, 500],
  [1330, 470],
  [1090, 504],
  [460, 500],
  [1470, 470],
]);
/** 구조요원 망보는 자리 (백사장 끝, 바다를 본다) */
const WATCH = many(
  [
    [1090, BEACH_EDGE_Y],
    [748, BEACH_EDGE_Y],
  ],
  DIR.down,
);
/** 사진 자리: 방파제 위 · 방파제 끝에서 등대를 보고 · 선착장 · 선착장 끝 (짝은 오른쪽 옆) */
const PHOTO_BREAKWATER = [sp(SEA_BREAKWATER.x + 14, 556, DIR.down), sp(SEA_BREAKWATER_TIP.x + 12, SEA_BREAKWATER_TIP.y + 78, DIR.up)];
const PHOTO_PIER = [sp(SEA_PIER.x + 12, 640, DIR.down), sp(SEA_PIER_END.x + 30, SEA_PIER_END.y + 30, DIR.down)];
const BONFIRE_SIDE = [sp(SEA_BONFIRE.x - 46, SEA_BONFIRE.y + 30, DIR.right), sp(SEA_BONFIRE.x + 40, SEA_BONFIRE.y + 34, DIR.left)];
/** 강아지 낮잠 자리 (매점 그늘 · 해먹 옆 · 모닥불 곁) */
const DOG_NAP = many([
  [SEA_KIOSK.x - 66, SEA_KIOSK.y + 34],
  [336, 424],
  [SEA_BONFIRE.x - 30, SEA_BONFIRE.y + 34],
]);
/** 갈매기 앉는 곳 앞 (뛰어가면 갈매기가 날아오른다) — 물이 덮으면 뺀다 */
const GULL_RUN = SEA_GULL_PERCHES.map((g) => sp(g.x + (g.x < SEA_PIER.x + 20 || (g.x > SEA_BREAKWATER.x && g.x < SEA_BREAKWATER.x + 20) ? -18 : 18), g.y + 6));
/** 밤 산책: 방파제 (달 보기) · 등대 앞 · 선착장 끝 · 모닥불 곁 · 산책로 가로등 */
const NIGHT_GAZE = [sp(SEA_BREAKWATER.x + 24, 520, DIR.up), sp(SEA_PIER_END.x + 70, SEA_PIER_END.y + 30, DIR.up)];
const LIGHTHOUSE = [sp(SEA_BREAKWATER_TIP.x + 20, SEA_BREAKWATER_TIP.y + 20, DIR.right)];

// ── 주민 ──

export const SEA_FOLK: readonly FolkDef[] = [
  {
    id: "haenyeo",
    name: "숨비 할망",
    kind: "ghost",
    body: "round",
    color: MIST,
    look: [],
    prop: "tewak",
    legMs: 46_000,
    speed: 24,
    swimmer: true,
    plans: (c) =>
      keep([
        // 물이 차 있을 때 물질 (간조엔 먼바다 쪽에서만 조금)
        { act: "dive", spots: DIVE, w: night(c) ? 0 : c.tide > 0.45 ? 7 : 2 },
        { act: "sit", spots: ROCK_REST, w: night(c) ? 1 : c.tide > 0.45 ? 1.5 : 4 },
        { act: "look", spots: WAIT_EDGE, w: c.open ? 1 : 0.5 },
        { act: "away", spots: [EXIT_W], w: night(c) ? 8 : rainy(c) ? 1.5 : 0.2 },
      ]),
    lines: [
      { t: "숨 참는 건 아직 내가 제일 길어" },
      { t: "휘이~ 그거 내 숨비소리야. 놀랐지?" },
      { t: "주황 공은 테왁이야. 물에서 내 베개지" },
      { t: "바다는 욕심내면 안 돼. 숨만큼만 따는 거야" },
      { t: (now) => `물 빠지는 건 ${sayClock(nextTideOpenAt(now))}쯤이야` },
      { t: "물 들어오면 다시 들어가 볼까", when: "low" },
      { t: "물 찰 때가 물질하기 딱 좋아", when: "high" },
      { t: "비 오는 날 바다는 더 짜. 진짜야", when: "rain" },
      { t: "노을 질 때 물 위에 누워 있으면 좋아", when: "dusk" },
    ],
  },
  {
    id: "clamgran",
    name: "조개 할매",
    kind: "ghost",
    body: "bun",
    color: OCHRE,
    look: ["hat_straw"],
    prop: "hoe",
    legMs: 40_000,
    speed: 22,
    plans: (c) =>
      keep([
        { act: "dig", spots: DIG, w: c.open && !night(c) ? 9 : 0 },
        // 물 빠지기 기다리기 (물이 낮아지는 중이면)
        { act: "stand", spots: WAIT_EDGE, w: !c.open && c.tide < 0.7 && !night(c) ? 4 : 0.5 },
        { act: "look", spots: BOARDWALK, w: 1.5 },
        { act: "sit", spots: many([[340, 416]], DIR.down), w: c.open ? 0.3 : 1.5 },
        { act: "away", spots: [EXIT_W], w: night(c) ? 9 : rainy(c) ? 4 : 0.3 },
      ]),
    lines: [
      { t: "바지락은 숨구멍 보고 캐는 거여" },
      { t: "호미 끝으로 살살 긁어. 세게 하면 깨져" },
      { t: (now) => `다음 물때? ${untilText(now)}면 갯벌 열려` },
      { t: (now) => `${sayClock(nextTideOpenAt(now))} 되면 물 빠진다. 바구니 챙겨 와` },
      { t: "갯벌 구멍 앞에서 E 누르면 같이 캘 수 있어" },
      { t: "지금이여, 얼른 내려와 캐", when: "low" },
      { t: "물 찼다. 이따 와, 이따", when: "high" },
      { t: "비 오는 날엔 허리가 쑤셔서 쉬어야 혀", when: "rain" },
    ],
  },
  {
    id: "icecream",
    name: "얼음 총각",
    kind: "ghost",
    body: "box",
    color: BONE,
    look: [],
    prop: "icebox",
    legMs: 36_000,
    speed: 30,
    plans: (c) =>
      keep([
        { act: "look", spots: BOARDWALK, w: c.phase === "day" ? 4 : 1 },
        { act: "stand", spots: KIOSK, w: night(c) ? 0.3 : 3 },
        { act: "look", spots: BEACH_WALK, w: c.phase === "day" && !rainy(c) ? 3 : 0 },
        { act: "away", spots: [EXIT_E], w: night(c) ? 9 : rainy(c) ? 5 : 0.2 },
      ]),
    lines: [
      { t: "아이스크림 사려~ 아, 오늘 다 팔렸어요" },
      { t: "대신 매점에 빙수 있어요. 먹으면 발이 빨라져요" },
      { t: "이 통 안은 얼음뿐이에요. 제가 녹을까 봐" },
      { t: "자판기 슬러시도 머리가 띵해요. 추천!" },
      { t: "매점에서 E 누르면 메뉴 나와요" },
      { t: "햇볕 쨍한 날이 대목인데 말이죠", when: "day" },
      { t: "비 오니까 아무도 안 사요… 저도 안 사요", when: "rain" },
      { t: "해 지면 저도 퇴근해요. 얼음 녹기 전에", when: "dusk" },
    ],
  },
  {
    id: "lifeguard",
    name: "호루기",
    kind: "ghost",
    body: "tall",
    color: CANDLE,
    look: [],
    prop: "rescue",
    legMs: 42_000,
    speed: 30,
    plans: (c) => {
      const duty = c.hour >= 8 && c.hour < 19;
      return keep([
        { act: "watch", spots: WATCH, w: duty ? (rainy(c) ? 3 : 6) : 0 },
        { act: "look", spots: BEACH_WALK, w: duty && !rainy(c) ? 2 : 0 },
        { act: "look", spots: BOARDWALK, w: duty ? 0.6 : 1 },
        { act: "away", spots: [EXIT_BUS], w: duty ? 0.1 : 9 },
      ]);
    },
    lines: [
      { t: "큰 파도 오면 호루라기 불 거예요. 삐익!" },
      { t: "헤엄은 좋은데 너무 멀리는 가지 마요" },
      { t: "물속에서 E 누르면 잠수해요. 숨 조심!" },
      { t: "튜브는 물에서 가까이 가서 E로 타요" },
      { t: "카약은 둘이 타요. 하나가 노 저어요" },
      { t: "안개 끼면 등대가 알아서 불을 켜요", when: "fog" },
      { t: "비 오는 날은 물에 안 들어가는 게 좋아요", when: "rain" },
      { t: "물 빠졌다고 너무 멀리 나가면 안 돼요", when: "low" },
    ],
  },
  {
    id: "tourA",
    name: "하루",
    kind: "ghost",
    body: "bun",
    color: LAVENDER,
    look: ["hat_flower"],
    prop: "camera",
    legMs: 38_000,
    speed: 28,
    plans: (c) => touristPlans(c),
    lines: [
      { t: "여기 사진 한 장만 찍어 줄래요? 아 농담!" },
      { t: "등대 꼭대기 올라가 봤어요? 바다가 다 보여요" },
      { t: "방파제 끝에서 등대 찍으면 엽서 같아요" },
      { t: "우리 1박 2일로 왔어요. 이름도 하루랑 이틀" },
      { t: "카약 같이 타자고 했는데 이틀이가 무섭대요" },
      { t: "노을 사진은 선착장 끝이 최고예요", when: "dusk" },
      { t: "비 와서 사진이 다 뿌예요… 그래도 좋아", when: "rain" },
    ],
  },
  {
    id: "tourB",
    name: "이틀",
    kind: "ghost",
    body: "hood",
    color: MOSS,
    look: [],
    legMs: 38_000,
    speed: 28,
    plans: (c) => touristPlans(c),
    lines: [
      { t: "하루가 사진만 백 장째 찍고 있어요" },
      { t: "카약은… 물이 너무 파래서 무서워요" },
      { t: "매점 오징어구이 먹으면 키가 커져요. 잠깐" },
      { t: "모닥불은 해 질 때 켜져요. 거기 앉아 봐요" },
      { t: "물 빠지면 갯벌로 걸어 나갈 수 있대요" },
      { t: "밤바다 소리 들으려고 온 거예요, 사실", when: "night" },
      { t: "물 빠진 갯벌, 발이 푹푹 빠져요", when: "low" },
    ],
  },
  {
    id: "beachdog",
    name: "모래",
    kind: "dog",
    variant: 0,
    legMs: 20_000,
    speed: 44,
    plans: (c) =>
      keep([
        { act: "play", spots: shoreSpots(c.tide), w: rainy(c) ? 0.5 : night(c) ? 0.5 : 5, run: true },
        { act: "stand", spots: GULL_RUN.filter((g) => dryAt(g.y, c.tide) && roomy(g.x, g.y, 6, 4)), w: rainy(c) || night(c) ? 0 : 2.5, run: true },
        { act: "nap", spots: DOG_NAP, w: night(c) ? 6 : rainy(c) ? 5 : 1.5 },
        { act: "look", spots: BEACH_WALK, w: 1.5 },
      ]),
    lines: [{ t: "멍!" }, { t: "왈왈!" }, { t: "킁킁…" }, { t: "헥헥, 파도다!", when: "high" }, { t: "낑…", when: "rain" }],
  },
  {
    id: "moonwalker",
    name: "달마중",
    kind: "ghost",
    body: "sheet",
    color: MIST,
    look: ["hand_lantern"],
    legMs: 50_000,
    speed: 22,
    plans: (c) => {
      const out = c.phase === "night" || (c.phase === "dusk" && c.hour >= 18.5) || (c.phase === "dawn" && c.hour < 5.5);
      return keep([
        { act: "gaze", spots: NIGHT_GAZE, w: out ? (c.weather === "clear" ? 4 : 1.5) : 0 },
        { act: "stand", spots: LIGHTHOUSE, w: out ? 2 : 0 },
        { act: "sit", spots: BONFIRE_SIDE, w: out ? 2.5 : 0 },
        { act: "look", spots: BOARDWALK.filter((p) => p.x > 900), w: out ? 1.5 : 0 },
        { act: "away", spots: [EXIT_E], w: out ? (rainy(c) ? 2 : 0.2) : 9 },
      ]);
    },
    lines: [
      { t: "등대 불빛이 한 바퀴 도는 거 세어 봤어요?" },
      { t: "밤에 등대 제일 먼저 켜면 오늘의 등대지기래요" },
      { t: "모닥불 앞에 앉으면 불멍 할 수 있어요" },
      { t: "물 위 달길 따라 걷고 싶은 밤이에요" },
      { t: (now) => `다음 물 빠지는 건 ${sayClock(nextTideOpenAt(now))}이에요` },
      { t: "토요일 밤엔 먼바다에 이상한 배가 보인대요", when: "night" },
      { t: "안개 낀 밤엔 무적 소리가 좋아요", when: "fog" },
      { t: "곧 해가 떠요. 저는 그만 들어갈게요", when: "dawn" },
    ],
  },
];

/** 여행 온 둘 (하루·이틀) — 같은 일과를 같이 한다 (seaLife가 짝을 맞춰 옆에 세운다) */
function touristPlans(c: FolkCtx): FolkPlan[] {
  const day = c.phase === "day" || c.phase === "dusk" || c.phase === "dawn";
  return keep([
    { act: "photo", spots: PHOTO_BREAKWATER, w: day ? 3 : 0 },
    { act: "photo", spots: PHOTO_PIER, w: day ? (c.phase === "dusk" ? 5 : 2) : 0 },
    { act: "look", spots: BOARDWALK, w: 2 },
    { act: "sit", spots: BONFIRE_SIDE, w: c.phase === "dusk" || c.phase === "night" ? 3 : 0.5 },
    { act: "away", spots: [EXIT_BUS], w: rainy(c) ? 5 : night(c) && c.hour >= 23 ? 8 : night(c) ? 1 : 0.15 },
  ]);
}

/** 짝 (뒤 사람 id → 앞 사람 id, 옆으로 비켜 서는 거리) */
export const SEA_FOLK_PAIRS: Readonly<Record<string, { lead: string; dx: number }>> = { tourB: { lead: "tourA", dx: 16 } };

// ── 바닷가 걷기 세상 (folkSim에 넘긴다) ──

/** 물속으로 치는 물가 여유 (발이 젖지 않게) */
const WET_MARGIN = 8;

/**
 * 주민 걷기 격자: 맵 걷기 격자(seaWalkGrid) + 데크 난간 (사람 deckGuard와 같은 규칙 — 갯벌 쪽 옆구리로는 데크를 오르내리지 않고 머리 쪽 백사장 줄에서만)
 */
export function seaFolkCells(): { cell: number; cols: number; rows: number; cells: Uint8Array } {
  const g = seaWalkGrid();
  const { cell, cols, rows, cells } = g;
  const inDeck = (x: number, y: number) => SEA_DECKS.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * cell + cell / 2;
      const y = cy * cell + cell / 2;
      if (y <= SEA_FLAT_Y0 + 4 || inDeck(x, y)) continue;
      if (SEA_DECKS.some((r) => x >= r.x - cell && x <= r.x + r.w + cell && y >= r.y - cell && y <= r.y + r.h + cell)) cells[cy * cols + cx] = 1;
    }
  return g;
}

let cellsCache: ReturnType<typeof seaFolkCells> | null = null;

/** 바닷가 주민 세상: 시각 → 상황(한국 시각·날씨·물때), 물. override = 주소 ?time·?weather 시험 값 (내 화면에서만) */
export function seaFolkWorld(override: AmbienceOverride = {}): FolkWorld {
  cellsCache ??= seaFolkCells();
  return {
    grid: folkGrid(cellsCache),
    ctx(t0, t1) {
      const a = ambienceAt(t0, override);
      const a0 = tideNow(t0);
      const a1 = tideNow(t1);
      return { hour: a.kstHour, phase: a.phase, weather: a.weather, tide: Math.max(tideLevel(a0), tideLevel(a1)), open: tideOpen(a0) && tideOpen(a1) };
    },
    wet: (x, y, c) => y > tideLineY(c.tide) - WET_MARGIN && !onSeaDeck(x, y),
    swimAt: (x, y, t) => seaWet(x, y, tideLevel(tideNow(t))),
  };
}

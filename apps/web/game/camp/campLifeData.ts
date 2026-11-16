import { AVATAR_COLORS, CAMP_FIRE, CAMP_LOOKOUT, CAMP_STREAM_HALF_W, CAMP_VAN_DOOR_DX, CAMP_VAN_GEAR, CAMP_VANS, campStreamX, DIR, type DirId } from "@tomb/protocol";
import { ambienceAt, type AmbienceOverride } from "@/lib/ambience";
import { folkGrid, type FolkCtx, type FolkDef, type FolkPlan, type FolkSpot, type FolkWorld } from "../world/life/folkSim";
import { campStandable, campWalkGrid } from "./campLayout";

// 11/16 언젠가 캠핑장 주민 (돌아다니는 유령들) — 순수 데이터 (Phaser 없음 → campLife.test). 움직임은 world/life/folkSim, 그리기는 campLife.
// 관리소의 언젠가 씨·매점 알바·계곡 할머니·별지기·기타 캠퍼(서 있는 NPC)는 그대로 두고, 그 사이를 오가는 캠퍼들을 더한다.
// 한국 시각·날씨를 보고 할 일을 고른다 (비 오면 캠핑카·텐트로 들어간다). 안내는 진짜 있는 기능만 (버스·바베큐·전망대·불멍·계곡 낚시).

const [BONE, MOSS, MIST, OCHRE, LAVENDER, CANDLE] = AVATAR_COLORS;

let cells: ReturnType<typeof campWalkGrid> | null = null;

const sp = (x: number, y: number, face?: DirId): FolkSpot => (face === undefined ? { x, y } : { x, y, face });
const many = (pts: readonly [number, number][], face?: DirId) => pts.map(([x, y]) => sp(x, y, face));
const keep = (plans: FolkPlan[]) => plans.filter((p) => p.w > 0 && p.spots.length > 0);
const rainy = (c: FolkCtx) => c.weather === "rain" || c.weather === "snow";
const night = (c: FolkCtx) => c.phase === "night";

/** 계곡 둑 (물 가운데에서 bank px, side -1 왼쪽 둑 → 물을 보며 오른쪽) */
function bank(y: number, side: -1 | 1, gap = 30): FolkSpot {
  return sp(Math.round(campStreamX(y) + side * gap), y, side < 0 ? DIR.right : DIR.left);
}
/** 캠핑카 문 앞 (집에 들어가는 자리) */
const vanDoor = (i: number) => sp(CAMP_VANS[i].x + CAMP_VAN_DOOR_DX, CAMP_VANS[i].y + 16);

// ── 자리 ──
/** 장작 패는 자리 (광장 서쪽 빈 풀밭) */
const CHOP = many([
  [494, 470],
  [742, 330],
]);
/** 모닥불 돌보기 (통나무 의자 안쪽, 불을 본다) */
const FIRE_TEND = [sp(CAMP_FIRE.x, CAMP_FIRE.y + 30, DIR.up), sp(CAMP_FIRE.x - 34, CAMP_FIRE.y + 14, DIR.right), sp(CAMP_FIRE.x + 34, CAMP_FIRE.y + 14, DIR.left)];
/** 캠핑카 화롯대 앞 (고기 굽기) */
const GRILL = CAMP_VAN_GEAR.filter((_, i) => i === 0).map((g) => sp(g.brazier.x, g.brazier.y + 14, DIR.up));
/** 캠핑카 마당 · 골목 (아이가 뛰노는 곳) */
const VAN_YARD_RAW = many([
  [200, 300],
  [250, 360],
  [300, 430],
  [244, 470],
  [260, 540],
  [280, 300],
  [320, 500],
]);
/** 둘레(좌우 rx·위아래 ry)가 모두 설 수 있는 땅인지 (뛰어노는 자리) */
function roomy(s: FolkSpot, rx = 20, ry = 8): boolean {
  cells ??= campWalkGrid();
  const g = cells;
  const open = (x: number, y: number) => {
    const cx = Math.floor(x / g.cell);
    const cy = Math.floor(y / g.cell);
    return cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows && g.cells[cy * g.cols + cx] === 0;
  };
  for (const [dx, dy] of [[0, 0], [-rx, 0], [rx, 0], [0, -ry], [0, ry], [-rx, -ry], [rx, -ry], [-rx, ry], [rx, ry]]) if (!open(s.x + dx, s.y + dy)) return false;
  return campStandable(s.x, s.y);
}
const VAN_YARD = VAN_YARD_RAW.filter((p) => roomy(p));
/** 숲 산책로 한 바퀴 (전망대 계단 · 통나무 다리 · 징검다리 둘레) */
const TRAIL = many([
  [1140, 500],
  [1166, 400],
  [1156, 300],
  [1176, 222],
  [1090, 286],
  [1094, 574],
  [866, 722],
]);
/** 전망대 위 (난간 쪽, 별지기·망원경 자리는 비켜서) */
const LOOKOUT_TOP = [sp(CAMP_LOOKOUT.x + 26, CAMP_LOOKOUT.y + 50, DIR.up), sp(CAMP_LOOKOUT.x + CAMP_LOOKOUT.w - 44, CAMP_LOOKOUT.y + 50, DIR.up)];
/** 할아버지 낚시 자리 (사람 낚시 자리·앉는 바위·할머니를 비켜서) */
const FISH = [bank(330, -1), bank(452, 1), bank(650, 1)];
/** 데크 사이 풀밭 (산책) */
const MEADOW = many([
  [470, 330],
  [780, 470],
  [520, 560],
  [760, 300],
  [420, 420],
]);
/** 큰 타프 아래 (비 피하기) */
const TARP = many(
  [
    [600, 676],
    [724, 676],
  ],
  DIR.down,
);
/** 고양이 낮잠 자리 (타프 아래 · 관리소 앞 · 모닥불 곁) */
const CAT_NAP = many([
  [596, 740],
  [CAMP_FIRE.x + 46, CAMP_FIRE.y + 40],
  [262, 690],
]);
const EXIT_BUS = sp(214, 640);

export const CAMP_FOLK: readonly FolkDef[] = [
  {
    id: "woodman",
    name: "장작 아재",
    kind: "ghost",
    body: "hood",
    color: OCHRE,
    look: ["hat_beanie"],
    prop: "axe",
    legMs: 44_000,
    speed: 24,
    plans: (c) =>
      keep([
        { act: "chop", spots: CHOP, w: c.phase === "day" && !rainy(c) ? 6 : c.phase === "dawn" ? 2 : 0 },
        { act: "stand", spots: FIRE_TEND, w: c.phase === "dusk" ? 7 : c.phase === "day" ? 1 : 2 },
        { act: "sit", spots: FIRE_TEND, w: night(c) && c.hour < 24 && c.hour >= 19 ? 5 : night(c) ? 1 : 0 },
        { act: "look", spots: MEADOW, w: 1 },
        { act: "away", spots: [vanDoor(0)], w: rainy(c) ? 4 : night(c) && (c.hour >= 1 && c.hour < 5) ? 9 : 0.2 },
      ]),
    lines: [
      { t: "장작은 결 따라 패야 잘 쪼개져" },
      { t: "불은 큰 나무보다 잔가지로 살려" },
      { t: "통나무 의자에 앉으면 불멍 할 수 있어" },
      { t: "캠핑 십오 년 차. 아직도 텐트 칠 땐 헤매" },
      { t: "해 지면 불 피울 거야. 그때 와" },
      { t: "불 지키는 중이야. 너도 좀 쬐다 가", when: "dusk" },
      { t: "비 오는 날 장작은 젖어서 안 돼", when: "rain" },
      { t: "새벽 공기 맡으면서 패는 게 최고지", when: "dawn" },
    ],
  },
  {
    id: "griller",
    name: "캠핑카 아빠",
    kind: "ghost",
    body: "round",
    color: MOSS,
    look: ["hat_chef"],
    prop: "tongs",
    legMs: 40_000,
    speed: 24,
    plans: (c) =>
      keep([
        { act: "grill", spots: GRILL, w: c.phase === "day" || c.phase === "dusk" ? (rainy(c) ? 1 : 6) : night(c) && c.hour < 22 && c.hour >= 19 ? 3 : 0 },
        { act: "look", spots: VAN_YARD, w: 2 },
        { act: "away", spots: [vanDoor(0)], w: rainy(c) ? 4 : night(c) && (c.hour >= 22 || c.hour < 6) ? 9 : 0.3 },
      ]),
    lines: [
      { t: "고기는 한 번만 뒤집는 거예요. 진짜로" },
      { t: "큰 타프 옆 바베큐장 삼겹살 먹으면 몸이 커져요" },
      { t: "번개 닭꼬치 먹으면 발이 엄청 빨라져요" },
      { t: "커진 동안엔 아무것도 못 타요. 조심!" },
      { t: "애가 마시멜로만 먹으려고 해서 큰일이에요" },
      { t: "콩아, 불 가까이 가지 마!" },
      { t: "비 오면 캠핑카 안에서 라면이죠", when: "rain" },
      { t: "저녁은 숯이 하얘질 때 올려야 맛있어요", when: "dusk" },
    ],
  },
  {
    id: "kid",
    name: "콩이",
    kind: "ghost",
    body: "bun",
    color: CANDLE,
    look: ["hat_sprout"],
    prop: "ball",
    legMs: 22_000,
    speed: 34,
    plans: (c) =>
      keep([
        { act: "play", spots: VAN_YARD, w: !rainy(c) && !night(c) ? 6 : 0, run: true },
        { act: "play", spots: MEADOW.filter((p) => roomy(p)), w: c.phase === "day" && !rainy(c) ? 2 : 0, run: true },
        { act: "sit", spots: [sp(CAMP_FIRE.x - 30, CAMP_FIRE.y + 34, DIR.up)], w: c.phase === "dusk" ? 3 : 0 },
        { act: "away", spots: [vanDoor(0)], w: rainy(c) ? 6 : night(c) && c.hour >= 21 ? 9 : night(c) ? 2 : 0.2 },
      ]),
    lines: [
      { t: "공 차기 할래? 나 진짜 잘해!" },
      { t: "아빠가 고기 또 태웠어, 히히" },
      { t: "전망대 망원경 보면 우리 캠핑카도 보여!" },
      { t: "마시멜로 꼬치 먹으면 키 커진대!" },
      { t: "고양이 도토리 봤어? 엄청 빨라" },
      { t: "불 앞에서는 뛰면 안 된대", when: "dusk" },
      { t: "비 와서 못 놀아… 심심해", when: "rain" },
    ],
  },
  {
    id: "hiker",
    name: "산악회 대장",
    kind: "ghost",
    body: "tall",
    color: MIST,
    look: ["hat_cap"],
    prop: "poles",
    legMs: 36_000,
    speed: 28,
    plans: (c) =>
      keep([
        { act: "look", spots: TRAIL, w: c.phase === "day" || c.phase === "dawn" ? (rainy(c) ? 1 : 7) : 1 },
        { act: "stand", spots: LOOKOUT_TOP, w: c.phase === "dusk" || c.phase === "dawn" ? 4 : 1 },
        { act: "away", spots: [EXIT_BUS], w: night(c) ? 9 : rainy(c) ? 4 : 0.2 },
      ]),
    lines: [
      { t: "산책로 한 바퀴 돌면 딱 몸이 풀려요" },
      { t: "전망대 계단은 숲길 끝에 있어요" },
      { t: "통나무 다리로 건너면 산책로 지름길이에요" },
      { t: "정류장에서 E 누르면 마을 버스가 와요" },
      { t: "다음 주엔 단풍 보러 또 올 거예요" },
      { t: "캠핑 커피 마시면 걸음이 가벼워져요" },
      { t: "노을은 전망대에서 보는 게 최고예요", when: "dusk" },
      { t: "비 오는 산길은 미끄러워요. 오늘은 쉬어요", when: "rain" },
    ],
  },
  {
    id: "angler",
    name: "강태공 할배",
    kind: "ghost",
    body: "box",
    color: BONE,
    look: ["q_hat_angler"],
    prop: "rod",
    legMs: 60_000,
    speed: 20,
    plans: (c) =>
      keep([
        { act: "fish", spots: FISH, w: night(c) ? 0.5 : rainy(c) ? 2 : 8 },
        { act: "look", spots: [bank(250, 1, 56), bank(380, 1, 62)], w: 1 },
        { act: "away", spots: [EXIT_BUS], w: night(c) && (c.hour >= 21 || c.hour < 4) ? 9 : rainy(c) ? 2 : 0.1 },
      ]),
    lines: [
      { t: "쉿… 찌가 움찔했어" },
      { t: "저 할멈이랑 누가 더 많이 잡나 내기 중이여" },
      { t: "계곡 낚시 자리 앞에서 E 누르면 앉아" },
      { t: "입질 오면 꾹 감아. 세게 당기면 잠깐 놔줘" },
      { t: "물안개 낀 새벽이 제일 잘 물어", when: "dawn" },
      { t: "비 올 땐 고기가 배고파서 더 문다니까", when: "rain" },
      { t: "이 시간엔 고기도 자. 나도 잘 거여", when: "night" },
    ],
  },
  {
    id: "stargirl",
    name: "별바라기",
    kind: "ghost",
    body: "cat",
    color: LAVENDER,
    look: ["hat_ribbon"],
    prop: "scope",
    legMs: 48_000,
    speed: 26,
    plans: (c) => {
      const clearSky = c.weather === "clear" || c.weather === "cloudy";
      return keep([
        { act: "gaze", spots: LOOKOUT_TOP, w: night(c) ? (clearSky ? 8 : 1) : c.phase === "dusk" ? 2 : 0 },
        { act: "look", spots: MEADOW, w: c.phase === "day" ? 4 : 1 },
        { act: "sit", spots: TARP, w: rainy(c) ? 3 : c.phase === "day" ? 1 : 0 },
        { act: "away", spots: [vanDoor(2)], w: rainy(c) && night(c) ? 5 : c.phase === "day" ? 1 : 0.2 },
      ]);
    },
    lines: [
      { t: "전망대 망원경 보면 캠핑장이 한눈에 보여요" },
      { t: "별지기 아저씨한테 별자리 물어보면 좋아해요" },
      { t: "북두칠성은 국자 모양이에요. 찾아봐요" },
      { t: "밤엔 전망대가 제일 어두워서 별이 잘 보여요" },
      { t: "낮엔 별이 안 보여서 심심해요", when: "day" },
      { t: "구름 걷히면 은하수 보일 거예요", when: "cloudy" },
      { t: "오늘은 별이 숨었네요. 비 그치면 와요", when: "rain" },
      { t: "쉿, 지금 별똥별 기다리는 중이에요", when: "night" },
    ],
  },
  {
    id: "camcat",
    name: "도토리",
    kind: "cat",
    variant: 2,
    legMs: 26_000,
    speed: 34,
    plans: (c) =>
      keep([
        { act: "look", spots: MEADOW, w: rainy(c) ? 0.5 : 3 },
        { act: "nap", spots: CAT_NAP, w: rainy(c) ? 5 : night(c) ? 4 : 2 },
        { act: "sit", spots: VAN_YARD.slice(0, 3), w: 1 },
      ]),
    lines: [{ t: "냐옹~" }, { t: "골골골…" }, { t: "냥!" }, { t: "…하암", when: "night" }],
  },
];

/** 캠핑장 주민 세상: 시각 → 상황 (물때 없음). override = 주소 ?time·?weather 시험 값 (내 화면에서만) */
export function campFolkWorld(override: AmbienceOverride = {}): FolkWorld {
  cells ??= campWalkGrid();
  return {
    grid: folkGrid(cells),
    ctx(t0) {
      const a = ambienceAt(t0, override);
      return { hour: a.kstHour, phase: a.phase, weather: a.weather, tide: 0, open: false };
    },
  };
}

/** 계곡 물 반폭 (테스트: 낚시 자리가 물가인지) */
export const CAMP_FOLK_STREAM_HALF = CAMP_STREAM_HALF_W;

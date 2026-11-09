// 하우징(개인 묘역) 카탈로그와 밸런스 값. 서버(검증·가격)와 클라이언트(상점·게임 그림)가 같이 쓴다.
// 가격·점수를 바꾸면 상점 화면과 서버 검증이 함께 바뀐다. 이미 놓인 물건의 점수는 다음 저장 때 다시 계산된다.

export type PlotTierId = "small" | "wide" | "manor";

export type PlotTier = {
  id: PlotTierId;
  name: string;
  /** 안쪽 칸 수 (울타리 제외) */
  w: number;
  h: number;
  /** small은 분양가, 나머지는 바로 아래 단계에서 올리는 값 */
  price: number;
  /** 한 번에 놓을 수 있는 물건 수 (점수 부풀리기 상한) */
  maxItems: number;
};

/** 폭은 짝수로 둔다 (아래 가운데 문 2칸) */
export const PLOT_TIERS: readonly PlotTier[] = [
  { id: "small", name: "작은 터", w: 10, h: 8, price: 300, maxItems: 30 },
  { id: "wide", name: "넓은 터", w: 14, h: 10, price: 500, maxItems: 50 },
  { id: "manor", name: "대저택", w: 18, h: 12, price: 1000, maxItems: 80 },
];

export const tierById = (id: string): PlotTier | undefined => PLOT_TIERS.find((t) => t.id === id);
export const nextTier = (id: PlotTierId): PlotTier | undefined => PLOT_TIERS[PLOT_TIERS.findIndex((t) => t.id === id) + 1];

export type FurnitureCategory = "furniture" | "dev" | "nature" | "mood" | "skin" | "exterior";

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  furniture: "가구",
  dev: "개발 감성",
  nature: "자연",
  mood: "분위기",
  skin: "바닥·담장",
  exterior: "외관",
};

export type FurnitureDef = {
  id: string;
  name: string;
  desc: string;
  category: FurnitureCategory;
  price: number;
  /** 꾸밈 점수 */
  score: number;
  /** 차지하는 칸 (r=0 기준) */
  w: number;
  h: number;
  /** 바닥층(러그·돌길·꽃밭): 걸어서 지나갈 수 있고, 위에 다른 물건을 올릴 수 있다 */
  floor?: boolean;
  /** 돌리면 가로·세로가 바뀐다. 아니면 돌리기 = 좌우 뒤집기 (서 있는 물건이 눕지 않게) */
  turn?: boolean;
  /** 밤에 빛을 내는 물건 (색, 반지름 px) */
  light?: { color: number; r: number };
  /** 바닥·담장 스킨: 칸에 놓지 않고 묘역 전체에 입힌다 */
  skin?: "floor" | "wall";
  /** 외관 아이템: 마을에 보이는 집 바깥의 한 자리 (지붕·벽·울타리…). 칸에 놓지 않는다 */
  ext?: ExtSlot;
};

export const FURNITURE: readonly FurnitureDef[] = [
  // ── 가구 ──
  { id: "desk", name: "책상", desc: "끝내지 못한 기획서가 올려져 있다.", category: "furniture", price: 40, score: 6, w: 2, h: 1, turn: true },
  { id: "chair", name: "의자", desc: "삐걱거리지만 아직 앉을 만하다.", category: "furniture", price: 20, score: 3, w: 1, h: 1 },
  { id: "sofa", name: "소파", desc: "누우면 일어나기 싫어지는 소파.", category: "furniture", price: 80, score: 12, w: 2, h: 1, turn: true },
  { id: "bed", name: "침대", desc: "푹 자고 나면 다시 시작할 수 있을지도.", category: "furniture", price: 100, score: 15, w: 2, h: 2, turn: true },
  { id: "bookshelf", name: "책장", desc: "읽다 만 기술 서적이 빼곡하다.", category: "furniture", price: 70, score: 10, w: 2, h: 1 },
  { id: "table", name: "둥근 탁자", desc: "찻잔 하나 놓기 좋은 크기.", category: "furniture", price: 30, score: 4, w: 1, h: 1 },
  { id: "rug", name: "러그", desc: "발이 따뜻해지는 낡은 러그. 위에 물건을 올릴 수 있다.", category: "furniture", price: 60, score: 8, w: 3, h: 2, floor: true, turn: true },
  // ── 개발 감성 ──
  { id: "monitor_desk", name: "모니터 책상", desc: "듀얼 모니터. 한쪽엔 아직 빌드가 돌고 있다.", category: "dev", price: 120, score: 18, w: 2, h: 1, light: { color: 0x8ac8ff, r: 26 } },
  { id: "server_rack", name: "서버 랙", desc: "초록 불이 깜빡인다. 아무도 끄는 법을 모른다.", category: "dev", price: 150, score: 22, w: 1, h: 1, light: { color: 0x7fe0a0, r: 20 } },
  { id: "whiteboard", name: "화이트보드", desc: "지워지지 않는 아키텍처 다이어그램.", category: "dev", price: 90, score: 12, w: 2, h: 1 },
  { id: "postit_wall", name: "포스트잇 벽", desc: "TODO, TODO, 진짜 TODO.", category: "dev", price: 50, score: 8, w: 2, h: 1 },
  { id: "duck_shelf", name: "고무오리 선반", desc: "디버깅을 들어 준 오리들이 줄지어 있다.", category: "dev", price: 60, score: 10, w: 1, h: 1 },
  { id: "coffee_machine", name: "커피 머신", desc: "야근의 동반자. 아직 따뜻하다.", category: "dev", price: 70, score: 9, w: 1, h: 1 },
  { id: "frame_404", name: "404 액자", desc: "찾을 수 없는 그 무엇을 기리며.", category: "dev", price: 40, score: 6, w: 1, h: 1 },
  // ── 자연 ──
  { id: "pot", name: "화분", desc: "물만 주면 잘 자란다. 프로젝트와 달리.", category: "nature", price: 15, score: 2, w: 1, h: 1 },
  { id: "tree", name: "나무", desc: "그늘이 넓은 늙은 나무.", category: "nature", price: 120, score: 16, w: 2, h: 2 },
  { id: "pond", name: "연못", desc: "달이 비치는 작은 연못.", category: "nature", price: 160, score: 22, w: 3, h: 2, turn: true },
  { id: "flowerbed", name: "꽃밭", desc: "밤에도 은은하게 향이 난다. 밟아도 괜찮다.", category: "nature", price: 40, score: 7, w: 2, h: 1, floor: true, turn: true },
  { id: "stone_path", name: "돌길", desc: "한 칸짜리 디딤돌. 이어 놓으면 길이 된다.", category: "nature", price: 10, score: 1, w: 1, h: 1, floor: true },
  { id: "bush", name: "덤불", desc: "동글동글한 작은 덤불.", category: "nature", price: 25, score: 3, w: 1, h: 1 },
  { id: "mushrooms", name: "버섯 무리", desc: "어둠 속에서 살짝 빛난다.", category: "nature", price: 20, score: 3, w: 1, h: 1, floor: true, light: { color: 0x9fe8d0, r: 10 } },
  // ── 분위기 ──
  { id: "stone_lantern", name: "석등", desc: "묘역을 지키는 돌 등불.", category: "mood", price: 90, score: 14, w: 1, h: 1, light: { color: 0xffc070, r: 34 } },
  { id: "candles", name: "촛대", desc: "세 갈래 촛불이 흔들린다.", category: "mood", price: 35, score: 5, w: 1, h: 1, light: { color: 0xffb060, r: 22 } },
  { id: "firefly_jar", name: "반딧불 병", desc: "잡아 둔 반딧불이 천천히 떠다닌다.", category: "mood", price: 60, score: 9, w: 1, h: 1, light: { color: 0xd8ff8a, r: 20 } },
  { id: "wind_chime", name: "풍경", desc: "바람이 불면 맑은 소리가 난다.", category: "mood", price: 45, score: 7, w: 1, h: 1 },
  { id: "memorial", name: "추억 비석", desc: "내 묘역에 세우는 작은 비석.", category: "mood", price: 50, score: 8, w: 1, h: 1 },
  { id: "ghost_cat", name: "잠든 유령 고양이", desc: "방석 위에서 반투명하게 졸고 있다.", category: "mood", price: 110, score: 16, w: 1, h: 1 },
  // ── 바닥·담장 스킨 (기본 풀밭·나무 울타리는 무료) ──
  { id: "floor_moss", name: "이끼 바닥", desc: "폭신한 이끼가 깔린 바닥.", category: "skin", price: 80, score: 10, w: 1, h: 1, skin: "floor" },
  { id: "floor_wood", name: "나무 마루", desc: "따뜻한 색의 마룻바닥.", category: "skin", price: 120, score: 14, w: 1, h: 1, skin: "floor" },
  { id: "floor_stone", name: "돌바닥", desc: "반듯하게 다듬은 판석.", category: "skin", price: 100, score: 12, w: 1, h: 1, skin: "floor" },
  { id: "floor_petal", name: "꽃잎 바닥", desc: "분홍 꽃잎이 흩날린 길.", category: "skin", price: 180, score: 20, w: 1, h: 1, skin: "floor" },
  { id: "wall_stone", name: "돌담", desc: "이끼 낀 낮은 돌담.", category: "skin", price: 100, score: 12, w: 1, h: 1, skin: "wall" },
  { id: "wall_hedge", name: "생울타리", desc: "잘 다듬은 초록 울타리.", category: "skin", price: 90, score: 10, w: 1, h: 1, skin: "wall" },
  { id: "wall_iron", name: "철제 담장", desc: "고풍스러운 검은 철책.", category: "skin", price: 150, score: 18, w: 1, h: 1, skin: "wall" },
  // ── 외관 (마을에서 보이는 집 바깥. 자리마다 하나씩 고른다) ──
  ...ext("roof", [
    ["roof_red", "붉은 기와 지붕", "멀리서도 눈에 띄는 붉은 기와.", 60, 8],
    ["roof_teal", "청록 지붕", "달빛에 반짝이는 청록 함석.", 60, 8],
    ["roof_thatch", "초가지붕", "볏짚을 엮어 올린 포근한 지붕.", 80, 10],
    ["roof_moss", "이끼 지붕", "세월이 내려앉은 초록 지붕.", 100, 12],
  ]),
  ...ext("facade", [
    ["facade_brick", "벽돌 벽", "빨간 벽돌을 차곡차곡.", 80, 10],
    ["facade_stone", "돌벽", "튼튼한 회색 돌벽.", 100, 12],
    ["facade_white", "흰 회벽", "깔끔한 하얀 벽.", 70, 9],
  ]),
  ...ext("fence", [
    ["fence_picket", "흰 울타리", "앞마당을 두르는 하얀 나무 울타리.", 40, 5],
    ["fence_stone", "낮은 돌담", "이끼 낀 낮은 돌담.", 60, 8],
    ["fence_hedge", "생울타리", "둥글게 다듬은 초록 울타리.", 50, 7],
  ]),
  ...ext("door", [
    ["door_red", "빨간 문", "반가운 손님을 부르는 빨간 문.", 30, 4],
    ["door_arch", "아치 문", "둥근 아치에 작은 창이 난 문.", 60, 8],
  ]),
  ...ext("mailbox", [
    ["mailbox_red", "빨간 우편함", "편지가 올 것만 같은 우편함.", 30, 4],
    ["mailbox_ghost", "유령 우편함", "밤마다 덜컹거리는 우편함.", 50, 7],
  ]),
  ...ext("garden", [
    ["garden_pots", "앞마당 화분", "문 앞에 놓은 화분 셋.", 30, 4],
    ["garden_flowers", "앞마당 꽃밭", "현관까지 이어진 꽃길.", 40, 6],
    ["garden_lanterns", "정원 등불", "문 양옆을 밝히는 작은 등불.", 60, 9],
  ]),
  ...ext("sign", [
    ["sign_wood", "나무 간판", "집 이름을 새긴 나무 간판.", 30, 4],
    ["sign_neon", "네온 간판", "밤에 은은하게 빛나는 간판.", 90, 12],
  ]),
];

function ext(slot: ExtSlot, rows: [string, string, string, number, number][]): FurnitureDef[] {
  return rows.map(([id, name, desc, price, score]) => ({ id, name, desc, category: "exterior" as const, price, score, w: 1, h: 1, ext: slot }));
}

// ── 외관 자리 ──

export type ExtSlot = "roof" | "facade" | "fence" | "door" | "mailbox" | "garden" | "sign";
export const EXT_SLOTS: readonly { slot: ExtSlot; label: string; base: string; baseName: string }[] = [
  { slot: "roof", label: "지붕", base: "roof_slate", baseName: "슬레이트 지붕" },
  { slot: "facade", label: "벽", base: "facade_plank", baseName: "나무 판자 벽" },
  { slot: "door", label: "문", base: "door_wood", baseName: "나무 문" },
  { slot: "fence", label: "울타리", base: "fence_none", baseName: "없음" },
  { slot: "mailbox", label: "우편함", base: "mailbox_none", baseName: "없음" },
  { slot: "garden", label: "정원", base: "garden_none", baseName: "없음" },
  { slot: "sign", label: "간판", base: "sign_none", baseName: "없음" },
];
export type HouseExteriorMap = Record<ExtSlot, string>;
export const defaultExterior = (): HouseExteriorMap =>
  Object.fromEntries(EXT_SLOTS.map((s) => [s.slot, s.base])) as HouseExteriorMap;
export const isExtBase = (id: string) => EXT_SLOTS.some((s) => s.base === id);

/** 처음부터 깔려 있는 무료 스킨 (카탈로그에서 팔지 않고 점수도 없다) */
export const DEFAULT_FLOOR = "floor_grass";
export const DEFAULT_WALL = "wall_fence";

const BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
export const furnitureById = (id: string): FurnitureDef | undefined => BY_ID.get(id);

export const isFloorSkin = (id: string) => id === DEFAULT_FLOOR || furnitureById(id)?.skin === "floor";
export const isWallSkin = (id: string) => id === DEFAULT_WALL || furnitureById(id)?.skin === "wall";

/** 되팔 때 돌려받는 비율 */
export const SELL_BACK_RATE = 0.5;
export const sellPrice = (def: FurnitureDef) => Math.floor(def.price * SELL_BACK_RATE);
/** 한 종류를 이만큼까지 가질 수 있다 */
export const MAX_OWN_PER_ITEM = 20;

/** 꾸밈 점수 = 놓은 물건 점수 합 + 좋아요 × LIKE_WEIGHT */
export const LIKE_WEIGHT = 3;
/** 좋아요를 받으면 주인이 받는 포인트 (lib/economy.ts의 houseLike 규칙과 같은 값) */
export const LIKE_REWARD = 2;

export type HouseTitle = { min: number; name: string; desc: string };

/** 꾸밈 점수 구간별 호칭 (낮은 것부터) */
export const HOUSE_TITLES: readonly HouseTitle[] = [
  { min: 0, name: "쓸쓸한 터", desc: "아직 바람 소리만 머무는 곳" },
  { min: 50, name: "아늑한 묘역", desc: "누군가 머문 온기가 느껴지는 곳" },
  { min: 150, name: "정갈한 정원", desc: "손길이 닿은 티가 나는 곳" },
  { min: 400, name: "소문난 별장", desc: "지나가던 유령도 들르는 곳" },
  { min: 900, name: "전설의 명당", desc: "묘지 사람들이 입을 모아 말하는 곳" },
];

export function houseTitle(score: number): HouseTitle {
  let t = HOUSE_TITLES[0];
  for (const x of HOUSE_TITLES) if (score >= x.min) t = x;
  return t;
}

/** 다음 호칭까지 (마지막 단계면 null) */
export function nextTitle(score: number): HouseTitle | null {
  return HOUSE_TITLES.find((t) => t.min > score) ?? null;
}

/** 가장 많이 놓은 갈래에 따라 붙는 별칭 (물건이 3개 이상일 때) */
export const STYLE_TAGS: Record<Exclude<FurnitureCategory, "skin" | "exterior">, string> = {
  furniture: "살림꾼의 집",
  dev: "야근 감성",
  nature: "숲속 정원",
  mood: "달빛 정취",
};

export const SORTS = ["score", "likes", "new"] as const;
export type HouseSort = (typeof SORTS)[number];
export const SORT_LABELS: Record<HouseSort, string> = { score: "꾸밈 점수", likes: "좋아요", new: "새로 분양" };
/** 랭킹·둘러보기 목록 길이 */
export const LIST_LIMIT = 50;

/** 방명록 */
export const GUEST_MAX_LEN = 80;
/** 집마다 최근 이만큼만 남긴다 */
export const GUEST_KEEP = 50;
/** 한 사람이 하루에 남길 수 있는 방명록 수 (모든 집 합계) */
export const GUEST_PER_DAY = 10;
/** 서로 다른 IP의 신고가 이만큼 모이면 그 글을 가린다 */
export const GUEST_REPORT_HIDE = 3;

export const HOUSE_NAME_MAX = 20;
export const HOUSE_INTRO_MAX = 60;

// ── 분양 마을 ──

/** 마을 한 줄에 놓이는 필지 수. 집이 늘면 아래로 한 줄씩 늘어난다 */
export const VILLAGE_COLS = 4;
/** 처음부터 보여 주는 필지 수 (빈 필지는 "분양 중") */
export const VILLAGE_MIN_LOTS = 8;
/** 고를 수 있는 번지 상한 (마을이 끝없이 길어지지 않게) */
export const VILLAGE_MAX_LOTS = 400;
/** 지금 마을에 그릴 필지 수: 가장 큰 번지 다음 줄까지 + 빈 필지를 늘 몇 개 남긴다 */
export function villageLots(maxLot: number, count: number): number {
  const need = Math.max(VILLAGE_MIN_LOTS, maxLot, count + 4);
  return Math.min(VILLAGE_MAX_LOTS, Math.ceil(need / VILLAGE_COLS) * VILLAGE_COLS);
}

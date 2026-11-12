import { DEFAULT_MAX_CHANNELS } from "@tomb/protocol";

// 하우징(개인 집) 카탈로그와 밸런스 값. 서버(검증·가격)와 클라이언트(상점·게임 그림)가 같이 쓴다.
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
  { id: "small", name: "작은 터", w: 10, h: 8, price: 2_000, maxItems: 30 },
  { id: "wide", name: "넓은 터", w: 14, h: 10, price: 3_000, maxItems: 50 },
  { id: "manor", name: "대저택", w: 18, h: 12, price: 5_000, maxItems: 80 },
];

export const tierById = (id: string): PlotTier | undefined => PLOT_TIERS.find((t) => t.id === id);
export const nextTier = (id: PlotTierId): PlotTier | undefined => PLOT_TIERS[PLOT_TIERS.findIndex((t) => t.id === id) + 1];
/** 처음 분양 때 이 크기를 바로 살 때의 값: 작은 터 분양가 + 그 위 단계 넓히기 값의 누적 (업그레이드로 올린 것과 같은 합) */
export const plotCost = (id: PlotTierId): number => {
  const i = PLOT_TIERS.findIndex((t) => t.id === id);
  if (i < 0) throw new Error(`unknown tier ${id}`);
  return PLOT_TIERS.slice(0, i + 1).reduce((sum, t) => sum + t.price, 0);
};

export type FurnitureCategory = "furniture" | "living" | "dev" | "nature" | "mood" | "skin" | "exterior";

export const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  furniture: "가구",
  living: "생활",
  dev: "사무실",
  nature: "자연",
  mood: "분위기",
  skin: "바닥·벽지",
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
  /** 바닥·담장 스킨: 칸에 놓지 않고 집 전체에 입힌다 */
  skin?: "floor" | "wall";
  /** 외관 아이템: 마을에 보이는 집 바깥의 한 자리 (지붕·벽·울타리…). 칸에 놓지 않는다 */
  ext?: ExtSlot;
  /** 집 안에서 E로 할 수 있는 일 (상점 안내용 짧은 말. 실제 동작은 game/housing/interact.ts) */
  use?: string;
};

export const FURNITURE: readonly FurnitureDef[] = [
  // ── 가구 ──
  { id: "desk", name: "책상", desc: "끝내지 못한 기획서가 올려져 있다. 앉으면 타닥타닥 자판 소리.", category: "furniture", price: 120, score: 6, w: 2, h: 1, turn: true, use: "앉아서 일하기" },
  { id: "chair", name: "의자", desc: "삐걱거리지만 아직 앉을 만하다.", category: "furniture", price: 60, score: 3, w: 1, h: 1, use: "앉기" },
  { id: "sofa", name: "소파", desc: "누우면 일어나기 싫어지는 소파. 둘이 나란히 앉을 수 있다.", category: "furniture", price: 220, score: 12, w: 2, h: 1, turn: true, use: "앉기 (2자리)" },
  { id: "bed", name: "침대", desc: "푹 자고 나면 다시 시작할 수 있을지도.", category: "furniture", price: 280, score: 15, w: 2, h: 2, use: "눕기" },
  { id: "bookshelf", name: "책장", desc: "읽다 만 자기계발서가 빼곡하다.", category: "furniture", price: 200, score: 10, w: 2, h: 1, use: "책 읽기" },
  { id: "table", name: "둥근 탁자", desc: "찻잔 하나 놓기 좋은 크기.", category: "furniture", price: 80, score: 4, w: 1, h: 1 },
  { id: "rug", name: "러그", desc: "발이 따뜻해지는 낡은 러그. 위에 물건을 올릴 수 있다.", category: "furniture", price: 160, score: 8, w: 3, h: 2, floor: true, turn: true },
  // ── 생활 (3번 집 안 개편: 써 보는 가구) ──
  { id: "piano", name: "피아노", desc: "건반을 누르면 방 안 모두에게 들린다. 숫자 1~8로 음을 고른다.", category: "living", price: 520, score: 26, w: 2, h: 1, use: "앉아서 연주" },
  { id: "radio", name: "라디오", desc: "다이얼을 돌리면 지직, 노래가 바뀐다.", category: "living", price: 160, score: 8, w: 1, h: 1, use: "채널 돌리기" },
  { id: "fireplace", name: "벽난로", desc: "불을 지피면 방이 주황빛으로 따뜻해진다. 타닥타닥.", category: "living", price: 480, score: 24, w: 2, h: 1, use: "불 켜기·끄기" },
  { id: "floor_lamp", name: "스탠드 조명", desc: "딸깍 켜면 노란 빛이 동그랗게 번진다.", category: "living", price: 140, score: 7, w: 1, h: 1, use: "켜기·끄기" },
  { id: "fridge", name: "냉장고", desc: "열 때마다 뭔가 하나씩 나온다. 누가 채워 두는 걸까.", category: "living", price: 260, score: 12, w: 1, h: 1, use: "간식 꺼내기" },
  { id: "bathtub", name: "욕조", desc: "거품이 뽀글뽀글. 들어가면 나오기 싫다.", category: "living", price: 380, score: 18, w: 2, h: 1, use: "들어가기" },
  { id: "cat_cushion", name: "고양이 쿠션", desc: "쿠션 위의 고양이. 쓰다듬으면 골골 소리를 낸다.", category: "living", price: 180, score: 10, w: 1, h: 1, use: "쓰다듬기" },
  { id: "grand_clock", name: "괘종시계", desc: "지금 몇 시인지 댕— 하고 알려 준다.", category: "living", price: 240, score: 11, w: 1, h: 1, use: "시간 보기" },
  // ── 사무실 ──
  { id: "monitor_desk", name: "모니터 책상", desc: "듀얼 모니터. 한쪽엔 아직 엑셀이 열려 있다.", category: "dev", price: 340, score: 18, w: 2, h: 1, light: { color: 0x8ac8ff, r: 26 }, use: "앉아서 일하기" },
  { id: "server_rack", name: "사무실 자판기", desc: "초록 불이 깜빡인다. 동전을 넣으면 가끔 뭔가 나온다.", category: "dev", price: 420, score: 22, w: 1, h: 1, light: { color: 0x7fe0a0, r: 20 }, use: "음료 뽑기" },
  { id: "whiteboard", name: "화이트보드", desc: "지난 분기 회의 내용이 아직 안 지워졌다.", category: "dev", price: 260, score: 12, w: 2, h: 1 },
  { id: "postit_wall", name: "메모지 벽", desc: "할 일, 할 일, 진짜 할 일.", category: "dev", price: 140, score: 8, w: 2, h: 1 },
  { id: "duck_shelf", name: "오리 인형 선반", desc: "하소연을 들어 준 오리들이 줄지어 있다.", category: "dev", price: 160, score: 10, w: 1, h: 1 },
  { id: "coffee_machine", name: "커피 머신", desc: "야근의 동반자. 아직 따뜻하다.", category: "dev", price: 200, score: 9, w: 1, h: 1, use: "커피 내리기" },
  { id: "frame_404", name: "사훈 액자", desc: "사훈은 \"404\". 무슨 뜻인지 아무도 모른다.", category: "dev", price: 120, score: 6, w: 1, h: 1 },
  // ── 자연 ──
  { id: "pot", name: "화분", desc: "물만 주면 잘 자란다. 내 다짐과 달리. 물을 주면 며칠에 걸쳐 꽃이 핀다.", category: "nature", price: 40, score: 2, w: 1, h: 1, use: "물 주기" },
  { id: "tree", name: "나무", desc: "그늘이 넓은 늙은 나무.", category: "nature", price: 340, score: 16, w: 2, h: 2 },
  { id: "pond", name: "연못", desc: "달이 비치는 작은 연못.", category: "nature", price: 440, score: 22, w: 3, h: 2, turn: true },
  { id: "flowerbed", name: "꽃밭", desc: "밤에도 은은하게 향이 난다. 밟아도 괜찮다.", category: "nature", price: 120, score: 7, w: 2, h: 1, floor: true, turn: true },
  { id: "stone_path", name: "돌길", desc: "한 칸짜리 디딤돌. 이어 놓으면 길이 된다.", category: "nature", price: 40, score: 1, w: 1, h: 1, floor: true },
  { id: "bush", name: "덤불", desc: "동글동글한 작은 덤불.", category: "nature", price: 80, score: 3, w: 1, h: 1 },
  { id: "mushrooms", name: "버섯 무리", desc: "어둠 속에서 살짝 빛난다.", category: "nature", price: 60, score: 3, w: 1, h: 1, floor: true, light: { color: 0x9fe8d0, r: 10 } },
  // ── 분위기 ──
  { id: "stone_lantern", name: "석등", desc: "집을 지키는 돌 등불.", category: "mood", price: 260, score: 14, w: 1, h: 1, light: { color: 0xffc070, r: 34 } },
  { id: "candles", name: "촛대", desc: "세 갈래 촛불이 흔들린다.", category: "mood", price: 100, score: 5, w: 1, h: 1, light: { color: 0xffb060, r: 22 } },
  { id: "firefly_jar", name: "반딧불 병", desc: "잡아 둔 반딧불이 천천히 떠다닌다.", category: "mood", price: 160, score: 9, w: 1, h: 1, light: { color: 0xd8ff8a, r: 20 } },
  { id: "wind_chime", name: "풍경", desc: "바람이 불면 맑은 소리가 난다.", category: "mood", price: 120, score: 7, w: 1, h: 1, use: "흔들기" },
  { id: "memorial", name: "추억 비석", desc: "내 집 마당에 세우는 작은 비석.", category: "mood", price: 140, score: 8, w: 1, h: 1 },
  { id: "ghost_cat", name: "잠든 유령 고양이", desc: "방석 위에서 반투명하게 졸고 있다.", category: "mood", price: 300, score: 16, w: 1, h: 1, use: "쓰다듬기" },
  // ── 바닥·벽지 스킨 (기본 낡은 장판·나무 판자 벽은 무료). id는 예전 마당 시절 그대로 (가진 것·저장된 배치 유지) ──
  { id: "floor_moss", name: "초록 카펫", desc: "이끼처럼 폭신한 초록 카펫.", category: "skin", price: 220, score: 10, w: 1, h: 1, skin: "floor" },
  { id: "floor_wood", name: "나무 마루", desc: "길쭉한 널을 엇갈려 깐 반들반들한 마루.", category: "skin", price: 340, score: 14, w: 1, h: 1, skin: "floor" },
  { id: "floor_stone", name: "대리석 바닥", desc: "반듯하게 다듬은 회색 판석.", category: "skin", price: 280, score: 12, w: 1, h: 1, skin: "floor" },
  { id: "floor_tile", name: "체크 타일", desc: "크림색과 갈색이 번갈아 깔린 타일.", category: "skin", price: 240, score: 11, w: 1, h: 1, skin: "floor" },
  { id: "floor_petal", name: "꽃잎 카펫", desc: "분홍 꽃잎 무늬를 수놓은 카펫.", category: "skin", price: 500, score: 20, w: 1, h: 1, skin: "floor" },
  { id: "wall_stone", name: "돌벽", desc: "회색 돌을 차곡차곡 쌓은 서늘한 벽.", category: "skin", price: 280, score: 12, w: 1, h: 1, skin: "wall" },
  { id: "wall_hedge", name: "풀잎 벽지", desc: "연둣빛 잎사귀 무늬 벽지.", category: "skin", price: 260, score: 10, w: 1, h: 1, skin: "wall" },
  { id: "wall_paper", name: "꽃무늬 벽지", desc: "크림색 바탕에 작은 장미가 흩어진 벽지.", category: "skin", price: 240, score: 11, w: 1, h: 1, skin: "wall" },
  { id: "wall_iron", name: "남색 장식 벽지", desc: "짙은 남색 바탕에 금빛 무늬가 들어간 고풍스러운 벽지.", category: "skin", price: 420, score: 18, w: 1, h: 1, skin: "wall" },
  // ── 외관 (마을에서 보이는 집 바깥. 자리마다 하나씩 고른다) ──
  ...ext("roof", [
    ["roof_red", "붉은 기와 지붕", "멀리서도 눈에 띄는 붉은 기와.", 240, 8],
    ["roof_teal", "청록 지붕", "달빛에 반짝이는 청록 함석.", 240, 8],
    ["roof_thatch", "초가지붕", "볏짚을 엮어 올린 포근한 지붕.", 320, 10],
    ["roof_moss", "이끼 지붕", "세월이 내려앉은 초록 지붕.", 400, 12],
  ]),
  ...ext("facade", [
    ["facade_brick", "벽돌 벽", "빨간 벽돌을 차곡차곡.", 320, 10],
    ["facade_stone", "돌벽", "튼튼한 회색 돌벽.", 400, 12],
    ["facade_white", "흰 회벽", "깔끔한 하얀 벽.", 280, 9],
  ]),
  ...ext("fence", [
    ["fence_picket", "흰 울타리", "앞마당을 두르는 하얀 나무 울타리.", 160, 5],
    ["fence_stone", "낮은 돌담", "이끼 낀 낮은 돌담.", 240, 8],
    ["fence_hedge", "생울타리", "둥글게 다듬은 초록 울타리.", 200, 7],
  ]),
  ...ext("door", [
    ["door_red", "빨간 문", "반가운 손님을 부르는 빨간 문.", 120, 4],
    ["door_arch", "아치 문", "둥근 아치에 작은 창이 난 문.", 240, 8],
  ]),
  ...ext("mailbox", [
    ["mailbox_red", "빨간 우편함", "편지가 올 것만 같은 우편함.", 120, 4],
    ["mailbox_ghost", "유령 우편함", "밤마다 덜컹거리는 우편함.", 200, 7],
  ]),
  ...ext("garden", [
    ["garden_pots", "앞마당 화분", "문 앞에 놓은 화분 셋.", 120, 4],
    ["garden_flowers", "앞마당 꽃밭", "현관까지 이어진 꽃길.", 160, 6],
    ["garden_lanterns", "정원 등불", "문 양옆을 밝히는 작은 등불.", 240, 9],
  ]),
  ...ext("sign", [
    ["sign_wood", "나무 간판", "집 이름을 새긴 나무 간판.", 120, 4],
    ["sign_neon", "네온 간판", "밤에 은은하게 빛나는 간판.", 360, 12],
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

/** 처음부터 깔려 있는 무료 스킨 (카탈로그에서 팔지 않고 점수도 없다). id는 마당 시절 그대로, 지금은 집 안 바닥·벽 */
export const DEFAULT_FLOOR = "floor_grass";
export const DEFAULT_WALL = "wall_fence";
/** 기본 스킨 이름 (화면 표시용) */
export const DEFAULT_FLOOR_NAME = "낡은 장판";
export const DEFAULT_WALL_NAME = "나무 판자 벽";

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
  { min: 50, name: "아늑한 보금자리", desc: "누군가 머문 온기가 느껴지는 곳" },
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
  living: "생활의 온기",
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

// ── 채널별 주거 구역 ──

/** 주거 구역이 따로 있는 채널 1..HOUSING_CHANNELS (묘지 채널 수와 같다. lib/store/channels.ts GRAVE_CHANNELS) */
export const HOUSING_CHANNELS = DEFAULT_MAX_CHANNELS;
/** 채널이 생기기 전에 분양된 집(채널 정보 없음)이 속하는 채널 */
export const LEGACY_HOUSING_CHANNEL = 1;
export const isHousingChannel = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= HOUSING_CHANNELS;
/** 저장된 값 → 채널 (없거나 이상하면 LEGACY_HOUSING_CHANNEL) */
export const housingChannelOf = (raw: unknown): number => {
  const n = Number(raw);
  return isHousingChannel(n) ? n : LEGACY_HOUSING_CHANNEL;
};
/** "3채널 5번지" */
export const lotLabel = (ch: number, lot: number) => `${ch}채널 ${lot}번지`;

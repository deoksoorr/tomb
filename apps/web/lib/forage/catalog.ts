import type { Season, TimePhase, Weather } from "../ambience";
import { CAMP_TRADER, SEA_DIG_HOLES, type FishWater } from "@tomb/protocol";
import { CONSTELLATIONS } from "../rpg/constellations";
// 11/16 도감 몬스터 칸 (사는 곳·희귀도 — lib/forage/mobDex)
import { isMobId, MOB_DEX_IDS, mobRarity } from "./mobDex";
// 11/16 바닷가 뭍 채집 지점 (풀밭 곤충·정원 약초·백사장 모래·갯바위 광석·갯벌 구멍 더)
import { SEA_LAND_NODES } from "./seaNodes";

// 낚시·채집·도감 (NEXT.md 4·32·51) 카탈로그 — 서버(lib/forage/service)와 UI·게임이 같은 표를 쓴다 (순수 데이터).
// 값(가격·확률)은 서버만 믿는다. 잡는 순간 무엇이 걸렸는지는 서버가 굴려 저장해 두고, 끝낼 때 확인한다.
//
// 이름은 실제 물고기·곤충·약초에 직장인 생활 농담을 섞었다 (월요병 붕어, 야근 메기, 칼퇴 송사리 …).

export type LifeCat = "fish" | "bug" | "herb" | "ore" | "dig";
export const LIFE_CATS: readonly LifeCat[] = ["fish", "bug", "herb", "ore", "dig"];
export const CAT_LABEL: Record<LifeCat, string> = { fish: "물고기", bug: "곤충", herb: "약초·버섯", ore: "광석", dig: "발굴품" };

/**
 * 어디서: 물고기는 물(호수·강·11/16 바다), 채집물은 채집 지점이 있는 구역 (11/16 바닷가 갯벌 flat).
 * 11/26 캠핑장 개편: 옛길 계곡(valley)·달그늘 소(pool)·윤슬 낚시터(reservoir)·윤슬 나룻배(rowboat) 물, 캠핑장 숲(campwood)·캠핑장 바위(camprock) 채집 —
 * 이 여섯 곳의 종은 캠핑장에서만 나와요 (물 → 뽑는 곳은 WATER_WHERES, 캠핑장 채집 지점은 GatherNode.also)
 */
export type Where =
  | "lake"
  | "river"
  | "forest"
  | "meadow"
  | "hill"
  | "cave"
  | "lakeside"
  | "sea"
  | "flat"
  | "valley"
  | "pool"
  | "reservoir"
  | "rowboat"
  | "campwood"
  | "camprock"
  // 11/26 도감 확장: 바닷가 모래 언덕·갯바위·바위 웅덩이·백사장, 캠핑장 계곡 물가
  | "dune"
  | "searock"
  | "tidepool"
  | "beach"
  | "campbank";
export const WHERE_LABEL: Record<Where, string> = {
  lake: "호수",
  river: "강",
  forest: "숲",
  meadow: "풀밭",
  // 11/19 지도에 보이는 이름으로 (예전 「별 보기 언덕」·「사냥터 동굴 앞」은 어딘지 몰랐다 — 사용자)
  hill: "북서쪽 언덕",
  cave: "사냥터 입구",
  lakeside: "호숫가",
  sea: "바다",
  flat: "갯벌",
  valley: "옛길 계곡",
  pool: "달그늘 소",
  reservoir: "윤슬 낚시터",
  rowboat: "윤슬 나룻배",
  campwood: "캠핑장 숲",
  camprock: "캠핑장 바위",
  dune: "모래 언덕",
  searock: "갯바위",
  tidepool: "바위 웅덩이",
  beach: "백사장",
  campbank: "계곡 물가",
};
/** 11/26 캠핑장에서만 나오는 곳 (맵별 도감·수집 의뢰 제외에 쓴다) */
export const CAMP_WHERES: readonly Where[] = ["valley", "pool", "reservoir", "rowboat", "campwood", "camprock", "campbank"];
/** 11/26 바닷가에서만 나오는 곳 (바다 낚시·갯벌·모래 언덕·갯바위·바위 웅덩이·백사장) */
export const SEA_WHERES: readonly Where[] = ["sea", "flat", "dune", "searock", "tidepool", "beach"];
export const PHASE_LABEL: Record<TimePhase, string> = { dawn: "새벽", day: "낮", dusk: "해질녘", night: "밤" };
export const WEATHER_LABEL: Record<Weather, string> = { clear: "맑음", cloudy: "흐림", fog: "안개", rain: "비", snow: "눈" };
export const SEASON_LABEL: Record<Season, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

export type Rarity = 1 | 2 | 3 | 4 | 5;
export const RARITY_LABEL: Record<Rarity, string> = { 1: "흔함", 2: "보통", 3: "희귀", 4: "아주 희귀", 5: "전설" };
/** 같은 조건에서 뽑힐 무게 (희귀할수록 드물다) */
export const RARITY_WEIGHT: Record<Rarity, number> = { 1: 50, 2: 26, 3: 10, 4: 3, 5: 0.7 };

export type Species = {
  id: string;
  cat: LifeCat;
  name: string;
  rarity: Rarity;
  /** NPC가 사 주는 값 (1마리·1개) */
  price: number;
  /** 잡히는 곳. 곤충은 수풀이면 어디든 (시간대로 갈린다) */
  where: readonly Where[];
  /** 없으면 아무 때나 */
  time?: readonly TimePhase[];
  weather?: readonly Weather[];
  season?: readonly Season[];
  /** 크기 범위 cm (물고기·곤충). 없으면 크기를 재지 않는다 */
  size?: readonly [number, number];
  /** 잡동사니 (물고기 칸에 같이 있지만 그림이 물고기가 아니다) */
  junk?: boolean;
  /** 무게를 따로 줄 때 (잡동사니) */
  weight?: number;
  /** 11/26 직접 낚시로만 (자동 낚시·자동 낚시의 꾸미기 대신 물고기로는 안 나와요 — 캠핑장·도감 확장 바다의 희귀 이상 새 물고기) */
  directOnly?: true;
  desc: string;
};

const W = { L: ["lake"], R: ["river"], LR: ["lake", "river"] } as const;
const ALL_GROUND: readonly Where[] = ["forest", "meadow", "hill", "cave", "lakeside"];

// ── 물고기 (40) ── 앞의 24종은 그대로 두고 뒤에 이어 붙인다 (id·값을 바꾸면 이미 잡은 도감·가방·순위가 어긋난다)
// 11/22 운영자: 물고기 값(price)을 모두 예전의 ×1.3으로 올렸다 (반올림, .5는 올림 — 3→4, 6→8, 80→104. 바닷물고기도). 대물·월척 배수는 이 값에 곱한다
const FISH: Species[] = [
  { id: "f_crucian", cat: "fish", name: "월요병 붕어", rarity: 1, price: 4, where: W.LR, size: [10, 32], desc: "월요일 아침마다 유난히 잘 잡힌다. 표정이 어딘가 지쳐 있다." },
  { id: "f_bluegill", cat: "fish", name: "블루길", rarity: 1, price: 4, where: W.L, time: ["day", "dusk"], size: [8, 22], desc: "어디서 왔는지 모르지만 이미 이 호수의 터줏대감." },
  { id: "f_minnow", cat: "fish", name: "칼퇴 송사리", rarity: 1, price: 3, where: W.R, time: ["day", "dusk"], size: [2, 6], desc: "여섯 시 정각이 되면 쏜살같이 사라진다." },
  { id: "f_chub", cat: "fish", name: "피라미", rarity: 1, price: 4, where: W.R, time: ["dawn", "day"], size: [6, 16], desc: "여울에서 반짝이며 떼 지어 다닌다." },
  { id: "f_loach", cat: "fish", name: "회의 빠지는 미꾸라지", rarity: 1, price: 4, where: W.R, weather: ["cloudy", "fog", "rain"], size: [8, 20], desc: "회의 시간만 되면 손 사이로 빠져나간다." },
  { id: "f_carp", cat: "fish", name: "잉어", rarity: 2, price: 8, where: W.L, size: [30, 85], desc: "느긋하게 헤엄치는 호수의 어른." },
  { id: "f_catfish", cat: "fish", name: "야근 메기", rarity: 2, price: 9, where: W.LR, time: ["night"], size: [30, 95], desc: "불 꺼진 사무실 같은 밤 물에서만 입질한다." },
  { id: "f_bass", cat: "fish", name: "배스", rarity: 2, price: 8, where: W.L, time: ["dawn", "dusk"], size: [20, 55], desc: "해가 뜨고 질 무렵 가장 배고프다." },
  { id: "f_smelt", cat: "fish", name: "빙어", rarity: 2, price: 8, where: W.L, season: ["winter"], size: [7, 15], desc: "꽁꽁 언 겨울 호수의 은빛 손님." },
  { id: "f_sweetfish", cat: "fish", name: "은어", rarity: 2, price: 8, where: W.R, time: ["day"], season: ["summer", "autumn"], size: [12, 25], desc: "맑은 물에서만 사는 수박 향 물고기." },
  { id: "f_bullhead", cat: "fish", name: "퇴근길 동자개", rarity: 2, price: 8, where: W.R, time: ["dusk", "night"], season: ["summer", "autumn"], size: [15, 30], desc: "빠가빠가 우는 소리가 퇴근 지하철 안내 방송 같다." },
  { id: "f_kkeokji", cat: "fish", name: "꺽지", rarity: 2, price: 8, where: W.R, time: ["day"], season: ["spring", "summer"], size: [10, 20], desc: "봄볕이 드는 바위 틈을 좋아한다." },
  { id: "f_mandarin", cat: "fish", name: "쏘가리", rarity: 3, price: 18, where: W.R, time: ["dawn", "dusk"], weather: ["clear", "cloudy"], size: [20, 50], desc: "강의 호랑이. 줄무늬 정장이 잘 어울린다." },
  { id: "f_rainbow", cat: "fish", name: "무지개송어", rarity: 3, price: 18, where: W.L, weather: ["rain", "fog"], size: [25, 60], desc: "비 오는 날이면 비늘에 무지개가 뜬다." },
  { id: "f_eel", cat: "fish", name: "마감 장어", rarity: 3, price: 21, where: W.R, time: ["night"], weather: ["rain"], size: [40, 100], desc: "마감 전날 밤, 비가 오면 꿈틀대며 올라온다." },
  { id: "f_snakehead", cat: "fish", name: "결재 가물치", rarity: 3, price: 20, where: W.L, time: ["day", "dusk"], season: ["summer", "autumn"], size: [40, 90], desc: "한번 물면 결재가 날 때까지 놓지 않는다." },
  { id: "f_trout", cat: "fish", name: "산천어", rarity: 3, price: 18, where: W.R, time: ["day"], season: ["winter"], size: [20, 40], desc: "눈 녹은 찬물에서만 잡히는 겨울 손님." },
  { id: "f_koi", cat: "fish", name: "보너스 금잉어", rarity: 4, price: 42, where: W.L, time: ["day"], weather: ["clear"], size: [40, 90], desc: "맑은 날에만 금빛으로 반짝인다. 1년에 한 번 볼까 말까." },
  { id: "f_salmon", cat: "fish", name: "귀향 연어", rarity: 4, price: 44, where: W.R, time: ["dawn"], season: ["autumn"], size: [50, 90], desc: "가을 새벽, 명절처럼 고향 강으로 돌아온다." },
  { id: "f_sturgeon", cat: "fish", name: "철갑상어", rarity: 4, price: 47, where: W.L, time: ["night"], weather: ["fog"], size: [100, 220], desc: "안개 낀 밤 호수 바닥에서 올라오는 고대의 물고기." },
  { id: "f_king", cat: "fish", name: "정시퇴근 잉어왕", rarity: 5, price: 104, where: W.L, time: ["dusk"], weather: ["clear"], size: [90, 150], desc: "전설. 맑은 날 해질녘, 딱 퇴근 시간에만 나타난다는 소문." },
  { id: "f_moon", cat: "fish", name: "새벽 달빛 송어", rarity: 5, price: 104, where: W.R, time: ["dawn"], weather: ["fog"], size: [40, 70], desc: "안개 낀 새벽에만 비치는 달빛 비늘. 본 사람이 거의 없다." },
  { id: "f_shoe", cat: "fish", name: "출근 구두 한 짝", rarity: 1, price: 1, where: W.LR, junk: true, weight: 12, desc: "누가 강으로 출근했나 보다." },
  { id: "f_badge", cat: "fish", name: "잃어버린 사원증", rarity: 2, price: 3, where: W.LR, weather: ["rain", "fog", "cloudy"], junk: true, weight: 5, desc: "사진 속 얼굴이 묘하게 낯익다." },
  // 2차 (16) — 계절·날씨·새벽에 고루 흩어 둔다
  { id: "f_bitterling", cat: "fish", name: "납자루", rarity: 1, price: 4, where: W.R, time: ["day"], season: ["spring", "summer"], size: [4, 9], desc: "조개 속에 알을 맡긴다. 전세 계약서도 없이." },
  { id: "f_willow", cat: "fish", name: "버들치", rarity: 1, price: 4, where: W.R, time: ["dawn", "day"], size: [6, 13], desc: "계곡 찬물에서 누구보다 먼저 출근한다." },
  { id: "f_goby", cat: "fish", name: "밀어", rarity: 1, price: 3, where: W.L, time: ["dusk", "night"], size: [3, 7], desc: "바닥에 붙어 소곤소곤. 이름처럼 비밀 이야기를 좋아한다." },
  { id: "f_skygazer", cat: "fish", name: "강준치", rarity: 2, price: 8, where: W.L, time: ["dusk"], season: ["summer"], size: [30, 80], desc: "입이 하늘을 향해 있다. 늘 위만 본다." },
  { id: "f_nuchi", cat: "fish", name: "누치", rarity: 2, price: 8, where: W.R, time: ["day"], season: ["spring", "summer"], size: [20, 50], desc: "큰 몸집에 순한 얼굴. 여울을 천천히 거슬러 오른다." },
  { id: "f_lunchcarp", cat: "fish", name: "점심시간 떡붕어", rarity: 2, price: 9, where: W.L, time: ["day"], weather: ["clear", "cloudy"], size: [20, 45], desc: "열두 시 정각이면 물 위로 입을 뻐끔댄다." },
  { id: "f_grasscarp", cat: "fish", name: "초어", rarity: 2, price: 8, where: W.L, time: ["day", "dusk"], season: ["spring", "summer"], size: [40, 100], desc: "풀만 먹고도 1미터. 꾸준함의 힘." },
  { id: "f_report", cat: "fish", name: "물 먹은 보고서", rarity: 2, price: 3, where: W.R, weather: ["rain"], junk: true, weight: 4, desc: "결재란이 빗물에 번져 아무도 읽을 수 없다." },
  { id: "f_lenok", cat: "fish", name: "열목어", rarity: 3, price: 20, where: W.R, time: ["dawn", "day"], season: ["summer"], size: [30, 70], desc: "눈이 빨갛다. 밤새 보고서를 쓴 사람처럼." },
  { id: "f_miyugi", cat: "fish", name: "미유기", rarity: 3, price: 18, where: W.R, time: ["night"], season: ["autumn", "winter"], size: [15, 30], desc: "산골 계곡의 작은 메기. 찬 바람이 불면 수염을 세운다." },
  { id: "f_ungeo", cat: "fish", name: "웅어", rarity: 3, price: 18, where: W.R, time: ["dawn"], season: ["spring"], size: [20, 30], desc: "봄 새벽, 은빛 칼처럼 번쩍이며 강을 거슬러 온다." },
  { id: "f_whitefish", cat: "fish", name: "백조어", rarity: 3, price: 18, where: W.L, time: ["dawn", "dusk"], weather: ["fog", "cloudy"], size: [15, 35], desc: "백조처럼 흰 몸. 흐리거나 안개 낀 호수를 미끄러지듯 지난다." },
  { id: "f_goldmandarin", cat: "fish", name: "황쏘가리", rarity: 4, price: 44, where: W.R, time: ["dusk"], weather: ["clear", "cloudy"], season: ["summer"], size: [25, 50], desc: "천연기념물. 여름 해질녘 금빛 줄무늬가 번뜩인다." },
  { id: "f_huchen", cat: "fish", name: "자치", rarity: 4, price: 47, where: W.R, time: ["dawn", "day"], weather: ["snow"], season: ["winter"], size: [60, 120], desc: "눈 내리는 겨울 강의 은둔자. 사라졌다고들 했다." },
  { id: "f_ghostcarp", cat: "fish", name: "묘역 유령 잉어", rarity: 4, price: 44, where: W.L, time: ["dusk", "night"], weather: ["cloudy", "rain"], season: ["autumn"], size: [40, 90], desc: "비늘 너머가 비쳐 보인다. 끝내지 못한 낚시가 있었나 보다." },
  { id: "f_dragon", cat: "fish", name: "승진 용잉어", rarity: 5, price: 104, where: W.L, time: ["dawn"], weather: ["snow"], season: ["winter"], size: [80, 140], desc: "전설. 등용문을 넘은 잉어. 눈 오는 겨울 새벽에만 비늘을 보인다." },
];

// ── 11/16 바닷물고기 (10) ── 달물결 포구 갯바위·선착장 끝에서만 (where "sea"). 도감은 물고기 칸에 같이 들어가요 (물고기 50종).
// 만조 앞뒤엔 큰 놈이 더 잘 물어요 (lib/forage/service castLine — 크기 한 번 더 굴리기). 11/22 값은 위 물고기처럼 ×1.3
const SEA_FISH: Species[] = [
  { id: "f_mackerel", cat: "fish", name: "고등어", rarity: 1, price: 4, where: ["sea"], size: [20, 42], desc: "등이 새파랗다. 월요일 아침 출근길 얼굴빛." },
  { id: "f_horsemack", cat: "fish", name: "전갱이", rarity: 1, price: 4, where: ["sea"], time: ["day", "dusk", "night"], size: [15, 35], desc: "떼 지어 몰려다닌다. 점심시간 구내식당 줄처럼." },
  { id: "f_rockfish", cat: "fish", name: "우럭", rarity: 2, price: 8, where: ["sea"], time: ["dusk", "night", "dawn"], size: [20, 50], desc: "바위 틈에 숨어 입만 크다. 회의 때 목소리만 큰 사람 같다." },
  { id: "f_flounder", cat: "fish", name: "광어", rarity: 2, price: 9, where: ["sea"], time: ["dawn", "day"], size: [30, 80], desc: "두 눈이 한쪽에 몰려 있다. 모니터 두 대를 한 번에 본다." },
  { id: "f_mullet", cat: "fish", name: "숭어", rarity: 2, price: 8, where: ["sea"], size: [30, 70], desc: "툭하면 물 위로 뛰어오른다. 금요일 오후의 기분." },
  { id: "f_redbream", cat: "fish", name: "참돔", rarity: 3, price: 20, where: ["sea"], time: ["dawn", "dusk"], weather: ["clear", "cloudy"], size: [30, 90], desc: "분홍 비늘에 파란 점. 회식 자리 상석은 늘 이 녀석 차지." },
  { id: "f_cuttle", cat: "fish", name: "갑오징어", rarity: 3, price: 18, where: ["sea"], time: ["dusk", "night"], size: [15, 35], desc: "놀라면 먹물을 뿜고 사라진다. 결재 서류에 커피를 쏟은 날처럼." },
  { id: "f_octopus", cat: "fish", name: "문어", rarity: 3, price: 21, where: ["sea"], weather: ["cloudy", "fog", "rain"], size: [40, 150], desc: "팔이 여덟 개. 여덟 가지 일을 한꺼번에 해낸다." },
  { id: "f_yellowtail", cat: "fish", name: "대방어", rarity: 4, price: 44, where: ["sea"], time: ["dawn", "day"], season: ["autumn", "winter"], size: [70, 120], desc: "찬 바다의 주인. 연말 보너스처럼 기름이 잔뜩 올랐다." },
  { id: "f_whalescale", cat: "fish", name: "유령 고래 비늘", rarity: 5, price: 104, where: ["sea"], time: ["night"], weather: ["fog"], desc: "전설. 안개 낀 밤 먼바다에서 떠오른 커다란 은빛 비늘. 고래를 본 사람은 아직 없다." },
];

// ── 곤충 (30) ── 수풀에서 벌레 잡기 미니게임으로 (낮: 나비·잠자리 / 밤: 반딧불이)
const BUGS: Species[] = [
  { id: "b_cabbage", cat: "bug", name: "배추흰나비", rarity: 1, price: 3, where: ALL_GROUND, time: ["dawn", "day"], season: ["spring", "summer", "autumn"], size: [4, 6], desc: "하얀 날개로 팔랑팔랑. 가장 먼저 만나는 나비." },
  { id: "b_redfly", cat: "bug", name: "고추잠자리", rarity: 1, price: 3, where: ALL_GROUND, time: ["day", "dusk"], season: ["autumn"], size: [4, 5], desc: "가을 하늘을 빨갛게 칠하고 다닌다." },
  { id: "b_hopper", cat: "bug", name: "메뚜기", rarity: 1, price: 3, where: ALL_GROUND, time: ["day"], season: ["summer", "autumn"], size: [3, 6], desc: "잡으려는 순간 한 칸 더 멀리 뛴다." },
  { id: "b_ladybug", cat: "bug", name: "무당벌레", rarity: 1, price: 2, where: ALL_GROUND, time: ["dawn", "day"], size: [0.5, 0.9], desc: "점 일곱 개. 행운을 가져다준다고." },
  { id: "b_swallowtail", cat: "bug", name: "호랑나비", rarity: 2, price: 6, where: ALL_GROUND, time: ["day"], weather: ["clear", "cloudy"], season: ["spring", "summer", "autumn"], size: [7, 11], desc: "검은 줄무늬 날개가 화려하다." },
  { id: "b_mantis", cat: "bug", name: "사마귀", rarity: 2, price: 6, where: ALL_GROUND, time: ["day", "dusk"], season: ["summer", "autumn"], size: [6, 9], desc: "두 팔을 모으고 결재 서류를 기다리는 자세." },
  { id: "b_dung", cat: "bug", name: "출근길 쇠똥구리", rarity: 2, price: 6, where: ALL_GROUND, time: ["dawn"], size: [1.5, 3], desc: "새벽부터 무거운 공을 굴린다. 왠지 응원하고 싶다." },
  { id: "b_snowwing", cat: "bug", name: "눈꽃 나비", rarity: 3, price: 14, where: ALL_GROUND, time: ["day", "dusk"], weather: ["snow"], size: [3, 5], desc: "눈 오는 날에만 나타나는 하얀 날개." },
  { id: "b_gold", cat: "bug", name: "월급날 금풍뎅이", rarity: 4, price: 32, where: ALL_GROUND, time: ["day"], weather: ["clear"], size: [2, 4], desc: "맑은 날 딱 한 번 반짝. 잡으면 통장이 든든해지는 기분." },
  { id: "b_firefly", cat: "bug", name: "반딧불이", rarity: 1, price: 3, where: ALL_GROUND, time: ["dusk", "night"], size: [1, 1.8], desc: "이 마을의 밤에는 계절과 상관없이 반딧불이가 난다." },
  { id: "b_cricket", cat: "bug", name: "귀뚜라미", rarity: 1, price: 3, where: ALL_GROUND, time: ["dusk", "night"], season: ["summer", "autumn"], size: [1.5, 2.5], desc: "귀뚤귀뚤, 가을밤의 배경 음악." },
  { id: "b_moth", cat: "bug", name: "야근 나방", rarity: 1, price: 2, where: ALL_GROUND, time: ["night"], size: [3, 6], desc: "모니터 불빛을 보면 참지 못한다." },
  { id: "b_lunar", cat: "bug", name: "달빛 산누에나방", rarity: 3, price: 14, where: ALL_GROUND, time: ["night"], weather: ["clear"], size: [8, 12], desc: "연둣빛 긴 꼬리 날개. 맑은 밤에만 만난다." },
  { id: "b_stag", cat: "bug", name: "사슴벌레", rarity: 3, price: 14, where: ALL_GROUND, time: ["night"], season: ["summer"], size: [3, 8], desc: "여름밤 참나무의 주인. 집게가 멋지다." },
  { id: "b_rhino", cat: "bug", name: "장수풍뎅이", rarity: 4, price: 32, where: ALL_GROUND, time: ["night"], season: ["summer"], size: [4, 8.5], desc: "힘이 세다. 여름밤의 챔피언." },
  { id: "b_wisp", cat: "bug", name: "도깨비불 반딧불이", rarity: 4, price: 34, where: ALL_GROUND, time: ["night"], weather: ["fog"], size: [1.5, 2.5], desc: "안개 낀 밤, 묘역 쪽에서 푸르게 날아온다." },
  // 2차 (14) — 물가(호숫가)·숲에만 사는 것도 섞었다
  { id: "b_cicada", cat: "bug", name: "매미", rarity: 1, price: 3, where: ALL_GROUND, time: ["day"], season: ["summer"], size: [3, 5], desc: "맴맴. 여름 내내 같은 말만 한다. 주간 회의처럼." },
  { id: "b_bee", cat: "bug", name: "꿀벌", rarity: 1, price: 3, where: ["forest", "meadow"], time: ["dawn", "day"], weather: ["clear", "cloudy"], season: ["spring", "summer"], size: [1, 1.5], desc: "꽃에서 꽃으로, 하루 종일 외근 중." },
  { id: "b_ant", cat: "bug", name: "일개미", rarity: 1, price: 2, where: ALL_GROUND, time: ["day"], season: ["spring", "summer", "autumn"], size: [0.4, 1.2], desc: "주말에도 줄 맞춰 출근한다." },
  { id: "b_skimmer", cat: "bug", name: "밀잠자리", rarity: 2, price: 6, where: ["lakeside", "meadow"], time: ["day"], weather: ["clear"], season: ["summer"], size: [4, 5.5], desc: "파란 꼬리로 물가를 순찰한다." },
  { id: "b_strider", cat: "bug", name: "소금쟁이", rarity: 2, price: 6, where: ["lakeside"], time: ["dawn", "day", "dusk"], season: ["spring", "summer"], size: [1, 2.5], desc: "물 위를 걷는다. 출근길이 막힐 일이 없다." },
  { id: "b_katydid", cat: "bug", name: "여치", rarity: 2, price: 6, where: ["meadow", "forest"], time: ["dusk", "night"], season: ["summer", "autumn"], size: [3, 5], desc: "풀숲에서 찌르르. 베짱이와 헷갈리지만 더 부지런하다." },
  { id: "b_stink", cat: "bug", name: "노린재", rarity: 2, price: 6, where: ALL_GROUND, time: ["day"], weather: ["cloudy", "fog"], season: ["autumn"], size: [1, 1.6], desc: "건드리면 고약한 냄새. 퇴근 직전에 떨어진 급한 일 같다." },
  { id: "b_jewel", cat: "bug", name: "비단벌레", rarity: 3, price: 15, where: ["forest"], time: ["day"], weather: ["clear"], season: ["summer"], size: [2.5, 4], desc: "초록·보랏빛 비단 날개. 옛 왕관 장식에도 쓰였다." },
  { id: "b_mayfly", cat: "bug", name: "하루살이", rarity: 3, price: 14, where: ["lakeside", "meadow"], time: ["dusk"], weather: ["cloudy", "fog"], season: ["spring"], size: [1, 2], desc: "딱 하루만 산다. 내일 출근 걱정이 없다." },
  { id: "b_anglewing", cat: "bug", name: "네발나비", rarity: 3, price: 14, where: ALL_GROUND, time: ["day"], weather: ["clear"], season: ["winter", "spring"], size: [4, 6], desc: "볕 좋은 겨울 낮이면 깨어나 날개를 말린다." },
  { id: "b_hawkmoth", cat: "bug", name: "박각시", rarity: 3, price: 15, where: ALL_GROUND, time: ["dusk"], weather: ["rain", "cloudy"], season: ["summer", "autumn"], size: [5, 9], desc: "벌새처럼 제자리에서 날며 꿀을 빤다. 궂은 날 해질녘에." },
  { id: "b_emperor", cat: "bug", name: "왕오색나비", rarity: 4, price: 34, where: ["forest"], time: ["day"], season: ["summer"], size: [7, 10], desc: "보랏빛 날개를 펼치면 숲이 잠깐 조용해진다." },
  { id: "b_wintermoth", cat: "bug", name: "겨울자나방", rarity: 4, price: 32, where: ALL_GROUND, time: ["night"], weather: ["snow", "fog"], season: ["winter"], size: [2, 4], desc: "모두 잠든 겨울밤에만 난다. 진정한 야근의 달인." },
  { id: "b_longhorn", cat: "bug", name: "장수하늘소", rarity: 5, price: 80, where: ["forest"], time: ["dawn"], weather: ["fog", "rain"], season: ["summer"], size: [6, 11], desc: "전설. 천연기념물. 안개나 비 내린 여름 새벽 고목에서만 봤다는 이야기." },
];

// ── 약초·버섯 (28) ──
const HERBS: Species[] = [
  { id: "h_mugwort", cat: "herb", name: "쑥", rarity: 1, price: 2, where: ["forest", "meadow", "lakeside"], desc: "어디서나 쑥쑥. 떡을 하면 맛있다." },
  { id: "h_dandelion", cat: "herb", name: "민들레", rarity: 1, price: 2, where: ["meadow", "lakeside", "hill"], season: ["spring", "summer"], desc: "후 불면 홀씨가 출장을 떠난다." },
  { id: "h_clover", cat: "herb", name: "세잎클로버", rarity: 1, price: 2, where: ["meadow", "lakeside"], desc: "행복이라는 꽃말. 행운보다 흔하다." },
  { id: "h_shepherd", cat: "herb", name: "냉이", rarity: 1, price: 2, where: ["meadow", "forest"], season: ["spring"], desc: "봄이 왔다는 향기." },
  { id: "h_shiitake", cat: "herb", name: "표고버섯", rarity: 1, price: 3, where: ["forest"], season: ["spring", "autumn", "winter"], desc: "참나무 그늘에서 자란다." },
  { id: "h_bellflower", cat: "herb", name: "도라지", rarity: 2, price: 6, where: ["hill", "forest"], season: ["summer", "autumn"], desc: "심심산천의 하얀 꽃." },
  { id: "h_deodeok", cat: "herb", name: "더덕", rarity: 2, price: 6, where: ["forest", "hill"], desc: "캐는 순간 숲에 향이 퍼진다." },
  { id: "h_fern", cat: "herb", name: "고사리", rarity: 2, price: 6, where: ["forest"], season: ["spring"], desc: "봄 숲에서 동그랗게 말린 새순." },
  { id: "h_mistletoe", cat: "herb", name: "겨우살이", rarity: 2, price: 6, where: ["forest", "hill"], season: ["winter"], desc: "겨울나무에 매달린 초록 구슬." },
  { id: "h_glowcap", cat: "herb", name: "카페인 버섯", rarity: 2, price: 7, where: ["forest"], time: ["night"], desc: "밤에 은은하게 빛난다. 먹으면 잠이 안 올 것 같다." },
  { id: "h_fourleaf", cat: "herb", name: "네잎클로버", rarity: 3, price: 14, where: ["meadow", "lakeside"], weather: ["clear"], desc: "맑은 날 풀밭에서 아주 가끔. 행운." },
  { id: "h_songi", cat: "herb", name: "송이버섯", rarity: 3, price: 16, where: ["forest"], season: ["autumn"], desc: "가을 솔숲의 귀한 선물." },
  { id: "h_reishi", cat: "herb", name: "영지버섯", rarity: 3, price: 14, where: ["forest", "hill"], weather: ["rain", "fog"], desc: "비 오는 숲에서 윤기가 흐른다." },
  { id: "h_ginseng", cat: "herb", name: "야근 산삼", rarity: 4, price: 34, where: ["forest", "hill"], time: ["night"], desc: "밤샘의 기운이 깃든 뿌리. 한 뿌리면 내일도 버틴다." },
  { id: "h_cordyceps", cat: "herb", name: "동충하초", rarity: 4, price: 32, where: ["hill"], season: ["winter"], desc: "겨울엔 벌레, 여름엔 풀. 언덕 눈밭에서." },
  // 2차 (13)
  { id: "h_dropwort", cat: "herb", name: "미나리", rarity: 1, price: 2, where: ["lakeside", "meadow"], season: ["spring"], desc: "물가에서 쑥쑥 자란다. 봄의 아삭함." },
  { id: "h_plantain", cat: "herb", name: "질경이", rarity: 1, price: 2, where: ["meadow", "hill", "lakeside"], desc: "밟혀도 다시 일어난다. 월요일 아침의 우리처럼." },
  { id: "h_oyster", cat: "herb", name: "느타리버섯", rarity: 1, price: 3, where: ["forest"], weather: ["cloudy", "rain", "fog"], season: ["spring", "autumn"], desc: "비 온 뒤 쓰러진 나무에 층층이 돋는다." },
  { id: "h_gomchwi", cat: "herb", name: "곰취", rarity: 2, price: 6, where: ["forest", "hill"], season: ["spring"], desc: "산그늘의 넓은 잎. 쌈 싸 먹으면 봄이 입에 들어온다." },
  { id: "h_omija", cat: "herb", name: "오미자", rarity: 2, price: 6, where: ["forest", "hill"], season: ["autumn"], desc: "다섯 가지 맛. 월요일 맛부터 금요일 맛까지." },
  { id: "h_lotus", cat: "herb", name: "연꽃", rarity: 2, price: 7, where: ["lakeside"], time: ["dawn", "day"], season: ["summer"], desc: "진흙 속에서도 깨끗하게 핀다." },
  { id: "h_hovenia", cat: "herb", name: "회식 헛개 열매", rarity: 2, price: 6, where: ["forest", "hill"], time: ["dusk", "night"], season: ["autumn", "winter"], desc: "회식 다음 날 아침에 유난히 생각난다." },
  { id: "h_adonis", cat: "herb", name: "복수초", rarity: 3, price: 14, where: ["hill", "forest"], time: ["day"], weather: ["snow", "clear"], season: ["winter", "spring"], desc: "눈을 뚫고 피는 노란 꽃. 새해 첫 출근의 각오." },
  { id: "h_edelweiss", cat: "herb", name: "솜다리", rarity: 3, price: 15, where: ["hill"], weather: ["fog", "cloudy"], season: ["summer"], desc: "한국의 에델바이스. 언덕 바위틈에서만 핀다." },
  { id: "h_morel", cat: "herb", name: "곰보버섯", rarity: 3, price: 14, where: ["forest"], weather: ["rain", "cloudy"], season: ["spring"], desc: "봄비 온 뒤 숲 바닥에 불쑥. 생김새와 달리 귀하다." },
  { id: "h_chaga", cat: "herb", name: "차가버섯", rarity: 4, price: 32, where: ["forest", "hill"], time: ["dawn", "day"], season: ["winter"], desc: "자작나무에 붙은 검은 덩어리. 겨울에만 눈에 띈다." },
  { id: "h_ghostpipe", cat: "herb", name: "나도수정초", rarity: 4, price: 34, where: ["forest"], weather: ["rain", "fog"], season: ["summer"], desc: "잎도 초록도 없는 하얀 풀. 비 오는 여름 숲 그늘에 유령처럼 선다." },
  { id: "h_elixir", cat: "herb", name: "불로초", rarity: 5, price: 80, where: ["hill"], time: ["dawn"], weather: ["fog"], desc: "전설. 진시황도 못 찾은 풀. 안개 낀 새벽 언덕에 잠깐 보인다." },
];

// ── 광석 (20) ──
const ORES: Species[] = [
  { id: "o_pebble", cat: "ore", name: "매끈한 조약돌", rarity: 1, price: 1, where: ["hill", "cave", "lakeside"], desc: "책상 위 문진으로 딱 좋다." },
  { id: "o_coal", cat: "ore", name: "석탄", rarity: 1, price: 3, where: ["hill", "cave"], desc: "모닥불에 넣으면 오래 탄다." },
  { id: "o_copper", cat: "ore", name: "구리 광석", rarity: 1, price: 3, where: ["hill", "cave"], desc: "붉은빛이 도는 흔한 광석." },
  { id: "o_iron", cat: "ore", name: "철광석", rarity: 2, price: 6, where: ["hill", "cave"], desc: "무겁고 단단하다. 사냥터 대장장이가 좋아할 것 같다." },
  { id: "o_quartz", cat: "ore", name: "수정", rarity: 2, price: 7, where: ["hill", "lakeside", "cave"], desc: "빛을 비추면 무지개가 생긴다." },
  { id: "o_silver", cat: "ore", name: "은광석", rarity: 3, price: 14, where: ["cave", "hill"], desc: "달빛 같은 광택." },
  { id: "o_amethyst", cat: "ore", name: "자수정", rarity: 3, price: 15, where: ["hill"], time: ["dusk", "night"], desc: "해가 지면 보랏빛이 짙어진다." },
  { id: "o_gold", cat: "ore", name: "금광석", rarity: 4, price: 32, where: ["cave"], desc: "번쩍. 사냥터 동굴 어귀의 반짝임." },
  { id: "o_meteor", cat: "ore", name: "별똥별 조각", rarity: 4, price: 36, where: ["hill"], time: ["night"], weather: ["clear"], desc: "맑은 밤, 망원경 있는 언덕에 떨어진다." },
  { id: "o_diamond", cat: "ore", name: "사직서 다이아몬드", rarity: 5, price: 80, where: ["cave", "hill"], weather: ["fog", "snow"], desc: "무엇보다 단단하다. 내밀 용기만큼." },
  // 2차 (10)
  { id: "o_flint", cat: "ore", name: "부싯돌", rarity: 1, price: 2, where: ["hill", "cave"], desc: "탁 치면 불꽃이 튄다. 모닥불 피울 때 요긴하다." },
  { id: "o_lead", cat: "ore", name: "월요일 납 광석", rarity: 1, price: 3, where: ["cave"], desc: "들어 보면 묵직하다. 월요일 아침 발걸음처럼." },
  { id: "o_mica", cat: "ore", name: "운모", rarity: 2, price: 6, where: ["hill", "cave"], time: ["day"], desc: "얇게 벗겨지는 반짝이 판. 햇빛에 은빛으로 빛난다." },
  { id: "o_jade", cat: "ore", name: "옥", rarity: 2, price: 7, where: ["cave", "hill"], season: ["spring", "summer"], desc: "은은한 초록. 할머니 반지 속 그 돌." },
  { id: "o_garnet", cat: "ore", name: "석류석", rarity: 2, price: 6, where: ["cave"], season: ["autumn", "winter"], desc: "석류알처럼 붉게 박혀 있다." },
  { id: "o_obsidian", cat: "ore", name: "흑요석", rarity: 3, price: 14, where: ["cave", "hill"], time: ["dusk", "night"], weather: ["rain", "cloudy"], desc: "검은 유리 같은 돌. 궂은 밤엔 더 까맣다." },
  { id: "o_aquamarine", cat: "ore", name: "남옥", rarity: 3, price: 15, where: ["hill"], time: ["dawn", "day"], weather: ["clear"], season: ["summer"], desc: "바다를 닮은 푸른 결정. 여름 아침 햇살에 빛난다." },
  { id: "o_ruby", cat: "ore", name: "루비", rarity: 4, price: 34, where: ["cave"], time: ["night"], season: ["winter"], desc: "깜깜한 겨울밤에도 불씨처럼 붉다." },
  { id: "o_sapphire", cat: "ore", name: "사파이어", rarity: 4, price: 34, where: ["hill", "cave"], weather: ["rain"], season: ["spring"], desc: "봄비가 씻어 낸 언덕에서 파랗게 드러났다." },
  { id: "o_opal", cat: "ore", name: "성과급 오팔", rarity: 5, price: 80, where: ["cave"], time: ["dawn"], weather: ["rain"], desc: "전설. 보는 각도마다 색이 바뀐다. 성과급 기준처럼." },
];

// ── 발굴품 (24) ── 끝내지 못한 것들이 잠든 마을답게, 땅을 파면 누군가 묻어 둔 것들이 나온다
const DIGS: Species[] = [
  { id: "d_coin", cat: "dig", name: "옛날 동전", rarity: 1, price: 3, where: ["meadow", "forest", "hill", "lakeside"], desc: "십 원짜리. 요즘은 잘 안 보인다." },
  { id: "d_mug", cat: "dig", name: "이 빠진 회사 머그컵", rarity: 1, price: 2, where: ["meadow", "forest", "lakeside"], desc: "'창립 10주년 기념'이라고 적혀 있다." },
  { id: "d_cap", cat: "dig", name: "병뚜껑", rarity: 1, price: 1, where: ["meadow", "lakeside", "forest", "hill"], desc: "꽝. 다음 기회에." },
  { id: "d_key", cat: "dig", name: "녹슨 열쇠", rarity: 2, price: 6, where: ["forest", "hill", "meadow"], desc: "어느 문의 열쇠였을까." },
  { id: "d_floppy", cat: "dig", name: "플로피 디스크", rarity: 2, price: 6, where: ["meadow", "forest"], desc: "'최종_진짜최종_수정3.doc'이 들어 있다." },
  { id: "d_diary", cat: "dig", name: "사흘 쓴 일기장", rarity: 2, price: 6, where: ["meadow", "lakeside", "forest"], desc: "1월 1일, 1월 2일, 1월 3일 … 그 뒤는 비어 있다." },
  { id: "d_usb", cat: "dig", name: "잃어버린 USB", rarity: 2, price: 7, where: ["meadow", "forest", "lakeside"], weather: ["rain", "cloudy", "fog"], desc: "백업이라고 적혀 있다. 무엇의 백업인지는 아무도 모른다." },
  { id: "d_plan", cat: "dig", name: "포기한 사이드 프로젝트 기획서", rarity: 3, price: 14, where: ["meadow", "forest", "hill"], desc: "'이번엔 진짜 끝까지 한다' — 3페이지에서 멈췄다." },
  { id: "d_pottery", cat: "dig", name: "옛 토기 조각", rarity: 3, price: 14, where: ["hill", "forest"], desc: "빗살무늬가 또렷하다." },
  { id: "d_fossil", cat: "dig", name: "공룡 화석 조각", rarity: 3, price: 16, where: ["hill", "meadow"], desc: "아주 오래전에도 누군가 여기 잠들었다." },
  { id: "d_capsule", cat: "dig", name: "타임캡슐", rarity: 4, price: 32, where: ["meadow", "forest"], season: ["winter", "spring"], desc: "'10년 뒤의 나에게 — 열어 보지 말 것.'" },
  { id: "d_ring", cat: "dig", name: "금반지", rarity: 4, price: 34, where: ["lakeside", "meadow"], time: ["day"], weather: ["clear"], desc: "햇빛에 반짝여서 찾았다." },
  { id: "d_crown", cat: "dig", name: "황금 왕관", rarity: 5, price: 80, where: ["hill", "forest"], time: ["dusk", "night"], desc: "이 마을이 생기기 전, 누군가의 꿈." },
  // 2차 (11)
  { id: "d_clip", cat: "dig", name: "녹슨 클립", rarity: 1, price: 1, where: ["meadow", "forest", "hill", "lakeside"], desc: "서류를 묶던 시절이 있었다." },
  { id: "d_marble", cat: "dig", name: "유리구슬", rarity: 1, price: 2, where: ["meadow", "lakeside"], desc: "구슬치기 왕이 묻어 둔 보물." },
  { id: "d_pager", cat: "dig", name: "삐삐", rarity: 2, price: 6, where: ["meadow", "forest"], desc: "'8282'가 찍혀 있다. 지금이라도 가 봐야 하나." },
  { id: "d_cards", cat: "dig", name: "명함 한 묶음", rarity: 2, price: 6, where: ["forest", "hill", "meadow"], time: ["dusk", "night"], desc: "같은 이름에 직함만 세 번 바뀌었다." },
  { id: "d_cassette", cat: "dig", name: "카세트테이프", rarity: 2, price: 6, where: ["meadow", "lakeside", "forest"], season: ["summer"], desc: "'여름휴가 노래 모음' — A면만 늘어났다." },
  { id: "d_arrowhead", cat: "dig", name: "돌화살촉", rarity: 3, price: 14, where: ["hill", "meadow"], weather: ["rain", "cloudy"], desc: "비에 씻겨 드러난 뾰족한 돌." },
  { id: "d_celadon", cat: "dig", name: "청자 조각", rarity: 3, price: 15, where: ["forest", "hill"], season: ["spring"], desc: "비췻빛이 아직 살아 있다." },
  { id: "d_letter", cat: "dig", name: "부치지 못한 편지", rarity: 3, price: 14, where: ["lakeside", "meadow"], time: ["dusk"], season: ["autumn"], desc: "'잘 지내?' 한 줄에서 멈췄다." },
  { id: "d_mirror", cat: "dig", name: "청동 거울", rarity: 4, price: 34, where: ["hill", "forest"], time: ["night"], weather: ["clear"], desc: "달빛을 비추면 뒷면 무늬가 떠오른다." },
  { id: "d_shoes", cat: "dig", name: "금동 신발", rarity: 4, price: 32, where: ["hill", "forest"], weather: ["fog"], season: ["summer"], desc: "누군가 먼 길 떠날 때 신겨 준 신발." },
  { id: "d_goldkey", cat: "dig", name: "정년퇴임 황금 열쇠", rarity: 5, price: 80, where: ["meadow", "lakeside"], time: ["dawn"], weather: ["snow"], desc: "전설. 30년 근속의 증표. 눈 오는 새벽에만 반짝 보인다." },
];

// ── 11/16 갯벌 (10) ── 달물결 포구 갯벌 구멍에서 물이 빠졌을 때만 캐요 (where "flat"). 도감은 발굴품 칸에 같이 들어가요 (발굴품 34종).
// 갯벌은 한 물때(3시간)에 한 시간만 열려서 새벽(5~7시)엔 열리지 않아요 → 새벽 조건을 두지 않아요
const FLAT_DIGS: Species[] = [
  { id: "d_clam", cat: "dig", name: "바지락", rarity: 1, price: 3, where: ["flat"], desc: "호미질 한 번에 우르르. 갯벌의 기본급." },
  { id: "d_mudcrab", cat: "dig", name: "칠게", rarity: 1, price: 2, where: ["flat"], desc: "구멍 사이를 옆으로 바쁘게 다닌다. 외근 나가는 길." },
  { id: "d_whelk", cat: "dig", name: "고둥", rarity: 1, price: 3, where: ["flat"], desc: "느릿느릿 줄을 그으며 간다. 그래도 정시에 도착한다." },
  { id: "d_razor", cat: "dig", name: "맛조개", rarity: 2, price: 6, where: ["flat"], desc: "구멍에 소금을 뿌리면 쏙 올라온다. 칭찬에 약하다." },
  { id: "d_fiddler", cat: "dig", name: "농게", rarity: 2, price: 6, where: ["flat"], season: ["spring", "summer", "autumn"], desc: "빨간 집게 하나를 번쩍 든다. 회의 때 손 드는 사람." },
  { id: "d_turban", cat: "dig", name: "소라", rarity: 2, price: 7, where: ["flat"], desc: "귀에 대면 파도 소리가 난다. 퇴근길 이어폰 대신." },
  { id: "d_seacuc", cat: "dig", name: "해삼", rarity: 3, price: 14, where: ["flat"], season: ["autumn", "winter", "spring"], desc: "여름엔 잠만 잔다. 휴가 쓰는 법을 아는 녀석." },
  { id: "d_nakji", cat: "dig", name: "낙지", rarity: 3, price: 16, where: ["flat"], time: ["dusk", "night"], desc: "해가 지면 펄 속에서 슬그머니. 야근 끝난 사람처럼 축 늘어져 있다." },
  { id: "d_penshell", cat: "dig", name: "키조개", rarity: 4, price: 34, where: ["flat"], time: ["day"], weather: ["clear", "cloudy"], desc: "부채만 한 껍데기. 깊이 박혀 있어 한참을 파야 한다." },
  { id: "d_goldclam", cat: "dig", name: "금빛 바지락", rarity: 5, price: 80, where: ["flat"], time: ["day"], weather: ["clear"], desc: "전설. 맑은 날 갯벌에서 금빛으로 반짝인다. 월급날 통장 같은 빛." },
];

// ── 11/17 갈매기 깃털 (2) ── 포구에서 갈매기에게 과자를 던지면 가끔 고마움으로 떨어뜨려요 (서버 lib/sea/gullService가 굴려요).
// 채집 지점·낚시로는 나오지 않아요 (where "sea"인 발굴품 — 채집 지점엔 바다가 없고, 낚시는 물고기만). 도감은 발굴품 칸에 같이 들어가요 (발굴품 36종)
const GULL_DIGS: Species[] = [
  { id: "d_gullfeather", cat: "dig", name: "갈매기 깃털", rarity: 1, price: 3, where: ["sea"], desc: "과자 고마워요, 끼룩. 바닷바람 냄새가 배어 있다." },
  { id: "d_redfeather", cat: "dig", name: "붉은 갈매기 깃털", rarity: 2, price: 6, where: ["sea"], desc: "매운 새우 과자를 먹고 빨개진 갈매기가 떨어뜨렸다. 아직 따끈하다." },
];


// ── 11/26 캠핑장 개편: 캠핑장에서만 나오는 36종 ── (물고기 20 · 곤충 6 · 약초·버섯 6 · 돌 4). 도감은 원래 칸(물고기·곤충·약초·광석)에 같이 들어가요.
// 물고기: 옛길 계곡(valley) 10 · 달그늘 소(pool) 4 · 윤슬 낚시터(reservoir) 4 + 나룻배 위에서만(rowboat) 2. 희귀(★3) 이상은 직접 낚시만(directOnly).
// 채집: 캠핑장 숲(campwood) 곤충·약초 · 캠핑장 바위(camprock) 돌 — 캠핑장 채집 지점이 원래 종과 함께 뽑아요 (GatherNode.also).
// 33종(92%)은 겨울에도 나와요. 값은 마을 같은 등급과 같은 줄 (물고기 ×1.3 반영 뒤 값)
const CAMP_FISH: Species[] = [
  // 옛길 계곡 (10)
  { id: "f_kumgang", cat: "fish", name: "금강모치", rarity: 1, price: 4, where: ["valley"], size: [6, 10], desc: "찬물이 아니면 못 산다. 사무실 에어컨 바로 밑자리의 주인." },
  { id: "f_galgyeoni", cat: "fish", name: "갈겨니", rarity: 1, price: 4, where: ["valley"], time: ["dawn", "day", "dusk"], size: [10, 18], desc: "눈이 크고 겁이 많다. 그림자만 비쳐도 회의실 밖으로 흩어진다." },
  { id: "f_jonggae", cat: "fish", name: "참종개", rarity: 1, price: 3, where: ["valley"], size: [6, 12], desc: "모래 속에 몸을 묻고 눈만 내놓는다. 월요일 아침 이불 속의 나." },
  { id: "f_dongsari", cat: "fish", name: "동사리", rarity: 2, price: 8, where: ["valley"], time: ["dusk", "night"], size: [8, 16], desc: "바위 밑 구석 자리를 절대 안 내준다. 자율 좌석제가 와도 그대로다." },
  { id: "f_tunggari", cat: "fish", name: "퉁가리", rarity: 2, price: 8, where: ["valley"], time: ["night", "dawn"], size: [7, 12], desc: "가슴지느러미 가시에 쏘이면 얼얼하다. 조용한데 건드리면 맵다." },
  { id: "f_saekomi", cat: "fish", name: "새코미꾸리", rarity: 2, price: 9, where: ["valley"], time: ["day", "dusk"], size: [8, 15], desc: "주둥이가 빨갛다. 한겨울 바깥 미팅을 마치고 들어온 얼굴." },
  { id: "f_swiri", cat: "fish", name: "쉬리", rarity: 2, price: 8, where: ["valley"], time: ["dawn", "day"], weather: ["clear", "cloudy"], size: [8, 14], desc: "이름만 불러도 쉬고 싶어진다. 맑은 여울에서만 산다." },
  { id: "f_dukjung", cat: "fish", name: "둑중개", rarity: 3, price: 20, where: ["valley"], time: ["dawn", "dusk", "night"], season: ["winter", "spring"], size: [8, 15], directOnly: true, desc: "한겨울 찬물에서 알을 지킨다. 추울수록 출근 도장이 또렷하다." },
  { id: "f_kkuguri", cat: "fish", name: "꾸구리", rarity: 3, price: 18, where: ["valley"], time: ["day"], weather: ["clear", "cloudy"], size: [6, 12], directOnly: true, desc: "빛이 세면 눈꺼풀을 내린다. 모니터 밝기는 늘 최저." },
  { id: "f_eoreumchi", cat: "fish", name: "어름치", rarity: 4, price: 44, where: ["valley"], time: ["dawn", "day"], season: ["spring", "summer"], size: [20, 40], directOnly: true, desc: "천연기념물. 자갈을 탑처럼 쌓아 알을 숨긴다. 서류 더미 쌓기의 원조." },
  // 달그늘 소 (4) — 폭포 낚시 바위
  { id: "f_beodeulgae", cat: "fish", name: "버들개", rarity: 2, price: 9, where: ["pool"], size: [8, 15], desc: "폭포 물보라 아래 떼로 모인다. 탕비실 커피 머신 앞 같다." },
  { id: "f_gondal", cat: "fish", name: "곤들매기", rarity: 3, price: 21, where: ["pool"], time: ["dawn", "dusk"], season: ["autumn", "winter"], size: [20, 45], directOnly: true, desc: "얼음장 같은 소에서만 산다. 첫인상은 차가워도 무늬는 곱다." },
  { id: "f_lamprey", cat: "fish", name: "칠성장어", rarity: 4, price: 47, where: ["pool"], time: ["night"], weather: ["cloudy", "fog", "snow"], size: [30, 60], directOnly: true, desc: "옆구리 구멍 일곱 개가 북두칠성처럼 박혀 있다. 한번 붙으면 퇴근을 안 시켜 준다." },
  { id: "f_imugi", cat: "fish", name: "만년 대리 이무기", rarity: 5, price: 104, where: ["pool"], time: ["night", "dawn"], weather: ["fog", "snow"], size: [120, 300], directOnly: true, desc: "전설. 천 년을 기다렸는데 아직 대리다. 안개나 눈 오는 밤, 소 깊은 곳에서 승천 대신 기지개만 켠다." },
  // 윤슬 낚시터 (4) + 나룻배 위에서만 (2)
  { id: "f_chambung", cat: "fish", name: "참붕어", rarity: 1, price: 4, where: ["reservoir"], size: [5, 12], desc: "낚시터 매점 앞에 늘 모여 있다. 컵라면 국물 냄새를 안다." },
  { id: "f_molgae", cat: "fish", name: "몰개", rarity: 1, price: 3, where: ["reservoir"], time: ["day", "dusk"], size: [5, 10], desc: "작은 떼로 우르르 몰려다닌다. 점심 메뉴 정하러 나가는 팀처럼." },
  { id: "f_hyangeo", cat: "fish", name: "향어", rarity: 2, price: 9, where: ["reservoir"], size: [30, 70], desc: "낚시터 손맛 담당. 걸리면 의자에서 엉덩이가 들린다." },
  { id: "f_salchi", cat: "fish", name: "살치", rarity: 2, price: 8, where: ["reservoir"], time: ["dawn", "dusk"], size: [15, 25], desc: "월급날 전 지갑처럼 얇다. 해 뜰 녘과 해 질 녘에 은빛으로 뛴다." },
  { id: "f_kkeuri", cat: "fish", name: "끄리", rarity: 2, price: 9, where: ["rowboat"], time: ["day", "dusk"], size: [20, 40], desc: "배 밑 깊은 물에서 먹이를 쫓는다. 입이 삐뚤어져 늘 불만 있는 얼굴." },
  { id: "f_silvercarp", cat: "fish", name: "백련어", rarity: 3, price: 21, where: ["rowboat"], time: ["day"], weather: ["clear", "cloudy"], size: [50, 100], directOnly: true, desc: "노 젓는 소리에 놀라 배 옆으로 펄쩍 뛴다. 갑자기 잡힌 회의에 놀란 팀원 같다." },
];
const CAMP_BUGS: Species[] = [
  { id: "b_springtail", cat: "bug", name: "톡토기", rarity: 1, price: 2, where: ["campwood"], time: ["dawn", "day"], size: [0.1, 0.4], desc: "눈 위에 후추처럼 뿌려져 있다. 작아도 톡톡 잘 튄다." },
  { id: "b_cranefly", cat: "bug", name: "겨울각다귀", rarity: 1, price: 3, where: ["campwood"], time: ["day", "dusk"], season: ["autumn", "winter", "spring"], size: [1.5, 3], desc: "모기처럼 생겼지만 물지 않는다. 겉모습만 무서운 신입." },
  { id: "b_camelcricket", cat: "bug", name: "꼽등이", rarity: 2, price: 6, where: ["campwood"], time: ["dusk", "night"], size: [1.5, 2.5], desc: "텐트를 걷으면 꼭 한 마리 나온다. 놀라지 마요, 먼저 와서 자리 잡은 거예요." },
  { id: "b_caddis", cat: "bug", name: "돌집 날도래", rarity: 2, price: 6, where: ["campwood"], time: ["dusk"], season: ["spring", "summer", "autumn"], size: [1, 2.5], desc: "애벌레 때 계곡 돌로 집을 지었다. 대출 없이 지은 집." },
  { id: "b_rainbowbeetle", cat: "bug", name: "멋조롱박딱정벌레", rarity: 3, price: 14, where: ["campwood"], time: ["night"], size: [3, 4.5], desc: "썩은 통나무 속에서 무지갯빛 등을 빛낸다. 겨울잠도 멋을 내고 잔다." },
  { id: "b_snowscorp", cat: "bug", name: "눈밑들이", rarity: 4, price: 34, where: ["campwood"], time: ["day"], weather: ["snow", "cloudy"], season: ["winter"], size: [0.3, 0.6], desc: "날개 없이 눈 위를 걸어 다니는 겨울 곤충. 눈이 와도 걸어서 출근한다." },
];
const CAMP_HERBS: Species[] = [
  { id: "h_enoki", cat: "herb", name: "야생 팽이버섯", rarity: 1, price: 3, where: ["campwood"], season: ["autumn", "winter", "spring"], desc: "눈 속에서도 자라는 야생 팽이. 캠핑 라면에 넣으면 끝이다." },
  { id: "h_woodear", cat: "herb", name: "목이버섯", rarity: 1, price: 2, where: ["campwood"], desc: "죽은 나무에 귀처럼 붙어 있다. 회의 내용은 다 듣고 있다." },
  { id: "h_pinecone", cat: "herb", name: "잣송이", rarity: 2, price: 6, where: ["campwood"], season: ["autumn", "winter"], desc: "다람쥐가 숨겨 두고 잊었다. 비상금 숨긴 자리를 잊은 그 마음." },
  { id: "h_wildgarlic", cat: "herb", name: "산마늘", rarity: 2, price: 7, where: ["campwood"], season: ["spring"], desc: "봄 계곡 그늘의 명이나물. 고기 구울 때 꼭 찾게 된다." },
  { id: "h_poria", cat: "herb", name: "복령", rarity: 3, price: 15, where: ["campwood"], time: ["dawn", "day"], desc: "소나무 뿌리 밑 땅속 덩어리. 쇠꼬챙이로 한참 찔러 봐야 찾는다." },
  { id: "h_sanghwang", cat: "herb", name: "상황버섯", rarity: 4, price: 34, where: ["campwood"], weather: ["cloudy", "fog", "rain"], desc: "뽕나무에 붙은 노란 테 버섯. 이름처럼 상황 봐 가며 나타난다." },
];
const CAMP_ORES: Species[] = [
  { id: "o_skipstone", cat: "ore", name: "물수제비 납작돌", rarity: 1, price: 2, where: ["camprock"], desc: "다섯 번은 튈 것 같은 완벽한 납작돌. 던지기 아깝다." },
  { id: "o_suseok", cat: "ore", name: "계곡 수석", rarity: 2, price: 7, where: ["camprock"], desc: "산 모양이 들어앉은 돌. 부장님 책상 위로 갈 운명." },
  { id: "o_placer", cat: "ore", name: "계곡 사금", rarity: 3, price: 15, where: ["camprock"], time: ["day"], weather: ["clear"], desc: "볕 좋은 날 모래 사이에서 반짝인다. 체로 한참 걸러야 한 알." },
  { id: "o_moonstone", cat: "ore", name: "달그늘 월장석", rarity: 4, price: 36, where: ["camprock"], time: ["night"], weather: ["clear", "snow"], desc: "달빛이 비치면 푸르스름하게 떠오른다. 캠핑장 바위틈에서만 나온다." },
];

// ── 11/26 도감 확장 84종 (바닷가 48 · 캠핑장 36) ── 마을 종은 그대로, 맵 전용 종만 더해요 (~/Desktop/목요일작업/도감확장_종목록_초안.md).
// 바닷가 새 곳(모래 언덕·갯바위·바위 웅덩이·백사장)은 바닷가 뭍 지점이(lib/forage/seaNodes), 계곡 물가는 캠핑장 옛길 계곡 둑 지점이 뽑아요.
// 바다 물고기 +10 (바다 낚시 자리 그대로). 희귀(★3) 이상 넷은 직접 낚시만 — 자동 낚시 수입은 그대로
const SEA_FISH2: Species[] = [
  { id: "f_mangdung", cat: "fish", name: "망둥어", rarity: 1, price: 4, where: ["sea"], size: [8, 25], desc: "옆에서 뛰면 일단 같이 뛴다. 이유는 나중에 묻는다." },
  { id: "f_halfbeak", cat: "fish", name: "학꽁치", rarity: 1, price: 3, where: ["sea"], time: ["day", "dusk"], season: ["autumn", "winter", "spring"], size: [15, 40], desc: "아래턱만 길게 나왔다. 할 말은 많은데 꾹 참는 얼굴." },
  { id: "f_tshirt", cat: "fish", name: "워크숍 단체 티셔츠", rarity: 1, price: 1, where: ["sea"], junk: true, weight: 10, desc: "'2019 워크숍 — 우리는 하나'. 등판 이름은 누가 지웠다." },
  { id: "f_greenling", cat: "fish", name: "노래미", rarity: 2, price: 8, where: ["sea"], time: ["dawn", "day", "dusk"], size: [15, 40], desc: "바위 틈에서 혼자 흥얼거린다. 이름만 보고 노래방 총무를 맡기면 안 된다." },
  { id: "f_bollak", cat: "fish", name: "볼락", rarity: 2, price: 9, where: ["sea"], time: ["dusk", "night"], size: [12, 30], desc: "해가 지면 눈이 커진다. 퇴근하고 나서야 살아나는 타입." },
  { id: "f_puffer", cat: "fish", name: "졸복", rarity: 2, price: 8, where: ["sea"], weather: ["clear", "cloudy"], size: [8, 20], desc: "건드리면 배를 빵빵하게 부풀린다. 피드백 받은 날의 내 볼." },
  { id: "f_blackbream", cat: "fish", name: "감성돔", rarity: 3, price: 20, where: ["sea"], time: ["dawn", "dusk"], weather: ["cloudy", "fog", "rain"], season: ["autumn", "winter", "spring"], size: [25, 60], directOnly: true, desc: "갯바위 낚시꾼의 꿈. 감성이 풍부해서 흐린 날 더 잘 문다." },
  { id: "f_seabass", cat: "fish", name: "농어", rarity: 3, price: 21, where: ["sea"], time: ["dusk", "night", "dawn"], weather: ["rain", "cloudy"], season: ["summer", "autumn"], size: [40, 100], directOnly: true, desc: "파도가 거친 날 갯바위 앞까지 들이친다. 일이 몰리는 날 꼭 오는 손님." },
  { id: "f_knifejaw", cat: "fish", name: "돌돔", rarity: 4, price: 44, where: ["sea"], time: ["day"], weather: ["clear", "cloudy"], season: ["summer", "autumn"], size: [30, 70], directOnly: true, desc: "이빨로 소라 껍데기를 깨 먹는다. 연봉 협상 자리에 데려가고 싶다." },
  { id: "f_moonhair", cat: "fish", name: "달빛 은갈치", rarity: 5, price: 104, where: ["sea"], time: ["night"], weather: ["clear"], season: ["summer", "autumn"], size: [100, 220], directOnly: true, desc: "전설. 맑은 밤 달빛을 따라 꼿꼿이 선 채 헤엄친다. 꼬리 끝까지 재려면 줄자가 모자란다." },
];
// 바닷가 곤충 +12: 모래 언덕(dune)·갯바위(searock)·바위 웅덩이(tidepool)
const SEA_BUGS: Species[] = [
  { id: "b_seaslater", cat: "bug", name: "갯강구", rarity: 1, price: 2, where: ["searock", "tidepool"], size: [2, 4.5], desc: "갯바위 바퀴벌레라고 불리지만, 사실 바위를 치우는 성실한 청소 담당이다." },
  { id: "b_darkling", cat: "bug", name: "모래거저리", rarity: 1, price: 3, where: ["dune"], size: [0.6, 1.2], desc: "하루 종일 모래 언덕을 걷는다. 만보기는 늘 만 보를 넘긴다." },
  { id: "b_pyrgo", cat: "bug", name: "섬서구메뚜기", rarity: 1, price: 3, where: ["dune"], time: ["day"], season: ["summer", "autumn"], size: [2, 4], desc: "작은 수컷을 등에 업고 다닌다. 출근길 백팩처럼." },
  { id: "b_glider", cat: "bug", name: "된장잠자리", rarity: 1, price: 3, where: ["dune"], time: ["day", "dusk"], season: ["summer", "autumn"], size: [4, 5], desc: "바다 건너 남쪽에서 날아왔다. 해외 파견 마치고 돌아온 얼굴." },
  { id: "b_tigerbeetle", cat: "bug", name: "길앞잡이", rarity: 2, price: 6, where: ["dune"], time: ["day"], weather: ["clear"], season: ["spring", "summer", "autumn"], size: [1.5, 2], desc: "사람 앞에서 몇 걸음씩 앞서 날아간다. 길 안내는 하는데 목적지는 모른다." },
  { id: "b_earwig", cat: "bug", name: "큰집게벌레", rarity: 2, price: 6, where: ["dune", "searock"], time: ["dusk", "night"], size: [2, 3], desc: "밤이면 모래 밑에서 집게를 들고 나온다. 서류 집게보다 꽉 문다." },
  { id: "b_antlion", cat: "bug", name: "개미귀신", rarity: 2, price: 6, where: ["dune"], size: [0.8, 1.5], desc: "모래에 깔때기 구덩이를 파 놓고 기다린다. 한번 빠지면 못 나오는 회의실 같다." },
  { id: "b_seaskater", cat: "bug", name: "바다소금쟁이", rarity: 3, price: 14, where: ["tidepool"], time: ["day"], weather: ["clear"], season: ["summer", "autumn"], size: [0.4, 0.6], desc: "바다 위를 걷는 단 하나의 곤충. 평생 뭍으로 출근한 적이 없다." },
  { id: "b_antlionfly", cat: "bug", name: "명주잠자리", rarity: 3, price: 15, where: ["dune"], time: ["dusk", "night"], season: ["summer"], size: [3.5, 4], desc: "개미귀신 시절을 끝내고 날개를 달았다. 수습 기간을 무사히 넘긴 얼굴." },
  { id: "b_chestnut", cat: "bug", name: "왕나비", rarity: 4, price: 32, where: ["dune"], time: ["day"], weather: ["clear"], season: ["summer", "autumn"], size: [8, 10], desc: "바다를 건너 천 킬로미터를 난다. 출장비는 한 푼도 안 받는다." },
  { id: "b_seafirefly", cat: "bug", name: "바다반딧불이", rarity: 4, price: 34, where: ["tidepool"], time: ["night"], weather: ["clear", "cloudy"], size: [0.2, 0.3], desc: "밤 파도에 닿으면 파랗게 번진다. 꺼 둔 모니터 불빛보다 은은하다." },
  { id: "b_dragonmsg", cat: "bug", name: "용궁 전령 나비", rarity: 5, price: 80, where: ["dune"], time: ["dawn"], weather: ["fog"], size: [9, 13], desc: "전설. 안개 낀 새벽 바다 쪽에서 날아온다. 용왕님 결재 서류를 나른다는 소문." },
];
// 바닷가 약초·버섯 +12: 해초·갯나물·바닷가 꽃·버섯
const SEA_HERBS: Species[] = [
  { id: "h_tot", cat: "herb", name: "톳", rarity: 1, price: 2, where: ["searock"], desc: "갯바위에 다닥다닥. 뜯어 가도 다음 주면 또 그만큼 있다." },
  { id: "h_hamcho", cat: "herb", name: "함초", rarity: 1, price: 3, where: ["tidepool"], desc: "짠물만 먹고 자랐다. 그래서 월급처럼 짜다." },
  { id: "h_beachglory", cat: "herb", name: "갯메꽃", rarity: 1, price: 2, where: ["dune"], time: ["dawn", "day"], season: ["spring", "summer", "autumn"], desc: "모래 위로 덩굴을 뻗는다. 자리가 없으면 만들어서 앉는다." },
  { id: "h_parae", cat: "herb", name: "파래", rarity: 1, price: 2, where: ["searock", "tidepool"], season: ["autumn", "winter", "spring"], desc: "물 빠진 바위에 깔린 초록 카펫. 겨울 반찬 담당." },
  { id: "h_miyeok", cat: "herb", name: "미역", rarity: 2, price: 6, where: ["searock"], season: ["winter", "spring"], desc: "생일 아침엔 꼭 미역국. 사내 메신저 생일 알림보다 정확하다." },
  { id: "h_bangpung", cat: "herb", name: "갯방풍", rarity: 2, price: 6, where: ["dune"], season: ["spring", "summer"], desc: "모래 언덕에 납작 엎드려 바닷바람을 버틴다. 이름부터 바람막이." },
  { id: "h_haedang", cat: "herb", name: "해당화", rarity: 2, price: 7, where: ["dune"], time: ["day"], season: ["spring", "summer"], desc: "모래밭에 핀 분홍 꽃. 예쁘다고 덥석 잡으면 가시에 찔린다." },
  { id: "h_agar", cat: "herb", name: "우뭇가사리", rarity: 2, price: 6, where: ["searock", "tidepool"], season: ["spring", "summer"], desc: "끓여 식히면 우무가 된다. 여름 콩국 속 반투명한 그 녀석." },
  { id: "h_laver", cat: "herb", name: "돌김", rarity: 3, price: 14, where: ["searock"], time: ["dawn", "day"], weather: ["clear", "cloudy"], season: ["winter"], desc: "한겨울 갯바위에서 한 장씩 뜯는다. 도시락 반찬 서열 1위." },
  { id: "h_sandball", cat: "herb", name: "모래밭버섯", rarity: 3, price: 15, where: ["dune"], weather: ["rain", "cloudy", "fog"], season: ["summer", "autumn"], desc: "비 온 뒤 모래에서 감자처럼 불쑥. 쪼개 보면 속이 까만 가루투성이다." },
  { id: "h_pungran", cat: "herb", name: "풍란", rarity: 4, price: 34, where: ["searock"], weather: ["fog", "cloudy"], desc: "바닷바람 부는 바위에 뿌리만 걸고 산다. 사무실 화분 중 유일하게 안 죽을 녀석." },
  { id: "h_dragonkelp", cat: "herb", name: "용궁 미역", rarity: 5, price: 80, where: ["searock", "tidepool"], time: ["dawn"], weather: ["fog"], desc: "전설. 한 줄기로 백 그릇이 나온다는 용궁 미역. 안개 낀 새벽 파도에 딱 한 번 밀려온다." },
];
// 바닷가 광석 +10: 몽돌·바다유리·진주 (갯바위·바위 웅덩이·백사장 beach)
const SEA_ORES: Species[] = [
  { id: "o_mongdol", cat: "ore", name: "몽돌", rarity: 1, price: 1, where: ["searock", "beach"], desc: "파도에 오래 굴러 모난 데가 없다. 산전수전 다 겪은 과장님처럼." },
  { id: "o_basalt", cat: "ore", name: "현무암 조각", rarity: 1, price: 2, where: ["searock", "tidepool"], desc: "구멍이 숭숭 뚫렸다. 빈틈없다던 일정표의 실제 모습." },
  { id: "o_seasalt", cat: "ore", name: "천일염 결정", rarity: 1, price: 3, where: ["tidepool"], time: ["day"], weather: ["clear"], desc: "바위 웅덩이가 마르면 하얗게 남는다. 사회생활의 맛을 굳혀 놓았다." },
  { id: "o_seaglass", cat: "ore", name: "바다유리", rarity: 2, price: 6, where: ["beach", "searock"], desc: "깨진 병이 파도에 몇 년 굴러 둥글어졌다. 모난 말도 시간이 지나면 이렇다." },
  { id: "o_columnar", cat: "ore", name: "주상절리 조각", rarity: 2, price: 7, where: ["searock"], desc: "육각 기둥으로 반듯하게 쪼개진다. 엑셀 칸 같은 돌." },
  { id: "o_pearl", cat: "ore", name: "진주", rarity: 3, price: 15, where: ["tidepool"], desc: "조개가 아픈 데를 감싸서 만들었다. 버틴 만큼 빛난다." },
  { id: "o_agate", cat: "ore", name: "바다 마노", rarity: 3, price: 14, where: ["beach", "searock"], weather: ["rain", "cloudy"], desc: "줄무늬가 겹겹이 쌓였다. 미뤄 둔 일도 이렇게 층이 진다." },
  { id: "o_blackpearl", cat: "ore", name: "흑진주", rarity: 4, price: 34, where: ["tidepool"], time: ["night"], desc: "회식 다음 날 다크서클 빛깔. 그래도 값은 제일 비싸다." },
  { id: "o_coral", cat: "ore", name: "붉은 산호 조각", rarity: 4, price: 32, where: ["searock", "beach"], weather: ["rain", "fog"], desc: "깊은 바다에서 떠밀려 온 붉은 가지. 회사 로비 수족관 장식과는 급이 다르다." },
  { id: "o_mermaid", cat: "ore", name: "인어의 눈물", rarity: 5, price: 80, where: ["searock", "tidepool"], time: ["night"], weather: ["clear"], desc: "전설. 맑은 밤 갯바위에 떨어진 푸른 구슬. 퇴사하던 인어가 흘렸다는 소문." },
];
// 바닷가 발굴품 +4: 백사장 모래 파기 (beach)
const SEA_DIGS2: Species[] = [
  { id: "d_sandflag", cat: "dig", name: "모래성 깃발", rarity: 1, price: 2, where: ["beach"], desc: "쌓다 만 모래성 꼭대기에 꽂혀 있었다. 깃발만 꽂고 끝난 프로젝트." },
  { id: "d_beachticket", cat: "dig", name: "옛 해수욕장 입장권", rarity: 2, price: 6, where: ["beach"], desc: "'1988 여름, 어른 300원'. 그때도 휴가는 사흘이었다." },
  { id: "d_bottlemail", cat: "dig", name: "병 속 편지", rarity: 3, price: 14, where: ["beach"], time: ["dawn", "dusk"], desc: "'이 편지를 찾은 분, 제 대신 월요일에 출근해 주세요.'" },
  { id: "d_ambergris", cat: "dig", name: "용연향", rarity: 4, price: 34, where: ["beach"], time: ["dawn"], weather: ["fog", "cloudy"], desc: "고래 배 속에서 나온 귀한 향 덩어리. 유령 고래 것이라는 말도 돈다." },
];
// 캠핑장 곤충 +9: 캠핑장 숲(campwood)·계곡 물가(campbank)
const CAMP_BUGS2: Species[] = [
  { id: "b_demoiselle", cat: "bug", name: "검은물잠자리", rarity: 1, price: 3, where: ["campbank"], time: ["day"], season: ["spring", "summer", "autumn"], size: [5, 6], desc: "까만 날개를 느릿느릿 접었다 편다. 결재 도장 찍기 전 뜸 들이는 손 같다." },
  { id: "b_stonefly", cat: "bug", name: "겨울강도래", rarity: 1, price: 2, where: ["campbank"], season: ["winter", "spring"], size: [0.8, 1.5], desc: "한겨울 눈 위로 기어 나온다. 물이 더러워지면 제일 먼저 사표를 낸다." },
  { id: "b_mosquito", cat: "bug", name: "모기", rarity: 1, price: 2, where: ["campwood"], time: ["dusk", "night"], size: [0.4, 0.7], desc: "한겨울에도 난로 켠 텐트 안엔 꼭 한 마리 있다." },
  { id: "b_groundbeetle", cat: "bug", name: "홍단딱정벌레", rarity: 2, price: 6, where: ["campwood"], time: ["dusk", "night"], size: [3, 4.5], desc: "붉은 갑옷을 입고 밤길을 순찰한다. 경비실 아저씨보다 부지런하다." },
  { id: "b_divingbeetle", cat: "bug", name: "물방개", rarity: 2, price: 6, where: ["campbank"], size: [3, 4], desc: "공기 방울을 꽁무니에 달고 잠수한다. 회의마다 텀블러 챙겨 오는 사람." },
  { id: "b_glacialis", cat: "bug", name: "모시나비", rarity: 3, price: 14, where: ["campwood"], time: ["day"], weather: ["clear"], season: ["spring", "summer"], size: [5, 6.5], desc: "모시처럼 얇은 날개가 비친다. 여름 쿨비즈 셔츠 같다." },
  { id: "b_dobson", cat: "bug", name: "뱀잠자리", rarity: 3, price: 15, where: ["campbank"], time: ["dusk", "night"], season: ["summer", "autumn"], size: [4, 6], desc: "애벌레 땐 계곡 돌 밑에서 낚시 미끼로 끌려갔다. 살아남아 날개를 단 생존자." },
  { id: "b_redspot", cat: "bug", name: "붉은점모시나비", rarity: 4, price: 34, where: ["campwood"], time: ["day"], weather: ["clear"], season: ["spring"], size: [6, 7], desc: "멸종위기 1급. 붉은 점 박힌 날개로 봄 산비탈을 딱 한 달만 난다." },
  { id: "b_gumiho", cat: "bug", name: "구미호 꼬리 나방", rarity: 5, price: 80, where: ["campwood"], time: ["night"], weather: ["fog", "snow"], size: [8, 12], desc: "전설. 안개 낀 밤 랜턴 불빛에 꼬리 아홉 개 그림자를 남긴다. 끝까지 세어 본 사람은 없다." },
];
// 캠핑장 약초·버섯 +9
const CAMP_HERBS2: Species[] = [
  { id: "h_rockmaple", cat: "herb", name: "돌단풍", rarity: 1, price: 2, where: ["campbank"], season: ["spring", "summer", "autumn"], desc: "계곡 바위틈에 뿌리를 내렸다. 자리 하나는 기막히게 잡는다." },
  { id: "h_moss", cat: "herb", name: "계곡 이끼", rarity: 1, price: 2, where: ["campbank", "campwood"], desc: "바위마다 초록 방석. 오래 앉아 있으면 엉덩이에도 자랄 것 같다." },
  { id: "h_darae", cat: "herb", name: "다래", rarity: 2, price: 6, where: ["campwood"], season: ["autumn"], desc: "산속 키위. 덩굴 꼭대기까지 올라가야 잘 익은 게 있다. 승진처럼." },
  { id: "h_chopi", cat: "herb", name: "초피 열매", rarity: 2, price: 6, where: ["campwood"], season: ["autumn", "winter"], desc: "씹으면 혀가 얼얼하다. 매운탕에 한 줌 넣으면 정신이 번쩍 든다." },
  { id: "h_kudzu", cat: "herb", name: "칡뿌리", rarity: 2, price: 7, where: ["campwood"], season: ["autumn", "winter", "spring"], desc: "캐도 캐도 끝이 안 나온다. 회의록 정리처럼." },
  { id: "h_lionmane", cat: "herb", name: "노루궁뎅이버섯", rarity: 3, price: 15, where: ["campwood"], weather: ["rain", "cloudy", "fog"], season: ["autumn"], desc: "하얀 털 뭉치처럼 생겼다. 노루 엉덩이를 본 사람만 이름을 이해한다." },
  { id: "h_wasabi", cat: "herb", name: "고추냉이", rarity: 3, price: 14, where: ["campbank"], time: ["dawn", "day"], desc: "찬 계곡물에서만 자란다. 갈아 먹으면 코끝이 찡, 아침 일곱 시 알람처럼." },
  { id: "h_neungi", cat: "herb", name: "능이버섯", rarity: 4, price: 34, where: ["campwood"], weather: ["rain", "fog"], season: ["autumn"], desc: "1능이 2표고 3송이. 향 하나로 버섯 서열 1위에 올랐다." },
  { id: "h_hasuo", cat: "herb", name: "천년 하수오", rarity: 5, price: 80, where: ["campwood"], time: ["dawn"], weather: ["snow", "fog"], desc: "전설. 먹으면 흰머리가 까매진다는 뿌리. 십 년 차 팀장님들이 눈 오는 새벽마다 찾아 헤맨다." },
];
// 캠핑장 돌 +8: 모두 캠핑장 바위(camprock)
const CAMP_ORES2: Species[] = [
  { id: "o_chadol", cat: "ore", name: "차돌", rarity: 1, price: 2, where: ["camprock"], desc: "차돌처럼 단단하다는 그 차돌. 차돌박이와는 아무 상관 없다." },
  { id: "o_gneiss", cat: "ore", name: "편마암 조각", rarity: 1, price: 3, where: ["camprock"], desc: "줄무늬가 구불구불 접혔다. 꽉 막힌 출근길 지도 같다." },
  { id: "o_petrified", cat: "ore", name: "규화목 조각", rarity: 2, price: 6, where: ["camprock"], desc: "나무였는데 돌이 됐다. 한자리에 너무 오래 앉아 있으면 이렇게 된다." },
  { id: "o_pyrite", cat: "ore", name: "황철석", rarity: 2, price: 7, where: ["camprock"], time: ["day"], weather: ["clear"], desc: "금인 줄 알고 심장이 뛰었다. 숫자 다섯 개 맞은 복권 같은 돌." },
  { id: "o_fluorite", cat: "ore", name: "형석", rarity: 3, price: 15, where: ["camprock"], time: ["night"], desc: "어둠 속에서 은은하게 빛난다. 퇴근하고 나서야 빛나는 사람." },
  { id: "o_topaz", cat: "ore", name: "황옥", rarity: 3, price: 14, where: ["camprock"], time: ["day"], weather: ["clear"], desc: "맑은 노란빛. 금요일 오후 네 시의 햇살 색." },
  { id: "o_orbicular", cat: "ore", name: "구상화강암", rarity: 4, price: 34, where: ["camprock"], weather: ["snow", "fog", "cloudy"], desc: "돌 속에 둥근 무늬가 꽃처럼 박혔다. 천연기념물급 우연." },
  { id: "o_yeouiju", cat: "ore", name: "이무기의 여의주", rarity: 5, price: 80, where: ["camprock"], time: ["night"], weather: ["snow", "fog"], desc: "전설. 만년 대리 이무기가 승진 심사 날 떨어뜨린 구슬. 아직 주인을 기다린다." },
];
// 캠핑장 발굴품 +10: 계곡·캠핑 유실물
const CAMP_DIGS: Species[] = [
  { id: "d_tentpeg", cat: "dig", name: "휜 텐트 팩", rarity: 1, price: 2, where: ["campwood"], desc: "망치질 세 번 만에 휘었다. 첫 캠핑의 기억." },
  { id: "d_sock", cat: "dig", name: "짝 잃은 등산 양말", rarity: 1, price: 1, where: ["campwood", "campbank"], desc: "나머지 한 짝은 지금도 어느 텐트 속에 있다." },
  { id: "d_coppel", cat: "dig", name: "녹슨 코펠 뚜껑", rarity: 1, price: 3, where: ["campbank"], desc: "라면 물 끓이던 그 뚜껑. 냄비는 어디로 갔을까." },
  { id: "d_film", cat: "dig", name: "빛바랜 캠핑 필름", rarity: 2, price: 6, where: ["campwood"], desc: "비춰 보면 다들 웃고 있다. 그날 종일 비 왔다고 들었는데." },
  { id: "d_float", cat: "dig", name: "부러진 낚시찌", rarity: 2, price: 6, where: ["campbank"], desc: "놓친 대어 이야기만 남았다. 들을 때마다 고기가 커진다." },
  { id: "d_knife", cat: "dig", name: "녹슨 주머니칼", rarity: 2, price: 7, where: ["campwood"], desc: "칼, 가위, 병따개, 정체 모를 무언가. 전부 녹슬어 안 펴진다." },
  { id: "d_rooftile", cat: "dig", name: "산신각 기와 조각", rarity: 3, price: 14, where: ["campwood"], weather: ["rain", "cloudy", "fog"], desc: "용 무늬가 반쯤 남았다. 옛길을 넘던 누군가 여기서 빌고 갔다." },
  { id: "d_trilobite", cat: "dig", name: "삼엽충 화석", rarity: 3, price: 15, where: ["campbank"], desc: "계곡 바위 속 5억 년 선배. 그때부터 같은 자세로 엎드려 있다." },
  { id: "d_yeopjeon", cat: "dig", name: "보부상 엽전 꾸러미", rarity: 4, price: 34, where: ["campwood", "campbank"], time: ["dusk", "night"], desc: "옛길을 넘던 장사꾼의 비상금. 돌아와 찾을 생각이었겠지." },
  { id: "d_goldaxe", cat: "dig", name: "산신령의 금도끼", rarity: 5, price: 80, where: ["campbank"], time: ["dawn"], weather: ["snow", "fog"], desc: "전설. '이 도끼가 네 도끼냐?' 정직하게 답한 사람만 눈 오는 새벽 계곡에서 줍는다." },
];

/** 11/26 캠핑장 전용 72종 id (시험·맵별 도감) — 개편 36 + 도감 확장 36 */
export const CAMP_SPECIES_IDS: readonly string[] = [...CAMP_FISH, ...CAMP_BUGS, ...CAMP_HERBS, ...CAMP_ORES, ...CAMP_BUGS2, ...CAMP_HERBS2, ...CAMP_ORES2, ...CAMP_DIGS].map((s) => s.id);
/** 11/26 도감 확장으로 더한 84종 id (시험) */
export const DEX_EXPANSION_IDS: readonly string[] = [...SEA_FISH2, ...SEA_BUGS, ...SEA_HERBS, ...SEA_ORES, ...SEA_DIGS2, ...CAMP_BUGS2, ...CAMP_HERBS2, ...CAMP_ORES2, ...CAMP_DIGS].map((s) => s.id);

/** 채집·낚시가 아니라 갈매기에게서만 받는 종 (시험이 「어딘가에서 잡힌다」를 이 둘만 빼고 봐요) */
export const GULL_FEATHER_IDS: readonly string[] = GULL_DIGS.map((s) => s.id);

// 11/26 캠핑장 종은 그 칸 끝에 (도감 번호는 원래 종 뒤로 이어져요). 도감 확장 종은 또 그 뒤에 (저장은 id라 번호만 바뀌어요)
export const SPECIES: readonly Species[] = [
  ...FISH,
  ...SEA_FISH,
  ...CAMP_FISH,
  ...SEA_FISH2,
  ...BUGS,
  ...CAMP_BUGS,
  ...CAMP_BUGS2,
  ...SEA_BUGS,
  ...HERBS,
  ...CAMP_HERBS,
  ...CAMP_HERBS2,
  ...SEA_HERBS,
  ...ORES,
  ...CAMP_ORES,
  ...CAMP_ORES2,
  ...SEA_ORES,
  ...DIGS,
  ...FLAT_DIGS,
  ...GULL_DIGS,
  ...SEA_DIGS2,
  ...CAMP_DIGS,
];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));
export const speciesById = (id: string): Species | undefined => BY_ID.get(id);
export const speciesOf = (cat: LifeCat): Species[] => SPECIES.filter((s) => s.cat === cat);
export const isSpeciesId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);
/** 11/16 바닷가에서만 나오는 것 (바닷물고기·갯벌, 11/26 모래 언덕·갯바위·바위 웅덩이·백사장). 수집 의뢰·긴급 의뢰 상자는 예전처럼 마을·캠핑장 것만 낸다 */
export const isSeasideSpecies = (s: Species): boolean => s.where.some((w) => SEA_WHERES.includes(w));
/** 11/26 캠핑장에서만 나오는 것 (캠핑장 전용 물·숲·바위) */
export const isCampSpecies = (s: Species): boolean => s.where.some((w) => CAMP_WHERES.includes(w));
/** 11/26 마을 밖(바닷가·캠핑장)에서만 나오는 것 — 수집 의뢰·긴급 의뢰 상자는 예전처럼 마을에서도 나오는 것만 */
export const isAwaySpecies = (s: Species): boolean => isSeasideSpecies(s) || isCampSpecies(s);

/**
 * 11/26 낚시 물 → 뽑는 곳 (서버 castLine·자동 낚시·화면 힌트가 같이 쓴다). 캠핑장 물은 전용 종 + 이어진 물의 종:
 * 옛길 계곡 = 계곡 + 강, 달그늘 소 = 소 + 계곡, 윤슬 낚시터 = 낚시터 + 호수, 나룻배 위 = 나룻배 전용 + 낚시터 + 호수
 */
export const WATER_WHERES: Record<FishWater, readonly Where[]> = {
  lake: ["lake"],
  river: ["river"],
  sea: ["sea"],
  valley: ["valley", "river"],
  pool: ["pool", "valley"],
  reservoir: ["reservoir", "lake"],
  rowboat: ["rowboat", "reservoir", "lake"],
};
/** 낚시 창 제목의 물 이름 (「낚시 · 옛길 계곡」) */
export const WATER_LABEL: Record<FishWater, string> = {
  lake: "호수",
  river: "강",
  sea: "바다",
  valley: WHERE_LABEL.valley,
  pool: WHERE_LABEL.pool,
  reservoir: WHERE_LABEL.reservoir,
  rowboat: WHERE_LABEL.rowboat,
};
/** 이 물고기가 잡히는 물 (힌트 — 「캠핑장 윤슬 낚시터에도 있어요」) */
export const watersOf = (s: Species): FishWater[] => (Object.keys(WATER_WHERES) as FishWater[]).filter((w) => WATER_WHERES[w].some((x) => s.where.includes(x)));

// ── 채집 지점 ── 맵 곳곳의 고정 후보 자리. 지금 피어 있는지는 사람마다 따로(lib/forage/rules nodeActive)
// 11/16 clam = 바닷가 갯벌 구멍 (캐는 것은 발굴품 칸 — 물이 빠졌을 때만, protocol seaDigOpen)
export type NodeKind = "herb" | "ore" | "dig" | "bug" | "clam";
export const NODE_LABEL: Record<NodeKind, string> = { herb: "약초 캐기", ore: "광석 캐기", dig: "땅 파 보기", bug: "수풀에서 곤충 잡기", clam: "갯벌 캐기" };
export const NODE_CAT: Record<NodeKind, LifeCat> = { herb: "herb", ore: "ore", dig: "dig", bug: "bug", clam: "dig" };
/**
 * map = 11/15 캠핑장 지점이면 "camp", 11/16 바닷가면 "sea" (좌표는 그 맵). 없으면 마을.
 * also = 11/26 이 지점에서 같이 뽑는 곳 (캠핑장 지점 = 캠핑장 숲·바위 전용 종도 — nodeWheres)
 */
export type GatherNode = { id: string; kind: NodeKind; where: Where; x: number; y: number; map?: "camp" | "sea"; also?: Where };

const node = (kind: NodeKind, where: Where, x: number, y: number): GatherNode => ({ id: `${kind[0]}${x}_${y}`, kind, where, x, y });
/**
 * 캠핑장 지점: id 앞에 q (마을 지점 id와 겹치지 않게 — 캠핑장 좌석 id와 같은 규칙).
 * 11/26 광석 지점은 캠핑장 바위(돌 4종), 나머지는 캠핑장 숲(곤충·약초 전용 종)도 같이 뽑아요 — 좌표만 옮겨도 그대로
 */
const campNode = (kind: NodeKind, where: Where, x: number, y: number, also?: Where): GatherNode => ({
  id: `q${kind[0]}${x}_${y}`,
  kind,
  where,
  x,
  y,
  map: "camp",
  // 11/26 도감 확장: 계곡 둑 지점은 계곡 물가(campbank)를 넘겨요
  also: also ?? (kind === "ore" ? "camprock" : "campwood"),
});

/**
 * 11/15 언젠가 캠핑장 채집 지점 (새 종은 없다 — 기존 종의 출현 장소만). 도감·피어나는 창은 마을과 같이 센다.
 * 둘레 숲 = 숲(forest), 카라반 골목 풀밭 = 풀밭(meadow), 달그늘 소·절벽 둘레 바위 = 언덕(hill) (11/26 폭포 계곡 개편 자리).
 * game/camp/campLayout.test가 서 있을 수 있는 곳·물 밖·자리와 떨어짐을 본다 (나무는 이 자리를 비켜 선다)
 */
export const CAMP_GATHER_NODES: readonly GatherNode[] = [
  // 11/26 폭포 계곡 개편 자리 (종류·장소 갈래 그대로): 곤충 숲 8 · 풀밭 3 / 약초 숲 8 · 언덕 1 · 풀밭 1 / 광석 소·절벽 둘레 8 / 발굴 숲 6
  campNode("bug", "forest", 60, 758),
  campNode("bug", "forest", 250, 770),
  campNode("bug", "forest", 860, 770),
  campNode("bug", "forest", 1238, 560),
  campNode("bug", "forest", 1262, 100),
  campNode("bug", "forest", 900, 62),
  campNode("bug", "forest", 330, 40),
  campNode("bug", "forest", 560, 780),
  campNode("bug", "meadow", 456, 492),
  // 11/26 5번 카라반 앞마당(탁자 뒤 의자)과 20px 넘게 띄우려고 위로
  campNode("bug", "meadow", 750, 506),
  campNode("bug", "meadow", 314, 300),
  campNode("herb", "forest", 120, 766),
  campNode("herb", "forest", 420, 780),
  campNode("herb", "forest", 958, 788),
  campNode("herb", "forest", 1262, 420),
  campNode("herb", "forest", 1100, 40),
  campNode("herb", "forest", 1222, 298),
  campNode("herb", "forest", 612, 782),
  campNode("herb", "forest", 1186, 781),
  campNode("herb", "hill", 870, 240),
  campNode("herb", "meadow", 564, 440),
  campNode("ore", "hill", 426, 238),
  campNode("ore", "hill", 840, 250),
  campNode("ore", "hill", 508, 362),
  campNode("ore", "hill", 774, 360),
  campNode("ore", "hill", 930, 330),
  campNode("ore", "hill", 1262, 200),
  campNode("ore", "hill", 440, 596),
  campNode("ore", "hill", 1000, 582),
  campNode("dig", "forest", 180, 780),
  campNode("dig", "forest", 700, 780),
  campNode("dig", "forest", 1010, 775),
  campNode("dig", "forest", 30, 600),
  campNode("dig", "forest", 1262, 700),
  campNode("dig", "forest", 330, 770),
  // 11/26 도감 확장: 옛길 계곡 둑 (10) — 곤충 2·약초 2·발굴 4는 호숫가 + 계곡 물가, 광석 2는 폭포 다리 아래 둑 바위 (언덕 + 캠핑장 바위)
  campNode("bug", "lakeside", 600, 500, "campbank"),
  campNode("bug", "lakeside", 716, 560, "campbank"),
  campNode("herb", "lakeside", 610, 590, "campbank"),
  campNode("herb", "lakeside", 714, 624, "campbank"), // 초안 712,650은 단풍나무 잎에 가려 조금 위로
  campNode("ore", "hill", 604, 420),
  campNode("ore", "hill", 720, 470),
  // 11/26 2번 카라반 앞마당(3단계 화롯대 통나무)과 20px 넘게 띄우려고 4·4 비켜 (id도 바뀐다 — 채집 지점은 저장하지 않는다)
  campNode("dig", "lakeside", 608, 554, "campbank"),
  campNode("dig", "lakeside", 700, 700, "campbank"),
  campNode("dig", "lakeside", 590, 740, "campbank"),
  campNode("dig", "lakeside", 690, 746, "campbank"),
];

/**
 * 11/16 바닷가 갯벌 구멍 (protocol SEA_DIG_HOLES 자리 그대로, id 앞에 s). 물이 빠져 구멍이 드러났을 때만 캔다 (서버 lib/forage/service startGather)
 */
export const SEA_GATHER_NODES: readonly GatherNode[] = SEA_DIG_HOLES.map((h) => ({ id: `sc${h.x}_${h.y}`, kind: "clam", where: "flat", x: h.x, y: h.y, map: "sea" }));

/** lib/forage/forage.test.ts가 서 있을 수 있는 자리·물 밖·소품/좌석과 떨어짐을 검사한다 */
// 11/19 언덕 서쪽이 옛 묘역(무덤 16기)이 되어 그 안·철책 둘레의 언덕 지점 여섯을 별 보기 마당으로 옮겼다 (지점 id도 바뀐다)
export const GATHER_NODES: readonly GatherNode[] = [
  // 약초 (14 + 11/16 6)
  node("herb", "forest", 396, 794), // 11/15 오리 연못이 넓어져 둑 위로 옮김 (아래 숲 지점들도). 11/16 연못·범퍼카장이 또 넓어져 물·마당에 든 지점을 둑으로
  node("herb", "forest", 596, 966),
  node("herb", "forest", 498, 796),
  node("herb", "forest", 536, 1002),
  node("herb", "forest", 206, 606), // 11/16 바닷가행 정류장 정차 칸(예전 60,640)을 비워 정류장 옆 풀밭으로
  node("herb", "forest", 412, 1000),
  node("herb", "forest", 324, 826),
  node("herb", "meadow", 956, 860),
  node("herb", "meadow", 1050, 906),
  node("herb", "meadow", 1110, 962),
  node("herb", "meadow", 990, 998),
  node("herb", "hill", 352, 100),
  node("herb", "hill", 300, 200),
  node("herb", "lakeside", 1150, 1000),
  // 11/16 더 (6): 언덕 · 강가 서쪽 · 오리 연못 둘레 둘 · 호박밭 · 호수 북쪽 물가
  node("herb", "hill", 214, 174),
  node("herb", "forest", 160, 656),
  node("herb", "forest", 600, 824),
  node("herb", "forest", 348, 782),
  node("herb", "meadow", 1037, 874),
  node("herb", "lakeside", 1200, 806),
  // 광석 (8 + 11/16 4)
  node("ore", "hill", 270, 56),
  node("ore", "hill", 356, 158),
  node("ore", "hill", 330, 160),
  node("ore", "hill", 232, 142),
  node("ore", "cave", 790, 140),
  node("ore", "cave", 840, 150),
  node("ore", "cave", 880, 92),
  node("ore", "cave", 950, 90),
  // 11/16 더 (4): 언덕 둘 · 동굴 앞 둘
  node("ore", "hill", 220, 60),
  node("ore", "hill", 340, 60),
  node("ore", "cave", 914, 150),
  node("ore", "cave", 812, 78),
  // 발굴 (8 + 11/16 4)
  node("dig", "meadow", 1000, 872),
  node("dig", "meadow", 1080, 942),
  node("dig", "meadow", 1060, 1004), // 11/16 호박밭 나무 자리가 바뀌어 조금 동쪽으로
  node("dig", "meadow", 928, 940),
  node("dig", "forest", 392, 992),
  node("dig", "forest", 316, 946),
  node("dig", "hill", 250, 120),
  node("dig", "lakeside", 1390, 1000),
  // 11/16 더 (4): 언덕 아래 · 오리 연못 서쪽 · 호박밭 · 호수 북쪽 물가
  node("dig", "hill", 240, 230),
  node("dig", "forest", 348, 872),
  node("dig", "meadow", 911, 970),
  node("dig", "lakeside", 1284, 800),
  // 곤충 수풀 (9 + 11/16 6)
  node("bug", "forest", 450, 780),
  node("bug", "forest", 546, 794),
  node("bug", "forest", 322, 920),
  node("bug", "meadow", 930, 868),
  node("bug", "meadow", 1120, 1000),
  node("bug", "meadow", 1016, 1000),
  node("bug", "meadow", 960, 962),
  node("bug", "lakeside", 1390, 940),
  node("bug", "lakeside", 1290, 1000),
  // 11/16 더 (6, 덜 쓰던 곳): 언덕 · 동굴 앞 · 강가 둘(서쪽·가운데 다리 옆) · 오리 연못 아래 · 호박밭 동쪽
  node("bug", "hill", 358, 234),
  node("bug", "cave", 740, 110),
  node("bug", "forest", 298, 656),
  node("bug", "lakeside", 584, 654),
  node("bug", "forest", 474, 998),
  node("bug", "meadow", 1103, 898),
  // 11/15 캠핑장 (map: "camp")
  ...CAMP_GATHER_NODES,
  // 11/16 바닷가 갯벌 (map: "sea")
  ...SEA_GATHER_NODES,
  // 11/16 바닷가 뭍 지점·갯벌 구멍 더 (lib/forage/seaNodes)
  ...SEA_LAND_NODES,
];
/** 11/26 이 지점에서 뽑는 곳 (원래 구역 + also) */
export const nodeWheres = (n: GatherNode): readonly Where[] => (n.also ? [n.where, n.also] : [n.where]);
/** 그 맵의 채집 지점인지 (마을 지점은 map이 없다) */
export const nodeOnMap = (n: GatherNode, map: "village" | "camp" | "sea"): boolean => (n.map ?? "village") === map;
const NODE_BY_ID = new Map(GATHER_NODES.map((n) => [n.id, n]));
export const gatherNodeById = (id: string): GatherNode | undefined => NODE_BY_ID.get(id);

// ── NPC ── 물고기는 어부, 나머지는 수집가에게 판다 (NPC 앞에서만 — UI가 NPC 창에서만 판매를 연다)
// 11/16 r11 사용자: 포구 시장을 뺐어요 → 바다 고기는 어부 영감, 갯벌에서 캔 것은 수집가 유령이 사요 (같은 판매 API)
// 11/20 달물결 포구 「해녀 할망」 좌판: 물고기·채집물을 한자리에서 다 사요 (값은 마을과 같아요 — 정류장 길 끝 모퉁이, game/sea/seaLayout SEA_BUYER)
// 11/26 캠핑장 「낚시터 사장님」(trader): 해녀 할망처럼 물고기·채집물을 다 사요 (값도 마을과 같아요 — 미끼·대여 부스 앞, protocol CAMP_TRADER·CAMP_TRADER_STALL)
export type NpcId = "fishmonger" | "collector" | "haenyeo" | "trader";
export type NpcMap = "village" | "camp" | "sea";
export type Npc = { id: NpcId; name: string; title: string; x: number; y: number; buys: readonly LifeCat[]; hello: string; map?: "sea" | "camp"; where?: Where };
export const NPCS: readonly Npc[] = [
  {
    id: "fishmonger",
    name: "어부 영감",
    title: "생선 삽니다",
    // 11/15 납품 부두를 없애며 호수 낚시 잔교 서쪽 끝 (호박밭 옆, 잔교로 가는 흙길 바로 위 — 손님은 길에 서서 판다).
    // 노점은 왼쪽, 옆에 물통·물고기 상자 (game/world/fishZone.ts)
    x: 1080,
    y: 914,
    buys: ["fish"],
    hello: "허허, 오늘은 뭐 좀 낚았나? 신선한 놈이면 값 잘 쳐주지.",
  },
  {
    id: "collector",
    name: "수집가 유령",
    title: "뭐든 삽니다",
    // 11/15 오리 연못 북서쪽 둑 (동물원 동문에서 북동쪽으로 몇 걸음)
    x: 360,
    y: 806,
    buys: ["bug", "herb", "ore", "dig"],
    hello: "남들이 지나친 것도 누군가에겐 보물이지요. 약초, 광석, 발굴품, 곤충 다 삽니다.",
  },
  {
    id: "haenyeo",
    name: "해녀 할망",
    title: "몽땅 삽니다",
    // 11/20 바닷가 정류장 길이 산책로와 만나는 모퉁이 바로 위 (좌판은 왼쪽 — game/sea/seaLayout SEA_BUYER·SEA_BUYER_STALL)
    x: 1556,
    y: 300,
    buys: LIFE_CATS,
    hello: "죽어서도 물질은 못 끊었지 뭐예요. 생선이든 조개든 풀뿌리든 다 받아요. 값은 마을이랑 똑같이 쳐줘요.",
    map: "sea",
  },
  {
    id: "trader",
    name: "낚시터 사장님",
    title: "다 삽니다",
    x: CAMP_TRADER.x,
    y: CAMP_TRADER.y,
    buys: LIFE_CATS,
    hello: "잡은 거 있으면 이리 줘 봐요. 생선이든 버섯이든 돌멩이든 다 사요. 값은 마을이랑 똑같이 쳐줘요.",
    map: "camp",
  },
];
/** 물고기·채집물을 다 사는 상인인지 (판매 창 「물고기와 채집물 전부」, 포인트는 품목마다 낚시·채집 판매로 나눠 적립) */
export const npcBuysAll = (npc: Npc): boolean => LIFE_CATS.every((c) => npc.buys.includes(c));
/** 이 NPC가 이 종을 사는지 (11/16 갯벌 좌판은 갯벌에서 캔 것만) */
export const npcBuys = (npc: Npc, s: Species): boolean => npc.buys.includes(s.cat) && (!npc.where || s.where.includes(npc.where));
export const npcById = (id: string): Npc | undefined => NPCS.find((n) => n.id === id);
/** 이 품목을 사는 마을 NPC (가방·도감에 적는 이름) */
export const buyerOf = (cat: LifeCat): Npc => NPCS.find((n) => !n.map && n.buys.includes(cat))!;
/** 11/26 이 맵에 서 있는 상인 (마을 = 어부 영감·수집가 유령, 바닷가 = 해녀 할망, 캠핑장 = 낚시터 사장님) */
export const npcsOn = (map: NpcMap): Npc[] => NPCS.filter((n) => (n.map ?? "village") === map);
/** 11/26 오늘 미션 「팔기」 길 안내: 이 맵에서 (x,y)와 가장 가까운 상인 (그 맵에 상인이 없으면 null) */
export function nearestSeller(map: NpcMap, x: number, y: number): Npc | null {
  let best: Npc | null = null;
  for (const n of npcsOn(map)) if (!best || Math.hypot(n.x - x, n.y - y) < Math.hypot(best.x - x, best.y - y)) best = n;
  return best;
}

// ── 숫자 ──
/** 한 칸(종류)에 쌓을 수 있는 수 */
export const STACK_MAX = 99;
/** 11/19 가방 전체(물고기·채집물 합) 한도. 차면 직접 잡은 것은 놓아주고(도감에는 남는다) 자동 낚시는 쉰다 */
export const BAG_MAX = 300;
/** 가방에 든 수 (모든 칸 합) */
export const bagCount = (bag: Record<string, number> | undefined): number => Object.values(bag ?? {}).reduce((n, v) => n + Math.max(0, v), 0);
// 11/19 하루에 잡을·캘 수 있는 수 한도(물고기 150·채집 200)는 없앴다. 자동화 막이는 시간당 시작 수(service FORAGE_STARTS_PER_HOUR)·
// 티켓 검사·감기 최소 시간·채집 지점 창(한 지점 10분에 한 번)이 한다

// ── 11/22 물고기 크기 등급 (대물·월척) ──
// 직접 낚은 물고기만 크기로 등급이 붙는다 (lib/forage/rules sizeGrade — 자동 낚시·가라앉은 보물·채집은 늘 보통).
// 가방에는 등급마다 따로 쌓인다: 보통 = 종 id 그대로, 대물 = `${종}~1`, 월척 = `${종}~2` (종 id에는 "~"가 없고, "@"는 가방에 들어가지 않는 자리).
// 한 칸 STACK_MAX·가방 전체 BAG_MAX는 그대로 (등급 칸도 한 칸). 팔 때 값은 등급 배수 (gradedPrice), 의뢰 납품은 등급을 가리지 않고 보통부터 낸다
export type FishGrade = 0 | 1 | 2;
export const GRADE_LABEL: Record<FishGrade, string> = { 0: "보통", 1: "대물", 2: "월척" };
/** 파는 값 배수 */
export const GRADE_MULT: Record<FishGrade, number> = { 0: 1, 1: 1.5, 2: 2.5 };
/** 등급 문턱 (크기 분포의 난수 자리 u — 대물 = 위 20%, 월척 = 위 5%) */
export const GRADE_U: Record<Exclude<FishGrade, 0>, number> = { 1: 0.8, 2: 0.95 };
const GRADE_SEP = "~";
/** 가방 칸 id (보통은 종 id 그대로) */
export const bagIdOf = (id: string, grade: FishGrade = 0): string => (grade > 0 ? `${id}${GRADE_SEP}${grade}` : id);
/** 가방 칸 id → 종 id */
export const baseIdOf = (bagId: string): string => {
  const i = bagId.indexOf(GRADE_SEP);
  return i < 0 ? bagId : bagId.slice(0, i);
};
/** 가방 칸 id → 등급 (모르는 꼬리는 보통) */
export const gradeOf = (bagId: string): FishGrade => {
  const g = bagId.slice(bagId.indexOf(GRADE_SEP) + 1);
  return bagId.includes(GRADE_SEP) && (g === "1" || g === "2") ? (Number(g) as FishGrade) : 0;
};
/** 등급이 붙을 수 있는 종 (크기를 재는 물고기 — 잡동사니 제외) */
export const gradable = (s: Species): boolean => s.cat === "fish" && !!s.size && !s.junk;
/** 가방 칸 id의 종 (모르는 id·등급이 붙을 수 없는 종에 붙은 등급이면 undefined) */
export function bagSpecies(bagId: string): Species | undefined {
  const s = speciesById(baseIdOf(bagId));
  if (!s) return undefined;
  if (bagId === s.id) return s;
  return gradable(s) && bagId === bagIdOf(s.id, gradeOf(bagId)) && gradeOf(bagId) > 0 ? s : undefined;
}
/** 가방에 있을 수 있는 칸 id 전부 (판매 입력 검사용) */
export const BAG_IDS: readonly string[] = SPECIES.flatMap((s) => (gradable(s) ? [s.id, bagIdOf(s.id, 1), bagIdOf(s.id, 2)] : [s.id]));
/** 안내 창·가이드에 쓰는 한 줄 (lib/economy 물고기 팔기 설명도 같은 말 — forage.test가 맞춰 본다) */
export const GRADE_PRICE_NOTE = `직접 낚은 대물은 ${GRADE_MULT[1]}배, 월척은 ${GRADE_MULT[2]}배로 팔려요. 자동 낚시로 낚은 건 보통 값이에요.`;
/** 한 개 파는 값 (반올림) — 예) 3P 대물 = round(4.5) = 5P, 3P 월척 = round(7.5) = 8P */
export const gradedPrice = (s: Species, grade: FishGrade): number => Math.round(s.price * GRADE_MULT[grade]);
/** 그 종의 가방 칸들 (꺼내는 차례: 보통 → 대물 → 월척) */
export const bagIdsOfSpecies = (id: string): string[] => [id, bagIdOf(id, 1), bagIdOf(id, 2)];
/** 가방을 종 단위로 합친다 (의뢰 진행·납품 고르기처럼 등급을 가리지 않는 곳) */
export function speciesBag(bag: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(bag)) if (n > 0) out[baseIdOf(id)] = (out[baseIdOf(id)] ?? 0) + n;
  return out;
}
/**
 * 종 단위 개수(items: 종 id → 개수)를 가방 칸 단위로 (보통부터, 그다음 대물·월척). 모자라면 null.
 * 서버 납품(메모리 저장소 — Redis는 store BAG_TAKE_LUA가 같은 차례)과 화면의 가방 사본이 같이 쓴다
 */
export function takePlan(bag: Readonly<Record<string, number>>, items: Readonly<Record<string, number>>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [id, want] of Object.entries(items)) {
    let left = want;
    for (const k of bagIdsOfSpecies(baseIdOf(id))) {
      const t = Math.min(left, Math.max(0, (bag[k] ?? 0) - (out[k] ?? 0)));
      if (t > 0) out[k] = (out[k] ?? 0) + t;
      left -= Math.max(0, t);
    }
    if (left > 0) return null;
  }
  return out;
}

// ── 도감 칸 ── 잡는 것(LifeCat) + 별자리 + 11/16 몬스터. 별자리·몬스터는 별자리 잇기·사냥으로 모으는 도감 표시용 칸이라
// 가방·NPC 판매·상점 값과는 상관없다 (LifeCat을 넓히지 않는다 — 판매·가방 코드는 LifeCat·SPECIES만 본다).
export type DexCat = LifeCat | "star" | "mob";
export const DEX_CATS: readonly DexCat[] = [...LIFE_CATS, "star", "mob"];
export const DEX_CAT_LABEL: Record<DexCat, string> = { ...CAT_LABEL, star: "별자리", mob: "몬스터" };
/** 그 도감 칸의 항목 id (채우는 비율·보상 계산) */
export const dexIdsOf = (cat: DexCat): string[] =>
  cat === "star" ? CONSTELLATIONS.map((c) => c.id) : cat === "mob" ? [...MOB_DEX_IDS] : speciesOf(cat).map((s) => s.id);

/**
 * 예전 도감 달성 보상 (종류마다 25·50·75·100%, 11/14 종 하나마다 보상으로 바뀌며 새로 주지 않는다).
 * 이미 받은 기록(claims `${cat}:${tier}`)은 지우지 않고 남겨 둔다 — 전환 정산(lib/forage/dexReward)이 이 값을 빼고, 받은 50·100% 칭호는 그대로 유지된다
 */
export const DEX_TIERS = [25, 50, 75, 100] as const;
export type DexTier = (typeof DEX_TIERS)[number];
export const DEX_REWARD: Record<DexTier, number> = { 25: 20, 50: 40, 75: 80, 100: 150 };
/** 칭호: 50 = 그 칸의 절반을 등록, 100 = 전부 등록 (지금 종 수 기준, 자동으로 붙는다. 예전 단계 보상으로 받은 칭호도 유지) */
export const DEX_TITLES: Record<DexCat, Partial<Record<DexTier, string>>> = {
  fish: { 50: "주말 낚시꾼", 100: "호수의 전설" },
  bug: { 50: "곤충 채집단", 100: "곤충 박사" },
  herb: { 50: "약초꾼", 100: "산신령의 제자" },
  ore: { 50: "초보 광부", 100: "보석 감정사" },
  dig: { 50: "보물 사냥꾼", 100: "고고학자" },
  star: { 50: "별지기", 100: "밤하늘 지도 제작자" },
  mob: { 50: "몬스터 관찰자", 100: "몬스터 박사" },
};
export const dexClaimKey = (cat: DexCat, tier: DexTier) => `${cat}:${tier}`;

/** 칭호가 붙는 단계 (절반·전부) */
export const DEX_TITLE_TIERS = [50, 100] as const satisfies readonly DexTier[];
export type DexTitleTier = (typeof DEX_TITLE_TIERS)[number];
/** 그 칭호에 필요한 등록 수 (절반은 올림) */
export const dexTitleNeed = (cat: DexCat, tier: DexTitleTier): number => {
  const all = dexIdsOf(cat).length;
  return tier === 100 ? all : Math.ceil(all / 2);
};

/**
 * 도감 처음 등록 보상 (종 하나마다 한 번, 포인트는 EarnSource "dex"). 희귀도별 — 잡동사니는 ★1로 친다.
 * 별자리도 같은 표 (흔함·보통·희귀·전설 = ★1·★2·★3·★5). 11/16 몬스터는 자리·나오는 곳으로 정한다 (lib/forage/mobDex mobRarity)
 */
export const DEX_NEW_REWARD: Record<Rarity, number> = { 1: 3, 2: 6, 3: 12, 4: 25, 5: 50 };
const STAR_BY_ID = new Map(CONSTELLATIONS.map((c) => [c.id, c]));
/** 도감 칸 id → 어느 칸 (모르는 id면 null) */
export function dexCatOf(id: string): DexCat | null {
  if (STAR_BY_ID.has(id)) return "star";
  if (isMobId(id)) return "mob";
  return BY_ID.get(id)?.cat ?? null;
}
/** 보상 계산용 희귀도 (잡동사니 ★1, 모르는 id면 null) */
export function dexRarityOf(id: string): Rarity | null {
  const c = STAR_BY_ID.get(id);
  if (c) return c.rarity;
  if (isMobId(id)) return mobRarity(id);
  const s = BY_ID.get(id);
  if (!s) return null;
  return s.junk ? 1 : s.rarity;
}
/** 그 칸을 처음 등록할 때 받는 포인트 (모르는 id면 0) */
export function dexRewardOf(id: string): number {
  const r = dexRarityOf(id);
  return r ? DEX_NEW_REWARD[r] : 0;
}
/** 칸 설명의 "★3 · 12P" (처음 등록 보상) */
export const dexRewardLabel = (id: string) => `★${dexRarityOf(id) ?? 1} · ${dexRewardOf(id)}P`;
/** 도감 칸 전체 (id·칸·보상) — 저장소의 전환 정산이 쓴다 */
export const DEX_REWARD_TABLE: readonly { id: string; cat: DexCat; pts: number }[] = DEX_CATS.flatMap((cat) =>
  dexIdsOf(cat).map((id) => ({ id, cat, pts: dexRewardOf(id) })),
);

/** 도감 100% 배지 비트 묶음 (protocol DEX_BADGE_CATS 순서 = LIFE_CATS 순서). 하나도 없으면 0 */
// 11/26 도감 확장: 칭호처럼 한 번 붙으면 남아요 — 그 칸 「전부」 칭호(붙은 표시·예전 단계 보상 포함 — lib/forage/dexReward titlesOf)가 있으면 켜요.
// 종이 늘어 지금 기준으로 덜 채웠어도 꺼지지 않아요. titles를 안 넘기면 지금 도감만 봐요
export function dexBadgeBits(dex: Record<string, { n: number }>, titles: readonly string[] = []): number {
  let bits = 0;
  LIFE_CATS.forEach((cat, i) => {
    const full = DEX_TITLES[cat][100];
    if ((full && titles.includes(full)) || speciesOf(cat).every((s) => (dex[s.id]?.n ?? 0) > 0)) bits |= 1 << i;
  });
  return bits;
}

// ── 11/26 맵별 도감 완성 배지 ── 마을·바닷가·캠핑장 따로: 그 맵에서만(마을은 마을에서도) 나오는 종을 전부 등록하면 배지 + 포인트 한 번.
// 칸(물고기·곤충 …) 칭호와 같은 방식으로 등록하는 순간 자동으로 (lib/forage/dexReward payMapBadges). 별자리·몬스터는 조건에 넣지 않아요.
// 받은 기록은 예전 단계 보상 장부(forage:{a}:claims)에 `map:${맵}`으로 한 번만 (HSETNX — 나중에 종이 늘어도 다시 주지 않아요)
export type DexMap = "village" | "sea" | "camp";
export const DEX_MAPS: readonly DexMap[] = ["village", "sea", "camp"];
export const DEX_MAP_LABEL: Record<DexMap, string> = { village: "마을", sea: "바닷가", camp: "캠핑장" };
/** 배지 이름 */
export const DEX_MAP_BADGE: Record<DexMap, string> = { village: "마을 도감 완성", sea: "바닷가 도감 완성", camp: "캠핑장 도감 완성" };
/**
 * 완성 보상 포인트 (맵마다 한 번 — 운영자가 여기 숫자만 바꾸면 돼요). 예전 칸 100% 보상 150P 수준으로 작게:
 * 마을은 종이 많아 200, 캠핑장 150, 바닷가 150 (11/26 도감 확장으로 바닷가 22 → 70종이 되어 100 → 150)
 */
export const DEX_MAP_REWARD: Record<DexMap, number> = { village: 200, sea: 150, camp: 150 };
/** 이 종이 어느 맵 도감에 드는지 (바닷가 전용 → 바닷가, 캠핑장 전용 → 캠핑장, 나머지 → 마을) */
export const dexMapOf = (s: Species): DexMap => (isSeasideSpecies(s) ? "sea" : isCampSpecies(s) ? "camp" : "village");
const MAP_IDS: Record<DexMap, string[]> = { village: [], sea: [], camp: [] };
for (const sp of SPECIES) MAP_IDS[dexMapOf(sp)].push(sp.id);
/** 그 맵 도감의 종 id */
export const dexMapIds = (m: DexMap): readonly string[] => MAP_IDS[m];
/** 받은 기록 열쇠 (forage claims) */
export const dexMapClaimKey = (m: DexMap) => `map:${m}`;
/** 그 맵 도감을 다 채웠는지 */
export const dexMapDone = (dex: Record<string, { n: number }>, m: DexMap): boolean => MAP_IDS[m].every((id) => (dex[id]?.n ?? 0) > 0);
/** 그 맵 도감에서 등록한 수 */
export const dexMapGot = (dex: Record<string, { n: number }>, m: DexMap): number => MAP_IDS[m].filter((id) => (dex[id]?.n ?? 0) > 0).length;

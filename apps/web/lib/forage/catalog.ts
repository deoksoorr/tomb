import type { Season, TimePhase, Weather } from "../ambience";
import { CONSTELLATIONS } from "../rpg/constellations";

// 낚시·채집·도감 (NEXT.md 4·32·51) 카탈로그 — 서버(lib/forage/service)와 UI·게임이 같은 표를 쓴다 (순수 데이터).
// 값(가격·확률)은 서버만 믿는다. 잡는 순간 무엇이 걸렸는지는 서버가 굴려 저장해 두고, 끝낼 때 확인한다.
//
// 이름은 실제 물고기·곤충·약초에 직장인 생활 농담을 섞었다 (월요병 붕어, 야근 메기, 칼퇴 송사리 …).

export type LifeCat = "fish" | "bug" | "herb" | "ore" | "dig";
export const LIFE_CATS: readonly LifeCat[] = ["fish", "bug", "herb", "ore", "dig"];
export const CAT_LABEL: Record<LifeCat, string> = { fish: "물고기", bug: "곤충", herb: "약초·버섯", ore: "광석", dig: "발굴품" };

/** 어디서: 물고기는 물(호수·강), 채집물은 채집 지점이 있는 구역 */
export type Where = "lake" | "river" | "forest" | "meadow" | "hill" | "cave" | "lakeside";
export const WHERE_LABEL: Record<Where, string> = {
  lake: "호수",
  river: "강",
  forest: "숲",
  meadow: "강 건너 풀밭",
  hill: "별 보기 언덕",
  cave: "사냥터 동굴 앞",
  lakeside: "호숫가",
};
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
  desc: string;
};

const W = { L: ["lake"], R: ["river"], LR: ["lake", "river"] } as const;
const ALL_GROUND: readonly Where[] = ["forest", "meadow", "hill", "cave", "lakeside"];

// ── 물고기 (40) ── 앞의 24종은 그대로 두고 뒤에 이어 붙인다 (id·값을 바꾸면 이미 잡은 도감·가방·순위가 어긋난다)
const FISH: Species[] = [
  { id: "f_crucian", cat: "fish", name: "월요병 붕어", rarity: 1, price: 3, where: W.LR, size: [10, 32], desc: "월요일 아침마다 유난히 잘 잡힌다. 표정이 어딘가 지쳐 있다." },
  { id: "f_bluegill", cat: "fish", name: "블루길", rarity: 1, price: 3, where: W.L, time: ["day", "dusk"], size: [8, 22], desc: "어디서 왔는지 모르지만 이미 이 호수의 터줏대감." },
  { id: "f_minnow", cat: "fish", name: "칼퇴 송사리", rarity: 1, price: 2, where: W.R, time: ["day", "dusk"], size: [2, 6], desc: "여섯 시 정각이 되면 쏜살같이 사라진다." },
  { id: "f_chub", cat: "fish", name: "피라미", rarity: 1, price: 3, where: W.R, time: ["dawn", "day"], size: [6, 16], desc: "여울에서 반짝이며 떼 지어 다닌다." },
  { id: "f_loach", cat: "fish", name: "회의 빠지는 미꾸라지", rarity: 1, price: 3, where: W.R, weather: ["cloudy", "fog", "rain"], size: [8, 20], desc: "회의 시간만 되면 손 사이로 빠져나간다." },
  { id: "f_carp", cat: "fish", name: "잉어", rarity: 2, price: 6, where: W.L, size: [30, 85], desc: "느긋하게 헤엄치는 호수의 어른." },
  { id: "f_catfish", cat: "fish", name: "야근 메기", rarity: 2, price: 7, where: W.LR, time: ["night"], size: [30, 95], desc: "불 꺼진 사무실 같은 밤 물에서만 입질한다." },
  { id: "f_bass", cat: "fish", name: "배스", rarity: 2, price: 6, where: W.L, time: ["dawn", "dusk"], size: [20, 55], desc: "해가 뜨고 질 무렵 가장 배고프다." },
  { id: "f_smelt", cat: "fish", name: "빙어", rarity: 2, price: 6, where: W.L, season: ["winter"], size: [7, 15], desc: "꽁꽁 언 겨울 호수의 은빛 손님." },
  { id: "f_sweetfish", cat: "fish", name: "은어", rarity: 2, price: 6, where: W.R, time: ["day"], season: ["summer", "autumn"], size: [12, 25], desc: "맑은 물에서만 사는 수박 향 물고기." },
  { id: "f_bullhead", cat: "fish", name: "퇴근길 동자개", rarity: 2, price: 6, where: W.R, time: ["dusk", "night"], season: ["summer", "autumn"], size: [15, 30], desc: "빠가빠가 우는 소리가 퇴근 지하철 안내 방송 같다." },
  { id: "f_kkeokji", cat: "fish", name: "꺽지", rarity: 2, price: 6, where: W.R, time: ["day"], season: ["spring", "summer"], size: [10, 20], desc: "봄볕이 드는 바위 틈을 좋아한다." },
  { id: "f_mandarin", cat: "fish", name: "쏘가리", rarity: 3, price: 14, where: W.R, time: ["dawn", "dusk"], weather: ["clear", "cloudy"], size: [20, 50], desc: "강의 호랑이. 줄무늬 정장이 잘 어울린다." },
  { id: "f_rainbow", cat: "fish", name: "무지개송어", rarity: 3, price: 14, where: W.L, weather: ["rain", "fog"], size: [25, 60], desc: "비 오는 날이면 비늘에 무지개가 뜬다." },
  { id: "f_eel", cat: "fish", name: "마감 장어", rarity: 3, price: 16, where: W.R, time: ["night"], weather: ["rain"], size: [40, 100], desc: "마감 전날 밤, 비가 오면 꿈틀대며 올라온다." },
  { id: "f_snakehead", cat: "fish", name: "결재 가물치", rarity: 3, price: 15, where: W.L, time: ["day", "dusk"], season: ["summer", "autumn"], size: [40, 90], desc: "한번 물면 결재가 날 때까지 놓지 않는다." },
  { id: "f_trout", cat: "fish", name: "산천어", rarity: 3, price: 14, where: W.R, time: ["day"], season: ["winter"], size: [20, 40], desc: "눈 녹은 찬물에서만 잡히는 겨울 손님." },
  { id: "f_koi", cat: "fish", name: "보너스 금잉어", rarity: 4, price: 32, where: W.L, time: ["day"], weather: ["clear"], size: [40, 90], desc: "맑은 날에만 금빛으로 반짝인다. 1년에 한 번 볼까 말까." },
  { id: "f_salmon", cat: "fish", name: "귀향 연어", rarity: 4, price: 34, where: W.R, time: ["dawn"], season: ["autumn"], size: [50, 90], desc: "가을 새벽, 명절처럼 고향 강으로 돌아온다." },
  { id: "f_sturgeon", cat: "fish", name: "철갑상어", rarity: 4, price: 36, where: W.L, time: ["night"], weather: ["fog"], size: [100, 220], desc: "안개 낀 밤 호수 바닥에서 올라오는 고대의 물고기." },
  { id: "f_king", cat: "fish", name: "정시퇴근 잉어왕", rarity: 5, price: 80, where: W.L, time: ["dusk"], weather: ["clear"], size: [90, 150], desc: "전설. 맑은 날 해질녘, 딱 퇴근 시간에만 나타난다는 소문." },
  { id: "f_moon", cat: "fish", name: "새벽 달빛 송어", rarity: 5, price: 80, where: W.R, time: ["dawn"], weather: ["fog"], size: [40, 70], desc: "안개 낀 새벽에만 비치는 달빛 비늘. 본 사람이 거의 없다." },
  { id: "f_shoe", cat: "fish", name: "출근 구두 한 짝", rarity: 1, price: 1, where: W.LR, junk: true, weight: 12, desc: "누가 강으로 출근했나 보다." },
  { id: "f_badge", cat: "fish", name: "잃어버린 사원증", rarity: 2, price: 2, where: W.LR, weather: ["rain", "fog", "cloudy"], junk: true, weight: 5, desc: "사진 속 얼굴이 묘하게 낯익다." },
  // 2차 (16) — 계절·날씨·새벽에 고루 흩어 둔다
  { id: "f_bitterling", cat: "fish", name: "납자루", rarity: 1, price: 3, where: W.R, time: ["day"], season: ["spring", "summer"], size: [4, 9], desc: "조개 속에 알을 맡긴다. 전세 계약서도 없이." },
  { id: "f_willow", cat: "fish", name: "버들치", rarity: 1, price: 3, where: W.R, time: ["dawn", "day"], size: [6, 13], desc: "계곡 찬물에서 누구보다 먼저 출근한다." },
  { id: "f_goby", cat: "fish", name: "밀어", rarity: 1, price: 2, where: W.L, time: ["dusk", "night"], size: [3, 7], desc: "바닥에 붙어 소곤소곤. 이름처럼 비밀 이야기를 좋아한다." },
  { id: "f_skygazer", cat: "fish", name: "강준치", rarity: 2, price: 6, where: W.L, time: ["dusk"], season: ["summer"], size: [30, 80], desc: "입이 하늘을 향해 있다. 늘 위만 본다." },
  { id: "f_nuchi", cat: "fish", name: "누치", rarity: 2, price: 6, where: W.R, time: ["day"], season: ["spring", "summer"], size: [20, 50], desc: "큰 몸집에 순한 얼굴. 여울을 천천히 거슬러 오른다." },
  { id: "f_lunchcarp", cat: "fish", name: "점심시간 떡붕어", rarity: 2, price: 7, where: W.L, time: ["day"], weather: ["clear", "cloudy"], size: [20, 45], desc: "열두 시 정각이면 물 위로 입을 뻐끔댄다." },
  { id: "f_grasscarp", cat: "fish", name: "초어", rarity: 2, price: 6, where: W.L, time: ["day", "dusk"], season: ["spring", "summer"], size: [40, 100], desc: "풀만 먹고도 1미터. 꾸준함의 힘." },
  { id: "f_report", cat: "fish", name: "물 먹은 보고서", rarity: 2, price: 2, where: W.R, weather: ["rain"], junk: true, weight: 4, desc: "결재란이 빗물에 번져 아무도 읽을 수 없다." },
  { id: "f_lenok", cat: "fish", name: "열목어", rarity: 3, price: 15, where: W.R, time: ["dawn", "day"], season: ["summer"], size: [30, 70], desc: "눈이 빨갛다. 밤새 보고서를 쓴 사람처럼." },
  { id: "f_miyugi", cat: "fish", name: "미유기", rarity: 3, price: 14, where: W.R, time: ["night"], season: ["autumn", "winter"], size: [15, 30], desc: "산골 계곡의 작은 메기. 찬 바람이 불면 수염을 세운다." },
  { id: "f_ungeo", cat: "fish", name: "웅어", rarity: 3, price: 14, where: W.R, time: ["dawn"], season: ["spring"], size: [20, 30], desc: "봄 새벽, 은빛 칼처럼 번쩍이며 강을 거슬러 온다." },
  { id: "f_whitefish", cat: "fish", name: "백조어", rarity: 3, price: 14, where: W.L, time: ["dawn", "dusk"], weather: ["fog", "cloudy"], size: [15, 35], desc: "백조처럼 흰 몸. 흐리거나 안개 낀 호수를 미끄러지듯 지난다." },
  { id: "f_goldmandarin", cat: "fish", name: "황쏘가리", rarity: 4, price: 34, where: W.R, time: ["dusk"], weather: ["clear", "cloudy"], season: ["summer"], size: [25, 50], desc: "천연기념물. 여름 해질녘 금빛 줄무늬가 번뜩인다." },
  { id: "f_huchen", cat: "fish", name: "자치", rarity: 4, price: 36, where: W.R, time: ["dawn", "day"], weather: ["snow"], season: ["winter"], size: [60, 120], desc: "눈 내리는 겨울 강의 은둔자. 사라졌다고들 했다." },
  { id: "f_ghostcarp", cat: "fish", name: "묘역 유령 잉어", rarity: 4, price: 34, where: W.L, time: ["dusk", "night"], weather: ["cloudy", "rain"], season: ["autumn"], size: [40, 90], desc: "비늘 너머가 비쳐 보인다. 끝내지 못한 낚시가 있었나 보다." },
  { id: "f_dragon", cat: "fish", name: "승진 용잉어", rarity: 5, price: 80, where: W.L, time: ["dawn"], weather: ["snow"], season: ["winter"], size: [80, 140], desc: "전설. 등용문을 넘은 잉어. 눈 오는 겨울 새벽에만 비늘을 보인다." },
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
  { id: "o_gold", cat: "ore", name: "금광석", rarity: 4, price: 32, where: ["cave"], desc: "번쩍. 동굴 깊은 곳의 반짝임." },
  { id: "o_meteor", cat: "ore", name: "별똥별 조각", rarity: 4, price: 36, where: ["hill"], time: ["night"], weather: ["clear"], desc: "맑은 밤, 별 보기 언덕에 떨어진다." },
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

export const SPECIES: readonly Species[] = [...FISH, ...BUGS, ...HERBS, ...ORES, ...DIGS];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));
export const speciesById = (id: string): Species | undefined => BY_ID.get(id);
export const speciesOf = (cat: LifeCat): Species[] => SPECIES.filter((s) => s.cat === cat);
export const isSpeciesId = (id: unknown): id is string => typeof id === "string" && BY_ID.has(id);

// ── 채집 지점 ── 맵 곳곳의 고정 후보 자리. 지금 피어 있는지는 사람마다 따로(lib/forage/rules nodeActive)
export type NodeKind = "herb" | "ore" | "dig" | "bug";
export const NODE_LABEL: Record<NodeKind, string> = { herb: "약초 캐기", ore: "광석 캐기", dig: "땅 파 보기", bug: "수풀에서 곤충 잡기" };
export const NODE_CAT: Record<NodeKind, LifeCat> = { herb: "herb", ore: "ore", dig: "dig", bug: "bug" };
export type GatherNode = { id: string; kind: NodeKind; where: Where; x: number; y: number };

const node = (kind: NodeKind, where: Where, x: number, y: number): GatherNode => ({ id: `${kind[0]}${x}_${y}`, kind, where, x, y });

/** lib/forage/forage.test.ts가 서 있을 수 있는 자리·물 밖·소품/좌석과 떨어짐을 검사한다 */
export const GATHER_NODES: readonly GatherNode[] = [
  // 약초 (14)
  node("herb", "forest", 420, 830),
  node("herb", "forest", 588, 940),
  node("herb", "forest", 470, 800),
  node("herb", "forest", 520, 1000),
  node("herb", "forest", 60, 640),
  node("herb", "forest", 412, 1000),
  node("herb", "forest", 586, 872),
  node("herb", "meadow", 880, 870),
  node("herb", "meadow", 1050, 906),
  node("herb", "meadow", 1110, 962),
  node("herb", "meadow", 990, 998),
  node("herb", "hill", 160, 96),
  node("herb", "hill", 300, 200),
  node("herb", "lakeside", 1150, 1000),
  // 광석 (8)
  node("ore", "hill", 48, 200),
  node("ore", "hill", 144, 160),
  node("ore", "hill", 330, 160),
  node("ore", "hill", 80, 80),
  node("ore", "cave", 790, 140),
  node("ore", "cave", 840, 150),
  node("ore", "cave", 880, 92),
  node("ore", "cave", 950, 90),
  // 발굴 (8)
  node("dig", "meadow", 1000, 872),
  node("dig", "meadow", 1080, 942),
  node("dig", "meadow", 1046, 1004),
  node("dig", "meadow", 870, 920),
  node("dig", "forest", 440, 940),
  node("dig", "forest", 560, 960),
  node("dig", "hill", 250, 120),
  node("dig", "lakeside", 1390, 1000),
  // 곤충 수풀 (9)
  node("bug", "forest", 450, 780),
  node("bug", "forest", 590, 800),
  node("bug", "forest", 410, 900),
  node("bug", "meadow", 930, 868),
  node("bug", "meadow", 1120, 1000),
  node("bug", "meadow", 872, 1004),
  node("bug", "meadow", 960, 962),
  node("bug", "lakeside", 1390, 940),
  node("bug", "lakeside", 1290, 1000),
];
const NODE_BY_ID = new Map(GATHER_NODES.map((n) => [n.id, n]));
export const gatherNodeById = (id: string): GatherNode | undefined => NODE_BY_ID.get(id);

// ── NPC ── 물고기는 어부, 나머지는 수집가에게 판다 (NPC 앞에서만 — UI가 NPC 창에서만 판매를 연다)
export type NpcId = "fishmonger" | "collector";
export type Npc = { id: NpcId; name: string; title: string; x: number; y: number; buys: readonly LifeCat[]; hello: string };
export const NPCS: readonly Npc[] = [
  {
    id: "fishmonger",
    name: "어부 영감",
    title: "생선 삽니다",
    // 낚시터 마당 동쪽 끝 (노점은 왼쪽, 입구 아치 옆)
    x: 1384,
    y: 806,
    buys: ["fish"],
    hello: "허허, 오늘은 뭐 좀 낚았나? 신선한 놈이면 값 잘 쳐주지.",
  },
  {
    id: "collector",
    name: "수집가 유령",
    title: "뭐든 삽니다",
    x: 412,
    y: 872,
    buys: ["bug", "herb", "ore", "dig"],
    hello: "끝내지 못한 것들도 누군가에겐 보물이지요. 약초·광석·발굴품·곤충, 다 삽니다.",
  },
];
export const npcById = (id: string): Npc | undefined => NPCS.find((n) => n.id === id);
/** 이 품목을 사는 NPC */
export const buyerOf = (cat: LifeCat): Npc => NPCS.find((n) => n.buys.includes(cat))!;

// ── 숫자 ──
/** 한 칸(종류)에 쌓을 수 있는 수 */
export const STACK_MAX = 99;
/** 하루에 잡을·캘 수 있는 수 (자동화 방지. 포인트는 따로 EARN_RULES 한도) */
export const DAILY_CATCH_MAX = { fish: 150, gather: 200 } as const;

// ── 도감 칸 ── 잡는 것(LifeCat) + 별자리. 별자리는 망원경 별자리 잇기로 모으는 도감 표시용 칸이라
// 가방·NPC 판매·상점 값과는 상관없다 (LifeCat을 넓히지 않는다 — 판매·가방 코드는 LifeCat·SPECIES만 본다).
export type DexCat = LifeCat | "star";
export const DEX_CATS: readonly DexCat[] = [...LIFE_CATS, "star"];
export const DEX_CAT_LABEL: Record<DexCat, string> = { ...CAT_LABEL, star: "별자리" };
/** 그 도감 칸의 항목 id (채우는 비율·보상 계산) */
export const dexIdsOf = (cat: DexCat): string[] => (cat === "star" ? CONSTELLATIONS.map((c) => c.id) : speciesOf(cat).map((s) => s.id));

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
 * 별자리도 같은 표 (흔함·보통·희귀·전설 = ★1·★2·★3·★5)
 */
export const DEX_NEW_REWARD: Record<Rarity, number> = { 1: 3, 2: 6, 3: 12, 4: 25, 5: 50 };
const STAR_BY_ID = new Map(CONSTELLATIONS.map((c) => [c.id, c]));
/** 도감 칸 id → 어느 칸 (모르는 id면 null) */
export function dexCatOf(id: string): DexCat | null {
  if (STAR_BY_ID.has(id)) return "star";
  return BY_ID.get(id)?.cat ?? null;
}
/** 보상 계산용 희귀도 (잡동사니 ★1, 모르는 id면 null) */
export function dexRarityOf(id: string): Rarity | null {
  const c = STAR_BY_ID.get(id);
  if (c) return c.rarity;
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
export function dexBadgeBits(dex: Record<string, { n: number }>): number {
  let bits = 0;
  LIFE_CATS.forEach((cat, i) => {
    if (speciesOf(cat).every((s) => (dex[s.id]?.n ?? 0) > 0)) bits |= 1 << i;
  });
  return bits;
}

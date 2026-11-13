import { AVATAR_COLORS } from "@tomb/protocol";

// 돌아다니는 마을 주민 — 외형·사는 동네·대사 (순수 데이터, Phaser 없음 → residents.test.ts).
// 위치는 residentSim(고양이와 같은 결정적 시뮬레이션), 그리기·말 걸기는 Residents.ts.
// 대사는 내 화면에서만 뜬다 (서버로 보내지 않는다). 게임 팁은 실제 기능만 (안내 창 GuideDialog와 같은 내용).

/** 대사가 어울리는 때 (없으면 언제나) */
export type LineWhen = "night" | "day" | "dawn" | "dusk" | "rain" | "snow" | "fog";
/** 주민 성향 — walk: 멀리 산책·가끔 달리기, swim: 물가에서 자주 헤엄, fire: 조금 더 자주·오래 앉아 쉼 */
export type ResidentTaste = "walk" | "swim" | "fire";
export type ResidentLine = { t: string; when?: LineWhen };

export type ResidentDef = {
  id: string;
  /** 이름표 (사람과 구분되게 연한 초록으로 그린다) */
  name: string;
  /** 몸 모양 (AVATAR_BODIES id) */
  body: string;
  /** 몸 색 (AVATAR_COLORS) */
  color: string;
  /** 꾸미기 (가벼운 머리·목 꾸미기만 — 오라·펫처럼 따로 붙는 연출은 쓰지 않는다) */
  look: readonly string[];
  /** 사는 동네 (쉼 자리는 이 원 안에서) */
  home: { x: number; y: number; r: number };
  /** 앉아 쉬는 벤치·그루터기 (FURNITURE id) */
  perches: readonly string[];
  /** 풀밭·길가 쉼 자리 수 */
  grass: number;
  /** 구간 길이(ms)와 걷는 속도(px/s) — 사람(56px/s)보다 천천히 */
  legMs: number;
  speed: number;
  /** 벤치에 앉으면 머리 위에 띄우는 상태 (SEAT_MOODS id) */
  moods: readonly string[];
  /** 성향 (모두 걷는 비중이 크고, 조금씩만 다르다): 산책·수영·모닥불(앉아 쉬기) 좋아함 */
  taste: ResidentTaste;
  lines: readonly ResidentLine[];
};

const [BONE, MOSS, MIST, OCHRE, LAVENDER, CANDLE] = AVATAR_COLORS;

/** 주민 목록 (관리자가 정한 수만큼 앞에서부터 나온다 — 순서가 곧 우선순위) */
export const RESIDENTS: readonly ResidentDef[] = [
  {
    id: "kimdr",
    name: "김대리",
    body: "suit",
    color: MIST,
    look: [],
    home: { x: 720, y: 520, r: 130 },
    perches: ["lA", "bB", "bC"],
    grass: 4,
    legMs: 40_000,
    speed: 30,
    moods: ["work", "coffee"],
    taste: "fire",
    lines: [
      { t: "오늘도 보고서가 안 끝나요…" },
      { t: "광장 모닥불 보면 좀 살 것 같아요" },
      { t: "10분만 있어도 포인트 5점 쌓여요" },
      { t: "야근 끝나고 불멍 중이에요", when: "night" },
      { t: "해 떠 있을 때 퇴근해 보고 싶다", when: "day" },
      { t: "비 오는 날 야근은 두 배로 길어요", when: "rain" },
    ],
  },
  {
    id: "parkjj",
    name: "박주임",
    body: "hood",
    color: BONE,
    look: ["neck_scarf"],
    home: { x: 470, y: 480, r: 100 },
    perches: ["bA"],
    grass: 4,
    legMs: 44_000,
    speed: 28,
    moods: ["rest", "call"],
    taste: "walk",
    lines: [
      { t: "사직서… 오늘은 진짜 낼까요?" },
      { t: "성황당 가면 떠난 묘비들이 있어요" },
      { t: "묘비에 꽃 한 송이 놓아 주세요" },
      { t: "그만둔 것도 다 의미가 있겠죠" },
      { t: "밤바람 맞으며 생각 정리 중이에요", when: "night" },
      { t: "안개 낀 날은 고민도 흐릿해요", when: "fog" },
    ],
  },
  {
    id: "firekeeper",
    name: "불지기",
    body: "sheet",
    color: CANDLE,
    look: ["hand_lantern"],
    home: { x: 720, y: 470, r: 80 },
    perches: ["kP1", "kP2", "kP3", "kPw1", "kPe1"],
    grass: 3,
    legMs: 50_000,
    speed: 24,
    moods: ["rest", "music"],
    taste: "fire",
    lines: [
      { t: "불은 제가 지키고 있을게요" },
      { t: "같이 앉아서 불멍해요" },
      { t: "모닥불 곁에 앉으면 마음이 놓여요" },
      { t: "밤엔 불빛이 더 예뻐요", when: "night" },
      { t: "비가 와도 이 불은 안 꺼져요", when: "rain" },
      { t: "눈 오는 날 불멍이 최고예요", when: "snow" },
    ],
  },
  {
    id: "leegj",
    name: "이과장",
    body: "cup",
    color: OCHRE,
    look: [],
    home: { x: 824, y: 390, r: 90 },
    perches: ["cA", "cB", "lA"],
    grass: 3,
    legMs: 38_000,
    speed: 32,
    moods: ["coffee", "work"],
    taste: "walk",
    lines: [
      { t: "벌써 세 잔째예요" },
      { t: "잡화점에서 염색권도 팔아요" },
      { t: "옷 색 바꾸면 기분도 바뀌어요" },
      { t: "아침 커피는 못 참죠", when: "dawn" },
      { t: "밤 커피는… 후회할 걸 알아요", when: "night" },
    ],
  },
  {
    id: "choisw",
    name: "최사원",
    body: "bun",
    color: LAVENDER,
    look: ["hat_flower"],
    home: { x: 720, y: 130, r: 110 },
    perches: ["bG", "bH"],
    grass: 4,
    legMs: 34_000,
    speed: 36,
    moods: ["music", "meal"],
    taste: "swim",
    lines: [
      { t: "6시 땡 하면 사라질 거예요" },
      { t: "광장 입구에 귀신의집 있어요!" },
      { t: "소원 분수는 하루 세 번이에요" },
      { t: "출석 도장 꼭 찍고 가요" },
      { t: "퇴근길 노을 너무 좋아요", when: "dusk" },
      { t: "우산 두고 왔어요…", when: "rain" },
    ],
  },
  {
    id: "jungcj",
    name: "정차장",
    body: "tall",
    color: MIST,
    look: ["hat_halo"],
    home: { x: 220, y: 190, r: 120 },
    perches: ["lB", "bL"],
    grass: 4,
    legMs: 46_000,
    speed: 26,
    moods: ["rest", "music"],
    taste: "walk",
    lines: [
      { t: "언덕 망원경으로 별자리 이어 봐요" },
      { t: "열기구는 언덕 출발장에서 타요" },
      { t: "맑은 밤엔 별똥별이 떨어져요", when: "night" },
      { t: "오늘은 구름이 별을 가렸네요", when: "rain" },
      { t: "낮에도 별은 거기 있대요", when: "day" },
    ],
  },
  {
    id: "handr",
    name: "한대리",
    body: "umbrella",
    color: CANDLE,
    look: [],
    home: { x: 420, y: 630, r: 130 },
    perches: ["lC", "bK"],
    grass: 5,
    legMs: 36_000,
    speed: 32,
    moods: ["music", "rest"],
    taste: "swim",
    lines: [
      { t: "강바람 쐬니까 좀 낫네요" },
      { t: "나루터에서 조각배 탈 수 있어요" },
      { t: "물에 들어가면 헤엄도 쳐져요" },
      { t: "비 오는 날 우산 산책 좋아해요", when: "rain" },
      { t: "눈 밟는 소리 좋아요", when: "snow" },
    ],
  },
  {
    id: "ohbj",
    name: "오부장",
    body: "box",
    color: MOSS,
    look: ["hat_straw"],
    home: { x: 1090, y: 790, r: 100 },
    perches: ["bO", "lE"],
    grass: 4,
    legMs: 48_000,
    speed: 24,
    moods: ["rest", "meal"],
    taste: "swim",
    lines: [
      { t: "낚시 의자 앞에서 E 눌러 봐요" },
      { t: "잡은 물고기는 수집가가 사 가요" },
      { t: "왕년엔 나도 월척 낚았지" },
      { t: "새벽 낚시가 진짜예요", when: "dawn" },
      { t: "비 올 때 입질이 좋대요", when: "rain" },
    ],
  },
  {
    id: "yoonjj",
    name: "윤주임",
    body: "round",
    color: OCHRE,
    look: [],
    home: { x: 150, y: 600, r: 80 },
    perches: ["kWn", "kWs", "kWw", "kWe"],
    grass: 3,
    legMs: 42_000,
    speed: 28,
    moods: ["rest", "study"],
    taste: "fire",
    lines: [
      { t: "여긴 조용해서 좋아요" },
      { t: "옛 묘역 산책 코스 추천해요" },
      { t: "자격증 공부 중인데… 쉬는 중" },
      { t: "밤 공기 차니까 불 곁에 와요", when: "night" },
      { t: "안개 낀 묘역은 좀 무서워요", when: "fog" },
    ],
  },
  {
    id: "seogj",
    name: "서과장",
    body: "catmask",
    color: BONE,
    look: [],
    home: { x: 968, y: 900, r: 80 },
    perches: ["kSn", "kSs", "kSw", "kSe", "cE", "cF"],
    grass: 3,
    legMs: 44_000,
    speed: 26,
    moods: ["call", "rest"],
    taste: "swim",
    lines: [
      { t: "탈 쓰면 일 안 시킬 줄 알았죠" },
      { t: "호박밭 옆 의자가 명당이에요" },
      { t: "동물원 사육사가 펫을 분양해요" },
      { t: "밤 모닥불은 회의보다 따뜻해요", when: "night" },
      { t: "눈 오면 호박이 차가워요", when: "snow" },
    ],
  },
  {
    id: "jangin",
    name: "장인턴",
    body: "cat",
    color: LAVENDER,
    look: ["hat_cat"],
    home: { x: 240, y: 470, r: 120 },
    perches: ["bI", "bJ"],
    grass: 5,
    legMs: 36_000,
    speed: 34,
    moods: ["study", "music"],
    taste: "walk",
    lines: [
      { t: "인턴 3개월 차예요, 잘 부탁해요" },
      { t: "고양이들이 여기 자주 와요" },
      { t: "고양이 옆에서 E 누르면 골골해요" },
      { t: "밤에 유령 친구들이 놀러 와요", when: "night" },
      { t: "오늘 날씨 산책하기 딱이에요", when: "day" },
    ],
  },
  {
    id: "kangdr",
    name: "강대리",
    body: "hood",
    color: MOSS,
    look: ["hand_lantern"],
    home: { x: 900, y: 150, r: 100 },
    perches: ["bQ"],
    grass: 4,
    legMs: 40_000,
    speed: 30,
    moods: ["rest", "meal"],
    taste: "walk",
    lines: [
      { t: "사냥터는 메뉴에서 들어가요" },
      { t: "같이 사냥 가면 훨씬 쉬워요" },
      { t: "가끔 황금 고블린이 나타나요" },
      { t: "먼저 잡으면 보너스래요!" },
      { t: "밤엔 등불 없으면 못 다녀요", when: "night" },
    ],
  },
  {
    id: "limtj",
    name: "임팀장",
    body: "suit",
    color: OCHRE,
    look: [],
    home: { x: 950, y: 300, r: 90 },
    perches: ["bN"],
    grass: 3,
    legMs: 42_000,
    speed: 28,
    moods: ["call", "work"],
    taste: "swim",
    lines: [
      { t: "회의는 짧게, 퇴근은 빠르게" },
      { t: "분양 마을에 내 집 하나 어때요?" },
      { t: "집 꾸미면 좋아요도 받아요" },
      { t: "다들 들어가세요, 늦었어요", when: "night" },
      { t: "비 오는 날 회식은 취소예요", when: "rain" },
    ],
  },
  {
    id: "songjj",
    name: "송주임",
    body: "round",
    color: CANDLE,
    look: ["hat_straw"],
    home: { x: 1030, y: 980, r: 80 },
    perches: ["cE", "cF"],
    grass: 4,
    legMs: 46_000,
    speed: 24,
    moods: ["meal", "rest"],
    taste: "fire",
    lines: [
      { t: "회사 그만두고 호박 키워요" },
      { t: "숲에서 약초도 캘 수 있어요" },
      { t: "채집한 건 수집가에게 팔아요" },
      { t: "아침 이슬 맞은 호박 최고", when: "dawn" },
      { t: "비 와서 물 안 줘도 돼요", when: "rain" },
    ],
  },
  {
    id: "baeksw",
    name: "백사원",
    body: "bun",
    color: MOSS,
    look: ["neck_scarf"],
    home: { x: 720, y: 980, r: 120 },
    perches: ["bV", "bW", "bS"],
    grass: 4,
    legMs: 38_000,
    speed: 32,
    moods: ["music", "coffee"],
    taste: "walk",
    lines: [
      { t: "관람차는 맨 아래 칸에서 E예요" },
      { t: "관람차 한 칸에 둘이 타요" },
      { t: "폭죽 쏘면 다들 쳐다봐요" },
      { t: "밤 관람차 야경 꼭 보세요", when: "night" },
      { t: "눈사람 만들고 싶다…", when: "snow" },
    ],
  },
];

/** 대사 고르기 상황 */
export type LineContext = {
  phase: "dawn" | "day" | "dusk" | "night";
  weather: "clear" | "cloudy" | "fog" | "rain" | "snow";
};

function fits(l: ResidentLine, ctx: LineContext): boolean {
  if (!l.when) return true;
  return l.when === ctx.phase || l.when === ctx.weather;
}

/**
 * 말 걸면 할 대사 하나. 지금 시간대·날씨에 맞는 줄이 있으면 절반쯤은 그중에서, 아니면 언제나 하는 줄에서.
 * 바로 전에 한 줄(last)은 되도록 피한다. r = 0~1 난수 두 개를 주는 함수 (테스트는 고정값)
 */
export function pickLine(def: ResidentDef, ctx: LineContext, r: () => number, last: string | null = null): string {
  const timely = def.lines.filter((l) => l.when && fits(l, ctx));
  const always = def.lines.filter((l) => !l.when);
  let pool = timely.length && r() < 0.5 ? timely : always.length ? always : def.lines.filter((l) => fits(l, ctx));
  if (pool.length > 1 && last) pool = pool.filter((l) => l.t !== last);
  if (!pool.length) pool = def.lines.slice();
  return pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))].t;
}

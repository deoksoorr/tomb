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
  /** 집 구역(활동 반경): 대부분의 시간은 이 원 안을 돌아다니고 쉼 자리도 여기서 고른다. 주민마다 맵 곳곳에 고르게 나눠 둔다 */
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
    name: "쫄보 알바",
    body: "suit",
    color: MIST,
    look: [],
    home: { x: 790, y: 300, r: 90 }, // 귀신의집·소원 분수 옆 (광장 북동쪽 가장자리)
    perches: ["cA", "cB"],
    grass: 4,
    legMs: 40_000,
    speed: 30,
    moods: ["work", "coffee"],
    taste: "fire",
    lines: [
      { t: "귀신의집 미로, 저는 입구까지만 안내해요" },
      { t: "미로는 기록만 남아요. 포인트는 없어요" },
      { t: "깜짝 소리 나요. 저도 매번 놀라요" },
      { t: "소원 분수 운세는 하루 한 번이에요" },
      { t: "작은 동전으로 던져도 운세는 똑같대요" },
      { t: "밤 귀신의집은 제 퇴근 후에 가 주세요", when: "night" },
      { t: "낮엔 귀신들도 낮잠 자요… 아마도", when: "day" },
      { t: "비 오는 날 귀신의집은 반칙이에요", when: "rain" },
    ],
  },
  {
    id: "parkjj",
    name: "곰이 조수",
    body: "hood",
    color: BONE,
    look: ["neck_scarf"],
    home: { x: 210, y: 880, r: 150 }, // 동물원
    perches: ["bX"],
    grass: 4,
    legMs: 44_000,
    speed: 28,
    moods: ["rest", "call"],
    taste: "walk",
    lines: [
      { t: "펫 분양은 곰이 선배 앞에서 E예요" },
      { t: "큰 개·왕거위·달빛 사슴은 탈 수 있어요" },
      { t: "펫 데리고 R 누르면 올라타요" },
      { t: "앉거나 물에 들면 펫에서 저절로 내려요" },
      { t: "펫은 한 번에 한 마리만 데려가요" },
      { t: "오늘도 똥 치우다 하루 다 갔어요" },
      { t: "밤엔 동물들도 칼퇴했어요", when: "night" },
      { t: "안개 끼면 사슴 머릿수부터 세요", when: "fog" },
    ],
  },
  {
    id: "firekeeper",
    name: "불멍 장인",
    body: "sheet",
    color: CANDLE,
    look: ["hand_lantern"],
    home: { x: 720, y: 470, r: 90 }, // 모닥불 광장 (광장 담당은 이 사람 하나)
    perches: ["kP1", "kP2", "kP3", "kPw1", "kPe1"],
    grass: 3,
    legMs: 50_000,
    speed: 24,
    moods: ["rest", "music"],
    taste: "fire",
    lines: [
      { t: "불멍 경력 십 년, 자격증은 없어요" },
      { t: "앉아서 T 누르면 머리 위에 상태가 떠요" },
      { t: "'쉬는 중' 띄우면 아무도 일 안 시켜요" },
      { t: "노동요 틀어 놓고 불멍하면 시간 순삭" },
      { t: "30분 머물 때마다 접속 보너스가 생겨요" },
      { t: "밤 불멍은 내일 걱정을 태워 줘요", when: "night" },
      { t: "비가 와도 이 불은 야근해요", when: "rain" },
      { t: "눈 오는 날 불멍은 국룰이에요", when: "snow" },
    ],
  },
  {
    id: "leegj",
    name: "영끌 반장",
    body: "cup",
    color: OCHRE,
    look: [],
    home: { x: 1160, y: 430, r: 190 }, // 분양 단지 (주거 구역)
    perches: ["bN"],
    grass: 3,
    legMs: 38_000,
    speed: 32,
    moods: ["coffee", "work"],
    taste: "walk",
    lines: [
      { t: "분양 사무소에서 터 크기·번지 골라요" },
      { t: "작은 터 → 넓은 터 → 대저택, 꿈은 커요" },
      { t: "가구 놓고 외관 바꾸면 집이 살아나요" },
      { t: "남의 집 구경 가서 좋아요 눌러 줘요" },
      { t: "방명록 한 줄이 대출 이자보다 힘이 돼요" },
      { t: "커피 세 잔째… 커피값부터 아껴야죠" },
      { t: "아침 커피 없인 영끌도 못 해요", when: "dawn" },
      { t: "집 꾸미다 보면 새벽 두 시예요", when: "night" },
    ],
  },
  {
    id: "choisw",
    name: "택배 대기",
    body: "bun",
    color: LAVENDER,
    look: ["hat_flower"],
    home: { x: 570, y: 120, r: 140 }, // 정문 앞마당·유령 잡화점·달빛 연못
    perches: ["bG", "bH"],
    grass: 4,
    legMs: 34_000,
    speed: 36,
    moods: ["music", "meal"],
    taste: "swim",
    lines: [
      { t: "잡화점 주인장 앞에서 E면 구경 시작" },
      { t: "꾸미기·폭죽·확성기·염색권 다 있어요" },
      { t: "염색권은 시간 안에 색을 찾아야 해요" },
      { t: "특수 색은 드물게 숨어 있대요" },
      { t: "지른 건 바로 오는데 왜 택배를 기다리죠" },
      { t: "노을 질 때 달빛 연못이 제일 예뻐요", when: "dusk" },
      { t: "달빛 연못은 밤에 와야 이름값 해요", when: "night" },
      { t: "비 오면 택배 상자 젖을까 봐 걱정돼요", when: "rain" },
    ],
  },
  {
    id: "jungcj",
    name: "별멍씨",
    body: "tall",
    color: MIST,
    look: ["hat_halo"],
    home: { x: 240, y: 140, r: 150 }, // 별 보기 언덕 (망원경·열기구)
    perches: ["lB", "bL"],
    grass: 4,
    legMs: 46_000,
    speed: 26,
    moods: ["rest", "music"],
    taste: "walk",
    lines: [
      { t: "망원경 앞에서 E면 별자리 잇기예요" },
      { t: "빛이 별에 닿을 때 누르면 별이 켜져요" },
      { t: "돗자리에 누워 멍때리기도 좋아요" },
      { t: "열기구는 언덕 출발장에서 E, 넷이 타요" },
      { t: "내리고 싶으면 X 두 번이에요" },
      { t: "맑은 밤엔 가끔 별똥별이 떨어져요", when: "night" },
      { t: "구름 낀 날은 별 대신 마감을 봐요", when: "rain" },
      { t: "낮에도 별은 거기 있대요, 연차처럼", when: "day" },
    ],
  },
  {
    id: "handr",
    name: "사공 노씨",
    body: "umbrella",
    color: CANDLE,
    look: [],
    home: { x: 400, y: 640, r: 130 }, // 강가·서쪽 다리
    perches: ["lC", "bK"],
    grass: 5,
    legMs: 36_000,
    speed: 32,
    moods: ["music", "rest"],
    taste: "swim",
    lines: [
      { t: "나루터는 호수 쪽이에요, 조각배는 둘이 타요" },
      { t: "배 위에서 E 누르면 그 자리서 낚시해요" },
      { t: "내릴 땐 물가 가까이 가서 E예요" },
      { t: "서쪽 다리 건너면 바로 동물원이에요" },
      { t: "물에 들어가면 헤엄도 쳐져요" },
      { t: "노 젓다 보면 퇴근 생각이 안 나요" },
      { t: "비 오는 날은 우산 쓰고 노 저어요", when: "rain" },
      { t: "눈 오면 강물이 더 조용해요", when: "snow" },
    ],
  },
  {
    id: "ohbj",
    name: "입질대기",
    body: "box",
    color: MOSS,
    look: ["hat_straw"],
    home: { x: 1200, y: 830, r: 140 }, // 호수·나루터·낚시터
    perches: ["lE", "bO"],
    grass: 4,
    legMs: 48_000,
    speed: 24,
    moods: ["rest", "meal"],
    taste: "swim",
    lines: [
      { t: "낚시 의자 앞 E, 입질 오면 꾹 감아요" },
      { t: "물고기가 세게 당기면 잠깐 놓아 줘요" },
      { t: "잡은 물고기는 어부 영감님이 사 가요" },
      { t: "도감 채우면 단계마다 보상이 있어요" },
      { t: "최대어 순위에 이름 올리는 게 꿈이에요" },
      { t: "기다림도 업무예요. 지금 입질 대기 중" },
      { t: "새벽 낚시는 출근 전 유일한 자유", when: "dawn" },
      { t: "비 올 때 입질 좋다는 건 제 뇌피셜", when: "rain" },
    ],
  },
  {
    id: "yoonjj",
    name: "밤 묘지기",
    body: "round",
    color: OCHRE,
    look: [],
    home: { x: 150, y: 600, r: 100 }, // 묘지기 모닥불
    perches: ["kWn", "kWs", "kWw", "kWe"],
    grass: 3,
    legMs: 42_000,
    speed: 28,
    moods: ["rest", "study"],
    taste: "fire",
    lines: [
      { t: "묘비 쓰기는 메뉴에서, 한 사람에 하나예요" },
      { t: "메뉴 → 내 묘비 가기면 알아서 걸어가요" },
      { t: "묘비는 때가 되면 조용히 성불해요" },
      { t: "성불한 이야기들도 메뉴에서 볼 수 있어요" },
      { t: "자격증 공부는… 불 앞에서 쉬는 중" },
      { t: "야간 수당은 불멍으로 받아요", when: "night" },
      { t: "새벽 순찰 끝, 이제 퇴근각이에요", when: "dawn" },
      { t: "안개 낀 묘역은 저도 좀 무서워요", when: "fog" },
    ],
  },
  {
    id: "seogj",
    name: "숲속 길치",
    body: "catmask",
    color: BONE,
    look: [],
    home: { x: 500, y: 880, r: 130 }, // 안개 숲·안개 연못
    perches: ["bS"],
    grass: 3,
    legMs: 44_000,
    speed: 26,
    moods: ["call", "rest"],
    taste: "swim",
    lines: [
      { t: "수집가는 숲 빈터에… 있었는데 어디더라" },
      { t: "약초·광석·곤충은 수집가가 사 가요" },
      { t: "희귀한 걸수록 비싸게 쳐 준대요" },
      { t: "숲 쪽 동문으로 가면 동물원이에요" },
      { t: "지도 보고 걸었는데 또 여기예요" },
      { t: "탈 쓰면 길 물어봐도 덜 창피해요" },
      { t: "안개 끼면 전 그냥 여기 살아요", when: "fog" },
      { t: "눈 오면 제 발자국 따라 돌아가요", when: "snow" },
    ],
  },
  {
    id: "jangin",
    name: "성묘 개근",
    body: "cat",
    color: LAVENDER,
    look: ["hat_cat"],
    home: { x: 240, y: 440, r: 160 }, // 옛 묘역
    perches: ["bI", "bJ"],
    grass: 5,
    legMs: 36_000,
    speed: 34,
    moods: ["study", "music"],
    taste: "walk",
    lines: [
      { t: "성황당은 옛 묘역 동문 옆이에요" },
      { t: "떠난 묘비들은 성황당에서 쉬고 있어요" },
      { t: "성황당에서 다시 모셔 올 수도 있어요" },
      { t: "고양이 옆에서 E 누르면 골골해요" },
      { t: "고양이 간식비가 제 월급을 이겨요" },
      { t: "밤엔 꼬마 유령들도 놀러 와요", when: "night" },
      { t: "성묘하기 딱 좋은 날씨네요", when: "day" },
    ],
  },
  {
    id: "kangdr",
    name: "칼퇴 용사",
    body: "hood",
    color: MOSS,
    look: ["hand_lantern"],
    home: { x: 890, y: 120, r: 120 }, // 사냥터 동굴 앞·분양 사무소
    perches: ["bQ"],
    grass: 4,
    legMs: 40_000,
    speed: 30,
    moods: ["rest", "meal"],
    taste: "walk",
    lines: [
      { t: "동굴 앞에서 E 누르면 사냥터예요" },
      { t: "쉬움부터 지옥까지, 저는 쉬움 전문" },
      { t: "독·화상·빙결 걸리면 물약 드세요" },
      { t: "같이 사냥 가면 훨씬 덜 외로워요" },
      { t: "옆 건물 분양 사무소도 문 앞에서 E예요" },
      { t: "황금 고블린 먼저 잡으면 보너스래요" },
      { t: "6시 땡, 이제 진짜 일 시작이에요", when: "dusk" },
      { t: "야근 대신 야간 사냥 중이에요", when: "night" },
    ],
  },
  {
    id: "limtj",
    name: "까악 부장",
    body: "suit",
    color: OCHRE,
    look: [],
    home: { x: 1110, y: 170, r: 140 }, // 까마귀 연못·주거 구역 북쪽
    perches: ["bN"],
    grass: 3,
    legMs: 42_000,
    speed: 28,
    moods: ["call", "work"],
    taste: "swim",
    lines: [
      { t: "회의는 짧게, 까악은 크게" },
      { t: "뛰어서 다가가면 까마귀가 다 날아가요" },
      { t: "천천히 걸어오면 까마귀도 안 놀라요" },
      { t: "보고는 까마귀 편으로 받습니다" },
      { t: "분양 마을에 내 집 하나 어때요?" },
      { t: "집 꾸미면 좋아요랑 방명록이 쌓여요" },
      { t: "다들 들어가세요, 까마귀도 퇴근했어요", when: "night" },
      { t: "비 오는 날 회식은 취소예요", when: "rain" },
    ],
  },
  {
    id: "songjj",
    name: "호박대왕",
    body: "round",
    color: CANDLE,
    look: ["hat_straw"],
    home: { x: 990, y: 930, r: 100 }, // 호박밭 작은 모닥불
    perches: ["kSn", "kSs", "kSw", "kSe", "cE", "cF"],
    grass: 4,
    legMs: 46_000,
    speed: 24,
    moods: ["meal", "rest"],
    taste: "fire",
    lines: [
      { t: "회사 그만두고 호박 키워요" },
      { t: "이 모닥불은 아는 사람만 와요" },
      { t: "채집한 건 숲 빈터 수집가한테 팔아요" },
      { t: "앉아서 T, '밥 먹는 중' 띄워 놓고 쉬어요" },
      { t: "묘비엔 '호박은 키웠다' 쓸 거예요" },
      { t: "왕관은 없어요. 호박이 왕관이에요" },
      { t: "아침 이슬 맞은 호박이 최고예요", when: "dawn" },
      { t: "비 오면 물 안 줘도 돼요, 개꿀", when: "rain" },
    ],
  },
  {
    id: "baeksw",
    name: "꽃집 아들",
    body: "bun",
    color: MOSS,
    look: ["neck_scarf"],
    home: { x: 720, y: 920, r: 150 }, // 다리 건너 묘역
    perches: ["bV", "bW"],
    grass: 4,
    legMs: 38_000,
    speed: 32,
    moods: ["music", "coffee"],
    taste: "walk",
    lines: [
      { t: "헌화는 묘비마다 하루 한 번이에요" },
      { t: "헌화하면 주는 쪽도 받는 쪽도 포인트" },
      { t: "헌화 랭킹도 있는 거 알아요?" },
      { t: "관람차는 맨 아래 칸에서 E, 둘이 타요" },
      { t: "폭죽 쏘면 채널 모두가 같이 봐요" },
      { t: "꽃집 물려받기 싫어서 여기 왔어요" },
      { t: "밤 관람차 야경은 꼭 보세요", when: "night" },
      { t: "눈 오면 꽃이 얼까 봐 걱정돼요", when: "snow" },
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

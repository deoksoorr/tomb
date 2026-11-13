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
    name: "오싹이",
    body: "suit",
    color: MIST,
    look: [],
    home: { x: 790, y: 300, r: 90 }, // 귀신의집·소원 분수 옆 (광장 북동쪽 가장자리)
    perches: ["cA", "cB"],
    grass: 4,
    legMs: 40_000,
    speed: 30,
    moods: ["rest", "music"],
    taste: "fire",
    lines: [
      { t: "귀, 귀신의집 미로는 저 문으로 들어가!" },
      { t: "미로는 기록만 남아~ 포인트는 없어!" },
      { t: "안에서 깜짝 소리가 나… 나도 매번 놀라!" },
      { t: "소원 분수 운세는 하루에 한 번이야~" },
      { t: "작은 동전을 던져도 운세는 똑같대!" },
      { t: "밤 귀신의집은… 나 없이 다녀와 줄래?", when: "night" },
      { t: "낮엔 귀신들도 낮잠 자… 아마도!", when: "day" },
      { t: "비 오는 날 귀신의집은 반칙이야, 히잉", when: "rain" },
    ],
  },
  {
    id: "parkjj",
    name: "멍냥이",
    body: "hood",
    color: BONE,
    look: ["neck_scarf"],
    home: { x: 210, y: 880, r: 150 }, // 동물원
    perches: ["bX"],
    grass: 4,
    legMs: 44_000,
    speed: 28,
    moods: ["rest", "meal"],
    taste: "walk",
    lines: [
      { t: "펫을 데려가려면 곰이 선배 앞에서 E야!" },
      { t: "큰 개·왕거위·달빛 사슴은 탈 수 있어~" },
      { t: "펫이랑 같이 있을 때 R 누르면 올라타!" },
      { t: "앉거나 물에 들어가면 펫에서 내려져~" },
      { t: "펫은 한 번에 한 마리만 데려갈 수 있어" },
      { t: "오늘도 다들 밥 잘 먹었어, 뿌듯해!" },
      { t: "쉿, 동물 친구들 다 코 자는 중이야~", when: "night" },
      { t: "안개 끼면 사슴 머릿수부터 세어 봐!", when: "fog" },
    ],
  },
  {
    id: "firekeeper",
    name: "불씨",
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
      { t: "타닥타닥~ 불 소리 들으면 마음이 녹아" },
      { t: "앉아서 T 누르면 머리 위에 상태가 떠!" },
      { t: "'쉬는 중' 띄워 두고 느긋하게 있어~" },
      { t: "'음악 듣는 중' 띄우고 불멍하면 딱이야" },
      { t: "오래 머물면 접속 보너스가 생긴대~" },
      { t: "밤 불빛은 걱정을 살살 녹여 줘~", when: "night" },
      { t: "비가 와도 이 불은 안 꺼져, 걱정 마!", when: "rain" },
      { t: "눈 오는 날엔 불 곁이 제일이야~", when: "snow" },
    ],
  },
  {
    id: "leegj",
    name: "집순이",
    body: "cup",
    color: OCHRE,
    look: [],
    home: { x: 1160, y: 430, r: 190 }, // 분양 단지 (주거 구역)
    perches: ["bN"],
    grass: 3,
    legMs: 38_000,
    speed: 32,
    moods: ["rest", "music"],
    taste: "walk",
    lines: [
      { t: "분양 사무소에서 터 크기랑 번지 골라!" },
      { t: "작은 터, 넓은 터, 대저택까지 있어~" },
      { t: "가구 놓고 외관 바꾸면 집이 살아나!" },
      { t: "남의 집 구경 가서 좋아요 눌러 줘~" },
      { t: "방명록 한 줄이면 하루 종일 기뻐!" },
      { t: "오늘은 어느 집 구경 갈까? 두근두근!" },
      { t: "아침 햇살 드는 창가 자리, 최고야~", when: "dawn" },
      { t: "집 꾸미다 보면 벌써 밤이야, 히히", when: "night" },
    ],
  },
  {
    id: "choisw",
    name: "보따리",
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
      { t: "잡화점 주인장 앞에서 E면 구경 시작!" },
      { t: "꾸미기·폭죽·확성기·염색권 다 있어~" },
      { t: "염색권은 시간 안에 색을 찾아야 해!" },
      { t: "특수 색은 아주 드물게 숨어 있대~" },
      { t: "있잖아 있잖아, 오늘 무슨 일 있었어?" },
      { t: "노을 질 때 달빛 연못이 제일 예뻐!", when: "dusk" },
      { t: "달빛 연못은 밤에 와야 반짝반짝해~", when: "night" },
      { t: "비 오면 보따리 젖을까 봐 꽁꽁 싸매!", when: "rain" },
    ],
  },
  {
    id: "jungcj",
    name: "총총이",
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
      { t: "망원경 앞에서 E 누르면 별자리 잇기야!" },
      { t: "빛이 별에 닿을 때 누르면 별이 켜져~" },
      { t: "돗자리에 누워서 하늘 보는 것도 좋아" },
      { t: "열기구는 언덕 출발장에서 E, 넷이 타!" },
      { t: "열기구에서 내리고 싶으면 X 두 번!" },
      { t: "맑은 밤엔 가끔 별똥별이 떨어져, 빌어!", when: "night" },
      { t: "구름 뒤에서도 별은 반짝이고 있을 거야", when: "rain" },
      { t: "낮에도 별은 거기 있대, 숨바꼭질 중!", when: "day" },
    ],
  },
  {
    id: "handr",
    name: "찰랑이",
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
      { t: "나루터는 호수 쪽! 조각배는 둘이 타~" },
      { t: "배 위에서 E 누르면 그 자리서 낚시해!" },
      { t: "배에서 내릴 땐 물가 가까이 가서 E야" },
      { t: "서쪽 다리 건너면 바로 동물원이야~" },
      { t: "물에 들어가면 헤엄도 칠 수 있어, 첨벙!" },
      { t: "찰랑찰랑 물소리 들으면 신나!" },
      { t: "비 오는 날 강물은 톡톡 노래해~", when: "rain" },
      { t: "눈 오면 강물이 더 조용해져…", when: "snow" },
    ],
  },
  {
    id: "ohbj",
    name: "낚돌이",
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
      { t: "낚시 의자 앞에서 E, 입질 오면 꾹 감아!" },
      { t: "물고기가 세게 당기면 잠깐 놓아 줘~" },
      { t: "잡은 물고기는 어부 영감님이 사 가!" },
      { t: "도감 채우면 단계마다 보상이 있어!" },
      { t: "최대어 순위에 이름 올리는 게 내 꿈이야" },
      { t: "쉿! 방금 찌가 움찔했어, 움찔!" },
      { t: "새벽 물안개 낚시가 제일 설레~", when: "dawn" },
      { t: "비 오는 날엔 입질이 좋을 것 같아, 느낌!", when: "rain" },
    ],
  },
  {
    id: "yoonjj",
    name: "등불이",
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
      { t: "묘비 쓰기는 메뉴에서, 한 사람에 하나야" },
      { t: "메뉴 → 내 묘비 가기면 알아서 걸어가~" },
      { t: "묘비는 때가 되면 조용히 성불해" },
      { t: "성불한 이야기들도 메뉴에서 볼 수 있어" },
      { t: "길 잃으면 이 불빛 보고 와, 기다릴게" },
      { t: "밤길은 내가 밝혀 줄게, 천천히 와~", when: "night" },
      { t: "새벽 순찰 끝, 이제 등불 끌 시간이야", when: "dawn" },
      { t: "안개 낀 날엔 등불을 더 높이 들게", when: "fog" },
    ],
  },
  {
    id: "seogj",
    name: "뭉게",
    body: "catmask",
    color: BONE,
    look: [],
    home: { x: 500, y: 880, r: 130 }, // 안개 숲·안개 연못
    perches: ["bS"],
    grass: 3,
    legMs: 44_000,
    speed: 26,
    moods: ["rest", "music"],
    taste: "swim",
    lines: [
      { t: "수집가는 숲 빈터에… 있었는데 어디더라" },
      { t: "약초·광석·곤충은 수집가가 사 가~" },
      { t: "희귀한 걸수록 비싸게 쳐 준대!" },
      { t: "숲 쪽 동문으로 가면 동물원이야… 아마" },
      { t: "지도 보고 걸었는데 또 여기네, 헤헤" },
      { t: "구름 구경하며 걷다 보면 길을 잃어~" },
      { t: "안개 끼면 나 그냥 여기서 살래…", when: "fog" },
      { t: "눈 오면 내 발자국 따라 돌아가면 돼!", when: "snow" },
    ],
  },
  {
    id: "jangin",
    name: "한때",
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
      { t: "성황당은 옛 묘역 동문 옆에 있단다" },
      { t: "떠난 묘비들은 성황당에서 쉬고 있지" },
      { t: "성황당에서 다시 모셔 올 수도 있단다" },
      { t: "고양이 옆에서 E 누르면 골골거린단다" },
      { t: "옛날 옛적에 말이야… 어디까지 했더라?" },
      { t: "이 묘역엔 이야기가 참 많이 잠들어 있어" },
      { t: "밤엔 꼬마 유령들이 놀러 온단다", when: "night" },
      { t: "볕 좋은 날엔 옛이야기도 술술 나와~", when: "day" },
    ],
  },
  {
    id: "kangdr",
    name: "칼돌이",
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
      { t: "동굴 앞에서 E 누르면 사냥터야, 출동!" },
      { t: "쉬움부터 지옥까지! 난 아직 쉬움이야" },
      { t: "독·화상·빙결 걸리면 물약 마셔!" },
      { t: "같이 사냥 가면 훨씬 든든해!" },
      { t: "옆 건물 분양 사무소도 문 앞에서 E야" },
      { t: "황금 고블린 먼저 잡으면 보너스래!" },
      { t: "노을 지면 용사 출동 준비 완료!", when: "dusk" },
      { t: "밤에도 용사는 씩씩해! 조금 졸려도…", when: "night" },
    ],
  },
  {
    id: "limtj",
    name: "까망이",
    body: "suit",
    color: OCHRE,
    look: [],
    home: { x: 1110, y: 170, r: 140 }, // 까마귀 연못·주거 구역 북쪽
    perches: ["bN"],
    grass: 3,
    legMs: 42_000,
    speed: 28,
    moods: ["rest", "meal"],
    taste: "swim",
    lines: [
      { t: "까악! 나는 까마귀들이랑 친구야~" },
      { t: "뛰어서 다가가면 까마귀가 다 날아가!" },
      { t: "천천히 걸어오면 까마귀도 안 놀라~" },
      { t: "까마귀들이 오늘도 소식 물어다 줬어!" },
      { t: "분양 마을에 내 집 하나 어때?" },
      { t: "집 꾸미면 좋아요랑 방명록이 쌓여~" },
      { t: "쉿, 까마귀들도 이제 코 잘 시간이야", when: "night" },
      { t: "비 오는 날엔 다 같이 나무 밑에 숨어!", when: "rain" },
    ],
  },
  {
    id: "songjj",
    name: "호박이",
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
      { t: "저, 저기… 호박 구경 왔어?" },
      { t: "이 모닥불은 아는 사람만 오는 곳이야" },
      { t: "채집한 건 숲 빈터 수집가한테 팔아~" },
      { t: "앉아서 T, '밥 먹는 중' 띄우고 쉬어 봐" },
      { t: "호박이 쑥쑥 크면 나도 쑥쑥 기뻐…" },
      { t: "말 걸어 줘서 고마워, 헤헤…" },
      { t: "아침 이슬 맞은 호박이 제일 예뻐", when: "dawn" },
      { t: "비 오면 물 안 줘도 돼서 좋아!", when: "rain" },
    ],
  },
  {
    id: "baeksw",
    name: "꽃님이",
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
      { t: "헌화는 묘비마다 하루 한 번이야~" },
      { t: "헌화하면 주는 쪽도 받는 쪽도 포인트!" },
      { t: "헌화 랭킹도 있는 거 알아?" },
      { t: "관람차는 맨 아래 칸에서 E, 둘이 타!" },
      { t: "폭죽 쏘면 채널 모두가 같이 봐~" },
      { t: "오늘은 어떤 꽃을 놓아 줄까? 고민돼!" },
      { t: "밤 관람차에서 보는 야경, 꼭 봐!", when: "night" },
      { t: "눈 오면 꽃이 얼까 봐 꼭 안아 줘", when: "snow" },
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

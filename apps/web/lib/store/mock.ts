import { parseYmd, suggestEpitaph, todayKst } from "../epitaph";
import type { CauseTag, Grave } from "../types";

// 로컬 MemoryStore에 심는 목업 묘비. 시드 고정 난수라서 새로고침해도 같은 묘지가 나온다.
// 소유자는 없다 (ownerTokenHash = "") → 누구도 수정·삭제할 수 없다.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const NAMES = [
  "할 일 앱 v3", "동네 맛집 지도", "주식 자동매매 봇", "AI 일기장", "반려식물 물주기 알림",
  "개발자 밈 생성기", "독서 기록 SNS", "블록체인 투표 시스템", "MBTI 궁합 테스트", "사이드프로젝트 관리 툴",
  "회사 점심 메뉴 룰렛", "1인 가구 냉장고 관리", "러닝 크루 매칭", "나만의 블로그 엔진", "코딩테스트 오답노트",
  "중고 키보드 시세 알리미", "디스코드 음악 봇", "자취 레시피 추천", "지하철 혼잡도 예보", "말로 쓰는 가계부",
  "레트로 픽셀 RPG", "영어 단어 스트릭", "회고 자동화 슬랙봇", "노션 템플릿 마켓", "동아리 출석 체크",
  "공모전 일정 모음", "캠핑장 빈자리 알림", "날씨 옷차림 추천", "커밋 메시지 생성기", "고양이 사진 분류기",
  "오픈소스 기여 트래커", "수강신청 도우미", "웹툰 취향 추천", "포트폴리오 생성기", "모각코 타이머",
  "헬스 루틴 기록장", "김치프리미엄 알림 봇", "사내 익명 게시판", "여행 경비 정산", "개인용 RSS 리더",
];

const TASKS = [
  "로그인 구현", "결제 연동", "디자인 시안", "배포 설정", "다크모드", "푸시 알림", "랜딩 페이지",
  "DB 스키마 설계", "README 작성", "OAuth 붙이기", "테스트 코드", "리팩터링", "아이콘 고르기", "CI 설정",
  "크롤러 수리", "앱스토어 심사",
];

const EPITAPHS = [
  "README만 화려했다", "도메인은 아직 1년 남았다", "다음 주에 마저 하려고 했다", "기획서는 완벽했다",
  "사용자 0명, 후회 0개", "로고만 세 번 바꿨다", "npm install 중 영면", "final_진짜_최종",
];

const MOURNERS = [
  "새벽코더", "야근요정", "커밋장인", "주말개발자", "카페인중독", "버그수집가", "todo_master",
  "리팩터링중", "깃허브잔디", "퇴근후코딩", "프론트막내", "백엔드곰", "잠못드는밤", "사이드킥",
];

const DETAILS: Partial<Record<CauseTag, string>> = {
  time: "회사 일이 바빠지면서 주말에도 손을 못 댔다.",
  interest: "처음 2주는 매일 밤을 새웠는데, 어느 순간 열어보지 않게 됐다.",
  better_idea: "샤워하다가 더 좋은 아이디어가 떠올랐다. 그것도 지금 이 묘지 어딘가에 있다.",
  already_exists: "만들다 보니 비슷한 서비스가 이미 세 개나 있었다. 심지어 무료였다.",
  technical: "실시간 동기화에서 막혔다. 웹소켓은 생각보다 어려웠다.",
  server_cost: "AWS 청구서를 보고 조용히 인스턴스를 내렸다.",
  team_split: "넷이 시작했는데 마지막엔 혼자 남아 있었다.",
  no_users: "출시 첫날 가입자는 나와 엄마였다.",
};

const STACKS = [
  ["Next.js", "TypeScript", "Supabase"], ["React Native", "Firebase"], ["Python", "FastAPI"], ["Flutter"],
  ["Go", "SQLite"], ["Vue", "Express"], ["Unity", "C#"], ["SvelteKit", "Cloudflare"], ["Spring", "MySQL"], ["Rust"],
];

const CAUSES: CauseTag[] = [
  "time", "interest", "better_idea", "already_exists", "technical", "server_cost", "team_split", "no_users", "other",
];

/** 생존 기간 4단계(7일 미만 / 3개월 미만 / 1년 미만 / 1년 이상)를 고르게 섞는다 */
const AGE_TIERS: [number, number][] = [
  [1, 6],
  [7, 89],
  [90, 364],
  [365, 1400],
];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function mockGraves(count: number, now = Date.now()): { grave: Grave; flowers: number; revives: number }[] {
  const rand = mulberry32(20240607);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const today = parseYmd(todayKst(now));

  return Array.from({ length: count }, (_, i) => {
    const [minAge, maxAge] = AGE_TIERS[i % AGE_TIERS.length];
    const age = int(minAge, maxAge);
    const diedAt = ymd(today - int(0, 400) * DAY);
    const bornAt = ymd(parseYmd(diedAt) - (age - 1) * DAY);
    const causes = [...new Set([pick(CAUSES), ...(rand() < 0.4 ? [pick(CAUSES)] : [])])];
    const lastTask = rand() < 0.75 ? pick(TASKS) : undefined;
    const round = Math.floor(i / NAMES.length);

    const grave: Grave = {
      id: `mock-${String(i + 1).padStart(3, "0")}`,
      name: NAMES[i % NAMES.length] + (round ? ` ${round + 1}` : ""),
      epitaph: rand() < 0.3 ? pick(EPITAPHS) : suggestEpitaph(age, lastTask),
      bornAt,
      diedAt,
      ageDays: age,
      lastTask,
      causes,
      causeDetail: rand() < 0.6 ? DETAILS[causes[0]] : undefined,
      links: rand() < 0.35 ? [`https://example.com/graveyard/${i + 1}`] : undefined,
      stack: rand() < 0.6 ? pick(STACKS) : undefined,
      mourner: pick(MOURNERS),
      // 등록 순서 = 인덱스 순서. 하루 반 간격 + 간격보다 작은 흔들림 → 순서는 유지된다
      createdAt: now - (count - i) * 36 * HOUR + int(0, 6 * HOUR),
      ownerTokenHash: "",
    };
    return {
      grave,
      flowers: rand() < 0.15 ? 0 : Math.floor(rand() ** 2 * 120),
      revives: rand() < 0.35 ? 0 : Math.floor(rand() ** 3 * 40),
    };
  });
}

// 11/19 기간 한정 노점 판매 일정 (계절 보따리상 = 코디 cos · 가구 보따리상 = 가구 furn). 클라이언트·서버 공용 (가져오는 것 없음).
//  - 코디는 매주 토요일 새벽 5시(한국 시각), 가구는 사흘 뒤 화요일 새벽 5시에 새 묶음을 푼다
//  - 묶음 하나 = { start, kind, items, saleEnd }. 풀린 물건은 saleEnd까지 계속 판다 (끝나면 판매만 닫히고 산 것은 그대로)
//  - 풀리기 한 주 전(start − 7일)부터 「판매 예정」 칸에 미리 보인다 (입어 보기·배치 미리보기는 되고 사기는 서버가 막는다)
//  - 판정·문구는 lib/seasonShop/rules.ts, 값·사기는 lib/seasonShop/service.ts
// 코디 (11/20 운영자 결정, 최종): 코디 기획안 여덟 벌을 모두 여기서 판다. 세트마다 다섯 점(체육대회 네 점)을 한 번에 풀고,
//  출시일 토요일 새벽 5시부터 딱 2주(SEASON_SALE_DAYS) 판다. 한 주 간격으로 내서 늘 두 세트가 겹쳐 팔린다.
//  순서·날짜는 COS_RELEASES 한 줄씩만 고치면 된다 (판매 끝은 시작 + 2주로 계산). 1월 빈 주는 11/20 새 다섯 벌로 채웠다 (모두 열세 벌)
// 가구는 11/24부터 매주 화요일 한 묶음씩 넷, 모두 겨울 끝(2/28 판매일)까지.
// 아이템·가구 정의가 아직 없는 id는 판매 창·서버가 건너뛴다 (protocol itemById · lib/housing/catalog furnitureById가 없으면 목록에서 빠지고 사기도 거절)

export type SeasonKind = "cos" | "furn";

/** 노점 이름 (판매 창 제목·월드 이름표 첫 줄) */
export const SEASON_SHOP_TITLE: Record<SeasonKind, string> = { cos: "계절 보따리상", furn: "가구 보따리상" };
/** 월드 이름표 둘째 줄 (작게) */
export const SEASON_SHOP_SUB: Record<SeasonKind, string> = { cos: "기간 한정 코디", furn: "기간 한정 가구" };

export type SeasonDrop = {
  /** 판매 시작 (ms, 한국 시각 새벽 5시) */
  start: number;
  kind: SeasonKind;
  /** 세트 id (코디는 protocol SEASON_SETS id와 같다 — 한 벌 덤 안내) */
  set: string;
  /** 세트 이름 (판매 창 묶음 제목) */
  setName: string;
  /** 이 묶음에 풀리는 물건 id */
  items: readonly string[];
  /** 판매 종료 (ms, 이 시각부터 못 산다) */
  saleEnd: number;
};

const HOUR_MS = 3_600_000;
export const SEASON_DAY_MS = 24 * HOUR_MS;
export const SEASON_WEEK_MS = 7 * SEASON_DAY_MS;
/** 미리 보이는 기간 (풀리기 한 주 전부터 「판매 예정」) */
export const SEASON_PREVIEW_MS = SEASON_WEEK_MS;
/** 11/20 사용자 「다음 차수에 파는 것까지 미리 보여 주자」: 한 주 전이 아니어도 앞으로 풀릴 묶음 중 가장 가까운 두 차례(시작 시각 기준)는 「판매 예정」으로 */
export const SEASON_PREVIEW_ROUNDS = 2;

/** 한국 시각 → ms */
export const kstMs = (y: number, mo: number, d: number, h = 5, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);

/** 겨울 시즌 끝 (2027-03-01 새벽 5시 — 2월 28일 판매일까지) */
const WINTER_END = kstMs(2027, 3, 1);

/** 11/20 계절 보따리상 코디 한 벌을 파는 날 수 (출시 토요일 새벽 5시 → 2주 뒤 같은 시각에 판매 끝) */
export const SEASON_SALE_DAYS = 14;

/** 코디 한 벌 (세트 id·이름·물건은 protocol SEASON_SETS와 같다 — 이 파일은 가져오는 것이 없어 적어 둔다) */
const COS_SETS = {
  "snow-commute": { name: "첫눈 출근길", items: ["sc_earflap", "sc_padding", "sc_goguma", "sc_breath", "sc_snowduck"] },
  "overtime-fairy": { name: "야근 요정", items: ["of_antenna", "of_a4wings", "of_drink", "of_postit", "of_blueglow"] },
  "fog-keeper": { name: "안개 묘지기", items: ["gk_moonwreath", "gk_firefly", "gk_stonepack", "gk_fadesteps", "gk_owl"] },
  "santa-intern": { name: "산타 견습 요정", items: ["si_elfhat", "si_sack", "si_cookie", "si_bulbs", "si_wrap"] },
  "sports-day": { name: "사내 체육대회", items: ["sd_headband", "sd_baton", "sd_flag", "sd_dash"] },
  // 11/20 새 다섯 벌 (코디 기획안 2차 시안 — 1월 빈 주를 채운다)
  "year-end": { name: "송년회 3차", items: ["ye_tiehead", "ye_mic", "ye_tambo", "ye_tipsy", "ye_raccoon"] },
  "sunrise-hike": { name: "해맞이 산행", items: ["su_beanie", "su_pack", "su_flask", "su_sunrise", "su_goat"] },
  resolution: { name: "작심삼일", items: ["rs_band", "rs_shake", "rs_gymbag", "rs_planner", "rs_day3"] },
  "smelt-fest": { name: "빙어 축제", items: ["ic_earmuff", "ic_rod", "ic_icebox", "ic_hotpack", "ic_penguin"] },
  "frost-yard": { name: "서리 내린 묘역", items: ["fr_icicle", "fr_cloak", "fr_rime", "fr_icename", "fr_snowbun"] },
  "seollal-magpie": { name: "설날 까치", items: ["sm_jobawi", "sm_saekdong", "sm_pouch", "sm_magpie", "sm_saekname"] },
  "giri-choco": { name: "의리 초콜릿", items: ["vc_heartband", "vc_chocobox", "vc_letters", "vc_chocosteps", "vc_envelope"] },
  "spring-picnic": { name: "벚꽃 소풍", items: ["sp_buckethat", "sp_matpack", "sp_gimbap", "sp_sprouts", "sp_bee"] },
} as const satisfies Record<string, { name: string; items: readonly string[] }>;

/** 11/20 계절 보따리상 출시 순서: [세트, 출시 토요일(한국 시각 새벽 5시) 연·월·일]. 판매 끝 = 출시 + SEASON_SALE_DAYS */
export const COS_RELEASES: readonly (readonly [keyof typeof COS_SETS, number, number, number])[] = [
  ["snow-commute", 2026, 11, 21],
  ["overtime-fairy", 2026, 11, 28],
  ["fog-keeper", 2026, 12, 5],
  ["santa-intern", 2026, 12, 12],
  ["sports-day", 2026, 12, 19],
  // 11/20 새 다섯 벌로 1월 빈 주를 채웠다 (11/21부터 2/13까지 매주 끊김 없이 한 벌씩)
  ["year-end", 2026, 12, 26],
  ["sunrise-hike", 2027, 1, 2],
  ["resolution", 2027, 1, 9],
  ["smelt-fest", 2027, 1, 16],
  ["frost-yard", 2027, 1, 23],
  ["seollal-magpie", 2027, 1, 30], // 설 연휴 2/6~2/8 포함
  ["giri-choco", 2027, 2, 6], // 2/14 포함
  ["spring-picnic", 2027, 2, 13], // 11/20 2/27 → 2/13으로 당김
  // 새 세트는 COS_SETS에 한 벌을 적고 여기 한 줄 ([세트, 연, 월, 일])만 넣으면 된다 (판매 끝은 2주 뒤로 계산)
];

export const SEASON_DROPS: readonly SeasonDrop[] = [
  // ── 계절 보따리상 (코디, 토요일 · 2주씩) ──
  ...COS_RELEASES.map(([set, y, mo, d]): SeasonDrop => {
    const start = kstMs(y, mo, d);
    return { start, kind: "cos", set, setName: COS_SETS[set].name, items: COS_SETS[set].items, saleEnd: start + SEASON_SALE_DAYS * SEASON_DAY_MS };
  }),
  // ── 가구 보따리상 (가구, 화요일) ──
  { start: kstMs(2026, 11, 24), kind: "furn", set: "snow-living", setName: "첫눈 오는 거실", items: ["winter_stove", "knit_rug", "frost_window", "log_basket", "cocoa_table", "scarf_grave"], saleEnd: WINTER_END },
  { start: kstMs(2026, 12, 1), kind: "furn", set: "xmas-eve", setName: "크리스마스 이브", items: ["xmas_tree", "paper_tree", "stocking_fireplace", "gift_pile", "nutcracker", "wreath_stand"], saleEnd: WINTER_END },
  { start: kstMs(2026, 12, 8), kind: "furn", set: "year-end-party", setName: "연말 파티", items: ["cake_table", "balloon_bunch", "disco_ball", "party_sofa", "champagne_tower", "karaoke"], saleEnd: WINTER_END },
  { start: kstMs(2026, 12, 15), kind: "furn", set: "new-year-morning", setName: "새해 아침", items: ["folding_screen", "tteokguk_table", "lucky_pouch", "shield_kite", "cheongsa_lantern", "resolution_scroll"], saleEnd: WINTER_END },
];

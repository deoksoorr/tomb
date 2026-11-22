import { describe, expect, it } from "vitest";
import {
  isSeasonItem,
  isShopListed,
  isTitleId,
  itemById,
  ITEMS,
  lookWithPetFallback,
  permanentPrice,
  petPrice,
  sanitizeLook,
  SEASON_SETS,
  seasonPrice,
  seasonSetDef,
  seasonSetsOfLook,
  type CosmeticSlot,
} from "./index";

// 11/19 계절 한정 세트 (코디 기획안 plan.json 값 그대로): 잡화점에 없고 계절 보따리상에서만, 한 벌 덤 = 칭호 + 꾸미기 점수 + 연출

/** 기획안 표: [id, 부위, 이름, 등급, 하루권, 영구] */
const PLAN: readonly (readonly [string, CosmeticSlot, string, string, number | null, number])[] = [
  ["sc_earflap", "head", "귀달이 털모자", "fine", 400, 1600],
  ["sc_padding", "back", "무릎까지 롱패딩", "rare", 1200, 4800],
  ["sc_goguma", "hand", "군고구마 봉투", "common", 150, 600],
  ["sc_breath", "aura", "하얀 입김 오라", "fine", 300, 1200],
  ["sc_snowduck", "pet", "꼬마 눈오리", "rare", null, 5000],
  ["si_elfhat", "head", "견습 요정 모자", "fine", 450, 1800],
  ["si_sack", "pack", "선물 배달 자루", "legend", 2600, 10400],
  ["si_cookie", "hand", "진저브레드 쿠키", "common", 120, 480],
  ["si_bulbs", "feet", "꼬마전구 발자국", "fine", 500, 2000],
  ["si_wrap", "namePlate", "선물 포장 이름표", "fine", 350, 1400],
  // 11/20 나머지 여섯 벌 (하루권이 없던 펫 아닌 것 = 영구 ÷ 4)
  ["of_antenna", "head", "형광등 더듬이", "fine", 350, 1400],
  ["of_a4wings", "pack", "A4 종이 날개", "rare", 1200, 4800],
  ["of_drink", "hand", "에너지 드링크", "common", 100, 400],
  ["of_postit", "aura", "포스트잇 소용돌이", "fine", 400, 1600],
  ["of_blueglow", "nameColor", "블루라이트 이름", "common", 200, 800],
  ["gk_moonwreath", "head", "달맞이꽃 화관", "rare", 1200, 4800],
  ["gk_firefly", "hand", "반딧불 유리병", "fine", 600, 2400],
  ["gk_stonepack", "pack", "이끼 비석 배낭", "rare", 1500, 6000],
  ["gk_fadesteps", "feet", "흐려지는 발자국", "fine", 500, 2000],
  ["gk_owl", "pet", "등불 부엉이", "legend", null, 12000],
  ["sm_jobawi", "head", "복 조바위", "rare", 1100, 4400],
  ["sm_saekdong", "neck", "색동 목도리", "fine", 400, 1600],
  ["sm_pouch", "hand", "복주머니", "common", 180, 720],
  ["sm_magpie", "pet", "까치 친구", "legend", null, 10000],
  ["sm_saekname", "nameColor", "색동 이름", "fine", 300, 1200],
  ["vc_heartband", "head", "하트 더듬이 머리띠", "fine", 300, 1200],
  ["vc_chocobox", "hand", "의리 초콜릿 상자", "fine", 450, 1800],
  ["vc_letters", "aura", "러브레터 오라", "rare", 1000, 4000],
  ["vc_chocosteps", "feet", "녹은 초코 발자국", "common", 160, 640],
  ["vc_envelope", "namePlate", "편지봉투 이름표", "fine", 350, 1400],
  ["sp_buckethat", "head", "벚꽃 버킷햇", "fine", 350, 1400],
  ["sp_matpack", "pack", "돗자리 배낭", "fine", 600, 2400],
  ["sp_gimbap", "hand", "김밥 도시락", "common", 150, 600],
  ["sp_sprouts", "feet", "새싹 걸음", "fine", 400, 1600],
  ["sp_bee", "pet", "꼬마 꿀벌", "rare", null, 4400],
  ["sd_headband", "head", "청팀 머리띠", "common", 200, 800],
  ["sd_baton", "hand", "계주 바통", "common", 150, 600],
  ["sd_flag", "pack", "응원 깃발", "fine", 500, 2000],
  ["sd_dash", "feet", "흙먼지 질주", "fine", 400, 1600],
  // 11/20 새 다섯 벌 (코디 기획안 2차 시안)
  ["ye_tiehead", "head", "넥타이 머리띠", "fine", 350, 1400],
  ["ye_mic", "hand", "애창곡 마이크", "common", 150, 600],
  ["ye_tambo", "pack", "흥부자 탬버린", "fine", 600, 2400],
  ["ye_tipsy", "aura", "알딸딸 오라", "fine", 450, 1800],
  ["ye_raccoon", "pet", "꼬마 너구리", "rare", null, 6000],
  ["su_beanie", "head", "해돋이 털모자", "fine", 400, 1600],
  ["su_pack", "pack", "등산 배낭", "rare", 1200, 4800],
  ["su_flask", "hand", "믹스커피 보온병", "common", 150, 600],
  ["su_sunrise", "aura", "첫 햇살 오라", "fine", 700, 2800],
  ["su_goat", "pet", "꼬마 산양", "legend", null, 10000],
  ["rs_band", "head", "헬스 머리띠", "common", 200, 800],
  ["rs_shake", "hand", "단백질 쉐이크", "common", 150, 600],
  ["rs_gymbag", "pack", "새 운동 가방", "rare", 1100, 4400],
  ["rs_planner", "namePlate", "새해 계획표 이름표", "fine", 350, 1400],
  ["rs_day3", "feet", "사흘째 발자국", "fine", 450, 1800],
  ["ic_earmuff", "head", "털 귀마개", "fine", 350, 1400],
  ["ic_rod", "hand", "빙어 낚싯대", "common", 200, 800],
  ["ic_icebox", "pack", "빙어 아이스박스", "rare", 1100, 4400],
  ["ic_hotpack", "aura", "핫팩 오라", "fine", 300, 1200],
  ["ic_penguin", "pet", "빙어 도둑 펭귄", "rare", null, 7000],
  ["fr_icicle", "head", "고드름 왕관", "rare", 1000, 4000],
  ["fr_cloak", "pack", "서리꽃 망토", "legend", 2800, 11200],
  ["fr_rime", "feet", "성에 발자국", "fine", 500, 2000],
  ["fr_icename", "nameColor", "서리 앉은 이름", "fine", 350, 1400],
  ["fr_snowbun", "pet", "꼬마 눈토끼", "rare", null, 6000],
];
/** 기획안 세트 덤: [세트, 이름, 칭호, 점수, 점 수] */
const SETS: readonly (readonly [string, string, string, number, number])[] = [
  ["snow-commute", "첫눈 출근길", "t_ssSnow", 100, 5],
  ["santa-intern", "산타 견습 요정", "t_ssSanta", 120, 5],
  ["overtime-fairy", "야근 요정", "t_ssOvertime", 80, 5],
  ["fog-keeper", "안개 묘지기", "t_ssFog", 150, 5],
  ["seollal-magpie", "설날 까치", "t_ssMagpie", 120, 5],
  ["giri-choco", "의리 초콜릿", "t_ssGiri", 80, 5],
  ["spring-picnic", "벚꽃 소풍", "t_ssPicnic", 80, 5],
  ["sports-day", "사내 체육대회", "t_ssSports", 60, 4],
  ["year-end", "송년회 3차", "t_ssYearEnd", 100, 5],
  ["sunrise-hike", "해맞이 산행", "t_ssSunrise", 120, 5],
  ["resolution", "작심삼일", "t_ssResol", 60, 5],
  ["smelt-fest", "빙어 축제", "t_ssSmelt", 100, 5],
  ["frost-yard", "서리 내린 묘역", "t_ssFrost", 150, 5],
];

describe("11/19 계절 한정 세트", () => {
  it("기획안 값 그대로 (이름·부위·등급·하루권·영구), 꾸미기 아이템", () => {
    for (const [id, slot, name, grade, day, perm] of PLAN) {
      const it = itemById(id);
      expect(it, id).toBeDefined();
      expect(it?.kind).toBe("cosmetic");
      expect(it?.slot, id).toBe(slot);
      expect(it?.name, id).toBe(name);
      expect(it?.grade, id).toBe(grade);
      expect(seasonPrice(id), id).toEqual({ day, perm });
      expect(it?.desc.length).toBeGreaterThan(0);
    }
    expect(ITEMS.filter((i) => i.seasonSet).map((i) => i.id).sort()).toEqual(PLAN.map((r) => r[0]).sort());
  });

  it("잡화점·영구 구매·동물원에는 없다 (계절 보따리상에서만)", () => {
    for (const [id] of PLAN) {
      const it = itemById(id)!;
      expect(isSeasonItem(id)).toBe(true);
      expect(isShopListed(it), id).toBe(false);
      expect(permanentPrice(id), id).toBeNull();
      expect(petPrice(id), id).toBeNull();
    }
    expect(isSeasonItem("hat_beanie")).toBe(false);
    expect(seasonPrice("hat_beanie")).toBeNull();
  });

  it("세트 열세 벌: 부위마다 하나씩 다섯 점(체육대회 네 점), 칭호·점수 덤은 기획안 값", () => {
    expect(SEASON_SETS.map((s) => s.id)).toEqual(SETS.map((r) => r[0]));
    for (const [id, name, title, look, n] of SETS) expect(seasonSetDef(id), id).toMatchObject({ name, title, look, items: expect.any(Array) });
    for (const s of SEASON_SETS) {
      const n = SETS.find((r) => r[0] === s.id)![4];
      expect(s.items.length, s.id).toBe(n);
      expect(new Set(s.items.map((id) => itemById(id)?.slot)).size).toBe(n);
      for (const id of s.items) expect(itemById(id)?.seasonSet).toBe(s.id);
      expect(isTitleId(s.title)).toBe(true);
      expect(s.fx.length, s.id).toBeGreaterThan(0);
      expect(seasonSetDef(s.id)).toBe(s);
    }
    expect(seasonSetDef("snow-commute")).toMatchObject({ name: "첫눈 출근길", title: "t_ssSnow", look: 100 });
    expect(seasonSetDef("santa-intern")).toMatchObject({ name: "산타 견습 요정", title: "t_ssSanta", look: 120 });
  });

  it("다 입은 세트만 덤 (한 점이라도 빠지면 없음), 두 벌 섞어 입으면 둘 다 아님", () => {
    const snow = SEASON_SETS[0].items;
    const santa = SEASON_SETS[1].items;
    expect(seasonSetsOfLook([...snow]).map((s) => s.id)).toEqual(["snow-commute"]);
    expect(seasonSetsOfLook([...santa, "t_lv10"]).map((s) => s.id)).toEqual(["santa-intern"]);
    expect(seasonSetsOfLook(snow.slice(0, 4))).toEqual([]);
    expect(seasonSetsOfLook(["sc_earflap", "si_sack", "sc_goguma", "sc_breath", "sc_snowduck"])).toEqual([]);
    expect(seasonSetsOfLook(null)).toEqual([]);
  });

  it("착용 목록에 그대로 실리고 (부위마다 하나), 옛 화면엔 눈오리 대신 꼬마 오리", () => {
    for (const s of SEASON_SETS) expect(sanitizeLook([...s.items, s.title]), s.id).toEqual([...s.items, s.title]);
    // 펫 id는 착용 증서 옛 한도 계산의 펫 부위 가장 긴 id(sc_snowduck, 11자)보다 길지 않고, 옛 화면엔 비슷한 펫
    for (const id of ["gk_owl", "sm_magpie", "sp_bee", "ye_raccoon", "su_goat", "ic_penguin", "fr_snowbun"]) expect(id.length).toBeLessThanOrEqual("sc_snowduck".length);
    expect(lookWithPetFallback(["gk_owl"])).toEqual(["gk_owl", "pet_wisp"]);
    expect(lookWithPetFallback(["sm_magpie"])).toEqual(["sm_magpie", "pet_bird"]);
    expect(lookWithPetFallback(["sp_bee"])).toEqual(["sp_bee", "pet_bird"]);
    // 11/20 새 다섯 벌 펫 (옛 화면엔 비슷한 걷는 펫 — 타는 펫이 아니다)
    expect(lookWithPetFallback(["ye_raccoon"])).toEqual(["ye_raccoon", "pet_fox"]);
    expect(lookWithPetFallback(["su_goat"])).toEqual(["su_goat", "pet_dog"]);
    expect(lookWithPetFallback(["ic_penguin"])).toEqual(["ic_penguin", "pet_duck"]);
    expect(lookWithPetFallback(["fr_snowbun", "t_ssFrost"])).toEqual(["fr_snowbun", "pet_ham", "t_ssFrost"]);
    expect(sanitizeLook([...SEASON_SETS[0].items])).toEqual([...SEASON_SETS[0].items]);
    expect(sanitizeLook([...SEASON_SETS[1].items, "t_ssSanta"])).toEqual([...SEASON_SETS[1].items, "t_ssSanta"]);
    expect(lookWithPetFallback(["sc_snowduck", "t_ssSnow"])).toEqual(["sc_snowduck", "pet_duck", "t_ssSnow"]);
  });
});

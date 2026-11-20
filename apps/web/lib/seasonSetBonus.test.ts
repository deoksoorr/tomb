import { describe, expect, it } from "vitest";
import { isShopListed, itemById, ITEMS, PERMANENT_UNTIL, SEASON_SETS } from "@tomb/protocol";
import { itemLookScore, lookScore, seasonSetBonus } from "./lookScore";
import { earnedTitleIds, titleDef, titlePerk, TITLES } from "./titles";
import { ShopBuySchema } from "./validate";

// 11/19 계절 한정 세트: 잡화점에 없고, 꾸미기 점수는 기획안 값, 한 벌을 다 입으면 칭호 + 점수 덤 (능력치는 없다)

const NOW = 1_800_000_000_000;
const wear = (ids: readonly string[], until = PERMANENT_UNTIL) => ids.map((itemId) => ({ itemId, until }));

describe("11/19 계절 한정 세트 꾸미기 점수·칭호", () => {
  it("한 점 점수 = 기획안 꾸미기 점수", () => {
    const want: Record<string, number> = {
      sc_earflap: 320,
      sc_padding: 960,
      sc_goguma: 120,
      sc_breath: 240,
      sc_snowduck: 500,
      si_elfhat: 360,
      si_sack: 2080,
      si_cookie: 96,
      si_bulbs: 400,
      si_wrap: 280,
      // 11/20 나머지 여섯 벌
      of_antenna: 280,
      of_a4wings: 960,
      of_drink: 80,
      of_postit: 320,
      of_blueglow: 160,
      gk_moonwreath: 960,
      gk_firefly: 480,
      gk_stonepack: 1200,
      gk_fadesteps: 400,
      gk_owl: 1200,
      sm_jobawi: 880,
      sm_saekdong: 320,
      sm_pouch: 144,
      sm_magpie: 1000,
      sm_saekname: 240,
      vc_heartband: 240,
      vc_chocobox: 360,
      vc_letters: 800,
      vc_chocosteps: 128,
      vc_envelope: 280,
      sp_buckethat: 280,
      sp_matpack: 480,
      sp_gimbap: 120,
      sp_sprouts: 320,
      sp_bee: 440,
      sd_headband: 160,
      sd_baton: 120,
      sd_flag: 400,
      sd_dash: 320,
      // 11/20 새 다섯 벌 (코디 기획안 2차 시안 꾸미기 점수)
      ye_tiehead: 280,
      ye_mic: 120,
      ye_tambo: 480,
      ye_tipsy: 360,
      ye_raccoon: 600,
      su_beanie: 320,
      su_pack: 960,
      su_flask: 120,
      su_sunrise: 560,
      su_goat: 1000,
      rs_band: 160,
      rs_shake: 120,
      rs_gymbag: 880,
      rs_planner: 280,
      rs_day3: 360,
      ic_earmuff: 280,
      ic_rod: 160,
      ic_icebox: 880,
      ic_hotpack: 240,
      ic_penguin: 700,
      fr_icicle: 800,
      fr_cloak: 2240,
      fr_rime: 400,
      fr_icename: 280,
      fr_snowbun: 600,
    };
    for (const [id, score] of Object.entries(want)) expect(itemLookScore(id), id).toBe(score);
  });

  it("한 벌을 다 입으면 덤 점수 (첫눈 +100 · 산타 +120), 기획안 한 벌 점수와 같다", () => {
    const [snow, santa] = SEASON_SETS;
    expect(lookScore({ equipped: wear(snow.items) }, NOW)).toBe(2140 + 100);
    expect(lookScore({ equipped: wear(santa.items) }, NOW)).toBe(3216 + 120);
    expect(seasonSetBonus({ equipped: wear(snow.items) }, NOW)).toBe(100);
    // 한 점이 빠지거나 하루권이 끝나면 덤 없음
    expect(seasonSetBonus({ equipped: wear(snow.items.slice(1)) }, NOW)).toBe(0);
    expect(seasonSetBonus({ equipped: [...wear(snow.items.slice(1)), { itemId: snow.items[0], until: NOW - 1 }] }, NOW)).toBe(0);
  });

  it("11/20 나머지 여섯 벌: 한 벌 점수 = 기획안 한 벌 점수 + 덤, 칭호 이름은 기획안 그대로", () => {
    const want: Record<string, readonly [number, number, string]> = {
      "overtime-fairy": [1800, 80, "불 끄고 가는 사람"],
      "fog-keeper": [4240, 150, "안개 속 묘지기"],
      "seollal-magpie": [2584, 120, "복 많이 받는 이웃"],
      "giri-choco": [1808, 80, "의리의 아이콘"],
      "spring-picnic": [1640, 80, "반차 소풍러"],
      "sports-day": [1000, 60, "청팀 에이스"],
    };
    for (const [id, [full, bonus, title]] of Object.entries(want)) {
      const s = SEASON_SETS.find((x) => x.id === id)!;
      expect(lookScore({ equipped: wear(s.items) }, NOW), id).toBe(full + bonus);
      expect(seasonSetBonus({ equipped: wear(s.items) }, NOW), id).toBe(bonus);
      expect(titleDef(s.title)?.name, id).toBe(title);
    }
    const base = { dexTitleNames: [], champBoards: [] };
    expect(earnedTitleIds({ ...base, metrics: { ssSports: 1 } })).toContain("t_ssSports");
  });

  it("11/20 새 다섯 벌: 한 벌 점수 = 기획안 한 벌 점수(덤 포함 fullLook), 칭호 이름은 기획안 그대로", () => {
    const want: Record<string, readonly [number, number, string]> = {
      "year-end": [1840, 100, "막차 놓친 사람"],
      "sunrise-hike": [2960, 120, "새해 첫 해 목격자"],
      "resolution": [1800, 60, "사흘째 회원님"],
      "smelt-fest": [2260, 100, "얼음 위 강태공"],
      "frost-yard": [4320, 150, "서리꽃 유령"],
    };
    for (const [id, [full, bonus, title]] of Object.entries(want)) {
      const s = SEASON_SETS.find((x) => x.id === id)!;
      expect(lookScore({ equipped: wear(s.items) }, NOW), id).toBe(full + bonus);
      expect(seasonSetBonus({ equipped: wear(s.items) }, NOW), id).toBe(bonus);
      expect(titleDef(s.title)?.name, id).toBe(title);
    }
    const base = { dexTitleNames: [], champBoards: [] };
    expect(earnedTitleIds({ ...base, metrics: { ssFrost: 1 } })).toContain("t_ssFrost");
    expect(earnedTitleIds({ ...base, metrics: { ssYearEnd: 0 } })).not.toContain("t_ssYearEnd");
  });

  it("칭호: 한 벌 진행 수치가 1이면 얻고, 동 등급이라 능력은 없다", () => {
    for (const s of SEASON_SETS) {
      const t = titleDef(s.title)!;
      expect(t.grade).toBe("bronze");
      expect(t.group).toBe("look");
      const perk = titlePerk(s.title);
      expect(perk.speed).toBe(1);
      expect(perk.group).toBe("none");
    }
    expect(titleDef("t_ssSnow")?.name).toBe("첫눈 출근러");
    expect(titleDef("t_ssSanta")?.name).toBe("산타 사무소 수습");
    const base = { dexTitleNames: [], champBoards: [] };
    expect(earnedTitleIds({ ...base, metrics: { ssSnow: 1 } })).toContain("t_ssSnow");
    expect(earnedTitleIds({ ...base, metrics: { ssSnow: 0, ssSanta: 1 } })).not.toContain("t_ssSnow");
    expect(TITLES.filter((t) => t.id === "t_ssSanta").length).toBe(1);
  });

  it("잡화점에서 살 수 없다 (목록에도 없고 사기 요청도 막는다)", () => {
    for (const it of ITEMS.filter((i) => i.seasonSet)) {
      expect(isShopListed(it)).toBe(false);
      expect(ShopBuySchema.safeParse({ itemId: it.id }).success, it.id).toBe(false);
    }
    expect(ShopBuySchema.safeParse({ itemId: "hat_beanie" }).success).toBe(true);
    expect(itemById("sc_earflap")?.seasonSet).toBe("snow-commute");
  });
});

import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, DIR, ITEMS, SEASON_SETS } from "@tomb/protocol";
import { AV_H, AV_W, avatarArtTop, avatarFrameGrid, gearOf, lookKey, SPRITE_COSMETICS } from "./avatar";
import { COSMETIC_FX, CosmeticFxSim, FX_ART, type FxCmd, type FxInput } from "./cosmeticFx";
import { hasItemIcon, ICON_IDS } from "./itemIcons";
import { SEASON_SHEET_IDS, seasonGearIcon } from "./seasonSetGear";
import { seasonFxIconGrid } from "./seasonSetFx";
import { nameColorSpec, nameStyleRef, namePlateSpec } from "@/lib/nameStyle";
import { NAME_BELL_H, NAME_BELL_TILTS, NAME_BELL_W, nameBellGrid } from "./nameStyleIcons";

// 11/19 계절 한정 세트 그림: 15가지 몸 × 앞·옆·뒤에 다 입히고, 따로 그리는 연출·아이콘·이름표가 다 있다 (코디 기획안 규칙)

const COLOR = "#9fb8d8";
const SEASON = ITEMS.filter((i) => i.seasonSet);
const diff = (a: ReturnType<typeof avatarFrameGrid>, b: ReturnType<typeof avatarFrameGrid>) => {
  let n = 0;
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) n++;
  return n;
};

describe("11/19 계절 한정 세트 시트 그림 (15가지 몸)", () => {
  it("예순네 점 모두 그림이 있다 (시트·따로 그리는 연출·이름 글자·이름표), 아이콘도 있다", () => {
    // 11/19 두 벌 열 점 + 11/20 나머지 여섯 벌 스물아홉 점 + 11/20 새 다섯 벌 스물다섯 점
    expect(SEASON.length).toBe(64);
    for (const it of SEASON) {
      if (it.slot === "namePlate") expect(namePlateSpec(it.id), it.id).not.toBeNull();
      else if (it.slot === "nameColor") expect(nameColorSpec(it.id), it.id).not.toBeNull();
      else expect(SPRITE_COSMETICS as readonly string[], it.id).toContain(it.id);
      expect(hasItemIcon(it.id), it.id).toBe(true);
      expect(ICON_IDS, it.id).toContain(it.id);
      const icon = seasonGearIcon(it.id) ?? seasonFxIconGrid(it.id);
      expect(icon, it.id).not.toBeNull();
      expect([icon!.w, icon!.h]).toEqual([16, 16]);
    }
  });

  it("시트 그림 꾸미기는 시트 키에 들어가고, 모든 몸에서 앞·옆·뒤 중 어딘가 그림이 바뀐다", () => {
    for (const id of SEASON_SHEET_IDS) {
      expect(lookKey([id])).toBe(id);
      expect(gearOf([id]).ss).toEqual([id]);
      for (const b of AVATAR_BODIES) {
        const changed = (["down", "side", "up"] as const).some((v) => diff(avatarFrameGrid(b.id, v, 0, COLOR), avatarFrameGrid(b.id, v, 0, COLOR, [id])) > 0);
        expect(changed, `${id} ${b.id}`).toBe(true);
      }
    }
    // 따로 그리는 연출은 시트 키를 바꾸지 않는다
    expect(lookKey(["sc_breath", "si_bulbs", "sc_snowduck", "si_wrap"])).toBe("");
    expect(lookKey(["of_postit", "of_blueglow", "gk_fadesteps", "gk_owl", "sm_magpie", "sm_saekname", "vc_letters", "vc_chocosteps", "vc_envelope", "sp_sprouts", "sp_bee", "sd_dash"])).toBe("");
    // 11/20 새 다섯 벌: 알딸딸 오라만 볼 발그레를 시트에 그린다 (나머지 오라·발자국·펫·이름은 시트 밖)
    expect(lookKey(["su_sunrise", "ic_hotpack", "rs_day3", "fr_rime", "ye_raccoon", "su_goat", "ic_penguin", "fr_snowbun", "rs_planner", "fr_icename"])).toBe("");
    expect(lookKey(["ye_tipsy"])).toBe("ye_tipsy");
  });

  it("모자는 프레임 맨 위 줄에 닿지 않고, 앞모습에서 모자가 정수리를 덮는다", () => {
    for (const id of ["sc_earflap", "si_elfhat", "of_antenna", "gk_moonwreath", "sm_jobawi", "vc_heartband", "sp_buckethat", "sd_headband", "sd_flag", "ye_tiehead", "su_beanie", "rs_band", "ic_earmuff", "fr_icicle", "su_pack", "ye_tambo"])
      for (const b of AVATAR_BODIES) {
        expect(avatarArtTop(b.id, [id]), `${id} ${b.id}`).toBeLessThan(AV_H - 1);
        for (const view of ["down", "side", "up"] as const)
          for (const col of [0, 1, 12, 13]) {
            const g = avatarFrameGrid(b.id, view, col, COLOR, [id]);
            let top = 0;
            for (let x = 0; x < AV_W; x++) if (g.filled(x, 0)) top++;
            expect(top, `${id} ${b.id} ${view} ${col}`).toBe(0);
          }
      }
  });

  // 11/22 손에 든 것의 뒷모습(몸 뒤로 깔린다)은 heldGear.test.ts

  it("한 벌을 다 입어도 모든 몸·자세가 그려진다 (앉기·걷기 포함)", () => {
    for (const s of SEASON_SETS)
      for (const b of AVATAR_BODIES)
        for (const view of ["down", "side", "up"] as const)
          for (const col of [0, 3, 12, 14]) {
            const g = avatarFrameGrid(b.id, view, col, COLOR, [...s.items]);
            let n = 0;
            for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) n++;
            expect(n, `${s.id} ${b.id} ${view} ${col}`).toBeGreaterThan(80);
          }
  });
});

describe("11/19 계절 한정 세트 연출 (CosmeticFxSim)", () => {
  const input = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000,
    dt: 16,
    x: 100,
    y: 200,
    headY: 200,
    dir: DIR.down,
    moving: false,
    hidden: false,
    artTop: 18,
    shoulder: 7,
    hand: { dx: 5.5, up: 6 },
    face: { dx: 0, up: 13 },
    reduced: false,
    ...o,
  });
  const run = (look: string[], frames: number, o: (i: number) => Partial<FxInput>) => {
    const sim = new CosmeticFxSim();
    sim.setLook(look);
    const all: FxCmd[] = [];
    for (let i = 0; i < frames; i++) {
      const out: FxCmd[] = [];
      sim.step(input({ now: 1000 + i * 33, dt: 33, ...o(i) }), out);
      for (const c of out) {
        expect(c.frame).toBeGreaterThanOrEqual(0);
        expect(c.frame).toBeLessThan(FX_ART[c.art].frames);
        for (const v of [c.x, c.y, c.alpha, c.sx, c.sy, c.depth]) expect(Number.isFinite(v)).toBe(true);
      }
      all.push(...out);
    }
    return all;
  };

  it("입김 오라: 입 자리에서 나온 입김이 몸 앞에, 옆모습은 보는 쪽으로", () => {
    expect(COSMETIC_FX.sc_breath?.kind).toBe("aura");
    const right = run(["sc_breath"], 60, () => ({ dir: DIR.right, face: { dx: 3, up: 13 } })).filter((c) => c.art === "ssPlume");
    expect(right.length).toBeGreaterThan(0);
    expect(right.every((c) => !c.flip && c.depth > 200)).toBe(true);
    const left = run(["sc_breath"], 60, () => ({ dir: DIR.left, face: { dx: -3, up: 13 } })).filter((c) => c.art === "ssPlume");
    expect(left.every((c) => c.flip)).toBe(true);
    // 숨는 자세(잠수·해먹)에는 그리지 않는다
    expect(run(["sc_breath"], 30, () => ({ hidden: true })).filter((c) => c.art === "ssPlume")).toEqual([]);
  });

  it("꼬마전구 발자국: 걸으면 알록달록 전구가 남는다", () => {
    const out = run(["si_bulbs"], 90, (i) => ({ x: 100 + i * 2, moving: true, dir: DIR.right }));
    const bulbs = out.filter((c) => c.art === "ssBulb");
    expect(bulbs.length).toBeGreaterThan(0);
    expect(new Set(bulbs.map((c) => c.frame)).size).toBeGreaterThan(1);
  });

  it("꼬마 눈오리: 따라오는 펫, 오래 서 있으면 눈 위에 앉는다", () => {
    expect(COSMETIC_FX.sc_snowduck?.kind).toBe("pet");
    const walk = run(["sc_snowduck"], 40, (i) => ({ x: 100 + i * 2, moving: true }));
    expect(walk.some((c) => c.art === "ssDuck")).toBe(true);
    const sim = new CosmeticFxSim();
    sim.setLook(["sc_snowduck"]);
    const frames = new Set<number>();
    for (let t = 0; t < 20000; t += 100) {
      const out: FxCmd[] = [];
      sim.step(input({ now: 1000 + t, dt: 100 }), out);
      for (const c of out) if (c.art === "ssDuck") frames.add(c.frame);
    }
    expect(frames.has(4)).toBe(true);
  });

  it("세트 덤: 「첫눈 출근길」 한 벌을 다 입으면 발밑 눈송이가 반짝, 한 점이라도 빠지면 없다", () => {
    const snow = [...SEASON_SETS[0].items];
    const full = run(snow, 120, () => ({}));
    expect(full.some((c) => c.art === "xmGlint")).toBe(true);
    const part = run(snow.slice(0, 4), 120, () => ({}));
    expect(part.some((c) => c.art === "xmGlint")).toBe(false);
  });

  it("11/20 오라: 포스트잇은 머리 둘레를 돌며 뒤쪽은 몸 뒤로, 러브레터는 떠올라 하트로 열린다", () => {
    const notes = run(["of_postit"], 80, () => ({})).filter((c) => c.art === "ssNote");
    expect(notes.some((c) => c.depth < 200) && notes.some((c) => c.depth > 200)).toBe(true);
    expect(new Set(notes.map((c) => c.frame)).size).toBe(4);
    const letters = run(["vc_letters"], 120, () => ({}));
    expect(letters.some((c) => c.art === "ssEnvClosed")).toBe(true);
    expect(letters.some((c) => c.art === "ssEnvOpen")).toBe(true);
    expect(run(["of_postit", "vc_letters"], 20, () => ({ hidden: true })).filter((c) => c.art === "ssNote" || c.art === "ssEnvClosed")).toEqual([]);
  });

  it("11/20 발자국: 흐려지는 발자국은 지날수록 흐려지고, 초코·새싹·흙먼지는 걸을 때만", () => {
    const fade = run(["gk_fadesteps"], 120, (i) => ({ x: 100 + i * 2, moving: true, dir: DIR.right })).filter((c) => c.art === "ssFade");
    expect(new Set(fade.map((c) => c.frame)).size).toBeGreaterThanOrEqual(3);
    for (const [id, art] of [["vc_chocosteps", "ssChoco"], ["sp_sprouts", "ssSprout"], ["sd_dash", "ssDust"]] as const) {
      expect(run([id], 90, (i) => ({ x: 100 + i * 2, moving: true, dir: DIR.right })).some((c) => c.art === art), id).toBe(true);
      expect(run([id], 30, () => ({})).some((c) => c.art === art), id).toBe(false);
    }
  });

  it("11/20 펫: 부엉이·까치·꿀벌이 따라오고, 서 있으면 눈 깜빡·곁눈질·깡충·날갯짓", () => {
    for (const [id, art, want] of [["gk_owl", "ssOwl", 2], ["sm_magpie", "ssMagpie", 3], ["sp_bee", "ssBee", 1]] as const) {
      expect(COSMETIC_FX[id]?.kind, id).toBe("pet");
      expect(run([id], 40, (i) => ({ x: 100 + i * 2, moving: true })).some((c) => c.art === art), id).toBe(true);
      const sim = new CosmeticFxSim();
      sim.setLook([id]);
      const frames = new Set<number>();
      for (let t = 0; t < 20000; t += 50) {
        const out: FxCmd[] = [];
        sim.step(input({ now: 1000 + t, dt: 50 }), out);
        for (const c of out) if (c.art === art) frames.add(c.frame);
      }
      expect(frames.has(want), id).toBe(true);
    }
    // 부엉이 눈빛
    expect(run(["gk_owl"], 10, () => ({})).some((c) => c.art === "ssOwlGlow")).toBe(true);
  });

  it("11/20 밤 빛: 형광등·드링크·화관·유리병·촛불 (미리보기는 늘 밤), 손에 든 것의 빛은 뒷모습에서 없다", () => {
    for (const id of ["of_antenna", "of_drink", "gk_moonwreath", "gk_firefly", "gk_stonepack"]) {
      expect(run([id], 5, () => ({ still: true })).some((c) => c.art === "ssHalo" && c.layer === "light"), id).toBe(true);
    }
    for (const id of ["of_drink", "gk_firefly"]) expect(run([id], 5, () => ({ still: true, dir: DIR.up })).some((c) => c.art === "ssHalo"), id).toBe(false);
  });

  it("11/20 세트 덤: 한 벌을 다 입었을 때만 (형광등 깜빡 · 푸른 안개 · 복 글자 · 하트 · 벚꽃잎 · 큰 흙먼지)", () => {
    const set = (id: string) => [...SEASON_SETS.find((s) => s.id === id)!.items];
    const has = (look: string[], art: string, o: (i: number) => Partial<FxInput>) => run(look, 90, o).some((c) => c.art === art);
    // 밤(미리보기)
    expect(has(set("fog-keeper"), "ghMist", () => ({ still: true }))).toBe(true);
    expect(has(set("fog-keeper").slice(1), "ghMist", () => ({ still: true }))).toBe(false);
    const ot = run(set("overtime-fairy"), 3, () => ({ still: true })).filter((c) => c.art === "ssHalo").length;
    expect(ot).toBeGreaterThan(run(set("overtime-fairy").slice(0, 4), 3, () => ({ still: true })).filter((c) => c.art === "ssHalo").length);
    // 걸을 때
    expect(has(set("seollal-magpie"), "ssBok", (i) => ({ x: 100 + i * 2, moving: true, dir: DIR.right }))).toBe(true);
    expect(has(set("seollal-magpie"), "ssBok", () => ({}))).toBe(false);
    expect(has(set("sports-day"), "ssDust", () => ({ still: true, moving: true }))).toBe(true);
    // 손 흔들 때
    expect(has(set("giri-choco"), "heart", () => ({ wave: 300 }))).toBe(true);
    expect(has(set("giri-choco"), "heart", () => ({}))).toBe(false);
    expect(has(set("giri-choco").slice(1), "heart", () => ({ wave: 300 }))).toBe(false);
    // 서 있을 때
    expect(has(set("spring-picnic"), "ssPetal", () => ({}))).toBe(true);
    expect(has(set("spring-picnic"), "ssPetal", (i) => ({ x: 100 + i * 2, moving: true }))).toBe(false);
  });
});

describe("11/20 새 다섯 벌 연출 (CosmeticFxSim)", () => {
  const input = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000,
    dt: 16,
    x: 100,
    y: 200,
    headY: 200,
    dir: DIR.down,
    moving: false,
    hidden: false,
    artTop: 22,
    shoulder: 7,
    hand: { dx: 5.5, up: 6 },
    face: { dx: 0, up: 13, top: 20 },
    reduced: false,
    ...o,
  });
  const run = (look: string[], frames: number, o: (i: number) => Partial<FxInput>) => {
    const sim = new CosmeticFxSim();
    sim.setLook(look);
    const all: FxCmd[] = [];
    for (let i = 0; i < frames; i++) {
      const out: FxCmd[] = [];
      sim.step(input({ now: 1000 + i * 33, dt: 33, ...o(i) }), out);
      for (const c of out) {
        expect(c.frame).toBeGreaterThanOrEqual(0);
        expect(c.frame).toBeLessThan(FX_ART[c.art].frames);
        for (const v of [c.x, c.y, c.alpha, c.sx, c.sy, c.depth]) expect(Number.isFinite(v)).toBe(true);
      }
      all.push(...out);
    }
    return all;
  };
  const set = (id: string) => [...SEASON_SETS.find((s) => s.id === id)!.items];
  const setLocation = (search: string) => ((globalThis as unknown as { location: { search: string } }).location = { search });

  it("오라: 알딸딸 거품은 머리 둘레에서 떠오르고, 첫 햇살 해는 몸 뒤, 핫팩은 몸 양옆에 둥실 (밤엔 빛 층)", () => {
    const tipsy = run(["ye_tipsy"], 90, () => ({})).filter((c) => c.art === "ssBubble");
    expect(new Set(tipsy.map((c) => c.frame)).size).toBe(6);
    const sun = run(["su_sunrise"], 30, () => ({})).filter((c) => c.art === "ssSun");
    expect(sun.length).toBeGreaterThan(0);
    expect(sun.every((c) => c.layer === "body" && c.depth < 200)).toBe(true);
    // 미리보기(늘 밤): 해 테두리가 빛 층에서 스스로 빛난다
    expect(run(["su_sunrise"], 3, () => ({ still: true })).some((c) => c.art === "ssSunRim" && c.layer === "light")).toBe(true);
    // 핫팩 둘은 몸 양옆에서 둥실 (몸 앞을 가로지르지 않는다)
    const packs = run(["ic_hotpack"], 120, () => ({})).filter((c) => c.art === "ssHotpack");
    expect(packs.some((c) => c.x < 92) && packs.some((c) => c.x > 108)).toBe(true);
    expect(packs.every((c) => Math.abs(c.x - 100) >= 9)).toBe(true);
    expect(run(["ic_hotpack"], 3, () => ({ still: true })).some((c) => c.art === "ssHalo3" && c.layer === "light")).toBe(true);
    expect(run(["ye_tipsy", "su_sunrise", "ic_hotpack"], 10, () => ({ hidden: true }))).toEqual([]);
  });

  it("사흘째 발자국: 운동화 두 걸음 다음 슬리퍼 한 걸음 (세 걸음 주기), 좌우 발은 번갈아 뒤집힌다", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["rs_day3"]);
    const seen: string[] = [];
    let lastBorn = -1;
    for (let i = 0; i < 160; i++) {
      const out: FxCmd[] = [];
      sim.step(input({ now: 1000 + i * 33, dt: 33, x: 100 + i * 2, moving: true, dir: DIR.right }), out);
      const prints = out.filter((c) => c.art === "ssDay3");
      if (prints.length > lastBorn + 1 || (prints.length && lastBorn < 0)) {
        const c = prints[prints.length - 1];
        seen.push(`${c.frame}${c.flip ? "R" : "L"}`);
      }
      lastBorn = prints.length - 1;
    }
    const kinds = seen.map((s) => s[0]).join("");
    expect(kinds.length).toBeGreaterThanOrEqual(6);
    expect(kinds).toMatch(/^(001)+0?0?$|^(010)+|^(100)+/);
    expect(kinds.includes("11")).toBe(false);
    expect(kinds.includes("000")).toBe(false);
    expect(new Set(seen.map((s) => s[1])).size).toBe(2);
  });

  it("성에 발자국: 밟은 자리에 번지고, 밤(미리보기)엔 푸른 빛", () => {
    const rime = run(["fr_rime"], 90, (i) => ({ x: 100 + i * 2, moving: true, dir: DIR.right })).filter((c) => c.art === "ssRime");
    expect(rime.length).toBeGreaterThan(0);
    expect(rime.some((c) => c.sx < 1) && rime.some((c) => c.sx === 1)).toBe(true);
    expect(run(["fr_rime"], 3, () => ({ still: true, moving: true })).some((c) => c.art === "ssRimeGlow")).toBe(true);
  });

  it("펫 넷: 네 방향 (아래로 걸으면 앞모습 6·7, 위로 걸으면 뒷모습 10·11), 멈추면 깜빡·귀여운 동작, 눈토끼는 몸빛", () => {
    for (const [id, art] of [["ye_raccoon", "ssRaccoon"], ["su_goat", "ssGoat"], ["ic_penguin", "ssPenguin"], ["fr_snowbun", "ssSnowbun"]] as const) {
      expect(COSMETIC_FX[id]?.kind, id).toBe("pet");
      expect(FX_ART[art].frames).toBe(14);
      const down = run([id], 40, (i) => ({ y: 200 + i * 2, headY: 200 + i * 2, moving: true, dir: DIR.down })).filter((c) => c.art === art);
      expect(down.some((c) => c.frame === 6 || c.frame === 7), id).toBe(true);
      const up = run([id], 40, (i) => ({ y: 200 - i * 2, headY: 200 - i * 2, moving: true, dir: DIR.up })).filter((c) => c.art === art);
      expect(up.some((c) => c.frame === 10 || c.frame === 11), id).toBe(true);
      const sim = new CosmeticFxSim();
      sim.setLook([id]);
      const frames = new Set<number>();
      for (let t = 0; t < 20000; t += 50) {
        const out: FxCmd[] = [];
        sim.step(input({ now: 1000 + t, dt: 50 }), out);
        for (const c of out) if (c.art === art) frames.add(c.frame);
      }
      expect([2, 3, 4].every((f) => frames.has(f)), `${id} ${[...frames]}`).toBe(true);
    }
    // 눈토끼 몸빛은 밤에만 (미리보기는 늘 밤)
    expect(run(["fr_snowbun"], 5, () => ({ still: true })).some((c) => c.art === "ssBunGlow" && c.layer === "light")).toBe(true);
    try {
      (globalThis as unknown as { location: { search: string } }).location = { search: "?time=13" };
      expect(run(["fr_snowbun"], 5, () => ({ now: 90_000_000 })).some((c) => c.art === "ssBunGlow")).toBe(false);
    } finally {
      delete (globalThis as unknown as { location?: unknown }).location;
    }
  });

  it("밤 빛: 애창곡 마이크(뒷모습엔 없음) · 고드름 왕관", () => {
    expect(run(["ye_mic"], 3, () => ({ still: true })).some((c) => c.art === "ssHalo3" && c.layer === "light")).toBe(true);
    expect(run(["ye_mic"], 3, () => ({ still: true, dir: DIR.up })).some((c) => c.art === "ssHalo3")).toBe(false);
    expect(run(["fr_icicle"], 3, () => ({ still: true })).some((c) => c.art === "ssHalo3" && c.layer === "light")).toBe(true);
  });

  it("세트 덤: 다 입었을 때만 (음표 · 아침 금빛 · 땀방울 · 빙어 퐁 · 밤 눈 결정)", () => {
    const has = (look: string[], art: string, o: (i: number) => Partial<FxInput>, n = 150) => run(look, n, o).some((c) => c.art === art);
    const walk = (i: number) => ({ x: 100 + i * 2, moving: true, dir: DIR.right });
    // 서 있을 때만
    for (const [id, art] of [["year-end", "ssNote3"], ["resolution", "ssSweat"], ["smelt-fest", "ssSmelt3"]] as const) {
      expect(has(set(id), art, () => ({})), id).toBe(true);
      expect(has(set(id), art, walk), id).toBe(false);
      expect(has(set(id).slice(1), art, () => ({})), id).toBe(false);
    }
    // 아침 6~9시만 (미리보기는 늘)
    try {
      setLocation("?time=7");
      expect(has(set("sunrise-hike"), "ssGoldRim", () => ({ now: 50_000_000 }), 3)).toBe(true);
      setLocation("?time=13");
      expect(has(set("sunrise-hike"), "ssGoldRim", () => ({ now: 60_000_000 }), 3)).toBe(false);
      // 밤만 (미리보기는 늘 밤)
      setLocation("?time=13");
      expect(has(set("frost-yard"), "ssFlake", () => ({ now: 70_000_000 }), 3)).toBe(false);
    } finally {
      delete (globalThis as unknown as { location?: unknown }).location;
    }
    expect(has(set("sunrise-hike"), "ssGoldRim", () => ({ still: true }), 3)).toBe(true);
    expect(has(set("frost-yard"), "ssFlake", () => ({ still: true }), 3)).toBe(true);
    expect(has(set("frost-yard").slice(1), "ssFlake", () => ({ still: true }), 3)).toBe(false);
  });

  it("이름 글자·이름표: 서리 앉은 이름(빛 무리) · 새해 계획표 이름표", () => {
    expect(nameColorSpec("fr_icename")).toMatchObject({ kind: "fx", fx: "frost" });
    expect(namePlateSpec("rs_planner")?.kind).toBe("planner");
    expect(nameStyleRef(["rs_planner", "fr_icename"])).toEqual({ color: "fr_icename", plate: "rs_planner" });
  });
});

describe("11/19 선물 포장 이름표 (게임 이름표 · 채팅·랭킹 HTML)", () => {
  it("이름표 바탕판 정의가 있고, 「산타 견습 요정」 한 벌을 다 입었을 때만 금종", () => {
    expect(namePlateSpec("si_wrap")?.kind).toBe("wrap");
    expect(nameStyleRef(["si_wrap"])).toEqual({ color: null, plate: "si_wrap" });
    expect(nameStyleRef([...SEASON_SETS[1].items]).bell).toBe(true);
    expect(nameStyleRef(SEASON_SETS[1].items.filter((id) => id !== "si_cookie")).bell).toBeUndefined();
  });

  it("금종 그림: 기울기 다섯 칸, 가운데는 똑바로 · 양끝은 서로 거울처럼 다르고, 글자(12px)와 비슷한 크기", () => {
    const g = nameBellGrid();
    expect([g.w, g.h]).toEqual([NAME_BELL_W * NAME_BELL_TILTS.length, NAME_BELL_H]);
    expect(NAME_BELL_H).toBeGreaterThanOrEqual(12);
    const frame = (f: number) => {
      const out: number[] = [];
      for (let y = 0; y < NAME_BELL_H; y++) for (let x = 0; x < NAME_BELL_W; x++) out.push(g.px[y * g.w + f * NAME_BELL_W + x]);
      return out.join(",");
    };
    const frames = NAME_BELL_TILTS.map((_, i) => frame(i));
    expect(new Set(frames).size).toBe(NAME_BELL_TILTS.length);
  });
});

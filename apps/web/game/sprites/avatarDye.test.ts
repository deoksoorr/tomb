import { AVATAR_BODIES, GEAR_DYE_SEPARATE, isDyeableCosmetic, itemById, ITEMS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { avatarColorKey, avatarColors, avatarColorSpec, avatarFrameGrid, sheetCosmeticIds, specDye, withDyePart } from "./avatar";
import { dyeItemColor, GEAR_DYE_REGIONS, itemRefOf, toHsl } from "./gearDye";
import { COSMETIC_FX, CosmeticFxSim, FX_ART, fxArtGrid, type FxArtId, type FxCmd, type FxInput } from "./cosmeticFx";
import { BACKPACK_TONES, CHEF_TONES, SANTA_TONES } from "./avatarGear";
import { MOCHI_TONES } from "./cuteGear";
import { PAD_TONES } from "./seasonSetGear";

// 46번 아바타 3부위 색: 염색 전에는 예전과 똑같이, 염색한 부위만 바뀐다

const BASE = "#9fc5a8";
const px = (g: ReturnType<typeof avatarFrameGrid>) => [...g.px];
const diff = (a: number[], b: number[]) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

describe("46번 아바타 3부위 색", () => {
  it("색 표기: 염색이 없으면 기본색 그대로, 있으면 부위별", () => {
    expect(avatarColorSpec(BASE)).toBe(BASE);
    expect(avatarColorSpec(BASE, {})).toBe(BASE);
    expect(avatarColorSpec(BASE, { accent: "#f4a7b9" })).toBe(`${BASE}|||#f4a7b9`);
    // 이미 표기인 값에 다시 입혀도 기본색만 남기고 새로 쓴다
    expect(avatarColorSpec(`${BASE}|#000000||`, { body: "#111111" })).toBe(`${BASE}||#111111|`);
    expect(avatarColors(`${BASE}|||#f4a7b9`)).toEqual({ base: 0x9fc5a8, head: 0x9fc5a8, body: 0x9fc5a8, accent: 0xf4a7b9, items: new Map() });
  });

  it("머리·몸을 기본색으로 칠하면 염색 전과 같은 그림 (6종 모두)", () => {
    for (const b of AVATAR_BODIES)
      for (const view of ["down", "side", "up"] as const)
        expect(diff(px(avatarFrameGrid(b.id, view, 0, `${BASE}|${BASE}|${BASE}|`)), px(avatarFrameGrid(b.id, view, 0, BASE))), `${b.id} ${view}`).toBe(0);
  });

  it("머리·몸·포인트를 따로 염색하면 6종 모두 그 부위가 바뀐다", () => {
    for (const b of AVATAR_BODIES) {
      const plain = px(avatarFrameGrid(b.id, "down", 0, BASE));
      for (const part of ["head", "body", "accent"] as const) {
        const dyed = px(avatarFrameGrid(b.id, part === "accent" && b.id === "bun" ? "side" : "down", 0, avatarColorSpec(BASE, { [part]: "#d0306a" })));
        const ref = part === "accent" && b.id === "bun" ? px(avatarFrameGrid(b.id, "side", 0, BASE)) : plain;
        expect(diff(dyed, ref), `${b.id} ${part}`).toBeGreaterThan(0);
      }
    }
  });

  it("머리만 염색하면 망토(몸)는 그대로, 몸만 염색하면 얼굴 쪽은 그대로 (두건)", () => {
    const plain = avatarFrameGrid("hood", "down", 0, BASE);
    const head = avatarFrameGrid("hood", "down", 0, avatarColorSpec(BASE, { head: "#d0306a" }));
    const body = avatarFrameGrid("hood", "down", 0, avatarColorSpec(BASE, { body: "#d0306a" }));
    // 망토 아랫단 줄(23)은 머리 염색과 무관
    for (let x = 0; x < plain.w; x++) expect(head.get(x, 23)).toBe(plain.get(x, 23));
    // 두건 윗줄(12)은 몸 염색과 무관
    for (let x = 0; x < plain.w; x++) expect(body.get(x, 12)).toBe(plain.get(x, 12));
  });
});

// 머리 염색 풀림 버그 (11/12): 텍스처 키가 색 표기의 기본색만 읽으려다("#기본|머리|몸|포인트"는 hex 하나가 아니라 실패)
// 염색한 모든 아바타가 같은 키(대체색 e8d9b0)를 써서, 먼저 구운 낡은 그림(다른 사람·염색 전 상태)이 다시 쓰였다.
describe("46번 텍스처 키는 염색까지 구분한다", () => {
  it("염색이 없으면 예전 키(기본색 hex)와 같다", () => {
    expect(avatarColorKey(BASE)).toBe("9fc5a8");
    expect(avatarColorKey("#E8D9B0")).toBe("e8d9b0");
  });
  it("부위·색이 다르면 키가 다르고, 같은 표기면 같다", () => {
    const keys = [
      BASE,
      avatarColorSpec(BASE, { head: "#e03030" }),
      avatarColorSpec(BASE, { body: "#e03030" }),
      avatarColorSpec(BASE, { accent: "#e03030" }),
      avatarColorSpec(BASE, { head: "#e03030", body: "#30a040", accent: "#3050e0" }),
      avatarColorSpec(BASE, { body: "#30a040", accent: "#3050e0" }),
      avatarColorSpec("#e8d9b0", { body: "#30a040", accent: "#3050e0" }),
      "#e8d9b0",
    ].map(avatarColorKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(avatarColorKey(avatarColorSpec(BASE, { head: "#e03030" }))).toBe(avatarColorKey(`${BASE}|#e03030||`));
  });
  it("키에 애니메이션 키 구분자(:)·꾸미기 구분자(@ ~)가 없다", () => {
    expect(avatarColorKey(avatarColorSpec(BASE, { head: "#e03030", accent: "#3050e0" }))).toMatch(/^[0-9a-f_]+$/);
  });
});

// 11/22 입은 꾸미기 염색 (아이템마다 색): 그 아이템 색이 있으면 그 아이템이 칠한 픽셀만 다시 칠한다
describe("11/22 입은 꾸미기 염색", () => {
  const RED = "#d0304a";
  const frame = (look: string[], spec = BASE, view: "down" | "side" | "up" = "down", body = "hood") => px(avatarFrameGrid(body, view, 0, spec, look));
  const lOf = (v: number) => toHsl(v >>> 8).l;
  const dyed = (items: Record<string, string>, base = BASE) => avatarColorSpec(base, { items });

  it("색 표기·텍스처 키: 아이템 색은 뒤에 붙고, 캐릭터만 염색하면 예전 모양 그대로", () => {
    expect(avatarColorSpec(BASE, { head: "#e03030" })).toBe(`${BASE}|#e03030||`);
    const spec = dyed({ sc_padding: "#3050e0~s", hat_beanie: "#e03030" });
    expect(spec).toBe(`${BASE}||||hat_beanie:#e03030;sc_padding:#3050e0~s`);
    expect(specDye(spec)).toEqual({ items: { hat_beanie: "#e03030", sc_padding: "#3050e0~s" } });
    expect([...avatarColors(spec).items]).toEqual([
      ["hat_beanie", 0xe03030],
      ["sc_padding", 0x3050e0],
    ]);
    expect(withDyePart(spec, "hat_beanie", null)).toBe(`${BASE}||||sc_padding:#3050e0~s`);
    expect(withDyePart(withDyePart(spec, "hat_beanie", null), "sc_padding", null)).toBe(BASE);
    const keys = [BASE, dyed({ hat_beanie: "#e03030" }), dyed({ hat_beanie: "#e03031" }), dyed({ neck_knit: "#e03030" }), avatarColorSpec(BASE, { head: "#e03030" })].map(avatarColorKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f_]+$/);
  });

  it("염색할 수 있는 꾸미기는 그 꾸미기 픽셀만 바뀌고 몸·눈·외곽선은 그대로 (머리·목·옷·등, 앞·옆·뒤 — 시트 밖 날개는 아래 따로)", () => {
    for (const id of ITEMS.filter((i) => isDyeableCosmetic(i.id) && !(COSMETIC_FX[i.id]?.kind === "wings")).map((i) => i.id)) {
      let total = 0;
      for (const view of ["down", "side", "up"] as const) {
        const plain = frame([], BASE, view);
        const worn = frame([id], BASE, view);
        const after = frame([id], dyed({ [id]: RED }), view);
        let changed = 0;
        for (let i = 0; i < worn.length; i++) {
          if (after[i] === worn[i]) continue;
          changed++;
          // 바뀐 픽셀은 모두 꾸미기가 칠한 자리 (꾸미기 없이 그린 그림과 다른 자리), 투명도는 그대로
          // (고양이 귀는 두건 꼭지 자리에 캐릭터 색으로 그려 우연히 같은 색일 수 있다)
          if (id !== "hat_cat") expect(worn[i], `${id} ${view} ${i}`).not.toBe(plain[i]);
          expect(after[i] & 255).toBe(worn[i] & 255);
        }
        total += changed;
      }
      expect(total, id).toBeGreaterThan(0);
    }
  });

  it("머리·목·옷·등 꾸미기 중 시트 밖에 따로 그리는 것은 날개(다시 칠한다)와 GEAR_DYE_SEPARATE(연)뿐 — 새 꾸미기를 넣으면 여기서 걸린다", () => {
    const sheet = new Set(sheetCosmeticIds());
    const outside = ITEMS.filter((i) => i.kind === "cosmetic" && (i.slot === "head" || i.slot === "neck" || i.slot === "back" || i.slot === "pack") && !sheet.has(i.id)).map((i) => i.id);
    const wings = outside.filter((id) => COSMETIC_FX[id]?.kind === "wings");
    expect(new Set(wings)).toEqual(new Set(WINGS));
    expect(new Set(outside.filter((id) => !wings.includes(id)))).toEqual(new Set(GEAR_DYE_SEPARATE));
    // 날개는 모두 염색 묶음이 있다 (가장 많이 쓴 색 규칙에 맡기지 않는다)
    for (const id of WINGS) expect(GEAR_DYE_REGIONS[id], id).toBeDefined();
  });

  it("noDye 표시·안 입은 아이템 색·다른 아이템 색은 그림을 바꾸지 않는다", () => {
    const crown = itemById("hat_crown")!;
    crown.noDye = true;
    try {
      expect(frame(["hat_crown"], dyed({ hat_crown: RED }))).toEqual(frame(["hat_crown"]));
    } finally {
      delete crown.noDye;
    }
    expect(frame(["hat_crown"], dyed({ hat_crown: RED }))).not.toEqual(frame(["hat_crown"]));
    // 캐릭터 머리 색을 따라 칠하는 고양이 귀도 그 캐릭터 색 기준으로 다시 칠한다
    expect(frame(["hat_cat"], dyed({ hat_cat: RED }, "#e8d9b0"))).not.toEqual(frame(["hat_cat"], "#e8d9b0"));
    expect(frame([], dyed({ hat_beanie: RED, neck_knit: RED }))).toEqual(frame([]));
    expect(frame(["hat_beanie"], dyed({ hat_cap: RED, neck_knit: RED }))).toEqual(frame(["hat_beanie"]));
    // 캐릭터 머리 염색은 비니 색을 바꾸지 않고, 비니 염색은 캐릭터 색을 바꾸지 않는다 (두건 망토 줄 23)
    const both = frame(["hat_beanie"], dyed({ hat_beanie: RED }), "down");
    const plain = frame(["hat_beanie"], BASE, "down");
    for (let x = 0; x < 20; x++) expect(both[23 * 20 + x]).toBe(plain[23 * 20 + x]);
  });

  it("아이템별 바꿀 색 묶음(GEAR_DYE_REGIONS): 묶음 색만 바뀌고 금테·흰 반짝임 같은 장식은 그대로", () => {
    const colorsOf = (g: number[]) => new Set(g.filter((v) => (v & 255) === 255).map((v) => v >>> 8));
    for (const [id, r] of Object.entries(GEAR_DYE_REGIONS)) {
      if (COSMETIC_FX[id]?.kind === "wings") continue; // 날개는 시트 밖 그림 — 아래 「11/22 날개 염색」에서 본다
      const all = new Set<number>();
      const after = new Set<number>();
      for (const view of ["down", "side", "up"] as const) {
        for (const c of colorsOf(frame([id], BASE, view))) all.add(c);
        for (const c of colorsOf(frame([id], dyed({ [id]: "#3a6ae0" }), view))) after.add(c);
      }
      // 묶음 색이 실제 그림에 있다 (그림이 바뀌어 묶음이 빗나가면 여기서 걸린다)
      if (r.colors) expect(r.colors.some((c) => all.has(c)), id).toBe(true);
      // 묶음 색은 사라지고 (다른 색으로 바뀌고)
      if (r.colors) for (const c of r.colors) if (all.has(c)) expect(after.has(c), `${id} ${c.toString(16)}`).toBe(false);
    }
    // 11/22 수집 의뢰 보상(채집왕 망토)은 염색 불가 — 아이템 색이 와도 기본 그림 그대로
    expect(frame(["q_back_cape"], dyed({ q_back_cape: "#3a6ae0" }), "up")).toEqual(frame(["q_back_cape"], BASE, "up"));
  });

  it("옷(back)과 등(pack)을 같이 입으면 둘 다 그려지고 각자 색이 따로 간다 (롱패딩 + 배낭)", () => {
    const look = ["sc_padding", "back_backpack"];
    for (const view of ["down", "side", "up"] as const) {
      const both = frame(look, BASE, view);
      expect(both, view).not.toEqual(frame(["sc_padding"], BASE, view));
    }
    const up = frame(look, BASE, "up");
    const coat = frame(look, dyed({ sc_padding: "#3050e0" }), "up");
    const pack = frame(look, dyed({ back_backpack: "#3050e0" }), "up");
    expect(coat).not.toEqual(up);
    expect(pack).not.toEqual(up);
    expect(coat).not.toEqual(pack);
  });

  it("명암이 살아 있다: 같은 꾸미기 안 색들의 밝기 순서가 그대로이고, 바탕 천은 고른 색이 된다", () => {
    for (const id of ["hat_beanie", "neck_knit", "back_jacket", "hat_chef"])
      for (const target of ["#d0304a", "#2a2a30", "#f4f0e8", "#3a7ae0"]) {
        const worn = frame([id], BASE, "side");
        const after = frame([id], dyed({ [id]: target }), "side");
        const pairs = new Map<number, number>();
        for (let i = 0; i < worn.length; i++) if (worn[i] !== after[i]) pairs.set(worn[i], after[i]);
        const list = [...pairs].sort((a, b) => lOf(a[0]) - lOf(b[0]));
        expect(list.length, `${id} ${target}`).toBeGreaterThan(0);
        for (let i = 1; i < list.length; i++) if (lOf(list[i][0]) > lOf(list[i - 1][0]) + 0.01) expect(lOf(list[i][1]), `${id} ${target}`).toBeGreaterThanOrEqual(lOf(list[i - 1][1]) - 0.005);
        // 두 가지 이상 밝기로 칠해진 꾸미기는 염색 뒤에도 두 가지 이상 (뭉개지지 않는다)
        if (new Set(list.map(([a]) => Math.round(lOf(a) * 50))).size > 1) expect(new Set(list.map(([, b]) => b)).size, `${id} ${target}`).toBeGreaterThan(1);
      }
  });

  it("11/22 염색 티 손본 꾸미기: 천 명암 단계가 모두 묶음에 들고, 그린 천 픽셀은 다 바뀌고 장식은 그대로 (명암 순서 유지)", () => {
    const pad = PAD_TONES;
    const RAMPS: Record<string, readonly number[]> = {
      sc_padding: [pad.shine, pad.hi, pad.base, pad.lo, pad.seam],
      hat_chef: CHEF_TONES,
      hat_santa: SANTA_TONES,
      hat_mochibun: MOCHI_TONES,
      kn_fleece: [0xfbf5e8, 0xebe1cc, 0xcdbfa4, 0xaa9a7e],
      kn_cable: [0xfffaee, 0xefe6d2, 0xd0c3a6, 0xae9f80],
      neck_mochi: [0xfaf2e2, 0xe0d4bc],
      gh_capt: [0x4a5270, 0x2e3346, 0x1e2232],
      sp_buckethat: [0xfffbf0, 0xf6ecd4, 0xd6c4a0, 0xb8a47c],
      // 11/22 등 칸으로 옮긴 망토 (뒷덜미 깃·세로 주름) · 출근 배낭 네 톤 · 아이스박스 통 · 돗자리 배낭
      back_cape: [0xd85a68, 0xb83a4a, 0x8a2a38, 0x6a1e2a],
      back_milkcape: [0xffcad6, 0xf6a8bc, 0xd8849c, 0xb8687e],
      back_backpack: BACKPACK_TONES,
      ic_icebox: [0x8ad0f6, 0x5ab4e8, 0x3a86c0],
      // 11/22 잡화점 「옷」 다섯 벌 (shopWearGear SHOP_WEAR_TONES — 빛·바탕·그늘·가장 짙은 선)
      wr_shirt: [0xfcfdff, 0xe0e7f3, 0xbfc9dd, 0x8e9ab8],
      wr_puffer: [0xa3a065, 0x7d7a48, 0x5e5c34, 0x40401f],
      wr_robe: [0xe496b0, 0xc46a8a, 0x9a4e6a, 0x6e3049],
      wr_apron: [0x5fb48a, 0x3f8f6a, 0x2e6e50, 0x1f4c37],
      wr_coat: [0x6a5c80, 0x4a3f5c, 0x372e46, 0x241e30],
    };
    const bodies = ["hood", "tall", "cat", "round", "sheet", "suit"];
    for (const [id, ramp] of Object.entries(RAMPS)) {
      const region = GEAR_DYE_REGIONS[id];
      // 천 명암 단계가 전부 묶음에 있다
      for (const c of ramp) expect(region?.colors?.includes(c), `${id} ${c.toString(16)}`).toBe(true);
      const used = new Set<number>();
      for (const body of bodies)
        for (const view of ["down", "side", "up"] as const) {
          const bare = frame([], BASE, view, body);
          const worn = frame([id], BASE, view, body);
          for (const target of ["#d0304a", "#26262c", "#f6b8cc"]) {
            const after = frame([id], dyed({ [id]: target }), view, body);
            const pairs = new Map<number, number>();
            for (let i = 0; i < worn.length; i++) {
              if (worn[i] === bare[i] || (worn[i] & 255) !== 255) continue;
              const c = worn[i] >>> 8;
              if (ramp.includes(c)) {
                used.add(c);
                // 천 톤 픽셀은 모두 염색된다 (흰 점·남색 얼룩으로 남지 않는다)
                expect(after[i], `${id} ${body} ${view} ${target} ${c.toString(16)}`).not.toBe(worn[i]);
                pairs.set(c, after[i] >>> 8);
              } else if (worn[i] !== bare[i] && !region!.colors!.includes(c)) {
                // 천 밖 색(털 테·지퍼·금테·눈·분홍 줄)은 그대로
                expect(after[i], `${id} ${body} ${view} ${target} keep ${c.toString(16)}`).toBe(worn[i]);
              }
            }
            // 염색 뒤에도 천 톤의 밝기 순서가 그대로 (명암이 뭉개지거나 뒤집히지 않는다)
            const list = [...pairs].sort((a, b) => toHsl(a[0]).l - toHsl(b[0]).l);
            for (let k = 1; k < list.length; k++) expect(toHsl(list[k][1]).l, `${id} ${target} order`).toBeGreaterThanOrEqual(toHsl(list[k - 1][1]).l - 0.005);
          }
        }
      // 천 톤은 실제 그림에 쓰인다 (그림이 바뀌어 묶음이 빗나가면 여기서 걸린다)
      expect(used.size, id).toBeGreaterThanOrEqual(Math.min(ramp.length, 2));
      if (["sc_padding", "hat_chef", "hat_santa", "hat_mochibun", "back_cape", "back_backpack", "wr_shirt", "wr_puffer", "wr_robe", "wr_apron", "wr_coat"].includes(id)) expect(used.size, `${id} 네 톤 이상`).toBeGreaterThanOrEqual(4);
    }
  });

  it("색 옮기기 함수: 바탕 천 → 고른 색, 무리 밖(장식) 색은 그대로", () => {
    const ref = itemRefOf(
      new Map([
        [0xd0603a, 10],
        [0xa0482a, 6],
        [0xf08a5a, 3],
        [0xffffff, 2],
        [0x2a2520, 1],
      ]),
    )!;
    expect(ref.group.has(0xffffff)).toBe(false);
    expect(ref.group.has(0x2a2520)).toBe(false);
    expect(dyeItemColor(0xffffff, ref, 0x3050e0)).toBe(0xffffff);
    expect(dyeItemColor(0x2a2520, ref, 0x3050e0)).toBe(0x2a2520);
    const main = toHsl(dyeItemColor(0xd0603a, ref, 0x3050e0));
    const want = toHsl(0x3050e0);
    expect(Math.abs(main.h - want.h)).toBeLessThan(3);
    expect(Math.abs(main.l - want.l)).toBeLessThan(0.02);
    const lo = toHsl(dyeItemColor(0xa0482a, ref, 0x3050e0)).l;
    const hi = toHsl(dyeItemColor(0xf08a5a, ref, 0x3050e0)).l;
    expect(lo).toBeLessThan(main.l);
    expect(hi).toBeGreaterThan(main.l);
    // 흰색·검정 염색도 그늘·빛이 남는다
    for (const t of [0xffffff, 0x000000]) {
      const ls = [0xa0482a, 0xd0603a, 0xf08a5a].map((c) => toHsl(dyeItemColor(c, ref, t)).l);
      expect(ls[0]).toBeLessThan(ls[1]);
      expect(ls[1]).toBeLessThan(ls[2]);
    }
  });
});

// 11/22 날개 염색 (운영자 「날개까지 염색 가능하게 되면 안 돼? 어차피 등이잖아」): 시트 밖 날개 그림(cosmeticFx)을 같은 규칙으로 다시 칠한다
const WINGS = ["back_wings", "back_wings_bat", "back_wings_butterfly", "back_wings_angel", "back_wings_dragon"];
const artOf = (id: string) => (COSMETIC_FX[id] as { art: FxArtId }).art;

describe("11/22 날개 염색", () => {
  const wingInput = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000, dt: 16, x: 100, y: 200, headY: 200, dir: 3 as FxInput["dir"], moving: false, hidden: false, artTop: 20, shoulder: 12, hand: { dx: 4, up: 8 }, reduced: false, ...o,
  });

  it("날개 5종 모두 염색된다 · 연은 안 된다", () => {
    for (const id of WINGS) expect(isDyeableCosmetic(id), id).toBe(true);
    expect(isDyeableCosmetic("q_back_kite")).toBe(false);
  });

  it("염색한 날개 그림: 묶음 색만 바뀌고 외곽선·흰 점·투명도는 그대로, 여섯 색이 모두 서로 달라 보인다", () => {
    const colors = [0xe0303a, 0x3060e0, 0x222222, 0x6ad8b8, 0xf6b8cc];
    for (const id of WINGS) {
      const art = artOf(id);
      const base = fxArtGrid(art);
      const region = new Set(GEAR_DYE_REGIONS[id].colors);
      const looks = new Set<string>();
      for (const c of colors) {
        const g = fxArtGrid(art, c.toString(16).padStart(6, "0"));
        let changed = 0;
        for (let i = 0; i < base.px.length; i++) {
          const v = base.px[i];
          expect(g.px[i] & 255, `${id} alpha`).toBe(v & 255);
          if (!(v & 255)) continue;
          if (region.has(v >>> 8)) changed += g.px[i] !== v ? 1 : 0;
          else expect(g.px[i], `${id} ${i} 묶음 밖은 그대로`).toBe(v);
        }
        expect(changed, `${id} ${c.toString(16)}`).toBeGreaterThan(20);
        looks.add([...g.px].join());
      }
      expect(looks.size, id).toBe(colors.length);
    }
  });

  it("고른 색이 날개 바탕에 또렷이 보인다 (가장 많이 칠한 색의 색상이 고른 색 ±30°, 밝은 흰 날개도)", () => {
    for (const id of WINGS) {
      for (const target of [0xe0303a, 0x3060e0, 0x6ad8b8]) {
        const g = fxArtGrid(artOf(id), target.toString(16).padStart(6, "0"));
        const hist = new Map<number, number>();
        for (const v of g.px) if (v & 255) hist.set(v >>> 8, (hist.get(v >>> 8) ?? 0) + 1);
        const top = [...hist].sort((a, b) => b[1] - a[1])[0][0];
        const h = toHsl(top);
        const dh = Math.abs(((h.h - toHsl(target).h + 540) % 360) - 180);
        expect(dh, `${id} ${target.toString(16)}`).toBeLessThan(30);
        expect(h.s, `${id} ${target.toString(16)} 채도`).toBeGreaterThan(0.3);
      }
    }
  });

  it("연출: 염색한 날개는 그 색 그림(tex), 특수 색이면 같은 자리에 가면 덮개(tex m)를 겹친다 · 안 칠했거나 다른 아이템 색이면 원래 그림", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["back_wings_butterfly"]);
    const run = (o: Partial<FxInput> = {}) => {
      const out: FxCmd[] = [];
      sim.step(wingInput(o), out);
      return out;
    };
    expect(run().map((c) => c.tex)).toEqual([undefined]);
    sim.setDye({ hat_beanie: "#e03030" });
    expect(run().map((c) => c.tex)).toEqual([undefined]);
    sim.setDye({ back_wings_butterfly: "#E03030" });
    expect(run().map((c) => c.tex)).toEqual(["e03030"]);
    expect(sim.dyedArt()).toEqual([{ art: "wingsButterfly", tex: "e03030" }]);
    // 무지개: 가면 덮개가 날개와 같은 자리·파닥임·뒤집기로
    sim.setDye({ back_wings_butterfly: "#e03030~r" });
    const [w, m] = run({ dir: 2 as FxInput["dir"], now: 1234 });
    expect(w.tex).toBe("e03030");
    expect(m).toMatchObject({ art: w.art, frame: w.frame, x: w.x, y: w.y, sx: w.sx, flip: w.flip, tex: "m" });
    expect(m.tint).toBeDefined();
    expect(m.depth).toBeGreaterThan(w.depth);
    expect(sim.dyedArt()).toEqual([
      { art: "wingsButterfly", tex: "e03030" },
      { art: "wingsButterfly", tex: "m" },
    ]);
    // 야광: 밤에만 빛 층으로
    sim.setDye({ back_wings_butterfly: "#e03030~n" });
    expect(run({ glow: false }).length).toBe(1);
    expect(run({ glow: true })[1]).toMatchObject({ tex: "m", layer: "light", add: true });
    // 반짝이: 가끔 날개 위 한 점에서 반짝 별 (날개 그림 범위 안)
    sim.setDye({ back_wings_butterfly: "#e03030~s" });
    let glints = 0;
    for (let t = 0; t < 9000; t += 50) {
      for (const c of run({ now: t })) {
        if (c.art !== "dyeGlint") continue;
        glints++;
        expect(Math.abs(c.x - 100)).toBeLessThanOrEqual(FX_ART.wingsButterfly.w);
        expect(Math.abs(c.y - (200 - 12 - 3))).toBeLessThanOrEqual(FX_ART.wingsButterfly.h / 2);
      }
    }
    expect(glints).toBeGreaterThan(0);
    // 숨는 자세면 아무것도 없다 · 날개를 벗으면 잡을 그림도 없다
    expect(run({ hidden: true })).toEqual([]);
    sim.setLook([]);
    expect(sim.dyedArt()).toEqual([]);
  });

  it("작은 날개도 같은 연출 길: 예전처럼 150ms·달리면 70ms로 파닥이고, 이름표는 어깨 + 9 위", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["back_wings"]);
    expect(sim.labelTop(20, 12)).toBe(21);
    const at = (now: number, running: boolean) => {
      const out: FxCmd[] = [];
      sim.step(wingInput({ now, running }), out);
      return out[0].sx;
    };
    expect(at(150 * (Math.PI / 2), false)).toBeCloseTo(1.16, 5);
    expect(at(70 * (Math.PI / 2), true)).toBeCloseTo(1.16, 5);
    expect(at(1000, false)).toBeCloseTo(1 + 0.16 * Math.sin(1000 / 150), 5);
  });
});

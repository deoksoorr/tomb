import { describe, expect, it } from "vitest";
import { DIR, ITEMS, type DirId } from "@tomb/protocol";
import { COSMETIC_FX, CosmeticFxSim, FX_ART, fxIconGrid, type FxCmd, type FxInput } from "./cosmeticFx";
import { BREED_ART, BREED_DIRS, BREED_FRAMES, BREED_FX } from "./petBreeds";
import { hasItemIcon } from "./itemIcons";

// 11/19 멍냥 분양소 품종 펫 12종: 그림·연출 연결, 네 방향(위 = 뒷모습 · 아래 = 앞모습 · 옆 = 옆모습), 기존 펫은 그대로 옆모습.

const BREED_IDS = ITEMS.filter((i) => i.petShop).map((i) => i.id);

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
  reduced: false,
  ...o,
});

/** 펫 하나를 걸리고(dir 방향으로 ms 동안) 그다음 멈춰 세운다. 걷는 동안·멈춘 뒤 펫 명령의 프레임·뒤집기 */
function walkThenRest(id: string, dir: DirId, walkMs = 1200, restMs = 1500) {
  const sim = new CosmeticFxSim();
  sim.setLook([id]);
  const art = (COSMETIC_FX[id] as { art: string }).art;
  const [dx, dy] = dir === DIR.left ? [-1, 0] : dir === DIR.right ? [1, 0] : dir === DIR.up ? [0, -1] : [0, 1];
  let x = 300;
  let y = 300;
  const walk: FxCmd[] = [];
  const rest: FxCmd[] = [];
  let t = 1000;
  for (; t < 1000 + walkMs; t += 16) {
    x += dx;
    y += dy;
    const out: FxCmd[] = [];
    sim.step(input({ now: t, x, y, headY: y - 20, dir, moving: true }), out);
    walk.push(...out.filter((c) => c.art === art));
  }
  for (; t < 1000 + walkMs + restMs; t += 16) {
    const out: FxCmd[] = [];
    // 멈추면 주인은 보통 아래를 본다 (dir가 바뀌어도 펫은 마지막으로 걸은 방향을 기억)
    sim.step(input({ now: t, x, y, headY: y - 20, dir: DIR.down, moving: false }), out);
    rest.push(...out.filter((c) => c.art === art));
  }
  return { walk, rest: rest.slice(Math.floor(rest.length / 2)) };
}

describe("11/19 멍냥 분양소 품종 펫 연결", () => {
  it("12종 모두 그림(14장)·연출·아이콘이 있고, 네 방향 프레임 번호가 시트 안", () => {
    expect(BREED_IDS).toHaveLength(12);
    for (const id of BREED_IDS) {
      const spec = COSMETIC_FX[id];
      expect(spec?.kind, id).toBe("pet");
      if (spec?.kind !== "pet") continue;
      expect(spec.dirs, id).toEqual(BREED_DIRS);
      expect(FX_ART[spec.art].frames, id).toBe(BREED_FRAMES);
      expect(hasItemIcon(id), id).toBe(true);
      const icon = fxIconGrid(id);
      expect(icon && [icon.w, icon.h], id).toEqual([16, 16]);
      expect([...icon!.px].some((v) => (v & 255) > 0), id).toBe(true);
    }
    for (const f of [...BREED_DIRS.down.walk, ...BREED_DIRS.down.rest, ...BREED_DIRS.up.walk, ...BREED_DIRS.up.rest]) expect(f).toBeLessThan(BREED_FRAMES);
    expect(Object.keys(BREED_FX).sort()).toEqual([...BREED_IDS].sort());
    for (const a of Object.values(BREED_ART)) expect(a.build().w).toBe(a.w * a.frames);
  });

  it("아래로 걸으면 앞모습(6·7) → 멈추면 앞 보고 앉기(8·9), 위로 걸으면 뒷모습(10·11) → 뒤 앉기(12·13). 앞·뒤는 뒤집지 않는다", () => {
    for (const id of BREED_IDS) {
      const down = walkThenRest(id, DIR.down);
      expect(new Set(down.walk.map((c) => c.frame)), id).toEqual(new Set([6, 7]));
      expect(down.walk.every((c) => !c.flip), id).toBe(true);
      expect(new Set(down.rest.map((c) => c.frame)).size, id).toBeGreaterThan(0);
      for (const c of down.rest) expect([8, 9], id).toContain(c.frame);
      const up = walkThenRest(id, DIR.up);
      expect(new Set(up.walk.map((c) => c.frame)), id).toEqual(new Set([10, 11]));
      for (const c of up.rest) expect([12, 13], id).toContain(c.frame);
    }
  });

  it("왼쪽·오른쪽으로 걸으면 옆모습(0·1)이고 주인 쪽을 본다 (왼쪽으로 가면 펫이 주인 오른쪽 뒤 → 뒤집기), 멈추면 옆 앉기·품종 동작", () => {
    for (const id of BREED_IDS) {
      const left = walkThenRest(id, DIR.left, 1200, 9500);
      expect(new Set(left.walk.map((c) => c.frame)), id).toEqual(new Set([0, 1]));
      expect(left.walk.at(-1)!.flip, id).toBe(true);
      // 오래 쉬면 품종 동작(4·5)도 나온다 (옆을 볼 때만)
      expect(left.rest.some((c) => c.frame === 4 || c.frame === 5), id).toBe(true);
      const right = walkThenRest(id, DIR.right);
      expect(new Set(right.walk.map((c) => c.frame)), id).toEqual(new Set([0, 1]));
      expect(right.walk.at(-1)!.flip, id).toBe(false);
    }
  });

  it("앞·뒤를 보고 쉴 때는 품종 동작(4·5)을 하지 않는다", () => {
    for (const id of BREED_IDS) {
      const r = walkThenRest(id, DIR.down, 600, 12_000);
      expect(r.rest.some((c) => c.frame === 4 || c.frame === 5), id).toBe(false);
    }
  });

  it("기존 펫(dirs 없음)은 하나도 안 바뀐다: 마지막 걸은 방향 기억을 끈 예전 동작과 매 장면 명령이 똑같다 (네 방향·물·멈춤 모두)", () => {
    // 11/20 계절 보따리상 새 펫 넷도 네 방향 (seasonSetFx3 — 품종 펫과 같은 dirs)
    const SEASON_FOUR = ["ye_raccoon", "su_goat", "ic_penguin", "fr_snowbun"];
    const old = Object.entries(COSMETIC_FX).filter(([id, s]) => s.kind === "pet" && !BREED_IDS.includes(id) && !SEASON_FOUR.includes(id));
    expect(old.length).toBeGreaterThan(20);
    /** 같은 입력을 두 sim에 넣는다: b는 매번 petFace를 -1(아직 안 걸음 = 예전 옆모습만)로 되돌린다 */
    const lockstep = (id: string) => {
      const a = new CosmeticFxSim();
      const b = new CosmeticFxSim();
      a.setLook([id]);
      b.setLook([id]);
      let x = 300;
      let y = 300;
      let same = true;
      const plan: [DirId, boolean, FxInput["water"]][] = [];
      for (const d of [DIR.up, DIR.left, DIR.down, DIR.right] as const) for (let i = 0; i < 90; i++) plan.push([d, i < 60, i >= 30 && i < 45 ? "swim" : undefined]);
      plan.forEach(([dir, moving, water], i) => {
        if (moving) [x, y] = [x + (dir === DIR.left ? -1 : dir === DIR.right ? 1 : 0), y + (dir === DIR.up ? -1 : dir === DIR.down ? 1 : 0)];
        const inp = input({ now: 1000 + i * 16, x, y, headY: y - 20, dir: moving ? dir : DIR.down, moving, water });
        (b as unknown as { petFace: number }).petFace = -1;
        const oa: FxCmd[] = [];
        const ob: FxCmd[] = [];
        a.step(inp, oa);
        b.step(inp, ob);
        if (JSON.stringify(oa) !== JSON.stringify(ob)) same = false;
      });
      return same;
    };
    for (const [id, s] of old) {
      expect(s.kind === "pet" && s.dirs, id).toBeFalsy();
      expect(lockstep(id), id).toBe(true);
    }
    // 품종 펫은 달라진다 (같은 비교로 위·아래 그림이 실제로 쓰이는지)
    for (const id of [...BREED_IDS, ...SEASON_FOUR]) expect(lockstep(id), id).toBe(false);
  });

  it("미리보기(still)·물속은 옆모습 그대로", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_corgi"]);
    const out: FxCmd[] = [];
    sim.step(input({ still: true, moving: true, dir: DIR.down }), out);
    expect(out.find((c) => c.art === "pbDogCorgi")!.frame).toBeLessThan(2);
    const swim = new CosmeticFxSim();
    swim.setLook(["pet_corgi"]);
    for (let t = 0; t < 40; t++) {
      const o: FxCmd[] = [];
      swim.step(input({ now: 1000 + t * 16, y: 200 + t, moving: true, dir: DIR.down, water: "swim", reduced: true }), o);
      if (t === 39) expect(o.find((c) => c.art === "pbDogCorgi")!.frame).toBeLessThan(2);
    }
  });
});

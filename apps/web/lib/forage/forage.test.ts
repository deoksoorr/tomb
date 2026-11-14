import { describe, expect, it } from "vitest";
import { FISHING_SPOTS, fishingSpotById, seatSlot, SEATS, spotKindOfState, STATE, DIR } from "@tomb/protocol";
import { forageIconGrid, isForageIcon } from "@/game/sprites/forageIcons";
import { spotOf } from "@/game/logic/spots";
import { allProps, inWater, nearWater, standable } from "@/game/world/layout";
import { SEASONS, TIME_PHASES, WEATHERS } from "../ambience";
import { bugsCount, bugsPlan } from "../rpg/plan";
import {
  DEX_REWARD,
  DEX_TITLES,
  GATHER_NODES,
  LIFE_CATS,
  NODE_CAT,
  NPCS,
  SPECIES,
  speciesOf,
  type Where,
} from "./catalog";
import { autoRareFactor, pickAuto } from "./auto";
import { sunkenFallbackFish } from "./sunken";
import {
  activeNodes,
  BUG_DIFFICULTY,
  BUG_ROUND_SEC,
  BUG_STATS,
  candidates,
  conditionsAt,
  fishPower,
  fits,
  hash01,
  insectRolls,
  nodeActive,
  NODE_DENSITY,
  nodeWindow,
  pickWeighted,
  reelMinMs,
  rollSize10,
  verifyBugs,
  type Cond,
} from "./rules";

const ALL_CONDS: Cond[] = TIME_PHASES.flatMap((phase) => WEATHERS.flatMap((weather) => SEASONS.map((season) => ({ phase, weather, season }))));

/** 실제 한 해 동안 하늘에 뜨는 조합 (KST 2026년을 15분마다). 눈은 11~3월에만 와서 여름 눈 같은 조합은 없다 */
const REAL_CONDS: Cond[] = (() => {
  const seen = new Map<string, Cond>();
  const start = Date.UTC(2025, 11, 31, 15); // KST 2026-01-01 00:00
  for (let t = start; t < start + 365 * 86_400_000; t += 15 * 60_000) {
    const c = conditionsAt(t);
    seen.set(`${c.phase}|${c.weather}|${c.season}`, c);
  }
  return [...seen.values()];
})();

/** 종류마다 나올 수 있는 곳 (물고기 = 낚시 자리의 물, 나머지 = 그 채집 지점이 있는 구역) */
function wheresOf(cat: string): Set<Where> {
  if (cat === "fish") return new Set(FISHING_SPOTS.map((s) => s.water as Where));
  return new Set(GATHER_NODES.filter((n) => NODE_CAT[n.kind] === cat).map((n) => n.where));
}

/** 처음 78종 (2차로 늘리기 전). 이미 잡은 도감·가방·순위가 이 id를 가리키니 빼거나 바꾸면 안 된다 */
const FIRST_IDS = (
  "f_crucian f_bluegill f_minnow f_chub f_loach f_carp f_catfish f_bass f_smelt f_sweetfish f_bullhead f_kkeokji f_mandarin f_rainbow f_eel " +
  "f_snakehead f_trout f_koi f_salmon f_sturgeon f_king f_moon f_shoe f_badge " +
  "b_cabbage b_redfly b_hopper b_ladybug b_swallowtail b_mantis b_dung b_snowwing b_gold b_firefly b_cricket b_moth b_lunar b_stag b_rhino b_wisp " +
  "h_mugwort h_dandelion h_clover h_shepherd h_shiitake h_bellflower h_deodeok h_fern h_mistletoe h_glowcap h_fourleaf h_songi h_reishi h_ginseng h_cordyceps " +
  "o_pebble o_coal o_copper o_iron o_quartz o_silver o_amethyst o_gold o_meteor o_diamond " +
  "d_coin d_mug d_cap d_key d_floppy d_diary d_usb d_plan d_pottery d_fossil d_capsule d_ring d_crown"
).split(" ");

describe("카탈로그", () => {
  it("id가 겹치지 않고 종류마다 접두어가 맞다, 값은 양수", () => {
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prefix: Record<string, string> = { fish: "f_", bug: "b_", herb: "h_", ore: "o_", dig: "d_" };
    for (const s of SPECIES) {
      expect(s.id.startsWith(prefix[s.cat]), s.id).toBe(true);
      expect(s.price, s.id).toBeGreaterThan(0);
      if (s.size) expect(s.size[1], s.id).toBeGreaterThan(s.size[0]);
    }
    for (const c of LIFE_CATS) expect(speciesOf(c).length).toBeGreaterThanOrEqual(10);
  });

  it("모든 종은 언젠가(시간·날씨·계절 중 어떤 조합에서) 어딘가에서 잡힌다", () => {
    const fishWheres = new Set(FISHING_SPOTS.map((s) => s.water as Where));
    const nodeWheres = new Map<string, Set<Where>>();
    for (const n of GATHER_NODES) {
      const cat = NODE_CAT[n.kind];
      if (!nodeWheres.has(cat)) nodeWheres.set(cat, new Set());
      nodeWheres.get(cat)!.add(n.where);
    }
    for (const s of SPECIES) {
      const wheres = s.cat === "fish" ? fishWheres : nodeWheres.get(s.cat)!;
      const ok = [...wheres].some((w) => ALL_CONDS.some((c) => fits(s, w, c)));
      expect(ok, `${s.id} ${s.name}`).toBe(true);
    }
  });

  it("어떤 조건에서도 낚시 자리마다 걸릴 물고기가 있고, 채집 지점마다 나올 것이 있다", () => {
    for (const c of ALL_CONDS) {
      for (const w of ["lake", "river"] as const) expect(candidates("fish", w, c).length, `${w} ${JSON.stringify(c)}`).toBeGreaterThan(0);
      for (const n of GATHER_NODES) expect(candidates(NODE_CAT[n.kind], n.where, c).length, `${n.id} ${JSON.stringify(c)}`).toBeGreaterThan(0);
    }
  });

  it("모든 종에 픽셀 아이콘(16×16)이 있다", () => {
    for (const s of SPECIES) expect(isForageIcon(s.id), s.id).toBe(true);
    expect(isForageIcon("f_nope")).toBe(false);
  });

  it("아이콘은 종마다 다르다 (같은 그림을 두 종이 나눠 쓰지 않는다)", () => {
    const seen = new Map<string, string>();
    for (const s of SPECIES) {
      const g = forageIconGrid(s.id)!;
      expect([g.w, g.h], s.id).toEqual([16, 16]);
      const key = Array.from(g.px).join(",");
      expect(seen.get(key), `${s.id}의 그림이 ${seen.get(key)}와 같다`).toBeUndefined();
      seen.set(key, s.id);
    }
  });

  it("처음 78종의 id는 그대로 남아 있다 (2차로 늘린 뒤에도)", () => {
    expect(FIRST_IDS).toHaveLength(78);
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of FIRST_IDS) expect(ids.has(id), id).toBe(true);
    // 2차: 물고기 40 · 곤충 30 · 약초 28 · 광석 20 · 발굴품 24
    expect(LIFE_CATS.map((c) => speciesOf(c).length)).toEqual([40, 30, 28, 20, 24]);
  });

  it("실제 한 해의 하늘(시간대·날씨·계절)에서 모든 종이 잡힐 때가 있다", () => {
    // 여름 눈처럼 실제로는 없는 조합만 맞는 종이 생기지 않게 (ALL_CONDS보다 엄격)
    expect(REAL_CONDS.some((c) => c.season === "summer" && c.weather === "snow")).toBe(false);
    for (const s of SPECIES) {
      const ok = [...wheresOf(s.cat)].some((w) => REAL_CONDS.some((c) => fits(s, w, c) && candidates(s.cat, w, c).includes(s)));
      expect(ok, `${s.id} ${s.name}`).toBe(true);
    }
  });

  it("지금 계절(가을)에도 2차 종 중 새로 잡을 것이 몇 가지 있다", () => {
    const fresh = SPECIES.filter((s) => !FIRST_IDS.includes(s.id));
    const autumn = fresh.filter((s) => [...wheresOf(s.cat)].some((w) => REAL_CONDS.some((c) => c.season === "autumn" && fits(s, w, c))));
    for (const c of LIFE_CATS) expect(autumn.some((s) => s.cat === c), c).toBe(true);
    // 그래도 대부분은 다른 계절·날씨에 퍼져 있다: 가을 한정이 아닌 것이 훨씬 많다
    expect(fresh.filter((s) => s.season?.length === 1 && s.season[0] === "autumn").length).toBeLessThan(fresh.length / 4);
  });

  it("값은 같은 희귀도의 기존 종과 같은 범위 (경제 균형)", () => {
    const range = (list: typeof SPECIES) => [Math.min(...list.map((s) => s.price)), Math.max(...list.map((s) => s.price))];
    const first = SPECIES.filter((s) => FIRST_IDS.includes(s.id));
    for (const r of [1, 2, 3, 4, 5] as const) {
      const [lo, hi] = range(first.filter((s) => s.rarity === r && !s.junk));
      for (const s of SPECIES.filter((x) => x.rarity === r && !x.junk)) {
        expect(s.price, s.id).toBeGreaterThanOrEqual(lo);
        expect(s.price, s.id).toBeLessThanOrEqual(hi);
      }
    }
    for (const s of SPECIES.filter((x) => x.junk)) expect(s.price, s.id).toBeLessThanOrEqual(2);
  });

  it("물고기마다: 그 조건에서 직접·자동 낚시 후보에 들고, 자동 낚시로도 걸릴 수 있다. 꾸미기 대체는 희귀(★3 이상)만", () => {
    for (const s of speciesOf("fish")) {
      const hit = (["lake", "river"] as const).flatMap((w) => REAL_CONDS.filter((c) => fits(s, w, c)).map((c) => ({ w, c })));
      expect(hit.length, s.id).toBeGreaterThan(0);
      const { w, c } = hit[0];
      const list = candidates("fish", w, c);
      expect(list, s.id).toContain(s);
      // 자동 낚시: 난수를 촘촘히 훑으면 이 물고기도 나온다 (희귀는 절반 확률일 뿐 0이 아니다)
      const f = autoRareFactor(list);
      expect(f, s.id).toBeGreaterThan(0);
      let got = false;
      for (let i = 0; i < 40_000 && !got; i++) got = pickAuto(list, (i + 0.5) / 40_000) === s;
      expect(got, `자동 낚시 ${s.id}`).toBe(true);
      // 꾸미기를 다 가졌을 때 대신 주는 물고기: 잡동사니·흔한 것은 안 나온다
      for (const r of [0, 0.3, 0.7, 0.999]) {
        const alt = sunkenFallbackFish(w, c, r, s);
        expect(alt.junk && alt !== s, s.id).toBeFalsy();
        if (alt !== s) expect(alt.rarity, s.id).toBeGreaterThanOrEqual(3);
      }
      if (s.size) expect(rollSize10(s, 0.5), s.id).toBeGreaterThan(0);
    }
  });

  it("도감 보상: 단계마다 포인트, 칭호는 종류마다 50·100%", () => {
    expect(Object.values(DEX_REWARD).every((p) => p > 0)).toBe(true);
    for (const c of LIFE_CATS) {
      expect(DEX_TITLES[c][50]).toBeTruthy();
      expect(DEX_TITLES[c][100]).toBeTruthy();
    }
  });
});

describe("맵 배치", () => {
  const props = allProps();
  it("낚시 자리: 서 있을 수 있는 물가, 바라보는 쪽은 물, 서버 좌석으로 정해진 자리만", () => {
    const step = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] } as Record<number, [number, number]>;
    for (const s of FISHING_SPOTS) {
      expect(standable(s.x, s.y), s.id).toBe(true);
      expect(inWater(s.x, s.y), s.id).toBe(false);
      expect(nearWater(s.x, s.y), s.id).toBe(true);
      const [dx, dy] = step[s.facing];
      expect(inWater(s.x + dx * 20, s.y + dy * 20), `${s.id} 앞이 물`).toBe(true);
      const slot = seatSlot(s.id);
      expect(slot).toMatchObject({ kind: "fish", x: s.x, y: s.y, facing: s.facing, state: STATE.sitGround });
      expect(fishingSpotById(s.id)).toBe(s);
      for (const o of FISHING_SPOTS) if (o !== s) expect(Math.hypot(o.x - s.x, o.y - s.y), `${s.id}~${o.id}`).toBeGreaterThanOrEqual(14);
    }
    // 정해진 자리만: 형식이 맞아도 목록에 없는 좌표는 자리가 아니다
    expect(seatSlot("f_100_100")).toBeUndefined();
    // 바닥 앉기(sitGround)만으로 낚시 자리를 잡아 주지 않는다 (shared)
    expect(spotKindOfState(STATE.sitGround)).not.toBe("fish");
    // 월드의 낚시 자리 상호작용은 1인 자리로 판정된다 (누가 앉았으면 회색 안내)
    expect(spotOf({ kind: "forage", forage: "fish:f_1172_932", ax: 1172, ay: 932 })).toEqual({ kind: "fish", id: "f_1172_932" });
    expect(spotOf({ kind: "forage", forage: "npc:fishmonger", ax: 0, ay: 0 })).toBeNull();
  });

  it("채집 지점·NPC: 서 있을 수 있고, 물·소품·좌석·낚시 자리와 겹치지 않는다", () => {
    const spots = [...GATHER_NODES.map((n) => ({ id: n.id, x: n.x, y: n.y })), ...NPCS.map((n) => ({ id: n.id, x: n.x, y: n.y }))];
    expect(new Set(GATHER_NODES.map((n) => n.id)).size).toBe(GATHER_NODES.length);
    for (const p of spots) {
      expect(standable(p.x, p.y), p.id).toBe(true);
      expect(inWater(p.x, p.y), p.id).toBe(false);
      for (const q of props) expect(Math.hypot(q.x - p.x, q.y - p.y), `${p.id} ~ 소품 ${q.kind}@${q.x},${q.y}`).toBeGreaterThanOrEqual(12);
      for (const s of SEATS) expect(Math.hypot(s.x - p.x, s.y - p.y), `${p.id} ~ 좌석 ${s.id}`).toBeGreaterThanOrEqual(20);
      for (const f of FISHING_SPOTS) expect(Math.hypot(f.x - p.x, f.y - p.y), `${p.id} ~ ${f.id}`).toBeGreaterThanOrEqual(24);
      for (const o of spots) if (o !== p) expect(Math.hypot(o.x - p.x, o.y - p.y), `${p.id} ~ ${o.id}`).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("굴리기", () => {
  const c: Cond = { phase: "day", weather: "clear", season: "autumn" };
  it("무게대로 뽑는다: 흔한 것이 훨씬 자주", () => {
    const list = candidates("fish", "lake", c);
    const n = new Map<number, number>();
    for (let i = 0; i < 4000; i++) {
      const s = pickWeighted(list, (i + 0.5) / 4000)!;
      n.set(s.rarity, (n.get(s.rarity) ?? 0) + 1);
    }
    expect(n.get(1)!).toBeGreaterThan(n.get(2)!);
    expect(n.get(2)!).toBeGreaterThan(n.get(3) ?? 0);
    expect(pickWeighted([], 0.5)).toBeNull();
  });

  it("크기는 범위 안, 큰 쪽이 드물다 / 손맛은 1~5", () => {
    const carp = SPECIES.find((s) => s.id === "f_carp")!;
    expect(rollSize10(carp, 0)).toBe(300);
    expect(rollSize10(carp, 0.999999)).toBe(850);
    expect(rollSize10(carp, 0.5)).toBeLessThan((300 + 850) / 2);
    expect(rollSize10(SPECIES.find((s) => s.id === "h_mugwort")!, 0.5)).toBe(0);
    for (const s of speciesOf("fish")) for (const r of [0, 0.5, 0.99]) expect(fishPower(s, rollSize10(s, r))).toBeGreaterThanOrEqual(1);
    expect(fishPower(SPECIES.find((s) => s.id === "f_king")!, 1500)).toBe(5);
    expect(reelMinMs(5)).toBeGreaterThan(reelMinMs(1));
  });

  it("채집 지점은 사람마다·창마다 결정적으로 피고, 밀도는 대략 설정값", () => {
    const n = GATHER_NODES[0];
    expect(nodeActive("acct-a", n, 100)).toBe(nodeActive("acct-a", n, 100));
    let on = 0;
    let total = 0;
    for (let w = 0; w < 400; w++)
      for (const m of GATHER_NODES) {
        total++;
        if (nodeActive(`acct-${w % 7}`, m, w)) on++;
      }
    const avg = GATHER_NODES.reduce((s, m) => s + NODE_DENSITY[m.kind], 0) / GATHER_NODES.length;
    expect(Math.abs(on / total - avg)).toBeLessThan(0.05);
    // 이번 창에 캔 것은 빠진다
    const now = Date.UTC(2026, 10, 12, 3);
    const all = activeNodes("acct-x", now, new Set());
    expect(all.length).toBeGreaterThan(5);
    expect(activeNodes("acct-x", now, new Set([all[0].id])).map((x) => x.id)).not.toContain(all[0].id);
    expect(nodeWindow(now + 15 * 60_000)).toBe(nodeWindow(now) + 1);
    expect(hash01("a")).not.toBe(hash01("b"));
  });

  it("곤충 미니게임: 결과 상한 검사와 마리 수", () => {
    const seed = 1234;
    const all = bugsCount(bugsPlan(seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
    const ok = { game: "bugs" as const, durationMs: 30_000, caught: all.bug, golden: all.golden, wrong: 0, decoy: 0, maxCombo: 5, score: 100 };
    expect(verifyBugs(seed, ok, 31_000)).toMatchObject({ ok: true, caught: all.bug });
    expect(verifyBugs(seed, { ...ok, caught: all.bug + 1 }, 31_000).ok).toBe(false);
    // 서버로는 5초밖에 안 지났다
    expect(verifyBugs(seed, ok, 5_000).ok).toBe(false);
    expect(verifyBugs(seed, { ...ok, durationMs: 5_000, caught: all.bug }, 5_000).ok).toBe(false);
    expect(insectRolls(4, 0, 0)).toEqual({ common: 0, rare: 0 });
    expect(insectRolls(12, 1, 2)).toEqual({ common: 2, rare: 1 });
    expect(insectRolls(40, 9, 0)).toEqual({ common: 3, rare: 2 });
  });
});

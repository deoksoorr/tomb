import { describe, expect, it } from "vitest";
import { FISHING_SPOTS, fishingSpotById, seatSlot, SEATS, spotKindOfState, STATE, DIR } from "@tomb/protocol";
import { isForageIcon } from "@/game/sprites/forageIcons";
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
import {
  activeNodes,
  BUG_DIFFICULTY,
  BUG_ROUND_SEC,
  BUG_STATS,
  candidates,
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
    expect(spotOf({ kind: "forage", forage: "fish:f_1646_1100", ax: 1646, ay: 1100 })).toEqual({ kind: "fish", id: "f_1646_1100" });
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

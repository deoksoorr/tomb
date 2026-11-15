import { describe, expect, it, vi } from "vitest";
import type { MonsterId } from "@/lib/rpg/catalog";
import type { CardOfferView } from "@/lib/rpg/cards";
import { cardPower, isBossDealFloor } from "@/lib/rpg/cards";
import { seeded } from "@/lib/rpg/formulas";
import { huntSpawnable } from "@/lib/rpg/plan";
import { RunFinishSchema } from "@/lib/rpg/schemas";
import { evalTower, floorMinSec, towerPlan } from "@/lib/rpg/tower";
import type { HuntResult } from "@/lib/rpg/types";
import { bridge } from "../../bridge";
import { CardRun, type CardHost, type CardMon } from "./CardRun";

// 11/15 회귀 (운영 422): 야근 빌딩을 31층쯤까지 오른 정직한 판이 「능력 카드 기록이 맞지 않아요」로 거절됐다.
// 게임은 레벨 업 카드 기록에 오른 층(f)을 싣는데, 판 끝 요청 형식(RunResultSchema)이 f를 몰라 지워 버려서
// 서버가 11층 이상에서 오른 레벨 업 제안을 1층 확률로 다시 굴렸다 → 등급이 갈린 제안에서 고른 카드가 "제안에 없던 카드"가 됐다.
// 여기서는 실제 판 실행부(CardRun: 처치 경험치·레벨 업 줄 세우기·다시 뽑기·상사의 제안)와 실제 요청 형식(zod)을 거쳐
// 서버 검증(evalTower)까지 긴 판을 흉내 낸다. 그리기는 모두 가짜.

function stub(): unknown {
  const f = function () {};
  return new Proxy(f, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : stub()),
    apply: () => stub(),
    construct: () => stub() as object,
  });
}
vi.mock("phaser", () => ({}));
vi.mock("./cardFx", () => ({ CARD_SND: new Proxy({}, { get: () => [] }), CDT: new Proxy({}, { get: () => "tex" }), ensureCardTextures: () => {} }));
vi.mock("../combatFx", () => ({ FXT: new Proxy({}, { get: () => "tex" }) }));

type Mon = CardMon;
const mon = (id: MonsterId): Mon =>
  ({ id, x: 0, y: 0, hp: 0, alive: false, hidden: false, boss: false, st: { maxHp: 1, def: 0 }, sprite: stub(), slowUntil: 0, stunUntil: 0, kbx: 0, kby: 0 }) as unknown as Mon;

type Sim = { start: number; dieAt: number; fast: boolean; rerollP: number };

/**
 * 한 판: start층부터 dieAt층에서 쓰러질 때까지. HuntScene과 같은 순서로 부른다 —
 * 처치마다 kills++ → cards.onKill, 층의 몬스터를 다 잡으면 floorsCleared++ → (10층마다) cards.bossDeal, 매 프레임 cards.tick.
 * 고르기는 화면처럼 rpg:cards 제안을 보고 rpg:cardPick으로 (가끔 다시 뽑기, 상사의 제안은 받거나 거절)
 */
function runTower(seed: number, o: Sim): { result: HuntResult; cards: CardRun<Mon> } {
  const rnd = seeded((seed * 2654435761) ^ (o.start * 97) ^ o.dieAt);
  let now = 0;
  let cleared = 0;
  let died = false;
  let view: CardOfferView | null = null;
  const off = bridge.on("rpg:cards", (v) => (view = v));
  const host = {
    scene: stub(),
    reduced: true,
    now: () => now,
    player: () => ({ x: 0, y: 0 }),
    face: () => ({ x: 0, y: 1 }),
    mons: () => [],
    size: () => 10,
    style: () => ({ id: "swing" }),
    area: () => ({ range: 20, arcDeg: 90 }),
    strike: () => {},
    dot: () => {},
    meleeArc: () => {},
    ink: () => {},
    clampPoint: (x: number, y: number) => ({ x, y }),
    solid: () => null,
    bounds: () => ({ x0: 0, y0: 0, x1: 400, y1: 300 }),
    enemyShots: () => [],
    hp: () => 100,
    maxHp: () => 100,
    healMul: () => 1,
    heal: () => {},
    later: () => {},
    hold: () => {},
    canPick: () => !died,
    floorsCleared: () => cleared,
    refresh: () => {},
    addSp: () => {},
    invuln: () => {},
    flash: () => {},
    float: () => {},
    synth: () => {},
    shake: () => {},
    ring: () => {},
  } as unknown as CardHost<Mon>;
  const cards = new CardRun<Mon>(host, seed, o.start);
  const pump = () => {
    cards.tick();
    for (let guard = 0; cards.picking && guard < 100; guard++) {
      const v = view as CardOfferView | null;
      if (!v) break;
      if (v.kind === "b") bridge.emit("rpg:cardPick", { accept: rnd() < 0.7 });
      else if (v.rerolls > 0 && rnd() < o.rerollP) bridge.emit("rpg:cardPick", { reroll: true });
      else bridge.emit("rpg:cardPick", { slot: Math.floor(rnd() * v.cards.length) });
    }
  };
  const kills: Partial<Record<MonsterId, number>> = {};
  let floorMs = 0;
  const kill = (id: MonsterId) => {
    kills[id] = (kills[id] ?? 0) + 1;
    cards.onKill(mon(id));
  };
  for (let f = o.start; ; f++) {
    // 엘리베이터 (문이 열리기 전)
    now += 2200 + rnd() * 800;
    pump();
    const plan = towerPlan(seed, f, o.start);
    const list: MonsterId[] = plan.flatMap((w) => w.monsters);
    // 졸개·분열·불려 온 몬스터: 나올 수 있는 몫 안에서 조금
    const can = huntSpawnable(plan, Infinity);
    const planned: Partial<Record<MonsterId, number>> = {};
    for (const id of list) planned[id] = (planned[id] ?? 0) + 1;
    for (const [id, n] of Object.entries(can) as [MonsterId, number][]) {
      const extra = n - (planned[id] ?? 0);
      for (let k = 0; k < extra; k++) if (rnd() < (o.fast ? 0.9 : 0.5)) list.push(id);
    }
    const floorSec = floorMinSec(plan) + (o.fast ? 1 + rnd() * 3 : 15 + rnd() * 35);
    const dying = f === o.dieAt;
    const n = dying ? Math.floor(list.length * rnd()) : list.length;
    for (let k = 0; k < n; k++) {
      now += (floorSec * 1000) / Math.max(1, list.length);
      kill(list[k]);
      pump();
    }
    if (dying) {
      // 갑자기 쓰러짐: 고르기 창이 열려 있어도 그대로 끝, 쓰러진 뒤 0.9초 사이 불·독으로 한두 마리 더 잡힐 수도
      died = true;
      if (n < list.length && rnd() < 0.5) kill(list[n]);
      now += 900;
      break;
    }
    cleared++;
    floorMs = now;
    if (isBossDealFloor(f)) cards.bossDeal(f);
    now += 1000;
    pump();
  }
  off();
  cards.destroy();
  return {
    cards,
    result: {
      game: "hunt",
      durationMs: Math.round(now),
      kills,
      wavesCleared: 0,
      died: true,
      potionsUsed: {},
      floors: cleared,
      floorMs: Math.round(floorMs),
      cards: cards.picks(),
    },
  };
}

/** 판 끝 요청 그대로: zod 형식 검사를 거친 결과로 서버가 검증한다 (finishRun → finishTower → evalTower) */
function serverCheck(seed: number, start: number, r: HuntResult, gp = 1) {
  const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result: r }).result as HuntResult;
  return evalTower({ seed, level: 50, start, ...(gp > 1 ? { gp } : {}) }, parsed, r.durationMs + 1500);
}

describe("야근 빌딩 긴 판 (실제 CardRun → 판 끝 요청 형식 → evalTower)", () => {
  it("1·11·21층에서 시작해 25~40층에서 쓰러진 정직한 판은 모두 통과 (보통·빠른 클리어, 다시 뽑기)", () => {
    const bad: string[] = [];
    let n = 0;
    for (let s = 1; s <= 120; s++)
      for (const start of [1, 11, 21]) {
        const seed = (s * 7919 + start) >>> 0;
        const dieAt = Math.max(start + 2, 25 + (s % 16));
        const o: Sim = { start, dieAt, fast: s % 3 === 0, rerollP: s % 2 ? 0.3 : 0 };
        const { result } = runTower(seed, o);
        const v = serverCheck(seed, start, result, s % 4 === 0 ? 3.5 : 1);
        n++;
        if (!v.ok) bad.push(`seed ${seed} start ${start} die ${dieAt} floors ${result.floors}: ${v.code} ${v.message}`);
        else expect(v.best).toBe(start + (result.floors ?? 0) - 1);
      }
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(n).toBe(360);
  });

  it("레벨 업 카드 기록의 오른 층(f)은 판 끝 요청 형식을 지나도 남는다", () => {
    const { result } = runTower(4242, { start: 1, dieAt: 31, fast: false, rerollP: 0.3 });
    const high = (result.cards ?? []).filter((p) => p.k === "l" && (p.f ?? 0) >= 11);
    expect(high.length).toBeGreaterThan(5);
    const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result }).result as HuntResult;
    expect(parsed.cards).toEqual(result.cards);
  });

  it("강한 빌드로 빠르게 잡아도 처치 속도 상한에 걸리지 않는다 (카드가 많이 쌓인 긴 판)", () => {
    for (let s = 1; s <= 30; s++) {
      const seed = 90_000 + s;
      const { result, cards } = runTower(seed, { start: 21, dieAt: 45, fast: true, rerollP: 0.3 });
      const v = serverCheck(seed, 21, result);
      expect(v.ok, `seed ${seed}: ${!v.ok ? v.message : ""} power ${cardPower(cards.counts)}`).toBe(true);
    }
  });
});

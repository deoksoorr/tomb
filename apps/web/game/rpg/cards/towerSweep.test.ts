import { describe, expect, it, vi } from "vitest";
import { HUNT_ZONES, MONSTERS, type MonsterId } from "@/lib/rpg/catalog";
import type { CardOfferView } from "@/lib/rpg/cards";
import { cardPower, isBossDealFloor, runLevelBase } from "@/lib/rpg/cards";
import { seeded } from "@/lib/rpg/formulas";
import { revivable } from "@/lib/rpg/plan";
import { RunFinishSchema } from "@/lib/rpg/schemas";
import { evalTower, floorMinSec, isBossFloor, towerBlock, towerPlan, type TowerVerdict } from "@/lib/rpg/tower";
import { cfRiceAdds, CF_SPECIAL_SERVERS } from "@/lib/rpg/towerThemes/cafeteriaPlan";
import { pkTowAdds } from "@/lib/rpg/towerThemes/parkingPlan";
import { rfVaneAdds } from "@/lib/rpg/towerThemes/rooftopPlan";
import type { HuntResult } from "@/lib/rpg/types";
import { bridge } from "../../bridge";
import { CardRun, type CardHost, type CardMon } from "./CardRun";

// 11/15 야근 빌딩 전수 시뮬레이션 (정상 판이 서버 검증에 걸리지 않는지):
// 판 화면이 실제로 만들어 내는 몬스터를 「화면 쪽 상한」으로 따로 흉내 낸다 (서버 층 계획의 adds·summon을 그대로 쓰지 않고) —
// 웨이브 계획 + 분열(끝까지) + 엑셀 매크로 복사 2 + 백업 테이프 되살리기(최근 쓰러진 셋, 되살린 것도 다시 줄에) +
// Arena 우두머리 소환(summon.n × 두 번) + 테마 화면: 옥상 피뢰침 불꽃 8·풍향계 서류 rfVaneAdds, 회의실 안건 추가(층 계획 adds를 화면이 그대로 읽는다),
// 주차장 견인 경보 차 pkTowAdds, 구내식당 밥솥 주먹밥 cfRiceAdds·특식 배식 도우미 4.
// 카드는 실제 판 실행부(CardRun)로 고르고, 결과는 판 끝 요청 형식(zod)을 거쳐 evalTower로.
// SIM_N(기본 1) = 시작 층·모드 조합마다 판 수. 수천 판: SIM_N=40 npx vitest run game/rpg/cards/towerSweep.test.ts

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

/** 옥상 화면(rooftopStage SPARK_CAP)이 우두머리 층에 따로 흩뿌리는 불꽃 — 화면 쪽 값 그대로 */
const CLIENT_SPARKS = 8;

/**
 * 한 층에서 화면이 만들어 내는 몬스터 (처치 순서대로, extra = 계획 웨이브 밖에서 판 중에 나온 것).
 * fill = 판 중에 더 나오는 몫을 얼마나 채우나 (1 = 상한까지 다), over = 화면 상한의 몇 배까지 나온다고 치나
 * (지금 화면은 모두 총량 상한이라 1이 실제 — 2 이상은 「예상 못 한 누적」 가정)
 */
export function clientFloor(seed: number, start: number, f: number, rnd: () => number, fill: number, over = 1): { id: MonsterId; extra: boolean }[] {
  const plan = towerPlan(seed, f, start);
  const at = towerBlock(seed, start, f);
  const zone = HUNT_ZONES[at.zone];
  const visit = at.visit;
  const out: { id: MonsterId; extra: boolean }[] = [];
  const recent: MonsterId[] = [];
  const more = () => rnd() < fill;
  const X = (n: number) => Math.round(n * over);
  const kill = (id: MonsterId, minion: boolean, wave: (typeof plan)[number]) => {
    out.push({ id, extra: minion });
    const def = MONSTERS[id];
    // 분열 (HuntScene killMonster — 조각도 갈라지면 또)
    if (def.split) for (let i = 0; i < def.split.n; i++) kill(def.split.id, true, wave);
    // 엑셀 매크로 복사 (serverRoomStage — 복사본·졸개는 복사하지 않는다): 쓰러지기 전에 나온 것으로 친다
    if (id === "sv_excel_macro" && !minion) for (let i = 0; i < X(def.clones ?? 0); i++) if (more()) kill(id, true, wave);
    // 정예가 살아 있는 동안 불러들이는 것
    if (id === "rf_vane") for (let i = 0; i < X(rfVaneAdds(visit)); i++) if (more()) kill("rf_papers", true, wave);
    if (id === "cf_rice_cooker") for (let i = 0; i < X(cfRiceAdds(visit)); i++) if (more()) kill("cf_riceball", true, wave);
    if (id === "mt_agenda") for (const a of wave.adds ?? []) for (let i = 0; i < X(a.n); i++) if (more()) kill(a.id, true, wave);
    // 우두머리: Arena 소환 두 번 + 테마 화면 몫
    if (def.behavior === "boss") {
      for (let k = 0; k < X(2); k++) for (let i = 0; i < zone.summon.n; i++) if (more()) kill(zone.summon.id, true, wave);
      if (zone.id === "rf_rooftop") for (let i = 0; i < X(CLIENT_SPARKS); i++) if (more()) kill("rf_spark", true, wave);
      if (zone.id === "pk_parking") for (let i = 0; i < X(pkTowAdds(visit)); i++) if (more()) kill("pk_alarm_car", true, wave);
      if (zone.id === "cf_cafeteria") for (let i = 0; i < X(CF_SPECIAL_SERVERS); i++) if (more()) kill("cf_server", true, wave);
    }
    // 백업 테이프 (serverRoomStage onKill): 최근 쓰러진 셋을 되살린다, 되살린 것도 다시 줄에
    if (id === "sv_backup_tape") {
      const pick = recent.splice(-X(def.revive ?? 3));
      for (const r of pick) if (more()) kill(r, true, wave);
    } else if (revivable(id) && def.behavior !== "boss") {
      recent.push(id);
      if (recent.length > 8) recent.shift();
    }
  };
  for (const w of plan) for (const id of w.monsters) kill(id, false, w);
  return out;
}

/** slow = 약한 빌드: 층마다 제한 시간 가까이(60~118초) 걸리고, 판 중에 나온 소환·추가 몬스터는 못 잡고 쌓아 두다가 층 끝에 몰아 잡는다 */
type Sim = { start: number; climb: number; fast: boolean; fill: number; rerollP: number; prefer?: string[]; quit?: boolean; slow?: boolean; over?: number };

function runTower(seed: number, o: Sim): { result: HuntResult; power: number } {
  const rnd = seeded((seed * 2654435761) ^ (o.start * 97) ^ o.climb);
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
      else {
        const pref = o.prefer ? v.cards.findIndex((c) => (o.prefer as string[]).includes(c)) : -1;
        bridge.emit("rpg:cardPick", { slot: pref >= 0 ? pref : Math.floor(rnd() * v.cards.length) });
      }
    }
  };
  const kills: Partial<Record<MonsterId, number>> = {};
  let floorMs = 0;
  const kill = (id: MonsterId) => {
    kills[id] = (kills[id] ?? 0) + 1;
    cards.onKill(mon(id));
  };
  const top = o.start + o.climb;
  for (let f = o.start; ; f++) {
    now += 2200 + rnd() * 800;
    pump();
    const spawned = clientFloor(seed, o.start, f, rnd, o.fill, o.over ?? 1);
    // 약한 빌드: 계획 웨이브부터 겨우 잡고, 쌓인 소환·추가 몬스터는 층 끝에 몰아서
    const list = (o.slow ? [...spawned.filter((x) => !x.extra), ...spawned.filter((x) => x.extra)] : spawned).map((x) => x.id);
    const plan = towerPlan(seed, f, o.start);
    // 빠른 판: 웨이브가 열리자마자 다 잡는다 (층 최소 시간 + 1~4초). 보통: 15~50초 더. 약한 빌드: 60~118초 (제한 시간 90·120초 가까이)
    const floorSec = o.slow ? 60 + rnd() * (isBossFloor(f) ? 58 : 28) : floorMinSec(plan) + (o.fast ? 1 + rnd() * 3 : 15 + rnd() * 35);
    const end = f === top;
    const n = end ? Math.floor(list.length * rnd()) : list.length;
    for (let k = 0; k < n; k++) {
      now += (floorSec * 1000) / Math.max(1, list.length);
      kill(list[k]);
      pump();
    }
    if (end) {
      // 쓰러짐(불·독으로 한두 마리 더) 또는 Esc로 그만둠
      died = true;
      if (!o.quit && n < list.length && rnd() < 0.5) kill(list[n]);
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
  const power = cardPower(cards.counts);
  cards.destroy();
  return {
    power,
    result: { game: "hunt", durationMs: Math.round(now), kills, wavesCleared: 0, died: !o.quit, potionsUsed: {}, floors: cleared, floorMs: Math.round(floorMs), cards: cards.picks(), ...(o.quit ? { quit: true } : {}) },
  };
}

const clean = (v: TowerVerdict) => v.ok && !(v as { suspect?: string[] }).suspect;

/** 판 끝 요청 그대로 (zod) → evalTower. 서버 시간은 판 시간 + 요청 왕복(1.5~6초) */
function serverCheck(seed: number, start: number, r: HuntResult, gp: number, rnd: () => number) {
  const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result: r }).result as HuntResult;
  return evalTower({ seed, level: 50, start, ...(gp > 1 ? { gp } : {}), ...(runLevelBase(start) ? { rb: runLevelBase(start) } : {}) }, parsed, r.durationMs + 1500 + rnd() * 4500);
}

const STARTS = [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101, 151, 201, 251, 301, 351];
const PREFER = [
  undefined,
  ["afterparty", "politics", "intern", "promote", "chainline", "oneshot", "minutes"],
  ["minutes", "promote"],
  ["cc", "parallel", "circular", "raise", "quick", "urgent", "boards", "passion", "solo"],
  // 처치 속도 상한이 가장 빡빡한 쪽: 지키는 카드만 (카드 배율이 낮다)
  ["health", "badge", "wfh", "halfday", "snack", "coffee", "walk", "commute", "mix", "overtime", "leave"],
];

export function sweep(N: number) {
  const bad: Record<string, number> = {};
  const ex: string[] = [];
  // 「예상 못 한 누적」 가정 판 (화면 상한의 세 배): 의심 판은 되어도 거절은 없어야 한다
  const overflow = { n: 0, suspect: 0, rejected: 0, ex: [] as string[] };
  let n = 0;
  let maxRatio = 0;
  const themes = new Set<string>();
  for (let s = 1; s <= N; s++)
    for (const start of STARTS)
      for (const mode of [0, 1, 2, 3, 4, 5]) {
        const seed = (s * 104729 + start * 31 + mode * 7) >>> 0;
        // 30~60층 오르기 (시작 층이 높으면 400층 상한 안에서), 가끔 아주 긴 등반
        const long = s % 7 === 0 && mode === 1;
        // 가끔 아주 짧은 판 (카드가 적을 때 처치 속도 상한)
        const short = s % 11 === 0 && mode !== 1;
        const climb = Math.min(399 - start, long ? 120 + (s % 80) : short ? 1 + (s % 5) : 30 + ((s * 13 + mode * 7 + start) % 31));
        const fast = mode % 2 === 1;
        const slow = mode >= 4;
        const o: Sim = {
          start,
          climb,
          fast: fast && !slow,
          fill: mode === 2 || mode === 3 ? 0.6 : 1,
          rerollP: s % 2 ? 0.4 : 0,
          prefer: slow ? PREFER[4] : PREFER[(s + mode) % PREFER.length],
          quit: s % 5 === 0,
          slow,
          over: mode === 5 ? 3 : 1,
        };
        const rnd = seeded(seed ^ 0x5157);
        for (let f = start; f <= start + climb; f++) themes.add(towerBlock(seed, start, f).zone);
        const { result, power } = runTower(seed, o);
        // gp 1~3.5 (장비 힘 — 1이 가장 빡빡하다)
        const gp = slow ? 1 : [1, 1.5, 2.4, 3.5][(s + mode) % 4];
        const v = serverCheck(seed, start, result, gp, rnd);
        const total = Object.values(result.kills).reduce((a, b) => a + (b ?? 0), 0);
        maxRatio = Math.max(maxRatio, total / (result.durationMs / 1000) / (5.7 * power * gp));
        if (mode === 5) {
          overflow.n++;
          if (!v.ok) {
            overflow.rejected++;
            if (overflow.ex.length < 5) overflow.ex.push(`seed ${seed} start ${start}: ${v.message} ${v.why ?? ""}`);
          } else if (v.suspect) overflow.suspect++;
          continue;
        }
        n++;
        if (!clean(v)) {
          const k = v.ok ? `의심:${(v.suspect ?? []).map((x) => x.split(":")[0] + ":" + x.split(":")[1]).join(",")}` : `거절:${v.message}`;
          bad[k] = (bad[k] ?? 0) + 1;
          if (ex.length < 12) ex.push(`seed ${seed} start ${start} climb ${climb} floors ${result.floors} fast ${fast} fill ${o.fill}: ${v.ok ? v.suspect?.join(" | ") : `${v.message} ${v.why ?? ""}`}`);
        }
      }
  return { n, bad, ex, maxRatio, themes, overflow };
}

describe("야근 빌딩 전수 시뮬레이션 (화면이 만드는 몬스터 → 판 끝 요청 → evalTower)", () => {
  it("모든 테마·시작 층 1~351·30~60층(가끔 120층 넘게·1~5층)·빠른/보통/약한 빌드(소환 쌓아 두다 몰아 잡기)·쓰러짐/그만둠·gp 1~3.5: 정상 판은 모두 깨끗이 통과, 상한 세 배 누적도 거절 없음", () => {
    const N = Number(process.env.SIM_N ?? 1);
    const { n, bad, ex, maxRatio, themes, overflow } = sweep(N);
    console.log("TOWER SWEEP", n, "runs", JSON.stringify(bad), `max kill-rate ratio ${maxRatio.toFixed(3)}`, "\n" + ex.join("\n"));
    console.log("TOWER OVERFLOW", overflow.n, "runs", `suspect ${overflow.suspect}`, `rejected ${overflow.rejected}`, "\n" + overflow.ex.join("\n"));
    expect(themes.size).toBe(6);
    expect(bad, ex.join("\n")).toEqual({});
    // 화면 상한의 세 배까지 쌓였다 잡혀도(약한 빌드·긴 층) 판은 버리지 않는다 — 의심 판으로만
    expect(overflow.rejected, overflow.ex.join("\n")).toBe(0);
    expect(overflow.n).toBeGreaterThan(0);
    // 처치 속도 상한 여유 (가장 빠른 판도 상한의 절반 아래)
    expect(maxRatio).toBeLessThan(0.5);
  }, 600_000);

  it("끝까지: 1층·201층에서 400층 상한까지 오른 판 (테마 순환·저주 전부·층 배율 1.06^400)도 깨끗이 통과", () => {
    for (const [seed, start] of [
      [31337, 1],
      [4242, 201],
    ] as const) {
      const { result } = runTower(seed, { start, climb: 400 - start, fast: true, fill: 1, rerollP: 0.3, prefer: PREFER[4] });
      expect(result.floors).toBe(400 - start);
      const v = serverCheck(seed, start, result, 1, seeded(seed));
      expect(clean(v), JSON.stringify(v).slice(0, 400)).toBe(true);
      expect(v).toMatchObject({ ok: true, best: 399 });
    }
  }, 120_000);

  it("운영 로그 판 재현: 21층 시작·47층 깸(68층에서 끝)·1,144초·gp 1.66 — 옥상 우두머리 층 불꽃 16마리(소환 8 + 화면 8)까지 다 잡아도 깨끗이 통과", () => {
    // 21~67층 사이에 옥상 우두머리 층이 둘 이상 있는 판
    const rfBoss = (seed: number) => Array.from({ length: 47 }, (_, i) => 21 + i).filter((f) => isBossFloor(f) && towerBlock(seed, 21, f).zone === "rf_rooftop");
    let seed = 1;
    while (rfBoss(seed).length < 2) seed++;
    const rnd = seeded(seed);
    for (const f of rfBoss(seed)) expect(clientFloor(seed, 21, f, rnd, 1).filter((x) => x.id === "rf_spark").length).toBe(16);
    const { result } = runTower(seed, { start: 21, climb: 47, fast: true, fill: 1, rerollP: 0.3, prefer: PREFER[1] });
    expect(result.floors).toBe(47);
    // 운영 로그의 시간·장비 힘 그대로
    const r = { ...result, durationMs: 1_144_113, floorMs: 1_140_000 };
    expect(result.kills.rf_spark).toBeGreaterThanOrEqual(32);
    const total = Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeGreaterThan(1000);
    const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result: r }).result as HuntResult;
    const v = evalTower({ seed, level: 50, start: 21, gp: 1.66, rb: runLevelBase(21) }, parsed, 1_338_169);
    expect(clean(v), JSON.stringify(v)).toBe(true);
    expect(v).toMatchObject({ ok: true, floors: 47, best: 67 });
  });
});

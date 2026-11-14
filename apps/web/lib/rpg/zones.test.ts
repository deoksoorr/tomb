import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFS, GEAR, HUNT_ZONES, MONSTER_IDS, MONSTERS, timeLimitSec, ZONE_IDS, ZONES, zoneFor, zonesOf } from "./catalog";
import { monsterStats } from "./formulas";
import { BOSS_RAGES, huntPlan, huntSpawnable, huntTotal } from "./plan";
import { evaluate, huntBossDrop, killRateCeiling, type TicketInfo } from "./rewards";
import { signTicket, verifyTicket } from "./ticket";

// 40번 테마 사냥터: 카탈로그·출현 계획·서버 검증이 모든 사냥터·시드에서 맞물리는지

const T: TicketInfo = { game: "hunt", difficulty: "easy", seed: 1, level: 1, st: { agi: 1, dex: 1, luk: 1 } };
const hunt = (over: object) => ({ game: "hunt" as const, durationMs: 60_000, kills: {}, wavesCleared: 0, died: false, potionsUsed: {}, ...over });

describe("40번 테마 사냥터 카탈로그", () => {
  it("8곳 이상, 난이도마다 2곳 이상, 열리는 레벨은 차례로 오른다", () => {
    expect(ZONE_IDS.length).toBeGreaterThanOrEqual(8);
    for (const d of DIFFICULTIES) {
      const zs = zonesOf(d);
      expect(zs.length, d).toBeGreaterThanOrEqual(2);
      // 난이도마다 첫 사냥터 = 예전 사냥터 (예전 API·저장된 선택)
      expect(zs[0]).toBe(ZONES[d]);
    }
    const levels = ZONE_IDS.map((id) => HUNT_ZONES[id].unlockLevel);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(new Set(levels).size).toBe(levels.length);
    expect(HUNT_ZONES["meeting-room"].unlockLevel).toBe(1);
  });

  it("예전 네 곳의 id·이름은 그대로 (함께 사냥 방 이름 hunt:{slug}:{difficulty})", () => {
    expect(ZONES.easy).toMatchObject({ id: "meeting-room", slug: "meeting-room", name: "월요일 회의실" });
    expect(ZONES.normal).toMatchObject({ id: "legacy-forest", slug: "legacy-forest", name: "야근 사무실" });
    expect(ZONES.hard).toMatchObject({ id: "deadline-swamp", slug: "deadline-swamp", name: "결재 늪" });
    expect(ZONES.hell).toMatchObject({ id: "burnout-abyss", slug: "burnout-abyss", name: "회식 3차" });
    for (const id of ZONE_IDS) expect(id).toMatch(/^[a-z0-9_-]{1,24}$/);
  });

  it("사냥터마다 몬스터 3종 이상 + 우두머리, 졸개·잘 나오는 장비가 맞는 범위", () => {
    for (const id of ZONE_IDS) {
      const z = HUNT_ZONES[id];
      expect(new Set(z.pool).size, id).toBeGreaterThanOrEqual(3);
      expect(MONSTERS[z.boss], id).toBeDefined();
      expect(z.pool).not.toContain(z.boss);
      expect(MONSTERS[z.summon.id]).toBeDefined();
      expect(z.summon.n).toBeGreaterThan(0);
      expect(z.gimmick.name.length).toBeGreaterThan(1);
      const D = DIFFS[z.difficulty];
      for (const g of z.favor) {
        const def = GEAR.find((x) => x.id === g);
        expect(def, `${id} ${g}`).toBeDefined();
        expect(def!.reqLevel <= D.dropMaxLevel && def!.reqLevel >= D.dropMaxLevel - 20, `${id} ${g} 드롭 범위`).toBe(true);
      }
    }
    // 새 사냥터는 우두머리가 모두 다르다
    const bosses = ZONE_IDS.map((id) => HUNT_ZONES[id].boss);
    expect(new Set(bosses).size).toBeGreaterThanOrEqual(ZONE_IDS.length - 1);
    // 모든 몬스터가 어딘가에 나온다 (조각은 갈라져서)
    const used = new Set<string>();
    for (const id of ZONE_IDS) {
      const z = HUNT_ZONES[id];
      for (const m of [...z.pool, z.boss, z.summon.id]) {
        used.add(m);
        const sp = MONSTERS[m].split;
        if (sp) used.add(sp.id);
      }
    }
    expect(MONSTER_IDS.filter((m) => !used.has(m))).toEqual([]);
  });

  it("zoneFor: 난이도가 다른 사냥터 id나 모르는 id는 그 난이도의 기본 사냥터", () => {
    expect(zoneFor("easy", "gym").id).toBe("gym");
    expect(zoneFor("easy", "library").id).toBe("meeting-room");
    expect(zoneFor("hell", "없는곳").id).toBe("burnout-abyss");
    expect(zoneFor("normal").id).toBe("legacy-forest");
    expect(timeLimitSec("hunt", "hard", "homework-desert")).toBe(HUNT_ZONES["homework-desert"].timeLimitSec);
  });
});

describe("40번 출현 계획·서버 검증 (사냥터마다)", () => {
  it("마지막 웨이브는 그 사냥터 우두머리, 졸개는 화날 때마다 n마리까지 출현 상한에 든다", () => {
    for (const id of ZONE_IDS) {
      const z = HUNT_ZONES[id];
      const p = huntPlan(11, z.difficulty, id);
      expect(p).toHaveLength(z.waves);
      expect(p.at(-1)!.monsters[0]).toBe(z.boss);
      expect(p.at(-1)!.summon).toEqual(z.summon);
      for (const w of p.slice(0, -1)) for (const m of w.monsters) expect(z.pool).toContain(m);
      const all = huntSpawnable(p, Infinity);
      const planned = p.flatMap((w) => w.monsters).filter((m) => m === z.summon.id).length;
      expect(all[z.summon.id]).toBeGreaterThanOrEqual(planned + z.summon.n * BOSS_RAGES);
    }
    // 같은 시드라도 사냥터가 다르면 다른 계획, 사냥터 id 없이 부르면 기본 사냥터
    expect(huntPlan(5, "easy", "gym")).not.toEqual(huntPlan(5, "easy", "subway"));
    expect(huntPlan(5, "easy")).toEqual(huntPlan(5, "easy", "meeting-room"));
  });

  it("정직한 판은 거절하지 않는다: 모든 사냥터·시드, 열리는 레벨로 시간 절반에 다 잡아도 (졸개·조각 포함)", () => {
    for (const id of ZONE_IDS) {
      const z = HUNT_ZONES[id];
      for (let seed = 1; seed <= 40; seed++) {
        const p = huntPlan(seed, z.difficulty, id);
        const kills = huntSpawnable(p, Infinity) as Record<string, number>;
        const ms = (z.timeLimitSec * 1000) / 2;
        const t = { ...T, difficulty: z.difficulty, seed, level: z.unlockLevel, zone: id };
        const v = evaluate(t, hunt({ kills, wavesCleared: p.length, durationMs: ms }), ms + 1000);
        expect(v.ok, `${id} seed ${seed}`).toBe(true);
        // 처치 수 상한에도 여유가 있다 (1.2배)
        const total = Object.values(kills).reduce((a, b) => a + b, 0);
        expect(total * 1.2, `${id} seed ${seed} 처치 상한`).toBeLessThan(3 + (ms / 1000) * killRateCeiling(z.difficulty, z.unlockLevel));
      }
    }
  });

  it("그 사냥터에 없는 몬스터·우두머리를 잡았다고 하면 거절", () => {
    const p = huntPlan(3, "easy", "subway");
    const kills = huntSpawnable(p, Infinity) as Record<string, number>;
    const ok = evaluate({ ...T, seed: 3, zone: "subway" }, hunt({ kills, wavesCleared: p.length, durationMs: 100_000 }), 101_000);
    expect(ok.ok).toBe(true);
    // 같은 결과를 다른 사냥터 티켓으로 내면 (그곳엔 지하철 몬스터가 없다)
    expect(evaluate({ ...T, seed: 3, zone: "gym" }, hunt({ kills, wavesCleared: p.length, durationMs: 100_000 }), 101_000).ok).toBe(false);
    // 졸개를 화날 때 몫보다 많이
    const greedy = { ...kills, [HUNT_ZONES.subway.summon.id]: (kills[HUNT_ZONES.subway.summon.id] ?? 0) + 1 };
    expect(evaluate({ ...T, seed: 3, zone: "subway" }, hunt({ kills: greedy, wavesCleared: p.length, durationMs: 100_000 }), 101_000).ok).toBe(false);
  });

  it("보상은 난이도(티어)를 따라 오르고, 같은 난이도에서 뒤에 열리는 곳이 조금 더", () => {
    const clear = (id: (typeof ZONE_IDS)[number], seed = 9) => {
      const z = HUNT_ZONES[id];
      const p = huntPlan(seed, z.difficulty, id);
      const kills = huntSpawnable(p, Infinity) as Record<string, number>;
      const ms = (z.timeLimitSec * 1000) / 2;
      const v = evaluate({ ...T, difficulty: z.difficulty, seed, level: z.unlockLevel, zone: id }, hunt({ kills, wavesCleared: p.length, durationMs: ms }), ms + 1000);
      if (!v.ok) throw new Error(id);
      return v;
    };
    const firstOf = DIFFICULTIES.map((d) => clear(ZONES[d].id));
    for (let i = 1; i < firstOf.length; i++) {
      expect(firstOf[i].points).toBeGreaterThan(firstOf[i - 1].points);
      expect(firstOf[i].score).toBeGreaterThan(firstOf[i - 1].score);
    }
    for (const d of DIFFICULTIES) {
      const zs = zonesOf(d);
      expect(clear(zs.at(-1)!.id).points).toBeGreaterThan(clear(zs[0].id).points);
    }
    expect(monsterStats("rush_commuter", "easy", 1.15).maxHp).toBeGreaterThan(monsterStats("rush_commuter", "easy").maxHp);
    // 11/12: 우두머리 장비는 확률 — 시드 몇 개 중엔 나온다
    expect(Array.from({ length: 40 }, (_, i) => clear("gym", i + 1)).some((v) => v.drops.some((x) => x.kind === "gear"))).toBe(true);
  });

  it("런 티켓: 사냥터 id는 그 난이도의 것만", async () => {
    const claims = { n: "n", a: "a", g: "hunt" as const, d: "easy" as const, t: 1, s: 1, lv: 1, st: { agi: 1, dex: 1, luk: 1 }, z: "gym" as const };
    expect(await verifyTicket("k", await signTicket("k", claims))).toEqual(claims);
    expect(await verifyTicket("k", await signTicket("k", { ...claims, z: "library" as never }))).toBeNull();
    expect(await verifyTicket("k", await signTicket("k", { ...claims, z: "../x" as never }))).toBeNull();
  });

  it("11/15 지옥 40~50대 사냥터: Lv.42·48, 분열 조각·졸개까지 상한에 들고, 50레벨 EXP는 그 사냥터 기준", () => {
    const hell = zonesOf("hell").map((z) => z.id);
    expect(hell).toEqual(["burnout-abyss", "new-year-eve", "quarter-close", "layoff-day"]);
    expect(HUNT_ZONES["quarter-close"]).toMatchObject({ unlockLevel: 42, power: 1.3, waves: 7, timeLimitSec: 240 });
    expect(HUNT_ZONES["layoff-day"]).toMatchObject({ unlockLevel: 48, power: 1.45, waves: 7, timeLimitSec: 240 });
    // 결재 대기 서류철은 쓰러지면 반려된 서류 3장 → 출현 상한도 3배로 센다
    for (let seed = 1; seed <= 20; seed++) {
      const p = huntPlan(seed, "hell", "quarter-close");
      const planned = p.flatMap((w) => w.monsters);
      const can = huntSpawnable(p, Infinity);
      expect(can.pending_sheet ?? 0).toBe(planned.filter((m) => m === "pending_binder").length * 3);
      expect(can.drowsiness ?? 0).toBe(planned.filter((m) => m === "drowsiness").length + 3 * BOSS_RAGES);
      expect(planned).not.toContain("pending_sheet");
    }
    // 같은 판을 50레벨로: 새 사냥터는 EXP 그대로, 회식 3차는 10% (예전 지옥 예외 50%는 없앴다)
    const run = (id: (typeof ZONE_IDS)[number], level: number) => {
      const z = HUNT_ZONES[id];
      const p = huntPlan(5, z.difficulty, id);
      const kills = huntSpawnable(p, Infinity) as Record<string, number>;
      const ms = (z.timeLimitSec * 1000) / 2;
      const v = evaluate({ ...T, difficulty: z.difficulty, seed: 5, level, zone: id }, hunt({ kills, wavesCleared: p.length, durationMs: ms }), ms + 1000);
      if (!v.ok) throw new Error(`${id} ${level}`);
      return v;
    };
    for (const id of ["quarter-close", "layoff-day"] as const) expect(run(id, 50).exp).toBe(run(id, HUNT_ZONES[id].unlockLevel).exp);
    expect(run("burnout-abyss", 50).exp).toBe(Math.round(run("burnout-abyss", 30).exp * 0.1));
    // 우두머리를 잡으면 우두머리 드롭 몫을 굴린다 (시드 몇 개 중엔 장비가 나온다)
    expect(Array.from({ length: 60 }, (_, i) => huntBossDrop({ game: "hunt", difficulty: "hell", seed: i + 1, zone: "layoff-day" })).some((d) => d?.kind === "gear")).toBe(true);
  });

  it("계획 크기: 최대 동시 출현 20마리 이하 (화면 성능)", () => {
    for (const id of ZONE_IDS) {
      const z = HUNT_ZONES[id];
      const p = huntPlan(4, z.difficulty, id);
      expect(Math.max(...p.map((w) => w.monsters.length))).toBeLessThanOrEqual(20);
      expect(huntTotal(p)).toBeGreaterThan(10);
    }
  });
});

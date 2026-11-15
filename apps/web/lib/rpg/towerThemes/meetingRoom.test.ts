import { describe, expect, it } from "vitest";
import { MONSTERS, type MonsterId } from "../catalog";
import { huntSpawnable } from "../plan";
import { killRateCeiling } from "../rewards";
import { evalTower, floorMinSec, towerBlock, towerPlan, towerZone } from "../tower";
import type { HuntResult } from "../types";
import { clockText, meetingClock, meetingTime, MT_ELITE, MT_MID, MT_POOL, MT_ROOM_MIN, MT_ZONE, mtNextSide, mtShrink, mtSlack, type MtRoom } from "./meetingRoom";
import { MT_MAIL_CAP, mtAgendaAdds } from "./meetingRoomPlan";

// 11/15 끝없는 회의실: 층→테마, 층 계획(참조 메일 상한·무리·중간 우두머리·안건 추가 adds), 서버 검증, 방이 좁아지는 경계, 벽시계

// 11/15 테마 순서가 판마다 무작위 → 1층부터 오르는 판에서 회의실 층을 시드로 모은다 (정예가 늘 섞이는 100층 웨이브는 우두머리 층뿐)
type MtFloor = { seed: number; f: number; visit: number; pos: number };
function mtFloors(seed: number): MtFloor[] {
  const out: MtFloor[] = [];
  for (let f = 1; f <= 100; f++) {
    const at = towerBlock(seed, 1, f);
    if (at.zone === MT_ZONE) out.push({ seed, f, visit: at.visit, pos: at.pos });
  }
  return out;
}
const allMt = (n: number) => Array.from({ length: n }, (_, i) => mtFloors(i + 1)).flat();
const plan = (x: MtFloor) => towerPlan(x.seed, x.f, 1);

describe("끝없는 회의실: 층과 테마", () => {
  it("판마다 회의실 블록이 다섯 층씩, 우두머리 층은 회의 주재자, 다시 올 때마다 visit이 하나씩", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const fl = mtFloors(seed);
      expect(fl.length % 5).toBe(0);
      expect(fl.length).toBeGreaterThanOrEqual(5);
      for (let i = 0; i < fl.length; i += 5) {
        expect(fl.slice(i, i + 5).map((x) => x.pos)).toEqual([0, 1, 2, 3, 4]);
        expect(fl[i].visit).toBe(i / 5);
        expect(towerZone(seed, 1, fl[i + 4].f).boss).toBe("mt_chair");
      }
    }
  });

  it("몬스터는 모두 새것 (mt_), 일반 10종 · 정예 · 중간 우두머리 · 우두머리", () => {
    expect(MT_POOL).toHaveLength(10);
    for (const id of [...MT_POOL, MT_ELITE, MT_MID, "mt_chair", "mt_attendee", "mt_cc_reply", "mt_cc_fwd"] as MonsterId[]) {
      expect(id.startsWith("mt_")).toBe(true);
      expect(MONSTERS[id]).toBeDefined();
    }
    // 생김새가 겹치지 않게: 크기·색 조합이 모두 다르다
    const looks = new Set(Object.values(MONSTERS).filter((m) => m.id.startsWith("mt_")).map((m) => `${m.size}-${m.color}-${m.accent}`));
    expect(looks.size).toBe(16);
  });
});

describe("끝없는 회의실: 층 계획", () => {
  it("참조 메일은 한 층에 셋까지·무리로 안 나오고, 무리는 몰려다니는 것만", () => {
    for (const x of allMt(120))
      {
        const p = plan(x);
        const mails = p.flatMap((w) => w.monsters).filter((m) => m === "mt_cc_mail").length;
        expect(mails).toBeLessThanOrEqual(MT_MAIL_CAP);
        for (const w of p) if (w.pack) expect(["mt_chat_ping", "mt_no_opinion", "mt_chair_intern", "mt_coffee"]).toContain(w.monsters[w.monsters.length - 1]);
      }
  });

  it("블록 3번째 층은 둘째 웨이브에 회의록 담당이 정예로, 우두머리 층은 회의 주재자", () => {
    for (const x of allMt(40)) {
      if (x.pos === 2) {
        const w = plan(x)[1];
        expect(w.elite).toBeDefined();
        expect(w.monsters[w.elite!]).toBe(MT_MID);
      }
      if (x.pos === 4) {
        const last = plan(x).at(-1)!;
        expect(last.boss).toBe(true);
        expect(last.monsters[0]).toBe("mt_chair");
        expect(last.summon).toEqual({ id: "mt_attendee", n: 4 });
      }
    }
  });

  it("안건 추가가 있는 웨이브는 불러들이는 몫(adds)이 있고, 네 번째로 온 밤샘 회의부터는 보통 층마다 나온다", () => {
    let seen = 0;
    for (const x of allMt(200)) {
      if (x.pos === 2 || x.pos === 4) continue;
      for (const w of plan(x)) {
        if (w.elite === undefined || w.monsters[w.elite] !== MT_ELITE) {
          expect(w.adds).toBeUndefined();
          continue;
        }
        seen++;
        expect(w.adds!.reduce((n, a) => n + a.n, 0)).toBe(mtAgendaAdds(x.visit));
        for (const a of w.adds!) expect(a.id).not.toBe("mt_cc_mail");
      }
    }
    expect(seen).toBeGreaterThan(50);
    const late = allMt(600).filter((x) => x.visit >= 3 && x.pos !== 2 && x.pos !== 4);
    expect(late.length).toBeGreaterThan(0);
    for (const x of late) {
      const w = plan(x)[1];
      expect(w.monsters[w.elite!]).toBe(MT_ELITE);
      expect(w.adds!.reduce((n, a) => n + a.n, 0)).toBe(8);
    }
  });

  it("출현 상한: 참조 메일 1통 = 회신 2 + 전달 4, 안건 추가 몫·졸개까지 센다", () => {
    for (const x of allMt(60))
      {
        const p = plan(x);
        const can = huntSpawnable(p, Infinity);
        const mails = p.flatMap((w) => w.monsters).filter((m) => m === "mt_cc_mail").length;
        const adds = p.flatMap((w) => w.adds ?? []);
        const addN = (id: MonsterId) => adds.filter((a) => a.id === id).reduce((n, a) => n + a.n, 0);
        expect(can.mt_cc_reply ?? 0).toBe(mails * 2);
        expect(can.mt_cc_fwd ?? 0).toBe(mails * 4);
        for (const id of MT_POOL.filter((x) => x !== "mt_cc_mail")) expect(can[id] ?? 0).toBe(p.flatMap((w) => w.monsters).filter((m) => m === id).length + addN(id));
        if (x.pos === 4) expect(can.mt_attendee).toBe(8);
      }
  });

  it("두 층이 같은 구성인 일이 드물고, 같은 자리(몇 번째로 왔나·블록 안 몇 번째 층)면 몬스터 종류는 같다", () => {
    const lineups = new Set<string>();
    const xs = allMt(20).filter((x) => x.pos < 4);
    for (const x of xs) lineups.add(JSON.stringify(plan(x).map((w) => w.monsters)));
    // 11/15 몬스터 종류는 층 순서표로 정해져서, 마릿수·순서만 판마다 다르다
    expect(lineups.size).toBeGreaterThan(xs.length * 0.85);
    const rosters = new Set<string>();
    for (const x of allMt(40).filter((y) => y.visit === 0 && y.pos === 1)) rosters.add([...new Set(plan(x).flatMap((w) => w.monsters))].sort().join());
    expect(rosters.size).toBe(1);
  });
});

/** start층부터 floors층을 깬 결과 (계획·조각·불려 온 몬스터를 모두 잡았다) */
function climbAll(seed: number, start: number, floors: number): { r: HuntResult; minSec: number } {
  const kills: Partial<Record<MonsterId, number>> = {};
  let minSec = 0;
  for (let i = 0; i < floors; i++) {
    const p = towerPlan(seed, start + i, start);
    minSec += floorMinSec(p);
    for (const [id, n] of Object.entries(huntSpawnable(p, Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
  }
  const ms = Math.round(minSec * 1000) + 1500;
  return { r: { game: "hunt", durationMs: ms, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: ms }, minSec };
}

describe("끝없는 회의실: 서버 검증", () => {
  it("조각·불려 온 몬스터까지 다 잡고 최소 시간에 오른 판도 통과한다 (Lv.50)", () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const start of [1, 11]) {
        const { r } = climbAll(seed, start, 10);
        const v = evalTower({ seed, level: 50, start }, r, r.durationMs + 500);
        expect(v.ok, `seed ${seed} start ${start}`).toBe(true);
      }
  });

  it("회의실 한 층의 처치 수도 최소 시간 안에서 처치 속도 상한 아래", () => {
    for (const x of allMt(200))
      {
        const p = plan(x);
        const total = Object.values(huntSpawnable(p, Infinity)).reduce((a, b) => a + (b ?? 0), 0);
        expect(total).toBeLessThanOrEqual(3 + floorMinSec(p) * killRateCeiling("hell", 50));
      }
  });

  it("나올 수 없는 만큼 잡았다고 하면 거절 (전달 메일 한 통 더)", () => {
    // 첫 블록이 회의실인 판 (1층부터 참조 메일이 나온다)
    let seed = 7;
    while (towerZone(seed, 1, 1).id !== MT_ZONE) seed++;
    const { r } = climbAll(seed, 1, 10);
    const fwd = r.kills.mt_cc_fwd ?? 0;
    expect(fwd).toBeGreaterThan(0);
    const cheat = { ...r, kills: { ...r.kills, mt_cc_fwd: fwd + 4 + (huntSpawnable(towerPlan(seed, 11, 1), Infinity).mt_cc_fwd ?? 0) } };
    expect(evalTower({ seed, level: 50, start: 1 }, cheat, r.durationMs + 500).ok).toBe(false);
  });
});

describe("회의 연장: 방이 좁아지는 경계", () => {
  const full: MtRoom = { x0: 10, y0: 54, x1: 438, y1: 286 };
  it("어느 쪽으로 몇 번 밀려와도 최소 크기 아래로는 안 간다", () => {
    for (let seed = 0; seed < 50; seed++) {
      let room = full;
      let r = seed * 0.6180339;
      for (let k = 0; k < 40; k++) {
        r = (r + 0.6180339) % 1;
        const side = mtNextSide(room, full, r);
        if (!side) break;
        room = mtShrink(room, side, 22 + (k % 3) * 8);
        expect(room.x1 - room.x0).toBeGreaterThanOrEqual(MT_ROOM_MIN.w);
        expect(room.y1 - room.y0).toBeGreaterThanOrEqual(MT_ROOM_MIN.h);
        expect(room.x0).toBeGreaterThanOrEqual(full.x0);
        expect(room.y1).toBeLessThanOrEqual(full.y1);
      }
      // 다 좁아지면 더 고를 쪽이 없다
      expect(mtNextSide(room, full, 0.5)).toBeNull();
      expect(room.x1 - room.x0 - MT_ROOM_MIN.w).toBeLessThan(6);
      expect(room.y1 - room.y0 - MT_ROOM_MIN.h).toBeLessThan(6);
    }
  });

  it("한쪽만 먹지 않는다 (덜 들어온 쪽 먼저)", () => {
    let room = full;
    room = mtShrink(room, "left", 40);
    for (let i = 0; i < 10; i++) expect(mtNextSide(room, full, i / 10)).not.toBe("left");
    expect(mtSlack(room, "top")).toBe(full.y1 - full.y0 - MT_ROOM_MIN.h);
  });
});

describe("벽시계", () => {
  it("처음 온 블록 첫 층 17:00부터 층마다 25분 — 다시 올 때마다 다른 때 (노을 → 야근 → 새벽 → 아침 → 다음 날)", () => {
    expect(clockText(meetingClock(0, 0))).toBe("17:00");
    expect(clockText(meetingClock(4, 0))).toBe("18:40");
    expect(meetingTime(meetingClock(0, 0))).toBe("sunset");
    expect(meetingTime(meetingClock(0, 1))).toBe("night");
    expect(meetingTime(meetingClock(0, 2))).toBe("dawn");
    expect(meetingTime(meetingClock(0, 3))).toBe("sunrise");
    expect(meetingTime(meetingClock(0, 4))).toBe("day");
  });
});

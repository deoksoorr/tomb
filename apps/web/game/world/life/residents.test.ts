import { MAP_HEIGHT, MAP_WIDTH, SEATS, ZONES } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { RESIDENTS_MAX } from "@/lib/residents";
import { walkableGrid, WALK, inWater, inWaterBody, LANDMARKS, PLAZA_FIRE } from "../layout";
import { critterGrid, restable } from "./critterSim";
import { pickLine, RESIDENTS, type LineContext } from "./residentData";
import { ResidentSim, residentSpots, restActOf, swimSites } from "./residentSim";

// 돌아다니는 마을 주민: 결정성(같은 채널·시각 = 같은 자리), 걷기 가능 영역, 걷기 위주 비율, 수영(물속에서만), 보기에만 앉기(사람이 앉으면 비켜 섬), 대사 고르기

const T0 = Date.UTC(2026, 10, 13, 3, 0, 0);

describe("resident roster", () => {
  it("has 15 residents (= admin max) with unique ids and 5~8 lines each", () => {
    expect(RESIDENTS.length).toBe(RESIDENTS_MAX);
    expect(new Set(RESIDENTS.map((r) => r.id)).size).toBe(RESIDENTS.length);
    for (const r of RESIDENTS) {
      expect(r.lines.length, r.id).toBeGreaterThanOrEqual(5);
      expect(r.lines.length, r.id).toBeLessThanOrEqual(8);
      expect(
        r.lines.some((l) => !l.when),
        r.id,
      ).toBe(true);
    }
    // 성향이 조금씩 다르다 (산책·수영·모닥불)
    for (const taste of ["walk", "swim", "fire"]) expect(RESIDENTS.some((r) => r.taste === taste)).toBe(true);
  });

  it("every resident has several rest spots on open dry ground, including a seat", () => {
    const g = critterGrid();
    for (const r of RESIDENTS) {
      const spots = residentSpots(r, g);
      expect(spots.length, r.id).toBeGreaterThanOrEqual(3);
      expect(
        spots.some((s) => s.perch),
        r.id,
      ).toBe(true);
      for (const s of spots) expect(restable(g, s.x, s.y), `${r.id} ${s.x},${s.y}`).toBe(true);
    }
  });
});

describe("resident simulation", () => {
  it("is deterministic: two browsers asking in different orders agree", () => {
    RESIDENTS.forEach((def, i) => {
      const a = new ResidentSim(def, i, 2);
      const b = new ResidentSim(def, i, 2);
      const times = Array.from({ length: 40 }, (_, k) => T0 + k * 6_133);
      const ra = times.map((t) => ({ ...a.at(t) }));
      const rb = [...times]
        .reverse()
        .map((t) => ({ ...b.at(t) }))
        .reverse();
      expect(rb).toEqual(ra);
    });
  });

  it("different channels place residents differently", () => {
    const a = RESIDENTS.map((d, i) => new ResidentSim(d, i, 1).at(T0));
    const b = RESIDENTS.map((d, i) => new ResidentSim(d, i, 5).at(T0));
    expect(a.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).not.toEqual(b.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  });

  it("stays in the walkable area (or exactly on a seat) and really walks and sits", () => {
    const w = walkableGrid(8);
    const seatAt = new Set(SEATS.map((s) => `${s.x},${s.y}`));
    let walked = 0;
    let sat = 0;
    RESIDENTS.forEach((def, i) => {
      const sim = new ResidentSim(def, i, 3);
      for (let t = T0; t < T0 + 30 * 60_000; t += 900) {
        const p = sim.at(t);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(MAP_WIDTH);
        expect(p.y).toBeLessThan(MAP_HEIGHT);
        if (p.state === "sitChair") {
          expect(seatAt.has(`${p.x},${p.y}`)).toBe(true);
          sat++;
          continue;
        }
        // 헤엄은 물속에서만
        if (p.state === "swim") {
          expect(inWater(p.x, p.y), `${def.id} swim at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(true);
          continue;
        }
        const c = w.cells[Math.floor(p.y / 8) * w.cols + Math.floor(p.x / 8)];
        // 좌석 앞에서 자리로 옮겨 앉는 몇 걸음은 벤치 칸을 지난다
        if (c !== WALK.open && p.state === "walk" && SEATS.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= 26)) continue;
        // 물가에서 물로 걸어 들어가고 나오는 몇 걸음
        if (c !== WALK.open && p.state === "walk" && inWaterBody(p.x, p.y, 8)) continue;
        expect(c, `${def.id} ${p.state} at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(WALK.open);
        if (p.state === "walk" || p.state === "run") walked++;
      }
    });
    expect(walked).toBeGreaterThan(50);
    expect(sat).toBeGreaterThan(10);
  });

  it("mostly walks around (about 3/4 of the time), sits only a little, and sometimes runs and swims", () => {
    const n: Record<string, number> = {};
    let all = 0;
    for (const seed of [1, 6]) {
      RESIDENTS.forEach((def, i) => {
        const sim = new ResidentSim(def, i, seed);
        for (let t = T0; t < T0 + 40 * 60_000; t += 1_000) {
          const st = sim.at(t).state;
          n[st] = (n[st] ?? 0) + 1;
          all++;
        }
      });
    }
    const share = (...s: string[]) => s.reduce((a, k) => a + (n[k] ?? 0), 0) / all;
    expect(share("walk", "run")).toBeGreaterThan(0.68);
    expect(share("walk", "run")).toBeLessThan(0.88);
    expect(share("sitChair", "sitGround")).toBeGreaterThan(0.05);
    expect(share("sitChair", "sitGround")).toBeLessThan(0.2);
    expect(share("run")).toBeGreaterThan(0.01);
    expect(share("swim")).toBeGreaterThan(0.01);
  });

  it("sits briefly: one sitting lasts at most ~15s", () => {
    RESIDENTS.forEach((def, i) => {
      const sim = new ResidentSim(def, i, 2);
      let run = 0;
      for (let t = T0; t < T0 + 30 * 60_000; t += 500) {
        const st = sim.at(t).state;
        run = st === "sitChair" || st === "sitGround" ? run + 500 : 0;
        expect(run, def.id).toBeLessThanOrEqual(15_500);
      }
    });
  });

  it("swim sites: shore on dry open ground, every swim stroke inside water (river·lake·ponds)", () => {
    const g = critterGrid();
    const sites = swimSites(g);
    expect(sites.length).toBeGreaterThan(10);
    for (const s of sites) {
      expect(inWater(s.shore.x, s.shore.y)).toBe(false);
      expect(g.blocked(Math.floor(s.shore.x / 8), Math.floor(s.shore.y / 8))).toBe(false);
      for (let i = 1; i < s.loop.length; i++) {
        const a = s.loop[i - 1];
        const b = s.loop[i];
        for (let f = 0; f <= 1; f += 0.1) expect(inWater(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f), `${s.shore.x},${s.shore.y}`).toBe(true);
      }
    }
  });

  it("swimming is deterministic and swim-lovers swim more than fire-lovers", () => {
    const swims = (taste: string) => {
      let c = 0;
      RESIDENTS.forEach((def, i) => {
        if (def.taste !== taste) return;
        const sim = new ResidentSim(def, i, 9);
        for (let t = T0; t < T0 + 40 * 60_000; t += 1_000) if (sim.at(t).state === "swim") c++;
      });
      return c / RESIDENTS.filter((d) => d.taste === taste).length;
    };
    expect(swims("swim")).toBeGreaterThan(swims("fire") * 2);
    // 헤엄치는 시각을 찾아, 다른 순서로 묻는 두 브라우저가 같은 자리를 보는지
    const i = RESIDENTS.findIndex((d) => d.taste === "swim");
    const a = new ResidentSim(RESIDENTS[i], i, 9);
    const times: number[] = [];
    for (let t = T0; t < T0 + 60 * 60_000 && times.length < 12; t += 700) if (a.at(t).state === "swim") times.push(t);
    expect(times.length).toBeGreaterThan(0);
    const b = new ResidentSim(RESIDENTS[i], i, 9);
    const ra = times.map((t) => ({ ...a.at(t) }));
    const rb = [...times]
      .reverse()
      .map((t) => ({ ...b.at(t) }))
      .reverse();
    expect(rb).toEqual(ra);
    for (const p of ra) expect(inWater(p.x, p.y)).toBe(true);
  });

  it("gets up and steps aside when a person sits in that seat (seat is never claimed on the server)", () => {
    let checked = 0;
    RESIDENTS.forEach((def, i) => {
      const sim = new ResidentSim(def, i, 4);
      for (let t = T0; t < T0 + 20 * 60_000 && checked < 20; t += 1_000) {
        const free = { ...sim.at(t, () => false) };
        if (free.state !== "sitChair" || !free.seat) continue;
        const id = free.seat.id;
        const taken = sim.at(t, (s) => s === id);
        expect(taken.state).toBe("idle");
        expect(taken.seat).toBeNull();
        expect(Math.abs(taken.x - free.x)).toBeGreaterThan(8);
        expect(inWater(taken.x, taken.y)).toBe(false);
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(5);
  });

  it("spreads out over the whole map: few in the plaza, many different areas at any time", { timeout: 30_000 }, () => {
    // 사용자 제보 "주민들이 광장에만 몰려 있다": 어느 시각이든 광장(큰 모닥불 150px 안)엔 3명 이하, 주민들이 8곳 이상의 서로 다른 구역에 있다
    // 구역 = 가장 가까운 안내 장소(LANDMARKS)나 구역(ZONES, 광장은 큰 모닥불로 대신) 가운데
    const anchors = [...LANDMARKS.map((l) => ({ id: l.label, x: l.x, y: l.y })), ...ZONES.filter((z) => z.id !== "plaza").map((z) => ({ id: z.name, x: z.x + z.w / 2, y: z.y + z.h / 2 }))];
    const areaOf = (x: number, y: number) => anchors.reduce((b, a) => (Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b)).id;
    let home = 0;
    let all = 0;
    for (const seed of [1, 4, 7]) {
      const sims = RESIDENTS.map((d, i) => new ResidentSim(d, i, seed));
      for (let t = T0; t < T0 + 60 * 60_000; t += 20_000) {
        const ps = sims.map((s) => s.at(t));
        const inPlaza = ps.filter((p) => Math.hypot(p.x - PLAZA_FIRE.x, p.y - PLAZA_FIRE.y) <= 150).length;
        expect(inPlaza, `seed ${seed} t+${(t - T0) / 1000}s`).toBeLessThanOrEqual(3);
        expect(new Set(ps.map((p) => areaOf(p.x, p.y))).size, `seed ${seed} t+${(t - T0) / 1000}s`).toBeGreaterThanOrEqual(8);
        ps.forEach((p, i) => {
          const h = RESIDENTS[i].home;
          if (Math.hypot(p.x - h.x, p.y - h.y) <= h.r + 60) home++;
          all++;
        });
      }
    }
    // 대부분의 시간은 자기 집 구역 안 (가끔만 이웃 구역으로 산책)
    expect(home / all).toBeGreaterThan(0.7);
  });

  it("rest gestures are the same for everyone in a leg", () => {
    for (let leg = 0; leg < 50; leg++) expect(restActOf(1, 3, leg)).toEqual(restActOf(1, 3, leg));
    const acts = Array.from({ length: 200 }, (_, leg) => restActOf(1, 3, leg));
    expect(acts.some((a) => a === null)).toBe(true);
    expect(acts.some((a) => a?.icon === "wave")).toBe(true);
  });
});

describe("talking (pickLine)", () => {
  const kim = RESIDENTS.find((r) => r.id === "kimdr")!;
  const seq = (...xs: number[]) => {
    let i = 0;
    return () => xs[i++ % xs.length];
  };
  it("picks a night line at night and a rain line in the rain", () => {
    const night: LineContext = { phase: "night", weather: "clear" };
    expect(pickLine(kim, night, seq(0, 0))).toBe("야근 끝나고 불멍 중이에요");
    const rain: LineContext = { phase: "dusk", weather: "rain" };
    expect(pickLine(kim, rain, seq(0, 0))).toBe("비 오는 날 야근은 두 배로 길어요");
  });
  it("otherwise picks an any-time line, never a line for another time", () => {
    const day: LineContext = { phase: "day", weather: "clear" };
    const allowed = new Set(kim.lines.filter((l) => !l.when || l.when === "day").map((l) => l.t));
    for (let k = 0; k < 200; k++) expect(allowed.has(pickLine(kim, day, Math.random))).toBe(true);
    const night: LineContext = { phase: "night", weather: "clear" };
    for (let k = 0; k < 200; k++) expect(pickLine(kim, night, Math.random)).not.toBe("해 떠 있을 때 퇴근해 보고 싶다");
  });
  it("avoids repeating the previous line", () => {
    const day: LineContext = { phase: "dawn", weather: "cloudy" };
    const first = pickLine(kim, day, seq(0.9, 0));
    for (let k = 0; k < 50; k++) expect(pickLine(kim, day, Math.random, first)).not.toBe(first);
  });
});

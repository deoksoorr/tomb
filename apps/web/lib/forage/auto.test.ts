import { describe, expect, it } from "vitest";
import { SEASONS, TIME_PHASES, WEATHERS } from "../ambience";
import {
  AUTO_BEAT_GAP_MS,
  AUTO_FISH_EVERY_MS,
  AUTO_FISH_MAX_MS,
  autoAliveMs,
  autoCatchTimes,
  autoCaughtTotal,
  autoNextInMs,
  autoRareFactor,
  autoSummary,
  beatAuto,
  DIRECT_FISH_AVG_MS,
  newAutoSession,
  parseAutoSession,
  pickAuto,
  rollAutoCatch,
  type AutoSession,
} from "./auto";
import { speciesById, type Species } from "./catalog";
import { candidates, conditionsAt, hash01, rollSize10, weightOf, type Cond } from "./rules";

// 자동 낚시 순수 규칙: 접속 시간 → 마릿수, 끊긴 구간 제외, 세션 최대 길이, 희귀 확률 절반, 결정성

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 12, 3, 0); // KST 12:00
const ALL_CONDS: Cond[] = TIME_PHASES.flatMap((phase) => WEATHERS.flatMap((weather) => SEASONS.map((season) => ({ phase, weather, season }))));

/** t0부터 every 간격으로 until까지 신호 */
function beats(s: AutoSession, from: number, until: number, every: number): AutoSession {
  for (let t = from + every; t <= until; t += every) s = beatAuto(s, t);
  return beatAuto(s, until);
}

const rareShare = (list: readonly Species[], w: (s: Species) => number) => {
  const total = list.reduce((n, s) => n + w(s), 0);
  return list.filter((s) => s.rarity >= 3).reduce((n, s) => n + w(s), 0) / total;
};

describe("속도", () => {
  it("직접 낚을 때 평균의 2.5배마다 한 마리", () => {
    expect(AUTO_FISH_EVERY_MS).toBe(Math.round(DIRECT_FISH_AVG_MS * 2.5));
    expect(AUTO_FISH_EVERY_MS).toBeGreaterThan(DIRECT_FISH_AVG_MS * 2);
  });
});

describe("경과 시간 → 마릿수", () => {
  it("보이는 동안 1.5분마다 정산하면 30분 = 30분어치", () => {
    const s = beats(newAutoSession(1, "f", "lake", 1, T0), T0, T0 + 30 * MIN, 1.5 * MIN);
    expect(autoAliveMs(s)).toBe(30 * MIN);
    expect(autoCaughtTotal(s)).toBe(Math.floor((30 * MIN) / AUTO_FISH_EVERY_MS));
    expect(autoNextInMs(s)).toBe(AUTO_FISH_EVERY_MS - ((30 * MIN) % AUTO_FISH_EVERY_MS));
  });

  it("숨은 탭: 머무르기 기록(10분 간격)만 와도 계속 센다", () => {
    const s = beats(newAutoSession(1, "f", "lake", 1, T0), T0, T0 + 60 * MIN, 10 * MIN);
    expect(autoAliveMs(s)).toBe(60 * MIN);
  });

  it("끊긴 구간(신호 간격이 너무 긴 곳)은 빼고 센다", () => {
    let s = newAutoSession(1, "f", "lake", 1, T0);
    s = beats(s, T0, T0 + 20 * MIN, 10 * MIN); // 20분 접속
    s = beatAuto(s, T0 + 20 * MIN + 2 * 3_600_000); // 2시간 끊김 → 세지 않음
    s = beats(s, s.beat, s.beat + 10 * MIN, 5 * MIN); // 다시 10분
    expect(autoAliveMs(s)).toBe(30 * MIN);
    expect(s.segs).toHaveLength(2);
    // 간격 상한 바로 아래는 센다
    const t = beatAuto(newAutoSession(1, "f", "lake", 1, T0), T0 + AUTO_BEAT_GAP_MS);
    expect(autoAliveMs(t)).toBe(AUTO_BEAT_GAP_MS);
    expect(autoAliveMs(beatAuto(newAutoSession(1, "f", "lake", 1, T0), T0 + AUTO_BEAT_GAP_MS + 1))).toBe(0);
  });

  it("한 세션은 켠 뒤 최대 6시간까지만", () => {
    const s = beats(newAutoSession(1, "f", "lake", 1, T0), T0, T0 + 9 * 3_600_000, 5 * MIN);
    expect(autoAliveMs(s)).toBe(AUTO_FISH_MAX_MS);
  });

  it("같은 시각·과거 신호는 아무것도 바꾸지 않는다", () => {
    const s = beatAuto(newAutoSession(1, "f", "lake", 1, T0), T0 + MIN);
    expect(beatAuto(s, T0 + MIN)).toBe(s);
    expect(beatAuto(s, T0)).toBe(s);
  });

  it("k번째 물고기의 시각은 접속 구간을 이어 붙여 채워지는 순간", () => {
    let s = newAutoSession(1, "f", "lake", 1, T0);
    s = beatAuto(s, T0 + AUTO_FISH_EVERY_MS * 1.5); // 첫 구간: 1.5마리분
    s = beatAuto(s, s.beat + 5 * 3_600_000); // 끊김 (6시간 끝까지 가지 않게 짧게)
    s = { ...s, end: s.beat + 10 * MIN };
    const back = s.beat;
    s = beatAuto(s, back + AUTO_FISH_EVERY_MS); // 둘째 구간
    const ts = autoCatchTimes(s, 1, autoCaughtTotal(s));
    expect(ts).toEqual([T0 + AUTO_FISH_EVERY_MS, back + AUTO_FISH_EVERY_MS / 2]);
    expect(autoCatchTimes(s, 2, 2)).toEqual([back + AUTO_FISH_EVERY_MS / 2]);
  });

  it("구간이 아주 많아져도 길이 합은 그대로 (상한에서 앞 구간을 합친다)", () => {
    let s: AutoSession = { ...newAutoSession(1, "f", "lake", 1, T0), end: T0 + 10 * 86_400_000 };
    let t = T0;
    for (let i = 0; i < 100; i++) {
      t += MIN;
      s = beatAuto(s, t); // 1분 접속
      t += AUTO_BEAT_GAP_MS + MIN;
      s = beatAuto(s, t); // 끊김
    }
    expect(s.segs.length).toBeLessThanOrEqual(64);
    expect(autoAliveMs(s)).toBe(100 * MIN);
  });

  it("저장 형식이 이상하면 null", () => {
    expect(parseAutoSession(null)).toBeNull();
    expect(parseAutoSession("{")).toBeNull();
    expect(parseAutoSession('{"v":2}')).toBeNull();
    const s = newAutoSession(3, "f", "river", null, T0);
    expect(parseAutoSession(JSON.stringify(s))).toEqual(s);
  });
});

describe("희귀도", () => {
  it("모든 조건·물에서 희귀(★3 이상) 확률이 정확히 절반 (흔한 것이 있을 때)", () => {
    let checked = 0;
    for (const water of ["lake", "river"] as const)
      for (const c of ALL_CONDS) {
        const list = candidates("fish", water, c);
        if (!list.some((s) => s.rarity >= 3) || !list.some((s) => s.rarity < 3)) continue;
        const f = autoRareFactor(list);
        const direct = rareShare(list, weightOf);
        const auto = rareShare(list, (s) => weightOf(s) * (s.rarity >= 3 ? f : 1));
        expect(auto).toBeCloseTo(direct / 2, 10);
        checked++;
      }
    expect(checked).toBeGreaterThan(10);
  });

  it("희귀 안에서의 비율(희귀:아주 희귀:전설)은 그대로", () => {
    const c: Cond = { phase: "dusk", weather: "clear", season: "summer" };
    const list = candidates("fish", "lake", c);
    const f = autoRareFactor(list);
    const rare = list.filter((s) => s.rarity >= 3);
    expect(rare.length).toBeGreaterThan(1);
    const ratio = (w: (s: Species) => number) => w(rare[0]) / w(rare[1]);
    expect(ratio((s) => weightOf(s) * f)).toBeCloseTo(ratio(weightOf), 10);
  });

  it("실제로 굴린 분포도 절반 근처 (시드 + 번호 해시 난수)", () => {
    const c: Cond = { phase: "dusk", weather: "clear", season: "summer" };
    const list = candidates("fish", "lake", c);
    const N = 40_000;
    let rare = 0;
    for (let k = 1; k <= N; k++) {
      const r = rollAutoCatch(77, k, "lake", T0, c);
      if (r && speciesById(r.id)!.rarity >= 3) rare++;
    }
    const want = rareShare(list, weightOf) / 2;
    expect(rare / N).toBeGreaterThan(want * 0.85);
    expect(rare / N).toBeLessThan(want * 1.15);
    // 종류별로도 무게 비율 근처 (가장 흔한 것)
    const top = [...list].sort((a, b) => weightOf(b) - weightOf(a))[0];
    const f = autoRareFactor(list);
    const total = list.reduce((n, s) => n + weightOf(s) * (s.rarity >= 3 ? f : 1), 0);
    let hit = 0;
    for (let k = 1; k <= N; k++) if (rollAutoCatch(5, k, "lake", T0, c)!.id === top.id) hit++;
    expect(hit / N).toBeCloseTo(weightOf(top) / total, 1);
  });

  it("pickAuto는 빈 목록이면 null, rand 경계에서도 목록 안", () => {
    expect(pickAuto([], 0.5)).toBeNull();
    const list = candidates("fish", "river", conditionsAt(T0));
    expect(list).toContain(pickAuto(list, 0));
    expect(list).toContain(pickAuto(list, 0.999999));
  });
});

describe("결정성", () => {
  it("같은 시드·번호·시각이면 같은 종류·크기, 시드가 다르면 달라진다", () => {
    const a = Array.from({ length: 50 }, (_, i) => rollAutoCatch(123, i + 1, "river", T0 + i * MIN));
    const b = Array.from({ length: 50 }, (_, i) => rollAutoCatch(123, i + 1, "river", T0 + i * MIN));
    expect(a).toEqual(b);
    const c = Array.from({ length: 50 }, (_, i) => rollAutoCatch(124, i + 1, "river", T0 + i * MIN));
    expect(c).not.toEqual(a);
  });

  it("그 시각의 조건으로 굴린다 (그때 잡히는 물고기만)", () => {
    for (let k = 1; k <= 300; k++) {
      const at = T0 + k * 17 * MIN; // 하루를 넘게 훑는다 (시간대·날씨가 바뀐다)
      const r = rollAutoCatch(9, k, "lake", at)!;
      expect(candidates("fish", "lake", conditionsAt(at)).map((s) => s.id)).toContain(r.id);
      const sp = speciesById(r.id)!;
      if (sp.size) expect(r.size).toBeGreaterThanOrEqual(sp.size[0] * 10);
    }
  });
});

describe("크기", () => {
  it("직접 낚을 때와 같은 분포(rollSize10)로, 시드 + 번호로 정해진다", () => {
    const c = conditionsAt(T0);
    const sizes = new Map<string, Set<number>>();
    for (let k = 1; k <= 300; k++) {
      const r = rollAutoCatch(31, k, "river", T0, c)!;
      const sp = speciesById(r.id)!;
      expect(r.size).toBe(rollSize10(sp, hash01(`auto|31|${k}|sz`)));
      expect(rollAutoCatch(31, k, "river", T0, c)!.size).toBe(r.size); // 다시 굴려도 같다
      if (!sp.size) expect(r.size).toBe(0);
      else {
        expect(r.size).toBeGreaterThanOrEqual(sp.size[0] * 10);
        expect(r.size).toBeLessThanOrEqual(sp.size[1] * 10);
        sizes.set(r.id, (sizes.get(r.id) ?? new Set()).add(r.size));
      }
    }
    // 같은 종류라도 번호가 다르면 크기가 여러 가지
    expect(Math.max(...[...sizes.values()].map((x) => x.size))).toBeGreaterThan(1);
  });
});

describe("요약", () => {
  it("종류별 마릿수, 새 도감은 앞에 표시, 많으면 외 n종", () => {
    const items = [
      { id: "a", isNew: false },
      { id: "a", isNew: false },
      { id: "b", isNew: true },
      { id: "c", isNew: false },
    ];
    expect(autoSummary(items, (id) => id.toUpperCase())).toBe("B 1(새 도감), A 2, C 1");
    expect(autoSummary(items, (id) => id, 1)).toBe("b 1(새 도감) 외 2종");
  });

  it("크기가 있으면 종류별 가장 큰 것, 도감 최대 기록을 새로 세웠으면 표시", () => {
    const items = [
      { id: "a", isNew: false, size: 300 },
      { id: "a", isNew: false, size: 423, record: true },
      { id: "b", isNew: true, size: 610 },
      { id: "c", isNew: false, size: 0 },
      { id: "c", isNew: false, size: 0 },
      { id: "c", isNew: false, size: 0 },
    ];
    expect(autoSummary(items, (id) => id.toUpperCase())).toBe("B 1(새 도감·61.0cm), A 2(최대 42.3cm·새 기록), C 3");
  });
});

import { describe, expect, it } from "vitest";
import { distances, formatHauntTime, heartbeatMs, isWall, makeMaze, scareSchedule } from "./maze";

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

describe("귀신의집 미로", () => {
  it("어떤 시드든 입구에서 출구까지 늘 이어진다", () => {
    for (const seed of SEEDS) {
      const m = makeMaze(seed);
      const d = distances(m, m.start);
      expect(isWall(m, m.exit.tx, m.exit.ty), `seed ${seed} 출구 문`).toBe(false);
      expect(d[m.exit.ty * m.cols + m.exit.tx], `seed ${seed}`).toBeGreaterThan(0);
      // 출구 문은 바깥 벽에 있다 (그 너머로 걸어 나가면 끝)
      expect(m.exit.tx === m.cols - 1 || m.exit.ty === 0).toBe(true);
    }
  });

  it("모든 바닥은 서로 이어져 있다 (갇히는 방이 없다)", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const m = makeMaze(seed);
      const d = distances(m, m.start);
      for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === 0) expect(d[i], `seed ${seed} 타일 ${i}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("같은 시드는 같은 미로, 다른 시드는 다른 미로", () => {
    expect(Array.from(makeMaze(42).tiles)).toEqual(Array.from(makeMaze(42).tiles));
    expect(Array.from(makeMaze(42).tiles)).not.toEqual(Array.from(makeMaze(43).tiles));
  });

  it("바깥 벽은 출구 하나만 뚫려 있다", () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const m = makeMaze(seed);
      let holes = 0;
      for (let tx = 0; tx < m.cols; tx++) for (const ty of [0, m.rows - 1]) if (!isWall(m, tx, ty)) holes++;
      for (let ty = 1; ty < m.rows - 1; ty++) for (const tx of [0, m.cols - 1]) if (!isWall(m, tx, ty)) holes++;
      expect(holes).toBe(1);
    }
  });

  it("귀신은 여럿이고, 입구 가까이엔 없으며, 바닥 위를 다닌다", () => {
    for (const seed of SEEDS) {
      const m = makeMaze(seed);
      const d = distances(m, m.start);
      expect(m.ghosts.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(m.ghosts.some((g) => g.kind === "patrol")).toBe(true);
      expect(m.ghosts.some((g) => g.kind === "lurk")).toBe(true);
      for (const g of m.ghosts) {
        for (const p of g.path) {
          expect(isWall(m, p.tx, p.ty)).toBe(false);
          expect(d[p.ty * m.cols + p.tx]).toBeGreaterThanOrEqual(10);
        }
        // 순찰 길은 한 걸음씩 이어진다
        for (let i = 1; i < g.path.length; i++) expect(Math.abs(g.path[i].tx - g.path[i - 1].tx) + Math.abs(g.path[i].ty - g.path[i - 1].ty)).toBe(1);
      }
    }
  });
});

describe("놀래키기 연출", () => {
  /** 아무 1초 구간 안에 그 종류가 몇 번 시작하는지의 최댓값 */
  const maxPerSecond = (ats: number[]) => Math.max(0, ...ats.map((a) => ats.filter((b) => b >= a && b < a + 1000).length));

  it("붉은 번쩍임·얼굴 깜빡임은 1초에 3번 이하 (광과민성 안전)", () => {
    const s = scareSchedule(false);
    expect(maxPerSecond(s.filter((x) => x.kind === "red").map((x) => x.at))).toBeLessThanOrEqual(3);
    expect(maxPerSecond(s.filter((x) => x.kind === "faceIn").map((x) => x.at))).toBeLessThanOrEqual(3);
    expect(s.filter((x) => x.kind === "faceIn").length).toBeGreaterThanOrEqual(2);
  });

  it("움직임 줄이기면 번쩍임·흔들림 없이 한 번 나타나기만", () => {
    const s = scareSchedule(true);
    expect(s.some((x) => x.kind === "red" || x.kind === "shake")).toBe(false);
    expect(s.filter((x) => x.kind === "faceIn").length).toBe(1);
    expect(s.some((x) => x.kind === "scream")).toBe(true);
  });

  it("심장 박동은 귀신·출구가 가까울수록 빨라진다", () => {
    expect(heartbeatMs(500, 900)).toBeGreaterThan(heartbeatMs(80, 900));
    expect(heartbeatMs(500, 900)).toBeGreaterThan(heartbeatMs(500, 60));
    expect(heartbeatMs(10, 10)).toBeGreaterThanOrEqual(400);
  });

  it("시간 표시", () => {
    expect(formatHauntTime(0)).toBe("0:00.0");
    expect(formatHauntTime(83_450)).toBe("1:23.4");
  });
});

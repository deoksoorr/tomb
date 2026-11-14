import { describe, expect, it } from "vitest";
import { assignLooks, GHOST_INFO, GHOST_LOOKS, LURK_LOOKS, PATROL_LOOKS } from "./ghostKinds";
import { distances, formatHauntTime, heartbeatMs, isWall, makeMaze, mulberry, scareSchedule, stepToward } from "./maze";

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

describe("귀신 종류", () => {
  it("10종 이상이고, 숨는 귀신·돌아다니는 귀신이 여럿씩 있다", () => {
    expect(GHOST_LOOKS.length).toBeGreaterThanOrEqual(10);
    expect(LURK_LOOKS.length).toBeGreaterThanOrEqual(5);
    expect(PATROL_LOOKS.length).toBeGreaterThanOrEqual(5);
  });

  it("한 판 안에서는 같은 귀신이 두 번 나오지 않고, 숨음·순찰에 맞는 종류만 붙는다", () => {
    for (const seed of SEEDS) {
      const m = makeMaze(seed);
      const looks = m.ghosts.map((g) => g.look);
      expect(new Set(looks).size, `seed ${seed}`).toBe(looks.length);
      for (const g of m.ghosts) expect(GHOST_INFO[g.look].mode).toBe(g.kind);
    }
  });

  it("입구에서 멀수록 더 무서운 귀신 (숨음·순찰 따로)", () => {
    for (const seed of SEEDS) {
      const m = makeMaze(seed);
      const d = distances(m, m.start);
      for (const kind of ["lurk", "patrol"] as const) {
        const gs = m.ghosts.filter((g) => g.kind === kind).sort((a, b) => d[a.path[0].ty * m.cols + a.path[0].tx] - d[b.path[0].ty * m.cols + b.path[0].tx]);
        for (let i = 1; i < gs.length; i++) expect(GHOST_INFO[gs[i].look].tier, `seed ${seed}`).toBeGreaterThanOrEqual(GHOST_INFO[gs[i - 1].look].tier);
      }
    }
  });

  it("판마다 섞인다 (모든 종류가 나오고, 첫 귀신도 여러 가지)", () => {
    const seen = new Set<string>();
    const firsts = new Set<string>();
    for (const seed of SEEDS) {
      const m = makeMaze(seed);
      for (const g of m.ghosts) seen.add(g.look);
      firsts.add(m.ghosts[0].look);
    }
    expect(seen.size).toBe(GHOST_LOOKS.length);
    expect(firsts.size).toBeGreaterThanOrEqual(3);
  });

  it("종류보다 귀신이 많아도 바로 이웃한 귀신끼리 같지 않다", () => {
    const r = mulberry(5);
    const modes = Array.from({ length: 9 }, () => "lurk" as const);
    const looks = assignLooks(
      modes,
      modes.map((_, i) => i),
      r,
    );
    for (let i = 1; i < looks.length; i++) expect(looks[i]).not.toBe(looks[i - 1]);
  });

  it("귀신은 미로 길을 따라 한 칸씩 다가온다 (벽을 뚫지 않는다)", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const m = makeMaze(seed);
      const field = distances(m, m.exitIn);
      let cur: { tx: number; ty: number } | null = m.start;
      let n = 0;
      while (cur && (cur.tx !== m.exitIn.tx || cur.ty !== m.exitIn.ty)) {
        const nx = stepToward(m, field, cur);
        expect(nx, `seed ${seed}`).not.toBeNull();
        if (!nx) break;
        expect(isWall(m, nx.tx, nx.ty)).toBe(false);
        expect(Math.abs(nx.tx - cur.tx) + Math.abs(nx.ty - cur.ty)).toBe(1);
        cur = nx;
        n++;
      }
      expect(n).toBe(field[m.start.ty * m.cols + m.start.tx]);
      expect(stepToward(m, field, m.exitIn)).toBeNull();
    }
  });
});

describe("놀래키기 연출", () => {
  /** 아무 1초 구간 안에 그 종류가 몇 번 시작하는지의 최댓값 */
  const maxPerSecond = (ats: number[]) => Math.max(0, ...ats.map((a) => ats.filter((b) => b >= a && b < a + 1000).length));

  it("붉은 번쩍임·얼굴 깜빡임은 어떤 귀신·세기에서도 1초에 3번 이하 (광과민성 안전)", () => {
    for (const look of GHOST_LOOKS)
      for (const level of [0, 0.25, 0.5, 1]) {
        const s = scareSchedule(false, look, level);
        // 얼굴이 들어오는 것과 붉은 번쩍임을 합쳐도 (밝기가 크게 바뀌는 순간) 1초에 3번 남짓을 넘지 않게
        expect(maxPerSecond(s.filter((x) => x.kind === "red").map((x) => x.at)), look).toBeLessThanOrEqual(3);
        expect(maxPerSecond(s.filter((x) => x.kind === "faceIn").map((x) => x.at)), look).toBeLessThanOrEqual(3);
        expect(s.filter((x) => x.kind === "faceIn").length).toBeGreaterThanOrEqual(2);
        expect(s.filter((x) => x.kind === "scream").length).toBe(1);
        // 풀려나는 것은 맨 끝
        expect(s[s.length - 1].kind).toBe("release");
      }
  });

  it("많이 놀랄수록 세진다 (얼굴 횟수가 늘고, 조작이 굳는 시간도 조금 길어진다)", () => {
    const n = (lv: number) => scareSchedule(false, "sobok", lv).filter((x) => x.kind === "faceIn").length;
    const rel = (lv: number) => scareSchedule(false, "sobok", lv).find((x) => x.kind === "release")!.at;
    expect(n(1)).toBeGreaterThan(n(0));
    expect(rel(1)).toBeGreaterThan(rel(0));
    expect(rel(1)).toBeLessThanOrEqual(1600);
  });

  it("움직임 줄이기면 어떤 귀신이든 번쩍임·흔들림 없이 한 번 나타나기만", () => {
    for (const look of GHOST_LOOKS) {
      const s = scareSchedule(true, look, 1);
      expect(s.some((x) => x.kind === "red" || x.kind === "shake")).toBe(false);
      expect(s.filter((x) => x.kind === "faceIn").length).toBe(1);
      expect(s.some((x) => x.kind === "scream")).toBe(true);
    }
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

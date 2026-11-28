import { CAMP_RAFTS, campRaftWalks } from "@tomb/protocol";
import { beforeAll, describe, expect, it } from "vitest";
import { installFakeCanvas } from "@/game/camp/campTestCanvas";
import { raft4Art } from "@/game/camp/valleyExtraArt";
import { raftThumbCanvas } from "./raftThumb";

// 11/28 매표소 카드 좌대 그림 = 캠핑장 맵 좌대 그림 (같은 그림 코드 — 그림이 바뀌면 카드도 따라 바뀐다)

beforeAll(() => installFakeCanvas());

type Fake = { width: number; height: number; px: () => Uint8ClampedArray };

describe("매표소 좌대 그림", () => {
  it("여섯 다 같은 크기 (폰 두 칸에서 글줄이 맞게)", () => {
    const sizes = new Set(CAMP_RAFTS.map((r) => { const c = raftThumbCanvas(r.n, "default") as unknown as Fake; return `${c.width}x${c.height}`; }));
    expect(sizes.size).toBe(1);
  });

  it("카드 그림 속 좌대 = 맵이 그리는 좌대 그림 (기본 판 — 눈 없음)", () => {
    for (const r of CAMP_RAFTS) {
      const c = raftThumbCanvas(r.n, "default") as unknown as Fake;
      const g = raft4Art(r.roof, false, r.link ? "left" : "front", { n: r.n, walks: campRaftWalks(r).map((w) => w.x - r.x + 36) }).grid;
      const ox = (c.width - g.w) / 2;
      const oy = r.link ? 0 : (c.height - g.h) / 2;
      const d = c.px();
      let same = 0;
      let painted = 0;
      for (let y = 0; y < g.h; y++)
        for (let x = 0; x < g.w; x++) {
          const v = g.get(x, y);
          if ((v & 255) < 255) continue;
          painted++;
          const i = ((y + oy) * c.width + x + ox) * 4;
          if (d[i] === v >>> 24 && d[i + 1] === ((v >>> 16) & 255) && d[i + 2] === ((v >>> 8) & 255)) same++;
        }
      expect(painted, `${r.n}번`).toBeGreaterThan(1000);
      expect(same, `${r.n}번`).toBe(painted);
    }
  });

  it("없는 번호는 그리지 않는다", () => {
    expect(raftThumbCanvas(7, "default")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { PONDS } from "@tomb/protocol";
import { TOWER } from "../tower/towerLayout";
import { beamPose, groundEllipse, groundYAt, projectT, SQUASH, wrapAngle } from "./beamMath";
import { LIGHTHOUSE, LIGHTHOUSE_LAMP } from "./lighthouseLayout";

// 11/20 등대 빛줄기 원근: 남쪽(보는 사람 쪽)은 길고 넓게, 북쪽은 짧게, 빛 웅덩이가 까마귀 연못을 지나고, 서쪽으로 돌면 야근 빌딩 앞·뒤를 가른다

describe("등대 빛줄기 원근", () => {
  it("보는 사람 쪽이 먼 쪽보다 길고 넓다", () => {
    const s = beamPose(Math.PI / 2);
    const n = beamPose(-Math.PI / 2);
    expect(s.len).toBeGreaterThan(n.len * 3);
    expect(s.half).toBeGreaterThan(n.half * 1.5);
    expect(s.py).toBeGreaterThan(LIGHTHOUSE.y);
    expect(n.py).toBeLessThan(LIGHTHOUSE_LAMP.y);
  });

  it("빛 웅덩이가 한 바퀴에 까마귀 연못 안을 지난다", () => {
    const pond = PONDS.find((p) => p.id === "pondNE")!;
    let hits = 0;
    for (let i = 0; i < 360; i++) {
      const p = beamPose((i / 180) * Math.PI);
      if (((p.px - pond.x) / pond.rx) ** 2 + ((p.py - pond.y) / pond.ry) ** 2 < 1) hits++;
    }
    expect(hits).toBeGreaterThan(20);
  });

  it("서쪽 앞(남서)은 야근 빌딩보다 앞, 서쪽 뒤(북서)는 빌딩 뒤", () => {
    for (const [deg, front] of [
      [165, true],
      [195, false],
    ] as const) {
      const p = beamPose((deg / 180) * Math.PI);
      const t = projectT(p, TOWER.x, TOWER.y - 60);
      expect(groundYAt(p, t) > TOWER.y, `${deg}`).toBe(front);
    }
  });

  it("땅 타원: 원 둘레가 diag(1,SQUASH)·R·diag(a,b)와 같은 타원이 된다", () => {
    for (const th of [0, 0.4, 1.3, 2.2, -0.9]) {
      const a = 46;
      const b = 22;
      const e = groundEllipse(th, a, b);
      const c = Math.cos(th);
      const s = Math.sin(th);
      for (let k = 0; k < 8; k++) {
        const u = (k / 8) * Math.PI * 2;
        // 땅 타원 위 점을 화면으로
        const gx = a * Math.cos(u);
        const gy = b * Math.sin(u);
        const x = c * gx - s * gy;
        const y = (s * gx + c * gy) * SQUASH;
        // 화면 타원 식에 넣으면 1
        const rx = Math.cos(-e.rot) * x - Math.sin(-e.rot) * y;
        const ry = Math.sin(-e.rot) * x + Math.cos(-e.rot) * y;
        expect((rx / e.rx) ** 2 + (ry / e.ry) ** 2).toBeCloseTo(1, 5);
      }
    }
  });

  it("각 감기", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 6);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5, 6);
  });
});

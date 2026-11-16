import { describe, expect, it } from "vitest";
import { SEA_FURNITURE, SEA_SPOTS } from "@tomb/protocol";
import { seaViewFore, seaViewLandmarks, seaViewProject } from "./seaViewGeom";

// 11/16 바다 보기 원근: 바다(남쪽)를 보고 앉아서 지도 동쪽이 장면 왼쪽 (사용자 확정)
const VW = 320;
const VH = 200;
const HZ = 84;

describe("바다 보기 원근 (seaViewGeom)", () => {
  it("동쪽은 왼쪽, 서쪽은 오른쪽 · 가까울수록 크고 아래", () => {
    const e = seaViewProject(60, 80, VW, VH, HZ)!;
    const w = seaViewProject(-60, 80, VW, VH, HZ)!;
    expect(e.x).toBeLessThan(VW / 2);
    expect(w.x).toBeGreaterThan(VW / 2);
    const near = seaViewProject(0, 40, VW, VH, HZ)!;
    const far = seaViewProject(0, 200, VW, VH, HZ)!;
    expect(near.s).toBeGreaterThan(far.s);
    expect(near.y).toBeGreaterThan(far.y);
    expect(far.y).toBeGreaterThan(HZ);
    expect(seaViewProject(0, 4, VW, VH, HZ)).toBeNull();
  });

  it("벤치 동쪽 파라솔은 장면 왼쪽 반에, 벤치 앞 줄은 모두 벤치 남쪽(앞)", () => {
    const benches = SEA_FURNITURE.filter((f) => f.id.startsWith("pS"));
    expect(benches.length).toBe(4);
    for (const b of benches) {
      const { spec } = seaViewFore(b.x, b.y);
      expect(spec.loungers.length, b.id).toBeGreaterThan(0);
      for (const l of spec.loungers) expect(l.d, b.id).toBeGreaterThan(0);
      for (const p of spec.parasols) {
        const at = seaViewProject(p.dx, p.d, VW, VH, HZ)!;
        if (p.dx > 0) expect(at.x, `${b.id} parasol east`).toBeLessThan(VW / 2);
        if (p.dx < 0) expect(at.x, `${b.id} parasol west`).toBeGreaterThan(VW / 2);
      }
    }
    // 첫 벤치(pS1)는 동쪽 파라솔이 꼭 하나 있어요
    const b1 = benches[0];
    const east = seaViewFore(b1.x, b1.y).spec.parasols.filter((p) => p.dx > 0);
    expect(east.length).toBeGreaterThan(0);
    expect(seaViewProject(east[0].dx, east[0].d, VW, VH, HZ)!.x).toBeLessThan(VW / 2);
  });

  it("선착장 서쪽 선베드에서 보면 선착장은 장면 왼쪽", () => {
    const l = SEA_SPOTS.loungers.find((q) => q.x > 380 && q.x < 560)!;
    const lm = seaViewLandmarks(l.x, l.y - 8);
    const pier = lm.strips.find((s) => s.kind === "pier");
    expect(pier).toBeDefined();
    expect(pier!.dx).toBeGreaterThan(0);
    expect(seaViewProject(pier!.dx, pier!.d1, VW, VH, HZ)!.x).toBeLessThan(VW / 2);
  });
});

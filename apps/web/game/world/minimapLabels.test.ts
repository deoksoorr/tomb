import { describe, expect, it } from "vitest";
import { CAMP_LANDMARKS, CAMP_MINIMAP_H, CAMP_MINIMAP_W, toCampMinimap } from "../camp/campMinimap";
import { SEA_LANDMARKS, SEA_MINIMAP_H, SEA_MINIMAP_W, toSeaMinimap } from "../sea/seaMinimap";
import { LANDMARKS, MINIMAP_H, MINIMAP_W, toMinimap } from "./minimapArt";
import { estimateTextWidth, MAP_LABELS, placeLabels, type LabelItem } from "./minimapLabels";

const MAPS = {
  village: { spots: LANDMARKS, w: MINIMAP_W, h: MINIMAP_H, to: toMinimap },
  camp: { spots: CAMP_LANDMARKS, w: CAMP_MINIMAP_W, h: CAMP_MINIMAP_H, to: toCampMinimap },
  sea: { spots: SEA_LANDMARKS, w: SEA_MINIMAP_W, h: SEA_MINIMAP_H, to: toSeaMinimap },
} as const;
const MINIMAP_LABEL_TEST_MAPS = ["village", "camp", "sea"] as const;

function items(map: keyof typeof MAPS, width: number, busOnly: boolean): { items: LabelItem[]; W: number; H: number } {
  const m = MAPS[map];
  const unit = width / m.w;
  const out: LabelItem[] = [];
  for (const l of m.spots) {
    const lab = MAP_LABELS[map][l.id];
    if (!lab || (busOnly && lab.group !== "bus")) continue;
    const p = m.to(l.x, l.y);
    out.push({ id: l.id, x: p.x * unit, y: p.y * unit, w: estimateTextWidth(lab.text, 11) + 8, h: 15, g: lab.group === "bus" ? 11 : Math.max(3, 3 * unit), pri: lab.pri, hard: lab.group === "bus" });
  }
  return { items: out, W: width, H: Math.round(m.h * unit) };
}

describe("11/25 지도 이름표", () => {
  it("이름표는 그 맵에 실제로 있는 장소에만, 맵마다 다른 맵으로 가는 정류장 이름표가 있다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS) {
      const ids = new Set<string>(MAPS[map].spots.map((l) => l.id));
      for (const id of Object.keys(MAP_LABELS[map])) expect(ids.has(id), `${map}:${id}`).toBe(true);
      expect(Object.values(MAP_LABELS[map]).some((l) => l.group === "bus"), map).toBe(true);
    }
    expect(MAP_LABELS.village.busCamp.text).toBe("캠핑장행");
    expect(MAP_LABELS.village.busSea.text).toBe("바닷가행");
    expect(MAP_LABELS.camp.bus.text).toBe("마을행");
    expect(MAP_LABELS.sea.bus.text).toBe("마을행");
  });

  it("비밀 붕어빵 수레는 지도에 없다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS) {
      for (const l of Object.values(MAP_LABELS[map])) expect(l.text).not.toContain("붕어빵");
      for (const l of MAPS[map].spots) expect(l.label).not.toContain("붕어빵");
    }
  });

  it("작은 지도(폰 154px·데스크톱 270px)에 정류장 이름표가 빠짐없이 지도 안에 놓인다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS)
      for (const width of [154, 270]) {
        const { items: its, W, H } = items(map, width, true);
        // 왼쪽 위 맵 이름 딱지 + [크게] 단추 자리
        const placed = placeLabels(its, W, H, [{ x: 0, y: 0, w: 92, h: 24 }]);
        expect(placed.length, `${map} ${width}`).toBe(its.length);
      }
  });

  it("크게 보기(폰 358px·데스크톱 600px): 이름표끼리 안 겹치고 지도 밖으로 안 나가며, 정류장은 늘 놓인다", () => {
    for (const map of MINIMAP_LABEL_TEST_MAPS)
      for (const width of [358, 600]) {
        const { items: its, W, H } = items(map, width, false);
        const placed = placeLabels(its, W, H);
        const box = (p: { id: string; left: number; top: number }) => {
          const it = its.find((i) => i.id === p.id)!;
          return { x: p.left, y: p.top, w: it.w, h: it.h };
        };
        for (const p of placed) {
          const b = box(p);
          expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `${map} ${p.id}`).toBe(true);
        }
        for (let i = 0; i < placed.length; i++)
          for (let j = i + 1; j < placed.length; j++) {
            const a = box(placed[i]);
            const b = box(placed[j]);
            expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${map} ${placed[i].id}/${placed[j].id}`).toBe(false);
          }
        for (const it of its.filter((i) => MAP_LABELS[map][i.id].group === "bus")) expect(placed.some((p) => p.id === it.id), `${map} ${it.id}`).toBe(true);
        // 넓은 데스크톱 창은 절반 넘게 이름이 보인다
        if (width === 600) expect(placed.length / its.length, map).toBeGreaterThan(0.5);
      }
  });
});

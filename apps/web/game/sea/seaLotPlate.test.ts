import { SEA_GARDEN_BENCHES, SEA_LOT_LANTERNS, SEA_LOTS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { COTTAGE_STYLES, PLOT_TIERS, type PlotTierId } from "@/lib/housing/catalog";
import { ZOOM_MIN } from "../config";
import { COTTAGE_RISE, cottageBox, cottageGrid } from "./seaCottageArt";
import { zoneLabelAt } from "./seaLayout";
import { LOW_PLATE_H, LOW_PLATE_MIN_W, lowPlateSpot, PHONE_HUD_PX, ROOF_PLATE_MIN_Y } from "./seaLotPlate";

// 11/20 맨 윗줄 오두막만 문패를 집 아래 땅에 (폰 HUD에 가리지 않게)
type Box = { x0: number; x1: number; y0: number; y1: number };
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const lot = (n: number) => SEA_LOTS.find((x) => x.n === n)!;
const TOP_ROW = [2, 4, 8, 9, 10];
/** 문패 세 줄 실제 글씨 높이 (가장 작은 줌, 월드) — 줄 간격 15px(글자 11 + 틈 6 − 위아래 여백) 두 번 + 글자 11px, 화면에서 잰 값 */
const INK_BLOCK = (2 * 15 + 11) / ZOOM_MIN;

describe("포구 오두막 땅 문패", () => {
  it("맵 위 끝에 붙은 2·4·8·9·10번 터만 (모든 모양·크기에서) 땅 문패", () => {
    for (const l of SEA_LOTS)
      for (const s of COTTAGE_STYLES)
        for (const t of PLOT_TIERS) {
          const roofBottom = l.y - COTTAGE_RISE + cottageGrid({ style: s.id, tier: t.id, deck: l.deck, night: false, lot: l }).top - 2;
          expect(roofBottom < ROOF_PLATE_MIN_Y, `${l.n} ${s.id} ${t.id}`).toBe(TOP_ROW.includes(l.n));
        }
  });

  it("땅 문패는 다른 터·그 지붕 위 문패 자리·등불·벤치·「별장」 이름표와 겹치지 않고, 서로도 겹치지 않아요 (모든 크기)", () => {
    const villa = zoneLabelAt("별장")!;
    for (const tier of PLOT_TIERS.map((t) => t.id as PlotTierId)) {
      const low = TOP_ROW.map((n) => ({ n, ...lowPlateSpot(lot(n), tier) }));
      const box = (p: (typeof low)[number]): Box => ({ x0: p.cx - p.w / 2, x1: p.cx + p.w / 2, y0: p.top, y1: p.top + LOW_PLATE_H });
      for (const p of low) {
        const r = box(p);
        const l = lot(p.n);
        expect(p.w).toBeGreaterThanOrEqual(LOW_PLATE_MIN_W);
        if (p.inLot) {
          // ③ 제 터 앞마당: 집 앞벽 아래 · 터 안 (울타리 언저리까지). 아래 터 지붕 위 문패와는 실제 글씨 크기로 (가장 작은 줌)
          expect(p.top).toBeGreaterThan(l.y + cottageBox(tier, l).base);
          expect(p.top + INK_BLOCK).toBeLessThanOrEqual(l.y + l.h + 2);
          for (const o of SEA_LOTS.filter((o) => o.n !== p.n && !TOP_ROW.includes(o.n)))
            for (const s of COTTAGE_STYLES)
              for (const t of PLOT_TIERS) {
                const bottom = o.y - COTTAGE_RISE + cottageGrid({ style: s.id, tier: t.id, deck: o.deck, night: false, lot: o }).top - 2;
                const roofPlate = { x0: o.x + 3, x1: o.x + o.w - 3, y0: bottom - INK_BLOCK, y1: bottom };
                expect(overlap({ ...r, y1: p.top + INK_BLOCK }, roofPlate), `${p.n} vs ${o.n} 지붕 문패 (${s.id} ${t.id})`).toBe(false);
              }
        } else
          for (const o of SEA_LOTS.filter((o) => o.n !== p.n)) expect(overlap(r, { x0: o.x, x1: o.x + o.w, y0: o.y - COTTAGE_RISE - LOW_PLATE_H, y1: o.y + o.h }), `${p.n} vs 터 ${o.n}`).toBe(false);
        for (const q of SEA_LOT_LANTERNS) expect(overlap(r, { x0: q.x - 5, x1: q.x + 5, y0: q.y - 40, y1: q.y }), `${p.n} vs 등불 ${q.x}`).toBe(false);
        for (const b of SEA_GARDEN_BENCHES) expect(overlap(r, { x0: b.x - 14, x1: b.x + 30, y0: b.y - 40, y1: b.y + 2 }), `${p.n} vs 벤치 ${b.x}`).toBe(false);
        expect(overlap(r, { x0: villa.x - 14, x1: villa.x + 14, y0: villa.y - 10, y1: villa.y }), `${p.n} vs 별장`).toBe(false);
        for (const q of low.filter((q) => q.n !== p.n)) expect(overlap(r, box(q))).toBe(false);
        // 맨 윗줄이 폰 HUD(130px) 아래 (가장 작은 줌에서 카메라가 맵 위 끝에 멈춰도)
        expect(p.top).toBeGreaterThanOrEqual(PHONE_HUD_PX / ZOOM_MIN);
      }
    }
  });
});

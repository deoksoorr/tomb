import { SEA_LOTS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { COTTAGE_STYLES, PLOT_TIERS } from "@/lib/housing/catalog";
import { COTTAGE_RISE, cottageBox, cottageGrid } from "./seaCottageArt";

describe("포구 오두막 그림", () => {
  it("모든 터·크기에서 집이 터 안 뒤쪽에 서고 지붕은 RISE 안으로만 솟아요", () => {
    for (const l of SEA_LOTS)
      for (const t of PLOT_TIERS) {
        const b = cottageBox(t.id, l);
        expect(b.x).toBeGreaterThanOrEqual(6);
        expect(b.x + b.w).toBeLessThanOrEqual(l.w - 6);
        expect(-b.y).toBeLessThanOrEqual(COTTAGE_RISE - 14); // 등대지기 망루가 지붕보다 더 솟을 자리
        expect(b.base).toBeLessThan(l.h * 0.6); // 뒤쪽 (앞마당·길 자리를 남겨요)
      }
  });

  it("크기가 커질수록 집도 넓어져요", () => {
    const ws = PLOT_TIERS.map((t) => cottageBox(t.id, { w: 136, h: 84 }).w);
    expect(ws[0]).toBeGreaterThanOrEqual(56);
    expect(ws[0]).toBeLessThanOrEqual(64);
    expect(ws[1]).toBeGreaterThanOrEqual(76);
    expect(ws[2]).toBeLessThanOrEqual(104);
  });

  it("세 가지 모양 × 낮·밤 × 데크: 크기·문 자리·밤 창 불빛", () => {
    const l = SEA_LOTS[0];
    for (const s of COTTAGE_STYLES)
      for (const night of [false, true])
        for (const deck of [false, true]) {
          const b = cottageGrid({ style: s.id, tier: "wide", deck, night, lot: l });
          expect(b.grid.w).toBe(l.w);
          expect(b.grid.h).toBe(l.h + COTTAGE_RISE);
          expect(b.door.y).toBe(b.baseY);
          expect(b.grid.filled(b.door.x, b.baseY - 3)).toBe(true); // 문
          expect(b.grid.filled(1, 1)).toBe(false); // 바탕은 투명
          expect(b.lights.length > 0).toBe(night);
        }
  });

  it("옆 출입구 터(서쪽)는 길이 출입구까지 이어져요", () => {
    const l = SEA_LOTS.find((x) => x.gate === "w")!;
    const b = cottageGrid({ style: "blue", tier: "small", deck: false, night: false, lot: l });
    const gy = COTTAGE_RISE + l.h / 2 + 2;
    let near = false;
    for (let y = gy - 3; y <= gy + 3; y++) for (let x = 0; x < 10; x++) near ||= b.grid.filled(x, y);
    expect(near).toBe(true);
  });

  it("11/20 top = 가장 위에 칠한 줄 (굴뚝·망루 포함 — 문패가 그 위에 서요)", () => {
    for (const s of COTTAGE_STYLES)
      for (const t of PLOT_TIERS) {
        const l = SEA_LOTS[0];
        const b = cottageGrid({ style: s.id, tier: t.id, deck: false, night: false, lot: l });
        let row = false;
        for (let x = 0; x < b.grid.w; x++) row ||= b.grid.filled(x, b.top);
        expect(row).toBe(true);
        for (let y = 0; y < b.top; y++) for (let x = 0; x < b.grid.w; x++) expect(b.grid.filled(x, y)).toBe(false);
        expect(b.top).toBeLessThanOrEqual(COTTAGE_RISE + cottageBox(t.id, l).y + 2); // 지붕 꼭대기보다 위 (또는 같음)
      }
  });
});

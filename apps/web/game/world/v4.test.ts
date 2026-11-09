import { describe, expect, it } from "vitest";
import { PHRASES } from "@tomb/protocol";
import { phraseOf } from "../logic/phrases";
import { EDGE, edgePoint } from "./guideMath";

describe("guide arrow edge point", () => {
  it("inside the screen → no edge arrow", () => {
    expect(edgePoint(400, 300, 800, 600)).toBeNull();
  });
  it("off-screen target → clamped to the edge, pointing at it", () => {
    const right = edgePoint(2000, 300, 800, 600)!;
    expect(right.x).toBeCloseTo(800 - EDGE, 5);
    expect(right.y).toBeCloseTo(300, 5);
    expect(right.angle).toBeCloseTo(0, 5);
    const up = edgePoint(400, -900, 800, 600)!;
    expect(up.y).toBeCloseTo(EDGE, 5);
    expect(up.angle).toBeCloseTo(-Math.PI / 2, 5);
    const diag = edgePoint(-5000, 5000, 800, 600)!;
    expect(diag.x).toBeGreaterThanOrEqual(EDGE - 1e-6);
    expect(diag.y).toBeLessThanOrEqual(600 - EDGE + 1e-6);
  });
});

describe("phrases", () => {
  it("every phrase id maps to its text; unknown → null", () => {
    for (const p of PHRASES) expect(phraseOf(p.id)).toBe(p.text);
    expect(phraseOf("nope")).toBeNull();
  });
});

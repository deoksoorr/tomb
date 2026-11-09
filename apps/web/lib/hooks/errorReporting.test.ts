import { describe, expect, it } from "vitest";
import { createErrorGate } from "./errorReporting";

describe("createErrorGate", () => {
  it("같은 메시지는 한 번만, 분당 한도까지만", () => {
    const allow = createErrorGate(2);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 1)).toBe(false);
    expect(allow("b", 2)).toBe(true);
    expect(allow("c", 3)).toBe(false);
    expect(allow("c", 60_001)).toBe(true);
  });
});

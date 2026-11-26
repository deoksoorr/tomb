import { describe, expect, it } from "vitest";
import { createErrorGate, isForeignError } from "./errorReporting";

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

describe("isForeignError (11/18 우리 탓이 아닌 오류 거르기)", () => {
  it("확장 프로그램·인앱 브라우저·Script error는 거른다", () => {
    expect(isForeignError("Cannot read properties of undefined (reading 'M_ID')", "TypeError: x\n    at h (chrome-extension://abc/executors/200.js:1:761)")).toBe(true);
    expect(isForeignError("Error invoking postMessage: Java object is gone", "Error\n    at sendDataToNative (iabjs://navigation_performance_logger_android:1:11722)")).toBe(true);
    expect(isForeignError("Script error.")).toBe(true);
  });
  it("11/26 브라우저가 알리는 ResizeObserver 반복 경고는 거른다 (오류가 아니다)", () => {
    expect(isForeignError("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isForeignError("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isForeignError("ResizeObserver is not defined")).toBe(false);
  });
  it("우리 번들에서 난 오류는 보낸다 (확장 프로그램이 끼어 있어도)", () => {
    expect(isForeignError("Cannot read properties of null (reading 'x')", "TypeError\n    at dp.panBy (https://myproject.rip/_next/static/chunks/a.js:46:5440)")).toBe(false);
    expect(isForeignError("boom", "Error\n    at a (https://myproject.rip/_next/static/chunks/a.js:1:1)\n    at b (chrome-extension://abc/x.js:1:1)")).toBe(false);
    expect(isForeignError("지워진 텍스처를 그리려 함: forage-node-bug-0 (Image, world)")).toBe(false);
  });
});

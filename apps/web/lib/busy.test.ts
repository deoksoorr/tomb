import { afterEach, describe, expect, it } from "vitest";
import { busyNow, clearBusy, hasUnsavedInput, setBusy } from "./busy";

type El = { value: string; defaultValue: string; disabled?: boolean; readOnly?: boolean };
const doc = (els: El[]) => ({ querySelectorAll: () => els }) as unknown as Pick<Document, "querySelectorAll">;
const empty = doc([]);

afterEach(clearBusy);

describe("busy 등록소", () => {
  it("아무것도 없으면 한가하다", () => {
    expect(busyNow("world", empty)).toEqual({ hard: false, soft: false });
  });

  it("사냥·미니게임 장면은 hard", () => {
    expect(busyNow("hunt", empty).hard).toBe(true);
    expect(busyNow("minigame", empty).hard).toBe(true);
    expect(busyNow("house", empty).hard).toBe(false);
  });

  it("등록·해제 (묘비 작성 = hard, 입력 중인 창 = soft)", () => {
    setBusy("bury", true);
    expect(busyNow("world", empty)).toEqual({ hard: true, soft: false });
    setBusy("guestbook", true, "soft");
    expect(busyNow("world", empty)).toEqual({ hard: true, soft: true });
    setBusy("bury", false);
    setBusy("guestbook", false);
    expect(busyNow("world", empty)).toEqual({ hard: false, soft: false });
  });

  it("등록하지 않은 창도 바뀐 입력값이 있으면 soft", () => {
    expect(hasUnsavedInput(doc([{ value: "", defaultValue: "" }]))).toBe(false);
    expect(hasUnsavedInput(doc([{ value: "  ", defaultValue: "" }]))).toBe(false);
    expect(hasUnsavedInput(doc([{ value: "안녕", defaultValue: "안녕" }]))).toBe(false); // 처음 값 그대로
    expect(hasUnsavedInput(doc([{ value: "안녕", defaultValue: "", disabled: true }]))).toBe(false);
    expect(hasUnsavedInput(doc([{ value: "쓰는 중", defaultValue: "" }]))).toBe(true);
    expect(busyNow("world", doc([{ value: "쓰는 중", defaultValue: "" }]))).toEqual({ hard: false, soft: true });
  });
});

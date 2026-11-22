import { describe, expect, it } from "vitest";
import { DYE_PICK_SWATCHES, waitLabel } from "@/lib/dye/rules";
import { overwriteDismissCloses } from "./board";
import { canWearPick, colorSlots, defaultDyeSlot, firstPick, needsOverwrite, nextLockedSlot, openColors, otherEmptySlot, otherPaintedColors, previewColor, wornSlot } from "./colorSlots";

// 11/22 아이템 색 보관함 칸 계산 (아이템 페이지 · 가방 목록 작은 칸 · 염색 창 칸 고르기)

describe("색 보관함 칸", () => {
  it("처음 염색 전: 커스텀 1은 빈 칸으로 열려 있고 2·3은 차례로 500P·1,500P", () => {
    expect(colorSlots(undefined, "hat_beanie")).toEqual([
      { k: 0, state: "empty" },
      { k: 1, state: "locked", price: 500, next: true },
      { k: 2, state: "locked", price: 1500, next: false },
    ]);
    expect(nextLockedSlot(undefined, "hat_beanie")).toEqual({ k: 1, price: 500 });
    expect(wornSlot(undefined, "hat_beanie")).toBe(-1);
  });

  it("칠한 칸 · 입는 칸 · 연 빈 칸", () => {
    const d = { hat_beanie: { colors: ["#d23a48", "#3fbfa4~s", null], sel: 1 } };
    expect(colorSlots(d, "hat_beanie")).toEqual([
      { k: 0, state: "painted", color: "#d23a48", worn: false },
      { k: 1, state: "painted", color: "#3fbfa4~s", worn: true },
      { k: 2, state: "empty" },
    ]);
    expect(nextLockedSlot(d, "hat_beanie")).toBeNull();
    expect(wornSlot(d, "hat_beanie")).toBe(1);
  });

  it("덮어쓰기 대신 칠할 빈 칸은 고른 칸 말고 연 칸 중 첫 빈 칸", () => {
    const d = { sc_padding: { colors: ["#3050e0", null], sel: 0 } };
    expect(otherEmptySlot(d, "sc_padding", 0)).toBe(1);
    expect(otherEmptySlot(d, "sc_padding", 1)).toBeNull();
    expect(otherEmptySlot({ sc_padding: { colors: ["#3050e0"], sel: 0 } }, "sc_padding", 0)).toBeNull();
  });

  it("처음 고를 칸: 입는 커스텀 칸 → 첫 빈 칸 → 원래 색", () => {
    expect(firstPick(undefined, "hat_beanie")).toBe(0);
    expect(firstPick({ hat_beanie: { colors: ["#111111", null], sel: -1 } }, "hat_beanie")).toBe(1);
    expect(firstPick({ hat_beanie: { colors: ["#111111", "#222222"], sel: 1 } }, "hat_beanie")).toBe(1);
    expect(firstPick({ hat_beanie: { colors: ["#111111"], sel: -1 } }, "hat_beanie")).toBe(-1);
  });

  it("염색 창 기본 칸은 서버 규칙과 같다: 입는 칸 · 첫 빈 칸 · 0", () => {
    expect(defaultDyeSlot(undefined, "hat_beanie")).toBe(0);
    expect(defaultDyeSlot({ hat_beanie: { colors: ["#111111", null], sel: -1 } }, "hat_beanie")).toBe(1);
    expect(defaultDyeSlot({ hat_beanie: { colors: ["#111111", "#222222"], sel: -1 } }, "hat_beanie")).toBe(0);
    expect(defaultDyeSlot({ hat_beanie: { colors: ["#111111", "#222222"], sel: 1 } }, "hat_beanie")).toBe(1);
  });

  it("내 다른 색: 칠할 칸 말고 칠해 둔 색 (특수 표시는 떼고 겹치지 않게)", () => {
    const d = { hat_beanie: { colors: ["#d23a48", "#3fbfa4~g", "#d23a48"], sel: 0 } };
    expect(otherPaintedColors(d, "hat_beanie", 0)).toEqual(["#3fbfa4", "#d23a48"]);
    expect(otherPaintedColors(d, "hat_beanie", 1)).toEqual(["#d23a48"]);
    expect(otherPaintedColors(undefined, "hat_beanie", 0)).toEqual([]);
  });
});

describe("색 확정 견본 색", () => {
  it("10열 격자로 딱 나눠 떨어진다 (마지막 줄에 칸이 홀로 남지 않게 — colorPick.module.css .swatches)", () => {
    expect(DYE_PICK_SWATCHES.length % 10).toBe(0);
  });
});

describe("11/22 운영자 보고 회귀: 색 보관함 미리보기 · 덮어쓰기 확인", () => {
  const d = { wr_shirt: { colors: ["#112233", "#223344", "#334455"], sel: 2 } };

  it("보고 2·사양: 커스텀 3을 입은 채 커스텀 1·2·원래 색을 누르면 미리보기만 — [이 색 입기]는 입은 칸과 다를 때만", () => {
    expect(wornSlot(d, "wr_shirt")).toBe(2);
    expect(previewColor(d, "wr_shirt", 0)).toBe("#112233");
    expect(previewColor(d, "wr_shirt", 1)).toBe("#223344");
    expect(previewColor(d, "wr_shirt", -1)).toBeNull();
    expect(canWearPick(d, "wr_shirt", 0)).toBe(true);
    expect(canWearPick(d, "wr_shirt", -1)).toBe(true);
    expect(canWearPick(d, "wr_shirt", 2)).toBe(false);
  });

  it("빈 칸·잠긴 칸을 고르면 입은 색 그대로 보이고 [이 색 입기]는 없다", () => {
    const e = { hat_beanie: { colors: ["#d23a48", null], sel: 0 } };
    expect(previewColor(e, "hat_beanie", 1)).toBe("#d23a48");
    expect(previewColor(e, "hat_beanie", 2)).toBe("#d23a48");
    expect(canWearPick(e, "hat_beanie", 1)).toBe(false);
    expect(canWearPick(e, "hat_beanie", 2)).toBe(false);
    // 원래 색을 입고 있으면 원래 색 칸은 [이 색 입기] 없음
    expect(canWearPick({ hat_beanie: { colors: ["#d23a48"], sel: -1 } }, "hat_beanie", -1)).toBe(false);
    expect(previewColor(undefined, "hat_beanie", 0)).toBeNull();
  });

  it("보고 3: 빈 칸에 칠할 때는 덮어쓰기를 묻지 않고, 칠한 칸이면 그 칸만 묻는다", () => {
    const colors = openColors({ hat_beanie: { colors: ["#d23a48", null, "#20a040"], sel: 0 } }, "hat_beanie");
    expect(needsOverwrite(colors, 1)).toBe(false);
    expect(needsOverwrite(colors, 0)).toBe(true);
    expect(needsOverwrite(colors, 2)).toBe(true);
    expect(needsOverwrite(openColors(undefined, "hat_beanie"), 0)).toBe(false);
  });

  it("보고 4: 아이템 페이지에서 무작위 염색권으로 바로 연 창은 덮어쓰기 확인을 끄면 창도 닫힌다 (색 고르기 화면에서 물었으면 남는다)", () => {
    expect(overwriteDismissCloses({ autoStart: true, lockTarget: true, phase: "part" })).toBe(true);
    expect(overwriteDismissCloses({ autoStart: false, lockTarget: true, phase: "part" })).toBe(false);
    expect(overwriteDismissCloses({ autoStart: true, lockTarget: true, phase: "play" })).toBe(false);
    expect(overwriteDismissCloses({ autoStart: false, lockTarget: false, phase: "part" })).toBe(false);
  });

  it("잠금 카운트다운 글자: 분:초, 1시간 넘으면 시:분:초", () => {
    expect(waitLabel(600_000)).toBe("10:00");
    expect(waitLabel(581_000)).toBe("9:41");
    expect(waitLabel(10_781_000)).toBe("2:59:41");
    expect(waitLabel(86_400_000)).toBe("24:00:00");
    expect(waitLabel(400)).toBe("0:01");
  });
});

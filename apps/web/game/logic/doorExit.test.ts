import { describe, expect, it } from "vitest";
import { atExitDoor, DOOR_PAD } from "./doorExit";

// 실내 문으로 나가기: 문 앞에서 E (잡화점·집·분양 마을 — 걸어서 저절로 나가지 않는다)

describe("문 앞 판정 (E 나가기)", () => {
  // 잡화점: 문 칸 x 92~116, 문턱 y 142, 들어온 자리 (104,140)
  const shop = { x0: 92, x1: 116, y: 142 };

  it("들어온 자리·문 칸·문 칸 아래(벽 사이)는 문 앞", () => {
    expect(atExitDoor(104, 140, shop)).toBe(true);
    expect(atExitDoor(104, 166, shop)).toBe(true);
    expect(atExitDoor(96, 150, shop)).toBe(true);
  });

  it("문틀 모서리(문 칸 옆 한 칸 안)도 넉넉하게 문 앞 — 예전엔 여기서 아래를 눌러도 벽에 걸려 안 나갔다", () => {
    expect(atExitDoor(80, 142, shop)).toBe(true);
    expect(atExitDoor(128, 142, shop)).toBe(true);
    expect(atExitDoor(92 - DOOR_PAD, 142 - DOOR_PAD, shop)).toBe(true);
  });

  it("문에서 한 칸보다 멀면 아니다 (주인장 앞·방 안쪽·먼 벽가)", () => {
    expect(atExitDoor(104, 72, shop)).toBe(false);
    expect(atExitDoor(104, 125, shop)).toBe(false);
    expect(atExitDoor(70, 142, shop)).toBe(false);
    expect(atExitDoor(140, 150, shop)).toBe(false);
  });
});

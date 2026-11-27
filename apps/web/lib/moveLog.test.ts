import { describe, expect, it } from "vitest";
import { moveText, parseMoveWire, UNKNOWN_VIA } from "./moveLog";

const NOW = 1_800_000_000_000;

describe("moveLog (11/27 자리 옮김 기록)", () => {
  it("화면 묶음을 거른다: 모르는 종류·집 들어감(서버만)·이상한 자리는 버리고, 시각은 10분 안쪽으로", () => {
    const rows = parseMoveWire(
      [
        { m: "map", at: NOW - 1000, from: "sea", to: "camp", via: "bus" },
        { m: "houseIn", at: NOW, via: "list" },
        { m: "teleport", at: NOW },
        { m: "houseOut", at: NOW + 60_000, from: "other", to: "sea", via: "exitDoor" },
        { m: "channel", at: NOW - 3_600_000, from: "1", to: "<b>", via: "hack" },
        "junk",
      ],
      "acc",
      NOW,
    );
    expect(rows).toEqual([
      { a: "acc", k: "mv", at: NOW - 600_000, m: "channel", from: "1", src: "c" },
      { a: "acc", k: "mv", at: NOW - 1000, m: "map", from: "sea", to: "camp", via: "bus", src: "c" },
      { a: "acc", k: "mv", at: NOW, m: "houseOut", from: "other", to: "sea", via: "exitDoor", src: "c" },
    ]);
    expect(parseMoveWire(Array.from({ length: 30 }, () => ({ m: "map", at: NOW })), "a", NOW)).toHaveLength(10);
    expect(parseMoveWire(null, "a", NOW)).toEqual([]);
  });

  it("관리자 화면 문구 (버튼 이름이 없으면 옛 화면)", () => {
    expect(moveText({ m: "houseIn", via: "friendWin", tgt: "GBT의 카라반 · 1채널 캠핑장 7번", src: "s" })).toBe("친구 창 집 버튼 → 집 들어감 · GBT의 카라반 · 1채널 캠핑장 7번");
    expect(moveText({ m: "houseNo", via: "friendWin", no: "offline", tgt: "GBT의 카라반", src: "s" })).toBe("친구 창 집 버튼 → 못 들어감(주인이 접속 안 함) · GBT의 카라반");
    expect(moveText({ m: "houseOut", from: "other", to: "sea", via: "exitDoor", src: "c" })).toBe("집에서 나옴(남의 집) → 바닷가(원래 맵) · 집 문으로 나옴 (화면 보고)");
    expect(moveText({ m: "map", from: "sea", to: "camp", src: "c" })).toBe(`맵 바닷가 → 캠핑장 · ${UNKNOWN_VIA} (화면 보고)`);
    expect(moveText({ m: "channel", from: "1", to: "2", src: "c" })).toBe("채널 1채널 → 2채널 (화면 보고)");
  });
});

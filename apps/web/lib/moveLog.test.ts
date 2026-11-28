import { describe, expect, it } from "vitest";
import { parseMoveWire } from "./moveLog";

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

  it("11/28 자동 낚시·좌대 줄은 서버만 적는다 (화면 묶음에 섞이면 버린다)", () => {
    const rows = parseMoveWire(
      [
        { m: "fishStart", at: NOW, spot: "x" },
        { m: "fishStop", at: NOW, via: "fishSelf" },
        { m: "raftBuy", at: NOW },
        { m: "raftRenew", at: NOW },
        { m: "tab", at: NOW },
        { m: "houseNo", at: NOW, no: "big", via: "list" },
      ],
      "acc",
      NOW,
    );
    expect(rows).toEqual([{ a: "acc", k: "mv", at: NOW, m: "houseNo", no: "big", via: "list", src: "c" }]);
  });

});

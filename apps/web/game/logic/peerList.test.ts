import { describe, expect, it } from "vitest";
import { peerList } from "./peerList";

describe("채널 창 같이 있는 사람 (peerList)", () => {
  it("실내에 들어간 사람은 이 맵 목록·운영자 수에서 빠진다", () => {
    const r = peerList(
      [
        { name: "겨울토끼", away: false, view: {} },
        { name: "치이카와", away: true, view: {} },
        { name: "운영", away: false, view: { staff: true } },
        { name: "숨은운영", away: true, view: { staff: true } },
      ],
      "village",
    );
    expect(r).toEqual({ names: ["겨울토끼", "운영"], map: "village", staff: 1 });
  });
});

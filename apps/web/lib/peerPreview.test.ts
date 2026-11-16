import { describe, expect, it } from "vitest";
import { aloneLine, elsewhereCount, elsewhereLine, hereLabel } from "./peerPreview";

describe("채널 이동 창: 지금 맵 기준 같이 있는 사람", () => {
  it("바닷가에 나 혼자, 채널에는 3명 → 다른 곳에 2명", () => {
    expect(elsewhereCount(3, 0)).toBe(2);
    expect(aloneLine("sea", 2)).toBe("바닷가에는 지금 나 혼자예요. 이 채널 다른 곳에 2명 있어요.");
    expect(aloneLine("camp", 1)).toBe("캠핑장에는 지금 나 혼자예요. 이 채널 다른 곳에 1명 있어요.");
  });

  it("채널 전체에 나 혼자면 확성기 안내", () => {
    expect(aloneLine("village", elsewhereCount(1, 0))).toBe("지금은 이 채널에 나 혼자 있어요. 확성기로 사람을 불러 보세요.");
  });

  it("같이 있는 사람이 있으면 맵 이름을 붙이고, 다른 곳 인원은 덧붙인다", () => {
    expect(hereLabel("village")).toBe("마을에 같이 있는 사람");
    expect(elsewhereLine(elsewhereCount(5, 2))).toBe("이 채널 다른 곳에 2명 더 있어요.");
    expect(elsewhereLine(elsewhereCount(3, 2))).toBeNull();
  });

  it("로비 인원이 늦어 보이는 사람보다 적어도 0 아래로 세지 않는다", () => {
    expect(elsewhereCount(1, 3)).toBe(0);
    expect(elsewhereCount(0, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { CAMP_NPCS, CAMP_SEATS } from "@tomb/protocol";
import { campNeighborSeat, campPickSeat, CAMP_MULTI_SEAT } from "./campSit";
import { campBgmPlaylist, campLines, campNpcAround, campNpcName, CAMP_WELCOME } from "./campTalk";

describe("캠핑장 앉기 (campSit)", () => {
  it("가까운 빈 좌석, 남이 앉은 자리는 건너뛰고 내 자리는 빈 것으로", () => {
    const log = CAMP_SEATS.find((s) => s.id === "qL1")!;
    expect(campPickSeat(log.x, log.y + 6, new Map(), null)?.id).toBe("qL1");
    expect(campPickSeat(log.x, log.y + 6, new Map([["qL1", 4]]), 9)?.id).not.toBe("qL1");
    expect(campPickSeat(log.x, log.y + 6, new Map([["qL1", 9]]), 9)?.id).toBe("qL1");
  });
  it("타프 아래 긴 의자는 옆자리로 옮겨 앉는다", () => {
    expect(CAMP_MULTI_SEAT.has("qT1")).toBe(true);
    const left = CAMP_SEATS.find((s) => s.id === "qT1-0")!;
    expect(campNeighborSeat(left, 1, new Map(), null)?.id).toBe("qT1-1");
    expect(campNeighborSeat(left, -1, new Map(), null)).toBeNull();
    expect(campNeighborSeat(left, 1, new Map([["qT1-1", 2]]), 1)).toBeNull();
  });
});

describe("캠핑장 NPC 말 걸기 (campTalk)", () => {
  it("다섯 명 모두 이름과 대사가 있고, 말 걸 때마다 다음 묶음", () => {
    for (const n of CAMP_NPCS) {
      expect(campNpcName(n.id)).toBe(n.name);
      expect(campLines(n.id, 0).length).toBeGreaterThan(0);
      expect(campLines(n.id, 0)).not.toEqual(campLines(n.id, 1));
    }
    expect(campLines("keeper", 0)[0]).toBe("다들 언젠가 온다고 했어요. 진짜 온 사람은 처음이네.");
    expect(campLines("clerk", 0)[0]).toBe("중고로 올라온 장비가 반이에요.");
    expect(campLines("granny", 0)[0]).toBe("물고기는 서두르면 안 와.");
  });
  it("처음 도착 안내: 인사 + 텐트·요리·별 세 문장 (텐트·요리는 곧 열린다고)", () => {
    expect(CAMP_WELCOME).toHaveLength(4);
    expect(CAMP_WELCOME.slice(1).join(" ")).toMatch(/데크.*곧/);
    expect(CAMP_WELCOME.slice(1).join(" ")).toMatch(/모닥불.*곧/);
    expect(CAMP_WELCOME.slice(1).join(" ")).toMatch(/전망대/);
  });
  it("별지기는 밤, 기타 캠퍼는 밤 9~11시, 나머지는 늘", () => {
    expect(campNpcAround("stargazer", 12)).toBe(false);
    expect(campNpcAround("stargazer", 22)).toBe(true);
    expect(campNpcAround("stargazer", 3)).toBe(true);
    expect(campNpcAround("guitarist", 20.9)).toBe(false);
    expect(campNpcAround("guitarist", 21)).toBe(true);
    expect(campNpcAround("guitarist", 23)).toBe(false);
    expect(campNpcAround("keeper", 3)).toBe(true);
  });
  it("캠핑장 음악: 기타 캠퍼가 있는 밤 9~11시는 어쿠스틱, 그 밖엔 앰비언트", () => {
    expect(campBgmPlaylist(21.5)).toBe("acoustic");
    expect(campBgmPlaylist(14)).toBe("ambient");
    expect(campBgmPlaylist(23)).toBe("ambient");
  });
});
